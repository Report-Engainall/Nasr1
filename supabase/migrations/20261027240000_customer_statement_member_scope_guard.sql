-- AGH-CUSTOMER-STATEMENT-MEMBER-SCOPE-001
-- Restore the customer_company_memberships capability contract lost by the credit-memo parity replacement.
-- Finance members may read only their active tenant customer statement; buyer/viewer members are denied.
-- Lock the exact customer row and re-check capability after wait so an in-flight statement cannot outlive revocation.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_account_statement()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
  v_org uuid;
  v_target_customer uuid;
  v_invoices jsonb;
  v_payments jsonb;
  v_credits jsonb;
  v_summary jsonb;
  v_summary_as_of_utc timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id=v_profile
       AND p.auth_user_id=auth.uid()
       AND p.is_active
       AND p.organization_id=public.current_organization_id()
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated active customer required for account statement';
  END IF;

  IF NOT public.current_customer_can('statement.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='company member is not allowed to read the account statement';
  END IF;

  v_target_customer := public.current_customer_id();
  IF v_target_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account is not linked to the active profile';
  END IF;

  -- Lock the exact tenant-scoped customer row and re-check capability after any wait.
  -- This serializes statement reads with member revocation without widening the data scope.
  SELECT c.id, c.organization_id INTO v_customer, v_org
    FROM public.customers c
   WHERE c.id=v_target_customer
     AND c.organization_id=public.current_organization_id()
     AND c.status='approved'
   FOR SHARE;

  IF v_customer IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account is not linked to the active profile';
  END IF;

  IF NOT public.current_customer_can('statement.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='company member is not allowed to read the account statement';
  END IF;

  -- A posted credit that cannot be reconciled to its original invoice is not safe to
  -- silently omit from the customer's balance. Reversed memos are excluded below.
  IF EXISTS (
    SELECT 1
      FROM public.customer_return_credit_memos cm
      LEFT JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.customer_id=v_customer
       AND cm.status='posted'
       AND (ci.id IS NULL OR cm.currency IS DISTINCT FROM ci.currency)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='posted credit memo source or currency does not reconcile to the customer invoice';
  END IF;

  -- Detail is capped, but each invoice carries a full-ledger payment aggregate
  -- so old payments remain reflected even when omitted from the 500-row payment list.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',i.id,
    'invoice_number',i.invoice_number,
    'order_id',i.order_id,
    'customer_id',i.customer_id,
    'status',i.status,
    'issued_at',i.issued_at,
    'due_at',i.due_at,
    'currency',i.currency,
    'subtotal',i.subtotal,
    'tax_amount',i.tax_amount,
    'total_amount',i.total_amount,
    'paid_amount',i.paid_amount::text,
    'credit_memo_amount',i.credit_memo_amount::text,
    'outstanding_amount',(CASE WHEN i.status='void' THEN 0 ELSE GREATEST(i.total_amount-i.paid_amount-i.credit_memo_amount,0) END)::numeric(15,2)::text
  ) ORDER BY i.issued_at DESC),'[]'::jsonb)
    INTO v_invoices
    FROM (
      SELECT ci.*,
             COALESCE(payments_by_invoice.paid_amount,0) AS paid_amount,
             COALESCE(credits_by_invoice.credited_amount,0) AS credit_memo_amount
        FROM public.customer_invoices ci
        LEFT JOIN (
          SELECT cp.invoice_id, SUM(cp.amount) AS paid_amount
            FROM public.customer_payments cp
           WHERE cp.organization_id=v_org
             AND cp.customer_id=v_customer
           GROUP BY cp.invoice_id
        ) payments_by_invoice ON payments_by_invoice.invoice_id=ci.id
        LEFT JOIN (
          SELECT cm.invoice_id, SUM(cm.total_amount) AS credited_amount
            FROM public.customer_return_credit_memos cm
           WHERE cm.organization_id=v_org
             AND cm.customer_id=v_customer
             AND cm.status='posted'
           GROUP BY cm.invoice_id
        ) credits_by_invoice ON credits_by_invoice.invoice_id=ci.id
       WHERE ci.organization_id=v_org AND ci.customer_id=v_customer
       ORDER BY ci.issued_at DESC, ci.id
       LIMIT 200
    ) i;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',p.id,
    'invoice_id',p.invoice_id,
    'amount',p.amount,
    'paid_at',p.paid_at
  ) ORDER BY p.paid_at DESC),'[]'::jsonb)
    INTO v_payments
    FROM (
      SELECT cp.*
        FROM public.customer_payments cp
       WHERE cp.organization_id=v_org AND cp.customer_id=v_customer
       ORDER BY cp.paid_at DESC, cp.id
       LIMIT 500
    ) p;

  -- Credit detail is separately bounded; the financial summary below is full-ledger.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',m.id,
    'invoice_id',m.invoice_id,
    'invoice_number',m.invoice_number,
    'memo_number',m.memo_number,
    'currency',m.currency,
    'total_amount',m.total_amount::text,
    'posted_at',m.posted_at
  ) ORDER BY m.posted_at DESC,m.id),'[]'::jsonb)
    INTO v_credits
    FROM (
      SELECT cm.*,ci.invoice_number
        FROM public.customer_return_credit_memos cm
        JOIN public.customer_invoices ci
          ON ci.id=cm.invoice_id
         AND ci.organization_id=cm.organization_id
         AND ci.customer_id=cm.customer_id
       WHERE cm.organization_id=v_org
         AND cm.customer_id=v_customer
         AND cm.status='posted'
       ORDER BY cm.posted_at DESC,cm.id
       LIMIT 500
    ) m;

  WITH payments_by_invoice AS (
    SELECT cp.invoice_id, SUM(cp.amount) AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id=v_org
       AND cp.customer_id=v_customer
     GROUP BY cp.invoice_id
  ),
  credits_by_invoice AS (
    SELECT cm.invoice_id, SUM(cm.total_amount) AS credited_amount
      FROM public.customer_return_credit_memos cm
      JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.customer_id=v_customer
       AND cm.status='posted'
       AND cm.currency=ci.currency
     GROUP BY cm.invoice_id
  ),
  invoice_balances AS (
    SELECT
      ci.currency,
      ci.due_at,
      ci.total_amount AS invoiced_amount,
      COALESCE(pbi.paid_amount,0) AS paid_amount,
      COALESCE(cbi.credited_amount,0) AS credited_amount,
      GREATEST(ci.total_amount-COALESCE(pbi.paid_amount,0)-COALESCE(cbi.credited_amount,0),0) AS outstanding_amount
    FROM public.customer_invoices ci
    LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id=ci.id
    LEFT JOIN credits_by_invoice cbi ON cbi.invoice_id=ci.id
    WHERE ci.organization_id=v_org
      AND ci.customer_id=v_customer
      AND ci.status <> 'void'
  ),
  summary_by_currency AS (
    SELECT
      ib.currency,
      COALESCE(SUM(ib.invoiced_amount),0) AS invoiced,
      COALESCE(SUM(ib.paid_amount),0) AS paid,
      COALESCE(SUM(ib.credited_amount),0) AS credited,
      COALESCE(SUM(ib.outstanding_amount),0) AS outstanding,
      COUNT(*) FILTER (
        WHERE ib.outstanding_amount > 0 AND ib.due_at IS NOT NULL AND (ib.due_at AT TIME ZONE 'UTC')::date < (v_summary_as_of_utc AT TIME ZONE 'UTC')::date
      )::integer AS overdue_invoice_count,
      COALESCE(SUM(ib.outstanding_amount) FILTER (
        WHERE ib.outstanding_amount > 0 AND ib.due_at IS NOT NULL AND (ib.due_at AT TIME ZONE 'UTC')::date < (v_summary_as_of_utc AT TIME ZONE 'UTC')::date
      ),0) AS overdue_outstanding,
      COUNT(*) FILTER (
        WHERE ib.outstanding_amount > 0 AND ib.due_at IS NULL
      )::integer AS unknown_due_date_invoice_count,
      COALESCE(SUM(ib.outstanding_amount) FILTER (
        WHERE ib.outstanding_amount > 0 AND ib.due_at IS NULL
      ),0) AS unknown_due_date_outstanding
    FROM invoice_balances ib
    GROUP BY ib.currency
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',s.currency,
    'invoiced',s.invoiced::text,
    'paid',s.paid::text,
    'credited',s.credited::text,
    'outstanding',s.outstanding::text,
    'overdue_invoice_count',s.overdue_invoice_count,
    'overdue_outstanding',s.overdue_outstanding::text,
    'unknown_due_date_invoice_count',s.unknown_due_date_invoice_count,
    'unknown_due_date_outstanding',s.unknown_due_date_outstanding::text
  ) ORDER BY s.currency),'[]'::jsonb)
    INTO v_summary
    FROM summary_by_currency s;

  RETURN pg_catalog.jsonb_build_object(
    'invoices',v_invoices,
    'payments',v_payments,
    'credits',v_credits,
    'summary_as_of_utc',v_summary_as_of_utc,
    'summary',v_summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_account_statement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_account_statement() TO authenticated;
COMMENT ON FUNCTION public.get_customer_account_statement() IS
  'Returns only the active tenant customer statement for owner or authorized finance members; revalidates statement.read after acquiring a customer-row share lock and includes full-ledger invoice/payment/posted-credit balances with bounded details.';

COMMIT;
