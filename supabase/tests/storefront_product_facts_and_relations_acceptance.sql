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
-- Test-only server-resolved customer tier prices; the browser never chooses a tier.
CREATE TABLE public.customer_price_quotes(
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY(profile_id,product_id)
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
  -- Deliberately neutral price source: this resolver knows only the current
  -- tier and authorization context. It must not implement show_price_on_cards;
  -- the public catalog projection alone is responsible for redacting the value.
  SELECT p.id,
    CASE
      WHEN auth.uid() IS NULL THEN p.base_price
      WHEN auth.uid() IS NOT NULL
        AND COALESCE(NULLIF(public.get_current_tenant_context()->>'can_view_internal_product_prices','')::boolean,false)
        THEN p.base_price
      WHEN auth.uid() IS NOT NULL
        AND NOT COALESCE(NULLIF(public.get_current_tenant_context()->>'is_staff','')::boolean,false)
        THEN quote.unit_price
      ELSE NULL::numeric(15,2)
    END::numeric(15,2)
  FROM public.products p
  LEFT JOIN public.customer_price_quotes quote
    ON quote.product_id=p.id AND quote.profile_id=public.current_profile_id()
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


-- Authorization V2 dependency fixture for this isolated product-facts contract test.
-- The full decision engine and explicit-denial precedence are exercised separately by
-- scripts/test-authorization-capability-registry.mjs on the repository's local Supabase stack.
CREATE TABLE public.authorization_capabilities(
  capability_key text PRIMARY KEY,
  domain text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  sensitivity text NOT NULL CHECK(sensitivity IN ('public','commercial','catalog','inventory','customer','financial','identity','operational','data','audit')),
  scope_kind text NOT NULL CHECK(scope_kind IN ('organization','branch','warehouse','team','assigned_customer','resource_owner')),
  approval_mode text NOT NULL DEFAULT 'none' CHECK(approval_mode IN ('none','approval_required','maker_checker')),
  separation_of_duties boolean NOT NULL DEFAULT false,
  state_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_operation_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.authorization_role_capabilities(
  role text NOT NULL CHECK(role IN ('admin','manager','staff','accountant','customer_manager','customer')),
  capability_key text NOT NULL REFERENCES public.authorization_capabilities(capability_key) ON DELETE RESTRICT,
  grant_source text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY(role,capability_key),
  CHECK(expires_at IS NULL OR expires_at>valid_from)
);
CREATE TABLE public.authorization_profile_denials(
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  capability_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  PRIMARY KEY(organization_id,profile_id,capability_key)
);
CREATE OR REPLACE FUNCTION public.current_actor_has_capability(p_capability_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS(
      SELECT 1
      FROM public.profiles p
      JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
      JOIN public.user_roles ur ON ur.profile_id=p.id
      JOIN public.authorization_role_capabilities rc ON rc.role=ur.role
        AND rc.capability_key=p_capability_key
        AND rc.valid_from<=statement_timestamp()
        AND (rc.expires_at IS NULL OR rc.expires_at>statement_timestamp())
      JOIN public.authorization_capabilities c ON c.capability_key=rc.capability_key
        AND c.is_active=true
      WHERE p.auth_user_id=auth.uid() AND p.is_active=true
    )
    AND NOT EXISTS(
      SELECT 1
      FROM public.profiles p
      JOIN public.authorization_profile_denials d
        ON d.profile_id=p.id AND d.organization_id=p.organization_id
      WHERE p.auth_user_id=auth.uid() AND p.is_active=true
        AND d.capability_key=p_capability_key AND d.is_active=true
        AND (d.expires_at IS NULL OR d.expires_at>statement_timestamp())
    );
$function$;
REVOKE ALL ON FUNCTION public.current_actor_has_capability(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_actor_has_capability(text) TO authenticated;

INSERT INTO public.organizations(id) VALUES
('a0000000-0000-4000-8000-000000000001'),('b0000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,auth_user_id,organization_id) VALUES
('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001'),
('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001'),
('a1000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001'),
('a1000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001'),
('b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002');
INSERT INTO public.user_roles(profile_id,role) VALUES
('a1000000-0000-4000-8000-000000000001','admin'),
('a1000000-0000-4000-8000-000000000002','staff'),
('a1000000-0000-4000-8000-000000000003','manager'),
('a1000000-0000-4000-8000-000000000004','customer'),
('b1000000-0000-4000-8000-000000000002','admin');
INSERT INTO public.warehouses(id,organization_id) VALUES
('a3000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001'),
('b3000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002');
INSERT INTO public.products(id,organization_id,name,item_code,unit,description,image_url,status,base_price,min_order_quantity,order_quantity_multiple) VALUES
('a4000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','منتج رئيسي','MAIN-01','قطعة','وصف معتمد','https://cdn.example.test/main.webp','active',50,2,2),
('a4000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','بديل فعلي','ALT-01','قطعة','بديل',NULL,'active',40,1,1),
('a4000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','مكمل فعلي','COMP-01','قطعة','مكمل',NULL,'active',30,1,1),
('a4000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','منتج مطابق ثانٍ','MATCH-02','قطعة','مطابق للمرشحات',NULL,'active',80,2,2),
('a4000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000001','منتج بوحدة مختلفة','OTHER-UNIT','صندوق','وحدة مختلفة',NULL,'active',90,1,1),
('a4000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000001','منتج بلا مخزون','NO-STOCK','قطعة','لا يوجد مخزون',NULL,'active',65,1,1),
('b4000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000002','منتج مؤسسة أخرى','FOREIGN-01','قطعة','ممنوع الربط',NULL,'active',70,1,1);
INSERT INTO public.product_unit_conversions(organization_id,product_id,unit_name,base_units_per_unit)
VALUES
('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','كرتون',24),
('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000005','كرتون',12),
('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000007','كرتون',6);
INSERT INTO public.inventory_balances(id,product_id,warehouse_id,quantity_available)
VALUES
('a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',48),
('a5000000-0000-4000-8000-000000000005','a4000000-0000-4000-8000-000000000005','a3000000-0000-4000-8000-000000000001',36),
('a5000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-000000000006','a3000000-0000-4000-8000-000000000001',8);
INSERT INTO public.customer_price_quotes(profile_id,product_id,unit_price) VALUES
('a1000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000001',42.75),
('a1000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000005',67.50),
('a1000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000006',75.20),
('a1000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000007',58.90);
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
\ir ../migrations/20261126120000_catalog_product_details_authorization_v2.sql

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

-- Brand the additional test products from the same organization so the server-side
-- conjunction can distinguish unit/availability filters from brand membership.
UPDATE public.products
SET brand_id=(SELECT brand_id FROM public.products WHERE id='a4000000-0000-4000-8000-000000000001')
WHERE id IN (
  'a4000000-0000-4000-8000-000000000005',
  'a4000000-0000-4000-8000-000000000006',
  'a4000000-0000-4000-8000-000000000007'
);

-- Public client projection: same tenant, verified facts only, explicit recommendations only.
SELECT set_config('app.public_org_id','a0000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.public_warehouse_id','a3000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.test_brand_id',(SELECT brand_id::text FROM public.products WHERE id='a4000000-0000-4000-8000-000000000001'),false);
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE anon;

DO $public$
DECLARE v_result jsonb; v_item jsonb; v_first_page_id text;
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

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(v_result->'filters'->'brands') f
       WHERE f->>'id' = current_setting('app.test_brand_id')
         AND f->>'name' = 'علامة معتمدة'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements_text(v_result->'filters'->'units') u(unit_name)
       WHERE u.unit_name = 'كرتون'
     ) THEN
    RAISE EXCEPTION 'tenant-wide brand/unit facets were not returned independently of the current page: %',v_result->'filters';
  END IF;
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,false,'b4000000-0000-4000-8000-000000000004');
  IF jsonb_array_length(v_result->'items')<>0 THEN RAISE EXCEPTION 'cross-tenant product leaked: %',v_result; END IF;
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,true,'a4000000-0000-4000-8000-000000000001');
  IF jsonb_array_length(v_result->'items')<>1 THEN RAISE EXCEPTION 'price displayability filter did not honor visible price'; END IF;

  -- All four filters run before COUNT and page slicing. The unit filter resolves the
  -- saved carton conversion, while the availability filter excludes a stocked-out match.
  v_result:=public.get_storefront_catalog_page(
    NULL,NULL,1,100,false,NULLIF(current_setting('app.test_brand_id'),'')::uuid,
    'كرتون',true,NULL
  );
  IF (v_result->>'total_count')::integer<>3 THEN
    RAISE EXCEPTION 'brand + unit + display-price filter count is not global: %',v_result;
  END IF;
  v_result:=public.get_storefront_catalog_page(
    NULL,NULL,1,1,true,NULLIF(current_setting('app.test_brand_id'),'')::uuid,
    'كرتون',true,NULL
  );
  IF (v_result->>'total_count')::integer<>2 OR (v_result->>'total_pages')::integer<>2
     OR jsonb_array_length(v_result->'items')<>1 OR (v_result->>'page_size')::integer<>1 THEN
    RAISE EXCEPTION 'conjunctive availability/count/page-one contract failed: %',v_result;
  END IF;
  v_first_page_id:=v_result->'items'->0->>'id';
  v_result:=public.get_storefront_catalog_page(
    NULL,NULL,2,1,true,NULLIF(current_setting('app.test_brand_id'),'')::uuid,
    'كرتون',true,NULL
  );
  IF (v_result->>'total_count')::integer<>2 OR (v_result->>'total_pages')::integer<>2
     OR jsonb_array_length(v_result->'items')<>1
     OR v_result->'items'->0->>'id'=v_first_page_id THEN
    RAISE EXCEPTION 'global page-two slice/count is not stable: %',v_result;
  END IF;
END
$public$;
RESET ROLE;

-- When customer price display is disabled, product remains but no fallback/zero/internal value appears.
UPDATE public.admin_settings SET value='false'::jsonb
WHERE organization_id='a0000000-0000-4000-8000-000000000001' AND key='show_price_on_cards';
SET ROLE anon;
DO $hidden_price$
DECLARE v_result jsonb; v_item jsonb; v_resolver_price numeric(15,2);
BEGIN
  SELECT price.unit_price INTO v_resolver_price
  FROM public.get_storefront_product_prices(ARRAY['a4000000-0000-4000-8000-000000000001'::uuid],1) price;
  IF v_resolver_price IS DISTINCT FROM 50.00::numeric(15,2) THEN
    RAISE EXCEPTION 'neutral source resolver must still return its price while the card policy is hidden: %',v_resolver_price;
  END IF;
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

-- Authenticated customers receive only their own server-resolved tier price.
UPDATE public.admin_settings SET value='true'::jsonb
WHERE organization_id='a0000000-0000-4000-8000-000000000001' AND key='show_price_on_cards';
SELECT set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000004',false);
SELECT set_config('app.auth_org_id','a0000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.auth_warehouse_id','a3000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.is_staff','false',false);
SELECT set_config('app.can_view_internal_prices','false',false);
SET ROLE authenticated;
DO $customer$
DECLARE v_result jsonb; v_item jsonb; v_denied boolean:=false;
BEGIN
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,false,
    'a4000000-0000-4000-8000-000000000001');
  v_item:=v_result->'items'->0;
  IF v_item->>'display_price'<>'42.75'
    OR v_item?'base_price' OR v_item?'cost_price' OR v_item?'margin'
    OR v_item?'price_wholesale' OR v_item?'price_wholesale_of_wholesale'
    OR v_item?'organization_id' THEN
    RAISE EXCEPTION 'authenticated customer did not receive only the resolved account price: %',v_item;
  END IF;

  v_result:=public.get_storefront_catalog_page(
    NULL,NULL,1,1,true,NULLIF(current_setting('app.test_brand_id'),'')::uuid,
    'كرتون',true,NULL
  );
  IF (v_result->>'total_count')::integer<>2 OR (v_result->>'total_pages')::integer<>2
     OR jsonb_array_length(v_result->'items')<>1 THEN
    RAISE EXCEPTION 'authenticated customer combined filter/count contract failed: %',v_result;
  END IF;

  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,false,
    'b4000000-0000-4000-8000-000000000004');
  IF jsonb_array_length(v_result->'items')<>0 THEN
    RAISE EXCEPTION 'authenticated customer read a product from another organization: %',v_result;
  END IF;

  BEGIN
    PERFORM public.get_admin_storefront_product_details('a4000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'customer could read admin-only product details'; END IF;
END
$customer$;
RESET ROLE;

UPDATE public.admin_settings SET value='false'::jsonb
WHERE organization_id='a0000000-0000-4000-8000-000000000001' AND key='show_price_on_cards';
SET ROLE authenticated;
DO $customer_hidden$
DECLARE v_result jsonb; v_item jsonb; v_resolver_price numeric(15,2);
BEGIN
  SELECT price.unit_price INTO v_resolver_price
  FROM public.get_storefront_product_prices(ARRAY['a4000000-0000-4000-8000-000000000001'::uuid],1) price;
  IF v_resolver_price IS DISTINCT FROM 42.75::numeric(15,2) THEN
    RAISE EXCEPTION 'neutral customer-tier resolver must remain independent of catalog display policy: %',v_resolver_price;
  END IF;
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,false,
    'a4000000-0000-4000-8000-000000000001');
  v_item:=v_result->'items'->0;
  IF v_item IS NULL OR v_item->'display_price'<>'null'::jsonb
    OR v_item?'base_price' OR v_item?'cost_price' OR v_item?'margin'
    OR v_item?'price_wholesale' OR v_item?'price_wholesale_of_wholesale' THEN
    RAISE EXCEPTION 'authenticated hidden-price privacy contract failed: %',v_item;
  END IF;
  v_result:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,true,
    'a4000000-0000-4000-8000-000000000001');
  IF jsonb_array_length(v_result->'items')<>0 THEN
    RAISE EXCEPTION 'authenticated hidden-price account passed displayability filter';
  END IF;
