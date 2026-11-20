BEGIN;

-- BODY-072: bind amendment idempotency to the exact immutable customer proposal.
-- Migration 20261106270000 creates the append-only quantity snapshots before
-- this replacement is applied. Financial fields remain server-owned.
CREATE OR REPLACE FUNCTION public.submit_customer_order_amendment(
  p_order_id uuid,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_customer_id uuid;
  v_order public.orders%ROWTYPE;
  v_amendment public.customer_order_amendments%ROWTYPE;
  v_active public.customer_order_amendments%ROWTYPE;
  v_line jsonb;
  v_item public.order_items%ROWTYPE;
  v_item_id uuid;
  v_quantity numeric(15,3);
  v_current_quantity numeric(15,3);
  v_current_price numeric(15,2);
  v_line_count integer;
  v_existing_count integer;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_changed boolean := false;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note,'')),'');
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
  v_replay_match_count integer := 0;
  v_replay_unique_count integer := 0;
  v_replay_snapshot_count integer := 0;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='حساب عميل نشط مطلوب لتقديم تعديل الطلب';
  END IF;
  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ملاحظة التعديل تتجاوز 1000 حرف';
  END IF;
  IF v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح منع تكرار الإرسال غير صالح';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.jsonb_array_length(p_lines)<1 OR pg_catalog.jsonb_array_length(p_lines)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='قائمة كميات التعديل غير صالحة';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.profile_id=v_actor AND c.organization_id=v_org
  ORDER BY c.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الحساب غير مرتبط بملف عميل رئيسي';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id=p_order_id
    AND o.organization_id=v_org
    AND o.customer_id=v_customer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='الطلب غير موجود ضمن حساب العميل الحالي';
  END IF;

  SELECT a.* INTO v_amendment
  FROM public.customer_order_amendments a
  WHERE a.organization_id=v_org
    AND a.submitted_by_profile=v_actor
    AND a.idempotency_key=v_key;
  IF FOUND THEN
    -- An idempotency key is bound to the complete submitted proposal, not just
    -- the order. Replays are accepted only when note + every (item,quantity)
    -- pair match the immutable snapshot created by the original transaction.
    SELECT
      count(snapshot.id)::integer,
      count(DISTINCT snapshot.order_item_id)::integer
    INTO v_replay_match_count, v_replay_unique_count
    FROM pg_catalog.jsonb_array_elements(p_lines) AS submitted(line)
    LEFT JOIN LATERAL (
      SELECT s.id, s.order_item_id
      FROM public.customer_order_amendment_line_snapshots s
      WHERE s.amendment_id = v_amendment.id
        AND s.organization_id = v_org
        AND s.order_id = v_order.id
        AND pg_catalog.jsonb_typeof(submitted.line) = 'object'
        AND pg_catalog.jsonb_object_length(submitted.line) = 2
        AND submitted.line ? 'item_id'
        AND submitted.line ? 'quantity'
        AND s.order_item_id = CASE
          WHEN coalesce(submitted.line->>'item_id','') ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (submitted.line->>'item_id')::uuid
          ELSE NULL
        END
        AND s.proposed_quantity = CASE
          WHEN coalesce(submitted.line->>'quantity','') ~ '^[0-9]+([.][0-9]{1,3})?$'
          THEN (submitted.line->>'quantity')::numeric(15,3)
          ELSE NULL
        END
    ) AS snapshot ON true;
    SELECT count(*)::integer
    INTO v_replay_snapshot_count
    FROM public.customer_order_amendment_line_snapshots s
    WHERE s.amendment_id = v_amendment.id
      AND s.organization_id = v_org
      AND s.order_id = v_order.id;

    IF v_amendment.order_id IS DISTINCT FROM v_order.id
       OR v_amendment.note IS DISTINCT FROM v_note
       OR v_amendment.line_count IS DISTINCT FROM pg_catalog.jsonb_array_length(p_lines)
       OR v_replay_match_count IS DISTINCT FROM v_amendment.line_count
       OR v_replay_unique_count IS DISTINCT FROM v_amendment.line_count
       OR v_replay_snapshot_count IS DISTINCT FROM v_amendment.line_count THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='مفتاح إعادة الإرسال مرتبط بمحتوى مختلف أو بلقطة تاريخية غير مكتملة؛ استخدم محاولة جديدة بعد تحديث الطلب';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'amendment_id',v_amendment.id,'order_id',v_order.id,
      'status',v_amendment.status,'line_count',v_amendment.line_count,
      'submitted_at',v_amendment.created_at,'replayed',true
    );
  END IF;
  IF v_order.status NOT IN ('pending','returned','needs_customer_amendment','returned_for_adjustment') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يمكن تعديل الطلب قبل مراجعة الموظف أو بعد إعادته من الإدارة فقط';
  END IF;
  IF v_order.status='pending' AND coalesce(v_order.quantity_review_required,false) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='بدأت الإدارة مراجعة الطلب بالفعل؛ لا يمكن استبدال مسودة الموظف بتعديل العميل';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements im
    WHERE im.reference_type='order' AND im.reference_id=v_order.id
      AND im.movement_type IN ('reserve','sale')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا يمكن تعديل طلب سبق أن حجز أو صرف مخزونه؛ استخدم مسار المرتجعات المعتمد';
  END IF;

  SELECT a.* INTO v_active
  FROM public.customer_order_amendments a
  WHERE a.order_id=v_order.id AND a.status='pending_review'
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='يوجد تعديل عميل قيد المراجعة بالفعل';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id=v_order.id
      AND (oi.proposed_quantity IS NOT NULL OR oi.proposed_unit_price IS NOT NULL)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='توجد مسودة مراجعة أخرى على الطلب؛ لا يمكن استبدالها من حساب العميل';
  END IF;

  SELECT count(*)::integer INTO v_existing_count
  FROM public.order_items oi WHERE oi.order_id=v_order.id;
  v_line_count := pg_catalog.jsonb_array_length(p_lines);
  IF v_existing_count<1 OR v_existing_count<>v_line_count THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب إعادة إرسال جميع بنود الطلب دون حذف أو إضافة';
  END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines)
  LOOP
    IF pg_catalog.jsonb_typeof(v_line)<>'object'
       OR NOT (v_line ? 'item_id')
       OR NOT (v_line ? 'quantity') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='كل بند يجب أن يحتوي على معرف البند والكمية فقط';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(v_line) AS key_row(key)
      WHERE key_row.key NOT IN ('item_id','quantity')
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا يسمح بإرسال سعر أو حالة أو قيمة مالية ضمن تعديل العميل';
    END IF;
    IF coalesce(v_line->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(v_line->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='معرف البند أو الكمية غير صالح';
    END IF;

    v_item_id := (v_line->>'item_id')::uuid;
    IF v_item_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا يسمح بتكرار بند الطلب';
    END IF;
    v_seen_ids := pg_catalog.array_append(v_seen_ids,v_item_id);
    v_quantity := (v_line->>'quantity')::numeric(15,3);
    IF v_quantity<=0 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب أن تكون كل كمية أكبر من صفر ولا تتجاوز 10000';
    END IF;

    SELECT oi.* INTO v_item
    FROM public.order_items oi
    WHERE oi.id=v_item_id AND oi.order_id=v_order.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بند مرسل لا ينتمي إلى الطلب الحالي';
    END IF;

    v_current_quantity := coalesce(v_item.approved_quantity,v_item.quantity);
    v_current_price := coalesce(v_item.approved_unit_price,v_item.unit_price_snapshot);
    IF v_current_price IS NULL OR v_current_price<0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا يمكن تثبيت السعر الحالي لهذا البند؛ اطلب مراجعة الإدارة';
    END IF;
    IF v_quantity IS DISTINCT FROM v_current_quantity THEN
      v_changed := true;
    END IF;

    UPDATE public.order_items
    SET proposed_quantity=v_quantity,
        proposed_unit_price=round(v_current_price,2),
        proposed_price_reason=NULL
    WHERE id=v_item.id AND order_id=v_order.id;
  END LOOP;

  IF NOT v_changed THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لم تتغير أي كمية؛ عدّل كمية بند واحد على الأقل قبل الإرسال';
  END IF;

  INSERT INTO public.customer_order_amendments(
    organization_id,order_id,customer_id,submitted_by_profile,idempotency_key,note,status,line_count
  ) VALUES (
    v_org,v_order.id,v_customer_id,v_actor,v_key,v_note,'pending_review',v_line_count
  )
  RETURNING * INTO v_amendment;

  UPDATE public.orders
  SET quantity_review_required=true,updated_at=pg_catalog.now()
  WHERE id=v_order.id AND organization_id=v_org;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(
    v_org,v_actor,'order.customer_amendment.submitted','order',v_order.id,
    pg_catalog.jsonb_build_object(
      'amendment_id',v_amendment.id,'line_count',v_line_count,'status','pending_review'
    )
  );

  INSERT INTO public.notifications(
    organization_id,profile_id,title,body,type,is_read,dedupe_key,entity_type,entity_id
  )
  SELECT
    v_org,p.id,
    'تعديل عميل على الطلب '||coalesce(v_order.order_number::text,v_order.id::text),
    'قدّم العميل تعديلًا على كميات الطلب. افتح سجل الطلب لمراجعته واعتماده.',
    'info',false,
    'order-amendment:'||v_amendment.id::text||':'||p.id::text,
    'order',v_order.id
  FROM public.profiles p
  JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL
    AND r.role IN ('admin','manager','staff')
  ON CONFLICT (organization_id,dedupe_key)
    WHERE dedupe_key IS NOT NULL
  DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'amendment_id',v_amendment.id,'order_id',v_order.id,
    'status','pending_review','line_count',v_line_count,
    'submitted_at',v_amendment.created_at,'replayed',false
  );
END;
$function$;

COMMENT ON FUNCTION public.submit_customer_order_amendment(uuid,jsonb,text,text) IS
  'Customer quantity-only amendment command. Idempotency replay is accepted only for the exact note and complete immutable item/quantity snapshot; prices remain server-derived and customer financial edits are rejected.';

COMMIT;

