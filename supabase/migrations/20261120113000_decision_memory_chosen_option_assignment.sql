-- Persist the selected option from the submitted decision-memory snapshot.
-- The original function declared and validated v_chosen_option_id but omitted
-- assigning it from p_snapshot, which made every non-rejected decision fail.
BEGIN;

DO $patch_save_decision_memory$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)'
  );
  v_before text;
  v_after text;
  v_anchor text := '  IF v_chosen_option_id IS NOT NULL AND NOT EXISTS (';
  v_replacement text :=
    '  v_chosen_option_id := nullif(pg_catalog.btrim(p_snapshot->>''chosenOptionId''), '''');'
    || pg_catalog.chr(10) ||
    '  IF v_chosen_option_id IS NOT NULL AND NOT EXISTS (';
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'save_decision_memory_snapshot(uuid,integer,jsonb,text,text) is required before the chosen-option patch';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);

  IF pg_catalog.strpos(v_before, 'v_chosen_option_id := nullif') = 0 THEN
    v_after := pg_catalog.replace(v_before, v_anchor, v_replacement);
    IF v_after = v_before THEN
      RAISE EXCEPTION 'could not locate the chosen-option validation anchor in save_decision_memory_snapshot';
    END IF;
    EXECUTE v_after;
  END IF;

  IF pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(v_signature),
    'v_chosen_option_id := nullif'
  ) = 0 THEN
    RAISE EXCEPTION 'chosenOptionId was not assigned into the normalized decision-memory snapshot';
  END IF;
END
$patch_save_decision_memory$;

COMMIT;
