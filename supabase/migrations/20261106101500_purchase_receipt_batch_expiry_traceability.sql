BEGIN;

-- Receipt-level batch/expiry traceability. Aggregate inventory balance remains the
-- authoritative available-stock source; these fields are immutable receipt metadata.
ALTER TABLE public.purchase_receipt_items
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date;

ALTER TABLE public.purchase_receipt_items
  ADD CONSTRAINT purchase_receipt_items_batch_number_shape
    CHECK (batch_number IS NULL OR (batch_number=pg_catalog.btrim(batch_number) AND pg_catalog.char_length(batch_number) BETWEEN 1 AND 100)),
  ADD CONSTRAINT purchase_receipt_items_expiry_requires_batch
    CHECK (expiry_date IS NULL OR batch_number IS NOT NULL);

CREATE INDEX IF NOT EXISTS purchase_receipt_items_expiry_trace_idx
  ON public.purchase_receipt_items(organization_id,expiry_date)
  WHERE expiry_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_purchase_order_id uuid,p_lines jsonb,p_notes text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_po public.purchase_orders%ROWTYPE;
  v_line jsonb; v_item public.purchase_order_items%ROWTYPE;
  v_item_id uuid; v_qty numeric(15,3); v_seen uuid[]:=ARRAY[]::uuid[];
  v_receipt_id uuid; v_receipt_number text; v_existing public.purchase_receipts%ROWTYPE;
  v_fingerprint text; v_total numeric(15,2):=0; v_line_total numeric(15,2); v_costs_complete boolean:=true;
  v_balance public.inventory_balances%ROWTYPE; v_new_available numeric(15,3);
  v_batch_number text; v_expiry_raw text; v_expiry_date date;
  v_batch_lines integer:=0; v_expiry_lines integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to receive purchase orders';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id=p_purchase_order_id AND po.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='purchase order is not available in this organization'; END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid receipt idempotency key';
  END IF;
  IF p_notes IS NOT NULL AND pg_catalog.char_length(p_notes)>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt notes exceed 2000 characters';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.jsonb_array_length(p_lines)<1 OR pg_catalog.jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt must contain between 1 and 100 item quantities';
  END IF;
  v_fingerprint:=pg_catalog.md5(v_po.id::text||'|'||COALESCE(p_notes,'')||'|'||p_lines::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':purchase-receipt:'||p_idempotency_key,0));
  SELECT r.* INTO v_existing FROM public.purchase_receipts r
   WHERE r.organization_id=v_org AND r.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='purchase receipt idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'purchase_order',public.purchase_order_detail(v_existing.purchase_order_id),
      'receipt',pg_catalog.jsonb_build_object('id',v_existing.id,'receipt_number',v_existing.receipt_number,'purchase_order_id',v_existing.purchase_order_id,'received_at',v_existing.received_at),
      'idempotent_replay',true
    );
  END IF;
  IF v_po.status NOT IN ('submitted','partially_received') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only submitted purchase orders with outstanding items can be received';
  END IF;
  -- Serialize stock intake to a warehouse, then lock ordered lines. This prevents concurrent
  -- receipts from racing the same available balance while preserving atomic ledger posting.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':purchase-receiving-warehouse:'||v_po.warehouse_id::text,0));

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF pg_catalog.jsonb_typeof(v_line)<>'object'
       OR pg_catalog.jsonb_typeof(v_line->'item_id')<>'string'
       OR pg_catalog.jsonb_typeof(v_line->'quantity')<>'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each receipt line requires item_id and numeric quantity';
    END IF;
    v_item_id:=(v_line->>'item_id')::uuid; v_qty:=(v_line->>'quantity')::numeric;
    IF v_item_id=ANY(v_seen) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate purchase order line in one receipt'; END IF;
    v_seen:=pg_catalog.array_append(v_seen,v_item_id);
    IF v_qty<=0 OR v_qty>999999999999.999 OR pg_catalog.round(v_qty,3)<>v_qty THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt quantity must be positive with at most three decimals';
    END IF;

    v_batch_number:=NULL;
    IF v_line ? 'batch_number' AND v_line->'batch_number'<>'null'::jsonb THEN
      IF pg_catalog.jsonb_typeof(v_line->'batch_number')<>'string' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='batch number must be text or null';
      END IF;
      v_batch_number:=NULLIF(pg_catalog.btrim(v_line->>'batch_number'),'');
      IF v_batch_number IS NOT NULL AND pg_catalog.char_length(v_batch_number)>100 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='batch number must not exceed 100 characters';
      END IF;
    END IF;

    v_expiry_raw:=NULL;
    v_expiry_date:=NULL;
    IF v_line ? 'expiry_date' AND v_line->'expiry_date'<>'null'::jsonb THEN
      IF pg_catalog.jsonb_typeof(v_line->'expiry_date')<>'string' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expiry date must be an ISO date or null';
      END IF;
      v_expiry_raw:=pg_catalog.btrim(v_line->>'expiry_date');
      IF v_expiry_raw<>'' THEN
        IF v_expiry_raw !~ '^\\d{4}-\\d{2}-\\d{2}$' THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expiry date must use YYYY-MM-DD';
        END IF;
        BEGIN
          v_expiry_date:=v_expiry_raw::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expiry date must be a real calendar date';
        END;
        IF pg_catalog.to_char(v_expiry_date,'YYYY-MM-DD') IS DISTINCT FROM v_expiry_raw THEN
          RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expiry date must be a real calendar date';
        END IF;
      END IF;
    END IF;
    IF v_expiry_date IS NOT NULL THEN
      IF v_batch_number IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a batch number is required when an expiry date is recorded';
      END IF;
      IF v_expiry_date<(pg_catalog.now() AT TIME ZONE 'UTC')::date THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='expired stock cannot be posted into available inventory';
      END IF;
      v_expiry_lines:=v_expiry_lines+1;
    END IF;
    IF v_batch_number IS NOT NULL THEN v_batch_lines:=v_batch_lines+1; END IF;

    SELECT poi.* INTO v_item FROM public.purchase_order_items poi
     WHERE poi.id=v_item_id AND poi.purchase_order_id=v_po.id AND poi.organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='receipt line does not belong to this purchase order'; END IF;
    IF v_item.quantity_received+v_qty>v_item.quantity_ordered THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt quantity exceeds outstanding ordered quantity';
    END IF;
  END LOOP;

  INSERT INTO public.purchase_receipts(
    organization_id,purchase_order_id,receipt_number,warehouse_id,notes,idempotency_key,payload_fingerprint,received_by
  ) VALUES(
    v_org,v_po.id,'PR-'||pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD')||'-'||
      pg_catalog.lpad(pg_catalog.nextval('public.purchase_receipt_number_seq'::regclass)::text,6,'0'),
    v_po.warehouse_id,NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),''),p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING id,receipt_number INTO v_receipt_id,v_receipt_number;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    v_item_id:=(v_line->>'item_id')::uuid; v_qty:=(v_line->>'quantity')::numeric;
    v_batch_number:=NULLIF(pg_catalog.btrim(v_line->>'batch_number'),'');
    v_expiry_date:=CASE
      WHEN v_line ? 'expiry_date' AND v_line->'expiry_date'<>'null'::jsonb AND pg_catalog.btrim(v_line->>'expiry_date')<>'' THEN (v_line->>'expiry_date')::date
      ELSE NULL
    END;
    SELECT poi.* INTO v_item FROM public.purchase_order_items poi
     WHERE poi.id=v_item_id AND poi.purchase_order_id=v_po.id AND poi.organization_id=v_org FOR UPDATE;
    UPDATE public.purchase_order_items SET quantity_received=quantity_received+v_qty
     WHERE id=v_item.id;
    v_seen:=ARRAY[]::uuid[];

    INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point)
    SELECT p.id,v_po.warehouse_id,0,0,COALESCE(p.min_stock,0)
      FROM public.products p WHERE p.id=v_item.product_id AND p.organization_id=v_org
    ON CONFLICT(product_id,warehouse_id) DO NOTHING;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
     WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_po.warehouse_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='could not initialize inventory balance for receipt'; END IF;
    UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand+v_qty,last_movement_at=now(),updated_at=now()
     WHERE id=v_balance.id RETURNING quantity_available INTO v_new_available;

    v_item_id:=v_item.id;
    v_line_total:=CASE WHEN v_item.unit_cost IS NULL THEN NULL ELSE (v_qty*v_item.unit_cost)::numeric(15,2) END;
    IF v_line_total IS NULL THEN v_costs_complete:=false; ELSE v_total:=v_total+v_line_total; END IF;
    INSERT INTO public.purchase_receipt_items(
      organization_id,receipt_id,purchase_order_item_id,product_id,quantity_received,unit_cost,line_total,batch_number,expiry_date
    ) VALUES(v_org,v_receipt_id,v_item.id,v_item.product_id,v_qty,v_item.unit_cost,v_line_total,v_batch_number,v_expiry_date);
    INSERT INTO public.inventory_movements(
      product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
    ) VALUES(v_item.product_id,v_po.warehouse_id,'purchase_receipt',v_qty,v_new_available,'purchase_receipt',v_receipt_id,
      COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),''),'استلام أمر شراء '||v_po.purchase_order_number),v_actor);
  END LOOP;

  UPDATE public.purchase_receipts SET received_cost=CASE WHEN v_costs_complete THEN v_total ELSE NULL END WHERE id=v_receipt_id;
  UPDATE public.purchase_orders po SET
    status=CASE WHEN NOT EXISTS(
      SELECT 1 FROM public.purchase_order_items poi WHERE poi.purchase_order_id=po.id AND poi.quantity_received<poi.quantity_ordered
    ) THEN 'received' ELSE 'partially_received' END,
    updated_at=now()
   WHERE po.id=v_po.id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'purchase_order.received','purchase_receipt',v_receipt_id,
    pg_catalog.jsonb_build_object('purchase_order_id',v_po.id,'prior_status',v_po.status),
    pg_catalog.jsonb_build_object('receipt_number',v_receipt_number,'purchase_order_number',v_po.purchase_order_number,
      'received_lines',pg_catalog.jsonb_array_length(p_lines),
      'batch_tracked_lines',v_batch_lines,
      'expiry_tracked_lines',v_expiry_lines,
      'received_cost',CASE WHEN v_costs_complete THEN v_total ELSE NULL END));

  RETURN pg_catalog.jsonb_build_object(
    'purchase_order',public.purchase_order_detail(v_po.id),
    'receipt',pg_catalog.jsonb_build_object('id',v_receipt_id,'receipt_number',v_receipt_number,'purchase_order_id',v_po.id,'received_at',now()),
    'idempotent_replay',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_purchase_order_receipt_history(
  p_purchase_order_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_total integer;
  v_receipts jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true;

  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL
     OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'admin or manager role required for purchase receipt history';
  END IF;

  IF p_purchase_order_id IS NULL
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 500000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'valid purchase order and receipt history page are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = p_purchase_order_id AND po.organization_id = v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'purchase order is not available in this organization';
  END IF;

  SELECT count(*)::integer INTO v_total
  FROM public.purchase_receipts r
  WHERE r.organization_id = v_org
    AND r.purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', page.id,
        'receipt_number', page.receipt_number,
        'received_at', page.received_at,
        'item_count', page.item_count,
        'items', COALESCE((
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'item_code',poi.item_code_snapshot,
              'product_name',poi.product_name_snapshot,
              'unit',poi.unit_snapshot,
              'quantity_received',ri.quantity_received::text,
              'batch_number',ri.batch_number,
              'expiry_date',CASE WHEN ri.expiry_date IS NULL THEN NULL ELSE pg_catalog.to_char(ri.expiry_date,'YYYY-MM-DD') END
            ) ORDER BY poi.product_name_snapshot,poi.item_code_snapshot,ri.id
          )
          FROM public.purchase_receipt_items ri
          JOIN public.purchase_order_items poi
            ON poi.id=ri.purchase_order_item_id
           AND poi.organization_id=ri.organization_id
           AND poi.purchase_order_id=p_purchase_order_id
          WHERE ri.organization_id=v_org
            AND ri.receipt_id=page.id
        ),'[]'::jsonb)
      ) ORDER BY page.received_at DESC, page.id DESC
    ),
    '[]'::jsonb
  ) INTO v_receipts
  FROM (
    SELECT
      r.id,
      r.receipt_number,
      r.received_at,
      count(ri.id)::integer AS item_count
    FROM public.purchase_receipts r
    LEFT JOIN public.purchase_receipt_items ri
      ON ri.organization_id = r.organization_id
      AND ri.receipt_id = r.id
    WHERE r.organization_id = v_org
      AND r.purchase_order_id = p_purchase_order_id
    GROUP BY r.id, r.receipt_number, r.received_at
    ORDER BY r.received_at DESC, r.id DESC
    LIMIT p_limit OFFSET p_offset
  ) page;

  RETURN pg_catalog.jsonb_build_object(
    'receipts', v_receipts,
    'total_count', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_receipts) < v_total
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_purchase_receipt_print_data(
  p_receipt_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_receipt public.purchase_receipts%ROWTYPE;
  v_purchase_order_number text;
  v_supplier_name text;
  v_warehouse_name text;
  v_currency text;
  v_line_count integer;
  v_line_costs_complete boolean;
  v_line_total numeric(15,2);
  v_costs_complete boolean;
  v_items jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true;

  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL
     OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'admin or manager role required for purchase receipt printing';
  END IF;

  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'purchase receipt ID is required';
  END IF;

  SELECT r.*
    INTO v_receipt
  FROM public.purchase_receipts r
  WHERE r.id = p_receipt_id
    AND r.organization_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'purchase receipt is not available in this organization';
  END IF;

  SELECT po.purchase_order_number, s.name, w.name, o.currency
    INTO v_purchase_order_number, v_supplier_name, v_warehouse_name, v_currency
  FROM public.purchase_orders po
  JOIN public.suppliers s
    ON s.id = po.supplier_id
   AND s.organization_id = po.organization_id
  JOIN public.warehouses w
    ON w.id = v_receipt.warehouse_id
   AND w.organization_id = v_org
  JOIN public.organizations o
    ON o.id = v_org
   AND o.is_active = true
  WHERE po.id = v_receipt.purchase_order_id
    AND po.organization_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'purchase receipt references are unavailable for printing';
  END IF;

  SELECT
    count(*)::integer,
    COALESCE(bool_and(ri.unit_cost IS NOT NULL AND ri.line_total IS NOT NULL), false),
    sum(ri.line_total)::numeric(15,2)
  INTO v_line_count, v_line_costs_complete, v_line_total
  FROM public.purchase_receipt_items ri
  WHERE ri.organization_id = v_org
    AND ri.receipt_id = v_receipt.id;

  IF v_line_count < 1 OR v_line_count > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'purchase receipt item snapshot is outside the supported range';
  END IF;

  v_costs_complete :=
    v_receipt.received_cost IS NOT NULL
    AND v_line_costs_complete
    AND v_line_total IS NOT DISTINCT FROM v_receipt.received_cost;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'item_code', poi.item_code_snapshot,
      'product_name', poi.product_name_snapshot,
      'unit', poi.unit_snapshot,
      'quantity_received', ri.quantity_received::text,
      'batch_number', ri.batch_number,
      'expiry_date', CASE WHEN ri.expiry_date IS NULL THEN NULL ELSE pg_catalog.to_char(ri.expiry_date,'YYYY-MM-DD') END,
      'unit_cost', CASE WHEN v_costs_complete THEN ri.unit_cost::text ELSE NULL END,
      'line_total', CASE WHEN v_costs_complete THEN ri.line_total::text ELSE NULL END
    ) ORDER BY poi.product_name_snapshot, poi.item_code_snapshot, poi.id, ri.id
  ) INTO v_items
  FROM public.purchase_receipt_items ri
  JOIN public.purchase_order_items poi
    ON poi.id = ri.purchase_order_item_id
    AND poi.organization_id = ri.organization_id
    AND poi.purchase_order_id = v_receipt.purchase_order_id
  WHERE ri.organization_id = v_org
    AND ri.receipt_id = v_receipt.id;

  IF v_items IS NULL OR pg_catalog.jsonb_array_length(v_items) <> v_line_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'purchase receipt item snapshot is incomplete';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'receipt_number', v_receipt.receipt_number,
    'purchase_order_number', v_purchase_order_number,
    'supplier_name', v_supplier_name,
    'warehouse_name', v_warehouse_name,
    'received_at', v_receipt.received_at,
    'currency', v_currency,
    'costs_complete', v_costs_complete,
    'received_cost', CASE WHEN v_costs_complete THEN v_receipt.received_cost::text ELSE NULL END,
    'items', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,jsonb,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.fetch_purchase_order_receipt_history(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_order_receipt_history(uuid,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_purchase_receipt_print_data(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_receipt_print_data(uuid) TO authenticated;

COMMENT ON COLUMN public.purchase_receipt_items.batch_number IS
  'Supplier/manufacturer batch identifier captured on the physical receipt; null means the source did not provide one.';
COMMENT ON COLUMN public.purchase_receipt_items.expiry_date IS
  'Expiry date captured on the physical receipt; a date requires a batch number and cannot be expired when posted into available stock.';
COMMENT ON FUNCTION public.receive_purchase_order(uuid,jsonb,text,text) IS
  'Atomic purchase receiving with idempotent batch/expiry metadata capture, balance update, inventory movement and audit event. Batch/expiry remain receipt-line traceability only; available quantity remains the aggregate inventory balance.';
COMMENT ON FUNCTION public.fetch_purchase_order_receipt_history(uuid,integer,integer) IS
  'Manager/admin tenant-scoped saved receipt history, including bounded receipt-line batch and expiry metadata; no direct table access.';
COMMENT ON FUNCTION public.get_purchase_receipt_print_data(uuid) IS
  'Manager/admin tenant-scoped saved receipt print projection with batch/expiry traceability and cost fields withheld unless every line reconciles.';

COMMIT;
