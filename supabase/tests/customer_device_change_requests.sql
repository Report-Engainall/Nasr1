\set ON_ERROR_STOP on

DO $version_guard$
DECLARE v integer := pg_catalog.current_setting('server_version_num')::integer;
BEGIN
  IF v < 170000 OR v >= 180000 THEN
    RAISE EXCEPTION 'This acceptance requires PostgreSQL 17, found %', v;
  END IF;
END
$version_guard$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  full_name text NOT NULL,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role text NOT NULL,
  PRIMARY KEY(profile_id,role)
);
CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'approved'
);
CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip inet
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$function$;
CREATE OR REPLACE FUNCTION public.current_auth_session_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.session_id',true),'')::uuid
$function$;
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.id
  FROM public.profiles p
  WHERE p.auth_user_id=auth.uid() AND p.is_active
    AND EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id=public.current_auth_session_id()
        AND s.user_id=auth.uid()
        AND (s.not_after IS NULL OR s.not_after>pg_catalog.now())
    )
  ORDER BY p.created_at,p.id LIMIT 1
$function$;
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.organization_id FROM public.profiles p
  WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active
  LIMIT 1
$function$;
CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT c.id FROM public.customers c
  WHERE c.profile_id=public.current_profile_id()
    AND c.organization_id=public.current_organization_id()
  LIMIT 1
$function$;
CREATE OR REPLACE FUNCTION public.can_manage_user_roles()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id=public.current_profile_id() AND r.role='admin'
  )
$function$;

GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
GRANT USAGE ON SCHEMA public TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.test_my_live_session_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT pg_catalog.count(*)::integer FROM auth.sessions WHERE user_id=auth.uid()
$function$;
GRANT EXECUTE ON FUNCTION public.test_my_live_session_count() TO authenticated;

INSERT INTO public.organizations(id) VALUES
 ('a0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000002');

INSERT INTO public.profiles(id,auth_user_id,organization_id,full_name,email) VALUES
 ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Admin A','admin-a@example.test'),
 ('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Manager A','manager-a@example.test'),
 ('a1000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','Customer A','customer-a@example.test'),
 ('a1000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','Mixed Role','mixed-a@example.test'),
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','Admin B','admin-b@example.test'),
 ('b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','Customer B','customer-b@example.test');

INSERT INTO public.user_roles(profile_id,role) VALUES
 ('a1000000-0000-4000-8000-000000000001','admin'),
 ('a1000000-0000-4000-8000-000000000002','manager'),
 ('a1000000-0000-4000-8000-000000000003','customer'),
 ('a1000000-0000-4000-8000-000000000004','customer'),
 ('a1000000-0000-4000-8000-000000000004','staff'),
 ('b1000000-0000-4000-8000-000000000001','admin'),
 ('b1000000-0000-4000-8000-000000000002','customer');

INSERT INTO public.customers(id,organization_id,profile_id) VALUES
 ('a3000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003'),
 ('b3000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002');

INSERT INTO auth.sessions(id,user_id,created_at,not_after,user_agent) VALUES
 ('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003',now()-interval '12 days',NULL,'Old Android device'),
 ('a4000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000003',now()-interval '5 days',NULL,'Old desktop'),
 ('a4000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003',now(),NULL,'New Android device'),
 ('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',now(),NULL,'Admin A browser'),
 ('a5000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',now(),NULL,'Manager A browser'),
 ('a5000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000004',now(),NULL,'Mixed-role browser'),
 ('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002',now()-interval '4 days',NULL,'Customer B old device'),
 ('b4000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002',now(),NULL,'Customer B new device'),
 ('b5000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',now(),NULL,'Admin B browser');

\ir ../migrations/20261117180000_customer_device_change_requests.sql

