-- The save RPC inserts a memory snapshot and immediately builds its response by
-- calling _decision_memory_snapshot in the same command. STABLE pins the nested
-- function to the outer command snapshot and hides that transaction's own insert.
-- VOLATILE gives each internal SQL command a fresh snapshot while preserving the
-- existing security-definer boundary and source-evidence validation.
BEGIN;

ALTER FUNCTION public._decision_memory_snapshot(uuid, uuid) VOLATILE;

DO $assert_decision_memory_snapshot_visibility$
DECLARE
  v_volatility "char";
BEGIN
  SELECT p.provolatile
    INTO v_volatility
    FROM pg_catalog.pg_proc p
   WHERE p.oid = pg_catalog.to_regprocedure(
     'public._decision_memory_snapshot(uuid,uuid)'
   );

  IF v_volatility IS DISTINCT FROM 'v' THEN
    RAISE EXCEPTION
      'decision memory snapshot projection must be VOLATILE so saved rows are visible in the same transaction';
  END IF;
END
$assert_decision_memory_snapshot_visibility$;

COMMIT;
