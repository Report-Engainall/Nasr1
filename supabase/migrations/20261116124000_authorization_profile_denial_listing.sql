CREATE OR REPLACE FUNCTION public.list_authorization_profile_denials(p_target_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_organization_id uuid;
  v_target_organization_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_actor_has_capability('identity.roles.assign') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'identity.roles.assign capability required';
  END IF;

  IF p_target_profile_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'target profile is required';
  END IF;

  SELECT p.id, p.organization_id
    INTO v_actor_profile_id, v_organization_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id AND o.is_active = true
   WHERE p.auth_user_id = auth.uid()
     AND p.is_active = true
     AND p.organization_id IS NOT NULL
   ORDER BY p.created_at, p.id
   LIMIT 1;

  IF v_actor_profile_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active organization administrator is required';
  END IF;

  SELECT p.organization_id
    INTO v_target_organization_id
    FROM public.profiles p
   WHERE p.id = p_target_profile_id
     AND p.is_active = true
     AND p.auth_user_id IS NOT NULL;

  IF v_target_organization_id IS DISTINCT FROM v_organization_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'target profile is outside the active organization or inactive';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'denial_id', d.id,
        'capability_key', d.capability_key,
        'reason', d.reason,
        'is_active', d.is_active,
        'expires_at', d.expires_at,
        'created_at', d.created_at,
        'updated_at', d.updated_at
      )
      ORDER BY d.capability_key, d.created_at, d.id
    ),
    '[]'::jsonb
  )
    INTO v_result
    FROM public.authorization_profile_denials d
   WHERE d.organization_id = v_organization_id
     AND d.profile_id = p_target_profile_id;

  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.list_authorization_profile_denials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_authorization_profile_denials(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_authorization_profile_denials(uuid) IS
  'Lists only one active member profile denial history for an authorized administrator in the same organization.';
