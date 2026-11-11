\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN'; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE public.profiles(id uuid PRIMARY KEY,auth_user_id uuid NOT NULL,organization_id uuid NOT NULL,is_active boolean NOT NULL);
CREATE TABLE public.user_roles(profile_id uuid NOT NULL,role text NOT NULL);
CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL,item_code text NOT NULL,unit text NOT NULL);
CREATE TABLE public.orders(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
CREATE TABLE public.order_items(id uuid PRIMARY KEY,order_id uuid NOT NULL,product_id uuid NOT NULL,quantity numeric(15,3) NOT NULL);
CREATE TABLE public.warehouses(id uuid PRIMARY KEY,organization_id uuid NOT NULL,is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.inventory_balances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL,warehouse_id uuid NOT NULL,quantity_available numeric(18,3) NOT NULL,reorder_point numeric(18,3) NOT NULL,updated_at timestamptz NOT NULL);
CREATE TABLE public.inventory_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL,warehouse_id uuid NOT NULL,movement_type text NOT NULL,quantity numeric(18,3) NOT NULL,reference_type text NOT NULL,reference_id uuid NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE public.purchase_orders(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL,submitted_at timestamptz,updated_at timestamptz NOT NULL);
CREATE TABLE public.purchase_order_items(id uuid PRIMARY KEY,organization_id uuid NOT NULL,purchase_order_id uuid NOT NULL,product_id uuid NOT NULL,unit_snapshot text NOT NULL,quantity_ordered numeric(18,3) NOT NULL,quantity_received numeric(18,3) NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE public.purchase_receipts(id uuid PRIMARY KEY,organization_id uuid NOT NULL,purchase_order_id uuid NOT NULL,received_at timestamptz NOT NULL);
CREATE TABLE public.purchase_receipt_items(id uuid PRIMARY KEY,organization_id uuid NOT NULL,receipt_id uuid NOT NULL,product_id uuid NOT NULL,quantity_received numeric(18,3) NOT NULL);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$function$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT p.id FROM public.profiles p
   WHERE p.auth_user_id=auth.uid() AND p.is_active
   ORDER BY p.id LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT auth.uid() IS NOT NULL;
$function$;

INSERT INTO public.profiles VALUES
 ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.user_roles VALUES('22222222-2222-4222-8222-222222222222','admin');

\ir ../migrations/20261111233835_inventory_replenishment_shipment_sales_reconciliation.sql

INSERT INTO public.warehouses(id,organization_id,is_active) VALUES
 ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',true),
 ('44444444-4444-4444-8444-444444444445','12121212-1212-4121-8121-121212121212',true);
INSERT INTO public.products(id,organization_id,status,item_code,unit) VALUES
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','active','SKU-001','EA'),
 ('55555555-5555-4555-8555-555555555556','12121212-1212-4121-8121-121212121212','active','FOREIGN-001','EA');
INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_available,reorder_point,updated_at)
VALUES('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444',5,20,now()-interval '2 days');

INSERT INTO public.orders(id,organization_id,status,created_at,updated_at)
VALUES('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','shipped',now()-interval '200 days',now()-interval '50 days');
INSERT INTO public.order_items(id,order_id,product_id,quantity)
VALUES('66666666-6666-4666-8666-666666666667','66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555',30);
INSERT INTO public.inventory_movements(id,product_id,warehouse_id,movement_type,quantity,reference_type,reference_id,created_at)
VALUES('77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','sale',-30,'order','66666666-6666-4666-8666-666666666666',now()-interval '50 days');

INSERT INTO public.purchase_orders(id,organization_id,status,submitted_at,updated_at) VALUES
 ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','partially_received',now()-interval '15 days',now()-interval '5 days'),
 ('88888888-8888-4888-8888-888888888889','11111111-1111-4111-8111-111111111111','draft',NULL,now()-interval '2 days'),
 ('88888888-8888-4888-8888-888888888890','11111111-1111-4111-8111-111111111111','cancelled',now()-interval '10 days',now()-interval '9 days'),
 ('88888888-8888-4888-8888-888888888891','11111111-1111-4111-8111-111111111111','submitted',now()-interval '10 days',now()-interval '4 days');
INSERT INTO public.purchase_order_items(id,organization_id,purchase_order_id,product_id,unit_snapshot,quantity_ordered,quantity_received,created_at) VALUES
 ('99999999-9999-4999-8999-999999999991','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888','55555555-5555-4555-8555-555555555555','EA',15,5,now()-interval '15 days'),
 ('99999999-9999-4999-8999-999999999992','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888889','55555555-5555-4555-8555-555555555555','EA',100,0,now()-interval '2 days'),
 ('99999999-9999-4999-8999-999999999993','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888890','55555555-5555-4555-8555-555555555555','EA',50,0,now()-interval '10 days'),
 ('99999999-9999-4999-8999-999999999994','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888891','55555555-5555-4555-8555-555555555555','EA',5,5,now()-interval '10 days');
INSERT INTO public.purchase_receipts(id,organization_id,purchase_order_id,received_at)
VALUES('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA','11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888',now()-interval '5 days');
INSERT INTO public.purchase_receipt_items(id,organization_id,receipt_id,product_id,quantity_received)
VALUES('BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB','11111111-1111-4111-8111-111111111111','AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA','55555555-5555-4555-8555-555555555555',5);

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);

