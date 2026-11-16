\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$roles$;

CREATE SCHEMA auth;

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
CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  business_name text,
  customer_code text NOT NULL
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  order_number text NOT NULL
);
CREATE TABLE public.customer_return_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  order_id uuid NOT NULL,
  request_number text NOT NULL,
  status text NOT NULL,
  reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL
);
CREATE TABLE public.customer_return_request_items (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  return_request_id uuid NOT NULL,
  item_code_snapshot text,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  requested_quantity numeric(15,3) NOT NULL
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.organization_id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active
  ORDER BY p.id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.operational_tasks_can_manage()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.profile_id = p.id
    WHERE p.auth_user_id = auth.uid()
      AND p.is_active
      AND ur.role IN ('admin', 'manager')
  );
$function$;

INSERT INTO public.profiles(id, auth_user_id, organization_id, is_active) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '22222222-2222-4222-8222-222222222222', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '11111111-1111-4111-8111-111111111111', true);
INSERT INTO public.user_roles(profile_id, role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'customer');

INSERT INTO public.customers(id, organization_id, profile_id, business_name, customer_code) VALUES
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'مؤسسة النور', 'C-001'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'مؤسسة خارجية', 'FOREIGN-1');
INSERT INTO public.orders(id, organization_id, customer_id, order_number) VALUES
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'ORD-101'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'ORD-102'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd3', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'ORD-103'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', '22222222-2222-4222-8222-222222222222', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'ORD-FOREIGN'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd5', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'ORD-REJECTED');

