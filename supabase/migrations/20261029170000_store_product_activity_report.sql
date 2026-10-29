-- Tenant-scoped product movement report for the Aghbari smart-reports screen.
-- Uses saved order-line product_id, excludes cancelled/rejected orders, and never fabricates stock.
CREATE OR REPLACE FUNCTION public.get_store_product_activity_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT COALESCE(public.is_staff(), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'لا تملك صلاحية قراءة تقرير حركة الأصناف للمؤسسة الحالية.';
  END IF;

  WITH product_activity AS (
    SELECT
      i.product_id,
      max(o.created_at) AS last_sold_at,
      COALESCE(sum(i.quantity) FILTER (
        WHERE o.created_at >= (CURRENT_DATE - 29)::timestamp
          AND o.created_at < (CURRENT_DATE + 1)::timestamp
      ), 0)::numeric AS sold_quantity_last_30_days,
      COALESCE(sum(i.quantity) FILTER (
        WHERE o.created_at >= (CURRENT_DATE - 89)::timestamp
          AND o.created_at < (CURRENT_DATE + 1)::timestamp
      ), 0)::numeric AS sold_quantity_last_90_days
    FROM public.orders o
    JOIN public.order_items i ON i.order_id = o.id
    WHERE o.organization_id = v_org
      AND i.product_id IS NOT NULL
      AND o.created_at < (CURRENT_DATE + 1)::timestamp
      AND COALESCE(o.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
    GROUP BY i.product_id
  ),
  stock_by_product AS (
    SELECT ib.product_id, sum(ib.quantity_available)::numeric AS available_quantity
      FROM public.inventory_balances ib
      JOIN public.warehouses w ON w.id = ib.warehouse_id
     WHERE w.organization_id = v_org
       AND w.is_active
     GROUP BY ib.product_id
  ),
  product_rows AS (
    SELECT
      p.id AS product_id,
      COALESCE(NULLIF(pg_catalog.btrim(p.item_code), ''), '') AS item_code,
      COALESCE(NULLIF(pg_catalog.btrim(p.name), ''), 'صنف غير مسمى') AS product_name,
      COALESCE(p.unit, '') AS unit,
      COALESCE(p.status, 'unknown') AS catalog_status,
      COALESCE(a.sold_quantity_last_30_days, 0)::numeric AS sold_quantity_last_30_days,
      COALESCE(a.sold_quantity_last_90_days, 0)::numeric AS sold_quantity_last_90_days,
      a.last_sold_at,
      CASE WHEN a.last_sold_at IS NULL THEN NULL
           ELSE (CURRENT_DATE - a.last_sold_at::date)::integer
      END AS days_since_last_sale,
      s.available_quantity,
      CASE
        WHEN a.last_sold_at IS NULL THEN 'never_sold'
        WHEN a.last_sold_at >= (CURRENT_DATE - 29)::timestamp THEN 'active_last_30_days'
        WHEN a.last_sold_at >= (CURRENT_DATE - 89)::timestamp THEN 'slow_moving_90_days'
        ELSE 'stagnant_over_90_days'
      END AS activity_status,
      CASE
        WHEN a.last_sold_at IS NOT NULL AND a.last_sold_at < (CURRENT_DATE - 89)::timestamp THEN 0
        WHEN a.last_sold_at IS NULL THEN 1
        WHEN a.last_sold_at < (CURRENT_DATE - 29)::timestamp THEN 2
        ELSE 3
      END AS activity_priority
    FROM public.products p
    LEFT JOIN product_activity a ON a.product_id = p.id
    LEFT JOIN stock_by_product s ON s.product_id = p.id
    WHERE p.organization_id = v_org
  )
  SELECT pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.statement_timestamp(),
    'recent_days', 30,
    'slow_days', 90,
    'total_products', count(*)::bigint,
    'returned_products', LEAST(count(*), 5000)::integer,
    'truncated', count(*) > 5000,
    'summary', pg_catalog.jsonb_build_object(
      'active_last_30_days', count(*) FILTER (WHERE activity_status = 'active_last_30_days'),
      'slow_moving_90_days', count(*) FILTER (WHERE activity_status = 'slow_moving_90_days'),
      'stagnant_over_90_days', count(*) FILTER (WHERE activity_status = 'stagnant_over_90_days'),
      'never_sold', count(*) FILTER (WHERE activity_status = 'never_sold'),
      'stock_unknown_count', count(*) FILTER (WHERE available_quantity IS NULL)
    ),
    'products', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'product_id', limited.product_id,
          'item_code', limited.item_code,
          'product_name', limited.product_name,
          'unit', limited.unit,
          'catalog_status', limited.catalog_status,
          'activity_status', limited.activity_status,
          'sold_quantity_last_30_days', limited.sold_quantity_last_30_days,
          'sold_quantity_last_90_days', limited.sold_quantity_last_90_days,
          'last_sold_at', limited.last_sold_at,
          'days_since_last_sale', limited.days_since_last_sale,
          'available_quantity', limited.available_quantity
        ) ORDER BY limited.activity_priority, limited.available_quantity DESC NULLS LAST,
          limited.product_name, limited.item_code
      )
      FROM (
        SELECT * FROM product_rows
        ORDER BY activity_priority, available_quantity DESC NULLS LAST, product_name, item_code
        LIMIT 5000
      ) AS limited
    ), '[]'::jsonb)
  )
    INTO v_result
    FROM product_rows;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_store_product_activity_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_product_activity_report() TO authenticated;
COMMENT ON FUNCTION public.get_store_product_activity_report() IS
  'Tenant-scoped product activity analytics for admin/manager reports; product_id-linked order history, active-warehouse availability, no costs/margins, 5000-row cap explicitly returned.';

DO $block$
BEGIN
  IF has_function_privilege('anon', 'public.get_store_product_activity_report()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute product activity reports';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_store_product_activity_report()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute guarded product activity reports';
  END IF;
END;
$block$;
