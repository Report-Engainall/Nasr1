-- Persist per-document checker attestations and require them at the PostgreSQL decision boundary.
BEGIN;
ALTER TABLE public.cash_expense_commitment_evidence
  ADD CONSTRAINT cash_expense_commitment_evidence_org_commitment_evidence_key UNIQUE(organization_id,commitment_id,id);
ALTER TABLE public.cash_expense_commitment_events DROP CONSTRAINT IF EXISTS cash_expense_commitment_events_event_type_check;
ALTER TABLE public.cash_expense_commitment_events
  ADD CONSTRAINT cash_expense_commitment_events_event_type_check CHECK(event_type IN (
    'CREATED','EVIDENCE_ATTACHED','EVIDENCE_REVIEWED','APPROVED','REJECTED','CANCELLED','PAYMENT_RECORDED','SETTLED'
  ));

CREATE TABLE public.cash_expense_commitment_evidence_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  reviewed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  FOREIGN KEY(organization_id,commitment_id)
    REFERENCES public.cash_expense_commitments(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,commitment_id,evidence_id)
    REFERENCES public.cash_expense_commitment_evidence(organization_id,commitment_id,id) ON DELETE RESTRICT,
  UNIQUE(organization_id,commitment_id,evidence_id,reviewed_by_profile_id),
  UNIQUE(organization_id,id)
);
CREATE INDEX cash_expense_commitment_evidence_reviews_reviewer_idx
  ON public.cash_expense_commitment_evidence_reviews
  (organization_id,commitment_id,reviewed_by_profile_id,evidence_id);
ALTER TABLE public.cash_expense_commitment_evidence_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY cash_expense_commitment_evidence_reviews_finance_read
  ON public.cash_expense_commitment_evidence_reviews FOR SELECT TO authenticated
  USING (public.can_manage_finance() AND organization_id=(
    SELECT p.organization_id FROM public.profiles p
    WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
  ));
GRANT SELECT ON public.cash_expense_commitment_evidence_reviews TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.cash_expense_commitment_evidence_reviews FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cash_expense_commitment_evidence_reviews_immutable
  BEFORE UPDATE OR DELETE ON public.cash_expense_commitment_evidence_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_cash_expense_commitment_append_only();

