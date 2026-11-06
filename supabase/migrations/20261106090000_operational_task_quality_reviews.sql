BEGIN;

-- REF-SECTION-61-TASK-QUALITY-REVIEWS-001
-- Append-only manager review events, linked to canonical operational tasks and optional decision outcomes.
CREATE TABLE IF NOT EXISTS public.operational_task_quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.ai_tasks(id) ON DELETE RESTRICT,
  decision_outcome_id uuid REFERENCES public.decision_outcomes(id) ON DELETE RESTRICT,
  review_type text NOT NULL CHECK (review_type IN ('ACTIONABILITY','RECOMMENDATION_DISPOSITION','ALERT_VALIDATION')),
  actionability text CHECK (actionability IN ('ACTIONABLE','NOT_ACTIONABLE','DEFERRED')),
  disposition text CHECK (disposition IN ('APPROVED','REJECTED','DEFERRED')),
  alert_verdict text CHECK (alert_verdict IN ('TRUE_POSITIVE','FALSE_POSITIVE','NEEDS_REVIEW')),
  reason_code text CHECK (reason_code IN (
    'SOURCE_MISSING','SOURCE_INCOMPLETE','SOURCE_STALE','SOURCE_MISMATCH',
    'ALREADY_RESOLVED','DUPLICATE_RECOMMENDATION','OUT_OF_SCOPE','POLICY_CONFLICT',
    'RESOURCE_UNAVAILABLE','TIMING_NOT_APPROPRIATE','LOW_EXPECTED_IMPACT',
    'BUDGET_CONSTRAINT','THRESHOLD_NOT_MET','OTHER'
  )),
  reason_note text CHECK (reason_note IS NULL OR char_length(reason_note)<=500),
  cause_key text,
  task_updated_at timestamptz NOT NULL,
  task_status_snapshot text NOT NULL,
  task_role_snapshot text NOT NULL,
  task_type_snapshot text NOT NULL,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN ('admin','manager')),
  event_id text NOT NULL CHECK (char_length(btrim(event_id)) BETWEEN 1 AND 100),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 100),
  command_payload jsonb NOT NULL CHECK (jsonb_typeof(command_payload)='object'),
  result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT operational_task_quality_event_shape_check CHECK (
    (review_type='ACTIONABILITY'
      AND actionability IS NOT NULL AND disposition IS NULL AND alert_verdict IS NULL
      AND ((actionability='ACTIONABLE' AND reason_code IS NULL AND reason_note IS NULL)
        OR (actionability IN ('NOT_ACTIONABLE','DEFERRED') AND reason_code IS NOT NULL)))
    OR
    (review_type='RECOMMENDATION_DISPOSITION'
      AND actionability IS NULL AND disposition IS NOT NULL AND alert_verdict IS NULL
      AND ((disposition='APPROVED' AND reason_code IS NULL AND reason_note IS NULL)
        OR (disposition IN ('REJECTED','DEFERRED') AND reason_code IS NOT NULL)))
    OR
    (review_type='ALERT_VALIDATION'
      AND actionability IS NULL AND disposition IS NULL AND alert_verdict IS NOT NULL
      AND ((alert_verdict IN ('TRUE_POSITIVE','NEEDS_REVIEW') AND reason_code IS NULL AND reason_note IS NULL)
        OR (alert_verdict='FALSE_POSITIVE' AND reason_code IS NOT NULL)))
  ),
  CONSTRAINT operational_task_quality_other_reason_check CHECK (
    (reason_code='OTHER' AND reason_note IS NOT NULL AND char_length(btrim(reason_note))>0)
    OR (reason_code IS DISTINCT FROM 'OTHER' AND reason_note IS NULL)
  ),
  UNIQUE (organization_id,event_id),
  UNIQUE (organization_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS operational_task_quality_task_history_idx
  ON public.operational_task_quality_events(organization_id,task_id,review_type,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS operational_task_quality_outcome_history_idx
  ON public.operational_task_quality_events(organization_id,decision_outcome_id,review_type,created_at DESC)
  WHERE decision_outcome_id IS NOT NULL;

ALTER TABLE public.operational_task_quality_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_task_quality_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.prevent_operational_task_quality_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='operational task quality review history is append-only';
END;
$function$;
REVOKE ALL ON FUNCTION public.prevent_operational_task_quality_event_mutation() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS operational_task_quality_events_append_only ON public.operational_task_quality_events;
CREATE TRIGGER operational_task_quality_events_append_only
BEFORE UPDATE OR DELETE ON public.operational_task_quality_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_task_quality_event_mutation();

CREATE OR REPLACE FUNCTION public.record_operational_task_quality_review(
  p_task_id uuid,
  p_expected_task_updated_at timestamptz,
  p_review_type text,
  p_review jsonb,
  p_event_id text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_role text;
  v_task public.ai_tasks%ROWTYPE;
  v_decision_outcome_id uuid;
  v_actionability text;
  v_disposition text;
  v_alert_verdict text;
  v_reason_code text;
  v_reason_note text;
  v_allowed_reason boolean:=false;
  v_payload jsonb;
  v_existing_actor uuid;
  v_existing_payload jsonb;
  v_existing_result jsonb;
  v_event uuid;
  v_event_snapshot jsonb;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='administrator or manager permission required to review task quality';
  END IF;

  SELECT r.role INTO v_role
  FROM public.profiles p
  JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
    AND p.organization_id=v_org AND p.is_active
    AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
  LIMIT 1
  FOR SHARE OF p,r;

  IF v_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active same-organization manager profile required';
  END IF;
  IF p_task_id IS NULL OR p_expected_task_updated_at IS NULL
     OR p_review_type IS NULL
     OR p_review_type NOT IN ('ACTIONABILITY','RECOMMENDATION_DISPOSITION','ALERT_VALIDATION')
     OR p_review IS NULL OR pg_catalog.jsonb_typeof(p_review) IS DISTINCT FROM 'object'
     OR p_event_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_event_id)) NOT BETWEEN 1 AND 100
     OR p_idempotency_key IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid task quality review envelope';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_review) k(key)
    WHERE k.key NOT IN ('actionability','disposition','alertVerdict','reasonCode','reasonNote','decisionOutcomeId')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='task quality review contains unsupported fields';
  END IF;

  v_actionability:=p_review->>'actionability';
  v_disposition:=p_review->>'disposition';
  v_alert_verdict:=p_review->>'alertVerdict';
  v_reason_code:=p_review->>'reasonCode';
  v_reason_note:=nullif(pg_catalog.btrim(coalesce(p_review->>'reasonNote','')),'');
  IF v_reason_note IS NOT NULL AND pg_catalog.char_length(v_reason_note)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='task quality review note exceeds 500 characters';
  END IF;

  IF p_review ? 'decisionOutcomeId' THEN
    IF pg_catalog.jsonb_typeof(p_review->'decisionOutcomeId') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='decision outcome reference must be a UUID string';
    END IF;
    BEGIN
      v_decision_outcome_id:=(p_review->>'decisionOutcomeId')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='decision outcome reference is invalid';
    END;
  END IF;

  IF v_reason_code IS NOT NULL AND v_reason_code NOT IN (
    'SOURCE_MISSING','SOURCE_INCOMPLETE','SOURCE_STALE','SOURCE_MISMATCH',
    'ALREADY_RESOLVED','DUPLICATE_RECOMMENDATION','OUT_OF_SCOPE','POLICY_CONFLICT',
    'RESOURCE_UNAVAILABLE','TIMING_NOT_APPROPRIATE','LOW_EXPECTED_IMPACT',
    'BUDGET_CONSTRAINT','THRESHOLD_NOT_MET','OTHER'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported task quality reason code';
  END IF;

  IF p_review_type='ACTIONABILITY' THEN
    IF v_actionability IS NULL OR v_actionability NOT IN ('ACTIONABLE','NOT_ACTIONABLE','DEFERRED')
       OR p_review ? 'disposition' OR p_review ? 'alertVerdict' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='actionability review shape is invalid';
    END IF;
    IF v_actionability IN ('NOT_ACTIONABLE','DEFERRED') AND v_reason_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='non-actionable or deferred task requires a reason';
    END IF;
    IF v_actionability='ACTIONABLE' AND (v_reason_code IS NOT NULL OR v_reason_note IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='actionable review cannot carry a rejection reason';
    END IF;
    v_allowed_reason:=v_reason_code IS NULL OR v_reason_code IN (
      'SOURCE_MISSING','SOURCE_INCOMPLETE','SOURCE_STALE','SOURCE_MISMATCH',
      'ALREADY_RESOLVED','DUPLICATE_RECOMMENDATION','OUT_OF_SCOPE','POLICY_CONFLICT',
      'RESOURCE_UNAVAILABLE','TIMING_NOT_APPROPRIATE','LOW_EXPECTED_IMPACT',
      'BUDGET_CONSTRAINT','OTHER'
    );
  ELSIF p_review_type='RECOMMENDATION_DISPOSITION' THEN
    IF v_disposition IS NULL OR v_disposition NOT IN ('APPROVED','REJECTED','DEFERRED')
       OR p_review ? 'actionability' OR p_review ? 'alertVerdict' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='recommendation disposition shape is invalid';
    END IF;
    IF v_disposition IN ('REJECTED','DEFERRED') AND v_reason_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rejected or deferred recommendation requires a reason';
    END IF;
    IF v_disposition='APPROVED' AND (v_reason_code IS NOT NULL OR v_reason_note IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='approved recommendation cannot carry a rejection reason';
    END IF;
    v_allowed_reason:=v_reason_code IS NULL OR v_reason_code IN (
      'SOURCE_MISSING','SOURCE_INCOMPLETE','SOURCE_STALE','SOURCE_MISMATCH',
      'ALREADY_RESOLVED','DUPLICATE_RECOMMENDATION','OUT_OF_SCOPE','POLICY_CONFLICT',
      'RESOURCE_UNAVAILABLE','TIMING_NOT_APPROPRIATE','LOW_EXPECTED_IMPACT',
      'BUDGET_CONSTRAINT','OTHER'
    );
  ELSE
    IF v_alert_verdict IS NULL OR v_alert_verdict NOT IN ('TRUE_POSITIVE','FALSE_POSITIVE','NEEDS_REVIEW')
       OR p_review ? 'actionability' OR p_review ? 'disposition' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='alert validation shape is invalid';
    END IF;
    IF v_alert_verdict='FALSE_POSITIVE' AND v_reason_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='false-positive alert requires a reason';
    END IF;
    IF v_alert_verdict IN ('TRUE_POSITIVE','NEEDS_REVIEW') AND (v_reason_code IS NOT NULL OR v_reason_note IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a false-positive alert may carry a false-alarm reason';
    END IF;
    v_allowed_reason:=v_reason_code IS NULL OR v_reason_code IN (
      'SOURCE_STALE','SOURCE_MISMATCH','ALREADY_RESOLVED',
      'DUPLICATE_RECOMMENDATION','THRESHOLD_NOT_MET','OTHER'
    );
  END IF;

  IF NOT v_allowed_reason THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reason code is not valid for this review type';
  END IF;
  IF v_reason_code='OTHER' AND v_reason_note IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='OTHER reason requires a brief explanation';
  END IF;
  IF v_reason_code IS DISTINCT FROM 'OTHER' AND v_reason_note IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reason note is accepted only for OTHER';
  END IF;

  v_payload:=pg_catalog.jsonb_build_object(
    'taskId',p_task_id::text,
    'expectedTaskUpdatedAt',p_expected_task_updated_at,
    'reviewType',p_review_type,
    'review',p_review
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':task-quality:'||p_idempotency_key,0)
  );

  SELECT e.actor_profile_id,e.command_payload,e.result_snapshot
  INTO v_existing_actor,v_existing_payload,v_existing_result
  FROM public.operational_task_quality_events e
  WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_actor<>v_actor OR v_existing_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='task quality idempotency payload conflict';
    END IF;
    RETURN v_existing_result||pg_catalog.jsonb_build_object('duplicate',true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.operational_task_quality_events e
    WHERE e.organization_id=v_org AND e.event_id=p_event_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='task quality event id already exists';
  END IF;

  SELECT t.* INTO v_task
  FROM public.ai_tasks t
  WHERE t.id=p_task_id AND t.organization_id=v_org
  FOR UPDATE;
  IF NOT FOUND OR NOT public.can_view_operational_task_role(v_task.task_role) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task is unavailable for this organization or role';
  END IF;
  IF v_task.updated_at IS DISTINCT FROM p_expected_task_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='task changed after the review was opened; reload before recording';
  END IF;

  IF v_decision_outcome_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.decision_outcomes o
    WHERE o.id=v_decision_outcome_id AND o.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision outcome is unavailable for this organization';
  END IF;

  v_event:=gen_random_uuid();
  v_event_snapshot:=pg_catalog.jsonb_build_object(
    'id',v_event,'eventId',pg_catalog.btrim(p_event_id),'taskId',p_task_id,
    'decisionOutcomeId',v_decision_outcome_id,'reviewType',p_review_type,
    'actionability',v_actionability,'disposition',v_disposition,
    'alertVerdict',v_alert_verdict,'reasonCode',v_reason_code,'createdAt',pg_catalog.clock_timestamp()
  );
  v_result:=pg_catalog.jsonb_build_object('ok',true,'duplicate',false,'event',v_event_snapshot);

  INSERT INTO public.operational_task_quality_events(
    id,organization_id,task_id,decision_outcome_id,review_type,actionability,disposition,alert_verdict,
    reason_code,reason_note,cause_key,task_updated_at,task_status_snapshot,task_role_snapshot,
    task_type_snapshot,actor_profile_id,actor_role,event_id,idempotency_key,command_payload,result_snapshot
  ) VALUES (
    v_event,v_org,p_task_id,v_decision_outcome_id,p_review_type,v_actionability,v_disposition,v_alert_verdict,
    v_reason_code,v_reason_note,v_reason_code,v_task.updated_at,v_task.status,v_task.task_role,
    coalesce(nullif(v_task.task_type,''),'UNCLASSIFIED'),v_actor,v_role,
    pg_catalog.btrim(p_event_id),pg_catalog.btrim(p_idempotency_key),v_payload,v_result
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_org,v_actor,'operational_task.quality_reviewed','ai_task',p_task_id,NULL,
    pg_catalog.jsonb_build_object(
      'eventId',pg_catalog.btrim(p_event_id),
      'decisionOutcomeId',v_decision_outcome_id,
      'reviewType',p_review_type,
      'actionability',v_actionability,
      'disposition',v_disposition,
      'alertVerdict',v_alert_verdict,
      'reasonCode',v_reason_code
    )
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_operational_task_quality_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','RESTRICTED',
      'reasonCode','QUALITY_REVIEW_MANAGER_ONLY'
    );
  END IF;

  WITH visible_tasks AS MATERIALIZED (
    SELECT t.id
    FROM public.ai_tasks t
    WHERE t.organization_id=v_org
      AND public.can_view_operational_task_role(t.task_role)
  ),
  ranked AS MATERIALIZED (
    SELECT e.*,
      coalesce(e.decision_outcome_id::text,'task:'||e.task_id::text) AS review_subject,
      pg_catalog.row_number() OVER (
        PARTITION BY e.review_type,e.task_id,e.decision_outcome_id
        ORDER BY e.created_at DESC,e.id DESC
      ) AS review_rank
    FROM public.operational_task_quality_events e
    JOIN visible_tasks t ON t.id=e.task_id
    WHERE e.organization_id=v_org
  ),
  latest AS MATERIALIZED (
    SELECT * FROM ranked WHERE review_rank=1
  ),
  action_counts AS (
    SELECT
      count(*) AS reviewed_count,
      count(*) FILTER (WHERE actionability='ACTIONABLE') AS actionable_count,
      count(*) FILTER (WHERE actionability='NOT_ACTIONABLE') AS not_actionable_count,
      count(*) FILTER (WHERE actionability='DEFERRED') AS deferred_count
    FROM latest WHERE review_type='ACTIONABILITY'
  ),
  disposition_counts AS (
    SELECT
      count(*) AS reviewed_count,
      count(*) FILTER (WHERE disposition='APPROVED') AS approved_count,
      count(*) FILTER (WHERE disposition='REJECTED') AS rejected_count,
      count(*) FILTER (WHERE disposition='DEFERRED') AS deferred_count
    FROM latest WHERE review_type='RECOMMENDATION_DISPOSITION'
  ),
  alert_counts AS (
    SELECT
      count(*) AS reviewed_count,
      count(*) FILTER (WHERE alert_verdict='TRUE_POSITIVE') AS true_positive_count,
      count(*) FILTER (WHERE alert_verdict='FALSE_POSITIVE') AS false_positive_count,
      count(*) FILTER (WHERE alert_verdict='NEEDS_REVIEW') AS needs_review_count
    FROM latest WHERE review_type='ALERT_VALIDATION'
  ),
  cause_counts AS (
    SELECT reason_code,count(DISTINCT task_id) AS task_count,count(*) AS event_count
    FROM latest
    WHERE reason_code IS NOT NULL
      AND (
        (review_type='ACTIONABILITY' AND actionability IN ('NOT_ACTIONABLE','DEFERRED'))
        OR (review_type='RECOMMENDATION_DISPOSITION' AND disposition IN ('REJECTED','DEFERRED'))
        OR (review_type='ALERT_VALIDATION' AND alert_verdict='FALSE_POSITIVE')
      )
    GROUP BY reason_code
    HAVING count(DISTINCT task_id)>1
  ),
  rejection_reasons AS (
    SELECT reason_code,count(*) AS review_count,count(DISTINCT task_id) AS task_count
    FROM latest
    WHERE review_type='RECOMMENDATION_DISPOSITION' AND disposition='REJECTED' AND reason_code IS NOT NULL
    GROUP BY reason_code
  ),
  deferral_reasons AS (
    SELECT reason_code,count(*) AS review_count,count(DISTINCT task_id) AS task_count
    FROM latest
    WHERE (
      (review_type='RECOMMENDATION_DISPOSITION' AND disposition='DEFERRED')
      OR (review_type='ACTIONABILITY' AND actionability='DEFERRED')
    ) AND reason_code IS NOT NULL
    GROUP BY reason_code
  ),
  non_actionable_reasons AS (
    SELECT reason_code,count(*) AS review_count,count(DISTINCT task_id) AS task_count
    FROM latest
    WHERE review_type='ACTIONABILITY' AND actionability='NOT_ACTIONABLE' AND reason_code IS NOT NULL
    GROUP BY reason_code
  )
  SELECT pg_catalog.jsonb_build_object(
    'status',CASE WHEN (SELECT count(*) FROM latest)=0 THEN 'EMPTY' ELSE 'READY' END,
    'scope',pg_catalog.jsonb_build_object(
      'visibleTaskCount',(SELECT count(*) FROM visible_tasks),
      'reviewedTaskCount',(SELECT count(DISTINCT task_id) FROM latest)
    ),
    'actionability',(
      SELECT pg_catalog.jsonb_build_object(
        'reviewedCount',a.reviewed_count,
        'actionableCount',a.actionable_count,
        'notActionableCount',a.not_actionable_count,
        'deferredCount',a.deferred_count,
        'rateDenominator',a.actionable_count+a.not_actionable_count,
        'actionableRatePercent',CASE WHEN a.actionable_count+a.not_actionable_count>0
          THEN pg_catalog.round(a.actionable_count*100.0/(a.actionable_count+a.not_actionable_count),2) ELSE NULL END,
        'notActionableReasons',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'reasonCode',r.reason_code,'reviewCount',r.review_count,'affectedTaskCount',r.task_count
          ) ORDER BY r.review_count DESC,r.reason_code)
          FROM non_actionable_reasons r
        ),'[]'::jsonb)
      ) FROM action_counts a
    ),
    'disposition',(
      SELECT pg_catalog.jsonb_build_object(
        'reviewedCount',d.reviewed_count,
        'approvedCount',d.approved_count,
        'rejectedCount',d.rejected_count,
        'deferredCount',d.deferred_count,
        'rejectionReasons',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'reasonCode',r.reason_code,'reviewCount',r.review_count,'affectedTaskCount',r.task_count
          ) ORDER BY r.review_count DESC,r.reason_code)
          FROM rejection_reasons r
        ),'[]'::jsonb),
        'deferralReasons',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'reasonCode',r.reason_code,'reviewCount',r.review_count,'affectedTaskCount',r.task_count
          ) ORDER BY r.review_count DESC,r.reason_code)
          FROM deferral_reasons r
        ),'[]'::jsonb)
      ) FROM disposition_counts d
    ),
    'alerts',(
      SELECT pg_catalog.jsonb_build_object(
        'reviewedCount',a.reviewed_count,
        'truePositiveCount',a.true_positive_count,
        'falsePositiveCount',a.false_positive_count,
        'needsReviewCount',a.needs_review_count,
        'falseAlarmDenominator',a.true_positive_count+a.false_positive_count,
        'falseAlarmRatePercent',CASE WHEN a.true_positive_count+a.false_positive_count>0
          THEN pg_catalog.round(a.false_positive_count*100.0/(a.true_positive_count+a.false_positive_count),2) ELSE NULL END
      ) FROM alert_counts a
    ),
    'causeReviewCount',(
      SELECT count(*) FROM latest
      WHERE reason_code IS NOT NULL
        AND (
          (review_type='ACTIONABILITY' AND actionability IN ('NOT_ACTIONABLE','DEFERRED'))
          OR (review_type='RECOMMENDATION_DISPOSITION' AND disposition IN ('REJECTED','DEFERRED'))
          OR (review_type='ALERT_VALIDATION' AND alert_verdict='FALSE_POSITIVE')
        )
    ),
    'repeatedCauses',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reasonCode',c.reason_code,'affectedTaskCount',c.task_count,'reviewCount',c.event_count
      ) ORDER BY c.task_count DESC,c.reason_code)
      FROM cause_counts c
    ),'[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_task_performance_scorecard_with_quality()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_scorecard jsonb;
  v_quality jsonb;
  v_unavailable jsonb;
