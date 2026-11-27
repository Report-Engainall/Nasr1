\set ON_ERROR_STOP on

-- Isolated PostgreSQL 17 acceptance for the current endpoint-replay guard.
-- This test applies the actual production migration, executes both transfer RPCs,
-- and proves that stale idempotency keys cannot bypass current endpoint validity.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path=''
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$function$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path=''
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('test.profile_id',true),'')::uuid
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=''
AS $function$
  SELECT true
$function$;

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

-- Minimal disposable relations required by the actual RPC migration.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  auth_user_id uuid NOT NULL,
  is_active boolean NOT NULL
);

CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  is_active boolean NOT NULL
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  status text NOT NULL,
  min_stock numeric(15,3) NOT NULL DEFAULT 0
);

CREATE TABLE public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  product_id uuid NOT NULL,
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  quantity numeric(15,3) NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  created_by uuid NOT NULL,
  batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (organization_id,idempotency_key)
);

CREATE TABLE public.inventory_transfer_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  line_count integer NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (organization_id,idempotency_key)
);

CREATE TABLE public.inventory_balances (
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  quantity_on_hand numeric(15,3) NOT NULL,
  quantity_reserved numeric(15,3) NOT NULL,
  quantity_available numeric(15,3)
    GENERATED ALWAYS AS (quantity_on_hand-quantity_reserved) STORED,
  reorder_point numeric(15,3) NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  updated_at timestamptz,
  PRIMARY KEY (product_id,warehouse_id)
);

CREATE TABLE public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  parent_batch_id uuid,
  batch_number text NOT NULL,
  expiry_date date,
  received_at timestamptz NOT NULL,
  quantity_on_hand numeric(15,3) NOT NULL,
  quantity_reserved numeric(15,3) NOT NULL,
  unit_cost numeric(18,4),
  source_type text,
  source_reference_type text,
  source_reference_id uuid
);

CREATE TABLE public.inventory_transfer_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  inventory_transfer_id uuid NOT NULL,
  source_inventory_batch_id uuid NOT NULL,
  destination_inventory_batch_id uuid NOT NULL,
  quantity numeric(15,3) NOT NULL
);

CREATE TABLE public.inventory_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  movement_type text NOT NULL,
  quantity numeric(15,3) NOT NULL,
  balance_after numeric(15,3) NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  inventory_batch_id uuid
);

CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL
);

-- Use fixed identities so every assertion is deterministic and isolated.
INSERT INTO public.profiles(id,organization_id,auth_user_id,is_active)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  true
);

INSERT INTO public.warehouses(id,organization_id,is_active) VALUES
  ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true),
  ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',true);

INSERT INTO public.products(id,organization_id,status,min_stock) VALUES
  ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','active',0),
  ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','active',0);

INSERT INTO public.inventory_balances(
  product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point
) VALUES
  ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',10,2,0),
  ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',0,0,0),
  ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',10,2,0),
  ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002',0,0,0);

INSERT INTO public.inventory_batches(
  organization_id,product_id,warehouse_id,batch_number,expiry_date,received_at,
  quantity_on_hand,quantity_reserved,unit_cost
) VALUES
  ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001','SINGLE-EARLY','2027-06-30','2026-02-01T00:00:00Z',4,0,1.2500),
  ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001','SINGLE-LATE','2027-12-31','2026-01-01T00:00:00Z',6,2,1.2500),
  ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000002','SINGLE-DEST','2027-12-31','2026-01-01T00:00:00Z',0,0,1.2500),
  ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000001','BATCH-LOT','2027-12-31','2026-01-01T00:00:00Z',10,2,2.5000),
  ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000002','BATCH-DEST','2027-12-31','2026-01-01T00:00:00Z',0,0,2.5000);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false
);
SELECT pg_catalog.set_config(
  'test.profile_id','20000000-0000-0000-0000-000000000001',false
);

-- This is the production migration under test, not the earlier scope-only patch.
\ir ../migrations/20261126110000_inventory_transfer_replay_endpoint_guard.sql

