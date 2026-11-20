-- Read immutable decision-memory rows independently from the outcome projection.
-- The snapshot primary key is the sole existence test; the same-tenant outcome
-- measurement is loaded second. No evidence, RLS, role, or immutability gate is weakened.
BEGIN;

DO $repair_snapshot_projection_lookup$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public._decision_memory_snapshot(uuid,uuid)'
  );
  v_before text;
  v_after text;
  v_joined_select text := $old$
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
$old$;
  v_separate_select text := $new$
  SELECT s.id, s.version, s.captured_at, s.payload
    INTO v_snapshot_id, v_version, v_captured_at, v_payload
    FROM public.decision_memory_snapshots s
   WHERE s.organization_id = p_organization_id
     AND s.decision_outcome_id = p_decision_outcome_id
   ORDER BY s.version DESC
   LIMIT 1;

  IF v_snapshot_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT o.measured_outcome
    INTO v_measured
    FROM public.decision_outcomes o
   WHERE o.id = p_decision_outcome_id
     AND o.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'decision-memory snapshot has no same-organization outcome';
  END IF;
$new$;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION '_decision_memory_snapshot(uuid,uuid) is required before the lookup repair';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_after := v_before;

  IF pg_catalog.strpos(v_after, v_separate_select) = 0 THEN
    IF pg_catalog.strpos(v_after, v_joined_select) = 0 THEN
      RAISE EXCEPTION 'expected same-tenant snapshot/outcome join was not found; refusing an unsafe rewrite';
    END IF;
    v_after := pg_catalog.replace(v_after, v_joined_select, v_separate_select);
  END IF;

  IF pg_catalog.strpos(v_after, v_separate_select) = 0
     OR pg_catalog.strpos(v_after, 'IF v_snapshot_id IS NULL THEN') = 0
     OR pg_catalog.strpos(v_after, 'decision-memory snapshot has no same-organization outcome') = 0 THEN
    RAISE EXCEPTION 'decision-memory split lookup contract was not installed';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    EXECUTE v_after;
  END IF;

  ALTER FUNCTION public._decision_memory_snapshot(uuid,uuid) VOLATILE;
  REVOKE ALL ON FUNCTION public._decision_memory_snapshot(uuid,uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public._decision_memory_snapshot(uuid,uuid) TO postgres;
END
$repair_snapshot_projection_lookup$;

COMMENT ON FUNCTION public._decision_memory_snapshot(uuid,uuid) IS
  'Returns the latest immutable same-tenant decision-memory row by primary key, then separately reads its same-tenant measured outcome. Verified actualMetric requires complete acceptable measurement and fully resolved source evidence. VOLATILE supports read-after-write; no client grant or weakened RLS boundary is introduced.';

COMMIT;
