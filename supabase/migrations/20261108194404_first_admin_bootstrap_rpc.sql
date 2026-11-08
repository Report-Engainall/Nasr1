-- One-time, server-only first administrator provisioning.
-- A verified Auth invitation is bound to its exact auth.users UUID before the admin role is assigned.
BEGIN;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin_profile(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_auth_email text;
  v_invited_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_active_org_count bigint;
  v_organization_id uuid;
  v_profile_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;

  IF p_auth_user_id IS NULL
     OR pg_catalog.length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR pg_catalog.length(v_full_name) < 2
     OR pg_catalog.length(v_full_name) > 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid first administrator details';
  END IF;

  -- Serialize concurrent bootstrap attempts: at most one first admin can be created.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('aghbari-commerce:nasr1:first-admin:v1')
  );

  IF EXISTS (
    SELECT 1
    FROM public.user_roles AS roles
    WHERE roles.role = 'admin'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'first administrator already provisioned';
  END IF;

  SELECT
    pg_catalog.count(*),
    (pg_catalog.array_agg(org.id ORDER BY org.created_at ASC, org.id ASC))[1]
  INTO v_active_org_count, v_organization_id
  FROM public.organizations AS org
  WHERE org.is_active = true;

  IF v_active_org_count <> 1 OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exactly one active organization is required';
  END IF;

  SELECT
    pg_catalog.lower(u.email),
    u.invited_at,
    u.email_confirmed_at
  INTO v_auth_email, v_invited_at, v_email_confirmed_at
  FROM auth.users AS u
  WHERE u.id = p_auth_user_id;

  IF NOT FOUND
     OR v_auth_email IS DISTINCT FROM v_email
     OR (v_invited_at IS NULL AND v_email_confirmed_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'target auth user must have a matching invitation or verified email';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.auth_user_id = p_auth_user_id
       OR pg_catalog.lower(coalesce(profile.email, '')) = v_email
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'a profile already exists for the target administrator';
  END IF;

  INSERT INTO public.profiles (
    auth_user_id,
    organization_id,
    full_name,
    email
  )
  VALUES (
    p_auth_user_id,
    v_organization_id,
    v_full_name,
    v_email
  )
  RETURNING id INTO v_profile_id;

  INSERT INTO public.user_roles (profile_id, role)
  VALUES (v_profile_id, 'admin');

  RETURN pg_catalog.jsonb_build_object(
    'status', 'created',
    'profile_id', v_profile_id,
    'role', 'admin'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bootstrap_first_admin_profile(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin_profile(uuid, text, text)
  TO service_role;

COMMIT;
