-- Keep decision-memory evidenceRecords a JSON array in both the persisted-row
-- projection and the immediate save-command response. SQL COALESCE does not
-- replace a JSON literal null, which otherwise reaches jsonb_array_elements.
BEGIN;

DO $normalize_decision_memory_evidence_records$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)'
  );
  v_before text;
  v_after text;
  v_old_evidence_assignment text :=
    'coalesce(v_payload->''evidenceRecords'', ''[]''::jsonb) || v_actual_evidence_records';
  v_new_evidence_assignment text :=
    '(CASE WHEN pg_catalog.jsonb_typeof(v_payload->''evidenceRecords'') = ''array'' '
    || 'THEN v_payload->''evidenceRecords'' ELSE ''[]''::jsonb END) || v_actual_evidence_records';
  v_old_resolver_guard text :=
    'IF pg_catalog.jsonb_typeof(v_actual_resolved->''ids'') = ''array'''
    || pg_catalog.chr(10)
    || '           AND pg_catalog.jsonb_array_length(v_actual_resolved->''ids'') = pg_catalog.cardinality(v_actual_evidence_ids) THEN';
  v_new_resolver_guard text :=
    'IF pg_catalog.jsonb_typeof(v_actual_resolved->''ids'') = ''array'''
    || pg_catalog.chr(10)
    || '           AND pg_catalog.jsonb_array_length(v_actual_resolved->''ids'') = pg_catalog.cardinality(v_actual_evidence_ids)'
    || pg_catalog.chr(10)
    || '           AND pg_catalog.jsonb_typeof(v_actual_resolved->''records'') = ''array'''
    || pg_catalog.chr(10)
    || '           AND pg_catalog.jsonb_array_length(v_actual_resolved->''records'') = pg_catalog.cardinality(v_actual_evidence_ids) THEN';
  v_old_record_assignment text :=
    'v_actual_evidence_records := coalesce(v_actual_resolved->''records'', ''[]''::jsonb);';
  v_new_record_assignment text :=
    'v_actual_evidence_records := v_actual_resolved->''records'';';
  v_owner text;
  v_security_definer boolean;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'save_decision_memory_snapshot(uuid,integer,jsonb,text,text) is required';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_after := v_before;

  IF pg_catalog.strpos(v_after,v_new_evidence_assignment)=0 THEN
    IF pg_catalog.strpos(v_after,v_old_evidence_assignment)=0 THEN
      RAISE EXCEPTION 'expected nullable evidenceRecords payload merge was not found';
    END IF;
    v_after := pg_catalog.replace(v_after,v_old_evidence_assignment,v_new_evidence_assignment);
  END IF;

  IF pg_catalog.strpos(v_after,v_new_resolver_guard)=0 THEN
    IF pg_catalog.strpos(v_after,v_old_resolver_guard)=0 THEN
      RAISE EXCEPTION 'expected source evidence resolver guard was not found';
    END IF;
    v_after := pg_catalog.replace(v_after,v_old_resolver_guard,v_new_resolver_guard);
  END IF;

  IF pg_catalog.strpos(v_after,v_new_record_assignment)=0 THEN
    IF pg_catalog.strpos(v_after,v_old_record_assignment)=0 THEN
      RAISE EXCEPTION 'expected resolved evidence-record assignment was not found';
    END IF;
    v_after := pg_catalog.replace(v_after,v_old_record_assignment,v_new_record_assignment);
  END IF;

  IF pg_catalog.strpos(v_after,v_new_evidence_assignment)=0
     OR pg_catalog.strpos(v_after,v_new_resolver_guard)=0
     OR pg_catalog.strpos(v_after,v_new_record_assignment)=0 THEN
    RAISE EXCEPTION 'decision-memory evidenceRecords array normalization was not fully installed';
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
$normalize_decision_memory_evidence_records$;

-- Normalize inherited payloads in the read path before any measurement branch runs.
-- This also covers snapshots whose persisted JSON explicitly contains evidenceRecords:null.
DO $normalize_decision_memory_snapshot_projection_array$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public._decision_memory_snapshot(uuid,uuid)'
  );
  v_before text;
  v_after text;
  v_old_anchor text :=
    '    ''capturedAt'', v_captured_at,' || pg_catalog.chr(10)
    || '    ''actualMetric'', NULL' || pg_catalog.chr(10)
    || '  );';
  v_new_anchor text :=
    '    ''capturedAt'', v_captured_at,' || pg_catalog.chr(10)
    || '    ''actualMetric'', NULL,' || pg_catalog.chr(10)
    || '    ''evidenceRecords'',' || pg_catalog.chr(10)
    || '    CASE' || pg_catalog.chr(10)
    || '      WHEN pg_catalog.jsonb_typeof(v_payload->''evidenceRecords'') = ''array''' || pg_catalog.chr(10)
    || '        THEN v_payload->''evidenceRecords''' || pg_catalog.chr(10)
    || '      ELSE ''[]''::jsonb' || pg_catalog.chr(10)
    || '    END' || pg_catalog.chr(10)
    || '  );';
  v_owner text;
  v_security_definer boolean;
  v_volatility "char";
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION '_decision_memory_snapshot(uuid,uuid) is required';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_after := v_before;

  IF pg_catalog.strpos(v_after,v_new_anchor)=0 THEN
    IF pg_catalog.strpos(v_after,v_old_anchor)=0 THEN
      RAISE EXCEPTION 'snapshot payload evidenceRecords initializer was not found';
    END IF;
    v_after := pg_catalog.replace(v_after,v_old_anchor,v_new_anchor);
  END IF;

  IF pg_catalog.strpos(v_after,v_new_anchor)=0 THEN
    RAISE EXCEPTION 'snapshot evidenceRecords array initializer was not installed';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    EXECUTE v_after;
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner),p.prosecdef,p.provolatile
    INTO v_owner,v_security_definer,v_volatility
    FROM pg_catalog.pg_proc AS p
   WHERE p.oid=v_signature;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_security_definer IS DISTINCT FROM true
     OR v_volatility IS DISTINCT FROM 'v'::"char" THEN
    RAISE EXCEPTION 'snapshot projection owner, security-definer, or volatility contract changed';
  END IF;
END
$normalize_decision_memory_snapshot_projection_array$;

COMMENT ON FUNCTION public._decision_memory_snapshot(uuid,uuid) IS
  'Reads the latest immutable same-tenant decision-memory snapshot and source-backed measurement. The inherited evidenceRecords payload is normalized to a JSON array before any projection branch runs; source-backed records are appended only after complete same-tenant evidence resolution.';

COMMENT ON FUNCTION public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text) IS
  'Saves the immutable validated decision-memory payload and returns the source-backed actual metric with a guaranteed JSON-array evidenceRecords field. A JSON literal null in a prior payload is normalized to an empty array before appending resolved same-tenant evidence; source evidence must resolve completely. Existing SECURITY DEFINER owner and ACL boundary are preserved.';

COMMIT;
