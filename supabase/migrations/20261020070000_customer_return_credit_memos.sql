-- NASR1-ORIGINAL-SPEC-RETURNS-CREDIT-MEMO-LEDGER-003
-- A credit memo may only be prepared after a fully received return is tied to the original invoice line.
-- Amounts are derived from immutable invoice snapshots; an ordinary journal draft is linked to the source and guarded at posting.
-- No cash refund is recorded by a credit memo. Foreign exchange is deliberately unsupported until a documented FX policy exists.

ALTER TABLE public.customer_invoice_items
  ADD COLUMN IF NOT EXISTS order_item_id uuid;

DO $link_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid='public.customer_invoice_items'::regclass
       AND conname='customer_invoice_items_order_item_fk'
  ) THEN
    ALTER TABLE public.customer_invoice_items
      ADD CONSTRAINT customer_invoice_items_order_item_fk
      FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE RESTRICT;
  END IF;
END;
$link_fk$;

-- Map existing invoice snapshots only when both sides have exactly one full-key match.
-- Ambiguous historical duplicates are left unresolved and cannot be credited automatically.
WITH candidates AS (
  SELECT cii.id AS invoice_item_id, oi.id AS order_item_id,
         pg_catalog.count(*) OVER (PARTITION BY cii.id) AS invoice_item_match_count,
         pg_catalog.count(*) OVER (PARTITION BY oi.id) AS order_item_match_count
    FROM public.customer_invoice_items cii
    JOIN public.customer_invoices ci
      ON ci.id=cii.invoice_id AND ci.organization_id=cii.organization_id
    JOIN public.order_items oi
      ON oi.order_id=ci.order_id
     AND oi.product_id IS NOT DISTINCT FROM cii.product_id
     AND oi.item_code IS NOT DISTINCT FROM cii.item_code
     AND oi.product_name_snapshot=cii.description
     AND oi.unit_snapshot IS NOT DISTINCT FROM cii.unit
     AND oi.quantity=cii.quantity
     AND oi.line_total=cii.line_total
   WHERE cii.order_item_id IS NULL
), unique_matches AS (
  SELECT invoice_item_id,order_item_id
    FROM candidates
   WHERE invoice_item_match_count=1 AND order_item_match_count=1
)
UPDATE public.customer_invoice_items cii
   SET order_item_id=u.order_item_id
  FROM unique_matches u
 WHERE cii.id=u.invoice_item_id AND cii.order_item_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_invoice_items_org_invoice_order_line_uq
  ON public.customer_invoice_items(organization_id,invoice_id,order_item_id)
  WHERE order_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_customer_invoice_item_order_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invoice public.customer_invoices%ROWTYPE;
  v_order_item public.order_items%ROWTYPE;
BEGIN
  IF NEW.order_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ci.* INTO v_invoice
    FROM public.customer_invoices ci
   WHERE ci.id=NEW.invoice_id AND ci.organization_id=NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='invoice line must reference an invoice in the same organization';
  END IF;

  SELECT oi.* INTO v_order_item
    FROM public.order_items oi
    JOIN public.orders o ON o.id=oi.order_id
   WHERE oi.id=NEW.order_item_id AND o.organization_id=NEW.organization_id;
  IF NOT FOUND OR v_order_item.order_id IS DISTINCT FROM v_invoice.order_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='invoice item order-line mapping does not match the invoice source';
  END IF;

  IF NEW.product_id IS DISTINCT FROM v_order_item.product_id
     OR NEW.item_code IS DISTINCT FROM v_order_item.item_code
     OR NEW.description IS DISTINCT FROM v_order_item.product_name_snapshot
     OR NEW.unit IS DISTINCT FROM v_order_item.unit_snapshot
     OR NEW.quantity IS DISTINCT FROM v_order_item.quantity
     OR NEW.unit_price IS DISTINCT FROM v_order_item.unit_price_snapshot
     OR NEW.line_total IS DISTINCT FROM v_order_item.line_total THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice line snapshot differs from the linked source order line';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_customer_invoice_item_order_link() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS customer_invoice_item_order_link_guard ON public.customer_invoice_items;
CREATE TRIGGER customer_invoice_item_order_link_guard
  BEFORE INSERT OR UPDATE OF organization_id,invoice_id,order_item_id,product_id,item_code,description,unit,quantity,unit_price,line_total
  ON public.customer_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_invoice_item_order_link();

-- Preserve the existing invoice-side balance delta and promotion snapshots while adding the immutable source-line link.
CREATE OR REPLACE FUNCTION public.issue_invoice_for_confirmed_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_invoice uuid;
  v_subtotal numeric(15,2);
