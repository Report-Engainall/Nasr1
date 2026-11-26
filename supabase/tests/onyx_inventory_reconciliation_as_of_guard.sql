\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN'; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('nasr.test.auth_uid', true), '')::uuid;
$function$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  is_active boolean NOT NULL
);
CREATE TABLE public.user_roles (
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role text NOT NULL
);
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  code text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  item_code text NOT NULL,
  status text NOT NULL,
  min_stock numeric(15,3) NOT NULL DEFAULT 0
);
CREATE TABLE public.inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  quantity_on_hand numeric(15,3) NOT NULL CHECK (quantity_on_hand >= 0),
  quantity_reserved numeric(15,3) NOT NULL CHECK (quantity_reserved >= 0),
  reorder_point numeric(15,3) NOT NULL DEFAULT 0,
  quantity_available numeric(15,3) GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  last_movement_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (product_id, warehouse_id)
);
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  movement_type text NOT NULL,
  quantity numeric(15,3) NOT NULL,
  balance_after numeric(15,3) NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  reason text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  old_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.onyx_snapshots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  status text NOT NULL,
  source_file_hash text NOT NULL,
  report_type text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL CHECK (row_count > 0)
);
CREATE TABLE public.onyx_snapshot_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.onyx_snapshots(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  row_number integer NOT NULL,
  canonical_key text,
  status text NOT NULL,
  data jsonb NOT NULL,
  row_hash text NOT NULL
);

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('nasr.test.profile_id', true), '')::uuid;
$function$;
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('nasr.test.organization_id', true), '')::uuid;
$function$;
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id = public.current_profile_id()
       AND r.role IN ('admin','manager','staff')
  );
$function$;
CREATE OR REPLACE FUNCTION public.operational_tasks_can_manage()
RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id = public.current_profile_id()
       AND r.role IN ('admin','manager')
  );
$function$;

\ir ../migrations/20261021100000_onyx_inventory_reconciliation_apply_rollback.sql
\ir ../migrations/20261126130000_onyx_stock_balance_as_of_guard.sql

BEGIN;

