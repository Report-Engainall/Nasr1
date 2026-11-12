-- NASR1-P2-FINANCE-PRINT-REVERSED-CREDIT-MEMOS-20261022
-- Historical credit memos remain printable for audit, but only with a recorded, posted reversal.
-- No void memo is exposed. All list and detail queries stay tenant-scoped and finance-role gated.
BEGIN;
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
    WHERE m.organization_id=v_org AND m.status IN ('draft','posted','reversed');

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
    WHERE m.organization_id=v_org AND m.status IN ('draft','posted','reversed')
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


-- Preserve the established one-argument RPC while delegating to the latest tenant-scoped page contract.
CREATE OR REPLACE FUNCTION public.get_finance_document_print_options(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT public.get_finance_document_print_options(p_limit,0);
$function$;
REVOKE ALL ON FUNCTION public.get_finance_document_print_options(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_finance_document_print_options(integer) TO authenticated;
COMMENT ON FUNCTION public.get_finance_document_print_options(integer) IS
  'Tenant-scoped finance print selectors for active admin, manager and accountant profiles; first page delegates to the bounded paginated function.';

-- NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004
-- Finance-only, tenant-scoped source data for printing a return credit memo.
CREATE OR REPLACE FUNCTION public.get_customer_return_credit_memo_pdf(p_credit_memo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_memo public.customer_return_credit_memos%ROWTYPE;
  v_result jsonb;
  v_line_count integer;
  v_line_subtotal numeric(15,2);
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to print a customer return credit memo';
  END IF;
  IF p_credit_memo_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo id is required';
  END IF;
  SELECT m.* INTO v_memo FROM public.customer_return_credit_memos m
   WHERE m.id=p_credit_memo_id AND m.organization_id=v_org AND m.status IN ('draft','posted','reversed');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='credit memo was not found in the active organization or is not printable';
  END IF;
  IF v_memo.status='reversed' AND NOT EXISTS (
    SELECT 1
      FROM public.accounting_return_credit_memo_reversals rv
      JOIN public.accounting_return_credit_memo_postings sp
        ON sp.organization_id=rv.organization_id AND sp.credit_memo_id=rv.credit_memo_id
       AND sp.journal_entry_id=rv.original_journal_entry_id
      JOIN public.accounting_journal_entries original_journal
        ON original_journal.organization_id=sp.organization_id AND original_journal.id=sp.journal_entry_id
      JOIN public.accounting_journal_entries reversal_journal
        ON reversal_journal.organization_id=rv.organization_id AND reversal_journal.id=rv.reversal_journal_entry_id
     WHERE rv.organization_id=v_org AND rv.credit_memo_id=v_memo.id
       AND rv.reversal_journal_entry_id=v_memo.reversal_journal_entry_id
       AND rv.reason=v_memo.reversal_reason
       AND rv.source_amount=v_memo.total_amount AND rv.source_currency=v_memo.currency
       AND original_journal.status='posted' AND reversal_journal.status='posted'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reversed credit memo is missing its posted, reconciled reversal evidence; printing was denied';
  END IF;
  SELECT count(*)::integer,COALESCE(pg_catalog.sum(mi.credited_subtotal),0)::numeric(15,2)
    INTO v_line_count,v_line_subtotal FROM public.customer_return_credit_memo_items mi
   WHERE mi.organization_id=v_org AND mi.credit_memo_id=v_memo.id;
  IF v_line_count<1 OR v_line_subtotal IS DISTINCT FROM v_memo.subtotal_amount
     OR v_memo.total_amount IS DISTINCT FROM (v_memo.subtotal_amount+v_memo.tax_amount)::numeric(15,2) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo source lines and financial totals do not reconcile; printing was denied';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'memo',pg_catalog.jsonb_build_object('id',m.id,'memo_number',m.memo_number,'status',m.status,
      'currency',m.currency,'subtotal_amount',m.subtotal_amount,'tax_amount',m.tax_amount,
      'total_amount',m.total_amount,'created_at',m.created_at,'posted_at',m.posted_at,
      'reversed_at',m.reversed_at,'reversal_reason',m.reversal_reason,
      'reversal_journal_entry_number',rj.entry_number::text,'reversal_journal_status',rj.status),
    'customer',pg_catalog.jsonb_build_object('id',c.id,
      'name',COALESCE(NULLIF(pg_catalog.btrim(c.business_name),''),NULLIF(pg_catalog.btrim(c.contact_name),''),c.id::text),
      'contact_name',NULLIF(pg_catalog.btrim(c.contact_name),'')),
    'invoice',pg_catalog.jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'currency',i.currency,
      'issued_at',i.issued_at,'subtotal',i.subtotal,'tax_amount',i.tax_amount,'total_amount',i.total_amount,
      'order_number',o.order_number),
    'return_request',pg_catalog.jsonb_build_object('id',rr.id,'request_number',rr.request_number,
      'status',rr.status,'created_at',rr.created_at),
    'journal',pg_catalog.jsonb_build_object('id',je.id,'entry_number',je.entry_number::text,
      'status',je.status,'entry_date',je.entry_date),
    'lines',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',mi.id,'item_code',mi.item_code_snapshot,'description',mi.description_snapshot,'unit',mi.unit_snapshot,
        'returned_quantity',mi.returned_quantity,'credited_subtotal',mi.credited_subtotal,
        'invoice_quantity',cii.quantity,'invoice_unit_price',cii.unit_price,'invoice_line_total',cii.line_total
      ) ORDER BY mi.created_at,mi.id)
      FROM public.customer_return_credit_memo_items mi
      JOIN public.customer_invoice_items cii ON cii.id=mi.invoice_item_id
       AND cii.organization_id=mi.organization_id AND cii.invoice_id=i.id
      WHERE mi.organization_id=v_org AND mi.credit_memo_id=m.id
    ),'[]'::jsonb)
  ) INTO v_result
  FROM public.customer_return_credit_memos m
  JOIN public.customers c ON c.id=m.customer_id AND c.organization_id=m.organization_id
  JOIN public.customer_invoices i ON i.id=m.invoice_id AND i.organization_id=m.organization_id
  JOIN public.orders o ON o.id=i.order_id AND o.organization_id=i.organization_id
  JOIN public.customer_return_requests rr ON rr.id=m.return_request_id AND rr.organization_id=m.organization_id
  JOIN public.accounting_return_credit_memo_postings sp ON sp.credit_memo_id=m.id AND sp.organization_id=m.organization_id
  JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
  LEFT JOIN public.accounting_return_credit_memo_reversals rv
    ON rv.organization_id=m.organization_id AND rv.credit_memo_id=m.id
  LEFT JOIN public.accounting_journal_entries rj
    ON rj.id=rv.reversal_journal_entry_id AND rj.organization_id=rv.organization_id
  WHERE m.id=v_memo.id AND m.organization_id=v_org AND m.status IN ('draft','posted','reversed');
  IF v_result IS NULL OR pg_catalog.jsonb_array_length(COALESCE(v_result->'lines','[]'::jsonb))<>v_line_count THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo source line details are incomplete; printing was denied';
  END IF;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_customer_return_credit_memo_pdf(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_return_credit_memo_pdf(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_customer_return_credit_memo_pdf(uuid) IS
  'Finance-only tenant-scoped read model for printing the source invoice, return and linked journal details of a credit memo.';

COMMIT;
