-- Tenant-scoped, atomic and auditable decision outcome persistence.
CREATE TABLE IF NOT EXISTS public.decision_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id text NOT NULL CHECK (char_length(btrim(candidate_id)) BETWEEN 1 AND 150),
  rule_id text NOT NULL CHECK (char_length(btrim(rule_id)) BETWEEN 1 AND 150),
  rule_version text NOT NULL CHECK (char_length(btrim(rule_version)) BETWEEN 1 AND 80),
  state text NOT NULL CHECK (state IN ('PROPOSED','IN_REVIEW','APPROVED','REJECTED','ASSIGNED','EXECUTING','EXECUTED','MEASURED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  proposed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expected_outcome text NOT NULL CHECK (char_length(btrim(expected_outcome)) BETWEEN 1 AND 2000),
  reason text,
  approved_at timestamptz,
  approved_by_profile_id uuid REFERENCES public.profiles(id),
  assigned_at timestamptz,
  executed_at timestamptz,
  measured_outcome jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,candidate_id)
);

CREATE TABLE IF NOT EXISTS public.decision_outcome_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES public.decision_outcomes(id) ON DELETE CASCADE,
  event_id text NOT NULL CHECK (char_length(btrim(event_id)) BETWEEN 1 AND 100),
  event_type text NOT NULL CHECK (event_type IN ('CREATE','SUBMIT_FOR_REVIEW','APPROVE','REJECT','ASSIGN','START_EXECUTION','COMPLETE_EXECUTION','MEASURE')),
  version_after integer NOT NULL CHECK (version_after > 0),
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  actor_role text NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 100),
  command_payload jsonb NOT NULL CHECK (jsonb_typeof(command_payload)='object'),
  result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,event_id),
  UNIQUE (outcome_id,version_after)
);

CREATE INDEX IF NOT EXISTS decision_outcomes_org_updated_idx
  ON public.decision_outcomes(organization_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS decision_outcome_events_history_idx
  ON public.decision_outcome_events(organization_id,outcome_id,version_after);

ALTER TABLE public.decision_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_outcome_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.decision_outcomes,public.decision_outcome_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.decision_outcomes,public.decision_outcome_events TO service_role;

CREATE OR REPLACE FUNCTION public._decision_outcome_snapshot(p_organization_id uuid,p_outcome_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',o.id::text,
    'candidateId',o.candidate_id,
    'ruleId',o.rule_id,
    'ruleVersion',o.rule_version,
    'state',o.state,
    'version',o.version,
    'proposedBy',pg_catalog.jsonb_build_object('id',o.proposed_by_profile_id::text),
    'owner',pg_catalog.jsonb_build_object(
      'id',o.owner_profile_id::text,
      'label',coalesce(owner.full_name,'غير معيّن')
    ),
    'expectedOutcome',o.expected_outcome,
    'reason',o.reason,
    'createdAt',o.created_at,
    'updatedAt',o.updated_at,
    'approvedAt',o.approved_at,
    'approvedBy',o.approved_by_profile_id::text,
    'assignedAt',o.assigned_at,
    'executedAt',o.executed_at,
    'measuredOutcome',o.measured_outcome,
    'eventCount',(SELECT pg_catalog.count(*)::integer FROM public.decision_outcome_events e WHERE e.organization_id=o.organization_id AND e.outcome_id=o.id),
    'history',coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',e.event_id,
          'type',e.event_type,
          'version',e.version_after,
          'actor',pg_catalog.jsonb_build_object('id',e.actor_profile_id::text,'role',e.actor_role),
          'at',e.created_at,
          'reason',e.command_payload->>'reason',
          'owner',e.command_payload->>'ownerProfileId',
          'idempotencyKey',e.idempotency_key
        ) ORDER BY e.version_after
      )
      FROM public.decision_outcome_events e
      WHERE e.organization_id=o.organization_id AND e.outcome_id=o.id
    ),'[]'::jsonb)
  )
  FROM public.decision_outcomes o
  LEFT JOIN public.profiles owner ON owner.id=o.owner_profile_id AND owner.organization_id=o.organization_id
  WHERE o.organization_id=p_organization_id AND o.id=p_outcome_id;