INSERT INTO public.organizations(id,is_active)
VALUES ('10000000-0000-4000-8000-000000000001',true);
INSERT INTO public.profiles(id,auth_user_id,organization_id,is_active)
VALUES ('20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',true);
INSERT INTO public.user_roles(profile_id,role)
VALUES ('20000000-0000-4000-8000-000000000001','manager');
INSERT INTO public.warehouses(id,organization_id,name,code,is_active)
VALUES ('40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'P2 as-of warehouse','P2-ASOF',true);

SELECT pg_catalog.set_config('nasr.test.auth_uid','30000000-0000-4000-8000-000000000001',false);
SELECT pg_catalog.set_config('nasr.test.profile_id','20000000-0000-4000-8000-000000000001',false);
SELECT pg_catalog.set_config('nasr.test.organization_id','10000000-0000-4000-8000-000000000001',false);

DO $acceptance$
DECLARE
  v_org uuid := '10000000-0000-4000-8000-000000000001';
  v_warehouse uuid := '40000000-0000-4000-8000-000000000001';
  v_today date := (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::date;
  v_snapshot uuid;
  v_product uuid;
  v_row uuid;
  v_command uuid;
  v_result jsonb;
  v_count integer;
  v_balance numeric(15,3);
  v_reserved numeric(15,3);
  v_as_of date;
  v_data jsonb;
  v_stale_product uuid := '50000000-0000-4000-8000-000000000002';
  v_stale_snapshot uuid := '60000000-0000-4000-8000-000000000002';
  v_mixed_snapshot uuid := '60000000-0000-4000-8000-000000000003';
  v_legacy_snapshot uuid := '60000000-0000-4000-8000-000000000004';
  v_legacy_command uuid := '70000000-0000-4000-8000-000000000004';
  v_legacy_status text;
  v_replay boolean;
BEGIN
  -- Fresh source: preview has no stock side effect; apply produces one movement/audit;
  -- the same apply key replays the committed response without duplicate ledger writes.
  v_product := '50000000-0000-4000-8000-000000000001';
  v_snapshot := '60000000-0000-4000-8000-000000000001';
  INSERT INTO public.products(id,organization_id,item_code,status,min_stock)
  VALUES(v_product,v_org,'P2-ASOF-FRESH','active',0);
  INSERT INTO public.inventory_balances(
    product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point,last_movement_at,updated_at
  ) VALUES(
    v_product,v_warehouse,10,2,0,
    pg_catalog.statement_timestamp()-interval '2 days',
    pg_catalog.statement_timestamp()-interval '2 days'
  );
  INSERT INTO public.inventory_movements(
    product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_at
  ) VALUES(
    v_product,v_warehouse,'opening',10,10,'acceptance_fixture',v_product,'older than source date',
    pg_catalog.statement_timestamp()-interval '2 days'
  );
  INSERT INTO public.onyx_snapshots(id,organization_id,status,source_file_hash,report_type,metrics,row_count)
  VALUES(v_snapshot,v_org,'ready',pg_catalog.md5(v_snapshot::text),'inventory_stock','{}'::jsonb,1);
  v_data := pg_catalog.jsonb_build_object(
    'item_code','P2-ASOF-FRESH',
    'warehouse_id',v_warehouse,
    'quantity','12',
    'as_of_date',pg_catalog.to_char(v_today,'YYYY-MM-DD')
  );
  INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash)
  VALUES('80000000-0000-4000-8000-000000000001',v_snapshot,v_org,1,'P2-ASOF-FRESH','valid',v_data,pg_catalog.md5(v_data::text));

  v_result := public.preview_onyx_inventory_reconciliation(
    v_snapshot,v_warehouse,'p2-asof-preview-fresh-0001','Fresh dated source acceptance'
  );
  v_command := (v_result->>'command_id')::uuid;
  IF v_result->>'status' <> 'previewed' THEN
    RAISE EXCEPTION 'fresh source preview did not reach previewed state: %',v_result;
  END IF;
  SELECT source_as_of_date INTO v_as_of
    FROM public.onyx_inventory_reconciliation_commands WHERE id=v_command;
  IF v_as_of IS DISTINCT FROM v_today THEN
    RAISE EXCEPTION 'command did not persist the source as_of_date';
  END IF;
  v_result := public.list_onyx_inventory_reconciliation_commands(v_snapshot);
  IF v_result->0->>'source_as_of_date' IS DISTINCT FROM pg_catalog.to_char(v_today,'YYYY-MM-DD') THEN
    RAISE EXCEPTION 'authorized command reader did not expose the persisted source as_of_date: %',v_result;
  END IF;
  SELECT source_as_of_date INTO v_as_of
    FROM public.onyx_inventory_reconciliation_items WHERE command_id=v_command;
  IF v_as_of IS DISTINCT FROM v_today THEN
    RAISE EXCEPTION 'item did not persist the source as_of_date';
  END IF;

  -- A reviewed source date is immutable at both command and line level.
  BEGIN
    UPDATE public.onyx_inventory_reconciliation_commands
       SET source_as_of_date = v_today - 1
     WHERE id = v_command;
    RAISE EXCEPTION 'command source as_of_date unexpectedly changed after preview';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
  SELECT source_as_of_date INTO v_as_of
    FROM public.onyx_inventory_reconciliation_commands WHERE id=v_command;
  IF v_as_of IS DISTINCT FROM v_today THEN
    RAISE EXCEPTION 'command source as_of_date changed despite immutable guard';
  END IF;

  BEGIN
    UPDATE public.onyx_inventory_reconciliation_items
       SET source_as_of_date = v_today - 1
     WHERE command_id = v_command;
    RAISE EXCEPTION 'item source as_of_date unexpectedly changed after preview';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
  SELECT source_as_of_date INTO v_as_of
    FROM public.onyx_inventory_reconciliation_items WHERE command_id=v_command;
  IF v_as_of IS DISTINCT FROM v_today THEN
    RAISE EXCEPTION 'item source as_of_date changed despite immutable guard';
  END IF;

  SELECT quantity_on_hand,quantity_reserved INTO v_balance,v_reserved
    FROM public.inventory_balances WHERE product_id=v_product AND warehouse_id=v_warehouse;
  IF v_balance<>10 OR v_reserved<>2 THEN
    RAISE EXCEPTION 'preview changed inventory before approval: on_hand %, reserved %',v_balance,v_reserved;
  END IF;

  v_result := public.apply_onyx_inventory_reconciliation(v_command,'p2-asof-apply-fresh-0001');
  IF v_result->>'status'<>'applied' OR (v_result->>'adjusted_lines')::integer<>1 THEN
    RAISE EXCEPTION 'fresh dated apply failed: %',v_result;
  END IF;
  v_result := public.apply_onyx_inventory_reconciliation(v_command,'p2-asof-apply-fresh-0001');
  IF v_result->>'status'<>'applied' OR (v_result->>'idempotent_replay')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'exact apply replay failed: %',v_result;
  END IF;
  SELECT quantity_on_hand,quantity_reserved INTO v_balance,v_reserved
    FROM public.inventory_balances WHERE product_id=v_product AND warehouse_id=v_warehouse;
  IF v_balance<>12 OR v_reserved<>2 THEN
    RAISE EXCEPTION 'apply quantity or reservations are incorrect: on_hand %, reserved %',v_balance,v_reserved;
  END IF;
  SELECT count(*)::integer INTO v_count
    FROM public.inventory_movements
   WHERE product_id=v_product AND warehouse_id=v_warehouse
     AND reference_type='onyx_inventory_reconciliation' AND reference_id=v_command;
  IF v_count<>1 THEN RAISE EXCEPTION 'exact replay duplicated movement rows: %',v_count; END IF;
  SELECT count(*)::integer INTO v_count
    FROM public.audit_logs
   WHERE entity_type='onyx_inventory_reconciliation' AND entity_id=v_command
     AND action='inventory.onyx_reconciliation.applied';
  IF v_count<>1 THEN RAISE EXCEPTION 'exact replay duplicated apply audit rows: %',v_count; END IF;

  -- The original compensating rollback still works if no later movement exists.
  v_result := public.rollback_onyx_inventory_reconciliation(v_command,'p2-asof-rollback-fresh-0001','Rollback fresh-source acceptance fixture');
  IF v_result->>'status'<>'rolled_back' THEN
    RAISE EXCEPTION 'compensating rollback failed: %',v_result;
  END IF;
  SELECT quantity_on_hand,quantity_reserved INTO v_balance,v_reserved
    FROM public.inventory_balances WHERE product_id=v_product AND warehouse_id=v_warehouse;
  IF v_balance<>10 OR v_reserved<>2 THEN
    RAISE EXCEPTION 'compensating rollback did not restore the baseline: on_hand %, reserved %',v_balance,v_reserved;
  END IF;

  -- A movement after the source as_of_date makes the whole preview fail closed.
  INSERT INTO public.products(id,organization_id,item_code,status,min_stock)
  VALUES(v_stale_product,v_org,'P2-ASOF-STALE-MOVEMENT','active',0);
  INSERT INTO public.inventory_balances(
    product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point,last_movement_at,updated_at
  ) VALUES(
    v_stale_product,v_warehouse,4,0,0,
    pg_catalog.statement_timestamp()-interval '5 days',
    pg_catalog.statement_timestamp()-interval '5 days'
  );
  INSERT INTO public.inventory_movements(
    product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_at
  ) VALUES(
    v_stale_product,v_warehouse,'receipt',4,4,'acceptance_fixture',v_stale_product,'after source date',
    pg_catalog.statement_timestamp()-interval '1 day'
  );
  INSERT INTO public.onyx_snapshots(id,organization_id,status,source_file_hash,report_type,metrics,row_count)
  VALUES(v_stale_snapshot,v_org,'ready',pg_catalog.md5(v_stale_snapshot::text),'inventory_stock','{}'::jsonb,1);
  v_data := pg_catalog.jsonb_build_object(
    'item_code','P2-ASOF-STALE-MOVEMENT',
    'warehouse_id',v_warehouse,
    'quantity','5',
    'as_of_date',pg_catalog.to_char(v_today-3,'YYYY-MM-DD')
  );
  INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash)
  VALUES('80000000-0000-4000-8000-000000000002',v_stale_snapshot,v_org,1,'P2-ASOF-STALE-MOVEMENT','valid',v_data,pg_catalog.md5(v_data::text));
  BEGIN
    PERFORM public.preview_onyx_inventory_reconciliation(
      v_stale_snapshot,v_warehouse,'p2-asof-preview-stale-0001','Stale movement must reject'
    );
    RAISE EXCEPTION 'stale movement snapshot unexpectedly previewed';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.onyx_inventory_reconciliation_commands WHERE snapshot_id=v_stale_snapshot) THEN
    RAISE EXCEPTION 'stale movement created a persisted preview command';
  END IF;

  -- A later balance update is also stale even when the movement ledger is incomplete.
  INSERT INTO public.products(id,organization_id,item_code,status,min_stock)
  VALUES('50000000-0000-4000-8000-000000000003',v_org,'P2-ASOF-STALE-BALANCE','active',0);
  INSERT INTO public.inventory_balances(
    product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point,last_movement_at,updated_at
  ) VALUES(
    '50000000-0000-4000-8000-000000000003',v_warehouse,6,0,0,NULL,
    pg_catalog.statement_timestamp()
  );
  v_data := pg_catalog.jsonb_build_object(
    'item_code','P2-ASOF-STALE-BALANCE',
    'warehouse_id',v_warehouse,
    'quantity','6',
    'as_of_date',pg_catalog.to_char(v_today-1,'YYYY-MM-DD')
  );
  INSERT INTO public.onyx_snapshots(id,organization_id,status,source_file_hash,report_type,metrics,row_count)
  VALUES('60000000-0000-4000-8000-000000000005',v_org,'ready',pg_catalog.md5('stale-balance'),'inventory_stock','{}'::jsonb,1);
  INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash)
  VALUES('80000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000005',v_org,1,'P2-ASOF-STALE-BALANCE','valid',v_data,pg_catalog.md5(v_data::text));
  BEGIN
    PERFORM public.preview_onyx_inventory_reconciliation(
      '60000000-0000-4000-8000-000000000005',v_warehouse,'p2-asof-preview-stale-bal-01','Stale balance must reject'
    );
    RAISE EXCEPTION 'stale balance snapshot unexpectedly previewed';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  -- Every source row in a single warehouse command must share one date.
  INSERT INTO public.products(id,organization_id,item_code,status,min_stock) VALUES
    ('50000000-0000-4000-8000-000000000006',v_org,'P2-ASOF-MIXED-A','active',0),
    ('50000000-0000-4000-8000-000000000007',v_org,'P2-ASOF-MIXED-B','active',0);
  INSERT INTO public.onyx_snapshots(id,organization_id,status,source_file_hash,report_type,metrics,row_count)
  VALUES(v_mixed_snapshot,v_org,'ready',pg_catalog.md5(v_mixed_snapshot::text),'inventory_stock','{}'::jsonb,2);
  v_data := pg_catalog.jsonb_build_object('item_code','P2-ASOF-MIXED-A','warehouse_id',v_warehouse,'quantity','1','as_of_date',pg_catalog.to_char(v_today,'YYYY-MM-DD'));
  INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash)
  VALUES('80000000-0000-4000-8000-000000000006',v_mixed_snapshot,v_org,1,'P2-ASOF-MIXED-A','valid',v_data,pg_catalog.md5(v_data::text));
  v_data := pg_catalog.jsonb_build_object('item_code','P2-ASOF-MIXED-B','warehouse_id',v_warehouse,'quantity','1','as_of_date',pg_catalog.to_char(v_today-1,'YYYY-MM-DD'));
  INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash)
  VALUES('80000000-0000-4000-8000-000000000007',v_mixed_snapshot,v_org,2,'P2-ASOF-MIXED-B','valid',v_data,pg_catalog.md5(v_data::text));
  BEGIN
    PERFORM public.preview_onyx_inventory_reconciliation(
      v_mixed_snapshot,v_warehouse,'p2-asof-preview-mixed-0001','Mixed source dates must reject'
    );
    RAISE EXCEPTION 'mixed-date warehouse snapshot unexpectedly previewed';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.onyx_inventory_reconciliation_commands WHERE snapshot_id=v_mixed_snapshot) THEN
    RAISE EXCEPTION 'mixed-date rows left a partial command behind';
  END IF;

  -- Missing, malformed, and future dates are rejected before a command can persist.
  INSERT INTO public.products(id,organization_id,item_code,status,min_stock) VALUES
    ('50000000-0000-4000-8000-000000000008',v_org,'P2-ASOF-INVALID','active',0),
    ('50000000-0000-4000-8000-000000000009',v_org,'P2-ASOF-FUTURE','active',0);
  INSERT INTO public.onyx_snapshots(id,organization_id,status,source_file_hash,report_type,metrics,row_count) VALUES
    ('60000000-0000-4000-8000-000000000008',v_org,'ready',pg_catalog.md5('invalid-date'),'inventory_stock','{}'::jsonb,1),
    ('60000000-0000-4000-8000-000000000009',v_org,'ready',pg_catalog.md5('future-date'),'inventory_stock','{}'::jsonb,1);
  v_data := pg_catalog.jsonb_build_object('item_code','P2-ASOF-INVALID','warehouse_id',v_warehouse,'quantity','1','as_of_date','2026-02-31');
  INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash)
  VALUES('80000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000008',v_org,1,'P2-ASOF-INVALID','valid',v_data,pg_catalog.md5(v_data::text));
  v_data := pg_catalog.jsonb_build_object('item_code','P2-ASOF-FUTURE','warehouse_id',v_warehouse,'quantity','1','as_of_date',pg_catalog.to_char(v_today+1,'YYYY-MM-DD'));
  INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash)
  VALUES('80000000-0000-4000-8000-000000000009','60000000-0000-4000-8000-000000000009',v_org,1,'P2-ASOF-FUTURE','valid',v_data,pg_catalog.md5(v_data::text));
  BEGIN
    PERFORM public.preview_onyx_inventory_reconciliation(
      '60000000-0000-4000-8000-000000000008',v_warehouse,'p2-asof-preview-invalid-0001','Invalid date must reject'
    );
    RAISE EXCEPTION 'invalid calendar date unexpectedly previewed';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  BEGIN
    PERFORM public.preview_onyx_inventory_reconciliation(
      '60000000-0000-4000-8000-000000000009',v_warehouse,'p2-asof-preview-future-0001','Future date must reject'
    );
    RAISE EXCEPTION 'future source date unexpectedly previewed';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  -- A pre-migration preview cannot pass the new apply gate without a source date.
  INSERT INTO public.onyx_snapshots(id,organization_id,status,source_file_hash,report_type,metrics,row_count)
  VALUES(v_legacy_snapshot,v_org,'ready',pg_catalog.md5(v_legacy_snapshot::text),'inventory_stock','{}'::jsonb,1);
  v_data := pg_catalog.jsonb_build_object('item_code','P2-ASOF-LEGACY','warehouse_id',v_warehouse,'quantity','1','as_of_date',pg_catalog.to_char(v_today,'YYYY-MM-DD'));
  INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash)
  VALUES('80000000-0000-4000-8000-000000000004',v_legacy_snapshot,v_org,1,'P2-ASOF-LEGACY','valid',v_data,pg_catalog.md5(v_data::text));
  INSERT INTO public.onyx_inventory_reconciliation_commands(
    id,organization_id,snapshot_id,warehouse_id,status,idempotency_key,reason,
    snapshot_source_hash,snapshot_report_type,snapshot_metrics,snapshot_row_count,
    source_row_count,created_by
  ) VALUES(
    v_legacy_command,v_org,v_legacy_snapshot,v_warehouse,'previewed','p2-legacy-preview-key-01','legacy preview fixture',
    pg_catalog.md5(v_legacy_snapshot::text),'inventory_stock','{}'::jsonb,1,1,
    '20000000-0000-4000-8000-000000000001'
  );
  BEGIN
    PERFORM public.apply_onyx_inventory_reconciliation(v_legacy_command,'p2-legacy-apply-key-001');
    RAISE EXCEPTION 'legacy undated preview unexpectedly applied';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
  SELECT status INTO v_legacy_status
    FROM public.onyx_inventory_reconciliation_commands WHERE id=v_legacy_command;
  IF v_legacy_status<>'previewed' THEN
    RAISE EXCEPTION 'legacy preview changed state despite undated-apply denial: %',v_legacy_status;
  END IF;

  RAISE NOTICE 'PASS Onyx source as_of_date: immutable row binding, shared warehouse date, stale movement/balance rejection, invalid/future rejection, legacy preview apply denial, fresh apply/replay, and compensating rollback';
