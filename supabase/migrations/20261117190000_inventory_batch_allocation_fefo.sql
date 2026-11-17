BEGIN;
CREATE TABLE public.inventory_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
 receipt_id uuid REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
 receipt_item_id uuid REFERENCES public.purchase_receipt_items(id) ON DELETE RESTRICT,
 parent_batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
 batch_number text, expiry_date date, received_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 quantity_on_hand numeric(15,3) NOT NULL DEFAULT 0, quantity_reserved numeric(15,3) NOT NULL DEFAULT 0,
 quantity_available numeric(15,3) GENERATED ALWAYS AS (quantity_on_hand-quantity_reserved) STORED,
 unit_cost numeric(15,2),
 source_type text NOT NULL CHECK(source_type IN ('legacy_unattributed','purchase_receipt','unattributed_balance_increase','inventory_transfer')),
 source_reference_type text, source_reference_id uuid, created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 CHECK(quantity_on_hand::text NOT IN ('NaN','Infinity','-Infinity') AND quantity_reserved::text NOT IN ('NaN','Infinity','-Infinity')
   AND quantity_on_hand>=0 AND quantity_reserved>=0 AND quantity_reserved<=quantity_on_hand),
 CHECK(batch_number IS NULL OR (batch_number=pg_catalog.btrim(batch_number) AND pg_catalog.char_length(batch_number) BETWEEN 1 AND 100)),
 CHECK(expiry_date IS NULL OR batch_number IS NOT NULL),
 UNIQUE(receipt_item_id)
);
CREATE INDEX inventory_batches_fefo_idx ON public.inventory_batches(organization_id,product_id,warehouse_id,expiry_date ASC NULLS LAST,received_at,id) WHERE quantity_on_hand>0;
CREATE INDEX inventory_batches_trace_idx ON public.inventory_batches(organization_id,product_id,warehouse_id,received_at DESC,id DESC);
ALTER TABLE public.inventory_movements ADD COLUMN inventory_batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE RESTRICT;
CREATE INDEX inventory_movements_batch_trace_idx ON public.inventory_movements(inventory_batch_id,created_at,id) WHERE inventory_batch_id IS NOT NULL;

DO $tenant_guard$ BEGIN
 IF EXISTS(SELECT 1 FROM public.inventory_balances ib JOIN public.products p ON p.id=ib.product_id JOIN public.warehouses w ON w.id=ib.warehouse_id
 WHERE p.organization_id IS DISTINCT FROM w.organization_id) THEN
  RAISE EXCEPTION 'Cannot enable batch tracking while stock balances cross organization boundaries.';
 END IF;
END; $tenant_guard$;

-- Legacy stock cannot safely be assigned an invented lot number or expiry date.
INSERT INTO public.inventory_batches(organization_id,product_id,warehouse_id,batch_number,expiry_date,received_at,quantity_on_hand,quantity_reserved,source_type,source_reference_type)
SELECT p.organization_id,ib.product_id,ib.warehouse_id,NULL,NULL,COALESCE(ib.last_movement_at,ib.updated_at,ib.created_at,pg_catalog.now()),
       ib.quantity_on_hand,ib.quantity_reserved,'legacy_unattributed','pre_batch_balance'
FROM public.inventory_balances ib JOIN public.products p ON p.id=ib.product_id
JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=p.organization_id WHERE ib.quantity_on_hand>0;

UPDATE public.inventory_movements im SET inventory_batch_id=b.id
FROM public.orders o,public.inventory_batches b
WHERE im.reference_type='order' AND im.movement_type='reserve' AND im.reference_id=o.id
AND o.status IN ('confirmed','processing') AND b.source_type='legacy_unattributed'
AND b.product_id=im.product_id AND b.warehouse_id=im.warehouse_id AND b.organization_id=o.organization_id;

