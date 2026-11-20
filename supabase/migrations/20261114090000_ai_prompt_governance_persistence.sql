-- AGH-AI-PROMPT-GOVERNANCE-001
-- Tenant-scoped immutable prompt versions, four-eyes lifecycle and append-only audit.
-- No default prompt or demo records are inserted by this migration.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.ai_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  prompt_key text NOT NULL
    CHECK (prompt_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
  content text NOT NULL
    CHECK (char_length(content) BETWEEN 16 AND 8000 AND btrim(content) = content),
  content_sha256 text NOT NULL
    CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED')),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  submitted_at timestamptz,
  approved_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  rejected_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rejected_at timestamptz,
  decision_reason text,
  activated_at timestamptz,
  deactivated_at timestamptz,
  retired_at timestamptz,
  UNIQUE (organization_id, prompt_key, version)
);

CREATE INDEX ai_prompt_versions_org_key_created_idx
  ON public.ai_prompt_versions(organization_id, prompt_key, created_at DESC);
CREATE INDEX ai_prompt_versions_org_status_created_idx
  ON public.ai_prompt_versions(organization_id, status, created_at DESC);
CREATE UNIQUE INDEX ai_prompt_versions_one_active_per_key_uidx
  ON public.ai_prompt_versions(organization_id, prompt_key)
  WHERE status = 'ACTIVE';

CREATE TABLE public.ai_prompt_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  prompt_version_id uuid NOT NULL REFERENCES public.ai_prompt_versions(id) ON DELETE RESTRICT,
  prompt_key text NOT NULL CHECK (prompt_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
  command_id uuid NOT NULL,
  action text NOT NULL
    CHECK (action IN ('CREATED','SUBMITTED_FOR_APPROVAL','APPROVED','REJECTED','ACTIVATED','DEACTIVATED','RETIRED')),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  previous_status text CHECK (previous_status IS NULL OR previous_status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED')),
  next_status text NOT NULL CHECK (next_status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED')),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (organization_id, command_id, action)
);

CREATE INDEX ai_prompt_audit_org_version_time_idx
  ON public.ai_prompt_audit_events(organization_id, prompt_version_id, occurred_at DESC);
CREATE INDEX ai_prompt_audit_org_time_idx
  ON public.ai_prompt_audit_events(organization_id, occurred_at DESC);

ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_prompt_versions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ai_prompt_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ai_prompt_versions TO authenticated;
GRANT SELECT ON TABLE public.ai_prompt_audit_events TO authenticated;

CREATE POLICY ai_prompt_versions_admin_same_org_read
  ON public.ai_prompt_versions FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.current_profile_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id = p.id
      WHERE p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.organization_id = public.current_organization_id()
        AND p.is_active = true
        AND r.role = 'admin'
    )
  );

CREATE POLICY ai_prompt_audit_admin_same_org_read
  ON public.ai_prompt_audit_events FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.current_profile_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id = p.id
      WHERE p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.organization_id = public.current_organization_id()
        AND p.is_active = true
        AND r.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.guard_ai_prompt_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt versions cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.prompt_key IS DISTINCT FROM OLD.prompt_key
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.created_by_profile_id IS DISTINCT FROM OLD.created_by_profile_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt version identity and content are immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'DRAFT' AND NEW.status = 'PENDING_APPROVAL' AND NEW.submitted_at IS NOT NULL)
      OR (OLD.status = 'PENDING_APPROVAL' AND NEW.status = 'APPROVED' AND NEW.approved_by_profile_id IS NOT NULL AND NEW.approved_at IS NOT NULL)
      OR (OLD.status = 'PENDING_APPROVAL' AND NEW.status = 'REJECTED' AND NEW.rejected_by_profile_id IS NOT NULL AND NEW.rejected_at IS NOT NULL)
      OR (OLD.status = 'APPROVED' AND NEW.status = 'ACTIVE' AND NEW.activated_at IS NOT NULL)
      OR (OLD.status = 'ACTIVE' AND NEW.status = 'APPROVED' AND NEW.deactivated_at IS NOT NULL)
      OR (OLD.status IN ('DRAFT','APPROVED','REJECTED') AND NEW.status = 'RETIRED' AND NEW.retired_at IS NOT NULL)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt lifecycle transition is invalid';
    END IF;
  ELSE
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.approved_by_profile_id IS DISTINCT FROM OLD.approved_by_profile_id
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejected_by_profile_id IS DISTINCT FROM OLD.rejected_by_profile_id
       OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
       OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
       OR NEW.retired_at IS DISTINCT FROM OLD.retired_at
       OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt lifecycle metadata must change with a status transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_ai_prompt_version_immutability() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ai_prompt_versions_immutable
  BEFORE UPDATE OR DELETE ON public.ai_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_prompt_version_immutability();

