-- Immutable, tenant-scoped decision memory on the existing decision lifecycle.
-- This migration is source-only until applied by the authorized Bolt/database workflow.

CREATE OR REPLACE FUNCTION public._deny_decision_memory_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'decision memory snapshots and events are append-only';
END;
$function$;

CREATE TABLE IF NOT EXISTS public.decision_memory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  decision_outcome_id uuid NOT NULL REFERENCES public.decision_outcomes(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  captured_at timestamptz NOT NULL DEFAULT now(),
  as_of timestamptz NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  actor_role text NOT NULL,
  reason text,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  UNIQUE (organization_id, decision_outcome_id, version)
);

CREATE INDEX IF NOT EXISTS decision_memory_snapshots_latest_idx
  ON public.decision_memory_snapshots(organization_id, decision_outcome_id, version DESC);

CREATE TABLE IF NOT EXISTS public.decision_memory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  decision_outcome_id uuid NOT NULL REFERENCES public.decision_outcomes(id) ON DELETE RESTRICT,
  snapshot_id uuid NOT NULL REFERENCES public.decision_memory_snapshots(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('CAPTURE', 'CORRECT')),
  version_from integer NOT NULL CHECK (version_from >= 0),
  version_to integer NOT NULL CHECK (version_to > 0),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  actor_role text NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 100),
  command_payload jsonb NOT NULL CHECK (jsonb_typeof(command_payload) = 'object'),
  result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (snapshot_id)
);

ALTER TABLE public.decision_memory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_memory_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.decision_memory_snapshots, public.decision_memory_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.decision_memory_snapshots, public.decision_memory_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.decision_memory_snapshots, public.decision_memory_events FROM service_role;
REVOKE ALL ON FUNCTION public._deny_decision_memory_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS decision_memory_snapshots_append_only ON public.decision_memory_snapshots;
CREATE TRIGGER decision_memory_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.decision_memory_snapshots
  FOR EACH ROW EXECUTE FUNCTION public._deny_decision_memory_mutation();

DROP TRIGGER IF EXISTS decision_memory_events_append_only ON public.decision_memory_events;
CREATE TRIGGER decision_memory_events_append_only
  BEFORE UPDATE OR DELETE ON public.decision_memory_events
  FOR EACH ROW EXECUTE FUNCTION public._deny_decision_memory_mutation();

CREATE OR REPLACE FUNCTION public._decision_memory_resolve_evidence(
  p_organization_id uuid,
  p_evidence_ids text[],
  p_namespace text,
  p_period jsonb,
  p_as_of timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH requested AS (
    SELECT u.evidence_id, u.ordinality
      FROM pg_catalog.unnest(coalesce(p_evidence_ids, ARRAY[]::text[]))
        WITH ORDINALITY AS u(evidence_id, ordinality)
  ),
  resolved AS (
    SELECT r.evidence_id, r.ordinality,
           'customer_invoices'::text AS source_name,
           i.id::text AS record_id,
           i.issued_at AS source_timestamp,
           pg_catalog.upper(i.currency) AS currency
      FROM requested r
      JOIN public.customer_invoices i
        ON r.evidence_id = 'invoice:' || i.id::text
       AND i.organization_id = p_organization_id
    UNION ALL
    SELECT r.evidence_id, r.ordinality,
           'customer_payments'::text AS source_name,
           p.id::text AS record_id,
           p.paid_at AS source_timestamp,
           pg_catalog.upper(i.currency) AS currency
      FROM requested r
      JOIN public.customer_payments p
        ON r.evidence_id = 'payment:' || p.id::text
       AND p.organization_id = p_organization_id
      JOIN public.customer_invoices i
        ON i.id = p.invoice_id
       AND i.organization_id = p.organization_id
  )
  SELECT pg_catalog.jsonb_build_object(
    'ids',
    coalesce(
      pg_catalog.jsonb_agg(p_namespace || ':' || r.evidence_id ORDER BY r.ordinality),
      '[]'::jsonb
    ),
    'records',
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', p_namespace || ':' || r.evidence_id,
          'source', pg_catalog.jsonb_build_object(
            'kind', 'TABLE',
            'name', r.source_name,
            'recordId', r.record_id
          ),
          'sourceTimestamp', r.source_timestamp,
          'asOf', p_as_of,
          'period', p_period,
          'currency', r.currency,
          'status', 'VERIFIED',
          'completeness', 'COMPLETE',
          'quality', 'ACCEPTABLE',
          'warnings', '[]'::jsonb
        ) ORDER BY r.ordinality
      ),
      '[]'::jsonb
    )
  )
  FROM resolved r
  WHERE r.source_timestamp IS NOT NULL
    AND r.source_timestamp <= p_as_of;
$function$;

