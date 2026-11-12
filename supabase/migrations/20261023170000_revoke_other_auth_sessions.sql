-- Explicitly revoke every other Auth session for the authenticated account.
-- This is self-scoped (not organization-wide), audited, atomic, and preserves the live caller session.
CREATE OR REPLACE FUNCTION public.revoke_other_auth_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile uuid := public.current_profile_id();
  v_organization_id uuid;
  v_current_session uuid := public.current_auth_session_id();
  v_revoked_session_ids uuid[];
  v_revoked_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR v_actor_profile IS NULL OR v_current_session IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='an active profile and live current Auth session are required';
  END IF;

  SELECT p.organization_id INTO v_organization_id
  FROM public.profiles AS p
  WHERE p.id=v_actor_profile
    AND p.auth_user_id=auth.uid()
    AND p.is_active=true;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='an active organization profile is required';
  END IF;

  -- Lock and revalidate the current session before deleting any siblings.
  PERFORM 1
  FROM auth.sessions AS s
  WHERE s.id=v_current_session
    AND s.user_id=auth.uid()
    AND (s.not_after IS NULL OR s.not_after > pg_catalog.now())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='the current Auth session is not active';
  END IF;

  -- The actor may only revoke sessions for auth.uid(); the current session is excluded.
  WITH deleted_sessions AS (
    DELETE FROM auth.sessions AS s
    WHERE s.user_id=auth.uid()
      AND s.id <> v_current_session
    RETURNING s.id
  )
  SELECT coalesce(pg_catalog.array_agg(id), ARRAY[]::uuid[])
  INTO v_revoked_session_ids
  FROM deleted_sessions;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES (
    v_organization_id,v_actor_profile,'auth.sessions.revoked_others',
    'auth_session_collection',NULL,
    jsonb_build_object('retained_session_id',v_current_session),
    jsonb_build_object(
      'revoked_count',pg_catalog.cardinality(v_revoked_session_ids),
      'revoked_session_ids',to_jsonb(v_revoked_session_ids),
      'revoked_at',v_revoked_at
    )
  );

  RETURN jsonb_build_object(
    'current_session_id',v_current_session,
    'revoked_count',pg_catalog.cardinality(v_revoked_session_ids),
    'revoked_session_ids',to_jsonb(v_revoked_session_ids),
    'revoked_at',v_revoked_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.revoke_other_auth_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_other_auth_sessions() TO authenticated;
