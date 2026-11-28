-- Revalidate both live warehouse endpoints before returning idempotent transfer replays.
-- Retain FOR SHARE locks through the transaction so endpoint state cannot change
-- between validation, idempotency lookup, and the transfer command.
BEGIN;

CREATE OR REPLACE FUNCTION public.transfer_inventory(
  p_product_id uuid,
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_product public.products%ROWTYPE;
  v_existing public.inventory_transfers%ROWTYPE;
  v_balance record;
  v_source_on_hand numeric(15,3);
  v_source_reserved numeric(15,3);
  v_source_available numeric(15,3);
  v_destination_on_hand numeric(15,3);
  v_destination_reserved numeric(15,3);
  v_source_available_after numeric(15,3);
  v_destination_available_after numeric(15,3);
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
  v_source_found boolean := false;
  v_destination_found boolean := false;
  v_warehouse_count integer := 0;
  v_transfer_id uuid;
  v_lot record; v_take numeric(15,3); v_remaining numeric(15,3); v_destination_batch_id uuid;
BEGIN
  PERFORM public.assert_inventory_transfer_scope_v2(p_source_warehouse_id,p_destination_warehouse_id);
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required for inventory transfer';
  END IF;
  IF p_product_id IS NULL OR p_source_warehouse_id IS NULL OR p_destination_warehouse_id IS NULL
     OR p_source_warehouse_id=p_destination_warehouse_id THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product and two different warehouses are required';
  END IF;
  IF v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid inventory transfer idempotency key';
  END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity<=0 OR p_quantity>999999999999.999
     OR pg_catalog.round(p_quantity,3)<>p_quantity THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='transfer quantity must be positive with at most three decimals';
  END IF;
  IF v_reason IS NULL OR pg_catalog.char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='transfer reason must contain between 1 and 1000 characters';
  END IF;

  -- Lock and validate both live tenant endpoints before replaying an old idempotency result.
  FOR v_balance IN
    SELECT w.id FROM public.warehouses w
     WHERE w.id IN (p_source_warehouse_id,p_destination_warehouse_id)
       AND w.organization_id=v_org AND w.is_active
     ORDER BY w.id
     FOR SHARE
  LOOP
    v_warehouse_count:=v_warehouse_count+1;
  END LOOP;
  IF v_warehouse_count<>2 THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='source and destination warehouses must be active in this organization';
  END IF;

  -- Serialize retries with the same key. A reused key with a changed payload is rejected.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':inventory-transfer:' || v_key,0)
  );
  SELECT t.* INTO v_existing
    FROM public.inventory_transfers t
   WHERE t.organization_id=v_org AND t.idempotency_key=v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.product_id IS DISTINCT FROM p_product_id
       OR v_existing.source_warehouse_id IS DISTINCT FROM p_source_warehouse_id
       OR v_existing.destination_warehouse_id IS DISTINCT FROM p_destination_warehouse_id
       OR v_existing.quantity IS DISTINCT FROM p_quantity
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'transfer_id',v_existing.id,'product_id',v_existing.product_id,
      'source_warehouse_id',v_existing.source_warehouse_id,
      'destination_warehouse_id',v_existing.destination_warehouse_id,
      'quantity',v_existing.quantity,'idempotent_replay',true
    );
  END IF;

  SELECT p.* INTO v_product
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_org AND p.status='active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='product is unavailable in this organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_balances ib
     WHERE ib.product_id=p_product_id AND ib.warehouse_id=p_source_warehouse_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='source warehouse has no stock balance for this product';
  END IF;

  -- The pair lock makes opposite-direction transfers for the same product deterministic
  -- and lets us safely create a zero destination balance when one does not yet exist.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_org::text || ':inventory-transfer-balance:' || p_product_id::text || ':' ||
      LEAST(p_source_warehouse_id::text,p_destination_warehouse_id::text) || ':' ||
      GREATEST(p_source_warehouse_id::text,p_destination_warehouse_id::text),1
    )
  );
  INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point)
  VALUES(p_product_id,p_destination_warehouse_id,0,0,coalesce(v_product.min_stock,0))
  ON CONFLICT(product_id,warehouse_id) DO NOTHING;

  FOR v_balance IN
    SELECT ib.warehouse_id,ib.quantity_on_hand,ib.quantity_reserved,ib.quantity_available
      FROM public.inventory_balances ib
     WHERE ib.product_id=p_product_id
       AND ib.warehouse_id IN (p_source_warehouse_id,p_destination_warehouse_id)
     ORDER BY ib.warehouse_id
     FOR UPDATE
  LOOP
    IF v_balance.warehouse_id=p_source_warehouse_id THEN
      v_source_found:=true;
      v_source_on_hand:=v_balance.quantity_on_hand;
      v_source_reserved:=v_balance.quantity_reserved;
      v_source_available:=v_balance.quantity_available;
    ELSIF v_balance.warehouse_id=p_destination_warehouse_id THEN
      v_destination_found:=true;
      v_destination_on_hand:=v_balance.quantity_on_hand;
      v_destination_reserved:=v_balance.quantity_reserved;
    END IF;
  END LOOP;
  IF NOT v_source_found OR NOT v_destination_found THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='could not lock both stock balances for transfer';
  END IF;
  IF v_source_reserved<0 OR v_source_on_hand<v_source_reserved OR v_source_available<p_quantity THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='insufficient available stock for transfer';
  END IF;

  INSERT INTO public.inventory_transfers(
    organization_id,product_id,source_warehouse_id,destination_warehouse_id,
    quantity,reason,idempotency_key,created_by
  ) VALUES(
    v_org,p_product_id,p_source_warehouse_id,p_destination_warehouse_id,
    p_quantity,v_reason,v_key,v_actor
  ) RETURNING id INTO v_transfer_id;

  v_remaining:=p_quantity;
  FOR v_lot IN
    SELECT b.id,b.batch_number,b.expiry_date,b.received_at,b.unit_cost,b.quantity_on_hand,b.quantity_reserved
      FROM public.inventory_batches b
     WHERE b.organization_id=v_org AND b.product_id=p_product_id AND b.warehouse_id=p_source_warehouse_id
       AND b.quantity_on_hand>b.quantity_reserved
     ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.id FOR UPDATE
  LOOP
    EXIT WHEN v_remaining<=0;
    v_take:=LEAST(v_remaining,v_lot.quantity_on_hand-v_lot.quantity_reserved);
    IF v_take<=0 THEN CONTINUE; END IF;
    UPDATE public.inventory_batches SET quantity_on_hand=quantity_on_hand-v_take WHERE id=v_lot.id;
    INSERT INTO public.inventory_batches(
      organization_id,product_id,warehouse_id,parent_batch_id,batch_number,expiry_date,received_at,
      quantity_on_hand,quantity_reserved,unit_cost,source_type,source_reference_type,source_reference_id
    ) VALUES(v_org,p_product_id,p_destination_warehouse_id,v_lot.id,v_lot.batch_number,v_lot.expiry_date,v_lot.received_at,
      v_take,0,v_lot.unit_cost,'inventory_transfer','inventory_transfer',v_transfer_id)
    RETURNING id INTO v_destination_batch_id;
    INSERT INTO public.inventory_transfer_batch_items(
      organization_id,inventory_transfer_id,source_inventory_batch_id,destination_inventory_batch_id,quantity
    ) VALUES(v_org,v_transfer_id,v_lot.id,v_destination_batch_id,v_take);
    v_remaining:=v_remaining-v_take;
  END LOOP;
  IF v_remaining>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='source lots cannot satisfy transfer quantity'; END IF;
  UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand-p_quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE product_id=p_product_id AND warehouse_id=p_source_warehouse_id RETURNING quantity_available INTO v_source_available_after;
  UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand+p_quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE product_id=p_product_id AND warehouse_id=p_destination_warehouse_id RETURNING quantity_available INTO v_destination_available_after;
  INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
  SELECT p_product_id,p_source_warehouse_id,'transfer_out',-ti.quantity,v_source_available_after,'inventory_transfer',v_transfer_id,v_reason,v_actor,ti.source_inventory_batch_id
  FROM public.inventory_transfer_batch_items ti WHERE ti.inventory_transfer_id=v_transfer_id;
  INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
  SELECT p_product_id,p_destination_warehouse_id,'transfer_in',ti.quantity,v_destination_available_after,'inventory_transfer',v_transfer_id,v_reason,v_actor,ti.destination_inventory_batch_id
  FROM public.inventory_transfer_batch_items ti WHERE ti.inventory_transfer_id=v_transfer_id;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(
    v_org,v_actor,'inventory.transfer','inventory_transfer',v_transfer_id,
    pg_catalog.jsonb_build_object('source_quantity_on_hand',v_source_on_hand,'source_quantity_reserved',v_source_reserved,
      'destination_quantity_on_hand',v_destination_on_hand,'destination_quantity_reserved',v_destination_reserved),
    pg_catalog.jsonb_build_object('quantity',p_quantity,'source_warehouse_id',p_source_warehouse_id,
      'destination_warehouse_id',p_destination_warehouse_id,'source_quantity_available_after',v_source_available_after,
      'destination_quantity_available_after',v_destination_available_after,'reason',v_reason,'idempotency_key',v_key)
  );

  RETURN pg_catalog.jsonb_build_object(
    'transfer_id',v_transfer_id,'product_id',p_product_id,
    'source_warehouse_id',p_source_warehouse_id,
    'destination_warehouse_id',p_destination_warehouse_id,
    'quantity',p_quantity,'idempotent_replay',false,
    'source_quantity_available_after',v_source_available_after,
    'destination_quantity_available_after',v_destination_available_after
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_inventory(uuid,uuid,uuid,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transfer_inventory(uuid,uuid,uuid,numeric,text,text) TO authenticated;
COMMENT ON FUNCTION public.transfer_inventory(uuid,uuid,uuid,numeric,text,text) IS
  'Atomic tenant-bound stock transfer with reserved-stock protection, deterministic row locking, idempotent replay, paired movement ledger entries and audit logging.';

CREATE OR REPLACE FUNCTION public.transfer_inventory_batch(
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_idempotency_key text,
  p_lines jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_line jsonb;
  v_product_text text;
  v_product_id uuid;
  v_quantity numeric;
  v_product_ids uuid[] := ARRAY[]::uuid[];
  v_quantities numeric[] := ARRAY[]::numeric[];
  v_canonical_lines jsonb := '[]'::jsonb;
  v_line_count integer;
  v_index integer;
  v_warehouse record;
  v_warehouse_count integer := 0;
  v_product public.products%ROWTYPE;
  v_existing public.inventory_transfer_batches%ROWTYPE;
  v_batch public.inventory_transfer_batches%ROWTYPE;
  v_source_on_hand numeric(15,3);
  v_source_reserved numeric(15,3);
  v_source_available_after numeric(15,3);
  v_destination_available_after numeric(15,3);
  v_transfer_id uuid;
  v_transfer_ids jsonb;
  v_lot record; v_take numeric(15,3); v_remaining numeric(15,3); v_destination_batch_id uuid;
BEGIN
  PERFORM public.assert_inventory_transfer_scope_v2(p_source_warehouse_id,p_destination_warehouse_id);
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active staff organization required for batch inventory transfer';
  END IF;
  IF p_source_warehouse_id IS NULL OR p_destination_warehouse_id IS NULL
     OR p_source_warehouse_id = p_destination_warehouse_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'two different warehouses are required';
  END IF;
  IF v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid batch-transfer idempotency key';
  END IF;
  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a transfer reason between 1 and 1000 characters is required';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'transfer lines must be a JSON array';
  END IF;
  v_line_count := pg_catalog.jsonb_array_length(p_lines);
  IF v_line_count < 1 OR v_line_count > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a batch must contain between 1 and 200 product lines';
  END IF;

  -- Sorted product ids give all batches a stable lock order and stable retry payload.
  FOR v_line IN
    SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) AS j(value)
    ORDER BY value ->> 'product_id'
  LOOP
    IF pg_catalog.jsonb_typeof(v_line) <> 'object'
       OR v_line - 'product_id' - 'quantity' <> '{}'::jsonb
       OR pg_catalog.jsonb_typeof(v_line -> 'product_id') <> 'string'
       OR pg_catalog.jsonb_typeof(v_line -> 'quantity') <> 'number' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'each transfer line must contain only product_id and numeric quantity';
    END IF;
    v_product_text := v_line ->> 'product_id';
    IF v_product_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid product UUID in batch transfer';
    END IF;
    v_product_id := v_product_text::uuid;
    IF v_product_id = ANY(v_product_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a product may appear only once in a batch transfer';
    END IF;
    v_quantity := (v_line ->> 'quantity')::numeric;
    IF v_quantity::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_quantity <= 0 OR v_quantity > 999999999999.999
       OR pg_catalog.round(v_quantity, 3) <> v_quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'transfer quantity must be positive with at most three decimals';
    END IF;
    v_product_ids := pg_catalog.array_append(v_product_ids, v_product_id);
    v_quantities := pg_catalog.array_append(v_quantities, v_quantity);
    v_canonical_lines := v_canonical_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('product_id', v_product_id, 'quantity', v_quantity)
    );
  END LOOP;

  -- Lock and validate both live tenant endpoints before replaying an old idempotency result.
  FOR v_warehouse IN
    SELECT w.id FROM public.warehouses w
     WHERE w.id IN (p_source_warehouse_id, p_destination_warehouse_id)
       AND w.organization_id = v_org AND w.is_active
     ORDER BY w.id
     FOR SHARE
  LOOP
    v_warehouse_count := v_warehouse_count + 1;
  END LOOP;
  IF v_warehouse_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'source and destination warehouses must be active in the current organization';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':inventory-transfer-batch:' || v_key, 0)
  );
  SELECT b.* INTO v_existing
    FROM public.inventory_transfer_batches b
   WHERE b.organization_id = v_org AND b.idempotency_key = v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.source_warehouse_id IS DISTINCT FROM p_source_warehouse_id
       OR v_existing.destination_warehouse_id IS DISTINCT FROM p_destination_warehouse_id
       OR v_existing.reason IS DISTINCT FROM v_reason
       OR v_existing.payload IS DISTINCT FROM v_canonical_lines THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'batch-transfer idempotency key payload conflict';
    END IF;
    SELECT coalesce(pg_catalog.jsonb_agg(t.id ORDER BY t.product_id), '[]'::jsonb)
      INTO v_transfer_ids
      FROM public.inventory_transfers t
     WHERE t.organization_id = v_org AND t.batch_id = v_existing.id;
    RETURN pg_catalog.jsonb_build_object(
      'batch_id', v_existing.id, 'line_count', v_existing.line_count,
      'idempotent_replay', true, 'transfer_ids', v_transfer_ids
    );
  END IF;

  -- Product locks precede the same pair lock used by transfer_inventory, preventing
  -- overselling when a single-line transfer and a batch race for the same stock.
  FOR v_index IN 1..v_line_count LOOP
    v_product_id := v_product_ids[v_index];
    v_quantity := v_quantities[v_index];
    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id = v_product_id AND p.organization_id = v_org AND p.status = 'active'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a batch product is unavailable in this organization';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_org::text || ':inventory-transfer-balance:' || v_product_id::text || ':' ||
        LEAST(p_source_warehouse_id::text, p_destination_warehouse_id::text) || ':' ||
        GREATEST(p_source_warehouse_id::text, p_destination_warehouse_id::text), 1
      )
    );
    SELECT ib.quantity_on_hand, ib.quantity_reserved
      INTO v_source_on_hand, v_source_reserved
      FROM public.inventory_balances ib
     WHERE ib.product_id = v_product_id AND ib.warehouse_id = p_source_warehouse_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'source warehouse has no verified stock balance for a batch product';
    END IF;
    IF v_source_reserved < 0 OR v_source_on_hand < v_source_reserved
       OR v_source_on_hand - v_source_reserved < v_quantity THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient available stock for a batch product';
    END IF;
    INSERT INTO public.inventory_balances(product_id, warehouse_id, quantity_on_hand, quantity_reserved, reorder_point)
    VALUES (v_product_id, p_destination_warehouse_id, 0, 0, coalesce(v_product.min_stock, 0))
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;
    PERFORM 1 FROM public.inventory_balances ib
     WHERE ib.product_id = v_product_id AND ib.warehouse_id = p_destination_warehouse_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'destination stock balance could not be locked';
    END IF;
  END LOOP;

  INSERT INTO public.inventory_transfer_batches(
    organization_id, source_warehouse_id, destination_warehouse_id,
    reason, idempotency_key, payload, line_count, created_by
  ) VALUES (v_org, p_source_warehouse_id, p_destination_warehouse_id, v_reason, v_key, v_canonical_lines, v_line_count, v_actor)
  RETURNING * INTO v_batch;

  FOR v_index IN 1..v_line_count LOOP
    v_product_id := v_product_ids[v_index];
    v_quantity := v_quantities[v_index];
    INSERT INTO public.inventory_transfers(
      organization_id, product_id, source_warehouse_id, destination_warehouse_id,
      quantity, reason, idempotency_key, created_by, batch_id
    ) VALUES (
      v_org, v_product_id, p_source_warehouse_id, p_destination_warehouse_id,
      v_quantity, v_reason,
      'batch-line-' || pg_catalog.replace(v_batch.id::text, '-', '') || '-' ||
        pg_catalog.replace(v_product_id::text, '-', ''),
      v_actor, v_batch.id
    ) RETURNING id INTO v_transfer_id;

    v_remaining:=v_quantity;
    FOR v_lot IN
      SELECT b.id,b.batch_number,b.expiry_date,b.received_at,b.unit_cost,b.quantity_on_hand,b.quantity_reserved
        FROM public.inventory_batches b
       WHERE b.organization_id=v_org AND b.product_id=v_product_id AND b.warehouse_id=p_source_warehouse_id
         AND b.quantity_on_hand>b.quantity_reserved
       ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.id FOR UPDATE
    LOOP
      EXIT WHEN v_remaining<=0;
      v_take:=LEAST(v_remaining,v_lot.quantity_on_hand-v_lot.quantity_reserved);
      IF v_take<=0 THEN CONTINUE; END IF;
      UPDATE public.inventory_batches SET quantity_on_hand=quantity_on_hand-v_take WHERE id=v_lot.id;
      INSERT INTO public.inventory_batches(
        organization_id,product_id,warehouse_id,parent_batch_id,batch_number,expiry_date,received_at,
        quantity_on_hand,quantity_reserved,unit_cost,source_type,source_reference_type,source_reference_id
      ) VALUES(v_org,v_product_id,p_destination_warehouse_id,v_lot.id,v_lot.batch_number,v_lot.expiry_date,v_lot.received_at,
        v_take,0,v_lot.unit_cost,'inventory_transfer','inventory_transfer',v_transfer_id)
      RETURNING id INTO v_destination_batch_id;
      INSERT INTO public.inventory_transfer_batch_items(organization_id,inventory_transfer_id,source_inventory_batch_id,destination_inventory_batch_id,quantity)
      VALUES(v_org,v_transfer_id,v_lot.id,v_destination_batch_id,v_take);
      v_remaining:=v_remaining-v_take;
    END LOOP;
    IF v_remaining>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='source lots cannot satisfy batch transfer quantity'; END IF;
    UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand-v_quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
     WHERE product_id=v_product_id AND warehouse_id=p_source_warehouse_id RETURNING quantity_available INTO v_source_available_after;
    UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand+v_quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
     WHERE product_id=v_product_id AND warehouse_id=p_destination_warehouse_id RETURNING quantity_available INTO v_destination_available_after;
    INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
    SELECT v_product_id,p_source_warehouse_id,'transfer_out',-ti.quantity,v_source_available_after,'inventory_transfer',v_transfer_id,v_reason,v_actor,ti.source_inventory_batch_id
    FROM public.inventory_transfer_batch_items ti WHERE ti.inventory_transfer_id=v_transfer_id;
    INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
    SELECT v_product_id,p_destination_warehouse_id,'transfer_in',ti.quantity,v_destination_available_after,'inventory_transfer',v_transfer_id,v_reason,v_actor,ti.destination_inventory_batch_id
    FROM public.inventory_transfer_batch_items ti WHERE ti.inventory_transfer_id=v_transfer_id;
  END LOOP;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (
    v_org, v_actor, 'inventory.transfer.batch', 'inventory_transfer_batch', v_batch.id,
    pg_catalog.jsonb_build_object('source_warehouse_id', p_source_warehouse_id, 'destination_warehouse_id', p_destination_warehouse_id),
    pg_catalog.jsonb_build_object('line_count', v_line_count, 'reason', v_reason, 'idempotency_key', v_key, 'lines', v_canonical_lines)
  );
  SELECT coalesce(pg_catalog.jsonb_agg(t.id ORDER BY t.product_id), '[]'::jsonb)
    INTO v_transfer_ids
    FROM public.inventory_transfers t
   WHERE t.organization_id = v_org AND t.batch_id = v_batch.id;
  RETURN pg_catalog.jsonb_build_object(
    'batch_id', v_batch.id, 'line_count', v_line_count,
    'idempotent_replay', false, 'transfer_ids', v_transfer_ids
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_inventory_batch(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_batch(uuid, uuid, text, jsonb, text) TO authenticated;
COMMENT ON FUNCTION public.transfer_inventory_batch(uuid, uuid, text, jsonb, text) IS
  'Atomic multi-product stock transfer with target-tenant authorization, sorted locking, reserved-stock protection, idempotent replay, per-product movements and one batch audit event.';
COMMENT ON TABLE public.inventory_transfer_batches IS
  'Audited multi-product transfer envelopes; each product transfer remains in inventory_transfers and its paired movement ledger.';

COMMIT;