CREATE OR REPLACE FUNCTION public.review_cash_expense_commitment_evidence(
  p_commitment_id uuid,p_evidence_id uuid,p_content_sha256 text,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_fingerprint text;
  v_commitment public.cash_expense_commitments%ROWTYPE;
  v_evidence public.cash_expense_commitment_evidence%ROWTYPE;
  v_review public.cash_expense_commitment_evidence_reviews%ROWTYPE;
  v_event public.cash_expense_commitment_events%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true
    AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance administrator or manager required';
  END IF;
  IF p_commitment_id IS NULL OR p_evidence_id IS NULL OR p_idempotency_key IS NULL
     OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment, evidence, digest and idempotency key are required';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action','REVIEW_EVIDENCE','commitment_id',p_commitment_id,
    'evidence_id',p_evidence_id,'content_sha256',p_content_sha256)::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_org::text||':cash-expense-commitment-event:'||p_idempotency_key::text,0));
  SELECT e.* INTO v_event FROM public.cash_expense_commitment_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_event.event_type<>'EVIDENCE_REVIEWED' OR v_event.payload_fingerprint<>v_fingerprint
       OR v_event.actor_profile_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='evidence review idempotency conflict';
    END IF;
    RETURN v_event.event_payload||pg_catalog.jsonb_build_object('replayed',true);
  END IF;
  SELECT c.* INTO v_commitment FROM public.cash_expense_commitments c
   WHERE c.id=p_commitment_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='commitment not found'; END IF;
  IF v_commitment.created_by_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='creator cannot review own evidence';
  END IF;
  IF v_commitment.status<>'pending_approval' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='evidence review only allowed while pending approval';
  END IF;
  SELECT e.* INTO v_evidence FROM public.cash_expense_commitment_evidence e
   WHERE e.organization_id=v_org AND e.commitment_id=v_commitment.id AND e.id=p_evidence_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='evidence not found for commitment'; END IF;
  IF v_evidence.content_sha256<>p_content_sha256 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='review digest differs from registered evidence digest';
  END IF;
  SELECT r.* INTO v_review FROM public.cash_expense_commitment_evidence_reviews r
   WHERE r.organization_id=v_org AND r.commitment_id=v_commitment.id
     AND r.evidence_id=v_evidence.id AND r.reviewed_by_profile_id=v_actor FOR UPDATE;
  IF FOUND THEN
    IF v_review.content_sha256<>v_evidence.content_sha256 THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='persisted review digest differs from immutable source digest';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'commitment_id',v_commitment.id,'evidence_id',v_evidence.id,
      'reviewed_by_profile_id',v_review.reviewed_by_profile_id,'content_sha256',v_review.content_sha256,
      'reviewed_at',v_review.reviewed_at,'replayed',true);
  END IF;
  INSERT INTO public.cash_expense_commitment_evidence_reviews(
    organization_id,commitment_id,evidence_id,reviewed_by_profile_id,content_sha256)
  VALUES(v_org,v_commitment.id,v_evidence.id,v_actor,v_evidence.content_sha256)
  RETURNING * INTO v_review;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload)
  VALUES(v_org,v_commitment.id,'EVIDENCE_REVIEWED',v_actor,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('commitment_id',v_commitment.id,'evidence_id',v_evidence.id,
      'reviewed_by_profile_id',v_actor,'content_sha256',v_evidence.content_sha256,
      'reviewed_at',v_review.reviewed_at,'replayed',false));
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.evidence_reviewed','cash_expense_commitment',v_commitment.id,NULL,
    pg_catalog.jsonb_build_object('evidence_id',v_evidence.id,'reviewed_by_profile_id',v_actor,
      'content_sha256',v_evidence.content_sha256,'reviewed_at',v_review.reviewed_at));
  RETURN pg_catalog.jsonb_build_object('commitment_id',v_commitment.id,'evidence_id',v_evidence.id,
    'reviewed_by_profile_id',v_actor,'content_sha256',v_evidence.content_sha256,
    'reviewed_at',v_review.reviewed_at,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.review_cash_expense_commitment_evidence(uuid,uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.review_cash_expense_commitment_evidence(uuid,uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_cash_expense_commitment(
  p_commitment_id uuid,p_reason text,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_role text;
  v_reason text:=pg_catalog.btrim(coalesce(p_reason,'')); v_fingerprint text;
  v_row public.cash_expense_commitments%ROWTYPE; v_event public.cash_expense_commitment_events%ROWTYPE;
BEGIN
  SELECT p.organization_id,r.role INTO v_org,v_role
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance administrator or manager required';
  END IF;
  IF p_commitment_id IS NULL OR p_idempotency_key IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment, approval reason and idempotency key are required';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object('action','APPROVE','commitment_id',p_commitment_id,'reason',v_reason)::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':cash-expense-commitment-event:'||p_idempotency_key::text,0));
  SELECT e.* INTO v_event FROM public.cash_expense_commitment_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_event.event_type<>'APPROVED' OR v_event.payload_fingerprint<>v_fingerprint OR v_event.actor_profile_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='expense commitment approval idempotency conflict';
    END IF;
    RETURN v_event.event_payload||pg_catalog.jsonb_build_object('replayed',true);
  END IF;
  SELECT c.* INTO v_row FROM public.cash_expense_commitments c
   WHERE c.id=p_commitment_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='commitment not found'; END IF;
  IF v_row.created_by_profile_id=v_actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='creator cannot approve own commitment'; END IF;
  IF v_row.status<>'pending_approval' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment is not awaiting approval'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e WHERE e.organization_id=v_org AND e.commitment_id=v_row.id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='registered source document required before approval';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.cash_expense_commitment_evidence e
    WHERE e.organization_id=v_org AND e.commitment_id=v_row.id
      AND NOT EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence_reviews r
        WHERE r.organization_id=e.organization_id AND r.commitment_id=e.commitment_id
          AND r.evidence_id=e.id AND r.reviewed_by_profile_id=v_actor AND r.content_sha256=e.content_sha256)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='approver must persistently attest every registered source document';
  END IF;
  UPDATE public.cash_expense_commitments SET status='approved',approved_by_profile_id=v_actor,
    approved_at=statement_timestamp(),approval_reason=v_reason,updated_at=statement_timestamp()
   WHERE organization_id=v_org AND id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload)
  VALUES(v_org,v_row.id,'APPROVED',v_actor,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,
      'status',v_row.status,'approved_at',v_row.approved_at,'replayed',false));
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.approved','cash_expense_commitment',v_row.id,
    pg_catalog.jsonb_build_object('status','pending_approval'),
    pg_catalog.jsonb_build_object('status','approved','reason',v_reason,
      'evidence_count',(SELECT count(*) FROM public.cash_expense_commitment_evidence e WHERE e.organization_id=v_org AND e.commitment_id=v_row.id),
      'reviewed_evidence_count',(SELECT count(*) FROM public.cash_expense_commitment_evidence_reviews r
        WHERE r.organization_id=v_org AND r.commitment_id=v_row.id AND r.reviewed_by_profile_id=v_actor)));
  RETURN pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,
    'status',v_row.status,'approved_at',v_row.approved_at,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.approve_cash_expense_commitment(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.approve_cash_expense_commitment(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_cash_expense_commitment(
  p_commitment_id uuid,p_reason text,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid;
  v_reason text:=pg_catalog.btrim(coalesce(p_reason,'')); v_fingerprint text;
  v_row public.cash_expense_commitments%ROWTYPE; v_event public.cash_expense_commitment_events%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance administrator or manager required';
  END IF;
  IF p_commitment_id IS NULL OR p_idempotency_key IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment, rejection reason and idempotency key are required';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object('action','REJECT','commitment_id',p_commitment_id,'reason',v_reason)::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':cash-expense-commitment-event:'||p_idempotency_key::text,0));
  SELECT e.* INTO v_event FROM public.cash_expense_commitment_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_event.event_type<>'REJECTED' OR v_event.payload_fingerprint<>v_fingerprint OR v_event.actor_profile_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='expense commitment rejection idempotency conflict';
    END IF;
    RETURN v_event.event_payload||pg_catalog.jsonb_build_object('replayed',true);
  END IF;
  SELECT c.* INTO v_row FROM public.cash_expense_commitments c
   WHERE c.id=p_commitment_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='commitment not found'; END IF;
  IF v_row.created_by_profile_id=v_actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='creator cannot reject own commitment'; END IF;
  IF v_row.status<>'pending_approval' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment is not awaiting rejection'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e WHERE e.organization_id=v_org AND e.commitment_id=v_row.id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='registered source document required before rejection';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.cash_expense_commitment_evidence e
    WHERE e.organization_id=v_org AND e.commitment_id=v_row.id
      AND NOT EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence_reviews r
        WHERE r.organization_id=e.organization_id AND r.commitment_id=e.commitment_id
          AND r.evidence_id=e.id AND r.reviewed_by_profile_id=v_actor AND r.content_sha256=e.content_sha256)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reviewer must persistently attest every registered source document before rejection';
  END IF;
  UPDATE public.cash_expense_commitments SET status='rejected',rejected_by_profile_id=v_actor,
    rejected_at=statement_timestamp(),rejection_reason=v_reason,updated_at=statement_timestamp()
   WHERE organization_id=v_org AND id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload)
  VALUES(v_org,v_row.id,'REJECTED',v_actor,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,
      'status',v_row.status,'rejected_at',v_row.rejected_at,'replayed',false));
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.rejected','cash_expense_commitment',v_row.id,
    pg_catalog.jsonb_build_object('status','pending_approval'),
    pg_catalog.jsonb_build_object('status','rejected','reason',v_reason,
      'reviewed_evidence_count',(SELECT count(*) FROM public.cash_expense_commitment_evidence_reviews r
        WHERE r.organization_id=v_org AND r.commitment_id=v_row.id AND r.reviewed_by_profile_id=v_actor)));
  RETURN pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,
    'status',v_row.status,'rejected_at',v_row.rejected_at,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_cash_expense_commitment(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reject_cash_expense_commitment(uuid,text,uuid) TO authenticated;
COMMIT;
