-- AGH-CUSTOMER-QUOTE-PIPELINE-INTELLIGENCE-001
-- Aggregate-only, read-only quote lifecycle snapshot for authenticated staff.
-- Acceptance is NOT order conversion: sales_quotes has no persisted order_id relation.
CREATE INDEX IF NOT EXISTS sales_quotes_organization_created_at_idx
  ON public.sales_quotes(organization_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.fetch_customer_quote_pipeline(p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_as_of timestamptz := pg_catalog.now();
  v_total integer; v_requested integer; v_quoted integer;
  v_accepted integer; v_rejected integer; v_expired integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff permission required for customer quote pipeline';
  END IF;
  IF v_actor IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
       AND p.is_active AND p.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization profile required for customer quote pipeline';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR (p_to-p_from)>730 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer quote pipeline period is invalid';
  END IF;
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (WHERE q.status='requested')::integer,
    pg_catalog.count(*) FILTER (WHERE q.status='quoted')::integer,
    pg_catalog.count(*) FILTER (WHERE q.status='accepted')::integer,
    pg_catalog.count(*) FILTER (WHERE q.status='rejected')::integer,
    pg_catalog.count(*) FILTER (WHERE q.status='expired')::integer
   INTO v_total,v_requested,v_quoted,v_accepted,v_rejected,v_expired
   FROM public.sales_quotes q
  WHERE q.organization_id=v_org
    AND q.created_at >= (p_from::timestamp AT TIME ZONE 'UTC')
    AND q.created_at < ((p_to+1)::timestamp AT TIME ZONE 'UTC');
  RETURN pg_catalog.jsonb_build_object(
    'asOf',v_as_of,'period',pg_catalog.jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC'),
    'completePopulation',true,'totalQuotes',v_total,'requestedForPricing',v_requested,
    'awaitingCustomerResponse',v_quoted,'accepted',v_accepted,'rejected',v_rejected,
    'expired',v_expired,'sideEffects','NONE'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_customer_quote_pipeline(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_customer_quote_pipeline(date,date) TO authenticated;
COMMENT ON FUNCTION public.fetch_customer_quote_pipeline(date,date) IS
 'Read-only staff aggregate over same-organization sales_quotes created_at cohort. Returns status counts only. Accepted quotes are not represented as orders; sales_quotes has no order foreign key. No response-time or order-conversion metric is emitted.';
