-- Return the just-persisted decision-memory snapshot from the command's own
-- validated payload and source-derived measurement. Do not depend on a nested
-- read-after-write projection to acknowledge a successful INSERT.
BEGIN;

DO $patch_decision_memory_command_return$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public.save_decision_memory_snapshot(uuid,integer,jsonb,text,text)'
  );
  v_before text;
  v_after text;
  v_declaration_anchor text := '  v_outcome_state text;';
  v_declaration_replacement text := '  v_outcome_state text;' || pg_catalog.chr(10)
    || '  v_measured_outcome jsonb;' || pg_catalog.chr(10)
    || '  v_actual_metric jsonb := NULL;' || pg_catalog.chr(10)
    || '  v_actual_as_of timestamptz;' || pg_catalog.chr(10)
    || '  v_actual_period jsonb;' || pg_catalog.chr(10)
    || '  v_actual_evidence_ids text[];' || pg_catalog.chr(10)
    || '  v_actual_resolved jsonb;' || pg_catalog.chr(10)
    || '  v_actual_evidence_records jsonb := ''[]''::jsonb;';
  v_select_anchor text := '  SELECT o.created_at, o.state' || pg_catalog.chr(10)
    || '    INTO v_outcome_created_at, v_outcome_state' || pg_catalog.chr(10)
    || '    FROM public.decision_outcomes o';
  v_select_replacement text := '  SELECT o.created_at, o.state, o.measured_outcome' || pg_catalog.chr(10)
    || '    INTO v_outcome_created_at, v_outcome_state, v_measured_outcome' || pg_catalog.chr(10)
    || '    FROM public.decision_outcomes o';
  v_return_anchor text := '  v_result := pg_catalog.jsonb_build_object(' || pg_catalog.chr(10)
    || '    ''ok'',true,' || pg_catalog.chr(10)
    || '    ''duplicate'',false,' || pg_catalog.chr(10)
    || '    ''snapshot'',public._decision_memory_snapshot(v_org,p_decision_outcome_id)' || pg_catalog.chr(10)
    || '  );';
  v_return_replacement text;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'save_decision_memory_snapshot(uuid,integer,jsonb,text,text) must exist before the return-contract patch';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_after := v_before;

  IF pg_catalog.strpos(v_after, v_declaration_replacement) = 0 THEN
    IF pg_catalog.strpos(v_after, v_declaration_anchor) = 0 THEN
      RAISE EXCEPTION 'decision-memory command declaration anchor is missing';
    END IF;
    v_after := pg_catalog.replace(v_after, v_declaration_anchor, v_declaration_replacement);
  END IF;

  IF pg_catalog.strpos(v_after, v_select_replacement) = 0 THEN
    IF pg_catalog.strpos(v_after, v_select_anchor) = 0 THEN
      RAISE EXCEPTION 'decision-memory outcome measurement anchor is missing';
    END IF;
    v_after := pg_catalog.replace(v_after, v_select_anchor, v_select_replacement);
  END IF;

  v_return_replacement :=
    '  v_actual_metric := NULL;' || pg_catalog.chr(10)
    || '  v_actual_evidence_records := ''[]''::jsonb;' || pg_catalog.chr(10)
    || '  IF v_measured_outcome IS NOT NULL' || pg_catalog.chr(10)
    || '     AND pg_catalog.jsonb_typeof(v_measured_outcome) = ''object''' || pg_catalog.chr(10)
    || '     AND pg_catalog.jsonb_typeof(v_measured_outcome->''evidenceIds'') = ''array''' || pg_catalog.chr(10)
    || '     AND pg_catalog.jsonb_typeof(v_measured_outcome->''period'') = ''object''' || pg_catalog.chr(10)
    || '     AND v_measured_outcome->>''status'' = ''VERIFIED''' || pg_catalog.chr(10)
    || '     AND v_measured_outcome->>''completeness'' = ''COMPLETE''' || pg_catalog.chr(10)
    || '     AND v_measured_outcome->>''quality'' = ''ACCEPTABLE'' THEN' || pg_catalog.chr(10)
    || '    BEGIN' || pg_catalog.chr(10)
    || '      v_actual_as_of := (v_measured_outcome->>''asOf'')::timestamptz;' || pg_catalog.chr(10)
    || '      v_actual_period := v_measured_outcome->''period'';' || pg_catalog.chr(10)
    || '      v_actual_evidence_ids := ARRAY(' || pg_catalog.chr(10)
    || '        SELECT e.value #>> ''{}''' || pg_catalog.chr(10)
    || '          FROM pg_catalog.jsonb_array_elements(v_measured_outcome->''evidenceIds'') e(value)' || pg_catalog.chr(10)
    || '      );' || pg_catalog.chr(10)
    || '      IF v_actual_as_of IS NOT NULL' || pg_catalog.chr(10)
    || '         AND pg_catalog.cardinality(v_actual_evidence_ids) > 0' || pg_catalog.chr(10)
    || '         AND pg_catalog.cardinality(v_actual_evidence_ids) = (' || pg_catalog.chr(10)
    || '           SELECT pg_catalog.count(DISTINCT x)::integer' || pg_catalog.chr(10)
    || '             FROM pg_catalog.unnest(v_actual_evidence_ids) x' || pg_catalog.chr(10)
    || '         ) THEN' || pg_catalog.chr(10)
    || '        v_actual_resolved := public._decision_memory_resolve_evidence(' || pg_catalog.chr(10)
    || '          v_org, v_actual_evidence_ids, ''dmactual:'' || v_snapshot_id::text,' || pg_catalog.chr(10)
    || '          v_actual_period, v_actual_as_of' || pg_catalog.chr(10)
    || '        );' || pg_catalog.chr(10)
    || '        IF pg_catalog.jsonb_typeof(v_actual_resolved->''ids'') = ''array''' || pg_catalog.chr(10)
    || '           AND pg_catalog.jsonb_array_length(v_actual_resolved->''ids'') = pg_catalog.cardinality(v_actual_evidence_ids) THEN' || pg_catalog.chr(10)
    || '          v_actual_metric := pg_catalog.jsonb_build_object(' || pg_catalog.chr(10)
    || '            ''id'', ''decision-actual:'' || p_decision_outcome_id::text,' || pg_catalog.chr(10)
    || '            ''key'', v_measured_outcome->>''metricKey'',' || pg_catalog.chr(10)
    || '            ''value'', v_measured_outcome->''value'',' || pg_catalog.chr(10)
    || '            ''unit'', v_measured_outcome->>''unit'',' || pg_catalog.chr(10)
    || '            ''currency'', v_measured_outcome->>''currency'',' || pg_catalog.chr(10)
    || '            ''status'', v_measured_outcome->>''status'',' || pg_catalog.chr(10)
    || '            ''completeness'', v_measured_outcome->>''completeness'',' || pg_catalog.chr(10)
    || '            ''quality'', v_measured_outcome->>''quality'',' || pg_catalog.chr(10)
    || '            ''period'', v_actual_period,' || pg_catalog.chr(10)
    || '            ''asOf'', v_actual_as_of,' || pg_catalog.chr(10)
    || '            ''lineage'', pg_catalog.jsonb_build_object(' || pg_catalog.chr(10)
    || '              ''evidenceIds'', v_actual_resolved->''ids'',' || pg_catalog.chr(10)
    || '              ''calculatedAt'', v_measured_outcome->>''measuredAt'',' || pg_catalog.chr(10)
    || '              ''formulaId'', v_measured_outcome->>''formulaId'',' || pg_catalog.chr(10)
    || '              ''formulaVersion'', v_measured_outcome->>''formulaVersion'',' || pg_catalog.chr(10)
    || '              ''transformations'', pg_catalog.jsonb_build_array(''server-validated decision outcome measurement'')' || pg_catalog.chr(10)
    || '            ),' || pg_catalog.chr(10)
    || '            ''warnings'', ''[]''::jsonb' || pg_catalog.chr(10)
    || '          );' || pg_catalog.chr(10)
    || '          v_actual_evidence_records := coalesce(v_actual_resolved->''records'', ''[]''::jsonb);' || pg_catalog.chr(10)
    || '        END IF;' || pg_catalog.chr(10)
    || '      END IF;' || pg_catalog.chr(10)
    || '    EXCEPTION' || pg_catalog.chr(10)
    || '      WHEN invalid_datetime_format OR datetime_field_overflow THEN' || pg_catalog.chr(10)
    || '        v_actual_metric := NULL;' || pg_catalog.chr(10)
    || '        v_actual_evidence_records := ''[]''::jsonb;' || pg_catalog.chr(10)
    || '    END;' || pg_catalog.chr(10)
    || '  END IF;' || pg_catalog.chr(10)
    || pg_catalog.chr(10)
    || '  -- The snapshot payload and identity are taken from the row just inserted.' || pg_catalog.chr(10)
    || '  -- Source-backed actuals are computed from the already-read terminal outcome.' || pg_catalog.chr(10)
    || '  v_result := pg_catalog.jsonb_build_object(' || pg_catalog.chr(10)
    || '    ''ok'', true,' || pg_catalog.chr(10)
    || '    ''duplicate'', false,' || pg_catalog.chr(10)
    || '    ''snapshot'', coalesce(v_payload, ''{}''::jsonb) || pg_catalog.jsonb_build_object(' || pg_catalog.chr(10)
    || '      ''id'', v_snapshot_id::text,' || pg_catalog.chr(10)
    || '      ''decisionId'', p_decision_outcome_id::text,' || pg_catalog.chr(10)
    || '      ''version'', v_current_version + 1,' || pg_catalog.chr(10)
    || '      ''capturedAt'', v_now,' || pg_catalog.chr(10)
    || '      ''actualMetric'', v_actual_metric,' || pg_catalog.chr(10)
    || '      ''evidenceRecords'', coalesce(v_payload->''evidenceRecords'', ''[]''::jsonb) || v_actual_evidence_records' || pg_catalog.chr(10)
    || '    )' || pg_catalog.chr(10)
    || '  );';

  IF pg_catalog.strpos(v_after, v_return_replacement) = 0 THEN
    IF pg_catalog.strpos(v_after, v_return_anchor) = 0 THEN
      RAISE EXCEPTION 'decision-memory command return anchor is missing';
    END IF;
    v_after := pg_catalog.replace(v_after, v_return_anchor, v_return_replacement);
  END IF;

  IF pg_catalog.strpos(v_after, v_declaration_replacement) = 0
     OR pg_catalog.strpos(v_after, v_select_replacement) = 0
     OR pg_catalog.strpos(v_after, v_return_replacement) = 0 THEN
    RAISE EXCEPTION 'decision-memory persisted return contract was not installed';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    EXECUTE v_after;
  END IF;
END
$patch_decision_memory_command_return$;

COMMIT;