DO $opening_check$ BEGIN
 IF EXISTS(SELECT 1 FROM public.inventory_balances ib LEFT JOIN LATERAL(
  SELECT COALESCE(pg_catalog.sum(b.quantity_on_hand),0)::numeric(15,3) h,COALESCE(pg_catalog.sum(b.quantity_reserved),0)::numeric(15,3) r
  FROM public.inventory_batches b WHERE b.product_id=ib.product_id AND b.warehouse_id=ib.warehouse_id) lots ON true
 WHERE lots.h IS DISTINCT FROM ib.quantity_on_hand OR lots.r IS DISTINCT FROM ib.quantity_reserved) THEN
  RAISE EXCEPTION 'Batch opening subledger does not match aggregate inventory balances.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_movements im JOIN public.orders o ON o.id=im.reference_id
  WHERE im.reference_type='order' AND im.movement_type='reserve' AND o.status IN ('confirmed','processing') AND im.inventory_batch_id IS NULL) THEN
  RAISE EXCEPTION 'An open order reservation has no legacy batch attribution.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_balances ib LEFT JOIN LATERAL(
  SELECT COALESCE(pg_catalog.sum(im.quantity),0)::numeric(15,3) reserved
  FROM public.inventory_movements im JOIN public.orders o ON o.id=im.reference_id
  WHERE im.product_id=ib.product_id AND im.warehouse_id=ib.warehouse_id AND im.reference_type='order'
  AND im.movement_type='reserve' AND im.inventory_batch_id IS NOT NULL AND o.status IN ('confirmed','processing')) r ON true
 WHERE ib.quantity_reserved IS DISTINCT FROM r.reserved) THEN
  RAISE EXCEPTION 'Open reservation movement totals do not match reserved stock.';
 END IF;
END; $opening_check$;

CREATE TABLE public.inventory_transfer_batch_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 inventory_transfer_id uuid NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE RESTRICT,
 source_inventory_batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
 destination_inventory_batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
 quantity numeric(15,3) NOT NULL CHECK(quantity>0),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 UNIQUE(inventory_transfer_id,source_inventory_batch_id)
);
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_batch_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_batches FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.inventory_transfer_batch_items FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_inventory_batch_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF NEW.inventory_batch_id IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_batches b JOIN public.products p ON p.id=b.product_id AND p.organization_id=b.organization_id
 JOIN public.warehouses w ON w.id=b.warehouse_id AND w.organization_id=b.organization_id
 WHERE b.id=NEW.inventory_batch_id AND b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='movement lot does not match product, warehouse and tenant';
 END IF;
 RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.guard_inventory_batch_movement() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER inventory_movements_batch_guard BEFORE INSERT OR UPDATE OF inventory_batch_id ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_batch_movement();

CREATE OR REPLACE FUNCTION public.seed_inventory_batch_after_balance_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_org uuid; v_h numeric(15,3); v_r numeric(15,3);
BEGIN
 SELECT COALESCE(pg_catalog.sum(b.quantity_on_hand),0)::numeric(15,3),COALESCE(pg_catalog.sum(b.quantity_reserved),0)::numeric(15,3)
 INTO v_h,v_r FROM public.inventory_batches b WHERE b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id;
 IF v_h=NEW.quantity_on_hand AND v_r=NEW.quantity_reserved THEN RETURN NEW; END IF;
 IF v_h<>0 OR v_r<>0 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='lot rows exist before aggregate balance insert'; END IF;
 IF NEW.quantity_on_hand=0 AND NEW.quantity_reserved=0 THEN RETURN NEW; END IF;
 SELECT p.organization_id INTO v_org FROM public.products p JOIN public.warehouses w ON w.id=NEW.warehouse_id AND w.organization_id=p.organization_id WHERE p.id=NEW.product_id;
 IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='stock product and warehouse tenant mismatch'; END IF;
 INSERT INTO public.inventory_batches(organization_id,product_id,warehouse_id,received_at,quantity_on_hand,quantity_reserved,source_type,source_reference_type)
 VALUES(v_org,NEW.product_id,NEW.warehouse_id,pg_catalog.now(),NEW.quantity_on_hand,NEW.quantity_reserved,'unattributed_balance_increase','balance_insert');
 RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.seed_inventory_batch_after_balance_insert() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER inventory_balances_batch_seed_after_insert AFTER INSERT ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.seed_inventory_batch_after_balance_insert();

CREATE OR REPLACE FUNCTION public.sync_inventory_batches_after_balance_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_org uuid; v_hd numeric(15,3):=NEW.quantity_on_hand-OLD.quantity_on_hand; v_rd numeric(15,3):=NEW.quantity_reserved-OLD.quantity_reserved;
 v_lot record; v_left numeric(15,3); v_take numeric(15,3); v_h numeric(15,3); v_r numeric(15,3);
