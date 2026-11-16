\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
END;
$roles$;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;

CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text NOT NULL);
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY,auth_user_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles(
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role text NOT NULL,
  PRIMARY KEY(profile_id,role)
);
CREATE TABLE public.audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,actor_id uuid NOT NULL,
  action text NOT NULL,entity_type text NOT NULL,entity_id uuid NOT NULL,
  old_value jsonb,new_value jsonb,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$function$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.id FROM public.profiles p
   WHERE p.auth_user_id=auth.uid() AND p.is_active=true
   ORDER BY p.id LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_user_roles()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.id=public.current_profile_id()
      AND p.auth_user_id=auth.uid()
      AND p.is_active=true
      AND r.role='admin'
  );
$function$;

-- Minimal canonical implementation matching the existing tenant-locked,
-- self-change-protected, last-admin-protected and audited legacy command.
CREATE OR REPLACE FUNCTION public.set_organization_user_roles(p_profile_id uuid,p_roles text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_target uuid;
  v_role text;
  v_old_roles jsonb;
  v_admin_count integer;
  v_unique_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin role required';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required'; END IF;
  PERFORM 1 FROM public.organizations o WHERE o.id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='organization unavailable'; END IF;
  IF p_profile_id IS NULL OR p_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='self or null role target denied';
  END IF;
  IF p_roles IS NULL OR pg_catalog.cardinality(p_roles)<1 OR pg_catalog.cardinality(p_roles)>6
     OR pg_catalog.array_position(p_roles,NULL::text) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid requested roles';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.unnest(p_roles) AS requested(role)
    WHERE requested.role NOT IN ('admin','manager','staff','accountant','customer','customer_manager')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported role';
  END IF;
  SELECT pg_catalog.count(DISTINCT requested.role)::integer INTO v_unique_count
    FROM pg_catalog.unnest(p_roles) AS requested(role);
  IF v_unique_count<>pg_catalog.cardinality(p_roles) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate roles';
  END IF;
  IF pg_catalog.cardinality(p_roles)>1 AND 'customer'=ANY(p_roles) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer cannot combine with internal roles';
  END IF;

  SELECT p.id INTO v_target FROM public.profiles p
   WHERE p.id=p_profile_id AND p.organization_id=v_org AND p.is_active=true AND p.auth_user_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='profile outside active tenant'; END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(r.role ORDER BY r.role),'[]'::jsonb)
    INTO v_old_roles FROM public.user_roles r WHERE r.profile_id=v_target;
  IF EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_target AND r.role='admin')
     AND NOT ('admin'=ANY(p_roles)) THEN
    SELECT pg_catalog.count(DISTINCT p.id)::integer INTO v_admin_count
      FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.organization_id=v_org AND p.is_active=true AND p.auth_user_id IS NOT NULL AND r.role='admin';
    IF v_admin_count<=1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cannot remove last active administrator'; END IF;
  END IF;

  DELETE FROM public.user_roles WHERE profile_id=v_target;
  FOREACH v_role IN ARRAY p_roles LOOP
    INSERT INTO public.user_roles(profile_id,role) VALUES(v_target,v_role);
  END LOOP;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'user.roles.changed','profile',v_target,v_old_roles,
    pg_catalog.jsonb_build_object('roles',pg_catalog.to_jsonb(p_roles)));
  RETURN pg_catalog.jsonb_build_object('profile_id',v_target,'roles',pg_catalog.to_jsonb(p_roles));
END;
$function$;

INSERT INTO public.organizations(id,name) VALUES
 ('11111111-1111-4111-8111-111111111111','Role revision test tenant'),
 ('12121212-1212-4121-8121-121212121212','Foreign role revision tenant');
INSERT INTO public.profiles(id,auth_user_id,organization_id,is_active) VALUES
 ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222223','33333333-3333-4333-8333-333333333334','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222224','33333333-3333-4333-8333-333333333335','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222225','33333333-3333-4333-8333-121212121212','12121212-1212-4121-8121-121212121212',true);
INSERT INTO public.user_roles(profile_id,role) VALUES
 ('22222222-2222-4222-8222-222222222222','admin'),
 ('22222222-2222-4222-8222-222222222223','staff'),
 ('22222222-2222-4222-8222-222222222224','manager'),
 ('22222222-2222-4222-8222-222222222225','staff');

