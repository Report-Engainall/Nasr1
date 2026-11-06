BEGIN;

-- Finance cash/bank opening evidence and bank statement reconciliation.
-- The evidence record never creates a journal entry. An opening amount is approvable only
-- when it exactly equals the same-account posted GL balance as of its date.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-cash-account-evidence',
  'finance-cash-account-evidence',
  false,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.finance_cash_account_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  settlement_account_mapping_id uuid NOT NULL,
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('opening_balance','cash_count','bank_statement')),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (
    char_length(btrim(file_name)) BETWEEN 1 AND 180
    AND file_name !~ '[[:cntrl:]/]'
    AND position(chr(92) in file_name) = 0
  ),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,settlement_account_mapping_id)
    REFERENCES public.purchase_supplier_payment_settlement_accounts(organization_id,id) ON DELETE RESTRICT,
  CHECK (storage_path ~ (
    '^' || settlement_account_mapping_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
  ))
);
CREATE INDEX finance_cash_account_evidence_mapping_idx
  ON public.finance_cash_account_evidence(organization_id,settlement_account_mapping_id,created_at DESC,id);

CREATE TABLE public.finance_cash_opening_balance_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  settlement_account_mapping_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  as_of_date date NOT NULL,
  opening_balance numeric(18,2) NOT NULL CHECK (
    opening_balance > -10000000000000000 AND opening_balance < 10000000000000000
  ),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,settlement_account_mapping_id)
    REFERENCES public.purchase_supplier_payment_settlement_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,evidence_id)
    REFERENCES public.finance_cash_account_evidence(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX finance_cash_opening_balance_proposals_scope_idx
  ON public.finance_cash_opening_balance_proposals(organization_id,settlement_account_mapping_id,as_of_date DESC,created_at DESC);

CREATE TABLE public.finance_cash_opening_balance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  proposal_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  reviewer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  posted_gl_balance numeric(18,2) NOT NULL,
  posted_gl_line_count integer NOT NULL CHECK (posted_gl_line_count >= 0),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,proposal_id),
  FOREIGN KEY (organization_id,proposal_id)
    REFERENCES public.finance_cash_opening_balance_proposals(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX finance_cash_opening_balance_reviews_decision_idx
  ON public.finance_cash_opening_balance_reviews(organization_id,decision,reviewed_at DESC);

CREATE TABLE public.finance_bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  settlement_account_mapping_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  statement_reference text NOT NULL CHECK (char_length(btrim(statement_reference)) BETWEEN 2 AND 120),
  period_from date NOT NULL,
  period_to date NOT NULL,
  statement_opening_balance numeric(18,2) NOT NULL CHECK (
    statement_opening_balance > -10000000000000000 AND statement_opening_balance < 10000000000000000
  ),
  statement_closing_balance numeric(18,2) NOT NULL CHECK (
    statement_closing_balance > -10000000000000000 AND statement_closing_balance < 10000000000000000
  ),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,settlement_account_mapping_id)
    REFERENCES public.purchase_supplier_payment_settlement_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,evidence_id)
    REFERENCES public.finance_cash_account_evidence(organization_id,id) ON DELETE RESTRICT,
  CHECK (period_to >= period_from AND (period_to - period_from) <= 93)
);
CREATE INDEX finance_bank_statements_account_period_idx
  ON public.finance_bank_statements(organization_id,settlement_account_mapping_id,period_from,period_to);

CREATE TABLE public.finance_bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  statement_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 10000),
  transaction_date date NOT NULL,
  external_reference text CHECK (external_reference IS NULL OR char_length(external_reference) <= 160),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 2 AND 500),
  signed_amount numeric(18,2) NOT NULL CHECK (
    signed_amount <> 0 AND signed_amount > -10000000000000000 AND signed_amount < 10000000000000000
  ),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,statement_id,line_number),
  UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,statement_id)
    REFERENCES public.finance_bank_statements(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX finance_bank_statement_lines_scope_idx
  ON public.finance_bank_statement_lines(organization_id,statement_id,transaction_date,line_number);

CREATE TABLE public.finance_bank_statement_line_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  statement_line_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  journal_line_number integer NOT NULL,
  matched_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,statement_line_id),
  UNIQUE (organization_id,journal_entry_id,journal_line_number),
  FOREIGN KEY (organization_id,statement_line_id)
    REFERENCES public.finance_bank_statement_lines(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id,journal_line_number)
    REFERENCES public.accounting_journal_lines(journal_entry_id,line_number) ON DELETE RESTRICT
);

CREATE TABLE public.finance_bank_statement_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  statement_id uuid NOT NULL,
  run_number integer NOT NULL CHECK (run_number >= 1),
  outcome text NOT NULL CHECK (outcome IN ('VERIFIED','NEEDS_REVIEW')),
  statement_difference numeric(18,2) NOT NULL,
  ledger_difference numeric(18,2) NOT NULL,
  unmatched_statement_lines integer NOT NULL CHECK (unmatched_statement_lines >= 0),
  unmatched_ledger_lines integer NOT NULL CHECK (unmatched_ledger_lines >= 0),
  statement_line_count integer NOT NULL CHECK (statement_line_count >= 0),
  matched_line_count integer NOT NULL CHECK (matched_line_count >= 0),
  statement_net_movement numeric(18,2) NOT NULL,
  ledger_net_movement numeric(18,2) NOT NULL,
  reviewed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,statement_id,run_number),
  FOREIGN KEY (organization_id,statement_id)
    REFERENCES public.finance_bank_statements(organization_id,id) ON DELETE RESTRICT
);