-- Verify both installed RPC definitions lock and validate exactly two active,
-- same-tenant endpoints before acquiring the replay idempotency lock or reading it.
DO $source_contract$
DECLARE
  v_function record;
  v_definition text;
  v_scope_position integer;
  v_endpoint_position integer;
  v_active_position integer;
  v_tenant_position integer;
  v_share_position integer;
  v_count_check_position integer;
  v_replay_lock_position integer;
  v_replay_lookup_position integer;
  v_checked integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid,p.proname
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('transfer_inventory','transfer_inventory_batch')
  LOOP
    v_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(v_function.oid));
    v_scope_position := pg_catalog.strpos(
      v_definition,'perform public.assert_inventory_transfer_scope_v2('
    );
    v_endpoint_position := pg_catalog.strpos(
      v_definition,'select w.id from public.warehouses w'
    );
    v_active_position := pg_catalog.strpos(v_definition,'w.is_active');
    v_tenant_position := pg_catalog.strpos(v_definition,'w.organization_id');
    v_share_position := pg_catalog.strpos(v_definition,'for share');
    v_count_check_position := pg_catalog.strpos(v_definition,'if v_warehouse_count');
    v_replay_lock_position := pg_catalog.strpos(
      v_definition,'pg_catalog.pg_advisory_xact_lock('
    );
    v_replay_lookup_position := pg_catalog.strpos(v_definition,'into v_existing');

    IF v_scope_position=0 OR v_endpoint_position=0
       OR v_active_position=0 OR v_tenant_position=0 OR v_share_position=0
       OR v_count_check_position=0 OR v_replay_lock_position=0
       OR v_replay_lookup_position=0
       OR v_scope_position>v_endpoint_position
       OR v_endpoint_position>v_active_position
       OR v_endpoint_position>v_tenant_position
       OR v_active_position>v_share_position
       OR v_tenant_position>v_share_position
       OR v_share_position>v_count_check_position
       OR v_count_check_position>v_replay_lock_position
       OR v_replay_lock_position>v_replay_lookup_position THEN
      RAISE EXCEPTION
        'live endpoint/replay guard contract failed for public.%',v_function.proname;
    END IF;
    v_checked:=v_checked+1;
  END LOOP;

  IF v_checked<>2 THEN
    RAISE EXCEPTION 'expected two guarded transfer RPCs; checked %',v_checked;
  END IF;
END
$source_contract$;

CREATE OR REPLACE FUNCTION public.test_inventory_transfer_snapshot(p_product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=''
AS $snapshot$
  SELECT pg_catalog.jsonb_build_object(
    'balances',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ib) ORDER BY ib.warehouse_id)
        FROM public.inventory_balances ib
       WHERE ib.product_id=p_product_id
    ),'[]'::jsonb),
    'lots',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b) ORDER BY b.id)
        FROM public.inventory_batches b
       WHERE b.product_id=p_product_id
    ),'[]'::jsonb),
    'transfers',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.id)
        FROM public.inventory_transfers t
       WHERE t.product_id=p_product_id
    ),'[]'::jsonb),
    'transfer_batch_items',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ti) ORDER BY ti.id)
        FROM public.inventory_transfer_batch_items ti
       WHERE ti.inventory_transfer_id IN (
         SELECT t.id FROM public.inventory_transfers t
          WHERE t.product_id=p_product_id
       )
    ),'[]'::jsonb),
    'movements',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.id)
        FROM public.inventory_movements m
       WHERE m.product_id=p_product_id
    ),'[]'::jsonb),
    'transfer_batches',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(tb) ORDER BY tb.id)
        FROM public.inventory_transfer_batches tb
       WHERE tb.organization_id='10000000-0000-0000-0000-000000000001'
         AND tb.payload @> pg_catalog.jsonb_build_array(
           pg_catalog.jsonb_build_object('product_id',p_product_id)
         )
    ),'[]'::jsonb),
    'audit_count',(
      SELECT pg_catalog.count(*) FROM public.audit_logs a
       WHERE a.organization_id='10000000-0000-0000-0000-000000000001'
    )
  )
$snapshot$;

-- Single-product transfer: exact replay remains available while both endpoints
-- are valid; it is denied after either endpoint becomes inactive or foreign.
DO $single_transfer$
DECLARE
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_denied boolean;
  v_transfer_id uuid;
  v_lot_trace record;
  v_source_on_hand numeric(15,3);
  v_source_reserved numeric(15,3);
  v_destination_on_hand numeric(15,3);
  v_destination_reserved numeric(15,3);
  v_transfer_out_count integer;
  v_transfer_in_count integer;
