\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN'; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE public.organizations(
  id uuid PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles(profile_id uuid NOT NULL,role text NOT NULL,PRIMARY KEY(profile_id,role));
CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL,item_code text NOT NULL,name text NOT NULL,unit text);
CREATE TABLE public.warehouses(id uuid PRIMARY KEY,organization_id uuid NOT NULL,name text NOT NULL,code text,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.inventory_balances(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  quantity_on_hand numeric(15,3) NOT NULL DEFAULT 0 CHECK(quantity_on_hand>=0),
  quantity_reserved numeric(15,3) NOT NULL DEFAULT 0 CHECK(quantity_reserved>=0),
  quantity_available numeric(15,3) GENERATED ALWAYS AS (quantity_on_hand-quantity_reserved) STORED,
  reorder_point integer NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id,warehouse_id)
);
CREATE TABLE public.inventory_movements(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,warehouse_id uuid NOT NULL,movement_type text NOT NULL,
  quantity numeric(15,3) NOT NULL,balance_after numeric(15,3),
  reference_type text,reference_id uuid,reason text,created_by uuid,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,actor_id uuid,
  action text NOT NULL,entity_type text,entity_id uuid,old_value jsonb,new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$function$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.id FROM public.profiles p
   WHERE p.auth_user_id=auth.uid() AND p.is_active
   ORDER BY p.id LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.organization_id FROM public.profiles p
   WHERE p.auth_user_id=auth.uid() AND p.is_active
   ORDER BY p.id LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.operational_tasks_can_manage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.auth_user_id=auth.uid() AND p.is_active AND r.role IN ('admin','manager')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.auth_user_id=auth.uid() AND p.is_active AND r.role IN ('admin','manager','staff')
  );
$function$;

