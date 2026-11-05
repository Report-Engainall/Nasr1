BEGIN;

-- REF-SECTION-61-TASK-PERFORMANCE-SCORECARD-001
-- Read-only, tenant-scoped task scorecard. Audit reopen events are explicitly a lower-bound observation:
-- source-triggered upserts can reopen tasks without creating an audit_logs status event.
CREATE OR REPLACE FUNCTION public.fetch_task_performance_scorecard()
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
  v_can_staff boolean:=public.is_staff();
  v_can_manage boolean:=public.operational_tasks_can_manage();
  v_task_access boolean:=false;
  v_visible_roles text[]:='{}'::text[];
  v_visible_task_count bigint:=0;
  v_source_linked_count bigint:=0;
  v_idempotency_key_count bigint:=0;
  v_traceable_count bigint:=0;
  v_completed_count bigint:=0;
  v_resolution_sample_count bigint:=0;
  v_resolution_excluded_count bigint:=0;
  v_groups jsonb:='[]'::jsonb;
  v_reopen_event_count bigint:=0;
  v_reopened_task_count bigint:=0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active operational profile required';
  END IF;

  v_task_access:=v_can_staff OR v_can_manage OR EXISTS(
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
      AND p.is_active AND p.organization_id=v_org AND r.role='accountant'
  );

  SELECT coalesce(pg_catalog.array_agg(visible.role_name ORDER BY visible.role_name),'{}'::text[])
  INTO v_visible_roles
  FROM pg_catalog.unnest(ARRAY['sales','accountant','warehouse','purchasing','management','operations']::text[]) AS visible(role_name)
  WHERE public.can_view_operational_task_role(visible.role_name);

  IF NOT v_task_access OR pg_catalog.cardinality(v_visible_roles)=0 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task scorecard is unavailable for this role';
  END IF;

  WITH visible_tasks AS MATERIALIZED (
    SELECT t.id,t.task_type,t.task_role,t.status,t.created_at,t.completed_at,
      t.source_event_key,t.source_entity_type,t.source_entity_id
    FROM public.ai_tasks t
    WHERE t.organization_id=v_org
      AND t.task_role=ANY(v_visible_roles)
      AND public.can_view_operational_task_role(t.task_role)
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE nullif(pg_catalog.btrim(coalesce(source_entity_type,'')),'') IS NOT NULL
         OR source_entity_id IS NOT NULL
    ),
    count(*) FILTER (
      WHERE (
        nullif(pg_catalog.btrim(coalesce(source_entity_type,'')),'') IS NOT NULL
        OR source_entity_id IS NOT NULL
      ) AND nullif(pg_catalog.btrim(coalesce(source_event_key,'')),'') IS NOT NULL
    ),
    count(*) FILTER (
      WHERE nullif(pg_catalog.btrim(coalesce(source_entity_type,'')),'') IS NOT NULL
        AND source_entity_id IS NOT NULL
        AND nullif(pg_catalog.btrim(coalesce(source_event_key,'')),'') IS NOT NULL
    ),
    count(*) FILTER (WHERE status='completed'),
    count(*) FILTER (
      WHERE status='completed'
        AND created_at IS NOT NULL
        AND completed_at IS NOT NULL
        AND completed_at>=created_at
    ),
    count(*) FILTER (
      WHERE status='completed'
        AND (
          created_at IS NULL
          OR completed_at IS NULL
          OR completed_at<created_at
        )
    )
  INTO v_visible_task_count,v_source_linked_count,v_idempotency_key_count,
    v_traceable_count,v_completed_count,v_resolution_sample_count,v_resolution_excluded_count
  FROM visible_tasks;

  WITH visible_tasks AS MATERIALIZED (
    SELECT t.id,t.task_type,t.task_role,t.status,t.created_at,t.completed_at,
      t.source_event_key,t.source_entity_type,t.source_entity_id
    FROM public.ai_tasks t
    WHERE t.organization_id=v_org
      AND t.task_role=ANY(v_visible_roles)
      AND public.can_view_operational_task_role(t.task_role)
  ),
  grouped AS (
    SELECT
      coalesce(nullif(pg_catalog.btrim(t.task_type),''),'UNCLASSIFIED') AS task_type,
      t.task_role,
      count(*) AS task_count,
      count(*) FILTER (WHERE t.status='completed') AS completed_count,
      count(*) FILTER (
        WHERE t.status='completed'
          AND t.created_at IS NOT NULL
          AND t.completed_at IS NOT NULL
          AND t.completed_at>=t.created_at
      ) AS resolution_sample_count,
      count(*) FILTER (
        WHERE t.status='completed'
          AND (
            t.created_at IS NULL
            OR t.completed_at IS NULL
            OR t.completed_at<t.created_at
          )
      ) AS resolution_excluded_count,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (t.completed_at-t.created_at))/60.0
      ) FILTER (
        WHERE t.status='completed'
          AND t.created_at IS NOT NULL
          AND t.completed_at IS NOT NULL
          AND t.completed_at>=t.created_at
      ) AS median_resolution_minutes,
      percentile_cont(0.9) WITHIN GROUP (
        ORDER BY extract(epoch FROM (t.completed_at-t.created_at))/60.0
      ) FILTER (
        WHERE t.status='completed'
          AND t.created_at IS NOT NULL
          AND t.completed_at IS NOT NULL
          AND t.completed_at>=t.created_at
      ) AS p90_resolution_minutes,
      count(*) FILTER (
        WHERE nullif(pg_catalog.btrim(coalesce(t.source_entity_type,'')),'') IS NOT NULL
           OR t.source_entity_id IS NOT NULL
      ) AS source_linked_count,
      count(*) FILTER (
        WHERE (
          nullif(pg_catalog.btrim(coalesce(t.source_entity_type,'')),'') IS NOT NULL
          OR t.source_entity_id IS NOT NULL
        ) AND nullif(pg_catalog.btrim(coalesce(t.source_event_key,'')),'') IS NOT NULL
      ) AS idempotency_key_count,
      count(*) FILTER (
        WHERE nullif(pg_catalog.btrim(coalesce(t.source_entity_type,'')),'') IS NOT NULL
          AND t.source_entity_id IS NOT NULL
          AND nullif(pg_catalog.btrim(coalesce(t.source_event_key,'')),'') IS NOT NULL
      ) AS traceable_count
    FROM visible_tasks t
    GROUP BY coalesce(nullif(pg_catalog.btrim(t.task_type),''),'UNCLASSIFIED'),t.task_role
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'taskType',g.task_type,
    'taskRole',g.task_role,
    'taskCount',g.task_count,
    'completedCount',g.completed_count,
    'resolutionSampleCount',g.resolution_sample_count,
    'resolutionExcludedCount',g.resolution_excluded_count,
    'medianResolutionMinutes',CASE WHEN g.resolution_sample_count>0
      THEN round(g.median_resolution_minutes::numeric,2) ELSE NULL END,
    'p90ResolutionMinutes',CASE WHEN g.resolution_sample_count>0
      THEN round(g.p90_resolution_minutes::numeric,2) ELSE NULL END,
    'sourceLinkedTaskCount',g.source_linked_count,
    'idempotencyKeyCount',g.idempotency_key_count,
    'traceableTaskCount',g.traceable_count,
    'idempotencyKeyCoveragePercent',CASE WHEN g.source_linked_count>0
      THEN round(g.idempotency_key_count*100.0/g.source_linked_count,2) ELSE NULL END,
    'traceabilityCoveragePercent',CASE WHEN g.source_linked_count>0
      THEN round(g.traceable_count*100.0/g.source_linked_count,2) ELSE NULL END
  ) ORDER BY g.task_role,g.task_type),'[]'::jsonb)
  INTO v_groups
  FROM grouped g;

  -- This is a count of audit-observed reopens only. Some source-triggered task upserts
  -- reopen a task without writing this event, so this count is not a full-population metric.
  SELECT count(*),count(DISTINCT a.entity_id)
  INTO v_reopen_event_count,v_reopened_task_count
  FROM public.audit_logs a
  JOIN public.ai_tasks t
    ON t.id=a.entity_id
   AND t.organization_id=v_org
   AND t.task_role=ANY(v_visible_roles)
   AND public.can_view_operational_task_role(t.task_role)
  WHERE a.organization_id=v_org
    AND a.entity_type='ai_task'
    AND a.action='operational_task.status_changed'
    AND a.old_value->>'status'='completed'
    AND a.new_value->>'status' IN ('pending','in_progress');

  RETURN jsonb_build_object(
    'status',CASE WHEN v_visible_task_count=0 THEN 'EMPTY' ELSE 'READY' END,
    'asOf',v_as_of,
    'scope',jsonb_build_object(
      'visibleRoles',to_jsonb(v_visible_roles),
      'completePopulation',true,
      'visibleTaskCount',v_visible_task_count
    ),
    'coverage',jsonb_build_object(
      'sourceLinkedTaskCount',v_source_linked_count,
      'idempotencyKeyCount',v_idempotency_key_count,
      'traceableTaskCount',v_traceable_count,
      'idempotencyKeyCoveragePercent',CASE WHEN v_source_linked_count>0
        THEN round(v_idempotency_key_count*100.0/v_source_linked_count,2) ELSE NULL END,
      'traceabilityCoveragePercent',CASE WHEN v_source_linked_count>0
        THEN round(v_traceable_count*100.0/v_source_linked_count,2) ELSE NULL END
    ),
    'resolution',jsonb_build_object(
      'completedTaskCount',v_completed_count,
      'sampleCount',v_resolution_sample_count,
      'excludedCount',v_resolution_excluded_count
    ),
    'audit',jsonb_build_object(
      'observedReopenEventCount',v_reopen_event_count,
      'observedReopenedTaskCount',v_reopened_task_count,
      'completeness','PARTIAL',
      'reasonCode','AUTOMATIC_SOURCE_TRANSITIONS_ARE_NOT_ALL_AUDITED',
      'reopenRatePercent',NULL
    ),
    'groups',v_groups,
    'unavailableMetrics',jsonb_build_array(
      'REOPEN_RATE',
      'DUPLICATE_REPLAY_RATE',
      'ACTIONABILITY_RATE',
      'FALSE_ALARM_RATE',
      'REPEATED_CAUSE_RATE',
      'WAITING_ON_OTHER_PARTY',
      'IMPROVEMENT_OUTCOMES',
      'PRINT_SUCCESS_RATE',
      'EMPLOYEE_COMPARISON'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_task_performance_scorecard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_task_performance_scorecard() TO authenticated;
COMMENT ON FUNCTION public.fetch_task_performance_scorecard() IS
  'Read-only tenant-scoped task performance scorecard. Reports full visible ai_tasks population, source-key coverage and completion-time percentiles; audit-observed reopen events remain partial because source-triggered transitions are not all audited.';

COMMIT;
