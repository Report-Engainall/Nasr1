-- Customer device replacement is an approval workflow, separate from staff session inventory.
-- A customer submits from the new live Auth session. No session is unlinked at request time.
-- Approval keeps the requested session and revokes its sibling sessions; rejection revokes
-- only the requested session and preserves the customer's previous sessions.

CREATE TABLE public.customer_device_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  auth_user_id uuid NOT NULL,
  requested_session_id uuid NOT NULL,
  requested_user_agent text,
  requested_session_created_at timestamptz NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','approved','rejected','expired')),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL,
  reviewed_by_profile_id uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_reason text,
  unlinked_session_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  decision_idempotency_key uuid,
  decision_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customer_device_change_request_idempotency_uq
    UNIQUE (organization_id,idempotency_key),
  CONSTRAINT customer_device_change_request_review_shape_ck CHECK (
    (status='pending_approval'
      AND reviewed_by_profile_id IS NULL AND reviewed_at IS NULL
      AND review_reason IS NULL AND decision_idempotency_key IS NULL
      AND decision_fingerprint IS NULL)
    OR
    (status IN ('approved','rejected','expired')
      AND reviewed_by_profile_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND decision_idempotency_key IS NOT NULL
      AND decision_fingerprint IS NOT NULL)
  )
);

CREATE UNIQUE INDEX customer_device_change_one_pending_per_customer_uq
  ON public.customer_device_change_requests(organization_id,customer_id)
  WHERE status='pending_approval';

CREATE INDEX customer_device_change_requests_profile_created_idx
  ON public.customer_device_change_requests(organization_id,profile_id,created_at DESC,id DESC);

CREATE INDEX customer_device_change_requests_status_created_idx
  ON public.customer_device_change_requests(organization_id,status,created_at,id);

CREATE TABLE public.customer_device_change_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  request_id uuid NOT NULL REFERENCES public.customer_device_change_requests(id),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  event_type text NOT NULL CHECK (event_type IN ('CREATED','APPROVED','REJECTED','EXPIRED')),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX customer_device_change_request_events_request_idx
  ON public.customer_device_change_request_events(organization_id,request_id,created_at,id);

