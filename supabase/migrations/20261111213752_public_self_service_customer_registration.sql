-- Public self-service customer registration completion.
-- Create a pending customer master row only after Auth has verified the user's phone or email.
-- Tenant, role, customer tier, approval state, balance and credit are server-derived.

CREATE OR REPLACE FUNCTION public.ensure_my_customer_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_auth_phone text;
  v_auth_email text;
  v_phone_confirmed_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_user_metadata jsonb;
  v_contact_name text;
  v_business_name text;
  v_verified_phone text;
  v_verified_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  SELECT
    u.phone,
    u.email,
    u.phone_confirmed_at,
    u.email_confirmed_at,
    u.raw_user_meta_data
  INTO
    v_auth_phone,
    v_auth_email,
    v_phone_confirmed_at,
    v_email_confirmed_at,
    v_user_metadata
  FROM auth.users u
  WHERE u.id = v_uid
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated identity not found';
  END IF;

  SELECT p.*
  INTO v_profile
  FROM public.profiles p
  WHERE p.auth_user_id = v_uid
    AND p.is_active = true
    AND p.organization_id = public.current_organization_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active customer profile is not configured';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.profile_id = v_profile.id
      AND r.role = 'customer'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer role is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.profile_id = v_profile.id
      AND r.role IN ('admin', 'manager', 'staff', 'accountant', 'customer_manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'staff identities cannot self-provision customer accounts';
  END IF;

  -- Repeated login, refresh and OTP-confirmation callbacks are idempotent.
  SELECT c.*
  INTO v_customer
  FROM public.customers c
  WHERE c.profile_id = v_profile.id
    AND c.organization_id = v_profile.organization_id
  ORDER BY c.created_at, c.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'customer_id', v_customer.id,
      'customer_code', v_customer.customer_code,
      'status', v_customer.status,
      'tier', v_customer.tier,
      'created', false
    );
  END IF;

  -- A user who joined an existing customer company must keep that membership,
  -- not accidentally create a second customer master record.
  SELECT c.*
  INTO v_customer
  FROM public.customer_company_memberships m
  JOIN public.customers c
    ON c.id = m.customer_id
   AND c.organization_id = m.organization_id
  WHERE m.profile_id = v_profile.id
    AND m.organization_id = v_profile.organization_id
    AND m.status = 'active'
  ORDER BY m.created_at, m.id
  LIMIT 1
  FOR SHARE OF c;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'customer_id', v_customer.id,
      'customer_code', v_customer.customer_code,
      'status', v_customer.status,
      'tier', v_customer.tier,
      'created', false,
      'company_membership', true
    );
  END IF;

  -- Do not register unverified identifiers. Email signups may complete later;
  -- public phone signups reach this point only after SMS OTP verification.
  IF v_phone_confirmed_at IS NULL AND v_email_confirmed_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('created', false, 'verification_pending', true);
  END IF;

  v_contact_name := pg_catalog.left(pg_catalog.btrim(coalesce(v_profile.full_name, '')), 120);
  IF pg_catalog.length(v_contact_name) < 2 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'customer contact name is invalid';
  END IF;

  v_business_name := pg_catalog.left(
    coalesce(
      nullif(pg_catalog.btrim(coalesce(v_user_metadata ->> 'business_name', '')), ''),
      v_contact_name
    ),
    200
  );
  IF pg_catalog.length(v_business_name) < 2 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'customer business name is invalid';
  END IF;

  v_verified_phone := CASE
    WHEN v_phone_confirmed_at IS NOT NULL THEN nullif(pg_catalog.btrim(coalesce(v_auth_phone, '')), '')
    ELSE NULL
  END;
  v_verified_email := CASE
    WHEN v_email_confirmed_at IS NOT NULL THEN nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(v_auth_email, ''))), '')
    ELSE NULL
  END;

  IF v_verified_phone IS NOT NULL AND v_verified_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'verified phone number is not in E.164 format';
  END IF;

  IF v_verified_email IS NULL AND v_verified_phone IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('created', false, 'verification_pending', true);
  END IF;

  -- Keep the authenticated profile's contact phone aligned with the verified Auth identity.
  IF v_verified_phone IS NOT NULL THEN
    UPDATE public.profiles
    SET phone = coalesce(nullif(pg_catalog.btrim(phone), ''), v_verified_phone),
        updated_at = pg_catalog.now()
    WHERE id = v_profile.id
      AND auth_user_id = v_uid
      AND organization_id = v_profile.organization_id;
  END IF;

  INSERT INTO public.customers (
    organization_id,
    profile_id,
    customer_code,
    business_name,
    contact_name,
    phone,
    email,
    tier,
    status,
    credit_limit,
    current_balance
  )
  VALUES (
    v_profile.organization_id,
    v_profile.id,
    'CUST-' || pg_catalog.upper(
      pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8)
    ),
    v_business_name,
    v_contact_name,
    v_verified_phone,
    v_verified_email,
    'retail',
    'pending',
    0,
    0
  )
  RETURNING * INTO v_customer;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    created_at
  )
  VALUES (
    v_profile.organization_id,
    v_profile.id,
    'customer.self_service_registered',
    'customer',
    v_customer.id,
    NULL,
    pg_catalog.jsonb_build_object(
      'customer_code', v_customer.customer_code,
      'status', 'pending',
      'tier', 'retail'
    ),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'customer_id', v_customer.id,
    'customer_code', v_customer.customer_code,
    'status', v_customer.status,
    'tier', v_customer.tier,
    'created', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_my_customer_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_customer_account() TO authenticated;
