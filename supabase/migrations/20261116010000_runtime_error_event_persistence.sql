-- AGH-RUNTIME-ERROR-LOG-001
-- Tenant-scoped, privacy-minimized browser runtime error events with append-only triage history.
BEGIN;

CREATE TABLE public.runtime_error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'browser' CHECK (source = 'browser'),
  error_kind text NOT NULL CHECK (error_kind IN (
    'error', 'type_error', 'reference_error', 'syntax_error',
    'range_error', 'response_error', 'unknown_error'
  )),
  http_status smallint NULL CHECK (http_status IS NULL OR http_status BETWEEN 400 AND 599),
  boundary text NOT NULL CHECK (boundary IN (
    'tanstack_root_error_component', 'window_error', 'unhandled_rejection', 'unknown'
  )),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count BETWEEN 1 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  acknowledged_at timestamptz NULL,
  acknowledged_by uuid NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT runtime_error_event_time_order_check
    CHECK (last_seen_at >= created_at AND (acknowledged_at IS NULL OR acknowledged_at >= created_at)
      AND (resolved_at IS NULL OR (acknowledged_at IS NOT NULL AND resolved_at >= acknowledged_at))),
  CONSTRAINT runtime_error_event_status_actor_check CHECK (
    (status = 'open' AND acknowledged_at IS NULL AND acknowledged_by IS NULL AND resolved_at IS NULL AND resolved_by IS NULL)
    OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL AND resolved_at IS NULL AND resolved_by IS NULL)
    OR (status = 'resolved' AND acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);

CREATE INDEX runtime_error_events_org_created_idx
  ON public.runtime_error_events (organization_id, created_at DESC, id DESC);
CREATE INDEX runtime_error_events_org_status_created_idx
  ON public.runtime_error_events (organization_id, status, created_at DESC, id DESC);
CREATE INDEX runtime_error_events_actor_created_idx
  ON public.runtime_error_events (organization_id, actor_profile_id, created_at DESC);