END;
$acceptance$;


-- Snapshot every business row touched by an Onyx command. The rejection paths below
-- must preserve this state byte-for-byte, including ledger and append-only audit rows.
CREATE OR REPLACE FUNCTION public.onyx_reconciliation_acceptance_state(
  p_product_id uuid,
  p_command_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'balance',(
      SELECT pg_catalog.to_jsonb(b)
        FROM public.inventory_balances b
       WHERE b.product_id=p_product_id
         AND b.warehouse_id='40000000-0000-4000-8000-000000000001'
    ),
    'movements',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.id)
        FROM public.inventory_movements m
       WHERE m.product_id=p_product_id
         AND m.warehouse_id='40000000-0000-4000-8000-000000000001'
    ),'[]'::jsonb),
    'command',(
      SELECT pg_catalog.to_jsonb(c)
        FROM public.onyx_inventory_reconciliation_commands c
       WHERE c.id=p_command_id
    ),
    'items',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) ORDER BY i.product_id,i.id)
        FROM public.onyx_inventory_reconciliation_items i
       WHERE i.command_id=p_command_id
    ),'[]'::jsonb),
    'audit',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.id)
        FROM public.audit_logs a
       WHERE a.entity_type='onyx_inventory_reconciliation'
         AND a.entity_id=p_command_id
    ),'[]'::jsonb)
  )