-- Customer A submits from the new device. Creation must not revoke the old devices.
SELECT pg_catalog.set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','a4000000-0000-4000-8000-000000000003',false);
SET ROLE authenticated;
SELECT (public.request_customer_device_change(
 'a6000000-0000-4000-8000-000000000001','Replaced my phone and need to authorize this new device'
)->>'id') AS customer_a_request_id \gset
SELECT pg_catalog.set_config('test.customer_a_request_id', :'customer_a_request_id', false);
DO $customer_create$
DECLARE v_count integer; v_result jsonb; v_payload jsonb;
BEGIN
  SELECT public.test_my_live_session_count() INTO v_count;
  IF v_count<>3 THEN RAISE EXCEPTION 'submission revoked an old device; expected 3 live sessions, got %',v_count; END IF;

  v_result:=public.request_customer_device_change(
    'a6000000-0000-4000-8000-000000000001','Replaced my phone and need to authorize this new device'
  );
  IF v_result->>'replayed'<>'true' THEN RAISE EXCEPTION 'exact request retry did not replay: %',v_result; END IF;

  BEGIN
    PERFORM public.request_customer_device_change(
      'a6000000-0000-4000-8000-000000000001','A different payload using the old idempotency key'
    );
    RAISE EXCEPTION 'changed payload reused the request idempotency key';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.request_customer_device_change(
      'a6000000-0000-4000-8000-000000000002','Another pending device replacement for the same customer'
    );
    RAISE EXCEPTION 'a second pending customer request was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  v_payload:=public.fetch_my_customer_device_change_requests(20);
  IF jsonb_array_length(v_payload->'items')<>1 THEN RAISE EXCEPTION 'customer history returned wrong row count: %',v_payload; END IF;
  IF (v_payload->'items'->0) ?| ARRAY['requested_session_id','auth_user_id','unlinked_session_ids'] THEN
    RAISE EXCEPTION 'customer request history exposed internal session identifiers: %',v_payload;
  END IF;

  BEGIN
    PERFORM count(*) FROM public.customer_device_change_requests;
    RAISE EXCEPTION 'authenticated customer directly read the request table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$customer_create$;
RESET ROLE;

-- A staff+customer hybrid cannot use the customer-only change workflow.
SELECT pg_catalog.set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000004',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','a5000000-0000-4000-8000-000000000003',false);
SET ROLE authenticated;
DO $mixed_role_denial$
BEGIN
  BEGIN
    PERFORM public.request_customer_device_change(
      'a6000000-0000-4000-8000-000000000003','This should not pass for a mixed role identity'
    );
    RAISE EXCEPTION 'mixed customer/staff account was allowed to request customer device change';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$mixed_role_denial$;
RESET ROLE;

-- A pending customer account must not be allowed to request device replacement.
UPDATE public.customers SET status='pending'
WHERE id='b3000000-0000-4000-8000-000000000002';
SELECT pg_catalog.set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','b4000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $unapproved_customer_denial$
BEGIN
  BEGIN
    PERFORM public.request_customer_device_change(
      'b6000000-0000-4000-8000-000000000002','A pending account must not request a device change'
    );
    RAISE EXCEPTION 'pending customer account was allowed to request device change';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$unapproved_customer_denial$;
RESET ROLE;
UPDATE public.customers SET status='approved'
WHERE id='b3000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT (public.request_customer_device_change(
 'b6000000-0000-4000-8000-000000000001','Customer B replaced a phone and requests device approval'
)->>'id') AS customer_b_request_id \gset
SELECT pg_catalog.set_config('test.customer_b_request_id', :'customer_b_request_id', false);
RESET ROLE;

-- Manager cannot operate the administrator-only review queue. Admin A cannot see
-- or decide another tenant's customer B request.
SELECT pg_catalog.set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000002',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','a5000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $manager_denial$
BEGIN
  BEGIN
    PERFORM public.fetch_customer_device_change_requests('all',100);
    RAISE EXCEPTION 'manager was allowed to inspect the admin-only device review queue';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$manager_denial$;
RESET ROLE;

