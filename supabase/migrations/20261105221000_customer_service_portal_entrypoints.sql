-- AGH-CUSTOMER-SERVICE-PORTAL-ENTRYPOINTS-001
-- Customer-safe capability and case creation entrypoints; never accept a customer ID from the browser.
CREATE OR REPLACE FUNCTION public.get_my_customer_service_portal_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_customer uuid:=public.current_customer_id();
  v_name text;
  v_reply boolean;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=v_actor AND r.role='customer'
     )
     OR NOT public.current_customer_can('service.cases.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer account with service case read permission is required';
  END IF;

  SELECT c.business_name INTO v_name FROM public.customers c
   WHERE c.id=v_customer AND c.organization_id=v_org AND c.status='approved';
  IF v_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='approved customer company is required to access service cases';
  END IF;
  v_reply:=public.current_customer_can('service.cases.reply');

  RETURN pg_catalog.jsonb_build_object(
    'customer_id',v_customer,
    'company_name',v_name,
    'can_read',true,
    'can_reply',v_reply,
    'can_create',v_reply
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_customer_service_portal_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_service_portal_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_my_customer_service_case(
  p_idempotency_key text,
  p_case_type text,
  p_subject text,
  p_description text,
  p_priority text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_customer uuid:=public.current_customer_id();
BEGIN
  IF v_customer IS NULL OR public.is_staff()
     OR NOT public.current_customer_can('service.cases.reply') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer buyer permission is required to create a service case';
  END IF;
  RETURN public.create_customer_service_case(
    v_customer,p_idempotency_key,p_case_type,p_subject,p_description,p_priority
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.create_my_customer_service_case(text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_my_customer_service_case(text,text,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.create_my_customer_service_portal_context() IS
  'Returns current authenticated customer company context and permitted case capabilities without accepting a customer identifier from the browser.';
COMMENT ON FUNCTION public.create_my_customer_service_case(text,text,text,text,text) IS
  'Creates a customer service case for the caller current_customer_id only; customer identity is derived server-side.';
