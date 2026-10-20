-- Tenant-scoped staff print sources. Customer self-service RPCs remain unchanged.
CREATE OR REPLACE FUNCTION public.get_finance_document_print_options(p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid;
  v_cc bigint; v_ic bigint; v_mc bigint;
  v_customers jsonb; v_invoices jsonb; v_memos jsonb;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to list printable customer documents';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='finance print option limit must be between 1 and 500';
  END IF;
  SELECT count(*) INTO v_cc FROM public.customers c WHERE c.organization_id=v_org;
  SELECT count(*) INTO v_ic FROM public.customer_invoices i WHERE i.organization_id=v_org;
  SELECT count(*) INTO v_mc FROM public.customer_return_credit_memos m WHERE m.organization_id=v_org AND m.status IN ('draft','posted');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'customer_code',c.customer_code,'business_name',c.business_name,'contact_name',c.contact_name)
    ORDER BY c.business_name,c.customer_code,c.id),'[]'::jsonb) INTO v_customers
    FROM (SELECT c.id,c.customer_code,c.business_name,c.contact_name FROM public.customers c
      WHERE c.organization_id=v_org ORDER BY c.business_name,c.customer_code,c.id LIMIT p_limit) c;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'customer_id',i.customer_id,
    'customer_name',COALESCE(NULLIF(btrim(c.business_name),''),NULLIF(btrim(c.contact_name),''),i.customer_id::text),
    'status',i.status,'issued_at',i.issued_at,'currency',i.currency) ORDER BY i.issued_at DESC,i.id),'[]'::jsonb) INTO v_invoices
    FROM (SELECT i.id,i.invoice_number,i.customer_id,i.status,i.issued_at,i.currency FROM public.customer_invoices i
      WHERE i.organization_id=v_org ORDER BY i.issued_at DESC,i.id LIMIT p_limit) i
    JOIN public.customers c ON c.id=i.customer_id AND c.organization_id=v_org;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'memo_number',m.memo_number,'customer_id',m.customer_id,
    'customer_name',COALESCE(NULLIF(btrim(c.business_name),''),NULLIF(btrim(c.contact_name),''),m.customer_id::text),
    'invoice_number',i.invoice_number,'status',m.status,'created_at',m.created_at,'currency',m.currency,'total_amount',m.total_amount::text)
    ORDER BY m.created_at DESC,m.id),'[]'::jsonb) INTO v_memos
    FROM (SELECT m.id,m.memo_number,m.customer_id,m.invoice_id,m.status,m.created_at,m.currency,m.total_amount
      FROM public.customer_return_credit_memos m WHERE m.organization_id=v_org AND m.status IN ('draft','posted')
      ORDER BY m.created_at DESC,m.id LIMIT p_limit) m
    JOIN public.customers c ON c.id=m.customer_id AND c.organization_id=v_org
    JOIN public.customer_invoices i ON i.id=m.invoice_id AND i.organization_id=v_org;
  RETURN jsonb_build_object('customers',v_customers,'customers_has_more',v_cc>p_limit,
    'invoices',v_invoices,'invoices_has_more',v_ic>p_limit,'credit_memos',v_memos,'credit_memos_has_more',v_mc>p_limit,'limit',p_limit);
END;$function$;

CREATE OR REPLACE FUNCTION public.get_staff_customer_invoice_print_data(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_invoice public.customer_invoices%ROWTYPE;
  v_customer jsonb; v_lines jsonb; v_count integer; v_subtotal numeric(15,2);
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to print a customer invoice';
  END IF;
  IF p_invoice_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice id is required'; END IF;
  SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=p_invoice_id AND i.organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='invoice was not found in the active organization'; END IF;
  IF v_invoice.subtotal IS NULL OR v_invoice.tax_amount IS NULL OR v_invoice.total_amount IS NULL
     OR v_invoice.subtotal<0 OR v_invoice.tax_amount<0
     OR round(v_invoice.subtotal+v_invoice.tax_amount,2) IS DISTINCT FROM v_invoice.total_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice subtotal, tax and total do not reconcile; printing was denied';
  END IF;
  SELECT count(*)::integer,COALESCE(sum(li.line_total),0)::numeric(15,2) INTO v_count,v_subtotal
    FROM public.customer_invoice_items li WHERE li.invoice_id=v_invoice.id AND li.organization_id=v_org;
  IF v_count<1 OR v_count>500 OR v_subtotal IS DISTINCT FROM v_invoice.subtotal THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice lines are incomplete or do not reconcile with the stored subtotal';
  END IF;
  SELECT jsonb_build_object('id',c.id,'customer_code',c.customer_code,'business_name',c.business_name,'contact_name',c.contact_name)
    INTO v_customer FROM public.customers c WHERE c.id=v_invoice.customer_id AND c.organization_id=v_org;
  IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='invoice customer was not found in the active organization'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',li.id,'item_code',li.item_code,'description',li.description,'unit',li.unit,
    'quantity',li.quantity::text,'unit_price',li.unit_price::text,'line_total',li.line_total::text) ORDER BY li.created_at,li.id),'[]'::jsonb)
    INTO v_lines FROM public.customer_invoice_items li WHERE li.invoice_id=v_invoice.id AND li.organization_id=v_org;
  RETURN jsonb_build_object('invoice',jsonb_build_object('id',v_invoice.id,'invoice_number',v_invoice.invoice_number,'status',v_invoice.status,
    'issued_at',v_invoice.issued_at,'due_at',v_invoice.due_at,'currency',v_invoice.currency,'subtotal',v_invoice.subtotal::text,
    'tax_amount',v_invoice.tax_amount::text,'total_amount',v_invoice.total_amount::text),'customer',v_customer,'lines',v_lines);
