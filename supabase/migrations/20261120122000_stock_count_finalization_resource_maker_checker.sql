-- Resolve stock-count finalization through the exact warehouse-scoped
-- maker-checker capability while restoring the full balance-set and concurrency
-- protections from the previously accepted stock-count finalizer.
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_stock_count(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE;
 v_line public.stock_count_lines%ROWTYPE; v_balance public.inventory_balances%ROWTYPE;
 v_finalize_decision jsonb;
 v_delta numeric(15,3); v_available numeric(15,3); v_adjusted_lines integer := 0;
 v_positive numeric(20,3) := 0; v_negative numeric(20,3) := 0; v_line_count integer := 0; v_counted_lines integer := 0;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated stock-count reviewer and active organization are required';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s
  WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open';
 END IF;
 -- Finalization is warehouse-scoped; resolve the saved session before checking
 -- the reviewer's active grant and assignment for this exact warehouse.
 v_finalize_decision:=public.current_authorization_decision(
  'inventory.count.finalize',v_session.warehouse_id
 );
 IF v_finalize_decision->>'decision' IS DISTINCT FROM 'REQUIRES_APPROVAL'
    OR (v_finalize_decision->>'separation_of_duties')::boolean IS DISTINCT FROM true
    OR v_actor=v_session.started_by THEN
  RAISE EXCEPTION USING ERRCODE='42501',
   MESSAGE='stock-count finalization requires an assigned independent maker-checker reviewer';
 END IF;
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
 'Atomically finalizes a warehouse-scoped stock-count snapshot only through an independently assigned maker-checker reviewer; locks stock writers and the complete balance set, rejects stale snapshots/reservation conflicts, and persists movements and audit.';

COMMIT;