INSERT INTO public.customer_return_requests(id, organization_id, customer_id, order_id, request_number, status, reason, notes, created_at) VALUES
  ('10000000-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'RET-101', 'submitted', 'damaged', 'علبة تالفة', '2026-11-17T10:00:00Z'),
  ('10000000-0000-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'RET-102', 'under_review', 'quality', 'قيد فحص الجودة', '2026-11-17T10:00:00Z'),
  ('10000000-0000-4000-8000-000000000103', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3', 'RET-103', 'submitted', 'wrong_item', 'صنف غير صحيح', '2026-11-17T11:00:00Z'),
  ('20000000-0000-4000-8000-000000000201', '22222222-2222-4222-8222-222222222222', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'RET-FOREIGN', 'submitted', 'damaged', 'foreign tenant', '2026-11-17T09:00:00Z'),
  ('10000000-0000-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd5', 'RET-REJECTED', 'rejected', 'other', 'not in open queue', '2026-11-17T12:00:00Z');

INSERT INTO public.customer_return_request_items(id, organization_id, return_request_id, item_code_snapshot, product_name_snapshot, unit_snapshot, requested_quantity) VALUES
  ('30000000-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000101', 'BAN-1', 'موز طازج', 'كرتون', 2.500),
  ('30000000-0000-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000102', 'SUGAR-5', 'سكر أبيض', 'كيس', 1.000),
  ('30000000-0000-4000-8000-000000000103', '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000103', 'OIL-3', 'زيت نباتي', 'لتر', 3.000),
  ('30000000-0000-4000-8000-000000000201', '22222222-2222-4222-8222-222222222222', '20000000-0000-4000-8000-000000000201', 'FOREIGN-SKU', 'منتج خارجي', 'وحدة', 1.000),
  ('30000000-0000-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000104', 'OLD-SKU', 'صنف مغلق', 'وحدة', 1.000);

\ir ../migrations/20261117140000_customer_return_review_queue_cursor_pagination.sql

DO $acl$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.list_customer_return_review_queue_page(integer,timestamp with time zone,uuid,text,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute the customer return review queue RPC';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.list_customer_return_review_queue_page(integer,timestamp with time zone,uuid,text,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated execution grant is missing';
  END IF;
END;
$acl$;

SELECT pg_catalog.set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', false);
SET ROLE authenticated;

DO $acceptance$
DECLARE
  v_first jsonb;
  v_second jsonb;
  v_empty jsonb;
  v_filtered jsonb;
  v_state text;
BEGIN
  v_first := public.list_customer_return_review_queue_page(2, NULL, NULL, NULL, NULL);
  IF (v_first->>'total_count')::integer <> 3
     OR jsonb_array_length(v_first->'items') <> 2
     OR v_first->>'has_more' <> 'true'
     OR v_first->'items'->0->>'request_number' <> 'RET-101'
     OR v_first->'items'->1->>'request_number' <> 'RET-102'
     OR v_first->'next_cursor'->>'id' <> '10000000-0000-4000-8000-000000000102' THEN
    RAISE EXCEPTION 'first page did not return ordered tenant A records and a matching cursor: %', v_first;
  END IF;

  v_second := public.list_customer_return_review_queue_page(
    2,
    (v_first->'next_cursor'->>'created_at')::timestamptz,
    (v_first->'next_cursor'->>'id')::uuid,
    NULL,
    NULL
  );
  IF (v_second->>'total_count')::integer <> 3
     OR jsonb_array_length(v_second->'items') <> 1
     OR v_second->>'has_more' <> 'false'
     OR v_second->'items'->0->>'request_number' <> 'RET-103'
     OR v_second->'next_cursor' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'second page did not return the remaining row and terminal cursor: %', v_second;
  END IF;

  v_empty := public.list_customer_return_review_queue_page(
    2, '2026-11-18T00:00:00Z', 'ffffffff-ffff-4fff-8fff-ffffffffffff', NULL, NULL
  );
  IF (v_empty->>'total_count')::integer <> 3
     OR jsonb_array_length(v_empty->'items') <> 0
     OR v_empty->>'has_more' <> 'false'
     OR v_empty->'next_cursor' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'an empty cursor page must retain full filtered total without a next cursor: %', v_empty;
  END IF;

  v_filtered := public.list_customer_return_review_queue_page(50, NULL, NULL, 'موز', NULL);
  IF (v_filtered->>'total_count')::integer <> 1
     OR v_filtered->'items'->0->>'request_number' <> 'RET-101' THEN
    RAISE EXCEPTION 'Arabic product-name search did not return the matching request: %', v_filtered;
  END IF;

  v_filtered := public.list_customer_return_review_queue_page(50, NULL, NULL, 'BAN-1', NULL);
  IF (v_filtered->>'total_count')::integer <> 1
     OR v_filtered->'items'->0->>'request_number' <> 'RET-101' THEN
    RAISE EXCEPTION 'product-code search did not return the matching request: %', v_filtered;
  END IF;

  v_filtered := public.list_customer_return_review_queue_page(50, NULL, NULL, 'مؤسسة النور', NULL);
  IF (v_filtered->>'total_count')::integer <> 3 THEN
    RAISE EXCEPTION 'customer-name search did not return all matching tenant requests: %', v_filtered;
  END IF;

  v_filtered := public.list_customer_return_review_queue_page(50, NULL, NULL, 'علبة تالفة', NULL);
  IF (v_filtered->>'total_count')::integer <> 1 THEN
    RAISE EXCEPTION 'customer-note search did not return the matching request: %', v_filtered;
  END IF;

  v_filtered := public.list_customer_return_review_queue_page(50, NULL, NULL, NULL, 'under_review');
  IF (v_filtered->>'total_count')::integer <> 1
     OR v_filtered->'items'->0->>'request_number' <> 'RET-102' THEN
    RAISE EXCEPTION 'status filtering did not isolate under-review requests: %', v_filtered;
  END IF;

  v_filtered := public.list_customer_return_review_queue_page(50, NULL, NULL, 'ORD-103', 'submitted');
  IF (v_filtered->>'total_count')::integer <> 1
     OR v_filtered->'items'->0->>'request_number' <> 'RET-103' THEN
    RAISE EXCEPTION 'order-number search and submitted status filter did not combine: %', v_filtered;
  END IF;

  BEGIN
    PERFORM public.list_customer_return_review_queue_page(101, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'page size above 100 unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '22023' THEN RAISE EXCEPTION 'expected invalid argument state 22023, got %', v_state; END IF;
  END;

  BEGIN
    PERFORM public.list_customer_return_review_queue_page(10, NULL, '10000000-0000-4000-8000-000000000101', NULL, NULL);
    RAISE EXCEPTION 'incomplete cursor unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '22023' THEN RAISE EXCEPTION 'expected incomplete-cursor state 22023, got %', v_state; END IF;
  END;

  BEGIN
    PERFORM public.list_customer_return_review_queue_page(10, NULL, NULL, NULL, 'rejected');
    RAISE EXCEPTION 'unsupported queue status unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '22023' THEN RAISE EXCEPTION 'expected unsupported-status state 22023, got %', v_state; END IF;
  END;
END;
$acceptance$;

RESET ROLE;
SELECT pg_catalog.set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', false);
SET ROLE authenticated;

DO $denial$
DECLARE
  v_state text;
BEGIN
  BEGIN
    PERFORM public.list_customer_return_review_queue_page(50, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'ordinary customer unexpectedly read the return review queue';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '42501' THEN RAISE EXCEPTION 'expected role denial 42501, got %', v_state; END IF;
  END;
END;
$denial$;

RESET ROLE;
SELECT 'PASS: PostgreSQL 17 customer return review cursor paging, server search/status filters, tenant isolation, role boundary, and empty-page totals' AS result;
