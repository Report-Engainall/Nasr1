-- FIN-INVOICE-001: payment and posted-credit changes share one serialized invoice-balance guard.
-- Finance clients receive authoritative full-ledger amounts; invoice and payment details stay bounded.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_invoice public.customer_invoices%ROWTYPE;
  v_paid numeric(15,2);
  v_credited numeric(15,2);
  v_payment uuid;
  v_method text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method,'')));
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to record customer payments';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization context required';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
     OR p_amount<=0 OR p_amount<>pg_catalog.round(p_amount,2) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='payment amount must be finite, greater than zero, and have at most two decimal places';
  END IF;
  IF v_method NOT IN ('cash','transfer','card','credit_adjustment','other') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid payment method';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice id is required';
  END IF;

  -- Match the credit-posting guard so concurrent financial mutations serialize per invoice.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':customer-invoice-settlement:'||p_invoice_id::text,0)
  );
  -- The invoice-keyed advisory lock serializes payments and credit postings without row-lock inversion.
  SELECT i.* INTO v_invoice
    FROM public.customer_invoices i
   WHERE i.id=p_invoice_id AND i.organization_id=v_org;
  IF NOT FOUND OR v_invoice.status='void' THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='active invoice not found in this organization';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.customer_return_credit_memos cm
      LEFT JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.invoice_id=v_invoice.id
       AND cm.status='posted'
       AND (ci.id IS NULL OR cm.currency IS DISTINCT FROM v_invoice.currency)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='posted credit memo source or currency does not reconcile to the invoice';
  END IF;

  SELECT COALESCE(pg_catalog.sum(cp.amount),0)::numeric(15,2)
    INTO v_paid
    FROM public.customer_payments cp
   WHERE cp.organization_id=v_org AND cp.invoice_id=v_invoice.id AND cp.customer_id=v_invoice.customer_id;
  SELECT COALESCE(pg_catalog.sum(cm.total_amount),0)::numeric(15,2)
    INTO v_credited
    FROM public.customer_return_credit_memos cm
   WHERE cm.organization_id=v_org
     AND cm.invoice_id=v_invoice.id
     AND cm.customer_id=v_invoice.customer_id
     AND cm.status='posted'
     AND cm.currency=v_invoice.currency;
  IF v_paid+v_credited>v_invoice.total_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='recorded payments and posted credits exceed the invoice total; reconcile source records before accepting another payment';
  END IF;
  IF pg_catalog.round(p_amount,2)>v_invoice.total_amount-v_paid-v_credited THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='payment exceeds invoice balance after posted credit memos';
  END IF;

  INSERT INTO public.customer_payments(
    organization_id,customer_id,invoice_id,amount,payment_method,reference,notes,paid_at,created_by
  )
  VALUES(
    v_invoice.organization_id,v_invoice.customer_id,v_invoice.id,pg_catalog.round(p_amount,2),v_method,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_reference,'')),200),''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),1000),''),
    pg_catalog.now(),v_profile
  )
  RETURNING id INTO v_payment;
  RETURN v_payment;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_customer_payment(uuid,numeric,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(uuid,numeric,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_staff_finance_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_invoices jsonb;
  v_payments jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to read finance data';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active finance organization is required';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.customer_return_credit_memos cm
      LEFT JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org AND cm.status='posted'
       AND (ci.id IS NULL OR cm.currency IS DISTINCT FROM ci.currency)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='posted credit memo source or currency does not reconcile to the invoice';
  END IF;

  WITH invoice_page AS (
    SELECT ci.* FROM public.customer_invoices ci
     WHERE ci.organization_id=v_org
     ORDER BY ci.issued_at DESC,ci.id
     LIMIT 500
  ),
  payments_by_invoice AS (
    SELECT cp.invoice_id,pg_catalog.sum(cp.amount)::numeric(15,2) AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id=v_org GROUP BY cp.invoice_id
  ),
  credits_by_invoice AS (
    SELECT cm.invoice_id,pg_catalog.sum(cm.total_amount)::numeric(15,2) AS credit_memo_amount
      FROM public.customer_return_credit_memos cm
      JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id AND ci.organization_id=cm.organization_id AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org AND cm.status='posted' AND cm.currency=ci.currency
     GROUP BY cm.invoice_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',i.id,
    'organization_id',i.organization_id,
    'customer_id',i.customer_id,
    'order_id',i.order_id,
    'invoice_number',i.invoice_number,
    'status',i.status,
    'issued_at',i.issued_at,
    'due_at',i.due_at,
    'currency',i.currency,
    'subtotal',i.subtotal::text,
    'tax_amount',i.tax_amount::text,
    'total_amount',i.total_amount::text,
    'paid_amount',COALESCE(p.paid_amount,0)::numeric(15,2)::text,
    'credit_memo_amount',COALESCE(c.credit_memo_amount,0)::numeric(15,2)::text,
    'outstanding_amount',(CASE WHEN i.status='void' THEN 0
      ELSE GREATEST(i.total_amount-COALESCE(p.paid_amount,0)-COALESCE(c.credit_memo_amount,0),0)
    END)::numeric(15,2)::text
  ) ORDER BY i.issued_at DESC,i.id),'[]'::jsonb)
    INTO v_invoices
    FROM invoice_page i
    LEFT JOIN payments_by_invoice p ON p.invoice_id=i.id
    LEFT JOIN credits_by_invoice c ON c.invoice_id=i.id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',p.id,'organization_id',p.organization_id,'customer_id',p.customer_id,
    'invoice_id',p.invoice_id,'amount',p.amount::text,'paid_at',p.paid_at,'payment_method',p.payment_method
  ) ORDER BY p.paid_at DESC,p.id),'[]'::jsonb)
    INTO v_payments
    FROM (
      SELECT cp.* FROM public.customer_payments cp
       WHERE cp.organization_id=v_org ORDER BY cp.paid_at DESC,cp.id LIMIT 1000
    ) p;

  RETURN pg_catalog.jsonb_build_object('invoices',v_invoices,'payments',v_payments);
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_staff_finance_data() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_finance_data() TO authenticated;

