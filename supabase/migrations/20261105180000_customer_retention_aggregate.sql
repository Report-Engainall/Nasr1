-- AGH-CUSTOMER-RETENTION-AGGREGATE-001
-- Full-population, tenant-scoped order-count evidence for the existing deterministic retention engine.
-- The endpoint is read-only and deliberately returns no customer finance or tier-price data.
CREATE OR REPLACE FUNCTION public.get_customer_retention_aggregate(
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
  v_org uuid;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_as_of timestamptz:=coalesce(p_as_of,pg_catalog.clock_timestamp());
  v_as_of_date date;
  v_period_from date;
  v_previous_from date;
  v_period jsonb;
  v_previous_period jsonb;
  v_population_count bigint;
  v_population_evidence_id text;
  v_evidence jsonb:='[]'::jsonb;
  v_customers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_rows_returned integer:=0;
  v_coverage_status text:='VERIFIED';
  v_completeness text:='COMPLETE';
  v_quality text:='ACCEPTABLE';
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff permission is required for customer retention analytics';
  END IF;

  IF p_period_days NOT IN (30,60,90,180,365) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer retention period must be 30, 60, 90, 180 or 365 days';
  END IF;

  IF v_as_of IS NULL OR v_as_of>v_now+interval '5 minutes'
     OR v_as_of<v_now-interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer retention as-of time must represent the current snapshot';
  END IF;

  v_as_of_date:=(v_as_of AT TIME ZONE 'UTC')::date;
  v_period_from:=v_as_of_date-(p_period_days-1);
  v_previous_from:=v_period_from-p_period_days;
  v_period:=pg_catalog.jsonb_build_object('from',v_period_from::text,'to',v_as_of_date::text);
  v_previous_period:=pg_catalog.jsonb_build_object('from',v_previous_from::text,'to',(v_period_from-1)::text);
  v_population_evidence_id:='customer-retention-population:'||pg_catalog.to_char(v_as_of AT TIME ZONE 'UTC','YYYYMMDDHH24MISSMS');

  SELECT pg_catalog.count(*)::bigint
    INTO v_population_count
    FROM public.customers c
   WHERE c.organization_id=v_org;

  -- Hard bound: never publish a partial sample as a full retention population.
  IF v_population_count>5000 THEN
    v_coverage_status:='UNVERIFIED';
    v_completeness:='PARTIAL';
    v_quality:='WARNINGS';
    v_warnings:=pg_catalog.jsonb_build_array('CUSTOMER_POPULATION_EXCEEDS_5000_COMPLETE_REPORT_BOUND');
  ELSE
    WITH customer_order_facts AS (
      SELECT
        c.id,
        pg_catalog.count(o.id) FILTER (
          WHERE o.created_at >= (v_period_from::timestamp AT TIME ZONE 'UTC')
            AND o.created_at < ((v_as_of_date+1)::timestamp AT TIME ZONE 'UTC')
        )::bigint AS current_orders,
        pg_catalog.count(o.id) FILTER (
          WHERE o.created_at >= (v_previous_from::timestamp AT TIME ZONE 'UTC')
            AND o.created_at < (v_period_from::timestamp AT TIME ZONE 'UTC')
        )::bigint AS previous_orders,
        pg_catalog.max(o.created_at) AS last_order_at
      FROM public.customers c
      LEFT JOIN public.orders o
        ON o.organization_id=c.organization_id
       AND o.customer_id=c.id
       AND o.created_at<=v_as_of
       AND pg_catalog.lower(coalesce(o.status,'')) NOT IN ('cancelled','canceled','rejected','void')
      WHERE c.organization_id=v_org
      GROUP BY c.id
    ),
    customer_payloads AS (
      SELECT
        f.id,
        'customer-retention:'||f.id::text AS evidence_id,
        pg_catalog.jsonb_build_object(
          'customerRef',f.id::text,
          'ordersCurrentPeriod',pg_catalog.jsonb_build_object(
            'id','metric:customer-retention:current:'||f.id::text,
            'key','customer.orders.current_period',
            'value',f.current_orders,
            'unit','COUNT',
            'status','VERIFIED',
            'completeness','COMPLETE',
            'quality','ACCEPTABLE',
            'period',v_period,
            'asOf',v_as_of,
            'lineage',pg_catalog.jsonb_build_object(
              'evidenceIds',pg_catalog.jsonb_build_array('customer-retention:'||f.id::text),
              'calculatedAt',v_now,
              'formulaId','nasr1.customer-orders-count.current',
              'formulaVersion','1',
              'transformations',pg_catalog.jsonb_build_array('count same-tenant non-cancelled orders in current inclusive UTC period')
            ),
            'warnings','[]'::jsonb
          ),
          'ordersPreviousPeriod',pg_catalog.jsonb_build_object(
            'id','metric:customer-retention:previous:'||f.id::text,
            'key','customer.orders.previous_period',
            'value',f.previous_orders,
            'unit','COUNT',
            'status','VERIFIED',
            'completeness','COMPLETE',
            'quality','ACCEPTABLE',
            'period',v_previous_period,
            'asOf',v_as_of,
            'lineage',pg_catalog.jsonb_build_object(
              'evidenceIds',pg_catalog.jsonb_build_array('customer-retention:'||f.id::text),
              'calculatedAt',v_now,
              'formulaId','nasr1.customer-orders-count.previous',
              'formulaVersion','1',
              'transformations',pg_catalog.jsonb_build_array('count same-tenant non-cancelled orders in preceding equal-length UTC period')
            ),
            'warnings','[]'::jsonb
          ),
          'lastOrderAt',f.last_order_at
        ) AS customer_payload,
        pg_catalog.jsonb_build_object(
          'id','customer-retention:'||f.id::text,
          'source',pg_catalog.jsonb_build_object(
            'kind','RPC',
            'name','analytics.full_customer_retention',
            'recordId',f.id::text,
            'version','v1'
          ),
          'sourceTimestamp',v_as_of,
          'asOf',v_as_of,
          'period',NULL,
          'status','VERIFIED',
          'completeness','COMPLETE',
          'quality','ACCEPTABLE',
          'warnings','[]'::jsonb
        ) AS evidence_payload
      FROM customer_order_facts f
    )
    SELECT
      coalesce(pg_catalog.jsonb_agg(cp.customer_payload ORDER BY cp.id),'[]'::jsonb),
      coalesce(pg_catalog.jsonb_agg(cp.evidence_payload ORDER BY cp.id),'[]'::jsonb),
      pg_catalog.count(*)::integer
    INTO v_customers,v_evidence,v_rows_returned
    FROM customer_payloads cp;
  END IF;

  v_evidence:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id',v_population_evidence_id,
      'source',pg_catalog.jsonb_build_object(
        'kind','RPC',
        'name','analytics.full_customer_retention.population',
        'version','v1'
      ),
      'sourceTimestamp',v_as_of,
      'asOf',v_as_of,
      'period',v_period,
      'status',CASE WHEN v_coverage_status='VERIFIED' THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
      'completeness',v_completeness,
      'quality',v_quality,
      'warnings',v_warnings
    )
  )||v_evidence;

  RETURN pg_catalog.jsonb_build_object(
    'id','customer-retention:'||pg_catalog.to_char(v_as_of AT TIME ZONE 'UTC','YYYYMMDDHH24MISSMS'),
    'asOf',v_as_of,
    'period',v_period,
    'previousPeriod',v_previous_period,
    'coverage',pg_catalog.jsonb_build_object(
      'status',v_coverage_status,
      'completeness',v_completeness,
      'quality',v_quality,
      'expectedCustomerCount',v_population_count,
      'returnedCustomerCount',v_rows_returned,
      'expectedSalesRecordCount',0,
      'returnedSalesRecordCount',0,
      'truncated',v_population_count>5000,
      'evidenceIds',pg_catalog.jsonb_build_array(v_population_evidence_id)
    ),
    'customers',v_customers,
    'salesByCurrency','[]'::jsonb,
    'evidenceRecords',v_evidence,
    'sourceTables',pg_catalog.jsonb_build_array('customers','orders'),
    'sideEffects','NONE',
    'warnings',v_warnings
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_retention_aggregate(integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_retention_aggregate(integer,timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_customer_retention_aggregate(integer,timestamptz) IS
  'Read-only same-tenant, full-customer-population evidence for the deterministic customer retention engine. Returns order counts and activity timestamps only; no balances, invoices, unit prices or other-tier price data. Above 5,000 customers the full report is withheld rather than publishing a truncated cohort.';
