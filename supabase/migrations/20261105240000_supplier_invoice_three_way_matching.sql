-- AGH-PROC-SUPPLIER-INVOICE-THREE-WAY-MATCH-001
-- Immutable supplier invoice evidence against one canonical PO and its physical receipt lines.
-- This does not create a second payable or inventory journal: receipt accounting is the liability source.
BEGIN;

-- Explicit tenant-paired parent keys required by the composite foreign keys below.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_supplier_invoice_purchase_order_org_id_uq
  ON public.purchase_orders(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_supplier_invoice_purchase_order_item_org_id_uq
  ON public.purchase_order_items(organization_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_supplier_invoice_receipt_item_org_id_uq
  ON public.purchase_receipt_items(organization_id,id);

CREATE TABLE public.purchase_supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  purchase_order_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_invoice_number text NOT NULL CHECK (char_length(btrim(supplier_invoice_number)) BETWEEN 1 AND 80),
  invoice_date date NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  merchandise_subtotal numeric(18,2) NOT NULL CHECK (merchandise_subtotal > 0 AND merchandise_subtotal < 10000000000000000),
  tax_amount numeric(18,2) NOT NULL CHECK (tax_amount >= 0 AND tax_amount < 10000000000000000),
  invoice_total_amount numeric(18,2) NOT NULL CHECK (invoice_total_amount > 0 AND invoice_total_amount < 10000000000000000),
  expected_merchandise_subtotal numeric(18,2) NOT NULL CHECK (expected_merchandise_subtotal >= 0 AND expected_merchandise_subtotal < 10000000000000000),
  merchandise_variance_amount numeric(18,2) NOT NULL,
  match_status text NOT NULL CHECK (match_status IN ('matched','variance_pending','variance_approved','variance_rejected')),
  tax_accounting_status text NOT NULL CHECK (tax_accounting_status IN ('not_required','pending')),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,purchase_order_id)
    REFERENCES public.purchase_orders(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,supplier_id)
    REFERENCES public.suppliers(organization_id,id) ON DELETE RESTRICT,
  CHECK (invoice_total_amount = merchandise_subtotal + tax_amount),
  CHECK (merchandise_variance_amount = merchandise_subtotal - expected_merchandise_subtotal),
  CHECK ((tax_amount=0 AND tax_accounting_status='not_required')
      OR (tax_amount>0 AND tax_accounting_status='pending')),
  CHECK (
    (match_status IN ('matched','variance_pending')
      AND reviewed_by_profile_id IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR
    (match_status IN ('variance_approved','variance_rejected')
      AND reviewed_by_profile_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND char_length(btrim(coalesce(review_reason,''))) BETWEEN 3 AND 500)
  )
);

CREATE UNIQUE INDEX purchase_supplier_invoices_supplier_number_uq
  ON public.purchase_supplier_invoices(organization_id,supplier_id,lower(supplier_invoice_number));
CREATE INDEX purchase_supplier_invoices_po_date_idx
  ON public.purchase_supplier_invoices(organization_id,purchase_order_id,invoice_date DESC,created_at DESC);
CREATE INDEX purchase_supplier_invoices_match_queue_idx
  ON public.purchase_supplier_invoices(organization_id,match_status,created_at DESC,id);

CREATE TABLE public.purchase_supplier_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  receipt_item_id uuid NOT NULL,
  purchase_order_item_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  item_code_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  source_received_quantity numeric(15,3) NOT NULL CHECK (source_received_quantity > 0),
  invoiced_quantity numeric(15,3) NOT NULL CHECK (invoiced_quantity > 0 AND invoiced_quantity <= source_received_quantity),
  ordered_unit_cost numeric(15,2) NOT NULL CHECK (ordered_unit_cost >= 0),
  received_unit_cost numeric(15,2) NOT NULL CHECK (received_unit_cost >= 0),
  invoiced_unit_cost numeric(15,2) NOT NULL CHECK (invoiced_unit_cost >= 0),
  expected_line_total numeric(18,2) NOT NULL CHECK (expected_line_total >= 0 AND expected_line_total < 10000000000000000),
  actual_line_total numeric(18,2) NOT NULL CHECK (actual_line_total >= 0 AND actual_line_total < 10000000000000000),
  price_match boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,invoice_id)
    REFERENCES public.purchase_supplier_invoices(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,receipt_id)
    REFERENCES public.purchase_receipts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,receipt_item_id)
    REFERENCES public.purchase_receipt_items(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,purchase_order_item_id)
    REFERENCES public.purchase_order_items(organization_id,id) ON DELETE RESTRICT,
  UNIQUE (organization_id,invoice_id,receipt_item_id),
  CHECK (price_match = (
    invoiced_unit_cost=ordered_unit_cost
    AND ordered_unit_cost=received_unit_cost
    AND actual_line_total=expected_line_total
  ))
);
CREATE INDEX purchase_supplier_invoice_lines_receipt_idx
  ON public.purchase_supplier_invoice_lines(organization_id,receipt_item_id,invoice_id);
