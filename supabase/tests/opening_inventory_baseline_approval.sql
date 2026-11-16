\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN'; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text NOT NULL,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,auth_user_id uuid NOT NULL,organization_id uuid NOT NULL,is_active boolean NOT NULL);
CREATE TABLE public.user_roles(profile_id uuid NOT NULL,role text NOT NULL,PRIMARY KEY(profile_id,role));
CREATE TABLE public.authorization_capabilities(
  capability_key text PRIMARY KEY,domain text NOT NULL,resource text NOT NULL,action text NOT NULL,
  sensitivity text NOT NULL,scope_kind text NOT NULL,approval_mode text NOT NULL,separation_of_duties boolean NOT NULL,
  state_requirements jsonb NOT NULL,legacy_operation_id text,is_active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.authorization_role_capabilities(
  role text NOT NULL,capability_key text NOT NULL REFERENCES public.authorization_capabilities(capability_key),
  grant_source text NOT NULL,PRIMARY KEY(role,capability_key)
);
CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL,item_code text NOT NULL,name text NOT NULL,unit text);
CREATE TABLE public.warehouses(id uuid PRIMARY KEY,organization_id uuid NOT NULL,name text NOT NULL,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.inventory_balances(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL,warehouse_id uuid NOT NULL,
  quantity_on_hand numeric(15,3) NOT NULL DEFAULT 0 CHECK(quantity_on_hand>=0),
  quantity_reserved numeric(15,3) NOT NULL DEFAULT 0 CHECK(quantity_reserved>=0),
  quantity_available numeric(15,3) GENERATED ALWAYS AS (quantity_on_hand-quantity_reserved) STORED,
  last_movement_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id,warehouse_id)
);
CREATE TABLE public.inventory_movements(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL,warehouse_id uuid NOT NULL,
  movement_type text NOT NULL,quantity numeric(15,3) NOT NULL,balance_after numeric(15,3),
  reference_type text,reference_id uuid,reason text,created_by uuid,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,actor_id uuid,
  action text NOT NULL,entity_type text,entity_id uuid,old_value jsonb,new_value jsonb,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$function$;
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.id FROM public.profiles p WHERE p.auth_user_id=auth.uid() AND p.is_active ORDER BY p.id LIMIT 1;
$function$;
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.organization_id FROM public.profiles p WHERE p.auth_user_id=auth.uid() AND p.is_active ORDER BY p.id LIMIT 1;
$function$;
CREATE OR REPLACE FUNCTION public.current_actor_has_capability(p_capability_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    JOIN public.authorization_role_capabilities g ON g.role=r.role AND g.capability_key=p_capability_key
    JOIN public.authorization_capabilities c ON c.capability_key=g.capability_key AND c.is_active
    WHERE p.auth_user_id=auth.uid() AND p.is_active
  );
$function$;

INSERT INTO public.organizations(id,name) VALUES
 ('11111111-1111-4111-8111-111111111111','Aghbari baseline test'),
 ('12121212-1212-4121-8121-121212121212','Foreign baseline tenant');
INSERT INTO public.profiles(id,auth_user_id,organization_id,is_active) VALUES
 ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222223','33333333-3333-4333-8333-333333333334','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222224','33333333-3333-4333-8333-333333333335','12121212-1212-4121-8121-121212121212',true);
INSERT INTO public.user_roles(profile_id,role) VALUES
 ('22222222-2222-4222-8222-222222222222','admin'),
 ('22222222-2222-4222-8222-222222222223','manager'),
 ('22222222-2222-4222-8222-222222222224','admin');
INSERT INTO public.authorization_capabilities(
 capability_key,domain,resource,action,sensitivity,scope_kind,approval_mode,separation_of_duties,state_requirements
) VALUES ('inventory.opening_balance.approve','inventory','opening_inventory_baseline','approve','inventory','organization','none',false,'{}');
INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source)
VALUES('admin','inventory.opening_balance.approve','test-admin-only');

INSERT INTO public.warehouses(id,organization_id,name,is_active) VALUES
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','Main warehouse',true),
 ('55555555-5555-4555-8555-555555555556','12121212-1212-4121-8121-121212121212','Foreign warehouse',true);

INSERT INTO public.products(id,organization_id,status,item_code,name,unit)
SELECT gen_random_uuid(),'11111111-1111-4111-8111-111111111111','active',
       pg_catalog.format('SKU-%s',pg_catalog.lpad(g::text,3,'0')),
       pg_catalog.format('Opening product %s',g),'case'
  FROM generate_series(1,114) g;

INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved)
SELECT p.id,'55555555-5555-4555-8555-555555555555',
       CASE WHEN row_number() OVER(ORDER BY p.item_code)<=43 THEN 29 ELSE 28 END,
       0
  FROM public.products p WHERE p.organization_id='11111111-1111-4111-8111-111111111111';

