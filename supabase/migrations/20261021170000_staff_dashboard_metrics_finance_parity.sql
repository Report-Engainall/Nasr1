-- Target-native parity for the legacy staff dashboard metric contract.
-- This is a read-only projection over the Nasr1 schema; payment and treasury writes
-- stay on record_customer_payment and the existing source-to-ledger posting commands.
-- Do not add a parallel cash_accounts/received/spent balance store.
CREATE OR REPLACE FUNCTION public.get_staff_dashboard_metrics()
RETURNS TABLE(
  orders_total bigint,
  orders_pending bigint,
  orders_confirmed bigint,
  orders_preparing bigint,
  orders_ready bigint,
  orders_completed bigint,
  orders_cancelled bigint,
  completed_sales numeric,
  active_customers bigint,
  active_products bigint,
  available_stock numeric,
  receivables_issued numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL
     OR v_actor IS NULL
     OR v_org IS NULL
     OR NOT (public.is_staff() OR public.can_manage_finance()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active same-organization staff or finance permission required';
  END IF;

  RETURN QUERY
  WITH order_rollup AS (
    SELECT
      count(*)::bigint AS orders_total,
      count(*) FILTER (WHERE o.status = 'pending')::bigint AS orders_pending,
      count(*) FILTER (WHERE o.status = 'confirmed')::bigint AS orders_confirmed,
      count(*) FILTER (WHERE o.status IN ('processing','preparing'))::bigint AS orders_preparing,
      count(*) FILTER (WHERE o.status IN ('shipped','ready','dispatched'))::bigint AS orders_ready,
      count(*) FILTER (WHERE o.status IN ('delivered','completed'))::bigint AS orders_completed,
      count(*) FILTER (WHERE o.status IN ('cancelled','canceled','rejected'))::bigint AS orders_cancelled,
      coalesce(sum(o.total_amount) FILTER (WHERE o.status IN ('delivered','completed')),0)::numeric AS completed_sales
    FROM public.orders o
    WHERE o.organization_id = v_org
  ),
  stock_rows AS (
    SELECT p.unit, ib.id AS balance_id, ib.quantity_available
    FROM public.products p
    JOIN public.warehouses w
      ON w.organization_id = p.organization_id
     AND w.is_active = true
    LEFT JOIN public.inventory_balances ib
      ON ib.product_id = p.id
     AND ib.warehouse_id = w.id
    WHERE p.organization_id = v_org
      AND p.status = 'active'
  ),
  stock_rollup AS (
    SELECT CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.organization_id = v_org AND p.status = 'active'
      ) THEN 0::numeric
      WHEN NOT EXISTS (
        SELECT 1 FROM public.warehouses w
         WHERE w.organization_id = v_org AND w.is_active = true
      ) THEN NULL::numeric
      -- A missing product/warehouse balance is unknown, not a zero balance.
      WHEN count(*) FILTER (WHERE sr.balance_id IS NULL) > 0 THEN NULL::numeric
      -- Piece/carton/kg totals are not physically additive.
      WHEN count(DISTINCT sr.unit) > 1 THEN NULL::numeric
      ELSE coalesce(sum(sr.quantity_available),0)::numeric
    END AS available_stock
    FROM stock_rows sr
  ),
  invoice_balances AS (
    SELECT
      i.id,
      i.currency,
      greatest(i.total_amount - coalesce(sum(cp.amount),0),0)::numeric AS outstanding
    FROM public.customer_invoices i
    LEFT JOIN public.customer_payments cp
      ON cp.invoice_id = i.id
     AND cp.organization_id = i.organization_id
    WHERE i.organization_id = v_org
      AND i.status <> 'void'
    GROUP BY i.id, i.currency, i.total_amount
  ),
  receivables_rollup AS (
    SELECT CASE
      -- Do not add values denominated in different currencies.
      WHEN count(DISTINCT ib.currency) FILTER (WHERE ib.outstanding > 0) > 1 THEN NULL::numeric
      ELSE coalesce(sum(ib.outstanding),0)::numeric
    END AS receivables_issued
    FROM invoice_balances ib
  )
  SELECT
    o.orders_total,
    o.orders_pending,
    o.orders_confirmed,
    o.orders_preparing,
    o.orders_ready,
    o.orders_completed,
    o.orders_cancelled,
    o.completed_sales,
    (SELECT count(*)::bigint
       FROM public.customers c
      WHERE c.organization_id = v_org AND c.status = 'approved') AS active_customers,
    (SELECT count(*)::bigint
       FROM public.products p
      WHERE p.organization_id = v_org AND p.status = 'active') AS active_products,
    s.available_stock,
    r.receivables_issued
  FROM order_rollup o
  CROSS JOIN stock_rollup s
  CROSS JOIN receivables_rollup r;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_staff_dashboard_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_metrics() TO authenticated;
COMMENT ON FUNCTION public.get_staff_dashboard_metrics() IS
  'Read-only tenant-scoped legacy dashboard KPI contract. Stock or receivables are NULL when source coverage or common units/currency is insufficient; no parallel treasury ledger is created.';

DO $block$
BEGIN
  IF has_function_privilege('anon', 'public.get_staff_dashboard_metrics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute staff dashboard metrics';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_staff_dashboard_metrics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute staff dashboard metrics';
  END IF;
END;
$block$;
