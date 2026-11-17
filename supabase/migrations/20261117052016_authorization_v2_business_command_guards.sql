-- Connect existing stock, pricing, purchasing and finance RPC guards to Authorization V2.
-- Their transactional bodies, locks, idempotency and audit writes are otherwise preserved.

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
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.current_actor_has_capability('inventory.transfer.create') THEN
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

  UPDATE public.inventory_balances
     SET quantity_on_hand=quantity_on_hand-p_quantity,
         last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE product_id=p_product_id AND warehouse_id=p_source_warehouse_id
   RETURNING quantity_available INTO v_source_available_after;
  UPDATE public.inventory_balances
     SET quantity_on_hand=quantity_on_hand+p_quantity,
         last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE product_id=p_product_id AND warehouse_id=p_destination_warehouse_id
   RETURNING quantity_available INTO v_destination_available_after;

  INSERT INTO public.inventory_movements(
    product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
  ) VALUES
    (p_product_id,p_source_warehouse_id,'transfer_out',-p_quantity,v_source_available_after,'inventory_transfer',v_transfer_id,v_reason,v_actor),
    (p_product_id,p_destination_warehouse_id,'transfer_in',p_quantity,v_destination_available_after,'inventory_transfer',v_transfer_id,v_reason,v_actor);

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