CREATE TABLE public.authorization_capabilities(
  capability_key text PRIMARY KEY,domain text NOT NULL,resource text NOT NULL,action text NOT NULL,
  sensitivity text NOT NULL,scope_kind text NOT NULL,approval_mode text NOT NULL,
  separation_of_duties boolean NOT NULL,state_requirements jsonb NOT NULL,
  legacy_operation_id text,is_active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customers(id uuid PRIMARY KEY,organization_id uuid NOT NULL);
CREATE TABLE public.authorization_profile_denials(
  organization_id uuid NOT NULL,profile_id uuid NOT NULL,capability_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,expires_at timestamptz
);
CREATE TABLE public.authorization_role_capabilities(
  role text NOT NULL,
  capability_key text NOT NULL REFERENCES public.authorization_capabilities(capability_key),
  grant_source text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz,
  PRIMARY KEY(role,capability_key)
);
CREATE OR REPLACE FUNCTION public.current_actor_has_capability(p_capability_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p_capability_key='inventory.balance.adjust' AND public.operational_tasks_can_manage();
$function$;

INSERT INTO public.organizations(id,name) VALUES
 ('11111111-1111-4111-8111-111111111111','Aghbari test tenant'),
 ('12121212-1212-4121-8121-121212121212','Foreign test tenant');

INSERT INTO public.profiles(id,auth_user_id,organization_id,is_active) VALUES
 ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222223','33333333-3333-4333-8333-333333333334','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222224','33333333-3333-4333-8333-333333333335','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222225','33333333-3333-4333-8333-333333333336','12121212-1212-4121-8121-121212121212',true),
 ('22222222-2222-4222-8222-222222222226','33333333-3333-4333-8333-333333333337','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.user_roles(profile_id,role) VALUES
 ('22222222-2222-4222-8222-222222222222','admin'),
 ('22222222-2222-4222-8222-222222222223','manager'),
 ('22222222-2222-4222-8222-222222222224','staff'),
 ('22222222-2222-4222-8222-222222222225','admin'),
 ('22222222-2222-4222-8222-222222222226','customer');

INSERT INTO public.products(id,organization_id,status,item_code,name,unit) VALUES
 ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','active','SKU-001','Aghbari Test Product','carton'),
 ('44444444-4444-4444-8444-444444444445','12121212-1212-4121-8121-121212121212','active','FOREIGN-001','Foreign Product','carton');
INSERT INTO public.warehouses(id,organization_id,name,code,is_active) VALUES
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','Main Warehouse','MAIN',true),
 ('55555555-5555-4555-8555-555555555556','12121212-1212-4121-8121-121212121212','Foreign Warehouse','FOREIGN',true);
INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point)
VALUES('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555',100,15,10);

\ir ../migrations/20261116110000_inventory_balance_adjustment_command.sql
\ir ../migrations/20261116111000_inventory_adjustment_invariants.sql
\ir ../migrations/20261116112000_inventory_adjustment_authorization_v2.sql
\ir ../migrations/20261116113000_inventory_adjustment_capability_v2.sql
\ir ../migrations/20261116121000_authorization_profile_scopes_v2.sql
\ir ../migrations/20261116122000_scope_inventory_adjustment_authorization.sql
\ir ../migrations/20261116123000_authorization_scope_account_boundary.sql

DO $customer_staff_separation$
DECLARE
  v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.authorization_profile_scopes(
      organization_id,profile_id,scope_kind,warehouse_id,customer_id,reason,is_active,
      valid_from,revision,created_by,updated_by
    ) VALUES(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222226',
      'warehouse',
      '55555555-5555-4555-8555-555555555555',
      NULL,'Customer account must not receive employee scope',true,
      statement_timestamp(),1,
      '22222222-2222-4222-8222-222222222222',
      '22222222-2222-4222-8222-222222222222'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_denied:=true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'customer identity was allowed to receive an internal warehouse scope';
  END IF;
END;
$customer_staff_separation$;

INSERT INTO public.authorization_profile_scopes(
  organization_id,profile_id,scope_kind,warehouse_id,customer_id,reason,is_active,
  valid_from,revision,created_by,updated_by
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'warehouse',
  '55555555-5555-4555-8555-555555555555',
  NULL,'Primary warehouse access for adjustment acceptance',true,
  statement_timestamp(),1,
  '22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222'
);


SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);

DO $admin_acceptance$
DECLARE
  v_list jsonb;
  v_first jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_movement_count integer;
  v_audit_count integer;
  v_conflict boolean := false;
  v_stale boolean := false;
  v_reserved boolean := false;
  v_negative boolean := false;
  v_foreign boolean := false;
BEGIN
  v_list:=public.get_inventory_adjustment_balances('55555555-5555-4555-8555-555555555555');
  IF jsonb_array_length(v_list->'items')<>1
     OR v_list->'items'->0->>'item_code'<>'SKU-001'
     OR v_list->'items'->0 ? 'base_price'
     OR v_list->'items'->0 ? 'cost_price' THEN
    RAISE EXCEPTION 'manager minimal adjustment projection failed: %',v_list;
  END IF;

  v_result:=public.adjust_inventory_balance(
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    100,125,'نتيجة عدّ مستقل','محضر-INV-1','تعديل منفرد للاختبار',
    'inv-adjustment-idempotency-0001'
  );
  IF v_result->>'idempotent_replay'<>'false'
     OR (v_result->>'previous_quantity_on_hand')::numeric<>100
     OR (v_result->>'new_quantity_on_hand')::numeric<>125
     OR (v_result->>'quantity_delta')::numeric<>25
     OR (v_result->>'quantity_available_after')::numeric<>110 THEN
    RAISE EXCEPTION 'atomic adjustment response failed: %',v_result;
  END IF;

  v_replay:=public.adjust_inventory_balance(
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    100,125,'نتيجة عدّ مستقل','محضر-INV-1','تعديل منفرد للاختبار',
    'inv-adjustment-idempotency-0001'
  );
  IF v_replay->>'idempotent_replay'<>'true'
     OR v_replay->>'adjustment_id' IS DISTINCT FROM v_result->>'adjustment_id' THEN
    RAISE EXCEPTION 'same-payload retry did not replay the original command: %',v_replay;
  END IF;

  SELECT count(*) INTO v_movement_count FROM public.inventory_movements
   WHERE reference_type='inventory_adjustment' AND reference_id=(v_result->>'adjustment_id')::uuid;
  SELECT count(*) INTO v_audit_count FROM public.audit_logs
   WHERE action='inventory.balance.adjusted' AND entity_id=(v_result->>'adjustment_id')::uuid;
  IF v_movement_count<>1 OR v_audit_count<>1 THEN
    RAISE EXCEPTION 'movement/audit idempotency violated: movements %, audits %',v_movement_count,v_audit_count;
  END IF;

  BEGIN
    PERFORM public.adjust_inventory_balance(
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      100,126,'نتيجة عدّ مستقل','محضر-INV-1','تغيير الحمولة',
      'inv-adjustment-idempotency-0001'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_conflict:=true;
  END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'changed idempotency payload was not rejected'; END IF;

  BEGIN
    PERFORM public.adjust_inventory_balance(
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      100,90,'تعديل قديم',NULL,NULL,
      'inv-adjustment-stale-writer-0001'
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN v_stale:=true;
  END;
  IF NOT v_stale THEN RAISE EXCEPTION 'stale stock writer was not rejected'; END IF;

  BEGIN
    PERFORM public.adjust_inventory_balance(
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      125,14,'نزول دون المحجوز',NULL,NULL,
      'inv-adjustment-reserved-0001'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_reserved:=true;
  END;
  IF NOT v_reserved THEN RAISE EXCEPTION 'adjustment below reserved stock was not rejected'; END IF;

  BEGIN
    PERFORM public.adjust_inventory_balance(
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      125,-1,'رصيد سالب',NULL,NULL,
      'inv-adjustment-negative-0001'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_negative:=true;
  END;
  IF NOT v_negative THEN RAISE EXCEPTION 'negative stock quantity was not rejected'; END IF;

  BEGIN
    PERFORM public.adjust_inventory_balance(
      '44444444-4444-4444-8444-444444444445',
      '55555555-5555-4555-8555-555555555556',
      0,1,'محاولة مؤسسة أخرى',NULL,NULL,
      'inv-adjustment-foreign-0001'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN v_foreign:=true;
  END;
  IF NOT v_foreign THEN RAISE EXCEPTION 'foreign-tenant product/warehouse adjustment was not rejected'; END IF;

  IF (SELECT quantity_on_hand FROM public.inventory_balances
      WHERE product_id='44444444-4444-4444-8444-444444444444'
        AND warehouse_id='55555555-5555-4555-8555-555555555555')<>125 THEN
    RAISE EXCEPTION 'failed commands changed the canonical stock balance';
  END IF;
  IF (SELECT count(*) FROM public.inventory_adjustments)<>1 THEN
    RAISE EXCEPTION 'failed or replayed operations created extra adjustment records';
  END IF;
END;
$admin_acceptance$;

DO $append_only_and_constraints$
DECLARE
  v_adjustment_id uuid;
  v_update_denied boolean:=false;
  v_delete_denied boolean:=false;
  v_reserved_invariant boolean:=false;
  v_available_invariant boolean:=false;
BEGIN
  SELECT id INTO v_adjustment_id
    FROM public.inventory_adjustments
   WHERE idempotency_key='inv-adjustment-idempotency-0001';

  BEGIN
    UPDATE public.inventory_adjustments SET notes='tamper attempt' WHERE id=v_adjustment_id;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_update_denied:=true;
  END;
  BEGIN
    DELETE FROM public.inventory_adjustments WHERE id=v_adjustment_id;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_delete_denied:=true;
  END;
  IF NOT v_update_denied OR NOT v_delete_denied THEN
    RAISE EXCEPTION 'append-only adjustment history allowed mutation';
  END IF;

  BEGIN
    INSERT INTO public.inventory_adjustments(
      organization_id,product_id,warehouse_id,
      previous_quantity_on_hand,new_quantity_on_hand,quantity_delta,
      reserved_quantity,quantity_available_after,reason,idempotency_key,created_by
    ) VALUES (
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      0,15,15,20,0,'invalid reserved invariant',
      'inv-adjustment-invariant-reserved-001',
      '22222222-2222-4222-8222-222222222222'
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN v_reserved_invariant:=true;
  END;
  IF NOT v_reserved_invariant THEN
    RAISE EXCEPTION 'database allowed adjustment target below reserved quantity';
  END IF;

  BEGIN
    INSERT INTO public.inventory_adjustments(
      organization_id,product_id,warehouse_id,
      previous_quantity_on_hand,new_quantity_on_hand,quantity_delta,
      reserved_quantity,quantity_available_after,reason,idempotency_key,created_by
    ) VALUES (
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      100,125,25,15,111,'invalid available invariant',
      'inv-adjustment-invariant-available-001',
      '22222222-2222-4222-8222-222222222222'
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN v_available_invariant:=true;
  END;
  IF NOT v_available_invariant THEN
    RAISE EXCEPTION 'database allowed inconsistent available quantity snapshot';
  END IF;

  IF (SELECT count(*) FROM public.inventory_adjustments)<>1 THEN
    RAISE EXCEPTION 'tamper attempts or invariant failures changed adjustment history';
  END IF;
END;
$append_only_and_constraints$;




SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333334',false);
DO $manager_scope_denial$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.get_inventory_adjustment_balances('55555555-5555-4555-8555-555555555555');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'manager without warehouse assignment was not denied'; END IF;
END;
$manager_scope_denial$;

INSERT INTO public.authorization_profile_scopes(
  organization_id,profile_id,scope_kind,warehouse_id,customer_id,reason,is_active,
  valid_from,revision,created_by,updated_by
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222223',
  'warehouse',
  '55555555-5555-4555-8555-555555555555',
  NULL,'Assigned warehouse scope for manager acceptance',true,
  statement_timestamp(),1,
  '22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222'
);

DO $manager_scope_permit$
DECLARE v_items jsonb;
BEGIN
  v_items:=public.get_inventory_adjustment_balances('55555555-5555-4555-8555-555555555555');
  IF jsonb_array_length(v_items->'items')<>1 THEN
    RAISE EXCEPTION 'manager with active warehouse assignment did not receive the scoped quantity projection';
  END IF;
END;
$manager_scope_permit$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333335',false);
DO $staff_denial$
DECLARE
  v_command_denied boolean:=false;
  v_read_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.adjust_inventory_balance(
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      125,126,'موظف غير مخول',NULL,NULL,
      'inv-adjustment-staff-denied-001'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN v_command_denied:=true;
  END;
  BEGIN
    PERFORM public.get_inventory_adjustment_balances('55555555-5555-4555-8555-555555555555');
  EXCEPTION WHEN SQLSTATE '42501' THEN v_read_denied:=true;
  END;
  IF NOT v_command_denied OR NOT v_read_denied THEN
    RAISE EXCEPTION 'staff role was not denied by the server';
  END IF;
END;
$staff_denial$;

SELECT 'inventory balance adjustment PostgreSQL 17 acceptance: PASS' AS result;
