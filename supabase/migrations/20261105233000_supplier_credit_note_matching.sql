-- AGH-PROC-SUPPLIER-CREDIT-NOTE-001
-- Match supplier credit-note evidence to a posted physical supplier return.
-- Variances require an explicit finance decision; journal handoff remains draft-only.
BEGIN;

ALTER TABLE public.accounting_journal_entries
  DROP CONSTRAINT IF EXISTS accounting_journal_entries_source_type_check;
ALTER TABLE public.accounting_journal_entries
  ADD CONSTRAINT accounting_journal_entries_source_type_check
  CHECK (source_type IN (
    'manual','adjustment','invoice','payment','cash_expense',
    'purchase_receipt','purchase_supplier_credit_note','onyx_import'
  ));

CREATE TABLE public.purchase_supplier_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  supplier_return_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_credit_note_number text NOT NULL,
  issued_on date NOT NULL,
  actual_amount numeric(18,2) NOT NULL CHECK (actual_amount > 0 AND actual_amount < 10000000000000000),
  source_amount numeric(18,2) NOT NULL CHECK (source_amount > 0 AND source_amount < 10000000000000000),
  variance_amount numeric(18,2) NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN (
    'exact_match','variance_pending','variance_approved','variance_rejected','journal_draft_created'
  )),
  variance_review_reason text,
  variance_reviewed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  variance_reviewed_at timestamptz,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,supplier_return_id),
  UNIQUE (organization_id,supplier_id,supplier_credit_note_number),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,supplier_return_id)
    REFERENCES public.purchase_supplier_returns(organization_id,id) ON DELETE RESTRICT,
  CHECK (pg_catalog.char_length(pg_catalog.btrim(supplier_credit_note_number)) BETWEEN 1 AND 80),
  CHECK (variance_amount = actual_amount - source_amount),
  CHECK (
    (status IN ('exact_match','journal_draft_created') AND variance_amount = 0)
    OR (status IN ('variance_pending','variance_approved','variance_rejected','journal_draft_created') AND variance_amount <> 0)
  ),
  CHECK (
    (status IN ('variance_approved','variance_rejected') AND variance_reviewed_by_profile_id IS NOT NULL
      AND variance_reviewed_at IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(COALESCE(variance_review_reason,''))) BETWEEN 3 AND 500)
    OR (status NOT IN ('variance_approved','variance_rejected') AND variance_reviewed_by_profile_id IS NULL
      AND variance_reviewed_at IS NULL AND variance_review_reason IS NULL)
    OR (status='journal_draft_created' AND variance_amount<>0 AND variance_reviewed_by_profile_id IS NOT NULL
      AND variance_reviewed_at IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(COALESCE(variance_review_reason,''))) BETWEEN 3 AND 500)
  )
);

CREATE TABLE public.purchase_supplier_credit_note_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  credit_note_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN (
    'recorded_exact_match','recorded_variance_pending','variance_approved',
    'variance_rejected','journal_draft_created'
  )),
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,credit_note_id)
    REFERENCES public.purchase_supplier_credit_notes(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.purchase_supplier_credit_note_accounting_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  credit_note_id uuid NOT NULL,
  supplier_return_id uuid NOT NULL,
  source_receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
  source_journal_entry_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  inventory_account_id uuid NOT NULL,
  payable_account_id uuid NOT NULL,
  variance_account_id uuid,
  source_amount numeric(18,2) NOT NULL CHECK (source_amount > 0),
  actual_amount numeric(18,2) NOT NULL CHECK (actual_amount > 0),
  variance_amount numeric(18,2) NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,credit_note_id)
    REFERENCES public.purchase_supplier_credit_notes(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,supplier_return_id)
    REFERENCES public.purchase_supplier_returns(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,source_journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,inventory_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,payable_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,variance_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,credit_note_id),
  UNIQUE (organization_id,journal_entry_id),
  UNIQUE (organization_id,idempotency_key),
  CHECK (inventory_account_id <> payable_account_id),
  CHECK (variance_amount = actual_amount - source_amount),
  CHECK ((variance_amount = 0 AND variance_account_id IS NULL)
      OR (variance_amount <> 0 AND variance_account_id IS NOT NULL))
);

