-- Customer lifecycle is a single audited command. Browser roles may not mutate status directly.
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
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer manager permission required to change customer status';
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
         approved_at=CASE WHEN v_next_status='approved' THEN pg_catalog.now() ELSE approved_at END,
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
END
$function$;

REVOKE ALL ON FUNCTION public.set_admin_customer_status(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_customer_status(uuid,text,text,text) TO authenticated;
REVOKE UPDATE ON TABLE public.customers FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (status, approved_at) ON TABLE public.customers FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.set_admin_customer_status(uuid,text,text,text) IS
  'Tenant-scoped customer lifecycle transitions with server-side role checks, optimistic concurrency, mandatory reason and before/after audit. Archive restoration returns to the last non-archived status.';
