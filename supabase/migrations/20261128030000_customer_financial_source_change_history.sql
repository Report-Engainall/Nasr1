BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_financial_source_change_history_page(
  p_customer_id uuid,
  p_limit integer DEFAULT 10,
  p_before_requested_at timestamptz DEFAULT NULL,
  p_before_request_id uuid DEFAULT NULL
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
  v_has_more boolean:=false;
  v_next_cursor jsonb;
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
  IF (p_before_requested_at IS NULL) <> (p_before_request_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='both source-history cursor timestamp and request ID must be supplied together';
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

  WITH candidate_page AS MATERIALIZED (
    SELECT request.*
      FROM public.customer_financial_source_change_requests request
     WHERE request.organization_id=v_org
       AND request.customer_id=p_customer_id
       AND (
         p_before_requested_at IS NULL
         OR (request.requested_at,request.id)<(p_before_requested_at,p_before_request_id)
       )
     ORDER BY request.requested_at DESC,request.id DESC
     LIMIT p_limit+1
  ),
  visible_page AS MATERIALIZED (
    SELECT candidate.*
      FROM candidate_page candidate
     ORDER BY candidate.requested_at DESC,candidate.id DESC
     LIMIT p_limit
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'request_id',visible_page.id,
      'current_source_mode',visible_page.current_source_mode,
      'target_source_mode',visible_page.target_source_mode,
      'status',visible_page.status,
      'reason',visible_page.reason,
      'review_reason',visible_page.review_reason,
      'expected_binding_revision',visible_page.expected_binding_revision,
      'requested_at',visible_page.requested_at,
      'reviewed_at',visible_page.reviewed_at,
      'reconciliation_result',evidence.reconciliation_result,
      'reconciliation_source_as_of',evidence.source_as_of,
      'reconciliation_currency_codes',evidence.currency_codes,
      'reconciliation_record_counts',evidence.record_counts,
      'can_review',
        visible_page.status IN ('pending_reconciliation','pending_approval')
        AND visible_page.requested_by IS DISTINCT FROM v_actor
        AND public.current_actor_has_capability('finance.customer_source.approve')
    )
    ORDER BY visible_page.requested_at DESC,visible_page.id DESC
  ),'[]'::jsonb),
  (SELECT count(*)>p_limit FROM candidate_page),
  (SELECT jsonb_build_object(
      'requested_at',last_row.requested_at,
      'request_id',last_row.id
    )
     FROM (
       SELECT candidate.requested_at,candidate.id
         FROM visible_page candidate
        ORDER BY candidate.requested_at ASC,candidate.id ASC
        LIMIT 1
     ) last_row)
    INTO v_records,v_has_more,v_next_cursor
    FROM visible_page
    LEFT JOIN public.customer_financial_source_reconciliation_evidence evidence
      ON evidence.organization_id=visible_page.organization_id
     AND evidence.request_id=visible_page.id
     AND evidence.id=visible_page.latest_evidence_id;

  RETURN jsonb_build_object(
    'records',v_records,
    'total',v_total,
    'limit',p_limit,
    'has_more',coalesce(v_has_more,false),
    'next_cursor',CASE WHEN coalesce(v_has_more,false) THEN v_next_cursor ELSE NULL END
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_customer_financial_source_change_history_page(uuid,integer,timestamp with time zone,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_source_change_history_page(uuid,integer,timestamp with time zone,uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_customer_financial_source_change_history_page(uuid,integer,timestamp with time zone,uuid) IS
  'Returns a bounded keyset-paginated, tenant-scoped source-change audit timeline. Cursor order is requested_at DESC, id DESC; raw ERP identifiers, evidence hashes and currency balances are excluded.';

-- Preserve the original two-argument RPC as a first-page compatibility wrapper.
CREATE OR REPLACE FUNCTION public.get_customer_financial_source_change_history(
  p_customer_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT public.get_customer_financial_source_change_history_page(
    p_customer_id,p_limit,NULL::timestamptz,NULL::uuid
  );
$function$;

REVOKE ALL ON FUNCTION public.get_customer_financial_source_change_history(uuid,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_source_change_history(uuid,integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_customer_financial_source_change_history(uuid,integer) IS
  'Compatibility first-page wrapper over the bounded keyset-paginated customer source-change history RPC.';

COMMIT;