BEGIN
  IF NEW.status <> 'confirmed' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff confirmation required to issue invoice';
  END IF;

  SELECT COALESCE(SUM(oi.line_total),0)::numeric(15,2)
    INTO v_subtotal
    FROM public.order_items oi
   WHERE oi.order_id=NEW.id;

  INSERT INTO public.customer_invoices(
    organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,
    subtotal,tax_amount,total_amount
  )
  VALUES (
    NEW.organization_id,NEW.customer_id,NEW.id,
    'INV-' || pg_catalog.to_char(pg_catalog.now(),'YYMMDD') || '-' ||
      pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
    'issued',pg_catalog.now(),'YER',v_subtotal,0,v_subtotal
  )
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_invoice;

  IF v_invoice IS NOT NULL THEN
    INSERT INTO public.customer_invoice_items(
      organization_id,invoice_id,order_item_id,product_id,item_code,description,unit,quantity,unit_price,
      discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,
      promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total
    )
    SELECT NEW.organization_id,v_invoice,oi.id,oi.product_id,oi.item_code,oi.product_name_snapshot,
           oi.unit_snapshot,oi.quantity,oi.unit_price_snapshot,oi.discount_snapshot,
           oi.promotion_discount_per_unit_snapshot,oi.promotion_id_snapshot,oi.promotion_title_snapshot,
           oi.promotion_discount_type_snapshot,oi.promotion_discount_value_snapshot,oi.line_total
      FROM public.order_items oi
     WHERE oi.order_id=NEW.id;

    UPDATE public.customers
       SET current_balance=COALESCE(current_balance,0)+v_subtotal,
           updated_at=pg_catalog.now()
     WHERE id=NEW.customer_id AND organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.issue_invoice_for_confirmed_order() FROM PUBLIC,anon,authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS customer_invoices_org_id_uq
  ON public.customer_invoices(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_id_uq
  ON public.customers(organization_id,id);

CREATE TABLE IF NOT EXISTS public.customer_return_credit_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  return_request_id uuid NOT NULL REFERENCES public.customer_return_requests(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.customer_invoices(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  memo_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_amount numeric(15,2) NOT NULL CHECK (subtotal_amount > 0),
  tax_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount numeric(15,2) NOT NULL CHECK (total_amount > 0),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  posted_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  voided_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  voided_at timestamptz,
  void_reason text,
  CONSTRAINT customer_return_credit_memos_org_id_unique UNIQUE (organization_id,id),
  CONSTRAINT customer_return_credit_memos_org_number_unique UNIQUE (organization_id,memo_number),
  CONSTRAINT customer_return_credit_memos_org_key_unique UNIQUE (organization_id,idempotency_key),
  CONSTRAINT customer_return_credit_memos_org_request_fk
    FOREIGN KEY (organization_id,return_request_id)
    REFERENCES public.customer_return_requests(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT customer_return_credit_memos_org_invoice_fk
    FOREIGN KEY (organization_id,invoice_id)
    REFERENCES public.customer_invoices(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT customer_return_credit_memos_org_customer_fk
    FOREIGN KEY (organization_id,customer_id)
    REFERENCES public.customers(organization_id,id) ON DELETE RESTRICT,
  CHECK (
    (status='draft' AND posted_by_profile_id IS NULL AND posted_at IS NULL
      AND voided_by_profile_id IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR
    (status='posted' AND posted_by_profile_id IS NOT NULL AND posted_at IS NOT NULL
      AND voided_by_profile_id IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR
    (status='void' AND posted_by_profile_id IS NULL AND posted_at IS NULL
      AND voided_by_profile_id IS NOT NULL AND voided_at IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(COALESCE(void_reason,''))) BETWEEN 5 AND 500)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_return_credit_memos_one_active_per_request_uq
  ON public.customer_return_credit_memos(organization_id,return_request_id)
  WHERE status IN ('draft','posted');
CREATE INDEX IF NOT EXISTS customer_return_credit_memos_invoice_status_idx
  ON public.customer_return_credit_memos(organization_id,invoice_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_return_credit_memo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  credit_memo_id uuid NOT NULL,
  return_request_item_id uuid NOT NULL REFERENCES public.customer_return_request_items(id) ON DELETE RESTRICT,
  invoice_item_id uuid NOT NULL REFERENCES public.customer_invoice_items(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  item_code_snapshot text,
  description_snapshot text NOT NULL,
  unit_snapshot text,
  returned_quantity numeric(15,3) NOT NULL CHECK (returned_quantity > 0),
  credited_subtotal numeric(15,2) NOT NULL CHECK (credited_subtotal >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customer_return_credit_memo_items_org_memo_fk
    FOREIGN KEY (organization_id,credit_memo_id)
    REFERENCES public.customer_return_credit_memos(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT customer_return_credit_memo_items_memo_request_line_uq
    UNIQUE (organization_id,credit_memo_id,return_request_item_id),
  CONSTRAINT customer_return_credit_memo_items_memo_invoice_line_uq
    UNIQUE (organization_id,credit_memo_id,invoice_item_id)
);
CREATE INDEX IF NOT EXISTS customer_return_credit_memo_items_invoice_line_idx
  ON public.customer_return_credit_memo_items(organization_id,invoice_item_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.accounting_return_credit_memo_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  credit_memo_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  source_amount numeric(15,2) NOT NULL CHECK (source_amount > 0),
  source_currency text NOT NULL CHECK (source_currency ~ '^[A-Z]{3}$'),
  receivable_account_id uuid NOT NULL,
  revenue_account_id uuid NOT NULL,
  tax_account_id uuid,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT accounting_return_credit_memo_postings_org_memo_fk
    FOREIGN KEY (organization_id,credit_memo_id)
    REFERENCES public.customer_return_credit_memos(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT accounting_return_credit_memo_postings_org_entry_fk
    FOREIGN KEY (organization_id,journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT accounting_return_credit_memo_postings_org_receivable_fk
    FOREIGN KEY (organization_id,receivable_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT accounting_return_credit_memo_postings_org_revenue_fk
    FOREIGN KEY (organization_id,revenue_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT accounting_return_credit_memo_postings_org_tax_fk
    FOREIGN KEY (organization_id,tax_account_id)
    REFERENCES public.accounting_accounts(organization_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,credit_memo_id),
  UNIQUE (organization_id,journal_entry_id),
  UNIQUE (organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS accounting_return_credit_memo_postings_created_idx
  ON public.accounting_return_credit_memo_postings(organization_id,created_at DESC);

ALTER TABLE public.customer_return_credit_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_return_credit_memo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_return_credit_memo_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_return_credit_memos FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.customer_return_credit_memo_items FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.accounting_return_credit_memo_postings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.customer_return_credit_memos TO authenticated;
GRANT SELECT ON TABLE public.customer_return_credit_memo_items TO authenticated;
GRANT SELECT ON TABLE public.accounting_return_credit_memo_postings TO authenticated;
GRANT ALL ON TABLE public.customer_return_credit_memos TO service_role;
GRANT ALL ON TABLE public.customer_return_credit_memo_items TO service_role;
GRANT ALL ON TABLE public.accounting_return_credit_memo_postings TO service_role;

DROP POLICY IF EXISTS customer_return_credit_memos_finance_read ON public.customer_return_credit_memos;
CREATE POLICY customer_return_credit_memos_finance_read ON public.customer_return_credit_memos
  FOR SELECT TO authenticated USING (
    public.can_manage_finance() AND organization_id=public.current_organization_id()
  );
DROP POLICY IF EXISTS customer_return_credit_memo_items_finance_read ON public.customer_return_credit_memo_items;
CREATE POLICY customer_return_credit_memo_items_finance_read ON public.customer_return_credit_memo_items
  FOR SELECT TO authenticated USING (
    public.can_manage_finance() AND organization_id=public.current_organization_id()
  );
DROP POLICY IF EXISTS accounting_return_credit_memo_postings_finance_read ON public.accounting_return_credit_memo_postings;
CREATE POLICY accounting_return_credit_memo_postings_finance_read ON public.accounting_return_credit_memo_postings
  FOR SELECT TO authenticated USING (
    public.can_manage_finance() AND organization_id=public.current_organization_id()
  );

-- The dedicated link table and guard are separate from invoice/payment posting history.
-- Existing customer-source guards intentionally ignore this new source type.
ALTER TABLE public.accounting_journal_entries
  DROP CONSTRAINT IF EXISTS accounting_journal_entries_source_type_check;
ALTER TABLE public.accounting_journal_entries
  ADD CONSTRAINT accounting_journal_entries_source_type_check
  CHECK (source_type IN ('manual','adjustment','invoice','payment','cash_expense','purchase_receipt','onyx_import','customer_return_credit_memo'));

CREATE OR REPLACE FUNCTION public.fetch_customer_return_credit_memo_queue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to review customer return credits';
  END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo queue limit must be between 1 and 100';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'accounts',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',a.id,'code',a.code,'name',a.name,'account_type',a.account_type
      ) ORDER BY a.account_type,a.code,a.id)
      FROM public.accounting_accounts a
      WHERE a.organization_id=v_org AND a.is_active
        AND a.account_type IN ('asset','revenue','liability')
    ),'[]'::jsonb),
    'requests',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'request_id',r.id,
        'request_number',r.request_number,
        'order_id',r.order_id,
        'order_number',o.order_number,
        'customer_id',r.customer_id,
        'customer_name',COALESCE(NULLIF(pg_catalog.btrim(c.business_name),''),NULLIF(pg_catalog.btrim(c.contact_name),''),c.id::text),
        'created_at',r.created_at,
        'invoice_id',i.id,
        'invoice_number',i.invoice_number,
        'currency',i.currency,
        'invoice_subtotal',i.subtotal,
        'invoice_tax_amount',i.tax_amount,
        'invoice_total_amount',i.total_amount,
        'invoice_status',i.status,
        'invoice_totals_reconcile',COALESCE(i.subtotal+i.tax_amount=i.total_amount,false),
        'mapping_ready',COALESCE(lines.mapping_ready,false)
          AND i.id IS NOT NULL AND i.status<>'void' AND i.currency='YER'
          AND i.subtotal>=0 AND i.tax_amount>=0 AND i.total_amount>0
          AND pg_catalog.round(i.subtotal+i.tax_amount,2)=i.total_amount,
        'items',COALESCE(lines.items,'[]'::jsonb),
        'credit_memo',memo.data
      ) ORDER BY r.created_at,r.id)
      FROM (
        SELECT rr.*
          FROM public.customer_return_requests rr
         WHERE rr.organization_id=v_org AND rr.status='received'
         ORDER BY rr.created_at DESC,rr.id
         LIMIT p_limit
      ) r
      JOIN public.orders o ON o.id=r.order_id AND o.organization_id=r.organization_id
      JOIN public.customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id
      LEFT JOIN LATERAL (
        SELECT ci.*
          FROM public.customer_invoices ci
         WHERE ci.organization_id=v_org AND ci.order_id=r.order_id AND ci.customer_id=r.customer_id
         ORDER BY ci.issued_at DESC,ci.id DESC
         LIMIT 1
      ) i ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(pg_catalog.bool_and(
            ciitem.id IS NOT NULL
            AND q.received_quantity=ri.requested_quantity
            AND q.received_quantity + COALESCE(credit_history.returned_quantity,0) <= COALESCE(ciitem.quantity,0)
          ),false) AS mapping_ready,
          pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'request_item_id',ri.id,
            'order_item_id',ri.order_item_id,
            'product_id',ri.product_id,
            'item_code',ri.item_code_snapshot,
            'product_name',ri.product_name_snapshot,
            'unit',ri.unit_snapshot,
            'requested_quantity',ri.requested_quantity,
            'received_quantity',q.received_quantity,
            'invoice_item_id',ciitem.id,
            'invoice_item_quantity',ciitem.quantity,
            'invoice_item_line_total',ciitem.line_total,
            'already_credited_quantity',COALESCE(credit_history.returned_quantity,0),
            'remaining_invoice_quantity',GREATEST(COALESCE(ciitem.quantity,0)-COALESCE(credit_history.returned_quantity,0),0)
          ) ORDER BY ri.created_at,ri.id) AS items
        FROM public.customer_return_request_items ri
        LEFT JOIN LATERAL (
          SELECT COALESCE(pg_catalog.sum(rli.received_quantity),0)::numeric(15,3) AS received_quantity
            FROM public.customer_return_receipt_items rli
           WHERE rli.organization_id=v_org AND rli.request_item_id=ri.id
        ) q ON true
        LEFT JOIN public.customer_invoice_items ciitem
          ON ciitem.organization_id=v_org AND ciitem.invoice_id=i.id AND ciitem.order_item_id=ri.order_item_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(pg_catalog.sum(mi.returned_quantity),0)::numeric(15,3) AS returned_quantity
            FROM public.customer_return_credit_memo_items mi
            JOIN public.customer_return_credit_memos m
              ON m.id=mi.credit_memo_id AND m.organization_id=mi.organization_id
           WHERE mi.organization_id=v_org AND mi.invoice_item_id=ciitem.id AND m.status IN ('draft','posted')
        ) credit_history ON true
        WHERE ri.organization_id=v_org AND ri.return_request_id=r.id
      ) lines ON true
      LEFT JOIN LATERAL (
        SELECT pg_catalog.jsonb_build_object(
          'id',m.id,'memo_number',m.memo_number,'status',m.status,
          'currency',m.currency,'subtotal_amount',m.subtotal_amount,
          'tax_amount',m.tax_amount,'total_amount',m.total_amount,
          'journal_entry_id',je.id,'journal_entry_number',je.entry_number::text,
          'journal_status',je.status,
          'receivable_account_id',sp.receivable_account_id,
          'revenue_account_id',sp.revenue_account_id,'tax_account_id',sp.tax_account_id,
          'created_at',m.created_at,'posted_at',m.posted_at
        ) AS data
        FROM public.customer_return_credit_memos m
        JOIN public.accounting_return_credit_memo_postings sp
          ON sp.organization_id=m.organization_id AND sp.credit_memo_id=m.id
        JOIN public.accounting_journal_entries je
          ON je.organization_id=sp.organization_id AND je.id=sp.journal_entry_id
        WHERE m.organization_id=v_org AND m.return_request_id=r.id AND m.status<>'void'
        ORDER BY m.created_at DESC,m.id DESC
        LIMIT 1
      ) memo ON true
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_customer_return_credit_memo(
  p_return_request_id uuid,
  p_receivable_account_id uuid,
  p_revenue_account_id uuid,
  p_tax_account_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_request public.customer_return_requests%ROWTYPE;
  v_invoice public.customer_invoices%ROWTYPE;
  v_existing record;
  v_line record;
  v_item jsonb;
  v_source_lines jsonb:='[]'::jsonb;
  v_final_lines jsonb:='[]'::jsonb;
  v_request_item_id uuid;
  v_invoice_item_id uuid;
  v_order_item_id uuid;
  v_returned_quantity numeric(15,3);
  v_invoice_quantity numeric(15,3);
  v_invoice_line_total numeric(15,2);
  v_prior_quantity numeric(15,3);
  v_prior_subtotal numeric(15,2);
  v_priormemo_subtotal numeric(15,2):=0;
  v_line_subtotal numeric(15,2);
  v_subtotal numeric(15,2):=0;
  v_prior_tax numeric(15,2):=0;
  v_tax numeric(15,2):=0;
  v_total numeric(15,2):=0;
  v_line_count integer:=0;
  v_fingerprint text;
  v_memo_id uuid;
  v_memo_number text;
  v_entry public.accounting_journal_entries%ROWTYPE;
  v_replay_status text;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to prepare customer return credit memos';
  END IF;
  IF p_return_request_id IS NULL OR p_receivable_account_id IS NULL OR p_revenue_account_id IS NULL OR p_idempotency_key IS NULL
     OR p_receivable_account_id=p_revenue_account_id
     OR p_receivable_account_id=p_tax_account_id
     OR p_revenue_account_id=p_tax_account_id THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return request, distinct accounts and idempotency key are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':return-credit-memo:'||p_return_request_id::text,0)
  );
  SELECT rr.* INTO v_request
    FROM public.customer_return_requests rr
   WHERE rr.id=p_return_request_id AND rr.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND OR v_request.status<>'received' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only fully received customer returns can be credited';
  END IF;

  SELECT ci.* INTO v_invoice
    FROM public.customer_invoices ci
   WHERE ci.organization_id=v_org AND ci.order_id=v_request.order_id AND ci.customer_id=v_request.customer_id
   ORDER BY ci.issued_at DESC,ci.id DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR v_invoice.status='void' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='active source invoice for this return could not be resolved';
  END IF;
  IF v_invoice.currency<>'YER' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only YER invoices can be credited until an approved foreign-exchange policy exists';
  END IF;
  IF v_invoice.total_amount<=0 OR v_invoice.subtotal<0 OR v_invoice.tax_amount<0
     OR pg_catalog.round(v_invoice.subtotal+v_invoice.tax_amount,2) IS DISTINCT FROM v_invoice.total_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice subtotal, stored tax and total do not reconcile; manual source review required';
  END IF;
  IF v_invoice.tax_amount>0 AND v_invoice.subtotal<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='taxed invoice has no positive subtotal; manual tax allocation is required';
  END IF;
  IF (v_invoice.tax_amount>0 AND p_tax_account_id IS NULL) OR (v_invoice.tax_amount=0 AND p_tax_account_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='select an active tax liability account only when the source invoice contains tax';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=p_receivable_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='asset') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receivable account must be an active asset account in this organization';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=p_revenue_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='revenue') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='sales-return account must be an active revenue account in this organization';
  END IF;
  IF v_invoice.tax_amount>0 AND NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=p_tax_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='liability') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tax account must be an active liability account in this organization';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customer_invoice_items ci WHERE ci.organization_id=v_org AND ci.invoice_id=v_invoice.id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice has no source lines; manual source review required';
  END IF;
  IF (SELECT COALESCE(pg_catalog.sum(ci.line_total),0)::numeric(15,2)
        FROM public.customer_invoice_items ci WHERE ci.organization_id=v_org AND ci.invoice_id=v_invoice.id)
       IS DISTINCT FROM v_invoice.subtotal THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice line amounts do not reconcile to subtotal; manual source review required';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.customer_return_request_items ri
      LEFT JOIN LATERAL (
        SELECT COALESCE(pg_catalog.sum(rli.received_quantity),0)::numeric(15,3) AS received_quantity
          FROM public.customer_return_receipt_items rli
         WHERE rli.organization_id=v_org AND rli.request_item_id=ri.id
      ) received ON true
     WHERE ri.organization_id=v_org AND ri.return_request_id=v_request.id
       AND received.received_quantity IS DISTINCT FROM ri.requested_quantity
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return request has an unreceived or inconsistent quantity; no credit memo was prepared';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.customer_return_request_items ri
      LEFT JOIN public.customer_invoice_items ci
        ON ci.organization_id=v_org AND ci.invoice_id=v_invoice.id AND ci.order_item_id=ri.order_item_id
     WHERE ri.organization_id=v_org AND ri.return_request_id=v_request.id AND ci.id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='one or more return lines lack an unambiguous invoice-line link; manual source mapping is required';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'request_item_id',ri.id,
    'invoice_item_id',ci.id,
    'order_item_id',ri.order_item_id,
    'returned_quantity',received.received_quantity,
    'invoice_item_quantity',ci.quantity,
    'invoice_item_line_total',ci.line_total,
    'product_id',ci.product_id,
    'item_code',ci.item_code,
    'description',ci.description,
    'unit',ci.unit
  ) ORDER BY ri.created_at,ri.id),'[]'::jsonb)
    INTO v_source_lines
    FROM public.customer_return_request_items ri
    JOIN public.customer_invoice_items ci
      ON ci.organization_id=v_org AND ci.invoice_id=v_invoice.id AND ci.order_item_id=ri.order_item_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(pg_catalog.sum(rli.received_quantity),0)::numeric(15,3) AS received_quantity
        FROM public.customer_return_receipt_items rli
       WHERE rli.organization_id=v_org AND rli.request_item_id=ri.id
    ) received ON true
   WHERE ri.organization_id=v_org AND ri.return_request_id=v_request.id;
  IF pg_catalog.jsonb_array_length(v_source_lines)<1 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return invoice source lines are empty';
  END IF;

  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'source_type','customer_return_credit_memo',
    'organization_id',v_org,'return_request_id',v_request.id,'invoice_id',v_invoice.id,
    'currency',v_invoice.currency,'invoice_subtotal',v_invoice.subtotal::text,
    'invoice_tax_amount',v_invoice.tax_amount::text,'invoice_total_amount',v_invoice.total_amount::text,
    'receivable_account_id',p_receivable_account_id,'revenue_account_id',p_revenue_account_id,
    'tax_account_id',p_tax_account_id,'lines',v_source_lines
  )::text);

  SELECT m.id,m.memo_number,m.status,m.payload_fingerprint,m.subtotal_amount,m.tax_amount,m.total_amount,
         sp.journal_entry_id,je.entry_number,je.status AS journal_status
    INTO v_existing
    FROM public.customer_return_credit_memos m
    JOIN public.accounting_return_credit_memo_postings sp
      ON sp.organization_id=m.organization_id AND sp.credit_memo_id=m.id
    JOIN public.accounting_journal_entries je
      ON je.organization_id=sp.organization_id AND je.id=sp.journal_entry_id
   WHERE m.organization_id=v_org AND m.return_request_id=v_request.id AND m.status IN ('draft','posted')
   ORDER BY m.created_at DESC,m.id DESC
   LIMIT 1
   FOR UPDATE OF m,je;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return request already has a credit memo with a different source payload or account mapping';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'credit_memo_id',v_existing.id,'memo_number',v_existing.memo_number,'status',v_existing.status,
      'journal_entry_id',v_existing.journal_entry_id,'journal_entry_number',v_existing.entry_number::text,
      'journal_status',v_existing.journal_status,'subtotal_amount',v_existing.subtotal_amount::text,
      'tax_amount',v_existing.tax_amount::text,'total_amount',v_existing.total_amount::text,
      'currency',v_invoice.currency,'replayed',true
    );
  END IF;

  IF EXISTS(SELECT 1 FROM public.customer_return_credit_memos m WHERE m.organization_id=v_org AND m.idempotency_key=p_idempotency_key) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo idempotency key has already been used';
  END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_entries je WHERE je.organization_id=v_org AND je.idempotency_key=p_idempotency_key) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used for another entry';
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_source_lines) AS entry(value)
  LOOP
    v_request_item_id:=(v_item->>'request_item_id')::uuid;
    v_invoice_item_id:=(v_item->>'invoice_item_id')::uuid;
    v_order_item_id:=(v_item->>'order_item_id')::uuid;
    v_returned_quantity:=(v_item->>'returned_quantity')::numeric;
    v_invoice_quantity:=(v_item->>'invoice_item_quantity')::numeric;
    v_invoice_line_total:=(v_item->>'invoice_item_line_total')::numeric;

    SELECT COALESCE(pg_catalog.sum(mi.returned_quantity),0)::numeric(15,3),
           COALESCE(pg_catalog.sum(mi.credited_subtotal),0)::numeric(15,2)
      INTO v_prior_quantity,v_prior_subtotal
      FROM public.customer_return_credit_memo_items mi
      JOIN public.customer_return_credit_memos m
        ON m.organization_id=mi.organization_id AND m.id=mi.credit_memo_id
     WHERE mi.organization_id=v_org AND mi.invoice_item_id=v_invoice_item_id
       AND m.status IN ('draft','posted');
    IF v_returned_quantity<=0 OR v_invoice_quantity<=0
       OR v_returned_quantity+v_prior_quantity>v_invoice_quantity THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credited return quantity exceeds the remaining invoice line quantity';
    END IF;

    v_line_subtotal:=LEAST(
      pg_catalog.round(v_invoice_line_total*v_returned_quantity/v_invoice_quantity,2),
      GREATEST(v_invoice_line_total-v_prior_subtotal,0)
    );
    v_subtotal:=v_subtotal+v_line_subtotal;
    v_final_lines:=v_final_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'request_item_id',v_request_item_id,'invoice_item_id',v_invoice_item_id,'order_item_id',v_order_item_id,
      'returned_quantity',v_returned_quantity,'credited_subtotal',v_line_subtotal,
      'product_id',v_item->'product_id','item_code',v_item->'item_code',
      'description',v_item->'description','unit',v_item->'unit'
    ));
    v_line_count:=v_line_count+1;
  END LOOP;
  v_subtotal:=v_subtotal::numeric(15,2);
  SELECT COALESCE(pg_catalog.sum(m.tax_amount),0)::numeric(15,2)
    INTO v_prior_tax
    FROM public.customer_return_credit_memos m
   WHERE m.organization_id=v_org AND m.invoice_id=v_invoice.id AND m.status IN ('draft','posted');
  IF v_invoice.tax_amount>0 THEN
    v_tax:=LEAST(
      pg_catalog.round(v_invoice.tax_amount*v_subtotal/v_invoice.subtotal,2),
      GREATEST(v_invoice.tax_amount-v_prior_tax,0)
    );
  END IF;
  v_total:=(v_subtotal+v_tax)::numeric(15,2);
  SELECT COALESCE(pg_catalog.sum(m.subtotal_amount),0)::numeric(15,2)
    INTO v_priormemo_subtotal
    FROM public.customer_return_credit_memos m
   WHERE m.organization_id=v_org AND m.invoice_id=v_invoice.id AND m.status IN ('draft','posted');
  IF v_subtotal<=0 OR v_total<=0 OR v_subtotal+v_priormemo_subtotal>v_invoice.subtotal THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return does not produce a positive and unreconciled source credit; manual review required';
  END IF;

  v_memo_id:=gen_random_uuid();
  v_memo_number:='CRM-'||pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD')||'-'||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_memo_id::text,'-',''),1,8));
  INSERT INTO public.customer_return_credit_memos(
    id,organization_id,return_request_id,invoice_id,customer_id,memo_number,status,currency,
    subtotal_amount,tax_amount,total_amount,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_memo_id,v_org,v_request.id,v_invoice.id,v_invoice.customer_id,v_memo_number,'draft',v_invoice.currency,
    v_subtotal,v_tax,v_total,p_idempotency_key,v_fingerprint,v_actor
  );

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_final_lines) AS entry(value)
  LOOP
    INSERT INTO public.customer_return_credit_memo_items(
      organization_id,credit_memo_id,return_request_item_id,invoice_item_id,order_item_id,product_id,
      item_code_snapshot,description_snapshot,unit_snapshot,returned_quantity,credited_subtotal
    ) VALUES (
      v_org,v_memo_id,(v_item->>'request_item_id')::uuid,(v_item->>'invoice_item_id')::uuid,
      (v_item->>'order_item_id')::uuid,
      NULLIF(v_item->>'product_id','null')::uuid,
      NULLIF(v_item->>'item_code','null'),COALESCE(v_item->>'description',''),NULLIF(v_item->>'unit','null'),
      (v_item->>'returned_quantity')::numeric,(v_item->>'credited_subtotal')::numeric
    );
  END LOOP;

  INSERT INTO public.accounting_journal_entries(
    organization_id,entry_date,description,source_type,source_reference,status,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,(pg_catalog.now() AT TIME ZONE 'UTC')::date,'إشعار دائن لمرتجع '||v_memo_number,
    'customer_return_credit_memo',v_memo_id::text,'draft',p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_entry;

  INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
  VALUES(v_org,v_entry.id,1,p_revenue_account_id,v_subtotal,0,'تخفيض إيراد المرتجع '||v_memo_number);
  IF v_tax>0 THEN
    INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
    VALUES(v_org,v_entry.id,2,p_tax_account_id,v_tax,0,'تخفيض الضريبة المستحقة للمرتجع '||v_memo_number);
    INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
    VALUES(v_org,v_entry.id,3,p_receivable_account_id,0,v_total,'تخفيض ذمم العميل '||v_memo_number);
  ELSE
    INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
    VALUES(v_org,v_entry.id,2,p_receivable_account_id,0,v_total,'تخفيض ذمم العميل '||v_memo_number);
  END IF;

  INSERT INTO public.accounting_return_credit_memo_postings(
    organization_id,credit_memo_id,journal_entry_id,source_amount,source_currency,
    receivable_account_id,revenue_account_id,tax_account_id,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,v_memo_id,v_entry.id,v_total,v_invoice.currency,p_receivable_account_id,p_revenue_account_id,
    p_tax_account_id,p_idempotency_key,v_fingerprint,v_actor
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'accounting.customer_return_credit_memo_draft_created','customer_return_credit_memo',v_memo_id,'{}'::jsonb,
    pg_catalog.jsonb_build_object('memo_number',v_memo_number,'request_id',v_request.id,'invoice_id',v_invoice.id,
      'journal_entry_id',v_entry.id,'subtotal_amount',v_subtotal::text,'tax_amount',v_tax::text,
      'total_amount',v_total::text,'currency',v_invoice.currency,'line_count',v_line_count));
  RETURN pg_catalog.jsonb_build_object(
    'credit_memo_id',v_memo_id,'memo_number',v_memo_number,'status','draft',
    'journal_entry_id',v_entry.id,'journal_entry_number',v_entry.entry_number::text,'journal_status',v_entry.status,
    'subtotal_amount',v_subtotal::text,'tax_amount',v_tax::text,'total_amount',v_total::text,
    'currency',v_invoice.currency,'replayed',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_customer_return_credit_memo_draft(p_credit_memo_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
  v_memo public.customer_return_credit_memos%ROWTYPE;
  v_post public.accounting_return_credit_memo_postings%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to void a return credit memo draft';
  END IF;
  IF p_credit_memo_id IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo id and a 5-500 character void reason are required';
  END IF;
  SELECT m.* INTO v_memo FROM public.customer_return_credit_memos m
   WHERE m.id=p_credit_memo_id AND m.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_memo.status<>'draft' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a draft customer return credit memo can be voided';
  END IF;
  SELECT sp.* INTO v_post FROM public.accounting_return_credit_memo_postings sp
   WHERE sp.organization_id=v_org AND sp.credit_memo_id=v_memo.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='linked journal source posting not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_journal_entries je WHERE je.id=v_post.journal_entry_id AND je.organization_id=v_org AND je.status='draft') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='linked journal is not an unposted draft; use an approved reversal for posted accounting';
  END IF;
  UPDATE public.accounting_journal_entries
     SET status='void',voided_by_profile_id=v_actor,voided_at=pg_catalog.now(),void_reason=v_reason,updated_at=pg_catalog.now()
   WHERE id=v_post.journal_entry_id AND organization_id=v_org AND status='draft';
  UPDATE public.customer_return_credit_memos
     SET status='void',voided_by_profile_id=v_actor,voided_at=pg_catalog.now(),void_reason=v_reason
   WHERE id=v_memo.id AND organization_id=v_org AND status='draft';
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'accounting.customer_return_credit_memo_draft_voided','customer_return_credit_memo',v_memo.id,
    pg_catalog.jsonb_build_object('status','draft'),pg_catalog.jsonb_build_object('status','void','reason',v_reason,'journal_entry_id',v_post.journal_entry_id));
  RETURN pg_catalog.jsonb_build_object('credit_memo_id',v_memo.id,'status','void','journal_entry_id',v_post.journal_entry_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.accounting_validate_return_credit_memo_journal_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_post public.accounting_return_credit_memo_postings%ROWTYPE;
  v_memo public.customer_return_credit_memos%ROWTYPE;
  v_invoice public.customer_invoices%ROWTYPE;
  v_line_count integer;
  v_invoice_line_subtotal numeric(15,2);
BEGIN
  IF NEW.status<>'posted' OR OLD.status IS NOT DISTINCT FROM 'posted'
     OR NEW.source_type<>'customer_return_credit_memo' THEN
    RETURN NEW;
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR v_org<>NEW.organization_id OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to post this credit memo journal';
  END IF;

  SELECT sp.* INTO v_post FROM public.accounting_return_credit_memo_postings sp
   WHERE sp.organization_id=NEW.organization_id AND sp.journal_entry_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo journal has no authoritative source link'; END IF;
  SELECT m.* INTO v_memo FROM public.customer_return_credit_memos m
   WHERE m.organization_id=NEW.organization_id AND m.id=v_post.credit_memo_id FOR UPDATE;
  IF NOT FOUND OR v_memo.status<>'draft' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo is not an active draft'; END IF;
  SELECT ci.* INTO v_invoice FROM public.customer_invoices ci
   WHERE ci.organization_id=v_memo.organization_id AND ci.id=v_memo.invoice_id;
  IF NOT FOUND OR v_invoice.status='void' OR v_invoice.currency<>v_memo.currency
     OR v_invoice.total_amount<>v_invoice.subtotal+v_invoice.tax_amount
     OR NEW.source_reference IS DISTINCT FROM v_memo.id::text
     OR v_post.source_amount IS DISTINCT FROM v_memo.total_amount
     OR v_post.source_currency IS DISTINCT FROM v_memo.currency
     OR v_post.payload_fingerprint IS DISTINCT FROM v_memo.payload_fingerprint
     OR NEW.idempotency_key IS DISTINCT FROM v_post.idempotency_key THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo, invoice or source posting no longer reconciles';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customer_return_requests rr
    WHERE rr.id=v_memo.return_request_id AND rr.organization_id=v_memo.organization_id
      AND rr.customer_id=v_memo.customer_id AND rr.order_id=v_invoice.order_id AND rr.status='received') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo return request is no longer fully received';
  END IF;
  SELECT COALESCE(pg_catalog.sum(ci.line_total),0)::numeric(15,2)
    INTO v_invoice_line_subtotal
    FROM public.customer_invoice_items ci
   WHERE ci.organization_id=v_memo.organization_id AND ci.invoice_id=v_invoice.id;
  IF v_invoice_line_subtotal IS DISTINCT FROM v_invoice.subtotal THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source invoice line totals changed after credit memo preparation';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_line_count
    FROM public.accounting_journal_lines jl
   WHERE jl.organization_id=NEW.organization_id AND jl.journal_entry_id=NEW.id;
  IF v_line_count<>(CASE WHEN v_memo.tax_amount>0 THEN 3 ELSE 2 END) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo journal must contain exactly its source-linked revenue, tax and receivable lines';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines jl
    WHERE jl.organization_id=NEW.organization_id AND jl.journal_entry_id=NEW.id AND jl.line_number=1
      AND jl.account_id=v_post.revenue_account_id AND jl.debit=v_memo.subtotal_amount AND jl.credit=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo revenue line does not match its source amount and account';
  END IF;
  IF v_memo.tax_amount>0 AND NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines jl
    WHERE jl.organization_id=NEW.organization_id AND jl.journal_entry_id=NEW.id AND jl.line_number=2
      AND jl.account_id=v_post.tax_account_id AND jl.debit=v_memo.tax_amount AND jl.credit=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo tax line does not match its source amount and liability account';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines jl
    WHERE jl.organization_id=NEW.organization_id AND jl.journal_entry_id=NEW.id
      AND jl.line_number=CASE WHEN v_memo.tax_amount>0 THEN 3 ELSE 2 END
      AND jl.account_id=v_post.receivable_account_id AND jl.debit=0 AND jl.credit=v_memo.total_amount) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo receivable line does not match its source total and account';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=v_post.revenue_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='revenue')
     OR NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=v_post.receivable_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='asset')
     OR (v_memo.tax_amount>0 AND NOT EXISTS(SELECT 1 FROM public.accounting_accounts a WHERE a.id=v_post.tax_account_id AND a.organization_id=v_org AND a.is_active AND a.account_type='liability')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo journal accounts are inactive or do not match the required account types';
  END IF;

  UPDATE public.customer_return_credit_memos
     SET status='posted',posted_by_profile_id=v_actor,posted_at=pg_catalog.now()
   WHERE id=v_memo.id AND organization_id=v_org AND status='draft';
  UPDATE public.customers
     SET current_balance=COALESCE(current_balance,0)-v_memo.total_amount,updated_at=pg_catalog.now()
   WHERE id=v_memo.customer_id AND organization_id=v_org;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'accounting.customer_return_credit_memo_posted','customer_return_credit_memo',v_memo.id,
    pg_catalog.jsonb_build_object('status','draft','total_amount',v_memo.total_amount::text),
    pg_catalog.jsonb_build_object('status','posted','journal_entry_id',NEW.id,'entry_number',NEW.entry_number::text,
      'total_amount',v_memo.total_amount::text,'currency',v_memo.currency));
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.accounting_validate_return_credit_memo_journal_post() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS accounting_return_credit_memo_journal_post_guard ON public.accounting_journal_entries;
CREATE TRIGGER accounting_return_credit_memo_journal_post_guard
  BEFORE UPDATE OF status ON public.accounting_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.accounting_validate_return_credit_memo_journal_post();

