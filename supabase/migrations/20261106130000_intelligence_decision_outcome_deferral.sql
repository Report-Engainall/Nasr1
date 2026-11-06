-- Adds a reasoned, auditable defer decision without changing the existing command RPC.
-- Deferred decisions are terminal in this lifecycle revision; no implicit re-approval is allowed.

ALTER TABLE public.decision_outcomes
  DROP CONSTRAINT IF EXISTS decision_outcomes_state_check;
ALTER TABLE public.decision_outcomes
  ADD CONSTRAINT decision_outcomes_state_check
  CHECK (state IN (
    'PROPOSED','IN_REVIEW','APPROVED','REJECTED','DEFERRED',
    'ASSIGNED','EXECUTING','EXECUTED','MEASURED'
  ));

ALTER TABLE public.decision_outcome_events
  DROP CONSTRAINT IF EXISTS decision_outcome_events_event_type_check;
ALTER TABLE public.decision_outcome_events
  ADD CONSTRAINT decision_outcome_events_event_type_check
  CHECK (event_type IN (
    'CREATE','SUBMIT_FOR_REVIEW','APPROVE','REJECT','DEFER',
    'ASSIGN','START_EXECUTION','COMPLETE_EXECUTION','MEASURE'
  ));

CREATE OR REPLACE FUNCTION public.defer_decision_outcome(
  p_outcome_id uuid,
  p_event_id text,
  p_idempotency_key text,
  p_expected_version integer,
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
  v_role text;
  v_state text;
  v_version integer;
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_existing_actor uuid;
  v_existing_payload jsonb;
  v_existing_snapshot jsonb;
BEGIN
  IF NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to defer a decision outcome';
  END IF;

  SELECT p.id,p.organization_id,r.role
    INTO v_actor,v_org,v_role
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization required';
  END IF;
  IF p_outcome_id IS NULL
     OR p_event_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_event_id)) NOT BETWEEN 1 AND 100
     OR p_idempotency_key IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 100
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='decision deferral requires a valid id, version and reason';
  END IF;

  v_payload:=pg_catalog.jsonb_build_object(
    'outcomeId',p_outcome_id::text,
    'eventType','DEFER',
    'expectedVersion',p_expected_version,
    'reason',pg_catalog.btrim(p_reason),
    'ownerProfileId',NULL,
    'measuredOutcome',NULL
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':'||p_idempotency_key,0)
  );

  SELECT e.actor_profile_id,e.command_payload,e.result_snapshot
    INTO v_existing_actor,v_existing_payload,v_existing_snapshot
    FROM public.decision_outcome_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_actor<>v_actor OR v_existing_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='decision deferral idempotency key payload conflict';
    END IF;
    RETURN v_existing_snapshot||pg_catalog.jsonb_build_object('duplicate',true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.decision_outcome_events e
     WHERE e.organization_id=v_org AND e.event_id=p_event_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='decision outcome event id already exists';
  END IF;

  SELECT o.state,o.version
    INTO v_state,v_version
    FROM public.decision_outcomes o
   WHERE o.organization_id=v_org AND o.id=p_outcome_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision outcome is unavailable in the active organization';
  END IF;
  IF v_version<>p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='decision outcome version conflict; reload before retrying';
  END IF;
  IF v_state<>'IN_REVIEW' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a decision under review may be deferred';
  END IF;

  v_old_snapshot:=public._decision_outcome_snapshot(v_org,p_outcome_id);
  UPDATE public.decision_outcomes
     SET state='DEFERRED',
         version=v_version+1,
         reason=pg_catalog.btrim(p_reason),
         updated_at=pg_catalog.clock_timestamp()
   WHERE organization_id=v_org AND id=p_outcome_id;

  v_new_snapshot:=public._decision_outcome_snapshot(v_org,p_outcome_id);
  v_result:=pg_catalog.jsonb_build_object('ok',true,'duplicate',false,'outcome',v_new_snapshot);

  INSERT INTO public.decision_outcome_events(
    organization_id,outcome_id,event_id,event_type,version_after,actor_profile_id,actor_role,
    idempotency_key,command_payload,result_snapshot
  ) VALUES (
    v_org,p_outcome_id,p_event_id,'DEFER',v_version+1,v_actor,v_role,
    p_idempotency_key,v_payload,v_result
  );

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'decision_outcome.deferred','decision_outcome',p_outcome_id,v_old_snapshot,v_new_snapshot);

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.defer_decision_outcome(uuid,text,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.defer_decision_outcome(uuid,text,text,integer,text) TO authenticated;

COMMENT ON FUNCTION public.defer_decision_outcome(uuid,text,text,integer,text) IS
  'Atomically defers an IN_REVIEW decision with a mandatory reason, manager authorization, tenant/version checks, idempotency, append-only history and audit. Deferred decisions cannot be silently resumed.';