INSERT INTO public.inventory_movements(
 product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
)
SELECT p.id,'55555555-5555-4555-8555-555555555555','opening_balance',ib.quantity_on_hand,ib.quantity_available,
       'opening_setup','98dbfb5e-cc46-457e-b532-7efde84a914a',
       'OWNER_AUTHORIZED_OPENING_ESTIMATE_PENDING_PHYSICAL_COUNT',NULL
  FROM public.products p
  JOIN public.inventory_balances ib ON ib.product_id=p.id AND ib.warehouse_id='55555555-5555-4555-8555-555555555555'
 WHERE p.organization_id='11111111-1111-4111-8111-111111111111';

\ir ../migrations/20261116114000_owner_approved_opening_inventory_baseline.sql

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $admin_acceptance$
DECLARE
  v_preview jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_approval_id uuid;
  v_count integer;
  v_total numeric(15,3);
  v_movement_count integer;
  v_balance_count integer;
  v_update_denied boolean:=false;
  v_delete_denied boolean:=false;
BEGIN
  v_preview:=public.get_opening_inventory_baseline_preview('55555555-5555-4555-8555-555555555555');
  IF (v_preview->>'ready_to_approve')::boolean IS NOT TRUE
     OR (v_preview->>'active_product_count')::integer<>114
     OR (v_preview->>'opening_movement_count')::integer<>114
     OR (v_preview->>'opening_total_quantity')::numeric<>3235
     OR jsonb_array_length(v_preview->'items')<>114 THEN
    RAISE EXCEPTION 'owner opening baseline preview mismatch: %',v_preview;
  END IF;

  v_result:=public.approve_opening_inventory_baseline('55555555-5555-4555-8555-555555555555');
  IF v_result->>'status'<>'approved_pending_physical_count'
     OR v_result->>'idempotent_replay'<>'false'
     OR (v_result->>'product_count')::integer<>114
     OR (v_result->>'total_opening_quantity')::numeric<>3235 THEN
    RAISE EXCEPTION 'opening baseline approval result mismatch: %',v_result;
  END IF;
  v_approval_id:=(v_result->>'approval_id')::uuid;

  SELECT count(*),coalesce(sum(opening_quantity),0)::numeric(15,3)
    INTO v_count,v_total
    FROM public.inventory_opening_balance_approval_lines WHERE approval_id=v_approval_id;
  IF v_count<>114 OR v_total<>3235 THEN
    RAISE EXCEPTION 'per-product immutable snapshot incomplete: count %, total %',v_count,v_total;
  END IF;

  SELECT count(*) INTO v_movement_count FROM public.inventory_movements
   WHERE warehouse_id='55555555-5555-4555-8555-555555555555' AND movement_type='opening_balance';
  SELECT count(*) INTO v_balance_count FROM public.inventory_balances
   WHERE warehouse_id='55555555-5555-4555-8555-555555555555';
  IF v_movement_count<>114 OR v_balance_count<>114 THEN
    RAISE EXCEPTION 'approval changed opening ledger or balance count';
  END IF;

  v_replay:=public.approve_opening_inventory_baseline('55555555-5555-4555-8555-555555555555');
  IF v_replay->>'idempotent_replay'<>'true'
     OR v_replay->>'approval_id' IS DISTINCT FROM v_result->>'approval_id' THEN
    RAISE EXCEPTION 'approval retry did not return existing snapshot: %',v_replay;
  END IF;
  IF (SELECT count(*) FROM public.inventory_opening_balance_approvals)<>1
     OR (SELECT count(*) FROM public.inventory_opening_balance_approval_lines)<>114 THEN
    RAISE EXCEPTION 'idempotent replay created duplicate approval or lines';
  END IF;

  BEGIN
    UPDATE public.inventory_opening_balance_approvals SET status='approved' WHERE id=v_approval_id;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_update_denied:=true;
  END;
  BEGIN
    DELETE FROM public.inventory_opening_balance_approval_lines WHERE approval_id=v_approval_id;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_delete_denied:=true;
  END;
  IF NOT v_update_denied OR NOT v_delete_denied THEN
    RAISE EXCEPTION 'owner approval snapshot allowed update/delete';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.inventory_opening_balance_approval_lines
     WHERE approval_id=v_approval_id
       AND quantity_available_at_approval<>quantity_on_hand_at_approval-quantity_reserved_at_approval
  ) THEN RAISE EXCEPTION 'snapshot stored inconsistent available quantities'; END IF;

  IF (SELECT count(*) FROM public.audit_logs
      WHERE action='inventory.opening_balance.approved' AND entity_id=v_approval_id)<>1 THEN
    RAISE EXCEPTION 'owner baseline approval audit record missing or duplicated';
  END IF;
END;
$admin_acceptance$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333334',false);
DO $manager_denial$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.get_opening_inventory_baseline_preview('55555555-5555-4555-8555-555555555555');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'manager without owner approval capability was not denied'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.approve_opening_inventory_baseline('55555555-5555-4555-8555-555555555555');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'manager without owner approval capability could approve baseline'; END IF;
END;
$manager_denial$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333335',false);
DO $foreign_tenant_denial$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.get_opening_inventory_baseline_preview('55555555-5555-4555-8555-555555555555');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'foreign tenant was able to preview another organization warehouse'; END IF;
END;
$foreign_tenant_denial$;

SELECT 'PostgreSQL 17 owner-approved opening inventory baseline acceptance: PASS' AS result;