CREATE OR REPLACE FUNCTION public.start_stock_count(p_warehouse_id uuid,p_idempotency_key text,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE;
 v_existing_id uuid; v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
 v_notes text := nullif(pg_catalog.btrim(coalesce(p_notes,'')),''); v_line_count integer := 0;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_actor_has_capability('inventory.count.enter') THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required to start a stock count';
 END IF;
 IF p_warehouse_id IS NULL OR v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='warehouse and valid stock-count idempotency key are required';
 END IF;
 IF v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>1000 THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock-count notes cannot exceed 1000 characters';
 END IF;
 PERFORM 1 FROM public.warehouses w WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='warehouse is unavailable in this organization'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':stock-count-key:'||v_key,0));
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.organization_id=v_org AND s.idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_session.warehouse_id IS DISTINCT FROM p_warehouse_id OR v_session.notes IS DISTINCT FROM v_notes THEN
   RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock-count idempotency key payload conflict';
  END IF;
  RETURN pg_catalog.to_jsonb(v_session)||pg_catalog.jsonb_build_object('replayed',true);
 END IF;
 SELECT s.id INTO v_existing_id FROM public.stock_count_sessions s
  WHERE s.organization_id=v_org AND s.warehouse_id=p_warehouse_id AND s.status='open' FOR UPDATE;
 IF FOUND THEN RAISE EXCEPTION USING ERRCODE='55006', MESSAGE='an open stock count already exists for this warehouse'; END IF;
 INSERT INTO public.stock_count_sessions(organization_id,warehouse_id,status,idempotency_key,notes,started_by)
 VALUES(v_org,p_warehouse_id,'open',v_key,v_notes,v_actor) RETURNING * INTO v_session;
 PERFORM 1 FROM public.inventory_balances ib
  JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
  WHERE ib.warehouse_id=p_warehouse_id ORDER BY ib.product_id FOR SHARE OF ib;
 INSERT INTO public.stock_count_lines(organization_id,session_id,product_id,product_code,product_name,unit,
  expected_quantity,expected_reserved_quantity,expected_last_movement_at)
 SELECT v_org,v_session.id,ib.product_id,coalesce(p.item_code,p.name),p.name,p.unit,ib.quantity_on_hand,ib.quantity_reserved,ib.last_movement_at
  FROM public.inventory_balances ib JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
  WHERE ib.warehouse_id=p_warehouse_id ORDER BY ib.product_id;
 GET DIAGNOSTICS v_line_count=ROW_COUNT;
 IF v_line_count=0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='no verified inventory balances exist for this warehouse'; END IF;
 UPDATE public.stock_count_sessions SET total_lines=v_line_count,counted_lines=0 WHERE id=v_session.id RETURNING * INTO v_session;
 RETURN pg_catalog.to_jsonb(v_session)||pg_catalog.jsonb_build_object('replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.start_stock_count(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_stock_count(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_stock_count_line(p_session_id uuid,p_product_id uuid,p_counted_quantity numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE; v_line public.stock_count_lines%ROWTYPE;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_actor_has_capability('inventory.count.enter') THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required to record a stock count';
 END IF;
 IF p_session_id IS NULL OR p_product_id IS NULL OR p_counted_quantity IS NULL
  OR p_counted_quantity::text IN ('NaN','Infinity','-Infinity') OR p_counted_quantity<0
  OR p_counted_quantity>999999999999.999 OR pg_catalog.round(p_counted_quantity,3)<>p_counted_quantity THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='counted quantity must be non-negative with at most three decimals';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open'; END IF;
 SELECT l.* INTO v_line FROM public.stock_count_lines l WHERE l.session_id=v_session.id AND l.organization_id=v_org AND l.product_id=p_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product is not part of this stock-count snapshot'; END IF;
 UPDATE public.stock_count_lines SET counted_quantity=p_counted_quantity,variance=p_counted_quantity-v_line.expected_quantity,counted_at=pg_catalog.now()
  WHERE id=v_line.id RETURNING * INTO v_line;
 UPDATE public.stock_count_sessions s SET counted_lines=(SELECT pg_catalog.count(*)::integer FROM public.stock_count_lines l WHERE l.session_id=s.id AND l.counted_quantity IS NOT NULL)
  WHERE s.id=v_session.id;
 RETURN pg_catalog.to_jsonb(v_line);
END;
$$;

REVOKE ALL ON FUNCTION public.set_stock_count_line(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_stock_count_line(uuid,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_stock_count(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE;
 v_line public.stock_count_lines%ROWTYPE; v_balance public.inventory_balances%ROWTYPE;
 v_delta numeric(15,3); v_available numeric(15,3); v_adjusted_lines integer := 0;
 v_positive numeric(20,3) := 0; v_negative numeric(20,3) := 0; v_line_count integer := 0; v_counted_lines integer := 0;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_actor_has_capability('inventory.count.finalize') THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to finalize a stock count';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open'; END IF;
 SELECT pg_catalog.count(*)::integer,pg_catalog.count(l.counted_quantity)::integer INTO v_line_count,v_counted_lines
  FROM public.stock_count_lines l WHERE l.session_id=v_session.id;
 IF v_line_count=0 OR v_counted_lines<>v_line_count OR v_session.counted_lines<>v_session.total_lines THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='all stock-count lines must be counted before finalization';
 END IF;
 FOR v_line IN SELECT l.* FROM public.stock_count_lines l WHERE l.session_id=v_session.id ORDER BY l.product_id
 LOOP
  SELECT ib.* INTO v_balance FROM public.inventory_balances ib WHERE ib.product_id=v_line.product_id AND ib.warehouse_id=v_session.warehouse_id FOR UPDATE;
  IF NOT FOUND OR v_balance.quantity_on_hand IS DISTINCT FROM v_line.expected_quantity
   OR v_balance.quantity_reserved IS DISTINCT FROM v_line.expected_reserved_quantity
   OR v_balance.last_movement_at IS DISTINCT FROM v_line.expected_last_movement_at THEN
   RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='stock balance changed after the count snapshot; cancel this session and start a new count';
  END IF;
  IF v_line.counted_quantity<v_balance.quantity_reserved THEN
   RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='counted quantity is below reserved stock; resolve reserved orders before finalization';
  END IF;
  v_delta:=v_line.counted_quantity-v_line.expected_quantity;
  IF v_delta<>0 THEN
   UPDATE public.inventory_balances SET quantity_on_hand=v_line.counted_quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
    WHERE id=v_balance.id RETURNING quantity_available INTO v_available;
   INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by)
   VALUES(v_line.product_id,v_session.warehouse_id,'stock_count_adjustment',v_delta,v_available,'stock_count_session',v_session.id,
    pg_catalog.left('Physical stock count'||CASE WHEN v_session.notes IS NULL THEN '' ELSE ': '||v_session.notes END,1000),v_actor);
   v_adjusted_lines:=v_adjusted_lines+1;
   IF v_delta>0 THEN v_positive:=v_positive+v_delta; ELSE v_negative:=v_negative+(-v_delta); END IF;
  END IF;
  UPDATE public.stock_count_lines SET completed_quantity=v_line.counted_quantity,variance=v_delta,completed_at=pg_catalog.now() WHERE id=v_line.id;
 END LOOP;
 UPDATE public.stock_count_sessions SET status='completed',completed_by=v_actor,completed_at=pg_catalog.now(),counted_lines=total_lines WHERE id=v_session.id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_org,v_actor,'inventory.stock_count.completed','stock_count_session',v_session.id,
  pg_catalog.jsonb_build_object('warehouse_id',v_session.warehouse_id,'total_lines',v_line_count),
  pg_catalog.jsonb_build_object('adjusted_lines',v_adjusted_lines,'positive_adjustment',v_positive,'negative_adjustment',v_negative,'notes',v_session.notes));
 RETURN pg_catalog.jsonb_build_object('session_id',v_session.id,'status','completed','total_lines',v_line_count,'adjusted_lines',v_adjusted_lines,'positive_adjustment',v_positive,'negative_adjustment',v_negative);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_stock_count(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_stock_count(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_stock_count(p_session_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE; v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_actor_has_capability('inventory.count.finalize') THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to cancel a stock count';
 END IF;
 IF p_session_id IS NULL OR v_reason IS NULL OR pg_catalog.char_length(v_reason)>1000 THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock-count cancellation requires a reason between 1 and 1000 characters';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open'; END IF;
 UPDATE public.stock_count_sessions SET status='cancelled',cancelled_by=v_actor,cancelled_at=pg_catalog.now(),cancellation_reason=v_reason WHERE id=v_session.id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_org,v_actor,'inventory.stock_count.cancelled','stock_count_session',v_session.id,
  pg_catalog.jsonb_build_object('status','open','warehouse_id',v_session.warehouse_id),
  pg_catalog.jsonb_build_object('status','cancelled','reason',v_reason));
 RETURN pg_catalog.jsonb_build_object('session_id',v_session.id,'status','cancelled','reason',v_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_stock_count(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_count(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_product_price_grid(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_profile_id uuid := public.current_profile_id();
  v_item jsonb;
  v_id uuid;
  v_old_base numeric;
  v_old_ww numeric;
  v_old_wholesale numeric;
  v_old_retail numeric;
  v_expected_base numeric;
  v_expected_ww numeric;
  v_expected_wholesale numeric;
  v_expected_retail numeric;
  v_new_base numeric;
  v_new_ww numeric;
  v_new_wholesale numeric;
  v_new_retail numeric;
  v_count integer := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR v_profile_id IS NULL
     OR NOT public.current_actor_has_capability('pricing.edit_draft') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Price grid updates require pricing.edit_draft capability in the active organization';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) < 1 OR jsonb_array_length(p_changes) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Price grid batch must contain between 1 and 200 products';
  END IF;
  IF (
    SELECT count(DISTINCT (value ->> 'id')::uuid)
    FROM jsonb_array_elements(p_changes)
  ) <> jsonb_array_length(p_changes) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Price grid batch contains duplicate product ids';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_item)) <> 9
      OR NOT (v_item ?& ARRAY[
        'id','expected_base_price','expected_price_wholesale_of_wholesale',
        'expected_price_wholesale','expected_price_retail','base_price',
        'price_wholesale_of_wholesale','price_wholesale','price_retail'
      ])
      OR jsonb_typeof(v_item -> 'id') <> 'string'
      OR jsonb_typeof(v_item -> 'expected_base_price') <> 'number'
      OR jsonb_typeof(v_item -> 'expected_price_wholesale_of_wholesale') <> 'number'
      OR jsonb_typeof(v_item -> 'expected_price_wholesale') <> 'number'
      OR jsonb_typeof(v_item -> 'expected_price_retail') <> 'number'
      OR jsonb_typeof(v_item -> 'base_price') <> 'number'
      OR jsonb_typeof(v_item -> 'price_wholesale_of_wholesale') <> 'number'
      OR jsonb_typeof(v_item -> 'price_wholesale') <> 'number'
      OR jsonb_typeof(v_item -> 'price_retail') <> 'number' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each price row must contain exactly the id, four expected values and four new numeric prices';
    END IF;
    v_id := (v_item ->> 'id')::uuid;
    v_expected_base := (v_item ->> 'expected_base_price')::numeric;
    v_expected_ww := (v_item ->> 'expected_price_wholesale_of_wholesale')::numeric;
    v_expected_wholesale := (v_item ->> 'expected_price_wholesale')::numeric;
    v_expected_retail := (v_item ->> 'expected_price_retail')::numeric;
    v_new_base := (v_item ->> 'base_price')::numeric;
    v_new_ww := (v_item ->> 'price_wholesale_of_wholesale')::numeric;
    v_new_wholesale := (v_item ->> 'price_wholesale')::numeric;
    v_new_retail := (v_item ->> 'price_retail')::numeric;
    IF least(v_new_base,v_new_ww,v_new_wholesale,v_new_retail) < 0
      OR v_new_base > 999999999999 OR v_new_ww > 999999999999
      OR v_new_wholesale > 999999999999 OR v_new_retail > 999999999999
      OR round(v_new_base,2) <> v_new_base OR round(v_new_ww,2) <> v_new_ww
      OR round(v_new_wholesale,2) <> v_new_wholesale OR round(v_new_retail,2) <> v_new_retail THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Prices must be non-negative, no greater than 999999999999, with at most two decimal places';
    END IF;
    SELECT p.base_price,p.price_wholesale_of_wholesale,p.price_wholesale,p.price_retail
      INTO v_old_base,v_old_ww,v_old_wholesale,v_old_retail
    FROM public.products AS p
    WHERE p.id=v_id AND p.organization_id=v_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Product not found in current organization';
    END IF;
    IF v_old_base IS DISTINCT FROM v_expected_base
      OR v_old_ww IS DISTINCT FROM v_expected_ww
      OR v_old_wholesale IS DISTINCT FROM v_expected_wholesale
      OR v_old_retail IS DISTINCT FROM v_expected_retail THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'A product price changed after the grid was loaded; reload and review the current values';
    END IF;
    UPDATE public.products AS p
    SET base_price=v_new_base,
        price_wholesale_of_wholesale=v_new_ww,
        price_wholesale=v_new_wholesale,
        price_retail=v_new_retail
    WHERE p.id=v_id AND p.organization_id=v_organization_id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES (
      v_organization_id,v_profile_id,'product.price_grid_updated','product',v_id,
      jsonb_build_object('base_price',v_old_base,'price_wholesale_of_wholesale',v_old_ww,'price_wholesale',v_old_wholesale,'price_retail',v_old_retail),
      jsonb_build_object('base_price',v_new_base,'price_wholesale_of_wholesale',v_new_ww,'price_wholesale',v_new_wholesale,'price_retail',v_new_retail)
    );
    v_count := v_count + 1;
    v_ids := array_append(v_ids,v_id);
  END LOOP;
  RETURN jsonb_build_object('updated_count',v_count,'product_ids',to_jsonb(v_ids));
END
$function$;

REVOKE ALL ON FUNCTION public.save_product_price_grid(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_product_price_grid(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_orders_can_manage()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.current_profile_id() IS NOT NULL
   AND public.current_actor_has_capability('purchasing.orders.manage');
$function$;
REVOKE ALL ON FUNCTION public.purchase_orders_can_manage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchase_orders_can_manage() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.current_profile_id() IS NOT NULL
   AND public.current_actor_has_capability('finance.workspace.manage');
$function$;
REVOKE ALL ON FUNCTION public.can_manage_finance() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated;
