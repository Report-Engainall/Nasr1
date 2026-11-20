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
   WHERE m.id=p_credit_memo_id AND m.organization_id=v_org AND m.status IN ('draft','posted');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='credit memo was not found in the active organization or is not printable';
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
      'total_amount',m.total_amount,'created_at',m.created_at,'posted_at',m.posted_at),
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
  WHERE m.id=v_memo.id AND m.organization_id=v_org AND m.status IN ('draft','posted');
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
