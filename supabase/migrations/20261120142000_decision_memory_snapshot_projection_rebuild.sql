-- Rebuild the source-backed decision-memory projection as a direct, auditable function.
-- This supersedes the preceding compatibility patches that reconstructed the
-- function body dynamically. Tenant keys, immutable snapshot identity, source
-- evidence validation, security-definer ownership and least-privilege ACLs remain.
BEGIN;

CREATE OR REPLACE FUNCTION public._decision_memory_snapshot(
  p_organization_id uuid,
  p_decision_outcome_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
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
  v_actual_as_of timestamptz;
  v_actual_period jsonb;
  v_evidence_ids text[];
  v_resolved jsonb;
  v_actual_metric jsonb;
BEGIN
  -- The immutable snapshot is selected by both tenant and outcome identity.
  -- Its primary key, not FOUND state from a later query, is the existence signal.
  SELECT s.id, s.version, s.captured_at, s.payload
    INTO v_snapshot_id, v_version, v_captured_at, v_payload
    FROM public.decision_memory_snapshots AS s
   WHERE s.organization_id = p_organization_id
     AND s.decision_outcome_id = p_decision_outcome_id
   ORDER BY s.version DESC
   LIMIT 1;

  IF v_snapshot_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve the measurement separately under the same organization boundary.
  SELECT o.measured_outcome
    INTO v_measured
    FROM public.decision_outcomes AS o
   WHERE o.id = p_decision_outcome_id
     AND o.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'decision-memory snapshot has no same-organization outcome';
  END IF;

  v_result := coalesce(v_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'id', v_snapshot_id::text,
    'decisionId', p_decision_outcome_id::text,
    'version', v_version,
    'capturedAt', v_captured_at,
    'actualMetric', NULL
  );

  -- A source-backed actual is exposed only when the terminal measurement is
  -- explicitly verified, complete, acceptable and every evidence ID resolves
  -- to a same-tenant source record at or before the measurement's as-of time.
  IF v_measured IS NOT NULL
     AND pg_catalog.jsonb_typeof(v_measured) = 'object'
     AND pg_catalog.jsonb_typeof(v_measured->'evidenceIds') = 'array'
     AND pg_catalog.jsonb_typeof(v_measured->'period') = 'object'
     AND v_measured->>'status' = 'VERIFIED'
     AND v_measured->>'completeness' = 'COMPLETE'
     AND v_measured->>'quality' = 'ACCEPTABLE'
     AND nullif(v_measured->>'metricKey','') IS NOT NULL THEN
    BEGIN
      v_actual_as_of := (v_measured->>'asOf')::timestamptz;
      v_actual_period := v_measured->'period';
      v_evidence_ids := ARRAY(
        SELECT e.value #>> '{}'
          FROM pg_catalog.jsonb_array_elements(v_measured->'evidenceIds') AS e(value)
      );

      IF v_actual_as_of IS NOT NULL
         AND pg_catalog.cardinality(v_evidence_ids) > 0
         AND pg_catalog.cardinality(v_evidence_ids) = (
           SELECT pg_catalog.count(DISTINCT x)::integer
             FROM pg_catalog.unnest(v_evidence_ids) AS x
         ) THEN
        v_resolved := public._decision_memory_resolve_evidence(
          p_organization_id,
          v_evidence_ids,
          'dmactual:' || v_snapshot_id::text,
          v_actual_period,
          v_actual_as_of
        );

        IF pg_catalog.jsonb_typeof(v_resolved->'ids') = 'array'
           AND pg_catalog.jsonb_typeof(v_resolved->'records') = 'array'
           AND pg_catalog.jsonb_array_length(v_resolved->'ids') = pg_catalog.cardinality(v_evidence_ids)
           AND pg_catalog.jsonb_array_length(v_resolved->'records') = pg_catalog.cardinality(v_evidence_ids) THEN
          v_actual_metric := pg_catalog.jsonb_build_object(
            'id', 'decision-actual:' || p_decision_outcome_id::text,
            'key', v_measured->>'metricKey',
            'value', v_measured->'value',
            'unit', v_measured->>'unit',
            'currency', v_measured->>'currency',
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
              'transformations', pg_catalog.jsonb_build_array(
                'server-validated decision outcome measurement'
              )
            ),
            'warnings', '[]'::jsonb
          );

          -- Merge both calculated fields into the existing snapshot object atomically.
          -- This avoids a second jsonb_set call turning the entire projection SQL NULL.
          v_result := v_result || pg_catalog.jsonb_build_object(
            'actualMetric', v_actual_metric,
            'evidenceRecords',
              (CASE
                WHEN pg_catalog.jsonb_typeof(v_result->'evidenceRecords') = 'array'
                  THEN v_result->'evidenceRecords'
                ELSE '[]'::jsonb
              END) || v_resolved->'records'
          );
        END IF;
      END IF;
    EXCEPTION
      WHEN invalid_datetime_format OR datetime_field_overflow THEN
        -- Invalid timestamps remain withheld; unexpected SQL/runtime errors propagate.
        v_result := pg_catalog.jsonb_set(
          v_result, '{actualMetric}', 'null'::jsonb, true
        );
    END;
  END IF;

  IF v_result IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22004',
      MESSAGE = 'decision-memory snapshot projection unexpectedly produced NULL';
  END IF;

  RETURN v_result;
END
$function$;

ALTER FUNCTION public._decision_memory_snapshot(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._decision_memory_snapshot(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._decision_memory_snapshot(uuid,uuid) TO postgres;

COMMENT ON FUNCTION public._decision_memory_snapshot(uuid,uuid) IS
  'Reads the latest immutable decision-memory snapshot by tenant and outcome key, then independently loads the same-tenant measured outcome. Returns source-backed actualMetric only for verified complete acceptable measurements whose full evidence set resolves to same-tenant source records no later than asOf. VOLATILE supports read-after-write; execution remains internal to postgres-owned security-definer command functions.';

DO $assert_snapshot_projection_contract$
DECLARE
  v_definition text := pg_catalog.pg_get_functiondef(
    'public._decision_memory_snapshot(uuid,uuid)'::regprocedure
  );
  v_provolatile "char";
  v_prosecdef boolean;
  v_owner text;
BEGIN
  SELECT p.provolatile,p.prosecdef,pg_catalog.pg_get_userbyid(p.proowner)
    INTO v_provolatile,v_prosecdef,v_owner
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid='public._decision_memory_snapshot(uuid,uuid)'::regprocedure;

  IF v_provolatile IS DISTINCT FROM 'v'::"char"
     OR v_prosecdef IS DISTINCT FROM true
     OR v_owner IS DISTINCT FROM 'postgres'
     OR pg_catalog.strpos(v_definition,'s.organization_id = p_organization_id')=0
     OR pg_catalog.strpos(v_definition,'o.organization_id = p_organization_id')=0
     OR pg_catalog.strpos(v_definition,'VERIFIED')=0
     OR pg_catalog.strpos(v_definition,'_decision_memory_resolve_evidence')=0 THEN
    RAISE EXCEPTION 'decision-memory snapshot projection security/source contract is incomplete';
  END IF;
END
$assert_snapshot_projection_contract$;

COMMIT;