END;$function$;

CREATE OR REPLACE FUNCTION public.get_staff_customer_account_statement(p_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_customer public.customers%ROWTYPE;
  v_invoices jsonb; v_payments jsonb; v_credits jsonb; v_summary jsonb;
  v_asof timestamptz:=pg_catalog.clock_timestamp(); v_ic bigint; v_pc bigint; v_mc bigint;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to print a customer account statement';
  END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer id is required'; END IF;
  SELECT c.* INTO v_customer FROM public.customers c WHERE c.id=p_customer_id AND c.organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='customer was not found in the active organization'; END IF;
  SELECT count(*) INTO v_ic FROM public.customer_invoices i WHERE i.organization_id=v_org AND i.customer_id=v_customer.id;
  SELECT count(*) INTO v_pc FROM public.customer_payments p WHERE p.organization_id=v_org AND p.customer_id=v_customer.id;
  SELECT count(*) INTO v_mc FROM public.customer_return_credit_memos m WHERE m.organization_id=v_org AND m.customer_id=v_customer.id AND m.status='posted';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'status',i.status,'issued_at',i.issued_at,
    'due_at',i.due_at,'currency',i.currency,'subtotal',i.subtotal::text,'tax_amount',i.tax_amount::text,'total_amount',i.total_amount::text,
    'paid_amount',i.paid_amount::text,'credit_memo_amount',i.credit_memo_amount::text,
    'outstanding_amount',(CASE WHEN i.status='void' THEN 0 ELSE GREATEST(i.total_amount-i.paid_amount-i.credit_memo_amount,0) END)::numeric(15,2)::text)
    ORDER BY i.issued_at DESC,i.id),'[]'::jsonb) INTO v_invoices
    FROM (SELECT ci.*,COALESCE(pb.paid,0)::numeric(15,2) AS paid_amount,COALESCE(cb.credited,0)::numeric(15,2) AS credit_memo_amount
      FROM public.customer_invoices ci
      LEFT JOIN (SELECT cp.invoice_id,sum(cp.amount)::numeric(15,2) AS paid FROM public.customer_payments cp
        WHERE cp.organization_id=v_org AND cp.customer_id=v_customer.id GROUP BY cp.invoice_id) pb ON pb.invoice_id=ci.id
      LEFT JOIN (SELECT cm.invoice_id,sum(cm.total_amount)::numeric(15,2) AS credited FROM public.customer_return_credit_memos cm
        WHERE cm.organization_id=v_org AND cm.customer_id=v_customer.id AND cm.status='posted' GROUP BY cm.invoice_id) cb ON cb.invoice_id=ci.id
      WHERE ci.organization_id=v_org AND ci.customer_id=v_customer.id ORDER BY ci.issued_at DESC,ci.id LIMIT 200) i;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',p.invoice_id,'invoice_number',ci.invoice_number,
    'currency',ci.currency,'amount',p.amount::text,'paid_at',p.paid_at,'payment_method',p.payment_method,'reference',p.reference)
    ORDER BY p.paid_at DESC,p.id),'[]'::jsonb) INTO v_payments
    FROM (SELECT cp.* FROM public.customer_payments cp WHERE cp.organization_id=v_org AND cp.customer_id=v_customer.id
      ORDER BY cp.paid_at DESC,cp.id LIMIT 500) p
    JOIN public.customer_invoices ci ON ci.id=p.invoice_id AND ci.organization_id=v_org AND ci.customer_id=v_customer.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'memo_number',m.memo_number,'invoice_id',m.invoice_id,
    'invoice_number',i.invoice_number,'currency',m.currency,'subtotal_amount',m.subtotal_amount::text,'tax_amount',m.tax_amount::text,
    'total_amount',m.total_amount::text,'created_at',m.created_at,'posted_at',m.posted_at) ORDER BY m.posted_at DESC,m.id),'[]'::jsonb)
    INTO v_credits FROM (SELECT cm.* FROM public.customer_return_credit_memos cm
      WHERE cm.organization_id=v_org AND cm.customer_id=v_customer.id AND cm.status='posted'
      ORDER BY cm.posted_at DESC,cm.id LIMIT 500) m
    JOIN public.customer_invoices i ON i.id=m.invoice_id AND i.organization_id=v_org;

  WITH pb AS (SELECT cp.invoice_id,sum(cp.amount)::numeric(15,2) AS paid FROM public.customer_payments cp
      WHERE cp.organization_id=v_org AND cp.customer_id=v_customer.id GROUP BY cp.invoice_id),
    cb AS (SELECT cm.invoice_id,sum(cm.total_amount)::numeric(15,2) AS credited FROM public.customer_return_credit_memos cm
      WHERE cm.organization_id=v_org AND cm.customer_id=v_customer.id AND cm.status='posted' GROUP BY cm.invoice_id),
    balances AS (SELECT ci.currency,ci.due_at,ci.total_amount AS invoiced,COALESCE(pb.paid,0) AS paid,
      COALESCE(cb.credited,0) AS credited,GREATEST(ci.total_amount-COALESCE(pb.paid,0)-COALESCE(cb.credited,0),0)::numeric(15,2) AS outstanding
      FROM public.customer_invoices ci LEFT JOIN pb ON pb.invoice_id=ci.id LEFT JOIN cb ON cb.invoice_id=ci.id
      WHERE ci.organization_id=v_org AND ci.customer_id=v_customer.id AND ci.status<>'void'),
    sums AS (SELECT b.currency,COALESCE(sum(b.invoiced),0)::numeric(15,2) AS invoiced,
      COALESCE(sum(b.paid),0)::numeric(15,2) AS paid,COALESCE(sum(b.credited),0)::numeric(15,2) AS credited,
      COALESCE(sum(b.outstanding),0)::numeric(15,2) AS outstanding,
      count(*) FILTER(WHERE b.outstanding>0 AND b.due_at IS NOT NULL AND (b.due_at AT TIME ZONE 'UTC')::date<(v_asof AT TIME ZONE 'UTC')::date)::integer AS overdue_count,
      COALESCE(sum(b.outstanding) FILTER(WHERE b.outstanding>0 AND b.due_at IS NOT NULL AND (b.due_at AT TIME ZONE 'UTC')::date<(v_asof AT TIME ZONE 'UTC')::date),0)::numeric(15,2) AS overdue_amount,
      count(*) FILTER(WHERE b.outstanding>0 AND b.due_at IS NULL)::integer AS unknown_due_count,
      COALESCE(sum(b.outstanding) FILTER(WHERE b.outstanding>0 AND b.due_at IS NULL),0)::numeric(15,2) AS unknown_due_amount
      FROM balances b GROUP BY b.currency)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('currency',s.currency,'invoiced',s.invoiced::text,'paid',s.paid::text,
      'credited',s.credited::text,'outstanding',s.outstanding::text,'overdue_invoice_count',s.overdue_count,
      'overdue_outstanding',s.overdue_amount::text,'unknown_due_date_invoice_count',s.unknown_due_count,
      'unknown_due_date_outstanding',s.unknown_due_amount::text) ORDER BY s.currency),'[]'::jsonb) INTO v_summary FROM sums s;

  RETURN jsonb_build_object('customer',jsonb_build_object('id',v_customer.id,'customer_code',v_customer.customer_code,
      'business_name',v_customer.business_name,'contact_name',v_customer.contact_name),
    'invoices',v_invoices,'payments',v_payments,'credits',v_credits,'summary_as_of_utc',v_asof,'summary',v_summary,
    'truncated',jsonb_build_object('invoices',v_ic>200,'payments',v_pc>500,'credits',v_mc>500));
END;$function$;

REVOKE ALL ON FUNCTION public.get_finance_document_print_options(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_finance_document_print_options(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_staff_customer_invoice_print_data(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_staff_customer_invoice_print_data(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_staff_customer_account_statement(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_staff_customer_account_statement(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_finance_document_print_options(integer) IS 'Tenant-scoped finance print selectors for active admin, manager and accountant profiles.';
COMMENT ON FUNCTION public.get_staff_customer_invoice_print_data(uuid) IS 'Finance-only tenant-scoped invoice print source; validates all line totals against the stored invoice subtotal.';
COMMENT ON FUNCTION public.get_staff_customer_account_statement(uuid) IS 'Finance-only tenant-scoped full-ledger account statement; posted credit memos reduce receivables and detail arrays expose truncation flags.';
