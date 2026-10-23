-- Tenant-scoped, server-side Auth session inventory and individual revocation.
-- Fail closed when the deployed Supabase Auth session contract is not available.
DO $preflight$
BEGIN
  IF to_regclass('auth.sessions') IS NULL THEN
    RAISE EXCEPTION 'Supabase Auth auth.sessions is required for central session management';
  END IF;
  IF EXISTS (
    SELECT required.column_name
    FROM (VALUES
      ('id'), ('user_id'), ('created_at'), ('updated_at'), ('refreshed_at'),
      ('not_after'), ('user_agent'), ('ip')
    ) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='auth' AND c.table_name='sessions'
        AND c.column_name=required.column_name
    )
  ) THEN
    RAISE EXCEPTION 'Supabase Auth auth.sessions is missing required session inventory columns';
  END IF;
END
$preflight$;

-- Supabase access JWTs can remain cryptographically valid after logout. Tie the
-- application identity helpers and restrictive tenant RLS policies to the live
-- server-side session row, so deleting one row blocks that session immediately.
CREATE OR REPLACE FUNCTION public.current_auth_session_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN coalesce(auth.jwt()->>'session_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (auth.jwt()->>'session_id')::uuid
    ELSE NULL::uuid
  END
$function$;
REVOKE ALL ON FUNCTION public.current_auth_session_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_auth_session_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id
  FROM public.profiles AS p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active = true
    AND public.current_auth_session_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.sessions AS s
      WHERE s.id = public.current_auth_session_id()
        AND s.user_id = auth.uid()
        AND (s.not_after IS NULL OR s.not_after > pg_catalog.now())
    )
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

-- Admin capability checks must use the same live-session identity boundary too.
CREATE OR REPLACE FUNCTION public.can_manage_user_roles()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.user_roles AS r ON r.profile_id=p.id
    WHERE p.id=public.current_profile_id()
      AND p.auth_user_id=auth.uid()
      AND p.is_active=true
      AND p.organization_id IS NOT NULL
      AND r.role='admin'
  )
$function$;
REVOKE ALL ON FUNCTION public.can_manage_user_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_user_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.organization_id
  FROM public.profiles AS p
  WHERE p.id = public.current_profile_id()
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true
    AND p.organization_id IS NOT NULL
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_tenant_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_organization_id uuid;
  v_warehouse_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='28000', MESSAGE='Authentication required';
  END IF;

  SELECT p.organization_id INTO v_organization_id
  FROM public.profiles AS p
  WHERE p.id=v_profile_id
    AND p.auth_user_id=auth.uid()
    AND p.is_active=true
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='An active profile and non-revoked session are required';
  END IF;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='The profile has no organization scope';
  END IF;

  SELECT w.id INTO v_warehouse_id
  FROM public.warehouses AS w
  WHERE w.organization_id=v_organization_id AND w.is_active=true
  ORDER BY w.created_at ASC, w.id ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'profile_id',v_profile_id,
    'organization_id',v_organization_id,
    'warehouse_id',v_warehouse_id,
    'is_staff', EXISTS (
      SELECT 1 FROM public.user_roles AS r
      WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','staff')
    ),
    'can_manage_customers', EXISTS (
      SELECT 1 FROM public.user_roles AS r
      WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','customer_manager')
    )
  );
END
$function$;
REVOKE ALL ON FUNCTION public.get_current_tenant_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_organization_sessions(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_current_session uuid := public.current_auth_session_id();
  v_sessions jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization administrator required to list sessions';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='session list limit must be between 1 and 200';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.profiles AS p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active administrator organization is required';
  END IF;

  SELECT coalesce(
    jsonb_agg(session_row ORDER BY activity_at DESC NULLS LAST, created_at DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM (
    SELECT
      coalesce(s.refreshed_at,s.updated_at,s.created_at) AS activity_at,
      s.created_at,
      jsonb_build_object(
        'session_id',s.id,
        'profile_id',p.id,
        'display_name',p.full_name,
        'email',p.email,
        'created_at',s.created_at,
        'last_activity_at',coalesce(s.refreshed_at,s.updated_at,s.created_at),
        'expires_at',s.not_after,
        'user_agent',s.user_agent,
        'ip_address',s.ip::text,
        'is_current_session',s.id=v_current_session
      ) AS session_row
    FROM auth.sessions AS s
    JOIN public.profiles AS p ON p.auth_user_id=s.user_id
    WHERE p.organization_id=v_org
      AND p.is_active=true
      AND (s.not_after IS NULL OR s.not_after > pg_catalog.now())
    ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
    LIMIT p_limit
  ) AS scoped_sessions;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES (
    v_org,v_actor,'auth.sessions.viewed','auth_session_collection',NULL,NULL,
    jsonb_build_object('session_count',jsonb_array_length(v_sessions),'limit',p_limit)
  );

  RETURN v_sessions;
END
$function$;
REVOKE ALL ON FUNCTION public.list_organization_sessions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_organization_sessions(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_organization_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_current_session uuid := public.current_auth_session_id();
  v_target_user uuid;
  v_target_profile uuid;
  v_target_name text;
  v_target_email text;
  v_target_agent text;
  v_target_created_at timestamptz;
  v_target_not_after timestamptz;
  v_deleted integer;
  v_revoked_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization administrator required to revoke sessions';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='session id is required';
  END IF;
  IF p_session_id=v_current_session THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='the current administrator session cannot be revoked from this endpoint';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.profiles AS p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active administrator organization is required';
  END IF;

  SELECT s.user_id,p.id,p.full_name,p.email,s.user_agent,s.created_at,s.not_after
    INTO v_target_user,v_target_profile,v_target_name,v_target_email,
         v_target_agent,v_target_created_at,v_target_not_after
  FROM auth.sessions AS s
  JOIN public.profiles AS p ON p.auth_user_id=s.user_id
  WHERE s.id=p_session_id
    AND p.organization_id=v_org
    AND p.is_active=true
    AND (s.not_after IS NULL OR s.not_after > pg_catalog.now())
  FOR UPDATE OF s;

  IF v_target_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='session was not found in the active organization';
  END IF;

  DELETE FROM auth.sessions
  WHERE id=p_session_id AND user_id=v_target_user;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='session changed during revocation; retry';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES (
    v_org,v_actor,'auth.session.revoked','auth_session',p_session_id,
    jsonb_build_object(
      'profile_id',v_target_profile,
      'display_name',v_target_name,
      'email',v_target_email,
      'user_agent',v_target_agent,
      'created_at',v_target_created_at,
      'expires_at',v_target_not_after
    ),
    jsonb_build_object('revoked',true,'revoked_at',v_revoked_at)
  );

  RETURN jsonb_build_object('session_id',p_session_id,'revoked',true,'revoked_at',v_revoked_at);
END
$function$;
REVOKE ALL ON FUNCTION public.revoke_organization_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_organization_session(uuid) TO authenticated;
