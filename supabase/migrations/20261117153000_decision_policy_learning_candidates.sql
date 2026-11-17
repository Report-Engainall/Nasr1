-- Outcome learning candidates are immutable, tenant-scoped review artifacts.
-- Approval is deliberately non-activating: this migration never writes active rule/profile data.

CREATE TABLE IF NOT EXISTS public.decision_policy_learning_candidates (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  rule_id text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(rule_id)) BETWEEN 1 AND 150),
  base_profile_version text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(base_profile_version)) BETWEEN 1 AND 80),
  candidate_version integer NOT NULL CHECK (candidate_version >= 2),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','IN_REVIEW','APPROVED','REJECTED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{32}$'),
  candidate_snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(candidate_snapshot) = 'object'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_by_role text NOT NULL CHECK (created_by_role IN ('admin','manager')),
  submitted_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  reviewed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (organization_id,rule_id,base_profile_version,candidate_version),
  UNIQUE (organization_id,rule_id,base_profile_version,source_fingerprint),
  CHECK ((state IN ('DRAFT') AND submitted_at IS NULL AND reviewed_at IS NULL)
      OR (state IN ('IN_REVIEW') AND submitted_at IS NOT NULL AND reviewed_at IS NULL)
      OR (state IN ('APPROVED','REJECTED') AND submitted_at IS NOT NULL AND reviewed_at IS NOT NULL
          AND reviewed_by_profile_id IS NOT NULL AND review_reason IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.decision_policy_learning_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  candidate_id uuid NOT NULL REFERENCES public.decision_policy_learning_candidates(id) ON DELETE RESTRICT,
  event_id text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(event_id)) BETWEEN 1 AND 100),
  event_type text NOT NULL CHECK (event_type IN ('CREATE','SUBMIT_FOR_REVIEW','APPROVE','REJECT')),
  version_after integer NOT NULL CHECK (version_after > 0),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN ('admin','manager')),
  idempotency_key text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(idempotency_key)) BETWEEN 1 AND 100),
  command_payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(command_payload) = 'object'),
  result_snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,event_id),
  UNIQUE (candidate_id,version_after)
);

CREATE INDEX IF NOT EXISTS decision_policy_learning_candidates_org_updated_idx
  ON public.decision_policy_learning_candidates(organization_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS decision_policy_learning_events_history_idx
  ON public.decision_policy_learning_events(organization_id,candidate_id,version_after);

ALTER TABLE public.decision_policy_learning_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_policy_learning_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.decision_policy_learning_candidates,public.decision_policy_learning_events
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public._guard_decision_policy_learning_candidate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision learning candidates are immutable; lifecycle changes require the command RPC';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.rule_id IS DISTINCT FROM OLD.rule_id
     OR NEW.base_profile_version IS DISTINCT FROM OLD.base_profile_version
     OR NEW.candidate_version IS DISTINCT FROM OLD.candidate_version
     OR NEW.source_fingerprint IS DISTINCT FROM OLD.source_fingerprint
     OR NEW.candidate_snapshot IS DISTINCT FROM OLD.candidate_snapshot
     OR NEW.created_by_profile_id IS DISTINCT FROM OLD.created_by_profile_id
     OR NEW.created_by_role IS DISTINCT FROM OLD.created_by_role
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision learning candidate source snapshot and identity are immutable';
  END IF;

  IF NEW.version <> OLD.version + 1
     OR NOT (
       (OLD.state='DRAFT' AND NEW.state='IN_REVIEW')
       OR (OLD.state='IN_REVIEW' AND NEW.state IN ('APPROVED','REJECTED'))
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='invalid decision learning candidate lifecycle mutation';
  END IF;

  IF OLD.state='DRAFT' AND NEW.state='IN_REVIEW' THEN
    IF NEW.submitted_by_profile_id IS NULL OR NEW.submitted_at IS NULL
       OR NEW.reviewed_by_profile_id IS DISTINCT FROM OLD.reviewed_by_profile_id
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='invalid decision learning candidate submission metadata';
    END IF;
  ELSIF OLD.state='IN_REVIEW' AND NEW.state IN ('APPROVED','REJECTED') THEN
    IF NEW.submitted_by_profile_id IS DISTINCT FROM OLD.submitted_by_profile_id
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.reviewed_by_profile_id IS NULL
       OR NEW.reviewed_at IS NULL
       OR NEW.review_reason IS NULL
       OR pg_catalog.char_length(pg_catalog.btrim(NEW.review_reason)) NOT BETWEEN 3 AND 2000 THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='invalid decision learning candidate review metadata';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._deny_decision_policy_learning_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision learning events are append-only';
END;
$function$;

DROP TRIGGER IF EXISTS decision_policy_learning_candidates_guard ON public.decision_policy_learning_candidates;
CREATE TRIGGER decision_policy_learning_candidates_guard
  BEFORE UPDATE OR DELETE ON public.decision_policy_learning_candidates
  FOR EACH ROW EXECUTE FUNCTION public._guard_decision_policy_learning_candidate();

DROP TRIGGER IF EXISTS decision_policy_learning_events_append_only ON public.decision_policy_learning_events;
CREATE TRIGGER decision_policy_learning_events_append_only
  BEFORE UPDATE OR DELETE ON public.decision_policy_learning_events
  FOR EACH ROW EXECUTE FUNCTION public._deny_decision_policy_learning_event_mutation();

REVOKE ALL ON FUNCTION public._guard_decision_policy_learning_candidate() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._deny_decision_policy_learning_event_mutation() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public._decision_policy_learning_candidate_snapshot(
  p_organization_id uuid,
  p_candidate_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',c.id::text,
    'ruleId',c.rule_id,
    'baseProfileVersion',c.base_profile_version,
    'candidateVersion',c.candidate_version,
    'state',c.state,
    'version',c.version,
    'createdByProfileId',c.created_by_profile_id::text,
    'createdByRole',c.created_by_role,
    'submittedByProfileId',c.submitted_by_profile_id::text,
    'submittedAt',c.submitted_at,
    'reviewedByProfileId',c.reviewed_by_profile_id::text,
    'reviewedAt',c.reviewed_at,
    'reviewReason',c.review_reason,
    'createdAt',c.created_at,
    'updatedAt',c.updated_at,
    'candidateSnapshot',c.candidate_snapshot,
    'eventCount',(SELECT pg_catalog.count(*)::integer
                    FROM public.decision_policy_learning_events e
                   WHERE e.organization_id=c.organization_id AND e.candidate_id=c.id),
    'history',coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',e.event_id,
          'type',e.event_type,
          'version',e.version_after,
          'at',e.created_at,
          'actorProfileId',e.actor_profile_id::text,
          'actorRole',e.actor_role,
          'reason',e.command_payload->>'reason'
        ) ORDER BY e.version_after
      )
      FROM public.decision_policy_learning_events e
      WHERE e.organization_id=c.organization_id AND e.candidate_id=c.id
    ),'[]'::jsonb)
  )
  FROM public.decision_policy_learning_candidates c
  WHERE c.organization_id=p_organization_id AND c.id=p_candidate_id;
