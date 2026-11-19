-- Entering counted quantities is a draft-only stock-count action.
-- Finalization remains a separate maker-checker capability and is never
-- granted by this change.
BEGIN;

UPDATE public.authorization_capabilities
   SET scope_kind='warehouse',
       approval_mode='none',
       separation_of_duties=false,
       state_requirements=state_requirements ||
         '{"requires_active_warehouse_assignment":true,"writes_draft_only":true}'::jsonb,
       updated_at=statement_timestamp()
 WHERE capability_key='inventory.count.enter'
   AND is_active=true;

DO $assert_count_entry_policy$
DECLARE
  v_capability public.authorization_capabilities%ROWTYPE;
  v_missing_roles integer;
BEGIN
  SELECT * INTO v_capability
    FROM public.authorization_capabilities
   WHERE capability_key='inventory.count.enter'
     AND is_active=true;

  IF NOT FOUND
     OR v_capability.scope_kind IS DISTINCT FROM 'warehouse'
     OR v_capability.approval_mode IS DISTINCT FROM 'none'
     OR v_capability.separation_of_duties IS DISTINCT FROM false
     OR coalesce((v_capability.state_requirements->>'writes_draft_only')::boolean,false) IS DISTINCT FROM true
     OR coalesce((v_capability.state_requirements->>'requires_active_warehouse_assignment')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'inventory.count.enter must remain warehouse-scoped, draft-only and immediately executable';
  END IF;

  SELECT count(*)::integer INTO v_missing_roles
    FROM (VALUES ('admin'),('manager'),('staff')) required(role)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.authorization_role_capabilities rc
      WHERE rc.role=required.role
        AND rc.capability_key='inventory.count.enter'
        AND rc.valid_from<=statement_timestamp()
        AND (rc.expires_at IS NULL OR rc.expires_at>statement_timestamp())
   );

  IF v_missing_roles<>0 THEN
    RAISE EXCEPTION 'inventory.count.enter is missing one or more canonical role grants (% missing)',v_missing_roles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.authorization_capabilities
     WHERE capability_key='inventory.count.finalize'
       AND is_active=true
       AND approval_mode='maker_checker'
       AND separation_of_duties=true
       AND scope_kind='warehouse'
  ) THEN
    RAISE EXCEPTION 'inventory.count.finalize must remain a separate warehouse-scoped maker-checker command';
  END IF;
END
$assert_count_entry_policy$;

COMMIT;
