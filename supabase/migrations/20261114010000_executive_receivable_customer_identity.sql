-- NASR1-FINANCE-RECEIVABLE-IDENTITY-001
-- Group receivables by immutable customer UUID, not mutable/non-unique display names.
-- Exclude cross-tenant invoice/customer references and report them as unresolved.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_executive_receivable_customer_aging()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_now timestamptz := pg_catalog.transaction_timestamp();
  v_today date;
  v_items jsonb := '[]'::jsonb;
  v_total_groups integer := 0;
  v_unresolved integer := 0;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for customer receivable ageing';
  END IF;
  v_today := (v_now AT TIME ZONE 'UTC')::date;

  -- Posted credits reduce receivables only when the full source identity and currency reconcile.
  -- A malformed posted source must fail closed rather than disappear from the report.
  IF EXISTS (
    SELECT 1
      FROM public.customer_return_credit_memos cm
      LEFT JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
     WHERE cm.organization_id=v_org
       AND cm.status='posted'
       AND (
         ci.id IS NULL
         OR ci.customer_id IS DISTINCT FROM cm.customer_id
         OR ci.currency IS DISTINCT FROM cm.currency
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='posted credit memo source, customer or currency does not reconcile to the receivables invoice';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_unresolved
    FROM public.customer_invoices i
   WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid') AND i.issued_at<=v_now
     AND i.total_amount>coalesce((
       SELECT pg_catalog.sum(p.amount) FROM public.customer_payments p
        WHERE p.organization_id=v_org AND p.invoice_id=i.id AND p.paid_at<=v_now
     ),0)+coalesce((
       SELECT pg_catalog.sum(cm.total_amount) FROM public.customer_return_credit_memos cm
        WHERE cm.organization_id=v_org AND cm.invoice_id=i.id AND cm.customer_id=i.customer_id
          AND cm.status='posted' AND cm.posted_at<=v_now AND cm.currency=i.currency
     ),0)
     AND (pg_catalog.upper(coalesce(i.currency,'')) !~ '^[A-Z]{3}$'
       OR NOT EXISTS (SELECT 1 FROM public.customers owner_customer
         WHERE owner_customer.id=i.customer_id AND owner_customer.organization_id=i.organization_id
           AND coalesce(nullif(pg_catalog.btrim(owner_customer.business_name),''),nullif(pg_catalog.btrim(owner_customer.contact_name),'')) IS NOT NULL) OR i.due_at IS NULL);

  WITH paid AS (
    SELECT p.invoice_id,pg_catalog.sum(p.amount)::numeric(18,2) AS paid_amount,
           pg_catalog.array_agg('customer-payment:'||p.id::text ORDER BY p.paid_at,p.id) AS payment_evidence
      FROM public.customer_payments p
     WHERE p.organization_id=v_org AND p.paid_at<=v_now
     GROUP BY p.invoice_id
  ),
  credits AS (
    SELECT cm.invoice_id,
           pg_catalog.sum(cm.total_amount)::numeric(18,2) AS credited_amount,
           pg_catalog.array_agg('customer-return-credit-memo:'||cm.id::text ORDER BY cm.id) AS credit_evidence
      FROM public.customer_return_credit_memos cm
      JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.status='posted'
       AND cm.posted_at<=v_now
       AND cm.currency=ci.currency
     GROUP BY cm.invoice_id
  ),
  balances AS (
    SELECT i.id,i.customer_id,coalesce(nullif(pg_catalog.btrim(owner_customer.business_name),''),nullif(pg_catalog.btrim(owner_customer.contact_name),'')) AS customer_name,
           pg_catalog.upper(coalesce(i.currency,'')) AS currency,i.due_at,
           greatest(i.total_amount-coalesce(p.paid_amount,0)-coalesce(c.credited_amount,0),0)::numeric(18,2) AS outstanding,
           coalesce(p.paid_amount,0)::numeric(18,2) AS paid_amount,
           coalesce(p.payment_evidence,ARRAY[]::text[]) AS payment_evidence,
           coalesce(c.credit_evidence,ARRAY[]::text[]) AS credit_evidence,
           CASE
             WHEN i.due_at IS NULL THEN 'UNKNOWN_DUE_DATE'
             WHEN (i.due_at AT TIME ZONE 'UTC')::date>=v_today THEN 'NOT_DUE'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=30 THEN 'OVERDUE_1_30'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=60 THEN 'OVERDUE_31_60'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=90 THEN 'OVERDUE_61_90'
             ELSE 'OVERDUE_90_PLUS'
           END AS aging_bucket,
           CASE WHEN i.due_at IS NULL THEN NULL ELSE greatest(v_today-(i.due_at AT TIME ZONE 'UTC')::date,0) END AS age_days
      FROM public.customer_invoices i
      JOIN public.customers owner_customer ON owner_customer.id=i.customer_id AND owner_customer.organization_id=i.organization_id
      LEFT JOIN paid p ON p.invoice_id=i.id
      LEFT JOIN credits c ON c.invoice_id=i.id
     WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid')
       AND i.issued_at<=v_now AND i.total_amount>coalesce(p.paid_amount,0)+coalesce(c.credited_amount,0)
  ),
  valid_balances AS (SELECT * FROM balances WHERE currency ~ '^[A-Z]{3}$'),
  bucket_totals AS (
    SELECT b.customer_id,b.currency,b.aging_bucket,pg_catalog.max(b.customer_name) AS customer_name,
           pg_catalog.count(*)::integer AS invoice_count,
           pg_catalog.sum(b.outstanding)::numeric(18,2) AS amount,
           pg_catalog.count(*) FILTER(WHERE b.paid_amount>0)::integer AS partially_paid_count,
           max(b.age_days)::integer AS oldest_age_days,
           (pg_catalog.array_agg('customer-invoice:'||b.id::text ORDER BY b.id))[1:25] AS invoice_evidence,
           coalesce((
             SELECT (pg_catalog.array_agg(DISTINCT x.evidence_id ORDER BY x.evidence_id))[1:25]
               FROM valid_balances vb
               CROSS JOIN LATERAL pg_catalog.unnest(vb.payment_evidence) AS x(evidence_id)
              WHERE vb.customer_id=b.customer_id
                AND vb.currency=b.currency AND vb.aging_bucket=b.aging_bucket
           ),ARRAY[]::text[]) AS payment_evidence,
           coalesce((
             SELECT (pg_catalog.array_agg(DISTINCT x.evidence_id ORDER BY x.evidence_id))[1:25]
               FROM valid_balances vb
               CROSS JOIN LATERAL pg_catalog.unnest(vb.credit_evidence) AS x(evidence_id)
              WHERE vb.customer_id=b.customer_id
                AND vb.currency=b.currency AND vb.aging_bucket=b.aging_bucket
           ),ARRAY[]::text[]) AS credit_evidence
      FROM valid_balances b GROUP BY b.customer_id,b.currency,b.aging_bucket
  ),
  customer_totals AS (
    SELECT b.customer_id,pg_catalog.max(b.customer_name) AS customer_name,b.currency,pg_catalog.sum(b.amount)::numeric(18,2) AS total_outstanding,
           coalesce(pg_catalog.sum(b.amount) FILTER(WHERE b.aging_bucket LIKE 'OVERDUE_%'),0)::numeric(18,2) AS overdue_amount,
           pg_catalog.sum(b.invoice_count)::integer AS invoice_count,
           pg_catalog.sum(b.partially_paid_count)::integer AS partially_paid_count,
           max(b.oldest_age_days)::integer AS oldest_age_days,
           pg_catalog.bool_or(b.aging_bucket='UNKNOWN_DUE_DATE') AS has_unknown_due_date
      FROM bucket_totals b GROUP BY b.customer_id,b.currency
  )
  SELECT pg_catalog.count(*)::integer INTO v_total_groups FROM customer_totals;

  WITH paid AS (
    SELECT p.invoice_id,pg_catalog.sum(p.amount)::numeric(18,2) AS paid_amount,
           pg_catalog.array_agg('customer-payment:'||p.id::text ORDER BY p.paid_at,p.id) AS payment_evidence
      FROM public.customer_payments p
     WHERE p.organization_id=v_org AND p.paid_at<=v_now GROUP BY p.invoice_id
  ),
  credits AS (
    SELECT cm.invoice_id,
           pg_catalog.sum(cm.total_amount)::numeric(18,2) AS credited_amount,
           pg_catalog.array_agg('customer-return-credit-memo:'||cm.id::text ORDER BY cm.id) AS credit_evidence
      FROM public.customer_return_credit_memos cm
      JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.status='posted'
       AND cm.posted_at<=v_now
       AND cm.currency=ci.currency
     GROUP BY cm.invoice_id
  ),
  balances AS (
    SELECT i.id,i.customer_id,coalesce(nullif(pg_catalog.btrim(owner_customer.business_name),''),nullif(pg_catalog.btrim(owner_customer.contact_name),'')) AS customer_name,
           pg_catalog.upper(coalesce(i.currency,'')) AS currency,i.due_at,
           greatest(i.total_amount-coalesce(p.paid_amount,0)-coalesce(c.credited_amount,0),0)::numeric(18,2) AS outstanding,
           coalesce(p.paid_amount,0)::numeric(18,2) AS paid_amount,
           coalesce(p.payment_evidence,ARRAY[]::text[]) AS payment_evidence,
           coalesce(c.credit_evidence,ARRAY[]::text[]) AS credit_evidence,
           CASE
             WHEN i.due_at IS NULL THEN 'UNKNOWN_DUE_DATE'
             WHEN (i.due_at AT TIME ZONE 'UTC')::date>=v_today THEN 'NOT_DUE'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=30 THEN 'OVERDUE_1_30'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=60 THEN 'OVERDUE_31_60'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=90 THEN 'OVERDUE_61_90'
             ELSE 'OVERDUE_90_PLUS'
           END AS aging_bucket,
           CASE WHEN i.due_at IS NULL THEN NULL ELSE greatest(v_today-(i.due_at AT TIME ZONE 'UTC')::date,0) END AS age_days
      FROM public.customer_invoices i
      JOIN public.customers owner_customer ON owner_customer.id=i.customer_id AND owner_customer.organization_id=i.organization_id
      LEFT JOIN paid p ON p.invoice_id=i.id
      LEFT JOIN credits c ON c.invoice_id=i.id
     WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid')
       AND i.issued_at<=v_now AND i.total_amount>coalesce(p.paid_amount,0)+coalesce(c.credited_amount,0)
  ),
  valid_balances AS (SELECT * FROM balances WHERE currency ~ '^[A-Z]{3}$'),
  bucket_totals AS (
    SELECT b.customer_id,b.currency,b.aging_bucket,pg_catalog.max(b.customer_name) AS customer_name,
           pg_catalog.count(*)::integer AS invoice_count,pg_catalog.sum(b.outstanding)::numeric(18,2) AS amount,
           pg_catalog.count(*) FILTER(WHERE b.paid_amount>0)::integer AS partially_paid_count,
           max(b.age_days)::integer AS oldest_age_days,
           (pg_catalog.array_agg('customer-invoice:'||b.id::text ORDER BY b.id))[1:25] AS invoice_evidence,
           coalesce((
             SELECT (pg_catalog.array_agg(DISTINCT x.evidence_id ORDER BY x.evidence_id))[1:25]
               FROM valid_balances vb
               CROSS JOIN LATERAL pg_catalog.unnest(vb.payment_evidence) AS x(evidence_id)
              WHERE vb.customer_id=b.customer_id
                AND vb.currency=b.currency AND vb.aging_bucket=b.aging_bucket
           ),ARRAY[]::text[]) AS payment_evidence,
           coalesce((
             SELECT (pg_catalog.array_agg(DISTINCT x.evidence_id ORDER BY x.evidence_id))[1:25]
               FROM valid_balances vb
               CROSS JOIN LATERAL pg_catalog.unnest(vb.credit_evidence) AS x(evidence_id)
              WHERE vb.customer_id=b.customer_id
                AND vb.currency=b.currency AND vb.aging_bucket=b.aging_bucket
           ),ARRAY[]::text[]) AS credit_evidence
      FROM valid_balances b GROUP BY b.customer_id,b.currency,b.aging_bucket
  ),
  customer_totals AS (
    SELECT b.customer_id,pg_catalog.max(b.customer_name) AS customer_name,b.currency,pg_catalog.sum(b.amount)::numeric(18,2) AS total_outstanding,
           coalesce(pg_catalog.sum(b.amount) FILTER(WHERE b.aging_bucket LIKE 'OVERDUE_%'),0)::numeric(18,2) AS overdue_amount,
           pg_catalog.sum(b.invoice_count)::integer AS invoice_count,
           pg_catalog.sum(b.partially_paid_count)::integer AS partially_paid_count,
           max(b.oldest_age_days)::integer AS oldest_age_days,
           pg_catalog.bool_or(b.aging_bucket='UNKNOWN_DUE_DATE') AS has_unknown_due_date
      FROM bucket_totals b GROUP BY b.customer_id,b.currency
  )
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'customerId',t.customer_id,
      'customerName',coalesce(t.customer_name,'عميل غير محدد'),
      'customerNameStatus',CASE WHEN t.customer_name IS NULL THEN 'NEEDS_REVIEW' ELSE 'VERIFIED' END,
      'currency',t.currency,'totalOutstanding',t.total_outstanding::text,
      'overdueAmount',t.overdue_amount::text,'invoiceCount',t.invoice_count,
      'partiallyPaidCount',t.partially_paid_count,'oldestAgeDays',t.oldest_age_days,
      'status',CASE WHEN t.customer_name IS NULL OR t.has_unknown_due_date THEN 'NEEDS_REVIEW' ELSE 'VERIFIED' END,
      'agingBuckets',(
        SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'bucket',b.aging_bucket,'amount',b.amount::text,'invoiceCount',b.invoice_count,
          'partiallyPaidCount',b.partially_paid_count,'oldestAgeDays',b.oldest_age_days,
          'evidenceIds',to_jsonb(b.invoice_evidence||b.payment_evidence||b.credit_evidence)
        ) ORDER BY CASE b.aging_bucket
          WHEN 'NOT_DUE' THEN 0 WHEN 'OVERDUE_1_30' THEN 1 WHEN 'OVERDUE_31_60' THEN 2
          WHEN 'OVERDUE_61_90' THEN 3 WHEN 'OVERDUE_90_PLUS' THEN 4 ELSE 5 END),'[]'::jsonb)
          FROM bucket_totals b WHERE b.customer_id=t.customer_id AND b.currency=t.currency
      ),
      'asOf',v_now,'formulaId','receivables.customer-invoice-aging','formulaVersion','1.0.0',
      'calculatedAt',v_now,
      'warnings',CASE WHEN t.customer_name IS NULL THEN pg_catalog.jsonb_build_array('اسم العميل غير مثبت في مستند الفاتورة.')
        WHEN t.has_unknown_due_date THEN pg_catalog.jsonb_build_array('توجد فواتير مفتوحة بلا تاريخ استحقاق؛ عُرضت ضمن غير محدد.')
        ELSE '[]'::jsonb END
    ) ORDER BY t.currency,coalesce(t.overdue_amount,0) DESC,coalesce(t.customer_name,''),t.customer_id
  ),'[]'::jsonb) INTO v_items
    FROM (SELECT * FROM customer_totals
          ORDER BY currency,coalesce(overdue_amount,0) DESC,coalesce(customer_name,''),customer_id
          LIMIT 2000) t;

  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN v_unresolved>0 OR v_total_groups>2000 THEN 'PARTIAL' ELSE 'VERIFIED' END,
    'asOf',v_now,'totalGroups',v_total_groups,'returnedGroups',pg_catalog.jsonb_array_length(v_items),
    'unresolvedRows',v_unresolved,'complete',v_unresolved=0 AND v_total_groups<=2000,
    'formulaId','receivables.customer-invoice-aging','formulaVersion','1.0.0',
    'items',v_items,
    'warnings',CASE WHEN v_unresolved>0 OR v_total_groups>2000
      THEN pg_catalog.jsonb_build_array('توجد ذمم غير مكتملة أو تجاوز عدد مجموعات العملاء الحد المعروض؛ التغطية جزئية.')
      ELSE '[]'::jsonb END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_executive_receivable_customer_aging() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_executive_receivable_customer_aging() TO authenticated;

COMMIT;
