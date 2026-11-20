-- REF-SECTION-53: operational shift lifecycle, append-only handover and cash-count evidence.
-- Source reads are tenant/role scoped. Financial close remains advisory and read-only.
BEGIN;

CREATE TABLE public.operational_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  shift_label text NOT NULL CHECK (char_length(btrim(shift_label)) BETWEEN 2 AND 80),
  organization_time_zone text NOT NULL CHECK (char_length(organization_time_zone) BETWEEN 1 AND 80),
  previous_shift_id uuid,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  started_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,business_date,shift_label),
  FOREIGN KEY (organization_id,previous_shift_id)
    REFERENCES public.operational_shifts(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX operational_shifts_day_idx
  ON public.operational_shifts(organization_id,business_date,started_at DESC);

CREATE TABLE public.operational_shift_cash_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  shift_id uuid NOT NULL,
  phase text NOT NULL CHECK (phase IN ('OPENING','CLOSING')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  counted_amount numeric(18,2) NOT NULL CHECK (counted_amount >= 0 AND counted_amount < 10000000000000000),
  version integer NOT NULL CHECK (version >= 1),
  note text,
  correction_reason text,
  counted_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,shift_id,phase,currency,version),
  FOREIGN KEY (organization_id,shift_id)
    REFERENCES public.operational_shifts(organization_id,id) ON DELETE RESTRICT,
  CHECK (correction_reason IS NULL OR char_length(btrim(correction_reason)) BETWEEN 5 AND 500)
);
CREATE INDEX operational_shift_cash_latest_idx
  ON public.operational_shift_cash_counts(organization_id,shift_id,currency,phase,version DESC);

CREATE TABLE public.operational_shift_handover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  previous_shift_id uuid NOT NULL,
  current_shift_id uuid NOT NULL,
  handover_id uuid,
  action text NOT NULL CHECK (action IN ('RECORDED','ACCEPTED')),
  outgoing_owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  incoming_owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  open_item_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(open_item_refs)='array'),
  reason text,
  note text,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,previous_shift_id)
    REFERENCES public.operational_shifts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,current_shift_id)
    REFERENCES public.operational_shifts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,handover_id)
    REFERENCES public.operational_shift_handover_events(organization_id,id) ON DELETE RESTRICT,
  CHECK (
    (action='RECORDED' AND handover_id IS NULL
      AND previous_shift_id<>current_shift_id
      AND char_length(coalesce(reason,''))<=500
      AND char_length(coalesce(note,''))<=2000)
    OR
    (action='ACCEPTED' AND handover_id IS NOT NULL
      AND open_item_refs='[]'::jsonb AND reason IS NULL AND note IS NULL)
  )
);
CREATE UNIQUE INDEX operational_shift_handover_one_acceptance_idx
  ON public.operational_shift_handover_events(organization_id,handover_id)
  WHERE action='ACCEPTED';
CREATE INDEX operational_shift_handover_chain_idx
  ON public.operational_shift_handover_events(organization_id,current_shift_id,created_at DESC);

