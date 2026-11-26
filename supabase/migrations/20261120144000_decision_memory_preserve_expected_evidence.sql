-- Preserve the source records used by expectedMetric when the decision-memory
-- save command subsequently adds fact evidence. Resetting this accumulator after
-- resolving expectedMetric silently discarded its evidence and broke candidate validation.
BEGIN;

DO $preserve_expected_decision_memory_evidence$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)'
  );
  v_before text;
  v_after text;
  v_reset_block text :=
    '  v_evidence_records := ''[]''::jsonb;' || pg_catalog.chr(10)
    || '  FOR v_item IN SELECT f.value FROM pg_catalog.jsonb_array_elements(p_snapshot->''facts'') f(value)';
  v_preserved_block text :=
    '  -- Preserve expectedMetric evidence resolved above; append fact evidence below.' || pg_catalog.chr(10)
    || '  FOR v_item IN SELECT f.value FROM pg_catalog.jsonb_array_elements(p_snapshot->''facts'') f(value)';
  v_old_expected_append text :=
    'v_evidence_records := v_evidence_records || v_expected_resolved->''records'';';
  v_expected_append text :=
    'v_evidence_records := v_evidence_records || (v_expected_resolved->''records'');';
  v_fact_append text :=
    'v_evidence_records := v_evidence_records || (v_resolved->''records'');';
  v_owner text;
  v_security_definer boolean;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'save_decision_memory_snapshot(uuid,integer,jsonb,text,text) is required';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_after := v_before;

  IF pg_catalog.strpos(v_after,v_preserved_block)=0 THEN
    IF pg_catalog.strpos(v_after,v_reset_block)=0 THEN
      RAISE EXCEPTION 'expected evidence accumulator reset before fact processing was not found';
    END IF;
    v_after := pg_catalog.replace(v_after,v_reset_block,v_preserved_block);
  END IF;

  -- Parenthesize JSONB extraction: -> and || are equal-precedence,
  -- left-associative PostgreSQL operators.
  IF pg_catalog.strpos(v_after,v_expected_append)=0 THEN
    IF pg_catalog.strpos(v_after,v_old_expected_append)=0 THEN
      RAISE EXCEPTION 'expected metric evidence append expression was not found';
    END IF;
    v_after := pg_catalog.replace(v_after,v_old_expected_append,v_expected_append);
  END IF;

  IF pg_catalog.strpos(v_after,v_reset_block)>0
     OR pg_catalog.strpos(v_after,v_preserved_block)=0
     OR pg_catalog.strpos(v_after,v_old_expected_append)>0
     OR pg_catalog.strpos(v_after,v_expected_append)=0
     OR pg_catalog.strpos(v_after,v_fact_append)=0 THEN
    RAISE EXCEPTION 'expected and fact evidence are not both preserved by the decision-memory save command';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    EXECUTE v_after;
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner),p.prosecdef
    INTO v_owner,v_security_definer
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid=v_signature;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_security_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'decision-memory save command owner/security boundary changed unexpectedly';
  END IF;
END
$preserve_expected_decision_memory_evidence$;


