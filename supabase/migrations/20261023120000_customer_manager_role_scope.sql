-- Customer-manager access is explicitly scoped to customer operations. Do not broaden public.is_staff(),
-- since legacy staff policies are intentionally wider than the customer-manager capability.
CREATE OR REPLACE FUNCTION public.get_current_tenant_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_warehouse_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;

  SELECT p.id, p.organization_id
    INTO v_profile_id, v_organization_id
  FROM public.profiles AS p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An active profile is required';
  END IF;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The profile has no organization scope';
  END IF;

  -- This is a deterministic default for legacy screens, not a permission boundary.
  -- Every query is independently restricted by tenant-aware RLS below.
  SELECT w.id
    INTO v_warehouse_id
  FROM public.warehouses AS w
  WHERE w.organization_id = v_organization_id
    AND w.is_active = true
  ORDER BY w.created_at ASC, w.id ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'organization_id', v_organization_id,
    'warehouse_id', v_warehouse_id,
    'is_staff', EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.profile_id = v_profile_id AND r.role IN ('admin','manager','staff')
    ),
    'can_manage_customers', EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.profile_id = v_profile_id AND r.role IN ('admin','manager','customer_manager')
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_current_tenant_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_context() TO authenticated;

-- Only admins may administer roles; customer_manager is now a valid assignable organization role.
CREATE OR REPLACE FUNCTION public.set_organization_user_roles(
  p_profile_id uuid,
  p_roles text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_target public.profiles%ROWTYPE;
  v_role text;
  v_old_roles jsonb;
  v_admin_count integer;
  v_unique_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='admin role required to change organization user roles';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active admin organization is required';
  END IF;

  -- Serialize role changes within the tenant; avoids concurrent removal of the last admin.
  PERFORM 1 FROM public.organizations o WHERE o.id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='organization is unavailable'; END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='profile id is required';
  END IF;
  IF p_roles IS NULL OR pg_catalog.cardinality(p_roles)<1 OR pg_catalog.cardinality(p_roles)>6 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='select at least one allowed role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_roles) AS requested(role)
    WHERE requested.role NOT IN ('admin','manager','staff','accountant','customer','customer_manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported user role';
  END IF;

  SELECT count(DISTINCT requested.role)::integer INTO v_unique_count
    FROM pg_catalog.unnest(p_roles) AS requested(role);
  IF v_unique_count <> pg_catalog.cardinality(p_roles) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='duplicate user roles are not allowed';
  END IF;
  IF pg_catalog.cardinality(p_roles)>1 AND 'customer'=ANY(p_roles) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer role cannot be combined with staff roles';
  END IF;
  IF p_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cannot change their own roles from this screen';
  END IF;

  SELECT p.* INTO v_target
    FROM public.profiles p
   WHERE p.id=p_profile_id
     AND p.organization_id=v_org
     AND p.is_active
     AND p.auth_user_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='profile is outside the current organization or is inactive';
  END IF;

  SELECT coalesce(jsonb_agg(r.role ORDER BY r.role),'[]'::jsonb) INTO v_old_roles
    FROM public.user_roles r
   WHERE r.profile_id=v_target.id;

  IF EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id=v_target.id AND r.role='admin'
  ) AND NOT ('admin'=ANY(p_roles)) THEN
    SELECT count(DISTINCT p.id)::integer INTO v_admin_count
      FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.organization_id=v_org
       AND p.auth_user_id IS NOT NULL
       AND p.is_active
       AND r.role='admin';
    IF v_admin_count<=1 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cannot remove last active administrator';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE profile_id=v_target.id;
  FOREACH v_role IN ARRAY p_roles LOOP
    INSERT INTO public.user_roles(profile_id,role) VALUES(v_target.id,v_role);
  END LOOP;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'user.roles.changed','profile',v_target.id,
    jsonb_build_object('roles',v_old_roles),
    jsonb_build_object('roles',to_jsonb(p_roles)));

  RETURN jsonb_build_object('profile_id',v_target.id,'roles',to_jsonb(p_roles));
END;
$$;

