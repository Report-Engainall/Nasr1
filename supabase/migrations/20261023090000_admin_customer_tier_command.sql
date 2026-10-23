-- Enforce tenant-scoped, manager/admin-only customer tier changes with an auditable reason.
CREATE OR REPLACE FUNCTION public.set_admin_customer_tier(
  p_customer_id uuid, p_expected_tier text, p_tier text, p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer public.customers%ROWTYPE;
  v_next_tier text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_tier, '')));
  v_expected_tier text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_expected_tier, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
       AND p.organization_id=v_org AND p.is_active=true)
     OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','customer_manager')) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active admin or manager permission required to change customer tier';
  END IF;
  IF p_customer_id IS NULL OR v_next_tier NOT IN ('retail','wholesale','vip')
     OR pg_catalog.length(v_expected_tier)<1 OR pg_catalog.length(v_expected_tier)>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='tier must be one of retail, wholesale, or vip and expected tier is required';
  END IF;
  IF pg_catalog.length(v_reason)<3 OR pg_catalog.length(v_reason)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reason must contain between 3 and 500 characters';
  END IF;
  SELECT c.* INTO v_customer FROM public.customers c
   WHERE c.id=p_customer_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='customer not found in current organization';
  END IF;
  IF pg_catalog.lower(pg_catalog.btrim(coalesce(v_customer.tier,''))) IS DISTINCT FROM v_expected_tier THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer tier changed since the directory loaded; reload before updating';
  END IF;
  IF v_customer.tier=v_next_tier THEN
    RETURN pg_catalog.jsonb_build_object('customer_id',v_customer.id,'previous_tier',v_customer.tier,'tier',v_next_tier,'changed',false);
  END IF;
  UPDATE public.customers SET tier=v_next_tier,updated_at=pg_catalog.now()
   WHERE id=v_customer.id AND organization_id=v_org;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'customer.tier_changed','customer',v_customer.id,
    pg_catalog.jsonb_build_object('tier',v_customer.tier),
    pg_catalog.jsonb_build_object('tier',v_next_tier,'reason',v_reason));
  RETURN pg_catalog.jsonb_build_object('customer_id',v_customer.id,'previous_tier',v_customer.tier,'tier',v_next_tier,'changed',true);
END
$function$;

REVOKE ALL ON FUNCTION public.set_admin_customer_tier(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_customer_tier(uuid,text,text,text) TO authenticated;
REVOKE UPDATE ON TABLE public.customers FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status, approved_at) ON TABLE public.customers TO authenticated;
COMMENT ON FUNCTION public.set_admin_customer_tier(uuid,text,text,text) IS
  'Admin/manager-only tenant-scoped optimistic customer tier mutation with mandatory reason and before/after audit.';
