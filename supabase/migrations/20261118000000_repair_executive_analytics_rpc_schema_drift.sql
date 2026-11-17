-- Additive compatibility repair for two read-only executive analytics RPCs.
-- Live schema uses order_items.unit_snapshot and customer_invoices.customer_id -> customers.
-- No business rows, prices, inventory, invoice totals or permissions are changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_product_performance_growth_aggregate(
  p_period_days integer DEFAULT 90,
  p_as_of timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_as_of timestamptz:=coalesce(p_as_of,pg_catalog.clock_timestamp());
  v_as_of_date date;
  v_current_from date;
  v_baseline_from date;
  v_current_period jsonb;
  v_baseline_period jsonb;
  v_total_count integer:=0;
  v_returned_count integer:=0;
  v_uncomparable_unit_count integer:=0;
  v_rows jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.organization_id=v_org
          AND p.auth_user_id=auth.uid() AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff permission required for product performance analytics';
  END IF;

  IF p_period_days NOT IN (30,60,90,180,365) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='product performance period must be 30, 60, 90, 180 or 365 days';
  END IF;

  IF v_as_of IS NULL OR v_as_of>v_now+interval '5 minutes'
     OR v_as_of<v_now-interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='product performance as-of time must represent the current snapshot';
  END IF;

  v_as_of_date:=(v_as_of AT TIME ZONE 'UTC')::date;
  v_current_from:=v_as_of_date-(p_period_days-1);
  v_baseline_from:=v_current_from-p_period_days;
  v_current_period:=pg_catalog.jsonb_build_object(
    'from',v_current_from::text,'to',v_as_of_date::text
  );
  v_baseline_period:=pg_catalog.jsonb_build_object(
    'from',v_baseline_from::text,'to',(v_current_from-1)::text
  );

  WITH product_unit_facts AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      pg_catalog.btrim(p.unit) AS product_unit,
      pg_catalog.btrim(oi.unit_snapshot) AS order_unit,
      coalesce(
        pg_catalog.sum(oi.quantity) FILTER (
          WHERE o.created_at >= (v_current_from::timestamp AT TIME ZONE 'UTC')
            AND o.created_at < ((v_as_of_date+1)::timestamp AT TIME ZONE 'UTC')
            AND o.created_at<=v_as_of
        ),0
      )::numeric AS current_quantity,
      coalesce(
        pg_catalog.count(DISTINCT o.id) FILTER (
          WHERE o.created_at >= (v_current_from::timestamp AT TIME ZONE 'UTC')
            AND o.created_at < ((v_as_of_date+1)::timestamp AT TIME ZONE 'UTC')
            AND o.created_at<=v_as_of
        ),0
      )::integer AS current_order_count,
      coalesce(
        pg_catalog.sum(oi.quantity) FILTER (
          WHERE o.created_at >= (v_baseline_from::timestamp AT TIME ZONE 'UTC')
            AND o.created_at < (v_current_from::timestamp AT TIME ZONE 'UTC')
        ),0
      )::numeric AS baseline_quantity,
      coalesce(
        pg_catalog.count(DISTINCT o.id) FILTER (
          WHERE o.created_at >= (v_baseline_from::timestamp AT TIME ZONE 'UTC')
            AND o.created_at < (v_current_from::timestamp AT TIME ZONE 'UTC')
        ),0
      )::integer AS baseline_order_count
    FROM public.order_items oi
    JOIN public.orders o
      ON o.id=oi.order_id
     AND o.organization_id=v_org
     AND o.created_at >= (v_baseline_from::timestamp AT TIME ZONE 'UTC')
     AND o.created_at < ((v_as_of_date+1)::timestamp AT TIME ZONE 'UTC')
     AND o.created_at<=v_as_of
     AND o.status IN ('confirmed','processing','shipped','delivered')
    JOIN public.products p
      ON p.id=oi.product_id
     AND p.organization_id=v_org
     AND p.status='active'
    WHERE oi.product_id IS NOT NULL
      AND oi.quantity>0
      AND pg_catalog.char_length(pg_catalog.btrim(coalesce(oi.unit_snapshot,''))) BETWEEN 1 AND 80
    GROUP BY p.id,p.name,p.unit,pg_catalog.btrim(oi.unit_snapshot)
  ),
  product_unit_counts AS (
    SELECT f.product_id,pg_catalog.count(*)::integer AS unit_variant_count
      FROM product_unit_facts f
     GROUP BY f.product_id
  ),
  eligible AS (
    SELECT f.*,
           u.unit_variant_count,
           (u.unit_variant_count=1 AND f.product_unit=f.order_unit) AS unit_comparable,
           'product-performance:'||f.product_id::text||':'||
             pg_catalog.md5(f.order_unit) AS evidence_id
      FROM product_unit_facts f
      JOIN product_unit_counts u ON u.product_id=f.product_id
  )
  SELECT
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.count(*) FILTER (WHERE NOT e.unit_comparable),0)::integer
    INTO v_total_count,v_uncomparable_unit_count
    FROM eligible e;

  WITH product_unit_facts AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      pg_catalog.btrim(p.unit) AS product_unit,
      pg_catalog.btrim(oi.unit_snapshot) AS order_unit,
      coalesce(pg_catalog.sum(oi.quantity) FILTER (
        WHERE o.created_at >= (v_current_from::timestamp AT TIME ZONE 'UTC')
          AND o.created_at < ((v_as_of_date+1)::timestamp AT TIME ZONE 'UTC')
          AND o.created_at<=v_as_of
      ),0)::numeric AS current_quantity,
      coalesce(pg_catalog.count(DISTINCT o.id) FILTER (
        WHERE o.created_at >= (v_current_from::timestamp AT TIME ZONE 'UTC')
          AND o.created_at < ((v_as_of_date+1)::timestamp AT TIME ZONE 'UTC')
          AND o.created_at<=v_as_of
      ),0)::integer AS current_order_count,
      coalesce(pg_catalog.sum(oi.quantity) FILTER (
        WHERE o.created_at >= (v_baseline_from::timestamp AT TIME ZONE 'UTC')
          AND o.created_at < (v_current_from::timestamp AT TIME ZONE 'UTC')
      ),0)::numeric AS baseline_quantity,
      coalesce(pg_catalog.count(DISTINCT o.id) FILTER (
        WHERE o.created_at >= (v_baseline_from::timestamp AT TIME ZONE 'UTC')
          AND o.created_at < (v_current_from::timestamp AT TIME ZONE 'UTC')
      ),0)::integer AS baseline_order_count
    FROM public.order_items oi
    JOIN public.orders o
      ON o.id=oi.order_id AND o.organization_id=v_org
     AND o.created_at >= (v_baseline_from::timestamp AT TIME ZONE 'UTC')
     AND o.created_at < ((v_as_of_date+1)::timestamp AT TIME ZONE 'UTC')
     AND o.created_at<=v_as_of
     AND o.status IN ('confirmed','processing','shipped','delivered')
    JOIN public.products p
      ON p.id=oi.product_id AND p.organization_id=v_org AND p.status='active'
    WHERE oi.product_id IS NOT NULL AND oi.quantity>0
      AND pg_catalog.char_length(pg_catalog.btrim(coalesce(oi.unit_snapshot,''))) BETWEEN 1 AND 80
    GROUP BY p.id,p.name,p.unit,pg_catalog.btrim(oi.unit_snapshot)
  ),
  product_unit_counts AS (
    SELECT f.product_id,pg_catalog.count(*)::integer AS unit_variant_count
      FROM product_unit_facts f GROUP BY f.product_id
  ),
  eligible AS (
    SELECT f.*,
           u.unit_variant_count,
           (u.unit_variant_count=1 AND f.product_unit=f.order_unit) AS unit_comparable,
           'product-performance:'||f.product_id::text||':'||
             pg_catalog.md5(f.order_unit) AS evidence_id
      FROM product_unit_facts f
      JOIN product_unit_counts u ON u.product_id=f.product_id
  )
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'evidenceId',e.evidence_id,
      'productRef',e.product_id::text,
      'productLabel',e.product_name,
      'unitOfMeasure',e.order_unit,
      'unitComparable',e.unit_comparable,
      'currentQuantity',e.current_quantity,
      'currentOrderCount',e.current_order_count,
      'baselineQuantity',e.baseline_quantity,
      'baselineOrderCount',e.baseline_order_count
    )
    ORDER BY (e.current_order_count+e.baseline_order_count) DESC,e.product_id,e.order_unit
  ),'[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT * FROM eligible
     ORDER BY (current_order_count+baseline_order_count) DESC,product_id,order_unit
     LIMIT 2000
  ) e;

  v_returned_count:=jsonb_array_length(v_rows);

  RETURN pg_catalog.jsonb_build_object(
    'asOf',v_as_of,
    'period',v_current_period,
    'baselinePeriod',v_baseline_period,
    'status',CASE WHEN v_total_count=0 THEN 'EMPTY'
                  WHEN v_total_count<=2000 AND v_uncomparable_unit_count=0 THEN 'VERIFIED'
                  ELSE 'PARTIAL' END,
    'totalCount',v_total_count,
    'returnedCount',v_returned_count,
    'uncomparableUnitCount',v_uncomparable_unit_count,
    'completePopulation',(v_total_count<=2000 AND v_uncomparable_unit_count=0),
    'products',v_rows,
    'sourceTables',pg_catalog.jsonb_build_array('orders','order_items','products'),
    'sideEffects','NONE'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_product_performance_growth_aggregate(integer,timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_product_performance_growth_aggregate(integer,timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.fetch_product_performance_growth_aggregate(integer,timestamptz) IS
  'Read-only same-tenant product order-quantity performance for equal-length UTC current/baseline periods. Reads the persisted order_items.unit_snapshot contract; no customer, price or order-level data is returned.';

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

  SELECT pg_catalog.count(*)::integer INTO v_unresolved
    FROM public.customer_invoices i
    LEFT JOIN public.customers c
      ON c.id=i.customer_id AND c.organization_id=i.organization_id
   WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid') AND i.issued_at<=v_now
     AND i.total_amount>coalesce((
       SELECT pg_catalog.sum(p.amount) FROM public.customer_payments p
        WHERE p.organization_id=v_org AND p.invoice_id=i.id AND p.paid_at<=v_now
     ),0)
     AND (pg_catalog.upper(coalesce(i.currency,'')) !~ '^[A-Z]{3}$'
       OR nullif(pg_catalog.btrim(coalesce(coalesce(nullif(pg_catalog.btrim(c.business_name),''),nullif(pg_catalog.btrim(c.contact_name),'')),'')),'') IS NULL OR i.due_at IS NULL);

  WITH paid AS (
    SELECT p.invoice_id,pg_catalog.sum(p.amount)::numeric(18,2) AS paid_amount,
           pg_catalog.array_agg('customer-payment:'||p.id::text ORDER BY p.paid_at,p.id) AS payment_evidence
      FROM public.customer_payments p
     WHERE p.organization_id=v_org AND p.paid_at<=v_now
     GROUP BY p.invoice_id
  ),
  balances AS (
    SELECT i.id,nullif(pg_catalog.btrim(coalesce(coalesce(nullif(pg_catalog.btrim(c.business_name),''),nullif(pg_catalog.btrim(c.contact_name),'')),'')),'') AS customer_name,
           pg_catalog.upper(coalesce(i.currency,'')) AS currency,i.due_at,
           greatest(i.total_amount-coalesce(p.paid_amount,0),0)::numeric(18,2) AS outstanding,
           coalesce(p.paid_amount,0)::numeric(18,2) AS paid_amount,
           coalesce(p.payment_evidence,ARRAY[]::text[]) AS payment_evidence,
           CASE
             WHEN i.due_at IS NULL THEN 'UNKNOWN_DUE_DATE'
             WHEN (i.due_at AT TIME ZONE 'UTC')::date>=v_today THEN 'NOT_DUE'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=30 THEN 'OVERDUE_1_30'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=60 THEN 'OVERDUE_31_60'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=90 THEN 'OVERDUE_61_90'
             ELSE 'OVERDUE_90_PLUS'
           END AS aging_bucket,
           CASE WHEN i.due_at IS NULL THEN NULL ELSE greatest(v_today-(i.due_at AT TIME ZONE 'UTC')::date,0) END AS age_days
      FROM public.customer_invoices i LEFT JOIN paid p ON p.invoice_id=i.id
      LEFT JOIN public.customers c ON c.id=i.customer_id AND c.organization_id=i.organization_id
     WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid')
       AND i.issued_at<=v_now AND i.total_amount>coalesce(p.paid_amount,0)
  ),
  valid_balances AS (SELECT * FROM balances WHERE currency ~ '^[A-Z]{3}$'),
  bucket_totals AS (
    SELECT b.customer_name,b.currency,b.aging_bucket,
           pg_catalog.count(*)::integer AS invoice_count,
           pg_catalog.sum(b.outstanding)::numeric(18,2) AS amount,
           pg_catalog.count(*) FILTER(WHERE b.paid_amount>0)::integer AS partially_paid_count,
           max(b.age_days)::integer AS oldest_age_days,
           (pg_catalog.array_agg('customer-invoice:'||b.id::text ORDER BY b.id))[1:25] AS invoice_evidence,
           coalesce((
             SELECT (pg_catalog.array_agg(DISTINCT x.evidence_id ORDER BY x.evidence_id))[1:25]
               FROM valid_balances vb
               CROSS JOIN LATERAL pg_catalog.unnest(vb.payment_evidence) AS x(evidence_id)
              WHERE vb.customer_name IS NOT DISTINCT FROM b.customer_name
                AND vb.currency=b.currency AND vb.aging_bucket=b.aging_bucket
           ),ARRAY[]::text[]) AS payment_evidence
      FROM valid_balances b GROUP BY b.customer_name,b.currency,b.aging_bucket
  ),
  customer_totals AS (
    SELECT b.customer_name,b.currency,pg_catalog.sum(b.amount)::numeric(18,2) AS total_outstanding,
           coalesce(pg_catalog.sum(b.amount) FILTER(WHERE b.aging_bucket LIKE 'OVERDUE_%'),0)::numeric(18,2) AS overdue_amount,
           pg_catalog.sum(b.invoice_count)::integer AS invoice_count,
           pg_catalog.sum(b.partially_paid_count)::integer AS partially_paid_count,
           max(b.oldest_age_days)::integer AS oldest_age_days,
           pg_catalog.bool_or(b.aging_bucket='UNKNOWN_DUE_DATE') AS has_unknown_due_date
      FROM bucket_totals b GROUP BY b.customer_name,b.currency
  )
  SELECT pg_catalog.count(*)::integer INTO v_total_groups FROM customer_totals;

  WITH paid AS (
    SELECT p.invoice_id,pg_catalog.sum(p.amount)::numeric(18,2) AS paid_amount,
           pg_catalog.array_agg('customer-payment:'||p.id::text ORDER BY p.paid_at,p.id) AS payment_evidence
      FROM public.customer_payments p
     WHERE p.organization_id=v_org AND p.paid_at<=v_now GROUP BY p.invoice_id
  ),
  balances AS (
    SELECT i.id,nullif(pg_catalog.btrim(coalesce(coalesce(nullif(pg_catalog.btrim(c.business_name),''),nullif(pg_catalog.btrim(c.contact_name),'')),'')),'') AS customer_name,
           pg_catalog.upper(coalesce(i.currency,'')) AS currency,i.due_at,
           greatest(i.total_amount-coalesce(p.paid_amount,0),0)::numeric(18,2) AS outstanding,
           coalesce(p.paid_amount,0)::numeric(18,2) AS paid_amount,
           coalesce(p.payment_evidence,ARRAY[]::text[]) AS payment_evidence,
           CASE
             WHEN i.due_at IS NULL THEN 'UNKNOWN_DUE_DATE'
             WHEN (i.due_at AT TIME ZONE 'UTC')::date>=v_today THEN 'NOT_DUE'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=30 THEN 'OVERDUE_1_30'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=60 THEN 'OVERDUE_31_60'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=90 THEN 'OVERDUE_61_90'
             ELSE 'OVERDUE_90_PLUS'
           END AS aging_bucket,
           CASE WHEN i.due_at IS NULL THEN NULL ELSE greatest(v_today-(i.due_at AT TIME ZONE 'UTC')::date,0) END AS age_days
      FROM public.customer_invoices i LEFT JOIN paid p ON p.invoice_id=i.id
      LEFT JOIN public.customers c ON c.id=i.customer_id AND c.organization_id=i.organization_id
     WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid')
       AND i.issued_at<=v_now AND i.total_amount>coalesce(p.paid_amount,0)
  ),
  valid_balances AS (SELECT * FROM balances WHERE currency ~ '^[A-Z]{3}$'),
  bucket_totals AS (
    SELECT b.customer_name,b.currency,b.aging_bucket,
           pg_catalog.count(*)::integer AS invoice_count,pg_catalog.sum(b.outstanding)::numeric(18,2) AS amount,
           pg_catalog.count(*) FILTER(WHERE b.paid_amount>0)::integer AS partially_paid_count,
           max(b.age_days)::integer AS oldest_age_days,
           (pg_catalog.array_agg('customer-invoice:'||b.id::text ORDER BY b.id))[1:25] AS invoice_evidence,
           coalesce((
             SELECT (pg_catalog.array_agg(DISTINCT x.evidence_id ORDER BY x.evidence_id))[1:25]
               FROM valid_balances vb
               CROSS JOIN LATERAL pg_catalog.unnest(vb.payment_evidence) AS x(evidence_id)
              WHERE vb.customer_name IS NOT DISTINCT FROM b.customer_name
                AND vb.currency=b.currency AND vb.aging_bucket=b.aging_bucket
           ),ARRAY[]::text[]) AS payment_evidence
      FROM valid_balances b GROUP BY b.customer_name,b.currency,b.aging_bucket
  ),
  customer_totals AS (
    SELECT b.customer_name,b.currency,pg_catalog.sum(b.amount)::numeric(18,2) AS total_outstanding,
           coalesce(pg_catalog.sum(b.amount) FILTER(WHERE b.aging_bucket LIKE 'OVERDUE_%'),0)::numeric(18,2) AS overdue_amount,
           pg_catalog.sum(b.invoice_count)::integer AS invoice_count,
           pg_catalog.sum(b.partially_paid_count)::integer AS partially_paid_count,
           max(b.oldest_age_days)::integer AS oldest_age_days,
           pg_catalog.bool_or(b.aging_bucket='UNKNOWN_DUE_DATE') AS has_unknown_due_date
      FROM bucket_totals b GROUP BY b.customer_name,b.currency
  )
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
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
          'evidenceIds',to_jsonb(b.invoice_evidence||b.payment_evidence)
        ) ORDER BY CASE b.aging_bucket
          WHEN 'NOT_DUE' THEN 0 WHEN 'OVERDUE_1_30' THEN 1 WHEN 'OVERDUE_31_60' THEN 2
          WHEN 'OVERDUE_61_90' THEN 3 WHEN 'OVERDUE_90_PLUS' THEN 4 ELSE 5 END),'[]'::jsonb)
          FROM bucket_totals b WHERE b.customer_name IS NOT DISTINCT FROM t.customer_name AND b.currency=t.currency
      ),
      'asOf',v_now,'formulaId','receivables.customer-invoice-aging','formulaVersion','1.0.0',
      'calculatedAt',v_now,
      'warnings',CASE WHEN t.customer_name IS NULL THEN pg_catalog.jsonb_build_array('اسم العميل غير مثبت في مستند الفاتورة.')
        WHEN t.has_unknown_due_date THEN pg_catalog.jsonb_build_array('توجد فواتير مفتوحة بلا تاريخ استحقاق؛ عُرضت ضمن غير محدد.')
        ELSE '[]'::jsonb END
    ) ORDER BY t.currency,coalesce(t.overdue_amount,0) DESC,coalesce(t.customer_name,'')
  ),'[]'::jsonb) INTO v_items
    FROM (SELECT * FROM customer_totals
          ORDER BY currency,coalesce(overdue_amount,0) DESC,coalesce(customer_name,'')
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

REVOKE ALL ON FUNCTION public.fetch_executive_receivable_customer_aging()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_executive_receivable_customer_aging()
  TO authenticated;

COMMENT ON FUNCTION public.fetch_executive_receivable_customer_aging() IS
  'Read-only same-tenant customer receivable ageing. Customer display names are resolved through customer_invoices.customer_id joined to customers on both id and organization_id; invoice amounts and payment evidence remain source-backed.';

NOTIFY pgrst, 'reload schema';
COMMIT;
