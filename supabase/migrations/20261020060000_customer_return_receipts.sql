-- NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002
-- Physical receipt and inspection for approved customer returns.
-- Only inspected saleable quantity enters available stock; defective quantity remains quarantined in the receipt record.
-- Credit memo and general-ledger posting are intentionally a separate, explicit follow-up transaction.
CREATE TABLE IF NOT EXISTS public.customer_return_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  return_request_id uuid NOT NULL REFERENCES public.customer_return_requests(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  notes text,
  idempotency_key text NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  received_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customer_return_receipts_org_number_unique UNIQUE (organization_id, receipt_number),
  CONSTRAINT customer_return_receipts_org_key_unique UNIQUE (organization_id, idempotency_key),
  CONSTRAINT customer_return_receipts_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT customer_return_receipts_org_request_fk
    FOREIGN KEY (organization_id, return_request_id)
    REFERENCES public.customer_return_requests(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.customer_return_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  receipt_id uuid NOT NULL,
  return_request_id uuid NOT NULL REFERENCES public.customer_return_requests(id) ON DELETE RESTRICT,
  request_item_id uuid NOT NULL REFERENCES public.customer_return_request_items(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  item_code_snapshot text,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  received_quantity numeric(15,3) NOT NULL CHECK (received_quantity > 0),
  restockable_quantity numeric(15,3) NOT NULL CHECK (restockable_quantity >= 0),
  defective_quantity numeric(15,3) NOT NULL CHECK (defective_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customer_return_receipt_items_quantity_partition_check
    CHECK (restockable_quantity + defective_quantity = received_quantity),
  CONSTRAINT customer_return_receipt_items_receipt_line_unique UNIQUE (receipt_id, request_item_id),
  CONSTRAINT customer_return_receipt_items_org_receipt_fk
    FOREIGN KEY (organization_id, receipt_id)
    REFERENCES public.customer_return_receipts(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_return_receipt_items_org_request_fk
    FOREIGN KEY (organization_id, return_request_id)
    REFERENCES public.customer_return_requests(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS customer_return_receipts_request_received_idx
  ON public.customer_return_receipts(organization_id, return_request_id, received_at DESC);
CREATE INDEX IF NOT EXISTS customer_return_receipt_items_request_line_idx
  ON public.customer_return_receipt_items(organization_id, request_item_id, created_at DESC);

ALTER TABLE public.customer_return_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_return_receipt_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_return_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_return_receipt_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.customer_return_receipts TO service_role;
GRANT ALL ON TABLE public.customer_return_receipt_items TO service_role;

CREATE OR REPLACE FUNCTION public.list_customer_return_receipt_queue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required to receive customer returns';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return receipt queue limit must be between 1 and 100';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'warehouses', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',w.id,'name',w.name,'code',w.code
      ) ORDER BY w.name,w.id)
        FROM public.warehouses w
       WHERE w.organization_id = v_org AND w.is_active
    ),'[]'::jsonb),
    'requests', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,
        'request_number',r.request_number,
        'order_number',o.order_number,
        'customer_name',c.business_name,
        'created_at',r.created_at,
        'items',COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'request_item_id',pending.id,
            'product_id',pending.product_id,
            'item_code',pending.item_code_snapshot,
            'product_name',pending.product_name_snapshot,
            'unit',pending.unit_snapshot,
            'requested_quantity',pending.requested_quantity,
            'received_quantity',pending.received_quantity,
            'remaining_quantity',(pending.requested_quantity-pending.received_quantity)
          ) ORDER BY pending.created_at,pending.id)
          FROM (
            SELECT ri.*,
              COALESCE((
                SELECT pg_catalog.sum(ci.received_quantity)
                  FROM public.customer_return_receipt_items ci
                 WHERE ci.organization_id=v_org AND ci.request_item_id=ri.id
              ),0)::numeric(15,3) AS received_quantity
              FROM public.customer_return_request_items ri
             WHERE ri.organization_id=v_org AND ri.return_request_id=r.id
          ) pending
          WHERE pending.requested_quantity > pending.received_quantity
        ),'[]'::jsonb)
      ) ORDER BY r.created_at,r.id)
      FROM (
        SELECT rr.*
          FROM public.customer_return_requests rr
         WHERE rr.organization_id=v_org AND rr.status='approved'
           AND EXISTS (
             SELECT 1
               FROM public.customer_return_request_items ri
              WHERE ri.organization_id=v_org AND ri.return_request_id=rr.id
                AND ri.requested_quantity > COALESCE((
                  SELECT pg_catalog.sum(ci.received_quantity)
                    FROM public.customer_return_receipt_items ci
                   WHERE ci.organization_id=v_org AND ci.request_item_id=ri.id
                ),0)
           )
         ORDER BY rr.created_at,rr.id
         LIMIT p_limit
      ) r
      JOIN public.orders o ON o.id=r.order_id AND o.organization_id=r.organization_id
      JOIN public.customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.receive_customer_return(
  p_return_request_id uuid,
  p_warehouse_id uuid,
  p_lines jsonb,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_request public.customer_return_requests%ROWTYPE;
  v_existing public.customer_return_receipts%ROWTYPE;
  v_request_item public.customer_return_request_items%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_line jsonb;
  v_request_item_id uuid;
  v_received numeric;
  v_restockable numeric;
  v_defective numeric;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_normalized jsonb := '[]'::jsonb;
  v_line_count integer := 0;
  v_key text := pg_catalog.btrim(COALESCE(p_idempotency_key,''));
  v_notes text := nullif(pg_catalog.btrim(COALESCE(p_notes,'')),'');
  v_fingerprint text;
  v_receipt_id uuid;
  v_receipt_number text;
  v_receipt_status text;
  v_new_available numeric(15,3);
  v_received_total numeric(15,3) := 0;
  v_restockable_total numeric(15,3) := 0;
  v_defective_total numeric(15,3) := 0;
  v_prior_received numeric(15,3);
  v_result_line_count integer;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required to receive customer returns';
  END IF;
  IF p_return_request_id IS NULL OR p_warehouse_id IS NULL
     OR v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return request, warehouse and a valid idempotency key are required';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='receipt notes must be 2000 characters or fewer';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_lines)<1 OR pg_catalog.jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='receipt must contain between 1 and 100 return-item lines';
  END IF;

  FOR v_line IN
    SELECT value
      FROM pg_catalog.jsonb_array_elements(p_lines) AS entry(value)
     ORDER BY value->>'request_item_id'
  LOOP
    IF pg_catalog.jsonb_typeof(v_line) IS DISTINCT FROM 'object'
       OR v_line - 'request_item_id' - 'received_quantity' - 'restockable_quantity' <> '{}'::jsonb
       OR pg_catalog.jsonb_typeof(v_line->'request_item_id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_line->'received_quantity') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(v_line->'restockable_quantity') IS DISTINCT FROM 'number'
       OR COALESCE(v_line->>'request_item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='each receipt line must contain only request_item_id, received_quantity and restockable_quantity';
    END IF;
    v_request_item_id := (v_line->>'request_item_id')::uuid;
    IF v_request_item_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='duplicate return item in one receipt';
    END IF;
    v_seen_ids := pg_catalog.array_append(v_seen_ids,v_request_item_id);
    BEGIN
      v_received := (v_line->>'received_quantity')::numeric;
      v_restockable := (v_line->>'restockable_quantity')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='receipt quantities must be numeric';
    END;
    IF v_received::text IN ('NaN','Infinity','-Infinity')
       OR v_restockable::text IN ('NaN','Infinity','-Infinity')
       OR v_received<=0 OR v_received>999999999999.999
       OR v_restockable<0 OR v_restockable>v_received
       OR pg_catalog.round(v_received,3)<>v_received
       OR pg_catalog.round(v_restockable,3)<>v_restockable THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='received and restockable quantities must be finite, within range and use at most three decimal places';
    END IF;
    v_defective := v_received-v_restockable;
    v_normalized := v_normalized || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'request_item_id',v_request_item_id,
      'received_quantity',v_received,
      'restockable_quantity',v_restockable,
      'defective_quantity',v_defective
    ));
    v_line_count := v_line_count+1;
  END LOOP;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'return_request_id',p_return_request_id,'warehouse_id',p_warehouse_id,
    'notes',v_notes,'lines',v_normalized
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':customer-return-receipt:'||v_key,0)
  );
  SELECT r.* INTO v_existing
    FROM public.customer_return_receipts r
   WHERE r.organization_id=v_org AND r.idempotency_key=v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer return receipt idempotency key payload conflict';
    END IF;
    SELECT rr.status INTO v_receipt_status
      FROM public.customer_return_requests rr
     WHERE rr.id=v_existing.return_request_id AND rr.organization_id=v_org;
    SELECT count(*)::integer,
           COALESCE(sum(i.received_quantity),0)::numeric(15,3),
           COALESCE(sum(i.restockable_quantity),0)::numeric(15,3),
           COALESCE(sum(i.defective_quantity),0)::numeric(15,3)
      INTO v_result_line_count,v_received_total,v_restockable_total,v_defective_total
      FROM public.customer_return_receipt_items i
     WHERE i.organization_id=v_org AND i.receipt_id=v_existing.id;
    RETURN pg_catalog.jsonb_build_object(
      'receipt_id',v_existing.id,'receipt_number',v_existing.receipt_number,
      'request_id',v_existing.return_request_id,'request_status',v_receipt_status,
      'received_line_count',v_result_line_count,'received_quantity',v_received_total,
      'restockable_quantity',v_restockable_total,'defective_quantity',v_defective_total,
      'idempotent_replay',true
    );
  END IF;

  SELECT rr.* INTO v_request
    FROM public.customer_return_requests rr
   WHERE rr.id=p_return_request_id AND rr.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND OR v_request.status<>'approved' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='only an approved return request in the current organization can be received';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses w
     WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='warehouse is not active in the current organization';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':customer-return-receiving-warehouse:'||p_warehouse_id::text,0)
  );

  v_receipt_id := gen_random_uuid();
  v_receipt_number := 'RETREC-'||pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD')||'-'||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_receipt_id::text,'-',''),1,8));
  INSERT INTO public.customer_return_receipts(
    id,organization_id,return_request_id,receipt_number,warehouse_id,notes,
    idempotency_key,payload_fingerprint,received_by
  ) VALUES (
    v_receipt_id,v_org,v_request.id,v_receipt_number,p_warehouse_id,v_notes,
    v_key,v_fingerprint,v_actor
  );

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(v_normalized) AS entry(value)
  LOOP
    v_request_item_id := (v_line->>'request_item_id')::uuid;
    v_received := (v_line->>'received_quantity')::numeric;
    v_restockable := (v_line->>'restockable_quantity')::numeric;
    v_defective := (v_line->>'defective_quantity')::numeric;
    SELECT ri.* INTO v_request_item
      FROM public.customer_return_request_items ri
     WHERE ri.id=v_request_item_id
       AND ri.organization_id=v_org
       AND ri.return_request_id=v_request.id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='return item does not belong to this approved request and organization';
    END IF;
    SELECT COALESCE(sum(i.received_quantity),0)::numeric(15,3)
      INTO v_prior_received
      FROM public.customer_return_receipt_items i
     WHERE i.organization_id=v_org AND i.request_item_id=v_request_item.id;
    IF v_prior_received+v_received>v_request_item.requested_quantity THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='received quantity exceeds the approved remaining return quantity';
    END IF;
    IF v_restockable>0 AND v_request_item.product_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='an unlinked product cannot be restocked; record the received quantity as defective or resolve the product mapping first';
    END IF;

    INSERT INTO public.customer_return_receipt_items(
      organization_id,receipt_id,return_request_id,request_item_id,product_id,
      item_code_snapshot,product_name_snapshot,unit_snapshot,
      received_quantity,restockable_quantity,defective_quantity
    ) VALUES (
      v_org,v_receipt_id,v_request.id,v_request_item.id,v_request_item.product_id,
      v_request_item.item_code_snapshot,v_request_item.product_name_snapshot,v_request_item.unit_snapshot,
      v_received,v_restockable,v_defective
    );
    v_received_total:=v_received_total+v_received;
    v_restockable_total:=v_restockable_total+v_restockable;
    v_defective_total:=v_defective_total+v_defective;

    IF v_restockable>0 THEN
      INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point)
      SELECT p.id,p_warehouse_id,0,0,COALESCE(p.min_stock,0)
        FROM public.products p
       WHERE p.id=v_request_item.product_id AND p.organization_id=v_org
      ON CONFLICT(product_id,warehouse_id) DO NOTHING;
      SELECT ib.* INTO v_balance
        FROM public.inventory_balances ib
       WHERE ib.product_id=v_request_item.product_id AND ib.warehouse_id=p_warehouse_id
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='could not initialize inventory balance for customer return receipt';
      END IF;
      UPDATE public.inventory_balances
         SET quantity_on_hand=quantity_on_hand+v_restockable,
             last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
       WHERE id=v_balance.id
       RETURNING quantity_available INTO v_new_available;
      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,
        reference_type,reference_id,reason,created_by
      ) VALUES (
        v_request_item.product_id,p_warehouse_id,'customer_return_receipt',
        v_restockable,v_new_available,'customer_return_receipt',v_receipt_id,
        'كمية صالحة للبيع بعد فحص المرتجع '||v_request.request_number,v_actor
      );
    END IF;
  END LOOP;

  UPDATE public.customer_return_requests rr
     SET status=CASE WHEN NOT EXISTS (
       SELECT 1
         FROM public.customer_return_request_items ri
        WHERE ri.organization_id=v_org AND ri.return_request_id=v_request.id
          AND ri.requested_quantity>COALESCE((
            SELECT pg_catalog.sum(ci.received_quantity)
              FROM public.customer_return_receipt_items ci
             WHERE ci.organization_id=v_org AND ci.request_item_id=ri.id
          ),0)
     ) THEN 'received' ELSE 'approved' END,
         updated_at=pg_catalog.now()
   WHERE rr.id=v_request.id AND rr.organization_id=v_org
   RETURNING rr.status INTO v_receipt_status;

  IF v_receipt_status='received' THEN
    UPDATE public.ai_tasks t
       SET status='completed',completed_at=pg_catalog.now(),completed_by=v_actor,
           resolution_note='اكتمل الاستلام الفعلي وفحص المرتجع '||v_request.request_number,
           updated_at=pg_catalog.now()
     WHERE t.organization_id=v_org
       AND t.source_event_key='customer-return-receipt:'||v_request.id::text
       AND t.status NOT IN ('completed','cancelled');
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (
    v_org,v_actor,'customer_return.received','customer_return_receipt',v_receipt_id,
    pg_catalog.jsonb_build_object('request_id',v_request.id,'request_status','approved'),
    pg_catalog.jsonb_build_object(
      'receipt_number',v_receipt_number,'request_number',v_request.request_number,
      'request_status',v_receipt_status,'warehouse_id',p_warehouse_id,
      'received_line_count',v_line_count,'received_quantity',v_received_total,
      'restockable_quantity',v_restockable_total,'defective_quantity',v_defective_total
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'receipt_id',v_receipt_id,'receipt_number',v_receipt_number,
    'request_id',v_request.id,'request_number',v_request.request_number,
    'request_status',v_receipt_status,'received_line_count',v_line_count,
    'received_quantity',v_received_total,'restockable_quantity',v_restockable_total,
    'defective_quantity',v_defective_total,'idempotent_replay',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_customer_return_receipt_queue(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.receive_customer_return(uuid,uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_customer_return_receipt_queue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_customer_return(uuid,uuid,jsonb,text,text) TO authenticated;

COMMENT ON TABLE public.customer_return_receipts IS
  'Tenant-scoped physical return receipts. No credit memo or journal is created by receiving stock.';
COMMENT ON TABLE public.customer_return_receipt_items IS
  'Line-level inspected quantity split between saleable restock and defective quarantine; only restockable quantity moves into saleable inventory.';
COMMENT ON FUNCTION public.receive_customer_return(uuid,uuid,jsonb,text,text) IS
  'Admin/manager-only, tenant-scoped idempotent physical receipt with remaining-quantity guards, audited stock movement, and no implicit accounting posting.';