BEGIN
  v_result:=public.transfer_inventory(
    '50000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    2,'PG17 endpoint replay guard','pg17-single-transfer-key-0001'
  );
  IF v_result->>'idempotent_replay'<>'false' THEN
    RAISE EXCEPTION 'first single transfer was not recorded as a new transfer: %',v_result;
  END IF;

  -- The real transfer command must consume the earliest-expiring free lot and
  -- create a destination child lot with exact expiry/cost/receipt lineage.
  v_transfer_id := (v_result->>'transfer_id')::uuid;
  IF v_transfer_id IS NULL THEN
    RAISE EXCEPTION 'single transfer did not return its persisted transfer ID';
  END IF;
  SELECT
    ti.quantity,
    source.id AS source_batch_id,
    source.batch_number AS source_batch_number,
    source.expiry_date AS source_expiry_date,
    source.received_at AS source_received_at,
    source.unit_cost AS source_unit_cost,
    source.quantity_on_hand AS source_quantity_after,
    source.quantity_reserved AS source_reserved_after,
    destination.id AS destination_batch_id,
    destination.parent_batch_id,
    destination.warehouse_id AS destination_warehouse_id,
    destination.batch_number AS destination_batch_number,
    destination.expiry_date AS destination_expiry_date,
    destination.received_at AS destination_received_at,
    destination.quantity_on_hand AS destination_quantity_after,
    destination.quantity_reserved AS destination_reserved_after,
    destination.unit_cost AS destination_unit_cost,
    destination.source_type AS destination_source_type,
    destination.source_reference_type,
    destination.source_reference_id
  INTO v_lot_trace
  FROM public.inventory_transfer_batch_items ti
  JOIN public.inventory_batches source
    ON source.id=ti.source_inventory_batch_id
  JOIN public.inventory_batches destination
    ON destination.id=ti.destination_inventory_batch_id
  WHERE ti.inventory_transfer_id=v_transfer_id;

  IF NOT FOUND
     OR v_lot_trace.quantity IS DISTINCT FROM 2::numeric
     OR v_lot_trace.source_batch_number IS DISTINCT FROM 'SINGLE-EARLY'
     OR v_lot_trace.source_expiry_date IS DISTINCT FROM DATE '2027-06-30'
     OR v_lot_trace.source_quantity_after IS DISTINCT FROM 2::numeric
     OR v_lot_trace.source_reserved_after IS DISTINCT FROM 0::numeric
     OR v_lot_trace.parent_batch_id IS DISTINCT FROM v_lot_trace.source_batch_id
     OR v_lot_trace.destination_warehouse_id IS DISTINCT FROM '40000000-0000-0000-0000-000000000002'::uuid
     OR v_lot_trace.destination_batch_number IS DISTINCT FROM v_lot_trace.source_batch_number
     OR v_lot_trace.destination_expiry_date IS DISTINCT FROM v_lot_trace.source_expiry_date
     OR v_lot_trace.destination_received_at IS DISTINCT FROM v_lot_trace.source_received_at
     OR v_lot_trace.destination_quantity_after IS DISTINCT FROM 2::numeric
     OR v_lot_trace.destination_reserved_after IS DISTINCT FROM 0::numeric
     OR v_lot_trace.destination_unit_cost IS DISTINCT FROM v_lot_trace.source_unit_cost
     OR v_lot_trace.destination_unit_cost IS DISTINCT FROM 1.2500::numeric
     OR v_lot_trace.destination_source_type IS DISTINCT FROM 'inventory_transfer'
     OR v_lot_trace.source_reference_type IS DISTINCT FROM 'inventory_transfer'
     OR v_lot_trace.source_reference_id IS DISTINCT FROM v_transfer_id THEN
    RAISE EXCEPTION 'single transfer did not preserve FEFO lot identity/expiry/cost lineage: %',to_jsonb(v_lot_trace);
  END IF;

  SELECT quantity_on_hand,quantity_reserved
    INTO v_source_on_hand,v_source_reserved
    FROM public.inventory_balances
   WHERE product_id='50000000-0000-0000-0000-000000000001'
     AND warehouse_id='40000000-0000-0000-0000-000000000001';
  SELECT quantity_on_hand,quantity_reserved
    INTO v_destination_on_hand,v_destination_reserved
    FROM public.inventory_balances
   WHERE product_id='50000000-0000-0000-0000-000000000001'
     AND warehouse_id='40000000-0000-0000-0000-000000000002';
  IF v_source_on_hand IS DISTINCT FROM 8::numeric
     OR v_source_reserved IS DISTINCT FROM 2::numeric
     OR v_destination_on_hand IS DISTINCT FROM 2::numeric
     OR v_destination_reserved IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'single transfer aggregate balances/reservations are inconsistent';
  END IF;

  SELECT
    count(*) FILTER(WHERE movement_type='transfer_out'
      AND warehouse_id='40000000-0000-0000-0000-000000000001'
      AND inventory_batch_id=v_lot_trace.source_batch_id AND quantity=-2),
    count(*) FILTER(WHERE movement_type='transfer_in'
      AND warehouse_id='40000000-0000-0000-0000-000000000002'
      AND inventory_batch_id=v_lot_trace.destination_batch_id AND quantity=2)
  INTO v_transfer_out_count,v_transfer_in_count
  FROM public.inventory_movements
  WHERE reference_type='inventory_transfer' AND reference_id=v_transfer_id;
  IF v_transfer_out_count IS DISTINCT FROM 1 OR v_transfer_in_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'single transfer movement ledger is not paired to its exact source/destination lots';
  END IF;

  v_result:=public.transfer_inventory(
    '50000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    2,'PG17 endpoint replay guard','pg17-single-transfer-key-0001'
  );
  IF v_result->>'idempotent_replay'<>'true' THEN
    RAISE EXCEPTION 'authorized single transfer retry did not replay: %',v_result;
  END IF;

  v_before:=public.test_inventory_transfer_snapshot(
    '50000000-0000-0000-0000-000000000001'
  );

  UPDATE public.warehouses SET is_active=false
   WHERE id='40000000-0000-0000-0000-000000000002';
  v_denied:=false;
  BEGIN
    PERFORM public.transfer_inventory(
      '50000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      2,'PG17 endpoint replay guard','pg17-single-transfer-key-0001'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_denied:=true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'single transfer replay was not denied after destination deactivation';
  END IF;
  v_after:=public.test_inventory_transfer_snapshot(
    '50000000-0000-0000-0000-000000000001'
  );
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'denied single transfer replay changed balances, lots, transfers, movements or audit';
  END IF;

  UPDATE public.warehouses SET is_active=true
   WHERE id='40000000-0000-0000-0000-000000000002';
  UPDATE public.warehouses
     SET organization_id='10000000-0000-0000-0000-000000000002'
   WHERE id='40000000-0000-0000-0000-000000000001';
  v_denied:=false;
  BEGIN
    PERFORM public.transfer_inventory(
      '50000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      2,'PG17 endpoint replay guard','pg17-single-transfer-key-0001'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_denied:=true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'single transfer replay was not denied after source tenant reassignment';
  END IF;
  v_after:=public.test_inventory_transfer_snapshot(
    '50000000-0000-0000-0000-000000000001'
  );
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'foreign-source replay changed single-transfer inventory or audit state';
  END IF;
  UPDATE public.warehouses
     SET organization_id='10000000-0000-0000-0000-000000000001'
   WHERE id='40000000-0000-0000-0000-000000000001';
END
$single_transfer$;

-- Multi-product batch transfer has the same endpoint-before-replay contract.
DO $batch_transfer$
DECLARE
  v_lines jsonb:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'product_id','50000000-0000-0000-0000-000000000002',
      'quantity',1
    )
  );
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_denied boolean;
  v_transfer_id uuid;
  v_lot_trace record;
  v_transfer_out_count integer;
  v_transfer_in_count integer;