CREATE TABLE public.operational_shift_workspace_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  shift_id uuid NOT NULL,
  snapshot_kind text NOT NULL CHECK (snapshot_kind IN ('OPENING','CLOSEOUT')),
  version integer NOT NULL CHECK (version>=1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{32}$'),
  captured_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,shift_id,snapshot_kind,version),
  FOREIGN KEY (organization_id,shift_id)
    REFERENCES public.operational_shifts(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX operational_shift_snapshots_history_idx
  ON public.operational_shift_workspace_snapshots(organization_id,shift_id,snapshot_kind,version DESC);

ALTER TABLE public.operational_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_shift_cash_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_shift_handover_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_shift_workspace_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_shifts,public.operational_shift_cash_counts,public.operational_shift_handover_events,
  public.operational_shift_workspace_snapshots FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.operational_shifts,public.operational_shift_cash_counts,public.operational_shift_handover_events,
  public.operational_shift_workspace_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.reject_operational_shift_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION 'operational shift evidence is append-only' USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_operational_shift_history_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER operational_shift_cash_counts_append_only
  BEFORE UPDATE OR DELETE ON public.operational_shift_cash_counts
  FOR EACH ROW EXECUTE FUNCTION public.reject_operational_shift_history_mutation();
CREATE TRIGGER operational_shift_handover_events_append_only
  BEFORE UPDATE OR DELETE ON public.operational_shift_handover_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_operational_shift_history_mutation();
CREATE TRIGGER operational_shift_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.operational_shift_workspace_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.reject_operational_shift_history_mutation();

CREATE OR REPLACE FUNCTION public.start_operational_shift(
  p_business_date date,
  p_shift_label text,
  p_time_zone text,
  p_idempotency_key uuid,
  p_previous_shift_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_label text:=pg_catalog.btrim(coalesce(p_shift_label,''));
  v_zone text:=pg_catalog.btrim(coalesce(p_time_zone,''));
  v_fingerprint text;
  v_existing public.operational_shifts%ROWTYPE;
  v_previous uuid;
  v_shift public.operational_shifts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT (public.is_staff() OR public.can_manage_finance()) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff or finance permission required to start a shift';
  END IF;
  IF p_business_date IS NULL OR p_idempotency_key IS NULL
     OR char_length(v_label) NOT BETWEEN 2 AND 80
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_zone) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid business date, shift label, IANA time zone and idempotency key are required';
  END IF;

  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'business_date',p_business_date,'shift_label',v_label,'time_zone',v_zone,
    'previous_shift_id',p_previous_shift_id
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':operational-shift:'||p_idempotency_key::text,0)
  );
  SELECT s.* INTO v_existing FROM public.operational_shifts s
    WHERE s.organization_id=v_org AND s.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shift idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'shift_id',v_existing.id,'previous_shift_id',v_existing.previous_shift_id,
      'business_date',v_existing.business_date,'shift_label',v_existing.shift_label,
      'started_at',v_existing.started_at,'idempotent_replay',true
    );
  END IF;

  v_previous:=p_previous_shift_id;
  IF v_previous IS NULL THEN
    SELECT s.id INTO v_previous FROM public.operational_shifts s
      WHERE s.organization_id=v_org AND s.started_at<=pg_catalog.now()
      ORDER BY s.started_at DESC,s.id DESC LIMIT 1;
  ELSIF NOT EXISTS(
    SELECT 1 FROM public.operational_shifts s
      WHERE s.id=v_previous AND s.organization_id=v_org AND s.started_at<=pg_catalog.now()
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='previous shift is unavailable in this organization';
  END IF;

  INSERT INTO public.operational_shifts(
    organization_id,business_date,shift_label,organization_time_zone,previous_shift_id,
    owner_profile_id,started_by_profile_id,idempotency_key,payload_fingerprint
  ) VALUES (
    v_org,p_business_date,v_label,v_zone,v_previous,v_actor,v_actor,p_idempotency_key,v_fingerprint
  ) RETURNING * INTO v_shift;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'operational_shift.started','operational_shift',v_shift.id,
    pg_catalog.jsonb_build_object(
      'business_date',p_business_date,'shift_label',v_label,'time_zone',v_zone,
      'previous_shift_id',v_previous
    ));
  RETURN pg_catalog.jsonb_build_object(
    'shift_id',v_shift.id,'previous_shift_id',v_shift.previous_shift_id,
    'business_date',v_shift.business_date,'shift_label',v_shift.shift_label,
    'started_at',v_shift.started_at,'idempotent_replay',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_operational_shift_cash_count(
  p_shift_id uuid,
  p_phase text,
  p_currency text,
  p_counted_amount numeric,
  p_note text,
  p_correction_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_phase text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_phase,'')));
  v_currency text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency,'')));
  v_existing public.operational_shift_cash_counts%ROWTYPE;
  v_version integer;
  v_fingerprint text;
  v_count public.operational_shift_cash_counts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to record a cash count';
  END IF;
  IF p_shift_id IS NULL OR p_idempotency_key IS NULL OR v_phase NOT IN ('OPENING','CLOSING')
     OR v_currency !~ '^[A-Z]{3}$' OR p_counted_amount IS NULL
     OR p_counted_amount::text IN ('NaN','Infinity','-Infinity')
     OR p_counted_amount<0 OR p_counted_amount>=10000000000000000
     OR char_length(coalesce(p_note,''))>1000 OR char_length(coalesce(p_correction_reason,''))>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid shift, phase, ISO currency and nonnegative counted amount are required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.operational_shifts s WHERE s.id=p_shift_id AND s.organization_id=v_org) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='shift is unavailable in this organization';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'shift_id',p_shift_id,'phase',v_phase,'currency',v_currency,
    'counted_amount',p_counted_amount,'note',coalesce(p_note,''),
    'correction_reason',coalesce(p_correction_reason,'')
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':shift-cash:'||p_idempotency_key::text,0)
  );
  SELECT c.* INTO v_existing FROM public.operational_shift_cash_counts c
    WHERE c.organization_id=v_org AND c.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cash-count idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'cash_count_id',v_existing.id,'version',v_existing.version,
      'counted_at',v_existing.created_at,'idempotent_replay',true
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':shift-cash-version:'||p_shift_id::text||':'||v_phase||':'||v_currency,0)
  );
  SELECT coalesce(max(c.version),0)+1 INTO v_version
    FROM public.operational_shift_cash_counts c
    WHERE c.organization_id=v_org AND c.shift_id=p_shift_id
      AND c.phase=v_phase AND c.currency=v_currency;
  IF v_version>1 AND char_length(pg_catalog.btrim(coalesce(p_correction_reason,'')))<5 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a correction requires a reason of at least five characters';
  END IF;

  INSERT INTO public.operational_shift_cash_counts(
    organization_id,shift_id,phase,currency,counted_amount,version,note,correction_reason,
    counted_by_profile_id,idempotency_key,payload_fingerprint
  ) VALUES (
    v_org,p_shift_id,v_phase,v_currency,round(p_counted_amount,2),v_version,
    nullif(pg_catalog.btrim(coalesce(p_note,'')),''),nullif(pg_catalog.btrim(coalesce(p_correction_reason,'')),''),
    v_actor,p_idempotency_key,v_fingerprint
  ) RETURNING * INTO v_count;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'operational_shift.cash_count_recorded','operational_shift_cash_count',v_count.id,
    pg_catalog.jsonb_build_object(
      'shift_id',p_shift_id,'phase',v_phase,'currency',v_currency,
      'counted_amount',v_count.counted_amount,'version',v_version,
      'correction_reason',v_count.correction_reason
    ));
  RETURN pg_catalog.jsonb_build_object(
    'cash_count_id',v_count.id,'version',v_count.version,
    'counted_at',v_count.created_at,'idempotent_replay',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_operational_shift_handover(
  p_current_shift_id uuid,
  p_open_item_refs jsonb,
  p_reason text,
  p_note text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_current public.operational_shifts%ROWTYPE;
  v_previous public.operational_shifts%ROWTYPE;
  v_handover public.operational_shift_handover_events%ROWTYPE;
  v_ref text;
  v_fingerprint text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT (public.is_staff() OR public.can_manage_finance()) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff permission required to record a shift handover';
  END IF;
  IF p_current_shift_id IS NULL OR p_idempotency_key IS NULL
     OR p_open_item_refs IS NULL OR pg_catalog.jsonb_typeof(p_open_item_refs)<>'array'
     OR (CASE WHEN pg_catalog.jsonb_typeof(p_open_item_refs)='array' THEN pg_catalog.jsonb_array_length(p_open_item_refs)>200 ELSE true END)
     OR char_length(coalesce(p_reason,''))>500 OR char_length(coalesce(p_note,''))>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid shift handover payload is required';
  END IF;
  SELECT s.* INTO v_current FROM public.operational_shifts s
    WHERE s.id=p_current_shift_id AND s.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_current.previous_shift_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='current shift has no available previous shift to hand over from';
  END IF;
  SELECT s.* INTO v_previous FROM public.operational_shifts s
    WHERE s.id=v_current.previous_shift_id AND s.organization_id=v_org;
  IF NOT FOUND OR v_previous.owner_profile_id IS NULL OR v_current.owner_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='outgoing or incoming shift owner is unavailable';
  END IF;
  IF v_actor<>v_previous.owner_profile_id AND NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only the outgoing owner or a manager may record this handover';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.profiles p
    WHERE p.id=v_current.owner_profile_id AND p.organization_id=v_org
      AND p.is_active AND p.auth_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='incoming shift owner is no longer an active user in this organization';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_open_item_refs) AS item(value)
    WHERE pg_catalog.jsonb_typeof(item.value)<>'string'
       OR item.value#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) OR (SELECT count(*) FROM pg_catalog.jsonb_array_elements_text(p_open_item_refs))
       <> (SELECT count(DISTINCT value) FROM pg_catalog.jsonb_array_elements_text(p_open_item_refs)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='handover references must be unique source UUIDs';
  END IF;
  FOR v_ref IN SELECT value FROM pg_catalog.jsonb_array_elements_text(p_open_item_refs) LOOP
    IF NOT (
      EXISTS(SELECT 1 FROM public.ai_tasks t WHERE t.id=v_ref::uuid AND t.organization_id=v_org AND t.status IN ('pending','in_progress') AND public.can_view_operational_task_role(t.task_role))
      OR EXISTS(SELECT 1 FROM public.orders o WHERE o.id=v_ref::uuid AND o.organization_id=v_org AND o.status IN ('draft','pending','confirmed','processing','shipped')
        AND (o.created_at AT TIME ZONE v_current.organization_time_zone)::date=v_current.business_date)
      OR (public.can_manage_finance() AND EXISTS(SELECT 1 FROM public.customer_invoices i WHERE i.id=v_ref::uuid AND i.organization_id=v_org AND i.status IN ('issued','partially_paid')))
      OR EXISTS(SELECT 1 FROM public.inventory_balances ib
        JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
        JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org AND w.is_active
        WHERE ib.id=v_ref::uuid AND coalesce(ib.quantity_available,0)<=coalesce(ib.reorder_point,0))
      OR EXISTS(SELECT 1 FROM public.stock_count_lines line
        JOIN public.stock_count_sessions session ON session.id=line.session_id AND session.organization_id=line.organization_id
        WHERE line.id=v_ref::uuid AND line.organization_id=v_org AND session.status IN ('open','completed')
          AND line.variance IS NOT NULL AND line.variance<>0
          AND (session.started_at AT TIME ZONE v_current.organization_time_zone)::date=v_current.business_date)
      OR EXISTS(SELECT 1 FROM public.ai_alerts a WHERE a.id=v_ref::uuid AND a.organization_id=v_org AND NOT a.is_resolved)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='handover contains a missing, resolved or cross-organization source reference';
    END IF;
  END LOOP;

  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'current_shift_id',p_current_shift_id,'open_item_refs',p_open_item_refs,
    'reason',coalesce(p_reason,''),'note',coalesce(p_note,'')
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':shift-handover:'||p_idempotency_key::text,0)
  );
  SELECT e.* INTO v_handover FROM public.operational_shift_handover_events e
    WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_handover.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='handover idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('handover_id',v_handover.id,'recorded_at',v_handover.created_at,'idempotent_replay',true);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':shift-handover-current:'||p_current_shift_id::text,0)
  );
  IF EXISTS(
    SELECT 1 FROM public.operational_shift_handover_events e
      WHERE e.organization_id=v_org AND e.current_shift_id=p_current_shift_id AND e.action='RECORDED'
  ) AND char_length(pg_catalog.btrim(coalesce(p_reason,'')))<5 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a replacement handover event requires a reason';
  END IF;

  INSERT INTO public.operational_shift_handover_events(
    organization_id,previous_shift_id,current_shift_id,action,
    outgoing_owner_profile_id,incoming_owner_profile_id,open_item_refs,reason,note,
    actor_profile_id,idempotency_key,payload_fingerprint
  ) VALUES(
    v_org,v_previous.id,v_current.id,'RECORDED',
    v_previous.owner_profile_id,v_current.owner_profile_id,p_open_item_refs,
    nullif(pg_catalog.btrim(coalesce(p_reason,'')),''),nullif(pg_catalog.btrim(coalesce(p_note,'')),''),
    v_actor,p_idempotency_key,v_fingerprint
  ) RETURNING * INTO v_handover;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'operational_shift.handover_recorded','operational_shift_handover',v_handover.id,
    pg_catalog.jsonb_build_object(
      'previous_shift_id',v_previous.id,'current_shift_id',v_current.id,
      'outgoing_owner_profile_id',v_previous.owner_profile_id,
      'incoming_owner_profile_id',v_current.owner_profile_id,
      'open_item_refs',p_open_item_refs,'reason',v_handover.reason
    ));
  RETURN pg_catalog.jsonb_build_object('handover_id',v_handover.id,'recorded_at',v_handover.created_at,'idempotent_replay',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_operational_shift_handover(
  p_handover_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_record public.operational_shift_handover_events%ROWTYPE;
  v_existing public.operational_shift_handover_events%ROWTYPE;
  v_fingerprint text;
  v_acceptance public.operational_shift_handover_events%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR p_handover_id IS NULL
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated active profile required to accept handover';
  END IF;
  SELECT e.* INTO v_record FROM public.operational_shift_handover_events e
    WHERE e.id=p_handover_id AND e.organization_id=v_org AND e.action='RECORDED' FOR UPDATE;
  IF NOT FOUND OR v_record.incoming_owner_profile_id<>v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only the assigned incoming shift owner may accept this handover';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object('handover_id',p_handover_id,'action','ACCEPTED')::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':shift-handover-accept:'||p_idempotency_key::text,0)
  );
  SELECT e.* INTO v_existing FROM public.operational_shift_handover_events e
    WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='handover acceptance idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('handover_id',p_handover_id,'accepted_at',v_existing.created_at,'idempotent_replay',true);
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.operational_shift_handover_events e
      WHERE e.organization_id=v_org AND e.handover_id=p_handover_id AND e.action='ACCEPTED'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='handover has already been accepted';
  END IF;

  INSERT INTO public.operational_shift_handover_events(
    organization_id,previous_shift_id,current_shift_id,handover_id,action,
    outgoing_owner_profile_id,incoming_owner_profile_id,open_item_refs,
    actor_profile_id,idempotency_key,payload_fingerprint
  ) VALUES(
    v_org,v_record.previous_shift_id,v_record.current_shift_id,v_record.id,'ACCEPTED',
    v_record.outgoing_owner_profile_id,v_record.incoming_owner_profile_id,'[]'::jsonb,
    v_actor,p_idempotency_key,v_fingerprint
  ) RETURNING * INTO v_acceptance;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'operational_shift.handover_accepted','operational_shift_handover',v_record.id,
    pg_catalog.jsonb_build_object('acceptance_event_id',v_acceptance.id,'current_shift_id',v_record.current_shift_id));
  RETURN pg_catalog.jsonb_build_object('handover_id',p_handover_id,'accepted_at',v_acceptance.created_at,'idempotent_replay',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_operational_shift_workspace(
  p_business_date date,
  p_shift_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_shift public.operational_shifts%ROWTYPE;
  v_previous public.operational_shifts%ROWTYPE;
  v_as_of timestamptz:=pg_catalog.now();
  v_period jsonb;
  v_task_count integer:=0;
  v_order_count integer:=0;
  v_task_items jsonb:='[]'::jsonb;
  v_order_items jsonb:='[]'::jsonb;
  v_invoice_items jsonb:='[]'::jsonb;
  v_receipt_items jsonb:='[]'::jsonb;
  v_payment_items jsonb:='[]'::jsonb;
  v_inventory_items jsonb:='[]'::jsonb;
  v_alert_items jsonb:='[]'::jsonb;
  v_invoice_count integer:=0;
  v_receipt_count integer:=0;
  v_payment_count integer:=0;
  v_inventory_count integer:=0;
  v_alert_count integer:=0;
  v_can_finance boolean:=false;
  v_can_purchase boolean:=false;
  v_can_staff boolean:=false;
  v_items jsonb:='[]'::jsonb;
  v_coverage jsonb:='[]'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_cash_controls jsonb:='[]'::jsonb;
  v_handover jsonb;
  v_handover_record public.operational_shift_handover_events%ROWTYPE;
  v_accepted_at timestamptz;
  v_currency_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT (public.is_staff() OR public.can_manage_finance()) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff or finance permission required to read the shift workspace';
  END IF;
  IF p_business_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='business date is required';
  END IF;
  v_can_finance:=public.can_manage_finance();
  v_can_purchase:=public.purchase_orders_can_manage();
  v_can_staff:=public.is_staff();
  SELECT s.* INTO v_shift FROM public.operational_shifts s
    WHERE s.organization_id=v_org AND s.business_date=p_business_date
      AND (p_shift_id IS NULL OR s.id=p_shift_id)
    ORDER BY s.started_at DESC,s.id DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='no operational shift exists for this date; start a shift first';
  END IF;

  v_period:=pg_catalog.jsonb_build_object('from',v_shift.business_date::text,'to',v_shift.business_date::text);

  SELECT count(*)::integer INTO v_task_count
    FROM public.ai_tasks t
    WHERE t.organization_id=v_org
      AND t.status IN ('pending','in_progress')
      AND public.can_view_operational_task_role(t.task_role);
  SELECT coalesce(pg_catalog.jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb)
    INTO v_task_items
    FROM (
      SELECT pg_catalog.jsonb_build_object(
        'id','task:'||t.id::text,'sourceKey','TASKS','sourceRef',t.id::text,
        'title',t.title,'summary',t.description,
        'state',CASE WHEN t.status='in_progress' THEN 'IN_PROGRESS' ELSE 'OPEN' END,
        'severity',CASE WHEN t.priority='critical' THEN 'CRITICAL' WHEN t.priority='high' THEN 'WARNING' ELSE 'INFO' END,
        'updatedAt',coalesce(t.updated_at,t.created_at,v_as_of),
        'ownerProfileId',t.assigned_to,'dueAt',t.due_at,
        'amount',NULL,'currency',NULL,'evidenceIds',pg_catalog.jsonb_build_array('E_TASKS')
      ) AS row_value,coalesce(t.due_at,t.created_at) AS sort_key
      FROM public.ai_tasks t
      WHERE t.organization_id=v_org AND t.status IN ('pending','in_progress')
        AND public.can_view_operational_task_role(t.task_role)
      ORDER BY (t.priority='critical') DESC,(t.priority='high') DESC,
        coalesce(t.due_at,t.created_at) ASC,t.id
      LIMIT 60
    ) task_rows;

  SELECT count(*)::integer INTO v_order_count
    FROM public.orders o
    WHERE o.organization_id=v_org
      AND o.status IN ('draft','pending','confirmed','processing','shipped')
      AND (o.created_at AT TIME ZONE v_shift.organization_time_zone)::date=v_shift.business_date;
  SELECT coalesce(pg_catalog.jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb)
    INTO v_order_items
    FROM (
      SELECT pg_catalog.jsonb_build_object(
        'id','order:'||o.id::text,'sourceKey','ORDERS','sourceRef',o.id::text,
        'title','طلب '||o.order_number,'summary','حالة الطلب: '||o.status,
        'state',CASE WHEN o.status IN ('confirmed','processing','shipped') THEN 'IN_PROGRESS'
          WHEN o.status IN ('draft','pending') THEN 'OPEN' ELSE 'UNKNOWN' END,
        'severity',CASE WHEN o.status='pending' THEN 'WARNING' ELSE 'INFO' END,
        'updatedAt',coalesce(o.updated_at,o.created_at,v_as_of),
        'ownerProfileId',o.created_by,'dueAt',NULL,
        'amount',NULL,'currency',NULL,'evidenceIds',pg_catalog.jsonb_build_array('E_ORDERS')
      ) AS row_value,o.created_at AS sort_key
      FROM public.orders o
      WHERE o.organization_id=v_org
        AND o.status IN ('draft','pending','confirmed','processing','shipped')
        AND (o.created_at AT TIME ZONE v_shift.organization_time_zone)::date=v_shift.business_date
      ORDER BY o.created_at,o.id
      LIMIT 60
    ) order_rows;


  IF v_can_finance THEN
    SELECT count(*)::integer INTO v_invoice_count
      FROM public.customer_invoices i
      WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid');
    SELECT coalesce(pg_catalog.jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb)
      INTO v_invoice_items
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'id','invoice:'||i.id::text,'sourceKey','INVOICES','sourceRef',i.id::text,
          'title','فاتورة '||i.invoice_number,'summary','حالة الفاتورة: '||i.status,
          'state',CASE WHEN i.due_at IS NOT NULL AND i.due_at<v_as_of THEN 'BLOCKED' ELSE 'OPEN' END,
          'severity',CASE WHEN i.due_at IS NOT NULL AND i.due_at<v_as_of THEN 'CRITICAL' ELSE 'WARNING' END,
          'updatedAt',i.issued_at,'ownerProfileId',NULL,'dueAt',i.due_at,
          'amount',i.total_amount,'currency',i.currency,'evidenceIds',pg_catalog.jsonb_build_array('E_INVOICES')
        ) AS row_value,coalesce(i.due_at,i.issued_at) AS sort_key
        FROM public.customer_invoices i
        WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid')
        ORDER BY (i.due_at IS NOT NULL AND i.due_at<v_as_of) DESC,
          coalesce(i.due_at,i.issued_at),i.id
        LIMIT 60
      ) invoice_rows;

    SELECT count(*)::integer INTO v_payment_count
      FROM (
        SELECT cp.id
          FROM public.customer_payments cp
         WHERE cp.organization_id=v_org
           AND (cp.paid_at AT TIME ZONE v_shift.organization_time_zone)::date=v_shift.business_date
        UNION ALL
        SELECT sp.id
          FROM public.purchase_supplier_payments sp
         WHERE sp.organization_id=v_org AND sp.payment_date=v_shift.business_date AND sp.status<>'void'
      ) payment_sources;
    SELECT coalesce(pg_catalog.jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb)
      INTO v_payment_items
      FROM (
        SELECT row_value,sort_key FROM (
          SELECT pg_catalog.jsonb_build_object(
            'id','customer-payment:'||cp.id::text,'sourceKey','PAYMENTS','sourceRef',cp.id::text,
            'title','مقبوض عميل '||pg_catalog.left(cp.id::text,8),
            'summary','وسيلة الدفع: '||cp.payment_method,
            'state','RESOLVED','severity','INFO','updatedAt',cp.paid_at,
            'ownerProfileId',cp.created_by,'dueAt',NULL,
            'amount',cp.amount,'currency',i.currency,'evidenceIds',pg_catalog.jsonb_build_array('E_PAYMENTS')
          ) AS row_value,cp.paid_at AS sort_key
          FROM public.customer_payments cp
          JOIN public.customer_invoices i ON i.id=cp.invoice_id AND i.organization_id=cp.organization_id
          WHERE cp.organization_id=v_org
            AND (cp.paid_at AT TIME ZONE v_shift.organization_time_zone)::date=v_shift.business_date
          UNION ALL
          SELECT pg_catalog.jsonb_build_object(
            'id','supplier-payment:'||sp.id::text,'sourceKey','PAYMENTS','sourceRef',sp.id::text,
            'title','دفعة مورد '||sp.payment_number::text,
            'summary','وسيلة الدفع: '||sp.payment_method,
            'state','RESOLVED','severity','INFO',
            'updatedAt',(sp.payment_date::timestamp AT TIME ZONE v_shift.organization_time_zone),
            'ownerProfileId',sp.created_by_profile_id,'dueAt',NULL,
            'amount',sp.amount,'currency',sp.currency,'evidenceIds',pg_catalog.jsonb_build_array('E_PAYMENTS')
          ) AS row_value,(sp.payment_date::timestamp AT TIME ZONE v_shift.organization_time_zone) AS sort_key
          FROM public.purchase_supplier_payments sp
          WHERE sp.organization_id=v_org AND sp.payment_date=v_shift.business_date AND sp.status<>'void'
        ) payment_rows
        ORDER BY sort_key
        LIMIT 60
      ) payment_limited;
  END IF;

  IF v_can_purchase THEN
    SELECT count(*)::integer INTO v_receipt_count
      FROM public.purchase_receipts r
      WHERE r.organization_id=v_org
        AND (r.received_at AT TIME ZONE v_shift.organization_time_zone)::date=v_shift.business_date;
    SELECT coalesce(pg_catalog.jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb)
      INTO v_receipt_items
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'id','receipt:'||r.id::text,'sourceKey','RECEIPTS','sourceRef',r.id::text,
          'title','استلام '||r.receipt_number,'summary','استلام فعلي مسجل في المستودع.',
          'state','RESOLVED','severity','INFO','updatedAt',r.received_at,
          'ownerProfileId',r.received_by,'dueAt',NULL,
          'amount',NULL,'currency',NULL,'evidenceIds',pg_catalog.jsonb_build_array('E_RECEIPTS')
        ) AS row_value,r.received_at AS sort_key
        FROM public.purchase_receipts r
        WHERE r.organization_id=v_org
          AND (r.received_at AT TIME ZONE v_shift.organization_time_zone)::date=v_shift.business_date
        ORDER BY r.received_at,r.id
        LIMIT 60
      ) receipt_rows;
  END IF;

  IF v_can_staff THEN
    SELECT count(*)::integer INTO v_inventory_count
      FROM (
        SELECT ib.id
          FROM public.inventory_balances ib
          JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
          JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org AND w.is_active
         WHERE coalesce(ib.quantity_available,0)<=coalesce(ib.reorder_point,0)
        UNION ALL
        SELECT line.id
          FROM public.stock_count_lines line
          JOIN public.stock_count_sessions session
            ON session.id=line.session_id AND session.organization_id=line.organization_id
         WHERE line.organization_id=v_org AND session.status IN ('open','completed')
           AND line.variance IS NOT NULL AND line.variance<>0
           AND (session.started_at AT TIME ZONE v_shift.organization_time_zone)::date=v_shift.business_date
      ) inventory_sources;
    SELECT coalesce(pg_catalog.jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb)
      INTO v_inventory_items
      FROM (
        SELECT row_value,sort_key FROM (
          SELECT pg_catalog.jsonb_build_object(
            'id','stock:'||ib.id::text,'sourceKey','INVENTORY','sourceRef',ib.id::text,
            'title','مخزون منخفض: '||coalesce(p.item_code,p.name,ib.product_id::text),
            'summary','المتاح: '||coalesce(ib.quantity_available,0)::text||'؛ حد إعادة الطلب: '||coalesce(ib.reorder_point,0)::text,
            'state',CASE WHEN coalesce(ib.quantity_available,0)<=0 THEN 'BLOCKED' ELSE 'OPEN' END,
            'severity',CASE WHEN coalesce(ib.quantity_available,0)<=0 THEN 'CRITICAL' ELSE 'WARNING' END,
            'updatedAt',coalesce(ib.updated_at,ib.created_at,v_as_of),
            'ownerProfileId',NULL,'dueAt',NULL,'amount',NULL,'currency',NULL,
            'evidenceIds',pg_catalog.jsonb_build_array('E_INVENTORY')
          ) AS row_value,coalesce(ib.last_movement_at,ib.updated_at,ib.created_at) AS sort_key
          FROM public.inventory_balances ib
          JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
          JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org AND w.is_active
          WHERE coalesce(ib.quantity_available,0)<=coalesce(ib.reorder_point,0)
          UNION ALL
          SELECT pg_catalog.jsonb_build_object(
            'id','variance:'||line.id::text,'sourceKey','INVENTORY','sourceRef',line.id::text,
            'title','فرق جرد: '||coalesce(line.product_code,line.product_name,line.product_id::text),
            'summary','المتوقع: '||line.expected_quantity::text||'؛ المعدود: '||coalesce(line.counted_quantity,0)::text||'؛ الفرق: '||line.variance::text,
            'state','BLOCKED','severity','CRITICAL',
            'updatedAt',coalesce(line.completed_at,session.started_at,v_as_of),
            'ownerProfileId',session.started_by,'dueAt',NULL,'amount',NULL,'currency',NULL,
            'evidenceIds',pg_catalog.jsonb_build_array('E_INVENTORY')
          ) AS row_value,coalesce(line.completed_at,session.started_at) AS sort_key
          FROM public.stock_count_lines line
          JOIN public.stock_count_sessions session
            ON session.id=line.session_id AND session.organization_id=line.organization_id
          WHERE line.organization_id=v_org AND session.status IN ('open','completed')
            AND line.variance IS NOT NULL AND line.variance<>0
            AND (session.started_at AT TIME ZONE v_shift.organization_time_zone)::date=v_shift.business_date
        ) inventory_rows
        ORDER BY sort_key
        LIMIT 60
      ) inventory_limited;

    SELECT count(*)::integer INTO v_alert_count
      FROM public.ai_alerts a
      WHERE a.organization_id=v_org AND NOT a.is_resolved;
    SELECT coalesce(pg_catalog.jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb)
      INTO v_alert_items
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'id','alert:'||a.id::text,'sourceKey','REMINDERS','sourceRef',a.id::text,
          'title',a.title,'summary',a.body,
          'state','OPEN',
          'severity',CASE WHEN lower(a.severity)='critical' THEN 'CRITICAL'
            WHEN lower(a.severity)='warning' THEN 'WARNING' ELSE 'INFO' END,
          'updatedAt',a.created_at,'ownerProfileId',NULL,'dueAt',NULL,
          'amount',NULL,'currency',NULL,'evidenceIds',pg_catalog.jsonb_build_array('E_REMINDERS')
        ) AS row_value,a.created_at AS sort_key
        FROM public.ai_alerts a
        WHERE a.organization_id=v_org AND NOT a.is_resolved
        ORDER BY CASE lower(a.severity) WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          a.created_at,a.id
        LIMIT 60
      ) alert_rows;
  END IF;

  v_items:=v_task_items||v_order_items||v_invoice_items||v_receipt_items||
    v_payment_items||v_inventory_items||v_alert_items;

  IF v_shift.previous_shift_id IS NOT NULL THEN
    SELECT s.* INTO v_previous FROM public.operational_shifts s
      WHERE s.id=v_shift.previous_shift_id AND s.organization_id=v_org;
    SELECT e.* INTO v_handover_record
      FROM public.operational_shift_handover_events e
      WHERE e.organization_id=v_org AND e.previous_shift_id=v_shift.previous_shift_id
        AND e.current_shift_id=v_shift.id AND e.action='RECORDED'
      ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
    IF FOUND THEN
      SELECT a.created_at INTO v_accepted_at
        FROM public.operational_shift_handover_events a
        WHERE a.organization_id=v_org AND a.handover_id=v_handover_record.id AND a.action='ACCEPTED'
        ORDER BY a.created_at DESC LIMIT 1;
    ELSE
      v_accepted_at:=NULL;
    END IF;
  END IF;

  v_evidence:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id','E_TASKS','source',pg_catalog.jsonb_build_object('kind','TABLE','name','ai_tasks','recordId',v_shift.id::text),
      'sourceTimestamp',v_as_of,'asOf',v_as_of,'period',v_period,'status',CASE WHEN v_task_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
      'completeness',CASE WHEN v_task_count<=250 THEN 'COMPLETE' ELSE 'PARTIAL' END,
      'quality',CASE WHEN v_task_count<=250 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'warnings','[]'::jsonb
    ),
    pg_catalog.jsonb_build_object(
      'id','E_ORDERS','source',pg_catalog.jsonb_build_object('kind','TABLE','name','orders','recordId',v_shift.id::text),
      'sourceTimestamp',v_as_of,'asOf',v_as_of,'period',v_period,'status',CASE WHEN v_order_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
      'completeness',CASE WHEN v_order_count<=250 THEN 'COMPLETE' ELSE 'PARTIAL' END,
      'quality',CASE WHEN v_order_count<=250 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'warnings','[]'::jsonb
    )
  );


  IF v_can_finance THEN
    v_evidence:=v_evidence||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id','E_INVOICES','source',pg_catalog.jsonb_build_object('kind','TABLE','name','customer_invoices','recordId',v_shift.id::text),'sourceTimestamp',v_as_of,'asOf',v_as_of,'period',v_period,'status',CASE WHEN v_invoice_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,'completeness',CASE WHEN v_invoice_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END,'quality',CASE WHEN v_invoice_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'warnings','[]'::jsonb),
      pg_catalog.jsonb_build_object('id','E_PAYMENTS','source',pg_catalog.jsonb_build_object('kind','TABLE','name','customer_payments+purchase_supplier_payments','recordId',v_shift.id::text),'sourceTimestamp',v_as_of,'asOf',v_as_of,'period',v_period,'status',CASE WHEN v_payment_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,'completeness',CASE WHEN v_payment_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END,'quality',CASE WHEN v_payment_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'warnings','[]'::jsonb)
    );
  END IF;
  IF v_can_purchase THEN
    v_evidence:=v_evidence||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id','E_RECEIPTS','source',pg_catalog.jsonb_build_object('kind','TABLE','name','purchase_receipts','recordId',v_shift.id::text),'sourceTimestamp',v_as_of,'asOf',v_as_of,'period',v_period,'status',CASE WHEN v_receipt_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,'completeness',CASE WHEN v_receipt_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END,'quality',CASE WHEN v_receipt_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'warnings','[]'::jsonb)
    );
  END IF;
  IF v_can_staff THEN
    v_evidence:=v_evidence||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id','E_INVENTORY','source',pg_catalog.jsonb_build_object('kind','TABLE','name','inventory_balances+stock_count_lines','recordId',v_shift.id::text),'sourceTimestamp',v_as_of,'asOf',v_as_of,'period',v_period,'status',CASE WHEN v_inventory_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,'completeness',CASE WHEN v_inventory_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END,'quality',CASE WHEN v_inventory_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'warnings','[]'::jsonb),
      pg_catalog.jsonb_build_object('id','E_REMINDERS','source',pg_catalog.jsonb_build_object('kind','TABLE','name','ai_alerts','recordId',v_shift.id::text),'sourceTimestamp',v_as_of,'asOf',v_as_of,'period',v_period,'status',CASE WHEN v_alert_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,'completeness',CASE WHEN v_alert_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END,'quality',CASE WHEN v_alert_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'warnings','[]'::jsonb)
    );
  END IF;

  v_coverage:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('key','CONNECTIVITY','status','UNAVAILABLE','completeness','UNKNOWN','quality','UNKNOWN','asOf',NULL,'period',NULL,'freshnessLimitMinutes',15,'expectedCount',NULL,'returnedCount',NULL,'completePopulation',false,'notApplicable',false,'closeCritical',false,'evidenceIds','[]'::jsonb,'message','مصدر فحص الاتصال والمزامنة غير مربوط بعد.'),
    pg_catalog.jsonb_build_object('key','TASKS','status',CASE WHEN v_task_count<=250 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,'completeness',CASE WHEN v_task_count<=250 THEN 'COMPLETE' ELSE 'PARTIAL' END,'quality',CASE WHEN v_task_count<=250 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'asOf',v_as_of,'period',v_period,'freshnessLimitMinutes',30,'expectedCount',v_task_count,'returnedCount',pg_catalog.jsonb_array_length(v_task_items),'completePopulation',v_task_count<=250,'notApplicable',false,'closeCritical',false,'evidenceIds',pg_catalog.jsonb_build_array('E_TASKS'),'message','سجلات صندوق المهام الفعلية ضمن نطاق الدور المصرح للمستخدم.'),
    pg_catalog.jsonb_build_object('key','ORDERS','status',CASE WHEN v_order_count<=250 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,'completeness',CASE WHEN v_order_count<=250 THEN 'COMPLETE' ELSE 'PARTIAL' END,'quality',CASE WHEN v_order_count<=250 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,'asOf',v_as_of,'period',v_period,'freshnessLimitMinutes',60,'expectedCount',v_order_count,'returnedCount',pg_catalog.jsonb_array_length(v_order_items),'completePopulation',v_order_count<=250,'notApplicable',false,'closeCritical',true,'evidenceIds',pg_catalog.jsonb_build_array('E_ORDERS'),'message','الطلبات المفتوحة المنشأة في تاريخ العمل وفق المنطقة الزمنية المسجلة للوردية.'),
    pg_catalog.jsonb_build_object('key','INVOICES','status',CASE WHEN v_can_finance THEN CASE WHEN v_invoice_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END ELSE 'UNAVAILABLE' END,'completeness',CASE WHEN v_can_finance THEN CASE WHEN v_invoice_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END ELSE 'UNKNOWN' END,'quality',CASE WHEN v_can_finance THEN CASE WHEN v_invoice_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END ELSE 'UNKNOWN' END,'asOf',CASE WHEN v_can_finance THEN v_as_of ELSE NULL END,'period',CASE WHEN v_can_finance THEN v_period ELSE NULL END,'freshnessLimitMinutes',60,'expectedCount',CASE WHEN v_can_finance THEN v_invoice_count ELSE NULL END,'returnedCount',CASE WHEN v_can_finance THEN pg_catalog.jsonb_array_length(v_invoice_items) ELSE NULL END,'completePopulation',v_can_finance AND v_invoice_count<=60,'notApplicable',false,'closeCritical',true,'evidenceIds',CASE WHEN v_can_finance THEN pg_catalog.jsonb_build_array('E_INVOICES') ELSE '[]'::jsonb END,'message',CASE WHEN v_can_finance THEN 'الفواتير الصادرة وغير المسددة من السجل المالي الفعلي.' ELSE 'مصدر الفواتير غير متاح لهذا الدور.' END),
    pg_catalog.jsonb_build_object('key','RECEIPTS','status',CASE WHEN v_can_purchase THEN CASE WHEN v_receipt_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END ELSE 'UNAVAILABLE' END,'completeness',CASE WHEN v_can_purchase THEN CASE WHEN v_receipt_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END ELSE 'UNKNOWN' END,'quality',CASE WHEN v_can_purchase THEN CASE WHEN v_receipt_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END ELSE 'UNKNOWN' END,'asOf',CASE WHEN v_can_purchase THEN v_as_of ELSE NULL END,'period',CASE WHEN v_can_purchase THEN v_period ELSE NULL END,'freshnessLimitMinutes',60,'expectedCount',CASE WHEN v_can_purchase THEN v_receipt_count ELSE NULL END,'returnedCount',CASE WHEN v_can_purchase THEN pg_catalog.jsonb_array_length(v_receipt_items) ELSE NULL END,'completePopulation',v_can_purchase AND v_receipt_count<=60,'notApplicable',false,'closeCritical',true,'evidenceIds',CASE WHEN v_can_purchase THEN pg_catalog.jsonb_build_array('E_RECEIPTS') ELSE '[]'::jsonb END,'message',CASE WHEN v_can_purchase THEN 'الاستلامات الفعلية المسجلة في يوم العمل.' ELSE 'مصدر الاستلامات غير متاح لهذا الدور.' END),
    pg_catalog.jsonb_build_object('key','PAYMENTS','status',CASE WHEN v_can_finance THEN CASE WHEN v_payment_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END ELSE 'UNAVAILABLE' END,'completeness',CASE WHEN v_can_finance THEN CASE WHEN v_payment_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END ELSE 'UNKNOWN' END,'quality',CASE WHEN v_can_finance THEN CASE WHEN v_payment_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END ELSE 'UNKNOWN' END,'asOf',CASE WHEN v_can_finance THEN v_as_of ELSE NULL END,'period',CASE WHEN v_can_finance THEN v_period ELSE NULL END,'freshnessLimitMinutes',15,'expectedCount',CASE WHEN v_can_finance THEN v_payment_count ELSE NULL END,'returnedCount',CASE WHEN v_can_finance THEN pg_catalog.jsonb_array_length(v_payment_items) ELSE NULL END,'completePopulation',v_can_finance AND v_payment_count<=60,'notApplicable',false,'closeCritical',true,'evidenceIds',CASE WHEN v_can_finance THEN pg_catalog.jsonb_build_array('E_PAYMENTS') ELSE '[]'::jsonb END,'message',CASE WHEN v_can_finance THEN 'حركات قبض العملاء ودفعات الموردين المسجلة في يوم العمل.' ELSE 'مصدر المقبوضات والمدفوعات غير متاح لهذا الدور.' END),
    pg_catalog.jsonb_build_object('key','CASH','status',CASE WHEN v_can_finance THEN 'VERIFIED' ELSE 'UNAVAILABLE' END,'completeness',CASE WHEN v_can_finance THEN 'COMPLETE' ELSE 'UNKNOWN' END,'quality',CASE WHEN v_can_finance THEN 'ACCEPTABLE' ELSE 'UNKNOWN' END,'asOf',CASE WHEN v_can_finance THEN v_as_of ELSE NULL END,'period',CASE WHEN v_can_finance THEN v_period ELSE NULL END,'freshnessLimitMinutes',60,'expectedCount',CASE WHEN v_can_finance THEN v_currency_count ELSE NULL END,'returnedCount',CASE WHEN v_can_finance THEN v_currency_count ELSE NULL END,'completePopulation',v_can_finance,'notApplicable',false,'closeCritical',true,'evidenceIds',CASE WHEN v_can_finance THEN pg_catalog.jsonb_build_array('E_CASH') ELSE '[]'::jsonb END,'message',CASE WHEN v_can_finance THEN 'مصدر العد النقدي يعرض القيود المسجلة فقط؛ لا يستنتج الرصيد المتوقع.' ELSE 'قراءة عهدة الصندوق تتطلب صلاحية مالية.' END),
    pg_catalog.jsonb_build_object('key','MOVEMENTS','status','UNAVAILABLE','completeness','UNKNOWN','quality','UNKNOWN','asOf',NULL,'period',NULL,'freshnessLimitMinutes',15,'expectedCount',NULL,'returnedCount',NULL,'completePopulation',false,'notApplicable',false,'closeCritical',true,'evidenceIds','[]'::jsonb,'message','حالة إرسال حركات المخزون إلى الأنظمة الأخرى غير مثبتة.'),
    pg_catalog.jsonb_build_object('key','DELIVERIES','status','UNAVAILABLE','completeness','UNKNOWN','quality','UNKNOWN','asOf',NULL,'period',NULL,'freshnessLimitMinutes',30,'expectedCount',NULL,'returnedCount',NULL,'completePopulation',false,'notApplicable',false,'closeCritical',true,'evidenceIds','[]'::jsonb,'message','مصدر تجهيزات التوصيل غير مربوط بعد.'),
    pg_catalog.jsonb_build_object('key','INVENTORY','status',CASE WHEN v_can_staff THEN CASE WHEN v_inventory_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END ELSE 'UNAVAILABLE' END,'completeness',CASE WHEN v_can_staff THEN CASE WHEN v_inventory_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END ELSE 'UNKNOWN' END,'quality',CASE WHEN v_can_staff THEN CASE WHEN v_inventory_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END ELSE 'UNKNOWN' END,'asOf',CASE WHEN v_can_staff THEN v_as_of ELSE NULL END,'period',CASE WHEN v_can_staff THEN v_period ELSE NULL END,'freshnessLimitMinutes',30,'expectedCount',CASE WHEN v_can_staff THEN v_inventory_count ELSE NULL END,'returnedCount',CASE WHEN v_can_staff THEN pg_catalog.jsonb_array_length(v_inventory_items) ELSE NULL END,'completePopulation',v_can_staff AND v_inventory_count<=60,'notApplicable',false,'closeCritical',true,'evidenceIds',CASE WHEN v_can_staff THEN pg_catalog.jsonb_build_array('E_INVENTORY') ELSE '[]'::jsonb END,'message',CASE WHEN v_can_staff THEN 'أرصدة إعادة الطلب وفروق الجرد المسجلة من السجلات الفعلية.' ELSE 'مصدر المخزون غير متاح لهذا الدور.' END),
    pg_catalog.jsonb_build_object('key','REMINDERS','status',CASE WHEN v_can_staff THEN CASE WHEN v_alert_count<=60 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END ELSE 'UNAVAILABLE' END,'completeness',CASE WHEN v_can_staff THEN CASE WHEN v_alert_count<=60 THEN 'COMPLETE' ELSE 'PARTIAL' END ELSE 'UNKNOWN' END,'quality',CASE WHEN v_can_staff THEN CASE WHEN v_alert_count<=60 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END ELSE 'UNKNOWN' END,'asOf',CASE WHEN v_can_staff THEN v_as_of ELSE NULL END,'period',CASE WHEN v_can_staff THEN v_period ELSE NULL END,'freshnessLimitMinutes',30,'expectedCount',CASE WHEN v_can_staff THEN v_alert_count ELSE NULL END,'returnedCount',CASE WHEN v_can_staff THEN pg_catalog.jsonb_array_length(v_alert_items) ELSE NULL END,'completePopulation',v_can_staff AND v_alert_count<=60,'notApplicable',false,'closeCritical',false,'evidenceIds',CASE WHEN v_can_staff THEN pg_catalog.jsonb_build_array('E_REMINDERS') ELSE '[]'::jsonb END,'message',CASE WHEN v_can_staff THEN 'التنبيهات التشغيلية غير المحلولة من سجل التنبيهات.' ELSE 'مصدر التنبيهات غير متاح لهذا الدور.' END),
    pg_catalog.jsonb_build_object('key','HANDOVER','status',CASE WHEN v_shift.previous_shift_id IS NULL THEN 'VERIFIED' ELSE 'VERIFIED' END,'completeness','COMPLETE','quality','ACCEPTABLE','asOf',v_as_of,'period',v_period,'freshnessLimitMinutes',60,'expectedCount',CASE WHEN v_shift.previous_shift_id IS NULL THEN NULL ELSE 1 END,'returnedCount',CASE WHEN v_shift.previous_shift_id IS NULL THEN NULL WHEN v_handover_record.id IS NULL THEN 0 ELSE 1 END,'completePopulation',true,'notApplicable',v_shift.previous_shift_id IS NULL,'closeCritical',true,'evidenceIds',CASE WHEN v_shift.previous_shift_id IS NULL THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('E_HANDOVER') END,'message',CASE WHEN v_shift.previous_shift_id IS NULL THEN 'لا توجد وردية سابقة تتطلب التسليم.' ELSE 'حالة سجل تسليم الوردية السابقة.' END)
  );

  IF v_can_finance THEN
  WITH latest_counts AS (
    SELECT DISTINCT ON (c.currency,c.phase) c.*
      FROM public.operational_shift_cash_counts c
      WHERE c.organization_id=v_org AND c.shift_id=v_shift.id
      ORDER BY c.currency,c.phase,c.version DESC,c.created_at DESC
  ),
  cash_rows AS (
    SELECT currency,
      pg_catalog.max(created_at) AS source_as_of,
      pg_catalog.max(id::text) FILTER (WHERE phase='OPENING') AS opening_id,
      pg_catalog.max(counted_amount) FILTER (WHERE phase='OPENING') AS opening_amount,
      pg_catalog.max(id::text) FILTER (WHERE phase='CLOSING') AS closing_id,
      pg_catalog.max(counted_amount) FILTER (WHERE phase='CLOSING') AS closing_amount
    FROM latest_counts GROUP BY currency
  )
  SELECT count(*)::integer,
         coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'currency',currency,'sourceAsOf',source_as_of,
             'opening',pg_catalog.jsonb_build_object(
               'expected',NULL,'counted',opening_amount,'expectedEvidenceIds','[]'::jsonb,
               'countEvidenceIds',CASE WHEN opening_id IS NULL THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('E_CASH:'||opening_id) END,
               'notApplicable',false
             ),
             'closing',pg_catalog.jsonb_build_object(
               'expected',NULL,'counted',closing_amount,'expectedEvidenceIds','[]'::jsonb,
               'countEvidenceIds',CASE WHEN closing_id IS NULL THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('E_CASH:'||closing_id) END,
               'notApplicable',false
             )
           ) ORDER BY currency
         ),'[]'::jsonb)
    INTO v_currency_count,v_cash_controls
    FROM cash_rows;

  SELECT coalesce(v_evidence||pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id','E_CASH:'||c.id::text,
      'source',pg_catalog.jsonb_build_object('kind','TABLE','name','operational_shift_cash_counts','recordId',c.id::text),
      'sourceTimestamp',c.created_at,'asOf',v_as_of,'period',v_period,
      'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
    )
  ),v_evidence)
  INTO v_evidence
  FROM (
    SELECT DISTINCT ON (currency,phase) id,created_at,currency,phase,version
    FROM public.operational_shift_cash_counts
    WHERE organization_id=v_org AND shift_id=v_shift.id
    ORDER BY currency,phase,version DESC,created_at DESC
  ) c;
  END IF;


  IF v_shift.previous_shift_id IS NULL THEN
    v_handover:=pg_catalog.jsonb_build_object(
      'required',false,'previousShiftId',NULL,'currentShiftId',v_shift.id,
      'outgoingOwnerProfileId',NULL,'incomingOwnerProfileId',NULL,
      'recordedAt',NULL,'acceptedAt',NULL,'reason',NULL,'note',NULL,
      'openItemRefs','[]'::jsonb,'evidenceIds','[]'::jsonb
    );
  ELSE
    v_evidence:=v_evidence||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id','E_HANDOVER','source',pg_catalog.jsonb_build_object('kind','TABLE','name','operational_shift_handover_events','recordId',v_shift.id::text),
        'sourceTimestamp',coalesce(v_handover_record.created_at,v_as_of),'asOf',v_as_of,'period',v_period,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      )
    );
    v_handover:=pg_catalog.jsonb_build_object(
      'required',true,'previousShiftId',v_shift.previous_shift_id,'currentShiftId',v_shift.id,
      'outgoingOwnerProfileId',v_previous.owner_profile_id,
      'incomingOwnerProfileId',v_shift.owner_profile_id,
      'recordedAt',v_handover_record.created_at,'acceptedAt',v_accepted_at,
      'reason',v_handover_record.reason,'note',v_handover_record.note,
      'openItemRefs',coalesce(v_handover_record.open_item_refs,'[]'::jsonb),
      'evidenceIds',pg_catalog.jsonb_build_array('E_HANDOVER')
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_shift.id,'shiftId',v_shift.id,'previousShiftId',v_shift.previous_shift_id,
    'shiftLabel',v_shift.shift_label,'businessDate',v_shift.business_date,
    'organizationTimeZone',v_shift.organization_time_zone,
    'asOf',v_as_of,'generatedAt',pg_catalog.now(),
    'currentOwnerProfileId',v_shift.owner_profile_id,
    'sourceCoverage',v_coverage,'items',v_items,
    'cashControls',v_cash_controls,'handover',v_handover,
    'evidenceRecords',v_evidence
  );
