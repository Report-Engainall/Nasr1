BEGIN;

-- The legacy mutation remains available only to trusted server-side callers.
-- Authenticated clients must provide the role snapshot they actually reviewed.
REVOKE ALL ON FUNCTION public.set_organization_user_roles(uuid,text[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_organization_user_roles_v2(
  p_profile_id uuid,
  p_expected_roles text[],
  p_roles text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_target uuid;
  v_expected_count integer;
  v_expected_unique_count integer;
  v_requested_count integer;
  v_requested_unique_count integer;
  v_expected_roles text[];
  v_current_roles text[];
  v_requested_roles text[];
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='identity.roles.assign capability required';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active administrator organization is required';
  END IF;

  -- Serialize every role writer in this tenant before reading the expected snapshot.
  PERFORM 1 FROM public.organizations o WHERE o.id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='organization is unavailable';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile id is required';
  END IF;
  IF p_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='cannot change their own roles from this screen';
  END IF;

  IF p_expected_roles IS NULL
     OR pg_catalog.cardinality(p_expected_roles)>6
     OR pg_catalog.array_position(p_expected_roles,NULL::text) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='the expected role snapshot is invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_expected_roles) AS requested(role)
    WHERE requested.role NOT IN ('admin','manager','staff','accountant','customer','customer_manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='the expected role snapshot contains an unsupported role';
  END IF;
  SELECT pg_catalog.count(*)::integer,
         pg_catalog.count(DISTINCT requested.role)::integer,
         coalesce(pg_catalog.array_agg(requested.role ORDER BY requested.role),ARRAY[]::text[])
    INTO v_expected_count,v_expected_unique_count,v_expected_roles
    FROM pg_catalog.unnest(p_expected_roles) AS requested(role);
  IF v_expected_count<>v_expected_unique_count THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='the expected role snapshot contains duplicate roles';
  END IF;

  IF p_roles IS NULL
     OR pg_catalog.cardinality(p_roles)<1
     OR pg_catalog.cardinality(p_roles)>6
     OR pg_catalog.array_position(p_roles,NULL::text) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='select at least one allowed role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_roles) AS requested(role)
    WHERE requested.role NOT IN ('admin','manager','staff','accountant','customer','customer_manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported user role';
  END IF;
  SELECT pg_catalog.count(*)::integer,
         pg_catalog.count(DISTINCT requested.role)::integer,
         coalesce(pg_catalog.array_agg(requested.role ORDER BY requested.role),ARRAY[]::text[])
    INTO v_requested_count,v_requested_unique_count,v_requested_roles
    FROM pg_catalog.unnest(p_roles) AS requested(role);
  IF v_requested_count<>v_requested_unique_count THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate user roles are not allowed';
  END IF;
  IF pg_catalog.cardinality(v_requested_roles)>1 AND 'customer'=ANY(v_requested_roles) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer role cannot be combined with staff roles';
  END IF;

  SELECT p.id INTO v_target
    FROM public.profiles p
   WHERE p.id=p_profile_id
     AND p.organization_id=v_org
     AND p.is_active=true
     AND p.auth_user_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='profile is outside the current organization or is inactive';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(r.role ORDER BY r.role),ARRAY[]::text[])
    INTO v_current_roles
    FROM public.user_roles r
   WHERE r.profile_id=v_target;

  IF v_current_roles IS DISTINCT FROM v_expected_roles THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='role assignment changed since it was loaded; reload the member list and retry';
  END IF;

  IF v_current_roles=v_requested_roles THEN
    RETURN pg_catalog.jsonb_build_object(
      'profile_id',v_target,
      'roles',pg_catalog.to_jsonb(v_current_roles),
      'previous_roles',pg_catalog.to_jsonb(v_current_roles),
      'changed',false
    );
  END IF;

  -- Reuse the canonical tenant, last-admin, self-change and audit command.
  -- The organization and profile locks above remain held until it commits.
  v_result:=public.set_organization_user_roles(p_profile_id,p_roles);
  RETURN v_result || pg_catalog.jsonb_build_object(
    'previous_roles',pg_catalog.to_jsonb(v_current_roles),
    'changed',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_organization_user_roles_v2(uuid,text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_organization_user_roles_v2(uuid,text[],text[]) TO authenticated;

COMMENT ON FUNCTION public.set_organization_user_roles_v2(uuid,text[],text[]) IS
  'Admin-only tenant-scoped role assignment requiring the exact previously reviewed role snapshot; rejects stale requests with SQLSTATE 40001, preserves last-admin guards, and audits only real role changes.';

COMMIT;
