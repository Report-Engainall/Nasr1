\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN'; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $f$ SELECT '33333333-3333-4333-8333-333333333333'::uuid $f$;
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE
AS $f$ SELECT '22222222-2222-4222-8222-222222222222'::uuid $f$;
CREATE OR REPLACE FUNCTION public.current_organization_id() RETURNS uuid LANGUAGE sql STABLE
AS $f$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $f$;

CREATE TABLE public.organizations(id uuid PRIMARY KEY,is_active boolean NOT NULL);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,auth_user_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES public.organizations(id),is_active boolean NOT NULL);
CREATE TABLE public.user_roles(profile_id uuid NOT NULL REFERENCES public.profiles(id),role text NOT NULL);
CREATE TABLE public.import_jobs(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),status text NOT NULL,job_type text NOT NULL);
CREATE TABLE public.onyx_snapshots(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),status text NOT NULL,data_quality_score integer NOT NULL,source_import_job_id uuid NOT NULL REFERENCES public.import_jobs(id),row_count integer NOT NULL);
CREATE TABLE public.onyx_snapshot_rows(id uuid PRIMARY KEY,snapshot_id uuid NOT NULL REFERENCES public.onyx_snapshots(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),row_number integer NOT NULL,canonical_key text,row_hash text NOT NULL,status text NOT NULL,data jsonb NOT NULL,errors jsonb,created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp());
CREATE TABLE public.categories(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),name text NOT NULL,is_active boolean NOT NULL);
CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),item_code text NOT NULL,status text NOT NULL,base_price numeric(14,2) NOT NULL,price_wholesale_of_wholesale numeric(14,2) NOT NULL,price_wholesale numeric(14,2) NOT NULL,price_retail numeric(14,2) NOT NULL);
CREATE TABLE public.customers(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),customer_code text NOT NULL,business_name text NOT NULL,contact_name text,phone text,email text,address text,tier text NOT NULL,status text NOT NULL,credit_limit numeric(14,2) NOT NULL DEFAULT 0);
CREATE TABLE public.audit_logs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id uuid NOT NULL,actor_id uuid,action text NOT NULL,entity_type text NOT NULL,entity_id uuid NOT NULL,old_value jsonb NOT NULL,new_value jsonb NOT NULL);

