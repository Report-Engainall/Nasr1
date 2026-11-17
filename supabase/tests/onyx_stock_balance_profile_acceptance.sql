\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('nasr.test.auth_uid', true), '')::uuid;
$function$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL
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
CREATE TABLE public.import_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  profile_name text NOT NULL,
  report_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  version integer NOT NULL DEFAULT 1,
  required_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  optional_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  ignored_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  synonyms jsonb NOT NULL DEFAULT '{}'::jsonb,
  transformation_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  matching_key text NOT NULL DEFAULT 'item_code',
  merge_strategy text NOT NULL DEFAULT 'manual_review',
  date_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_full_dataset boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, profile_name, version)
);

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('nasr.test.profile_id', true), '')::uuid;
$function$;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid LANGUAGE sql STABLE
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('nasr.test.organization_id', true), '')::uuid;
$function$;

INSERT INTO public.organizations (id, is_active) VALUES
  ('11111111-1111-4111-8111-111111111111', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
INSERT INTO public.profiles (id, auth_user_id, organization_id, is_active) VALUES
  ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', true),
  ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', true),
  ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', true),
  ('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
INSERT INTO public.user_roles (profile_id, role) VALUES
  ('22222222-2222-4222-8222-222222222222', 'admin'),
  ('44444444-4444-4444-8444-444444444444', 'manager'),
  ('66666666-6666-4666-8666-666666666666', 'staff'),
  ('88888888-8888-4888-8888-888888888888', 'admin');

\ir ../migrations/20261117211000_onyx_stock_balance_import_profile.sql

DO $acceptance$
DECLARE
  v_admin_id uuid;
  v_admin_replay uuid;
  v_manager_id uuid;
  v_other_tenant_id uuid;
  v_state text;
  v_count integer;
  v_profile public.import_profiles%ROWTYPE;
BEGIN
  PERFORM pg_catalog.set_config('nasr.test.organization_id', '11111111-1111-4111-8111-111111111111', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '22222222-2222-4222-8222-222222222222', true);
  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '', true);
  BEGIN
    PERFORM public.ensure_onyx_stock_balance_import_profile();
    RAISE EXCEPTION 'anonymous profile initialization unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '77777777-7777-4777-8777-777777777777', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '66666666-6666-4666-8666-666666666666', true);
  BEGIN
    PERFORM public.ensure_onyx_stock_balance_import_profile();
    RAISE EXCEPTION 'non-manager profile initialization unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '33333333-3333-4333-8333-333333333333', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '66666666-6666-4666-8666-666666666666', true);
  BEGIN
    PERFORM public.ensure_onyx_stock_balance_import_profile();
    RAISE EXCEPTION 'mismatched auth user and profile unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '33333333-3333-4333-8333-333333333333', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '22222222-2222-4222-8222-222222222222', true);
  v_admin_id := public.ensure_onyx_stock_balance_import_profile();
  v_admin_replay := public.ensure_onyx_stock_balance_import_profile();
  IF v_admin_id IS DISTINCT FROM v_admin_replay THEN
    RAISE EXCEPTION 'same-tenant initialization did not return the original profile id';
  END IF;

  SELECT * INTO v_profile FROM public.import_profiles WHERE id = v_admin_id;
  IF NOT FOUND
     OR v_profile.organization_id <> '11111111-1111-4111-8111-111111111111'
     OR v_profile.profile_name <> 'Onyx Pro Stock Balances'
     OR v_profile.report_type <> 'inventory_stock'
     OR v_profile.source <> 'onyx_pro'
     OR v_profile.matching_key <> 'warehouse_item_key'
     OR v_profile.required_columns <> '["item_code","quantity","warehouse_code","as_of_date"]'::jsonb
     OR v_profile.status <> 'active'
     OR v_profile.created_by IS DISTINCT FROM '22222222-2222-4222-8222-222222222222' THEN
    RAISE EXCEPTION 'created stock-balance profile does not match the reconciliation contract';
  END IF;

  SELECT count(*) INTO v_count FROM public.import_profiles
   WHERE organization_id = '11111111-1111-4111-8111-111111111111'
     AND profile_name = 'Onyx Pro Stock Balances';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'replay created % active-profile rows instead of one', v_count;
  END IF;

  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '55555555-5555-4555-8555-555555555555', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '44444444-4444-4444-8444-444444444444', true);
  v_manager_id := public.ensure_onyx_stock_balance_import_profile();
  IF v_manager_id IS DISTINCT FROM v_admin_id THEN
    RAISE EXCEPTION 'manager did not reuse the organization profile';
  END IF;

  PERFORM pg_catalog.set_config('nasr.test.organization_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '99999999-9999-4999-8999-999999999999', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '88888888-8888-4888-8888-888888888888', true);
  v_other_tenant_id := public.ensure_onyx_stock_balance_import_profile();
  IF v_other_tenant_id IS NULL OR v_other_tenant_id = v_admin_id THEN
    RAISE EXCEPTION 'tenant-scoped profile was reused across organizations';
  END IF;

  IF pg_catalog.has_function_privilege('anon', 'public.ensure_onyx_stock_balance_import_profile()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon unexpectedly has execute permission';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.ensure_onyx_stock_balance_import_profile()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated is missing execute permission';
  END IF;
END;
$acceptance$;

SELECT 'Onyx StockBalances import-profile acceptance: PASS' AS result;
