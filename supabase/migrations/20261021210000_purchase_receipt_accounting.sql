-- NASR1-ORIGINAL-SPEC-PURCHASE-RECEIPT-ACCOUNTING-012
-- Link a physically received, fully costed purchase receipt to a balanced GL draft.
-- This does not post the journal, move stock, pay a supplier, or infer tax/FX.

CREATE TABLE public.purchase_receipt_accounting_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
  journal_entry_id uuid NOT NULL,
  source_amount numeric(18,2) NOT NULL CHECK (source_amount > 0 AND source_amount < 10000000000000000),
  source_currency text NOT NULL CHECK (source_currency ~ '^[A-Z]{3}$'),
  inventory_account_id uuid NOT NULL,
  payable_account_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, inventory_account_id)
    REFERENCES public.accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, payable_account_id)
    REFERENCES public.accounting_accounts(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, receipt_id),
  UNIQUE (organization_id, journal_entry_id),
  UNIQUE (organization_id, idempotency_key),
  CHECK (inventory_account_id <> payable_account_id)
);

ALTER TABLE public.purchase_receipt_accounting_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_receipt_accounting_finance_read_same_org
  ON public.purchase_receipt_accounting_postings
  FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id
      FROM public.profiles p
      WHERE p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.is_active = true
    )
  );
GRANT SELECT ON public.purchase_receipt_accounting_postings TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.purchase_receipt_accounting_postings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.purchase_receipt_accounting_postings TO service_role;

