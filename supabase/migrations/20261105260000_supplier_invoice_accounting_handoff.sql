-- AGH-FIN-SUPPLIER-INVOICE-ACCOUNTING-HANDOFF-001
-- Reconcile a source-backed supplier invoice against the already-posted goods-receipt liability.
-- The original receipt payable account is retained so the existing supplier-credit-note workflow
-- continues to reverse the same source liability. Only a balanced DRAFT is created; nothing posts or pays.
BEGIN;

ALTER TABLE public.accounting_journal_entries
  DROP CONSTRAINT IF EXISTS accounting_journal_entries_source_type_check;
ALTER TABLE public.accounting_journal_entries
  ADD CONSTRAINT accounting_journal_entries_source_type_check
  CHECK (source_type IN (
    'manual','adjustment','invoice','payment','cash_expense',
    'purchase_receipt','purchase_supplier_credit_note',
    'purchase_supplier_payment','purchase_supplier_invoice','onyx_import'
  ));

CREATE TABLE public.purchase_supplier_invoice_accounting_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  handoff_sequence integer NOT NULL CHECK (handoff_sequence > 0),
  journal_entry_id uuid,
  source_payable_account_id uuid NOT NULL,
  tax_account_id uuid,
  merchandise_variance_account_id uuid,
  source_merchandise_amount numeric(18,2) NOT NULL CHECK (source_merchandise_amount >= 0),
  invoice_merchandise_subtotal numeric(18,2) NOT NULL CHECK (invoice_merchandise_subtotal > 0),
  invoice_tax_amount numeric(18,2) NOT NULL CHECK (invoice_tax_amount >= 0),
  invoice_total_amount numeric(18,2) NOT NULL CHECK (invoice_total_amount > 0),
  merchandise_variance_amount numeric(18,2) NOT NULL,
  net_adjustment_amount numeric(18,2) NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  handoff_status text NOT NULL CHECK (handoff_status IN ('no_adjustment_required','journal_draft_created')),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,invoice_id,handoff_sequence),
  FOREIGN KEY (organization_id,invoice_id)
    REFERENCES public.purchase_supplier_invoices(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,source_payable_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,tax_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,merchandise_variance_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  CHECK (
    (handoff_status='no_adjustment_required' AND journal_entry_id IS NULL
      AND tax_account_id IS NULL AND merchandise_variance_account_id IS NULL
      AND invoice_tax_amount=0 AND merchandise_variance_amount=0 AND net_adjustment_amount=0)
    OR
    (handoff_status='journal_draft_created' AND journal_entry_id IS NOT NULL)
  ),
  CHECK (net_adjustment_amount = invoice_total_amount - source_merchandise_amount),
  CHECK (merchandise_variance_amount = invoice_merchandise_subtotal - source_merchandise_amount)
);

CREATE INDEX purchase_supplier_invoice_accounting_latest_idx
  ON public.purchase_supplier_invoice_accounting_drafts(organization_id,invoice_id,handoff_sequence DESC);

ALTER TABLE public.purchase_supplier_invoice_accounting_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_supplier_invoice_accounting_finance_read
  ON public.purchase_supplier_invoice_accounting_drafts
  FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
GRANT SELECT ON public.purchase_supplier_invoice_accounting_drafts TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.purchase_supplier_invoice_accounting_drafts FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_purchase_supplier_invoice_accounting_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',
    MESSAGE='supplier invoice accounting handoffs are append-only; create a new sequence after a void draft';
END;
$function$;

DROP TRIGGER IF EXISTS purchase_supplier_invoice_accounting_immutable
  ON public.purchase_supplier_invoice_accounting_drafts;
CREATE TRIGGER purchase_supplier_invoice_accounting_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_invoice_accounting_drafts
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_invoice_accounting_immutable();

CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_invoice_accounting_status(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_invoice public.purchase_supplier_invoices%ROWTYPE;
  v_latest public.purchase_supplier_invoice_accounting_drafts%ROWTYPE;
  v_journal public.accounting_journal_entries%ROWTYPE;
  v_source_amount numeric(18,2);
  v_variance numeric(18,2);
  v_accounting_status text:='not_prepared';
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read supplier invoice accounting status';
  END IF;
  SELECT i.* INTO v_invoice
    FROM public.purchase_supplier_invoices i
   WHERE i.id=p_invoice_id AND i.organization_id=v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier invoice is not available in this organization';
  END IF;

  SELECT COALESCE(sum(round(l.invoiced_quantity*l.received_unit_cost,2)),0)::numeric(18,2)
    INTO v_source_amount
    FROM public.purchase_supplier_invoice_lines l
   WHERE l.organization_id=v_org AND l.invoice_id=v_invoice.id;
  v_variance:=v_invoice.merchandise_subtotal-v_source_amount;

  SELECT d.* INTO v_latest
    FROM public.purchase_supplier_invoice_accounting_drafts d
   WHERE d.organization_id=v_org AND d.invoice_id=v_invoice.id
   ORDER BY d.handoff_sequence DESC
   LIMIT 1;
  IF FOUND THEN
    IF v_latest.handoff_status='no_adjustment_required' THEN
      v_accounting_status:='no_adjustment_required';
    ELSE
      SELECT j.* INTO v_journal
        FROM public.accounting_journal_entries j
       WHERE j.organization_id=v_org AND j.id=v_latest.journal_entry_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice handoff journal is missing';
      ELSIF v_journal.status='void' THEN
        v_accounting_status:='journal_void';
      ELSIF EXISTS (
        SELECT 1 FROM public.accounting_journal_reversals r
         WHERE r.organization_id=v_org AND r.original_journal_entry_id=v_journal.id
      ) THEN
        v_accounting_status:='journal_reversed';
      ELSIF v_journal.status='posted' THEN
        v_accounting_status:='journal_posted';
      ELSE
        v_accounting_status:='journal_draft_created';
      END IF;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id',v_invoice.id,
    'accounting_status',v_accounting_status,
    'currency',v_invoice.currency,
    'source_merchandise_amount',v_source_amount::text,
    'merchandise_variance_amount',v_variance::text,
    'tax_amount',v_invoice.tax_amount::text,
    'invoice_total_amount',v_invoice.invoice_total_amount::text,
    'handoff_sequence',CASE WHEN v_latest.id IS NULL THEN NULL ELSE v_latest.handoff_sequence END,
    'handoff_id',v_latest.id,
    'journal_entry_id',v_latest.journal_entry_id,
    'journal_entry_number',CASE WHEN v_journal.id IS NULL THEN NULL ELSE v_journal.entry_number::text END,
    'journal_status',v_journal.status,
    'source_payable_account_id',v_latest.source_payable_account_id,
    'tax_account_id',v_latest.tax_account_id,
    'merchandise_variance_account_id',v_latest.merchandise_variance_account_id,
    'created_by_profile_id',v_latest.created_by_profile_id,
    'created_at',v_latest.created_at
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_invoice_accounting_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_invoice_accounting_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_purchase_supplier_invoice_accounting_draft(
  p_invoice_id uuid,
  p_tax_account_id uuid,
  p_merchandise_variance_account_id uuid,
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
  v_invoice public.purchase_supplier_invoices%ROWTYPE;
  v_latest public.purchase_supplier_invoice_accounting_drafts%ROWTYPE;
  v_existing public.purchase_supplier_invoice_accounting_drafts%ROWTYPE;
  v_journal public.accounting_journal_entries%ROWTYPE;
  v_source record;
  v_receipt_count integer;
  v_posting_count integer;
  v_payable_account_id uuid;
  v_payable_type text;
  v_tax_type text;
  v_variance_type text;
  v_source_merchandise_amount numeric(18,2);
  v_merchandise_variance_amount numeric(18,2);
  v_net_adjustment_amount numeric(18,2);
  v_invoice_line_total numeric(18,2);
  v_expected_line_total numeric(18,2);
  v_fingerprint text;
  v_handoff_sequence integer;
  v_line_number integer:=1;
  v_journal_debit numeric(18,2);
  v_journal_credit numeric(18,2);
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for supplier invoice accounting handoff';
  END IF;
  IF p_invoice_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice and idempotency key are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':supplier-invoice-accounting:'||p_invoice_id::text,0)
  );
  SELECT i.* INTO v_invoice
    FROM public.purchase_supplier_invoices i
   WHERE i.id=p_invoice_id AND i.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier invoice is not available in this organization';
  END IF;
  IF v_invoice.match_status NOT IN ('matched','variance_approved') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice must be exactly matched or have its price variance independently approved before accounting handoff';
  END IF;
  IF v_invoice.created_by_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='invoice creator cannot prepare the accounting handoff; a different finance actor is required';
  END IF;
  IF v_invoice.currency<>'YER' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice accounting handoff currently supports YER only; no FX conversion or assumed account mapping is permitted';
  END IF;

  SELECT count(DISTINCT l.receipt_id)::integer
    INTO v_receipt_count
    FROM public.purchase_supplier_invoice_lines l
   WHERE l.organization_id=v_org AND l.invoice_id=v_invoice.id;
  IF v_receipt_count<1 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice has no physical receipt lines for accounting reconciliation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        SELECT DISTINCT l.receipt_id
          FROM public.purchase_supplier_invoice_lines l
         WHERE l.organization_id=v_org AND l.invoice_id=v_invoice.id
      ) source_receipts
      LEFT JOIN public.purchase_receipts r
        ON r.id=source_receipts.receipt_id AND r.organization_id=v_org
      LEFT JOIN public.purchase_receipt_accounting_postings p
        ON p.receipt_id=r.id AND p.organization_id=v_org
      LEFT JOIN public.accounting_journal_entries j
        ON j.id=p.journal_entry_id AND j.organization_id=v_org
     WHERE r.id IS NULL OR p.id IS NULL OR j.id IS NULL
        OR p.source_currency IS DISTINCT FROM v_invoice.currency
        OR j.status IS DISTINCT FROM 'posted'
        OR j.source_type IS DISTINCT FROM 'purchase_receipt'
        OR j.source_reference IS DISTINCT FROM r.receipt_number
        OR EXISTS (
          SELECT 1 FROM public.accounting_journal_reversals reversal
           WHERE reversal.organization_id=v_org AND reversal.original_journal_entry_id=j.id
        )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='every source receipt must have a posted, unreversed goods-receipt journal in the invoice currency before supplier invoice accounting';
  END IF;

  SELECT count(DISTINCT p.receipt_id)::integer,
         count(DISTINCT p.payable_account_id)::integer,
         min(p.payable_account_id::text)::uuid
    INTO v_posting_count, v_receipt_count, v_payable_account_id
    FROM (
      SELECT DISTINCT l.receipt_id
        FROM public.purchase_supplier_invoice_lines l
       WHERE l.organization_id=v_org AND l.invoice_id=v_invoice.id
    ) source_receipts
    JOIN public.purchase_receipt_accounting_postings p
      ON p.receipt_id=source_receipts.receipt_id AND p.organization_id=v_org;
  IF v_posting_count<1 OR v_receipt_count<>1 OR v_payable_account_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='all source receipts in one supplier invoice must use the same mapped supplier payable account; no automatic account consolidation is allowed';
  END IF;

  FOR v_source IN
    SELECT r.id AS receipt_id,r.receipt_number,p.source_amount,p.source_currency,
           p.inventory_account_id,p.payable_account_id,j.id AS journal_entry_id
      FROM (
        SELECT DISTINCT l.receipt_id
          FROM public.purchase_supplier_invoice_lines l
         WHERE l.organization_id=v_org AND l.invoice_id=v_invoice.id
      ) source_receipts
      JOIN public.purchase_receipts r
        ON r.id=source_receipts.receipt_id AND r.organization_id=v_org
      JOIN public.purchase_receipt_accounting_postings p
        ON p.receipt_id=r.id AND p.organization_id=v_org
      JOIN public.accounting_journal_entries j
        ON j.id=p.journal_entry_id AND j.organization_id=v_org
     ORDER BY r.id
     FOR UPDATE OF r,p,j
  LOOP
    SELECT count(*)::integer,
           COALESCE(sum(l.debit),0)::numeric(18,2),
           COALESCE(sum(l.credit),0)::numeric(18,2),
           COALESCE(sum(l.debit) FILTER (WHERE l.account_id=v_source.inventory_account_id),0)::numeric(18,2),
           COALESCE(sum(l.credit) FILTER (WHERE l.account_id=v_source.payable_account_id),0)::numeric(18,2)
      INTO v_receipt_count,v_journal_debit,v_journal_credit,v_expected_line_total,v_invoice_line_total
      FROM public.accounting_journal_lines l
     WHERE l.organization_id=v_org AND l.journal_entry_id=v_source.journal_entry_id;
    IF v_receipt_count<>2
       OR v_journal_debit<>v_source.source_amount OR v_journal_credit<>v_source.source_amount
       OR v_expected_line_total<>v_source.source_amount OR v_invoice_line_total<>v_source.source_amount THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source goods-receipt journal no longer contains the exact two balanced inventory/payable lines recorded for its receipt';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounting_accounts a
       WHERE a.id=v_source.inventory_account_id AND a.organization_id=v_org
         AND a.is_active AND a.account_type='asset'
    ) OR NOT EXISTS (
      SELECT 1 FROM public.accounting_accounts a
       WHERE a.id=v_source.payable_account_id AND a.organization_id=v_org
         AND a.is_active AND a.account_type='liability'
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source receipt inventory or payable mapping is no longer active or valid';
    END IF;
  END LOOP;

  SELECT COALESCE(sum(round(l.invoiced_quantity*l.received_unit_cost,2)),0)::numeric(18,2),
         COALESCE(sum(l.actual_line_total),0)::numeric(18,2)
    INTO v_source_merchandise_amount,v_invoice_line_total
    FROM public.purchase_supplier_invoice_lines l
   WHERE l.organization_id=v_org AND l.invoice_id=v_invoice.id;
  IF v_invoice_line_total<>v_invoice.merchandise_subtotal THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice saved line totals no longer reconcile to its merchandise subtotal';
  END IF;
  v_merchandise_variance_amount:=v_invoice.merchandise_subtotal-v_source_merchandise_amount;
  v_net_adjustment_amount:=v_invoice.invoice_total_amount-v_source_merchandise_amount;
  IF v_net_adjustment_amount<>v_invoice.tax_amount+v_merchandise_variance_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice tax and merchandise reconciliation do not balance against the source receipt cost';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.purchase_supplier_invoice_lines current_line
     WHERE current_line.organization_id=v_org AND current_line.invoice_id=v_invoice.id
       AND current_line.invoiced_quantity
         + COALESCE((
             SELECT sum(previous_line.invoiced_quantity)
               FROM public.purchase_supplier_invoice_lines previous_line
               JOIN public.purchase_supplier_invoices previous_invoice
                 ON previous_invoice.id=previous_line.invoice_id
                AND previous_invoice.organization_id=previous_line.organization_id
              WHERE previous_line.organization_id=v_org
                AND previous_line.receipt_item_id=current_line.receipt_item_id
                AND previous_line.invoice_id<>v_invoice.id
                AND previous_invoice.match_status<>'variance_rejected'
                AND previous_invoice.created_at<=v_invoice.created_at
           ),0)
         + COALESCE((
             SELECT sum(return_item.quantity_returned)
               FROM public.purchase_supplier_return_items return_item
               JOIN public.purchase_supplier_returns supplier_return
                 ON supplier_return.id=return_item.return_id
                AND supplier_return.organization_id=return_item.organization_id
              WHERE return_item.organization_id=v_org
                AND return_item.source_receipt_item_id=current_line.receipt_item_id
                AND supplier_return.status='posted'
                AND supplier_return.posted_at<=v_invoice.created_at
           ),0)
         > current_line.source_received_quantity
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice quantities overlap goods already returned to the supplier before the invoice was recorded; reconcile the source quantity before accounting';
  END IF;

  SELECT a.account_type INTO v_payable_type
    FROM public.accounting_accounts a
   WHERE a.id=v_payable_account_id AND a.organization_id=v_org AND a.is_active;
  IF v_payable_type IS DISTINCT FROM 'liability' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original receipt payable account must remain an active liability account';
  END IF;

  IF v_invoice.tax_amount=0 THEN
    IF p_tax_account_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='do not select a tax account when the supplier invoice contains no tax';
    END IF;
  ELSE
    SELECT a.account_type INTO v_tax_type
      FROM public.accounting_accounts a
     WHERE a.id=p_tax_account_id AND a.organization_id=v_org AND a.is_active
       AND a.account_type IN ('asset','expense');
    IF v_tax_type IS NULL OR p_tax_account_id=v_payable_account_id THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='an explicit active same-organization asset or expense account is required for the documented supplier tax';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.purchase_receipt_accounting_postings source_posting
        JOIN public.purchase_supplier_invoice_lines invoice_line
          ON invoice_line.receipt_id=source_posting.receipt_id
         AND invoice_line.organization_id=source_posting.organization_id
       WHERE invoice_line.organization_id=v_org AND invoice_line.invoice_id=v_invoice.id
         AND source_posting.inventory_account_id=p_tax_account_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tax account must be distinct from the original inventory account';
    END IF;
  END IF;

  IF v_merchandise_variance_amount=0 THEN
    IF p_merchandise_variance_account_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='do not select a variance account when invoice merchandise equals the source receipt cost';
    END IF;
  ELSE
    SELECT a.account_type INTO v_variance_type
      FROM public.accounting_accounts a
     WHERE a.id=p_merchandise_variance_account_id AND a.organization_id=v_org
       AND a.is_active AND a.account_type='expense';
    IF v_variance_type IS DISTINCT FROM 'expense'
       OR p_merchandise_variance_account_id=v_payable_account_id
       OR p_merchandise_variance_account_id IS NULL
       OR p_merchandise_variance_account_id=p_tax_account_id THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a separate active same-organization expense account is required for the supplier merchandise price variance';
    END IF;
  END IF;

  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'invoice_id',v_invoice.id,'source_merchandise_amount',v_source_merchandise_amount::text,
    'merchandise_subtotal',v_invoice.merchandise_subtotal::text,
    'tax_amount',v_invoice.tax_amount::text,'invoice_total_amount',v_invoice.invoice_total_amount::text,
    'currency',v_invoice.currency,'payable_account_id',v_payable_account_id,
    'tax_account_id',p_tax_account_id,'merchandise_variance_account_id',p_merchandise_variance_account_id
  )::text);

  SELECT d.* INTO v_existing
    FROM public.purchase_supplier_invoice_accounting_drafts d
   WHERE d.organization_id=v_org AND d.idempotency_key=p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice accounting idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'invoice_id',v_invoice.id,'handoff_id',v_existing.id,
      'journal_entry_id',v_existing.journal_entry_id,
      'handoff_sequence',v_existing.handoff_sequence,
      'accounting_status',v_existing.handoff_status,'replayed',true
    );
  END IF;

  SELECT d.* INTO v_latest
    FROM public.purchase_supplier_invoice_accounting_drafts d
   WHERE d.organization_id=v_org AND d.invoice_id=v_invoice.id
   ORDER BY d.handoff_sequence DESC
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    IF v_latest.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      IF v_latest.journal_entry_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice was already reconciled without an adjustment; no second accounting handoff is permitted';
      END IF;
      SELECT j.* INTO v_journal
        FROM public.accounting_journal_entries j
       WHERE j.organization_id=v_org AND j.id=v_latest.journal_entry_id;
      IF v_journal.status IS DISTINCT FROM 'void' THEN
        RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice already has an active or posted accounting handoff; void its draft in the General Ledger before preparing a replacement';
      END IF;
    ELSE
      IF v_latest.journal_entry_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
          'invoice_id',v_invoice.id,'handoff_id',v_latest.id,'journal_entry_id',NULL,
          'handoff_sequence',v_latest.handoff_sequence,
          'accounting_status','no_adjustment_required','replayed',true
        );
      END IF;
      SELECT j.* INTO v_journal
        FROM public.accounting_journal_entries j
       WHERE j.organization_id=v_org AND j.id=v_latest.journal_entry_id;
      IF v_journal.status IS DISTINCT FROM 'void' THEN
        RETURN pg_catalog.jsonb_build_object(
          'invoice_id',v_invoice.id,'handoff_id',v_latest.id,
          'journal_entry_id',v_latest.journal_entry_id,
          'journal_entry_number',v_journal.entry_number::text,
          'journal_status',v_journal.status,
          'handoff_sequence',v_latest.handoff_sequence,
          'accounting_status',CASE WHEN v_journal.status='posted' THEN 'journal_posted' ELSE 'journal_draft_created' END,
          'replayed',true
        );
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accounting_journal_entries j
     WHERE j.organization_id=v_org AND j.idempotency_key=p_idempotency_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used by another accounting entry';
  END IF;

  SELECT COALESCE(max(d.handoff_sequence),0)+1 INTO v_handoff_sequence
    FROM public.purchase_supplier_invoice_accounting_drafts d
   WHERE d.organization_id=v_org AND d.invoice_id=v_invoice.id;

  IF v_invoice.tax_amount=0 AND v_merchandise_variance_amount=0 THEN
    INSERT INTO public.purchase_supplier_invoice_accounting_drafts(
      organization_id,invoice_id,handoff_sequence,journal_entry_id,
      source_payable_account_id,tax_account_id,merchandise_variance_account_id,
      source_merchandise_amount,invoice_merchandise_subtotal,invoice_tax_amount,
      invoice_total_amount,merchandise_variance_amount,net_adjustment_amount,currency,
      handoff_status,idempotency_key,payload_fingerprint,created_by_profile_id
    ) VALUES (
      v_org,v_invoice.id,v_handoff_sequence,NULL,
      v_payable_account_id,NULL,NULL,
      v_source_merchandise_amount,v_invoice.merchandise_subtotal,v_invoice.tax_amount,
      v_invoice.invoice_total_amount,v_merchandise_variance_amount,v_net_adjustment_amount,
      v_invoice.currency,'no_adjustment_required',p_idempotency_key,v_fingerprint,v_actor
    ) RETURNING * INTO v_existing;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES(v_org,v_actor,'supplier_invoice.accounting_reconciled','purchase_supplier_invoice',v_invoice.id,'{}'::jsonb,
      pg_catalog.jsonb_build_object('accounting_status','no_adjustment_required',
        'source_merchandise_amount',v_source_merchandise_amount::text,'currency',v_invoice.currency));
    RETURN pg_catalog.jsonb_build_object(
      'invoice_id',v_invoice.id,'handoff_id',v_existing.id,'journal_entry_id',NULL,
      'handoff_sequence',v_handoff_sequence,'accounting_status','no_adjustment_required','replayed',false
    );
  END IF;

  INSERT INTO public.accounting_journal_entries(
    organization_id,entry_date,description,source_type,source_reference,status,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,v_invoice.invoice_date,
    pg_catalog.left('تسوية فاتورة المورد '||v_invoice.supplier_invoice_number||' مقابل تكلفة الاستلام المسجلة',240),
    'purchase_supplier_invoice',v_invoice.supplier_invoice_number,'draft',
    p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_journal;

  IF v_net_adjustment_amount>0 THEN
    INSERT INTO public.accounting_journal_lines(
      organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
    ) VALUES(v_org,v_journal.id,v_line_number,v_payable_account_id,0,v_net_adjustment_amount,
      'زيادة التزام المورد حسب فاتورته الفعلية بعد مطابقة إيصالات الاستلام');
    v_line_number:=v_line_number+1;
  ELSIF v_net_adjustment_amount<0 THEN
    INSERT INTO public.accounting_journal_lines(
      organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
    ) VALUES(v_org,v_journal.id,v_line_number,v_payable_account_id,pg_catalog.abs(v_net_adjustment_amount),0,
      'تخفيض التزام المورد إلى قيمة فاتورته الفعلية بعد مطابقة إيصالات الاستلام');
    v_line_number:=v_line_number+1;
  END IF;

  IF v_invoice.tax_amount>0 THEN
    INSERT INTO public.accounting_journal_lines(
      organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
    ) VALUES(v_org,v_journal.id,v_line_number,p_tax_account_id,v_invoice.tax_amount,0,
      'ضريبة فعلية موثقة في فاتورة المورد؛ تصنيف الحساب اختاره المحاسب');
    v_line_number:=v_line_number+1;
  END IF;

  IF v_merchandise_variance_amount>0 THEN
    INSERT INTO public.accounting_journal_lines(
      organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
    ) VALUES(v_org,v_journal.id,v_line_number,p_merchandise_variance_account_id,v_merchandise_variance_amount,0,
      'فرق تكلفة فاتورة المورد عن تكلفة إيصال الاستلام؛ حساب الفرق اختاره المحاسب');
    v_line_number:=v_line_number+1;
  ELSIF v_merchandise_variance_amount<0 THEN
    INSERT INTO public.accounting_journal_lines(
      organization_id,journal_entry_id,line_number,account_id,debit,credit,memo
    ) VALUES(v_org,v_journal.id,v_line_number,p_merchandise_variance_account_id,0,pg_catalog.abs(v_merchandise_variance_amount),
      'تخفيض تكلفة المورد عن تكلفة إيصال الاستلام؛ حساب الفرق اختاره المحاسب');
    v_line_number:=v_line_number+1;
  END IF;

  SELECT COALESCE(sum(l.debit),0)::numeric(18,2),COALESCE(sum(l.credit),0)::numeric(18,2)
    INTO v_journal_debit,v_journal_credit
    FROM public.accounting_journal_lines l
   WHERE l.organization_id=v_org AND l.journal_entry_id=v_journal.id;
  IF v_journal_debit<=0 OR v_journal_debit<>v_journal_credit THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice accounting draft is not balanced; transaction rolled back';
  END IF;

  INSERT INTO public.purchase_supplier_invoice_accounting_drafts(
    organization_id,invoice_id,handoff_sequence,journal_entry_id,
    source_payable_account_id,tax_account_id,merchandise_variance_account_id,
    source_merchandise_amount,invoice_merchandise_subtotal,invoice_tax_amount,
    invoice_total_amount,merchandise_variance_amount,net_adjustment_amount,currency,
    handoff_status,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,v_invoice.id,v_handoff_sequence,v_journal.id,
    v_payable_account_id,p_tax_account_id,p_merchandise_variance_account_id,
    v_source_merchandise_amount,v_invoice.merchandise_subtotal,v_invoice.tax_amount,
    v_invoice.invoice_total_amount,v_merchandise_variance_amount,v_net_adjustment_amount,
    v_invoice.currency,'journal_draft_created',p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_existing;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'supplier_invoice.accounting_draft_created','purchase_supplier_invoice',v_invoice.id,'{}'::jsonb,
    pg_catalog.jsonb_build_object('accounting_status','journal_draft_created',
      'handoff_id',v_existing.id,'handoff_sequence',v_handoff_sequence,
      'journal_entry_id',v_journal.id,'journal_entry_number',v_journal.entry_number::text,
      'source_merchandise_amount',v_source_merchandise_amount::text,
      'invoice_merchandise_subtotal',v_invoice.merchandise_subtotal::text,
      'tax_amount',v_invoice.tax_amount::text,
      'merchandise_variance_amount',v_merchandise_variance_amount::text,
      'net_adjustment_amount',v_net_adjustment_amount::text,'currency',v_invoice.currency,
      'source_payable_account_id',v_payable_account_id,
      'tax_account_id',p_tax_account_id,
      'merchandise_variance_account_id',p_merchandise_variance_account_id));

  RETURN pg_catalog.jsonb_build_object(
    'invoice_id',v_invoice.id,'handoff_id',v_existing.id,
    'journal_entry_id',v_journal.id,'journal_entry_number',v_journal.entry_number::text,
    'journal_status',v_journal.status,'handoff_sequence',v_handoff_sequence,
    'accounting_status','journal_draft_created','replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.prepare_purchase_supplier_invoice_accounting_draft(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_purchase_supplier_invoice_accounting_draft(uuid,uuid,uuid,uuid) TO authenticated;

COMMENT ON TABLE public.purchase_supplier_invoice_accounting_drafts IS
  'Append-only source reconciliation for supplier invoices. Reuses the original posted receipt payable account and preserves a single payable ledger; only balanced draft handoffs are created.';

COMMIT;