ALTER TABLE public.customer_device_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_device_change_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_device_change_requests FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.customer_device_change_request_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.prevent_customer_device_change_request_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='customer device change requests cannot be deleted';
  END IF;

  IF ROW(
    NEW.id,NEW.organization_id,NEW.customer_id,NEW.profile_id,NEW.auth_user_id,
    NEW.requested_session_id,NEW.requested_user_agent,NEW.requested_session_created_at,
    NEW.reason,NEW.idempotency_key,NEW.payload_fingerprint,NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,OLD.organization_id,OLD.customer_id,OLD.profile_id,OLD.auth_user_id,
    OLD.requested_session_id,OLD.requested_user_agent,OLD.requested_session_created_at,
    OLD.reason,OLD.idempotency_key,OLD.payload_fingerprint,OLD.created_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='customer device change request identity and source are immutable';
  END IF;

  IF OLD.status <> 'pending_approval'
     OR NEW.status NOT IN ('approved','rejected','expired') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='customer device change request permits one terminal decision only';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER customer_device_change_request_no_rewrite
  BEFORE UPDATE OR DELETE ON public.customer_device_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_device_change_request_rewrite();

CREATE OR REPLACE FUNCTION public.prevent_customer_device_change_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='customer device change events are append-only';
END;
$function$;

CREATE TRIGGER customer_device_change_event_append_only
  BEFORE UPDATE OR DELETE ON public.customer_device_change_request_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_device_change_event_mutation();

REVOKE ALL ON FUNCTION public.prevent_customer_device_change_request_rewrite() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.prevent_customer_device_change_event_mutation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.request_customer_device_change(
  p_idempotency_key uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_organization_id uuid := public.current_organization_id();
  v_customer_id uuid := public.current_customer_id();
  v_session_id uuid := public.current_auth_session_id();
  v_user_agent text;
  v_session_created_at timestamptz;
  v_fingerprint text;
  v_existing public.customer_device_change_requests%ROWTYPE;
  v_pending_id uuid;
  v_new public.customer_device_change_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_organization_id IS NULL
     OR v_customer_id IS NULL OR v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer profile and live device session required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='device change idempotency key is required';
  END IF;
  IF p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) < 10
     OR pg_catalog.length(pg_catalog.btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='device change reason must contain 10 to 500 characters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id=v_profile_id AND r.role='customer'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id=v_profile_id
      AND r.role IN ('admin','manager','staff','accountant','customer_manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer-only device change workflow required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id=v_customer_id AND c.organization_id=v_organization_id
      AND c.status='approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='an approved customer in the active organization is required';
  END IF;

  SELECT pg_catalog.left(s.user_agent,512),s.created_at
    INTO v_user_agent,v_session_created_at
  FROM auth.sessions s
  WHERE s.id=v_session_id AND s.user_id=auth.uid()
    AND (s.not_after IS NULL OR s.not_after>pg_catalog.now())
  FOR UPDATE;

  IF v_session_created_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='the requesting Auth device session is not active';
  END IF;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'profile_id',v_profile_id,
      'customer_id',v_customer_id,
      'session_id',v_session_id,
      'reason',pg_catalog.btrim(p_reason)
    )::text
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_organization_id::text||':device-change-key:'||p_idempotency_key::text,0)
  );
  SELECT r.* INTO v_existing
  FROM public.customer_device_change_requests r
  WHERE r.organization_id=v_organization_id AND r.idempotency_key=p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='device change idempotency key was reused with a different payload';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing.id,'status',v_existing.status,'created_at',v_existing.created_at,
      'requested_device',v_existing.requested_user_agent,'replayed',true
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_organization_id::text||':device-change-customer:'||v_customer_id::text,0)
  );
  SELECT r.id INTO v_pending_id
  FROM public.customer_device_change_requests r
  WHERE r.organization_id=v_organization_id
    AND r.customer_id=v_customer_id
    AND r.status='pending_approval'
  FOR UPDATE;

  IF v_pending_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='customer already has a pending device change request';
  END IF;

  INSERT INTO public.customer_device_change_requests(
    organization_id,customer_id,profile_id,auth_user_id,requested_session_id,
    requested_user_agent,requested_session_created_at,reason,idempotency_key,payload_fingerprint
  )
  VALUES(
    v_organization_id,v_customer_id,v_profile_id,auth.uid(),v_session_id,
    v_user_agent,v_session_created_at,pg_catalog.btrim(p_reason),p_idempotency_key,v_fingerprint
  )
  RETURNING * INTO v_new;

  INSERT INTO public.customer_device_change_request_events(
    organization_id,request_id,actor_profile_id,event_type,event_payload
  )
  VALUES(
    v_organization_id,v_new.id,v_profile_id,'CREATED',
    pg_catalog.jsonb_build_object(
      'requested_session_id',v_session_id,
      'requested_session_created_at',v_session_created_at,
      'requested_user_agent',v_user_agent
    )
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_organization_id,v_profile_id,'auth.customer_device_change.requested',
    'customer_device_change_request',v_new.id,NULL,
    pg_catalog.jsonb_build_object('status','pending_approval','requested_session_id',v_session_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',v_new.id,'status',v_new.status,'created_at',v_new.created_at,
    'requested_device',v_new.requested_user_agent,'replayed',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_my_customer_device_change_requests(
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_organization_id uuid := public.current_organization_id();
  v_customer_id uuid := public.current_customer_id();
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_organization_id IS NULL OR v_customer_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.profile_id=v_profile_id AND r.role='customer'
     )
     OR EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.profile_id=v_profile_id
         AND r.role IN ('admin','manager','staff','accountant','customer_manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer identity required';
  END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='device change request limit must be between 1 and 50';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id=v_customer_id AND c.organization_id=v_organization_id
      AND c.status='approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='an approved customer in the active organization is required';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(shaped.item ORDER BY q.created_at DESC,q.id DESC),
    '[]'::jsonb
  ) INTO v_items
  FROM (
    SELECT
      r.id,r.status,r.reason,r.review_reason,r.created_at,r.reviewed_at,
      r.requested_user_agent,r.unlinked_session_ids
    FROM public.customer_device_change_requests r
    WHERE r.organization_id=v_organization_id
      AND r.profile_id=v_profile_id
      AND r.customer_id=v_customer_id
    ORDER BY r.created_at DESC,r.id DESC
    LIMIT p_limit
  ) q
  CROSS JOIN LATERAL (
    SELECT pg_catalog.jsonb_build_object(
      'id',q.id,'status',q.status,'reason',q.reason,
      'review_reason',q.review_reason,'created_at',q.created_at,
      'reviewed_at',q.reviewed_at,'requested_device',q.requested_user_agent,
      'unlinked_session_count',pg_catalog.cardinality(q.unlinked_session_ids)
    ) AS item
  ) shaped;

  RETURN pg_catalog.jsonb_build_object('items',v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_customer_device_change_requests(
  p_status text DEFAULT 'pending_approval',
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_organization_id uuid := public.current_organization_id();
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_organization_id IS NULL
     OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization administrator required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending_approval','approved','rejected','expired','all')
     OR p_limit IS NULL OR p_limit<1 OR p_limit>200 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid device change request filter or limit';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(shaped.item ORDER BY q.created_at ASC,q.id ASC),
    '[]'::jsonb
  ) INTO v_items
  FROM (
    SELECT
      r.id,r.status,r.reason,r.review_reason,r.created_at,r.reviewed_at,
      r.requested_user_agent,r.unlinked_session_ids,p.full_name,p.email
    FROM public.customer_device_change_requests r
    JOIN public.profiles p
      ON p.id=r.profile_id AND p.organization_id=r.organization_id
    WHERE r.organization_id=v_organization_id
      AND (p_status='all' OR r.status=p_status)
    ORDER BY r.created_at ASC,r.id ASC
    LIMIT p_limit
  ) q
  CROSS JOIN LATERAL (
    SELECT pg_catalog.jsonb_build_object(
      'id',q.id,'status',q.status,'reason',q.reason,'created_at',q.created_at,
      'requested_device',q.requested_user_agent,'customer_name',q.full_name,'customer_email',q.email,
      'review_reason',q.review_reason,'reviewed_at',q.reviewed_at,
      'unlinked_session_count',pg_catalog.cardinality(q.unlinked_session_ids)
    ) AS item
  ) shaped;

  RETURN pg_catalog.jsonb_build_object('items',v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_customer_device_change_request(
  p_request_id uuid,
  p_decision text,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid := public.current_profile_id();
  v_organization_id uuid := public.current_organization_id();
  v_request public.customer_device_change_requests%ROWTYPE;
  v_fingerprint text;
  v_requested_active boolean := false;
  v_unlinked_session_ids uuid[] := ARRAY[]::uuid[];
  v_unlinked_session_id uuid;
  v_final_status text;
BEGIN
  IF auth.uid() IS NULL OR v_actor_profile_id IS NULL OR v_organization_id IS NULL
     OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization administrator required';
  END IF;
  IF p_request_id IS NULL OR p_idempotency_key IS NULL
     OR p_decision IS NULL OR p_decision NOT IN ('approve','reject')
     OR p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason))<5
     OR pg_catalog.length(pg_catalog.btrim(p_reason))>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='valid device request decision, reason and idempotency key required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_organization_id::text||':device-change-review:'||p_request_id::text,0)
  );

  SELECT r.* INTO v_request
  FROM public.customer_device_change_requests r
  WHERE r.id=p_request_id AND r.organization_id=v_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='device change request is outside the active organization or unavailable';
  END IF;
  IF v_request.auth_user_id=auth.uid() OR v_request.profile_id=v_actor_profile_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator cannot review their own device change request';
  END IF;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object('request_id',p_request_id,'decision',p_decision,'reason',pg_catalog.btrim(p_reason))::text
  );

  IF v_request.status<>'pending_approval' THEN
    IF v_request.decision_idempotency_key=p_idempotency_key
       AND v_request.decision_fingerprint=v_fingerprint THEN
      RETURN pg_catalog.jsonb_build_object(
        'id',v_request.id,'status',v_request.status,
        'unlinked_session_count',pg_catalog.cardinality(v_request.unlinked_session_ids),
        'replayed',true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='device change request already has a terminal decision';
  END IF;

  IF p_decision='approve' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.profiles p
        ON p.id=v_request.profile_id
       AND p.organization_id=c.organization_id
      WHERE c.id=v_request.customer_id
        AND c.organization_id=v_organization_id
        AND c.status='approved'
        AND p.is_active=true
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account is not active and approved';
    END IF;

    PERFORM 1
    FROM auth.sessions s
    WHERE s.id=v_request.requested_session_id
      AND s.user_id=v_request.auth_user_id
      AND (s.not_after IS NULL OR s.not_after>pg_catalog.now())
    FOR UPDATE;
    v_requested_active := FOUND;

    IF NOT v_requested_active THEN
      v_final_status := 'expired';
    ELSE
      WITH deleted AS (
        DELETE FROM auth.sessions s
        WHERE s.user_id=v_request.auth_user_id
          AND s.id<>v_request.requested_session_id
        RETURNING s.id
      )
      SELECT COALESCE(pg_catalog.array_agg(id),ARRAY[]::uuid[])
        INTO v_unlinked_session_ids
      FROM deleted;
      v_final_status := 'approved';
    END IF;
  ELSE
    DELETE FROM auth.sessions s
    WHERE s.id=v_request.requested_session_id
      AND s.user_id=v_request.auth_user_id
    RETURNING s.id INTO v_unlinked_session_id;
    IF v_unlinked_session_id IS NOT NULL THEN
      v_unlinked_session_ids := ARRAY[v_unlinked_session_id];
    END IF;
    v_final_status := 'rejected';
  END IF;

  UPDATE public.customer_device_change_requests
  SET status=v_final_status,
      reviewed_by_profile_id=v_actor_profile_id,
      reviewed_at=pg_catalog.clock_timestamp(),
      review_reason=pg_catalog.btrim(p_reason),
      unlinked_session_ids=v_unlinked_session_ids,
      decision_idempotency_key=p_idempotency_key,
      decision_fingerprint=v_fingerprint,
      updated_at=pg_catalog.clock_timestamp()
  WHERE id=v_request.id AND organization_id=v_organization_id;

  INSERT INTO public.customer_device_change_request_events(
    organization_id,request_id,actor_profile_id,event_type,event_payload
  )
  VALUES(
    v_organization_id,v_request.id,v_actor_profile_id,
    CASE v_final_status WHEN 'approved' THEN 'APPROVED' WHEN 'rejected' THEN 'REJECTED' ELSE 'EXPIRED' END,
    pg_catalog.jsonb_build_object(
      'decision_reason',pg_catalog.btrim(p_reason),
      'unlinked_session_ids',to_jsonb(v_unlinked_session_ids),
      'requested_session_unlinked',v_request.requested_session_id=ANY(v_unlinked_session_ids)
    )
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_organization_id,v_actor_profile_id,
    CASE v_final_status
      WHEN 'approved' THEN 'auth.customer_device_change.approved'
      WHEN 'rejected' THEN 'auth.customer_device_change.rejected'
      ELSE 'auth.customer_device_change.expired'
    END,
    'customer_device_change_request',v_request.id,
    pg_catalog.jsonb_build_object('status','pending_approval'),
    pg_catalog.jsonb_build_object(
      'status',v_final_status,
      'unlinked_session_count',pg_catalog.cardinality(v_unlinked_session_ids),
      'decision_reason',pg_catalog.btrim(p_reason)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',v_request.id,'status',v_final_status,
    'unlinked_session_count',pg_catalog.cardinality(v_unlinked_session_ids),
    'replayed',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_customer_device_change(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_my_customer_device_change_requests(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_customer_device_change_requests(text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.review_customer_device_change_request(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_customer_device_change(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_customer_device_change_requests(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_customer_device_change_requests(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_customer_device_change_request(uuid,text,text,uuid) TO authenticated;

COMMENT ON TABLE public.customer_device_change_requests IS
  'Customer-only new-login-device replacement requests. Request creation never unlinks sessions; one administrator decision controls the session transition.';
COMMENT ON TABLE public.customer_device_change_request_events IS
  'Append-only customer device-change lifecycle events. Separate from organization staff session inventory.';
COMMENT ON FUNCTION public.request_customer_device_change(uuid,text) IS
  'Creates one tenant-scoped request using the verified current Auth session; it does not revoke any session.';
COMMENT ON FUNCTION public.review_customer_device_change_request(uuid,text,text,uuid) IS
  'Administrator-only one-time decision: approval retains the requested new session and unlinks siblings; rejection unlinks only the requested session.';
