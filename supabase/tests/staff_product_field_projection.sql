-- Isolated PostgreSQL 17 acceptance for the existing staff product projection.
-- This script builds a minimal disposable schema, applies the production migration text,
-- and checks the raw RPC JSON under real PostgreSQL role switching. It never connects
-- to the hosted Supabase project and all fixtures are local to the workflow container.

\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL UNIQUE,
  organization_id uuid REFERENCES public.organizations(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role text NOT NULL,
  PRIMARY KEY (profile_id, role)
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  category_id uuid,
  name text NOT NULL,
  name_en text,
  item_code text NOT NULL,
  sku text,
  barcode text,
  description text,
  unit text NOT NULL,
  status text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  min_order_quantity integer NOT NULL DEFAULT 1,
  order_quantity_multiple integer NOT NULL DEFAULT 1,
  min_stock numeric NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  base_price numeric(15,2) NOT NULL,
  cost_price numeric(15,2) NOT NULL,
  price_wholesale_of_wholesale numeric(15,2) NOT NULL,
  price_wholesale numeric(15,2) NOT NULL,
  price_retail numeric(15,2) NOT NULL,
  retail_price numeric(15,2) NOT NULL,
  wholesale_price numeric(15,2) NOT NULL,
  unit_cost numeric(15,2) NOT NULL,
  purchase_cost numeric(15,2) NOT NULL,
  margin numeric(15,2) NOT NULL,
  max_stock numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.admin_settings (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  key text NOT NULL,
  value jsonb,
  PRIMARY KEY (organization_id, key)
);

-- Minimal Supabase Auth/commerce functions required by the repository migration.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active = true
  ORDER BY p.created_at, p.id
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT NULL::uuid
$function$;

CREATE OR REPLACE FUNCTION public.current_customer_can(p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT false
$function$;

CREATE OR REPLACE FUNCTION public.public_storefront_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT NULL::uuid
$function$;

CREATE OR REPLACE FUNCTION public.customer_product_unit_price(
  p_product_id uuid,
  p_organization_id uuid,
  p_tier text,
  p_quantity numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.base_price
  FROM public.products p
  WHERE p.id = p_product_id
    AND p.organization_id = p_organization_id
$function$;

CREATE OR REPLACE FUNCTION public.resolve_active_promotion_price(
  p_product_id uuid,
  p_organization_id uuid,
  p_unit_price numeric
)
RETURNS TABLE(net_unit_price numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_unit_price
$function$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

INSERT INTO public.organizations (id, is_active) VALUES
  ('a0000000-0000-4000-8000-000000000001', true),
  ('b0000000-0000-4000-8000-000000000002', true);

INSERT INTO public.warehouses (id, organization_id, name) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Tenant A warehouse'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Tenant B warehouse');

INSERT INTO public.profiles (id, auth_user_id, organization_id) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000006', 'a3000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002');

INSERT INTO public.user_roles (profile_id, role) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'admin'),
  ('a2000000-0000-4000-8000-000000000002', 'manager'),
  ('a2000000-0000-4000-8000-000000000003', 'staff'),
  ('a2000000-0000-4000-8000-000000000004', 'accountant'),
  ('a2000000-0000-4000-8000-000000000005', 'staff'),
  ('a2000000-0000-4000-8000-000000000005', 'accountant'),
  ('a2000000-0000-4000-8000-000000000006', 'customer_manager'),
  ('b2000000-0000-4000-8000-000000000002', 'staff');

INSERT INTO public.products (
  id, organization_id, name, name_en, item_code, sku, barcode, description, unit, status,
  image_url, min_order_quantity, order_quantity_multiple, min_stock, is_featured, sort_order,
  base_price, cost_price, price_wholesale_of_wholesale, price_wholesale, price_retail,
  retail_price, wholesale_price, unit_cost, purchase_cost, margin, max_stock
) VALUES
  (
    'a4000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'Tenant A product', 'Tenant A product EN', 'A-001', 'A-SKU-001', 'A-BAR-001',
    'Safe operational product description', 'piece', 'active', 'https://example.test/a.webp',
    1, 1, 5, true, 1,
    125.50, 74.25, 90.00, 100.00, 115.00, 115.00, 100.00, 74.25, 73.00, 51.25, 500
  ),
  (
    'b4000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'Tenant B product', 'Tenant B product EN', 'B-001', 'B-SKU-001', 'B-BAR-001',
    'Foreign tenant product', 'piece', 'active', 'https://example.test/b.webp',
    1, 1, 5, false, 2,
    225.50, 174.25, 190.00, 200.00, 215.00, 215.00, 200.00, 174.25, 173.00, 51.25, 500
  );

-- Prove the admin/manager path remains complete while the staff path is allowlisted.
-- The setting is deliberately false: privileged internal price access must remain
-- distinct from the public storefront display-price preference.
INSERT INTO public.admin_settings (organization_id, key, value)
VALUES ('a0000000-0000-4000-8000-000000000001', 'show_price_on_cards', 'false'::jsonb);

\ir ../migrations/20261116090000_staff_product_field_projection.sql

-- Administrator: full internal projection and full base-price resolver remain available.
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', false);
SET ROLE authenticated;
DO $admin_acceptance$
DECLARE
  v_row jsonb;
  v_price numeric;
  v_context jsonb;
  v_product_id uuid := 'a4000000-0000-4000-8000-000000000001';
BEGIN
  SELECT pg_catalog.to_jsonb(p) INTO v_row
  FROM public.fetch_staff_products(v_product_id) AS p;
  IF v_row IS NULL OR v_row->>'base_price' <> '125.50'
     OR v_row->>'cost_price' <> '74.25'
     OR v_row->>'price_wholesale_of_wholesale' <> '90.00'
     OR v_row->>'price_wholesale' <> '100.00'
     OR v_row->>'price_retail' <> '115.00' THEN
    RAISE EXCEPTION 'admin full product projection was unexpectedly narrowed: %', v_row;
  END IF;
  v_context := public.get_current_tenant_context();
  IF v_context->>'can_view_internal_product_prices' <> 'true' THEN
    RAISE EXCEPTION 'admin internal price capability was not preserved: %', v_context;
  END IF;
  SELECT p.unit_price INTO v_price
  FROM public.get_storefront_product_prices(ARRAY[v_product_id], 1) AS p;
  IF v_price IS DISTINCT FROM 125.50 THEN
    RAISE EXCEPTION 'admin base price resolver changed: %', v_price;
  END IF;
END
$admin_acceptance$;
RESET ROLE;

-- Manager: same internal projection and resolver permission as admin.
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', false);
SET ROLE authenticated;
DO $manager_acceptance$
DECLARE
  v_row jsonb;
  v_price numeric;
  v_context jsonb;
  v_product_id uuid := 'a4000000-0000-4000-8000-000000000001';
BEGIN
  SELECT pg_catalog.to_jsonb(p) INTO v_row
  FROM public.fetch_staff_products(v_product_id) AS p;
  IF v_row IS NULL OR v_row->>'base_price' <> '125.50'
     OR v_row->>'cost_price' <> '74.25'
     OR v_row->>'price_wholesale_of_wholesale' <> '90.00'
     OR v_row->>'price_wholesale' <> '100.00'
     OR v_row->>'price_retail' <> '115.00' THEN
    RAISE EXCEPTION 'manager full product projection was unexpectedly narrowed: %', v_row;
  END IF;
  v_context := public.get_current_tenant_context();
  IF v_context->>'can_view_internal_product_prices' <> 'true' THEN
    RAISE EXCEPTION 'manager internal price capability was not preserved: %', v_context;
  END IF;
  SELECT p.unit_price INTO v_price
  FROM public.get_storefront_product_prices(ARRAY[v_product_id], 1) AS p;
  IF v_price IS DISTINCT FROM 125.50 THEN
    RAISE EXCEPTION 'manager base price resolver changed: %', v_price;
  END IF;
END
$manager_acceptance$;
RESET ROLE;

-- Staff: actual RPC row JSON must contain operational fields and omit every
-- internal price/cost/margin key; both privileged RPC paths must deny the staff actor.
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', false);
SET ROLE authenticated;
DO $staff_acceptance$
DECLARE
  v_row jsonb;
  v_context jsonb;
  v_product_id uuid := 'a4000000-0000-4000-8000-000000000001';
  v_sensitive_keys text[] := ARRAY[
    'base_price','cost_price','unit_cost','purchase_cost','margin',
    'retail_price','wholesale_price','price_wholesale_of_wholesale','price_wholesale','price_retail',
    'organization_id','max_stock','display_price'
  ];
  v_key_count integer;
  v_denied boolean;
BEGIN
  SELECT pg_catalog.to_jsonb(p) INTO v_row
  FROM public.fetch_staff_catalog_products(v_product_id) AS p;
  IF v_row IS NULL OR v_row->>'id' <> v_product_id::text
     OR v_row->>'name' <> 'Tenant A product'
     OR v_row->>'item_code' <> 'A-001'
     OR v_row->>'min_stock' <> '5' THEN
    RAISE EXCEPTION 'staff safe operational projection is missing required fields: %', v_row;
  END IF;
  IF v_row ?| v_sensitive_keys THEN
    RAISE EXCEPTION 'staff RPC JSON leaked a protected field: %', v_row;
  END IF;
  SELECT pg_catalog.count(*) INTO v_key_count FROM pg_catalog.jsonb_object_keys(v_row);
  IF v_key_count <> 17 THEN
    RAISE EXCEPTION 'staff projection key count changed; expected exact 17-column allowlist, got %: %', v_key_count, v_row;
  END IF;

  v_context := public.get_current_tenant_context();
  IF v_context->>'is_staff' <> 'true'
     OR v_context->>'can_view_internal_product_prices' <> 'false' THEN
    RAISE EXCEPTION 'staff tenant context grants the wrong price boundary: %', v_context;
  END IF;

  v_denied := false;
  BEGIN
    PERFORM 1 FROM public.fetch_staff_products(v_product_id);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'staff was allowed to call the full financial product projection';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM 1 FROM public.get_storefront_product_prices(ARRAY[v_product_id], 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'staff was allowed to resolve internal base prices';
  END IF;
END
$staff_acceptance$;
RESET ROLE;

-- Accountant-only identities must not gain staff catalogue or internal prices.
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000004', false);
SET ROLE authenticated;
DO $accountant_acceptance$
DECLARE
  v_denied boolean;
BEGIN
  v_denied := false;
  BEGIN
    PERFORM 1 FROM public.fetch_staff_catalog_products(NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'accountant-only identity was allowed staff product catalogue access';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM 1 FROM public.fetch_staff_products(NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'accountant-only identity was allowed the full product projection';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM 1 FROM public.get_storefront_product_prices(
      ARRAY['a4000000-0000-4000-8000-000000000001'::uuid], 1
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'accountant-only identity was allowed internal price resolution';
  END IF;
END
$accountant_acceptance$;
RESET ROLE;

-- A mixed staff+accountant identity may use only the allowlisted product projection.
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000005', false);
SET ROLE authenticated;
DO $mixed_role_acceptance$
DECLARE
  v_row jsonb;
  v_context jsonb;
  v_denied boolean := false;
BEGIN
  SELECT pg_catalog.to_jsonb(p) INTO v_row
  FROM public.fetch_staff_catalog_products('a4000000-0000-4000-8000-000000000001') AS p;
  IF v_row IS NULL OR v_row ?| ARRAY[
    'base_price','cost_price','unit_cost','purchase_cost','margin',
    'retail_price','wholesale_price','price_wholesale_of_wholesale','price_wholesale','price_retail'
  ] THEN
    RAISE EXCEPTION 'mixed-role identity received protected product fields: %', v_row;
  END IF;

  v_context := public.get_current_tenant_context();
  IF v_context->>'is_staff' <> 'true'
     OR v_context->>'can_view_internal_product_prices' <> 'false' THEN
    RAISE EXCEPTION 'mixed-role identity bypassed accountant price separation: %', v_context;
  END IF;

  BEGIN
    PERFORM 1 FROM public.fetch_staff_products('a4000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'mixed-role identity reached the privileged full product RPC';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM 1 FROM public.get_storefront_product_prices(
      ARRAY['a4000000-0000-4000-8000-000000000001'::uuid], 1
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'mixed-role identity resolved internal prices';
  END IF;
END
$mixed_role_acceptance$;
RESET ROLE;

-- Non-operational customer-manager identity cannot call either staff product RPC.
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000006', false);
SET ROLE authenticated;
DO $customer_manager_denial$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.fetch_staff_catalog_products(NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'customer manager was granted the internal staff product projection';
  END IF;
END
$customer_manager_denial$;
RESET ROLE;

-- Tenant B staff sees only tenant B's product, never tenant A's product.
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'b3000000-0000-4000-8000-000000000002', false);
SET ROLE authenticated;
DO $tenant_isolation$
DECLARE
  v_count_a integer;
  v_count_b integer;
  v_row jsonb;
BEGIN
  SELECT pg_catalog.count(*) INTO v_count_a
  FROM public.fetch_staff_catalog_products('a4000000-0000-4000-8000-000000000001');
  SELECT pg_catalog.count(*) INTO v_count_b
  FROM public.fetch_staff_catalog_products('b4000000-0000-4000-8000-000000000002');
  IF v_count_a <> 0 OR v_count_b <> 1 THEN
    RAISE EXCEPTION 'cross-tenant safe product projection failed (tenant A rows %, tenant B rows %)', v_count_a, v_count_b;
  END IF;
  SELECT pg_catalog.to_jsonb(p) INTO v_row
  FROM public.fetch_staff_catalog_products('b4000000-0000-4000-8000-000000000002') AS p;
  IF v_row->>'name' <> 'Tenant B product' OR v_row ?| ARRAY['base_price','cost_price','margin'] THEN
    RAISE EXCEPTION 'tenant B projection was incorrect or included protected fields: %', v_row;
  END IF;
END
$tenant_isolation$;
RESET ROLE;

SELECT 'PASS: PostgreSQL 17 staff product field projection, raw RPC key redaction, manager/admin parity, accountant separation, role denial and tenant isolation' AS result;
