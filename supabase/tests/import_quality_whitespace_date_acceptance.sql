\\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN'; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  is_active boolean NOT NULL
);
CREATE TABLE public.user_roles (
  profile_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.import_profiles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  matching_key text NOT NULL,
  required_columns jsonb NOT NULL
);
CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  profile_id uuid
);
CREATE TABLE public.import_job_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL,
  row_number integer NOT NULL,
  status text NOT NULL,
  data jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path=''
AS $function$
  SELECT p.id
    FROM public.profiles p
   WHERE p.auth_user_id=auth.uid() AND p.is_active
   ORDER BY p.id
   LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path=''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.id=public.current_profile_id()
      AND p.is_active
      AND r.role IN ('admin','manager','staff')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_valid_import_quality_date(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path=''
AS $function$
DECLARE
  v_value text := pg_catalog.btrim(p_value);
  v_year integer;
  v_month integer;
  v_day integer;
  v_max_day integer;
BEGIN
  IF v_value IS NULL OR v_value = '' THEN RETURN NULL; END IF;

  IF v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    v_year := pg_catalog.substr(v_value,1,4)::integer;
    v_month := pg_catalog.substr(v_value,6,2)::integer;
    v_day := pg_catalog.substr(v_value,9,2)::integer;
  ELSIF v_value ~ '^[0-9]{2}[/.-][0-9]{2}[/.-][0-9]{4}$' THEN
    IF pg_catalog.substr(v_value,3,1) <> pg_catalog.substr(v_value,6,1) THEN
      RETURN false;
    END IF;
    v_day := pg_catalog.substr(v_value,1,2)::integer;
    v_month := pg_catalog.substr(v_value,4,2)::integer;
    v_year := pg_catalog.substr(v_value,7,4)::integer;
  ELSE
    RETURN false;
  END IF;

  IF v_year < 1 OR v_month < 1 OR v_month > 12 OR v_day < 1 THEN
    RETURN false;
  END IF;

  IF v_month = 2 THEN
    v_max_day := CASE
      WHEN v_year % 400 = 0 OR (v_year % 4 = 0 AND v_year % 100 <> 0) THEN 29
      ELSE 28
    END;
  ELSIF v_month IN (4,6,9,11) THEN
    v_max_day := 30;
  ELSE
    v_max_day := 31;
  END IF;

  RETURN v_day <= v_max_day;
END;
$function$;

INSERT INTO public.profiles(id,auth_user_id,organization_id,is_active)
VALUES(
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111',
 true
);
INSERT INTO public.user_roles(profile_id,role)
VALUES('22222222-2222-4222-8222-222222222222','admin');

INSERT INTO public.import_profiles(id,organization_id,matching_key,required_columns)
VALUES(
 '44444444-4444-4444-8444-444444444444',
 '11111111-1111-4111-8111-111111111111',
 'item_code',
 '["item_code"]'::jsonb
);

INSERT INTO public.import_jobs(id,organization_id,profile_id)
VALUES
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444'),
 ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444');

\\ir ../migrations/20261112000100_import_quality_whitespace_date_rejection.sql

INSERT INTO public.import_job_rows(import_job_id,row_number,status,data)
VALUES
 ('55555555-5555-4555-8555-555555555555',1,'valid','{"item_code":"DATE-NULL","date":null,"quantity":"1","revenue":"10","price":"10"}'::jsonb),
 ('55555555-5555-4555-8555-555555555555',2,'valid','{"item_code":"DATE-EMPTY","date":"","quantity":"1","revenue":"10","price":"10"}'::jsonb),
 ('55555555-5555-4555-8555-555555555555',3,'valid','{"item_code":"DATE-WHITESPACE","date":"   ","quantity":"1","revenue":"10","price":"10"}'::jsonb),
 ('55555555-5555-4555-8555-555555555555',4,'valid','{"item_code":"DATE-IMPOSSIBLE","date":"2026-02-31","quantity":"1","revenue":"10","price":"10"}'::jsonb),
 ('55555555-5555-4555-8555-555555555555',5,'valid','{"item_code":"DATE-LEAP","date":"2024-02-29","quantity":"1","revenue":"10","price":"10"}'::jsonb),
 ('66666666-6666-4666-8666-666666666666',1,'valid','{"item_code":"STATE-VALID","date":"2024-02-29","quantity":"1","revenue":"10","price":"10"}'::jsonb),
 ('66666666-6666-4666-8666-666666666666',2,'invalid','{"item_code":"STATE-INVALID","date":"2024-02-29","quantity":"1","revenue":"10","price":"10"}'::jsonb),
 ('66666666-6666-4666-8666-666666666666',3,'pending','{"item_code":"STATE-PENDING","date":"2024-02-29","quantity":"1","revenue":"10","price":"10"}'::jsonb),
 ('66666666-6666-4666-8666-666666666666',4,'rejected','{"item_code":"STATE-REJECTED","date":"2024-02-29","quantity":"1","revenue":"10","price":"10"}'::jsonb);

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);

DO $acceptance$
DECLARE
  v_date_result jsonb;
  v_status_result jsonb;
  v_state text;
BEGIN
  v_date_result:=public.calculate_import_job_quality('55555555-5555-4555-8555-555555555555');
  IF v_date_result->>'total_rows'<>'5'
     OR (v_date_result->'components'->>'temporal_referential_integrity')::numeric<>60 THEN
    RAISE EXCEPTION 'whitespace-only and impossible dates must fail while NULL/empty/leap dates remain valid: %',v_date_result;
  END IF;

  v_status_result:=public.calculate_import_job_quality('66666666-6666-4666-8666-666666666666');
  IF v_status_result->>'total_rows'<>'4'
     OR (v_status_result->'components'->>'validity')::numeric<>25
     OR v_status_result->>'label'='excellent' THEN
    RAISE EXCEPTION 'only explicitly valid rows may earn validity points: %',v_status_result;
  END IF;

  IF pg_catalog.has_function_privilege('anon','public.calculate_import_job_quality(uuid)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute import quality RPC';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated','public.calculate_import_job_quality(uuid)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated staff RPC grant is missing';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
  BEGIN
    PERFORM public.calculate_import_job_quality('55555555-5555-4555-8555-555555555555');
    RAISE EXCEPTION 'foreign or unknown auth identity must be denied';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE;
    IF v_state<>'42501' THEN
      RAISE EXCEPTION 'expected authorization failure 42501, got %',v_state;
    END IF;
  END;
END;
$acceptance$;

SELECT 'PASS: PostgreSQL 17 DQS whitespace/date validity, row-status scoring, tenant authorization and RPC grants' AS result;