CREATE OR REPLACE FUNCTION public.accounting_validate_return_credit_memo_journal_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_post public.accounting_return_credit_memo_postings%ROWTYPE;
  v_memo public.customer_return_credit_memos%ROWTYPE;
  v_invoice public.customer_invoices%ROWTYPE;
  v_line_count integer;
  v_invoice_line_subtotal numeric(15,2);
  v_paid numeric(15,2);
  v_credits numeric(15,2);
BEGIN
  IF NEW.status<>'posted' OR OLD.status IS NOT DISTINCT FROM 'posted'
     OR NEW.source_type<>'customer_return_credit_memo' THEN
    RETURN NEW;
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR v_org<>NEW.organization_id OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to post this credit memo journal';
  END IF;

  SELECT sp.* INTO v_post FROM public.accounting_return_credit_memo_postings sp
   WHERE sp.organization_id=NEW.organization_id AND sp.journal_entry_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo journal has no authoritative source link'; END IF;
  SELECT m.* INTO v_memo FROM public.customer_return_credit_memos m
   WHERE m.organization_id=NEW.organization_id AND m.id=v_post.credit_memo_id FOR UPDATE;
  IF NOT FOUND OR v_memo.status<>'draft' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo is not an active draft'; END IF;
  -- Serialize payment recording and credit posting without inverting invoice/journal row-lock order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':customer-invoice-settlement:'||v_memo.invoice_id::text,0)
  );
  SELECT ci.* INTO v_invoice FROM public.customer_invoices ci
   WHERE ci.organization_id=v_memo.organization_id AND ci.id=v_memo.invoice_id;
  IF NOT FOUND OR v_invoice.status='void' OR v_invoice.currency<>v_memo.currency
     OR v_invoice.total_amount<>v_invoice.subtotal+v_invoice.tax_amount
     OR NEW.source_reference IS DISTINCT FROM v_memo.id::text
     OR v_post.source_amount IS DISTINCT FROM v_memo.total_amount
     OR v_post.source_currency IS DISTINCT FROM v_memo.currency
     OR v_post.payload_fingerprint IS DISTINCT FROM v_memo.payload_fingerprint
     OR NEW.idempotency_key IS DISTINCT FROM v_post.idempotency_key THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo, invoice or source posting no longer reconciles';
  END IF;
  -- Reconcile existing posted credits and payments before this new credit can post.
  IF EXISTS (
    SELECT 1
      FROM public.customer_return_credit_memos cm
      LEFT JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.invoice_id=v_invoice.id
       AND cm.status='posted'
       AND (ci.id IS NULL OR cm.currency IS DISTINCT FROM v_invoice.currency)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='posted credit memo source or currency does not reconcile to the invoice';
  END IF;
  SELECT COALESCE(pg_catalog.sum(cp.amount),0)::numeric(15,2)
    INTO v_paid
    FROM public.customer_payments cp
   WHERE cp.organization_id=v_org
     AND cp.invoice_id=v_invoice.id
     AND cp.customer_id=v_invoice.customer_id;
  SELECT COALESCE(pg_catalog.sum(cm.total_amount),0)::numeric(15,2)
    INTO v_credits
    FROM public.customer_return_credit_memos cm
   WHERE cm.organization_id=v_org
     AND cm.invoice_id=v_invoice.id
     AND cm.customer_id=v_invoice.customer_id
     AND cm.status='posted'
     AND cm.currency=v_invoice.currency;
  IF v_paid+v_credits+v_memo.total_amount>v_invoice.total_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='credit memo exceeds the remaining invoice receivable after payments and posted credits';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.customer_return_requests rr
    WHERE rr.id=v_memo.return_request_id AND rr.organization_id=v_memo.organization_id
      AND rr.customer_id=v_memo.customer_id AND rr.order_id=v_invoice.order_id AND rr.status='received') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo return request is no longer fully received';
  END IF;
  SELECT COALESCE(pg_catalog.sum(ci.line_total),0)::numeric(15,2)
    INTO v_invoice_line_subtotal
    FROM public.customer_invoice_items ci
   WHERE ci.organization_id=v_memo.organization_id AND ci.invoice_id=v_invoice.id;
  IF v_invoice_line_subtotal IS DISTINCT FROM v_invoice.subtotal THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source invoice line totals changed after credit memo preparation';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_line_count
    FROM public.accounting_journal_lines jl
   WHERE jl.organization_id=NEW.organization_id AND jl.journal_entry_id=NEW.id;
  IF v_line_count<>(CASE WHEN v_memo.tax_amount>0 THEN 3 ELSE 2 END) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo journal must contain exactly its source-linked revenue, tax and receivable lines';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines jl
    WHERE jl.organization_id=NEW.organization_id AND jl.journal_entry_id=NEW.id AND jl.line_number=1
      AND jl.account_id=v_post.revenue_account_id AND jl.debit=v_memo.subtotal_amount AND jl.credit=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo revenue line does not match its source amount and account';
  END IF;
  IF v_memo.tax_amount>0 AND NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines jl
    WHERE jl.organization_id=NEW.organization_id AND jl.journal_entry_id=NEW.id AND jl.line_number=2
      AND jl.account_id=v_post.tax_account_id AND jl.debit=v_memo.tax_amount AND jl.credit=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo tax line does not match its source amount and liability account';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines jl
    WHERE jl.organization_id=NEW.organization_id AND jl.journal_entry_id=NEW.id
      AND jl.line_number=CASE WHEN v_memo.tax_amount>0 THEN 3 ELSE 2 END
      AND jl.account_id=v_post.receivable_account_id AND jl.debit=0 AND jl.credit=v_memo.total_amount) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo receivable line does not match its source total and account';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=v_post.revenue_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='revenue')
     OR NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=v_post.receivable_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='asset')
     OR (v_memo.tax_amount>0 AND NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=v_post.tax_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='liability')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo journal accounts are inactive or do not match the required account types';
  END IF;

  UPDATE public.customer_return_credit_memos
     SET status='posted',posted_by_profile_id=v_actor,posted_at=pg_catalog.now()
   WHERE id=v_memo.id AND organization_id=v_org AND status='draft';
  UPDATE public.customers
     SET current_balance=COALESCE(current_balance,0)-v_memo.total_amount,updated_at=pg_catalog.now()
   WHERE id=v_memo.customer_id AND organization_id=v_org;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'accounting.customer_return_credit_memo_posted','customer_return_credit_memo',v_memo.id,
    pg_catalog.jsonb_build_object('status','draft','total_amount',v_memo.total_amount::text),
    pg_catalog.jsonb_build_object('status','posted','journal_entry_id',NEW.id,'entry_number',NEW.entry_number::text,
      'total_amount',v_memo.total_amount::text,'currency',v_memo.currency));
  RETURN NEW;
END;
$function$;

COMMIT;
