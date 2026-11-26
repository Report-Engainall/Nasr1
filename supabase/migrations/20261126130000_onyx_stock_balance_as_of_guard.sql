-- P2: bind every Onyx StockBalances reconciliation to its source as_of_date.
-- Date-only source values are interpreted as an inclusive UTC calendar day.
-- A balance or movement written on a later UTC day makes the source snapshot stale.
BEGIN;

ALTER TABLE public.onyx_inventory_reconciliation_commands
  ADD COLUMN IF NOT EXISTS source_as_of_date date;

ALTER TABLE public.onyx_inventory_reconciliation_items
  ADD COLUMN IF NOT EXISTS source_as_of_date date;

CREATE OR REPLACE FUNCTION public.guard_onyx_inventory_reconciliation_as_of_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid;
  v_snapshot_id uuid;
  v_warehouse_id uuid;
  v_command_status text;
  v_command_as_of_date date;
  v_source public.onyx_snapshot_rows%ROWTYPE;
  v_source_as_of_text text;
  v_source_as_of_date date;
  v_source_item_code text;
  v_cutoff timestamptz;
  v_latest_movement_at timestamptz;
  v_balance_updated_at timestamptz;
  v_balance_last_movement_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.source_as_of_date IS DISTINCT FROM OLD.source_as_of_date THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'Onyx reconciliation source as_of_date is immutable after preview';
    END IF;
    RETURN NEW;
  END IF;

  SELECT c.organization_id, c.snapshot_id, c.warehouse_id, c.status, c.source_as_of_date
    INTO v_org, v_snapshot_id, v_warehouse_id, v_command_status, v_command_as_of_date
    FROM public.onyx_inventory_reconciliation_commands c
   WHERE c.id = NEW.command_id
   FOR UPDATE;

  IF NOT FOUND OR v_org IS DISTINCT FROM NEW.organization_id OR v_command_status <> 'previewed' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Onyx source date can only be bound to a preview command in the same organization';
  END IF;

  SELECT r.* INTO v_source
    FROM public.onyx_snapshot_rows r
   WHERE r.id = NEW.snapshot_row_id
     AND r.snapshot_id = v_snapshot_id
     AND r.organization_id = v_org
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Onyx source row is not part of the selected organization snapshot';
  END IF;

  IF NEW.source_row_hash IS DISTINCT FROM v_source.row_hash
     OR NEW.source_row_hash IS DISTINCT FROM pg_catalog.md5(v_source.data::text) THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Onyx source row hash is missing or does not match its immutable payload';
  END IF;

  v_source_item_code := COALESCE(
    NULLIF(pg_catalog.btrim(v_source.data->>'item_code'), ''),
    v_source.canonical_key
  );
  IF NEW.item_code IS DISTINCT FROM v_source_item_code
     OR NOT EXISTS (
       SELECT 1
         FROM public.products p
        WHERE p.id = NEW.product_id
          AND p.organization_id = v_org
          AND p.item_code = v_source_item_code
          AND p.status = 'active'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Onyx source date row is not bound to the same active tenant product';
  END IF;

  v_source_as_of_text := NULLIF(pg_catalog.btrim(v_source.data->>'as_of_date'), '');
  IF v_source_as_of_text IS NULL OR v_source_as_of_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Onyx StockBalances row requires a real YYYY-MM-DD as_of_date';
  END IF;

  BEGIN
    v_source_as_of_date := v_source_as_of_text::date;
  EXCEPTION
    WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'Onyx StockBalances as_of_date is not a valid calendar date';
  END;

  IF pg_catalog.to_char(v_source_as_of_date, 'YYYY-MM-DD') <> v_source_as_of_text THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Onyx StockBalances as_of_date must use canonical YYYY-MM-DD format';
  END IF;

  IF v_source_as_of_date > (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Onyx StockBalances as_of_date cannot be in the future';
  END IF;

  IF v_command_as_of_date IS NOT NULL
     AND v_command_as_of_date IS DISTINCT FROM v_source_as_of_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'all rows in one warehouse reconciliation must share the same as_of_date';
  END IF;

  -- A date-only source is treated as a close-of-day snapshot. No later UTC-day
  -- balance update, last movement, or movement-ledger event may be overwritten.
  v_cutoff := ((v_source_as_of_date + 1)::timestamp without time zone AT TIME ZONE 'UTC');

  SELECT pg_catalog.max(m.created_at)
    INTO v_latest_movement_at
    FROM public.inventory_movements m
   WHERE m.product_id = NEW.product_id
     AND m.warehouse_id = v_warehouse_id;

  SELECT b.updated_at, b.last_movement_at
    INTO v_balance_updated_at, v_balance_last_movement_at
    FROM public.inventory_balances b
   WHERE b.product_id = NEW.product_id
     AND b.warehouse_id = v_warehouse_id;

  IF (v_latest_movement_at IS NOT NULL AND v_latest_movement_at >= v_cutoff)
     OR (v_balance_updated_at IS NOT NULL AND v_balance_updated_at >= v_cutoff)
     OR (v_balance_last_movement_at IS NOT NULL AND v_balance_last_movement_at >= v_cutoff) THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Onyx StockBalances source is stale: a later stock movement or balance update exists; import a newer snapshot';
  END IF;

  IF v_command_as_of_date IS NULL THEN
    UPDATE public.onyx_inventory_reconciliation_commands
       SET source_as_of_date = v_source_as_of_date
     WHERE id = NEW.command_id
       AND organization_id = v_org
       AND source_as_of_date IS NULL;
  END IF;

  NEW.source_as_of_date := v_source_as_of_date;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_onyx_inventory_reconciliation_as_of_date() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS onyx_inventory_reconciliation_item_as_of_guard
  ON public.onyx_inventory_reconciliation_items;
CREATE TRIGGER onyx_inventory_reconciliation_item_as_of_guard
BEFORE INSERT OR UPDATE OF source_as_of_date
ON public.onyx_inventory_reconciliation_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_onyx_inventory_reconciliation_as_of_date();

CREATE OR REPLACE FUNCTION public.guard_onyx_inventory_reconciliation_command_as_of_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.source_as_of_date IS NOT NULL
     AND NEW.source_as_of_date IS DISTINCT FROM OLD.source_as_of_date THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'Onyx reconciliation command source_as_of_date is immutable';
  END IF;

  IF OLD.status = 'previewed' AND NEW.status = 'applied'
     AND NEW.source_as_of_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'legacy Onyx preview has no verified source as_of_date and cannot be applied; create a new preview';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_onyx_inventory_reconciliation_command_as_of_date() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS onyx_inventory_reconciliation_command_as_of_guard
  ON public.onyx_inventory_reconciliation_commands;
CREATE TRIGGER onyx_inventory_reconciliation_command_as_of_guard
BEFORE UPDATE OF status, source_as_of_date
ON public.onyx_inventory_reconciliation_commands
FOR EACH ROW
EXECUTE FUNCTION public.guard_onyx_inventory_reconciliation_command_as_of_date();

-- Include the date in command reads so reviewers can distinguish a dated snapshot
-- from a legacy preview. No client-supplied date is trusted for apply.
CREATE OR REPLACE FUNCTION public.list_onyx_inventory_reconciliation_commands(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active staff organization required to read Onyx reconciliation history';
  END IF;
  IF p_snapshot_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.onyx_snapshots s
     WHERE s.id = p_snapshot_id AND s.organization_id = v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Onyx snapshot is unavailable in the current organization';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'command_id', c.id,
    'snapshot_id', c.snapshot_id,
    'warehouse_id', c.warehouse_id,
    'warehouse_name', w.name,
    'warehouse_code', w.code,
    'status', c.status,
    'reason', c.reason,
    'source_as_of_date', c.source_as_of_date,
    'source_row_count', c.source_row_count,
    'adjusted_lines', c.adjusted_lines,
    'created_at', c.created_at,
    'applied_at', c.applied_at,
    'rolled_back_at', c.rolled_back_at
  ) ORDER BY c.created_at DESC, c.id DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT *
        FROM public.onyx_inventory_reconciliation_commands
       WHERE organization_id = v_org
         AND snapshot_id = p_snapshot_id
       ORDER BY created_at DESC, id DESC
       LIMIT 50
    ) c
    JOIN public.warehouses w
      ON w.id = c.warehouse_id
     AND w.organization_id = v_org;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_onyx_inventory_reconciliation_commands(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_onyx_inventory_reconciliation_commands(uuid) TO authenticated;

COMMENT ON COLUMN public.onyx_inventory_reconciliation_commands.source_as_of_date IS
  'Immutable source StockBalances as_of_date; all rows in one warehouse command must share this close-of-UTC-day date.';
COMMENT ON COLUMN public.onyx_inventory_reconciliation_items.source_as_of_date IS
  'The immutable as_of_date copied and verified from this item source row at preview time.';
COMMENT ON FUNCTION public.guard_onyx_inventory_reconciliation_as_of_date() IS
  'Binds source rows to a canonical shared as_of_date and rejects snapshots older than current balance updates or movement-ledger events.';
COMMENT ON FUNCTION public.guard_onyx_inventory_reconciliation_command_as_of_date() IS
  'Prevents changing the verified source date and blocks application of pre-guard legacy previews without a dated source manifest.';

COMMIT;