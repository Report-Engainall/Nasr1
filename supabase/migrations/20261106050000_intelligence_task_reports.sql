BEGIN;

-- REF-SECTION-58-TASK-INTELLIGENCE-REPORTS-001
-- Read-only reports from canonical tenant-scoped ai_tasks + audit_logs.
-- Workflow fields absent from the source remain NULL; never infer external waits, causes, or false alarms.

CREATE OR REPLACE FUNCTION public.fetch_task_intelligence_report(
  p_report_kind text,
  p_from date,
  p_to date
)
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
  v_today_utc date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_can_staff boolean:=public.is_staff();
  v_can_manage boolean:=public.operational_tasks_can_manage();
  v_task_access boolean:=false;
  v_visible_roles text[]:='{}'::text[];
  v_range_start timestamptz;
  v_range_end timestamptz;
  v_role_summaries jsonb:='[]'::jsonb;
  v_source_breakdown jsonb:='[]'::jsonb;
  v_weekly_trend jsonb:='[]'::jsonb;
  v_manager_risks jsonb:='[]'::jsonb;
  v_manager_risk_count integer:=NULL;
  v_visible_task_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active operational profile required';
  END IF;
  IF p_report_kind IS NULL OR p_report_kind NOT IN ('DAILY','WEEKLY','MONTHLY','MANAGER')
     OR p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to>v_today_utc THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported task report window';
  END IF;
  IF (p_report_kind IN ('DAILY','MANAGER') AND p_from<>p_to) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='daily and manager reports require one report date';
  END IF;
  IF p_report_kind='WEEKLY' AND p_to-p_from<>6 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='weekly report requires exactly seven UTC calendar days';
  END IF;
  IF p_report_kind='MONTHLY' AND (
       extract(day FROM p_from)<>1
       OR date_trunc('month',p_to::timestamp)::date<>p_from
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='monthly report must be month-to-date within one calendar month';
  END IF;
  IF p_report_kind='MANAGER' AND NOT v_can_manage THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='manager permission required for task risk report';
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
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task reporting is unavailable for this role';
  END IF;

  v_range_start:=p_from::timestamp AT TIME ZONE 'UTC';
  v_range_end:=(p_to+1)::timestamp AT TIME ZONE 'UTC';

  WITH visible_tasks AS MATERIALIZED (
    SELECT t.id,t.organization_id,t.title,t.task_type,t.task_role,t.priority,t.status,
      t.assigned_to,t.created_at,t.updated_at,t.completed_at,t.due_at,
      t.source_entity_type,t.source_entity_id
    FROM public.ai_tasks t
    WHERE t.organization_id=v_org
      AND t.task_role=ANY(v_visible_roles)
      AND public.can_view_operational_task_role(t.task_role)
  ),
  task_status_events AS MATERIALIZED (
    SELECT a.entity_id AS task_id,a.created_at,
      a.old_value->>'status' AS old_status,a.new_value->>'status' AS new_status
    FROM public.audit_logs a
    JOIN visible_tasks t ON t.id=a.entity_id
    WHERE a.organization_id=v_org
      AND a.entity_type='ai_task'
      AND a.action='operational_task.status_changed'
  ),
  first_completion AS (
    SELECT e.task_id,min(e.created_at) AS first_completed_at
    FROM task_status_events e
    WHERE e.new_status='completed'
    GROUP BY e.task_id
  ),
  period_reopens AS (
    SELECT e.task_id,
      count(*) FILTER (
        WHERE e.old_status='completed' AND e.new_status IN ('pending','in_progress')
      )::integer AS reopen_event_count,
      min(e.created_at) FILTER (
        WHERE e.old_status='completed' AND e.new_status IN ('pending','in_progress')
      ) AS first_reopened_at
    FROM task_status_events e
    WHERE e.created_at>=v_range_start AND e.created_at<v_range_end
    GROUP BY e.task_id
  ),
  task_rows AS MATERIALIZED (
    SELECT t.*,
      coalesce(fc.first_completed_at,t.completed_at) AS first_completed_at,
      coalesce(pr.reopen_event_count,0) AS reopen_event_count,
      pr.first_reopened_at
    FROM visible_tasks t
    LEFT JOIN first_completion fc ON fc.task_id=t.id
    LEFT JOIN period_reopens pr ON pr.task_id=t.id
  ),
  role_aggregate AS (
    SELECT t.task_role,
      count(*) FILTER (
        WHERE t.created_at>=v_range_start AND t.created_at<v_range_end
      )::integer AS new_count,
      count(*) FILTER (
        WHERE t.status IN ('pending','in_progress')
      )::integer AS open_count,
      count(*) FILTER (
        WHERE t.status IN ('pending','in_progress') AND t.due_at<v_as_of
      )::integer AS overdue_open_count,
      count(*) FILTER (
        WHERE t.status IN ('pending','in_progress') AND t.priority IN ('high','critical')
      )::integer AS high_impact_open_count,
      count(*) FILTER (
        WHERE t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end
          AND t.first_completed_at>=t.created_at
      )::integer AS completed_count,
      count(*) FILTER (WHERE t.reopen_event_count>0)::integer AS reopened_task_count,
      coalesce(sum(t.reopen_event_count),0)::integer AS reopened_event_count,
      count(*) FILTER (
        WHERE t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end
          AND t.first_completed_at>=t.created_at
          AND t.first_reopened_at>t.first_completed_at
      )::integer AS reopened_after_first_completion_count,
      count(*) FILTER (
        WHERE t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end
          AND t.first_completed_at>=t.created_at
      )::integer AS resolved_task_count,
      round((avg(extract(epoch FROM (t.first_completed_at-t.created_at))/60.0) FILTER (
        WHERE t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end
          AND t.first_completed_at>=t.created_at
      ))::numeric,2) AS average_resolution_minutes
    FROM task_rows t
    GROUP BY t.task_role
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'taskRole',roles.role_name,
        'newCount',coalesce(a.new_count,0),
        'openCount',coalesce(a.open_count,0),
        'overdueOpenCount',coalesce(a.overdue_open_count,0),
        'highImpactOpenCount',coalesce(a.high_impact_open_count,0),
        'completedCount',coalesce(a.completed_count,0),
        'reopenedTaskCount',coalesce(a.reopened_task_count,0),
        'reopenedEventCount',coalesce(a.reopened_event_count,0),
        'reopenRatePercent',CASE WHEN coalesce(a.resolved_task_count,0)>0
          THEN round(a.reopened_after_first_completion_count*100.0/a.resolved_task_count,2)
          ELSE NULL END,
        'resolvedTaskCount',coalesce(a.resolved_task_count,0),
        'averageResolutionMinutes',a.average_resolution_minutes,
        'waitingOnOtherPartyCount',NULL,
        'financialImpactAmount',NULL
      ) ORDER BY roles.role_name)
      FROM pg_catalog.unnest(v_visible_roles) AS roles(role_name)
      LEFT JOIN role_aggregate a ON a.task_role=roles.role_name
    ),'[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceKey',b.source_key,'taskRole',b.task_role,'priority',b.priority,
        'createdCount',b.created_count,'completedCount',b.completed_count,
        'reopenedEventCount',b.reopened_event_count,
        'reopenedTaskCount',b.reopened_task_count,
        'reopenRatePercent',CASE WHEN b.resolved_task_count>0
          THEN round(b.reopened_after_first_completion_count*100.0/b.resolved_task_count,2) ELSE NULL END,
        'resolvedTaskCount',b.resolved_task_count,
        'averageResolutionMinutes',b.average_resolution_minutes
      ) ORDER BY b.source_key,b.task_role,b.priority)
      FROM (
        SELECT coalesce(nullif(t.task_type,''),nullif(t.source_entity_type,''),'UNCLASSIFIED') AS source_key,
          t.task_role,t.priority,
          count(*) FILTER (
            WHERE t.created_at>=v_range_start AND t.created_at<v_range_end
          )::integer AS created_count,
          count(*) FILTER (
            WHERE t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end
              AND t.first_completed_at>=t.created_at
          )::integer AS completed_count,
          coalesce(sum(t.reopen_event_count),0)::integer AS reopened_event_count,
          count(*) FILTER (WHERE t.reopen_event_count>0)::integer AS reopened_task_count,
          count(*) FILTER (
            WHERE t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end
              AND t.first_completed_at>=t.created_at
              AND t.first_reopened_at>t.first_completed_at
          )::integer AS reopened_after_first_completion_count,
          count(*) FILTER (
            WHERE t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end
              AND t.first_completed_at>=t.created_at
          )::integer AS resolved_task_count,
          round((avg(extract(epoch FROM (t.first_completed_at-t.created_at))/60.0) FILTER (
            WHERE t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end
              AND t.first_completed_at>=t.created_at
          ))::numeric,2) AS average_resolution_minutes
        FROM task_rows t
        WHERE (t.created_at>=v_range_start AND t.created_at<v_range_end)
           OR (t.first_completed_at>=v_range_start AND t.first_completed_at<v_range_end)
           OR t.reopen_event_count>0
        GROUP BY coalesce(nullif(t.task_type,''),nullif(t.source_entity_type,''),'UNCLASSIFIED'),
          t.task_role,t.priority
      ) b
    ),'[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'weekStart',w.week_start::date,
        'createdCount',(
          SELECT count(*)::integer FROM task_rows t
          WHERE t.created_at>=greatest(w.week_start::date,p_from)::timestamp AT TIME ZONE 'UTC'
            AND t.created_at<least((w.week_start::date+7),p_to+1)::timestamp AT TIME ZONE 'UTC'
        ),
        'completedCount',(
          SELECT count(*)::integer FROM task_rows t
          WHERE t.first_completed_at>=greatest(w.week_start::date,p_from)::timestamp AT TIME ZONE 'UTC'
            AND t.first_completed_at<least((w.week_start::date+7),p_to+1)::timestamp AT TIME ZONE 'UTC'
            AND t.first_completed_at>=t.created_at
        ),
        'averageResolutionMinutes',(
          SELECT round((avg(extract(epoch FROM (t.first_completed_at-t.created_at))/60.0))::numeric,2)
          FROM task_rows t
          WHERE t.first_completed_at>=greatest(w.week_start::date,p_from)::timestamp AT TIME ZONE 'UTC'
            AND t.first_completed_at<least((w.week_start::date+7),p_to+1)::timestamp AT TIME ZONE 'UTC'
            AND t.first_completed_at>=t.created_at
        ),
        'reopenedTaskCount',(
          SELECT count(*)::integer FROM task_rows t
          WHERE t.first_reopened_at>=greatest(w.week_start::date,p_from)::timestamp AT TIME ZONE 'UTC'
            AND t.first_reopened_at<least((w.week_start::date+7),p_to+1)::timestamp AT TIME ZONE 'UTC'
        ),
        'reopenedEventCount',(
          SELECT count(*)::integer FROM task_status_events e
          WHERE e.old_status='completed' AND e.new_status IN ('pending','in_progress')
            AND e.created_at>=greatest(w.week_start::date,p_from)::timestamp AT TIME ZONE 'UTC'
            AND e.created_at<least((w.week_start::date+7),p_to+1)::timestamp AT TIME ZONE 'UTC'
        )
      ) ORDER BY w.week_start)
      FROM (
        SELECT generate_series(
          date_trunc('week',p_from::timestamp),
          date_trunc('week',p_to::timestamp),
          interval '7 days'
        ) AS week_start
      ) w
    ),'[]'::jsonb),
    CASE WHEN v_can_manage THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',r.id,'title',r.title,'taskType',r.task_type,
        'sourceEntityType',r.source_entity_type,'sourceEntityId',r.source_entity_id,
        'taskRole',r.task_role,'priority',r.priority,'status',r.status,
        'createdAt',r.created_at,'dueAt',r.due_at,
        'ageMinutes',round(greatest(extract(epoch FROM (v_as_of-r.created_at)),0)::numeric/60,2),
        'overdueMinutes',CASE WHEN r.due_at<v_as_of
          THEN round(extract(epoch FROM (v_as_of-r.due_at))::numeric/60,2) ELSE NULL END,
        'assignedProfileId',r.assigned_to,'isOverdue',coalesce(r.due_at<v_as_of,false),
        'delayReason',NULL,'requiredManagementDecision',NULL
      ) ORDER BY CASE r.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
        r.due_at ASC NULLS LAST,r.created_at ASC)
      FROM (
        SELECT t.* FROM task_rows t
        WHERE t.status IN ('pending','in_progress') AND t.priority IN ('high','critical')
        ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
          t.due_at ASC NULLS LAST,t.created_at ASC
        LIMIT 25
      ) r
    ),'[]'::jsonb) ELSE '[]'::jsonb END,
    (SELECT count(*)::integer FROM task_rows),
    CASE WHEN v_can_manage THEN (
      SELECT count(*)::integer FROM task_rows t
      WHERE t.status IN ('pending','in_progress') AND t.priority IN ('high','critical')
    ) ELSE NULL END
  INTO v_role_summaries,v_source_breakdown,v_weekly_trend,v_manager_risks,
    v_visible_task_count,v_manager_risk_count;

  RETURN jsonb_build_object(
    'status','VERIFIED',
    'reportKind',p_report_kind,
    'asOf',v_as_of,
    'period',jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC'),
    'scope',jsonb_build_object(
      'visibleRoles',to_jsonb(v_visible_roles),
      'completePopulation',true,
      'visibleTaskCount',v_visible_task_count,
      'managerViewAvailable',v_can_manage,
      'managerRiskTotalCount',v_manager_risk_count,
      'managerRiskReturnedCount',CASE WHEN v_can_manage THEN jsonb_array_length(v_manager_risks) ELSE NULL END,
      'managerRiskCompletePopulation',CASE WHEN v_can_manage THEN coalesce(v_manager_risk_count,0)<=25 ELSE false END
    ),
    'roleSummaries',v_role_summaries,
    'sourceBreakdown',v_source_breakdown,
    'weeklyTrend',v_weekly_trend,
    'managerRisks',v_manager_risks,
    'quality',jsonb_build_object(
      'reopenRateDefinition','distinct tasks first completed in the report window and reopened after that first completion within the same window / distinct tasks first completed in the report window',
      'waitingOnOtherPartyCount',NULL,
      'falseAlarmCount',NULL,
      'repeatedCauses',NULL,
      'improvementOutcomes',NULL,
      'employeeComparisonPerformed',false
    ),
    'limitations',jsonb_build_array(
      'الجديد هو عدد سجلات المهام المنشأة داخل الفترة؛ إعادة الفتح لا تُعد مهمة جديدة.',
      'الإكمال هو أول انتقال موثق إلى completed؛ إعادة الإكمال بعد إعادة الفتح لا تضاعف عدد المهام المكتملة.',
      'المتأخر هو سجل نشط له due_at سابق لوقت إعداد التقرير؛ لا يُستنتج موعد عند غيابه.',
      'زمن الحل هو المدة من created_at إلى أول إكمال موثق، ولا يُنسب إلى موظف.',
      'حالة انتظار طرف آخر وأسباب التأخير والإنذارات الكاذبة والأسباب المتكررة ونتائج التحسين ليست حقولاً موحدة في مصدر المهام الحالي؛ تُعرض غير متاحة.',
      'الأولوية high/critical تصنيف تشغيلي مسجل، وليست قيمة مالية أو قياس خسارة.',
      'معرّف المكلف ملف مستخدم داخلي؛ لم تُجر مقارنة أداء بين الموظفين.'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_task_intelligence_report(text,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_task_intelligence_report(text,date,date) TO authenticated;
COMMENT ON FUNCTION public.fetch_task_intelligence_report(text,date,date) IS
  'Read-only tenant-scoped Section 58 task reports. Applies per-role task visibility, manager-only risk rows, UTC reporting windows, and explicit NULLs for unrecorded workflow quality fields.';

COMMIT;