CREATE INDEX purchase_supplier_invoice_lines_invoice_idx
  ON public.purchase_supplier_invoice_lines(organization_id,invoice_id,receipt_id);

CREATE TABLE public.purchase_supplier_invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('recorded_matched','recorded_variance_pending','variance_approved','variance_rejected')),
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,invoice_id)
    REFERENCES public.purchase_supplier_invoices(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX purchase_supplier_invoice_events_history_idx
  ON public.purchase_supplier_invoice_events(organization_id,invoice_id,created_at,id);

ALTER TABLE public.purchase_supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_invoice_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_supplier_invoices_finance_read
  ON public.purchase_supplier_invoices FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY purchase_supplier_invoice_lines_finance_read
  ON public.purchase_supplier_invoice_lines FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
CREATE POLICY purchase_supplier_invoice_events_finance_read
  ON public.purchase_supplier_invoice_events FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );

GRANT SELECT ON public.purchase_supplier_invoices,public.purchase_supplier_invoice_lines,
  public.purchase_supplier_invoice_events TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.purchase_supplier_invoices,public.purchase_supplier_invoice_lines,
  public.purchase_supplier_invoice_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_purchase_supplier_invoice_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  IF ROW(
    OLD.organization_id,OLD.purchase_order_id,OLD.supplier_id,OLD.supplier_invoice_number,
    OLD.invoice_date,OLD.currency,OLD.merchandise_subtotal,OLD.tax_amount,OLD.invoice_total_amount,
    OLD.expected_merchandise_subtotal,OLD.merchandise_variance_amount,OLD.tax_accounting_status,
    OLD.idempotency_key,OLD.payload_fingerprint,OLD.created_by_profile_id,OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.organization_id,NEW.purchase_order_id,NEW.supplier_id,NEW.supplier_invoice_number,
    NEW.invoice_date,NEW.currency,NEW.merchandise_subtotal,NEW.tax_amount,NEW.invoice_total_amount,
    NEW.expected_merchandise_subtotal,NEW.merchandise_variance_amount,NEW.tax_accounting_status,
    NEW.idempotency_key,NEW.payload_fingerprint,NEW.created_by_profile_id,NEW.created_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice source evidence is immutable';
  END IF;
  IF OLD.match_status IS DISTINCT FROM NEW.match_status THEN
    IF OLD.match_status<>'variance_pending'
       OR NEW.match_status NOT IN ('variance_approved','variance_rejected')
       OR NEW.reviewed_by_profile_id IS NULL OR NEW.reviewed_at IS NULL
       OR char_length(btrim(coalesce(NEW.review_reason,''))) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice match status requires an explicit controlled variance decision';
    END IF;
  ELSIF ROW(OLD.reviewed_by_profile_id,OLD.reviewed_at,OLD.review_reason)
      IS DISTINCT FROM ROW(NEW.reviewed_by_profile_id,NEW.reviewed_at,NEW.review_reason) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice review evidence is immutable';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER purchase_supplier_invoice_source_guard
  BEFORE UPDATE ON public.purchase_supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_invoice_source();

CREATE OR REPLACE FUNCTION public.guard_purchase_supplier_invoice_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice line and review history is append-only';
END;
$function$;
CREATE TRIGGER purchase_supplier_invoice_lines_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_invoice_history();
CREATE TRIGGER purchase_supplier_invoice_events_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_invoice_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_invoice_history();

CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_invoice_workspace(
  p_purchase_order_id uuid DEFAULT NULL,
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
  v_orders jsonb;
  v_receivable_lines jsonb;
  v_invoices jsonb;
  v_invoice_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for supplier invoice workspace';
  END IF;
  IF (p_purchase_order_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.purchase_orders po
       WHERE po.id=p_purchase_order_id AND po.organization_id=v_org
     ))
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice filter or pagination is invalid';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',po.id,'purchase_order_number',po.purchase_order_number,'supplier_id',s.id,
    'supplier_name',s.name,'status',po.status,'currency',org.currency
  ) ORDER BY po.created_at DESC,po.purchase_order_number DESC),'[]'::jsonb)
  INTO v_orders
  FROM public.purchase_orders po
  JOIN public.suppliers s ON s.id=po.supplier_id
  JOIN public.organizations org ON org.id=po.organization_id
  WHERE po.organization_id=v_org AND po.status IN ('submitted','partially_received','received')
    AND (p_purchase_order_id IS NULL OR po.id=p_purchase_order_id)
    AND EXISTS (
      SELECT 1 FROM public.purchase_receipts r
      JOIN public.purchase_receipt_items ri ON ri.receipt_id=r.id
      WHERE r.organization_id=v_org AND r.purchase_order_id=po.id
    );

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.received_at DESC,q.receipt_number DESC,q.receipt_item_id),'[]'::jsonb)
  INTO v_receivable_lines
  FROM (
    SELECT
      po.id AS purchase_order_id,po.purchase_order_number,s.id AS supplier_id,s.name AS supplier_name,
      org.currency,r.id AS receipt_id,r.receipt_number,r.received_at,ri.id AS receipt_item_id,
      poi.id AS purchase_order_item_id,ri.product_id,poi.item_code_snapshot,poi.product_name_snapshot,
      poi.unit_snapshot,ri.quantity_received AS source_received_quantity,
      coalesce(billed.invoiced_quantity,0)::numeric(15,3) AS invoiced_quantity,
      (ri.quantity_received-coalesce(billed.invoiced_quantity,0))::numeric(15,3) AS remaining_to_invoice,
      poi.unit_cost AS ordered_unit_cost,ri.unit_cost AS received_unit_cost,ri.line_total AS received_line_total,
      (poi.unit_cost IS NOT NULL AND ri.unit_cost IS NOT NULL AND ri.line_total IS NOT NULL) AS source_cost_complete
    FROM public.purchase_receipts r
    JOIN public.purchase_orders po ON po.id=r.purchase_order_id AND po.organization_id=r.organization_id
    JOIN public.suppliers s ON s.id=po.supplier_id
    JOIN public.organizations org ON org.id=po.organization_id
    JOIN public.purchase_receipt_items ri ON ri.receipt_id=r.id AND ri.organization_id=r.organization_id
    JOIN public.purchase_order_items poi ON poi.id=ri.purchase_order_item_id AND poi.organization_id=ri.organization_id
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(line.invoiced_quantity),0)::numeric(15,3) AS invoiced_quantity
      FROM public.purchase_supplier_invoice_lines line
      JOIN public.purchase_supplier_invoices inv
        ON inv.id=line.invoice_id AND inv.organization_id=line.organization_id
      WHERE line.organization_id=v_org AND line.receipt_item_id=ri.id
        AND inv.match_status<>'variance_rejected'
    ) billed ON true
    WHERE r.organization_id=v_org AND po.status IN ('submitted','partially_received','received')
      AND (p_purchase_order_id IS NULL OR po.id=p_purchase_order_id)
      AND ri.quantity_received>coalesce(billed.invoiced_quantity,0)
    ORDER BY r.received_at DESC,r.receipt_number DESC,ri.id
    LIMIT 500
  ) q;

  SELECT count(*)::integer INTO v_invoice_count
  FROM public.purchase_supplier_invoices i
  WHERE i.organization_id=v_org
    AND (p_purchase_order_id IS NULL OR i.purchase_order_id=p_purchase_order_id);

  SELECT coalesce(jsonb_agg(q.invoice_row ORDER BY q.invoice_date DESC,q.created_at DESC,q.invoice_id DESC),'[]'::jsonb)
  INTO v_invoices
  FROM (
    SELECT
      i.id AS invoice_id,i.invoice_date,i.created_at,
      jsonb_build_object(
        'id',i.id,'purchase_order_id',i.purchase_order_id,'purchase_order_number',po.purchase_order_number,
        'supplier_id',i.supplier_id,'supplier_name',s.name,
        'supplier_invoice_number',i.supplier_invoice_number,'invoice_date',i.invoice_date,'currency',i.currency,
        'merchandise_subtotal',i.merchandise_subtotal::text,'tax_amount',i.tax_amount::text,
        'invoice_total_amount',i.invoice_total_amount::text,
        'expected_merchandise_subtotal',i.expected_merchandise_subtotal::text,
        'merchandise_variance_amount',i.merchandise_variance_amount::text,
        'match_status',i.match_status,'tax_accounting_status',i.tax_accounting_status,
        'created_by_profile_id',i.created_by_profile_id,'created_at',i.created_at,
        'reviewed_by_profile_id',i.reviewed_by_profile_id,'reviewed_at',i.reviewed_at,'review_reason',i.review_reason,
        'lines',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id',line.id,'receipt_id',line.receipt_id,'receipt_number',r.receipt_number,
            'receipt_item_id',line.receipt_item_id,'purchase_order_item_id',line.purchase_order_item_id,
            'product_id',line.product_id,'item_code',line.item_code_snapshot,'product_name',line.product_name_snapshot,
            'unit',line.unit_snapshot,'source_received_quantity',line.source_received_quantity::text,
            'invoiced_quantity',line.invoiced_quantity::text,'ordered_unit_cost',line.ordered_unit_cost::text,
            'received_unit_cost',line.received_unit_cost::text,'invoiced_unit_cost',line.invoiced_unit_cost::text,
            'expected_line_total',line.expected_line_total::text,'actual_line_total',line.actual_line_total::text,
            'price_match',line.price_match
          ) ORDER BY r.receipt_number,line.id)
          FROM public.purchase_supplier_invoice_lines line
          JOIN public.purchase_receipts r ON r.id=line.receipt_id AND r.organization_id=line.organization_id
          WHERE line.organization_id=i.organization_id AND line.invoice_id=i.id
        ),'[]'::jsonb),
        'history',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'action',event.action,'actor_profile_id',event.actor_profile_id,
            'reason',event.reason,'created_at',event.created_at
          ) ORDER BY event.created_at,event.id)
          FROM public.purchase_supplier_invoice_events event
          WHERE event.organization_id=i.organization_id AND event.invoice_id=i.id
        ),'[]'::jsonb)
      ) AS invoice_row
    FROM public.purchase_supplier_invoices i
    JOIN public.purchase_orders po ON po.id=i.purchase_order_id AND po.organization_id=i.organization_id
    JOIN public.suppliers s ON s.id=i.supplier_id
    WHERE i.organization_id=v_org AND (p_purchase_order_id IS NULL OR i.purchase_order_id=p_purchase_order_id)
    ORDER BY i.invoice_date DESC,i.created_at DESC,i.id DESC
    LIMIT p_limit OFFSET p_offset
  ) q;

  RETURN jsonb_build_object(
    'purchase_orders',v_orders,
    'receivable_lines',v_receivable_lines,
    'invoices',v_invoices,
    'invoice_count',v_invoice_count,
    'limit',p_limit,'offset',p_offset,
    'has_more',v_invoice_count>p_offset+p_limit,
    'as_of_date',current_date
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_invoice_workspace(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_invoice_workspace(uuid,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_purchase_supplier_invoice(
  p_purchase_order_id uuid,
  p_supplier_invoice_number text,
  p_invoice_date date,
  p_merchandise_subtotal numeric,
  p_tax_amount numeric,
  p_invoice_total_amount numeric,
  p_lines jsonb,
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
  v_po public.purchase_orders%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_currency text;
  v_number text:=btrim(coalesce(p_supplier_invoice_number,''));
  v_item jsonb;
  v_receipt_item_id uuid;
  v_quantity numeric(15,3);
  v_invoice_unit_cost numeric(15,2);
  v_actual_line_total numeric(18,2);
  v_expected_line_total numeric(18,2);
  v_source record;
  v_previously_invoiced numeric(15,3);
  v_normalized_lines jsonb;
  v_line_count integer;
  v_unique_count integer;
  v_actual_subtotal numeric(18,2):=0;
  v_expected_subtotal numeric(18,2):=0;
  v_all_prices_match boolean:=true;
  v_match_status text;
  v_tax_accounting_status text;
  v_fingerprint text;
  v_existing public.purchase_supplier_invoices%ROWTYPE;
  v_invoice public.purchase_supplier_invoices%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to record supplier invoice';
  END IF;
  IF p_purchase_order_id IS NULL OR p_idempotency_key IS NULL
     OR v_number='' OR char_length(v_number)>80
     OR p_invoice_date IS NULL OR p_invoice_date>current_date
     OR p_merchandise_subtotal IS NULL OR p_merchandise_subtotal<=0
     OR p_merchandise_subtotal>=10000000000000000 OR p_merchandise_subtotal<>round(p_merchandise_subtotal,2)
     OR p_tax_amount IS NULL OR p_tax_amount<0 OR p_tax_amount>=10000000000000000
     OR p_tax_amount<>round(p_tax_amount,2)
     OR p_invoice_total_amount IS NULL OR p_invoice_total_amount<=0
     OR p_invoice_total_amount>=10000000000000000 OR p_invoice_total_amount<>round(p_invoice_total_amount,2)
     OR p_invoice_total_amount<>p_merchandise_subtotal+p_tax_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice number, date, merchandise subtotal, explicit tax and invoice total are required; total must equal subtotal plus tax';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array'
     OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice requires between 1 and 100 receipt lines';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) AS item(value) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR coalesce(v_item->>'receipt_item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR coalesce(v_item->>'quantity','') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,3})?$'
       OR coalesce(v_item->>'unit_cost','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$'
       OR coalesce(v_item->>'line_total','') !~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice line requires receipt item, quantity, unit cost and line total with supported precision';
    END IF;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object(
    'receipt_item_id',line.receipt_item_id::text,
    'quantity',line.quantity::text,
    'unit_cost',line.unit_cost::text,
    'line_total',line.line_total::text
  ) ORDER BY line.receipt_item_id)
  INTO v_normalized_lines
  FROM (
    SELECT
      (item.value->>'receipt_item_id')::uuid AS receipt_item_id,
      (item.value->>'quantity')::numeric(15,3) AS quantity,
      (item.value->>'unit_cost')::numeric(15,2) AS unit_cost,
      (item.value->>'line_total')::numeric(18,2) AS line_total
    FROM jsonb_array_elements(p_lines) AS item(value)
  ) line;
  SELECT count(*)::integer,count(DISTINCT (item.value->>'receipt_item_id'))::integer
  INTO v_line_count,v_unique_count
  FROM jsonb_array_elements(v_normalized_lines) AS item(value);
  IF v_line_count NOT BETWEEN 1 AND 100 OR v_unique_count<>v_line_count THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each physical receipt line may appear only once in one supplier invoice';
  END IF;

  SELECT po.* INTO v_po FROM public.purchase_orders po
  WHERE po.id=p_purchase_order_id AND po.organization_id=v_org
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='purchase order is not available in this organization';
  END IF;
  IF v_po.status NOT IN ('submitted','partially_received','received') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice can only be matched to a submitted purchase order with physical receipts';
  END IF;
  SELECT s.* INTO v_supplier FROM public.suppliers s
  WHERE s.id=v_po.supplier_id AND s.organization_id=v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='purchase order supplier is not available in this organization';
  END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='organization base currency is unavailable; invoice matching cannot infer currency';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||':supplier-invoice-po:'||v_po.id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||':supplier-invoice-number:'||v_supplier.id::text||':'||lower(v_number),0));
  v_fingerprint:=md5(jsonb_build_object(
    'purchase_order_id',v_po.id,'supplier_id',v_supplier.id,'invoice_number',v_number,
    'invoice_date',p_invoice_date,'currency',v_currency,
    'merchandise_subtotal',p_merchandise_subtotal::text,'tax_amount',p_tax_amount::text,
    'invoice_total_amount',p_invoice_total_amount::text,'lines',v_normalized_lines
  )::text);

  SELECT i.* INTO v_existing FROM public.purchase_supplier_invoices i
  WHERE i.organization_id=v_org AND i.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice idempotency key payload conflict';
    END IF;
    RETURN jsonb_build_object(
      'invoice_id',v_existing.id,'supplier_invoice_number',v_existing.supplier_invoice_number,
      'match_status',v_existing.match_status,'tax_accounting_status',v_existing.tax_accounting_status,
      'currency',v_existing.currency,'merchandise_subtotal',v_existing.merchandise_subtotal::text,
      'tax_amount',v_existing.tax_amount::text,'invoice_total_amount',v_existing.invoice_total_amount::text,
      'expected_merchandise_subtotal',v_existing.expected_merchandise_subtotal::text,
      'merchandise_variance_amount',v_existing.merchandise_variance_amount::text,'replayed',true
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_supplier_invoices i
    WHERE i.organization_id=v_org AND i.supplier_id=v_supplier.id
      AND lower(i.supplier_invoice_number)=lower(v_number)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='supplier invoice number has already been recorded for this supplier';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_normalized_lines) AS item(value) LOOP
    v_receipt_item_id:=(v_item->>'receipt_item_id')::uuid;
    v_quantity:=(v_item->>'quantity')::numeric(15,3);
    v_invoice_unit_cost:=(v_item->>'unit_cost')::numeric(15,2);
    v_actual_line_total:=(v_item->>'line_total')::numeric(18,2);
    IF v_quantity<=0 OR v_invoice_unit_cost<0 OR v_actual_line_total<0
       OR round(v_quantity*v_invoice_unit_cost,2)<>v_actual_line_total THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice line total must equal the exact quantity times invoiced unit cost';
    END IF;
    SELECT
      ri.id,ri.receipt_id,ri.purchase_order_item_id,ri.product_id,ri.quantity_received,
      ri.unit_cost AS received_unit_cost,ri.line_total AS received_line_total,
      r.receipt_number,poi.item_code_snapshot,poi.product_name_snapshot,poi.unit_snapshot,
      poi.unit_cost AS ordered_unit_cost
    INTO v_source
    FROM public.purchase_receipt_items ri
    JOIN public.purchase_receipts r ON r.id=ri.receipt_id AND r.organization_id=ri.organization_id
    JOIN public.purchase_order_items poi ON poi.id=ri.purchase_order_item_id AND poi.organization_id=ri.organization_id
    WHERE ri.id=v_receipt_item_id AND ri.organization_id=v_org
      AND r.purchase_order_id=v_po.id AND poi.purchase_order_id=v_po.id
    FOR UPDATE OF r,ri,poi;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='invoice line must reference a physical receipt line belonging to this purchase order';
    END IF;
    IF v_source.ordered_unit_cost IS NULL OR v_source.received_unit_cost IS NULL
       OR v_source.received_line_total IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source purchase-order or receipt cost is incomplete; complete source costing before three-way invoice matching';
    END IF;
    SELECT coalesce(sum(line.invoiced_quantity),0)::numeric(15,3)
    INTO v_previously_invoiced
    FROM public.purchase_supplier_invoice_lines line
    JOIN public.purchase_supplier_invoices invoice
      ON invoice.id=line.invoice_id AND invoice.organization_id=line.organization_id
    WHERE line.organization_id=v_org AND line.receipt_item_id=v_receipt_item_id
      AND invoice.match_status<>'variance_rejected';
    IF v_quantity>v_source.quantity_received-coalesce(v_previously_invoiced,0) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invoice quantity exceeds the not-yet-invoiced physical received quantity';
    END IF;

    v_expected_line_total:=round(v_quantity*v_source.ordered_unit_cost,2);
    v_actual_subtotal:=v_actual_subtotal+v_actual_line_total;
    v_expected_subtotal:=v_expected_subtotal+v_expected_line_total;
    IF v_invoice_unit_cost IS DISTINCT FROM v_source.ordered_unit_cost
       OR v_source.ordered_unit_cost IS DISTINCT FROM v_source.received_unit_cost
       OR v_actual_line_total IS DISTINCT FROM v_expected_line_total THEN
      v_all_prices_match:=false;
    END IF;
  END LOOP;

  IF v_actual_subtotal<>p_merchandise_subtotal THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice merchandise subtotal must equal the sum of its saved receipt-linked lines';
  END IF;
  v_match_status:=CASE WHEN v_all_prices_match THEN 'matched' ELSE 'variance_pending' END;
  v_tax_accounting_status:=CASE WHEN p_tax_amount=0 THEN 'not_required' ELSE 'pending' END;

  INSERT INTO public.purchase_supplier_invoices(
    organization_id,purchase_order_id,supplier_id,supplier_invoice_number,invoice_date,currency,
    merchandise_subtotal,tax_amount,invoice_total_amount,expected_merchandise_subtotal,
    merchandise_variance_amount,match_status,tax_accounting_status,idempotency_key,
    payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,v_po.id,v_supplier.id,v_number,p_invoice_date,v_currency,
    v_actual_subtotal,p_tax_amount,p_invoice_total_amount,v_expected_subtotal,
    v_actual_subtotal-v_expected_subtotal,v_match_status,v_tax_accounting_status,p_idempotency_key,
    v_fingerprint,v_actor
  ) RETURNING * INTO v_invoice;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_normalized_lines) AS item(value) LOOP
    v_receipt_item_id:=(v_item->>'receipt_item_id')::uuid;
    v_quantity:=(v_item->>'quantity')::numeric(15,3);
    v_invoice_unit_cost:=(v_item->>'unit_cost')::numeric(15,2);
    v_actual_line_total:=(v_item->>'line_total')::numeric(18,2);
    SELECT
      ri.id,ri.receipt_id,ri.purchase_order_item_id,ri.product_id,ri.quantity_received,
      ri.unit_cost AS received_unit_cost,
      poi.unit_cost AS ordered_unit_cost,
      poi.item_code_snapshot,poi.product_name_snapshot,poi.unit_snapshot
    INTO v_source
    FROM public.purchase_receipt_items ri
    JOIN public.purchase_order_items poi ON poi.id=ri.purchase_order_item_id AND poi.organization_id=ri.organization_id
    WHERE ri.id=v_receipt_item_id AND ri.organization_id=v_org
    FOR UPDATE OF ri,poi;
    v_expected_line_total:=round(v_quantity*v_source.ordered_unit_cost,2);
    INSERT INTO public.purchase_supplier_invoice_lines(
      organization_id,invoice_id,receipt_id,receipt_item_id,purchase_order_item_id,product_id,
      item_code_snapshot,product_name_snapshot,unit_snapshot,source_received_quantity,invoiced_quantity,
      ordered_unit_cost,received_unit_cost,invoiced_unit_cost,expected_line_total,actual_line_total,price_match
    ) VALUES (
      v_org,v_invoice.id,v_source.receipt_id,v_source.id,v_source.purchase_order_item_id,v_source.product_id,
      v_source.item_code_snapshot,v_source.product_name_snapshot,v_source.unit_snapshot,
      v_source.quantity_received,v_quantity,v_source.ordered_unit_cost,v_source.received_unit_cost,
      v_invoice_unit_cost,v_expected_line_total,v_actual_line_total,
      v_invoice_unit_cost=v_source.ordered_unit_cost AND v_source.ordered_unit_cost=v_source.received_unit_cost
        AND v_actual_line_total=v_expected_line_total
    );
  END LOOP;

  INSERT INTO public.purchase_supplier_invoice_events(
    organization_id,invoice_id,actor_profile_id,action,reason,details
  ) VALUES (
    v_org,v_invoice.id,v_actor,
    CASE WHEN v_match_status='matched' THEN 'recorded_matched' ELSE 'recorded_variance_pending' END,
    CASE WHEN v_match_status='matched' THEN 'Exact three-way quantity and unit-price match to the purchase order and physical receipt.' ELSE 'Source quantity is verified but one or more invoice prices differ; independent finance review is required.' END,
    jsonb_build_object(
      'purchase_order_number',v_po.purchase_order_number,'supplier_invoice_number',v_number,
      'line_count',v_line_count,'currency',v_currency,'merchandise_subtotal',v_actual_subtotal::text,
      'expected_merchandise_subtotal',v_expected_subtotal::text,'tax_amount',p_tax_amount::text,
      'invoice_total_amount',p_invoice_total_amount::text,'tax_accounting_status',v_tax_accounting_status
    )
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (
    v_org,v_actor,'supplier_invoice.recorded','purchase_supplier_invoice',v_invoice.id,'{}'::jsonb,
    jsonb_build_object(
      'purchase_order_id',v_po.id,'purchase_order_number',v_po.purchase_order_number,
      'supplier_id',v_supplier.id,'supplier_invoice_number',v_number,'invoice_date',p_invoice_date,
      'currency',v_currency,'merchandise_subtotal',v_actual_subtotal::text,
      'tax_amount',p_tax_amount::text,'invoice_total_amount',p_invoice_total_amount::text,
      'expected_merchandise_subtotal',v_expected_subtotal::text,
      'merchandise_variance_amount',(v_actual_subtotal-v_expected_subtotal)::text,'match_status',v_match_status
    )
  );

  RETURN jsonb_build_object(
    'invoice_id',v_invoice.id,'supplier_invoice_number',v_invoice.supplier_invoice_number,
    'match_status',v_invoice.match_status,'tax_accounting_status',v_invoice.tax_accounting_status,
    'currency',v_invoice.currency,'merchandise_subtotal',v_invoice.merchandise_subtotal::text,
    'tax_amount',v_invoice.tax_amount::text,'invoice_total_amount',v_invoice.invoice_total_amount::text,
    'expected_merchandise_subtotal',v_invoice.expected_merchandise_subtotal::text,
    'merchandise_variance_amount',v_invoice.merchandise_variance_amount::text,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.record_purchase_supplier_invoice(uuid,text,date,numeric,numeric,numeric,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_purchase_supplier_invoice(uuid,text,date,numeric,numeric,numeric,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_purchase_supplier_invoice_variance(
  p_invoice_id uuid,
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
  v_invoice public.purchase_supplier_invoices%ROWTYPE;
  v_next_status text;
  v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to review supplier invoice variance';
  END IF;
  IF p_invoice_id IS NULL OR p_approve IS NULL OR char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice decision and a 3 to 500 character reason are required';
  END IF;
  SELECT i.* INTO v_invoice FROM public.purchase_supplier_invoices i
  WHERE i.id=p_invoice_id AND i.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier invoice is not available in this organization';
  END IF;
  IF v_invoice.created_by_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier invoice variance review requires a different finance actor';
  END IF;
  v_next_status:=CASE WHEN p_approve THEN 'variance_approved' ELSE 'variance_rejected' END;
  IF v_invoice.match_status IN ('variance_approved','variance_rejected') THEN
    IF v_invoice.match_status=v_next_status AND v_invoice.review_reason=v_reason
       AND v_invoice.reviewed_by_profile_id=v_actor THEN
      RETURN jsonb_build_object('invoice_id',v_invoice.id,'match_status',v_invoice.match_status,'replayed',true);
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice variance already has a different final decision';
  END IF;
  IF v_invoice.match_status<>'variance_pending' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a pending supplier invoice price variance can be reviewed';
  END IF;
  UPDATE public.purchase_supplier_invoices
  SET match_status=v_next_status,reviewed_by_profile_id=v_actor,
    reviewed_at=now(),review_reason=v_reason,updated_at=now()
  WHERE id=v_invoice.id AND organization_id=v_org;
  INSERT INTO public.purchase_supplier_invoice_events(
    organization_id,invoice_id,actor_profile_id,action,reason,details
  ) VALUES (
    v_org,v_invoice.id,v_actor,
    CASE WHEN p_approve THEN 'variance_approved' ELSE 'variance_rejected' END,
    v_reason,
    jsonb_build_object('merchandise_variance_amount',v_invoice.merchandise_variance_amount::text,
      'expected_merchandise_subtotal',v_invoice.expected_merchandise_subtotal::text,
      'merchandise_subtotal',v_invoice.merchandise_subtotal::text,
      'currency',v_invoice.currency,'decision',v_next_status)
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (
    v_org,v_actor,'supplier_invoice.variance_reviewed','purchase_supplier_invoice',v_invoice.id,
    jsonb_build_object('match_status','variance_pending'),
    jsonb_build_object('match_status',v_next_status,'review_reason',v_reason,'reviewed_by',v_actor)
  );
  RETURN jsonb_build_object('invoice_id',v_invoice.id,'match_status',v_next_status,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.review_purchase_supplier_invoice_variance(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_purchase_supplier_invoice_variance(uuid,boolean,text) TO authenticated;

COMMENT ON TABLE public.purchase_supplier_invoices IS
  'Immutable supplier invoice evidence tied to one purchase order and verified physical receipt lines. The goods receipt journal remains the payable source; this document is not a second payable posting.';
COMMENT ON FUNCTION public.record_purchase_supplier_invoice(uuid,text,date,numeric,numeric,numeric,jsonb,uuid) IS
  'Records an actual supplier invoice against received PO item lines with exact quantity and unit-price comparison. Tax is captured as invoice evidence but remains unmapped/unposted; no FX, inferred tax or duplicate liability journal.';
COMMENT ON FUNCTION public.review_purchase_supplier_invoice_variance(uuid,boolean,text) IS
  'Requires a different finance actor to approve/reject a source-backed invoice price variance; this review does not post or adjust the General Ledger.';

COMMIT;
