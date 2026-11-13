-- AGH-AI-AUDIT-READ-001
-- Bounded admin/manager read model over the existing source-backed usage ledger.
-- Exposes whitelisted telemetry only; prompts, responses, raw payloads and secrets never leave the gateway.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_ai_gateway_audit(
  p_result_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid;
  v_org uuid;
  v_limit integer := coalesce(p_limit, 50);
  v_offset integer := coalesce(p_offset, 0);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.current_auth_session_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a live authenticated session is required';
  END IF;

  v_profile := public.current_profile_id();
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true;

  IF v_profile IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.profile_id = v_profile
      AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI usage audit requires an active organization administrator or manager';
  END IF;

  IF p_result_status IS NOT NULL
     AND p_result_status NOT IN ('completed','failed','fallback','rejected_quota') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI usage audit status filter is invalid';
  END IF;
  IF v_limit < 1 OR v_limit > 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI usage audit page bounds are invalid';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.ai_usage_ledger l
  WHERE l.organization_id = v_org
    AND (p_result_status IS NULL OR l.result_status = p_result_status);

  SELECT coalesce(
    jsonb_agg(to_jsonb(page_row) ORDER BY page_row.created_at DESC, page_row.id DESC),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      l.id,
      l.request_id,
      l.actor_profile_id,
      l.model_name,
      l.estimated_cost,
      l.execution_time_ms,
      l.fallback_used,
      l.result_status,
      l.usage_measurement_status,
      l.observed_input_tokens,
      l.observed_output_tokens,
      l.provider_attempt_count,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'provider', a.value->>'provider',
            'model', a.value->>'model',
            'fallback', (a.value->>'fallback')::boolean,
            'status', a.value->>'status',
            'elapsed_ms', (a.value->>'elapsed_ms')::integer,
            'observed_input_tokens', CASE
              WHEN a.value ? 'observed_input_tokens'
              THEN (a.value->>'observed_input_tokens')::bigint
              ELSE NULL
            END,
            'observed_output_tokens', CASE
              WHEN a.value ? 'observed_output_tokens'
              THEN (a.value->>'observed_output_tokens')::bigint
              ELSE NULL
            END,
            'estimated_cost', CASE
              WHEN a.value ? 'estimated_cost'
              THEN (a.value->>'estimated_cost')::numeric
              ELSE NULL
            END,
            'error_code', a.value->>'error_code'
          )
          ORDER BY a.ordinality
        )
        FROM jsonb_array_elements(coalesce(l.provider_attempts, '[]'::jsonb))
          WITH ORDINALITY AS a(value, ordinality)
      ), '[]'::jsonb) AS provider_attempts,
      l.outcome_reason,
      l.created_at
    FROM public.ai_usage_ledger l
    WHERE l.organization_id = v_org
      AND (p_result_status IS NULL OR l.result_status = p_result_status)
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT v_limit OFFSET v_offset
  ) AS page_row;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_ai_gateway_audit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ai_gateway_audit(text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.list_ai_gateway_audit(text, integer, integer) IS
  'Returns a bounded tenant-derived admin/manager read model of whitelisted AI provider attempt metadata. Never returns prompt or response bodies, raw payloads, credentials, or service secrets.';

COMMIT;
