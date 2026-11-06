-- NASR1-EXECUTIVE-LIQUIDITY-COMMAND-CENTER-001
-- Read-only, server-tenant-scoped financial command center.
-- Cash counts, source-linked period movements, open posted supplier payables and receivable aging
-- are deliberately distinct. No synthetic cash/bank opening balance or FX conversion is created.

CREATE OR REPLACE FUNCTION public.fetch_executive_liquidity_workspace(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_role text;
  v_now timestamptz := statement_timestamp();
  v_today date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
  v_from date := coalesce(p_from, (statement_timestamp() AT TIME ZONE 'UTC')::date - 89);
  v_to date := coalesce(p_to, (statement_timestamp() AT TIME ZONE 'UTC')::date);
  v_cash_counts jsonb := '[]'::jsonb;
  v_cash_accounts jsonb := '[]'::jsonb;
  v_cash_movements jsonb := '[]'::jsonb;
  v_supplier_payables jsonb := '[]'::jsonb;
  v_receivables jsonb := '[]'::jsonb;
  v_unclassified_cash_lines integer := 0;
  v_unlinked_cash_expenses integer := 0;
  v_unlinked_customer_payments integer := 0;
  v_unresolved_receivables integer := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_completeness text := 'COMPLETE';
BEGIN
  SELECT p.organization_id, r.role
    INTO v_org, v_role
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id = p.id
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'finance permission required for executive liquidity workspace';
  END IF;

  IF v_from IS NULL OR v_to IS NULL OR v_from > v_to OR v_to > v_today OR (v_to - v_from) > 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'actual cash movement period must be valid, not future, and at most 366 days';
  END IF;

  -- Latest immutable count per shift/currency/phase. These are shift cash counts, not bank balances
  -- and must never be summed across shifts as an organization-wide cash balance.
  WITH ranked AS (
    SELECT
      c.id, c.shift_id, c.phase, c.currency, c.counted_amount, c.version, c.created_at,
      s.business_date, s.shift_label, s.organization_time_zone,
      row_number() OVER (
        PARTITION BY c.shift_id, c.currency, c.phase
        ORDER BY c.version DESC, c.created_at DESC, c.id DESC
      ) AS version_rank
    FROM public.operational_shift_cash_counts c
    JOIN public.operational_shifts s
      ON s.id = c.shift_id AND s.organization_id = c.organization_id
    WHERE c.organization_id = v_org
      AND c.created_at <= v_now
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id::text,
    'shift_id', q.shift_id::text,
    'shift_label', q.shift_label,
    'business_date', q.business_date::text,
    'organization_time_zone', q.organization_time_zone,
    'phase', q.phase,
    'currency', q.currency,
    'counted_amount', q.counted_amount::text,
    'version', q.version,
    'source_timestamp', q.created_at,
    'status', 'VERIFIED',
    'source_name', 'operational_shift_cash_counts',
    'evidence_id', 'cash-count:' || q.id::text
  ) ORDER BY q.business_date DESC, q.created_at DESC, q.currency, q.phase), '[]'::jsonb)
    INTO v_cash_counts
  FROM (
    SELECT * FROM ranked WHERE version_rank = 1
    ORDER BY business_date DESC, created_at DESC, currency, phase
    LIMIT 200
  ) q;

  -- Only source-linked, posted and balanced cash/bank movements with an unambiguous source currency.
  -- Manual/legacy journals without a currency column are excluded and disclosed separately below.
  WITH customer_moves AS (
    SELECT
      sp.id AS posting_id,
      sp.source_id,
      sp.journal_entry_id,
      sp.settlement_account_id AS account_id,
      sp.source_currency AS currency,
      p.paid_at AS movement_at,
      (p.paid_at AT TIME ZONE 'UTC')::date AS movement_date,
      sp.source_amount AS amount,
      'INFLOW'::text AS direction,
      'customer_payment'::text AS source_kind,
      'customer-payment:' || sp.source_id::text AS evidence_id
    FROM public.accounting_customer_source_postings sp
    JOIN public.customer_payments p
      ON p.id = sp.source_id AND p.organization_id = sp.organization_id
    JOIN public.customer_invoices i
      ON i.id = p.invoice_id AND i.organization_id = p.organization_id
    JOIN public.accounting_journal_entries e
      ON e.id = sp.journal_entry_id AND e.organization_id = sp.organization_id
    JOIN LATERAL (
      SELECT
        count(*)::integer AS line_count,
        coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
        coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
        coalesce(sum(l.debit) FILTER (WHERE l.account_id = sp.settlement_account_id),0)::numeric(18,2) AS settlement_debit,
        coalesce(sum(l.credit) FILTER (WHERE l.account_id = sp.receivable_account_id),0)::numeric(18,2) AS receivable_credit
      FROM public.accounting_journal_lines l
      WHERE l.organization_id = e.organization_id AND l.journal_entry_id = e.id
    ) lines ON lines.line_count = 2
      AND lines.debit_total = sp.source_amount
      AND lines.credit_total = sp.source_amount
      AND lines.settlement_debit = sp.source_amount
      AND lines.receivable_credit = sp.source_amount
    WHERE sp.organization_id = v_org
      AND sp.source_type = 'customer_payment'
      AND sp.posting_kind = 'original'
      AND sp.source_currency = i.currency
      AND e.status = 'posted'
      AND e.source_type = 'payment'
      AND e.source_reference = p.id::text
      AND p.paid_at <= v_now
      AND NOT EXISTS (
        SELECT 1 FROM public.accounting_journal_reversals reversal
        WHERE reversal.organization_id = e.organization_id
          AND (reversal.original_journal_entry_id = e.id OR reversal.reversal_journal_entry_id = e.id)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.accounting_customer_source_postings reverse_posting
        JOIN public.accounting_journal_entries reverse_journal
          ON reverse_journal.id = reverse_posting.journal_entry_id
         AND reverse_journal.organization_id = reverse_posting.organization_id
        WHERE reverse_posting.organization_id = sp.organization_id
          AND reverse_posting.source_type = 'customer_payment'
          AND reverse_posting.source_id = sp.source_id
          AND reverse_posting.posting_kind = 'reversal'
          AND reverse_journal.status = 'posted'
      )
  ),
  supplier_moves AS (
    SELECT
      d.id AS posting_id,
      p.id AS source_id,
      d.journal_entry_id,
      p.settlement_account_id AS account_id,
      p.currency,
      (p.payment_date::timestamp AT TIME ZONE 'UTC') AS movement_at,
      p.payment_date AS movement_date,
      p.amount,
      'OUTFLOW'::text AS direction,
      'supplier_payment'::text AS source_kind,
      'supplier-payment:' || p.id::text AS evidence_id
    FROM public.purchase_supplier_payment_accounting_drafts d
    JOIN public.purchase_supplier_payments p
      ON p.id = d.payment_id AND p.organization_id = d.organization_id
    JOIN public.accounting_journal_entries e
      ON e.id = d.journal_entry_id AND e.organization_id = d.organization_id
    JOIN LATERAL (
      SELECT
        count(*)::integer AS line_count,
        coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
        coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
        coalesce(sum(l.debit) FILTER (WHERE l.account_id = p.payable_account_id),0)::numeric(18,2) AS payable_debit,
        coalesce(sum(l.credit) FILTER (WHERE l.account_id = p.settlement_account_id),0)::numeric(18,2) AS settlement_credit
      FROM public.accounting_journal_lines l
      WHERE l.organization_id = e.organization_id AND l.journal_entry_id = e.id
    ) lines ON lines.line_count = 2
      AND lines.debit_total = p.amount
      AND lines.credit_total = p.amount
      AND lines.payable_debit = p.amount
      AND lines.settlement_credit = p.amount
    WHERE d.organization_id = v_org
      AND d.source_amount = p.amount
      AND d.currency = p.currency
      AND d.payable_account_id = p.payable_account_id
      AND d.settlement_account_id = p.settlement_account_id
      AND p.status = 'journal_draft_created'
      AND e.status = 'posted'
      AND e.source_type = 'purchase_supplier_payment'
      AND e.source_reference = p.payment_number::text
      AND e.entry_date <= v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.accounting_journal_reversals reversal
        WHERE reversal.organization_id = e.organization_id
          AND (reversal.original_journal_entry_id = e.id OR reversal.reversal_journal_entry_id = e.id)
      )
  ),
  expense_moves AS (
    SELECT
      sp.id AS posting_id,
      ce.id AS source_id,
      sp.journal_entry_id,
      sp.settlement_account_id AS account_id,
      sp.source_currency AS currency,
      (ce.expense_date::timestamp AT TIME ZONE 'UTC') AS movement_at,
      ce.expense_date AS movement_date,
      sp.source_amount AS amount,
      'OUTFLOW'::text AS direction,
      'cash_expense'::text AS source_kind,
      'cash-expense:' || ce.id::text AS evidence_id
    FROM public.accounting_source_postings sp
    JOIN public.cash_expenses ce
      ON ce.id = sp.source_id AND ce.organization_id = sp.organization_id
    JOIN public.accounting_journal_entries e
      ON e.id = sp.journal_entry_id AND e.organization_id = sp.organization_id
    JOIN LATERAL (
      SELECT
        count(*)::integer AS line_count,
        coalesce(sum(l.debit),0)::numeric(18,2) AS debit_total,
        coalesce(sum(l.credit),0)::numeric(18,2) AS credit_total,
        coalesce(sum(l.debit) FILTER (WHERE l.account_id = sp.expense_account_id),0)::numeric(18,2) AS expense_debit,
        coalesce(sum(l.credit) FILTER (WHERE l.account_id = sp.settlement_account_id),0)::numeric(18,2) AS settlement_credit
      FROM public.accounting_journal_lines l
      WHERE l.organization_id = e.organization_id AND l.journal_entry_id = e.id
    ) lines ON lines.line_count = 2
      AND lines.debit_total = sp.source_amount
      AND lines.credit_total = sp.source_amount
      AND lines.expense_debit = sp.source_amount
      AND lines.settlement_credit = sp.source_amount
    WHERE sp.organization_id = v_org
      AND sp.source_type = 'cash_expense'
      AND sp.posting_kind = 'original'
      AND ce.status = 'posted'
      AND ce.amount = sp.source_amount
      AND ce.currency = sp.source_currency
      AND e.status = 'posted'
      AND e.source_type = 'cash_expense'
      AND e.source_reference = ce.id::text
      AND NOT EXISTS (
        SELECT 1 FROM public.accounting_journal_reversals reversal
        WHERE reversal.organization_id = e.organization_id
          AND (reversal.original_journal_entry_id = e.id OR reversal.reversal_journal_entry_id = e.id)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.accounting_source_postings reverse_posting
        JOIN public.accounting_journal_entries reverse_journal
          ON reverse_journal.id = reverse_posting.journal_entry_id
         AND reverse_journal.organization_id = reverse_posting.organization_id
        WHERE reverse_posting.organization_id = sp.organization_id
          AND reverse_posting.source_type = 'cash_expense'
          AND reverse_posting.source_id = sp.source_id
          AND reverse_posting.posting_kind = 'reversal'
          AND reverse_journal.status = 'posted'
      )
  ),
  movement_rows AS (
    SELECT * FROM customer_moves
    UNION ALL
    SELECT * FROM supplier_moves
    UNION ALL
    SELECT * FROM expense_moves
  ),
  scoped_movements AS (
    SELECT *
    FROM movement_rows
    WHERE movement_date BETWEEN v_from AND v_to
  ),
  movement_totals AS (
    SELECT
      account_id,
      currency,
      coalesce(sum(amount) FILTER (WHERE direction = 'INFLOW'),0)::numeric(18,2) AS inflows,
      coalesce(sum(amount) FILTER (WHERE direction = 'OUTFLOW'),0)::numeric(18,2) AS outflows,
      (coalesce(sum(amount) FILTER (WHERE direction = 'INFLOW'),0)
       - coalesce(sum(amount) FILTER (WHERE direction = 'OUTFLOW'),0))::numeric(18,2) AS net_movement,
      count(*)::integer AS movement_count,
      max(movement_at) AS last_movement_at,
      (array_agg(DISTINCT evidence_id ORDER BY evidence_id))[1:25] AS evidence_ids,
      array_agg(DISTINCT source_kind ORDER BY source_kind) AS source_kinds
    FROM scoped_movements
    GROUP BY account_id, currency
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'account_id', t.account_id::text,
    'account_code', a.code,
    'account_name', a.name,
    'display_name', coalesce(m.display_name, a.name),
    'settlement_kind', coalesce(m.settlement_kind, 'unclassified'),
    'currency', t.currency,
    'period_from', v_from::text,
    'period_to', v_to::text,
    'as_of', v_now,
    'inflows', t.inflows::text,
    'outflows', t.outflows::text,
    'net_movement', t.net_movement::text,
    'movement_count', t.movement_count,
    'last_movement_at', t.last_movement_at,
    'source_kinds', to_jsonb(t.source_kinds),
    'evidence_ids', to_jsonb(t.evidence_ids),
    'status', 'NEEDS_REVIEW',
    'formula_id', 'cash.account-source-movements',
    'formula_version', '1.0.0',
    'calculated_at', v_now,
    'warnings', CASE WHEN m.settlement_kind IS NULL
      THEN jsonb_build_array('هذا الحساب غير مربوط بتصنيف صندوق/بنك معتمد. الحركة لا تمثل رصيد الحساب؛ لا يوجد رصيد افتتاحي/كشف بنك مطابق مثبت في المصدر.')
      ELSE jsonb_build_array('هذه حركة مصدرية للفترة وليست رصيد الحساب؛ لا يوجد رصيد افتتاحي/كشف بنك مطابق مثبت في المصدر.')
    END
  ) ORDER BY t.currency, a.code, t.account_id), '[]'::jsonb)
    INTO v_cash_movements
  FROM movement_totals t
  JOIN public.accounting_accounts a
    ON a.id = t.account_id AND a.organization_id = v_org
  LEFT JOIN LATERAL (
    SELECT m.display_name, m.settlement_kind
    FROM public.purchase_supplier_payment_settlement_accounts m
    WHERE m.organization_id = v_org
      AND m.accounting_account_id = t.account_id
      AND m.currency = t.currency
      AND m.is_active
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) m ON true;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'account_id', q.account_id::text,
    'account_code', q.code,
    'account_name', q.name,
    'display_name', q.display_name,
    'settlement_kind', q.settlement_kind,
    'currency', q.currency,
    'balance', NULL,
    'balance_status', 'UNAVAILABLE',
    'movement_from', v_from::text,
    'movement_to', v_to::text,
    'as_of', v_now,
    'source_name', 'purchase_supplier_payment_settlement_accounts'
  ) ORDER BY q.currency, q.code, q.account_id), '[]'::jsonb)
    INTO v_cash_accounts
  FROM (
    SELECT DISTINCT ON (m.accounting_account_id, m.currency)
      m.accounting_account_id AS account_id, a.code, a.name,
      m.display_name, m.settlement_kind, m.currency
    FROM public.purchase_supplier_payment_settlement_accounts m
    JOIN public.accounting_accounts a
      ON a.id = m.accounting_account_id AND a.organization_id = m.organization_id
    WHERE m.organization_id = v_org AND m.is_active AND a.is_active
    ORDER BY m.accounting_account_id, m.currency, m.created_at DESC, m.id DESC
  ) q;

  -- Supplier payable = posted receipt journal less posted credit notes and independently verified,
  -- posted supplier-payment allocations. Reserved/draft payments are disclosed separately.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'supplier_id', q.supplier_id::text,
    'supplier_name', q.supplier_name,
    'currency', q.currency,
    'receipt_count', q.receipt_count,
    'posted_payable', CASE WHEN q.invalid_rows > 0 THEN NULL ELSE q.posted_payable::text END,
    'reserved_payment_amount', q.reserved_payment_amount::text,
    'last_receipt_date', q.last_receipt_date::text,
    'as_of', v_now,
    'status', CASE WHEN q.invalid_rows > 0 THEN 'NEEDS_REVIEW' ELSE 'VERIFIED' END,
    'formula_id', 'supplier.posted-receipts-minus-posted-settlements',
    'formula_version', '1.0.0',
    'calculated_at', v_now,
    'evidence_ids', to_jsonb(q.evidence_ids),
    'due_date_status', 'SEE_VERIFIED_CASHFLOW_SCHEDULE',
    'warnings', CASE WHEN q.invalid_rows > 0
      THEN jsonb_build_array('توجد قيود مورد غير متطابقة؛ راجع المصدر قبل اعتماد الإجمالي.','تاريخ الاستحقاق الموثق يُحفظ في سجل أدلة مستقل ويُعرض عبر جدول التدفقات المستقبلية.')
      ELSE jsonb_build_array('الالتزام مثبت من إيصالات مستلمة وقيود مرحلة وتسويات مستقلة. يُراجع تاريخ الاستحقاق في جدول التدفقات المستقبلية ذي الدليل المستقل.')
    END
  ) ORDER BY q.currency, q.supplier_name, q.supplier_id), '[]'::jsonb)
    INTO v_supplier_payables
  FROM (
    SELECT
      r.supplier_id,
      r.supplier_name,
      r.currency,
      count(*)::integer AS receipt_count,
      sum(r.outstanding_payable)::numeric(18,2) AS posted_payable,
      sum(greatest(r.reserved_payment_total - r.posted_payment_total,0))::numeric(18,2) AS reserved_payment_amount,
      max(r.receipt_date) AS last_receipt_date,
      count(*) FILTER (WHERE r.outstanding_payable < 0 OR r.available_to_allocate < 0)::integer AS invalid_rows,
      (array_agg(DISTINCT 'supplier-receipt-journal:' || r.source_journal_entry_id::text ORDER BY 'supplier-receipt-journal:' || r.source_journal_entry_id::text))[1:25] AS evidence_ids
    FROM public.supplier_payment_open_receipts(v_org, NULL, NULL) r
    WHERE r.receipt_date <= v_today
    GROUP BY r.supplier_id, r.supplier_name, r.currency
  ) q;

  -- Customer receivables are reduced by recorded payments against the same invoice, including partial payments.
  -- Missing due dates/currencies are counted as unresolved rather than silently assigned to an aging bucket.
  WITH paid AS (
    SELECT p.invoice_id, sum(p.amount)::numeric(18,2) AS paid_amount,
           array_agg('customer-payment:' || p.id::text ORDER BY p.paid_at, p.id) AS payment_evidence
    FROM public.customer_payments p
    WHERE p.organization_id = v_org AND p.paid_at <= v_now
    GROUP BY p.invoice_id
  ),
  invoice_balances AS (
    SELECT
      i.id, i.currency, i.due_at,
      greatest(i.total_amount - coalesce(p.paid_amount,0),0)::numeric(18,2) AS outstanding,
      coalesce(p.paid_amount,0)::numeric(18,2) AS paid_amount,
      coalesce(p.payment_evidence,ARRAY[]::text[]) AS payment_evidence,
      CASE
        WHEN i.due_at IS NULL THEN 'UNKNOWN_DUE_DATE'
        WHEN (i.due_at AT TIME ZONE 'UTC')::date >= v_today THEN 'NOT_DUE'
        WHEN v_today - (i.due_at AT TIME ZONE 'UTC')::date <= 30 THEN 'OVERDUE_1_30'
        WHEN v_today - (i.due_at AT TIME ZONE 'UTC')::date <= 60 THEN 'OVERDUE_31_60'
        WHEN v_today - (i.due_at AT TIME ZONE 'UTC')::date <= 90 THEN 'OVERDUE_61_90'
        ELSE 'OVERDUE_90_PLUS'
      END AS aging_bucket
    FROM public.customer_invoices i
    LEFT JOIN paid p ON p.invoice_id = i.id
    WHERE i.organization_id = v_org
      AND i.status IN ('issued','partially_paid')
      AND i.issued_at <= v_now
      AND i.total_amount > coalesce(p.paid_amount,0)
  ),
  unresolved AS (
    SELECT count(*)::integer AS row_count
    FROM invoice_balances
    WHERE coalesce(currency,'') !~ '^[A-Z]{3}$'
       OR aging_bucket = 'UNKNOWN_DUE_DATE'
  ),
  valid_balances AS (
    SELECT *
    FROM invoice_balances
    WHERE currency ~ '^[A-Z]{3}$'
  ),
  bucket_totals AS (
    SELECT
      currency, aging_bucket,
      count(*)::integer AS invoice_count,
      sum(outstanding)::numeric(18,2) AS amount,
      count(*) FILTER (WHERE paid_amount > 0)::integer AS partially_paid_count,
      (array_agg('customer-invoice:' || id::text ORDER BY id))[1:25] AS invoice_evidence,
      coalesce((
        SELECT (array_agg(DISTINCT payment_rows.evidence_id ORDER BY payment_rows.evidence_id))[1:25]
        FROM valid_balances payment_balance
        CROSS JOIN LATERAL unnest(payment_balance.payment_evidence) AS payment_rows(evidence_id)
        WHERE payment_balance.currency = current_balance.currency
          AND payment_balance.aging_bucket = current_balance.aging_bucket
      ), ARRAY[]::text[]) AS payment_evidence
    FROM valid_balances current_balance
    GROUP BY currency, aging_bucket
  ),
  currency_totals AS (
    SELECT currency,
      sum(amount)::numeric(18,2) AS total_outstanding,
      sum(amount) FILTER (WHERE aging_bucket = 'NOT_DUE')::numeric(18,2) AS not_due_amount,
      sum(amount) FILTER (WHERE aging_bucket LIKE 'OVERDUE_%')::numeric(18,2) AS overdue_amount,
      sum(invoice_count)::integer AS invoice_count,
      sum(partially_paid_count)::integer AS partially_paid_count
    FROM bucket_totals
    GROUP BY currency
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'currency', totals.currency,
    'total_outstanding', totals.total_outstanding::text,
    'not_due_amount', coalesce(totals.not_due_amount,0)::numeric(18,2)::text,
    'overdue_amount', coalesce(totals.overdue_amount,0)::numeric(18,2)::text,
    'invoice_count', totals.invoice_count,
    'partially_paid_count', totals.partially_paid_count,
    'aging_buckets', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'bucket', bucket.aging_bucket,
        'amount', bucket.amount::text,
        'invoice_count', bucket.invoice_count,
        'partially_paid_count', bucket.partially_paid_count,
        'evidence_ids', to_jsonb(bucket.invoice_evidence || bucket.payment_evidence)
      ) ORDER BY CASE bucket.aging_bucket
        WHEN 'NOT_DUE' THEN 0 WHEN 'OVERDUE_1_30' THEN 1 WHEN 'OVERDUE_31_60' THEN 2
        WHEN 'OVERDUE_61_90' THEN 3 ELSE 4 END), '[]'::jsonb)
      FROM bucket_totals bucket WHERE bucket.currency = totals.currency
    ),
    'as_of', v_now,
    'status', CASE WHEN (SELECT row_count FROM unresolved) > 0 THEN 'NEEDS_REVIEW' ELSE 'VERIFIED' END,
    'formula_id', 'receivables.invoice-balance-and-due-aging',
    'formula_version', '1.0.0',
    'calculated_at', v_now,
    'warnings', CASE WHEN (SELECT row_count FROM unresolved) > 0
      THEN jsonb_build_array('بعض الذمم المفتوحة بلا تاريخ استحقاق أو برمز عملة غير صالح؛ الإجمالي قد يكون جزئياً.')
      ELSE '[]'::jsonb
    END
  ) ORDER BY totals.currency), '[]'::jsonb)
    INTO v_receivables
  FROM currency_totals totals;

  -- Legacy/manual journals can affect cash accounts without currency attribution.
  -- Do not fold them into a currency total or present source-linked movement as a complete balance.
  SELECT count(*)::integer
    INTO v_unclassified_cash_lines
  FROM public.accounting_journal_lines l
  JOIN public.accounting_journal_entries e
    ON e.id = l.journal_entry_id AND e.organization_id = l.organization_id
  WHERE l.organization_id = v_org
    AND e.status = 'posted'
    AND e.entry_date BETWEEN v_from AND v_to
    AND e.source_type IN ('manual','adjustment','onyx_import')
    AND l.account_id IN (
      SELECT m.accounting_account_id
      FROM public.purchase_supplier_payment_settlement_accounts m
      WHERE m.organization_id = v_org
      UNION
      SELECT sp.settlement_account_id
      FROM public.accounting_source_postings sp
      WHERE sp.organization_id = v_org AND sp.source_type = 'cash_expense'
      UNION
      SELECT sp.settlement_account_id
      FROM public.accounting_customer_source_postings sp
      WHERE sp.organization_id = v_org AND sp.source_type = 'customer_payment'
      UNION
      SELECT d.settlement_account_id
      FROM public.purchase_supplier_payment_accounting_drafts d
      WHERE d.organization_id = v_org
    );

  SELECT count(*)::integer
    INTO v_unlinked_cash_expenses
  FROM public.cash_expenses ce
  WHERE ce.organization_id = v_org
    AND ce.status = 'posted'
    AND ce.expense_date BETWEEN v_from AND v_to
    AND NOT EXISTS (
      SELECT 1
      FROM public.accounting_source_postings sp
      JOIN public.accounting_journal_entries e
        ON e.id = sp.journal_entry_id AND e.organization_id = sp.organization_id
      WHERE sp.organization_id = ce.organization_id
        AND sp.source_type = 'cash_expense'
        AND sp.source_id = ce.id
        AND sp.posting_kind = 'original'
        AND e.status = 'posted'
    );

  SELECT count(*)::integer
    INTO v_unlinked_customer_payments
  FROM public.customer_payments p
  JOIN public.customer_invoices i
    ON i.id = p.invoice_id AND i.organization_id = p.organization_id
  WHERE p.organization_id = v_org
    AND p.paid_at <= v_now
    AND p.paid_at::date BETWEEN v_from AND v_to
    AND NOT EXISTS (
      SELECT 1
      FROM public.accounting_customer_source_postings sp
      JOIN public.accounting_journal_entries e
        ON e.id = sp.journal_entry_id AND e.organization_id = sp.organization_id
      WHERE sp.organization_id = p.organization_id
        AND sp.source_type = 'customer_payment'
        AND sp.source_id = p.id
        AND sp.posting_kind = 'original'
        AND e.status = 'posted'
    );

  SELECT count(*)::integer
    INTO v_unresolved_receivables
  FROM public.customer_invoices i
  LEFT JOIN (
    SELECT p.invoice_id, sum(p.amount)::numeric(18,2) AS paid_amount
    FROM public.customer_payments p
    WHERE p.organization_id = v_org AND p.paid_at <= v_now
    GROUP BY p.invoice_id
  ) paid ON paid.invoice_id = i.id
  WHERE i.organization_id = v_org
    AND i.status IN ('issued','partially_paid')
    AND i.issued_at <= v_now
    AND i.total_amount > coalesce(paid.paid_amount,0)
    AND (coalesce(i.currency,'') !~ '^[A-Z]{3}$' OR i.due_at IS NULL);

  IF v_unclassified_cash_lines > 0 OR v_unlinked_cash_expenses > 0 OR v_unlinked_customer_payments > 0 THEN
    v_completeness := 'PARTIAL';
    v_warnings := v_warnings || jsonb_build_array(
      'توجد قيود نقدية أو مدفوعات غير منسوبة إلى مصدر بعملة موثقة؛ تم استبعادها من المجاميع النقدية.'
    );
  END IF;

  IF v_unresolved_receivables > 0 THEN
    v_completeness := 'PARTIAL';
    v_warnings := v_warnings || jsonb_build_array(
      'توجد ذمم مفتوحة بلا تاريخ استحقاق أو برمز عملة غير صالح؛ لم تُسند إلى فئة أعمار أو عملة تقديرية.'
    );
  END IF;

  v_warnings := v_warnings || jsonb_build_array(
    'الأرصدة الدفترية للصندوق/البنك غير متاحة دون رصيد افتتاحي أو كشف/مطابقة مصرفية موثق؛ يعرض المركز آخر عدّ وردية وحركة الفترة منفصلين.',
    'تواريخ استحقاق الموردين الموثقة متاحة عبر سجل أدلة مستقل وجدول التدفقات المستقبلية؛ لا يصنّف هذا التجميع رصيد المورد كمتأخر.',
    'الحركات الفعلية تقتصر على تحصيلات العملاء وتسويات الموردين والمصروفات ذات القيود المصدرية المرحلة؛ لا تُجمع العملات المختلفة.'
  );

  RETURN jsonb_build_object(
    'status', CASE WHEN v_completeness = 'COMPLETE' THEN 'OK' ELSE 'PARTIAL' END,
    'authorization', jsonb_build_object(
      'tenantScope', 'SERVER_RESOLVED_AUTHENTICATED_TENANT',
      'effectiveRole', v_role
    ),
    'asOf', v_now,
    'period', jsonb_build_object('from',v_from::text,'to',v_to::text),
    'sideEffects', 'NONE',
    'cashCounts', v_cash_counts,
    'cashAccounts', v_cash_accounts,
    'cashMovements', v_cash_movements,
    'supplierPayables', v_supplier_payables,
    'receivables', v_receivables,
    'cashMovementCoverage', jsonb_build_object(
      'status', CASE WHEN v_completeness = 'COMPLETE' THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
      'completeness', v_completeness,
      'unclassifiedPostedCashJournalLines', v_unclassified_cash_lines,
      'unlinkedCashExpenses', v_unlinked_cash_expenses,
      'unlinkedCustomerPayments', v_unlinked_customer_payments,
      'formulaId', 'cash.source-linked-movements',
      'formulaVersion', '1.0.0',
      'calculatedAt', v_now,
      'warnings', v_warnings
    ),
    'warnings', v_warnings
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_executive_liquidity_workspace(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_executive_liquidity_workspace(date,date) TO authenticated;

COMMENT ON FUNCTION public.fetch_executive_liquidity_workspace(date,date) IS
  'Read-only, authenticated tenant-scoped executive finance workspace. Separates shift cash counts, source-linked actual movements, posted supplier payables and invoice receivable aging. Never invents cash/bank balances, supplier due dates or FX.';
