-- Disposable PostgreSQL 17 proof for tenant-safe product facts and recommendations.
-- No hosted database, real customer, inventory, credential or production data is used.
\set ON_ERROR_STOP on

DO $version$
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'Requires PostgreSQL 17';
  END IF;
END
$version$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$roles$;
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE public.organizations(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY,auth_user_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles(profile_id uuid NOT NULL REFERENCES public.profiles(id),role text NOT NULL,PRIMARY KEY(profile_id,role));
CREATE TABLE public.warehouses(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.products(
  id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),
  category_id uuid,name text NOT NULL,name_en text,item_code text NOT NULL,sku text,barcode text,
  unit text NOT NULL,description text,image_url text,status text NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,sort_order integer NOT NULL DEFAULT 0,
  min_order_quantity integer NOT NULL DEFAULT 1,order_quantity_multiple integer NOT NULL DEFAULT 1,
  base_price numeric(15,2) NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.product_unit_conversions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_name text NOT NULL,base_units_per_unit integer NOT NULL
);
CREATE TABLE public.inventory_balances(
  id uuid PRIMARY KEY,product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),quantity_available numeric NOT NULL
);
CREATE TABLE public.admin_settings(
  organization_id uuid NOT NULL REFERENCES public.organizations(id),key text NOT NULL,value jsonb,
  PRIMARY KEY(organization_id,key)
);
CREATE TABLE public.audit_logs(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_id uuid,action text NOT NULL,entity_type text NOT NULL,entity_id uuid,old_value jsonb,new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT id FROM public.profiles WHERE auth_user_id=auth.uid() AND is_active LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.current_organization_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT organization_id FROM public.profiles WHERE auth_user_id=auth.uid() AND is_active LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.get_current_tenant_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT jsonb_build_object(
    'organization_id',NULLIF(current_setting('app.auth_org_id',true),''),
    'warehouse_id',NULLIF(current_setting('app.auth_warehouse_id',true),''),
    'is_staff',COALESCE(NULLIF(current_setting('app.is_staff',true),'')::boolean,false),
    'can_view_internal_product_prices',COALESCE(NULLIF(current_setting('app.can_view_internal_prices',true),'')::boolean,false)
  )
$$;
CREATE OR REPLACE FUNCTION public.get_public_storefront_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT jsonb_build_object(
    'organization_id',NULLIF(current_setting('app.public_org_id',true),''),
    'warehouse_id',NULLIF(current_setting('app.public_warehouse_id',true),'')
  )
$$;
CREATE OR REPLACE FUNCTION public.normalize_storefront_catalog_search(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT lower(btrim(COALESCE(p_value,''))) $$;
CREATE OR REPLACE FUNCTION public.storefront_catalog_token_matches(p_token text,p_query text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT lower(p_token) LIKE lower(p_query)||'%' $$;

CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(p_product_ids uuid[],p_quantity numeric)
RETURNS TABLE(product_id uuid,unit_price numeric(15,2))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT p.id,
    CASE
      WHEN auth.uid() IS NULL AND COALESCE((SELECT (s.value #>> '{}')::boolean FROM public.admin_settings s WHERE s.organization_id=p.organization_id AND s.key='show_price_on_cards'),true) THEN p.base_price
      WHEN auth.uid() IS NOT NULL AND COALESCE(NULLIF(public.get_current_tenant_context()->>'can_view_internal_product_prices','')::boolean,false) THEN p.base_price
      WHEN auth.uid() IS NOT NULL AND NOT COALESCE(NULLIF(public.get_current_tenant_context()->>'is_staff','')::boolean,false)
        AND COALESCE((SELECT (s.value #>> '{}')::boolean FROM public.admin_settings s WHERE s.organization_id=p.organization_id AND s.key='show_price_on_cards'),true) THEN p.base_price
      ELSE NULL::numeric(15,2)
    END::numeric(15,2)
  FROM public.products p
  WHERE p.id=ANY(COALESCE(p_product_ids,ARRAY[]::uuid[]))
    AND p.organization_id=COALESCE(
      NULLIF(public.get_current_tenant_context()->>'organization_id','')::uuid,
      NULLIF(public.get_public_storefront_context()->>'organization_id','')::uuid
    )
$$;

-- Test double for the pre-existing catalog-core command; it is deliberately a separate
-- SECURITY DEFINER operation so the combined RPC test can prove transaction rollback.
CREATE OR REPLACE FUNCTION public.save_admin_product_with_metadata(p_product_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_id uuid; v_status text:=COALESCE(p_payload->>'status','active'); v_created boolean:=p_product_id IS NULL;
BEGIN
  IF p_product_id IS NULL THEN
    v_id:=gen_random_uuid();
    INSERT INTO public.products(id,organization_id,name,item_code,unit,description,category_id,status,base_price)
    VALUES(v_id,public.current_organization_id(),p_payload->>'name',p_payload->>'item_code',
      p_payload->>'unit',p_payload->>'description',NULLIF(p_payload->>'category_id','')::uuid,
      v_status,COALESCE(NULLIF(p_payload->>'base_price','')::numeric,0));
  ELSE
    v_id:=p_product_id;
    UPDATE public.products SET name=COALESCE(p_payload->>'name',name),
      item_code=COALESCE(p_payload->>'item_code',item_code),unit=COALESCE(p_payload->>'unit',unit),
      status=v_status,updated_at=now()
    WHERE id=v_id AND organization_id=public.current_organization_id();
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='product not found'; END IF;
  END IF;
  RETURN jsonb_build_object('id',v_id,'status',v_status,'created',v_created);
END
$$;

GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_product_with_metadata(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.test_read_product_name(p_product_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.name FROM public.products p WHERE p.id=p_product_id
$function$;
GRANT EXECUTE ON FUNCTION public.test_read_product_name(uuid) TO authenticated;


INSERT INTO public.organizations(id) VALUES
('a0000000-0000-4000-8000-000000000001'),('b0000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,auth_user_id,organization_id) VALUES
('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001'),
('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001'),
('b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002');
INSERT INTO public.user_roles(profile_id,role) VALUES
('a1000000-0000-4000-8000-000000000001','admin'),
('a1000000-0000-4000-8000-000000000002','staff'),
('b1000000-0000-4000-8000-000000000002','admin');
INSERT INTO public.warehouses(id,organization_id) VALUES
('a3000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001'),
('b3000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002');
INSERT INTO public.products(id,organization_id,name,item_code,unit,description,image_url,status,base_price,min_order_quantity,order_quantity_multiple) VALUES
('a4000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','منتج رئيسي','MAIN-01','قطعة','وصف معتمد','https://cdn.example.test/main.webp','active',50,2,2),
('a4000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','بديل فعلي','ALT-01','قطعة','بديل',NULL,'active',40,1,1),
('a4000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','مكمل فعلي','COMP-01','قطعة','مكمل',NULL,'active',30,1,1),
('b4000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000002','منتج مؤسسة أخرى','FOREIGN-01','قطعة','ممنوع الربط',NULL,'active',70,1,1);
INSERT INTO public.product_unit_conversions(organization_id,product_id,unit_name,base_units_per_unit)
VALUES('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','كرتون',24);
INSERT INTO public.inventory_balances(id,product_id,warehouse_id,quantity_available)
VALUES('a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',48);
INSERT INTO public.admin_settings(organization_id,key,value)
VALUES('a0000000-0000-4000-8000-000000000001','show_price_on_cards','true'::jsonb);

-- The production migration replaces the exact existing five-argument public catalogue RPC.
CREATE OR REPLACE FUNCTION public.get_storefront_catalog_page(
  p_search text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 24,
  p_available_only boolean DEFAULT false
)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=''
AS $function$ SELECT '{}'::jsonb $function$;

\ir ../migrations/20261120070000_storefront_product_facts_and_relations.sql

-- Manager/admin command: brand, facts, carton conversion reference and explicitly published relations.
SELECT set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.auth_org_id','a0000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.auth_warehouse_id','a3000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.is_staff','true',false);
SELECT set_config('app.can_view_internal_prices','true',false);
SET ROLE authenticated;

DO $save$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.save_admin_storefront_product_details(
    'a4000000-0000-4000-8000-000000000001','علامة معتمدة','Verified Brand','YE',true,
    '[{"name":"الوزن","value":"25","unit":"كجم"},{"name":"اللون","value":"أبيض","unit":null}]'::jsonb,true,
    25,'كجم','كرتون',true,
    '[{"target_product_id":"a4000000-0000-4000-8000-000000000002","relation_type":"alternative","is_published":true},
      {"target_product_id":"a4000000-0000-4000-8000-000000000003","relation_type":"complementary","is_published":true}]'::jsonb
  );
  IF v_result->>'changed'<>'true' OR v_result->>'relations_saved'<>'2' THEN
    RAISE EXCEPTION 'save did not confirm verified facts and relations: %',v_result;
  END IF;
  v_result:=public.get_admin_storefront_product_details('a4000000-0000-4000-8000-000000000001');
  IF v_result->>'brand_name'<>'علامة معتمدة' OR v_result->>'origin_verified'<>'true'
     OR jsonb_array_length(v_result->'specifications')<>2
     OR v_result->>'carton_unit_name'<>'كرتون'
     OR jsonb_array_length(v_result->'alternatives')<>1 OR jsonb_array_length(v_result->'complements')<>1 THEN
    RAISE EXCEPTION 'admin read-back does not match saved details: %',v_result;
  END IF;
END
$save$;
RESET ROLE;

-- Public client projection: same tenant, verified facts only, explicit recommendations only.
SELECT set_config('app.public_org_id','a0000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.public_warehouse_id','a3000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.test_brand_id',(SELECT brand_id::text FROM public.products WHERE id='a4000000-0000-4000-8000-000000000001'),false);
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE anon;

DO $public$
DECLARE v_result jsonb; v_item jsonb;
BEGIN
  v_result:=public.get_storefront_catalog_page(
    NULL,NULL,1,10,false,NULLIF(current_setting('app.test_brand_id'),'')::uuid,
    'كرتون',false,'a4000000-0000-4000-8000-000000000001'
  );
  IF jsonb_array_length(v_result->'items')<>1 THEN RAISE EXCEPTION 'brand/unit/product filter failed: %',v_result; END IF;
  v_item:=v_result->'items'->0;
  IF v_item->'brand'->>'name'<>'علامة معتمدة'
    OR v_item->>'country_of_origin_code'<>'YE'
    OR jsonb_array_length(v_item->'specifications')<>2
    OR v_item->'packaging'->>'units_per_carton'<>'24'
    OR jsonb_array_length(v_item->'alternatives')<>1
    OR jsonb_array_length(v_item->'complements')<>1
    OR v_item->>'display_price'<>'50.00'
    OR v_item?'base_price' OR v_item?'cost_price' OR v_item?'margin'
    OR v_item?'price_wholesale' OR v_item?'organization_id' THEN
    RAISE EXCEPTION 'public facts projection/price allowlist failed: %',v_item;
  END IF;
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,false,'b4000000-0000-4000-8000-000000000004');
  IF jsonb_array_length(v_result->'items')<>0 THEN RAISE EXCEPTION 'cross-tenant product leaked: %',v_result; END IF;
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,true,'a4000000-0000-4000-8000-000000000001');
  IF jsonb_array_length(v_result->'items')<>1 THEN RAISE EXCEPTION 'price displayability filter did not honor visible price'; END IF;
END
$public$;
RESET ROLE;

-- When customer price display is disabled, product remains but no fallback/zero/internal value appears.
UPDATE public.admin_settings SET value='false'::jsonb
WHERE organization_id='a0000000-0000-4000-8000-000000000001' AND key='show_price_on_cards';
SET ROLE anon;
DO $hidden_price$
DECLARE v_result jsonb; v_item jsonb;
BEGIN
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,false,'a4000000-0000-4000-8000-000000000001');
  v_item:=v_result->'items'->0;
  IF v_item IS NULL OR v_item->'display_price'<>'null'::jsonb OR v_item?'base_price' OR v_item?'cost_price' OR v_item?'margin' THEN
    RAISE EXCEPTION 'hidden-price privacy contract failed: %',v_item;
  END IF;
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,true,'a4000000-0000-4000-8000-000000000001');
  IF jsonb_array_length(v_result->'items')<>0 THEN RAISE EXCEPTION 'hidden price still passed price-displayable filter'; END IF;
END
$hidden_price$;
RESET ROLE;

DO $grants$
BEGIN
  IF has_table_privilege('anon','public.product_brands','SELECT')
    OR has_table_privilege('authenticated','public.product_brands','SELECT')
    OR has_table_privilege('authenticated','public.product_storefront_details','SELECT')
    OR has_table_privilege('authenticated','public.product_storefront_relations','INSERT') THEN
    RAISE EXCEPTION 'client role has direct access to product-facts tables';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.product_brands'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.product_storefront_details'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.product_storefront_relations'::regclass) THEN
    RAISE EXCEPTION 'product-facts tables must retain RLS';
  END IF;
END
$grants$;

-- Staff cannot use manager-only raw facts endpoints.
SELECT set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000002',false);
SELECT set_config('app.auth_org_id','a0000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.is_staff','true',false);
SELECT set_config('app.can_view_internal_prices','false',false);
SET ROLE authenticated;
DO $staff$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.get_admin_storefront_product_details('a4000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'staff read was not denied'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.save_admin_storefront_product_details(
      'a4000000-0000-4000-8000-000000000001','تلاعب',NULL,NULL,false,'[]'::jsonb,false,
      NULL,NULL,NULL,false,'[]'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'staff write was not denied'; END IF;
END
$staff$;
RESET ROLE;

-- Composite foreign keys and server validation prevent cross-tenant recommendations/brand links.
DO $tenant_fk$
DECLARE v_rejected boolean:=false; v_brand uuid;
BEGIN
  SELECT brand_id INTO v_brand FROM public.products WHERE id='a4000000-0000-4000-8000-000000000001';
  BEGIN
    UPDATE public.products SET brand_id=v_brand WHERE id='b4000000-0000-4000-8000-000000000004';
  EXCEPTION WHEN foreign_key_violation THEN v_rejected:=true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'cross-tenant brand foreign key accepted'; END IF;
END
$tenant_fk$;

SELECT set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
DO $relation_fk$
DECLARE v_rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM public.save_admin_storefront_product_details(
      'a4000000-0000-4000-8000-000000000001','علامة معتمدة','Verified Brand','YE',true,
      '[{"name":"الوزن","value":"25","unit":"كجم"}]'::jsonb,true,25,'كجم','كرتون',true,
      '[{"target_product_id":"b4000000-0000-4000-8000-000000000004","relation_type":"alternative","is_published":true}]'::jsonb
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_rejected:=true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'cross-tenant recommendation was accepted'; END IF;
END
$relation_fk$;

-- Product base fields and facts commit together: invalid facts roll back the preceding catalog update.
DO $atomic$
DECLARE v_rejected boolean:=false; v_name text;
BEGIN
  BEGIN
    PERFORM public.save_admin_catalog_product_with_storefront_details(
      'a4000000-0000-4000-8000-000000000001',
      '{"name":"اسم يجب ألا يُحفظ","item_code":"MAIN-01","unit":"قطعة","status":"active","base_price":50}'::jsonb,
      '{"brand_name":"علامة معتمدة","origin_verified":false,"specifications":[{"name":"","value":"قيمة"}],"specifications_verified":false,"relations":[]}'::jsonb
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_rejected:=true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'combined write accepted invalid facts'; END IF;
  SELECT public.test_read_product_name('a4000000-0000-4000-8000-000000000001') INTO v_name;
  IF v_name<>'منتج رئيسي' THEN RAISE EXCEPTION 'combined product save failed to roll back: %',v_name; END IF;
END
$atomic$;
RESET ROLE;

DO $audit$
DECLARE v_event jsonb;
BEGIN
  SELECT to_jsonb(a) INTO v_event FROM public.audit_logs a
  WHERE action='catalog.product_storefront_details_saved'
    AND entity_id='a4000000-0000-4000-8000-000000000001'
  ORDER BY id DESC LIMIT 1;
  IF v_event IS NULL OR v_event->>'actor_id'<>'a1000000-0000-4000-8000-000000000001'
    OR v_event->'new_value'?'base_price' OR v_event->'new_value'?'cost_price'
    OR v_event->'new_value'?'margin' THEN
    RAISE EXCEPTION 'missing/unsafe facts audit event: %',v_event;
  END IF;
END
$audit$;

SELECT 'PASS: PostgreSQL 17 storefront product facts, tenant recommendations, price privacy, role denial, RLS and atomic rollback' AS result;
