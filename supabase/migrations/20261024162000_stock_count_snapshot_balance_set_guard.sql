BEGIN;

-- INV-STOCK-001: make stock-count snapshots complete and stable against new balances.
-- Both entry and finalization serialize against the purchase-receiving worker's warehouse key.
CREATE OR REPLACE FUNCTION public.start_stock_count(p_warehouse_id uuid,p_idempotency_key text,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE;
 v_existing_id uuid; v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
 v_notes text := nullif(pg_catalog.btrim(coalesce(p_notes,'')),''); v_line_count integer := 0;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
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
 -- Serialize the snapshot against purchase receipts, which can create a new balance row
 -- without first taking the warehouse row lock. This is the same key used by receive_purchase_order.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':purchase-receiving-warehouse:'||p_warehouse_id::text,0));
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

REVOKE ALL ON FUNCTION public.start_stock_count(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_stock_count(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_stock_count(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE;
 v_line public.stock_count_lines%ROWTYPE; v_balance public.inventory_balances%ROWTYPE;
 v_delta numeric(15,3); v_available numeric(15,3); v_adjusted_lines integer := 0;
 v_positive numeric(20,3) := 0; v_negative numeric(20,3) := 0; v_line_count integer := 0; v_counted_lines integer := 0;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to finalize a stock count';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open'; END IF;
 -- Hold the warehouse against transfer/return/Onyx balance writers during the atomic finalization.
 -- Purchase receiving uses a matching advisory lock because that writer may create a balance row.
 PERFORM 1 FROM public.warehouses w
  WHERE w.id=v_session.warehouse_id AND w.organization_id=v_org AND w.is_active
  FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='stock-count warehouse is unavailable in this organization';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_org::text||':purchase-receiving-warehouse:'||v_session.warehouse_id::text,0)
 );
 -- Other balance writers, including transfers, do not all acquire the purchase-receiving advisory key.
 -- Take the table lock before locking individual balance rows so no writer can insert a new
 -- product/warehouse balance between the snapshot-set check and the final adjustments.
 -- Stock counts are infrequent; correctness requires a consistent balance set for this transaction.
 LOCK TABLE public.inventory_balances IN EXCLUSIVE MODE;
 -- Lock existing balance rows in stable order before comparing the snapshot set.
 PERFORM 1
  FROM public.products p
  JOIN public.inventory_balances ib ON ib.product_id=p.id
  WHERE p.organization_id=v_org AND p.status='active' AND ib.warehouse_id=v_session.warehouse_id
  ORDER BY p.id
  FOR SHARE OF ib;
 -- New active balances (for example a receipt posted after the count started) invalidate
 -- the snapshot. Also fail closed if a captured product/balance is no longer active/present.
 IF EXISTS (
  SELECT 1
   FROM public.products p
   JOIN public.inventory_balances ib ON ib.product_id=p.id
   WHERE p.organization_id=v_org AND p.status='active'
     AND ib.warehouse_id=v_session.warehouse_id
     AND NOT EXISTS (
      SELECT 1 FROM public.stock_count_lines l
       WHERE l.session_id=v_session.id AND l.organization_id=v_org AND l.product_id=p.id
     )
 ) OR EXISTS (
  SELECT 1
   FROM public.stock_count_lines l
   WHERE l.session_id=v_session.id AND l.organization_id=v_org
     AND NOT EXISTS (
      SELECT 1
       FROM public.products p
       JOIN public.inventory_balances ib ON ib.product_id=p.id
       WHERE p.id=l.product_id AND p.organization_id=v_org AND p.status='active'
         AND ib.warehouse_id=v_session.warehouse_id
     )
 ) THEN
  RAISE EXCEPTION USING ERRCODE='40001',
   MESSAGE='inventory balance set changed after the count snapshot; cancel this session and start a new count';
 END IF;

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

REVOKE ALL ON FUNCTION public.complete_stock_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_stock_count(uuid) TO authenticated;
COMMENT ON FUNCTION public.complete_stock_count(uuid) IS
 'Manager-approved atomic stock-count completion. Rejects stale quantity snapshots and any changed active warehouse balance set; serializes stock writers before applying movements and audit.';

COMMIT;
