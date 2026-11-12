-- NASR1-P2-FINANCE-PRINT-PAGINATION-20261021
-- Separate two-argument overload preserves existing callers while enabling bounded server-side pages.
-- Every page is derived from the authenticated profile and active organization; no client-supplied tenant.
CREATE OR REPLACE FUNCTION public.get_finance_document_print_options(p_limit integer, p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid;
  v_cc bigint; v_ic bigint; v_mc bigint;
  v_customers jsonb; v_invoices jsonb; v_memos jsonb; v_organization_name text;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance()
     OR NOT EXISTS (SELECT 1 FROM public.user_roles r
       WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','accountant')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to list printable customer documents';
  END IF;

  SELECT NULLIF(pg_catalog.btrim(o.name),'') INTO v_organization_name
    FROM public.organizations o WHERE o.id=v_org AND o.is_active;
  IF v_organization_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='active organization identity is unavailable for financial printing';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='finance print option limit must be between 1 and 500';
  END IF;
  IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='finance print option offset must be between 0 and 10000000';
  END IF;

  SELECT count(*) INTO v_cc FROM public.customers c WHERE c.organization_id=v_org;
  SELECT count(*) INTO v_ic FROM public.customer_invoices i WHERE i.organization_id=v_org;
  SELECT count(*) INTO v_mc FROM public.customer_return_credit_memos m
    WHERE m.organization_id=v_org AND m.status IN ('draft','posted');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'customer_code',c.customer_code,
    'business_name',c.business_name,'contact_name',c.contact_name)
    ORDER BY c.business_name,c.customer_code,c.id),'[]'::jsonb) INTO v_customers
  FROM (
    SELECT c.id,c.customer_code,c.business_name,c.contact_name FROM public.customers c
    WHERE c.organization_id=v_org ORDER BY c.business_name,c.customer_code,c.id
    LIMIT p_limit OFFSET p_offset
  ) c;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'customer_id',i.customer_id,
    'customer_name',COALESCE(NULLIF(btrim(c.business_name),''),NULLIF(btrim(c.contact_name),''),i.customer_id::text),
    'status',i.status,'issued_at',i.issued_at,'currency',i.currency)
    ORDER BY i.issued_at DESC,i.id),'[]'::jsonb) INTO v_invoices
  FROM (
    SELECT i.id,i.invoice_number,i.customer_id,i.status,i.issued_at,i.currency
    FROM public.customer_invoices i WHERE i.organization_id=v_org
    ORDER BY i.issued_at DESC,i.id LIMIT p_limit OFFSET p_offset
  ) i
  JOIN public.customers c ON c.id=i.customer_id AND c.organization_id=v_org;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'memo_number',m.memo_number,'customer_id',m.customer_id,
    'customer_name',COALESCE(NULLIF(btrim(c.business_name),''),NULLIF(btrim(c.contact_name),''),m.customer_id::text),
    'invoice_number',i.invoice_number,'status',m.status,'created_at',m.created_at,'currency',m.currency,
    'total_amount',m.total_amount::text) ORDER BY m.created_at DESC,m.id),'[]'::jsonb) INTO v_memos
  FROM (
    SELECT m.id,m.memo_number,m.customer_id,m.invoice_id,m.status,m.created_at,m.currency,m.total_amount
    FROM public.customer_return_credit_memos m
    WHERE m.organization_id=v_org AND m.status IN ('draft','posted')
    ORDER BY m.created_at DESC,m.id LIMIT p_limit OFFSET p_offset
  ) m
  JOIN public.customers c ON c.id=m.customer_id AND c.organization_id=v_org
  JOIN public.customer_invoices i ON i.id=m.invoice_id AND i.organization_id=v_org;

  RETURN jsonb_build_object(
    'organization_name',v_organization_name,
    'customers',v_customers,'customers_has_more',v_cc>(p_offset::bigint+p_limit::bigint),
    'invoices',v_invoices,'invoices_has_more',v_ic>(p_offset::bigint+p_limit::bigint),
    'credit_memos',v_memos,'credit_memos_has_more',v_mc>(p_offset::bigint+p_limit::bigint),
    'limit',p_limit,'offset',p_offset
  );
END;$function$;

REVOKE ALL ON FUNCTION public.get_finance_document_print_options(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_finance_document_print_options(integer,integer) TO authenticated;
COMMENT ON FUNCTION public.get_finance_document_print_options(integer,integer) IS
  'Tenant-scoped paginated finance print selectors for active admin, manager and accountant profiles; rows are ordered deterministically and offsets are bounded.';
