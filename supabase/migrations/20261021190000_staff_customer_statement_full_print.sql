-- NASR1-P2-FULL-CUSTOMER-STATEMENT-PRINT-20261021
-- Reuses the existing finance-authorized statement summary and returns all detail rows
-- in one PostgreSQL statement snapshot. Never prints an incomplete ledger.
CREATE OR REPLACE FUNCTION public.get_staff_customer_account_statement_full(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_base jsonb;
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_ic bigint; v_pc bigint; v_mc bigint; v_total bigint;
  v_invoices jsonb; v_payments jsonb; v_credits jsonb;
BEGIN
  v_base:=public.get_staff_customer_account_statement(p_customer_id);

  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance()
     OR NOT EXISTS (SELECT 1 FROM public.user_roles r
       WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','accountant')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to print a complete customer account statement';
  END IF;

  SELECT count(*) INTO v_ic FROM public.customer_invoices i
   WHERE i.organization_id=v_org AND i.customer_id=p_customer_id;
  SELECT count(*) INTO v_pc FROM public.customer_payments p
   WHERE p.organization_id=v_org AND p.customer_id=p_customer_id;
  SELECT count(*) INTO v_mc FROM public.customer_return_credit_memos m
   WHERE m.organization_id=v_org AND m.customer_id=p_customer_id AND m.status='posted';
  v_total:=v_ic+v_pc+v_mc;
  IF v_total>10000 THEN
    RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='customer statement exceeds full-print row limit';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',i.id,'invoice_number',i.invoice_number,'status',i.status,'issued_at',i.issued_at,
    'due_at',i.due_at,'currency',i.currency,'subtotal',i.subtotal::text,'tax_amount',i.tax_amount::text,
    'total_amount',i.total_amount::text,'paid_amount',i.paid_amount::text,'credit_memo_amount',i.credit_memo_amount::text,
    'outstanding_amount',(CASE WHEN i.status='void' THEN 0 ELSE GREATEST(i.total_amount-i.paid_amount-i.credit_memo_amount,0) END)::numeric(15,2)::text
  ) ORDER BY i.issued_at DESC,i.id),'[]'::jsonb) INTO v_invoices
  FROM (
    SELECT ci.*,COALESCE(pb.paid,0)::numeric(15,2) AS paid_amount,
      COALESCE(cb.credited,0)::numeric(15,2) AS credit_memo_amount
    FROM public.customer_invoices ci
    LEFT JOIN (
      SELECT cp.invoice_id,sum(cp.amount)::numeric(15,2) AS paid FROM public.customer_payments cp
      WHERE cp.organization_id=v_org AND cp.customer_id=p_customer_id GROUP BY cp.invoice_id
    ) pb ON pb.invoice_id=ci.id
    LEFT JOIN (
      SELECT cm.invoice_id,sum(cm.total_amount)::numeric(15,2) AS credited FROM public.customer_return_credit_memos cm
      WHERE cm.organization_id=v_org AND cm.customer_id=p_customer_id AND cm.status='posted' GROUP BY cm.invoice_id
    ) cb ON cb.invoice_id=ci.id
    WHERE ci.organization_id=v_org AND ci.customer_id=p_customer_id ORDER BY ci.issued_at DESC,ci.id
  ) i;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',p.id,'invoice_id',p.invoice_id,'invoice_number',i.invoice_number,
    'currency',i.currency,'amount',p.amount::text,'paid_at',p.paid_at,
    'payment_method',p.payment_method,'reference',p.reference
  ) ORDER BY p.paid_at DESC,p.id),'[]'::jsonb) INTO v_payments
  FROM (
    SELECT cp.* FROM public.customer_payments cp
    WHERE cp.organization_id=v_org AND cp.customer_id=p_customer_id ORDER BY cp.paid_at DESC,cp.id
  ) p
  JOIN public.customer_invoices i ON i.id=p.invoice_id AND i.organization_id=v_org AND i.customer_id=p_customer_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'memo_number',m.memo_number,'invoice_id',m.invoice_id,
    'invoice_number',i.invoice_number,'currency',m.currency,'subtotal_amount',m.subtotal_amount::text,
    'tax_amount',m.tax_amount::text,'total_amount',m.total_amount::text,'created_at',m.created_at,'posted_at',m.posted_at
  ) ORDER BY m.posted_at DESC,m.id),'[]'::jsonb) INTO v_credits
  FROM (
    SELECT cm.* FROM public.customer_return_credit_memos cm
    WHERE cm.organization_id=v_org AND cm.customer_id=p_customer_id AND cm.status='posted'
    ORDER BY cm.posted_at DESC,cm.id
  ) m
  JOIN public.customer_invoices i ON i.id=m.invoice_id AND i.organization_id=v_org;

  RETURN v_base || jsonb_build_object(
    'invoices',v_invoices,'payments',v_payments,'credits',v_credits,
    'truncated',jsonb_build_object('invoices',false,'payments',false,'credits',false),
    'record_counts',jsonb_build_object('invoices',v_ic,'payments',v_pc,'credits',v_mc,'total',v_total),
    'full_statement',true
  );
END;$function$;

REVOKE ALL ON FUNCTION public.get_staff_customer_account_statement_full(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_staff_customer_account_statement_full(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_staff_customer_account_statement_full(uuid) IS
  'Finance-only complete customer statement print source. Returns all invoice/payment/posted-credit details up to 10000 total rows; fails closed above the limit instead of printing partial details.';