CREATE OR REPLACE FUNCTION public.save_admin_catalog_product(p_product_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql
AS $f$
DECLARE v_id uuid := coalesce(p_product_id,pg_catalog.gen_random_uuid());
BEGIN
  RAISE NOTICE 'P1_TEST_SAVE_ADMIN_PRODUCT item_code=%',p_payload->>'item_code';
  BEGIN
    INSERT INTO public.products(id,organization_id,item_code,status,base_price,price_wholesale_of_wholesale,price_wholesale,price_retail)
    VALUES(v_id,public.current_organization_id(),p_payload->>'item_code',p_payload->>'status',
      (p_payload->>'base_price')::numeric,(p_payload->>'price_wholesale_of_wholesale')::numeric,
      (p_payload->>'price_wholesale')::numeric,(p_payload->>'price_retail')::numeric);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'P1_TEST_SAVE_ADMIN_PRODUCT_FAILURE %',SQLERRM;
    RAISE;
  END;
  RAISE NOTICE 'P1_TEST_SAVE_ADMIN_PRODUCT_INSERTED item_code=%',p_payload->>'item_code';
  RETURN pg_catalog.jsonb_build_object('id',v_id,'status',p_payload->>'status','created',true);
END;
$f$;

\ir ../migrations/20261110210000_enforce_admin_import_snapshot_kind.sql

INSERT INTO public.organizations VALUES('11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.profiles VALUES('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.user_roles VALUES('22222222-2222-4222-8222-222222222222','admin');

INSERT INTO public.import_jobs VALUES
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','completed','unified_import_products'),
('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','completed','unified_import_customers');
INSERT INTO public.onyx_snapshots VALUES
('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','ready',95,'44444444-4444-4444-8444-444444444444',1),
('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','ready',95,'44444444-4444-4444-8444-444444444444',1),
('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','ready',95,'55555555-5555-4555-8555-555555555555',1);
INSERT INTO public.onyx_snapshot_rows(id,snapshot_id,organization_id,row_number,canonical_key,row_hash,status,data)
VALUES
('99999999-9999-4999-8999-999999999991','66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111',1,'000125','hash-complete','valid',
 '{"item_code":"000125","product_name":"أرز بسمتي","unit":"كيس","base_price":"5.00","price_wholesale_of_wholesale":"4.50","price_wholesale":"4.20","price_retail":"6.00"}'::jsonb),
('99999999-9999-4999-8999-999999999992','77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',1,'ITEM-UNPRICED','hash-unpriced','valid',
 '{"item_code":"ITEM-UNPRICED","product_name":"صنف ناقص التسعير","unit":"كرتون","base_price":"5.00","price_wholesale_of_wholesale":"4.50","price_wholesale":"4.20"}'::jsonb),
('99999999-9999-4999-8999-999999999993','88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',1,'C-001','hash-customer','valid',
 '{"customer_code":"C-001","business_name":"مؤسسة اختبار","source_customer_tier":"vip","credit_limit":"90000"}'::jsonb);

DO $acceptance$
DECLARE v_result jsonb; v_replay jsonb; v_message text; v_products integer; v_customers integer;
BEGIN
  BEGIN
    PERFORM public.apply_admin_import_snapshot('66666666-6666-4666-8666-666666666666','customers','wrong-kind-product-snapshot-01');
    RAISE EXCEPTION 'expected product/customer mismatch to be rejected';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message NOT LIKE '%does not match the snapshot source job type%' THEN RAISE EXCEPTION 'unexpected product mismatch: %',v_message; END IF;
  END;

  v_result:=public.apply_admin_import_snapshot('66666666-6666-4666-8666-666666666666','products','product-snapshot-replay-key-001');
  IF v_result->>'created'<>'1' OR v_result->>'rejected'<>'0' OR v_result->>'status'<>'applied' THEN
    RAISE EXCEPTION 'valid product import failed: %',v_result;
  END IF;
  SELECT count(*) INTO v_products FROM public.products;
  IF v_products<>1 OR NOT EXISTS(SELECT 1 FROM public.products WHERE item_code='000125' AND base_price=5 AND price_wholesale_of_wholesale=4.5 AND price_wholesale=4.2 AND price_retail=6) THEN
    RAISE EXCEPTION 'valid product prices were not preserved';
  END IF;
  v_replay:=public.apply_admin_import_snapshot('66666666-6666-4666-8666-666666666666','products','product-snapshot-replay-key-001');
  IF v_replay->>'idempotent_replay'<>'true' THEN RAISE EXCEPTION 'product replay not idempotent'; END IF;

  BEGIN
    PERFORM public.apply_admin_import_snapshot('77777777-7777-4777-8777-777777777777','customers','wrong-kind-unpriced-product-01');
    RAISE EXCEPTION 'expected product/customer mismatch to be rejected';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message NOT LIKE '%does not match the snapshot source job type%' THEN RAISE EXCEPTION 'unexpected unpriced product mismatch: %',v_message; END IF;
  END;

  BEGIN
    PERFORM public.apply_admin_import_snapshot('77777777-7777-4777-8777-777777777777','products','unpriced-product-review-key-001');
    RAISE EXCEPTION 'unpriced product unexpectedly applied';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message NOT LIKE '%no valid rows matched%' THEN RAISE EXCEPTION 'unexpected unpriced product rejection: %',v_message; END IF;
  END;
  SELECT count(*) INTO v_products FROM public.products;
  IF v_products<>1 OR EXISTS(SELECT 1 FROM public.products WHERE item_code='ITEM-UNPRICED') THEN
    RAISE EXCEPTION 'missing tier price created a product or zero fallback';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.onyx_snapshot_rows WHERE snapshot_id='77777777-7777-4777-8777-777777777777' AND status='valid') THEN
    RAISE EXCEPTION 'unpriced source row was not preserved for snapshot review';
  END IF;

  BEGIN
    PERFORM public.apply_admin_import_snapshot('88888888-8888-4888-8888-888888888888','products','wrong-kind-customer-snapshot-01');
    RAISE EXCEPTION 'expected customer/product mismatch to be rejected';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message NOT LIKE '%does not match the snapshot source job type%' THEN RAISE EXCEPTION 'unexpected customer mismatch: %',v_message; END IF;
  END;

  v_result:=public.apply_admin_import_snapshot('88888888-8888-4888-8888-888888888888','customers','customer-snapshot-replay-key-001');
  IF v_result->>'created'<>'1' OR v_result->>'status'<>'applied' THEN RAISE EXCEPTION 'customer import failed: %',v_result; END IF;
  SELECT count(*) INTO v_customers FROM public.customers;
  IF v_customers<>1 OR NOT EXISTS(SELECT 1 FROM public.customers WHERE customer_code='C-001' AND tier='retail' AND status='pending' AND credit_limit=0) THEN
    RAISE EXCEPTION 'customer import accepted source tier/credit or lost pending state';
  END IF;
  v_replay:=public.apply_admin_import_snapshot('88888888-8888-4888-8888-888888888888','customers','customer-snapshot-replay-key-001');
  IF v_replay->>'idempotent_replay'<>'true' THEN RAISE EXCEPTION 'customer replay not idempotent'; END IF;
  SELECT count(*) INTO v_customers FROM public.customers;
  IF v_customers<>1 THEN RAISE EXCEPTION 'customer replay created duplicate'; END IF;
END;
$acceptance$;

SELECT 'PASS: PostgreSQL 17 snapshot kind, price fail-closed, customer pending state and idempotent replay' AS result;
