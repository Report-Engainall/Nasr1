-- Replace the bounded, non-paginated organization session list with the same
-- admin-only source and a stable keyset cursor. Existing response rows keep
-- their exact shape so the UI never needs to infer sessions from browser storage.
DROP FUNCTION IF EXISTS public.list_organization_sessions(integer);

CREATE FUNCTION public.list_organization_sessions(
  p_limit integer DEFAULT 50,
  p_after_activity_at timestamptz DEFAULT NULL,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_session_id uuid DEFAULT NULL
)
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
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active organization administrator required to list sessions';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 201 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='session page limit must be between 1 and 201';
  END IF;

  IF ((p_after_activity_at IS NULL) <> (p_after_created_at IS NULL))
     OR ((p_after_activity_at IS NULL) <> (p_after_session_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='all session page cursor fields must be supplied together';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.profiles AS p
  WHERE p.id=v_actor
    AND p.auth_user_id=auth.uid()
    AND p.is_active=true
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active administrator organization is required';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      session_row
      ORDER BY activity_at DESC, created_at DESC, session_id DESC
    ),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM (
    SELECT
      s.id AS session_id,
      p.id AS profile_id,
      p.full_name AS display_name,
      p.email,
      s.created_at,
      coalesce(s.refreshed_at,s.updated_at,s.created_at) AS activity_at,
      s.not_after AS expires_at,
      s.user_agent,
      s.ip::text AS ip_address,
      s.id=v_current_session AS is_current_session,
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
      AND (
        p_after_session_id IS NULL
        OR ROW(
          coalesce(s.refreshed_at,s.updated_at,s.created_at),
          s.created_at,
          s.id
        ) < ROW(
          p_after_activity_at,
          p_after_created_at,
          p_after_session_id
        )
      )
    ORDER BY
      coalesce(s.refreshed_at,s.updated_at,s.created_at) DESC,
      s.created_at DESC,
      s.id DESC
    LIMIT p_limit
  ) AS scoped_sessions;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES (
    v_org,
    v_actor,
    'auth.sessions.viewed',
    'auth_session_collection',
    NULL,
    NULL,
    jsonb_build_object(
      'session_count',jsonb_array_length(v_sessions),
      'limit',p_limit,
      'cursor_applied',p_after_session_id IS NOT NULL
    )
  );

  RETURN v_sessions;
END
$function$;

REVOKE ALL ON FUNCTION public.list_organization_sessions(integer,timestamptz,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_organization_sessions(integer,timestamptz,timestamptz,uuid) TO authenticated;
