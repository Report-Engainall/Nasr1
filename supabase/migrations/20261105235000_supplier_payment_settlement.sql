-- AGH-FIN-SUPPLIER-PAYMENT-SETTLEMENT-001
-- Source-backed supplier payments, receipt allocations, reconciliation evidence and a draft-only GL handoff.
-- No FX, automatic posting, or inferred settlement is performed.
BEGIN;

-- The source schema guarantees global primary keys, but the tenant-paired foreign keys below
-- require explicit unique parent keys. These indexes are safe because id is already globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_supplier_payment_supplier_org_id_uq
  ON public.suppliers(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_supplier_payment_receipt_org_id_uq
  ON public.purchase_receipts(organization_id,id);

ALTER TABLE public.accounting_journal_entries
  DROP CONSTRAINT IF EXISTS accounting_journal_entries_source_type_check;
ALTER TABLE public.accounting_journal_entries
  ADD CONSTRAINT accounting_journal_entries_source_type_check
  CHECK (source_type IN (
    'manual','adjustment','invoice','payment','cash_expense',
    'purchase_receipt','purchase_supplier_credit_note','purchase_supplier_payment','onyx_import'
  ));

-- Finance explicitly maps a real cash/bank chart-of-accounts asset to a settlement instrument.
-- This is configuration only; it is not a bank integration or proof that a transfer cleared.
CREATE TABLE public.purchase_supplier_payment_settlement_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  accounting_account_id uuid NOT NULL,
  settlement_kind text NOT NULL CHECK (settlement_kind IN ('cash','bank')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  is_active boolean NOT NULL DEFAULT true,
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,accounting_account_id,currency),
  FOREIGN KEY (organization_id,accounting_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.purchase_supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_number bigint GENERATED ALWAYS AS IDENTITY,
  supplier_id uuid NOT NULL,
  payment_date date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0 AND amount < 10000000000000000),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','bank_transfer','cheque')),
  payment_reference text NOT NULL CHECK (char_length(btrim(payment_reference)) BETWEEN 3 AND 200),
  settlement_account_mapping_id uuid NOT NULL,
  settlement_account_id uuid NOT NULL,
  payable_account_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','journal_draft_created','void')),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  voided_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,payment_number),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,supplier_id)
    REFERENCES public.suppliers(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,settlement_account_mapping_id)
    REFERENCES public.purchase_supplier_payment_settlement_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,settlement_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,payable_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  CHECK (
    (status IN ('recorded','journal_draft_created')
      AND voided_by_profile_id IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR
    (status='void' AND voided_by_profile_id IS NOT NULL AND voided_at IS NOT NULL
      AND char_length(btrim(coalesce(void_reason,''))) BETWEEN 5 AND 500)
  )
);

CREATE TABLE public.purchase_supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  source_journal_entry_id uuid NOT NULL,
  payable_account_id uuid NOT NULL,
  allocated_amount numeric(18,2) NOT NULL CHECK (allocated_amount > 0 AND allocated_amount < 10000000000000000),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,payment_id)
    REFERENCES public.purchase_supplier_payments(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,receipt_id)
    REFERENCES public.purchase_receipts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,source_journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,payable_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,payment_id,receipt_id)
);

CREATE TABLE public.purchase_supplier_payment_accounting_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  payable_account_id uuid NOT NULL,
  settlement_account_id uuid NOT NULL,
  source_amount numeric(18,2) NOT NULL CHECK (source_amount > 0 AND source_amount < 10000000000000000),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,payment_id)
    REFERENCES public.purchase_supplier_payments(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,payable_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,settlement_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,payment_id),
  UNIQUE (organization_id,journal_entry_id),
  UNIQUE (organization_id,idempotency_key),
  CHECK (payable_account_id <> settlement_account_id)
);

CREATE TABLE public.purchase_supplier_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('recorded','journal_draft_created','voided')),
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,payment_id)
    REFERENCES public.purchase_supplier_payments(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.purchase_supplier_payment_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('matched','exception')),
  evidence_type text NOT NULL CHECK (evidence_type IN ('bank_statement_line','cash_voucher','cheque_clearance')),
  evidence_reference text NOT NULL CHECK (char_length(btrim(evidence_reference)) BETWEEN 3 AND 200),
  observed_amount numeric(18,2) NOT NULL CHECK (observed_amount >= 0 AND observed_amount < 10000000000000000),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason text,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,payment_id)
    REFERENCES public.purchase_supplier_payments(organization_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,idempotency_key),
  CHECK (
    (action='matched' AND reason IS NULL)
    OR (action='exception' AND char_length(btrim(coalesce(reason,''))) BETWEEN 3 AND 500)
  )
);

CREATE INDEX purchase_supplier_payments_supplier_date_idx
  ON public.purchase_supplier_payments(organization_id,supplier_id,currency,payment_date DESC,payment_number DESC);
CREATE INDEX purchase_supplier_payment_allocations_receipt_idx
  ON public.purchase_supplier_payment_allocations(organization_id,receipt_id,payment_id);
CREATE INDEX purchase_supplier_payment_reconciliation_history_idx
  ON public.purchase_supplier_payment_reconciliation_events(organization_id,payment_id,created_at DESC,id DESC);

ALTER TABLE public.purchase_supplier_payment_settlement_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_payment_accounting_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_payment_reconciliation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_supplier_payment_settlement_accounts_finance_read
  ON public.purchase_supplier_payment_settlement_accounts FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY purchase_supplier_payments_finance_read
  ON public.purchase_supplier_payments FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY purchase_supplier_payment_allocations_finance_read
  ON public.purchase_supplier_payment_allocations FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY purchase_supplier_payment_drafts_finance_read
  ON public.purchase_supplier_payment_accounting_drafts FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY purchase_supplier_payment_events_finance_read
  ON public.purchase_supplier_payment_events FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY purchase_supplier_payment_reconciliation_finance_read
  ON public.purchase_supplier_payment_reconciliation_events FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );

GRANT SELECT ON public.purchase_supplier_payment_settlement_accounts,
  public.purchase_supplier_payments,public.purchase_supplier_payment_allocations,
  public.purchase_supplier_payment_accounting_drafts,public.purchase_supplier_payment_events,
  public.purchase_supplier_payment_reconciliation_events TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.purchase_supplier_payment_settlement_accounts,
  public.purchase_supplier_payments,public.purchase_supplier_payment_allocations,
  public.purchase_supplier_payment_accounting_drafts,public.purchase_supplier_payment_events,
  public.purchase_supplier_payment_reconciliation_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_purchase_supplier_payment_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  IF ROW(
    OLD.organization_id,OLD.supplier_id,OLD.payment_date,OLD.amount,OLD.currency,OLD.payment_method,
    OLD.payment_reference,OLD.settlement_account_mapping_id,OLD.settlement_account_id,OLD.payable_account_id,
    OLD.idempotency_key,OLD.payload_fingerprint,OLD.created_by_profile_id,OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.organization_id,NEW.supplier_id,NEW.payment_date,NEW.amount,NEW.currency,NEW.payment_method,
    NEW.payment_reference,NEW.settlement_account_mapping_id,NEW.settlement_account_id,NEW.payable_account_id,
    NEW.idempotency_key,NEW.payload_fingerprint,NEW.created_by_profile_id,NEW.created_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier payment source evidence is immutable';
  END IF;
  IF OLD.status<>'recorded' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status='journal_draft_created' AND NEW.status='void') THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier payment lifecycle transition is immutable';
    END IF;
  END IF;
  IF NEW.status='void' THEN
    IF NEW.voided_by_profile_id IS NULL OR NEW.voided_at IS NULL
       OR char_length(btrim(coalesce(NEW.void_reason,''))) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='supplier payment void requires actor, timestamp and reason';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.purchase_supplier_payment_accounting_drafts d
      JOIN public.accounting_journal_entries j
        ON j.organization_id=d.organization_id AND j.id=d.journal_entry_id
      WHERE d.organization_id=OLD.organization_id AND d.payment_id=OLD.id
        AND j.status<>'void'
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier payment journal must be void before the source payment can be voided';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER purchase_supplier_payment_source_guard
  BEFORE UPDATE ON public.purchase_supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_payment_source();

