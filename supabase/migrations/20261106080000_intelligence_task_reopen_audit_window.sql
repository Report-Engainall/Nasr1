BEGIN;

-- REF-SECTION-61-TASK-REOPEN-AUDIT-WINDOW-001
-- The audit trigger is already installed by 20261106070000. This protected marker
-- bounds exact reopen calculations to transitions captured by that trigger.
CREATE TABLE IF NOT EXISTS public.operational_task_audit_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton IS TRUE),
  coverage_started_at timestamptz NOT NULL
);

ALTER TABLE public.operational_task_audit_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_task_audit_settings FROM PUBLIC,anon,authenticated;

-- Actor attribution must never attach another tenant's profile to this task event.
CREATE OR REPLACE FUNCTION public.audit_operational_task_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_candidate_actor uuid:=public.current_profile_id();
  v_actor uuid;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_actor
  FROM public.profiles p
  WHERE p.id=v_candidate_actor
    AND p.organization_id=NEW.organization_id
    AND p.is_active
    AND (auth.uid() IS NULL OR p.auth_user_id=auth.uid());

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  )
  VALUES(
    NEW.organization_id,
    v_actor,
    'operational_task.status_changed',
    'ai_task',
    NEW.id,
    pg_catalog.jsonb_build_object('status',OLD.status),
    pg_catalog.jsonb_build_object(
      'status',NEW.status,
      'actor_kind',CASE WHEN v_actor IS NULL THEN 'SYSTEM_OR_UNRESOLVED' ELSE 'USER' END
    ),
    pg_catalog.clock_timestamp()
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_operational_task_status_transition() FROM PUBLIC,anon,authenticated;

-- DDL locking keeps status writers from crossing the boundary before this marker is committed.
INSERT INTO public.operational_task_audit_settings(singleton,coverage_started_at)
VALUES(true,pg_catalog.clock_timestamp())
ON CONFLICT (singleton) DO NOTHING;

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
  v_audit_started_at timestamptz;
  v_first_completed_task_count bigint:=0;
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
  SELECT settings.coverage_started_at INTO v_audit_started_at
  FROM public.operational_task_audit_settings settings
  WHERE settings.singleton IS TRUE;
  IF v_audit_started_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='task audit coverage baseline is unavailable';
  END IF;

  WITH visible_tasks AS MATERIALIZED (
    SELECT t.id
    FROM public.ai_tasks t
    WHERE t.organization_id=v_org
      AND t.task_role=ANY(v_visible_roles)
      AND public.can_view_operational_task_role(t.task_role)
  ),
  status_events AS MATERIALIZED (
    SELECT a.entity_id,a.created_at,
      a.old_value->>'status' AS old_status,
      a.new_value->>'status' AS new_status
    FROM public.audit_logs a
    JOIN visible_tasks t ON t.id=a.entity_id
    WHERE a.organization_id=v_org
      AND a.entity_type='ai_task'
      AND a.action='operational_task.status_changed'
      AND a.created_at>=v_audit_started_at
  ),
  first_completions AS (
    SELECT e.entity_id,min(e.created_at) AS first_completed_at
    FROM status_events e
    WHERE e.new_status='completed'
    GROUP BY e.entity_id
  ),
  reopen_events AS (
    SELECT e.entity_id,e.created_at
    FROM status_events e
    JOIN first_completions first_done ON first_done.entity_id=e.entity_id
    WHERE e.old_status='completed'
      AND e.new_status IN ('pending','in_progress')
      AND e.created_at>first_done.first_completed_at
  ),
  reopened_tasks AS (
    SELECT e.entity_id,count(*) AS reopen_event_count
    FROM reopen_events e
    GROUP BY e.entity_id
  )
  SELECT
    (SELECT count(*) FROM first_completions),
    (SELECT count(*) FROM reopen_events),
    (SELECT count(*) FROM reopened_tasks)
  INTO v_first_completed_task_count,v_reopen_event_count,v_reopened_task_count;

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
      'reopenEventCount',v_reopen_event_count,
      'reopenedTaskCount',v_reopened_task_count,
      'firstCompletedTaskCount',v_first_completed_task_count,
      'windowStartedAt',v_audit_started_at,
      'completeness','WINDOW_COMPLETE',
      'reasonCode','COMPLETE_SINCE_AUDIT_ACTIVATION',
      'reopenRatePercent',CASE WHEN v_first_completed_task_count>0
        THEN round(v_reopened_task_count*100.0/v_first_completed_task_count,2) ELSE NULL END
    ),
    'groups',v_groups,
    'unavailableMetrics',jsonb_build_array(
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
  'Tenant-scoped task scorecard. Reopen rate and denominator are complete only for transitions captured after the immutable audit activation baseline; pre-baseline history is not reconstructed.';

COMMIT;
