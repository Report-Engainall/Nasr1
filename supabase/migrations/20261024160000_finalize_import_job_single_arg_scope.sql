-- Keep the legacy one-argument RPC contract while routing it through the tenant-scoped finalizer.
-- The prior implementation selected and row-locked a job by ID before validating the active actor/tenant.
-- The two-argument overload checks actor, active profile, staff capability and organization scope first.
CREATE OR REPLACE FUNCTION public.finalize_import_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT public.finalize_import_job(p_job_id, 'new_version'::text);
$function$;

REVOKE ALL ON FUNCTION public.finalize_import_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_import_job(uuid) TO authenticated;
COMMENT ON FUNCTION public.finalize_import_job(uuid) IS
  'Legacy-compatible one-argument import finalizer. Delegates to the tenant-scoped two-argument contract with explicit new_version intent; does not lock or disclose a foreign-tenant import job before authorization.';
