-- AGH-CUSTOMER-RETURN-STATUS-REVOCATION-001
-- Serialize customer return submission with the administrator's customer-status transition.
-- If freezing/blocking commits first, the eligibility query re-checks status after the row-lock wait
-- and denies the return before creating request items, audit rows, or the review task.
BEGIN;

CREATE OR REPLACE FUNCTION public.request_customer_return(
  p_order_id uuid,
  p_lines jsonb,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_customer public.customers%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_existing public.customer_return_requests%ROWTYPE;
  v_request public.customer_return_requests%ROWTYPE;
  v_line jsonb;
  v_item public.order_items%ROWTYPE;
  v_item_id uuid;
  v_qty numeric(15,3);
  v_ordered_qty numeric(15,3);
  v_already_requested numeric(15,3);
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_normalized jsonb := '[]'::jsonb;
  v_line_count integer;
  v_notes text := nullif(pg_catalog.btrim(coalesce(p_notes,'')),'');
  v_reason text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_reason,'')));
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
  v_fingerprint text;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer profile required to request a return';
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers c
   WHERE c.profile_id = v_actor AND c.organization_id = v_org AND c.status = 'approved'
   ORDER BY c.created_at, c.id
   LIMIT 1
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='approved customer account required to request a return';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='order id is required';
  END IF;
  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id = p_order_id AND o.organization_id = v_org AND o.customer_id = v_customer.id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='order not found for the authenticated customer and organization';
  END IF;

  IF v_reason NOT IN ('damaged','wrong_item','missing_item','quality','other') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a supported return reason is required';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.char_length(v_notes) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return notes must be 1000 characters or fewer';
  END IF;
  IF v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a valid 16 to 128 character idempotency key is required';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return lines must be a JSON array';
  END IF;
  v_line_count := pg_catalog.jsonb_array_length(p_lines);
  IF v_line_count < 1 OR v_line_count > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a return request must contain between 1 and 100 lines';
  END IF;

  v_fingerprint := pg_catalog.md5(
    p_order_id::text || '|' || v_reason || '|' || coalesce(v_notes,'') || '|' || p_lines::text
  );
  SELECT r.* INTO v_existing
    FROM public.customer_return_requests r
   WHERE r.organization_id = v_org
     AND r.customer_id = v_customer.id
     AND r.idempotency_key = v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.order_id IS DISTINCT FROM p_order_id
       OR v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return request idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'request_id',v_existing.id,'request_number',v_existing.request_number,
      'status',v_existing.status,'idempotent_replay',true
    );
  END IF;

  IF v_order.status <> 'delivered' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only delivered orders can be submitted for return';
  END IF;

  -- Serialize all requests for one order and reject duplicate/missing line ids or excess quantities.
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) AS entry(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_line) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_line->'order_item_id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number'
       OR coalesce(v_line->>'order_item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='each return line needs an order item UUID and numeric quantity';
    END IF;
    v_item_id := (v_line->>'order_item_id')::uuid;
    IF v_item_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='duplicate order item in return request';
    END IF;
    v_seen_ids := pg_catalog.array_append(v_seen_ids, v_item_id);

    BEGIN
      v_qty := (v_line->>'quantity')::numeric(15,3);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return quantity is outside the supported range';
    END;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 1000000000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return quantity must be positive and within the supported range';
    END IF;
    IF v_qty <> (v_line->>'quantity')::numeric OR pg_catalog.round(v_qty,3) <> v_qty THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return quantity supports at most three decimal places';
    END IF;

    SELECT oi.* INTO v_item
      FROM public.order_items oi
     WHERE oi.id = v_item_id AND oi.order_id = v_order.id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='return item does not belong to the authenticated order';
    END IF;
    v_ordered_qty := coalesce(v_item.approved_quantity,v_item.quantity);
    SELECT coalesce(sum(ri.requested_quantity),0)::numeric(15,3) INTO v_already_requested
      FROM public.customer_return_request_items ri
      JOIN public.customer_return_requests rr ON rr.id = ri.return_request_id
     WHERE ri.order_item_id = v_item.id
       AND rr.organization_id = v_org
       AND rr.status IN ('submitted','under_review','approved','received','closed');
    IF v_qty + v_already_requested > v_ordered_qty THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return quantity exceeds the remaining returnable quantity';
    END IF;
    v_normalized := v_normalized || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('order_item_id',v_item.id,'quantity',v_qty)
    );
  END LOOP;

  INSERT INTO public.customer_return_requests(
    organization_id,customer_id,order_id,request_number,status,reason,notes,
    requested_by,idempotency_key,payload_fingerprint
  ) VALUES (
    v_org,v_customer.id,v_order.id,
    'RET-' || pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD') || '-' ||
      pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
    'submitted',v_reason,v_notes,v_actor,v_key,v_fingerprint
  ) RETURNING * INTO v_request;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(v_normalized) AS entry(value)
  LOOP
    INSERT INTO public.customer_return_request_items(
      organization_id,return_request_id,order_item_id,product_id,
      item_code_snapshot,product_name_snapshot,unit_snapshot,requested_quantity
    )
    SELECT v_org,v_request.id,oi.id,oi.product_id,oi.item_code,oi.product_name_snapshot,
           oi.unit_snapshot,(v_line->>'quantity')::numeric
      FROM public.order_items oi
     WHERE oi.id = (v_line->>'order_item_id')::uuid
       AND oi.order_id = v_order.id;
  END LOOP;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (
    v_org,v_actor,'customer_return.requested','customer_return_request',v_request.id,NULL,
    pg_catalog.jsonb_build_object(
      'request_number',v_request.request_number,'order_id',v_order.id,
      'reason',v_reason,'status',v_request.status,'line_count',v_line_count
    )
  );

  PERFORM public.upsert_operational_task(
    v_org,
    'مراجعة طلب مرتجع ' || v_request.request_number,
    'مراجعة سبب وكمية المرتجع وقرار القبول. الطلب الأصلي: ' || v_order.order_number,
    'management','high','customer_return_request',
    'customer-return-review:' || v_request.id::text,
    'customer_return_requests',v_request.id,
    pg_catalog.now() + interval '2 days',
    pg_catalog.jsonb_build_object(
      'return_request_id',v_request.id,'request_number',v_request.request_number,
      'order_id',v_order.id,'order_number',v_order.order_number
    ),false
  );

  RETURN pg_catalog.jsonb_build_object(
    'request_id',v_request.id,'request_number',v_request.request_number,
    'status',v_request.status,'idempotent_replay',false
  );
END;
$function$;

COMMENT ON FUNCTION public.request_customer_return(uuid,jsonb,text,text,text) IS
  'Customer-owned delivered-order return intake with line ownership, remaining quantity, idempotency and tenant guards; locks the approved customer row so status changes serialize at the mutation boundary.';

COMMIT;