$function$;

REVOKE ALL ON FUNCTION public._decision_policy_learning_candidate_snapshot(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_decision_policy_learning_candidate(
  p_decision_ids uuid[],
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_role text;
  v_decision_id uuid;
  v_rule_id text;
  v_base_version text;
  v_outcome_rule_id text;
  v_outcome_rule_version text;
  v_outcome_state text;
  v_outcome_created_at timestamptz;
  v_memory jsonb;
  v_source_memory_snapshots jsonb := '[]'::jsonb;
  v_expected jsonb;
  v_actual jsonb;
  v_expected_lineage jsonb;
  v_actual_lineage jsonb;
  v_expected_evidence jsonb;
  v_actual_evidence jsonb;
  v_period jsonb;
  v_metric_key text;
  v_metric_unit text;
  v_currency text;
  v_unit_of_measure text;
  v_formula_id text;
  v_formula_version text;
  v_expected_value numeric;
  v_actual_value numeric;
  v_expected_as_of timestamptz;
  v_actual_as_of timestamptz;
  v_difference numeric;
  v_difference_percent numeric;
  v_expected_values numeric[] := ARRAY[]::numeric[];
  v_actual_values numeric[] := ARRAY[]::numeric[];
  v_observations jsonb := '[]'::jsonb;
  v_differences numeric[] := ARRAY[]::numeric[];
  v_percentages numeric[] := ARRAY[]::numeric[];
  v_sorted_differences numeric[];
  v_lessons text[] := ARRAY[]::text[];
  v_evidence_ids text[] := ARRAY[]::text[];
  v_lesson text;
  v_item text;
  v_count integer;
  v_percentage_count integer;
  v_above_count integer := 0;
  v_below_count integer := 0;
  v_equal_count integer := 0;
  v_zero_baseline_count integer := 0;
  v_mean_expected numeric;
  v_mean_actual numeric;
  v_mean_difference numeric;
  v_median_difference numeric;
  v_mean_absolute_difference numeric;
  v_mean_absolute_percent numeric;
  v_decision_ids uuid[];
  v_payload jsonb;
  v_existing_actor uuid;
  v_existing_payload jsonb;
  v_existing_result jsonb;
  v_source_fingerprint text;
  v_existing_candidate_id uuid;
  v_candidate_id uuid := pg_catalog.gen_random_uuid();
  v_candidate_version integer;
  v_candidate jsonb;
  v_candidate_snapshot jsonb;
  v_event_snapshot jsonb;
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for outcome learning';
  END IF;

  SELECT p.id,p.organization_id,r.role
    INTO v_actor,v_org,v_role
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_actor IS NULL OR v_org IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization required';
  END IF;

  IF p_decision_ids IS NULL
     OR pg_catalog.cardinality(p_decision_ids) NOT BETWEEN 1 AND 100
     OR p_idempotency_key IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_decision_ids) x WHERE x IS NULL)
     OR pg_catalog.cardinality(p_decision_ids) <> (
       SELECT pg_catalog.count(DISTINCT x)::integer FROM pg_catalog.unnest(p_decision_ids) x
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='outcome learning source selection is invalid';
  END IF;

  SELECT pg_catalog.array_agg(x ORDER BY x)
    INTO v_decision_ids
    FROM pg_catalog.unnest(p_decision_ids) x;

  v_payload := pg_catalog.jsonb_build_object('decisionIds',pg_catalog.to_jsonb(v_decision_ids));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':decision-policy-learning:'||pg_catalog.btrim(p_idempotency_key),0)
  );

  SELECT e.actor_profile_id,e.command_payload,e.result_snapshot
    INTO v_existing_actor,v_existing_payload,v_existing_result
    FROM public.decision_policy_learning_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing_actor IS DISTINCT FROM v_actor OR v_existing_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='outcome learning idempotency payload conflict';
    END IF;
    RETURN v_existing_result||pg_catalog.jsonb_build_object('duplicate',true);
  END IF;

  FOR v_decision_id IN SELECT x FROM pg_catalog.unnest(v_decision_ids) x LOOP
    SELECT o.state,o.rule_id,o.rule_version,o.created_at
      INTO v_outcome_state,v_outcome_rule_id,v_outcome_rule_version,v_outcome_created_at
      FROM public.decision_outcomes o
     WHERE o.organization_id=v_org AND o.id=v_decision_id
     FOR SHARE;

    IF NOT FOUND OR v_outcome_state<>'MEASURED' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='one or more measured decisions are unavailable in the active organization';
    END IF;

    IF v_rule_id IS NULL THEN
      v_rule_id := v_outcome_rule_id;
      v_base_version := v_outcome_rule_version;
    ELSIF v_rule_id IS DISTINCT FROM v_outcome_rule_id
       OR v_base_version IS DISTINCT FROM v_outcome_rule_version THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate sources must share one immutable rule and base profile version';
    END IF;

    v_memory := public._decision_memory_snapshot(v_org,v_decision_id);
    v_expected := v_memory->'expectedMetric';
    v_actual := v_memory->'actualMetric';

    IF v_memory IS NULL
       OR NOT (v_memory ? 'id')
       OR v_memory->>'id' IS NULL
       OR NOT (v_memory ? 'version')
       OR pg_catalog.jsonb_typeof(v_memory->'version') IS DISTINCT FROM 'number'
       OR (v_memory->>'version')::integer < 1
       OR pg_catalog.jsonb_typeof(v_expected) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_actual) IS DISTINCT FROM 'object'
       OR v_memory->>'lessonsReviewed' IS DISTINCT FROM 'true'
       OR pg_catalog.jsonb_typeof(v_memory->'lessons') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(v_memory->'lessons') < 1
       OR v_expected->>'status' IS DISTINCT FROM 'VERIFIED'
       OR v_expected->>'completeness' IS DISTINCT FROM 'COMPLETE'
       OR v_expected->>'quality' IS DISTINCT FROM 'ACCEPTABLE'
       OR v_actual->>'status' IS DISTINCT FROM 'VERIFIED'
       OR v_actual->>'completeness' IS DISTINCT FROM 'COMPLETE'
       OR v_actual->>'quality' IS DISTINCT FROM 'ACCEPTABLE'
       OR pg_catalog.jsonb_typeof(v_expected->'value') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(v_actual->'value') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(v_expected->'period') IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_actual->'period') IS DISTINCT FROM 'object'
       OR v_expected->'period' IS DISTINCT FROM v_actual->'period'
       OR v_expected->>'key' IS NULL OR v_expected->>'key' IS DISTINCT FROM v_actual->>'key'
       OR v_expected->>'unit' IS NULL OR v_expected->>'unit' IS DISTINCT FROM v_actual->>'unit'
       OR v_expected->>'currency' IS DISTINCT FROM v_actual->>'currency'
       OR v_expected->>'unitOfMeasure' IS DISTINCT FROM v_actual->>'unitOfMeasure'
       OR pg_catalog.jsonb_typeof(v_expected->'lineage') IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_actual->'lineage') IS DISTINCT FROM 'object'
       OR v_expected->'lineage'->>'formulaId' IS NULL
       OR v_expected->'lineage'->>'formulaId' IS DISTINCT FROM v_actual->'lineage'->>'formulaId'
       OR v_expected->'lineage'->>'formulaVersion' IS NULL
       OR v_expected->'lineage'->>'formulaVersion' IS DISTINCT FROM v_actual->'lineage'->>'formulaVersion'
       OR pg_catalog.jsonb_typeof(v_expected->'lineage'->'evidenceIds') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_typeof(v_actual->'lineage'->'evidenceIds') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(v_expected->'lineage'->'evidenceIds') < 1
       OR pg_catalog.jsonb_array_length(v_actual->'lineage'->'evidenceIds') < 1
       OR NOT (v_expected ? 'asOf') OR NOT (v_actual ? 'asOf')
       OR v_expected->>'asOf' IS NULL OR v_actual->>'asOf' IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate requires verified expected and actual metrics, reviewed lessons and identical measurement context';
    END IF;

    v_source_memory_snapshots := v_source_memory_snapshots || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'decisionId',v_decision_id::text,
        'snapshotId',v_memory->>'id',
        'version',(v_memory->>'version')::integer,
        'capturedAt',v_memory->>'capturedAt'
      )
    );

    BEGIN
      v_expected_value := (v_expected->>'value')::numeric;
      v_actual_value := (v_actual->>'value')::numeric;
      v_expected_as_of := (v_expected->>'asOf')::timestamptz;
      v_actual_as_of := (v_actual->>'asOf')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate metric values or timestamps are invalid';
    END;

    IF v_expected_as_of IS NULL
       OR v_actual_as_of IS NULL
       OR v_expected_as_of IS DISTINCT FROM v_actual_as_of THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate expected and actual metrics must use the same as-of timestamp';
    END IF;

    IF v_expected_value::text IN ('NaN','Infinity','-Infinity')
       OR v_actual_value::text IN ('NaN','Infinity','-Infinity')
       OR pg_catalog.abs(v_expected_value)>9007199254740991
       OR pg_catalog.abs(v_actual_value)>9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate metric values exceed the safe arithmetic range';
    END IF;

    v_expected_lineage := v_expected->'lineage';
    v_actual_lineage := v_actual->'lineage';
    v_expected_evidence := v_expected_lineage->'evidenceIds';
    v_actual_evidence := v_actual_lineage->'evidenceIds';

    SELECT pg_catalog.count(*)::integer,
           pg_catalog.count(DISTINCT e.value #>> '{}')::integer
      INTO v_count,v_percentage_count
      FROM pg_catalog.jsonb_array_elements(v_expected_evidence) e(value)
     WHERE pg_catalog.jsonb_typeof(e.value)='string'
       AND pg_catalog.btrim(e.value #>> '{}')<>'';
    IF v_count<>pg_catalog.jsonb_array_length(v_expected_evidence) OR v_count<>v_percentage_count THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expected metric evidence IDs are incomplete or duplicated';
    END IF;

    SELECT pg_catalog.count(*)::integer,
           pg_catalog.count(DISTINCT e.value #>> '{}')::integer
      INTO v_count,v_percentage_count
      FROM pg_catalog.jsonb_array_elements(v_actual_evidence) e(value)
     WHERE pg_catalog.jsonb_typeof(e.value)='string'
       AND pg_catalog.btrim(e.value #>> '{}')<>'';
    IF v_count<>pg_catalog.jsonb_array_length(v_actual_evidence) OR v_count<>v_percentage_count THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='actual metric evidence IDs are incomplete or duplicated';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM pg_catalog.jsonb_array_elements(v_expected_evidence) e(value)
       WHERE NOT EXISTS (
         SELECT 1
           FROM pg_catalog.jsonb_array_elements(coalesce(v_memory->'evidenceRecords','[]'::jsonb)) r(value)
          WHERE r.value->>'id'=e.value #>> '{}'
            AND r.value->>'status'='VERIFIED'
            AND r.value->>'completeness'='COMPLETE'
            AND r.value->>'quality'='ACCEPTABLE'
       )
    ) OR EXISTS (
      SELECT 1
        FROM pg_catalog.jsonb_array_elements(v_actual_evidence) e(value)
       WHERE NOT EXISTS (
         SELECT 1
           FROM pg_catalog.jsonb_array_elements(coalesce(v_memory->'evidenceRecords','[]'::jsonb)) r(value)
          WHERE r.value->>'id'=e.value #>> '{}'
            AND r.value->>'status'='VERIFIED'
            AND r.value->>'completeness'='COMPLETE'
            AND r.value->>'quality'='ACCEPTABLE'
       )
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='candidate evidence no longer resolves to complete same-tenant source records';
    END IF;

    IF v_metric_key IS NULL THEN
      v_metric_key := v_expected->>'key';
      v_metric_unit := v_expected->>'unit';
      v_currency := v_expected->>'currency';
      v_unit_of_measure := v_expected->>'unitOfMeasure';
      v_formula_id := v_expected_lineage->>'formulaId';
      v_formula_version := v_expected_lineage->>'formulaVersion';
      v_period := v_expected->'period';
    ELSIF v_metric_key IS DISTINCT FROM v_expected->>'key'
       OR v_metric_unit IS DISTINCT FROM v_expected->>'unit'
       OR v_currency IS DISTINCT FROM v_expected->>'currency'
       OR v_unit_of_measure IS DISTINCT FROM v_expected->>'unitOfMeasure'
       OR v_formula_id IS DISTINCT FROM v_expected_lineage->>'formulaId'
       OR v_formula_version IS DISTINCT FROM v_expected_lineage->>'formulaVersion'
       OR v_period IS DISTINCT FROM v_expected->'period' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate observations do not share one currency, unit, period and formula context';
    END IF;

    v_difference := v_actual_value-v_expected_value;
    IF v_metric_unit='CURRENCY' OR v_metric_unit='CURRENCY_PER_UNIT' THEN
      v_difference := pg_catalog.round(v_difference,2);
    END IF;
    IF pg_catalog.abs(v_difference)>9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate difference exceeds the safe arithmetic range';
    END IF;
    IF v_expected_value=0 THEN
      v_difference_percent := NULL;
      v_zero_baseline_count := v_zero_baseline_count+1;
    ELSE
      v_difference_percent := (v_difference/pg_catalog.abs(v_expected_value))*100;
      IF pg_catalog.abs(v_difference_percent)>9007199254740991 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate relative difference exceeds the safe arithmetic range';
      END IF;
      v_percentages := pg_catalog.array_append(v_percentages,v_difference_percent);
    END IF;

    v_expected_values := pg_catalog.array_append(v_expected_values,v_expected_value);
    v_actual_values := pg_catalog.array_append(v_actual_values,v_actual_value);
    v_differences := pg_catalog.array_append(v_differences,v_difference);
    IF v_difference>0 THEN v_above_count:=v_above_count+1;
    ELSIF v_difference<0 THEN v_below_count:=v_below_count+1;
    ELSE v_equal_count:=v_equal_count+1;
    END IF;

    v_observations := coalesce(v_observations,'[]'::jsonb) || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'decisionId',v_decision_id::text,
        'createdAt',v_outcome_created_at,
        'expected',pg_catalog.jsonb_build_object(
          'metricKey',v_expected->>'key','value',v_expected_value,'unit',v_expected->>'unit',
          'currency',v_expected->'currency','unitOfMeasure',v_expected->'unitOfMeasure',
          'period',v_expected->'period','asOf',v_expected->'asOf',
          'status',v_expected->>'status','completeness',v_expected->>'completeness','quality',v_expected->>'quality',
          'formulaId',v_expected_lineage->>'formulaId','formulaVersion',v_expected_lineage->>'formulaVersion',
          'evidenceIds',v_expected_evidence
        ),
        'actual',pg_catalog.jsonb_build_object(
          'metricKey',v_actual->>'key','value',v_actual_value,'unit',v_actual->>'unit',
          'currency',v_actual->'currency','unitOfMeasure',v_actual->'unitOfMeasure',
          'period',v_actual->'period','asOf',v_actual->'asOf',
          'status',v_actual->>'status','completeness',v_actual->>'completeness','quality',v_actual->>'quality',
          'formulaId',v_actual_lineage->>'formulaId','formulaVersion',v_actual_lineage->>'formulaVersion',
          'evidenceIds',v_actual_evidence
        ),
        'difference',v_difference,
        'differencePercent',v_difference_percent,
        'lessons',v_memory->'lessons',
        'evidenceIds',(
          SELECT coalesce(pg_catalog.jsonb_agg(to_jsonb(all_ids.evidence_id) ORDER BY all_ids.evidence_id),'[]'::jsonb)
            FROM (
              SELECT DISTINCT evidence_id
                FROM (
                  SELECT e.value #>> '{}' AS evidence_id FROM pg_catalog.jsonb_array_elements(v_expected_evidence) e(value)
                  UNION
                  SELECT e.value #>> '{}' AS evidence_id FROM pg_catalog.jsonb_array_elements(v_actual_evidence) e(value)
                ) ids
            ) all_ids
        )
      )
    );

    FOR v_item IN
      SELECT e.value #>> '{}'
        FROM pg_catalog.jsonb_array_elements(v_memory->'lessons') e(value)
       WHERE pg_catalog.jsonb_typeof(e.value)='string'
         AND pg_catalog.btrim(e.value #>> '{}')<>''
    LOOP
      IF NOT (v_item=ANY(v_lessons)) THEN v_lessons:=pg_catalog.array_append(v_lessons,v_item); END IF;
    END LOOP;

    v_expected_evidence := v_expected_lineage->'evidenceIds';
    FOR v_item IN SELECT e.value #>> '{}' FROM pg_catalog.jsonb_array_elements(v_expected_evidence) e(value) LOOP
      IF NOT (v_item=ANY(v_evidence_ids)) THEN v_evidence_ids:=pg_catalog.array_append(v_evidence_ids,v_item); END IF;
    END LOOP;
    FOR v_item IN SELECT e.value #>> '{}' FROM pg_catalog.jsonb_array_elements(v_actual_lineage->'evidenceIds') e(value) LOOP
      IF NOT (v_item=ANY(v_evidence_ids)) THEN v_evidence_ids:=pg_catalog.array_append(v_evidence_ids,v_item); END IF;
    END LOOP;
  END LOOP;

  v_count := pg_catalog.cardinality(v_decision_ids);
  v_mean_expected := (SELECT pg_catalog.avg(x) FROM pg_catalog.unnest(v_expected_values) x);
  v_mean_actual := (SELECT pg_catalog.avg(x) FROM pg_catalog.unnest(v_actual_values) x);
  v_mean_difference := (SELECT pg_catalog.avg(x) FROM pg_catalog.unnest(v_differences) x);
  v_mean_absolute_difference := (SELECT pg_catalog.avg(pg_catalog.abs(x)) FROM pg_catalog.unnest(v_differences) x);
  v_mean_absolute_percent := (SELECT pg_catalog.avg(pg_catalog.abs(x)) FROM pg_catalog.unnest(v_percentages) x);
  v_percentage_count := (SELECT pg_catalog.count(*)::integer FROM pg_catalog.unnest(v_percentages) x);

  SELECT pg_catalog.array_agg(x ORDER BY x) INTO v_sorted_differences
    FROM pg_catalog.unnest(v_differences) x;
  v_median_difference := CASE
    WHEN v_count%2=1 THEN v_sorted_differences[(v_count+1)/2]
    ELSE (v_sorted_differences[v_count/2]+v_sorted_differences[(v_count/2)+1])/2
  END;

  v_source_fingerprint := pg_catalog.md5(v_rule_id||':'||v_base_version||':'||v_source_memory_snapshots::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':decision-policy-learning-source:'||v_rule_id||':'||v_base_version,0)
  );

  SELECT c.id INTO v_existing_candidate_id
    FROM public.decision_policy_learning_candidates c
   WHERE c.organization_id=v_org
     AND c.rule_id=v_rule_id
     AND c.base_profile_version=v_base_version
     AND c.source_fingerprint=v_source_fingerprint;
  IF FOUND THEN
    v_candidate := public._decision_policy_learning_candidate_snapshot(v_org,v_existing_candidate_id);
    RETURN pg_catalog.jsonb_build_object('ok',true,'duplicate',true,'candidate',v_candidate);
  END IF;

  SELECT coalesce(pg_catalog.max(c.candidate_version),1)+1
    INTO v_candidate_version
    FROM public.decision_policy_learning_candidates c
   WHERE c.organization_id=v_org AND c.rule_id=v_rule_id AND c.base_profile_version=v_base_version;

  v_candidate_snapshot := pg_catalog.jsonb_build_object(
    'schemaVersion','1.0.0',
    'purpose','CALIBRATION_REVIEW_ONLY_NOT_ACTIVE',
    'ruleId',v_rule_id,
    'baseProfileVersion',v_base_version,
    'candidateVersion',v_candidate_version,
    'metricContext',pg_catalog.jsonb_build_object(
      'metricKey',v_metric_key,'unit',v_metric_unit,'currency',v_currency,
      'unitOfMeasure',v_unit_of_measure,'period',v_period,
      'formulaId',v_formula_id,'formulaVersion',v_formula_version
    ),
    'sourceDecisionIds',pg_catalog.to_jsonb(v_decision_ids),
    'sourceMemorySnapshots',v_source_memory_snapshots,
    'observations',v_observations,
    'calibration',pg_catalog.jsonb_build_object(
      'sampleCount',v_count,
      'meanExpectedValue',v_mean_expected,
      'meanActualValue',v_mean_actual,
      'meanSignedDifference',v_mean_difference,
      'medianSignedDifference',v_median_difference,
      'meanAbsoluteDifference',v_mean_absolute_difference,
      'meanAbsoluteDifferencePercent',v_mean_absolute_percent,
      'percentageSampleCount',v_percentage_count,
      'zeroBaselineCount',v_zero_baseline_count,
      'aboveExpectedCount',v_above_count,
      'belowExpectedCount',v_below_count,
      'equalExpectedCount',v_equal_count
    ),
    'lessons',(SELECT coalesce(pg_catalog.jsonb_agg(to_jsonb(x) ORDER BY x),'[]'::jsonb) FROM pg_catalog.unnest(v_lessons) x),
    'evidenceIds',(SELECT coalesce(pg_catalog.jsonb_agg(to_jsonb(x) ORDER BY x),'[]'::jsonb) FROM pg_catalog.unnest(v_evidence_ids) x),
    'sourceCoverage','SELECTED_VERIFIED_MEASUREMENTS',
    'activeProfileChanged',false,
    'createdAt',v_now,
    'activationInstruction','NOT_ACTIVE_UNTIL_A_SEPARATE_EXPLICIT_PROFILE_RELEASE'
  );

  INSERT INTO public.decision_policy_learning_candidates(
    id,organization_id,rule_id,base_profile_version,candidate_version,state,version,
    source_fingerprint,candidate_snapshot,created_by_profile_id,created_by_role,created_at,updated_at
  ) VALUES (
    v_candidate_id,v_org,v_rule_id,v_base_version,v_candidate_version,'DRAFT',1,
    v_source_fingerprint,v_candidate_snapshot,v_actor,v_role,v_now,v_now
  );

  v_candidate := public._decision_policy_learning_candidate_snapshot(v_org,v_candidate_id);
  v_event_snapshot := v_candidate||pg_catalog.jsonb_build_object(
    'eventCount',1,
    'history',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',pg_catalog.gen_random_uuid()::text,'type','CREATE','version',1,
      'at',v_now,'actorProfileId',v_actor::text,'actorRole',v_role,'reason',NULL
    ))
  );
  v_result := pg_catalog.jsonb_build_object('ok',true,'duplicate',false,'candidate',v_event_snapshot);

  INSERT INTO public.decision_policy_learning_events(
    organization_id,candidate_id,event_id,event_type,version_after,actor_profile_id,actor_role,
    idempotency_key,command_payload,result_snapshot,created_at
  ) VALUES (
    v_org,v_candidate_id,v_event_snapshot->'history'->0->>'id','CREATE',1,v_actor,v_role,
    pg_catalog.btrim(p_idempotency_key),v_payload,v_result,v_now
  );

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'decision_policy_learning.candidate_created','decision_policy_learning_candidate',v_candidate_id,NULL,v_event_snapshot);

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.command_decision_policy_learning_candidate(
  p_candidate_id uuid,
  p_event_id text,
  p_idempotency_key text,
  p_expected_version integer,
  p_event_type text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_role text;
  v_state text;
  v_version integer;
  v_creator uuid;
  v_next_state text;
  v_payload jsonb;
  v_existing_actor uuid;
  v_existing_payload jsonb;
  v_existing_result jsonb;
  v_candidate jsonb;
  v_event_snapshot jsonb;
  v_event_id text;
  v_result jsonb;
  v_old_snapshot jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for outcome learning review';
  END IF;

  SELECT p.id,p.organization_id,r.role
    INTO v_actor,v_org,v_role
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_actor IS NULL OR v_org IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization required';
  END IF;

  IF p_candidate_id IS NULL
     OR p_event_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_event_id)) NOT BETWEEN 1 AND 100
     OR p_idempotency_key IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 100
     OR p_expected_version IS NULL OR p_expected_version<1
     OR p_event_type NOT IN ('SUBMIT_FOR_REVIEW','APPROVE','REJECT')
     OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid outcome learning candidate command';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'candidateId',p_candidate_id::text,'expectedVersion',p_expected_version,
    'eventType',p_event_type,'reason',pg_catalog.btrim(p_reason)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':decision-policy-learning:'||pg_catalog.btrim(p_idempotency_key),0)
  );

  SELECT e.actor_profile_id,e.command_payload,e.result_snapshot
    INTO v_existing_actor,v_existing_payload,v_existing_result
    FROM public.decision_policy_learning_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing_actor IS DISTINCT FROM v_actor OR v_existing_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='outcome learning command idempotency conflict';
    END IF;
    RETURN v_existing_result||pg_catalog.jsonb_build_object('duplicate',true);
  END IF;

  SELECT c.state,c.version,c.created_by_profile_id
    INTO v_state,v_version,v_creator
    FROM public.decision_policy_learning_candidates c
   WHERE c.organization_id=v_org AND c.id=p_candidate_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='candidate is unavailable in the active organization';
  END IF;
  IF v_version<>p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='candidate version changed; reload before retrying';
  END IF;

  v_next_state := CASE
    WHEN v_state='DRAFT' AND p_event_type='SUBMIT_FOR_REVIEW' THEN 'IN_REVIEW'
    WHEN v_state='IN_REVIEW' AND p_event_type='APPROVE' THEN 'APPROVED'
    WHEN v_state='IN_REVIEW' AND p_event_type='REJECT' THEN 'REJECTED'
    ELSE NULL
  END;
  IF v_next_state IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid outcome learning candidate transition';
  END IF;

  IF p_event_type IN ('APPROVE','REJECT') AND v_creator=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='maker-checker rule: candidate creator cannot approve or reject the same candidate';
  END IF;

  v_old_snapshot := public._decision_policy_learning_candidate_snapshot(v_org,p_candidate_id);

  UPDATE public.decision_policy_learning_candidates
     SET state=v_next_state,
         version=v_version+1,
         submitted_by_profile_id=CASE WHEN p_event_type='SUBMIT_FOR_REVIEW' THEN v_actor ELSE submitted_by_profile_id END,
         submitted_at=CASE WHEN p_event_type='SUBMIT_FOR_REVIEW' THEN v_now ELSE submitted_at END,
         reviewed_by_profile_id=CASE WHEN p_event_type IN ('APPROVE','REJECT') THEN v_actor ELSE reviewed_by_profile_id END,
         reviewed_at=CASE WHEN p_event_type IN ('APPROVE','REJECT') THEN v_now ELSE reviewed_at END,
         review_reason=CASE WHEN p_event_type IN ('APPROVE','REJECT') THEN pg_catalog.btrim(p_reason) ELSE review_reason END,
         updated_at=v_now
   WHERE organization_id=v_org AND id=p_candidate_id;

  v_event_id := pg_catalog.btrim(p_event_id);
  v_candidate := public._decision_policy_learning_candidate_snapshot(v_org,p_candidate_id);
  v_event_snapshot := v_candidate||pg_catalog.jsonb_build_object(
    'eventCount',coalesce((v_candidate->>'eventCount')::integer,0)+1,
    'history',coalesce(v_candidate->'history','[]'::jsonb)||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id',v_event_id,'type',p_event_type,'version',v_version+1,
        'at',v_now,'actorProfileId',v_actor::text,'actorRole',v_role,'reason',pg_catalog.btrim(p_reason)
      )
    )
  );
  v_result := pg_catalog.jsonb_build_object('ok',true,'duplicate',false,'candidate',v_event_snapshot);

  INSERT INTO public.decision_policy_learning_events(
    organization_id,candidate_id,event_id,event_type,version_after,actor_profile_id,actor_role,
    idempotency_key,command_payload,result_snapshot,created_at
  ) VALUES (
    v_org,p_candidate_id,v_event_id,p_event_type,v_version+1,v_actor,v_role,
    pg_catalog.btrim(p_idempotency_key),v_payload,v_result,v_now
  );

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'decision_policy_learning.'||pg_catalog.lower(p_event_type),
    'decision_policy_learning_candidate',p_candidate_id,v_old_snapshot,v_event_snapshot);

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_decision_policy_learning_candidates(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_items jsonb;
  v_total integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read outcome learning candidates';
  END IF;

  SELECT p.id,p.organization_id
    INTO v_actor,v_org
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization required';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='outcome learning pagination is invalid';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_total
    FROM public.decision_policy_learning_candidates c
   WHERE c.organization_id=v_org;

  SELECT coalesce(pg_catalog.jsonb_agg(
    public._decision_policy_learning_candidate_snapshot(v_org,page.id)
    ORDER BY page.updated_at DESC,page.id DESC
  ),'[]'::jsonb)
    INTO v_items
    FROM (
      SELECT c.id,c.updated_at
        FROM public.decision_policy_learning_candidates c
       WHERE c.organization_id=v_org
       ORDER BY c.updated_at DESC,c.id DESC
       LIMIT p_limit OFFSET p_offset
    ) page;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,'total',v_total,'limit',p_limit,'offset',p_offset
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_decision_policy_learning_candidate(uuid[],text)
  FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.command_decision_policy_learning_candidate(uuid,text,text,integer,text,text)
  FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.fetch_decision_policy_learning_candidates(integer,integer)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_decision_policy_learning_candidate(uuid[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.command_decision_policy_learning_candidate(uuid,text,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_decision_policy_learning_candidates(integer,integer) TO authenticated;

COMMENT ON TABLE public.decision_policy_learning_candidates IS
  'Immutable evidence-backed calibration candidates for human review; APPROVED does not activate or replace the base rule/profile.';
COMMENT ON TABLE public.decision_policy_learning_events IS
  'Append-only audit trail for candidate creation, submission, approval and rejection.';
COMMENT ON FUNCTION public.create_decision_policy_learning_candidate(uuid[],text) IS
  'Builds a source-derived versioned candidate from measured, same-tenant decisions with verified matching metrics and reviewed lessons. First candidate is v2; never changes the active profile.';
COMMENT ON FUNCTION public.command_decision_policy_learning_candidate(uuid,text,text,integer,text,text) IS
  'Performs optimistic, idempotent DRAFT->IN_REVIEW->APPROVED/REJECTED transitions with maker-checker enforcement and append-only audit.';
COMMENT ON FUNCTION public.fetch_decision_policy_learning_candidates(integer,integer) IS
  'Reads the authenticated finance tenant candidate collection and immutable event history.';

