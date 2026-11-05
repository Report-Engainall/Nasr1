-- AGH-PROC-SUPPLIER-RETURN-001
-- Supplier returns are anchored to saved physical receipts. Drafting is side-effect free;
-- posting atomically reduces available stock and writes the existing inventory movement ledger.
-- A supplier credit/journal is NOT posted here; it is routed to the existing accountant task flow.

CREATE SEQUENCE IF NOT EXISTS public.purchase_supplier_return_number_seq;

CREATE TABLE public.purchase_supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  return_number text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  reason text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(reason)) BETWEEN 3 AND 1000),
  notes text,
  total_cost numeric(15,2),
  idempotency_key text NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  posted_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,return_number),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,id),
  CHECK ((status='posted' AND posted_by IS NOT NULL AND posted_at IS NOT NULL)
      OR (status='draft' AND posted_by IS NULL AND posted_at IS NULL)),
  CHECK (notes IS NULL OR pg_catalog.char_length(notes)<=2000)
);

CREATE TABLE public.purchase_supplier_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  return_id uuid NOT NULL REFERENCES public.purchase_supplier_returns(id) ON DELETE RESTRICT,
  source_receipt_item_id uuid NOT NULL REFERENCES public.purchase_receipt_items(id) ON DELETE RESTRICT,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  item_code_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  source_received_quantity numeric(15,3) NOT NULL CHECK (source_received_quantity>0),
  quantity_returned numeric(15,3) NOT NULL CHECK (quantity_returned>0),
  unit_cost numeric(15,2),
  line_total numeric(15,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_id,source_receipt_item_id),
  FOREIGN KEY (organization_id,return_id)
    REFERENCES public.purchase_supplier_returns(organization_id,id) ON DELETE RESTRICT,
  CHECK (quantity_returned<=source_received_quantity),
  CHECK (unit_cost IS NULL OR (unit_cost>=0 AND pg_catalog.round(unit_cost,2)=unit_cost)),
  CHECK (line_total IS NULL OR (line_total>=0 AND pg_catalog.round(line_total,2)=line_total))
);

CREATE INDEX purchase_supplier_returns_inbox_idx
  ON public.purchase_supplier_returns(organization_id,status,created_at DESC,id DESC);
CREATE INDEX purchase_supplier_return_items_source_idx
  ON public.purchase_supplier_return_items(organization_id,source_receipt_item_id,return_id);

ALTER TABLE public.purchase_supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_supplier_return_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_supplier_returns,public.purchase_supplier_return_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.purchase_supplier_returns,public.purchase_supplier_return_items TO service_role;
REVOKE ALL ON SEQUENCE public.purchase_supplier_return_number_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT,UPDATE ON SEQUENCE public.purchase_supplier_return_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_supplier_return_detail(p_return_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',r.id,
    'return_number',r.return_number,
    'source_receipt_id',r.source_receipt_id,
    'source_receipt_number',pr.receipt_number,
    'purchase_order_id',r.purchase_order_id,
    'purchase_order_number',po.purchase_order_number,
    'supplier_id',r.supplier_id,
    'supplier_name',s.name,
    'warehouse_id',r.warehouse_id,
    'warehouse_name',w.name,
    'currency',r.currency,
    'status',r.status,
    'reason',r.reason,
    'notes',r.notes,
    'total_cost',r.total_cost,
    'created_at',r.created_at,
    'posted_at',r.posted_at,
    'posted_by',r.posted_by,
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',i.id,
        'source_receipt_item_id',i.source_receipt_item_id,
        'product_id',i.product_id,
        'item_code',i.item_code_snapshot,
        'product_name',i.product_name_snapshot,
        'unit',i.unit_snapshot,
        'source_received_quantity',i.source_received_quantity,
        'quantity_returned',i.quantity_returned,
        'unit_cost',i.unit_cost,
        'line_total',i.line_total
      ) ORDER BY i.product_name_snapshot,i.item_code_snapshot,i.id)
      FROM public.purchase_supplier_return_items i
      WHERE i.organization_id=r.organization_id AND i.return_id=r.id
    ),'[]'::jsonb)
  )
  FROM public.purchase_supplier_returns r
  JOIN public.purchase_receipts pr ON pr.id=r.source_receipt_id AND pr.organization_id=r.organization_id
  JOIN public.purchase_orders po ON po.id=r.purchase_order_id AND po.organization_id=r.organization_id
  JOIN public.suppliers s ON s.id=r.supplier_id AND s.organization_id=r.organization_id
  JOIN public.warehouses w ON w.id=r.warehouse_id AND w.organization_id=r.organization_id
  WHERE r.id=p_return_id;