CREATE OR REPLACE FUNCTION public.guard_ai_prompt_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt audit history is append-only';
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_ai_prompt_audit_append_only() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ai_prompt_audit_append_only
  BEFORE UPDATE OR DELETE ON public.ai_prompt_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_prompt_audit_append_only();

CREATE OR REPLACE FUNCTION public.ai_prompt_admin_context()
RETURNS TABLE(actor_profile_id uuid, organization_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR public.current_auth_session_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a live authenticated session is required';
  END IF;

  v_actor := public.current_profile_id();
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_actor
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true;

  IF v_actor IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id = v_actor AND r.role = 'admin'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization administrator required';
  END IF;

  RETURN QUERY SELECT v_actor, v_org;
END;
$function$;
REVOKE ALL ON FUNCTION public.ai_prompt_admin_context() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_ai_prompt_content(p_content text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_content text := btrim(coalesce(p_content, ''));
BEGIN
  IF char_length(v_content) < 16 OR char_length(v_content) > 8000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt content length is invalid';
  END IF;

  IF v_content ~* 'Bearer[[:space:]]+[A-Za-z0-9._~+/-]{16,}'
     OR v_content ~* 'sk-(proj|live|test|svcacct)?-?[A-Za-z0-9_-]{16,}'
     OR v_content ~* 'AIza[0-9A-Za-z_-]{30,}'
     OR v_content ~* '(api[_ -]?key|service[_ -]?role|secret|password|access[_ -]?token)[[:space:]]*[:=][[:space:]]*["'']?[A-Za-z0-9._~+/-]{8,}'
     OR v_content ~ '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
     OR v_content ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
     OR v_content ~* '\m[A-Z]{2}[0-9]{2}([[:space:]-]?[A-Z0-9]){11,30}\M'
     OR v_content ~* '(^|[^0-9])[+]?[0-9][0-9[:space:]().-]{7,}[0-9]([^0-9]|$)' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt content contains a credential or personal-data pattern';
  END IF;

  RETURN v_content;
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_ai_prompt_content(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_ai_prompt_versions(
  p_prompt_key text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_items jsonb;
  v_total bigint;
  v_limit integer := coalesce(p_limit, 50);
  v_offset integer := coalesce(p_offset, 0);
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;

  IF p_prompt_key IS NOT NULL AND p_prompt_key !~ '^[a-z][a-z0-9_.-]{1,79}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt key is invalid';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt status filter is invalid';
  END IF;
  IF v_limit < 1 OR v_limit > 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt page bounds are invalid';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.ai_prompt_versions v
  WHERE v.organization_id = v_org
    AND (p_prompt_key IS NULL OR v.prompt_key = p_prompt_key)
    AND (p_status IS NULL OR v.status = p_status);

  SELECT coalesce(jsonb_agg(to_jsonb(page_row) ORDER BY page_row.created_at DESC, page_row.prompt_key, page_row.version DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT v.*
    FROM public.ai_prompt_versions v
    WHERE v.organization_id = v_org
      AND (p_prompt_key IS NULL OR v.prompt_key = p_prompt_key)
      AND (p_status IS NULL OR v.status = p_status)
    ORDER BY v.created_at DESC, v.prompt_key, v.version DESC
    LIMIT v_limit OFFSET v_offset
  ) page_row;

  RETURN pg_catalog.jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_ai_prompt_versions(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ai_prompt_versions(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_ai_prompt_draft(
  p_prompt_key text,
  p_content text,
  p_command_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_key text := btrim(coalesce(p_prompt_key, ''));
  v_content text;
  v_hash text;
  v_next_version bigint;
  v_version public.ai_prompt_versions%ROWTYPE;
  v_event public.ai_prompt_audit_events%ROWTYPE;
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;

  IF v_key !~ '^[a-z][a-z0-9_.-]{1,79}$' OR p_command_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt draft identity is invalid';
  END IF;
  v_content := public.validate_ai_prompt_content(p_content);
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_content, 'UTF8'), 'sha256'), 'hex');

  PERFORM 1 FROM public.organizations o WHERE o.id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'prompt organization is unavailable';
  END IF;

  SELECT v.* INTO v_version
  FROM public.ai_prompt_audit_events e
  JOIN public.ai_prompt_versions v ON v.id = e.prompt_version_id
  WHERE e.organization_id = v_org AND e.command_id = p_command_id AND e.action = 'CREATED';
  IF FOUND THEN
    IF v_version.prompt_key <> v_key OR v_version.content_sha256 <> v_hash OR v_version.created_by_profile_id <> v_actor THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'AI prompt command id was already used for a different draft';
    END IF;
    SELECT e.* INTO v_event FROM public.ai_prompt_audit_events e
    WHERE e.organization_id = v_org AND e.command_id = p_command_id AND e.action = 'CREATED';
    RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', true);
  END IF;

  SELECT coalesce(max(v.version::bigint), 0) + 1 INTO v_next_version
  FROM public.ai_prompt_versions v
  WHERE v.organization_id = v_org AND v.prompt_key = v_key;
  IF v_next_version > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt version sequence is exhausted';
  END IF;

  INSERT INTO public.ai_prompt_versions(
    organization_id, prompt_key, version, content, content_sha256, status, created_by_profile_id
  ) VALUES (
    v_org, v_key, v_next_version::integer, v_content, v_hash, 'DRAFT', v_actor
  ) RETURNING * INTO v_version;

  INSERT INTO public.ai_prompt_audit_events(
    organization_id, prompt_version_id, prompt_key, version, command_id, action,
    actor_profile_id, previous_status, next_status
  ) VALUES (
    v_org, v_version.id, v_key, v_next_version, p_command_id, 'CREATED',
    v_actor, NULL, 'DRAFT'
  ) RETURNING * INTO v_event;

  RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_ai_prompt_draft(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ai_prompt_draft(text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_ai_prompt_version(
  p_version_id uuid,
  p_command_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_version public.ai_prompt_versions%ROWTYPE;
  v_event public.ai_prompt_audit_events%ROWTYPE;
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;
  IF p_version_id IS NULL OR p_command_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt submission identity is invalid';
  END IF;

  PERFORM 1 FROM public.organizations o WHERE o.id = v_org FOR UPDATE;
  SELECT v.* INTO v_version FROM public.ai_prompt_versions v
  WHERE v.id = p_version_id AND v.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt version is unavailable in this organization';
  END IF;

  SELECT e.* INTO v_event FROM public.ai_prompt_audit_events e
  WHERE e.organization_id = v_org AND e.command_id = p_command_id AND e.action = 'SUBMITTED_FOR_APPROVAL';
  IF FOUND THEN
    IF v_event.prompt_version_id <> p_version_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'AI prompt command id was already used for another submission';
    END IF;
    IF v_event.actor_profile_id <> v_actor THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt submission replay belongs to another administrator';
    END IF;
    RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', true);
  END IF;

  IF v_version.status <> 'DRAFT' OR v_version.created_by_profile_id <> v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the prompt creator may submit a draft';
  END IF;

  UPDATE public.ai_prompt_versions
  SET status = 'PENDING_APPROVAL', submitted_at = pg_catalog.clock_timestamp()
  WHERE id = v_version.id
  RETURNING * INTO v_version;

  INSERT INTO public.ai_prompt_audit_events(
    organization_id, prompt_version_id, prompt_key, version, command_id, action,
    actor_profile_id, previous_status, next_status
  ) VALUES (
    v_org, v_version.id, v_version.prompt_key, v_version.version, p_command_id, 'SUBMITTED_FOR_APPROVAL',
    v_actor, 'DRAFT', 'PENDING_APPROVAL'
  ) RETURNING * INTO v_event;

  RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_ai_prompt_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ai_prompt_version(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_ai_prompt_version(
  p_version_id uuid,
  p_command_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_version public.ai_prompt_versions%ROWTYPE;
  v_event public.ai_prompt_audit_events%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;
  IF p_version_id IS NULL OR p_command_id IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt approval requires a version, command id and reason';
  END IF;

  PERFORM 1 FROM public.organizations o WHERE o.id = v_org FOR UPDATE;
  SELECT v.* INTO v_version FROM public.ai_prompt_versions v
  WHERE v.id = p_version_id AND v.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt version is unavailable in this organization';
  END IF;

  SELECT e.* INTO v_event FROM public.ai_prompt_audit_events e
  WHERE e.organization_id = v_org AND e.command_id = p_command_id AND e.action = 'APPROVED';
  IF FOUND THEN
    IF v_event.prompt_version_id <> p_version_id OR v_event.actor_profile_id <> v_actor OR v_event.reason <> v_reason THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'AI prompt command id was already used for another approval';
    END IF;
    RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', true);
  END IF;

  IF v_version.status <> 'PENDING_APPROVAL' OR v_version.created_by_profile_id = v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'prompt approval requires a different administrator from the creator';
  END IF;

  UPDATE public.ai_prompt_versions
  SET status = 'APPROVED',
      approved_by_profile_id = v_actor,
      approved_at = pg_catalog.clock_timestamp(),
      decision_reason = v_reason
  WHERE id = v_version.id
  RETURNING * INTO v_version;

  INSERT INTO public.ai_prompt_audit_events(
    organization_id, prompt_version_id, prompt_key, version, command_id, action,
    actor_profile_id, previous_status, next_status, reason
  ) VALUES (
    v_org, v_version.id, v_version.prompt_key, v_version.version, p_command_id, 'APPROVED',
    v_actor, 'PENDING_APPROVAL', 'APPROVED', v_reason
  ) RETURNING * INTO v_event;

  RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.approve_ai_prompt_version(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_ai_prompt_version(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_ai_prompt_version(
  p_version_id uuid,
  p_command_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_version public.ai_prompt_versions%ROWTYPE;
  v_event public.ai_prompt_audit_events%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;
  IF p_version_id IS NULL OR p_command_id IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt rejection requires a version, command id and reason';
  END IF;

  PERFORM 1 FROM public.organizations o WHERE o.id = v_org FOR UPDATE;
  SELECT v.* INTO v_version FROM public.ai_prompt_versions v
  WHERE v.id = p_version_id AND v.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt version is unavailable in this organization';
  END IF;

  SELECT e.* INTO v_event FROM public.ai_prompt_audit_events e
  WHERE e.organization_id = v_org AND e.command_id = p_command_id AND e.action = 'REJECTED';
  IF FOUND THEN
    IF v_event.prompt_version_id <> p_version_id OR v_event.actor_profile_id <> v_actor OR v_event.reason <> v_reason THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'AI prompt command id was already used for another rejection';
    END IF;
    RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', true);
  END IF;

  IF v_version.status <> 'PENDING_APPROVAL' OR v_version.created_by_profile_id = v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'prompt rejection requires a different administrator from the creator';
  END IF;

  UPDATE public.ai_prompt_versions
  SET status = 'REJECTED',
      rejected_by_profile_id = v_actor,
      rejected_at = pg_catalog.clock_timestamp(),
      decision_reason = v_reason
  WHERE id = v_version.id
  RETURNING * INTO v_version;

  INSERT INTO public.ai_prompt_audit_events(
    organization_id, prompt_version_id, prompt_key, version, command_id, action,
    actor_profile_id, previous_status, next_status, reason
  ) VALUES (
    v_org, v_version.id, v_version.prompt_key, v_version.version, p_command_id, 'REJECTED',
    v_actor, 'PENDING_APPROVAL', 'REJECTED', v_reason
  ) RETURNING * INTO v_event;

  RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_ai_prompt_version(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_ai_prompt_version(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_ai_prompt_version(
  p_version_id uuid,
  p_command_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_version public.ai_prompt_versions%ROWTYPE;
  v_prior public.ai_prompt_versions%ROWTYPE;
  v_event public.ai_prompt_audit_events%ROWTYPE;
  v_prior_event public.ai_prompt_audit_events%ROWTYPE;
  v_events jsonb := '[]'::jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;
  IF p_version_id IS NULL OR p_command_id IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt activation requires a version, command id and reason';
  END IF;

  PERFORM 1 FROM public.organizations o WHERE o.id = v_org FOR UPDATE;
  SELECT v.* INTO v_version FROM public.ai_prompt_versions v
  WHERE v.id = p_version_id AND v.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt version is unavailable in this organization';
  END IF;

  SELECT e.* INTO v_event FROM public.ai_prompt_audit_events e
  WHERE e.organization_id = v_org AND e.command_id = p_command_id AND e.action = 'ACTIVATED';
  IF FOUND THEN
    IF v_event.prompt_version_id <> p_version_id OR v_event.actor_profile_id <> v_actor OR v_event.reason <> v_reason THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'AI prompt command id was already used for another activation';
    END IF;
    SELECT * INTO v_version FROM public.ai_prompt_versions WHERE id = p_version_id AND organization_id = v_org;
    SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at), '[]'::jsonb)
    INTO v_events FROM public.ai_prompt_audit_events e
    WHERE e.organization_id = v_org AND e.command_id = p_command_id;
    RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'events', v_events, 'replayed', true);
  END IF;

  IF v_version.status <> 'APPROVED'
     OR v_actor = v_version.created_by_profile_id
     OR v_actor = v_version.approved_by_profile_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'prompt activation requires an approved version and a third administrator';
  END IF;

  SELECT v.* INTO v_prior FROM public.ai_prompt_versions v
  WHERE v.organization_id = v_org AND v.prompt_key = v_version.prompt_key AND v.status = 'ACTIVE'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.ai_prompt_versions
    SET status = 'APPROVED', deactivated_at = pg_catalog.clock_timestamp()
    WHERE id = v_prior.id
    RETURNING * INTO v_prior;

    INSERT INTO public.ai_prompt_audit_events(
      organization_id, prompt_version_id, prompt_key, version, command_id, action,
      actor_profile_id, previous_status, next_status, reason
    ) VALUES (
      v_org, v_prior.id, v_prior.prompt_key, v_prior.version, p_command_id, 'DEACTIVATED',
      v_actor, 'ACTIVE', 'APPROVED', v_reason
    ) RETURNING * INTO v_prior_event;
    v_events := v_events || pg_catalog.jsonb_build_array(to_jsonb(v_prior_event));
  END IF;

  UPDATE public.ai_prompt_versions
  SET status = 'ACTIVE', activated_at = pg_catalog.clock_timestamp(), deactivated_at = NULL
  WHERE id = v_version.id
  RETURNING * INTO v_version;

  INSERT INTO public.ai_prompt_audit_events(
    organization_id, prompt_version_id, prompt_key, version, command_id, action,
    actor_profile_id, previous_status, next_status, reason
  ) VALUES (
    v_org, v_version.id, v_version.prompt_key, v_version.version, p_command_id, 'ACTIVATED',
    v_actor, 'APPROVED', 'ACTIVE', v_reason
  ) RETURNING * INTO v_event;
  v_events := v_events || pg_catalog.jsonb_build_array(to_jsonb(v_event));

  RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'events', v_events, 'replayed', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.activate_ai_prompt_version(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_ai_prompt_version(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.retire_ai_prompt_version(
  p_version_id uuid,
  p_command_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_version public.ai_prompt_versions%ROWTYPE;
  v_event public.ai_prompt_audit_events%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_previous_status text;
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;
  IF p_version_id IS NULL OR p_command_id IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt retirement requires a version, command id and reason';
  END IF;

  PERFORM 1 FROM public.organizations o WHERE o.id = v_org FOR UPDATE;
  SELECT v.* INTO v_version FROM public.ai_prompt_versions v
  WHERE v.id = p_version_id AND v.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt version is unavailable in this organization';
  END IF;

  SELECT e.* INTO v_event FROM public.ai_prompt_audit_events e
  WHERE e.organization_id = v_org AND e.command_id = p_command_id AND e.action = 'RETIRED';
  IF FOUND THEN
    IF v_event.prompt_version_id <> p_version_id OR v_event.actor_profile_id <> v_actor OR v_event.reason <> v_reason THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'AI prompt command id was already used for another retirement';
    END IF;
    RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', true);
  END IF;

  IF v_version.status NOT IN ('DRAFT','APPROVED','REJECTED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pending or active AI prompts cannot be retired';
  END IF;
  v_previous_status := v_version.status;

  UPDATE public.ai_prompt_versions
  SET status = 'RETIRED', retired_at = pg_catalog.clock_timestamp(), decision_reason = v_reason
  WHERE id = v_version.id
  RETURNING * INTO v_version;

  INSERT INTO public.ai_prompt_audit_events(
    organization_id, prompt_version_id, prompt_key, version, command_id, action,
    actor_profile_id, previous_status, next_status, reason
  ) VALUES (
    v_org, v_version.id, v_version.prompt_key, v_version.version, p_command_id, 'RETIRED',
    v_actor, v_previous_status, 'RETIRED', v_reason
  ) RETURNING * INTO v_event;

  RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.retire_ai_prompt_version(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retire_ai_prompt_version(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_ai_prompt_audit_events(
  p_version_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_limit integer := coalesce(p_limit, 50);
  v_items jsonb;
  v_total bigint;
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;
  IF p_version_id IS NULL OR v_limit < 1 OR v_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt audit query bounds are invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_prompt_versions v
    WHERE v.id = p_version_id AND v.organization_id = v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt version is unavailable in this organization';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.ai_prompt_audit_events e
  WHERE e.organization_id = v_org AND e.prompt_version_id = p_version_id;

  SELECT coalesce(jsonb_agg(to_jsonb(page_row) ORDER BY page_row.occurred_at DESC, page_row.id DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT e.*
    FROM public.ai_prompt_audit_events e
    WHERE e.organization_id = v_org AND e.prompt_version_id = p_version_id
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT v_limit
  ) page_row;

  RETURN pg_catalog.jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_ai_prompt_audit_events(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ai_prompt_audit_events(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_active_ai_prompt(
  p_user_id uuid,
  p_session_id uuid,
  p_prompt_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid;
  v_profile_count bigint;
  v_prompt public.ai_prompt_versions%ROWTYPE;
BEGIN
  IF coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'trusted server AI gateway is required';
  END IF;
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_prompt_key IS NULL
     OR p_prompt_key !~ '^[a-z][a-z0-9_.-]{1,79}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'active AI prompt lookup identity is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id = p_session_id
      AND s.user_id = p_user_id
      AND (s.not_after IS NULL OR s.not_after > pg_catalog.now())
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a live user Auth session is required for AI prompt lookup';
  END IF;

  SELECT count(*) INTO v_profile_count
  FROM public.profiles p
  WHERE p.auth_user_id = p_user_id AND p.is_active = true;
  IF v_profile_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exactly one active organization profile is required for AI prompt lookup';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.auth_user_id = p_user_id AND p.is_active = true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization profile is required for AI prompt lookup';
  END IF;

  SELECT v.* INTO v_prompt
  FROM public.ai_prompt_versions v
  WHERE v.organization_id = v_org
    AND v.prompt_key = p_prompt_key
    AND v.status = 'ACTIVE';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'prompt_key', v_prompt.prompt_key,
    'version', v_prompt.version,
    'content', v_prompt.content,
    'content_sha256', v_prompt.content_sha256,
    'activated_at', v_prompt.activated_at
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_active_ai_prompt(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_ai_prompt(uuid, uuid, text) TO service_role;

COMMIT;
