-- Give audited cancellation its own organization capability.
-- It is deliberately separate from draft count entry and maker-checker finalization.
BEGIN;

INSERT INTO public.authorization_capabilities (
  capability_key, domain, resource, action, sensitivity, scope_kind,
  approval_mode, separation_of_duties, state_requirements, legacy_operation_id
) VALUES (
  'inventory.count.cancel', 'inventory', 'stock_count', 'cancel', 'inventory',
  'organization', 'none', false,
  '{"requires_reason":true,"open_only":true,"does_not_move_stock":true}'::jsonb,
  NULL
)
ON CONFLICT (capability_key) DO NOTHING;

INSERT INTO public.authorization_role_capabilities (role, capability_key, grant_source)
VALUES
  ('admin', 'inventory.count.cancel', 'authorization-v2:stock-count-cancellation'),
  ('manager', 'inventory.count.cancel', 'authorization-v2:stock-count-cancellation')
ON CONFLICT (role, capability_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cancel_stock_count(p_session_id uuid, p_reason text)
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

  -- Authorization precedes reason/session disclosure. Cancellation is an
  -- organization capability, not a warehouse-scope grant or count-entry grant.
  IF auth.uid() IS NULL
     OR v_actor IS NULL
     OR v_org IS NULL
     OR p_session_id IS NULL
     OR NOT public.current_actor_has_capability('inventory.count.cancel') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'inventory.count.cancel capability and active organization are required';
  END IF;

  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'stock-count cancellation requires a reason between 1 and 1000 characters';
  END IF;

  SELECT s.*
    INTO v_session
    FROM public.stock_count_sessions s
   WHERE s.id = p_session_id
     AND s.organization_id = v_org
   FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'open' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'stock count is not open';
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
    'reason', v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_stock_count(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_count(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_stock_count(uuid, text) IS
  'Cancels only an open tenant-owned stock-count draft with a recorded reason, an active inventory.count.cancel organization capability, and one audit event; cancellation never creates inventory movements.';

COMMIT;
