-- NASR1-ORIGINAL-SPEC-RETURNS-INTAKE-001
-- Customer return intake and manager decision. Receipt is a separate warehouse event:
-- this migration deliberately does NOT adjust stock or ledger balances on request/approval.
CREATE TABLE IF NOT EXISTS public.customer_return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  request_number text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected','received','closed','cancelled')),
  reason text NOT NULL
    CHECK (reason IN ('damaged','wrong_item','missing_item','quality','other')),
  notes text,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text,
  idempotency_key text NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customer_return_requests_org_number_unique UNIQUE (organization_id, request_number),
  CONSTRAINT customer_return_requests_org_customer_key_unique UNIQUE (organization_id, customer_id, idempotency_key),
  CONSTRAINT customer_return_requests_org_id_unique UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS public.customer_return_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  return_request_id uuid NOT NULL,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  item_code_snapshot text,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  requested_quantity numeric(15,3) NOT NULL CHECK (requested_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customer_return_request_items_request_order_item_unique UNIQUE (return_request_id, order_item_id),
  CONSTRAINT customer_return_request_items_org_request_fk
    FOREIGN KEY (organization_id, return_request_id)
    REFERENCES public.customer_return_requests(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS customer_return_requests_org_status_created_idx
  ON public.customer_return_requests(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_return_requests_customer_order_idx
  ON public.customer_return_requests(customer_id, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_return_request_items_order_item_idx
  ON public.customer_return_request_items(order_item_id, created_at DESC);

ALTER TABLE public.customer_return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_return_request_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_return_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_return_request_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.customer_return_requests TO authenticated;
GRANT SELECT ON TABLE public.customer_return_request_items TO authenticated;
GRANT ALL ON TABLE public.customer_return_requests TO service_role;
GRANT ALL ON TABLE public.customer_return_request_items TO service_role;

DROP POLICY IF EXISTS customer_return_requests_scoped_read ON public.customer_return_requests;
CREATE POLICY customer_return_requests_scoped_read
  ON public.customer_return_requests FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND (
      public.operational_tasks_can_manage()
      OR EXISTS (
        SELECT 1 FROM public.customers c
         WHERE c.id = customer_return_requests.customer_id
           AND c.organization_id = customer_return_requests.organization_id
           AND c.profile_id = public.current_profile_id()
      )
    )
  );

DROP POLICY IF EXISTS customer_return_request_items_scoped_read ON public.customer_return_request_items;
CREATE POLICY customer_return_request_items_scoped_read
  ON public.customer_return_request_items FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.customer_return_requests r
       WHERE r.id = customer_return_request_items.return_request_id
         AND r.organization_id = customer_return_request_items.organization_id
         AND (
           public.operational_tasks_can_manage()
           OR EXISTS (
             SELECT 1 FROM public.customers c
              WHERE c.id = r.customer_id
                AND c.organization_id = r.organization_id
                AND c.profile_id = public.current_profile_id()
           )
         )
    )
  );

-- Never trust a client-supplied order total, customer id, organization id, product snapshot,
-- or eligibility state. The server resolves all of them from the authenticated profile/order.
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
   ORDER BY c.created_at, c.id LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.list_my_customer_return_requests(p_order_id uuid)
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
  v_requests jsonb;
  v_returnable_items jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer profile required to read return requests';
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers c
   WHERE c.profile_id = v_actor AND c.organization_id = v_org AND c.status = 'approved'
   ORDER BY c.created_at,c.id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='approved customer account required to read return requests';
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id = p_order_id AND o.organization_id = v_org AND o.customer_id = v_customer.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='order not found for the authenticated customer and organization';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',r.id,'request_number',r.request_number,'status',r.status,'reason',r.reason,
        'notes',r.notes,'review_note',r.review_note,'created_at',r.created_at,
        'items',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'order_item_id',ri.order_item_id,'item_code',ri.item_code_snapshot,
            'product_name',ri.product_name_snapshot,'unit',ri.unit_snapshot,
            'requested_quantity',ri.requested_quantity
          ) ORDER BY ri.created_at,ri.id)
          FROM public.customer_return_request_items ri
          WHERE ri.return_request_id = r.id AND ri.organization_id = v_org
        ),'[]'::jsonb)
      ) ORDER BY r.created_at DESC,r.id DESC
    ),'[]'::jsonb
  ) INTO v_requests
  FROM public.customer_return_requests r
  WHERE r.organization_id = v_org AND r.customer_id = v_customer.id AND r.order_id = v_order.id;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'order_item_id',oi.id,
        'item_code',oi.item_code,
        'product_name',oi.product_name_snapshot,
        'unit',oi.unit_snapshot,
        'ordered_quantity',coalesce(oi.approved_quantity,oi.quantity),
        'already_requested_quantity',coalesce(requested.total_quantity,0),
        'remaining_quantity',CASE WHEN v_order.status='delivered'
          THEN greatest(coalesce(oi.approved_quantity,oi.quantity)-coalesce(requested.total_quantity,0),0)
          ELSE 0 END
      ) ORDER BY oi.created_at,oi.id
    ),'[]'::jsonb
  ) INTO v_returnable_items
  FROM public.order_items oi
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(ri.requested_quantity),0)::numeric(15,3) AS total_quantity
      FROM public.customer_return_request_items ri
      JOIN public.customer_return_requests rr ON rr.id = ri.return_request_id
     WHERE ri.order_item_id = oi.id AND rr.organization_id = v_org
       AND rr.status IN ('submitted','under_review','approved','received','closed')
  ) requested ON true
  WHERE oi.order_id = v_order.id;

  RETURN pg_catalog.jsonb_build_object(
    'order_status',v_order.status,
    'requests',v_requests,
    'returnable_items',v_returnable_items
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_customer_return_review_queue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid := public.current_organization_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to review customer returns';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return review page limit must be between 1 and 100';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',queued.id,'request_number',queued.request_number,'status',queued.status,
        'reason',queued.reason,'notes',queued.notes,'created_at',queued.created_at,
        'order_id',queued.order_id,'order_number',queued.order_number,
        'customer_name',queued.customer_name,'customer_code',queued.customer_code,
        'items',queued.items
      ) ORDER BY queued.created_at,queued.id
    ),'[]'::jsonb
  ) INTO v_result
  FROM (
    SELECT r.id,r.request_number,r.status,r.reason,r.notes,r.created_at,r.order_id,
           o.order_number,c.business_name AS customer_name,c.customer_code,
           coalesce((
             SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'item_code',ri.item_code_snapshot,'product_name',ri.product_name_snapshot,
               'unit',ri.unit_snapshot,'requested_quantity',ri.requested_quantity
             ) ORDER BY ri.created_at,ri.id)
             FROM public.customer_return_request_items ri
             WHERE ri.return_request_id = r.id AND ri.organization_id = v_org
           ),'[]'::jsonb) AS items
      FROM public.customer_return_requests r
      JOIN public.orders o ON o.id = r.order_id AND o.organization_id = r.organization_id
      JOIN public.customers c ON c.id = r.customer_id AND c.organization_id = r.organization_id
     WHERE r.organization_id = v_org AND r.status IN ('submitted','under_review')
     ORDER BY r.created_at,r.id
     LIMIT p_limit
  ) queued;
  RETURN coalesce(v_result,'[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_customer_return_request(
  p_return_request_id uuid,
  p_decision text,
  p_review_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_request public.customer_return_requests%ROWTYPE;
  v_decision text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_decision,'')));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_review_note,'')),'');
  v_previous_status text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to decide a return request';
  END IF;
  IF p_return_request_id IS NULL OR v_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return decision must be approved or rejected';
  END IF;
  IF v_note IS NULL OR pg_catalog.char_length(v_note) < 5 OR pg_catalog.char_length(v_note) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='review note must contain between 5 and 1000 characters';
  END IF;

  SELECT r.* INTO v_request
    FROM public.customer_return_requests r
   WHERE r.id = p_return_request_id AND r.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='return request not found in the current organization';
  END IF;

  IF v_request.status IN ('approved','rejected') THEN
    IF v_request.status = v_decision AND v_request.review_note = v_note THEN
      RETURN pg_catalog.jsonb_build_object(
        'request_id',v_request.id,'request_number',v_request.request_number,
        'status',v_request.status,'idempotent_replay',true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return request has already been reviewed';
  END IF;
  IF v_request.status NOT IN ('submitted','under_review') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return request is not open for review';
  END IF;
  v_previous_status := v_request.status;

  UPDATE public.customer_return_requests
     SET status = v_decision, reviewed_by = v_actor, reviewed_at = pg_catalog.now(),
         review_note = v_note, updated_at = pg_catalog.now()
   WHERE id = v_request.id
   RETURNING * INTO v_request;

  UPDATE public.ai_tasks t
     SET status = 'completed', completed_at = pg_catalog.now(), completed_by = v_actor,
         resolution_note = 'تم اتخاذ قرار بشأن المرتجع: ' || v_decision || '. ' || v_note,
         updated_at = pg_catalog.now()
   WHERE t.organization_id = v_org
     AND t.source_event_key = 'customer-return-review:' || v_request.id::text
     AND t.status NOT IN ('completed','cancelled');

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (
    v_org,v_actor,'customer_return.reviewed','customer_return_request',v_request.id,
    pg_catalog.jsonb_build_object('status',v_previous_status),
    pg_catalog.jsonb_build_object(
      'request_number',v_request.request_number,'status',v_request.status,
      'review_note',v_note,'order_id',v_request.order_id
    )
  );

  IF v_decision = 'approved' THEN
    PERFORM public.upsert_operational_task(
      v_org,
      'استلام وفحص مرتجع ' || v_request.request_number,
      'تمت الموافقة على طلب المرتجع. افحص الكميات والحالة الفعلية قبل أي حركة مخزون أو قيد مالي.',
      'warehouse','high','customer_return_receipt',
      'customer-return-receipt:' || v_request.id::text,
      'customer_return_requests',v_request.id,
      pg_catalog.now() + interval '2 days',
      pg_catalog.jsonb_build_object('return_request_id',v_request.id,'request_number',v_request.request_number),
      false
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'request_id',v_request.id,'request_number',v_request.request_number,
    'status',v_request.status,'idempotent_replay',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_customer_return(uuid,jsonb,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_customer_return_requests(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_customer_return_review_queue(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_customer_return_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_customer_return(uuid,jsonb,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_customer_return_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_customer_return_review_queue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_customer_return_request(uuid,text,text) TO authenticated;

COMMENT ON TABLE public.customer_return_requests IS
  'Tenant-scoped customer return/RMA requests. Approval authorizes physical inspection only; it does not adjust stock or accounting.';
COMMENT ON FUNCTION public.request_customer_return(uuid,jsonb,text,text,text) IS
  'Customer-owned delivered-order return intake with line ownership, remaining quantity, idempotency, tenant and audit guards.';
COMMENT ON FUNCTION public.review_customer_return_request(uuid,text,text) IS
  'Admin/manager-only return-request approval/rejection with mandatory audited rationale and a warehouse inspection task on approval.';
