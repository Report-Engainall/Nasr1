\set ON_ERROR_STOP on

-- This isolated PostgreSQL 17 test exercises the production guard migration
-- against both executable RPC signatures after a later migration redefines them.
CREATE OR REPLACE FUNCTION public.assert_inventory_transfer_scope_v2(
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  RETURN;
END
$function$;

CREATE OR REPLACE FUNCTION public.transfer_inventory(
  p_product_id uuid,
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7001);
END
$function$;

CREATE OR REPLACE FUNCTION public.transfer_inventory_batch(
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_idempotency_key text,
  p_lines jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7002);
END
$function$;

CREATE OR REPLACE FUNCTION public.assert_inventory_transfer_guard_order()
RETURNS void
LANGUAGE plpgsql
SET search_path=''
AS $function$
DECLARE
  v_function record;
  v_definition text;
  v_guard_position integer;
  v_lock_position integer;
  v_checked_count integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid,p.proname
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('transfer_inventory','transfer_inventory_batch')
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_function.oid)
      INTO v_definition;
    v_guard_position := pg_catalog.strpos(
      v_definition,'PERFORM public.assert_inventory_transfer_scope_v2('
    );
    v_lock_position := pg_catalog.strpos(v_definition,'pg_advisory_xact_lock');

    IF v_guard_position=0 OR v_lock_position=0 OR v_guard_position>v_lock_position THEN
      RAISE EXCEPTION
        'warehouse scope guard missing or after replay lock in public.%',v_function.proname;
    END IF;
    v_checked_count := v_checked_count+1;
  END LOOP;

  IF v_checked_count<>2 THEN
    RAISE EXCEPTION 'expected exactly two guarded transfer RPCs; checked %',v_checked_count;
  END IF;
END
$function$;

-- The actual migration must insert the guard before the first advisory lock.
\ir ../migrations/20261117240000_inventory_transfer_replay_scope_guard.sql
SELECT public.assert_inventory_transfer_guard_order();

-- Reapplying the migration must be safe and preserve the guard position.
\ir ../migrations/20261117240000_inventory_transfer_replay_scope_guard.sql
SELECT public.assert_inventory_transfer_guard_order();

-- Negative control: a guard that exists but appears after the lock is not accepted.
CREATE OR REPLACE FUNCTION public.transfer_inventory_batch(
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_idempotency_key text,
  p_lines jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7002);
  PERFORM public.assert_inventory_transfer_scope_v2(
    p_source_warehouse_id,p_destination_warehouse_id
  );
END
$function$;

DO $negative_control$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.assert_inventory_transfer_guard_order();
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'negative control failed: a late warehouse guard was accepted';
  END IF;
END
$negative_control$;

-- Simulate a later function redefinition that drops the guard; the migration
-- must restore it at the beginning rather than relying on stale source text.
CREATE OR REPLACE FUNCTION public.transfer_inventory_batch(
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_idempotency_key text,
  p_lines jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7002);
END
$function$;

\ir ../migrations/20261117240000_inventory_transfer_replay_scope_guard.sql
SELECT public.assert_inventory_transfer_guard_order();

SELECT 'inventory transfer replay scope guard PostgreSQL 17 acceptance: PASS' AS result;
DROP FUNCTION public.assert_inventory_transfer_guard_order();