SELECT pg_catalog.set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','a5000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
DO $admin_queue$
DECLARE v_data jsonb; v_b uuid := pg_catalog.current_setting('test.customer_b_request_id')::uuid;
BEGIN
  v_data:=public.fetch_customer_device_change_requests('all',100);
  IF jsonb_array_length(v_data->'items')<>1 THEN
    RAISE EXCEPTION 'admin A queue crossed tenant boundary or lost its row: %',v_data;
  END IF;
  IF v_data::text LIKE '%Customer B%' OR v_data::text LIKE '%'||v_b::text||'%' THEN
    RAISE EXCEPTION 'admin A queue exposed tenant B request: %',v_data;
  END IF;
  BEGIN
    PERFORM public.review_customer_device_change_request(
      v_b,'approve','Cross tenant review must be denied',
      'a7000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'admin A reviewed a tenant B device request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

END
$admin_queue$;
RESET ROLE;
-- Administrative review must revalidate that the customer remains approved.
UPDATE public.customers SET status='pending'
WHERE id='a3000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $no_longer_approved_customer$
BEGIN
  BEGIN
    PERFORM public.review_customer_device_change_request(
      pg_catalog.current_setting('test.customer_a_request_id')::uuid,
      'approve',
      'The customer account is no longer approved',
      'a7000000-0000-4000-8000-000000000006'
    );
    RAISE EXCEPTION 'administrator approved a device for a pending customer account';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$no_longer_approved_customer$;
RESET ROLE;
UPDATE public.customers SET status='approved'
WHERE id='a3000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT (public.review_customer_device_change_request(
 pg_catalog.current_setting('test.customer_a_request_id')::uuid,'approve','Customer identity and new device were verified',
 'a7000000-0000-4000-8000-000000000003'
)->>'status') AS approval_status \gset
SELECT pg_catalog.set_config('test.approval_status', :'approval_status', false);
RESET ROLE;
DO $approval$
DECLARE v_old integer; v_new integer; v_replay jsonb;
BEGIN
  IF pg_catalog.current_setting('test.approval_status')<>'approved' THEN RAISE EXCEPTION 'new device approval failed'; END IF;
  SELECT count(*) INTO v_old FROM auth.sessions
   WHERE id IN ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_new FROM auth.sessions
   WHERE id='a4000000-0000-4000-8000-000000000003'
     AND user_id='a2000000-0000-4000-8000-000000000003';
  IF v_old<>0 OR v_new<>1 THEN
    RAISE EXCEPTION 'approval did not retain new device and remove prior sessions (old %, new %)',v_old,v_new;
  END IF;

  v_replay:=public.review_customer_device_change_request(
    pg_catalog.current_setting('test.customer_a_request_id')::uuid,'approve','Customer identity and new device were verified',
    'a7000000-0000-4000-8000-000000000003'
  );
  IF v_replay->>'replayed'<>'true' THEN RAISE EXCEPTION 'exact decision retry did not replay: %',v_replay; END IF;
  BEGIN
    PERFORM public.review_customer_device_change_request(
      pg_catalog.current_setting('test.customer_a_request_id')::uuid,'approve','Altered approval reason',
      'a7000000-0000-4000-8000-000000000003'
    );
    RAISE EXCEPTION 'changed approval payload reused its decision key';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$approval$;
RESET ROLE;

-- A later rejected request unlinks only the device that submitted it.
INSERT INTO auth.sessions(id,user_id,created_at,not_after,user_agent)
VALUES('a4000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000003',now(),NULL,'Second new device');
SELECT pg_catalog.set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','a4000000-0000-4000-8000-000000000004',false);
SET ROLE authenticated;
SELECT (public.request_customer_device_change(
 'a6000000-0000-4000-8000-000000000004','I need to replace the device that I just registered'
)->>'id') AS rejected_request_id \gset
SELECT pg_catalog.set_config('test.rejected_request_id', :'rejected_request_id', false);
RESET ROLE;
SELECT pg_catalog.set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','a5000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
SELECT (public.review_customer_device_change_request(
 :'rejected_request_id'::uuid,'reject','The submitted device could not be verified',
 'a7000000-0000-4000-8000-000000000004'
)->>'status') AS rejection_status \gset
SELECT pg_catalog.set_config('test.rejection_status', :'rejection_status', false);
RESET ROLE;
DO $rejection$
DECLARE v_old integer; v_new integer; v_status text;
BEGIN
  IF pg_catalog.current_setting('test.rejection_status')<>'rejected' THEN RAISE EXCEPTION 'rejection did not return rejected status'; END IF;
  SELECT count(*) INTO v_old FROM auth.sessions
   WHERE id='a4000000-0000-4000-8000-000000000003'
     AND user_id='a2000000-0000-4000-8000-000000000003';
  SELECT count(*) INTO v_new FROM auth.sessions
   WHERE id='a4000000-0000-4000-8000-000000000004';
  IF v_old<>1 OR v_new<>0 THEN
    RAISE EXCEPTION 'rejection did not preserve trusted session and unlink requested device (trusted %, requested %)',v_old,v_new;
  END IF;
  SELECT status INTO v_status FROM public.customer_device_change_requests WHERE id=pg_catalog.current_setting('test.rejected_request_id')::uuid;
  IF v_status<>'rejected' THEN RAISE EXCEPTION 'rejection did not persist terminal request state'; END IF;
