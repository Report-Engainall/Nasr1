-- The memory snapshot is read immediately after its row is inserted by
-- save_decision_memory_snapshot. STABLE would keep the caller's statement
-- snapshot and therefore miss that just-inserted row; this read-only helper
-- must use a fresh snapshot for its internal queries.
BEGIN;

ALTER FUNCTION public._decision_memory_snapshot(uuid, uuid) VOLATILE;

DO $assert_read_after_write_volatility$
DECLARE
  v_volatility "char";
BEGIN
  SELECT p.provolatile
    INTO v_volatility
    FROM pg_catalog.pg_proc p
   WHERE p.oid='public._decision_memory_snapshot(uuid,uuid)'::regprocedure;

  IF v_volatility IS DISTINCT FROM 'v'::"char" THEN
    RAISE EXCEPTION 'decision memory snapshot readback must use VOLATILE snapshot semantics';
  END IF;
END
$assert_read_after_write_volatility$;

COMMENT ON FUNCTION public._decision_memory_snapshot(uuid, uuid) IS
  'Read-only source-backed decision memory projection. VOLATILE is required so a call nested in save_decision_memory_snapshot can see the row inserted earlier in the same SQL statement and resolve its verified evidence with a fresh command snapshot.';

COMMIT;
