-- AGH-AI-PROMPT-GOVERNANCE-002
-- Explicit, auditable emergency-disable transition for an ACTIVE prompt version.
-- Does not insert prompt records, change prompt content, select providers or call external services.
BEGIN;
ALTER TABLE public.ai_prompt_versions ADD COLUMN disabled_at timestamptz;
ALTER TABLE public.ai_prompt_versions DROP CONSTRAINT IF EXISTS ai_prompt_versions_disabled_at_status_check;
ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_disabled_at_status_check
  CHECK ((status = 'DISABLED') = (disabled_at IS NOT NULL));
ALTER TABLE public.ai_prompt_versions DROP CONSTRAINT IF EXISTS ai_prompt_versions_status_check;
ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_status_check
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED','DISABLED'));
ALTER TABLE public.ai_prompt_audit_events DROP CONSTRAINT IF EXISTS ai_prompt_audit_events_action_check;
ALTER TABLE public.ai_prompt_audit_events ADD CONSTRAINT ai_prompt_audit_events_action_check
  CHECK (action IN ('CREATED','SUBMITTED_FOR_APPROVAL','APPROVED','REJECTED','ACTIVATED','DEACTIVATED','RETIRED','DISABLED'));
ALTER TABLE public.ai_prompt_audit_events DROP CONSTRAINT IF EXISTS ai_prompt_audit_events_previous_status_check;
ALTER TABLE public.ai_prompt_audit_events ADD CONSTRAINT ai_prompt_audit_events_previous_status_check
  CHECK (previous_status IS NULL OR previous_status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED','DISABLED'));
ALTER TABLE public.ai_prompt_audit_events DROP CONSTRAINT IF EXISTS ai_prompt_audit_events_next_status_check;
ALTER TABLE public.ai_prompt_audit_events ADD CONSTRAINT ai_prompt_audit_events_next_status_check
  CHECK (next_status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED','DISABLED'));

CREATE OR REPLACE FUNCTION public.guard_ai_prompt_version_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt versions cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.prompt_key IS DISTINCT FROM OLD.prompt_key OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.content IS DISTINCT FROM OLD.content OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
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
      OR (OLD.status = 'ACTIVE' AND NEW.status = 'DISABLED' AND NEW.disabled_at IS NOT NULL)
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
       OR NEW.disabled_at IS DISTINCT FROM OLD.disabled_at
       OR NEW.retired_at IS DISTINCT FROM OLD.retired_at
       OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt lifecycle metadata must change with a status transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_ai_prompt_version_immutability() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_ai_prompt_versions(
  p_prompt_key text DEFAULT NULL, p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid; v_org uuid; v_items jsonb; v_total bigint;
  v_limit integer := coalesce(p_limit, 50); v_offset integer := coalesce(p_offset, 0);
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;
  IF p_prompt_key IS NOT NULL AND p_prompt_key !~ '^[a-z][a-z0-9_.-]{1,79}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt key is invalid';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','RETIRED','DISABLED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt status filter is invalid';
  END IF;
  IF v_limit < 1 OR v_limit > 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt page bounds are invalid';
  END IF;
  SELECT count(*) INTO v_total FROM public.ai_prompt_versions v
  WHERE v.organization_id = v_org AND (p_prompt_key IS NULL OR v.prompt_key = p_prompt_key)
    AND (p_status IS NULL OR v.status = p_status);
  SELECT coalesce(jsonb_agg(to_jsonb(page_row) ORDER BY page_row.created_at DESC, page_row.prompt_key, page_row.version DESC), '[]'::jsonb)
  INTO v_items FROM (
    SELECT v.* FROM public.ai_prompt_versions v
    WHERE v.organization_id = v_org AND (p_prompt_key IS NULL OR v.prompt_key = p_prompt_key)
      AND (p_status IS NULL OR v.status = p_status)
    ORDER BY v.created_at DESC, v.prompt_key, v.version DESC LIMIT v_limit OFFSET v_offset
  ) page_row;
  RETURN pg_catalog.jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_ai_prompt_versions(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ai_prompt_versions(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.disable_ai_prompt_version(p_version_id uuid, p_command_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid; v_org uuid;
  v_version public.ai_prompt_versions%ROWTYPE;
  v_event public.ai_prompt_audit_events%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT c.actor_profile_id, c.organization_id INTO v_actor, v_org
  FROM public.ai_prompt_admin_context() c;
  IF p_version_id IS NULL OR p_command_id IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AI prompt disable requires a version, command id and reason';
  END IF;
  PERFORM 1 FROM public.organizations o WHERE o.id = v_org FOR UPDATE;
  SELECT v.* INTO v_version FROM public.ai_prompt_versions v
  WHERE v.id = p_version_id AND v.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AI prompt version is unavailable in this organization';
  END IF;
  SELECT e.* INTO v_event FROM public.ai_prompt_audit_events e
  WHERE e.organization_id = v_org AND e.command_id = p_command_id AND e.action = 'DISABLED';
  IF FOUND THEN
    IF v_event.prompt_version_id <> p_version_id OR v_event.actor_profile_id <> v_actor OR v_event.reason <> v_reason THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'AI prompt command id was already used for another disable action';
    END IF;
    SELECT * INTO v_version FROM public.ai_prompt_versions v WHERE v.id = p_version_id AND v.organization_id = v_org;
    RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', true);
  END IF;
  IF v_version.status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'only an active AI prompt version can be disabled';
  END IF;
  UPDATE public.ai_prompt_versions
  SET status = 'DISABLED', disabled_at = pg_catalog.clock_timestamp(), decision_reason = v_reason
  WHERE id = v_version.id RETURNING * INTO v_version;
  INSERT INTO public.ai_prompt_audit_events(
    organization_id, prompt_version_id, prompt_key, version, command_id,
    action, actor_profile_id, previous_status, next_status, reason
  ) VALUES (
    v_org, v_version.id, v_version.prompt_key, v_version.version, p_command_id,
    'DISABLED', v_actor, 'ACTIVE', 'DISABLED', v_reason
  ) RETURNING * INTO v_event;
  RETURN pg_catalog.jsonb_build_object('version', to_jsonb(v_version), 'event', to_jsonb(v_event), 'replayed', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.disable_ai_prompt_version(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_ai_prompt_version(uuid, uuid, text) TO authenticated;
COMMIT;