$function$;
REVOKE ALL ON FUNCTION public.purchase_supplier_return_detail(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_returns()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_org uuid;
  v_receipts jsonb;
  v_returns jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required for supplier returns';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required for supplier returns';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',listed.id,
    'receipt_number',listed.receipt_number,
    'purchase_order_id',listed.purchase_order_id,
    'purchase_order_number',listed.purchase_order_number,
    'supplier_id',listed.supplier_id,
    'supplier_name',listed.supplier_name,
    'warehouse_id',listed.warehouse_id,
    'warehouse_name',listed.warehouse_name,
    'received_at',listed.received_at,
    'currency',listed.currency,
    'items',listed.items
  ) ORDER BY listed.received_at DESC,listed.id DESC),'[]'::jsonb)
  INTO v_receipts
  FROM (
    SELECT
      r.id,r.receipt_number,r.purchase_order_id,po.purchase_order_number,
      po.supplier_id,s.name AS supplier_name,r.warehouse_id,w.name AS warehouse_name,
      r.received_at,o.currency,
      COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'receipt_item_id',x.receipt_item_id,
          'product_id',x.product_id,
          'item_code',x.item_code,
          'product_name',x.product_name,
          'unit',x.unit,
          'quantity_received',x.quantity_received,
          'already_returned',x.already_returned,
          'remaining_quantity',x.remaining_quantity,
          'unit_cost',x.unit_cost,
          'line_total',x.line_total
        ) ORDER BY x.product_name,x.item_code,x.receipt_item_id)
        FROM (
          SELECT
            pri.id AS receipt_item_id,pri.product_id,poi.item_code_snapshot AS item_code,
            poi.product_name_snapshot AS product_name,poi.unit_snapshot AS unit,
            pri.quantity_received,
            COALESCE(returned.returned_quantity,0)::numeric(15,3) AS already_returned,
            (pri.quantity_received-COALESCE(returned.returned_quantity,0))::numeric(15,3) AS remaining_quantity,
            pri.unit_cost,pri.line_total
          FROM public.purchase_receipt_items pri
          JOIN public.purchase_order_items poi
            ON poi.id=pri.purchase_order_item_id AND poi.organization_id=pri.organization_id
          LEFT JOIN LATERAL (
            SELECT pg_catalog.sum(ri.quantity_returned)::numeric(15,3) AS returned_quantity
            FROM public.purchase_supplier_return_items ri
            JOIN public.purchase_supplier_returns sr
              ON sr.id=ri.return_id AND sr.organization_id=ri.organization_id
            WHERE ri.organization_id=v_org AND ri.source_receipt_item_id=pri.id AND sr.status='posted'
          ) returned ON true
          WHERE pri.organization_id=v_org AND pri.receipt_id=r.id
            AND pri.quantity_received>COALESCE(returned.returned_quantity,0)
        ) x
      ),'[]'::jsonb) AS items
    FROM public.purchase_receipts r
    JOIN public.purchase_orders po ON po.id=r.purchase_order_id AND po.organization_id=r.organization_id
    JOIN public.suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
    JOIN public.warehouses w ON w.id=r.warehouse_id AND w.organization_id=r.organization_id
    JOIN public.organizations o ON o.id=r.organization_id
    WHERE r.organization_id=v_org
      AND EXISTS (
        SELECT 1
        FROM public.purchase_receipt_items pri
        WHERE pri.organization_id=v_org AND pri.receipt_id=r.id
          AND pri.quantity_received>COALESCE((
            SELECT pg_catalog.sum(ri.quantity_returned)
            FROM public.purchase_supplier_return_items ri
            JOIN public.purchase_supplier_returns sr
              ON sr.id=ri.return_id AND sr.organization_id=ri.organization_id
            WHERE ri.organization_id=v_org AND ri.source_receipt_item_id=pri.id AND sr.status='posted'
          ),0)
      )
    ORDER BY r.received_at DESC,r.id DESC
    LIMIT 100
  ) listed;

  SELECT COALESCE(pg_catalog.jsonb_agg(public.purchase_supplier_return_detail(r.id)
    ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb)
    INTO v_returns
  FROM (
    SELECT id,created_at
      FROM public.purchase_supplier_returns
     WHERE organization_id=v_org
     ORDER BY created_at DESC,id DESC
     LIMIT 100
  ) r;

  RETURN pg_catalog.jsonb_build_object('receipts',v_receipts,'returns',v_returns);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_returns() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_returns() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_purchase_supplier_return(
  p_receipt_id uuid,
  p_lines jsonb,
  p_reason text,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_currency text;
  v_receipt public.purchase_receipts%ROWTYPE;
  v_po public.purchase_orders%ROWTYPE;
  v_line jsonb;
  v_item public.purchase_receipt_items%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_item_id uuid;
  v_qty numeric;
  v_returned numeric(15,3);
  v_line_total numeric;
  v_total numeric:=0;
  v_costs_complete boolean:=true;
  v_count integer:=0;
  v_return_id uuid;
  v_return_number text;
  v_fingerprint text;
  v_existing public.purchase_supplier_returns%ROWTYPE;
  v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
  v_notes text:=NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),'');
  v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to create supplier returns';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required';
  END IF;
  IF p_receipt_id IS NULL OR pg_catalog.char_length(v_reason)<3 OR pg_catalog.char_length(v_reason)>1000
     OR (v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>2000)
     OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
     OR p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.jsonb_array_length(p_lines)<1 OR pg_catalog.jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier return header or line payload is invalid';
  END IF;
  v_fingerprint:=pg_catalog.md5(p_receipt_id::text||'|'||v_reason||'|'||COALESCE(v_notes,'')||'|'||p_lines::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':supplier-return:'||p_idempotency_key,0)
  );
  SELECT r.* INTO v_existing
    FROM public.purchase_supplier_returns r
   WHERE r.organization_id=v_org AND r.idempotency_key=p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier return idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'supplier_return',public.purchase_supplier_return_detail(v_existing.id),
      'idempotent_replay',true
    );
  END IF;

  SELECT * INTO v_receipt
    FROM public.purchase_receipts
   WHERE id=p_receipt_id AND organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='source purchase receipt is not available in this organization';
  END IF;
  SELECT * INTO v_po
    FROM public.purchase_orders
   WHERE id=v_receipt.purchase_order_id AND organization_id=v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='source purchase order is not available in this organization';
  END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='organization base currency is not configured';
  END IF;

  INSERT INTO public.purchase_supplier_returns(
    organization_id,source_receipt_id,purchase_order_id,supplier_id,warehouse_id,
    return_number,currency,status,reason,notes,idempotency_key,payload_fingerprint,created_by
  ) VALUES(
    v_org,v_receipt.id,v_po.id,v_po.supplier_id,v_receipt.warehouse_id,
    'SR-'||pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD')||'-'||
      pg_catalog.lpad(pg_catalog.nextval('public.purchase_supplier_return_number_seq'::regclass)::text,6,'0'),
    v_currency,'draft',v_reason,v_notes,p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING id,return_number INTO v_return_id,v_return_number;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF pg_catalog.jsonb_typeof(v_line)<>'object'
       OR pg_catalog.jsonb_typeof(v_line->'receipt_item_id')<>'string'
       OR pg_catalog.jsonb_typeof(v_line->'quantity')<>'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each supplier return line requires receipt_item_id and numeric quantity';
    END IF;
    v_item_id:=(v_line->>'receipt_item_id')::uuid;
    v_qty:=(v_line->>'quantity')::numeric;
    IF v_qty<=0 OR v_qty>999999999999.999 OR pg_catalog.round(v_qty,3)<>v_qty THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier return quantity must be positive with at most three decimals';
    END IF;
    IF v_item_id=ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate purchase receipt item in supplier return';
    END IF;
    v_seen:=pg_catalog.array_append(v_seen,v_item_id);

    SELECT pri.* INTO v_item
      FROM public.purchase_receipt_items pri
     WHERE pri.id=v_item_id AND pri.receipt_id=v_receipt.id AND pri.organization_id=v_org
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier return line is not part of the selected source receipt';
    END IF;
    SELECT COALESCE(pg_catalog.sum(ri.quantity_returned),0)::numeric(15,3) INTO v_returned
      FROM public.purchase_supplier_return_items ri
      JOIN public.purchase_supplier_returns sr
        ON sr.id=ri.return_id AND sr.organization_id=ri.organization_id
     WHERE ri.organization_id=v_org AND ri.source_receipt_item_id=v_item.id AND sr.status='posted';
    IF v_qty>v_item.quantity_received-v_returned THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier return quantity exceeds the receipt quantity still returnable';
    END IF;
    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_item.product_id AND p.organization_id=v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='source product is not available in this organization';
    END IF;
    IF v_item.unit_cost IS NULL THEN
      v_costs_complete:=false;
      v_line_total:=NULL;
    ELSE
      IF v_qty*v_item.unit_cost>9999999999999.99 THEN
        RAISE EXCEPTION USING ERRCODE='22003',MESSAGE='supplier return line cost exceeds supported precision';
      END IF;
      v_line_total:=(v_qty*v_item.unit_cost)::numeric(15,2);
      v_total:=v_total+v_line_total;
      IF v_total>9999999999999.99 THEN
        RAISE EXCEPTION USING ERRCODE='22003',MESSAGE='supplier return total exceeds supported precision';
      END IF;
    END IF;
    INSERT INTO public.purchase_supplier_return_items(
      organization_id,return_id,source_receipt_item_id,purchase_order_item_id,product_id,
      item_code_snapshot,product_name_snapshot,unit_snapshot,source_received_quantity,
      quantity_returned,unit_cost,line_total
    ) VALUES(
      v_org,v_return_id,v_item.id,v_item.purchase_order_item_id,v_item.product_id,
      v_product.item_code,v_product.name,v_product.unit,v_item.quantity_received,
      v_qty,v_item.unit_cost,v_line_total
    );
    v_count:=v_count+1;
  END LOOP;

  UPDATE public.purchase_supplier_returns
     SET total_cost=CASE WHEN v_costs_complete THEN v_total ELSE NULL END,updated_at=now()
   WHERE id=v_return_id AND organization_id=v_org;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'supplier_return.created','purchase_supplier_return',v_return_id,
    pg_catalog.jsonb_build_object('return_number',v_return_number,'source_receipt_id',v_receipt.id,
      'purchase_order_id',v_po.id,'supplier_id',v_po.supplier_id,'warehouse_id',v_receipt.warehouse_id,
      'line_count',v_count,'total_cost',CASE WHEN v_costs_complete THEN v_total ELSE NULL END,
      'currency',v_currency,'reason',v_reason));
  RETURN pg_catalog.jsonb_build_object(
    'supplier_return',public.purchase_supplier_return_detail(v_return_id),
    'idempotent_replay',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.create_purchase_supplier_return(uuid,jsonb,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_supplier_return(uuid,jsonb,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_purchase_supplier_return(p_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_return public.purchase_supplier_returns%ROWTYPE;
  v_source_receipt public.purchase_receipts%ROWTYPE;
  v_item public.purchase_supplier_return_items%ROWTYPE;
  v_source_item public.purchase_receipt_items%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_returned numeric(15,3);
  v_new_available numeric(15,3);
  v_total_lines integer:=0;
  v_posting_task uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to post supplier returns';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT r.* INTO v_return
    FROM public.purchase_supplier_returns r
   WHERE r.id=p_return_id AND r.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier return is not available in this organization';
  END IF;
  IF v_return.status='posted' THEN
    RETURN pg_catalog.jsonb_build_object(
      'supplier_return',public.purchase_supplier_return_detail(v_return.id),
      'idempotent_replay',true
    );
  END IF;
  SELECT pr.* INTO v_source_receipt
    FROM public.purchase_receipts pr
   WHERE pr.id=v_return.source_receipt_id AND pr.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='source purchase receipt is not available in this organization';
  END IF;

  FOR v_item IN
    SELECT i.* FROM public.purchase_supplier_return_items i
     WHERE i.organization_id=v_org AND i.return_id=v_return.id
     ORDER BY i.product_id,i.source_receipt_item_id
     FOR UPDATE
  LOOP
    SELECT pri.* INTO v_source_item
      FROM public.purchase_receipt_items pri
     WHERE pri.id=v_item.source_receipt_item_id
       AND pri.receipt_id=v_return.source_receipt_id
       AND pri.organization_id=v_org
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier return source receipt line is unavailable';
    END IF;
    SELECT COALESCE(pg_catalog.sum(ri.quantity_returned),0)::numeric(15,3)
      INTO v_returned
      FROM public.purchase_supplier_return_items ri
      JOIN public.purchase_supplier_returns sr
        ON sr.id=ri.return_id AND sr.organization_id=ri.organization_id
     WHERE ri.organization_id=v_org AND ri.source_receipt_item_id=v_source_item.id AND sr.status='posted';
    IF v_item.quantity_returned>v_source_item.quantity_received-v_returned THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier return exceeds the remaining quantity on its source receipt line';
    END IF;

    SELECT ib.* INTO v_balance
      FROM public.inventory_balances ib
     WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_return.warehouse_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='no current inventory balance exists for supplier return';
    END IF;
    IF v_balance.quantity_available<v_item.quantity_returned THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='available stock is insufficient; reserved stock cannot be returned';
    END IF;
    UPDATE public.inventory_balances
       SET quantity_on_hand=quantity_on_hand-v_item.quantity_returned,
           last_movement_at=now(),updated_at=now()
     WHERE id=v_balance.id
     RETURNING quantity_available INTO v_new_available;
    INSERT INTO public.inventory_movements(
      product_id,warehouse_id,movement_type,quantity,balance_after,
      reference_type,reference_id,reason,created_by
    ) VALUES(
      v_item.product_id,v_return.warehouse_id,'supplier_return',-v_item.quantity_returned,
      v_new_available,'purchase_supplier_return',v_return.id,
      'مرتجع مورد '||v_return.return_number||' — إيصال '||
        (SELECT pr.receipt_number FROM public.purchase_receipts pr WHERE pr.id=v_return.source_receipt_id),
      v_actor
    );
    v_total_lines:=v_total_lines+1;
  END LOOP;

  UPDATE public.purchase_supplier_returns
     SET status='posted',posted_by=v_actor,posted_at=now(),updated_at=now()
   WHERE id=v_return.id AND organization_id=v_org;

  IF v_return.total_cost IS NULL THEN
    v_posting_task:=public.upsert_operational_task(
      v_org,
      'مراجعة تكلفة مرتجع المورد '||v_return.return_number,
      'نُفذ مرتجع مخزون فعلي من إيصال مصدره، لكن تكلفة المصدر غير مكتملة. طابق مستند المورد الأصلي قبل اعتماد أي إشعار دائن أو قيد.',
      'purchasing','high','supplier_return_cost_review',
      'supplier-return-cost-review:'||v_return.id::text,
      'purchase_supplier_returns',v_return.id,NULL,
      pg_catalog.jsonb_build_object('return_number',v_return.return_number,'source_receipt_id',v_return.source_receipt_id,
        'supplier_id',v_return.supplier_id,'requires_source_cost',true),false
    );
  ELSE
    v_posting_task:=public.upsert_operational_task(
      v_org,
      'مراجعة الإشعار الدائن لمرتجع المورد '||v_return.return_number,
      'سُجل مرتجع مخزون فعلي بتكلفة مصدرية محفوظة. على المحاسب مطابقة إشعار المورد الدائن والمراجعة ثم استخدام مسار القيود المعتمد؛ لا يوجد قيد تلقائي.',
      'accountant','medium','supplier_return_credit_review',
      'supplier-return-credit:'||v_return.id::text,
      'purchase_supplier_returns',v_return.id,NULL,
      pg_catalog.jsonb_build_object('return_number',v_return.return_number,'source_receipt_id',v_return.source_receipt_id,
        'supplier_id',v_return.supplier_id,'source_amount',v_return.total_cost,
        'source_currency',v_return.currency,'requires_supplier_credit_note',true),false
    );
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'supplier_return.posted','purchase_supplier_return',v_return.id,
    pg_catalog.jsonb_build_object('status','draft'),
    pg_catalog.jsonb_build_object('status','posted','return_number',v_return.return_number,
      'source_receipt_id',v_return.source_receipt_id,'supplier_id',v_return.supplier_id,
      'warehouse_id',v_return.warehouse_id,'currency',v_return.currency,
      'total_cost',v_return.total_cost,'movement_lines',v_total_lines,'finance_task_id',v_posting_task));
  RETURN pg_catalog.jsonb_build_object(
    'supplier_return',public.purchase_supplier_return_detail(v_return.id),
    'idempotent_replay',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.post_purchase_supplier_return(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_purchase_supplier_return(uuid) TO authenticated;

COMMENT ON TABLE public.purchase_supplier_returns IS
  'Tenant-scoped supplier return documents linked to original physical purchase receipts; posted returns atomically reduce unreserved stock and require separate accounting credit-note review.';
COMMENT ON FUNCTION public.post_purchase_supplier_return(uuid) IS
  'Posts one draft supplier return against its original receipt, revalidates aggregate returnable quantity under source locks, rejects reserved/unavailable stock, writes negative supplier_return movements and creates a finance follow-up task without posting a journal.';