REVOKE ALL ON FUNCTION public.set_organization_user_roles(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_user_roles(uuid,text[]) TO authenticated;
COMMENT ON FUNCTION public.set_organization_user_roles(uuid,text[]) IS
  'Admin-only tenant-scoped audited role assignment; supports customer_manager without combining customer with staff roles.';

-- The customer-manager can execute these audited, row-locked commands; direct table writes remain revoked.
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
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer-management permission required to change customer tier';
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
END;
$function$;

REVOKE ALL ON FUNCTION public.set_admin_customer_tier(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_customer_tier(uuid,text,text,text) TO authenticated;
REVOKE UPDATE ON TABLE public.customers FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status, approved_at) ON TABLE public.customers TO authenticated;
COMMENT ON FUNCTION public.set_admin_customer_tier(uuid,text,text,text) IS
  'Admin/manager/customer_manager-only tenant-scoped optimistic customer tier mutation with mandatory reason and before/after audit.';

CREATE OR REPLACE FUNCTION public.set_admin_customer_status(
  p_customer_id uuid, p_expected_status text, p_status text, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer public.customers%ROWTYPE;
  v_expected_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_expected_status, '')));
  v_requested_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, '')));
  v_next_status text;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_restoring boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active=true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','customer_manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer-management permission required to change customer status';
  END IF;

  IF p_customer_id IS NULL
     OR v_expected_status NOT IN ('pending','approved','rejected','frozen','blocked','archived')
     OR v_requested_status NOT IN ('approved','rejected','frozen','blocked','archived','restore') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid customer status command';
  END IF;
  IF pg_catalog.length(v_reason)<3 OR pg_catalog.length(v_reason)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reason must contain between 3 and 500 characters';
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers c
   WHERE c.id=p_customer_id AND c.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='customer not found in current organization';
  END IF;
  IF v_customer.status IS DISTINCT FROM v_expected_status THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer status changed since directory loaded; reload before updating';
  END IF;

  IF v_requested_status='restore' THEN
    IF v_customer.status <> 'archived' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only archived customers can be restored';
    END IF;
    SELECT l.old_value ->> 'status' INTO v_next_status
      FROM public.audit_logs l
     WHERE l.organization_id=v_org
       AND l.entity_type='customer'
       AND l.entity_id=p_customer_id
       AND l.action='customer.status_changed'
       AND l.new_value ->> 'status'='archived'
     ORDER BY l.created_at DESC
     LIMIT 1;
    IF v_next_status IS NULL OR v_next_status NOT IN ('pending','approved','rejected','frozen','blocked') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='previous customer status is unavailable; cannot restore safely';
    END IF;
    v_restoring := true;
  ELSE
    v_next_status := v_requested_status;
  END IF;

  IF NOT v_restoring AND NOT (
    (v_customer.status='pending' AND v_next_status IN ('approved','rejected','blocked','archived')) OR
    (v_customer.status='approved' AND v_next_status IN ('frozen','blocked','archived')) OR
    (v_customer.status='rejected' AND v_next_status IN ('approved','blocked','archived')) OR
    (v_customer.status='frozen' AND v_next_status IN ('approved','blocked','archived')) OR
    (v_customer.status='blocked' AND v_next_status IN ('approved','archived'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid customer status transition';
  END IF;

  UPDATE public.customers
     SET status=v_next_status,
         approved_at=CASE WHEN v_next_status='approved' AND NOT v_restoring THEN pg_catalog.now() ELSE approved_at END,
         updated_at=pg_catalog.now()
   WHERE id=v_customer.id AND organization_id=v_org;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(
    v_org, v_actor, 'customer.status_changed', 'customer', v_customer.id,
    pg_catalog.jsonb_build_object('status',v_customer.status),
    pg_catalog.jsonb_build_object('status',v_next_status,'reason',v_reason,'restored_from_archive',v_restoring)
  );

  RETURN pg_catalog.jsonb_build_object(
    'customer_id',v_customer.id,'previous_status',v_customer.status,'status',v_next_status,'changed',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_admin_customer_status(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_customer_status(uuid,text,text,text) TO authenticated;
REVOKE UPDATE ON TABLE public.customers FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (status, approved_at) ON TABLE public.customers FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.set_admin_customer_status(uuid,text,text,text) IS
  'Tenant-scoped customer lifecycle transitions with admin/manager/customer_manager role checks, optimistic concurrency, mandatory reason and before/after audit.';

-- Customer-manager directory RPC returns only non-financial columns and never grants direct customer-table reads.
CREATE OR REPLACE FUNCTION public.fetch_customer_manager_directory(
  p_search text DEFAULT '',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_search text := pg_catalog.left(pg_catalog.btrim(coalesce(p_search,'')),254);
  v_page integer := p_page;
  v_page_size integer := p_page_size;
  v_total bigint;
  v_page_count integer;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org AND p.is_active
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','customer_manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer-management permission required';
  END IF;

  IF v_page IS NULL OR v_page < 1 OR v_page_size IS NULL OR v_page_size < 1 OR v_page_size > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid customer directory page';
  END IF;

  SELECT pg_catalog.count(*) INTO v_total
  FROM public.customers c
  WHERE c.organization_id=v_org
    AND (v_search='' OR
      pg_catalog.strpos(pg_catalog.lower(coalesce(c.business_name,'')),pg_catalog.lower(v_search))>0 OR
      pg_catalog.strpos(pg_catalog.lower(coalesce(c.contact_name,'')),pg_catalog.lower(v_search))>0 OR
      pg_catalog.strpos(pg_catalog.lower(coalesce(c.phone,'')),pg_catalog.lower(v_search))>0 OR
      pg_catalog.strpos(pg_catalog.lower(coalesce(c.email,'')),pg_catalog.lower(v_search))>0 OR
      pg_catalog.strpos(pg_catalog.lower(coalesce(c.customer_code,'')),pg_catalog.lower(v_search))>0);

  v_page_count := GREATEST(1,pg_catalog.ceil(v_total::numeric/v_page_size)::integer);
  v_page := LEAST(v_page,v_page_count);

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', c.id,
        'business_name', c.business_name,
        'contact_name', c.contact_name,
        'phone', c.phone,
        'email', c.email,
        'customer_code', c.customer_code,
        'tier', c.tier,
        'status', c.status,
        'created_at', c.created_at
      ) ORDER BY c.created_at DESC,c.id DESC
    ),
    '[]'::jsonb
  ) INTO v_rows
  FROM (
    SELECT c.id,c.business_name,c.contact_name,c.phone,c.email,c.customer_code,c.tier,c.status,c.created_at
    FROM public.customers c
    WHERE c.organization_id=v_org
      AND (v_search='' OR
        pg_catalog.strpos(pg_catalog.lower(coalesce(c.business_name,'')),pg_catalog.lower(v_search))>0 OR
        pg_catalog.strpos(pg_catalog.lower(coalesce(c.contact_name,'')),pg_catalog.lower(v_search))>0 OR
        pg_catalog.strpos(pg_catalog.lower(coalesce(c.phone,'')),pg_catalog.lower(v_search))>0 OR
        pg_catalog.strpos(pg_catalog.lower(coalesce(c.email,'')),pg_catalog.lower(v_search))>0 OR
        pg_catalog.strpos(pg_catalog.lower(coalesce(c.customer_code,'')),pg_catalog.lower(v_search))>0)
    ORDER BY c.created_at DESC,c.id DESC
    LIMIT v_page_size OFFSET ((v_page-1)*v_page_size)
  ) c;

  RETURN pg_catalog.jsonb_build_object(
    'rows',v_rows,'total_count',v_total,'page',v_page,'page_size',v_page_size
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_customer_manager_directory(text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_customer_manager_directory(text,integer,integer) TO authenticated;
COMMENT ON FUNCTION public.fetch_customer_manager_directory(text,integer,integer) IS
  'Tenant-scoped customer directory for customer managers; only non-financial fields are returned and direct customer table RLS is unchanged.';
