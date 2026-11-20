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
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE TABLE public.organizations (id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  category_id uuid, name text NOT NULL, name_en text, item_code text NOT NULL, sku text,
  barcode text, description text, unit text NOT NULL, image_url text, status text NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  min_order_quantity integer NOT NULL DEFAULT 1,
  order_quantity_multiple integer NOT NULL DEFAULT 1,
  is_featured boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE public.inventory_balances (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  quantity_on_hand numeric NOT NULL, quantity_available numeric NOT NULL
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_storefront_context()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'organization_id', pg_catalog.current_setting('app.public_org_id', true),
    'warehouse_id', pg_catalog.current_setting('app.public_warehouse_id', true)
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_current_tenant_context()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'organization_id', pg_catalog.current_setting('app.auth_org_id', true),
    'warehouse_id', pg_catalog.current_setting('app.auth_warehouse_id', true),
    'is_staff', false,
    'can_view_internal_product_prices', false
  )
$function$;

CREATE OR REPLACE FUNCTION public.normalize_storefront_catalog_search(p_search text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
  SELECT COALESCE(p_search, '')
$function$;

CREATE OR REPLACE FUNCTION public.storefront_catalog_token_matches(p_value text, p_query text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
  SELECT p_value ILIKE '%' || p_query || '%'
$function$;

CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(
  p_product_ids uuid[], p_quantity numeric DEFAULT 1
)
RETURNS TABLE(product_id uuid, unit_price numeric(15,2))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT p.id, 45.50::numeric(15,2)
  FROM public.products p
  WHERE p.id = ANY(p_product_ids)
$function$;

INSERT INTO public.organizations(id, is_active) VALUES
  ('a0000000-0000-4000-8000-000000000001', true),
  ('b0000000-0000-4000-8000-000000000002', true);
INSERT INTO public.warehouses(id, organization_id, is_active) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', true),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', true);

INSERT INTO public.products(
  id, organization_id, name, item_code, unit, status, created_at, updated_at,
  min_order_quantity, order_quantity_multiple, is_featured, sort_order
) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'أرز بسمتي', 'RICE-A', 'كيس', 'active', '2026-11-01T00:00:00Z', '2026-11-19T08:15:00Z', 2, 2, true, 1),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'سكر', 'SUGAR-A', 'كيس', 'active', '2026-11-02T00:00:00Z', '2026-11-18T09:30:00Z', 1, 1, false, 2),
  ('a2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   'صنف متوقف', 'OLD-A', 'كرتون', 'inactive', '2026-11-03T00:00:00Z', '2026-11-18T10:00:00Z', 1, 1, false, 3),
  ('b2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'منتج مؤسسة أخرى', 'OTHER-B', 'قطعة', 'active', '2026-11-04T00:00:00Z', '2026-11-17T11:45:00Z', 1, 1, false, 1);

INSERT INTO public.inventory_balances(id, product_id, warehouse_id, quantity_on_hand, quantity_available) VALUES
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 12, 12),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 0, 0),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 99, 99);

\ir ../migrations/20261120140000_storefront_catalog_product_freshness.sql

SELECT pg_catalog.set_config('app.public_org_id', 'a0000000-0000-4000-8000-000000000001', false);
SELECT pg_catalog.set_config('app.public_warehouse_id', 'a1000000-0000-4000-8000-000000000001', false);
SELECT pg_catalog.set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;

DO $public_freshness$
DECLARE
  v_result jsonb;
  v_item jsonb;
BEGIN
  v_result := public.get_storefront_catalog_page(NULL, NULL, 1, 24, false);
  IF (v_result ->> 'total_count')::integer <> 2
     OR pg_catalog.jsonb_array_length(v_result -> 'items') <> 2 THEN
    RAISE EXCEPTION 'Anonymous catalogue did not return only active rows from its published tenant: %', v_result;
  END IF;

  SELECT value INTO v_item
  FROM pg_catalog.jsonb_array_elements(v_result -> 'items')
  WHERE value ->> 'id' = 'a2000000-0000-4000-8000-000000000001';
  IF v_item IS NULL
     OR (v_item ->> 'updated_at')::timestamptz <> '2026-11-19T08:15:00Z'::timestamptz
     OR (v_item ->> 'created_at')::timestamptz = (v_item ->> 'updated_at')::timestamptz THEN
    RAISE EXCEPTION 'Public product freshness must be the exact persisted updated_at, not created_at or a client timestamp: %', v_item;
  END IF;
  IF v_item ? 'base_price'
     OR v_item ? 'organization_id'
     OR v_item ? 'warehouse_id'
     OR v_item ? 'quantity_on_hand' THEN
    RAISE EXCEPTION 'Public freshness projection leaked an internal field: %', v_item;
  END IF;

  v_result := public.get_storefront_catalog_page(NULL, NULL, 1, 24, true);
  IF (v_result ->> 'total_count')::integer <> 1
     OR v_result -> 'items' -> 0 ->> 'id' <> 'a2000000-0000-4000-8000-000000000001'
     OR (v_result -> 'items' -> 0 ->> 'updated_at')::timestamptz <> '2026-11-19T08:15:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Availability filtering must preserve the same source-backed freshness field: %', v_result;
  END IF;
END
$public_freshness$;

RESET ROLE;

SELECT pg_catalog.set_config('app.auth_org_id', 'b0000000-0000-4000-8000-000000000002', false);
SELECT pg_catalog.set_config('app.auth_warehouse_id', 'b1000000-0000-4000-8000-000000000002', false);
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'b4000000-0000-4000-8000-000000000002', false);
SET ROLE authenticated;

DO $authenticated_freshness$
DECLARE
  v_result jsonb;
  v_item jsonb;
BEGIN
  v_result := public.get_storefront_catalog_page(NULL, NULL, 1, 24, false);
  IF (v_result ->> 'total_count')::integer <> 1
     OR pg_catalog.jsonb_array_length(v_result -> 'items') <> 1 THEN
    RAISE EXCEPTION 'Authenticated catalogue did not stay within the current tenant: %', v_result;
  END IF;
  v_item := v_result -> 'items' -> 0;
  IF v_item ->> 'id' <> 'b2000000-0000-4000-8000-000000000002'
     OR (v_item ->> 'updated_at')::timestamptz <> '2026-11-17T11:45:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Authenticated product freshness is not the source timestamp: %', v_item;
  END IF;
  IF v_item ? 'base_price' OR v_item ? 'organization_id' OR v_item ? 'warehouse_id' THEN
    RAISE EXCEPTION 'Authenticated customer freshness projection leaked private fields: %', v_item;
  END IF;
END
$authenticated_freshness$;

RESET ROLE;
SELECT 'storefront catalog updated_at PostgreSQL 17 acceptance: PASS' AS result;
