CREATE OR REPLACE FUNCTION public.list_authorization_scope_resources()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_organization_id uuid;
  v_warehouses jsonb;
  v_customers jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_actor_has_capability('identity.roles.assign') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'identity.roles.assign capability required';
  END IF;

  SELECT p.id, p.organization_id
    INTO v_actor_profile_id, v_organization_id
    FROM public.profiles p
    JOIN public.organizations o
      ON o.id = p.organization_id
     AND o.is_active = true
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

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('id', w.id, 'name', w.name, 'code', w.code)
      ORDER BY w.name, w.id
    ),
    '[]'::jsonb
  )
    INTO v_warehouses
    FROM public.warehouses w
   WHERE w.organization_id = v_organization_id
     AND w.is_active = true;

  -- This projection intentionally excludes phone, email, balances, credit limits,
  -- pricing, contact details and any account/payment data.
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.business_name,
        'code', c.customer_code
      )
      ORDER BY c.business_name, c.id
    ),
    '[]'::jsonb
  )
    INTO v_customers
    FROM public.customers c
   WHERE c.organization_id = v_organization_id;

  RETURN jsonb_build_object(
    'warehouses', coalesce(v_warehouses, '[]'::jsonb),
    'customers', coalesce(v_customers, '[]'::jsonb)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.list_authorization_scope_resources() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_authorization_scope_resources() TO authenticated;

COMMENT ON FUNCTION public.list_authorization_scope_resources() IS
  'Lists only active same-tenant warehouses and minimal customer identity fields to an authorized role administrator; no finance or contact projection is exposed.';