BEGIN
 IF v_hd=0 AND v_rd=0 THEN RETURN NEW; END IF;
 SELECT p.organization_id INTO v_org FROM public.products p JOIN public.warehouses w ON w.id=NEW.warehouse_id AND w.organization_id=p.organization_id WHERE p.id=NEW.product_id;
 IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='stock product and warehouse tenant mismatch'; END IF;
 SELECT COALESCE(pg_catalog.sum(b.quantity_on_hand),0)::numeric(15,3),COALESCE(pg_catalog.sum(b.quantity_reserved),0)::numeric(15,3)
 INTO v_h,v_r FROM public.inventory_batches b WHERE b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id;
 IF v_h=NEW.quantity_on_hand AND v_r=NEW.quantity_reserved THEN RETURN NEW; END IF;
 IF v_h IS DISTINCT FROM OLD.quantity_on_hand OR v_r IS DISTINCT FROM OLD.quantity_reserved THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='batch ledger differs from previous aggregate stock balance'; END IF;
 IF v_hd>0 AND v_rd>=0 AND v_rd<=v_hd THEN
  INSERT INTO public.inventory_batches(organization_id,product_id,warehouse_id,received_at,quantity_on_hand,quantity_reserved,source_type,source_reference_type)
  VALUES(v_org,NEW.product_id,NEW.warehouse_id,pg_catalog.now(),v_hd,v_rd,'unattributed_balance_increase','balance_update');
 ELSIF v_hd=0 AND v_rd>0 THEN
  v_left:=v_rd;
  FOR v_lot IN SELECT b.id,b.quantity_on_hand,b.quantity_reserved FROM public.inventory_batches b
   WHERE b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id AND b.quantity_on_hand>b.quantity_reserved
    AND (b.expiry_date IS NULL OR b.expiry_date >= (pg_catalog.now() AT TIME ZONE 'UTC')::date)
   ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.id FOR UPDATE
  LOOP
   EXIT WHEN v_left<=0; v_take:=LEAST(v_left,v_lot.quantity_on_hand-v_lot.quantity_reserved);
   UPDATE public.inventory_batches SET quantity_reserved=quantity_reserved+v_take WHERE id=v_lot.id; v_left:=v_left-v_take;
  END LOOP;
  IF v_left>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reservation exceeds non-expired batch quantities'; END IF;
 ELSIF v_hd=0 AND v_rd<0 THEN
  v_left:=-v_rd;
  FOR v_lot IN SELECT b.id,b.quantity_reserved FROM public.inventory_batches b WHERE b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id AND b.quantity_reserved>0
   ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.id FOR UPDATE
  LOOP
   EXIT WHEN v_left<=0; v_take:=LEAST(v_left,v_lot.quantity_reserved);
   UPDATE public.inventory_batches SET quantity_reserved=quantity_reserved-v_take WHERE id=v_lot.id; v_left:=v_left-v_take;
  END LOOP;
  IF v_left>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reservation release exceeds batch reservations'; END IF;
 ELSIF v_hd<0 AND v_rd=0 THEN
  v_left:=-v_hd;
  FOR v_lot IN SELECT b.id,b.quantity_on_hand,b.quantity_reserved FROM public.inventory_batches b WHERE b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id AND b.quantity_on_hand>b.quantity_reserved
   ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.id FOR UPDATE
  LOOP
   EXIT WHEN v_left<=0; v_take:=LEAST(v_left,v_lot.quantity_on_hand-v_lot.quantity_reserved);
   UPDATE public.inventory_batches SET quantity_on_hand=quantity_on_hand-v_take WHERE id=v_lot.id; v_left:=v_left-v_take;
  END LOOP;
  IF v_left>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='stock decrease exceeds available batch quantities'; END IF;
 ELSIF v_hd<0 AND v_rd<0 AND (-v_rd)<=(-v_hd) THEN
  v_left:=-v_rd;
  FOR v_lot IN SELECT b.id,b.quantity_on_hand,b.quantity_reserved FROM public.inventory_batches b WHERE b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id AND b.quantity_reserved>0
   ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.id FOR UPDATE
  LOOP
   EXIT WHEN v_left<=0; v_take:=LEAST(v_left,v_lot.quantity_reserved);
   UPDATE public.inventory_batches SET quantity_on_hand=quantity_on_hand-v_take,quantity_reserved=quantity_reserved-v_take WHERE id=v_lot.id;
   v_left:=v_left-v_take;
  END LOOP;
  IF v_left>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reserved stock decrease exceeds batch reservations'; END IF;
  v_left:=(-v_hd)-(-v_rd);
  FOR v_lot IN SELECT b.id,b.quantity_on_hand,b.quantity_reserved FROM public.inventory_batches b WHERE b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id AND b.quantity_on_hand>b.quantity_reserved
   ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.id FOR UPDATE
  LOOP
   EXIT WHEN v_left<=0; v_take:=LEAST(v_left,v_lot.quantity_on_hand-v_lot.quantity_reserved);
   UPDATE public.inventory_batches SET quantity_on_hand=quantity_on_hand-v_take WHERE id=v_lot.id; v_left:=v_left-v_take;
  END LOOP;
  IF v_left>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='available stock decrease exceeds batch quantities'; END IF;
 ELSE
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported stock delta; use atomic inventory commands';
 END IF;
 SELECT COALESCE(pg_catalog.sum(b.quantity_on_hand),0)::numeric(15,3),COALESCE(pg_catalog.sum(b.quantity_reserved),0)::numeric(15,3)
 INTO v_h,v_r FROM public.inventory_batches b WHERE b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id;
 IF v_h IS DISTINCT FROM NEW.quantity_on_hand OR v_r IS DISTINCT FROM NEW.quantity_reserved THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='batch lot totals do not match aggregate stock balance'; END IF;
 RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.sync_inventory_batches_after_balance_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER inventory_balances_batch_sync_after_update AFTER UPDATE OF quantity_on_hand,quantity_reserved ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_batches_after_balance_update();

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
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_purchase_order_id uuid,p_lines jsonb,p_notes text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_po public.purchase_orders%ROWTYPE;
  v_line jsonb; v_item public.purchase_order_items%ROWTYPE;
  v_item_id uuid; v_qty numeric(15,3); v_seen uuid[]:=ARRAY[]::uuid[];
  v_receipt_id uuid; v_receipt_number text; v_existing public.purchase_receipts%ROWTYPE;
  v_fingerprint text; v_total numeric(15,2):=0; v_line_total numeric(15,2); v_costs_complete boolean:=true;
  v_balance public.inventory_balances%ROWTYPE; v_new_available numeric(15,3);
  v_batch_number text; v_expiry_raw text; v_expiry_date date;
  v_batch_lines integer:=0; v_expiry_lines integer:=0;
  v_receipt_item_id uuid; v_inventory_batch_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to receive purchase orders';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id=p_purchase_order_id AND po.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='purchase order is not available in this organization'; END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid receipt idempotency key';
  END IF;
  IF p_notes IS NOT NULL AND pg_catalog.char_length(p_notes)>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt notes exceed 2000 characters';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.jsonb_array_length(p_lines)<1 OR pg_catalog.jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt must contain between 1 and 100 item quantities';
  END IF;
  v_fingerprint:=pg_catalog.md5(v_po.id::text||'|'||COALESCE(p_notes,'')||'|'||p_lines::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':purchase-receipt:'||p_idempotency_key,0));
  SELECT r.* INTO v_existing FROM public.purchase_receipts r
   WHERE r.organization_id=v_org AND r.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='purchase receipt idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'purchase_order',public.purchase_order_detail(v_existing.purchase_order_id),
      'receipt',pg_catalog.jsonb_build_object('id',v_existing.id,'receipt_number',v_existing.receipt_number,'purchase_order_id',v_existing.purchase_order_id,'received_at',v_existing.received_at),
      'idempotent_replay',true
    );
  END IF;
  IF v_po.status NOT IN ('submitted','partially_received') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only submitted purchase orders with outstanding items can be received';
  END IF;
  -- Serialize stock intake to a warehouse, then lock ordered lines. This prevents concurrent
  -- receipts from racing the same available balance while preserving atomic ledger posting.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':purchase-receiving-warehouse:'||v_po.warehouse_id::text,0));

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF pg_catalog.jsonb_typeof(v_line)<>'object'
       OR pg_catalog.jsonb_typeof(v_line->'item_id')<>'string'
       OR pg_catalog.jsonb_typeof(v_line->'quantity')<>'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each receipt line requires item_id and numeric quantity';
    END IF;
    v_item_id:=(v_line->>'item_id')::uuid; v_qty:=(v_line->>'quantity')::numeric;
    IF v_item_id=ANY(v_seen) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate purchase order line in one receipt'; END IF;
    v_seen:=pg_catalog.array_append(v_seen,v_item_id);
    IF v_qty<=0 OR v_qty>999999999999.999 OR pg_catalog.round(v_qty,3)<>v_qty THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt quantity must be positive with at most three decimals';
    END IF;

    v_batch_number:=NULL;
    IF v_line ? 'batch_number' AND v_line->'batch_number'<>'null'::jsonb THEN
      IF pg_catalog.jsonb_typeof(v_line->'batch_number')<>'string' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='batch number must be text or null';
      END IF;
      v_batch_number:=NULLIF(pg_catalog.btrim(v_line->>'batch_number'),'');
      IF v_batch_number IS NOT NULL AND pg_catalog.char_length(v_batch_number)>100 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='batch number must not exceed 100 characters';
      END IF;
    END IF;

    v_expiry_raw:=NULL;
    v_expiry_date:=NULL;
    IF v_line ? 'expiry_date' AND v_line->'expiry_date'<>'null'::jsonb THEN
      IF pg_catalog.jsonb_typeof(v_line->'expiry_date')<>'string' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expiry date must be an ISO date or null';
      END IF;
      v_expiry_raw:=pg_catalog.btrim(v_line->>'expiry_date');
      IF v_expiry_raw<>'' THEN
        IF v_expiry_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expiry date must use YYYY-MM-DD';
        END IF;
        BEGIN
          v_expiry_date:=v_expiry_raw::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expiry date must be a real calendar date';
        END;
        IF pg_catalog.to_char(v_expiry_date,'YYYY-MM-DD') IS DISTINCT FROM v_expiry_raw THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expiry date must be a real calendar date';
        END IF;
      END IF;
    END IF;
    IF v_expiry_date IS NOT NULL THEN
      IF v_batch_number IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a batch number is required when an expiry date is recorded';
      END IF;
      IF v_expiry_date<(pg_catalog.now() AT TIME ZONE 'UTC')::date THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expired stock cannot be posted into available inventory';
      END IF;
      v_expiry_lines:=v_expiry_lines+1;
    END IF;
    IF v_batch_number IS NOT NULL THEN v_batch_lines:=v_batch_lines+1; END IF;

    SELECT poi.* INTO v_item FROM public.purchase_order_items poi
     WHERE poi.id=v_item_id AND poi.purchase_order_id=v_po.id AND poi.organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='receipt line does not belong to this purchase order'; END IF;
    IF v_item.quantity_received+v_qty>v_item.quantity_ordered THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt quantity exceeds outstanding ordered quantity';
    END IF;
  END LOOP;

  INSERT INTO public.purchase_receipts(
    organization_id,purchase_order_id,receipt_number,warehouse_id,notes,idempotency_key,payload_fingerprint,received_by
  ) VALUES(
    v_org,v_po.id,'PR-'||pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD')||'-'||
      pg_catalog.lpad(pg_catalog.nextval('public.purchase_receipt_number_seq'::regclass)::text,6,'0'),
    v_po.warehouse_id,NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),''),p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING id,receipt_number INTO v_receipt_id,v_receipt_number;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    v_item_id:=(v_line->>'item_id')::uuid; v_qty:=(v_line->>'quantity')::numeric;
    v_batch_number:=NULLIF(pg_catalog.btrim(v_line->>'batch_number'),'');
    v_expiry_date:=CASE
      WHEN v_line ? 'expiry_date' AND v_line->'expiry_date'<>'null'::jsonb AND pg_catalog.btrim(v_line->>'expiry_date')<>'' THEN (v_line->>'expiry_date')::date
      ELSE NULL
    END;
    SELECT poi.* INTO v_item FROM public.purchase_order_items poi
     WHERE poi.id=v_item_id AND poi.purchase_order_id=v_po.id AND poi.organization_id=v_org FOR UPDATE;
    UPDATE public.purchase_order_items SET quantity_received=quantity_received+v_qty
     WHERE id=v_item.id;
    v_seen:=ARRAY[]::uuid[];

    INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point)
    SELECT p.id,v_po.warehouse_id,0,0,COALESCE(p.min_stock,0)
      FROM public.products p WHERE p.id=v_item.product_id AND p.organization_id=v_org
    ON CONFLICT(product_id,warehouse_id) DO NOTHING;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
     WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_po.warehouse_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='could not initialize inventory balance for receipt'; END IF;
    v_item_id:=v_item.id;
    v_line_total:=CASE WHEN v_item.unit_cost IS NULL THEN NULL ELSE (v_qty*v_item.unit_cost)::numeric(15,2) END;
    IF v_line_total IS NULL THEN v_costs_complete:=false; ELSE v_total:=v_total+v_line_total; END IF;
    INSERT INTO public.purchase_receipt_items(
      organization_id,receipt_id,purchase_order_item_id,product_id,quantity_received,unit_cost,line_total,batch_number,expiry_date
    ) VALUES(v_org,v_receipt_id,v_item.id,v_item.product_id,v_qty,v_item.unit_cost,v_line_total,v_batch_number,v_expiry_date)
    RETURNING id INTO v_receipt_item_id;
    INSERT INTO public.inventory_batches(
      organization_id,product_id,warehouse_id,receipt_id,receipt_item_id,batch_number,expiry_date,received_at,
      quantity_on_hand,quantity_reserved,unit_cost,source_type,source_reference_type,source_reference_id
    ) VALUES(v_org,v_item.product_id,v_po.warehouse_id,v_receipt_id,v_receipt_item_id,v_batch_number,v_expiry_date,
      pg_catalog.now(),v_qty,0,v_item.unit_cost,'purchase_receipt','purchase_receipt',v_receipt_id)
    RETURNING id INTO v_inventory_batch_id;
    UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand+v_qty,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
     WHERE id=v_balance.id RETURNING quantity_available INTO v_new_available;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='could not update aggregate stock balance for receipt'; END IF;
    INSERT INTO public.inventory_movements(
      product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id
    ) VALUES(v_item.product_id,v_po.warehouse_id,'purchase_receipt',v_qty,v_new_available,'purchase_receipt',v_receipt_id,
      COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),''),'استلام أمر شراء '||v_po.purchase_order_number),v_actor,v_inventory_batch_id);
  END LOOP;

  UPDATE public.purchase_receipts SET received_cost=CASE WHEN v_costs_complete THEN v_total ELSE NULL END WHERE id=v_receipt_id;
  UPDATE public.purchase_orders po SET
    status=CASE WHEN NOT EXISTS(
      SELECT 1 FROM public.purchase_order_items poi WHERE poi.purchase_order_id=po.id AND poi.quantity_received<poi.quantity_ordered
    ) THEN 'received' ELSE 'partially_received' END,
    updated_at=now()
   WHERE po.id=v_po.id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'purchase_order.received','purchase_receipt',v_receipt_id,
    pg_catalog.jsonb_build_object('purchase_order_id',v_po.id,'prior_status',v_po.status),
    pg_catalog.jsonb_build_object('receipt_number',v_receipt_number,'purchase_order_number',v_po.purchase_order_number,
      'received_lines',pg_catalog.jsonb_array_length(p_lines),
      'batch_tracked_lines',v_batch_lines,
      'expiry_tracked_lines',v_expiry_lines,
      'received_cost',CASE WHEN v_costs_complete THEN v_total ELSE NULL END));

  RETURN pg_catalog.jsonb_build_object(
    'purchase_order',public.purchase_order_detail(v_po.id),
    'receipt',pg_catalog.jsonb_build_object('id',v_receipt_id,'receipt_number',v_receipt_number,'purchase_order_id',v_po.id,'received_at',now()),
    'idempotent_replay',false
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.reserve_order_inventory(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_order public.orders%ROWTYPE; v_actor uuid:=public.current_profile_id(); v_line record; v_lot record;
 v_left numeric(15,3); v_take numeric(15,3); v_after numeric(15,3);
BEGIN
 SELECT o.* INTO v_order FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='order' AND reference_id=v_order.id AND movement_type='reserve') THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=v_order.id) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cannot confirm order without items'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_items WHERE order_id=v_order.id AND product_id IS NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='order line has no linked product'; END IF;
 FOR v_line IN SELECT oi.product_id,pg_catalog.sum(oi.quantity)::numeric(15,3) quantity FROM public.order_items oi WHERE oi.order_id=v_order.id GROUP BY oi.product_id ORDER BY oi.product_id LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order.organization_id::text||':inventory-batch-reservation:'||v_line.product_id::text,0));
  PERFORM 1 FROM public.inventory_balances ib JOIN public.warehouses w ON w.id=ib.warehouse_id
   WHERE ib.product_id=v_line.product_id AND w.organization_id=v_order.organization_id AND w.is_active
   ORDER BY ib.warehouse_id FOR UPDATE OF ib;
  v_left:=v_line.quantity;
  FOR v_lot IN SELECT b.id batch_id,b.product_id,b.warehouse_id,b.quantity_on_hand on_hand,b.quantity_reserved reserved,ib.id balance_id
   FROM public.inventory_batches b JOIN public.inventory_balances ib ON ib.product_id=b.product_id AND ib.warehouse_id=b.warehouse_id
   JOIN public.warehouses w ON w.id=b.warehouse_id AND w.organization_id=v_order.organization_id AND w.is_active
   WHERE b.organization_id=v_order.organization_id AND b.product_id=v_line.product_id AND b.quantity_on_hand>b.quantity_reserved
   AND (b.expiry_date IS NULL OR b.expiry_date >= (pg_catalog.now() AT TIME ZONE 'UTC')::date)
   ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.warehouse_id,b.id FOR UPDATE OF b
  LOOP
   EXIT WHEN v_left<=0; v_take:=LEAST(v_left,v_lot.on_hand-v_lot.reserved); IF v_take<=0 THEN CONTINUE; END IF;
   UPDATE public.inventory_batches SET quantity_reserved=quantity_reserved+v_take WHERE id=v_lot.batch_id;
   UPDATE public.inventory_balances SET quantity_reserved=quantity_reserved+v_take,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
    WHERE id=v_lot.balance_id RETURNING quantity_available INTO v_after;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='aggregate reservation balance disappeared'; END IF;
   INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
   VALUES(v_lot.product_id,v_lot.warehouse_id,'reserve',v_take,v_after,'order',v_order.id,'حجز المخزون حسب الأقدم انتهاءً (FEFO)',v_actor,v_lot.batch_id);
   v_left:=v_left-v_take;
  END LOOP;
  IF v_left>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='insufficient non-expired lots under FEFO; reservation rolled back'; END IF;
 END LOOP;
