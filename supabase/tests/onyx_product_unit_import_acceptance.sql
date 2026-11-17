\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN';
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
CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  item_code text NOT NULL,
  unit text NOT NULL,
  UNIQUE (organization_id, item_code)
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  old_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  job_type text NOT NULL,
  status text NOT NULL
);
CREATE TABLE public.onyx_snapshots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  source_import_job_id uuid NOT NULL REFERENCES public.import_jobs(id),
  status text NOT NULL,
  report_type text NOT NULL,
  data_quality_score integer NOT NULL,
  row_count integer NOT NULL
);
CREATE TABLE public.onyx_snapshot_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.onyx_snapshots(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  row_number integer NOT NULL,
  canonical_key text,
  status text NOT NULL,
  data jsonb NOT NULL,
  errors jsonb
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

\ir ../migrations/20261106113000_product_alternate_unit_conversions.sql
\ir ../migrations/20261117193000_onyx_product_unit_import.sql

DO $acceptance$
DECLARE
  v_profile_id uuid;
  v_profile_replay uuid;
  v_manager_profile_id uuid;
  v_other_tenant_profile_id uuid;
  v_snapshot_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_job_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_product_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_result jsonb;
  v_replay jsonb;
  v_count integer;
  v_box_factor integer;
  v_pack_factor integer;
  v_dozen_factor integer;
  v_audit_count integer;
BEGIN
  PERFORM pg_catalog.set_config('nasr.test.organization_id', '11111111-1111-4111-8111-111111111111', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '22222222-2222-4222-8222-222222222222', true);
  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '', true);
  BEGIN
    PERFORM public.ensure_onyx_product_unit_import_profile();
    RAISE EXCEPTION 'anonymous ProductUnits profile initialization unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '77777777-7777-4777-8777-777777777777', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '66666666-6666-4666-8666-666666666666', true);
  BEGIN
    PERFORM public.ensure_onyx_product_unit_import_profile();
    RAISE EXCEPTION 'non-manager ProductUnits profile initialization unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '33333333-3333-4333-8333-333333333333', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '22222222-2222-4222-8222-222222222222', true);
  v_profile_id := public.ensure_onyx_product_unit_import_profile();
  v_profile_replay := public.ensure_onyx_product_unit_import_profile();
  IF v_profile_id IS DISTINCT FROM v_profile_replay THEN
    RAISE EXCEPTION 'same-tenant ProductUnits profile initialization did not replay';
  END IF;

  SELECT count(*) INTO v_count FROM public.import_profiles
   WHERE organization_id = '11111111-1111-4111-8111-111111111111'
     AND profile_name = 'Onyx Pro Product Units';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ProductUnits profile replay created % rows instead of one', v_count;
  END IF;

  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '55555555-5555-4555-8555-555555555555', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '44444444-4444-4444-8444-444444444444', true);
  v_manager_profile_id := public.ensure_onyx_product_unit_import_profile();
  IF v_manager_profile_id IS DISTINCT FROM v_profile_id THEN
    RAISE EXCEPTION 'manager did not reuse the organization ProductUnits profile';
  END IF;

  PERFORM pg_catalog.set_config('nasr.test.organization_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '99999999-9999-4999-8999-999999999999', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '88888888-8888-4888-8888-888888888888', true);
  v_other_tenant_profile_id := public.ensure_onyx_product_unit_import_profile();
  IF v_other_tenant_profile_id IS NULL OR v_other_tenant_profile_id = v_profile_id THEN
    RAISE EXCEPTION 'ProductUnits profile was reused across organizations';
  END IF;

  IF pg_catalog.has_function_privilege('anon', 'public.ensure_onyx_product_unit_import_profile()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.apply_onyx_product_unit_snapshot(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon unexpectedly has ProductUnits function access';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.ensure_onyx_product_unit_import_profile()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.apply_onyx_product_unit_snapshot(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated is missing ProductUnits RPC access';
  END IF;

  PERFORM pg_catalog.set_config('nasr.test.organization_id', '11111111-1111-4111-8111-111111111111', true);
  PERFORM pg_catalog.set_config('nasr.test.profile_id', '66666666-6666-4666-8666-666666666666', true);
  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '77777777-7777-4777-8777-777777777777', true);
  BEGIN
    PERFORM public.apply_onyx_product_unit_snapshot(v_snapshot_id);
    RAISE EXCEPTION 'staff ProductUnits apply unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM pg_catalog.set_config('nasr.test.profile_id', '22222222-2222-4222-8222-222222222222', true);
  PERFORM pg_catalog.set_config('nasr.test.auth_uid', '33333333-3333-4333-8333-333333333333', true);
  INSERT INTO public.products (id, organization_id, item_code, unit)
  VALUES (v_product_id, '11111111-1111-4111-8111-111111111111', '000125', 'حبة');

  INSERT INTO public.product_unit_conversions (organization_id, product_id, unit_name, base_units_per_unit) VALUES
    ('11111111-1111-4111-8111-111111111111', v_product_id, 'علبة', 10),
    ('11111111-1111-4111-8111-111111111111', v_product_id, 'دستة', 12);

  INSERT INTO public.import_jobs (id, organization_id, job_type, status)
  VALUES (v_job_id, '11111111-1111-4111-8111-111111111111', 'product_units', 'completed');
  INSERT INTO public.onyx_snapshots (
    id, organization_id, source_import_job_id, status, report_type, data_quality_score, row_count
  ) VALUES (
    v_snapshot_id, '11111111-1111-4111-8111-111111111111', v_job_id, 'ready', 'product_units', 92, 6
  );

  INSERT INTO public.onyx_snapshot_rows (
    snapshot_id, organization_id, row_number, canonical_key, status, data
  ) VALUES
    (v_snapshot_id, '11111111-1111-4111-8111-111111111111', 2, '000125::BOX', 'valid',
      '{"item_code":"000125","unit_code":"BOX","unit_name":"كرتون","conversion_factor":"24","unit_selling_price":"80"}'::jsonb),
    (v_snapshot_id, '11111111-1111-4111-8111-111111111111', 3, '000125::PACK', 'valid',
      '{"item_code":"000125","unit_code":"PACK","unit_name":"علبة","conversion_factor":"12"}'::jsonb),
    (v_snapshot_id, '11111111-1111-4111-8111-111111111111', 4, '000125::DOZ', 'valid',
      '{"item_code":"000125","unit_code":"DOZ","unit_name":"دستة","conversion_factor":"12"}'::jsonb),
    (v_snapshot_id, '11111111-1111-4111-8111-111111111111', 5, '000125::EA', 'valid',
      '{"item_code":"000125","unit_code":"EA","unit_name":"حبة","conversion_factor":"1","is_base_unit":"true"}'::jsonb),
    (v_snapshot_id, '11111111-1111-4111-8111-111111111111', 6, '000125::BLANK', 'valid',
      '{"item_code":"000125","unit_code":"BLANK","unit_name":"فارغ","conversion_factor":""}'::jsonb),
    (v_snapshot_id, '11111111-1111-4111-8111-111111111111', 7, 'NO-PRODUCT::BOX', 'valid',
      '{"item_code":"NO-PRODUCT","unit_code":"BOX","unit_name":"صندوق","conversion_factor":"5"}'::jsonb);

  v_result := public.apply_onyx_product_unit_snapshot(v_snapshot_id);
  IF v_result->>'status' <> 'applied'
     OR (v_result->>'source_rows')::integer <> 6
     OR (v_result->>'product_count')::integer <> 1
     OR (v_result->>'units_created')::integer <> 1
     OR (v_result->>'units_updated')::integer <> 1
     OR (v_result->>'units_unchanged')::integer <> 1
     OR (v_result->>'base_unit_rows_skipped')::integer <> 1
     OR (v_result->>'metadata_rows_pending_review')::integer <> 1
     OR (v_result->>'rejected')::integer <> 2
     OR (v_result->>'row_errors_truncated')::boolean THEN
    RAISE EXCEPTION 'unexpected ProductUnits apply summary: %', v_result;
  END IF;

  SELECT base_units_per_unit INTO v_box_factor FROM public.product_unit_conversions
   WHERE organization_id = '11111111-1111-4111-8111-111111111111'
     AND product_id = v_product_id AND unit_name = 'كرتون';
  SELECT base_units_per_unit INTO v_pack_factor FROM public.product_unit_conversions
   WHERE organization_id = '11111111-1111-4111-8111-111111111111'
     AND product_id = v_product_id AND unit_name = 'علبة';
  SELECT base_units_per_unit INTO v_dozen_factor FROM public.product_unit_conversions
   WHERE organization_id = '11111111-1111-4111-8111-111111111111'
     AND product_id = v_product_id AND unit_name = 'دستة';
  IF v_box_factor <> 24 OR v_pack_factor <> 12 OR v_dozen_factor <> 12 THEN
    RAISE EXCEPTION 'conversion merge failed: box %, pack %, dozen %', v_box_factor, v_pack_factor, v_dozen_factor;
  END IF;

  SELECT count(*) INTO v_count FROM public.product_unit_conversions
   WHERE organization_id = '11111111-1111-4111-8111-111111111111' AND product_id = v_product_id;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'expected three alternate units after merge, got %', v_count;
  END IF;

  v_replay := public.apply_onyx_product_unit_snapshot(v_snapshot_id);
  IF v_replay->>'idempotent_replay' <> 'true'
     OR (SELECT count(*) FROM public.onyx_product_unit_import_applications WHERE snapshot_id = v_snapshot_id) <> 1 THEN
    RAISE EXCEPTION 'same ProductUnits snapshot was not safely replayed';
  END IF;

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
   WHERE entity_id = v_product_id AND action = 'catalog.product_units_updated';
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'native product-unit command should emit exactly one update audit, got %', v_audit_count;
  END IF;
  SELECT count(*) INTO v_audit_count FROM public.audit_logs
   WHERE entity_id = v_snapshot_id AND action = 'catalog.product_units_imported';
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'ProductUnits apply should emit exactly one snapshot audit, got %', v_audit_count;
  END IF;
END;
$acceptance$;

SELECT 'Onyx ProductUnits PostgreSQL 17 acceptance: PASS' AS result;