END
$rejection$;
RESET ROLE;

-- If the requested new session expired before approval, the old trusted session
-- remains untouched and the request transitions to expired instead of approved.
INSERT INTO auth.sessions(id,user_id,created_at,not_after,user_agent)
VALUES('a4000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000003',now(),NULL,'Expiring device');
SELECT pg_catalog.set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','a4000000-0000-4000-8000-000000000005',false);
SET ROLE authenticated;
SELECT (public.request_customer_device_change(
 'a6000000-0000-4000-8000-000000000005','I need this device checked before trusting it'
)->>'id') AS expired_request_id \gset
SELECT pg_catalog.set_config('test.expired_request_id', :'expired_request_id', false);
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 second'
WHERE id='a4000000-0000-4000-8000-000000000005';
SELECT pg_catalog.set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','a5000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
SELECT (public.review_customer_device_change_request(
 :'expired_request_id'::uuid,'approve','Requested session expired before administrative review',
 'a7000000-0000-4000-8000-000000000005'
)->>'status') AS expired_status \gset
SELECT pg_catalog.set_config('test.expired_status', :'expired_status', false);
RESET ROLE;
DO $expired$
DECLARE v_trusted integer; v_status text;
BEGIN
  IF pg_catalog.current_setting('test.expired_status')<>'expired' THEN RAISE EXCEPTION 'expired device request was not marked expired'; END IF;
  SELECT count(*) INTO v_trusted FROM auth.sessions
   WHERE id='a4000000-0000-4000-8000-000000000003';
  SELECT status INTO v_status FROM public.customer_device_change_requests
   WHERE id=pg_catalog.current_setting('test.expired_request_id')::uuid;
  IF v_trusted<>1 OR v_status<>'expired' THEN
    RAISE EXCEPTION 'expired device review modified trusted session or did not persist expired status';
  END IF;
END
$expired$;
RESET ROLE;

-- Customer B cannot read Customer A's request history, even in the same SQL database.
SELECT pg_catalog.set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','b4000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $customer_b_scope$
DECLARE v_data jsonb;
BEGIN
  v_data:=public.fetch_my_customer_device_change_requests(20);
  IF jsonb_array_length(v_data->'items')<>1
     OR v_data::text LIKE '%Customer A%' THEN
    RAISE EXCEPTION 'customer B history crossed customer/tenant boundary: %',v_data;
  END IF;
END
$customer_b_scope$;
RESET ROLE;

-- Source and event history cannot be rewritten, even by a table owner.
DO $append_only$
DECLARE v_request uuid := pg_catalog.current_setting('test.customer_a_request_id')::uuid; v_event uuid;
BEGIN
  BEGIN
    UPDATE public.customer_device_change_requests SET reason='rewritten source'
    WHERE id=v_request;
    RAISE EXCEPTION 'request source was mutable';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  SELECT id INTO v_event FROM public.customer_device_change_request_events
  WHERE request_id=v_request ORDER BY created_at,id LIMIT 1;
  BEGIN
    UPDATE public.customer_device_change_request_events SET event_payload='{}'::jsonb
    WHERE id=v_event;
    RAISE EXCEPTION 'event history was mutable';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END
$append_only$;

DO $audit_acceptance$
DECLARE v_requested integer; v_approved integer; v_rejected integer; v_expired integer;
BEGIN
  SELECT count(*) INTO v_requested FROM public.audit_logs
   WHERE action='auth.customer_device_change.requested';
  SELECT count(*) INTO v_approved FROM public.audit_logs
   WHERE action='auth.customer_device_change.approved';
  SELECT count(*) INTO v_rejected FROM public.audit_logs
   WHERE action='auth.customer_device_change.rejected';
  SELECT count(*) INTO v_expired FROM public.audit_logs
   WHERE action='auth.customer_device_change.expired';
  IF v_requested<>4 OR v_approved<>1 OR v_rejected<>1 OR v_expired<>1 THEN
    RAISE EXCEPTION 'device change audit event counts are incorrect (request %, approve %, reject %, expired %)',
      v_requested,v_approved,v_rejected,v_expired;
  END IF;
END
$audit_acceptance$;

SELECT 'PASS: PostgreSQL 17 customer device change workflow; current-session source binding; no unlink at request time; request and decision idempotency; maker/checker; approval/rejection/expiry session transitions; customer and tenant isolation; role denial; immutable requests/events; append-only audit' AS result;