CREATE INDEX purchase_supplier_credit_notes_status_idx
  ON public.purchase_supplier_credit_notes(organization_id,status,created_at DESC,id DESC);
CREATE INDEX purchase_supplier_credit_note_reviews_history_idx
  ON public.purchase_supplier_credit_note_review_events(organization_id,credit_note_id,created_at,id);
CREATE INDEX purchase_supplier_credit_note_drafts_return_idx
  ON public.purchase_supplier_credit_note_accounting_drafts(organization_id,supplier_return_id,created_at DESC);

ALTER TABLE public.purchase_supplier_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_credit_note_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_credit_note_accounting_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.purchase_supplier_credit_notes,
  public.purchase_supplier_credit_note_review_events,
  public.purchase_supplier_credit_note_accounting_drafts FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.purchase_supplier_credit_notes,
  public.purchase_supplier_credit_note_review_events,
  public.purchase_supplier_credit_note_accounting_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.guard_purchase_supplier_credit_note_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  IF ROW(
    OLD.organization_id,OLD.supplier_return_id,OLD.supplier_id,OLD.supplier_credit_note_number,
    OLD.issued_on,OLD.actual_amount,OLD.source_amount,OLD.variance_amount,OLD.currency,
    OLD.idempotency_key,OLD.payload_fingerprint,OLD.created_by_profile_id,OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.organization_id,NEW.supplier_return_id,NEW.supplier_id,NEW.supplier_credit_note_number,
    NEW.issued_on,NEW.actual_amount,NEW.source_amount,NEW.variance_amount,NEW.currency,
    NEW.idempotency_key,NEW.payload_fingerprint,NEW.created_by_profile_id,NEW.created_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier credit note source evidence is immutable';
  END IF;
  IF OLD.status='journal_draft_created' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier credit note with a journal draft cannot change review state';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER purchase_supplier_credit_note_source_guard
  BEFORE UPDATE ON public.purchase_supplier_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_credit_note_source();

CREATE OR REPLACE FUNCTION public.guard_purchase_supplier_credit_note_review_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier credit note review history is append-only';
END;
$function$;

CREATE TRIGGER purchase_supplier_credit_note_review_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_credit_note_review_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_credit_note_review_event();

CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_credit_note_workspace()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_accounts jsonb;
  v_returns jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for supplier credit note matching';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',a.id,'code',a.code,'name',a.name,'account_type',a.account_type,'is_active',a.is_active
  ) ORDER BY a.code),'[]'::jsonb)
  INTO v_accounts
  FROM public.accounting_accounts a
  WHERE a.organization_id=v_org AND a.is_active
    AND a.account_type IN ('asset','liability','expense','revenue');

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.posted_at DESC,q.return_id DESC),'[]'::jsonb)
    INTO v_returns
  FROM (
    SELECT
      sr.id AS return_id,
      sr.return_number,
      sr.source_receipt_id,
      pr.receipt_number AS source_receipt_number,
      po.purchase_order_number,
      sr.supplier_id,
      s.name AS supplier_name,
      sr.posted_at,
      sr.total_cost AS source_amount,
      sr.currency,
      note.id AS credit_note_id,
      note.supplier_credit_note_number,
      note.issued_on AS credit_note_issued_on,
      note.actual_amount,
      note.variance_amount,
      note.status AS credit_note_status,
      note.variance_review_reason,
      source_journal.id AS source_journal_entry_id,
      source_journal.entry_number::text AS source_journal_entry_number,
      source_journal.status AS source_journal_status,
      receipt_posting.inventory_account_id,
      receipt_posting.payable_account_id,
      draft.journal_entry_id,
      draft_journal.entry_number::text AS journal_entry_number,
      draft_journal.status AS journal_status,
      draft.variance_account_id
    FROM public.purchase_supplier_returns sr
    JOIN public.purchase_receipts pr
      ON pr.id=sr.source_receipt_id AND pr.organization_id=sr.organization_id
    JOIN public.purchase_orders po
      ON po.id=sr.purchase_order_id AND po.organization_id=sr.organization_id
    JOIN public.suppliers s
      ON s.id=sr.supplier_id AND s.organization_id=sr.organization_id
    LEFT JOIN public.purchase_supplier_credit_notes note
      ON note.organization_id=sr.organization_id AND note.supplier_return_id=sr.id
    LEFT JOIN public.purchase_receipt_accounting_postings receipt_posting
      ON receipt_posting.organization_id=sr.organization_id AND receipt_posting.receipt_id=sr.source_receipt_id
    LEFT JOIN public.accounting_journal_entries source_journal
      ON source_journal.organization_id=receipt_posting.organization_id
     AND source_journal.id=receipt_posting.journal_entry_id
    LEFT JOIN public.purchase_supplier_credit_note_accounting_drafts draft
      ON draft.organization_id=sr.organization_id AND draft.credit_note_id=note.id
    LEFT JOIN public.accounting_journal_entries draft_journal
      ON draft_journal.organization_id=draft.organization_id AND draft_journal.id=draft.journal_entry_id
    WHERE sr.organization_id=v_org AND sr.status='posted'
    ORDER BY sr.posted_at DESC,sr.id DESC
    LIMIT 100
  ) q;

  RETURN pg_catalog.jsonb_build_object('accounts',v_accounts,'returns',v_returns);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_credit_note_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_credit_note_workspace() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_purchase_supplier_credit_note(
  p_return_id uuid,
  p_supplier_credit_note_number text,
  p_issued_on date,
  p_actual_amount numeric,
  p_currency text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_return public.purchase_supplier_returns%ROWTYPE;
  v_existing public.purchase_supplier_credit_notes%ROWTYPE;
  v_number text:=pg_catalog.btrim(COALESCE(p_supplier_credit_note_number,''));
  v_variance numeric(18,2);
  v_status text;
  v_fingerprint text;
  v_note_id uuid;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to record a supplier credit note';
  END IF;
  IF p_return_id IS NULL OR p_idempotency_key IS NULL OR v_number=''
     OR pg_catalog.char_length(v_number)>80 OR p_issued_on IS NULL OR p_issued_on>current_date
     OR p_actual_amount IS NULL OR p_actual_amount<=0 OR p_actual_amount>=10000000000000000
     OR pg_catalog.round(p_actual_amount,2)<>p_actual_amount
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier credit note number, date, amount, currency and idempotency key are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':supplier-credit-note:'||p_idempotency_key::text,0)
  );
  SELECT n.* INTO v_existing
    FROM public.purchase_supplier_credit_notes n
   WHERE n.organization_id=v_org AND n.idempotency_key=p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
      'return_id',p_return_id,'number',v_number,'issued_on',p_issued_on,
      'amount',p_actual_amount::text,'currency',p_currency
    )::text);
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier credit note idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'credit_note_id',v_existing.id,'status',v_existing.status,'actual_amount',v_existing.actual_amount,
      'source_amount',v_existing.source_amount,'variance_amount',v_existing.variance_amount,'replayed',true
    );
  END IF;

  SELECT r.* INTO v_return
    FROM public.purchase_supplier_returns r
   WHERE r.id=p_return_id AND r.organization_id=v_org AND r.status='posted'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a posted supplier return in this organization can be matched';
  END IF;
  IF v_return.total_cost IS NULL OR v_return.total_cost<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source return cost is incomplete; complete source-cost review before credit-note matching';
  END IF;
  IF p_currency IS DISTINCT FROM v_return.currency THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier credit note currency must exactly match the posted return currency; FX is not inferred';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_supplier_credit_notes n
     WHERE n.organization_id=v_org AND n.supplier_return_id=v_return.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='this supplier return already has a recorded credit note';
  END IF;

  v_variance:=(p_actual_amount-v_return.total_cost)::numeric(18,2);
  v_status:=CASE WHEN v_variance=0 THEN 'exact_match' ELSE 'variance_pending' END;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'return_id',v_return.id,'number',v_number,'issued_on',p_issued_on,
    'amount',p_actual_amount::text,'currency',p_currency
  )::text);

  INSERT INTO public.purchase_supplier_credit_notes(
    organization_id,supplier_return_id,supplier_id,supplier_credit_note_number,issued_on,
    actual_amount,source_amount,variance_amount,currency,status,idempotency_key,
    payload_fingerprint,created_by_profile_id
  ) VALUES(
    v_org,v_return.id,v_return.supplier_id,v_number,p_issued_on,
    p_actual_amount,v_return.total_cost,v_variance,p_currency,v_status,p_idempotency_key,
    v_fingerprint,v_actor
  ) RETURNING id INTO v_note_id;

  INSERT INTO public.purchase_supplier_credit_note_review_events(
    organization_id,credit_note_id,actor_profile_id,action,reason,details
  ) VALUES(
    v_org,v_note_id,v_actor,
    CASE WHEN v_variance=0 THEN 'recorded_exact_match' ELSE 'recorded_variance_pending' END,
    CASE WHEN v_variance=0 THEN 'Exact amount match to the posted source return.' ELSE 'Amount variance requires an explicit finance decision.' END,
    pg_catalog.jsonb_build_object(
      'supplier_return_id',v_return.id,'return_number',v_return.return_number,
      'supplier_id',v_return.supplier_id,'supplier_credit_note_number',v_number,
      'issued_on',p_issued_on,'source_amount',v_return.total_cost,
      'actual_amount',p_actual_amount,'variance_amount',v_variance,'currency',p_currency
    )
  );

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'supplier_credit_note.recorded','purchase_supplier_credit_note',v_note_id,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'supplier_return_id',v_return.id,'supplier_credit_note_number',v_number,
      'issued_on',p_issued_on,'source_amount',v_return.total_cost,
      'actual_amount',p_actual_amount,'variance_amount',v_variance,'currency',p_currency,'status',v_status
    ));

  RETURN pg_catalog.jsonb_build_object(
    'credit_note_id',v_note_id,'status',v_status,'actual_amount',p_actual_amount,
    'source_amount',v_return.total_cost,'variance_amount',v_variance,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.record_purchase_supplier_credit_note(uuid,text,date,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_purchase_supplier_credit_note(uuid,text,date,numeric,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_purchase_supplier_credit_note_variance(
  p_credit_note_id uuid,
  p_approve boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_note public.purchase_supplier_credit_notes%ROWTYPE;
  v_next_status text;
  v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to review supplier credit note variance';
  END IF;
  IF p_credit_note_id IS NULL OR p_approve IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='variance decision and a 3 to 500 character reason are required';
  END IF;

  SELECT n.* INTO v_note
    FROM public.purchase_supplier_credit_notes n
   WHERE n.id=p_credit_note_id AND n.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND OR v_note.status<>'variance_pending' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a pending supplier credit note variance can be reviewed';
  END IF;

  v_next_status:=CASE WHEN p_approve THEN 'variance_approved' ELSE 'variance_rejected' END;
  UPDATE public.purchase_supplier_credit_notes
     SET status=v_next_status,variance_review_reason=v_reason,
         variance_reviewed_by_profile_id=v_actor,variance_reviewed_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE id=v_note.id AND organization_id=v_org;

  INSERT INTO public.purchase_supplier_credit_note_review_events(
    organization_id,credit_note_id,actor_profile_id,action,reason,details
  ) VALUES(
    v_org,v_note.id,v_actor,
    CASE WHEN p_approve THEN 'variance_approved' ELSE 'variance_rejected' END,
    v_reason,
    pg_catalog.jsonb_build_object(
      'source_amount',v_note.source_amount,'actual_amount',v_note.actual_amount,
      'variance_amount',v_note.variance_amount,'currency',v_note.currency,
      'decision',v_next_status
    )
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'supplier_credit_note.variance_reviewed','purchase_supplier_credit_note',v_note.id,
    pg_catalog.jsonb_build_object('status','variance_pending'),
    pg_catalog.jsonb_build_object('status',v_next_status,'variance_amount',v_note.variance_amount,
      'review_reason',v_reason,'reviewed_by',v_actor));

  RETURN pg_catalog.jsonb_build_object('credit_note_id',v_note.id,'status',v_next_status,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.review_purchase_supplier_credit_note_variance(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_purchase_supplier_credit_note_variance(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_purchase_supplier_credit_note_journal_draft(
  p_credit_note_id uuid,
  p_variance_account_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_note public.purchase_supplier_credit_notes%ROWTYPE;
  v_return public.purchase_supplier_returns%ROWTYPE;
  v_receipt_posting public.purchase_receipt_accounting_postings%ROWTYPE;
  v_source_journal public.accounting_journal_entries%ROWTYPE;
  v_existing_draft public.purchase_supplier_credit_note_accounting_drafts%ROWTYPE;
  v_journal public.accounting_journal_entries%ROWTYPE;
  v_inventory_type text;
  v_payable_type text;
  v_variance_type text;
  v_line_count integer;
  v_source_inventory_debit numeric(18,2);
  v_source_payable_credit numeric(18,2);
  v_source_debit_total numeric(18,2);
  v_source_credit_total numeric(18,2);
  v_variance numeric(18,2);
  v_required_variance_type text;
  v_fingerprint text;
  v_description text;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to prepare supplier credit note journal';
  END IF;
  IF p_credit_note_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit note and journal idempotency key are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':supplier-credit-note-draft:'||p_credit_note_id::text,0)
  );
  SELECT n.* INTO v_note
    FROM public.purchase_supplier_credit_notes n
   WHERE n.id=p_credit_note_id AND n.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier credit note is not available in this organization';
  END IF;

  SELECT d.* INTO v_existing_draft
    FROM public.purchase_supplier_credit_note_accounting_drafts d
   WHERE d.organization_id=v_org AND d.credit_note_id=v_note.id
   FOR UPDATE;
  IF FOUND THEN
    SELECT j.* INTO v_journal
      FROM public.accounting_journal_entries j
     WHERE j.organization_id=v_org AND j.id=v_existing_draft.journal_entry_id;
    RETURN pg_catalog.jsonb_build_object(
      'credit_note_id',v_note.id,'journal_entry_id',v_journal.id,
      'journal_entry_number',v_journal.entry_number::text,'status',v_journal.status,'replayed',true
    );
  END IF;

  IF v_note.status NOT IN ('exact_match','variance_approved') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier credit note must exactly match or have an approved variance before journal draft creation';
  END IF;
  IF v_note.currency<>'YER' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier credit note journal supports YER only; no FX conversion is applied';
  END IF;

  SELECT r.* INTO v_return
    FROM public.purchase_supplier_returns r
   WHERE r.id=v_note.supplier_return_id AND r.organization_id=v_org AND r.status='posted'
   FOR UPDATE;
  IF NOT FOUND OR v_return.supplier_id IS DISTINCT FROM v_note.supplier_id
     OR v_return.total_cost IS DISTINCT FROM v_note.source_amount
     OR v_return.currency IS DISTINCT FROM v_note.currency THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier return source no longer matches the immutable credit note evidence';
  END IF;

  SELECT p.* INTO v_receipt_posting
    FROM public.purchase_receipt_accounting_postings p
   WHERE p.organization_id=v_org AND p.receipt_id=v_return.source_receipt_id
   FOR UPDATE;
  IF NOT FOUND OR v_receipt_posting.source_currency IS DISTINCT FROM v_note.currency THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source purchase receipt has no matching approved accounting mapping';
  END IF;

  SELECT j.* INTO v_source_journal
    FROM public.accounting_journal_entries j
   WHERE j.organization_id=v_org AND j.id=v_receipt_posting.journal_entry_id
   FOR UPDATE;
  IF NOT FOUND OR v_source_journal.status<>'posted' OR v_source_journal.source_type<>'purchase_receipt' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original source receipt journal must exist and be posted before credit-note handoff';
  END IF;

  SELECT a.account_type INTO v_inventory_type
    FROM public.accounting_accounts a
   WHERE a.id=v_receipt_posting.inventory_account_id AND a.organization_id=v_org AND a.is_active;
  SELECT a.account_type INTO v_payable_type
    FROM public.accounting_accounts a
   WHERE a.id=v_receipt_posting.payable_account_id AND a.organization_id=v_org AND a.is_active;
  IF v_inventory_type IS DISTINCT FROM 'asset' OR v_payable_type IS DISTINCT FROM 'liability' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original receipt inventory/payable account mapping is no longer active or valid';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    COALESCE(pg_catalog.sum(l.debit) FILTER (WHERE l.account_id=v_receipt_posting.inventory_account_id),0)::numeric(18,2),
    COALESCE(pg_catalog.sum(l.credit) FILTER (WHERE l.account_id=v_receipt_posting.payable_account_id),0)::numeric(18,2),
    COALESCE(pg_catalog.sum(l.debit),0)::numeric(18,2),
    COALESCE(pg_catalog.sum(l.credit),0)::numeric(18,2)
  INTO v_line_count,v_source_inventory_debit,v_source_payable_credit,v_source_debit_total,v_source_credit_total
  FROM public.accounting_journal_lines l
  WHERE l.organization_id=v_org AND l.journal_entry_id=v_source_journal.id;
  IF v_line_count<>2 OR v_source_debit_total<>v_receipt_posting.source_amount
     OR v_source_credit_total<>v_receipt_posting.source_amount
     OR v_source_inventory_debit<>v_receipt_posting.source_amount
     OR v_source_payable_credit<>v_receipt_posting.source_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original receipt journal lines no longer prove the stored inventory/payable account mapping';
  END IF;

  v_variance:=v_note.variance_amount;
  v_required_variance_type:=CASE WHEN v_variance>0 THEN 'revenue' WHEN v_variance<0 THEN 'expense' ELSE NULL END;
  IF v_variance=0 THEN
    IF p_variance_account_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='variance account must be omitted when the supplier credit note exactly matches source cost';
    END IF;
  ELSE
    SELECT a.account_type INTO v_variance_type
      FROM public.accounting_accounts a
     WHERE a.id=p_variance_account_id AND a.organization_id=v_org AND a.is_active;
    IF v_variance_type IS DISTINCT FROM v_required_variance_type THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='variance account must be an active '||v_required_variance_type||' account in this organization';
    END IF;
  END IF;

  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'credit_note_id',v_note.id,'return_id',v_return.id,'source_receipt_id',v_return.source_receipt_id,
    'source_journal_entry_id',v_source_journal.id,'source_amount',v_note.source_amount::text,
    'actual_amount',v_note.actual_amount::text,'variance_amount',v_variance::text,
    'currency',v_note.currency,'inventory_account_id',v_receipt_posting.inventory_account_id,
    'payable_account_id',v_receipt_posting.payable_account_id,'variance_account_id',p_variance_account_id
  )::text);
  IF EXISTS (
    SELECT 1 FROM public.accounting_journal_entries j
     WHERE j.organization_id=v_org AND j.idempotency_key=p_idempotency_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used';
  END IF;

  v_description:=pg_catalog.left(
    'إشعار دائن مورد '||v_note.supplier_credit_note_number||' مقابل مرتجع '||v_return.return_number,240
  );
  INSERT INTO public.accounting_journal_entries(
    organization_id,entry_date,description,source_type,source_reference,status,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES(
    v_org,v_note.issued_on,v_description,'purchase_supplier_credit_note',
    v_note.supplier_credit_note_number,'draft',p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_journal;

  INSERT INTO public.accounting_journal_lines(
    organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
  ) VALUES(
    v_org,v_journal.id,1,v_receipt_posting.payable_account_id,v_note.actual_amount,0,
    'تخفيض التزام المورد حسب إشعار الدائن '||v_note.supplier_credit_note_number
  ),(
    v_org,v_journal.id,2,v_receipt_posting.inventory_account_id,0,v_note.source_amount,
    'عكس تكلفة المخزون المرتجع '||v_return.return_number
  );
  IF v_variance>0 THEN
    INSERT INTO public.accounting_journal_lines(
      organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
    ) VALUES(
      v_org,v_journal.id,3,p_variance_account_id,0,v_variance,
      'فرق إشعار دائن أعلى من تكلفة المرتجع — اعتماد المحاسب'
    );
  ELSIF v_variance<0 THEN
    INSERT INTO public.accounting_journal_lines(
      organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
    ) VALUES(
      v_org,v_journal.id,3,p_variance_account_id,pg_catalog.abs(v_variance),0,
      'فرق إشعار دائن أقل من تكلفة المرتجع — اعتماد المحاسب'
    );
  END IF;

  INSERT INTO public.purchase_supplier_credit_note_accounting_drafts(
    organization_id,credit_note_id,supplier_return_id,source_receipt_id,
    source_journal_entry_id,journal_entry_id,inventory_account_id,payable_account_id,
    variance_account_id,source_amount,actual_amount,variance_amount,currency,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES(
    v_org,v_note.id,v_return.id,v_return.source_receipt_id,
    v_source_journal.id,v_journal.id,v_receipt_posting.inventory_account_id,
    v_receipt_posting.payable_account_id,p_variance_account_id,v_note.source_amount,
    v_note.actual_amount,v_variance,v_note.currency,p_idempotency_key,v_fingerprint,v_actor
  );

  UPDATE public.purchase_supplier_credit_notes
     SET status='journal_draft_created',updated_at=pg_catalog.now()
   WHERE id=v_note.id AND organization_id=v_org;

  INSERT INTO public.purchase_supplier_credit_note_review_events(
    organization_id,credit_note_id,actor_profile_id,action,reason,details
  ) VALUES(
    v_org,v_note.id,v_actor,'journal_draft_created',
    'Created a balanced draft only; posting remains a separate accountant action.',
    pg_catalog.jsonb_build_object(
      'journal_entry_id',v_journal.id,'journal_entry_number',v_journal.entry_number::text,
      'source_journal_entry_id',v_source_journal.id,'source_journal_entry_number',v_source_journal.entry_number::text,
      'source_amount',v_note.source_amount,'actual_amount',v_note.actual_amount,
      'variance_amount',v_variance,'currency',v_note.currency,
      'inventory_account_id',v_receipt_posting.inventory_account_id,
      'payable_account_id',v_receipt_posting.payable_account_id,'variance_account_id',p_variance_account_id
    )
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'supplier_credit_note.journal_draft_created','purchase_supplier_credit_note',v_note.id,
    pg_catalog.jsonb_build_object('status',v_note.status),
    pg_catalog.jsonb_build_object(
      'status','journal_draft_created','journal_entry_id',v_journal.id,
      'journal_entry_number',v_journal.entry_number::text,'source_journal_entry_id',v_source_journal.id,
      'variance_amount',v_variance,'currency',v_note.currency
    ));

  RETURN pg_catalog.jsonb_build_object(
    'credit_note_id',v_note.id,'journal_entry_id',v_journal.id,
    'journal_entry_number',v_journal.entry_number::text,'status',v_journal.status,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.prepare_purchase_supplier_credit_note_journal_draft(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_purchase_supplier_credit_note_journal_draft(uuid,uuid,uuid) TO authenticated;

COMMENT ON TABLE public.purchase_supplier_credit_notes IS
  'Immutable supplier credit-note source evidence matched one-to-one to a posted supplier return; variances require an explicit finance decision.';
COMMENT ON TABLE public.purchase_supplier_credit_note_review_events IS
  'Append-only audit history for supplier credit-note recording, variance decisions and accounting draft creation.';
COMMENT ON TABLE public.purchase_supplier_credit_note_accounting_drafts IS
  'Controlled draft handoff linking a supplier credit note to the posted source receipt journal and its proven account mapping. Drafts are never auto-posted.';
COMMENT ON FUNCTION public.prepare_purchase_supplier_credit_note_journal_draft(uuid,uuid,uuid) IS
  'Creates one balanced draft only after exact/approved amount matching, posted source receipt journal verification and account mapping proof; never posts the new journal or infers FX.';

COMMIT;