-- The evidence resolver must return both complete collections before either is
-- appended. jsonb_array_length on a scalar is an error, so validate JSON types
-- in a separate branch before measuring their lengths.
DO $guard_decision_memory_source_evidence_arrays$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)'
  );
  v_before text;
  v_after text;
  v_old_expected_guard text :=
    '    IF pg_catalog.jsonb_array_length(v_expected_resolved->''ids'') <> pg_catalog.cardinality(v_expected_ids) THEN' || pg_catalog.chr(10)
    || '      RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''expected metric source set is incomplete or outside the active organization'';' || pg_catalog.chr(10)
    || '    END IF;';
  v_new_expected_guard text :=
    '    IF pg_catalog.jsonb_typeof(v_expected_resolved->''ids'') IS DISTINCT FROM ''array''' || pg_catalog.chr(10)
    || '       OR pg_catalog.jsonb_typeof(v_expected_resolved->''records'') IS DISTINCT FROM ''array'' THEN' || pg_catalog.chr(10)
    || '      RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''expected metric source resolver returned invalid evidence arrays'';' || pg_catalog.chr(10)
    || '    END IF;' || pg_catalog.chr(10)
    || '    IF pg_catalog.jsonb_array_length(v_expected_resolved->''ids'') <> pg_catalog.cardinality(v_expected_ids)' || pg_catalog.chr(10)
    || '       OR pg_catalog.jsonb_array_length(v_expected_resolved->''records'') <> pg_catalog.cardinality(v_expected_ids) THEN' || pg_catalog.chr(10)
    || '      RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''expected metric source set is incomplete or outside the active organization'';' || pg_catalog.chr(10)
    || '    END IF;';
  v_old_fact_guard text :=
    '    IF pg_catalog.jsonb_array_length(v_resolved->''ids'') <> pg_catalog.cardinality(v_statement_evidence) THEN' || pg_catalog.chr(10)
    || '      RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''one or more fact evidence records are missing, future-dated or outside the active organization'';' || pg_catalog.chr(10)
    || '    END IF;';
  v_new_fact_guard text :=
    '    IF pg_catalog.jsonb_typeof(v_resolved->''ids'') IS DISTINCT FROM ''array''' || pg_catalog.chr(10)
    || '       OR pg_catalog.jsonb_typeof(v_resolved->''records'') IS DISTINCT FROM ''array'' THEN' || pg_catalog.chr(10)
    || '      RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''fact evidence resolver returned invalid evidence arrays'';' || pg_catalog.chr(10)
    || '    END IF;' || pg_catalog.chr(10)
    || '    IF pg_catalog.jsonb_array_length(v_resolved->''ids'') <> pg_catalog.cardinality(v_statement_evidence)' || pg_catalog.chr(10)
    || '       OR pg_catalog.jsonb_array_length(v_resolved->''records'') <> pg_catalog.cardinality(v_statement_evidence) THEN' || pg_catalog.chr(10)
    || '      RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''one or more fact evidence records are missing, future-dated or outside the active organization'';' || pg_catalog.chr(10)
    || '    END IF;';
  v_owner text;
  v_security_definer boolean;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'save_decision_memory_snapshot(uuid,integer,jsonb,text,text) is required';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_after := v_before;

  IF pg_catalog.strpos(v_after,v_new_expected_guard)=0 THEN
    IF pg_catalog.strpos(v_after,v_old_expected_guard)=0 THEN
      RAISE EXCEPTION 'expected metric evidence resolver guard was not found';
    END IF;
    v_after := pg_catalog.replace(v_after,v_old_expected_guard,v_new_expected_guard);
  END IF;

  IF pg_catalog.strpos(v_after,v_new_fact_guard)=0 THEN
    IF pg_catalog.strpos(v_after,v_old_fact_guard)=0 THEN
      RAISE EXCEPTION 'fact evidence resolver guard was not found';
    END IF;
    v_after := pg_catalog.replace(v_after,v_old_fact_guard,v_new_fact_guard);
  END IF;

  IF pg_catalog.strpos(v_after,v_old_expected_guard)>0
     OR pg_catalog.strpos(v_after,v_old_fact_guard)>0
     OR pg_catalog.strpos(v_after,v_new_expected_guard)=0
     OR pg_catalog.strpos(v_after,v_new_fact_guard)=0
     OR pg_catalog.strpos(v_after,'v_evidence_records := v_evidence_records || (v_expected_resolved->''records'');')=0
     OR pg_catalog.strpos(v_after,'v_evidence_records := v_evidence_records || (v_resolved->''records'');')=0 THEN
    RAISE EXCEPTION 'decision-memory source evidence array and append invariants were not installed';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    EXECUTE v_after;
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner),p.prosecdef
    INTO v_owner,v_security_definer
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid=v_signature;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_security_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'decision-memory save command owner/security boundary changed unexpectedly';
  END IF;
END
$guard_decision_memory_source_evidence_arrays$;

COMMENT ON FUNCTION public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text) IS
  'Preserves expectedMetric source evidence and appends fact and measured-outcome evidence to the same immutable snapshot. All records remain server-resolved and tenant-scoped; the postgres-owned SECURITY DEFINER command and existing grants are retained.';

COMMIT;
