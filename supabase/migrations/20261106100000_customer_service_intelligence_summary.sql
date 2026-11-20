-- P3 — CUSTOMER SERVICE INTELLIGENCE SUMMARY — 2026-11-06
-- Aggregate-only read contract for the Arabic intelligence assistant.
-- Deliberately returns no customer IDs, names, case subjects, descriptions or staff identities.

CREATE OR REPLACE FUNCTION public.get_customer_service_work_queue_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_as_of timestamptz := pg_catalog.now();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1
         FROM public.profiles p
        WHERE p.id = v_actor
          AND p.auth_user_id = auth.uid()
          AND p.organization_id = v_org
          AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active same-organization staff permission is required to read customer service intelligence';
  END IF;

  WITH active_cases AS (
    SELECT
      cs.id,
      cs.status,
      cs.priority,
      cs.first_response_at,
      cs.response_due_at,
      cs.resolution_due_at,
      task.assigned_to
    FROM public.customer_service_cases cs
    LEFT JOIN LATERAL (
      SELECT t.assigned_to
        FROM public.ai_tasks t
       WHERE t.organization_id = v_org
         AND t.source_event_key = 'customer-service-case:' || cs.id::text
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT 1
    ) task ON true
    WHERE cs.organization_id = v_org
      AND cs.status NOT IN ('resolved', 'closed')
  )
  SELECT pg_catalog.jsonb_build_object(
    'as_of', v_as_of,
    'scope', 'ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION',
    'complete_population', true,
    'summary', pg_catalog.jsonb_build_object(
      'open_count', count(*),
      'response_overdue_count', count(*) FILTER (
        WHERE first_response_at IS NULL AND response_due_at < v_as_of
      ),
      'resolution_overdue_count', count(*) FILTER (
        WHERE resolution_due_at < v_as_of
      ),
      'unassigned_count', count(*) FILTER (
        WHERE assigned_to IS NULL
      ),
      'urgent_count', count(*) FILTER (
        WHERE priority = 'urgent'
      ),
      'high_count', count(*) FILTER (
        WHERE priority = 'high'
      )
    )
  )
    INTO v_result
    FROM active_cases;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_service_work_queue_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_service_work_queue_summary() TO authenticated;

COMMENT ON FUNCTION public.get_customer_service_work_queue_summary() IS
  'Aggregate-only, complete, current-organization active customer-service case metrics. Uses one server as-of timestamp for SLA overdue counts. Returns no case, customer, subject, description, employee or financial details. Requires an active same-organization staff profile.';