CREATE OR REPLACE FUNCTION public.guard_purchase_supplier_payment_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier payment source history is append-only';
END;
$function$;
CREATE TRIGGER purchase_supplier_payment_allocation_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_payment_immutable();
CREATE TRIGGER purchase_supplier_payment_events_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_payment_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_payment_immutable();
CREATE TRIGGER purchase_supplier_payment_reconciliation_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_payment_reconciliation_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_payment_immutable();
CREATE TRIGGER purchase_supplier_payment_drafts_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_payment_accounting_drafts
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_payment_immutable();

-- Internal full-history source resolver. It is never exposed to browser roles.
CREATE OR REPLACE FUNCTION public.supplier_payment_open_receipts(
  p_organization_id uuid,
  p_supplier_id uuid DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS TABLE (
  receipt_id uuid,
  receipt_number text,
  purchase_order_number text,
  supplier_id uuid,
  supplier_name text,
  currency text,
  receipt_date date,
  source_journal_entry_id uuid,
  source_journal_entry_number text,
  payable_account_id uuid,
  payable_account_code text,
  payable_account_name text,
  source_amount numeric,
  credit_note_total numeric,
  reserved_payment_total numeric,
  posted_payment_total numeric,
  outstanding_payable numeric,
  available_to_allocate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
WITH verified_receipts AS (
  SELECT
    r.id AS receipt_id,r.receipt_number,po.purchase_order_number,s.id AS supplier_id,s.name AS supplier_name,
    posting.source_currency AS currency,e.entry_date AS receipt_date,e.id AS source_journal_entry_id,
    e.entry_number::text AS source_journal_entry_number,posting.payable_account_id,
    payable.code AS payable_account_code,payable.name AS payable_account_name,posting.source_amount
  FROM public.purchase_receipt_accounting_postings posting
  JOIN public.purchase_receipts r
    ON r.id=posting.receipt_id AND r.organization_id=posting.organization_id
  JOIN public.purchase_orders po
    ON po.id=r.purchase_order_id AND po.organization_id=r.organization_id
  JOIN public.suppliers s
    ON s.id=po.supplier_id AND s.organization_id=po.organization_id
  JOIN public.accounting_journal_entries e
    ON e.id=posting.journal_entry_id AND e.organization_id=posting.organization_id
  JOIN LATERAL (
    SELECT
      count(*)::integer AS line_count,
      coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
      coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
      coalesce(sum(l.debit) FILTER (WHERE l.account_id=posting.inventory_account_id),0)::numeric(18,2) AS inventory_debit,
      coalesce(sum(l.credit) FILTER (WHERE l.account_id=posting.payable_account_id),0)::numeric(18,2) AS payable_credit
    FROM public.accounting_journal_lines l
    WHERE l.organization_id=e.organization_id AND l.journal_entry_id=e.id
  ) lines ON lines.line_count=2 AND lines.debit_total=posting.source_amount
      AND lines.credit_total=posting.source_amount AND lines.inventory_debit=posting.source_amount
      AND lines.payable_credit=posting.source_amount
  JOIN public.accounting_accounts payable
    ON payable.id=posting.payable_account_id AND payable.organization_id=posting.organization_id
   AND payable.is_active AND payable.account_type='liability'
  JOIN public.accounting_accounts inventory
    ON inventory.id=posting.inventory_account_id AND inventory.organization_id=posting.organization_id
   AND inventory.is_active AND inventory.account_type='asset'
  WHERE posting.organization_id=p_organization_id
    AND e.status='posted' AND e.source_type='purchase_receipt'
    AND e.source_reference=r.receipt_number
    AND (p_supplier_id IS NULL OR s.id=p_supplier_id)
    AND (p_currency IS NULL OR posting.source_currency=p_currency)
    AND NOT EXISTS (
      SELECT 1 FROM public.accounting_journal_reversals reversal
      WHERE reversal.organization_id=posting.organization_id
        AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id)
    )
),
verified_credit_notes AS (
  SELECT d.source_receipt_id,coalesce(sum(note.actual_amount),0)::numeric(18,2) AS credit_total
  FROM public.purchase_supplier_credit_note_accounting_drafts d
  JOIN public.purchase_supplier_credit_notes note
    ON note.id=d.credit_note_id AND note.organization_id=d.organization_id
  JOIN public.purchase_supplier_returns sr
    ON sr.id=d.supplier_return_id AND sr.organization_id=d.organization_id AND sr.status='posted'
  JOIN verified_receipts vr
    ON vr.receipt_id=d.source_receipt_id AND vr.source_journal_entry_id=d.source_journal_entry_id
   AND vr.payable_account_id=d.payable_account_id AND vr.supplier_id=note.supplier_id
   AND vr.currency=d.currency
  JOIN public.accounting_journal_entries source_journal
    ON source_journal.id=d.source_journal_entry_id AND source_journal.organization_id=d.organization_id
   AND source_journal.status='posted' AND source_journal.source_type='purchase_receipt'
   AND source_journal.source_reference=vr.receipt_number
  JOIN public.accounting_journal_entries e
    ON e.id=d.journal_entry_id AND e.organization_id=d.organization_id
   AND e.status='posted' AND e.source_type='purchase_supplier_credit_note'
   AND e.source_reference=note.supplier_credit_note_number
  JOIN LATERAL (
    SELECT
      count(*)::integer AS line_count,
      coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
      coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
      coalesce(sum(l.debit) FILTER (WHERE l.account_id=d.payable_account_id),0)::numeric(18,2) AS payable_debit
    FROM public.accounting_journal_lines l
    WHERE l.organization_id=e.organization_id AND l.journal_entry_id=e.id
  ) lines ON lines.line_count BETWEEN 2 AND 3 AND lines.debit_total=d.actual_amount
      AND lines.credit_total=d.actual_amount AND lines.payable_debit=d.actual_amount
  WHERE d.organization_id=p_organization_id AND note.status='journal_draft_created'
    AND note.actual_amount=d.actual_amount AND note.currency=d.currency
    AND NOT EXISTS (
      SELECT 1 FROM public.accounting_journal_reversals reversal
      WHERE reversal.organization_id=d.organization_id
        AND (reversal.original_journal_entry_id=source_journal.id OR reversal.reversal_journal_entry_id=source_journal.id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.accounting_journal_reversals reversal
      WHERE reversal.organization_id=d.organization_id
        AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id)
    )
  GROUP BY d.source_receipt_id
),
valid_posted_payments AS (
  SELECT p.id AS payment_id
  FROM public.purchase_supplier_payments p
  JOIN public.purchase_supplier_payment_accounting_drafts d
    ON d.payment_id=p.id AND d.organization_id=p.organization_id
   AND d.payable_account_id=p.payable_account_id AND d.settlement_account_id=p.settlement_account_id
   AND d.source_amount=p.amount AND d.currency=p.currency
  JOIN public.accounting_journal_entries e
    ON e.id=d.journal_entry_id AND e.organization_id=d.organization_id
   AND e.status='posted' AND e.source_type='purchase_supplier_payment'
   AND e.source_reference=p.payment_number::text
  JOIN public.accounting_accounts payable
    ON payable.id=p.payable_account_id AND payable.organization_id=p.organization_id
   AND payable.is_active AND payable.account_type='liability'
  JOIN public.accounting_accounts settlement
    ON settlement.id=p.settlement_account_id AND settlement.organization_id=p.organization_id
   AND settlement.is_active AND settlement.account_type='asset'
  JOIN LATERAL (
    SELECT
      count(*)::integer AS line_count,
      coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
      coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
      coalesce(sum(l.debit) FILTER (WHERE l.account_id=p.payable_account_id),0)::numeric(18,2) AS payable_debit,
      coalesce(sum(l.credit) FILTER (WHERE l.account_id=p.settlement_account_id),0)::numeric(18,2) AS settlement_credit
    FROM public.accounting_journal_lines l
    WHERE l.organization_id=e.organization_id AND l.journal_entry_id=e.id
  ) lines ON lines.line_count=2 AND lines.debit_total=p.amount AND lines.credit_total=p.amount
      AND lines.payable_debit=p.amount AND lines.settlement_credit=p.amount
  WHERE p.organization_id=p_organization_id AND p.status='journal_draft_created'
    AND NOT EXISTS (
      SELECT 1 FROM public.accounting_journal_reversals reversal
      WHERE reversal.organization_id=p.organization_id
        AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_supplier_payment_allocations allocation
      WHERE allocation.organization_id=p.organization_id AND allocation.payment_id=p.id
        AND NOT EXISTS (
          SELECT 1 FROM verified_receipts vr
          WHERE vr.receipt_id=allocation.receipt_id
            AND vr.source_journal_entry_id=allocation.source_journal_entry_id
            AND vr.payable_account_id=allocation.payable_account_id
            AND vr.currency=allocation.currency
        )
    )
),
allocation_totals AS (
  SELECT
    allocation.receipt_id,
    coalesce(sum(allocation.allocated_amount) FILTER (WHERE p.status<>'void'),0)::numeric(18,2) AS reserved_total,
    coalesce(sum(allocation.allocated_amount) FILTER (WHERE p.status<>'void' AND valid.payment_id IS NOT NULL),0)::numeric(18,2) AS posted_total
  FROM public.purchase_supplier_payment_allocations allocation
  JOIN public.purchase_supplier_payments p
    ON p.id=allocation.payment_id AND p.organization_id=allocation.organization_id
  LEFT JOIN valid_posted_payments valid ON valid.payment_id=p.id
  WHERE allocation.organization_id=p_organization_id
  GROUP BY allocation.receipt_id
)
SELECT
  vr.receipt_id,vr.receipt_number,vr.purchase_order_number,vr.supplier_id,vr.supplier_name,
  vr.currency,vr.receipt_date,vr.source_journal_entry_id,vr.source_journal_entry_number,
  vr.payable_account_id,vr.payable_account_code,vr.payable_account_name,vr.source_amount,
  coalesce(credit.credit_total,0)::numeric(18,2),
  coalesce(allocation.reserved_total,0)::numeric(18,2),
  coalesce(allocation.posted_total,0)::numeric(18,2),
  (vr.source_amount-coalesce(credit.credit_total,0)-coalesce(allocation.posted_total,0))::numeric(18,2),
  (vr.source_amount-coalesce(credit.credit_total,0)-coalesce(allocation.reserved_total,0))::numeric(18,2)
FROM verified_receipts vr
LEFT JOIN verified_credit_notes credit ON credit.source_receipt_id=vr.receipt_id
LEFT JOIN allocation_totals allocation ON allocation.receipt_id=vr.receipt_id
WHERE (p_supplier_id IS NULL OR vr.supplier_id=p_supplier_id)
  AND (p_currency IS NULL OR vr.currency=p_currency)
$function$;
REVOKE ALL ON FUNCTION public.supplier_payment_open_receipts(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.register_purchase_supplier_settlement_account(
  p_accounting_account_id uuid,
  p_settlement_kind text,
  p_currency text,
  p_display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_kind text:=lower(btrim(coalesce(p_settlement_kind,'')));
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
  v_name text:=btrim(coalesce(p_display_name,''));
  v_account public.accounting_accounts%ROWTYPE;
  v_mapping public.purchase_supplier_payment_settlement_accounts%ROWTYPE;
  v_created boolean:=false;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to register supplier settlement account';
  END IF;
  IF p_accounting_account_id IS NULL OR v_kind NOT IN ('cash','bank')
     OR v_currency !~ '^[A-Z]{3}$' OR char_length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid supplier settlement account configuration';
  END IF;
  SELECT a.* INTO v_account FROM public.accounting_accounts a
  WHERE a.id=p_accounting_account_id AND a.organization_id=v_org AND a.is_active
    AND a.account_type='asset' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='settlement account must be an active asset account in this organization';
  END IF;

  INSERT INTO public.purchase_supplier_payment_settlement_accounts(
    organization_id,accounting_account_id,settlement_kind,currency,display_name,created_by_profile_id
  ) VALUES (v_org,v_account.id,v_kind,v_currency,v_name,v_actor)
  ON CONFLICT (organization_id,accounting_account_id,currency) DO NOTHING
  RETURNING * INTO v_mapping;
  v_created:=FOUND;
  IF NOT v_created THEN
    SELECT m.* INTO v_mapping FROM public.purchase_supplier_payment_settlement_accounts m
    WHERE m.organization_id=v_org AND m.accounting_account_id=v_account.id AND m.currency=v_currency
    FOR UPDATE;
    IF NOT FOUND OR v_mapping.settlement_kind IS DISTINCT FROM v_kind
       OR v_mapping.display_name IS DISTINCT FROM v_name THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='settlement account mapping already exists with a different configuration';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'settlement_account_id',v_mapping.id,'accounting_account_id',v_account.id,
      'settlement_kind',v_mapping.settlement_kind,'currency',v_mapping.currency,
      'display_name',v_mapping.display_name,'replayed',true
    );
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'supplier_payment.settlement_account_registered','supplier_payment_settlement_account',
    v_mapping.id,'{}'::jsonb,
    pg_catalog.jsonb_build_object('accounting_account_id',v_account.id,'account_code',v_account.code,
      'settlement_kind',v_kind,'currency',v_currency,'display_name',v_name));
  RETURN pg_catalog.jsonb_build_object(
    'settlement_account_id',v_mapping.id,'accounting_account_id',v_account.id,
    'settlement_kind',v_mapping.settlement_kind,'currency',v_mapping.currency,
    'display_name',v_mapping.display_name,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.register_purchase_supplier_settlement_account(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_purchase_supplier_settlement_account(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_payment_workspace(
  p_supplier_id uuid DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_currency text:=nullif(upper(btrim(coalesce(p_currency,''))),'');
  v_accounts jsonb;
  v_suppliers jsonb;
  v_receipts jsonb;
  v_payments jsonb;
  v_receipt_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for supplier payment workspace';
  END IF;
  IF (p_supplier_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.suppliers s WHERE s.id=p_supplier_id AND s.organization_id=v_org
      ))
     OR (v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment filter or pagination is invalid';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'accounting_account_id',a.id,'account_code',a.code,'account_name',a.name,
    'settlement_kind',m.settlement_kind,'currency',m.currency,'display_name',m.display_name
  ) ORDER BY m.display_name,m.currency),'[]'::jsonb)
  INTO v_accounts
  FROM public.purchase_supplier_payment_settlement_accounts m
  JOIN public.accounting_accounts a
    ON a.id=m.accounting_account_id AND a.organization_id=m.organization_id
   AND a.is_active AND a.account_type='asset'
  WHERE m.organization_id=v_org AND m.is_active;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name),'[]'::jsonb)
  INTO v_suppliers FROM public.suppliers s WHERE s.organization_id=v_org;

  SELECT count(*)::integer INTO v_receipt_count
  FROM public.supplier_payment_open_receipts(v_org,p_supplier_id,v_currency);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'receipt_id',q.receipt_id,'receipt_number',q.receipt_number,'purchase_order_number',q.purchase_order_number,
    'supplier_id',q.supplier_id,'supplier_name',q.supplier_name,'currency',q.currency,
    'receipt_date',q.receipt_date,'source_journal_entry_id',q.source_journal_entry_id,
    'source_journal_entry_number',q.source_journal_entry_number,'payable_account_id',q.payable_account_id,
    'payable_account_code',q.payable_account_code,'payable_account_name',q.payable_account_name,
    'source_amount',q.source_amount::text,'credit_note_total',q.credit_note_total::text,
    'reserved_payment_total',q.reserved_payment_total::text,'posted_payment_total',q.posted_payment_total::text,
    'outstanding_payable',q.outstanding_payable::text,'available_to_allocate',q.available_to_allocate::text
  ) ORDER BY q.receipt_date DESC,q.receipt_number DESC,q.receipt_id DESC),'[]'::jsonb)
  INTO v_receipts
  FROM (
    SELECT * FROM public.supplier_payment_open_receipts(v_org,p_supplier_id,v_currency)
    ORDER BY receipt_date DESC,receipt_number DESC,receipt_id DESC
    LIMIT p_limit OFFSET p_offset
  ) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'payment_id',p.id,'payment_number',p.payment_number::text,'supplier_id',p.supplier_id,
    'payment_date',p.payment_date,'amount',p.amount::text,'currency',p.currency,
    'payment_method',p.payment_method,'payment_reference',p.payment_reference,'status',p.status,
    'settlement_account_name',m.display_name,'payable_account_code',pa.code,
    'journal_entry_id',d.journal_entry_id,'journal_entry_number',j.entry_number::text,'journal_status',j.status,
    'reconciliation_status',latest.action,'reconciliation_reference',latest.evidence_reference
  ) ORDER BY p.payment_date DESC,p.payment_number DESC),'[]'::jsonb)
  INTO v_payments
  FROM (
    SELECT p.* FROM public.purchase_supplier_payments p
    WHERE p.organization_id=v_org AND (p_supplier_id IS NULL OR p.supplier_id=p_supplier_id)
      AND (v_currency IS NULL OR p.currency=v_currency)
    ORDER BY p.payment_date DESC,p.payment_number DESC LIMIT 100
  ) p
  JOIN public.purchase_supplier_payment_settlement_accounts m
    ON m.id=p.settlement_account_mapping_id AND m.organization_id=p.organization_id
  JOIN public.accounting_accounts pa
    ON pa.id=p.payable_account_id AND pa.organization_id=p.organization_id
  LEFT JOIN public.purchase_supplier_payment_accounting_drafts d
    ON d.payment_id=p.id AND d.organization_id=p.organization_id
  LEFT JOIN public.accounting_journal_entries j
    ON j.id=d.journal_entry_id AND j.organization_id=d.organization_id
  LEFT JOIN LATERAL (
    SELECT e.action,e.evidence_reference
    FROM public.purchase_supplier_payment_reconciliation_events e
    WHERE e.organization_id=p.organization_id AND e.payment_id=p.id
    ORDER BY e.created_at DESC,e.id DESC LIMIT 1
  ) latest ON true;

  RETURN pg_catalog.jsonb_build_object(
    'settlement_accounts',v_accounts,'suppliers',v_suppliers,'open_receipts',v_receipts,
    'receipt_count',v_receipt_count,'limit',p_limit,'offset',p_offset,
    'has_more',v_receipt_count>p_offset+p_limit,'payments',v_payments,
    'as_of_date',current_date
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_payment_workspace(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_payment_workspace(uuid,text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_purchase_supplier_payment(
  p_supplier_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_settlement_account_mapping_id uuid,
  p_payment_reference text,
  p_allocations jsonb,
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
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
  v_method text:=lower(btrim(coalesce(p_payment_method,'')));
  v_reference text:=btrim(coalesce(p_payment_reference,''));
  v_mapping public.purchase_supplier_payment_settlement_accounts%ROWTYPE;
  v_account public.accounting_accounts%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_payment public.purchase_supplier_payments%ROWTYPE;
  v_existing public.purchase_supplier_payments%ROWTYPE;
  v_item jsonb;
  v_receipt_id uuid;
  v_allocated_amount numeric(18,2);
  v_allocation_total numeric(18,2);
  v_allocation_count integer;
  v_unique_receipts integer;
  v_normalized_allocations jsonb;
  v_fingerprint text;
  v_payable_account_id uuid;
  v_open record;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to record supplier payment';
  END IF;
  IF p_supplier_id IS NULL OR p_payment_date IS NULL OR p_payment_date>current_date
     OR p_idempotency_key IS NULL OR p_settlement_account_mapping_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier, past-or-current payment date, settlement account and idempotency key are required';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
     OR p_amount<=0 OR p_amount>=10000000000000000 OR p_amount<>round(p_amount,2)
     OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment amount or currency is invalid';
  END IF;
  IF v_method NOT IN ('cash','bank_transfer','cheque')
     OR char_length(v_reference) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment instrument and evidence reference are required';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array'
     OR jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment requires between 1 and 100 receipt allocations';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) AS item(value) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR coalesce(v_item->>'receipt_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR coalesce(v_item->>'amount','') !~ '^(0|[1-9][0-9]{0,15})(\\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment allocation has an invalid receipt or exact amount';
    END IF;
    v_allocated_amount:=(v_item->>'amount')::numeric;
    IF v_allocated_amount<=0 OR v_allocated_amount>=10000000000000000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment allocation amount must be positive and finite';
    END IF;
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object('receipt_id',x.receipt_id::text,'amount',x.amount::text) ORDER BY x.receipt_id),
    count(*)::integer,count(DISTINCT x.receipt_id)::integer,coalesce(sum(x.amount),0)::numeric(18,2)
  INTO v_normalized_allocations,v_allocation_count,v_unique_receipts,v_allocation_total
  FROM (
    SELECT (item.value->>'receipt_id')::uuid AS receipt_id,(item.value->>'amount')::numeric(18,2) AS amount
    FROM jsonb_array_elements(p_allocations) AS item(value)
  ) x;
  IF v_allocation_count NOT BETWEEN 1 AND 100 OR v_unique_receipts<>v_allocation_count
     OR v_allocation_total<>p_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment allocations must be unique and sum exactly to the payment amount';
  END IF;
  v_fingerprint:=md5(jsonb_build_object(
    'supplier_id',p_supplier_id,'payment_date',p_payment_date,'amount',p_amount::text,
    'currency',v_currency,'payment_method',v_method,'settlement_account_mapping_id',p_settlement_account_mapping_id,
    'payment_reference',v_reference,'allocations',v_normalized_allocations
  )::text);

  SELECT p.* INTO v_existing FROM public.purchase_supplier_payments p
  WHERE p.organization_id=v_org AND p.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment idempotency key payload conflict';
    END IF;
    RETURN jsonb_build_object('payment_id',v_existing.id,'payment_number',v_existing.payment_number::text,
      'status',v_existing.status,'amount',v_existing.amount::text,'currency',v_existing.currency,'replayed',true);
  END IF;

  SELECT s.* INTO v_supplier FROM public.suppliers s
  WHERE s.id=p_supplier_id AND s.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier is not available in this organization';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||':supplier-payment:'||p_supplier_id::text,0));

  SELECT m.* INTO v_mapping
  FROM public.purchase_supplier_payment_settlement_accounts m
  JOIN public.accounting_accounts a
    ON a.id=m.accounting_account_id AND a.organization_id=m.organization_id
   AND a.is_active AND a.account_type='asset'
  WHERE m.id=p_settlement_account_mapping_id AND m.organization_id=v_org AND m.is_active
    AND m.currency=v_currency
    AND ((v_method='cash' AND m.settlement_kind='cash') OR (v_method IN ('bank_transfer','cheque') AND m.settlement_kind='bank'))
  FOR UPDATE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='selected cash or bank account is inactive, mismatched or not registered for this currency';
  END IF;
  SELECT a.* INTO v_account FROM public.accounting_accounts a
  WHERE a.id=v_mapping.accounting_account_id AND a.organization_id=v_org
    AND a.is_active AND a.account_type='asset' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='settlement account is no longer an active asset account';
  END IF;

  PERFORM r.id
  FROM public.purchase_receipts r
  JOIN (
    SELECT DISTINCT (item.value->>'receipt_id')::uuid AS receipt_id
    FROM jsonb_array_elements(p_allocations) AS item(value)
  ) requested ON requested.receipt_id=r.id
  WHERE r.organization_id=v_org
  ORDER BY r.id
  FOR UPDATE OF r;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(v_normalized_allocations) AS item(value)
  LOOP
    v_receipt_id:=(v_item->>'receipt_id')::uuid;
    v_allocated_amount:=(v_item->>'amount')::numeric(18,2);
    SELECT o.* INTO v_open
    FROM public.supplier_payment_open_receipts(v_org,p_supplier_id,v_currency) o
    WHERE o.receipt_id=v_receipt_id;
    IF NOT FOUND OR v_open.available_to_allocate<0
       OR v_allocated_amount>v_open.available_to_allocate THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='one or more receipt balances are unavailable or insufficient for this supplier payment';
    END IF;
    IF v_payable_account_id IS NULL THEN
      v_payable_account_id:=v_open.payable_account_id;
    ELSIF v_payable_account_id IS DISTINCT FROM v_open.payable_account_id THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='split allocations by payable account; one supplier payment must use one payable ledger account';
    END IF;
  END LOOP;

  INSERT INTO public.purchase_supplier_payments(
    organization_id,supplier_id,payment_date,amount,currency,payment_method,payment_reference,
    settlement_account_mapping_id,settlement_account_id,payable_account_id,status,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,p_supplier_id,p_payment_date,p_amount,v_currency,v_method,v_reference,
    v_mapping.id,v_account.id,v_payable_account_id,'recorded',
    p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_payment;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(v_normalized_allocations) AS item(value)
  LOOP
    v_receipt_id:=(v_item->>'receipt_id')::uuid;
    v_allocated_amount:=(v_item->>'amount')::numeric(18,2);
    SELECT o.* INTO v_open
    FROM public.supplier_payment_open_receipts(v_org,p_supplier_id,v_currency) o
    WHERE o.receipt_id=v_receipt_id;
    INSERT INTO public.purchase_supplier_payment_allocations(
      organization_id,payment_id,receipt_id,source_journal_entry_id,payable_account_id,allocated_amount,currency
    ) VALUES (
      v_org,v_payment.id,v_receipt_id,v_open.source_journal_entry_id,v_open.payable_account_id,v_allocated_amount,v_currency
    );
  END LOOP;

  INSERT INTO public.purchase_supplier_payment_events(organization_id,payment_id,actor_profile_id,action,details)
  VALUES (v_org,v_payment.id,v_actor,'recorded',jsonb_build_object(
    'payment_number',v_payment.payment_number::text,'amount',v_payment.amount::text,'currency',v_currency,
    'allocation_count',v_allocation_count,'settlement_account_id',v_account.id));
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'supplier_payment.recorded','supplier_payment',v_payment.id,'{}'::jsonb,
    jsonb_build_object('payment_number',v_payment.payment_number::text,'supplier_id',p_supplier_id,
      'amount',v_payment.amount::text,'currency',v_currency,'method',v_method,
      'payment_reference',v_reference,'allocation_count',v_allocation_count));
  RETURN jsonb_build_object('payment_id',v_payment.id,'payment_number',v_payment.payment_number::text,
    'status',v_payment.status,'amount',v_payment.amount::text,'currency',v_payment.currency,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_purchase_supplier_payment(uuid,date,numeric,text,text,uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_purchase_supplier_payment(uuid,date,numeric,text,text,uuid,text,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_purchase_supplier_payment_journal_draft(
  p_payment_id uuid,
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
  v_payment public.purchase_supplier_payments%ROWTYPE;
  v_existing public.purchase_supplier_payment_accounting_drafts%ROWTYPE;
  v_journal public.accounting_journal_entries%ROWTYPE;
  v_reconciliation public.purchase_supplier_payment_reconciliation_events%ROWTYPE;
  v_open record;
  v_item record;
  v_allocated_total numeric(18,2):=0;
  v_fingerprint text;
  v_line_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to prepare supplier payment journal';
  END IF;
  IF p_payment_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment and journal idempotency key are required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||':supplier-payment-draft:'||p_payment_id::text,0));
  SELECT p.* INTO v_payment FROM public.purchase_supplier_payments p
  WHERE p.id=p_payment_id AND p.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier payment is not available in this organization';
  END IF;
  SELECT d.* INTO v_existing FROM public.purchase_supplier_payment_accounting_drafts d
  WHERE d.organization_id=v_org AND d.payment_id=v_payment.id;
  IF FOUND THEN
    SELECT j.* INTO v_journal FROM public.accounting_journal_entries j
    WHERE j.organization_id=v_org AND j.id=v_existing.journal_entry_id;
    RETURN jsonb_build_object('payment_id',v_payment.id,'journal_entry_id',v_journal.id,
      'journal_entry_number',v_journal.entry_number::text,'status',v_journal.status,'replayed',true);
  END IF;
  IF v_payment.status<>'recorded' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment must be recorded and not previously handed to the General Ledger';
  END IF;

  PERFORM r.id
  FROM public.purchase_receipts r
  JOIN public.purchase_supplier_payment_allocations a
    ON a.receipt_id=r.id AND a.organization_id=v_org AND a.payment_id=v_payment.id
  WHERE r.organization_id=v_org
  ORDER BY r.id
  FOR UPDATE OF r;

  FOR v_item IN
    SELECT a.receipt_id,a.source_journal_entry_id,a.payable_account_id,a.allocated_amount,a.currency
    FROM public.purchase_supplier_payment_allocations a
    WHERE a.organization_id=v_org AND a.payment_id=v_payment.id
    ORDER BY a.receipt_id
  LOOP
    SELECT o.* INTO v_open
    FROM public.supplier_payment_open_receipts(v_org,v_payment.supplier_id,v_payment.currency) o
    WHERE o.receipt_id=v_item.receipt_id;
    IF NOT FOUND OR v_open.available_to_allocate<0
       OR v_open.source_journal_entry_id IS DISTINCT FROM v_item.source_journal_entry_id
       OR v_open.payable_account_id IS DISTINCT FROM v_item.payable_account_id
       OR v_open.currency IS DISTINCT FROM v_item.currency THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment allocations no longer match verified posted receipt balances';
    END IF;
    v_allocated_total:=v_allocated_total+v_item.allocated_amount;
  END LOOP;
  IF v_allocated_total<>v_payment.amount OR v_allocated_total<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment allocations do not equal the saved payment amount';
  END IF;

  -- A different finance actor must verify the exact instrument evidence before any liability-reducing journal is created.
  SELECT e.* INTO v_reconciliation
  FROM public.purchase_supplier_payment_reconciliation_events e
  WHERE e.organization_id=v_org AND e.payment_id=v_payment.id
  ORDER BY e.created_at DESC,e.id DESC
  LIMIT 1;
  IF NOT FOUND OR v_reconciliation.action<>'matched'
     OR v_reconciliation.actor_profile_id=v_payment.created_by_profile_id
     OR v_reconciliation.observed_amount IS DISTINCT FROM v_payment.amount
     OR v_reconciliation.currency IS DISTINCT FROM v_payment.currency
     OR v_reconciliation.evidence_type IS DISTINCT FROM CASE
       WHEN v_payment.payment_method='cash' THEN 'cash_voucher'
       WHEN v_payment.payment_method='bank_transfer' THEN 'bank_statement_line'
       WHEN v_payment.payment_method='cheque' THEN 'cheque_clearance'
       ELSE NULL END THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='a matching, independently reviewed settlement evidence event is required before journal handoff';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounting_accounts a
    WHERE a.id=v_payment.payable_account_id AND a.organization_id=v_org
      AND a.is_active AND a.account_type='liability'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.accounting_accounts a
    JOIN public.purchase_supplier_payment_settlement_accounts m
      ON m.accounting_account_id=a.id AND m.organization_id=a.organization_id
    WHERE m.id=v_payment.settlement_account_mapping_id AND m.organization_id=v_org
      AND m.is_active AND m.currency=v_payment.currency
      AND a.id=v_payment.settlement_account_id AND a.is_active AND a.account_type='asset'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payable or settlement account is inactive or invalid';
  END IF;

  SELECT count(DISTINCT a.receipt_id)::integer INTO v_line_count
  FROM public.purchase_supplier_payment_allocations a
  WHERE a.organization_id=v_org AND a.payment_id=v_payment.id;
  v_fingerprint:=md5(jsonb_build_object(
    'payment_id',v_payment.id,'amount',v_payment.amount::text,'currency',v_payment.currency,
    'payable_account_id',v_payment.payable_account_id,'settlement_account_id',v_payment.settlement_account_id,
    'allocations',(SELECT jsonb_agg(jsonb_build_object('receipt_id',a.receipt_id,'source_journal_entry_id',a.source_journal_entry_id,
       'allocated_amount',a.allocated_amount::text) ORDER BY a.receipt_id)
      FROM public.purchase_supplier_payment_allocations a
      WHERE a.organization_id=v_org AND a.payment_id=v_payment.id)
  )::text);
  IF EXISTS (SELECT 1 FROM public.accounting_journal_entries j
    WHERE j.organization_id=v_org AND j.idempotency_key=p_idempotency_key) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used';
  END IF;

  INSERT INTO public.accounting_journal_entries(
    organization_id,entry_date,description,source_type,source_reference,status,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,v_payment.payment_date,
    left('سداد مورد رقم '||v_payment.payment_number::text,240),
    'purchase_supplier_payment',v_payment.payment_number::text,'draft',
    p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_journal;

  INSERT INTO public.accounting_journal_lines(
    organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
  ) VALUES (
    v_org,v_journal.id,1,v_payment.payable_account_id,v_payment.amount,0,
    'تخفيض ذمم المورد وفق سند السداد رقم '||v_payment.payment_number::text
  );
  INSERT INTO public.accounting_journal_lines(
    organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
  ) VALUES (
    v_org,v_journal.id,2,v_payment.settlement_account_id,0,v_payment.amount,
    'صرف من حساب التسوية وفق سند السداد رقم '||v_payment.payment_number::text
  );

  INSERT INTO public.purchase_supplier_payment_accounting_drafts(
    organization_id,payment_id,journal_entry_id,payable_account_id,settlement_account_id,
    source_amount,currency,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,v_payment.id,v_journal.id,v_payment.payable_account_id,v_payment.settlement_account_id,
    v_payment.amount,v_payment.currency,p_idempotency_key,v_fingerprint,v_actor
  );
  UPDATE public.purchase_supplier_payments SET status='journal_draft_created',updated_at=now()
  WHERE id=v_payment.id AND organization_id=v_org;
  INSERT INTO public.purchase_supplier_payment_events(organization_id,payment_id,actor_profile_id,action,details)
  VALUES (v_org,v_payment.id,v_actor,'journal_draft_created',jsonb_build_object(
    'journal_entry_id',v_journal.id,'journal_entry_number',v_journal.entry_number::text,
    'amount',v_payment.amount::text,'currency',v_payment.currency));
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'supplier_payment.journal_draft_created','supplier_payment',v_payment.id,
    jsonb_build_object('status','recorded'),
    jsonb_build_object('status','journal_draft_created','journal_entry_id',v_journal.id,
      'journal_entry_number',v_journal.entry_number::text));
  RETURN jsonb_build_object('payment_id',v_payment.id,'journal_entry_id',v_journal.id,
    'journal_entry_number',v_journal.entry_number::text,'status',v_journal.status,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.prepare_purchase_supplier_payment_journal_draft(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_purchase_supplier_payment_journal_draft(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_purchase_supplier_payment(
  p_payment_id uuid,
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
  v_reason text:=btrim(coalesce(p_reason,''));
  v_payment public.purchase_supplier_payments%ROWTYPE;
  v_journal_status text;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='administrator or manager permission required to void supplier payment';
  END IF;
  IF p_payment_id IS NULL OR char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment identifier and void reason are required';
  END IF;
  SELECT p.* INTO v_payment FROM public.purchase_supplier_payments p
  WHERE p.id=p_payment_id AND p.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier payment is not available in this organization';
  END IF;
  IF v_payment.status='void' THEN
    IF v_payment.void_reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='voided supplier payment reason is immutable';
    END IF;
    RETURN jsonb_build_object('payment_id',v_payment.id,'status','void','replayed',true);
  END IF;
  IF v_payment.status='journal_draft_created' THEN
    SELECT j.status INTO v_journal_status
    FROM public.purchase_supplier_payment_accounting_drafts d
    JOIN public.accounting_journal_entries j
      ON j.id=d.journal_entry_id AND j.organization_id=d.organization_id
    WHERE d.organization_id=v_org AND d.payment_id=v_payment.id;
    IF v_journal_status IS DISTINCT FROM 'void' THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='void the related General Ledger draft before voiding this supplier payment source';
    END IF;
  END IF;

  UPDATE public.purchase_supplier_payments SET status='void',voided_by_profile_id=v_actor,
    voided_at=now(),void_reason=v_reason,updated_at=now()
  WHERE id=v_payment.id AND organization_id=v_org;
  INSERT INTO public.purchase_supplier_payment_events(organization_id,payment_id,actor_profile_id,action,reason,details)
  VALUES (v_org,v_payment.id,v_actor,'voided',v_reason,jsonb_build_object('previous_status',v_payment.status));
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'supplier_payment.voided','supplier_payment',v_payment.id,
    jsonb_build_object('status',v_payment.status),
    jsonb_build_object('status','void','reason',v_reason,'voided_at',now()));
  RETURN jsonb_build_object('payment_id',v_payment.id,'status','void','replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.void_purchase_supplier_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.void_purchase_supplier_payment(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_purchase_supplier_payment(
  p_payment_id uuid,
  p_action text,
  p_evidence_type text,
  p_evidence_reference text,
  p_observed_amount numeric,
  p_currency text,
  p_reason text,
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
  v_payment public.purchase_supplier_payments%ROWTYPE;
  v_existing public.purchase_supplier_payment_reconciliation_events%ROWTYPE;
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_evidence_type text:=lower(btrim(coalesce(p_evidence_type,'')));
  v_reference text:=btrim(coalesce(p_evidence_reference,''));
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_fingerprint text;
  v_required_evidence text;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to reconcile supplier payment';
  END IF;
  IF p_payment_id IS NULL OR p_idempotency_key IS NULL
     OR v_action NOT IN ('matched','exception')
     OR char_length(v_reference) NOT BETWEEN 3 AND 200
     OR v_currency !~ '^[A-Z]{3}$'
     OR p_observed_amount IS NULL OR p_observed_amount::text IN ('NaN','Infinity','-Infinity')
     OR p_observed_amount<0 OR p_observed_amount>=10000000000000000
     OR p_observed_amount<>round(p_observed_amount,2)
     OR (v_action='exception' AND char_length(coalesce(v_reason,'')) NOT BETWEEN 3 AND 500)
     OR (v_action='matched' AND v_reason IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment reconciliation evidence is invalid';
  END IF;
  SELECT p.* INTO v_payment FROM public.purchase_supplier_payments p
  WHERE p.id=p_payment_id AND p.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier payment is not available in this organization';
  END IF;
  IF v_payment.created_by_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier payment reconciliation requires a different finance actor';
  END IF;
  v_required_evidence:=CASE
    WHEN v_payment.payment_method='cash' THEN 'cash_voucher'
    WHEN v_payment.payment_method='bank_transfer' THEN 'bank_statement_line'
    WHEN v_payment.payment_method='cheque' THEN 'cheque_clearance'
    ELSE NULL END;
  IF v_evidence_type IS DISTINCT FROM v_required_evidence THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reconciliation evidence type does not match the saved payment instrument';
  END IF;
  IF v_currency IS DISTINCT FROM v_payment.currency
     OR (v_action='matched' AND p_observed_amount IS DISTINCT FROM v_payment.amount) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='matched supplier payment amount and currency must equal the saved source payment';
  END IF;
  v_fingerprint:=md5(jsonb_build_object(
    'payment_id',v_payment.id,'action',v_action,'evidence_type',v_evidence_type,
    'evidence_reference',v_reference,'observed_amount',p_observed_amount::text,
    'currency',v_currency,'reason',v_reason
  )::text);
  SELECT e.* INTO v_existing FROM public.purchase_supplier_payment_reconciliation_events e
  WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payment reconciliation idempotency payload conflict';
    END IF;
    RETURN jsonb_build_object('payment_id',v_payment.id,'action',v_existing.action,
      'evidence_reference',v_existing.evidence_reference,'replayed',true);
  END IF;
  IF v_payment.status<>'recorded' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='new reconciliation evidence must be recorded before the General Ledger handoff';
  END IF;

  INSERT INTO public.purchase_supplier_payment_reconciliation_events(
    organization_id,payment_id,actor_profile_id,action,evidence_type,evidence_reference,
    observed_amount,currency,reason,idempotency_key,payload_fingerprint
  ) VALUES (
    v_org,v_payment.id,v_actor,v_action,v_evidence_type,v_reference,
    p_observed_amount,v_currency,v_reason,p_idempotency_key,v_fingerprint
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'supplier_payment.reconciliation_'||v_action,'supplier_payment',v_payment.id,'{}'::jsonb,
    jsonb_build_object('evidence_type',v_evidence_type,'evidence_reference',v_reference,
      'observed_amount',p_observed_amount::text,'currency',v_currency,'reason',v_reason));
  RETURN jsonb_build_object('payment_id',v_payment.id,'action',v_action,
    'evidence_reference',v_reference,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.reconcile_purchase_supplier_payment(uuid,text,text,text,numeric,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconcile_purchase_supplier_payment(uuid,text,text,text,numeric,text,text,uuid) TO authenticated;

-- Extend the existing supplier activity read model with posted payments and source-backed balances.
CREATE OR REPLACE FUNCTION public.fetch_supplier_account_activity(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for supplier account activity';
  END IF;
  IF (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to)
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier account activity date range or pagination is invalid';
  END IF;

  WITH activity AS MATERIALIZED (
    SELECT
      e.id AS journal_entry_id,e.entry_number::text AS journal_entry_number,e.entry_date,e.description,
      'purchase_receipt'::text AS source_type,'إيصال استلام '||r.receipt_number AS document_reference,
      r.receipt_number AS receipt_number,po.purchase_order_number,s.id AS supplier_id,s.name AS supplier_name,
      posting.source_currency AS currency,account.id AS payable_account_id,
      account.code AS payable_account_code,account.name AS payable_account_name,
      source_lines.payable_debit AS debit,source_lines.payable_credit AS credit
    FROM public.purchase_receipt_accounting_postings posting
    JOIN public.purchase_receipts r ON r.id=posting.receipt_id AND r.organization_id=posting.organization_id
    JOIN public.purchase_orders po ON po.id=r.purchase_order_id AND po.organization_id=r.organization_id
    JOIN public.suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
    JOIN public.accounting_journal_entries e ON e.id=posting.journal_entry_id AND e.organization_id=posting.organization_id
    JOIN LATERAL (
      SELECT count(*)::integer AS line_count,
        coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
        coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
        coalesce(sum(l.debit) FILTER (WHERE l.account_id=posting.payable_account_id),0)::numeric(18,2) AS payable_debit,
        coalesce(sum(l.credit) FILTER (WHERE l.account_id=posting.payable_account_id),0)::numeric(18,2) AS payable_credit
      FROM public.accounting_journal_lines l
      WHERE l.organization_id=e.organization_id AND l.journal_entry_id=e.id
    ) source_lines ON source_lines.line_count=2 AND source_lines.debit_total=posting.source_amount
      AND source_lines.credit_total=posting.source_amount AND source_lines.payable_debit=0
      AND source_lines.payable_credit=posting.source_amount
    JOIN public.accounting_accounts account
      ON account.id=posting.payable_account_id AND account.organization_id=posting.organization_id
     AND account.is_active AND account.account_type='liability'
    WHERE posting.organization_id=v_org AND e.status='posted' AND e.source_type='purchase_receipt'
      AND e.source_reference=r.receipt_number
      AND (p_from IS NULL OR e.entry_date>=p_from) AND (p_to IS NULL OR e.entry_date<=p_to)
      AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_reversals reversal
        WHERE reversal.organization_id=v_org
          AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id))

    UNION ALL

    SELECT
      e.id,e.entry_number::text,e.entry_date,e.description,
      'purchase_supplier_credit_note'::text,
      'إشعار دائن '||note.supplier_credit_note_number||' مقابل مرتجع '||sr.return_number,
      receipt.receipt_number,po.purchase_order_number,supplier.id,supplier.name,draft.currency,
      account.id,account.code,account.name,note_lines.payable_debit,note_lines.payable_credit
    FROM public.purchase_supplier_credit_note_accounting_drafts draft
    JOIN public.purchase_supplier_credit_notes note
      ON note.id=draft.credit_note_id AND note.organization_id=draft.organization_id
    JOIN public.purchase_supplier_returns sr
      ON sr.id=draft.supplier_return_id AND sr.organization_id=draft.organization_id AND sr.status='posted'
    JOIN public.purchase_receipts receipt
      ON receipt.id=draft.source_receipt_id AND receipt.organization_id=draft.organization_id
    JOIN public.purchase_orders po ON po.id=sr.purchase_order_id AND po.organization_id=sr.organization_id
    JOIN public.suppliers supplier ON supplier.id=sr.supplier_id AND supplier.organization_id=sr.organization_id
      AND supplier.id=note.supplier_id
    JOIN public.accounting_journal_entries source_journal
      ON source_journal.id=draft.source_journal_entry_id AND source_journal.organization_id=draft.organization_id
     AND source_journal.status='posted' AND source_journal.source_type='purchase_receipt'
     AND source_journal.source_reference=receipt.receipt_number
    JOIN public.accounting_journal_entries e
      ON e.id=draft.journal_entry_id AND e.organization_id=draft.organization_id
     AND e.status='posted' AND e.source_type='purchase_supplier_credit_note'
     AND e.source_reference=note.supplier_credit_note_number
    JOIN LATERAL (
      SELECT count(*)::integer AS line_count,
        coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
        coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
        coalesce(sum(l.debit) FILTER (WHERE l.account_id=draft.payable_account_id),0)::numeric(18,2) AS payable_debit,
        coalesce(sum(l.credit) FILTER (WHERE l.account_id=draft.payable_account_id),0)::numeric(18,2) AS payable_credit
      FROM public.accounting_journal_lines l
      WHERE l.organization_id=e.organization_id AND l.journal_entry_id=e.id
    ) note_lines ON note_lines.line_count BETWEEN 2 AND 3 AND note_lines.debit_total=draft.actual_amount
      AND note_lines.credit_total=draft.actual_amount AND note_lines.payable_debit=draft.actual_amount
      AND note_lines.payable_credit=0
    JOIN public.accounting_accounts account
      ON account.id=draft.payable_account_id AND account.organization_id=draft.organization_id
     AND account.is_active AND account.account_type='liability'
    WHERE draft.organization_id=v_org AND note.status='journal_draft_created'
      AND draft.currency=note.currency AND draft.actual_amount=note.actual_amount
      AND (p_from IS NULL OR e.entry_date>=p_from) AND (p_to IS NULL OR e.entry_date<=p_to)
      AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_reversals reversal
        WHERE reversal.organization_id=v_org
          AND (reversal.original_journal_entry_id=source_journal.id OR reversal.reversal_journal_entry_id=source_journal.id))
      AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_reversals reversal
        WHERE reversal.organization_id=v_org
          AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id))

    UNION ALL

    SELECT
      e.id,e.entry_number::text,e.entry_date,e.description,
      'purchase_supplier_payment'::text,
      'سند دفع مورد '||payment.payment_number::text||' · '||payment.payment_reference,
      '—'::text,'—'::text,s.id,s.name,payment.currency,account.id,account.code,account.name,
      payment.amount::numeric(18,2),0::numeric(18,2)
    FROM public.purchase_supplier_payment_accounting_drafts draft
    JOIN public.purchase_supplier_payments payment
      ON payment.id=draft.payment_id AND payment.organization_id=draft.organization_id
    JOIN public.suppliers s ON s.id=payment.supplier_id AND s.organization_id=payment.organization_id
    JOIN public.accounting_journal_entries e
      ON e.id=draft.journal_entry_id AND e.organization_id=draft.organization_id
     AND e.status='posted' AND e.source_type='purchase_supplier_payment'
     AND e.source_reference=payment.payment_number::text
    JOIN public.accounting_accounts account
      ON account.id=payment.payable_account_id AND account.organization_id=payment.organization_id
     AND account.is_active AND account.account_type='liability'
    JOIN LATERAL (
      SELECT count(*)::integer AS line_count,
        coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
        coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
        coalesce(sum(l.debit) FILTER (WHERE l.account_id=payment.payable_account_id),0)::numeric(18,2) AS payable_debit,
        coalesce(sum(l.credit) FILTER (WHERE l.account_id=payment.settlement_account_id),0)::numeric(18,2) AS settlement_credit
      FROM public.accounting_journal_lines l
      WHERE l.organization_id=e.organization_id AND l.journal_entry_id=e.id
    ) payment_lines ON payment_lines.line_count=2 AND payment_lines.debit_total=payment.amount
      AND payment_lines.credit_total=payment.amount AND payment_lines.payable_debit=payment.amount
      AND payment_lines.settlement_credit=payment.amount
    WHERE draft.organization_id=v_org AND payment.status='journal_draft_created'
      AND draft.payable_account_id=payment.payable_account_id
      AND draft.settlement_account_id=payment.settlement_account_id
      AND draft.source_amount=payment.amount AND draft.currency=payment.currency
      AND (p_from IS NULL OR e.entry_date>=p_from) AND (p_to IS NULL OR e.entry_date<=p_to)
      AND NOT EXISTS (SELECT 1 FROM public.accounting_journal_reversals reversal
        WHERE reversal.organization_id=v_org
          AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id))
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_supplier_payment_allocations allocation
        WHERE allocation.organization_id=v_org AND allocation.payment_id=payment.id
          AND NOT EXISTS (
            SELECT 1 FROM public.supplier_payment_open_receipts(v_org,payment.supplier_id,payment.currency) open_receipt
            WHERE open_receipt.receipt_id=allocation.receipt_id
              AND open_receipt.source_journal_entry_id=allocation.source_journal_entry_id
              AND open_receipt.payable_account_id=allocation.payable_account_id
          )
      )
  ),
  supplier_totals AS (
    SELECT supplier_id,supplier_name,currency,count(*)::integer AS activity_count,
      sum(debit)::numeric(18,2) AS debit_total,sum(credit)::numeric(18,2) AS credit_total,
      (sum(credit)-sum(debit))::numeric(18,2) AS net_credit_movement,
      max(entry_date) AS last_activity_date
    FROM activity GROUP BY supplier_id,supplier_name,currency
  ),
  source_counts AS (
    SELECT supplier.id AS supplier_id,posting.source_currency AS currency,count(*)::integer AS source_count
    FROM public.purchase_receipt_accounting_postings posting
    JOIN public.purchase_receipts receipt
      ON receipt.id=posting.receipt_id AND receipt.organization_id=posting.organization_id
    JOIN public.purchase_orders po ON po.id=receipt.purchase_order_id AND po.organization_id=receipt.organization_id
    JOIN public.suppliers supplier ON supplier.id=po.supplier_id AND supplier.organization_id=po.organization_id
    WHERE posting.organization_id=v_org
    GROUP BY supplier.id,posting.source_currency
  ),
  verified_balances AS (
    SELECT supplier_id,supplier_name,currency,count(*)::integer AS verified_count,
      sum(outstanding_payable)::numeric(18,2) AS remaining_payable,
      sum(reserved_payment_total-posted_payment_total)::numeric(18,2) AS pending_payment_amount,
      sum(available_to_allocate)::numeric(18,2) AS available_to_allocate
    FROM public.supplier_payment_open_receipts(v_org,NULL,NULL)
    GROUP BY supplier_id,supplier_name,currency
  ),
  supplier_balances AS (
    SELECT counts.supplier_id,counts.currency,counts.source_count,
      coalesce(balance.verified_count,0)::integer AS verified_count,
      counts.source_count=coalesce(balance.verified_count,0) AS balance_complete,
      CASE WHEN counts.source_count=coalesce(balance.verified_count,0) AND counts.source_count>0
        THEN balance.remaining_payable ELSE NULL END AS remaining_payable,
      CASE WHEN counts.source_count=coalesce(balance.verified_count,0) AND counts.source_count>0
        THEN balance.pending_payment_amount ELSE NULL END AS pending_payment_amount,
      CASE WHEN counts.source_count=coalesce(balance.verified_count,0) AND counts.source_count>0
        THEN balance.available_to_allocate ELSE NULL END AS available_to_allocate
    FROM source_counts counts
    LEFT JOIN verified_balances balance
      ON balance.supplier_id=counts.supplier_id AND balance.currency=counts.currency
  ),
  currency_balances AS (
    SELECT currency,sum(source_count)::integer AS source_count,sum(verified_count)::integer AS verified_count,
      CASE WHEN sum(source_count)=sum(verified_count) AND sum(source_count)>0
        THEN sum(remaining_payable)::numeric(18,2) ELSE NULL END AS remaining_payable,
      CASE WHEN sum(source_count)=sum(verified_count) AND sum(source_count)>0
        THEN sum(pending_payment_amount)::numeric(18,2) ELSE NULL END AS pending_payment_amount,
      CASE WHEN sum(source_count)=sum(verified_count) AND sum(source_count)>0
        THEN sum(available_to_allocate)::numeric(18,2) ELSE NULL END AS available_to_allocate
    FROM supplier_balances GROUP BY currency
  ),
  entry_page AS (
    SELECT * FROM activity
    ORDER BY entry_date DESC,journal_entry_number DESC,journal_entry_id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'suppliers',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'supplier_id',t.supplier_id,'supplier_name',t.supplier_name,'currency',t.currency,
        'activity_count',t.activity_count,'debit_total',t.debit_total::text,'credit_total',t.credit_total::text,
        'net_credit_movement',t.net_credit_movement::text,'last_activity_date',t.last_activity_date,
        'remaining_payable',b.remaining_payable::text,'pending_payment_amount',b.pending_payment_amount::text,
        'available_to_allocate',b.available_to_allocate::text,'balance_complete',coalesce(b.balance_complete,false)
      ) ORDER BY t.supplier_name,t.currency)
      FROM supplier_totals t LEFT JOIN supplier_balances b
        ON b.supplier_id=t.supplier_id AND b.currency=t.currency
    ),'[]'::jsonb),
    'currency_totals',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'currency',c.currency,'debit_total',c.debit_total::text,'credit_total',c.credit_total::text,
        'net_credit_movement',c.net_credit_movement::text,'activity_count',c.activity_count,
        'remaining_payable',b.remaining_payable::text,'pending_payment_amount',b.pending_payment_amount::text,
        'available_to_allocate',b.available_to_allocate::text,
        'balance_complete',(b.source_count=b.verified_count AND b.source_count>0)
      ) ORDER BY c.currency)
      FROM (
        SELECT currency,sum(debit)::numeric(18,2) AS debit_total,sum(credit)::numeric(18,2) AS credit_total,
          (sum(credit)-sum(debit))::numeric(18,2) AS net_credit_movement,count(*)::integer AS activity_count
        FROM activity GROUP BY currency
      ) c LEFT JOIN currency_balances b ON b.currency=c.currency
    ),'[]'::jsonb),
    'entries',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'journal_entry_id',p.journal_entry_id,'journal_entry_number',p.journal_entry_number,
        'entry_date',p.entry_date,'description',p.description,'source_type',p.source_type,
        'document_reference',p.document_reference,'receipt_number',p.receipt_number,
        'purchase_order_number',p.purchase_order_number,'supplier_id',p.supplier_id,
        'supplier_name',p.supplier_name,'currency',p.currency,'payable_account_id',p.payable_account_id,
        'payable_account_code',p.payable_account_code,'payable_account_name',p.payable_account_name,
        'debit',p.debit::text,'credit',p.credit::text
      ) ORDER BY p.entry_date DESC,p.journal_entry_number DESC,p.journal_entry_id DESC)
      FROM entry_page p
    ),'[]'::jsonb),
    'entry_count',(SELECT count(*)::integer FROM activity),'limit',p_limit,'offset',p_offset,
    'has_more',(SELECT count(*) FROM activity)>p_offset+p_limit,
    'as_of_date',current_date,'settlement_included',true,
    'balance_scope','posted receipt, supplier credit-note and supplier-payment journals only; supplier invoices outside this source model are not included'
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_supplier_account_activity(date,date,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_supplier_account_activity(date,date,integer,integer) TO authenticated;
COMMENT ON FUNCTION public.fetch_supplier_account_activity(date,date,integer,integer) IS
  'Finance-only tenant-scoped supplier activity from verified POSTED receipt, supplier credit-note and supplier payment journals. Remaining payable is reported only when every receipt accounting posting for that supplier/currency is verified. Includes only receipt-linked source liabilities, not unrecorded supplier invoices or external bank-feed data.';

COMMIT;
