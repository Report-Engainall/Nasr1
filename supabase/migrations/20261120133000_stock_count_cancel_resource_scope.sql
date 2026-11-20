-- Stock-count cancellation is independent from maker-checker finalization.
-- Enforce the exact warehouse-scoped cancel capability in both the RPC and
-- the existing BEFORE UPDATE trigger; never reuse the finalize capability.
BEGIN;

-- A preceding compatibility migration used organization scope. Restore the
-- canonical inventory-v2 contract before the RPC and trigger evaluate it.
UPDATE public.authorization_capabilities
   SET scope_kind='warehouse',
       approval_mode='none',
       separation_of_duties=false,
       state_requirements=coalesce(state_requirements,'{}'::jsonb)
         || '{"requires_active_warehouse_assignment":true,"requires_reason":true,"required_status":"open","does_not_move_stock":true}'::jsonb,
       updated_at=statement_timestamp()
 WHERE capability_key='inventory.count.cancel'
   AND is_active=true;

DO $assert_stock_count_cancel_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.authorization_capabilities
     WHERE capability_key='inventory.count.cancel'
       AND is_active=true
       AND scope_kind='warehouse'
       AND approval_mode='none'
       AND separation_of_duties=false
       AND coalesce((state_requirements->>'requires_active_warehouse_assignment')::boolean,false)
       AND coalesce((state_requirements->>'requires_reason')::boolean,false)
       AND coalesce((state_requirements->>'does_not_move_stock')::boolean,false)
  ) THEN
    RAISE EXCEPTION 'inventory.count.cancel must remain a warehouse-scoped, non-finalizing capability';
  END IF;
END
$assert_stock_count_cancel_contract$;

DELETE FROM public.authorization_role_capabilities
 WHERE capability_key='inventory.count.cancel'
   AND role NOT IN ('admin','manager');

INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source)
VALUES
  ('admin','inventory.count.cancel','authorization-v2:stock-count-cancellation'),
  ('manager','inventory.count.cancel','authorization-v2:stock-count-cancellation')
ON CONFLICT(role,capability_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cancel_stock_count(
  p_session_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_session public.stock_count_sessions%ROWTYPE;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active authenticated stock-count organization is required';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'stock-count session is required';
  END IF;

  SELECT s.*
    INTO v_session
    FROM public.stock_count_sessions s
   WHERE s.id = p_session_id
     AND s.organization_id = v_org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'stock-count session is unavailable in this organization';
  END IF;

  -- Cancellation is not finalization: it is an independently granted,
  -- warehouse-scoped operation and does not require maker-checker approval.
  IF NOT public.current_actor_has_capability(
    'inventory.count.cancel',
    v_session.warehouse_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'inventory.count.cancel capability and assigned warehouse are required';
  END IF;

  IF v_session.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'stock count is not open';
  END IF;

  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'stock-count cancellation requires a reason between 1 and 1000 characters';
  END IF;

  UPDATE public.stock_count_sessions
     SET status = 'cancelled',
         cancelled_by = v_actor,
         cancelled_at = pg_catalog.now(),
         cancellation_reason = v_reason
   WHERE id = v_session.id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_actor, 'inventory.stock_count.cancelled', 'stock_count_session', v_session.id,
    pg_catalog.jsonb_build_object('status', 'open', 'warehouse_id', v_session.warehouse_id),
    pg_catalog.jsonb_build_object('status', 'cancelled', 'reason', v_reason)
  );

  RETURN pg_catalog.jsonb_build_object(
    'session_id', v_session.id,
    'status', 'cancelled',
    'reason', v_reason,
    'cancelled_by', v_actor,
    'warehouse_id', v_session.warehouse_id
  );
END
$function$;

REVOKE ALL ON FUNCTION public.cancel_stock_count(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_count(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_stock_count(uuid, text) IS
  'Atomically cancels an open stock-count draft only for an active profile explicitly assigned inventory.count.cancel in that exact tenant warehouse; cancellation is independent from inventory.count.finalize and never creates stock movements.';

COMMIT;