DO $acceptance$
DECLARE
  v_as_of timestamptz:=pg_catalog.now();
  v_from date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date-91;
  v_to date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_result jsonb;
  v_metric jsonb;
  v_sales numeric;
  v_state text;
BEGIN
  v_result:=public.get_inventory_intelligence_aggregate(v_from,v_to,v_as_of);
  IF v_result->>'status'<>'OK'
     OR v_result->>'sideEffects'<>'NONE'
     OR (v_result->>'totalProducts')::integer<>1
     OR (v_result->>'returnedProducts')::integer<>1 THEN
    RAISE EXCEPTION 'tenant-scoped complete inventory result failed: %',v_result;
  END IF;
  v_metric:=v_result->'replenishmentProducts'->0;
  IF (v_metric->'soldQuantityWindow'->>'value')::numeric<>30
     OR v_metric->'soldQuantityWindow'->>'status'<>'VERIFIED' THEN
    RAISE EXCEPTION 'shipment movement timestamp must count an older-created shipped order in the 91-day sales window: %',v_metric;
  END IF;
  IF (v_metric->'incomingPurchaseQuantity'->>'value')::numeric<>10
     OR v_metric->'incomingPurchaseQuantity'->>'status'<>'VERIFIED' THEN
    RAISE EXCEPTION 'only the submitted/partially received matching-UOM remainder must count: %',v_metric->'incomingPurchaseQuantity';
  END IF;
  IF (v_metric->'supplierLeadTimeDays'->>'value')::numeric<>10
     OR v_metric->'supplierLeadTimeDays'->>'status'<>'VERIFIED' THEN
    RAISE EXCEPTION 'lead-time must use actual submitted-to-received evidence: %',v_metric->'supplierLeadTimeDays';
  END IF;
  IF (v_metric->'availableToPromise'->>'value')::numeric<>5
     OR (v_metric->'reorderPoint'->>'value')::numeric<>20 THEN
    RAISE EXCEPTION 'persisted available and reorder balances were not preserved: %',v_metric;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_result->'evidenceRecords') e
    WHERE e->>'id'='sales-window:55555555-5555-4555-8555-555555555555'
      AND e->>'status'='VERIFIED'
  ) THEN RAISE EXCEPTION 'verified sales evidence record is missing'; END IF;

  -- A shipped order without any sale movement invalidates (withholds) total sales velocity.
  INSERT INTO public.orders(id,organization_id,status,created_at,updated_at)
  VALUES('CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC','11111111-1111-4111-8111-111111111111','shipped',now()-interval '10 days',now()-interval '10 days');
  INSERT INTO public.order_items(id,order_id,product_id,quantity)
  VALUES('CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCD','CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC','55555555-5555-4555-8555-555555555555',7);
  v_result:=public.get_inventory_intelligence_aggregate(v_from,v_to,v_as_of);
  v_metric:=v_result->'replenishmentProducts'->0->'soldQuantityWindow';
  IF v_metric->>'status'<>'NEEDS_REVIEW' OR v_metric->'value'<>'null'::jsonb THEN
    RAISE EXCEPTION 'unmatched shipped order must withhold sale metric: %',v_metric;
  END IF;

  -- A non-reconciling sale quantity also withholds the metric; exact reconciliation restores it.
  INSERT INTO public.inventory_movements(id,product_id,warehouse_id,movement_type,quantity,reference_type,reference_id,created_at)
  VALUES('DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD','55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','sale',-6,'order','CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC',now()-interval '5 days');
  v_result:=public.get_inventory_intelligence_aggregate(v_from,v_to,v_as_of);
  v_metric:=v_result->'replenishmentProducts'->0->'soldQuantityWindow';
  IF v_metric->>'status'<>'NEEDS_REVIEW' OR v_metric->'value'<>'null'::jsonb THEN
    RAISE EXCEPTION 'mismatched sale movement must withhold sale metric: %',v_metric;
  END IF;

  UPDATE public.inventory_movements SET quantity=-7
   WHERE id='DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD';
  v_result:=public.get_inventory_intelligence_aggregate(v_from,v_to,v_as_of);
  v_metric:=v_result->'replenishmentProducts'->0->'soldQuantityWindow';
  IF (v_metric->>'value')::numeric<>37 OR v_metric->>'status'<>'VERIFIED' THEN
    RAISE EXCEPTION 'sales metric should recover after exact movement reconciliation: %',v_metric;
  END IF;

  -- Any open PO line with a different product UOM withholds incoming quantity, never zero-fills it.
  INSERT INTO public.purchase_orders(id,organization_id,status,submitted_at,updated_at)
  VALUES('EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE','11111111-1111-4111-8111-111111111111','submitted',now()-interval '5 days',now()-interval '1 day');
  INSERT INTO public.purchase_order_items(id,organization_id,purchase_order_id,product_id,unit_snapshot,quantity_ordered,quantity_received,created_at)
  VALUES('EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEF','11111111-1111-4111-8111-111111111111','EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE','55555555-5555-4555-8555-555555555555','CASE',3,0,now()-interval '5 days');
  v_result:=public.get_inventory_intelligence_aggregate(v_from,v_to,v_as_of);
  v_metric:=v_result->'replenishmentProducts'->0->'incomingPurchaseQuantity';
  IF v_metric->>'status'<>'NEEDS_REVIEW' OR v_metric->'value'<>'null'::jsonb THEN
    RAISE EXCEPTION 'incoming quantity with UOM mismatch must be withheld: %',v_metric;
  END IF;

  -- Unknown/foreign identities are rejected, not silently scoped to an arbitrary profile.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
  BEGIN
    PERFORM public.get_inventory_intelligence_aggregate(v_from,v_to,v_as_of);
    RAISE EXCEPTION 'unknown auth identity unexpectedly read inventory intelligence';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE;
    IF v_state<>'42501' THEN
      RAISE EXCEPTION 'expected inventory authorization denial 42501; got %',v_state;
    END IF;
  END;
END;
$acceptance$;

DO $acl$
BEGIN
  IF pg_catalog.has_function_privilege('anon','public.get_inventory_intelligence_aggregate(date,date,timestamptz)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute inventory intelligence RPC';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated','public.get_inventory_intelligence_aggregate(date,date,timestamptz)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated finance RPC grant is missing';
  END IF;
END;
$acl$;

SELECT 'PASS: PostgreSQL 17 shipment-time sales reconciliation, missing/mismatched movement fail-closed, open PO/UOM, lead time, tenant and ACL acceptance' AS result;
