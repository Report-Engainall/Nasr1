-- Customer-controlled cancellation before the return review work has started.
-- Cancellation closes the linked review task atomically. It never receives stock,
-- changes an invoice, posts a credit memo, refunds money or changes the original order.
BEGIN;

ALTER TABLE public.customer_return_requests
  ADD COLUMN IF NOT EXISTS customer_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_cancellation_reason text;

CREATE OR REPLACE FUNCTION public.cancel_customer_return_request(
  p_return_request_id uuid,
  p_reason text
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
  v_request public.customer_return_requests%ROWTYPE;
  v_task public.ai_tasks%ROWTYPE;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer profile required to cancel a return request';
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers c
   WHERE c.profile_id=v_actor
     AND c.organization_id=v_org
     AND c.status='approved'
   ORDER BY c.created_at,c.id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='approved customer account required to cancel a return request';
  END IF;

  IF p_return_request_id IS NULL
     OR pg_catalog.char_length(v_reason)<3
     OR pg_catalog.char_length(v_reason)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='return request ID and a cancellation reason of 3 to 500 characters are required';
  END IF;

  SELECT r.* INTO v_request
    FROM public.customer_return_requests r
   WHERE r.id=p_return_request_id
     AND r.organization_id=v_org
     AND r.customer_id=v_customer.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='return request is unavailable for the authenticated customer';
  END IF;

  IF v_request.status='cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'request_id',v_request.id,
      'request_number',v_request.request_number,
      'status',v_request.status,
      'customer_cancelled_at',v_request.customer_cancelled_at,
      'customer_cancellation_reason',v_request.customer_cancellation_reason,
      'idempotent_replay',true
    );
  END IF;

  IF v_request.status<>'submitted' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='a return request can only be cancelled before review starts';
  END IF;

  -- The request and its management-review task share one source key. Refuse
  -- cancellation once a reviewer has started or completed the linked task.
  SELECT t.* INTO v_task
    FROM public.ai_tasks t
   WHERE t.organization_id=v_org
     AND t.source_event_key='customer-return-review:' || v_request.id::text
   FOR UPDATE;

  IF NOT FOUND OR v_task.status<>'pending' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='the return review has already started; contact the review team';
  END IF;

  UPDATE public.ai_tasks
     SET status='cancelled',
         completed_at=NULL,
         completed_by=NULL,
         resolution_note='ألغى العميل طلب المرتجع قبل بدء المراجعة: ' || v_reason,
         task_payload=coalesce(task_payload,'{}'::jsonb) || pg_catalog.jsonb_build_object(
           'source_cancellation',
           pg_catalog.jsonb_build_object(
             'source','customer_return_request',
             'reason',v_reason,
             'cancelled_at',v_now,
             'cancelled_by',v_actor
           )
         ),
         updated_at=v_now
   WHERE id=v_task.id
     AND organization_id=v_org
     AND status='pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='the review task changed while the cancellation was being processed';
  END IF;

  UPDATE public.customer_return_requests
     SET status='cancelled',
         customer_cancelled_at=v_now,
         customer_cancellation_reason=v_reason,
         updated_at=v_now
   WHERE id=v_request.id
     AND organization_id=v_org
     AND customer_id=v_customer.id
     AND status='submitted'
   RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='the return request changed while cancellation was being processed';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_org,v_actor,'customer_return.cancelled','customer_return_request',v_request.id,
    pg_catalog.jsonb_build_object('status','submitted'),
    pg_catalog.jsonb_build_object(
      'request_number',v_request.request_number,
      'order_id',v_request.order_id,
      'status','cancelled',
      'reason',v_reason,
      'cancelled_at',v_now,
      'review_task_id',v_task.id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'request_id',v_request.id,
    'request_number',v_request.request_number,
    'status',v_request.status,
    'customer_cancelled_at',v_request.customer_cancelled_at,
    'customer_cancellation_reason',v_request.customer_cancellation_reason,
    'idempotent_replay',false
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
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer profile required to read return requests';
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers c
   WHERE c.profile_id=v_actor
     AND c.organization_id=v_org
     AND c.status='approved'
   ORDER BY c.created_at,c.id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='approved customer account required to read return requests';
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id=p_order_id
     AND o.organization_id=v_org
     AND o.customer_id=v_customer.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='order not found for the authenticated customer and organization';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',r.id,
        'request_number',r.request_number,
        'status',r.status,
        'reason',r.reason,
        'notes',r.notes,
        'review_note',r.review_note,
        'customer_cancelled_at',r.customer_cancelled_at,
        'customer_cancellation_reason',r.customer_cancellation_reason,
        'created_at',r.created_at,
        'items',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'order_item_id',ri.order_item_id,
            'item_code',ri.item_code_snapshot,
            'product_name',ri.product_name_snapshot,
            'unit',ri.unit_snapshot,
            'requested_quantity',ri.requested_quantity
          ) ORDER BY ri.created_at,ri.id)
            FROM public.customer_return_request_items ri
           WHERE ri.return_request_id=r.id
             AND ri.organization_id=v_org
        ),'[]'::jsonb)
      ) ORDER BY r.created_at DESC,r.id DESC
    ),'[]'::jsonb
  )
  INTO v_requests
  FROM public.customer_return_requests r
  WHERE r.organization_id=v_org
    AND r.customer_id=v_customer.id
    AND r.order_id=v_order.id;

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
  )
  INTO v_returnable_items
  FROM public.order_items oi
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(ri.requested_quantity),0)::numeric(15,3) AS total_quantity
      FROM public.customer_return_request_items ri
      JOIN public.customer_return_requests rr ON rr.id=ri.return_request_id
     WHERE ri.order_item_id=oi.id
       AND rr.organization_id=v_org
       AND rr.status IN ('submitted','under_review','approved','received','closed')
  ) requested ON true
  WHERE oi.order_id=v_order.id;

  RETURN pg_catalog.jsonb_build_object(
    'order_status',v_order.status,
    'requests',v_requests,
    'returnable_items',v_returnable_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_customer_return_request(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_customer_return_request(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_customer_return_requests(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_my_customer_return_requests(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_customer_return_request(uuid,text) IS
  'Customer-owned cancellation of a submitted return request before review starts; atomically cancels its pending management task and records a same-tenant audit event. No stock, invoice, credit memo or refund mutation.';
COMMENT ON FUNCTION public.list_my_customer_return_requests(uuid) IS
  'Customer-owned same-tenant return history and returnable quantities; includes customer cancellation time/reason and excludes cancelled quantities from the reserved return request total.';

COMMIT;
