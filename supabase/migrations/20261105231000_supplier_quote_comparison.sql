-- AGH-PURCHASING-SUPPLIER-QUOTE-COMPARISON-001
-- Capture supplier offers, compare same-currency line prices, and award one offer
-- into the existing purchase-order workflow. No stock or journal mutation occurs here.

CREATE TABLE public.purchase_supplier_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  quote_number text NOT NULL,
  supplier_reference text,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  valid_until date,
  delivery_days integer CHECK (delivery_days IS NULL OR delivery_days BETWEEN 0 AND 3650),
  payment_terms text,
  notes text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','awarded')),
  purchase_order_id uuid,
  idempotency_key text NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,supplier_id,quote_number),
  UNIQUE (organization_id,purchase_order_id),
  FOREIGN KEY (purchase_order_id)
    REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  CHECK (pg_catalog.char_length(pg_catalog.btrim(quote_number)) BETWEEN 1 AND 80),
  CHECK (supplier_reference IS NULL OR pg_catalog.char_length(supplier_reference) <= 120),
  CHECK (payment_terms IS NULL OR pg_catalog.char_length(payment_terms) <= 1000),
  CHECK (notes IS NULL OR pg_catalog.char_length(notes) <= 2000)
);

CREATE TABLE public.purchase_supplier_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.purchase_supplier_quotes(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  item_code_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  quantity_quoted numeric(15,3) NOT NULL CHECK (quantity_quoted > 0),
  unit_cost numeric(15,2) NOT NULL CHECK (unit_cost >= 0),
  line_total numeric(15,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id,product_id),
  FOREIGN KEY (quote_id)
    REFERENCES public.purchase_supplier_quotes(id) ON DELETE RESTRICT,
  CHECK (pg_catalog.round(quantity_quoted,3)=quantity_quoted),
  CHECK (pg_catalog.round(unit_cost,2)=unit_cost),
  CHECK (pg_catalog.round(line_total,2)=line_total)
);

CREATE INDEX purchase_supplier_quotes_inbox_idx
  ON public.purchase_supplier_quotes(organization_id,created_at DESC,id DESC);
CREATE INDEX purchase_supplier_quote_items_product_idx
  ON public.purchase_supplier_quote_items(organization_id,product_id,quote_id);

ALTER TABLE public.purchase_supplier_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_quote_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_supplier_quotes,public.purchase_supplier_quote_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.purchase_supplier_quotes,public.purchase_supplier_quote_items TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_supplier_quote_detail(p_quote_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',q.id,
    'supplier_id',q.supplier_id,
    'supplier_name',s.name,
    'supplier_code',s.supplier_code,
    'quote_number',q.quote_number,
    'supplier_reference',q.supplier_reference,
    'currency',q.currency,
    'valid_until',q.valid_until,
    'delivery_days',q.delivery_days,
    'payment_terms',q.payment_terms,
    'notes',q.notes,
    'status',CASE WHEN q.status='received' AND q.valid_until<current_date THEN 'expired' ELSE q.status END,
    'purchase_order_id',q.purchase_order_id,
    'created_at',q.created_at,
    'updated_at',q.updated_at,
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',i.id,
        'product_id',i.product_id,
        'item_code',i.item_code_snapshot,
        'product_name',i.product_name_snapshot,
        'unit',i.unit_snapshot,
        'quantity_quoted',i.quantity_quoted,
        'unit_cost',i.unit_cost,
        'line_total',i.line_total
      ) ORDER BY i.product_name_snapshot,i.item_code_snapshot,i.id)
      FROM public.purchase_supplier_quote_items i
      WHERE i.organization_id=q.organization_id AND i.quote_id=q.id
    ),'[]'::jsonb)
  )
  FROM public.purchase_supplier_quotes q
  JOIN public.suppliers s ON s.id=q.supplier_id AND s.organization_id=q.organization_id
  WHERE q.id=p_quote_id;
