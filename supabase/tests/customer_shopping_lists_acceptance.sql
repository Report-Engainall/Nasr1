-- Disposable PostgreSQL 17 security, membership, recurrence, package and cart-atomicity acceptance.
-- The file creates only local synthetic fixtures; it never connects to a hosted project.
\set ON_ERROR_STOP on

DO $version_guard$
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 170000
     OR pg_catalog.current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION 'This acceptance requires PostgreSQL 17.';
  END IF;
END
$version_guard$;

CREATE SCHEMA IF NOT EXISTS auth;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;

CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.customers(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customer_company_memberships(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  member_role text NOT NULL CHECK(member_role IN ('buyer','finance','viewer')),
  status text NOT NULL CHECK(status IN ('active','revoked')),
  UNIQUE(customer_id,profile_id)
);
CREATE TABLE public.products(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  item_code text NOT NULL,
  unit text NOT NULL,
  status text NOT NULL,
  min_order_quantity integer NOT NULL DEFAULT 1,
  order_quantity_multiple integer NOT NULL DEFAULT 1
);
CREATE TABLE public.product_unit_conversions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  unit_name text NOT NULL,
  base_units_per_unit integer NOT NULL
);
CREATE TABLE public.warehouses(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.inventory_balances(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  quantity_available numeric NOT NULL
);
CREATE TABLE public.customer_carts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL
);
CREATE UNIQUE INDEX customer_carts_one_active_profile_idx
  ON public.customer_carts(organization_id,profile_id) WHERE status='active';
CREATE TABLE public.audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$function$;
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('app.profile_id',true),'')::uuid
$function$;
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('app.organization_id',true),'')::uuid
$function$;
CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_org uuid:=public.current_organization_id(); v_customer uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles p
     WHERE p.id=v_profile AND p.auth_user_id=auth.uid()
       AND p.is_active AND p.organization_id=v_org
  ) THEN RETURN NULL; END IF;
  SELECT c.id INTO v_customer FROM public.customers c
   WHERE c.profile_id=v_profile AND c.organization_id=v_org;
  IF v_customer IS NOT NULL THEN RETURN v_customer; END IF;
  SELECT m.customer_id INTO v_customer
    FROM public.customer_company_memberships m
    JOIN public.customers c ON c.id=m.customer_id AND c.organization_id=m.organization_id
   WHERE m.profile_id=v_profile AND m.organization_id=v_org
     AND m.status='active' AND c.status='approved';
  RETURN v_customer;
END
$function$;
CREATE OR REPLACE FUNCTION public.current_customer_can(p_capability text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid:=public.current_profile_id(); v_org uuid:=public.current_organization_id(); v_customer uuid:=public.current_customer_id(); v_role text;
BEGIN
  IF auth.uid() IS NULL OR v_customer IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id=v_profile AND p.auth_user_id=auth.uid()
      AND p.is_active AND p.organization_id=v_org
  ) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.customers c WHERE c.id=v_customer AND c.profile_id=v_profile AND c.organization_id=v_org) THEN
    RETURN true;
  END IF;
  SELECT m.member_role INTO v_role FROM public.customer_company_memberships m
   WHERE m.profile_id=v_profile AND m.customer_id=v_customer AND m.organization_id=v_org AND m.status='active';
  RETURN CASE v_role
    WHEN 'buyer' THEN p_capability IN ('catalog.read','reorder.manage','orders.create')
    WHEN 'viewer' THEN p_capability='catalog.read'
    ELSE false
  END;
END
$function$;
CREATE OR REPLACE FUNCTION public.get_current_tenant_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'organization_id',pg_catalog.current_setting('app.organization_id',true),
    'warehouse_id',pg_catalog.current_setting('app.warehouse_id',true)
  )