BEGIN
  v_scorecard:=public.fetch_task_performance_scorecard();
  v_quality:=public.fetch_operational_task_quality_metrics();

  -- Remove only the metric labels that now have a reviewed population and a valid denominator.
  -- Never turn an unreviewed population or a NULL denominator into a numeric zero.
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(metric) ORDER BY ordinality),'[]'::jsonb)
    INTO v_unavailable
    FROM pg_catalog.jsonb_array_elements_text(v_scorecard->'unavailableMetrics') WITH ORDINALITY AS items(metric,ordinality)
   WHERE NOT (
     v_quality->>'status'='READY'
     AND (
       (metric='ACTIONABILITY_RATE' AND pg_catalog.jsonb_typeof(v_quality->'actionability'->'actionableRatePercent')='number')
       OR (metric='FALSE_ALARM_RATE' AND pg_catalog.jsonb_typeof(v_quality->'alerts'->'falseAlarmRatePercent')='number')
       OR (metric='REPEATED_CAUSE_RATE' AND coalesce((v_quality->>'causeReviewCount')::numeric,0)>0)
     )
   );

  RETURN pg_catalog.jsonb_set(
    v_scorecard||pg_catalog.jsonb_build_object('quality',v_quality),
    '{unavailableMetrics}',
    v_unavailable,
    true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_operational_task_quality_review(uuid,timestamptz,text,jsonb,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_operational_task_quality_metrics() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_task_performance_scorecard_with_quality() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_operational_task_quality_review(uuid,timestamptz,text,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_operational_task_quality_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_task_performance_scorecard_with_quality() TO authenticated;

COMMENT ON TABLE public.operational_task_quality_events IS
  'Append-only, manager-reviewed task actionability, recommendation disposition and false-alarm evidence. Direct client table access is revoked; only tenant-derived validated RPCs can append or aggregate.';
COMMENT ON FUNCTION public.record_operational_task_quality_review(uuid,timestamptz,text,jsonb,text,text) IS
  'Records one idempotent manager review for a same-tenant task and optional same-tenant decision outcome, bound to the task updated_at observed by the reviewer. Does not mutate the task or decision state.';
COMMENT ON FUNCTION public.fetch_operational_task_quality_metrics() IS
  'Aggregates latest append-only manager review per task/decision and review type; denominators exclude deferred and needs-review observations.';
COMMENT ON FUNCTION public.fetch_task_performance_scorecard_with_quality() IS
  'Returns the standard task performance scorecard plus manager-scoped, reason-coded quality review metrics.';

COMMIT;
