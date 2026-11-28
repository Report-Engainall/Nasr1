BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_financial_source_change_history(
  p_customer_id uuid,
  p_limit integer DEFAULT 10
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
  v_total integer:=0;
  v_records jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL
     OR NOT (
       public.current_actor_has_capability('finance.customer_source.request')
       OR public.current_actor_has_capability('finance.customer_source.approve')
     )
  THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance capability required to read customer source-change history';
  END IF;

  IF p_customer_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer ID and history limit between 1 and 20 are required';
  END IF;

  SELECT profile.organization_id INTO v_org
    FROM public.profiles profile
    JOIN public.organizations organization
      ON organization.id=profile.organization_id AND organization.is_active=true
   WHERE profile.id=v_actor
     AND profile.auth_user_id=auth.uid()
     AND profile.is_active=true;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization context required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers customer
     WHERE customer.id=p_customer_id
       AND customer.organization_id=v_org
       AND customer.status='approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer is outside the active finance organization';
  END IF;

  SELECT count(*)::integer
    INTO v_total
    FROM public.customer_financial_source_change_requests request
   WHERE request.organization_id=v_org
     AND request.customer_id=p_customer_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'request_id',page.id,
      'current_source_mode',page.current_source_mode,
      'target_source_mode',page.target_source_mode,
      'status',page.status,
      'reason',page.reason,
      'review_reason',page.review_reason,
      'expected_binding_revision',page.expected_binding_revision,
      'requested_at',page.requested_at,
      'reviewed_at',page.reviewed_at,
      'reconciliation_result',evidence.reconciliation_result,
      'reconciliation_source_as_of',evidence.source_as_of,
      'reconciliation_currency_codes',evidence.currency_codes,
      'reconciliation_record_counts',evidence.record_counts
    )
    ORDER BY page.requested_at DESC,page.id DESC
  ),'[]'::jsonb)
    INTO v_records
    FROM (
      SELECT request.*
        FROM public.customer_financial_source_change_requests request
       WHERE request.organization_id=v_org
         AND request.customer_id=p_customer_id
       ORDER BY request.requested_at DESC,request.id DESC
       LIMIT p_limit
    ) page
    LEFT JOIN public.customer_financial_source_reconciliation_evidence evidence
      ON evidence.organization_id=page.organization_id
     AND evidence.request_id=page.id
     AND evidence.id=page.latest_evidence_id;

  RETURN jsonb_build_object('records',v_records,'total',v_total,'limit',p_limit);
END
$function$;

REVOKE ALL ON FUNCTION public.get_customer_financial_source_change_history(uuid,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_source_change_history(uuid,integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_customer_financial_source_change_history(uuid,integer) IS
  'Returns a bounded, tenant-scoped source-change audit timeline to finance request/approval capability holders. Raw external identifiers, evidence hashes and per-currency balances are not exposed.';

COMMIT;