-- Read-only metadata; all business writes are security-definer RPCs.
ALTER TABLE public.finance_cash_account_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_cash_opening_balance_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_cash_opening_balance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bank_statement_line_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bank_statement_reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_cash_evidence_read ON public.finance_cash_account_evidence
  FOR SELECT TO authenticated USING (
    public.can_manage_finance()
    AND organization_id = (SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY finance_cash_opening_proposals_read ON public.finance_cash_opening_balance_proposals
  FOR SELECT TO authenticated USING (
    public.can_manage_finance()
    AND organization_id = (SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY finance_cash_opening_reviews_read ON public.finance_cash_opening_balance_reviews
  FOR SELECT TO authenticated USING (
    public.can_manage_finance()
    AND organization_id = (SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY finance_bank_statements_read ON public.finance_bank_statements
  FOR SELECT TO authenticated USING (
    public.can_manage_finance()
    AND organization_id = (SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY finance_bank_statement_lines_read ON public.finance_bank_statement_lines
  FOR SELECT TO authenticated USING (
    public.can_manage_finance()
    AND organization_id = (SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY finance_bank_statement_matches_read ON public.finance_bank_statement_line_matches
  FOR SELECT TO authenticated USING (
    public.can_manage_finance()
    AND organization_id = (SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY finance_bank_reconciliation_runs_read ON public.finance_bank_statement_reconciliation_runs
  FOR SELECT TO authenticated USING (
    public.can_manage_finance()
    AND organization_id = (SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );

GRANT SELECT ON public.finance_cash_account_evidence,
  public.finance_cash_opening_balance_proposals,
  public.finance_cash_opening_balance_reviews,
  public.finance_bank_statements,
  public.finance_bank_statement_lines,
  public.finance_bank_statement_line_matches,
  public.finance_bank_statement_reconciliation_runs TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.finance_cash_account_evidence,
  public.finance_cash_opening_balance_proposals,
  public.finance_cash_opening_balance_reviews,
  public.finance_bank_statements,
  public.finance_bank_statement_lines,
  public.finance_bank_statement_line_matches,
  public.finance_bank_statement_reconciliation_runs FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_finance_cash_reconciliation_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='finance cash evidence and reconciliation rows are append-only';
END;
$function$;

CREATE TRIGGER finance_cash_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.finance_cash_account_evidence
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_cash_reconciliation_immutable();
CREATE TRIGGER finance_cash_opening_proposal_immutable
  BEFORE UPDATE OR DELETE ON public.finance_cash_opening_balance_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_cash_reconciliation_immutable();
CREATE TRIGGER finance_cash_opening_review_immutable
  BEFORE UPDATE OR DELETE ON public.finance_cash_opening_balance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_cash_reconciliation_immutable();
CREATE TRIGGER finance_bank_statement_immutable
  BEFORE UPDATE OR DELETE ON public.finance_bank_statements
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_cash_reconciliation_immutable();
CREATE TRIGGER finance_bank_statement_line_immutable
  BEFORE UPDATE OR DELETE ON public.finance_bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_cash_reconciliation_immutable();
CREATE TRIGGER finance_bank_statement_match_immutable
  BEFORE UPDATE OR DELETE ON public.finance_bank_statement_line_matches
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_cash_reconciliation_immutable();
CREATE TRIGGER finance_bank_reconciliation_run_immutable
  BEFORE UPDATE OR DELETE ON public.finance_bank_statement_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_cash_reconciliation_immutable();

DROP POLICY IF EXISTS finance_cash_account_evidence_read ON storage.objects;
CREATE POLICY finance_cash_account_evidence_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id='finance-cash-account-evidence'
    AND public.can_manage_finance()
    AND EXISTS (
      SELECT 1 FROM public.purchase_supplier_payment_settlement_accounts m
      JOIN public.profiles p ON p.organization_id=m.organization_id
      WHERE m.id::text=(storage.foldername(name))[1]
        AND p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
DROP POLICY IF EXISTS finance_cash_account_evidence_upload ON storage.objects;
CREATE POLICY finance_cash_account_evidence_upload ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id='finance-cash-account-evidence'
    AND public.can_manage_finance()
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.purchase_supplier_payment_settlement_accounts m
      JOIN public.profiles p ON p.organization_id=m.organization_id
      WHERE m.id::text=(storage.foldername(name))[1]
        AND p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
DROP POLICY IF EXISTS finance_cash_account_evidence_orphan_cleanup ON storage.objects;
CREATE POLICY finance_cash_account_evidence_orphan_cleanup ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id='finance-cash-account-evidence'
    AND public.can_manage_finance()
    AND EXISTS (
      SELECT 1 FROM public.purchase_supplier_payment_settlement_accounts m
      JOIN public.profiles p ON p.organization_id=m.organization_id
      WHERE m.id::text=(storage.foldername(name))[1]
        AND p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
    AND NOT EXISTS (SELECT 1 FROM public.finance_cash_account_evidence e WHERE e.storage_path=name)
  );

CREATE OR REPLACE FUNCTION public.record_finance_cash_account_evidence(
  p_settlement_account_mapping_id uuid,
  p_evidence_kind text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_content_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_object jsonb;
  v_existing public.finance_cash_account_evidence%ROWTYPE;
  v_row public.finance_cash_account_evidence%ROWTYPE;
  v_actual_size bigint;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to register cash account evidence';
  END IF;
  IF p_settlement_account_mapping_id IS NULL
     OR p_evidence_kind NOT IN ('opening_balance','cash_count','bank_statement')
     OR p_file_name IS NULL OR char_length(btrim(p_file_name)) NOT BETWEEN 1 AND 180
     OR p_file_name ~ '[[:cntrl:]/]' OR position(chr(92) in p_file_name)>0
     OR p_mime_type IS NULL OR p_mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
     OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 10485760
     OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-f]{64}$'
     OR p_storage_path IS NULL
     OR p_storage_path !~ ('^' || p_settlement_account_mapping_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cash account evidence metadata or path is invalid';
  END IF;
  IF (p_mime_type='application/pdf' AND p_storage_path !~ '[.]pdf$')
     OR (p_mime_type='image/jpeg' AND p_storage_path !~ '[.]jpg$')
     OR (p_mime_type='image/png' AND p_storage_path !~ '[.]png$')
     OR (p_mime_type='image/webp' AND p_storage_path !~ '[.]webp$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cash account evidence extension does not match MIME type';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_supplier_payment_settlement_accounts m
    WHERE m.id=p_settlement_account_mapping_id AND m.organization_id=v_org AND m.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='cash or bank account is not active in this organization';
  END IF;
  SELECT o.metadata INTO v_object FROM storage.objects o
  WHERE o.bucket_id='finance-cash-account-evidence' AND o.name=p_storage_path;
  IF NOT FOUND OR coalesce(v_object->>'size','') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='uploaded cash account evidence object is missing';
  END IF;
  v_actual_size:=(v_object->>'size')::bigint;
  IF v_actual_size<>p_byte_size OR v_actual_size NOT BETWEEN 1 AND 10485760
     OR coalesce(v_object->>'mimetype',p_mime_type)<>p_mime_type THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='cash account evidence object metadata mismatch';
  END IF;
  SELECT e.* INTO v_existing FROM public.finance_cash_account_evidence e WHERE e.storage_path=p_storage_path;
  IF FOUND THEN
    IF v_existing.organization_id=v_org
       AND v_existing.settlement_account_mapping_id=p_settlement_account_mapping_id
       AND v_existing.evidence_kind=p_evidence_kind
       AND v_existing.file_name=btrim(p_file_name)
       AND v_existing.mime_type=p_mime_type
       AND v_existing.byte_size=p_byte_size
       AND v_existing.content_sha256=p_content_sha256 THEN
      RETURN jsonb_build_object('id',v_existing.id,'storage_path',v_existing.storage_path,'evidence_kind',v_existing.evidence_kind,'replayed',true);
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='cash account evidence path already registered with different content';
  END IF;
  INSERT INTO public.finance_cash_account_evidence(
    organization_id,settlement_account_mapping_id,evidence_kind,storage_path,file_name,mime_type,byte_size,content_sha256,uploaded_by_profile_id
  ) VALUES (
    v_org,p_settlement_account_mapping_id,p_evidence_kind,p_storage_path,btrim(p_file_name),p_mime_type,p_byte_size,p_content_sha256,v_actor
  ) RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_account_evidence_registered','finance_cash_account_evidence',v_row.id,'{}'::jsonb,
    jsonb_build_object('mapping_id',v_row.settlement_account_mapping_id,'evidence_kind',v_row.evidence_kind,'sha256',v_row.content_sha256,'byte_size',v_row.byte_size));
  RETURN jsonb_build_object('id',v_row.id,'storage_path',v_row.storage_path,'evidence_kind',v_row.evidence_kind,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_finance_cash_account_evidence(uuid,text,text,text,text,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_finance_cash_account_evidence(uuid,text,text,text,text,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_finance_cash_opening_balance(
  p_settlement_account_mapping_id uuid,
  p_evidence_id uuid,
  p_as_of_date date,
  p_opening_balance numeric,
  p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_mapping public.purchase_supplier_payment_settlement_accounts%ROWTYPE;
  v_evidence public.finance_cash_account_evidence%ROWTYPE;
  v_fingerprint text;
  v_existing public.finance_cash_opening_balance_proposals%ROWTYPE;
  v_row public.finance_cash_opening_balance_proposals%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to submit an opening balance';
  END IF;
  IF p_settlement_account_mapping_id IS NULL OR p_evidence_id IS NULL OR p_as_of_date IS NULL
     OR p_as_of_date>(statement_timestamp() AT TIME ZONE 'UTC')::date
     OR p_opening_balance IS NULL OR p_opening_balance<=-10000000000000000 OR p_opening_balance>=10000000000000000
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='opening balance submission is invalid';
  END IF;
  SELECT m.* INTO v_mapping FROM public.purchase_supplier_payment_settlement_accounts m
  WHERE m.id=p_settlement_account_mapping_id AND m.organization_id=v_org AND m.is_active FOR SHARE;
  SELECT e.* INTO v_evidence FROM public.finance_cash_account_evidence e
  WHERE e.id=p_evidence_id AND e.organization_id=v_org
    AND e.settlement_account_mapping_id=p_settlement_account_mapping_id
    AND e.evidence_kind IN ('opening_balance','cash_count') FOR SHARE;
  IF NOT FOUND OR v_mapping.id IS NULL OR v_evidence.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='same-tenant opening evidence and active account mapping are required';
  END IF;
  v_fingerprint:=md5(jsonb_build_object(
    'mapping',p_settlement_account_mapping_id,'evidence',p_evidence_id,
    'date',p_as_of_date,'amount',p_opening_balance,'currency',v_mapping.currency
  )::text);
  SELECT p.* INTO v_existing FROM public.finance_cash_opening_balance_proposals p
  WHERE p.organization_id=v_org AND p.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint=v_fingerprint
       AND v_existing.settlement_account_mapping_id=p_settlement_account_mapping_id
       AND v_existing.evidence_id=p_evidence_id
       AND v_existing.as_of_date=p_as_of_date
       AND v_existing.opening_balance=p_opening_balance THEN
      RETURN jsonb_build_object('proposal_id',v_existing.id,'replayed',true);
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='opening balance idempotency key conflicts with another payload';
  END IF;
  INSERT INTO public.finance_cash_opening_balance_proposals(
    organization_id,settlement_account_mapping_id,evidence_id,as_of_date,opening_balance,currency,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES(v_org,p_settlement_account_mapping_id,p_evidence_id,p_as_of_date,p_opening_balance,v_mapping.currency,p_idempotency_key,v_fingerprint,v_actor)
  RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_opening_balance_submitted','finance_cash_opening_balance_proposal',v_row.id,'{}'::jsonb,
    jsonb_build_object('mapping_id',v_row.settlement_account_mapping_id,'as_of_date',v_row.as_of_date,'amount',v_row.opening_balance,'currency',v_row.currency,'evidence_id',v_row.evidence_id));
  RETURN jsonb_build_object('proposal_id',v_row.id,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_finance_cash_opening_balance(uuid,uuid,date,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_finance_cash_opening_balance(uuid,uuid,date,numeric,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_finance_cash_opening_balance(
  p_proposal_id uuid,
  p_decision text,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_proposal public.finance_cash_opening_balance_proposals%ROWTYPE;
  v_balance numeric(18,2):=0;
  v_line_count integer:=0;
  v_prior_approved integer:=0;
  v_review public.finance_cash_opening_balance_reviews%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to review an opening balance';
  END IF;
  IF p_proposal_id IS NULL OR p_decision NOT IN ('approved','rejected')
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='opening balance review decision and reason are required';
  END IF;
  SELECT p.* INTO v_proposal FROM public.finance_cash_opening_balance_proposals p
  WHERE p.id=p_proposal_id AND p.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='opening balance proposal is not available in this organization'; END IF;
  IF v_proposal.created_by_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='opening balance submitter cannot review the same proposal';
  END IF;
  IF EXISTS(SELECT 1 FROM public.finance_cash_opening_balance_reviews r WHERE r.organization_id=v_org AND r.proposal_id=v_proposal.id) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='opening balance proposal has already been reviewed';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('finance-opening:'||v_proposal.settlement_account_mapping_id::text||':'||v_proposal.as_of_date::text));
  IF p_decision='approved' THEN
    SELECT coalesce(sum(l.debit-l.credit),0)::numeric(18,2),count(*)::integer
      INTO v_balance,v_line_count
    FROM public.accounting_journal_lines l
    JOIN public.accounting_journal_entries e ON e.id=l.journal_entry_id AND e.organization_id=l.organization_id
    WHERE l.organization_id=v_org
      AND l.account_id=(SELECT m.accounting_account_id FROM public.purchase_supplier_payment_settlement_accounts m
        WHERE m.id=v_proposal.settlement_account_mapping_id AND m.organization_id=v_org)
      AND e.status='posted' AND e.entry_date<=v_proposal.as_of_date;
    IF v_line_count=0 OR v_balance IS DISTINCT FROM v_proposal.opening_balance THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='opening balance does not equal the same-account posted general-ledger balance as of the evidence date; post a reviewed opening journal first';
    END IF;
    SELECT count(*)::integer INTO v_prior_approved
    FROM public.finance_cash_opening_balance_proposals p
    JOIN public.finance_cash_opening_balance_reviews r ON r.organization_id=p.organization_id AND r.proposal_id=p.id
    WHERE p.organization_id=v_org
      AND p.settlement_account_mapping_id=v_proposal.settlement_account_mapping_id
      AND p.as_of_date=v_proposal.as_of_date AND r.decision='approved';
    IF v_prior_approved>0 THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='an approved opening balance already exists for this account and date';
    END IF;
  END IF;
  INSERT INTO public.finance_cash_opening_balance_reviews(
    organization_id,proposal_id,decision,reason,reviewer_profile_id,posted_gl_balance,posted_gl_line_count
  ) VALUES(v_org,v_proposal.id,p_decision,btrim(p_reason),v_actor,v_balance,v_line_count)
  RETURNING * INTO v_review;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_opening_balance_reviewed','finance_cash_opening_balance_review',v_review.id,'{}'::jsonb,
    jsonb_build_object('proposal_id',v_proposal.id,'decision',v_review.decision,'reason',v_review.reason,'posted_gl_balance',v_balance,'posted_gl_line_count',v_line_count));
  RETURN jsonb_build_object('review_id',v_review.id,'decision',v_review.decision,'posted_gl_balance',v_balance,'posted_gl_line_count',v_line_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.review_finance_cash_opening_balance(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_finance_cash_opening_balance(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_finance_bank_statement(
  p_settlement_account_mapping_id uuid,
  p_evidence_id uuid,
  p_statement_reference text,
  p_period_from date,
  p_period_to date,
  p_opening_balance numeric,
  p_closing_balance numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_mapping public.purchase_supplier_payment_settlement_accounts%ROWTYPE;
  v_evidence public.finance_cash_account_evidence%ROWTYPE;
  v_row public.finance_bank_statements%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to register a bank statement';
  END IF;
  IF p_statement_reference IS NULL OR char_length(btrim(p_statement_reference)) NOT BETWEEN 2 AND 120
     OR p_period_from IS NULL OR p_period_to IS NULL OR p_period_to<p_period_from
     OR (p_period_to-p_period_from)>93
     OR p_period_to>(statement_timestamp() AT TIME ZONE 'UTC')::date
     OR p_opening_balance IS NULL OR p_closing_balance IS NULL
     OR p_opening_balance<=-10000000000000000 OR p_opening_balance>=10000000000000000
     OR p_closing_balance<=-10000000000000000 OR p_closing_balance>=10000000000000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='bank statement period, reference or balances are invalid';
  END IF;
  SELECT m.* INTO v_mapping FROM public.purchase_supplier_payment_settlement_accounts m
  WHERE m.id=p_settlement_account_mapping_id AND m.organization_id=v_org AND m.is_active AND m.settlement_kind='bank';
  SELECT e.* INTO v_evidence FROM public.finance_cash_account_evidence e
  WHERE e.id=p_evidence_id AND e.organization_id=v_org
    AND e.settlement_account_mapping_id=p_settlement_account_mapping_id AND e.evidence_kind='bank_statement';
  IF v_mapping.id IS NULL OR v_evidence.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='same-tenant bank statement evidence and active bank account are required';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.finance_bank_statements s
    WHERE s.organization_id=v_org AND s.settlement_account_mapping_id=p_settlement_account_mapping_id
      AND daterange(s.period_from,s.period_to,'[]') && daterange(p_period_from,p_period_to,'[]')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='bank statement period overlaps an existing statement for this account';
  END IF;
  INSERT INTO public.finance_bank_statements(
    organization_id,settlement_account_mapping_id,evidence_id,statement_reference,period_from,period_to,
    statement_opening_balance,statement_closing_balance,currency,created_by_profile_id
  ) VALUES(v_org,p_settlement_account_mapping_id,p_evidence_id,btrim(p_statement_reference),p_period_from,p_period_to,
    p_opening_balance,p_closing_balance,v_mapping.currency,v_actor)
  RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.bank_statement_registered','finance_bank_statement',v_row.id,'{}'::jsonb,
    jsonb_build_object('mapping_id',v_row.settlement_account_mapping_id,'period_from',v_row.period_from,'period_to',v_row.period_to,
      'opening_balance',v_row.statement_opening_balance,'closing_balance',v_row.statement_closing_balance,'currency',v_row.currency,'evidence_id',v_row.evidence_id));
  RETURN jsonb_build_object('statement_id',v_row.id,'currency',v_row.currency,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_finance_bank_statement(uuid,uuid,text,date,date,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_finance_bank_statement(uuid,uuid,text,date,date,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_finance_bank_statement_line(
  p_statement_id uuid,
  p_line_number integer,
  p_transaction_date date,
  p_external_reference text,
  p_description text,
  p_signed_amount numeric,
  p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_statement public.finance_bank_statements%ROWTYPE;
  v_existing public.finance_bank_statement_lines%ROWTYPE;
  v_row public.finance_bank_statement_lines%ROWTYPE;
  v_fingerprint text;
  v_line_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to record bank statement lines';
  END IF;
  SELECT s.* INTO v_statement FROM public.finance_bank_statements s
  WHERE s.id=p_statement_id AND s.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bank statement is not available in this organization'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_bank_statement_reconciliation_runs r
    WHERE r.organization_id=v_org AND r.statement_id=v_statement.id AND r.outcome='VERIFIED') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='verified bank statement is immutable and closed';
  END IF;
  IF p_line_number IS NULL OR p_line_number NOT BETWEEN 1 AND 10000
     OR p_transaction_date IS NULL OR p_transaction_date NOT BETWEEN v_statement.period_from AND v_statement.period_to
     OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 2 AND 500
     OR p_external_reference IS NOT NULL AND char_length(p_external_reference)>160
     OR p_signed_amount IS NULL OR p_signed_amount=0
     OR p_signed_amount<=-10000000000000000 OR p_signed_amount>=10000000000000000
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='bank statement line is invalid';
  END IF;
  SELECT count(*)::integer INTO v_line_count FROM public.finance_bank_statement_lines l
  WHERE l.organization_id=v_org AND l.statement_id=v_statement.id;
  IF v_line_count>=10000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='bank statement line limit reached'; END IF;
  v_fingerprint:=md5(jsonb_build_object(
    'statement',p_statement_id,'line',p_line_number,'date',p_transaction_date,'reference',p_external_reference,
    'description',btrim(p_description),'amount',p_signed_amount
  )::text);
  SELECT l.* INTO v_existing FROM public.finance_bank_statement_lines l
  WHERE l.organization_id=v_org AND l.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint=v_fingerprint THEN
      RETURN jsonb_build_object('line_id',v_existing.id,'replayed',true);
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='bank statement line idempotency key conflicts with a different payload';
  END IF;
  INSERT INTO public.finance_bank_statement_lines(
    organization_id,statement_id,line_number,transaction_date,external_reference,description,signed_amount,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES(v_org,v_statement.id,p_line_number,p_transaction_date,nullif(btrim(coalesce(p_external_reference,'')),''),btrim(p_description),
    p_signed_amount,p_idempotency_key,v_fingerprint,v_actor)
  RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.bank_statement_line_recorded','finance_bank_statement_line',v_row.id,'{}'::jsonb,
    jsonb_build_object('statement_id',v_row.statement_id,'line_number',v_row.line_number,'transaction_date',v_row.transaction_date,
      'reference',v_row.external_reference,'signed_amount',v_row.signed_amount));
  RETURN jsonb_build_object('line_id',v_row.id,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_finance_bank_statement_line(uuid,integer,date,text,text,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_finance_bank_statement_line(uuid,integer,date,text,text,numeric,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_finance_bank_statement_match_candidates(
  p_statement_id uuid,
  p_statement_line_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_statement public.finance_bank_statements%ROWTYPE;
  v_line public.finance_bank_statement_lines%ROWTYPE;
  v_account_id uuid;
  v_rows jsonb;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read bank match candidates';
  END IF;
  SELECT s.* INTO v_statement FROM public.finance_bank_statements s
  WHERE s.id=p_statement_id AND s.organization_id=v_org;
  SELECT l.* INTO v_line FROM public.finance_bank_statement_lines l
  WHERE l.id=p_statement_line_id AND l.organization_id=v_org AND l.statement_id=p_statement_id;
  IF v_statement.id IS NULL OR v_line.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bank statement line is not available in this organization';
  END IF;
  SELECT m.accounting_account_id INTO v_account_id FROM public.purchase_supplier_payment_settlement_accounts m
  WHERE m.id=v_statement.settlement_account_mapping_id AND m.organization_id=v_org;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'journal_entry_id',q.journal_entry_id,'journal_line_number',q.line_number,'entry_number',q.entry_number,
    'entry_date',q.entry_date::text,'description',q.description,'account_code',q.account_code,
    'account_name',q.account_name,'debit',q.debit::text,'credit',q.credit::text,
    'signed_amount',(q.debit-q.credit)::text
  ) ORDER BY q.entry_date,q.entry_number,q.line_number),'[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT e.id AS journal_entry_id,l.line_number,e.entry_number,e.entry_date,e.description,a.code AS account_code,a.name AS account_name,l.debit,l.credit
    FROM public.accounting_journal_lines l
    JOIN public.accounting_journal_entries e ON e.id=l.journal_entry_id AND e.organization_id=l.organization_id
    JOIN public.accounting_accounts a ON a.id=l.account_id AND a.organization_id=l.organization_id
    WHERE l.organization_id=v_org AND l.account_id=v_account_id
      AND e.status='posted' AND e.entry_date BETWEEN v_statement.period_from AND v_statement.period_to
      AND ((v_line.signed_amount>0 AND l.debit=v_line.signed_amount AND l.credit=0)
        OR (v_line.signed_amount<0 AND l.credit=abs(v_line.signed_amount) AND l.debit=0))
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_bank_statement_line_matches x
        WHERE x.organization_id=v_org AND x.journal_entry_id=e.id AND x.journal_line_number=l.line_number
      )
    ORDER BY e.entry_date,e.entry_number,l.line_number
    LIMIT 100
  ) q;
  RETURN v_rows;
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_finance_bank_statement_match_candidates(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_finance_bank_statement_match_candidates(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.match_finance_bank_statement_line(
  p_statement_id uuid,
  p_statement_line_id uuid,
  p_journal_entry_id uuid,
  p_journal_line_number integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_statement public.finance_bank_statements%ROWTYPE;
  v_line public.finance_bank_statement_lines%ROWTYPE;
  v_account_id uuid;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
  v_entry_date date;
  v_status text;
  v_line_count integer;
  v_debit_total numeric(18,2);
  v_credit_total numeric(18,2);
  v_match public.finance_bank_statement_line_matches%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to match a bank statement line';
  END IF;
  SELECT s.* INTO v_statement FROM public.finance_bank_statements s
  WHERE s.id=p_statement_id AND s.organization_id=v_org FOR UPDATE;
  SELECT l.* INTO v_line FROM public.finance_bank_statement_lines l
  WHERE l.id=p_statement_line_id AND l.organization_id=v_org AND l.statement_id=p_statement_id FOR UPDATE;
  IF v_statement.id IS NULL OR v_line.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bank statement line is not available in this organization';
  END IF;
  IF EXISTS(SELECT 1 FROM public.finance_bank_statement_reconciliation_runs r
    WHERE r.organization_id=v_org AND r.statement_id=v_statement.id AND r.outcome='VERIFIED') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='verified bank statement is immutable and closed';
  END IF;
  SELECT m.accounting_account_id INTO v_account_id FROM public.purchase_supplier_payment_settlement_accounts m
  WHERE m.id=v_statement.settlement_account_mapping_id AND m.organization_id=v_org AND m.is_active;
  SELECT l.debit,l.credit,e.entry_date,e.status INTO v_debit,v_credit,v_entry_date,v_status
  FROM public.accounting_journal_lines l
  JOIN public.accounting_journal_entries e ON e.id=l.journal_entry_id AND e.organization_id=l.organization_id
  WHERE l.organization_id=v_org AND l.journal_entry_id=p_journal_entry_id
    AND l.line_number=p_journal_line_number AND l.account_id=v_account_id;
  IF NOT FOUND OR v_status<>'posted' OR v_entry_date NOT BETWEEN v_statement.period_from AND v_statement.period_to
     OR NOT ((v_line.signed_amount>0 AND v_debit=v_line.signed_amount AND v_credit=0)
       OR (v_line.signed_amount<0 AND v_credit=abs(v_line.signed_amount) AND v_debit=0)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='bank statement line must match one same-account posted GL line for the exact signed amount and period';
  END IF;
  SELECT count(*)::integer,coalesce(sum(l.debit),0)::numeric(18,2),coalesce(sum(l.credit),0)::numeric(18,2)
    INTO v_line_count,v_debit_total,v_credit_total
  FROM public.accounting_journal_lines l
  WHERE l.organization_id=v_org AND l.journal_entry_id=p_journal_entry_id;
  IF v_line_count<2 OR v_debit_total<>v_credit_total THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='matched general-ledger journal is not balanced';
  END IF;
  INSERT INTO public.finance_bank_statement_line_matches(
    organization_id,statement_line_id,journal_entry_id,journal_line_number,matched_by_profile_id
  ) VALUES(v_org,v_line.id,p_journal_entry_id,p_journal_line_number,v_actor)
  RETURNING * INTO v_match;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.bank_statement_line_matched','finance_bank_statement_line_match',v_match.id,'{}'::jsonb,
    jsonb_build_object('statement_id',v_statement.id,'statement_line_id',v_line.id,'journal_entry_id',p_journal_entry_id,
      'journal_line_number',p_journal_line_number,'signed_amount',v_line.signed_amount));
  RETURN jsonb_build_object('match_id',v_match.id,'matched',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.match_finance_bank_statement_line(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.match_finance_bank_statement_line(uuid,uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_finance_bank_statement_reconciliation(
  p_statement_id uuid,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_statement public.finance_bank_statements%ROWTYPE;
  v_account_id uuid;
  v_statement_count integer:=0;
  v_matched_count integer:=0;
  v_unmatched_ledger integer:=0;
  v_statement_net numeric(18,2):=0;
  v_ledger_net numeric(18,2):=0;
  v_statement_difference numeric(18,2):=0;
  v_ledger_difference numeric(18,2):=0;
  v_run_number integer:=1;
  v_outcome text;
  v_run public.finance_bank_statement_reconciliation_runs%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to finalize bank reconciliation';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a reconciliation review note is required';
  END IF;
  SELECT s.* INTO v_statement FROM public.finance_bank_statements s
  WHERE s.id=p_statement_id AND s.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bank statement is not available in this organization'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_bank_statement_reconciliation_runs r
    WHERE r.organization_id=v_org AND r.statement_id=v_statement.id AND r.outcome='VERIFIED') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='bank statement already has a verified reconciliation run';
  END IF;
  SELECT m.accounting_account_id INTO v_account_id FROM public.purchase_supplier_payment_settlement_accounts m
  WHERE m.id=v_statement.settlement_account_mapping_id AND m.organization_id=v_org;
  SELECT count(*)::integer, count(*) FILTER (WHERE x.id IS NOT NULL)::integer,
    coalesce(sum(l.signed_amount),0)::numeric(18,2)
  INTO v_statement_count,v_matched_count,v_statement_net
  FROM public.finance_bank_statement_lines l
  LEFT JOIN public.finance_bank_statement_line_matches x
    ON x.organization_id=l.organization_id AND x.statement_line_id=l.id
  WHERE l.organization_id=v_org AND l.statement_id=v_statement.id;
  SELECT count(*)::integer,coalesce(sum(l.debit-l.credit),0)::numeric(18,2)
  INTO v_unmatched_ledger,v_ledger_net
  FROM public.accounting_journal_lines l
  JOIN public.accounting_journal_entries e ON e.id=l.journal_entry_id AND e.organization_id=l.organization_id
  WHERE l.organization_id=v_org AND l.account_id=v_account_id
    AND e.status='posted' AND e.entry_date BETWEEN v_statement.period_from AND v_statement.period_to
    AND NOT EXISTS(
      SELECT 1 FROM public.finance_bank_statement_line_matches x
      WHERE x.organization_id=v_org AND x.journal_entry_id=l.journal_entry_id AND x.journal_line_number=l.line_number
    );
  v_statement_difference:=v_statement.statement_closing_balance-v_statement.statement_opening_balance-v_statement_net;
  v_ledger_difference:=v_ledger_net-v_statement_net;
  SELECT coalesce(max(r.run_number),0)+1 INTO v_run_number
  FROM public.finance_bank_statement_reconciliation_runs r
  WHERE r.organization_id=v_org AND r.statement_id=v_statement.id;
  v_outcome:=CASE WHEN v_statement_count>0 AND v_statement_count=v_matched_count
    AND v_unmatched_ledger=0 AND v_statement_difference=0 AND v_ledger_difference=0
    THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END;
  INSERT INTO public.finance_bank_statement_reconciliation_runs(
    organization_id,statement_id,run_number,outcome,statement_difference,ledger_difference,
    unmatched_statement_lines,unmatched_ledger_lines,statement_line_count,matched_line_count,
    statement_net_movement,ledger_net_movement,reviewed_by_profile_id,reason
  ) VALUES(v_org,v_statement.id,v_run_number,v_outcome,v_statement_difference,v_ledger_difference,
    greatest(v_statement_count-v_matched_count,0),v_unmatched_ledger,v_statement_count,v_matched_count,
    v_statement_net,v_ledger_net,v_actor,btrim(p_reason))
  RETURNING * INTO v_run;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.bank_statement_reconciliation_run','finance_bank_statement_reconciliation_run',v_run.id,'{}'::jsonb,
    jsonb_build_object('statement_id',v_statement.id,'run_number',v_run.run_number,'outcome',v_run.outcome,
      'statement_difference',v_run.statement_difference,'ledger_difference',v_run.ledger_difference,
      'unmatched_statement_lines',v_run.unmatched_statement_lines,'unmatched_ledger_lines',v_run.unmatched_ledger_lines));
  RETURN jsonb_build_object('run_id',v_run.id,'run_number',v_run.run_number,'outcome',v_run.outcome,
    'statement_difference',v_run.statement_difference,'ledger_difference',v_run.ledger_difference,
    'unmatched_statement_lines',v_run.unmatched_statement_lines,'unmatched_ledger_lines',v_run.unmatched_ledger_lines,
    'statement_net_movement',v_run.statement_net_movement,'ledger_net_movement',v_run.ledger_net_movement);
END;
$function$;
REVOKE ALL ON FUNCTION public.finalize_finance_bank_statement_reconciliation(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_finance_bank_statement_reconciliation(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_finance_cash_reconciliation_workspace()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_role text;
  v_accounts jsonb:='[]'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_openings jsonb:='[]'::jsonb;
  v_statements jsonb:='[]'::jsonb;
BEGIN
  SELECT p.organization_id,r.role INTO v_org,v_role
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true AND r.role IN ('admin','manager','accountant')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END LIMIT 1;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read cash reconciliation workspace';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'account_id',a.id,'account_code',a.code,'account_name',a.name,
    'display_name',m.display_name,'settlement_kind',m.settlement_kind,'currency',m.currency,'is_active',m.is_active
  ) ORDER BY m.settlement_kind,m.display_name,m.currency),'[]'::jsonb)
  INTO v_accounts
  FROM public.purchase_supplier_payment_settlement_accounts m
  JOIN public.accounting_accounts a ON a.id=m.accounting_account_id AND a.organization_id=m.organization_id
  WHERE m.organization_id=v_org AND a.is_active;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'mapping_id',e.settlement_account_mapping_id,'evidence_kind',e.evidence_kind,
    'file_name',e.file_name,'mime_type',e.mime_type,'byte_size',e.byte_size,'content_sha256',e.content_sha256,
    'storage_path',e.storage_path,'created_at',e.created_at,'uploaded_by',e.uploaded_by_profile_id
  ) ORDER BY e.created_at DESC,e.id DESC),'[]'::jsonb)
  INTO v_evidence
  FROM (SELECT * FROM public.finance_cash_account_evidence e
    WHERE e.organization_id=v_org ORDER BY e.created_at DESC,e.id DESC LIMIT 500) e;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'mapping_id',p.settlement_account_mapping_id,'evidence_id',p.evidence_id,
    'as_of_date',p.as_of_date,'opening_balance',p.opening_balance::text,'currency',p.currency,
    'submitted_by',p.created_by_profile_id,'submitted_at',p.created_at,
    'review_decision',r.decision,'review_reason',r.reason,'reviewed_by',r.reviewer_profile_id,'reviewed_at',r.reviewed_at,
    'posted_gl_balance',r.posted_gl_balance::text,'posted_gl_line_count',r.posted_gl_line_count
  ) ORDER BY p.as_of_date DESC,p.created_at DESC),'[]'::jsonb)
  INTO v_openings
  FROM public.finance_cash_opening_balance_proposals p
  LEFT JOIN public.finance_cash_opening_balance_reviews r ON r.organization_id=p.organization_id AND r.proposal_id=p.id
  WHERE p.organization_id=v_org;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'mapping_id',s.settlement_account_mapping_id,'evidence_id',s.evidence_id,
    'statement_reference',s.statement_reference,'period_from',s.period_from,'period_to',s.period_to,
    'opening_balance',s.statement_opening_balance::text,'closing_balance',s.statement_closing_balance::text,
    'currency',s.currency,'created_by',s.created_by_profile_id,'created_at',s.created_at,
    'lines',coalesce(lines.items,'[]'::jsonb),
    'line_count',coalesce(lines.line_count,0),'matched_count',coalesce(lines.matched_count,0),
    'latest_run',latest.run_data
  ) ORDER BY s.period_to DESC,s.created_at DESC),'[]'::jsonb)
  INTO v_statements
  FROM public.finance_bank_statements s
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id',l.id,'line_number',l.line_number,'transaction_date',l.transaction_date,
      'external_reference',l.external_reference,'description',l.description,
      'signed_amount',l.signed_amount::text,'match_id',x.id,'journal_entry_id',x.journal_entry_id,
      'journal_line_number',x.journal_line_number
    ) ORDER BY l.line_number) AS items,
    count(*)::integer AS line_count,count(*) FILTER (WHERE x.id IS NOT NULL)::integer AS matched_count
    FROM public.finance_bank_statement_lines l
    LEFT JOIN public.finance_bank_statement_line_matches x
      ON x.organization_id=l.organization_id AND x.statement_line_id=l.id
    WHERE l.organization_id=s.organization_id AND l.statement_id=s.id
  ) lines ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id',r.id,'run_number',r.run_number,'outcome',r.outcome,
      'statement_difference',r.statement_difference::text,'ledger_difference',r.ledger_difference::text,
      'unmatched_statement_lines',r.unmatched_statement_lines,'unmatched_ledger_lines',r.unmatched_ledger_lines,
      'statement_net_movement',r.statement_net_movement::text,'ledger_net_movement',r.ledger_net_movement::text,
      'reviewed_by',r.reviewed_by_profile_id,'reviewed_at',r.reviewed_at,'reason',r.reason
    ) AS run_data
    FROM public.finance_bank_statement_reconciliation_runs r
    WHERE r.organization_id=s.organization_id AND r.statement_id=s.id
    ORDER BY r.run_number DESC LIMIT 1
  ) latest ON true
  WHERE s.organization_id=v_org;

  RETURN jsonb_build_object(
    'status','OK','effectiveRole',v_role,'sideEffects','NONE',
    'authorization',jsonb_build_object('tenantScope','SERVER_RESOLVED_AUTHENTICATED_TENANT','effectiveRole',v_role),
    'accounts',v_accounts,'evidence',v_evidence,'openingBalances',v_openings,'statements',v_statements,
    'asOf',statement_timestamp()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_finance_cash_reconciliation_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_finance_cash_reconciliation_workspace() TO authenticated;

COMMIT;