END;
$function$;



CREATE OR REPLACE FUNCTION public.capture_operational_shift_snapshot(
  p_shift_id uuid,
  p_snapshot_kind text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_shift public.operational_shifts%ROWTYPE;
  v_kind text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_snapshot_kind,'')));
  v_payload jsonb;
  v_fingerprint text;
  v_existing public.operational_shift_workspace_snapshots%ROWTYPE;
  v_version integer;
  v_saved public.operational_shift_workspace_snapshots%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT (public.is_staff() OR public.can_manage_finance()) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff or finance permission required to save a shift snapshot';
  END IF;
  IF p_shift_id IS NULL OR p_idempotency_key IS NULL OR v_kind NOT IN ('OPENING','CLOSEOUT') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shift, snapshot kind and idempotency key are required';
  END IF;
  SELECT s.* INTO v_shift FROM public.operational_shifts s
    WHERE s.id=p_shift_id AND s.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='shift is unavailable in this organization';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'shift_id',p_shift_id,'snapshot_kind',v_kind
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':shift-snapshot-key:'||p_idempotency_key::text,0)
  );
  SELECT s.* INTO v_existing FROM public.operational_shift_workspace_snapshots s
    WHERE s.organization_id=v_org AND s.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='shift snapshot idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'snapshot_id',v_existing.id,'snapshot_kind',v_existing.snapshot_kind,
      'version',v_existing.version,'captured_at',v_existing.captured_at,'idempotent_replay',true
    );
  END IF;
  v_payload:=public.fetch_operational_shift_workspace(v_shift.business_date,v_shift.id);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':shift-snapshot-version:'||p_shift_id::text||':'||v_kind,0)
  );
  SELECT coalesce(max(s.version),0)+1 INTO v_version
    FROM public.operational_shift_workspace_snapshots s
    WHERE s.organization_id=v_org AND s.shift_id=p_shift_id AND s.snapshot_kind=v_kind;
  INSERT INTO public.operational_shift_workspace_snapshots(
    organization_id,shift_id,snapshot_kind,version,payload,source_fingerprint,
    captured_by_profile_id,idempotency_key,payload_fingerprint
  ) VALUES(
    v_org,p_shift_id,v_kind,v_version,v_payload,pg_catalog.md5(v_payload::text),
    v_actor,p_idempotency_key,v_fingerprint
  ) RETURNING * INTO v_saved;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'operational_shift.snapshot_captured','operational_shift_snapshot',v_saved.id,
    pg_catalog.jsonb_build_object('shift_id',p_shift_id,'snapshot_kind',v_kind,'version',v_version,'source_fingerprint',v_saved.source_fingerprint));
  RETURN pg_catalog.jsonb_build_object(
    'snapshot_id',v_saved.id,'snapshot_kind',v_saved.snapshot_kind,
    'version',v_saved.version,'captured_at',v_saved.captured_at,'idempotent_replay',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_operational_shift_snapshot(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_snapshot public.operational_shift_workspace_snapshots%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL
     OR NOT (public.is_staff() OR public.can_manage_finance()) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff or finance permission required to read a saved shift snapshot';
  END IF;
  SELECT s.* INTO v_snapshot FROM public.operational_shift_workspace_snapshots s
    WHERE s.id=p_snapshot_id AND s.organization_id=v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='saved shift snapshot not found in this organization';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(coalesce(v_snapshot.payload->'sourceCoverage','[]'::jsonb)) AS coverage(value)
     WHERE coverage.value->>'key' IN ('CASH','INVOICES','PAYMENTS')
       AND coverage.value->>'status' IN ('VERIFIED','NEEDS_REVIEW','UNVERIFIED')
  ) AND NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read financial content in this shift snapshot';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'snapshot_id',v_snapshot.id,'snapshot_kind',v_snapshot.snapshot_kind,
    'version',v_snapshot.version,'captured_at',v_snapshot.captured_at,
    'source_fingerprint',v_snapshot.source_fingerprint,'payload',v_snapshot.payload
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.start_operational_shift(date,text,text,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_operational_shift_cash_count(uuid,text,text,numeric,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_operational_shift_handover(uuid,jsonb,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.accept_operational_shift_handover(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_operational_shift_workspace(date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.capture_operational_shift_snapshot(uuid,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_operational_shift_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_operational_shift(date,text,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_operational_shift_cash_count(uuid,text,text,numeric,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_operational_shift_handover(uuid,jsonb,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_operational_shift_handover(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_operational_shift_workspace(date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.capture_operational_shift_snapshot(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_operational_shift_snapshot(uuid) TO authenticated;

COMMENT ON TABLE public.operational_shifts IS
  'Tenant-scoped shift identity and owner references; opened only through start_operational_shift.';
COMMENT ON TABLE public.operational_shift_cash_counts IS
  'Append-only, currency-isolated physical cash counts. Expected balances and approvals are never inferred.';
COMMENT ON TABLE public.operational_shift_handover_events IS
  'Append-only, source-validated shift handover and incoming-owner acceptance events.';
COMMENT ON TABLE public.operational_shift_workspace_snapshots IS
  'Immutable, versioned opening and operational closeout evidence snapshots; never posts accounting or stock movements.';
COMMENT ON FUNCTION public.fetch_operational_shift_workspace(date,uuid) IS
  'Returns an authenticated shift evidence DTO; unavailable source integrations remain explicitly unavailable.';

COMMIT;
