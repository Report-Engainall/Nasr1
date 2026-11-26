-- Bind the snapshot identity lookup to the helper's positional UUID inputs.
-- This avoids name-resolution drift in dynamically reconstructed PL/pgSQL
-- definitions while keeping the snapshot and outcome tenant predicates exact.
BEGIN;

DO $patch_decision_memory_positional_identity$
DECLARE
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'public._decision_memory_snapshot(uuid,uuid)'
  );
  v_before text;
  v_after text;
  v_marker text := 'AS $function$';
  v_marker_position integer;
  v_body text;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION '_decision_memory_snapshot(uuid,uuid) must exist before binding its identity inputs';
  END IF;

  v_before := pg_catalog.pg_get_functiondef(v_signature);
  v_marker_position := pg_catalog.strpos(v_before,v_marker);
  IF v_marker_position=0 THEN
    RAISE EXCEPTION 'could not locate the decision-memory function body';
  END IF;

  v_body := pg_catalog.substr(v_before,v_marker_position+pg_catalog.length(v_marker));
  v_body := pg_catalog.replace(v_body,'p_organization_id','$1');
  v_body := pg_catalog.replace(v_body,'p_decision_outcome_id','$2');
  v_after := pg_catalog.substr(v_before,1,v_marker_position+pg_catalog.length(v_marker)-1) || v_body;

  IF pg_catalog.strpos(v_body,'s.organization_id = $1')=0
     OR pg_catalog.strpos(v_body,'s.decision_outcome_id = $2')=0
     OR pg_catalog.strpos(v_body,'o.id = $2')=0
     OR pg_catalog.strpos(v_body,'o.organization_id = $1')=0
     OR pg_catalog.strpos(v_body,'p_organization_id')>0
     OR pg_catalog.strpos(v_body,'p_decision_outcome_id')>0 THEN
    RAISE EXCEPTION 'positional same-tenant snapshot identity binding is incomplete';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    EXECUTE v_after;
  END IF;

  ALTER FUNCTION public._decision_memory_snapshot(uuid,uuid) VOLATILE;
END
$patch_decision_memory_positional_identity$;

COMMENT ON FUNCTION public._decision_memory_snapshot(uuid,uuid) IS
  'Returns the latest immutable same-tenant decision-memory row by its primary key, then loads same-tenant measured outcome using positional function inputs. Verified actualMetric requires complete acceptable measurement and fully resolved source evidence. VOLATILE supports read-after-write; no client grant or weakened RLS boundary is introduced.';

COMMIT;
