-- Section 50 — tenant-scoped product performance evidence for the deterministic growth radar.
-- Counts confirmed+ orders and quantities only; no customer identities, order IDs, unit prices or totals.
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
      pg_catalog.btrim(oi.unit) AS order_unit,
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
      AND pg_catalog.char_length(pg_catalog.btrim(coalesce(oi.unit,''))) BETWEEN 1 AND 80
    GROUP BY p.id,p.name,p.unit,pg_catalog.btrim(oi.unit)
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
      pg_catalog.btrim(oi.unit) AS order_unit,
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
      AND pg_catalog.char_length(pg_catalog.btrim(coalesce(oi.unit,''))) BETWEEN 1 AND 80
    GROUP BY p.id,p.name,p.unit,pg_catalog.btrim(oi.unit)
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
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_product_performance_growth_aggregate(integer,timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.fetch_product_performance_growth_aggregate(integer,timestamptz) IS
  'Read-only same-tenant product order-quantity performance for equal-length UTC current/baseline periods. Includes confirmed, processing, shipped and delivered order lines only; returns product reference/label, UOM, quantities and distinct order counts without customer, price or order-level data. Product UOM mismatch or more than 2,000 product/UOM groups marks population PARTIAL.';

COMMIT;
