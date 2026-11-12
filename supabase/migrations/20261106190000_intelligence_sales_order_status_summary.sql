-- Section 57 — aggregate-only sales-order status summary for the Arabic assistant.
-- No customer names, row IDs, amounts, line items or mutation capabilities are exposed.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_intelligence_sales_order_status_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_as_of timestamptz:=pg_catalog.now();
  v_total bigint:=0;
  v_draft bigint:=0;
  v_pending bigint:=0;
  v_confirmed bigint:=0;
  v_processing bigint:=0;
  v_shipped bigint:=0;
  v_delivered bigint:=0;
  v_cancelled bigint:=0;
  v_unknown bigint:=0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff permission required to read the sales-order status summary';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.profiles p
     WHERE p.id=v_actor
       AND p.organization_id=v_org
       AND p.is_active
       AND p.auth_user_id=auth.uid()
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff profile required';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE o.status='draft'),
    count(*) FILTER (WHERE o.status='pending'),
    count(*) FILTER (WHERE o.status='confirmed'),
    count(*) FILTER (WHERE o.status='processing'),
    count(*) FILTER (WHERE o.status='shipped'),
    count(*) FILTER (WHERE o.status='delivered'),
    count(*) FILTER (WHERE o.status='cancelled'),
    count(*) FILTER (WHERE o.status IS NULL OR o.status NOT IN
      ('draft','pending','confirmed','processing','shipped','delivered','cancelled'))
  INTO v_total,v_draft,v_pending,v_confirmed,v_processing,v_shipped,v_delivered,v_cancelled,v_unknown
  FROM public.orders o
  WHERE o.organization_id=v_org;

  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN v_total=0 THEN 'EMPTY' WHEN v_unknown>0 THEN 'PARTIAL' ELSE 'READY' END,
    'asOf',v_as_of,
    'scope','CURRENT_ORGANIZATION_STAFF_ORDER_STATUS_AGGREGATE',
    'totalCount',v_total,
    'completePopulation',(v_unknown=0),
    'unknownStatusCount',v_unknown,
    'countsByStatus',pg_catalog.jsonb_build_object(
      'draft',v_draft,'pending',v_pending,'confirmed',v_confirmed,
      'processing',v_processing,'shipped',v_shipped,
      'delivered',v_delivered,'cancelled',v_cancelled
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_intelligence_sales_order_status_summary()
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_intelligence_sales_order_status_summary()
  TO authenticated;

COMMENT ON FUNCTION public.fetch_intelligence_sales_order_status_summary() IS
  'Returns tenant-scoped aggregate sales-order counts by known status for active staff. No row-level/customer/financial data is returned and no write is performed. Unknown status values keep the result PARTIAL.';

COMMIT;