REVOKE ALL ON FUNCTION public._decision_memory_resolve_evidence(uuid, text[], text, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._decision_memory_snapshot(
  p_organization_id uuid,
  p_decision_outcome_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_snapshot_id uuid;
  v_version integer;
  v_captured_at timestamptz;
  v_payload jsonb;
  v_measured jsonb;
  v_result jsonb;
  v_period jsonb;
  v_as_of timestamptz;
  v_actual_as_of timestamptz;
  v_actual_period jsonb;
  v_evidence_ids text[];
  v_resolved jsonb;
  v_actual_metric jsonb;
BEGIN
  SELECT s.id, s.version, s.captured_at, s.payload, o.measured_outcome
    INTO v_snapshot_id, v_version, v_captured_at, v_payload, v_measured
    FROM public.decision_memory_snapshots s
    JOIN public.decision_outcomes o
      ON o.id = s.decision_outcome_id
     AND o.organization_id = s.organization_id
   WHERE s.organization_id = p_organization_id
     AND s.decision_outcome_id = p_decision_outcome_id
   ORDER BY s.version DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_result := v_payload || pg_catalog.jsonb_build_object(
    'id', v_snapshot_id::text,
    'decisionId', p_decision_outcome_id::text,
    'version', v_version,
    'capturedAt', v_captured_at,
    'actualMetric', NULL
  );

  -- A source-backed measurement is projected from the existing terminal lifecycle
  -- event; the legacy numeric summary alone is never promoted to verified evidence.
  IF v_measured IS NOT NULL
     AND pg_catalog.jsonb_typeof(v_measured) = 'object'
     AND pg_catalog.jsonb_typeof(v_measured->'evidenceIds') = 'array'
     AND pg_catalog.jsonb_typeof(v_measured->'period') = 'object'
     AND v_measured->>'status' = 'VERIFIED'
     AND v_measured->>'completeness' = 'COMPLETE'
     AND v_measured->>'quality' = 'ACCEPTABLE' THEN
    BEGIN
      v_actual_as_of := (v_measured->>'asOf')::timestamptz;
      v_actual_period := v_measured->'period';
      v_evidence_ids := ARRAY(
        SELECT e.value #>> '{}'
          FROM pg_catalog.jsonb_array_elements(v_measured->'evidenceIds') e(value)
      );
      IF v_actual_as_of IS NOT NULL
         AND pg_catalog.cardinality(v_evidence_ids) > 0
         AND pg_catalog.cardinality(v_evidence_ids) = (
           SELECT pg_catalog.count(DISTINCT x)::integer
             FROM pg_catalog.unnest(v_evidence_ids) x
         ) THEN
        v_resolved := public._decision_memory_resolve_evidence(
          p_organization_id,
          v_evidence_ids,
          'dmactual:' || v_snapshot_id::text,
          v_actual_period,
          v_actual_as_of
        );
        IF pg_catalog.jsonb_array_length(v_resolved->'ids') = pg_catalog.cardinality(v_evidence_ids) THEN
          v_actual_metric := pg_catalog.jsonb_build_object(
            'id', 'decision-actual:' || p_decision_outcome_id::text,
            'key', v_measured->>'metricKey',
            'value', v_measured->'value',
            'unit', v_measured->>'unit',
            'currency', v_measured->'currency',
            'status', v_measured->>'status',
            'completeness', v_measured->>'completeness',
            'quality', v_measured->>'quality',
            'period', v_actual_period,
            'asOf', v_actual_as_of,
            'lineage', pg_catalog.jsonb_build_object(
              'evidenceIds', v_resolved->'ids',
              'calculatedAt', v_measured->>'measuredAt',
              'formulaId', v_measured->>'formulaId',
              'formulaVersion', v_measured->>'formulaVersion',
              'transformations', pg_catalog.jsonb_build_array('server-validated decision outcome measurement')
            ),
            'warnings', '[]'::jsonb
          );
          v_result := pg_catalog.jsonb_set(v_result, '{actualMetric}', v_actual_metric, true);
          v_result := pg_catalog.jsonb_set(
            v_result,
            '{evidenceRecords}',
            coalesce(v_result->'evidenceRecords', '[]'::jsonb) || v_resolved->'records',
            true
          );
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Malformed or no-longer-resolvable source evidence remains withheld.
      v_result := pg_catalog.jsonb_set(v_result, '{actualMetric}', 'null'::jsonb, true);
    END;
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public._decision_memory_snapshot(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_decision_memory_snapshot(
  p_decision_outcome_id uuid,
  p_expected_version integer,
  p_snapshot jsonb,
  p_reason text,
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
  v_outcome_created_at timestamptz;
  v_outcome_state text;
  v_current_version integer := 0;
  v_current_payload jsonb;
  v_snapshot_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := pg_catalog.now();
  v_as_of timestamptz;
  v_period_from date;
  v_period_to date;
  v_period jsonb;
  v_fact_ids text[] := ARRAY[]::text[];
  v_expected_ids text[];
  v_expected_resolved jsonb;
  v_expected_metric jsonb := NULL;
  v_expected_key text;
  v_expected_currency text;
  v_expected_total numeric(18,2);
  v_expected_invoice_count integer;
  v_unresolved integer;
  v_resolved jsonb;
  v_evidence_records jsonb := '[]'::jsonb;
  v_facts jsonb := '[]'::jsonb;
  v_opinions jsonb := '[]'::jsonb;
  v_hypotheses jsonb := '[]'::jsonb;
  v_item jsonb;
  v_statement_id text;
  v_statement_text text;
  v_statement_evidence text[];
  v_statement_kind text;
  v_array_name text;
  v_input_array jsonb;
  v_normalized_array jsonb;
  v_assumptions jsonb;
  v_alternatives jsonb;
  v_lessons jsonb;
  v_chosen_option_id text;
  v_review_disposition text;
  v_review_at timestamptz;
  v_action_taken text;
  v_problem text;
  v_payload jsonb;
  v_command_payload jsonb;
  v_existing_actor uuid;
  v_existing_payload jsonb;
  v_existing_result jsonb;
  v_corrections jsonb := '[]'::jsonb;
  v_correction jsonb;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'finance permission required for decision memory';
  END IF;

  SELECT p.id, p.organization_id, r.role
    INTO v_actor, v_org, v_role
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id = p.id
   WHERE p.auth_user_id = auth.uid()
     AND p.is_active
     AND r.role IN ('admin', 'manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active finance organization required';
  END IF;

  IF p_decision_outcome_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 10000
     OR p_idempotency_key IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 100
     OR p_snapshot IS NULL OR pg_catalog.jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(p_snapshot) k(key)
        WHERE k.key NOT IN (
          'asOf','period','problem','factsReviewed','facts','opinions','hypotheses',
          'assumptions','alternatives','chosenOptionId','assumptionsReviewed',
          'actionTaken','reviewDisposition','reviewAt','lessonsReviewed','lessons','expectedMetric'
        )
     )
     OR EXISTS (
       SELECT 1 FROM unnest(ARRAY[
         'asOf','period','problem','factsReviewed','facts','opinions','hypotheses',
         'assumptions','alternatives','chosenOptionId','assumptionsReviewed',
         'actionTaken','reviewDisposition','reviewAt','lessonsReviewed','lessons','expectedMetric'
       ]) required(key)
       WHERE NOT (p_snapshot ? required.key)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory snapshot payload is invalid';
  END IF;

  v_command_payload := pg_catalog.jsonb_build_object(
    'decisionOutcomeId', p_decision_outcome_id::text,
    'expectedVersion', p_expected_version,
    'snapshot', p_snapshot,
    'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':decision-memory:' || p_idempotency_key, 0)
  );

  SELECT e.actor_profile_id, e.command_payload, e.result_snapshot
    INTO v_existing_actor, v_existing_payload, v_existing_result
    FROM public.decision_memory_events e
   WHERE e.organization_id = v_org
     AND e.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_actor <> v_actor OR v_existing_payload IS DISTINCT FROM v_command_payload THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'decision memory idempotency payload conflict';
    END IF;
    RETURN v_existing_result || pg_catalog.jsonb_build_object('duplicate', true);
  END IF;

  SELECT o.created_at, o.state
    INTO v_outcome_created_at, v_outcome_state
    FROM public.decision_outcomes o
   WHERE o.organization_id = v_org
     AND o.id = p_decision_outcome_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'decision outcome is unavailable in the active organization';
  END IF;

  SELECT s.version, s.payload
    INTO v_current_version, v_current_payload
    FROM public.decision_memory_snapshots s
   WHERE s.organization_id = v_org
     AND s.decision_outcome_id = p_decision_outcome_id
   ORDER BY s.version DESC
   LIMIT 1
   FOR UPDATE;
  v_current_version := coalesce(v_current_version, 0);

  IF p_expected_version <> v_current_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'decision memory version changed; reload before correction';
  END IF;
  IF v_current_version > 0 AND (
    p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 3 AND 2000
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a correction reason of at least three characters is required';
  END IF;

  BEGIN
    v_as_of := (p_snapshot->>'asOf')::timestamptz;
    v_period_from := (p_snapshot->'period'->>'from')::date;
    v_period_to := (p_snapshot->'period'->>'to')::date;
    IF p_snapshot->>'reviewAt' IS NOT NULL AND p_snapshot->>'reviewAt' <> '' THEN
      v_review_at := (p_snapshot->>'reviewAt')::timestamptz;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory dates are invalid';
  END;
  IF pg_catalog.jsonb_typeof(p_snapshot->'period') IS DISTINCT FROM 'object'
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(p_snapshot->'period') k(key)
        WHERE k.key NOT IN ('from','to')
     )
     OR v_as_of IS NULL OR v_as_of > v_now
     OR v_as_of > v_outcome_created_at
     OR v_period_from IS NULL OR v_period_to IS NULL
     OR v_period_from > v_period_to
     OR v_period_from < (v_as_of AT TIME ZONE 'UTC')::date
     OR v_period_to > ((v_as_of AT TIME ZONE 'UTC')::date + 90)
     OR pg_catalog.jsonb_typeof(p_snapshot->'factsReviewed') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(p_snapshot->'facts') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_snapshot->'facts') > 100
     OR pg_catalog.jsonb_typeof(p_snapshot->'opinions') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_snapshot->'opinions') > 100
     OR pg_catalog.jsonb_typeof(p_snapshot->'hypotheses') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_snapshot->'hypotheses') > 100
     OR pg_catalog.jsonb_typeof(p_snapshot->'assumptions') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_snapshot->'assumptions') > 100
     OR pg_catalog.jsonb_typeof(p_snapshot->'alternatives') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_snapshot->'alternatives') > 50
     OR pg_catalog.jsonb_typeof(p_snapshot->'assumptionsReviewed') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(p_snapshot->'lessonsReviewed') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(p_snapshot->'lessons') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_snapshot->'lessons') > 100
     OR (p_snapshot->>'problem' IS NOT NULL AND pg_catalog.char_length(p_snapshot->>'problem') > 2000)
     OR (p_snapshot->>'actionTaken' IS NOT NULL AND pg_catalog.char_length(p_snapshot->>'actionTaken') > 2000)
     OR (v_outcome_state = 'MEASURED' AND p_snapshot->'lessonsReviewed' <> 'true'::jsonb) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory snapshot scope or field constraints are invalid';
  END IF;

  v_period := pg_catalog.jsonb_build_object('from', v_period_from::text, 'to', v_period_to::text);
  v_review_disposition := p_snapshot->>'reviewDisposition';
  IF v_review_disposition IS NULL OR v_review_disposition NOT IN ('SCHEDULED','NOT_SCHEDULED','NOT_REQUIRED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory review disposition is required';
  END IF;
  IF v_review_disposition = 'SCHEDULED' THEN
    IF v_review_at IS NULL OR v_review_at < v_now THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'scheduled decision review must have a future date';
    END IF;
  ELSIF v_review_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'review date is only allowed for a scheduled review';
  END IF;

  -- The baseline is server-calculated from the complete same-tenant receivables source set.
  IF p_snapshot->'expectedMetric' IS NOT NULL AND p_snapshot->'expectedMetric' <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(p_snapshot->'expectedMetric') IS DISTINCT FROM 'object'
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_object_keys(p_snapshot->'expectedMetric') k(key)
          WHERE k.key NOT IN ('key','currency')
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected metric request is invalid';
    END IF;
    v_expected_key := p_snapshot->'expectedMetric'->>'key';
    v_expected_currency := pg_catalog.upper(p_snapshot->'expectedMetric'->>'currency');
    IF v_expected_key IS NULL OR v_expected_key <> 'cashflow.expected_collections'
       OR v_expected_currency IS NULL OR v_expected_currency !~ '^[A-Z]{3}
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected metric key or currency is invalid';
    END IF;

    SELECT pg_catalog.count(*)::integer
      INTO v_unresolved
      FROM public.customer_invoices i
     WHERE i.organization_id = v_org
       AND i.status IN ('issued','partially_paid')
       AND i.issued_at <= v_as_of
       AND pg_catalog.upper(i.currency) = v_expected_currency
       AND i.total_amount > coalesce((
         SELECT pg_catalog.sum(p.amount)
           FROM public.customer_payments p
          WHERE p.organization_id = v_org
            AND p.invoice_id = i.id
            AND p.paid_at <= v_as_of
       ),0)
       AND i.due_at IS NULL;
    IF v_unresolved > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected metric blocked by invoices with unresolved due dates';
    END IF;

    WITH paid AS (
      SELECT p.invoice_id,pg_catalog.sum(p.amount)::numeric(18,2) AS paid_amount
        FROM public.customer_payments p
       WHERE p.organization_id = v_org
         AND p.paid_at <= v_as_of
       GROUP BY p.invoice_id
    ),
    scoped AS (
      SELECT i.id,i.total_amount,coalesce(p.paid_amount,0) AS paid_amount
        FROM public.customer_invoices i
        LEFT JOIN paid p ON p.invoice_id = i.id
       WHERE i.organization_id = v_org
         AND i.status IN ('issued','partially_paid')
         AND i.issued_at <= v_as_of
         AND pg_catalog.upper(i.currency) = v_expected_currency
         AND (i.due_at AT TIME ZONE 'UTC')::date BETWEEN v_period_from AND v_period_to
         AND i.total_amount > coalesce(p.paid_amount,0)
    ),
    expected_ids AS (
      SELECT 'invoice:' || s.id::text AS evidence_id FROM scoped s
      UNION ALL
      SELECT 'payment:' || p.id::text
        FROM public.customer_payments p
        JOIN scoped s ON s.id = p.invoice_id
       WHERE p.organization_id = v_org
         AND p.paid_at <= v_as_of
    )
    SELECT
      (SELECT pg_catalog.array_agg(evidence_id ORDER BY evidence_id) FROM expected_ids),
      (SELECT pg_catalog.sum(GREATEST(total_amount-paid_amount,0))::numeric(18,2) FROM scoped),
      (SELECT pg_catalog.count(*)::integer FROM scoped)
      INTO v_expected_ids,v_expected_total,v_expected_invoice_count;

    IF coalesce(v_expected_invoice_count,0) = 0
       OR coalesce(pg_catalog.cardinality(v_expected_ids),0) = 0
       OR v_expected_total IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected metric has no complete source population in the selected period and currency';
    END IF;

    v_expected_resolved := public._decision_memory_resolve_evidence(
      v_org,v_expected_ids,'dmexpected:' || v_snapshot_id::text,v_period,v_as_of
    );
    IF pg_catalog.jsonb_array_length(v_expected_resolved->'ids') <> pg_catalog.cardinality(v_expected_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'expected metric source set is incomplete or outside the active organization';
    END IF;
    v_expected_metric := pg_catalog.jsonb_build_object(
      'id','decision-expected:' || p_decision_outcome_id::text,
      'key',v_expected_key,
      'value',v_expected_total,
      'unit','CURRENCY',
      'currency',v_expected_currency,
      'status','VERIFIED',
      'completeness','COMPLETE',
      'quality','ACCEPTABLE',
      'period',v_period,
      'asOf',v_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',v_expected_resolved->'ids',
        'calculatedAt',v_now,
        'formulaId','nasr1.receivables-outstanding',
        'formulaVersion','1',
        'transformations',pg_catalog.jsonb_build_array('complete same-tenant invoices minus payments as of decision timestamp')
      ),
      'warnings','[]'::jsonb
    );
    v_evidence_records := v_evidence_records || v_expected_resolved->'records';
  END IF;
  IF v_chosen_option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'alternatives') a(value)
     WHERE a.value->>'id' = v_chosen_option_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'chosen option must reference a saved alternative';
  END IF;
  IF v_outcome_state <> 'REJECTED' AND v_chosen_option_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a chosen alternative is required for this decision';
  END IF;

  -- Facts are accepted only with source IDs that resolve uniquely within this organization.
  FOR v_item IN SELECT f.value FROM pg_catalog.jsonb_array_elements(p_snapshot->'facts') f(value)
  LOOP
    v_statement_id := v_item->>'id';
    v_statement_text := v_item->>'text';
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR v_item->>'kind' <> 'FACT'
       OR v_statement_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_statement_id)) NOT BETWEEN 1 AND 100
       OR v_statement_text IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_statement_text)) NOT BETWEEN 1 AND 2000
       OR pg_catalog.jsonb_typeof(v_item->'evidenceIds') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(v_item->'evidenceIds') NOT BETWEEN 1 AND 50
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_item->'evidenceIds') e(value)
          WHERE pg_catalog.jsonb_typeof(e.value) IS DISTINCT FROM 'string'
             OR (e.value #>> '{}') !~ '^(invoice|payment):[0-9a-fA-F-]{36}$'
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'each fact requires a description and source invoice/payment evidence IDs';
    END IF;
    v_statement_evidence := ARRAY(
      SELECT e.value #>> '{}'
        FROM pg_catalog.jsonb_array_elements(v_item->'evidenceIds') e(value)
    );
    IF pg_catalog.cardinality(v_statement_evidence) <> (
      SELECT pg_catalog.count(DISTINCT x)::integer FROM pg_catalog.unnest(v_statement_evidence) x
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'fact evidence IDs must be unique';
    END IF;
    v_fact_ids := v_fact_ids || v_statement_evidence;
  END LOOP;
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'facts') f(value)
     GROUP BY f.value->>'id'
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'fact statement IDs must be unique';
  END IF;

  v_evidence_records := '[]'::jsonb;
  FOR v_item IN SELECT f.value FROM pg_catalog.jsonb_array_elements(p_snapshot->'facts') f(value)
  LOOP
    v_statement_id := v_item->>'id';
    v_statement_evidence := ARRAY(
      SELECT e.value #>> '{}'
        FROM pg_catalog.jsonb_array_elements(v_item->'evidenceIds') e(value)
    );
    v_resolved := public._decision_memory_resolve_evidence(
      v_org, v_statement_evidence,
      'dmfact:' || v_snapshot_id::text || ':' || v_statement_id,
      v_period, v_as_of
    );
    IF pg_catalog.jsonb_array_length(v_resolved->'ids') <> pg_catalog.cardinality(v_statement_evidence) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'one or more fact evidence records are missing, future-dated or outside the active organization';
    END IF;
    v_facts := v_facts || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_statement_id,
        'kind', 'FACT',
        'text', pg_catalog.btrim(v_item->>'text'),
        'actorRole', v_role,
        'recordedAt', v_now,
        'evidenceIds', v_resolved->'ids',
        'sourceEvidenceIds', to_jsonb(v_statement_evidence)
      )
    );
    v_evidence_records := v_evidence_records || (v_resolved->'records');
  END LOOP;

  FOR v_array_name, v_statement_kind IN
    SELECT x.array_name, x.statement_kind
      FROM (VALUES ('opinions','OPINION'),('hypotheses','HYPOTHESIS')) x(array_name,statement_kind)
  LOOP
    v_input_array := p_snapshot->v_array_name;
    v_normalized_array := '[]'::jsonb;
    FOR v_item IN SELECT a.value FROM pg_catalog.jsonb_array_elements(v_input_array) a(value)
    LOOP
      v_statement_id := v_item->>'id';
      v_statement_text := v_item->>'text';
      IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
         OR v_item->>'kind' <> v_statement_kind
         OR v_statement_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_statement_id)) NOT BETWEEN 1 AND 100
         OR v_statement_text IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_statement_text)) NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory opinion or hypothesis entry is invalid';
      END IF;
      v_normalized_array := v_normalized_array || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id',v_statement_id,'kind',v_statement_kind,'text',pg_catalog.btrim(v_statement_text),
          'actorRole',v_role,'recordedAt',v_now,'evidenceIds','[]'::jsonb
        )
      );
    END LOOP;
    IF v_array_name = 'opinions' THEN v_opinions := v_normalized_array;
    ELSE v_hypotheses := v_normalized_array;
    END IF;
  END LOOP;

  FOR v_item IN SELECT a.value FROM pg_catalog.jsonb_array_elements(p_snapshot->'alternatives') a(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR v_item->>'id' IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_item->>'id')) NOT BETWEEN 1 AND 100
       OR v_item->>'label' IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_item->>'label')) NOT BETWEEN 1 AND 300
       OR (v_item->>'rationale' IS NOT NULL AND pg_catalog.char_length(v_item->>'rationale') > 1000) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory alternative is invalid';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_snapshot->'alternatives') a(value)
     GROUP BY a.value->>'id' HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision alternative IDs must be unique';
  END IF;

  v_assumptions := p_snapshot->'assumptions';
  v_alternatives := coalesce((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',a.value->>'id',
        'label',pg_catalog.btrim(a.value->>'label'),
        'rationale',nullif(pg_catalog.btrim(coalesce(a.value->>'rationale','')),''),
        'evidenceIds','[]'::jsonb
      ) ORDER BY a.ordinality
    )
    FROM pg_catalog.jsonb_array_elements(p_snapshot->'alternatives') WITH ORDINALITY a(value,ordinality)
  ), '[]'::jsonb);
  v_lessons := p_snapshot->'lessons';
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_assumptions) x(value)
     WHERE pg_catalog.jsonb_typeof(x.value) IS DISTINCT FROM 'string'
        OR pg_catalog.char_length(x.value #>> '{}') > 2000
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_lessons) x(value)
     WHERE pg_catalog.jsonb_typeof(x.value) IS DISTINCT FROM 'string'
        OR pg_catalog.char_length(x.value #>> '{}') > 2000
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory assumptions or lessons are invalid';
  END IF;

  IF v_current_version > 0 AND p_snapshot = v_current_payload THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory has no changes to save';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'asOf',v_as_of,
    'period',v_period,
    'problem',nullif(pg_catalog.btrim(coalesce(p_snapshot->>'problem','')),''),
    'factsReviewed',(p_snapshot->'factsReviewed'),
    'facts',v_facts,
    'opinions',v_opinions,
    'hypotheses',v_hypotheses,
    'assumptions',v_assumptions,
    'alternatives',v_alternatives,
    'chosenOptionId',v_chosen_option_id,
    'assumptionsReviewed',(p_snapshot->'assumptionsReviewed'),
    'actionTaken',nullif(pg_catalog.btrim(coalesce(p_snapshot->>'actionTaken','')),''),
    'reviewDisposition',v_review_disposition,
    'reviewAt',CASE WHEN v_review_at IS NULL THEN NULL ELSE to_jsonb(v_review_at) END,
    'expectedMetric',v_expected_metric,
    'actualMetric',NULL,
    'lessonsReviewed',(p_snapshot->'lessonsReviewed'),
    'lessons',v_lessons,
    'evidenceRecords',v_evidence_records
  );

  IF v_current_version > 0 THEN
    v_corrections := coalesce(v_current_payload->'corrections','[]'::jsonb);
    v_correction := pg_catalog.jsonb_build_object(
      'id',pg_catalog.gen_random_uuid()::text,
      'fromVersion',v_current_version,
      'toVersion',v_current_version + 1,
      'recordedAt',v_now,
      'actorRole',v_role,
      'reason',pg_catalog.btrim(p_reason),
      'originalText',left(v_current_payload::text,4000),
      'correctedText',left(v_payload::text,4000),
      'evidenceIds','[]'::jsonb
    );
    v_corrections := v_corrections || pg_catalog.jsonb_build_array(v_correction);
    v_payload := pg_catalog.jsonb_set(v_payload,'{corrections}',v_corrections,true);
  ELSE
    v_payload := pg_catalog.jsonb_set(v_payload,'{corrections}','[]'::jsonb,true);
  END IF;

  INSERT INTO public.decision_memory_snapshots(
    id,organization_id,decision_outcome_id,version,captured_at,as_of,period_from,period_to,
    actor_profile_id,actor_role,reason,payload
  ) VALUES (
    v_snapshot_id,v_org,p_decision_outcome_id,v_current_version + 1,v_now,v_as_of,
    v_period_from,v_period_to,v_actor,v_role,
    CASE WHEN v_current_version=0 THEN NULL ELSE pg_catalog.btrim(p_reason) END,
    v_payload
  );

  v_result := pg_catalog.jsonb_build_object(
    'ok',true,
    'duplicate',false,
    'snapshot',public._decision_memory_snapshot(v_org,p_decision_outcome_id)
  );

  INSERT INTO public.decision_memory_events(
    organization_id,decision_outcome_id,snapshot_id,event_type,version_from,version_to,
    actor_profile_id,actor_role,idempotency_key,command_payload,result_snapshot
  ) VALUES (
    v_org,p_decision_outcome_id,v_snapshot_id,
    CASE WHEN v_current_version=0 THEN 'CAPTURE' ELSE 'CORRECT' END,
    v_current_version,v_current_version + 1,
    v_actor,v_role,p_idempotency_key,v_command_payload,v_result
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_org,v_actor,
    CASE WHEN v_current_version=0 THEN 'decision_memory.captured' ELSE 'decision_memory.corrected' END,
    'decision_memory_snapshot',v_snapshot_id,
    CASE WHEN v_current_payload IS NULL THEN NULL ELSE v_current_payload END,
    v_payload
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_decision_outcomes(
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
  IF NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'finance permission required to read decision outcomes';
  END IF;

  SELECT p.id,p.organization_id
    INTO v_actor,v_org
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id = p.id
   WHERE p.auth_user_id = auth.uid()
     AND p.is_active
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active finance organization required';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision outcome pagination is invalid';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_total
    FROM public.decision_outcomes o
   WHERE o.organization_id = v_org;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      page.snapshot || pg_catalog.jsonb_build_object(
        'memorySnapshot',public._decision_memory_snapshot(v_org,page.id)
      )
      ORDER BY page.updated_at DESC,page.id DESC
    ),
    '[]'::jsonb
  )
    INTO v_items
    FROM (
      SELECT o.id,o.updated_at,public._decision_outcome_snapshot(v_org,o.id) AS snapshot
        FROM public.decision_outcomes o
       WHERE o.organization_id = v_org
       ORDER BY o.updated_at DESC,o.id DESC
       LIMIT p_limit OFFSET p_offset
    ) page;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,'total',v_total,'limit',p_limit,'offset',p_offset
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._decision_memory_resolve_evidence(uuid,text[],text,jsonb,timestamptz)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._decision_memory_snapshot(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_decision_outcomes(integer,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_decision_outcomes(integer,integer)
  TO authenticated;

COMMENT ON FUNCTION public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text) IS
  'Captures or corrects an immutable, versioned decision-memory record. Identity, role, tenant, capture time, fact source references, event and audit are server-derived and atomic.';
COMMENT ON FUNCTION public.fetch_decision_outcomes(integer,integer) IS
  'Returns tenant-scoped decision lifecycle records with the latest immutable memory snapshot and a source-backed actual MetricSnapshot when the lifecycle has a validated measurement.';

     THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected metric key or currency is invalid';
    END IF;

    SELECT pg_catalog.count(*)::integer
      INTO v_unresolved
      FROM public.customer_invoices i
     WHERE i.organization_id = v_org
       AND i.status IN ('issued','partially_paid')
       AND i.issued_at <= v_as_of
       AND pg_catalog.upper(i.currency) = v_expected_currency
       AND i.total_amount > coalesce((
         SELECT pg_catalog.sum(p.amount)
           FROM public.customer_payments p
          WHERE p.organization_id = v_org
            AND p.invoice_id = i.id
            AND p.paid_at <= v_as_of
       ),0)
       AND i.due_at IS NULL;
    IF v_unresolved > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected metric blocked by invoices with unresolved due dates';
    END IF;

    WITH paid AS (
      SELECT p.invoice_id,pg_catalog.sum(p.amount)::numeric(18,2) AS paid_amount
        FROM public.customer_payments p
       WHERE p.organization_id = v_org
         AND p.paid_at <= v_as_of
       GROUP BY p.invoice_id
    ),
    scoped AS (
      SELECT i.id,i.total_amount,coalesce(p.paid_amount,0) AS paid_amount
        FROM public.customer_invoices i
        LEFT JOIN paid p ON p.invoice_id = i.id
       WHERE i.organization_id = v_org
         AND i.status IN ('issued','partially_paid')
         AND i.issued_at <= v_as_of
         AND pg_catalog.upper(i.currency) = v_expected_currency
         AND (i.due_at AT TIME ZONE 'UTC')::date BETWEEN v_period_from AND v_period_to
         AND i.total_amount > coalesce(p.paid_amount,0)
    ),
    expected_ids AS (
      SELECT 'invoice:' || s.id::text AS evidence_id FROM scoped s
      UNION ALL
      SELECT 'payment:' || p.id::text
        FROM public.customer_payments p
        JOIN scoped s ON s.id = p.invoice_id
       WHERE p.organization_id = v_org
         AND p.paid_at <= v_as_of
    )
    SELECT
      (SELECT pg_catalog.array_agg(evidence_id ORDER BY evidence_id) FROM expected_ids),
      (SELECT pg_catalog.sum(GREATEST(total_amount-paid_amount,0))::numeric(18,2) FROM scoped),
      (SELECT pg_catalog.count(*)::integer FROM scoped)
      INTO v_expected_ids,v_expected_total,v_expected_invoice_count;

    IF coalesce(v_expected_invoice_count,0) = 0
       OR coalesce(pg_catalog.cardinality(v_expected_ids),0) = 0
       OR v_expected_total IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expected metric has no complete source population in the selected period and currency';
    END IF;

    v_expected_resolved := public._decision_memory_resolve_evidence(
      v_org,v_expected_ids,'dmexpected:' || v_snapshot_id::text,v_period,v_as_of
    );
    IF pg_catalog.jsonb_array_length(v_expected_resolved->'ids') <> pg_catalog.cardinality(v_expected_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'expected metric source set is incomplete or outside the active organization';
    END IF;
    v_expected_metric := pg_catalog.jsonb_build_object(
      'id','decision-expected:' || p_decision_outcome_id::text,
      'key',v_expected_key,
      'value',v_expected_total,
      'unit','CURRENCY',
      'currency',v_expected_currency,
      'status','VERIFIED',
      'completeness','COMPLETE',
      'quality','ACCEPTABLE',
      'period',v_period,
      'asOf',v_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',v_expected_resolved->'ids',
        'calculatedAt',v_now,
        'formulaId','nasr1.receivables-outstanding',
        'formulaVersion','1',
        'transformations',pg_catalog.jsonb_build_array('complete same-tenant invoices minus payments as of decision timestamp')
      ),
      'warnings','[]'::jsonb
    );
    v_evidence_records := v_evidence_records || v_expected_resolved->'records';
  END IF;
  IF v_chosen_option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'alternatives') a(value)
     WHERE a.value->>'id' = v_chosen_option_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'chosen option must reference a saved alternative';
  END IF;
  IF v_outcome_state <> 'REJECTED' AND v_chosen_option_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a chosen alternative is required for this decision';
  END IF;

  -- Facts are accepted only with source IDs that resolve uniquely within this organization.
  FOR v_item IN SELECT f.value FROM pg_catalog.jsonb_array_elements(p_snapshot->'facts') f(value)
  LOOP
    v_statement_id := v_item->>'id';
    v_statement_text := v_item->>'text';
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR v_item->>'kind' <> 'FACT'
       OR v_statement_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_statement_id)) NOT BETWEEN 1 AND 100
       OR v_statement_text IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_statement_text)) NOT BETWEEN 1 AND 2000
       OR pg_catalog.jsonb_typeof(v_item->'evidenceIds') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(v_item->'evidenceIds') NOT BETWEEN 1 AND 50
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(v_item->'evidenceIds') e(value)
          WHERE pg_catalog.jsonb_typeof(e.value) IS DISTINCT FROM 'string'
             OR (e.value #>> '{}') !~ '^(invoice|payment):[0-9a-fA-F-]{36}$'
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'each fact requires a description and source invoice/payment evidence IDs';
    END IF;
    v_statement_evidence := ARRAY(
      SELECT e.value #>> '{}'
        FROM pg_catalog.jsonb_array_elements(v_item->'evidenceIds') e(value)
    );
    IF pg_catalog.cardinality(v_statement_evidence) <> (
      SELECT pg_catalog.count(DISTINCT x)::integer FROM pg_catalog.unnest(v_statement_evidence) x
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'fact evidence IDs must be unique';
    END IF;
    v_fact_ids := v_fact_ids || v_statement_evidence;
  END LOOP;
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_snapshot->'facts') f(value)
     GROUP BY f.value->>'id'
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'fact statement IDs must be unique';
  END IF;

  v_evidence_records := '[]'::jsonb;
  FOR v_item IN SELECT f.value FROM pg_catalog.jsonb_array_elements(p_snapshot->'facts') f(value)
  LOOP
    v_statement_id := v_item->>'id';
    v_statement_evidence := ARRAY(
      SELECT e.value #>> '{}'
        FROM pg_catalog.jsonb_array_elements(v_item->'evidenceIds') e(value)
    );
    v_resolved := public._decision_memory_resolve_evidence(
      v_org, v_statement_evidence,
      'dmfact:' || v_snapshot_id::text || ':' || v_statement_id,
      v_period, v_as_of
    );
    IF pg_catalog.jsonb_array_length(v_resolved->'ids') <> pg_catalog.cardinality(v_statement_evidence) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'one or more fact evidence records are missing, future-dated or outside the active organization';
    END IF;
    v_facts := v_facts || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_statement_id,
        'kind', 'FACT',
        'text', pg_catalog.btrim(v_item->>'text'),
        'actorRole', v_role,
        'recordedAt', v_now,
        'evidenceIds', v_resolved->'ids',
        'sourceEvidenceIds', to_jsonb(v_statement_evidence)
      )
    );
    v_evidence_records := v_evidence_records || (v_resolved->'records');
  END LOOP;

  FOR v_array_name, v_statement_kind IN
    SELECT x.array_name, x.statement_kind
      FROM (VALUES ('opinions','OPINION'),('hypotheses','HYPOTHESIS')) x(array_name,statement_kind)
  LOOP
    v_input_array := p_snapshot->v_array_name;
    v_normalized_array := '[]'::jsonb;
    FOR v_item IN SELECT a.value FROM pg_catalog.jsonb_array_elements(v_input_array) a(value)
    LOOP
      v_statement_id := v_item->>'id';
      v_statement_text := v_item->>'text';
      IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
         OR v_item->>'kind' <> v_statement_kind
         OR v_statement_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_statement_id)) NOT BETWEEN 1 AND 100
         OR v_statement_text IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_statement_text)) NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory opinion or hypothesis entry is invalid';
      END IF;
      v_normalized_array := v_normalized_array || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id',v_statement_id,'kind',v_statement_kind,'text',pg_catalog.btrim(v_statement_text),
          'actorRole',v_role,'recordedAt',v_now,'evidenceIds','[]'::jsonb
        )
      );
    END LOOP;
    IF v_array_name = 'opinions' THEN v_opinions := v_normalized_array;
    ELSE v_hypotheses := v_normalized_array;
    END IF;
  END LOOP;

  FOR v_item IN SELECT a.value FROM pg_catalog.jsonb_array_elements(p_snapshot->'alternatives') a(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR v_item->>'id' IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_item->>'id')) NOT BETWEEN 1 AND 100
       OR v_item->>'label' IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_item->>'label')) NOT BETWEEN 1 AND 300
       OR (v_item->>'rationale' IS NOT NULL AND pg_catalog.char_length(v_item->>'rationale') > 1000) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory alternative is invalid';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_snapshot->'alternatives') a(value)
     GROUP BY a.value->>'id' HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision alternative IDs must be unique';
  END IF;

  v_assumptions := p_snapshot->'assumptions';
  v_alternatives := coalesce((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',a.value->>'id',
        'label',pg_catalog.btrim(a.value->>'label'),
        'rationale',nullif(pg_catalog.btrim(coalesce(a.value->>'rationale','')),''),
        'evidenceIds','[]'::jsonb
      ) ORDER BY a.ordinality
    )
    FROM pg_catalog.jsonb_array_elements(p_snapshot->'alternatives') WITH ORDINALITY a(value,ordinality)
  ), '[]'::jsonb);
  v_lessons := p_snapshot->'lessons';
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_assumptions) x(value)
     WHERE pg_catalog.jsonb_typeof(x.value) IS DISTINCT FROM 'string'
        OR pg_catalog.char_length(x.value #>> '{}') > 2000
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_lessons) x(value)
     WHERE pg_catalog.jsonb_typeof(x.value) IS DISTINCT FROM 'string'
        OR pg_catalog.char_length(x.value #>> '{}') > 2000
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory assumptions or lessons are invalid';
  END IF;

  IF v_current_version > 0 AND p_snapshot = v_current_payload THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision memory has no changes to save';
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'asOf',v_as_of,
    'period',v_period,
    'problem',nullif(pg_catalog.btrim(coalesce(p_snapshot->>'problem','')),''),
    'factsReviewed',(p_snapshot->'factsReviewed'),
    'facts',v_facts,
    'opinions',v_opinions,
    'hypotheses',v_hypotheses,
    'assumptions',v_assumptions,
    'alternatives',v_alternatives,
    'chosenOptionId',v_chosen_option_id,
    'assumptionsReviewed',(p_snapshot->'assumptionsReviewed'),
    'actionTaken',nullif(pg_catalog.btrim(coalesce(p_snapshot->>'actionTaken','')),''),
    'reviewDisposition',v_review_disposition,
    'reviewAt',CASE WHEN v_review_at IS NULL THEN NULL ELSE to_jsonb(v_review_at) END,
    'expectedMetric',v_expected_metric,
    'actualMetric',NULL,
    'lessonsReviewed',(p_snapshot->'lessonsReviewed'),
    'lessons',v_lessons,
    'evidenceRecords',v_evidence_records
  );

  IF v_current_version > 0 THEN
    v_corrections := coalesce(v_current_payload->'corrections','[]'::jsonb);
    v_correction := pg_catalog.jsonb_build_object(
      'id',pg_catalog.gen_random_uuid()::text,
      'fromVersion',v_current_version,
      'toVersion',v_current_version + 1,
      'recordedAt',v_now,
      'actorRole',v_role,
      'reason',pg_catalog.btrim(p_reason),
      'originalText',left(v_current_payload::text,4000),
      'correctedText',left(v_payload::text,4000),
      'evidenceIds','[]'::jsonb
    );
    v_corrections := v_corrections || pg_catalog.jsonb_build_array(v_correction);
    v_payload := pg_catalog.jsonb_set(v_payload,'{corrections}',v_corrections,true);
  ELSE
    v_payload := pg_catalog.jsonb_set(v_payload,'{corrections}','[]'::jsonb,true);
  END IF;

  INSERT INTO public.decision_memory_snapshots(
    id,organization_id,decision_outcome_id,version,captured_at,as_of,period_from,period_to,
    actor_profile_id,actor_role,reason,payload
  ) VALUES (
    v_snapshot_id,v_org,p_decision_outcome_id,v_current_version + 1,v_now,v_as_of,
    v_period_from,v_period_to,v_actor,v_role,
    CASE WHEN v_current_version=0 THEN NULL ELSE pg_catalog.btrim(p_reason) END,
    v_payload
  );

  v_result := pg_catalog.jsonb_build_object(
    'ok',true,
    'duplicate',false,
    'snapshot',public._decision_memory_snapshot(v_org,p_decision_outcome_id)
  );

  INSERT INTO public.decision_memory_events(
    organization_id,decision_outcome_id,snapshot_id,event_type,version_from,version_to,
    actor_profile_id,actor_role,idempotency_key,command_payload,result_snapshot
  ) VALUES (
    v_org,p_decision_outcome_id,v_snapshot_id,
    CASE WHEN v_current_version=0 THEN 'CAPTURE' ELSE 'CORRECT' END,
    v_current_version,v_current_version + 1,
    v_actor,v_role,p_idempotency_key,v_command_payload,v_result
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_org,v_actor,
    CASE WHEN v_current_version=0 THEN 'decision_memory.captured' ELSE 'decision_memory.corrected' END,
    'decision_memory_snapshot',v_snapshot_id,
    CASE WHEN v_current_payload IS NULL THEN NULL ELSE v_current_payload END,
    v_payload
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_decision_outcomes(
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
  IF NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'finance permission required to read decision outcomes';
  END IF;

  SELECT p.id,p.organization_id
    INTO v_actor,v_org
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id = p.id
   WHERE p.auth_user_id = auth.uid()
     AND p.is_active
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active finance organization required';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision outcome pagination is invalid';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_total
    FROM public.decision_outcomes o
   WHERE o.organization_id = v_org;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      page.snapshot || pg_catalog.jsonb_build_object(
        'memorySnapshot',public._decision_memory_snapshot(v_org,page.id)
      )
      ORDER BY page.updated_at DESC,page.id DESC
    ),
    '[]'::jsonb
  )
    INTO v_items
    FROM (
      SELECT o.id,o.updated_at,public._decision_outcome_snapshot(v_org,o.id) AS snapshot
        FROM public.decision_outcomes o
       WHERE o.organization_id = v_org
       ORDER BY o.updated_at DESC,o.id DESC
       LIMIT p_limit OFFSET p_offset
    ) page;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,'total',v_total,'limit',p_limit,'offset',p_offset
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._decision_memory_resolve_evidence(uuid,text[],text,jsonb,timestamptz)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._decision_memory_snapshot(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_decision_outcomes(integer,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_decision_outcomes(integer,integer)
  TO authenticated;

COMMENT ON FUNCTION public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text) IS
  'Captures or corrects an immutable, versioned decision-memory record. Identity, role, tenant, capture time, fact source references, event and audit are server-derived and atomic.';
COMMENT ON FUNCTION public.fetch_decision_outcomes(integer,integer) IS
  'Returns tenant-scoped decision lifecycle records with the latest immutable memory snapshot and a source-backed actual MetricSnapshot when the lifecycle has a validated measurement.';