$function$;
REVOKE ALL ON FUNCTION public.purchase_supplier_quote_detail(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_quotes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_org uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required for supplier quote comparison';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required for supplier quote comparison';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(public.purchase_supplier_quote_detail(q.id)
    ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
    INTO v_result
    FROM (
      SELECT id,created_at
        FROM public.purchase_supplier_quotes
       WHERE organization_id=v_org
       ORDER BY created_at DESC,id DESC
       LIMIT 200
    ) q;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_quotes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_quotes() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_purchase_supplier_quote(
  p_supplier_id uuid,
  p_quote_number text,
  p_supplier_reference text,
  p_valid_until date,
  p_delivery_days integer,
  p_payment_terms text,
  p_notes text,
  p_lines jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_currency text;
  v_line jsonb;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
  v_line_total numeric;
  v_count integer:=0;
  v_quote_id uuid;
  v_fingerprint text;
  v_existing public.purchase_supplier_quotes%ROWTYPE;
  v_quote_number text:=pg_catalog.btrim(COALESCE(p_quote_number,''));
  v_supplier_reference text:=NULLIF(pg_catalog.btrim(COALESCE(p_supplier_reference,'')),'');
  v_payment_terms text:=NULLIF(pg_catalog.btrim(COALESCE(p_payment_terms,'')),'');
  v_notes text:=NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),'');
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to record supplier quotes';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required';
  END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='organization base currency is not configured';
  END IF;
  IF p_supplier_id IS NULL OR v_quote_number='' OR pg_catalog.char_length(v_quote_number)>80
     OR (v_supplier_reference IS NOT NULL AND pg_catalog.char_length(v_supplier_reference)>120)
     OR (v_payment_terms IS NOT NULL AND pg_catalog.char_length(v_payment_terms)>1000)
     OR (v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>2000)
     OR (p_delivery_days IS NOT NULL AND p_delivery_days NOT BETWEEN 0 AND 3650) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier quote header fields are invalid';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid supplier quote idempotency key';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.jsonb_array_length(p_lines)<1 OR pg_catalog.jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier quote must contain between 1 and 100 product lines';
  END IF;
  PERFORM 1 FROM public.suppliers s
   WHERE s.id=p_supplier_id AND s.organization_id=v_org AND s.status='active'
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active supplier is not available in this organization';
  END IF;

  v_fingerprint:=pg_catalog.md5(
    p_supplier_id::text||'|'||v_quote_number||'|'||COALESCE(v_supplier_reference,'')||'|'||
    COALESCE(p_valid_until::text,'')||'|'||COALESCE(p_delivery_days::text,'')||'|'||
    COALESCE(v_payment_terms,'')||'|'||COALESCE(v_notes,'')||'|'||p_lines::text
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':supplier-quote:'||p_idempotency_key,0)
  );
  SELECT q.* INTO v_existing
    FROM public.purchase_supplier_quotes q
   WHERE q.organization_id=v_org AND q.idempotency_key=p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier quote idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'supplier_quote',public.purchase_supplier_quote_detail(v_existing.id),
      'idempotent_replay',true
    );
  END IF;

  INSERT INTO public.purchase_supplier_quotes(
    organization_id,supplier_id,quote_number,supplier_reference,currency,valid_until,
    delivery_days,payment_terms,notes,idempotency_key,payload_fingerprint,created_by
  ) VALUES(
    v_org,p_supplier_id,v_quote_number,v_supplier_reference,v_currency,p_valid_until,
    p_delivery_days,v_payment_terms,v_notes,p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING id INTO v_quote_id;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF pg_catalog.jsonb_typeof(v_line)<>'object'
       OR pg_catalog.jsonb_typeof(v_line->'product_id')<>'string'
       OR pg_catalog.jsonb_typeof(v_line->'quantity')<>'number'
       OR pg_catalog.jsonb_typeof(v_line->'unit_cost')<>'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each quote line requires product_id, quantity and unit_cost';
    END IF;
    v_product_id:=(v_line->>'product_id')::uuid;
    v_quantity:=(v_line->>'quantity')::numeric;
    v_unit_cost:=(v_line->>'unit_cost')::numeric;
    IF v_quantity<=0 OR v_quantity>999999999999.999 OR pg_catalog.round(v_quantity,3)<>v_quantity
       OR v_unit_cost<0 OR v_unit_cost>9999999999999.99 OR pg_catalog.round(v_unit_cost,2)<>v_unit_cost THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='quoted quantity or unit cost is outside supported precision';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.purchase_supplier_quote_items i
       WHERE i.quote_id=v_quote_id AND i.product_id=v_product_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate product in supplier quote';
    END IF;
    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='quoted product is unavailable in the active organization';
    END IF;
    IF v_quantity*v_unit_cost>9999999999999.99 THEN
      RAISE EXCEPTION USING ERRCODE='22003',MESSAGE='quoted line total exceeds supported precision';
    END IF;
    v_line_total:=(v_quantity*v_unit_cost)::numeric(15,2);
    INSERT INTO public.purchase_supplier_quote_items(
      organization_id,quote_id,product_id,item_code_snapshot,product_name_snapshot,unit_snapshot,
      quantity_quoted,unit_cost,line_total
    ) VALUES(
      v_org,v_quote_id,v_product.id,v_product.item_code,v_product.name,v_product.unit,
      v_quantity,v_unit_cost,v_line_total
    );
    v_count:=v_count+1;
  END LOOP;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'supplier_quote.recorded','purchase_supplier_quote',v_quote_id,
    pg_catalog.jsonb_build_object('quote_number',v_quote_number,'supplier_id',p_supplier_id,
      'currency',v_currency,'line_count',v_count,'valid_until',p_valid_until,'delivery_days',p_delivery_days));
  RETURN pg_catalog.jsonb_build_object(
    'supplier_quote',public.purchase_supplier_quote_detail(v_quote_id),
    'idempotent_replay',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.create_purchase_supplier_quote(uuid,text,text,date,integer,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_supplier_quote(uuid,text,text,date,integer,text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_purchase_supplier_quote(
  p_quote_id uuid,
  p_warehouse_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_currency text;
  v_quote public.purchase_supplier_quotes%ROWTYPE;
  v_lines jsonb;
  v_order_result jsonb;
  v_po_id uuid;
  v_notes text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to award supplier quotes';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required';
  END IF;
  SELECT q.* INTO v_quote
    FROM public.purchase_supplier_quotes q
   WHERE q.id=p_quote_id AND q.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier quote is not available in this organization';
  END IF;
  IF v_quote.purchase_order_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'supplier_quote',public.purchase_supplier_quote_detail(v_quote.id),
      'purchase_order',public.purchase_order_detail(v_quote.purchase_order_id),
      'idempotent_replay',true
    );
  END IF;
  IF v_quote.status<>'received' OR (v_quote.valid_until IS NOT NULL AND v_quote.valid_until<current_date) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a current, unawarded supplier quote can be converted to a purchase order';
  END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;
  IF v_quote.currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier quote currency no longer matches organization base currency';
  END IF;
  IF p_warehouse_id IS NULL OR (p_notes IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_notes))>1900) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='purchase order destination or notes are invalid';
  END IF;
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'product_id',i.product_id,'quantity',i.quantity_quoted,'unit_cost',i.unit_cost
  ) ORDER BY i.product_name_snapshot,i.item_code_snapshot,i.id)
  INTO v_lines
  FROM public.purchase_supplier_quote_items i
  WHERE i.organization_id=v_org AND i.quote_id=v_quote.id;
  IF v_lines IS NULL OR pg_catalog.jsonb_array_length(v_lines)=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier quote has no product lines';
  END IF;
  v_notes:=pg_catalog.left(
    pg_catalog.concat_ws(E'\n','مصدر أمر الشراء: عرض المورد '||v_quote.quote_number,
      NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),'')),
    2000
  );
  v_order_result:=public.create_purchase_order(
    v_quote.supplier_id,p_warehouse_id,v_lines,v_notes,
    'supplier-quote-'||pg_catalog.replace(v_quote.id::text,'-','')
  );
  v_po_id:=(v_order_result#>>'{purchase_order,id}')::uuid;
  UPDATE public.purchase_supplier_quotes
     SET status='awarded',purchase_order_id=v_po_id,updated_at=now()
   WHERE id=v_quote.id AND organization_id=v_org;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'supplier_quote.awarded','purchase_supplier_quote',v_quote.id,
    pg_catalog.jsonb_build_object('status','received','purchase_order_id',NULL),
    pg_catalog.jsonb_build_object('status','awarded','purchase_order_id',v_po_id));
  RETURN pg_catalog.jsonb_build_object(
    'supplier_quote',public.purchase_supplier_quote_detail(v_quote.id),
    'purchase_order',public.purchase_order_detail(v_po_id),
    'idempotent_replay',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.award_purchase_supplier_quote(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.award_purchase_supplier_quote(uuid,uuid,text) TO authenticated;

COMMENT ON TABLE public.purchase_supplier_quotes IS
  'Manager-only supplier offers entered in the organization base currency, with validity, delivery and payment terms; award creates one canonical purchase order.';
COMMENT ON FUNCTION public.award_purchase_supplier_quote(uuid,uuid,text) IS
  'Atomically converts a current same-tenant supplier quote into the existing idempotent draft purchase order; it does not submit the PO, receive stock or post a journal.';