$function$;

DO $mutation_windows$
DECLARE
  v_org uuid:='10000000-0000-4000-8000-000000000001';
  v_warehouse uuid:='40000000-0000-4000-8000-000000000001';
  v_profile uuid:='20000000-0000-4000-8000-000000000001';
  v_today date:=(pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::date;
  v_product uuid;
  v_snapshot uuid;
  v_row uuid;
  v_command uuid;
  v_data jsonb;
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_denied boolean;
  v_available numeric(15,3);
  v_status text;
BEGIN
  -- A stock movement committed after preview invalidates the baseline.
  -- Apply must reject the stale command before writing its own movement, state or audit.
  v_product:='50000000-0000-4000-8000-000000000010';
  v_snapshot:='60000000-0000-4000-8000-000000000010';
  v_row:='80000000-0000-4000-8000-000000000010';
  INSERT INTO public.products(id,organization_id,item_code,status,min_stock)
  VALUES(v_product,v_org,'P2-ASOF-CHANGED-AFTER-PREVIEW','active',0);
  INSERT INTO public.inventory_balances(
    product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point,
    last_movement_at,updated_at
  ) VALUES(
    v_product,v_warehouse,5,1,0,
    pg_catalog.statement_timestamp()-interval '3 days',
    pg_catalog.statement_timestamp()-interval '3 days'
  );
  INSERT INTO public.inventory_movements(
    product_id,warehouse_id,movement_type,quantity,balance_after,
    reference_type,reference_id,reason,created_by,created_at
  ) VALUES(
    v_product,v_warehouse,'opening',5,5,'acceptance_fixture',v_product,
    'baseline before Onyx preview',v_profile,
    pg_catalog.statement_timestamp()-interval '3 days'
  );
  INSERT INTO public.onyx_snapshots(
    id,organization_id,status,source_file_hash,report_type,metrics,row_count
  ) VALUES(
    v_snapshot,v_org,'ready',pg_catalog.md5(v_snapshot::text),'inventory_stock','{}'::jsonb,1
  );
  v_data:=pg_catalog.jsonb_build_object(
    'item_code','P2-ASOF-CHANGED-AFTER-PREVIEW',
    'warehouse_id',v_warehouse,'quantity','7',
    'as_of_date',pg_catalog.to_char(v_today,'YYYY-MM-DD')
  );
  INSERT INTO public.onyx_snapshot_rows(
    id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash
  ) VALUES(
    v_row,v_snapshot,v_org,1,'P2-ASOF-CHANGED-AFTER-PREVIEW',
    'valid',v_data,pg_catalog.md5(v_data::text)
  );
  v_result:=public.preview_onyx_inventory_reconciliation(
    v_snapshot,v_warehouse,'p2-asof-window-preview-0001',
    'Reject apply after stock changes since preview'
  );
  v_command:=(v_result->>'command_id')::uuid;
  IF v_result->>'status'<>'previewed' THEN
    RAISE EXCEPTION 'fresh source did not create the expected preview: %',v_result;
  END IF;

  -- Simulate a legitimate receipt between review and apply.
  UPDATE public.inventory_balances
     SET quantity_on_hand=quantity_on_hand+1,
         last_movement_at=pg_catalog.clock_timestamp(),
         updated_at=pg_catalog.clock_timestamp()
   WHERE product_id=v_product AND warehouse_id=v_warehouse
   RETURNING quantity_available INTO v_available;
  INSERT INTO public.inventory_movements(
    product_id,warehouse_id,movement_type,quantity,balance_after,
    reference_type,reference_id,reason,created_by,created_at
  ) VALUES(
    v_product,v_warehouse,'purchase_receipt',1,v_available,
    'acceptance_fixture',v_product,'intervening receipt after Onyx preview',
    v_profile,pg_catalog.clock_timestamp()
  );

  v_before:=public.onyx_reconciliation_acceptance_state(v_product,v_command);
  v_denied:=false;
  BEGIN
    PERFORM public.apply_onyx_inventory_reconciliation(
      v_command,'p2-asof-window-apply-0001'
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN
    v_denied:=true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Onyx apply unexpectedly overwrote stock changed after preview';
  END IF;
  v_after:=public.onyx_reconciliation_acceptance_state(v_product,v_command);
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'denied apply changed balance, movements, reconciliation items, command or audit';
  END IF;
  SELECT status INTO v_status
    FROM public.onyx_inventory_reconciliation_commands WHERE id=v_command;
  IF v_status<>'previewed' THEN
    RAISE EXCEPTION 'stale apply denial changed command state to %',v_status;
  END IF;

  -- A compensating rollback must not overwrite any receipt or issue that happened
  -- after an earlier successful apply. It must preserve the applied command and ledger.
  v_product:='50000000-0000-4000-8000-000000000011';
  v_snapshot:='60000000-0000-4000-8000-000000000011';
  v_row:='80000000-0000-4000-8000-000000000011';
  INSERT INTO public.products(id,organization_id,item_code,status,min_stock)
  VALUES(v_product,v_org,'P2-ASOF-ROLLBACK-LATER-MOVEMENT','active',0);
  INSERT INTO public.inventory_balances(
    product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point,
    last_movement_at,updated_at
  ) VALUES(
    v_product,v_warehouse,8,2,0,
    pg_catalog.statement_timestamp()-interval '3 days',
    pg_catalog.statement_timestamp()-interval '3 days'
  );
  INSERT INTO public.inventory_movements(
    product_id,warehouse_id,movement_type,quantity,balance_after,
    reference_type,reference_id,reason,created_by,created_at
  ) VALUES(
    v_product,v_warehouse,'opening',8,8,'acceptance_fixture',v_product,
    'baseline before Onyx apply',v_profile,
    pg_catalog.statement_timestamp()-interval '3 days'
  );
  INSERT INTO public.onyx_snapshots(
    id,organization_id,status,source_file_hash,report_type,metrics,row_count
  ) VALUES(
    v_snapshot,v_org,'ready',pg_catalog.md5(v_snapshot::text),'inventory_stock','{}'::jsonb,1
  );
  v_data:=pg_catalog.jsonb_build_object(
    'item_code','P2-ASOF-ROLLBACK-LATER-MOVEMENT',
    'warehouse_id',v_warehouse,'quantity','9',
    'as_of_date',pg_catalog.to_char(v_today,'YYYY-MM-DD')
  );
  INSERT INTO public.onyx_snapshot_rows(
    id,snapshot_id,organization_id,row_number,canonical_key,status,data,row_hash
  ) VALUES(
    v_row,v_snapshot,v_org,1,'P2-ASOF-ROLLBACK-LATER-MOVEMENT',
    'valid',v_data,pg_catalog.md5(v_data::text)
  );
  v_result:=public.preview_onyx_inventory_reconciliation(
    v_snapshot,v_warehouse,'p2-asof-rollback-window-preview-01',
    'Rollback must preserve later stock movement'
  );
  v_command:=(v_result->>'command_id')::uuid;
  v_result:=public.apply_onyx_inventory_reconciliation(
    v_command,'p2-asof-rollback-window-apply-0001'
  );
  IF v_result->>'status'<>'applied' THEN
    RAISE EXCEPTION 'rollback safety fixture could not be applied: %',v_result;
  END IF;

  -- An independent receipt advances both the aggregate balance and movement ledger.
  UPDATE public.inventory_balances
     SET quantity_on_hand=quantity_on_hand+1,
         last_movement_at=pg_catalog.clock_timestamp(),
         updated_at=pg_catalog.clock_timestamp()
   WHERE product_id=v_product AND warehouse_id=v_warehouse
   RETURNING quantity_available INTO v_available;
  INSERT INTO public.inventory_movements(
    product_id,warehouse_id,movement_type,quantity,balance_after,
    reference_type,reference_id,reason,created_by,created_at
  ) VALUES(
    v_product,v_warehouse,'purchase_receipt',1,v_available,
    'acceptance_fixture',v_product,'later receipt after Onyx apply',
    v_profile,pg_catalog.clock_timestamp()
  );

  v_before:=public.onyx_reconciliation_acceptance_state(v_product,v_command);
  v_denied:=false;
  BEGIN
    PERFORM public.rollback_onyx_inventory_reconciliation(
      v_command,'p2-asof-rollback-window-key-0001',
      'Do not roll back over an intervening receipt'
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN
    v_denied:=true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Onyx rollback unexpectedly overwrote a later inventory movement';
  END IF;
  v_after:=public.onyx_reconciliation_acceptance_state(v_product,v_command);
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'denied rollback changed balance, movements, reconciliation items, command or audit';
  END IF;
  SELECT status INTO v_status
    FROM public.onyx_inventory_reconciliation_commands WHERE id=v_command;
  IF v_status<>'applied' THEN
    RAISE EXCEPTION 'denied rollback changed applied command state to %',v_status;
  END IF;

  RAISE NOTICE 'PASS Onyx mutation windows: post-preview stock changes block apply without side effects; post-apply stock changes block compensating rollback without side effects';
END;
$mutation_windows$;

ROLLBACK;