END; $function$;
REVOKE ALL ON FUNCTION public.reserve_order_inventory(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.finalize_order_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_move record; v_after numeric(15,3);
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.status IN ('shipped','delivered') AND OLD.status IN ('confirmed','processing','shipped')
 AND NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='sale') THEN
  IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve' AND inventory_batch_id IS NULL) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order reservation has no batch allocation'; END IF;
  PERFORM 1 FROM public.inventory_balances ib JOIN
   (SELECT DISTINCT product_id,warehouse_id FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve') r
   ON r.product_id=ib.product_id AND r.warehouse_id=ib.warehouse_id ORDER BY ib.product_id,ib.warehouse_id FOR UPDATE OF ib;
  FOR v_move IN SELECT product_id,warehouse_id,inventory_batch_id,pg_catalog.sum(quantity)::numeric(15,3) quantity
   FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve' AND inventory_batch_id IS NOT NULL
   GROUP BY product_id,warehouse_id,inventory_batch_id ORDER BY product_id,warehouse_id,inventory_batch_id LOOP
   UPDATE public.inventory_batches SET quantity_on_hand=quantity_on_hand-v_move.quantity,quantity_reserved=quantity_reserved-v_move.quantity
    WHERE id=v_move.inventory_batch_id AND product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id
    AND quantity_on_hand>=v_move.quantity AND quantity_reserved>=v_move.quantity;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reserved batch settlement failed; shipment rolled back'; END IF;
   UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand-v_move.quantity,quantity_reserved=quantity_reserved-v_move.quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
    WHERE product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id AND quantity_on_hand>=v_move.quantity AND quantity_reserved>=v_move.quantity
    RETURNING quantity_available INTO v_after;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='aggregate stock settlement failed; shipment rolled back'; END IF;
   INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
   VALUES(v_move.product_id,v_move.warehouse_id,'sale',-v_move.quantity,v_after,'order',NEW.id,'خصم المخزون عند الشحن من الدفعة المحجوزة',v_actor,v_move.inventory_batch_id);
  END LOOP;
 ELSIF NEW.status='cancelled' AND OLD.status IN ('confirmed','processing') THEN
  IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve' AND inventory_batch_id IS NULL) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order reservation has no batch allocation'; END IF;
  PERFORM 1 FROM public.inventory_balances ib JOIN
   (SELECT DISTINCT product_id,warehouse_id FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve') r
   ON r.product_id=ib.product_id AND r.warehouse_id=ib.warehouse_id ORDER BY ib.product_id,ib.warehouse_id FOR UPDATE OF ib;
  FOR v_move IN SELECT product_id,warehouse_id,inventory_batch_id,pg_catalog.sum(quantity)::numeric(15,3) quantity
   FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve' AND inventory_batch_id IS NOT NULL
   GROUP BY product_id,warehouse_id,inventory_batch_id ORDER BY product_id,warehouse_id,inventory_batch_id LOOP
   UPDATE public.inventory_batches SET quantity_reserved=quantity_reserved-v_move.quantity
    WHERE id=v_move.inventory_batch_id AND product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id AND quantity_reserved>=v_move.quantity;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reserved lot release failed; cancellation rolled back'; END IF;
   UPDATE public.inventory_balances SET quantity_reserved=quantity_reserved-v_move.quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
    WHERE product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id AND quantity_reserved>=v_move.quantity
    RETURNING quantity_available INTO v_after;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='aggregate reservation release failed; cancellation rolled back'; END IF;
   INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
   VALUES(v_move.product_id,v_move.warehouse_id,'release_reservation',v_move.quantity,v_after,'order',NEW.id,'تحرير حجز الدفعة عند إلغاء الطلب',v_actor,v_move.inventory_batch_id);
  END LOOP;
 END IF;
 RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.finalize_order_inventory() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.list_inventory_batch_stock(p_product_id uuid,p_warehouse_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid; v_result jsonb;
BEGIN
 SELECT organization_id INTO v_org FROM public.profiles WHERE id=v_actor AND auth_user_id=auth.uid() AND is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active profile required'; END IF;
 IF p_product_id IS NULL OR p_warehouse_id IS NULL OR NOT public.current_actor_has_capability('inventory.read_balance',p_warehouse_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory.read_balance capability and warehouse assignment required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products p JOIN public.warehouses w ON w.id=p_warehouse_id AND w.organization_id=p.organization_id AND w.is_active WHERE p.id=p_product_id AND p.organization_id=v_org) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='product and warehouse unavailable in current organization'; END IF;
 SELECT pg_catalog.jsonb_build_object('product_id',p.id,'warehouse_id',p_warehouse_id,
  'quantity_on_hand',COALESCE(ib.quantity_on_hand,0),'quantity_reserved',COALESCE(ib.quantity_reserved,0),'quantity_available',COALESCE(ib.quantity_available,0),
  'lots',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',b.id,'batch_number',b.batch_number,'expiry_date',b.expiry_date,
    'received_at',b.received_at,'quantity_on_hand',b.quantity_on_hand,'quantity_reserved',b.quantity_reserved,'quantity_available',b.quantity_available,
    'source_type',b.source_type,'expired',b.expiry_date IS NOT NULL AND b.expiry_date<(pg_catalog.now() AT TIME ZONE 'UTC')::date)
    ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.id) FROM public.inventory_batches b
    WHERE b.organization_id=v_org AND b.product_id=p.id AND b.warehouse_id=p_warehouse_id),'[]'::jsonb),'as_of',pg_catalog.now())
 INTO v_result FROM public.products p LEFT JOIN public.inventory_balances ib ON ib.product_id=p.id AND ib.warehouse_id=p_warehouse_id
 WHERE p.id=p_product_id AND p.organization_id=v_org;
 RETURN v_result;
