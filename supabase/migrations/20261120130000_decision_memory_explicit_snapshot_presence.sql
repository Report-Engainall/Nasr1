-- Make decision-memory snapshot existence checks explicit and keep projection JSON non-null.
-- The primary key is the authoritative row-presence signal; FOUND is implicit
-- mutable PL/pgSQL state and should not decide whether an immutable snapshot exists.
BEGIN;

DO $patch_decision_memory_snapshot_presence$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public._decision_memory_snapshot(uuid,uuid)'
  );
  v_before text;
  v_after text;
  v_found_anchor text := '  IF NOT FOUND THEN' || pg_catalog.chr(10)
    || '    RETURN NULL;' || pg_catalog.chr(10)
    || '  END IF;';
  v_found_replacement text := '  IF v_snapshot_id IS NULL THEN' || pg_catalog.chr(10)
    || '    RETURN NULL;' || pg_catalog.chr(10)
    || '  END IF;';
  v_payload_anchor text := 'v_result := v_payload || pg_catalog.jsonb_build_object(';
  v_payload_replacement text := 'v_result := coalesce(v_payload, ''{}''::jsonb) || pg_catalog.jsonb_build_object(';
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION '_decision_memory_snapshot(uuid,uuid) must exist before the presence guard patch';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_after := v_before;

  IF pg_catalog.strpos(v_after,v_found_replacement)=0 THEN
    v_after := pg_catalog.replace(v_after,v_found_anchor,v_found_replacement);
  END IF;
  IF v_after=v_before AND pg_catalog.strpos(v_after,v_found_replacement)=0 THEN
    RAISE EXCEPTION 'could not replace the implicit snapshot FOUND guard';
  END IF;

  IF pg_catalog.strpos(v_after,v_payload_replacement)=0 THEN
    v_after := pg_catalog.replace(v_after,v_payload_anchor,v_payload_replacement);
  END IF;

  IF pg_catalog.strpos(v_after,v_found_replacement)=0
     OR pg_catalog.strpos(v_after,v_payload_replacement)=0 THEN
    RAISE EXCEPTION 'decision-memory snapshot presence/JSON guards were not installed';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    EXECUTE v_after;
  END IF;

  ALTER FUNCTION public._decision_memory_snapshot(uuid,uuid) VOLATILE;
END
$patch_decision_memory_snapshot_presence$;

COMMIT;
