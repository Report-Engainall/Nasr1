-- AGH-FINANCE-OPERATING-COMMITMENTS-002
-- Add a separately audited rejection transition and enforce the due-date horizon in PostgreSQL.
BEGIN;

ALTER TABLE public.cash_expense_commitments
  ADD COLUMN rejected_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN rejection_reason text;

ALTER TABLE public.cash_expense_commitments
  DROP CONSTRAINT IF EXISTS cash_expense_commitments_status_check,
  DROP CONSTRAINT IF EXISTS cash_expense_commitments_check;

ALTER TABLE public.cash_expense_commitments
  ADD CONSTRAINT cash_expense_commitments_lifecycle_check CHECK (
    (status='pending_approval'
      AND approved_by_profile_id IS NULL AND approved_at IS NULL AND approval_reason IS NULL
      AND rejected_by_profile_id IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL
      AND cancelled_by_profile_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND payment_cash_expense_id IS NULL AND payment_recorded_by_profile_id IS NULL AND payment_recorded_at IS NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL)
    OR
    (status='approved'
      AND approved_by_profile_id IS NOT NULL AND approved_at IS NOT NULL
      AND char_length(btrim(coalesce(approval_reason,''))) BETWEEN 3 AND 500
      AND rejected_by_profile_id IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL
      AND cancelled_by_profile_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND payment_cash_expense_id IS NULL AND payment_recorded_by_profile_id IS NULL AND payment_recorded_at IS NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL)
    OR
    (status='rejected'
      AND approved_by_profile_id IS NULL AND approved_at IS NULL AND approval_reason IS NULL
      AND rejected_by_profile_id IS NOT NULL AND rejected_at IS NOT NULL
      AND char_length(btrim(coalesce(rejection_reason,''))) BETWEEN 3 AND 500
      AND cancelled_by_profile_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND payment_cash_expense_id IS NULL AND payment_recorded_by_profile_id IS NULL AND payment_recorded_at IS NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL)
    OR
    (status='cancelled'
      AND cancelled_by_profile_id IS NOT NULL AND cancelled_at IS NOT NULL
      AND char_length(btrim(coalesce(cancellation_reason,''))) BETWEEN 5 AND 500
      AND rejected_by_profile_id IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL
      AND payment_cash_expense_id IS NULL AND payment_recorded_by_profile_id IS NULL AND payment_recorded_at IS NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL
      AND (
        (approved_by_profile_id IS NULL AND approved_at IS NULL AND approval_reason IS NULL)
        OR
        (approved_by_profile_id IS NOT NULL AND approved_at IS NOT NULL
          AND char_length(btrim(coalesce(approval_reason,''))) BETWEEN 3 AND 500)
      ))
    OR
    (status='payment_recorded'
      AND approved_by_profile_id IS NOT NULL AND approved_at IS NOT NULL
      AND char_length(btrim(coalesce(approval_reason,''))) BETWEEN 3 AND 500
      AND rejected_by_profile_id IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL
      AND cancelled_by_profile_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND payment_cash_expense_id IS NOT NULL AND payment_recorded_by_profile_id IS NOT NULL AND payment_recorded_at IS NOT NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL)
    OR
    (status='settled'
      AND approved_by_profile_id IS NOT NULL AND approved_at IS NOT NULL
      AND char_length(btrim(coalesce(approval_reason,''))) BETWEEN 3 AND 500
      AND rejected_by_profile_id IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL
      AND cancelled_by_profile_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND payment_cash_expense_id IS NOT NULL AND payment_recorded_by_profile_id IS NOT NULL AND payment_recorded_at IS NOT NULL
      AND settled_by_profile_id IS NOT NULL AND settled_at IS NOT NULL)
  );

ALTER TABLE public.cash_expense_commitments
  ADD CONSTRAINT cash_expense_commitments_rejector_not_creator
  CHECK(rejected_by_profile_id IS NULL OR rejected_by_profile_id<>created_by_profile_id);

ALTER TABLE public.cash_expense_commitment_events
  DROP CONSTRAINT IF EXISTS cash_expense_commitment_events_event_type_check;
ALTER TABLE public.cash_expense_commitment_events
  ADD CONSTRAINT cash_expense_commitment_events_event_type_check CHECK(event_type IN (
    'CREATED','EVIDENCE_ATTACHED','APPROVED','REJECTED','CANCELLED','PAYMENT_RECORDED','SETTLED'
  ));