\ir ../migrations/20261116128000_organization_role_assignment_revision_guard.sql

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $allowed_change$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.set_organization_user_roles_v2(
    '22222222-2222-4222-8222-222222222223',
    ARRAY['staff']::text[],
    ARRAY['customer_manager','staff']::text[]
  );
  IF v_result->>'changed'<>'true'
     OR v_result->'previous_roles'<>'["staff"]'::jsonb
     OR v_result->'roles'<>'["customer_manager","staff"]'::jsonb THEN
    RAISE EXCEPTION 'authorized role change returned an invalid revision result: %',v_result;
  END IF;
END;
$allowed_change$;
RESET ROLE;

DO $allowed_persisted$
DECLARE v_roles text[]; v_audit_count integer;
BEGIN
  SELECT pg_catalog.array_agg(role ORDER BY role) INTO v_roles
    FROM public.user_roles WHERE profile_id='22222222-2222-4222-8222-222222222223';
  SELECT pg_catalog.count(*)::integer INTO v_audit_count FROM public.audit_logs
    WHERE action='user.roles.changed' AND entity_id='22222222-2222-4222-8222-222222222223';
  IF v_roles IS DISTINCT FROM ARRAY['customer_manager','staff']::text[] OR v_audit_count<>1 THEN
    RAISE EXCEPTION 'authorized role write or single audit record was not persisted';
  END IF;
END;
$allowed_persisted$;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $stale_write$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.set_organization_user_roles_v2(
      '22222222-2222-4222-8222-222222222223',
      ARRAY['staff']::text[],
      ARRAY['accountant','staff']::text[]
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'stale role snapshot was accepted'; END IF;
END;
$stale_write$;
RESET ROLE;

DO $stale_preserved$
DECLARE v_roles text[]; v_audit_count integer;
BEGIN
  SELECT pg_catalog.array_agg(role ORDER BY role) INTO v_roles
    FROM public.user_roles WHERE profile_id='22222222-2222-4222-8222-222222222223';
  SELECT pg_catalog.count(*)::integer INTO v_audit_count FROM public.audit_logs
    WHERE action='user.roles.changed' AND entity_id='22222222-2222-4222-8222-222222222223';
  IF v_roles IS DISTINCT FROM ARRAY['customer_manager','staff']::text[] OR v_audit_count<>1 THEN
    RAISE EXCEPTION 'stale request changed roles or created audit noise';
  END IF;
END;
$stale_preserved$;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $no_op$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.set_organization_user_roles_v2(
    '22222222-2222-4222-8222-222222222223',
    ARRAY['customer_manager','staff']::text[],
    ARRAY['staff','customer_manager']::text[]
  );
  IF v_result->>'changed'<>'false' THEN RAISE EXCEPTION 'exact replay was not a no-op: %',v_result; END IF;
END;
$no_op$;
RESET ROLE;

DO $no_op_audit$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.audit_logs
       WHERE action='user.roles.changed' AND entity_id='22222222-2222-4222-8222-222222222223')<>1 THEN
    RAISE EXCEPTION 'no-op replay duplicated the audit record';
  END IF;
END;
$no_op_audit$;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $legacy_denied$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.set_organization_user_roles(
      '22222222-2222-4222-8222-222222222223',ARRAY['accountant','staff']::text[]
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'legacy role command remains executable to authenticated clients'; END IF;
END;
$legacy_denied$;
RESET ROLE;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333335',false);
DO $manager_denied$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.set_organization_user_roles_v2(
      '22222222-2222-4222-8222-222222222223',
      ARRAY['customer_manager','staff']::text[],
      ARRAY['accountant','staff']::text[]
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'manager without role assignment authority changed roles'; END IF;
END;
$manager_denied$;
RESET ROLE;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $tenant_denied$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.set_organization_user_roles_v2(
      '22222222-2222-4222-8222-222222222225',
      ARRAY['staff']::text[],
      ARRAY['accountant']::text[]
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'cross-tenant role assignment was allowed'; END IF;
END;
$tenant_denied$;
RESET ROLE;

SELECT 'PostgreSQL 17 organization role assignment revision guard acceptance: PASS' AS result;
