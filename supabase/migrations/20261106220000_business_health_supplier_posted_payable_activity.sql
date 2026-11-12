-- Section 51 extension: supplier concentration within posted, source-linked payable movements.
-- Exact as-of semantics use journal posted_at and reversal-link created_at.
-- This is not total supplier spend, all supplier invoices, cash settlement or closing AP balance.
BEGIN;
CREATE OR REPLACE FUNCTION public.fetch_business_health_supplier_posted_payable_activity(
  p_from date,p_to date,p_as_of timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_source_entry_count integer:=0;
  v_currency_count integer:=0;
  v_rows jsonb:='[]'::jsonb;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.can_manage_finance()
     OR NOT EXISTS(SELECT 1 FROM public.profiles p
       WHERE p.id=v_actor AND p.organization_id=v_org
         AND p.auth_user_id=auth.uid() AND p.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active same-organization finance permission required for supplier payable activity';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>365 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payable activity period is invalid or exceeds 366 inclusive days';
  END IF;
  IF p_as_of IS NULL OR p_as_of>v_now+interval '5 minutes' OR p_as_of<v_now-interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payable activity as-of must represent the current snapshot';
  END IF;

  WITH activity AS MATERIALIZED (
    SELECT e.id AS journal_entry_id,e.entry_date,s.id AS supplier_id,
           posting.source_currency AS currency,
           source_lines.payable_debit AS debit,source_lines.payable_credit AS credit
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
        SELECT pg_catalog.count(*)::integer AS line_count,
          coalesce(pg_catalog.sum(l.debit),0)::numeric(18,2) AS debit_total,
          coalesce(pg_catalog.sum(l.credit),0)::numeric(18,2) AS credit_total,
          coalesce(pg_catalog.sum(l.debit) FILTER(WHERE l.account_id=posting.payable_account_id),0)::numeric(18,2) AS payable_debit,
          coalesce(pg_catalog.sum(l.credit) FILTER(WHERE l.account_id=posting.payable_account_id),0)::numeric(18,2) AS payable_credit
        FROM public.accounting_journal_lines l
        WHERE l.organization_id=e.organization_id AND l.journal_entry_id=e.id
      ) source_lines ON source_lines.line_count=2
        AND source_lines.debit_total=posting.source_amount
        AND source_lines.credit_total=posting.source_amount
        AND source_lines.payable_debit=0
        AND source_lines.payable_credit=posting.source_amount
      JOIN public.accounting_accounts account
        ON account.id=posting.payable_account_id AND account.organization_id=posting.organization_id
       AND account.is_active AND account.account_type='liability'
     WHERE posting.organization_id=v_org
       AND posting.created_at<=p_as_of
       AND e.status='posted' AND e.posted_at IS NOT NULL AND e.posted_at<=p_as_of
       AND e.source_type='purchase_receipt' AND e.source_reference=r.receipt_number
       AND e.entry_date BETWEEN p_from AND p_to
       AND NOT EXISTS(SELECT 1 FROM public.accounting_journal_reversals reversal
         WHERE reversal.organization_id=v_org
           AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id)
           AND reversal.created_at<=p_as_of)

    UNION ALL

    SELECT e.id AS journal_entry_id,e.entry_date,supplier.id AS supplier_id,
           draft.currency,note_lines.payable_debit AS debit,note_lines.payable_credit AS credit
      FROM public.purchase_supplier_credit_note_accounting_drafts draft
      JOIN public.purchase_supplier_credit_notes note
        ON note.id=draft.credit_note_id AND note.organization_id=draft.organization_id
       AND note.actual_amount=draft.actual_amount
       AND note.source_amount=draft.source_amount
       AND note.currency=draft.currency
      JOIN public.purchase_supplier_returns sr
        ON sr.id=draft.supplier_return_id AND sr.organization_id=draft.organization_id
       AND sr.status='posted' AND sr.posted_at IS NOT NULL AND sr.posted_at<=p_as_of
       AND sr.source_receipt_id=draft.source_receipt_id
       AND sr.total_cost=note.source_amount AND sr.currency=note.currency
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
       AND source_journal.status='posted' AND source_journal.posted_at IS NOT NULL
       AND source_journal.posted_at<=p_as_of
       AND source_journal.source_type='purchase_receipt'
       AND source_journal.source_reference=receipt.receipt_number
      JOIN public.accounting_journal_entries e
        ON e.id=draft.journal_entry_id AND e.organization_id=draft.organization_id
       AND e.status='posted' AND e.posted_at IS NOT NULL AND e.posted_at<=p_as_of
       AND e.source_type='purchase_supplier_credit_note'
       AND e.source_reference=note.supplier_credit_note_number
      JOIN LATERAL (
        SELECT pg_catalog.count(*)::integer AS line_count,
          coalesce(pg_catalog.sum(l.debit),0)::numeric(18,2) AS debit_total,
          coalesce(pg_catalog.sum(l.credit),0)::numeric(18,2) AS credit_total,
          coalesce(pg_catalog.sum(l.debit) FILTER(WHERE l.account_id=draft.payable_account_id),0)::numeric(18,2) AS payable_debit,
          coalesce(pg_catalog.sum(l.credit) FILTER(WHERE l.account_id=draft.payable_account_id),0)::numeric(18,2) AS payable_credit
        FROM public.accounting_journal_lines l
        WHERE l.organization_id=e.organization_id AND l.journal_entry_id=e.id
      ) note_lines ON note_lines.line_count BETWEEN 2 AND 3
        AND note_lines.debit_total=draft.actual_amount
        AND note_lines.credit_total=draft.actual_amount
        AND note_lines.payable_debit=draft.actual_amount
        AND note_lines.payable_credit=0
      JOIN public.accounting_accounts account
        ON account.id=draft.payable_account_id AND account.organization_id=draft.organization_id
       AND account.is_active AND account.account_type='liability'
     WHERE draft.organization_id=v_org
       AND draft.created_at<=p_as_of AND note.created_at<=p_as_of
       AND note.status='journal_draft_created'
       AND e.entry_date BETWEEN p_from AND p_to
       AND NOT EXISTS(SELECT 1 FROM public.accounting_journal_reversals reversal
         WHERE reversal.organization_id=v_org
           AND (reversal.original_journal_entry_id=source_journal.id
             OR reversal.reversal_journal_entry_id=source_journal.id)
           AND reversal.created_at<=p_as_of)
       AND NOT EXISTS(SELECT 1 FROM public.accounting_journal_reversals reversal
         WHERE reversal.organization_id=v_org
           AND (reversal.original_journal_entry_id=e.id OR reversal.reversal_journal_entry_id=e.id)
           AND reversal.created_at<=p_as_of)
  ),
  supplier_totals AS (
    SELECT supplier_id,currency,pg_catalog.count(*)::integer AS activity_count,
           pg_catalog.sum(debit)::numeric(18,2) AS debit_total,
           pg_catalog.sum(credit)::numeric(18,2) AS credit_total,
           (pg_catalog.sum(credit)-pg_catalog.sum(debit))::numeric(18,2) AS net_credit_movement
      FROM activity GROUP BY supplier_id,currency
  ),
  ranked AS (
    SELECT *,pg_catalog.row_number() OVER(PARTITION BY currency ORDER BY credit_total DESC,supplier_id) AS supplier_rank
      FROM supplier_totals
  ),
  currency_rollup AS (
    SELECT currency,pg_catalog.count(*)::integer AS supplier_count,
           pg_catalog.sum(activity_count)::integer AS source_entry_count,
           pg_catalog.sum(credit_total)::numeric(18,2) AS gross_payable_credit_amount,
           pg_catalog.sum(debit_total)::numeric(18,2) AS posted_supplier_credit_note_debit_amount,
           pg_catalog.sum(net_credit_movement)::numeric(18,2) AS net_payable_movement_amount,
           coalesce(pg_catalog.sum(credit_total) FILTER(WHERE supplier_rank<=5),0)::numeric(18,2) AS top5_gross_payable_credit_amount
      FROM ranked GROUP BY currency
  )
  SELECT coalesce(pg_catalog.sum(source_entry_count),0)::integer,
         pg_catalog.count(*)::integer,
         coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'currency',currency,
           'status',CASE WHEN gross_payable_credit_amount>0 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
           'supplierCount',supplier_count,
           'sourceEntryCount',source_entry_count,
           'grossPayableCreditAmount',gross_payable_credit_amount,
           'postedSupplierCreditNoteDebitAmount',posted_supplier_credit_note_debit_amount,
           'netPayableMovementAmount',net_payable_movement_amount,
           'top5GrossPayableCreditAmount',CASE WHEN gross_payable_credit_amount>0 THEN top5_gross_payable_credit_amount ELSE 0 END,
           'top5GrossPayableCreditPercent',CASE WHEN gross_payable_credit_amount>0
             THEN pg_catalog.round((top5_gross_payable_credit_amount/gross_payable_credit_amount)*100,2)
             ELSE NULL END
         ) ORDER BY currency),'[]'::jsonb)
    INTO v_source_entry_count,v_currency_count,v_rows
    FROM currency_rollup;

  v_status:=CASE
    WHEN v_source_entry_count=0 THEN 'EMPTY'
    WHEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_rows) AS result_row(value)
      WHERE result_row.value->>'status'<>'VERIFIED') THEN 'NEEDS_REVIEW'
    ELSE 'VERIFIED' END;

  RETURN pg_catalog.jsonb_build_object(
    'asOf',p_as_of,'period',pg_catalog.jsonb_build_object('from',p_from::text,'to',p_to::text),
    'status',v_status,'completeSourceAggregation',true,
    'sourceEntryCount',v_source_entry_count,'currencyCount',v_currency_count,'currencies',v_rows,
    'activityScope','POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS',
    'formulaId','nasr1.posted-supplier-payable-credit-concentration','formulaVersion','1',
    'formulaDescription','Within each currency, top-five concentration is the five largest supplier gross payable credits from eligible posted, source-linked purchase-receipt journals divided by all such gross payable credits, using journal posted_at up to the captured as-of instant. Posted supplier credit-note payable debits are shown separately and are not netted into the gross-credit concentration. The source excludes draft, reversed-at-as-of and unlinked journals; it does not represent total purchase spend, all supplier invoices, cash settlement or a closing payable balance.',
    'settlementIncluded',false,'sideEffects','NONE'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_business_health_supplier_posted_payable_activity(date,date,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_business_health_supplier_posted_payable_activity(date,date,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.fetch_business_health_supplier_posted_payable_activity(date,date,timestamptz) IS
  'Finance-only Section 51 read model. Uses exact posted_at and reversal created_at bounds on source-linked supplier receipt/credit-note journals, derives currency-separated gross-credit concentration and separate credit-note debits, and exposes no supplier identities. Does not claim total supplier spend, all supplier invoices, cash settlement or closing AP balance. No writes.';
COMMIT;