CREATE OR REPLACE FUNCTION public.guard_cash_expense_commitment_due_date()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $function$
DECLARE
  v_today date:=(pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NEW.due_date<v_today OR NEW.due_date>(v_today+interval '10 years')::date THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='operating expense commitment due date must be today through ten years ahead';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_cash_expense_commitment_due_date() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS cash_expense_commitment_due_date_guard ON public.cash_expense_commitments;
CREATE TRIGGER cash_expense_commitment_due_date_guard
BEFORE INSERT OR UPDATE OF due_date ON public.cash_expense_commitments
FOR EACH ROW EXECUTE FUNCTION public.guard_cash_expense_commitment_due_date();

CREATE OR REPLACE FUNCTION public.reject_cash_expense_commitment(
  p_commitment_id uuid,p_reason text,p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_reason text:=pg_catalog.btrim(coalesce(p_reason,''));
  v_fingerprint text;
  v_row public.cash_expense_commitments%ROWTYPE;
  v_event public.cash_expense_commitment_events%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true
    AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='an active finance administrator or manager is required to reject an expense commitment';
  END IF;
  IF p_commitment_id IS NULL OR p_idempotency_key IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment, rejection reason and idempotency key are required';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action','REJECT','commitment_id',p_commitment_id,'reason',v_reason
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_org::text||':cash-expense-commitment-event:'||p_idempotency_key::text,0
  ));
  SELECT e.* INTO v_event FROM public.cash_expense_commitment_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_event.event_type<>'REJECTED' OR v_event.payload_fingerprint<>v_fingerprint
       OR v_event.actor_profile_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='expense commitment rejection idempotency payload conflict';
    END IF;
    RETURN v_event.event_payload||pg_catalog.jsonb_build_object('replayed',true);
  END IF;
  SELECT c.* INTO v_row FROM public.cash_expense_commitments c
   WHERE c.id=p_commitment_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='expense commitment not found in this organization'; END IF;
  IF v_row.created_by_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='commitment creator cannot reject their own request';
  END IF;
  IF v_row.status<>'pending_approval' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a pending expense commitment can be rejected';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e
    WHERE e.organization_id=v_org AND e.commitment_id=v_row.id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a registered source document is required before rejection review';
  END IF;
  UPDATE public.cash_expense_commitments
     SET status='rejected',rejected_by_profile_id=v_actor,rejected_at=statement_timestamp(),
         rejection_reason=v_reason,updated_at=statement_timestamp()
   WHERE organization_id=v_org AND id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload
  ) VALUES(
    v_org,v_row.id,'REJECTED',v_actor,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,
      'status',v_row.status,'rejected_at',v_row.rejected_at,'replayed',false)
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.rejected','cash_expense_commitment',v_row.id,
    pg_catalog.jsonb_build_object('status','pending_approval'),
    pg_catalog.jsonb_build_object('status','rejected','reason',v_reason));
  RETURN pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,
    'status',v_row.status,'rejected_at',v_row.rejected_at,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_cash_expense_commitment(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reject_cash_expense_commitment(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_cash_expense_commitments(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_limit integer:=coalesce(p_limit,50);
  v_offset integer:=coalesce(p_offset,0);
  v_items jsonb;
  v_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read operating expense commitments';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid operating expense commitment page bounds';
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.cash_expense_commitments c WHERE c.organization_id=v_org;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',q.id,'commitment_number',q.commitment_number::text,'category',q.category,'description',q.description,
    'amount',q.amount::text,'currency',q.currency,'payment_method',q.payment_method,'reference',q.reference,
    'due_date',q.due_date::text,'status',q.status,'created_by_profile_id',q.created_by_profile_id,
    'approved_by_profile_id',q.approved_by_profile_id,'approved_at',q.approved_at,'approval_reason',q.approval_reason,
    'cancelled_by_profile_id',q.cancelled_by_profile_id,'cancellation_reason',q.cancellation_reason,
    'rejected_by_profile_id',q.rejected_by_profile_id,'rejected_at',q.rejected_at,'rejection_reason',q.rejection_reason,
    'payment_cash_expense_id',q.payment_cash_expense_id,'payment_recorded_at',q.payment_recorded_at,
    'settled_at',q.settled_at,'journal_entry_id',q.journal_entry_id,'journal_status',q.journal_status,
    'evidence_count',q.evidence_count
  ) ORDER BY q.due_date,q.created_at,q.id),'[]'::jsonb)
  INTO v_items
  FROM(
    SELECT c.*,
      (SELECT count(*)::integer FROM public.cash_expense_commitment_evidence e
       WHERE e.organization_id=c.organization_id AND e.commitment_id=c.id) AS evidence_count,
      j.journal_entry_id,j.journal_status
    FROM public.cash_expense_commitments c
    LEFT JOIN LATERAL (
      SELECT sp.journal_entry_id,je.status AS journal_status
      FROM public.accounting_source_postings sp
      JOIN public.accounting_journal_entries je ON je.organization_id=sp.organization_id AND je.id=sp.journal_entry_id
      WHERE sp.organization_id=c.organization_id AND sp.source_type='cash_expense'
        AND sp.source_id=c.payment_cash_expense_id AND sp.posting_kind='original'
      ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1
    ) j ON true
    WHERE c.organization_id=v_org
    ORDER BY c.due_date,c.created_at,c.id LIMIT v_limit OFFSET v_offset
  ) q;
  RETURN pg_catalog.jsonb_build_object('items',v_items,'total_count',v_count,'has_more',(v_offset+pg_catalog.jsonb_array_length(v_items))<v_count,'limit',v_limit,'offset',v_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_cash_expense_commitments(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_cash_expense_commitments(integer,integer) TO authenticated;


COMMIT;
