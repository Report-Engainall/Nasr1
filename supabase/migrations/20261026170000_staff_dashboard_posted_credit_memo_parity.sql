-- NASR1-REPORT-001: keep executive dashboard receivables aligned with the authoritative receivables-aging/customer-statement contracts.
-- Only posted source-matched credit memos reduce invoice receivables; drafts and reversed memos do not.
-- If a posted memo cannot be reconciled to its invoice/customer/currency, fail closed instead of presenting a misleading KPI.
BEGIN;

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

  IF EXISTS (
    SELECT 1
    FROM public.customer_return_credit_memos cm
    LEFT JOIN public.customer_invoices ci
      ON ci.id = cm.invoice_id
     AND ci.organization_id = cm.organization_id
     AND ci.customer_id = cm.customer_id
    WHERE cm.organization_id = v_org
      AND cm.status = 'posted'
      AND (
        ci.id IS NULL
        OR cm.currency IS DISTINCT FROM ci.currency
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'posted credit memo source or currency does not reconcile to the dashboard receivables invoice';
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
  payments_by_invoice AS (
    SELECT
      cp.organization_id,
      cp.invoice_id,
      pg_catalog.sum(cp.amount)::numeric(15,2) AS paid_amount
    FROM public.customer_payments cp
    WHERE cp.organization_id = v_org
    GROUP BY cp.organization_id, cp.invoice_id
  ),
  credits_by_invoice AS (
    SELECT
      cm.organization_id,
      cm.invoice_id,
      pg_catalog.sum(cm.total_amount)::numeric(15,2) AS credited_amount
    FROM public.customer_return_credit_memos cm
    JOIN public.customer_invoices ci
      ON ci.id = cm.invoice_id
     AND ci.organization_id = cm.organization_id
     AND ci.customer_id = cm.customer_id
    WHERE cm.organization_id = v_org
      AND cm.status = 'posted'
      AND cm.currency = ci.currency
    GROUP BY cm.organization_id, cm.invoice_id
  ),
  invoice_balances AS (
    SELECT
      i.id,
      i.currency,
      greatest(
        i.total_amount
          - coalesce(pbi.paid_amount, 0)
          - coalesce(cbi.credited_amount, 0),
        0
      )::numeric AS outstanding
    FROM public.customer_invoices i
    LEFT JOIN payments_by_invoice pbi
      ON pbi.organization_id = i.organization_id
     AND pbi.invoice_id = i.id
    LEFT JOIN credits_by_invoice cbi
      ON cbi.organization_id = i.organization_id
     AND cbi.invoice_id = i.id
    WHERE i.organization_id = v_org
      AND i.status <> 'void'
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

COMMIT;