REVOKE ALL ON FUNCTION public.fetch_customer_return_credit_memo_queue(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.prepare_customer_return_credit_memo(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.void_customer_return_credit_memo_draft(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_customer_return_credit_memo_queue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_customer_return_credit_memo(uuid,uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_customer_return_credit_memo_draft(uuid,text) TO authenticated;

-- Customer statements and staff aging remain ledger-derived: posted credit memos reduce receivables,
-- while a draft memo has no financial effect and is only a reservation against duplicate returns.
CREATE OR REPLACE FUNCTION public.get_customer_account_statement()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid:=public.current_profile_id();
  v_customer uuid;
  v_org uuid;
  v_invoices jsonb;
  v_payments jsonb;
  v_credits jsonb;
  v_summary jsonb;
  v_summary_as_of_utc timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated active customer required for account statement';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active customer organization is required for account statement';
  END IF;
  SELECT c.id INTO v_customer
    FROM public.customers c
   WHERE c.profile_id=v_profile AND c.organization_id=v_org
   ORDER BY c.created_at,c.id LIMIT 1;
  IF v_customer IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer account is not linked to the active profile';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',i.id,'invoice_number',i.invoice_number,'order_id',i.order_id,'customer_id',i.customer_id,
    'status',i.status,'issued_at',i.issued_at,'due_at',i.due_at,'currency',i.currency,
    'subtotal',i.subtotal,'tax_amount',i.tax_amount,'total_amount',i.total_amount,
    'paid_amount',i.paid_amount::text,'credit_memo_amount',i.credit_memo_amount::text,
    'outstanding_amount',(CASE WHEN i.status='void' THEN 0 ELSE GREATEST(i.total_amount-i.paid_amount-i.credit_memo_amount,0) END)::text
  ) ORDER BY i.issued_at DESC),'[]'::jsonb)
  INTO v_invoices
  FROM (
    SELECT ci.*,
      COALESCE(payments_by_invoice.paid_amount,0)::numeric(15,2) AS paid_amount,
      COALESCE(credits_by_invoice.credited_amount,0)::numeric(15,2) AS credit_memo_amount
    FROM public.customer_invoices ci
    LEFT JOIN (
      SELECT cp.invoice_id,SUM(cp.amount)::numeric(15,2) AS paid_amount
      FROM public.customer_payments cp WHERE cp.organization_id=v_org AND cp.customer_id=v_customer
      GROUP BY cp.invoice_id
    ) payments_by_invoice ON payments_by_invoice.invoice_id=ci.id
    LEFT JOIN (
      SELECT cm.invoice_id,SUM(cm.total_amount)::numeric(15,2) AS credited_amount
      FROM public.customer_return_credit_memos cm
      WHERE cm.organization_id=v_org AND cm.customer_id=v_customer AND cm.status='posted'
      GROUP BY cm.invoice_id
    ) credits_by_invoice ON credits_by_invoice.invoice_id=ci.id
    WHERE ci.organization_id=v_org AND ci.customer_id=v_customer
    ORDER BY ci.issued_at DESC,ci.id
    LIMIT 200
  ) i;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',p.id,'invoice_id',p.invoice_id,'amount',p.amount,'paid_at',p.paid_at
  ) ORDER BY p.paid_at DESC),'[]'::jsonb)
  INTO v_payments
  FROM (
    SELECT cp.* FROM public.customer_payments cp
     WHERE cp.organization_id=v_org AND cp.customer_id=v_customer
     ORDER BY cp.paid_at DESC,cp.id LIMIT 500
  ) p;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',p.id,'memo_number',p.memo_number,'invoice_id',p.invoice_id,'invoice_number',ci.invoice_number,
    'currency',p.currency,'subtotal_amount',p.subtotal_amount,'tax_amount',p.tax_amount,
    'total_amount',p.total_amount,'created_at',p.created_at,'posted_at',p.posted_at
  ) ORDER BY p.posted_at DESC,p.id),'[]'::jsonb)
  INTO v_credits
  FROM (
    SELECT cm.* FROM public.customer_return_credit_memos cm
     WHERE cm.organization_id=v_org AND cm.customer_id=v_customer AND cm.status='posted'
     ORDER BY cm.posted_at DESC,cm.id LIMIT 500
  ) p
  JOIN public.customer_invoices ci ON ci.id=p.invoice_id AND ci.organization_id=p.organization_id;

  WITH payments_by_invoice AS (
    SELECT cp.invoice_id,SUM(cp.amount)::numeric(15,2) AS paid_amount
      FROM public.customer_payments cp WHERE cp.organization_id=v_org AND cp.customer_id=v_customer GROUP BY cp.invoice_id
  ), credits_by_invoice AS (
    SELECT cm.invoice_id,SUM(cm.total_amount)::numeric(15,2) AS credited_amount
      FROM public.customer_return_credit_memos cm
     WHERE cm.organization_id=v_org AND cm.customer_id=v_customer AND cm.status='posted' GROUP BY cm.invoice_id
  ), invoice_balances AS (
    SELECT ci.currency,ci.due_at,ci.total_amount AS invoiced_amount,
      COALESCE(pbi.paid_amount,0) AS paid_amount,COALESCE(cbi.credited_amount,0) AS credited_amount,
      GREATEST(ci.total_amount-COALESCE(pbi.paid_amount,0)-COALESCE(cbi.credited_amount,0),0) AS outstanding_amount
    FROM public.customer_invoices ci
    LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id=ci.id
    LEFT JOIN credits_by_invoice cbi ON cbi.invoice_id=ci.id
    WHERE ci.organization_id=v_org AND ci.customer_id=v_customer AND ci.status<>'void'
  ), summary_by_currency AS (
    SELECT ib.currency,
      COALESCE(SUM(ib.invoiced_amount),0) AS invoiced,
      COALESCE(SUM(ib.paid_amount),0) AS paid,
      COALESCE(SUM(ib.credited_amount),0) AS credited,
      COALESCE(SUM(ib.outstanding_amount),0) AS outstanding,
      COUNT(*) FILTER(WHERE ib.outstanding_amount>0 AND ib.due_at IS NOT NULL AND (ib.due_at AT TIME ZONE 'UTC')::date < (v_summary_as_of_utc AT TIME ZONE 'UTC')::date)::integer AS overdue_invoice_count,
      COALESCE(SUM(ib.outstanding_amount) FILTER(WHERE ib.outstanding_amount>0 AND ib.due_at IS NOT NULL AND (ib.due_at AT TIME ZONE 'UTC')::date < (v_summary_as_of_utc AT TIME ZONE 'UTC')::date),0) AS overdue_outstanding,
      COUNT(*) FILTER(WHERE ib.outstanding_amount>0 AND ib.due_at IS NULL)::integer AS unknown_due_date_invoice_count,
      COALESCE(SUM(ib.outstanding_amount) FILTER(WHERE ib.outstanding_amount>0 AND ib.due_at IS NULL),0) AS unknown_due_date_outstanding
    FROM invoice_balances ib GROUP BY ib.currency
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',s.currency,'invoiced',s.invoiced::text,'paid',s.paid::text,'credited',s.credited::text,
    'outstanding',s.outstanding::text,'overdue_invoice_count',s.overdue_invoice_count,
    'overdue_outstanding',s.overdue_outstanding::text,
    'unknown_due_date_invoice_count',s.unknown_due_date_invoice_count,
    'unknown_due_date_outstanding',s.unknown_due_date_outstanding::text
  ) ORDER BY s.currency),'[]'::jsonb)
  INTO v_summary FROM summary_by_currency s;

  RETURN pg_catalog.jsonb_build_object(
    'invoices',v_invoices,'payments',v_payments,'credits',v_credits,
    'summary_as_of_utc',v_summary_as_of_utc,'summary',v_summary
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_customer_account_statement() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_account_statement() TO authenticated;
COMMENT ON FUNCTION public.get_customer_account_statement() IS
  'Customer statement with posted credit memos included in invoice receivables; draft credit memos have no balance effect.';

CREATE OR REPLACE FUNCTION public.fetch_staff_receivables_aging(p_limit integer DEFAULT 200,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_as_of_utc date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_total_open bigint:=0;
  v_summary jsonb:='[]'::jsonb;
  v_items jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff organization is required'; END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>500 OR p_offset IS NULL OR p_offset<0 OR p_offset>10000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='limit must be 1-500 and offset must be between 0 and 10000000';
  END IF;

  WITH payments_by_invoice AS (
    SELECT cp.invoice_id,pg_catalog.sum(cp.amount)::numeric(15,2) AS paid_amount
      FROM public.customer_payments cp WHERE cp.organization_id=v_org GROUP BY cp.invoice_id
  ), credits_by_invoice AS (
    SELECT cm.invoice_id,pg_catalog.sum(cm.total_amount)::numeric(15,2) AS credited_amount
      FROM public.customer_return_credit_memos cm
     WHERE cm.organization_id=v_org AND cm.status='posted' GROUP BY cm.invoice_id
  ), invoice_balances AS (
    SELECT ci.id,ci.invoice_number,ci.customer_id,
      COALESCE(NULLIF(pg_catalog.btrim(c.business_name),''),NULLIF(pg_catalog.btrim(c.contact_name),''),ci.customer_id::text) AS customer_name,
      ci.issued_at,ci.due_at,COALESCE(NULLIF(pg_catalog.upper(pg_catalog.btrim(ci.currency)),''),'UNSPECIFIED') AS currency,
      ci.total_amount::numeric(15,2) AS total_amount,
      COALESCE(pbi.paid_amount,0)::numeric(15,2) AS paid_amount,
      COALESCE(cbi.credited_amount,0)::numeric(15,2) AS credit_memo_amount,
      GREATEST(ci.total_amount-COALESCE(pbi.paid_amount,0)-COALESCE(cbi.credited_amount,0),0)::numeric(15,2) AS outstanding_amount,
      CASE WHEN ci.due_at IS NULL THEN NULL ELSE (ci.due_at AT TIME ZONE 'UTC')::date END AS due_date_utc
    FROM public.customer_invoices ci
    LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id=ci.id
    LEFT JOIN credits_by_invoice cbi ON cbi.invoice_id=ci.id
    LEFT JOIN public.customers c ON c.id=ci.customer_id AND c.organization_id=ci.organization_id
    WHERE ci.organization_id=v_org AND ci.status<>'void'
  ), aged AS (
    SELECT ib.*,
      CASE WHEN ib.due_date_utc IS NULL THEN NULL WHEN ib.due_date_utc<v_as_of_utc THEN v_as_of_utc-ib.due_date_utc ELSE 0 END AS days_overdue
    FROM invoice_balances ib
  ), bucketed AS (
    SELECT a.*,
      CASE WHEN a.due_date_utc IS NULL THEN 'unknown_due_date'
           WHEN a.days_overdue=0 THEN 'current'
           WHEN a.days_overdue<=30 THEN 'days_1_30'
           WHEN a.days_overdue<=60 THEN 'days_31_60'
           WHEN a.days_overdue<=90 THEN 'days_61_90'
           ELSE 'over_90' END AS aging_bucket
    FROM aged a WHERE a.outstanding_amount>0
  ), summary_by_currency AS (
    SELECT b.currency,
      pg_catalog.count(*)::integer AS open_invoice_count,
      pg_catalog.count(*) FILTER(WHERE b.aging_bucket NOT IN ('current','unknown_due_date'))::integer AS overdue_invoice_count,
      pg_catalog.count(*) FILTER(WHERE b.aging_bucket='unknown_due_date')::integer AS unknown_due_date_count,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER(WHERE b.aging_bucket='current'),0)::numeric(15,2) AS current_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER(WHERE b.aging_bucket='days_1_30'),0)::numeric(15,2) AS days_1_30_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER(WHERE b.aging_bucket='days_31_60'),0)::numeric(15,2) AS days_31_60_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER(WHERE b.aging_bucket='days_61_90'),0)::numeric(15,2) AS days_61_90_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER(WHERE b.aging_bucket='over_90'),0)::numeric(15,2) AS over_90_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER(WHERE b.aging_bucket='unknown_due_date'),0)::numeric(15,2) AS unknown_due_date_amount,
      pg_catalog.sum(b.outstanding_amount)::numeric(15,2) AS total_outstanding_amount
    FROM bucketed b GROUP BY b.currency
  ), page_items AS (
    SELECT * FROM bucketed
     ORDER BY days_overdue DESC NULLS LAST,due_at ASC NULLS LAST,issued_at ASC,id
     LIMIT p_limit OFFSET p_offset
  )
  SELECT
    (SELECT pg_catalog.count(*) FROM bucketed),
    (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'currency',s.currency,'open_invoice_count',s.open_invoice_count,'overdue_invoice_count',s.overdue_invoice_count,
      'unknown_due_date_count',s.unknown_due_date_count,'current_amount',s.current_amount,
      'days_1_30_amount',s.days_1_30_amount,'days_31_60_amount',s.days_31_60_amount,
      'days_61_90_amount',s.days_61_90_amount,'over_90_amount',s.over_90_amount,
      'unknown_due_date_amount',s.unknown_due_date_amount,'total_outstanding_amount',s.total_outstanding_amount
    ) ORDER BY s.currency),'[]'::jsonb) FROM summary_by_currency s),
    (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',p.id,'invoice_number',p.invoice_number,'customer_id',p.customer_id,'customer_name',p.customer_name,
      'issued_at',p.issued_at,'due_at',p.due_at,'currency',p.currency,'total_amount',p.total_amount,
      'paid_amount',p.paid_amount,'credit_memo_amount',p.credit_memo_amount,'outstanding_amount',p.outstanding_amount,
      'days_overdue',p.days_overdue,'aging_bucket',p.aging_bucket
    ) ORDER BY p.days_overdue DESC NULLS LAST,p.due_at ASC NULLS LAST,p.issued_at ASC,p.id),'[]'::jsonb) FROM page_items p)
  INTO v_total_open,v_summary,v_items;

  RETURN pg_catalog.jsonb_build_object(
    'as_of_utc',v_as_of_utc,'limit',p_limit,'offset',p_offset,'total_open_invoices',v_total_open,
    'has_more',p_offset+pg_catalog.jsonb_array_length(v_items)<v_total_open,'summary',v_summary,'items',v_items
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_staff_receivables_aging(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_receivables_aging(integer,integer) TO authenticated;

COMMENT ON TABLE public.customer_return_credit_memos IS
  'Source-linked customer credit memos; only the guarded posting of their balanced journal changes the receivables ledger.';
COMMENT ON TABLE public.accounting_return_credit_memo_postings IS
  'Immutable tenant-scoped link from an inspected customer return and original invoice to a balanced credit memo journal draft/posting.';
COMMENT ON FUNCTION public.prepare_customer_return_credit_memo(uuid,uuid,uuid,uuid,uuid) IS
  'Creates an idempotent YER credit memo and balanced journal draft from a fully received return and unambiguous original invoice lines; posting requires the accounting source guard.';