CREATE OR REPLACE FUNCTION public.fetch_purchase_receipt_accounting_queue(
  p_purchase_order_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_accounts jsonb;
  v_receipts jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile AND p.auth_user_id = auth.uid() AND p.is_active = true;

  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'finance permission required for purchase receipt accounting';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'purchase receipt accounting limit must be between 1 and 200';
  END IF;
  IF p_purchase_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_orders po WHERE po.id = p_purchase_order_id AND po.organization_id = v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'purchase order is not available in this organization';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', a.id,
    'code', a.code,
    'name', a.name,
    'account_type', a.account_type,
    'is_active', a.is_active
  ) ORDER BY a.code), '[]'::jsonb)
  INTO v_accounts
  FROM public.accounting_accounts a
  WHERE a.organization_id = v_org
    AND a.is_active
    AND a.account_type IN ('asset', 'liability');

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.received_at DESC), '[]'::jsonb)
  INTO v_receipts
  FROM (
    SELECT
      r.id AS receipt_id,
      r.receipt_number,
      r.purchase_order_id,
      po.purchase_order_number,
      s.name AS supplier_name,
      w.name AS warehouse_name,
      r.received_at,
      r.received_cost,
      o.currency,
      (
        COALESCE(costs.line_count, 0) > 0
        AND COALESCE(costs.costs_complete, false)
        AND costs.line_total = r.received_cost
        AND r.received_cost IS NOT NULL
      ) AS costs_complete,
      posting.journal_entry_id,
      posting.inventory_account_id,
      posting.payable_account_id,
      journal.status AS journal_status,
      journal.entry_number::text AS journal_entry_number
    FROM public.purchase_receipts r
    JOIN public.purchase_orders po
      ON po.id = r.purchase_order_id AND po.organization_id = r.organization_id
    JOIN public.suppliers s
      ON s.id = po.supplier_id AND s.organization_id = po.organization_id
    JOIN public.warehouses w
      ON w.id = r.warehouse_id AND w.organization_id = r.organization_id
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN LATERAL (
      SELECT
        pg_catalog.count(*)::integer AS line_count,
        pg_catalog.bool_and(i.unit_cost IS NOT NULL AND i.line_total IS NOT NULL) AS costs_complete,
        pg_catalog.sum(i.line_total)::numeric(18,2) AS line_total
      FROM public.purchase_receipt_items i
      WHERE i.organization_id = r.organization_id AND i.receipt_id = r.id
    ) costs ON true
    LEFT JOIN public.purchase_receipt_accounting_postings posting
      ON posting.organization_id = r.organization_id AND posting.receipt_id = r.id
    LEFT JOIN public.accounting_journal_entries journal
      ON journal.organization_id = posting.organization_id AND journal.id = posting.journal_entry_id
    WHERE r.organization_id = v_org
      AND (p_purchase_order_id IS NULL OR r.purchase_order_id = p_purchase_order_id)
    ORDER BY r.received_at DESC
    LIMIT p_limit
  ) q;

  RETURN pg_catalog.jsonb_build_object('accounts', v_accounts, 'receipts', v_receipts);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_receipt_accounting_queue(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_receipt_accounting_queue(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_purchase_receipt_accounting_draft(
  p_receipt_id uuid,
  p_inventory_account_id uuid,
  p_payable_account_id uuid,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_receipt public.purchase_receipts%ROWTYPE;
  v_supplier_name text;
  v_currency text;
  v_line_count integer;
  v_costs_complete boolean;
  v_line_total numeric(18,2);
  v_fingerprint text;
  v_existing public.purchase_receipt_accounting_postings%ROWTYPE;
  v_existing_journal public.accounting_journal_entries%ROWTYPE;
  v_journal public.accounting_journal_entries%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile AND p.auth_user_id = auth.uid() AND p.is_active = true;

  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'finance permission required to prepare a purchase receipt journal';
  END IF;
  IF p_receipt_id IS NULL OR p_inventory_account_id IS NULL OR p_payable_account_id IS NULL OR p_idempotency_key IS NULL
     OR p_inventory_account_id = p_payable_account_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'receipt, distinct accounts and idempotency key are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':purchase-receipt-accounting:' || p_receipt_id::text, 0)
  );

  SELECT r.* INTO v_receipt
  FROM public.purchase_receipts r
  WHERE r.id = p_receipt_id AND r.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'purchase receipt is not available in this organization';
  END IF;

  SELECT o.currency, s.name INTO v_currency, v_supplier_name
  FROM public.purchase_receipts r
  JOIN public.purchase_orders po ON po.id = r.purchase_order_id AND po.organization_id = r.organization_id
  JOIN public.suppliers s ON s.id = po.supplier_id AND s.organization_id = po.organization_id
  JOIN public.organizations o ON o.id = r.organization_id
  WHERE r.id = v_receipt.id AND r.organization_id = v_org;

  IF v_currency <> 'YER' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'purchase receipt journal supports YER only until an explicit multi-currency ledger policy exists';
  END IF;
  IF v_receipt.received_cost IS NULL OR v_receipt.received_cost <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'purchase receipt has no positive source-backed received cost';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    COALESCE(pg_catalog.bool_and(i.unit_cost IS NOT NULL AND i.line_total IS NOT NULL), false),
    pg_catalog.sum(i.line_total)::numeric(18,2)
  INTO v_line_count, v_costs_complete, v_line_total
  FROM public.purchase_receipt_items i
  WHERE i.organization_id = v_org AND i.receipt_id = v_receipt.id;

  IF v_line_count < 1 OR NOT v_costs_complete OR v_line_total IS DISTINCT FROM v_receipt.received_cost THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'purchase receipt costs are missing or do not reconcile to source lines';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounting_accounts a
    WHERE a.id = p_inventory_account_id AND a.organization_id = v_org
      AND a.is_active AND a.account_type = 'asset'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'inventory debit account must be an active asset account in this organization';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounting_accounts a
    WHERE a.id = p_payable_account_id AND a.organization_id = v_org
      AND a.is_active AND a.account_type = 'liability'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'supplier payable credit account must be an active liability account in this organization';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'source_type', 'purchase_receipt',
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'amount', v_receipt.received_cost::text,
    'currency', v_currency,
    'inventory_account_id', p_inventory_account_id,
    'payable_account_id', p_payable_account_id
  )::text);

  SELECT posting.* INTO v_existing
  FROM public.purchase_receipt_accounting_postings posting
  WHERE posting.organization_id = v_org AND posting.receipt_id = v_receipt.id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'purchase receipt already has an accounting draft with a different account mapping';
    END IF;
    SELECT e.* INTO v_existing_journal
    FROM public.accounting_journal_entries e
    WHERE e.organization_id = v_org AND e.id = v_existing.journal_entry_id;
    RETURN pg_catalog.jsonb_build_object(
      'receipt_id', v_receipt.id,
      'receipt_number', v_receipt.receipt_number,
      'journal_entry_id', v_existing_journal.id,
      'journal_entry_number', v_existing_journal.entry_number::text,
      'status', v_existing_journal.status,
      'source_amount', v_existing.source_amount,
      'source_currency', v_existing.source_currency,
      'replayed', true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accounting_journal_entries e
    WHERE e.organization_id = v_org AND e.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'journal idempotency key has already been used by another entry';
  END IF;

  INSERT INTO public.accounting_journal_entries(
    organization_id, entry_date, description, source_type, source_reference, status,
    idempotency_key, payload_fingerprint, created_by_profile_id
  ) VALUES (
    v_org,
    v_receipt.received_at::date,
    pg_catalog.left('استلام شراء ' || v_receipt.receipt_number || ' - ' || v_supplier_name, 230),
    'purchase_receipt',
    v_receipt.receipt_number,
    'draft',
    p_idempotency_key,
    v_fingerprint,
    v_profile
  ) RETURNING * INTO v_journal;

  INSERT INTO public.accounting_journal_lines(
    organization_id, journal_entry_id, line_number, account_id, debit, credit, memo
  ) VALUES
    (v_org, v_journal.id, 1, p_inventory_account_id, v_receipt.received_cost, 0, 'قيمة المخزون المستلم حسب إيصال المصدر'),
    (v_org, v_journal.id, 2, p_payable_account_id, 0, v_receipt.received_cost, 'استحقاق المورد؛ دون إثبات سداد نقدي');

  INSERT INTO public.purchase_receipt_accounting_postings(
    organization_id, receipt_id, journal_entry_id, source_amount, source_currency,
    inventory_account_id, payable_account_id, idempotency_key, payload_fingerprint, created_by_profile_id
  ) VALUES (
    v_org, v_receipt.id, v_journal.id, v_receipt.received_cost, v_currency,
    p_inventory_account_id, p_payable_account_id, p_idempotency_key, v_fingerprint, v_profile
  );

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_profile, 'accounting.purchase_receipt_journal_draft_created',
    'purchase_receipt', v_receipt.id, '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'receipt_number', v_receipt.receipt_number,
      'journal_entry_id', v_journal.id,
      'journal_entry_number', v_journal.entry_number::text,
      'source_amount', v_receipt.received_cost::text,
      'source_currency', v_currency,
      'supplier_name', v_supplier_name,
      'inventory_account_id', p_inventory_account_id,
      'payable_account_id', p_payable_account_id,
      'status', 'draft'
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'journal_entry_id', v_journal.id,
    'journal_entry_number', v_journal.entry_number::text,
    'status', 'draft',
    'source_amount', v_receipt.received_cost,
    'source_currency', v_currency,
    'replayed', false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.prepare_purchase_receipt_accounting_draft(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_purchase_receipt_accounting_draft(uuid, uuid, uuid, uuid) TO authenticated;
