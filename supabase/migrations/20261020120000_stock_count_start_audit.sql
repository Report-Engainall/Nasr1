-- Adapt the donor's metadata-only stock-count creation audit to Nasr1's
-- stock_count_sessions contract. Do not create a duplicate legacy stock_counts table.
-- start_stock_count derives started_by from the authenticated active profile and tenant;
-- this trigger verifies that identity again before recording a safe, minimal event.
-- Idempotent replays return the existing session and therefore do not create a second event.
CREATE OR REPLACE FUNCTION public.audit_stock_count_session_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE p.id = NEW.started_by
       AND p.auth_user_id = auth.uid()
       AND p.organization_id = NEW.organization_id
       AND p.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'invalid actor for stock-count audit';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, new_value
  ) VALUES (
    NEW.organization_id,
    NEW.started_by,
    'inventory.stock_count.started',
    'stock_count_session',
    NEW.id,
    pg_catalog.jsonb_build_object(
      'warehouse_id', NEW.warehouse_id,
      'status', NEW.status,
      'started_at', NEW.started_at
    )
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_stock_count_session_start() FROM PUBLIC, anon, authenticated;

DO $block$
BEGIN
  IF has_function_privilege('anon', 'public.audit_stock_count_session_start()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.audit_stock_count_session_start()', 'EXECUTE') THEN
    RAISE EXCEPTION 'client roles must not execute stock-count audit trigger function directly';
  END IF;
END;
$block$;

DROP TRIGGER IF EXISTS inventory_stock_count_start_audit ON public.stock_count_sessions;
CREATE TRIGGER inventory_stock_count_start_audit
AFTER INSERT ON public.stock_count_sessions
FOR EACH ROW EXECUTE FUNCTION public.audit_stock_count_session_start();

COMMENT ON FUNCTION public.audit_stock_count_session_start() IS
  'Writes one tenant-verified metadata-only audit event for each newly created open stock-count session; idempotent replays do not fire the INSERT trigger.';