END; $function$;
REVOKE ALL ON FUNCTION public.list_inventory_batch_stock(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_inventory_batch_stock(uuid,uuid) TO authenticated;

COMMENT ON TABLE public.inventory_batches IS 'Private lot subledger; lot on-hand and reserved sums must equal authoritative inventory balances. Historical stock lacking source data remains unattributed.';
COMMENT ON COLUMN public.inventory_movements.inventory_batch_id IS 'Exact lot ID for receipt, transfer, reservation, sale and release movements; null denotes historical or non-lot-specific movement.';
COMMENT ON TABLE public.inventory_transfer_batch_items IS 'Private source-to-destination lot lineage for warehouse transfers.';
DO $checks$
BEGIN
 IF has_table_privilege('anon','public.inventory_batches','SELECT') OR has_table_privilege('authenticated','public.inventory_batches','SELECT')
 OR has_table_privilege('anon','public.inventory_batches','INSERT') OR has_table_privilege('authenticated','public.inventory_batches','INSERT')
 OR has_table_privilege('anon','public.inventory_transfer_batch_items','SELECT') OR has_table_privilege('authenticated','public.inventory_transfer_batch_items','SELECT') THEN
  RAISE EXCEPTION 'Inventory batch ledgers must stay private.';
 END IF;
END; $checks$;
COMMIT;
