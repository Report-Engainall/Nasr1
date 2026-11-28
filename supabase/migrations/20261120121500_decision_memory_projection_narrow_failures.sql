-- Keep malformed source timestamps in the WITHHELD state, but never hide
-- unexpected SQL/runtime defects behind a successful snapshot with actualMetric=null.
BEGIN;

DO $narrow_snapshot_projection_exceptions$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public._decision_memory_snapshot(uuid,uuid)'
  );
  v_definition text;
  v_patched text;
  v_anchor text := 'EXCEPTION WHEN OTHERS THEN';
  v_replacement text := 'EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN';
  v_count integer;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION '_decision_memory_snapshot(uuid,uuid) must exist before narrowing its projection error handling';
  END IF;

  v_definition := pg_catalog.pg_get_functiondef(v_signature);
  v_count := (
    pg_catalog.length(v_definition) -
    pg_catalog.length(pg_catalog.replace(v_definition, v_anchor, ''))
  ) / pg_catalog.length(v_anchor);

  IF v_count = 0 THEN
    -- Idempotent replay: accept only the exact narrowed handler.
    IF pg_catalog.strpos(v_definition, v_replacement) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'could not locate the broad exception handler in _decision_memory_snapshot';
  ELSIF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one broad snapshot projection exception handler, found %', v_count;
  END IF;

  v_patched := pg_catalog.replace(v_definition, v_anchor, v_replacement);
  EXECUTE v_patched;

  IF pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(v_signature),
    v_replacement
  ) = 0 THEN
    RAISE EXCEPTION 'snapshot projection exception handling was not narrowed';
  END IF;
END
$narrow_snapshot_projection_exceptions$;

COMMENT ON FUNCTION public._decision_memory_snapshot(uuid,uuid) IS
  'Source-backed decision memory projection. Uses VOLATILE read-after-write semantics; only invalid datetime input is withheld. Unexpected SQL/runtime defects propagate instead of silently erasing actualMetric.';

COMMIT;
