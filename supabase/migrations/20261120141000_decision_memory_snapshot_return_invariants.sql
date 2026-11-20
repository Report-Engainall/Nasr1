-- A snapshot found by the primary-key lookup must never silently become NULL
-- after the same-tenant outcome read. Missing rows remain a normal NULL result;
-- losing an already-found identity or a constructed projection is an integrity error.
BEGIN;

DO $assert_decision_memory_snapshot_return_invariants$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public._decision_memory_snapshot(uuid,uuid)'
  );
  v_before text;
  v_after text;
  v_guard text := '  IF v_snapshot_id IS NULL THEN' || pg_catalog.chr(10)
    || '    RETURN NULL;' || pg_catalog.chr(10)
    || '  END IF;';
  v_first_guard integer;
  v_second_relative integer;
  v_second_guard integer;
  v_outcome_guard text := '  IF NOT FOUND THEN' || pg_catalog.chr(10)
    || '    RAISE EXCEPTION USING' || pg_catalog.chr(10)
    || '      ERRCODE = ''23503'',' || pg_catalog.chr(10)
    || '      MESSAGE = ''decision-memory snapshot has no same-organization outcome'';' || pg_catalog.chr(10)
    || '  END IF;';
  v_identity_guard text := '  IF v_snapshot_id IS NULL THEN' || pg_catalog.chr(10)
    || '    RAISE EXCEPTION USING' || pg_catalog.chr(10)
    || '      ERRCODE = ''23503'',' || pg_catalog.chr(10)
    || '      MESSAGE = ''decision-memory snapshot identity disappeared after same-tenant outcome lookup'';' || pg_catalog.chr(10)
    || '  END IF;';
  v_return_anchor text := '  RETURN v_result;';
  v_return_replacement text := '  IF v_result IS NULL THEN' || pg_catalog.chr(10)
    || '    RAISE EXCEPTION USING' || pg_catalog.chr(10)
    || '      ERRCODE = ''22004'',' || pg_catalog.chr(10)
    || '      MESSAGE = ''decision-memory snapshot projection unexpectedly produced NULL'';' || pg_catalog.chr(10)
    || '  END IF;' || pg_catalog.chr(10)
    || '  RETURN v_result;';
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION '_decision_memory_snapshot(uuid,uuid) is required before return-invariant patch';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_after := v_before;

  IF pg_catalog.strpos(v_after,v_identity_guard)>0 THEN
    -- Idempotent replay only accepts the complete invariant form.
    IF pg_catalog.strpos(v_after,v_return_replacement)=0 THEN
      RAISE EXCEPTION 'snapshot identity guard exists but final non-null return guard is missing';
    END IF;
    RETURN;
  END IF;

  v_first_guard := pg_catalog.strpos(v_after,v_guard);
  IF v_first_guard=0 THEN
    RAISE EXCEPTION 'expected the first snapshot NULL guard';
  END IF;
  v_second_relative := pg_catalog.strpos(
    pg_catalog.substr(v_after,v_first_guard+pg_catalog.length(v_guard)),
    v_guard
  );
  IF v_second_relative=0 THEN
    RAISE EXCEPTION 'expected the second post-outcome snapshot NULL guard exactly once';
  END IF;
  v_second_guard := v_first_guard+pg_catalog.length(v_guard)+v_second_relative-1;

  IF pg_catalog.strpos(
    pg_catalog.substr(v_after,1,v_second_guard-1),
    v_outcome_guard
  )=0 THEN
    RAISE EXCEPTION 'the second snapshot guard is not immediately downstream of the same-tenant outcome guard';
  END IF;

  v_after := pg_catalog.substr(v_after,1,v_second_guard-1)
    || v_identity_guard
    || pg_catalog.substr(v_after,v_second_guard+pg_catalog.length(v_guard));

  IF pg_catalog.strpos(v_after,v_return_replacement)=0 THEN
    IF pg_catalog.strpos(v_after,v_return_anchor)=0 THEN
      RAISE EXCEPTION 'decision-memory return anchor is missing';
    END IF;
    v_after := pg_catalog.replace(v_after,v_return_anchor,v_return_replacement);
  END IF;

  IF pg_catalog.strpos(v_after,v_identity_guard)=0
     OR pg_catalog.strpos(v_after,v_return_replacement)=0 THEN
    RAISE EXCEPTION 'decision-memory non-null projection invariants were not installed';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    EXECUTE v_after;
  END IF;

  ALTER FUNCTION public._decision_memory_snapshot(uuid,uuid) VOLATILE;
END
$assert_decision_memory_snapshot_return_invariants$;

COMMENT ON FUNCTION public._decision_memory_snapshot(uuid,uuid) IS
  'Returns NULL only when the requested snapshot primary key is absent. Once a same-tenant snapshot is found, disappearance of its identity or a NULL constructed projection raises an integrity exception instead of silently withholding the entire snapshot. Verified actualMetric still requires complete acceptable measurement and fully resolved tenant-owned source evidence.';

COMMIT;
