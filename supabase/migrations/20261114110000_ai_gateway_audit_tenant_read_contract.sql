-- AGH-AI-AUDIT-READ-001
-- Bounded admin/manager read model over the existing source-backed usage ledger.
-- Legacy malformed provider_attempts values are withheld, never interpreted as success.
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
      ledger_page.id,
      ledger_page.request_id,
      ledger_page.actor_profile_id,
      ledger_page.model_name,
      ledger_page.estimated_cost,
      ledger_page.execution_time_ms,
      ledger_page.fallback_used,
      ledger_page.result_status,
      ledger_page.usage_measurement_status,
      ledger_page.observed_input_tokens,
      ledger_page.observed_output_tokens,
      ledger_page.provider_attempt_count,
      attempt_quality.provider_attempts_integrity,
      CASE
        WHEN attempt_quality.provider_attempts_integrity THEN coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'provider', a.value->>'provider',
              'model', a.value->>'model',
              'fallback', lower(a.value->>'fallback') = 'true',
              'status', a.value->>'status',
              'elapsed_ms', (a.value->>'elapsed_ms')::integer,
              'observed_input_tokens', CASE
                WHEN a.value->>'observed_input_tokens' IS NOT NULL
                THEN (a.value->>'observed_input_tokens')::bigint
                ELSE NULL
              END,
              'observed_output_tokens', CASE
                WHEN a.value->>'observed_output_tokens' IS NOT NULL
                THEN (a.value->>'observed_output_tokens')::bigint
                ELSE NULL
              END,
              'estimated_cost', CASE
                WHEN a.value->>'estimated_cost' IS NOT NULL
                THEN (a.value->>'estimated_cost')::numeric
                ELSE NULL
              END,
              'error_code', a.value->>'error_code'
            )
            ORDER BY a.ordinality
          )
          FROM jsonb_array_elements(ledger_page.provider_attempts_source)
            WITH ORDINALITY AS a(value, ordinality)
        ), '[]'::jsonb)
        ELSE '[]'::jsonb
      END AS provider_attempts,
      ledger_page.outcome_reason,
      ledger_page.created_at
    FROM (
      SELECT
        l.*,
        coalesce(l.provider_attempts, '[]'::jsonb) AS provider_attempts_source
      FROM public.ai_usage_ledger l
      WHERE l.organization_id = v_org
        AND (p_result_status IS NULL OR l.result_status = p_result_status)
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT v_limit OFFSET v_offset
    ) AS ledger_page
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(ledger_page.provider_attempts_source) = 'array' THEN
          CASE
            WHEN jsonb_array_length(ledger_page.provider_attempts_source) <= 2
             AND jsonb_array_length(ledger_page.provider_attempts_source) = coalesce(ledger_page.provider_attempt_count, 0)
             AND NOT EXISTS (
               SELECT 1
               FROM jsonb_array_elements(ledger_page.provider_attempts_source) AS raw_attempt(value)
               WHERE NOT coalesce(
                 jsonb_typeof(raw_attempt.value) = 'object'
                 AND raw_attempt.value->>'provider' IN ('openai_compatible','gemini')
                 AND char_length(coalesce(raw_attempt.value->>'model','')) BETWEEN 1 AND 160
                 AND raw_attempt.value->>'status' IN ('succeeded','failed')
                 AND lower(coalesce(raw_attempt.value->>'fallback','')) IN ('true','false')
                 AND CASE
                   WHEN coalesce(raw_attempt.value->>'elapsed_ms','') ~ '^[0-9]{1,6}$'
                   THEN (raw_attempt.value->>'elapsed_ms')::numeric BETWEEN 0 AND 600000
                   ELSE false
                 END
                 AND CASE
                   WHEN raw_attempt.value->>'observed_input_tokens' IS NULL THEN true
                   WHEN coalesce(raw_attempt.value->>'observed_input_tokens','') ~ '^[0-9]{1,12}$'
                   THEN (raw_attempt.value->>'observed_input_tokens')::numeric BETWEEN 0 AND 2000000
                   ELSE false
                 END
                 AND CASE
                   WHEN raw_attempt.value->>'observed_output_tokens' IS NULL THEN true
                   WHEN coalesce(raw_attempt.value->>'observed_output_tokens','') ~ '^[0-9]{1,12}$'
                   THEN (raw_attempt.value->>'observed_output_tokens')::numeric BETWEEN 0 AND 100000
                   ELSE false
                 END
                 AND CASE
                   WHEN raw_attempt.value->>'estimated_cost' IS NULL THEN true
                   WHEN coalesce(raw_attempt.value->>'estimated_cost','') ~ '^[0-9]{1,5}([.][0-9]{1,8})?$'
                   THEN (raw_attempt.value->>'estimated_cost')::numeric BETWEEN 0 AND 10000
                   ELSE false
                 END
                 AND CASE
                   WHEN raw_attempt.value->>'error_code' IS NULL THEN true
                   ELSE raw_attempt.value->>'error_code' ~ '^[a-z0-9_]{1,80}$'
                 END
                 AND CASE
                   WHEN raw_attempt.value->>'status' = 'succeeded'
                   THEN raw_attempt.value->>'error_code' IS NULL
                   ELSE raw_attempt.value->>'observed_input_tokens' IS NULL
                    AND raw_attempt.value->>'observed_output_tokens' IS NULL
                    AND raw_attempt.value->>'estimated_cost' IS NULL
                 END,
                 false
               )
             )
            THEN true
            ELSE false
          END
        ELSE false
      END AS provider_attempts_integrity
    ) AS attempt_quality
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
  'Returns a bounded tenant-derived admin/manager read model of whitelisted AI provider attempt metadata. provider_attempts_integrity=false means the source attempt list is malformed or inconsistent and details are withheld. Never returns prompt or response bodies, raw payloads, credentials, or service secrets.';

COMMIT;
