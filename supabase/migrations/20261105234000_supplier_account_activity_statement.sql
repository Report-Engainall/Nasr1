-- AGH-FIN-SUPPLIER-ACCOUNT-ACTIVITY-001
-- Read-only supplier activity from source-linked POSTED receipt and credit-note journals.
-- This is ledger activity, not payment settlement or a promise that all supplier invoices are represented.
BEGIN;

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
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
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
      e.id AS journal_entry_id,
      e.entry_number::text AS journal_entry_number,
      e.entry_date,
      e.description,
      'purchase_receipt'::text AS source_type,
      'إيصال استلام '||r.receipt_number AS document_reference,
      r.receipt_number AS receipt_number,
      po.purchase_order_number,
      s.id AS supplier_id,
      s.name AS supplier_name,
      posting.source_currency AS currency,
      account.id AS payable_account_id,
      account.code AS payable_account_code,
      account.name AS payable_account_name,
      line.debit::numeric(18,2) AS debit,
      line.credit::numeric(18,2) AS credit
    FROM public.purchase_receipt_accounting_postings posting
    JOIN public.purchase_receipts r
      ON r.id=posting.receipt_id AND r.organization_id=posting.organization_id
    JOIN public.purchase_orders po
      ON po.id=r.purchase_order_id AND po.organization_id=r.organization_id
    JOIN public.suppliers s
      ON s.id=po.supplier_id AND s.organization_id=po.organization_id
    JOIN public.accounting_journal_entries e
      ON e.id=posting.journal_entry_id AND e.organization_id=posting.organization_id
    JOIN public.accounting_journal_lines line
      ON line.organization_id=e.organization_id AND line.journal_entry_id=e.id
     AND line.account_id=posting.payable_account_id
     AND line.debit=0 AND line.credit=posting.source_amount
    JOIN public.accounting_accounts account
      ON account.id=posting.payable_account_id AND account.organization_id=posting.organization_id
     AND account.is_active AND account.account_type='liability'
    WHERE posting.organization_id=v_org
      AND e.status='posted' AND e.source_type='purchase_receipt'
      AND e.source_reference=r.receipt_number
      AND (p_from IS NULL OR e.entry_date>=p_from)
      AND (p_to IS NULL OR e.entry_date<=p_to)
      AND NOT EXISTS (
        SELECT 1 FROM public.accounting_journal_reversals reversal
         WHERE reversal.organization_id=v_org
           AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id)
      )

    UNION ALL

    SELECT
      e.id AS journal_entry_id,
      e.entry_number::text AS journal_entry_number,
      e.entry_date,
      e.description,
      'purchase_supplier_credit_note'::text AS source_type,
      'إشعار دائن '||note.supplier_credit_note_number||' مقابل مرتجع '||sr.return_number AS document_reference,
      receipt.receipt_number,
      po.purchase_order_number,
      supplier.id AS supplier_id,
      supplier.name AS supplier_name,
      draft.currency,
      account.id AS payable_account_id,
      account.code AS payable_account_code,
      account.name AS payable_account_name,
      line.debit::numeric(18,2) AS debit,
      line.credit::numeric(18,2) AS credit
    FROM public.purchase_supplier_credit_note_accounting_drafts draft
    JOIN public.purchase_supplier_credit_notes note
      ON note.id=draft.credit_note_id AND note.organization_id=draft.organization_id
    JOIN public.purchase_supplier_returns sr
      ON sr.id=draft.supplier_return_id AND sr.organization_id=draft.organization_id
     AND sr.status='posted'
    JOIN public.purchase_receipts receipt
      ON receipt.id=draft.source_receipt_id AND receipt.organization_id=draft.organization_id
    JOIN public.purchase_orders po
      ON po.id=sr.purchase_order_id AND po.organization_id=sr.organization_id
    JOIN public.suppliers supplier
      ON supplier.id=sr.supplier_id AND supplier.organization_id=sr.organization_id
     AND supplier.id=note.supplier_id
    JOIN public.accounting_journal_entries source_journal
      ON source_journal.id=draft.source_journal_entry_id
     AND source_journal.organization_id=draft.organization_id
     AND source_journal.status='posted' AND source_journal.source_type='purchase_receipt'
     AND source_journal.source_reference=receipt.receipt_number
    JOIN public.accounting_journal_entries e
      ON e.id=draft.journal_entry_id AND e.organization_id=draft.organization_id
     AND e.status='posted' AND e.source_type='purchase_supplier_credit_note'
     AND e.source_reference=note.supplier_credit_note_number
    JOIN public.accounting_journal_lines line
      ON line.organization_id=e.organization_id AND line.journal_entry_id=e.id
     AND line.account_id=draft.payable_account_id
     AND line.debit=draft.actual_amount AND line.credit=0
    JOIN public.accounting_accounts account
      ON account.id=draft.payable_account_id AND account.organization_id=draft.organization_id
     AND account.is_active AND account.account_type='liability'
    WHERE draft.organization_id=v_org
      AND note.status='journal_draft_created'
      AND (p_from IS NULL OR e.entry_date>=p_from)
      AND (p_to IS NULL OR e.entry_date<=p_to)
      AND NOT EXISTS (
        SELECT 1 FROM public.accounting_journal_reversals source_reversal
         WHERE source_reversal.organization_id=v_org
           AND (source_reversal.original_journal_entry_id=source_journal.id
             OR source_reversal.reversal_journal_entry_id=source_journal.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.accounting_journal_reversals note_reversal
         WHERE note_reversal.organization_id=v_org
           AND (note_reversal.original_journal_entry_id=e.id
             OR note_reversal.reversal_journal_entry_id=e.id)
      )
  ),
  supplier_totals AS (
    SELECT
      supplier_id,supplier_name,currency,
      pg_catalog.count(*)::integer AS activity_count,
      pg_catalog.sum(debit)::numeric(18,2) AS debit_total,
      pg_catalog.sum(credit)::numeric(18,2) AS credit_total,
      (pg_catalog.sum(credit)-pg_catalog.sum(debit))::numeric(18,2) AS net_credit_movement,
      pg_catalog.max(entry_date) AS last_activity_date
    FROM activity
    GROUP BY supplier_id,supplier_name,currency
  ),
  currency_totals AS (
    SELECT
      currency,
      pg_catalog.sum(debit)::numeric(18,2) AS debit_total,
      pg_catalog.sum(credit)::numeric(18,2) AS credit_total,
      (pg_catalog.sum(credit)-pg_catalog.sum(debit))::numeric(18,2) AS net_credit_movement,
      pg_catalog.count(*)::integer AS activity_count
    FROM activity
    GROUP BY currency
  ),
  entry_page AS (
    SELECT * FROM activity
    ORDER BY entry_date DESC,journal_entry_number DESC,journal_entry_id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT pg_catalog.jsonb_build_object(
    'suppliers',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s)
        ORDER BY s.supplier_name,s.currency)
      FROM supplier_totals s
    ),'[]'::jsonb),
    'currency_totals',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY c.currency)
      FROM currency_totals c
    ),'[]'::jsonb),
    'entries',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)
        ORDER BY p.entry_date DESC,p.journal_entry_number DESC,p.journal_entry_id DESC)
      FROM entry_page p
    ),'[]'::jsonb),
    'entry_count',(SELECT pg_catalog.count(*)::integer FROM activity),
    'limit',p_limit,
    'offset',p_offset,
    'has_more',(SELECT pg_catalog.count(*) FROM activity)>p_offset+p_limit,
    'as_of_date',current_date,
    'settlement_included',false
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_supplier_account_activity(date,date,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_supplier_account_activity(date,date,integer,integer) TO authenticated;

COMMENT ON FUNCTION public.fetch_supplier_account_activity(date,date,integer,integer) IS
  'Read-only finance-role supplier activity derived only from source-linked POSTED purchase-receipt and supplier-credit-note journals, with per-currency totals. Excludes drafts, void/reversed journals and unlinked payable rows. Does not claim payment settlement or final payable balances.';

COMMIT;