BEGIN
  v_result:=public.transfer_inventory_batch(
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    'pg17-batch-transfer-key-0001',v_lines,'PG17 batch endpoint replay guard'
  );
  IF v_result->>'idempotent_replay'<>'false' THEN
    RAISE EXCEPTION 'first batch transfer was not recorded as new: %',v_result;
  END IF;

  -- Prove the multi-product RPC also preserves exact lot ancestry and paired movements.
  v_transfer_id := (v_result->'transfer_ids'->>0)::uuid;
  IF v_transfer_id IS NULL THEN
    RAISE EXCEPTION 'batch transfer did not return its persisted product transfer ID';
  END IF;
  SELECT
    ti.quantity,
    source.id AS source_batch_id,
    source.batch_number AS source_batch_number,
    source.expiry_date AS source_expiry_date,
    source.received_at AS source_received_at,
    source.unit_cost AS source_unit_cost,
    source.quantity_on_hand AS source_quantity_after,
    source.quantity_reserved AS source_reserved_after,
    destination.id AS destination_batch_id,
    destination.parent_batch_id,
    destination.warehouse_id AS destination_warehouse_id,
    destination.batch_number AS destination_batch_number,
    destination.expiry_date AS destination_expiry_date,
    destination.received_at AS destination_received_at,
    destination.quantity_on_hand AS destination_quantity_after,
    destination.quantity_reserved AS destination_reserved_after,
    destination.unit_cost AS destination_unit_cost,
    destination.source_type AS destination_source_type,
    destination.source_reference_type,
    destination.source_reference_id
  INTO v_lot_trace
  FROM public.inventory_transfer_batch_items ti
  JOIN public.inventory_batches source
    ON source.id=ti.source_inventory_batch_id
  JOIN public.inventory_batches destination
    ON destination.id=ti.destination_inventory_batch_id
  WHERE ti.inventory_transfer_id=v_transfer_id;

  IF NOT FOUND
     OR v_lot_trace.quantity IS DISTINCT FROM 1::numeric
     OR v_lot_trace.source_batch_number IS DISTINCT FROM 'BATCH-LOT'
     OR v_lot_trace.source_expiry_date IS DISTINCT FROM DATE '2027-12-31'
     OR v_lot_trace.source_quantity_after IS DISTINCT FROM 9::numeric
     OR v_lot_trace.source_reserved_after IS DISTINCT FROM 2::numeric
     OR v_lot_trace.parent_batch_id IS DISTINCT FROM v_lot_trace.source_batch_id
     OR v_lot_trace.destination_warehouse_id IS DISTINCT FROM '40000000-0000-0000-0000-000000000002'::uuid
     OR v_lot_trace.destination_batch_number IS DISTINCT FROM v_lot_trace.source_batch_number
     OR v_lot_trace.destination_expiry_date IS DISTINCT FROM v_lot_trace.source_expiry_date
     OR v_lot_trace.destination_received_at IS DISTINCT FROM v_lot_trace.source_received_at
     OR v_lot_trace.destination_quantity_after IS DISTINCT FROM 1::numeric
     OR v_lot_trace.destination_reserved_after IS DISTINCT FROM 0::numeric
     OR v_lot_trace.destination_unit_cost IS DISTINCT FROM v_lot_trace.source_unit_cost
     OR v_lot_trace.destination_unit_cost IS DISTINCT FROM 2.5000::numeric
     OR v_lot_trace.destination_source_type IS DISTINCT FROM 'inventory_transfer'
     OR v_lot_trace.source_reference_type IS DISTINCT FROM 'inventory_transfer'
     OR v_lot_trace.source_reference_id IS DISTINCT FROM v_transfer_id THEN
    RAISE EXCEPTION 'batch transfer did not preserve lot identity/expiry/cost lineage: %',to_jsonb(v_lot_trace);
  END IF;

  SELECT
    count(*) FILTER(WHERE movement_type='transfer_out'
      AND warehouse_id='40000000-0000-0000-0000-000000000001'
      AND inventory_batch_id=v_lot_trace.source_batch_id AND quantity=-1),
    count(*) FILTER(WHERE movement_type='transfer_in'
      AND warehouse_id='40000000-0000-0000-0000-000000000002'
      AND inventory_batch_id=v_lot_trace.destination_batch_id AND quantity=1)
  INTO v_transfer_out_count,v_transfer_in_count
  FROM public.inventory_movements
  WHERE reference_type='inventory_transfer' AND reference_id=v_transfer_id;
  IF v_transfer_out_count IS DISTINCT FROM 1 OR v_transfer_in_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'batch transfer movement ledger is not paired to its exact source/destination lots';
  END IF;

  v_result:=public.transfer_inventory_batch(
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    'pg17-batch-transfer-key-0001',v_lines,'PG17 batch endpoint replay guard'
  );
  IF v_result->>'idempotent_replay'<>'true' THEN
    RAISE EXCEPTION 'authorized batch retry did not replay: %',v_result;
  END IF;

  v_before:=public.test_inventory_transfer_snapshot(
    '50000000-0000-0000-0000-000000000002'
  );

  UPDATE public.warehouses SET is_active=false
   WHERE id='40000000-0000-0000-0000-000000000001';
  v_denied:=false;
  BEGIN
    PERFORM public.transfer_inventory_batch(
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      'pg17-batch-transfer-key-0001',v_lines,'PG17 batch endpoint replay guard'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_denied:=true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'batch transfer replay was not denied after source deactivation';
  END IF;
  v_after:=public.test_inventory_transfer_snapshot(
    '50000000-0000-0000-0000-000000000002'
  );
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'denied batch replay changed balances, lots, transfers, movements or audit';
  END IF;

  UPDATE public.warehouses SET is_active=true
   WHERE id='40000000-0000-0000-0000-000000000001';
  UPDATE public.warehouses
     SET organization_id='10000000-0000-0000-0000-000000000002'
   WHERE id='40000000-0000-0000-0000-000000000002';
  v_denied:=false;
  BEGIN
    PERFORM public.transfer_inventory_batch(
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      'pg17-batch-transfer-key-0001',v_lines,'PG17 batch endpoint replay guard'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_denied:=true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'batch transfer replay was not denied after destination tenant reassignment';
  END IF;
  v_after:=public.test_inventory_transfer_snapshot(
    '50000000-0000-0000-0000-000000000002'
  );
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'foreign-destination replay changed batch inventory or audit state';
  END IF;
END
$batch_transfer$;

SELECT 'inventory transfer endpoint replay guard PostgreSQL 17 acceptance: PASS' AS result;