$function$;
CREATE OR REPLACE FUNCTION public.assert_product_order_quantity(p_product_id uuid,p_organization_id uuid,p_quantity numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_min integer; v_multiple integer;
BEGIN
  SELECT min_order_quantity,order_quantity_multiple INTO v_min,v_multiple
    FROM public.products WHERE id=p_product_id AND organization_id=p_organization_id AND status='active';
  IF NOT FOUND OR p_quantity IS NULL OR p_quantity<>pg_catalog.trunc(p_quantity)
     OR p_quantity<1 OR p_quantity>10000 OR p_quantity<v_min
     OR pg_catalog.mod(p_quantity-v_min,v_multiple)<>0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='order quantity policy rejected the line';
  END IF;
END
$function$;
CREATE OR REPLACE FUNCTION public.get_customer_cart()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT coalesce(nullif(pg_catalog.current_setting('app.cart_json',true),'')::jsonb,
    '{"items":[],"updated_at":null}'::jsonb)
$function$;
CREATE OR REPLACE FUNCTION public.sync_customer_cart(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_result jsonb;
BEGIN
  v_result:=pg_catalog.jsonb_build_object('items',p_items,'updated_at',pg_catalog.now());
  PERFORM pg_catalog.set_config('app.cart_json',v_result::text,false);
  RETURN v_result;
END
$function$;
CREATE OR REPLACE FUNCTION public.preview_customer_order_pricing(p_items jsonb,p_surface text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $function$
  SELECT pg_catalog.jsonb_build_object('visible',true,'surface',p_surface,'items',p_items,'currency','YER')
$function$;

INSERT INTO public.organizations(id) VALUES
 ('a0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,auth_user_id,organization_id) VALUES
 ('a4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001'),
 ('a4000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001'),
 ('a4000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001'),
 ('b4000000-0000-4000-8000-000000000004','c4000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000002');
INSERT INTO public.customers(id,organization_id,profile_id,status) VALUES
 ('a5000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','approved');
INSERT INTO public.customer_company_memberships(organization_id,customer_id,profile_id,member_role,status) VALUES
 ('a0000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','buyer','active'),
 ('a0000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000003','viewer','active');
INSERT INTO public.products(id,organization_id,name,item_code,unit,status,min_order_quantity,order_quantity_multiple) VALUES
 ('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','أرز بسمتي','RICE-A','كيس','active',2,2),
 ('b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','منتج مؤسسة أخرى','FOREIGN-B','كيس','active',1,1);
INSERT INTO public.product_unit_conversions(organization_id,product_id,unit_name,base_units_per_unit) VALUES
 ('a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','كرتون',6);
INSERT INTO public.warehouses(id,organization_id,is_active) VALUES
 ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',true);
INSERT INTO public.inventory_balances(id,product_id,warehouse_id,quantity_available) VALUES
 ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',40);
INSERT INTO public.customer_carts(organization_id,profile_id,status) VALUES
 ('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','active');

\ir ../migrations/20261120050000_customer_shopping_lists.sql

DO $contract$
DECLARE
  v_today date := (pg_catalog.now() AT TIME ZONE 'Asia/Aden')::date;
  v_list_id uuid;
  v_monthly_id uuid;
  v_run_id uuid;
  v_manual_run uuid;
  v_data jsonb;
  v_next_on date;
  v_result jsonb;
  v_count integer;
  v_rejected boolean;
  v_before_cart jsonb;
  v_after_cart jsonb;
BEGIN
  IF has_table_privilege('authenticated','public.customer_shopping_lists','SELECT')
     OR has_table_privilege('authenticated','public.customer_shopping_list_items','INSERT')
     OR has_table_privilege('authenticated','public.customer_shopping_list_shares','DELETE')
     OR NOT has_function_privilege('authenticated','public.list_customer_shopping_lists()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.apply_customer_shopping_list_run_to_cart(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'shopping-list direct table boundary or RPC grant is incorrect';
  END IF;

  PERFORM pg_catalog.set_config('app.profile_id','a4000000-0000-4000-8000-000000000001',false);
  PERFORM pg_catalog.set_config('app.organization_id','a0000000-0000-4000-8000-000000000001',false);
  PERFORM pg_catalog.set_config('app.warehouse_id','a1000000-0000-4000-8000-000000000001',false);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',false);
  PERFORM pg_catalog.set_config('app.cart_json','{"items":[{"product_id":"a2000000-0000-4000-8000-000000000001","quantity":2}],"updated_at":null}',false);

  v_list_id:=public.save_customer_shopping_list(
    NULL,'قائمة رمضان','ramadan',false,'weekly',v_today,
    '[{"product_id":"a2000000-0000-4000-8000-000000000001","quantity":3,"unit_name":"كرتون","base_units_per_unit":6}]'::jsonb
  );
  v_monthly_id:=public.save_customer_shopping_list(
    NULL,'المبيعات الشهرية','monthly_sales',false,'monthly',v_today,
    '[{"product_id":"a2000000-0000-4000-8000-000000000001","quantity":2,"unit_name":"كيس","base_units_per_unit":1}]'::jsonb
  );
  PERFORM public.share_customer_shopping_list(v_list_id,'a4000000-0000-4000-8000-000000000002','edit');
  PERFORM public.share_customer_shopping_list(v_list_id,'a4000000-0000-4000-8000-000000000003','view');

  v_result:=public.materialize_due_customer_shopping_list_runs();
  IF (v_result->>'created_runs')::integer<>2 THEN
    RAISE EXCEPTION 'weekly and monthly due schedules were not materialized exactly once: %',v_result;
  END IF;
  PERFORM public.materialize_due_customer_shopping_list_runs();
  SELECT count(*) INTO v_count FROM public.customer_shopping_list_runs;
  IF v_count<>2 THEN RAISE EXCEPTION 'reopening a due list duplicated a scheduled run'; END IF;

  SELECT next_run_on INTO v_next_on
    FROM public.customer_shopping_lists WHERE id=v_monthly_id;
  IF v_next_on IS NULL OR v_next_on<>(v_today + interval '1 month')::date THEN
    RAISE EXCEPTION 'monthly recurrence did not advance from the local due date';
  END IF;
  v_data:=public.list_customer_shopping_lists();
  IF pg_catalog.jsonb_array_length(v_data)<>2 THEN
    RAISE EXCEPTION 'owner did not receive all company lists';
  END IF;
  SELECT (entry.value->'runs'->0->>'id')::uuid INTO v_run_id
    FROM pg_catalog.jsonb_array_elements(v_data) AS entry(value)
   WHERE entry.value->>'id'=v_list_id::text;
  IF v_run_id IS NULL THEN RAISE EXCEPTION 'recurring review snapshot not visible to list owner'; END IF;

  -- A buyer member can read and apply a shared editable list, while the owner remains the company owner.
  PERFORM pg_catalog.set_config('app.profile_id','a4000000-0000-4000-8000-000000000002',false);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000002',false);
  v_data:=public.list_customer_shopping_lists();
  IF pg_catalog.jsonb_array_length(v_data)<>1 OR (v_data->0->>'can_edit')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'active buyer cannot see the shared list with edit permission: %',v_data;
  END IF;

  v_result:=public.review_customer_shopping_list_run(v_run_id);
  IF v_result->>'status'<>'review_required'
     OR (v_result->'items'->0->>'base_units_per_unit')::integer<>6 THEN
    RAISE EXCEPTION 'recurrence snapshot did not preserve the exact selected package factor: %',v_result;
  END IF;

  v_result:=public.apply_customer_shopping_list_run_to_cart(v_run_id);
  IF v_result->>'status'<>'cart_loaded'
     OR v_result->>'requires_checkout_confirmation'<>'true'
     OR (v_result->'cart'->'items'->0->>'quantity')::integer<>20
     OR v_result->'pricing'->>'surface'<>'cart' THEN
    RAISE EXCEPTION 'atomic recurring cart load failed to merge base units or return fresh pricing: %',v_result;
  END IF;
  v_before_cart:=public.get_customer_cart();
  v_rejected:=false;
  BEGIN
    PERFORM public.apply_customer_shopping_list_run_to_cart(v_run_id);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN v_rejected:=true;
  END;
  v_after_cart:=public.get_customer_cart();
  IF NOT v_rejected OR v_after_cart->'items' IS DISTINCT FROM v_before_cart->'items' THEN
    RAISE EXCEPTION 're-applying one scheduled run duplicated cart quantities';
  END IF;

  -- A manual review run is blocked on stale unit conversions and on insufficient current stock.
  v_manual_run:=public.create_customer_shopping_list_run(v_list_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action='customer.shopping_list.review_requested'
       AND entity_id=v_manual_run
  ) THEN RAISE EXCEPTION 'manual list review request was not audited'; END IF;
  UPDATE public.inventory_balances SET quantity_available=15
   WHERE product_id='a2000000-0000-4000-8000-000000000001';
  v_rejected:=false;
  BEGIN
    PERFORM public.apply_customer_shopping_list_run_to_cart(v_manual_run);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN v_rejected:=true;
  END;
  IF NOT v_rejected OR public.get_customer_cart()->'items' IS DISTINCT FROM v_before_cart->'items' THEN
    RAISE EXCEPTION 'insufficient warehouse stock did not stop the cart write atomically';
  END IF;
  UPDATE public.inventory_balances SET quantity_available=40
   WHERE product_id='a2000000-0000-4000-8000-000000000001';
  UPDATE public.product_unit_conversions SET base_units_per_unit=12
   WHERE product_id='a2000000-0000-4000-8000-000000000001' AND unit_name='كرتون';
  v_rejected:=false;
  BEGIN
    PERFORM public.apply_customer_shopping_list_run_to_cart(v_manual_run);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_rejected:=true;
  END;
  IF NOT v_rejected OR public.get_customer_cart()->'items' IS DISTINCT FROM v_before_cart->'items' THEN
    RAISE EXCEPTION 'stale package factor was not rejected before cart mutation';
  END IF;
  UPDATE public.product_unit_conversions SET base_units_per_unit=6
   WHERE product_id='a2000000-0000-4000-8000-000000000001' AND unit_name='كرتون';
  v_result:=public.apply_customer_shopping_list_run_to_cart(v_manual_run);
  IF v_result->>'status'<>'cart_loaded'
     OR (v_result->'cart'->'items'->0->>'quantity')::integer<>38 THEN
    RAISE EXCEPTION 'manual review run did not load once after stock and unit contract were restored';
  END IF;

  -- A read-only viewer sees a list explicitly shared with them but cannot edit or apply it.
  PERFORM pg_catalog.set_config('app.profile_id','a4000000-0000-4000-8000-000000000003',false);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000003',false);
  v_data:=public.list_customer_shopping_lists();
  IF pg_catalog.jsonb_array_length(v_data)<>1 OR (v_data->0->>'can_edit')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'read-only shared member visibility or edit denial is incorrect';
  END IF;
  v_rejected:=false;
  BEGIN
    PERFORM public.save_customer_shopping_list(
      v_list_id,'محاولة تعديل','ramadan',false,'none',NULL,
      '[{"product_id":"a2000000-0000-4000-8000-000000000001","quantity":2,"unit_name":"كيس","base_units_per_unit":1}]'::jsonb
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'read-only viewer was able to edit a shopping list'; END IF;

  -- Removing a share must revoke list visibility before membership itself is revoked.
  PERFORM pg_catalog.set_config('app.profile_id','a4000000-0000-4000-8000-000000000001',false);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',false);
  IF NOT public.remove_customer_shopping_list_share(v_list_id,'a4000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'owner did not receive a successful share-revocation result';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action='customer.shopping_list.share_removed' AND entity_id=v_list_id
       AND new_value->>'member_profile_id'='a4000000-0000-4000-8000-000000000003'
  ) THEN RAISE EXCEPTION 'share removal was not audited'; END IF;
  PERFORM pg_catalog.set_config('app.profile_id','a4000000-0000-4000-8000-000000000003',false);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000003',false);
  v_data:=public.list_customer_shopping_lists();
  IF pg_catalog.jsonb_array_length(v_data)<>0 THEN
    RAISE EXCEPTION 'unshared viewer retained visibility of the shopping list';
  END IF;
  PERFORM pg_catalog.set_config('app.profile_id','a4000000-0000-4000-8000-000000000001',false);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',false);
  PERFORM public.share_customer_shopping_list(v_list_id,'a4000000-0000-4000-8000-000000000003','view');

  PERFORM pg_catalog.set_config('app.profile_id','a4000000-0000-4000-8000-000000000003',false);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000003',false);
  UPDATE public.customer_company_memberships SET status='revoked'
   WHERE profile_id='a4000000-0000-4000-8000-000000000003';
  v_rejected:=false;
  BEGIN
    PERFORM public.list_customer_shopping_lists();
  EXCEPTION WHEN SQLSTATE '42501' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'revoked company member retained shared list access'; END IF;

  -- A foreign tenant product must fail before a row is inserted.
  PERFORM pg_catalog.set_config('app.profile_id','a4000000-0000-4000-8000-000000000001',false);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','c4000000-0000-4000-8000-000000000001',false);
  v_rejected:=false;
  BEGIN
    PERFORM public.save_customer_shopping_list(
      NULL,'قائمة خاطئة','custom',false,'none',NULL,
      '[{"product_id":"b2000000-0000-4000-8000-000000000002","quantity":1,"unit_name":"كيس","base_units_per_unit":1}]'::jsonb
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN v_rejected:=true;
  END;
  IF NOT v_rejected OR EXISTS(
    SELECT 1 FROM public.customer_shopping_lists WHERE name='قائمة خاطئة'
  ) THEN
    RAISE EXCEPTION 'cross-tenant product reference created a shopping list';
  END IF;

  -- Direct reads and writes to tables stay closed; callers only receive the guarded RPC surface.
  IF has_table_privilege('authenticated','public.customer_shopping_list_runs','SELECT')
     OR has_table_privilege('authenticated','public.customer_shopping_list_run_items','UPDATE') THEN
    RAISE EXCEPTION 'shopping-list run tables are directly accessible to browser roles';
  END IF;
END
$contract$;

SELECT 'customer shopping lists acceptance: PASS' AS result;