CREATE TABLE public.runtime_error_event_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.runtime_error_events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  from_status text NOT NULL CHECK (from_status IN ('open', 'acknowledged')),
  to_status text NOT NULL CHECK (
    (from_status = 'open' AND to_status = 'acknowledged')
    OR (from_status = 'acknowledged' AND to_status = 'resolved')
  ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX runtime_error_event_transitions_event_idx
  ON public.runtime_error_event_transitions (organization_id, event_id, created_at, id);

ALTER TABLE public.runtime_error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_error_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_error_event_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_error_event_transitions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.runtime_error_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.runtime_error_event_transitions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_runtime_error_event(
  p_error_kind text,
  p_http_status integer DEFAULT NULL,
  p_boundary text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid;
  v_org uuid;
  v_event_id uuid;
  v_created_at timestamptz;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.current_auth_session_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a live authenticated session is required';
  END IF;

  v_profile := public.current_profile_id();
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles AS p
   WHERE p.id = v_profile
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF v_profile IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'an active organization profile is required';
  END IF;

  IF p_error_kind IS NULL OR p_error_kind NOT IN (
    'error', 'type_error', 'reference_error', 'syntax_error',
    'range_error', 'response_error', 'unknown_error'
  ) OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 400 AND 599)
    OR p_boundary IS NULL OR p_boundary NOT IN (
      'tanstack_root_error_component', 'window_error', 'unhandled_rejection', 'unknown'
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'runtime error event metadata is invalid';
  END IF;

  -- Serialize per actor to make the deduplication and creation-rate guard race-safe.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':' || v_profile::text, 0)
  );

  SELECT e.id, e.created_at
    INTO v_event_id, v_created_at
    FROM public.runtime_error_events AS e
   WHERE e.organization_id = v_org
     AND e.actor_profile_id = v_profile
     AND e.error_kind = p_error_kind
     AND e.http_status IS NOT DISTINCT FROM p_http_status::smallint
     AND e.boundary = p_boundary
     AND e.status IN ('open', 'acknowledged')
     AND e.last_seen_at >= pg_catalog.clock_timestamp() - interval '60 seconds'
   ORDER BY e.last_seen_at DESC, e.id DESC
   LIMIT 1
   FOR UPDATE;

  IF v_event_id IS NOT NULL THEN
    UPDATE public.runtime_error_events AS e
       SET occurrence_count = LEAST(e.occurrence_count + 1, 1000000),
           last_seen_at = pg_catalog.clock_timestamp()
     WHERE e.id = v_event_id
       AND e.organization_id = v_org;
    RETURN pg_catalog.jsonb_build_object(
      'recorded', true,
      'deduplicated', true,
      'event_id', v_event_id,
      'created_at', v_created_at
    );
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.runtime_error_events AS e
   WHERE e.organization_id = v_org
     AND e.actor_profile_id = v_profile
     AND e.created_at >= pg_catalog.clock_timestamp() - interval '5 minutes';

  IF v_count >= 30 THEN
    RETURN pg_catalog.jsonb_build_object('recorded', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.runtime_error_events (
    organization_id, actor_profile_id, error_kind, http_status, boundary
  ) VALUES (
    v_org, v_profile, p_error_kind, p_http_status::smallint, p_boundary
  )
  RETURNING id, created_at INTO v_event_id, v_created_at;

  RETURN pg_catalog.jsonb_build_object(
    'recorded', true,
    'deduplicated', false,
    'event_id', v_event_id,
    'created_at', v_created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_runtime_error_events(
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
  v_profile uuid;
  v_org uuid;
  v_limit integer := COALESCE(p_limit, 50);
  v_offset integer := COALESCE(p_offset, 0);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.current_auth_session_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a live authenticated session is required';
  END IF;

  v_profile := public.current_profile_id();
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles AS p
   WHERE p.id = v_profile
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF v_profile IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles AS r
     WHERE r.profile_id = v_profile AND r.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'runtime error log requires an active organization administrator or manager';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('open', 'acknowledged', 'resolved') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'runtime error status filter is invalid';
  END IF;
  IF v_limit < 1 OR v_limit > 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'runtime error page bounds are invalid';
  END IF;

  SELECT pg_catalog.count(*) INTO v_total
    FROM public.runtime_error_events AS e
   WHERE e.organization_id = v_org
     AND (p_status IS NULL OR e.status = p_status);

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page_row) ORDER BY page_row.created_at DESC, page_row.id DESC),
    '[]'::jsonb
  ) INTO v_items
  FROM (
    SELECT
      e.id,
      e.error_kind,
      e.http_status,
      e.boundary,
      e.source,
      e.status,
      e.occurrence_count,
      e.created_at,
      e.last_seen_at,
      e.acknowledged_at,
      e.resolved_at
    FROM public.runtime_error_events AS e
    WHERE e.organization_id = v_org
      AND (p_status IS NULL OR e.status = p_status)
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT v_limit OFFSET v_offset
  ) AS page_row;

  RETURN pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'read_at', pg_catalog.clock_timestamp()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_runtime_error_event(
  p_event_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid;
  v_org uuid;
  v_current_status text;
BEGIN
  IF auth.uid() IS NULL OR public.current_auth_session_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a live authenticated session is required';
  END IF;

  v_profile := public.current_profile_id();
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles AS p
   WHERE p.id = v_profile
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF v_profile IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles AS r
     WHERE r.profile_id = v_profile AND r.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'runtime error triage requires an active organization administrator or manager';
  END IF;

  IF p_event_id IS NULL OR p_status IS NULL OR p_status NOT IN ('acknowledged', 'resolved') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'runtime error transition is invalid';
  END IF;

  SELECT e.status
    INTO v_current_status
    FROM public.runtime_error_events AS e
   WHERE e.id = p_event_id
     AND e.organization_id = v_org
   FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'runtime error event is not available in the active organization';
  END IF;

  IF v_current_status = p_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'event_id', p_event_id,
      'status', v_current_status,
      'changed', false
    );
  END IF;

  IF NOT (
    (v_current_status = 'open' AND p_status = 'acknowledged')
    OR (v_current_status = 'acknowledged' AND p_status = 'resolved')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'runtime error events can only move open to acknowledged to resolved';
  END IF;

  UPDATE public.runtime_error_events AS e
     SET status = p_status,
         acknowledged_at = CASE WHEN p_status = 'acknowledged' THEN pg_catalog.clock_timestamp() ELSE e.acknowledged_at END,
         acknowledged_by = CASE WHEN p_status = 'acknowledged' THEN v_profile ELSE e.acknowledged_by END,
         resolved_at = CASE WHEN p_status = 'resolved' THEN pg_catalog.clock_timestamp() ELSE e.resolved_at END,
         resolved_by = CASE WHEN p_status = 'resolved' THEN v_profile ELSE e.resolved_by END
   WHERE e.id = p_event_id
     AND e.organization_id = v_org;

  INSERT INTO public.runtime_error_event_transitions (
    event_id, organization_id, actor_profile_id, from_status, to_status
  ) VALUES (
    p_event_id, v_org, v_profile, v_current_status, p_status
  );

  RETURN pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'status', p_status,
    'changed', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_runtime_error_event(text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_runtime_error_events(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_runtime_error_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_runtime_error_event(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_runtime_error_events(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_runtime_error_event(uuid, text) TO authenticated;

COMMENT ON TABLE public.runtime_error_events IS
  'Privacy-minimized tenant-scoped browser runtime error metadata; contains no raw message, stack, URL, request payload, customer data, token, or secret.';
COMMENT ON TABLE public.runtime_error_event_transitions IS
  'Append-only status-transition audit for runtime error triage; direct client access is revoked.';
COMMENT ON FUNCTION public.record_runtime_error_event(text, integer, text) IS
  'Records allowlisted browser runtime-error metadata for the active profile-derived tenant. Deduplicates identical open/acknowledged events over 60 seconds and limits new events to 30 per actor per five minutes.';
COMMENT ON FUNCTION public.list_runtime_error_events(text, integer, integer) IS
  'Returns a bounded page of privacy-minimized runtime error events for the active tenant and admin/manager roles only.';
COMMENT ON FUNCTION public.transition_runtime_error_event(uuid, text) IS
  'Allows admin/manager to move tenant-scoped runtime errors only open -> acknowledged -> resolved and appends an immutable transition event.';

COMMIT;
