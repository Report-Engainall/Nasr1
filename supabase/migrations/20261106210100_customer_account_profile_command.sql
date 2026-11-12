-- P1 customer account profile: owner-bound editable business identity with audited, optimistic writes.
-- The login identity, tenant, customer tier, approval state, credit fields and user roles are never editable here.

CREATE OR REPLACE FUNCTION public.get_my_customer_account_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer public.customers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  SELECT c.* INTO v_customer
  FROM public.customers c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.profile_id = v_profile
    AND p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true
    AND p.organization_id = c.organization_id
    AND c.organization_id = public.current_organization_id()
  ORDER BY c.created_at, c.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'primary customer account is not linked to this profile';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'customer_code', v_customer.customer_code,
    'business_name', v_customer.business_name,
    'contact_name', v_customer.contact_name,
    'phone', v_customer.phone,
    'email', v_customer.email,
    'status', v_customer.status,
    'updated_at', v_customer.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_customer_account_profile(
  p_business_name text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer public.customers%ROWTYPE;
  v_business_name text := pg_catalog.btrim(coalesce(p_business_name, ''));
  v_contact_name text := pg_catalog.btrim(coalesce(p_contact_name, ''));
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  IF pg_catalog.length(v_business_name) NOT BETWEEN 2 AND 200
     OR pg_catalog.length(v_contact_name) NOT BETWEEN 2 AND 120
     OR pg_catalog.length(v_phone) NOT BETWEEN 7 AND 40
     OR pg_catalog.length(coalesce(v_email, '')) > 254
     OR (v_email IS NOT NULL AND v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'business profile fields are invalid or exceed their allowed lengths';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'profile revision is required';
  END IF;

  SELECT c.* INTO v_customer
  FROM public.customers c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.profile_id = v_profile
    AND p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true
    AND p.organization_id = c.organization_id
    AND c.organization_id = public.current_organization_id()
  ORDER BY c.created_at, c.id
  LIMIT 1
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'primary customer account is not linked to this profile';
  END IF;

  IF v_customer.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'customer account changed; reload the profile before saving';
  END IF;

  IF v_customer.business_name IS DISTINCT FROM v_business_name THEN
    v_changed_fields := pg_catalog.array_append(v_changed_fields, 'business_name');
  END IF;
  IF v_customer.contact_name IS DISTINCT FROM v_contact_name THEN
    v_changed_fields := pg_catalog.array_append(v_changed_fields, 'contact_name');
  END IF;
  IF v_customer.phone IS DISTINCT FROM v_phone THEN
    v_changed_fields := pg_catalog.array_append(v_changed_fields, 'phone');
  END IF;
  IF v_customer.email IS DISTINCT FROM v_email THEN
    v_changed_fields := pg_catalog.array_append(v_changed_fields, 'email');
  END IF;

  IF pg_catalog.cardinality(v_changed_fields) > 0 THEN
    UPDATE public.customers
    SET business_name = v_business_name,
        contact_name = v_contact_name,
        phone = v_phone,
        email = v_email,
        updated_at = pg_catalog.now()
    WHERE id = v_customer.id
      AND organization_id = v_customer.organization_id
      AND profile_id = v_profile;

    INSERT INTO public.audit_logs (
      organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
    ) VALUES (
      v_customer.organization_id,
      v_profile,
      'customer.account_profile.updated',
      'customer',
      v_customer.id,
      pg_catalog.jsonb_build_object('fields_changed', pg_catalog.to_jsonb(v_changed_fields)),
      pg_catalog.jsonb_build_object('fields_changed', pg_catalog.to_jsonb(v_changed_fields)),
      pg_catalog.now()
    );
  END IF;

  RETURN public.get_my_customer_account_profile();
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_customer_account_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_account_profile() TO authenticated;
REVOKE ALL ON FUNCTION public.update_my_customer_account_profile(text, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_customer_account_profile(text, text, text, text, timestamptz) TO authenticated;