$function$;
REVOKE ALL ON FUNCTION public._decision_outcome_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_decision_outcome_proposal(
  p_candidate_id text,
  p_rule_id text,
  p_rule_version text,
  p_owner_profile_id uuid,
  p_expected_outcome text,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_role text;
  v_outcome_id uuid;
  v_payload jsonb;
  v_existing_actor uuid;
  v_existing_payload jsonb;
  v_existing_snapshot jsonb;
  v_snapshot jsonb;
  v_result jsonb;
BEGIN
  IF NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to propose a decision outcome';
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
  IF p_candidate_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_candidate_id)) NOT BETWEEN 1 AND 150
     OR p_rule_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_rule_id)) NOT BETWEEN 1 AND 150
     OR p_rule_version IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_rule_version)) NOT BETWEEN 1 AND 80
     OR p_expected_outcome IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_expected_outcome)) NOT BETWEEN 1 AND 2000
     OR p_idempotency_key IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid decision proposal payload';
  END IF;
  IF p_reason IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_reason))>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='decision proposal reason is too long';
  END IF;

  v_payload:=pg_catalog.jsonb_build_object(
    'command','CREATE','candidateId',pg_catalog.btrim(p_candidate_id),
    'ruleId',pg_catalog.btrim(p_rule_id),'ruleVersion',pg_catalog.btrim(p_rule_version),
    'ownerProfileId',p_owner_profile_id::text,'expectedOutcome',pg_catalog.btrim(p_expected_outcome),
    'reason',nullif(pg_catalog.btrim(coalesce(p_reason,'')),'')
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':'||p_idempotency_key,0));

  SELECT e.actor_profile_id,e.command_payload,e.result_snapshot
    INTO v_existing_actor,v_existing_payload,v_existing_snapshot
    FROM public.decision_outcome_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_actor<>v_actor OR v_existing_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='decision outcome idempotency key payload conflict';
    END IF;
    RETURN v_existing_snapshot||pg_catalog.jsonb_build_object('duplicate',true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.decision_outcomes o WHERE o.organization_id=v_org AND o.candidate_id=pg_catalog.btrim(p_candidate_id)) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='decision candidate already has an outcome';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.id=p_owner_profile_id AND p.organization_id=v_org AND p.is_active
       AND r.role IN ('admin','manager','staff','accountant','warehouse','purchasing','sales')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision owner must be an active same-organization staff profile';
  END IF;

  INSERT INTO public.decision_outcomes(
    organization_id,candidate_id,rule_id,rule_version,state,version,
    proposed_by_profile_id,owner_profile_id,expected_outcome,reason
  ) VALUES (
    v_org,pg_catalog.btrim(p_candidate_id),pg_catalog.btrim(p_rule_id),pg_catalog.btrim(p_rule_version),
    'PROPOSED',1,v_actor,p_owner_profile_id,pg_catalog.btrim(p_expected_outcome),
    nullif(pg_catalog.btrim(coalesce(p_reason,'')),'')
  ) RETURNING id INTO v_outcome_id;

  v_snapshot:=public._decision_outcome_snapshot(v_org,v_outcome_id);
  v_result:=pg_catalog.jsonb_build_object('ok',true,'duplicate',false,'outcome',v_snapshot);
  INSERT INTO public.decision_outcome_events(
    organization_id,outcome_id,event_id,event_type,version_after,actor_profile_id,actor_role,
    idempotency_key,command_payload,result_snapshot
  ) VALUES (
    v_org,v_outcome_id,pg_catalog.gen_random_uuid()::text,'CREATE',1,v_actor,v_role,
    p_idempotency_key,v_payload,v_result
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'decision_outcome.proposed','decision_outcome',v_outcome_id,NULL,v_snapshot);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.command_decision_outcome(
  p_outcome_id uuid,
  p_event_id text,
  p_idempotency_key text,
  p_expected_version integer,
  p_event_type text,
  p_reason text DEFAULT NULL,
  p_owner_profile_id uuid DEFAULT NULL,
  p_measured_outcome jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_role text;
  v_state text;
  v_version integer;
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
  v_result jsonb;
  v_payload jsonb;
  v_existing_actor uuid;
  v_existing_payload jsonb;
  v_existing_snapshot jsonb;
  v_next_state text;
  v_owner uuid;
  v_approved_at timestamptz;
  v_approved_by uuid;
  v_assigned_at timestamptz;
  v_executed_at timestamptz;
  v_measured jsonb;
  v_as_of timestamptz;
  v_measured_at timestamptz;
  v_period_from date;
  v_period_to date;
  v_currency text;
  v_metric_key text;
  v_value numeric(18,2);
  v_evidence_ids text[];
  v_expected_evidence_ids text[];
  v_expected_total numeric(18,2);
  v_unresolved integer;
  v_invoice_count integer;
  v_event_count integer;
BEGIN
  IF NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to update a decision outcome';
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
  IF p_outcome_id IS NULL OR p_event_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_event_id)) NOT BETWEEN 1 AND 100
     OR p_idempotency_key IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 100
     OR p_expected_version IS NULL OR p_expected_version<1
     OR p_event_type NOT IN ('SUBMIT_FOR_REVIEW','APPROVE','REJECT','ASSIGN','START_EXECUTION','COMPLETE_EXECUTION','MEASURE') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid decision outcome command';
  END IF;
  v_payload:=pg_catalog.jsonb_build_object(
    'outcomeId',p_outcome_id::text,'eventType',p_event_type,'expectedVersion',p_expected_version,
    'reason',nullif(pg_catalog.btrim(coalesce(p_reason,'')),''),
    'ownerProfileId',p_owner_profile_id::text,'measuredOutcome',p_measured_outcome
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':'||p_idempotency_key,0));

  SELECT e.actor_profile_id,e.command_payload,e.result_snapshot
    INTO v_existing_actor,v_existing_payload,v_existing_snapshot
    FROM public.decision_outcome_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_actor<>v_actor OR v_existing_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='decision outcome idempotency key payload conflict';
    END IF;
    RETURN v_existing_snapshot||pg_catalog.jsonb_build_object('duplicate',true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.decision_outcome_events e WHERE e.organization_id=v_org AND e.event_id=p_event_id) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='decision outcome event id already exists';
  END IF;

  SELECT o.state,o.version,o.owner_profile_id,o.approved_at,o.approved_by_profile_id,o.assigned_at,o.executed_at,o.measured_outcome
    INTO v_state,v_version,v_owner,v_approved_at,v_approved_by,v_assigned_at,v_executed_at,v_measured
    FROM public.decision_outcomes o
   WHERE o.organization_id=v_org AND o.id=p_outcome_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision outcome is unavailable in the active organization';
  END IF;
  IF v_version<>p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='decision outcome version conflict; reload before retrying';
  END IF;

  v_next_state:=CASE
    WHEN v_state='PROPOSED' AND p_event_type='SUBMIT_FOR_REVIEW' THEN 'IN_REVIEW'
    WHEN v_state='IN_REVIEW' AND p_event_type='APPROVE' THEN 'APPROVED'
    WHEN v_state='IN_REVIEW' AND p_event_type='REJECT' THEN 'REJECTED'
    WHEN v_state='APPROVED' AND p_event_type='ASSIGN' THEN 'ASSIGNED'
    WHEN v_state='ASSIGNED' AND p_event_type='START_EXECUTION' THEN 'EXECUTING'
    WHEN v_state='EXECUTING' AND p_event_type='COMPLETE_EXECUTION' THEN 'EXECUTED'
    WHEN v_state='EXECUTED' AND p_event_type='MEASURE' THEN 'MEASURED'
    ELSE NULL
  END;
  IF v_next_state IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid decision outcome state transition';
  END IF;
  IF p_event_type IN ('APPROVE','REJECT') AND nullif(pg_catalog.btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='approval or rejection reason is required';
  END IF;
  IF p_reason IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_reason))>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='decision outcome reason is too long';
  END IF;

  IF p_event_type='ASSIGN' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id=p.id
       WHERE p.id=p_owner_profile_id AND p.organization_id=v_org AND p.is_active
         AND r.role IN ('admin','manager','staff','accountant','warehouse','purchasing','sales')
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision owner must be an active same-organization staff profile';
    END IF;
    v_owner:=p_owner_profile_id;
    v_assigned_at:=pg_catalog.now();
  ELSIF p_owner_profile_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='owner can only change during assignment';
  END IF;

  IF p_event_type='APPROVE' THEN
    v_approved_at:=pg_catalog.now();
    v_approved_by:=v_actor;
  END IF;
  IF p_event_type='COMPLETE_EXECUTION' THEN
    v_executed_at:=pg_catalog.now();
  END IF;

  IF p_event_type='MEASURE' THEN
    IF p_measured_outcome IS NULL OR pg_catalog.jsonb_typeof(p_measured_outcome) IS DISTINCT FROM 'object'
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_object_keys(p_measured_outcome) k(key)
          WHERE k.key NOT IN ('metricKey','value','unit','currency','status','completeness','quality','period','asOf','formulaId','formulaVersion','measuredAt','evidenceIds')
       ) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measured outcome payload is invalid';
    END IF;
    IF pg_catalog.jsonb_typeof(p_measured_outcome->'value') IS DISTINCT FROM 'number'
       OR p_measured_outcome->>'unit'<>'CURRENCY'
       OR p_measured_outcome->>'status'<>'VERIFIED'
       OR p_measured_outcome->>'completeness'<>'COMPLETE'
       OR p_measured_outcome->>'quality'<>'ACCEPTABLE'
       OR p_measured_outcome->>'formulaId'<>'nasr1.receivables-outstanding'
       OR p_measured_outcome->>'formulaVersion'<>'1'
       OR p_measured_outcome->>'metricKey' NOT IN ('receivables.outstanding','cashflow.expected_collections')
       OR coalesce(p_measured_outcome->>'currency','') !~ '^[A-Z]{3}$'
       OR pg_catalog.jsonb_typeof(p_measured_outcome->'period') IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(p_measured_outcome->'evidenceIds') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(p_measured_outcome->'evidenceIds') NOT BETWEEN 1 AND 500
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(p_measured_outcome->'evidenceIds') e(value)
          WHERE pg_catalog.jsonb_typeof(e.value) IS DISTINCT FROM 'string'
             OR pg_catalog.btrim(e.value#>>'{}')=''
       ) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measured outcome must be verified, complete, formula-scoped currency evidence';
    END IF;
    BEGIN
      v_as_of:=(p_measured_outcome->>'asOf')::timestamptz;
      v_measured_at:=(p_measured_outcome->>'measuredAt')::timestamptz;
      v_period_from:=(p_measured_outcome->'period'->>'from')::date;
      v_period_to:=(p_measured_outcome->'period'->>'to')::date;
      v_value:=(p_measured_outcome->>'value')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measured outcome has invalid dates or value';
    END;
    v_currency:=p_measured_outcome->>'currency';
    v_metric_key:=p_measured_outcome->>'metricKey';
    IF v_as_of IS NULL OR v_measured_at IS NULL OR v_period_from IS NULL OR v_period_to IS NULL
       OR v_period_from>v_period_to OR v_as_of>pg_catalog.now()+interval '1 minute'
       OR v_measured_at<v_as_of OR v_measured_at>pg_catalog.now()+interval '1 minute'
       OR v_value<0 OR v_value::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measured outcome time, period or amount is outside the valid scope';
    END IF;
    SELECT pg_catalog.array_agg(e.value#>>'{}' ORDER BY e.value#>>'{}')
      INTO v_evidence_ids
      FROM pg_catalog.jsonb_array_elements(p_measured_outcome->'evidenceIds') e(value);
    IF pg_catalog.cardinality(v_evidence_ids)<>(SELECT pg_catalog.count(DISTINCT x) FROM pg_catalog.unnest(v_evidence_ids) x) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measured outcome evidence IDs must be unique';
    END IF;

    SELECT pg_catalog.count(*)::integer INTO v_unresolved
      FROM public.customer_invoices i
     WHERE i.organization_id=v_org
       AND i.status IN ('issued','partially_paid')
       AND i.issued_at<=v_as_of
       AND pg_catalog.upper(i.currency)=v_currency
       AND i.total_amount>coalesce((
         SELECT pg_catalog.sum(p.amount) FROM public.customer_payments p
          WHERE p.organization_id=v_org AND p.invoice_id=i.id AND p.paid_at<=v_as_of
       ),0)
       AND (i.due_at IS NULL OR pg_catalog.upper(coalesce(i.currency,'')) !~ '^[A-Z]{3}$');
    IF v_unresolved>0 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measurement blocked by incomplete same-currency receivable coverage';
    END IF;

    WITH scoped AS (
      SELECT i.id,i.total_amount,
             coalesce((
               SELECT pg_catalog.sum(p.amount) FROM public.customer_payments p
                WHERE p.organization_id=v_org AND p.invoice_id=i.id AND p.paid_at<=v_as_of
             ),0) AS paid_amount
        FROM public.customer_invoices i
       WHERE i.organization_id=v_org
         AND i.status IN ('issued','partially_paid')
         AND i.issued_at<=v_as_of
         AND pg_catalog.upper(i.currency)=v_currency
         AND (i.due_at AT TIME ZONE 'UTC')::date BETWEEN v_period_from AND v_period_to
         AND i.total_amount>coalesce((
           SELECT pg_catalog.sum(p.amount) FROM public.customer_payments p
            WHERE p.organization_id=v_org AND p.invoice_id=i.id AND p.paid_at<=v_as_of
         ),0)
    ), expected_ids AS (
      SELECT 'invoice:'||s.id::text AS evidence_id FROM scoped s
      UNION ALL
      SELECT 'payment:'||p.id::text
        FROM public.customer_payments p
        JOIN scoped s ON s.id=p.invoice_id
       WHERE p.organization_id=v_org AND p.paid_at<=v_as_of
    )
    SELECT
      (SELECT pg_catalog.array_agg(evidence_id ORDER BY evidence_id) FROM expected_ids),
      (SELECT pg_catalog.sum(greatest(total_amount-paid_amount,0))::numeric(18,2) FROM scoped),
      (SELECT pg_catalog.count(*)::integer FROM scoped)
      INTO v_expected_evidence_ids,v_expected_total,v_invoice_count;
    IF v_invoice_count=0 OR v_expected_evidence_ids IS DISTINCT FROM v_evidence_ids THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measurement evidence does not cover the complete same-tenant invoice/payment source set';
    END IF;
    IF v_expected_total IS DISTINCT FROM v_value THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measured amount does not match the source-derived receivables total';
    END IF;
    v_measured:=p_measured_outcome;
  ELSIF p_measured_outcome IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measured outcome is only accepted by the MEASURE command';
  END IF;

  v_old_snapshot:=public._decision_outcome_snapshot(v_org,p_outcome_id);
  UPDATE public.decision_outcomes
     SET state=v_next_state,
         version=v_version+1,
         owner_profile_id=v_owner,
         reason=coalesce(nullif(pg_catalog.btrim(coalesce(p_reason,'')),''),reason),
         approved_at=v_approved_at,
         approved_by_profile_id=v_approved_by,
         assigned_at=v_assigned_at,
         executed_at=v_executed_at,
         measured_outcome=v_measured,
         updated_at=pg_catalog.now()
   WHERE organization_id=v_org AND id=p_outcome_id;

  v_new_snapshot:=public._decision_outcome_snapshot(v_org,p_outcome_id);
  v_result:=pg_catalog.jsonb_build_object('ok',true,'duplicate',false,'outcome',v_new_snapshot);
  INSERT INTO public.decision_outcome_events(
    organization_id,outcome_id,event_id,event_type,version_after,actor_profile_id,actor_role,
    idempotency_key,command_payload,result_snapshot
  ) VALUES (
    v_org,p_outcome_id,p_event_id,p_event_type,v_version+1,v_actor,v_role,
    p_idempotency_key,v_payload,v_result
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'decision_outcome.'||pg_catalog.lower(p_event_type),'decision_outcome',p_outcome_id,v_old_snapshot,v_new_snapshot);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_decision_outcomes(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_items jsonb;
  v_total integer;
BEGIN
  IF NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read decision outcomes';
  END IF;
  SELECT p.id,p.organization_id INTO v_actor,v_org
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.auth_user_id=auth.uid() AND p.is_active AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization required';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='decision outcome pagination is invalid';
  END IF;
  SELECT pg_catalog.count(*)::integer INTO v_total
    FROM public.decision_outcomes o WHERE o.organization_id=v_org;
  SELECT coalesce(pg_catalog.jsonb_agg(page.snapshot ORDER BY page.updated_at DESC,page.id DESC),'[]'::jsonb)
    INTO v_items
    FROM (
      SELECT o.id,o.updated_at,public._decision_outcome_snapshot(v_org,o.id) AS snapshot
        FROM public.decision_outcomes o
       WHERE o.organization_id=v_org
       ORDER BY o.updated_at DESC,o.id DESC
       LIMIT p_limit OFFSET p_offset
    ) page;
  RETURN pg_catalog.jsonb_build_object('items',v_items,'total',v_total,'limit',p_limit,'offset',p_offset);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_decision_outcome_proposal(text,text,text,uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.command_decision_outcome(uuid,text,text,integer,text,text,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_decision_outcomes(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_decision_outcome_proposal(text,text,text,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.command_decision_outcome(uuid,text,text,integer,text,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_decision_outcomes(integer,integer) TO authenticated;

COMMENT ON FUNCTION public.create_decision_outcome_proposal(text,text,text,uuid,text,text,text) IS
  'Creates a tenant-scoped decision proposal with atomic idempotency, owner validation and immutable event/audit snapshots.';
COMMENT ON FUNCTION public.command_decision_outcome(uuid,text,text,integer,text,text,uuid,jsonb) IS
  'Executes versioned decision state transitions atomically; MEASURE is limited to full, verified, same-tenant receivables evidence.';
COMMENT ON FUNCTION public.fetch_decision_outcomes(integer,integer) IS
  'Reads only authenticated finance-organization decision outcomes; direct table access is revoked.';
