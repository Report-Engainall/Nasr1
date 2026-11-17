-- Isolated PostgreSQL 17 acceptance for the targeted storefront cart product lookup.
-- The test uses disposable synthetic tenants and never connects to hosted Supabase.

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
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  category_id uuid,
  brand_id uuid,
  name text NOT NULL,
  name_en text,
  item_code text NOT NULL,
  sku text,
  barcode text,
  unit text NOT NULL,
  description text,
  image_url text,
  status text NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  min_order_quantity integer NOT NULL DEFAULT 1,
  order_quantity_multiple integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.inventory_balances (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  quantity_available numeric NOT NULL
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION public.get_public_storefront_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'organization_id', pg_catalog.current_setting('app.public_org_id', true),
    'warehouse_id', pg_catalog.current_setting('app.public_warehouse_id', true)
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_current_tenant_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'organization_id', pg_catalog.current_setting('app.auth_org_id', true),
    'warehouse_id', pg_catalog.current_setting('app.auth_warehouse_id', true)
  )
$function$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

INSERT INTO public.organizations(id, is_active) VALUES
  ('a0000000-0000-4000-8000-000000000001', true),
  ('b0000000-0000-4000-8000-000000000002', true);
INSERT INTO public.warehouses(id, organization_id, is_active) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', true),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', true);
INSERT INTO public.products(
  id, organization_id, name, item_code, unit, status,
  min_order_quantity, order_quantity_multiple
) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'أرز بسمتي', 'RICE-A', 'كيس', 'active', 2, 2),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'صنف متوقف', 'OLD-A', 'كرتون', 'inactive', 1, 1),
  ('b2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'سكر مؤسسة أخرى', 'SUGAR-B', 'كيس', 'active', 1, 1);
INSERT INTO public.inventory_balances(id, product_id, warehouse_id, quantity_available) VALUES
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 12),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 99);

\ir ../migrations/20261117181000_storefront_cart_product_details.sql

SET app.public_org_id = 'a0000000-0000-4000-8000-000000000001';
SET app.public_warehouse_id = 'a1000000-0000-4000-8000-000000000001';
SET request.jwt.claim.sub = '';

DO $public_lookup$
DECLARE
  v_result jsonb;
  v_item jsonb;
  v_rejected boolean;
BEGIN
  v_result := public.get_storefront_cart_product_details(ARRAY[
    'a2000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000002'::uuid,
    'b2000000-0000-4000-8000-000000000002'::uuid
  ]);
  IF pg_catalog.jsonb_array_length(v_result -> 'items') <> 1 THEN
    RAISE EXCEPTION 'Public cart lookup returned inactive or cross-tenant products: %', v_result;
  END IF;
  v_item := v_result -> 'items' -> 0;
  IF v_item ->> 'id' <> 'a2000000-0000-4000-8000-000000000001'
     OR v_item ->> 'name' <> 'أرز بسمتي'
     OR v_item ->> 'min_order_quantity' <> '2'
     OR v_item ->> 'order_quantity_multiple' <> '2'
     OR v_item -> 'inventory' ->> 'quantity_available' <> '12'
     OR v_item -> 'display_price' <> 'null'::jsonb
     OR v_item ? 'organization_id'
     OR v_item ? 'warehouse_id'
     OR v_item ? 'base_price' THEN
    RAISE EXCEPTION 'Public cart product projection is incorrect or exposes forbidden fields: %', v_item;
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.get_storefront_cart_product_details(ARRAY[
      'a2000000-0000-4000-8000-000000000001'::uuid,
      'a2000000-0000-4000-8000-000000000001'::uuid
    ]);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Duplicate cart IDs were not rejected.'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.get_storefront_cart_product_details(
      pg_catalog.array_fill('a2000000-0000-4000-8000-000000000001'::uuid, ARRAY[101])
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'A cart lookup exceeding 100 IDs was not rejected.'; END IF;
END
$public_lookup$;

SET app.auth_org_id = 'b0000000-0000-4000-8000-000000000002';
SET app.auth_warehouse_id = 'b1000000-0000-4000-8000-000000000002';
SET request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000002';

DO $authenticated_lookup$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.get_storefront_cart_product_details(ARRAY[
    'a2000000-0000-4000-8000-000000000001'::uuid,
    'b2000000-0000-4000-8000-000000000002'::uuid
  ]);
  IF pg_catalog.jsonb_array_length(v_result -> 'items') <> 1
     OR v_result -> 'items' -> 0 ->> 'id' <> 'b2000000-0000-4000-8000-000000000002'
     OR v_result -> 'items' -> 0 -> 'inventory' ->> 'quantity_available' <> '99' THEN
    RAISE EXCEPTION 'Authenticated cart lookup failed to enforce the current tenant and warehouse: %', v_result;
  END IF;
END
$authenticated_lookup$;

SELECT 'storefront cart product details acceptance: PASS' AS result;