END
$customer_hidden$;
RESET ROLE;

-- A manager may read management facts, but staff may not use these raw endpoints.
SELECT set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',false);
SELECT set_config('app.is_staff','true',false);
SELECT set_config('app.can_view_internal_prices','false',false);
SET ROLE authenticated;
DO $manager$
DECLARE v_result jsonb; v_catalog jsonb; v_item jsonb;
BEGIN
  v_result:=public.get_admin_storefront_product_details('a4000000-0000-4000-8000-000000000001');
  IF v_result->>'brand_name'<>'علامة معتمدة' THEN
    RAISE EXCEPTION 'manager could not read the management product facts: %',v_result;
  END IF;
  v_catalog:=public.get_storefront_catalog_page(NULL,NULL,1,10,false,NULL,NULL,false,
    'a4000000-0000-4000-8000-000000000001');
  v_item:=v_catalog->'items'->0;
  IF v_item->'display_price'<>'null'::jsonb OR v_item?'base_price'
    OR v_item?'cost_price' OR v_item?'margin' THEN
    RAISE EXCEPTION 'staff without internal-price permission received protected price data: %',v_item;
  END IF;
END
$manager$;
RESET ROLE;

-- A profile-level explicit denial must override its manager role grant on both raw RPCs.
INSERT INTO public.authorization_profile_denials(
  organization_id,profile_id,capability_key,is_active,expires_at
) VALUES(
  'a0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000003',
  'catalog.product.details.manage',true,NULL
);
SELECT set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',false);
SET ROLE authenticated;
DO $explicit_deny$
DECLARE v_read_denied boolean:=false; v_write_denied boolean:=false; v_atomic_denied boolean:=false;
BEGIN
  IF public.current_actor_has_capability('catalog.product.details.manage') THEN
    RAISE EXCEPTION 'explicit profile denial did not override manager capability grant';
  END IF;
  BEGIN
    PERFORM public.get_admin_storefront_product_details('a4000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_read_denied:=true; END;
  BEGIN
    PERFORM public.save_admin_storefront_product_details(
      'a4000000-0000-4000-8000-000000000001','محاولة تغيير مرفوضة',NULL,NULL,false,'[]'::jsonb,false,
      NULL,NULL,NULL,false,'[]'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN v_write_denied:=true; END;
  BEGIN
    PERFORM public.save_admin_catalog_product_with_storefront_details(
      'a4000000-0000-4000-8000-000000000001',
      jsonb_build_object('name','اسم يجب ألا يُحفظ','item_code','MAIN-01','unit','قطعة','status','active'),
      jsonb_build_object('brand_name','علامة يجب ألا تُحفظ')
    );
  EXCEPTION WHEN insufficient_privilege THEN v_atomic_denied:=true; END;
  IF NOT v_read_denied OR NOT v_write_denied OR NOT v_atomic_denied THEN
    RAISE EXCEPTION 'Authorization V2 explicit denial was bypassed (read %, write %, combined %)',
      v_read_denied,v_write_denied,v_atomic_denied;
  END IF;
END
$explicit_deny$;
RESET ROLE;

DO $denial_rollback$
DECLARE v_product_name text; v_brand_name text;
BEGIN
  SELECT p.name,b.name INTO v_product_name,v_brand_name
  FROM public.products p
  LEFT JOIN public.product_brands b ON b.id=p.brand_id AND b.organization_id=p.organization_id
  WHERE p.id='a4000000-0000-4000-8000-000000000001';
  IF v_product_name<>'منتج رئيسي' OR v_brand_name<>'علامة معتمدة' THEN
    RAISE EXCEPTION 'denied combined save left a partial catalog or product-facts write: %, %',
      v_product_name,v_brand_name;
  END IF;
END
$denial_rollback$;

-- Replaying the migration after a deliberate grant removal must not restore the grant.
DELETE FROM public.authorization_profile_denials
WHERE profile_id='a1000000-0000-4000-8000-000000000003'
  AND capability_key='catalog.product.details.manage';
DELETE FROM public.authorization_role_capabilities
WHERE role='manager' AND capability_key='catalog.product.details.manage';
\ir ../migrations/20261126120000_catalog_product_details_authorization_v2.sql
DO $grant_replay$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.authorization_role_capabilities
    WHERE role='manager' AND capability_key='catalog.product.details.manage'
  ) THEN
    RAISE EXCEPTION 'migration replay restored a deliberately removed manager capability grant';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.authorization_role_capabilities
    WHERE role='admin' AND capability_key='catalog.product.details.manage'
  ) THEN
    RAISE EXCEPTION 'migration replay unexpectedly removed the untouched admin capability grant';
  END IF;
END
$grant_replay$;

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

SELECT 'PASS: PostgreSQL 17 storefront facts, anonymous and authenticated tier price privacy, tenant scope, conjunctive filters/pagination, manager/staff authorization, RLS and atomic rollback' AS result;
