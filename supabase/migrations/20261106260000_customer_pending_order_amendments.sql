BEGIN;

-- BODY-068: allow customer quantity amendments while a sales order is pending,
-- but only before staff staging. Confirmation remains staff-only.
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
    IF v_amendment.order_id<>v_order.id THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح الإرسال مستخدم لطلب آخر';
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

REVOKE ALL ON FUNCTION public.submit_customer_order_amendment(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_customer_order_amendment(uuid,jsonb,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_action text,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_order public.orders%ROWTYPE;
  v_customer_amendment_id uuid;
  v_item public.order_items%ROWTYPE;
  v_line jsonb;
  v_line_id uuid;
  v_quantity numeric(15,3);
  v_price numeric(15,2);
  v_reason text;
  v_changed boolean;
  v_adjusted boolean := false;
  v_changed_lines integer := 0;
  v_total numeric(15,2);
  v_total_items integer;
  v_submitted integer := 0;
  v_existing integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='إذن مراجعة الطلب مطلوب';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='المؤسسة المرتبطة بالحساب غير صالحة';
  END IF;
  IF p_action NOT IN ('stage','approve','discard') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='إجراء مراجعة الطلب غير صالح';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='قائمة بنود المراجعة غير صالحة';
  END IF;
  IF coalesce(p_customer_note,'')<>'' AND length(p_customer_note)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ملاحظة العميل تتجاوز الحد المسموح';
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id=p_order_id AND o.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='الطلب غير موجود في المؤسسة الحالية'; END IF;
  IF v_order.status NOT IN ('pending','draft','returned','needs_customer_amendment','returned_for_adjustment') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مراجعة الكميات مسموحة قبل تأكيد الطلب فقط';
  END IF;
  SELECT a.id INTO v_customer_amendment_id
    FROM public.customer_order_amendments a
   WHERE a.order_id=v_order.id
     AND a.organization_id=v_org
     AND a.status='pending_review'
   FOR UPDATE;
  IF v_order.status IN ('returned','needs_customer_amendment','returned_for_adjustment')
     AND v_customer_amendment_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='لا توجد مطالبة تعديل عميل مفتوحة لهذا الطلب';
  END IF;
  IF p_action='discard' THEN
    IF v_customer_amendment_id IS NOT NULL THEN
      UPDATE public.customer_order_amendments
         SET status='rejected',
             reviewed_by_profile=v_actor,
             reviewed_at=pg_catalog.now(),
             review_note=nullif(left(btrim(coalesce(p_customer_note,'')),1000),''),
             updated_at=pg_catalog.now()
       WHERE id=v_customer_amendment_id
         AND order_id=v_order.id
         AND organization_id=v_org
         AND status='pending_review';
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='تعذر رفض التعديل؛ لم تعد هناك مطالبة مفتوحة';
      END IF;
    END IF;
    UPDATE public.order_items
       SET proposed_quantity=NULL,proposed_unit_price=NULL,proposed_price_reason=NULL
     WHERE order_id=v_order.id;
    UPDATE public.orders SET quantity_review_required=false,updated_at=pg_catalog.now() WHERE id=v_order.id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    VALUES(
      v_org,v_actor,
      CASE WHEN v_customer_amendment_id IS NOT NULL
        THEN 'order.customer_amendment.rejected' ELSE 'order.review.discarded' END,
      'order',v_order.id,
      pg_catalog.jsonb_build_object(
        'order_id',v_order.id,
        'amendment_status',CASE WHEN v_customer_amendment_id IS NOT NULL THEN 'rejected' ELSE NULL END
      )
    );
    RETURN pg_catalog.jsonb_build_object(
      'order_id',v_order.id,'action','discard','quantity_review_required',false,
      'amendment_status',CASE WHEN v_customer_amendment_id IS NOT NULL THEN 'rejected' ELSE NULL END
    );
  END IF;

  SELECT count(*)::integer INTO v_existing FROM public.order_items oi WHERE oi.order_id=v_order.id;
  SELECT count(*)::integer INTO v_submitted
    FROM (
      SELECT value->>'item_id' AS item_id
        FROM jsonb_array_elements(p_lines)
    ) lines
   WHERE item_id IS NOT NULL;
  IF v_existing=0 OR v_submitted<>v_existing OR EXISTS (
    SELECT 1 FROM (
      SELECT value->>'item_id' AS item_id,count(*) AS duplicates
        FROM jsonb_array_elements(p_lines)
       GROUP BY value->>'item_id'
    ) lines
     WHERE item_id IS NULL OR duplicates<>1
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب إرسال كل بند من بنود الطلب مرة واحدة دون تكرار';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF coalesce(v_line->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$'
       OR coalesce(v_line->>'unit_price','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية أو السعر المقترح غير صالح';
    END IF;
    v_line_id:=(v_line->>'item_id')::uuid;
    v_quantity:=(v_line->>'quantity')::numeric;
    v_price:=(v_line->>'unit_price')::numeric;
    v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
    IF v_quantity<=0 OR v_quantity>10000 OR v_price<0 OR v_price>=1000000000000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية أو السعر خارج الحدود المسموحة';
    END IF;
    SELECT oi.* INTO v_item FROM public.order_items oi
     WHERE oi.id=v_line_id AND oi.order_id=v_order.id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بند لا يتبع هذا الطلب'; END IF;
    IF round(v_price,2) IS DISTINCT FROM round(coalesce(v_item.unit_price_snapshot,0),2) AND v_reason IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سبب تعديل السعر مطلوب عند تغييره';
    END IF;
  END LOOP;

  IF p_action='stage' THEN
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_id:=(v_line->>'item_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
      v_price:=(v_line->>'unit_price')::numeric;
      v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
      UPDATE public.order_items
         SET proposed_quantity=v_quantity,
             proposed_unit_price=round(v_price,2),
             proposed_price_reason=CASE WHEN round(v_price,2) IS DISTINCT FROM (SELECT oi.unit_price_snapshot FROM public.order_items oi WHERE oi.id=v_line_id) THEN v_reason ELSE NULL END
       WHERE id=v_line_id AND order_id=v_order.id;
    END LOOP;
    SELECT EXISTS (
      SELECT 1 FROM public.order_items oi
       WHERE oi.order_id=v_order.id
         AND (
           oi.proposed_quantity IS DISTINCT FROM coalesce(oi.approved_quantity,oi.quantity)
           OR oi.proposed_unit_price IS DISTINCT FROM coalesce(oi.approved_unit_price,oi.unit_price_snapshot)
         )
    ) INTO v_changed;
    UPDATE public.orders SET quantity_review_required=v_changed,updated_at=pg_catalog.now() WHERE id=v_order.id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    VALUES(v_org,v_actor,'order.review.staged','order',v_order.id,
      jsonb_build_object('line_count',v_submitted,'quantity_review_required',v_changed));
    RETURN jsonb_build_object('order_id',v_order.id,'action','stage','quantity_review_required',v_changed,'line_count',v_submitted);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items oi
     WHERE oi.order_id=v_order.id
       AND (oi.proposed_quantity IS NULL OR oi.proposed_unit_price IS NULL)
  ) THEN
    -- The final command must carry the complete, current review grid; staging is an explicit step.
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_id:=(v_line->>'item_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
      v_price:=(v_line->>'unit_price')::numeric;
      v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
      UPDATE public.order_items
         SET proposed_quantity=v_quantity,
             proposed_unit_price=round(v_price,2),
             proposed_price_reason=CASE WHEN round(v_price,2) IS DISTINCT FROM (SELECT oi.unit_price_snapshot FROM public.order_items oi WHERE oi.id=v_line_id) THEN v_reason ELSE NULL END
       WHERE id=v_line_id AND order_id=v_order.id;
    END LOOP;
  ELSE
    -- Use the exact submitted grid to prevent approving stale or partial edits.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lines) l
      JOIN public.order_items oi ON oi.id=(l.value->>'item_id')::uuid AND oi.order_id=v_order.id
      WHERE (l.value->>'quantity')::numeric IS DISTINCT FROM oi.proposed_quantity
         OR (l.value->>'unit_price')::numeric IS DISTINCT FROM oi.proposed_unit_price
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تغيرت مسودة الكميات؛ احفظ المسودة الحالية ثم أعد الاعتماد';
    END IF;
  END IF;

  FOR v_item IN SELECT oi.* FROM public.order_items oi WHERE oi.order_id=v_order.id ORDER BY oi.id FOR UPDATE
  LOOP
    IF v_item.proposed_quantity IS NULL OR v_item.proposed_unit_price IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='كل الكميات والأسعار يجب أن تكون محددة قبل الاعتماد';
    END IF;
    v_changed := v_item.proposed_quantity IS DISTINCT FROM coalesce(v_item.requested_quantity,v_item.quantity)
      OR v_item.proposed_unit_price IS DISTINCT FROM coalesce(v_item.unit_price_snapshot,v_item.proposed_unit_price);
    IF v_changed THEN
      v_adjusted:=true;
      v_changed_lines:=v_changed_lines+1;
    END IF;
    UPDATE public.order_items
       SET quantity=v_item.proposed_quantity,
           approved_quantity=v_item.proposed_quantity,
           approved_unit_price=v_item.proposed_unit_price,
           unit_price_snapshot=v_item.proposed_unit_price,
           line_total=round(v_item.proposed_quantity*v_item.proposed_unit_price,2),
           price_override_reason=v_item.proposed_price_reason,
           adjusted_by=CASE WHEN v_changed THEN v_actor ELSE adjusted_by END,
           adjusted_at=CASE WHEN v_changed THEN pg_catalog.now() ELSE adjusted_at END,
           proposed_quantity=NULL,proposed_unit_price=NULL,proposed_price_reason=NULL
     WHERE id=v_item.id;
  END LOOP;

  SELECT coalesce(sum(oi.line_total),0)::numeric(15,2),count(*)::integer
    INTO v_total,v_total_items FROM public.order_items oi WHERE oi.order_id=v_order.id;

  UPDATE public.orders
     SET total_amount=v_total,
         total_items=v_total_items,
         quantity_review_required=false,
         customer_adjustment_note=CASE WHEN v_adjusted THEN
           coalesce(nullif(btrim(p_customer_note),''),'تنبيه: تم تعديل الأصناف/الكميات بحسب الكميات المتوفرة.')
           ELSE NULL END,
         admin_adjusted_at=CASE WHEN v_adjusted THEN pg_catalog.now() ELSE admin_adjusted_at END,
         updated_at=pg_catalog.now()
   WHERE id=v_order.id;

  -- Existing status trigger checks the customer, credit and available inventory. It then reserves stock,
  -- while the existing invoice trigger creates accounting documents in the same transaction.
  UPDATE public.orders SET status='confirmed',updated_at=pg_catalog.now() WHERE id=v_order.id;

  IF v_customer_amendment_id IS NOT NULL THEN
    UPDATE public.customer_order_amendments
       SET status='approved',
           reviewed_by_profile=v_actor,
           reviewed_at=pg_catalog.now(),
           review_note=nullif(left(btrim(coalesce(p_customer_note,'')),1000),''),
           updated_at=pg_catalog.now()
     WHERE id=v_customer_amendment_id
       AND order_id=v_order.id
       AND organization_id=v_org
       AND status='pending_review';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='تعذر إغلاق مطالبة تعديل العميل؛ أُلغيت معاملة اعتماد الطلب بالكامل';
    END IF;
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'order.review.approved','order',v_order.id,
    jsonb_build_object('previous_status',v_order.status,'previous_total',v_order.total_amount),
    jsonb_build_object('status','confirmed','total_amount',v_total,'changed_lines',v_changed_lines,'adjusted',v_adjusted,
      'payment_request_status','requested'));

  RETURN jsonb_build_object(
    'order_id',v_order.id,'status','confirmed','total_amount',v_total,'total_items',v_total_items,
    'quantity_review_required',false,'adjusted',v_adjusted,'changed_lines',v_changed_lines,
    'payment_request_status','requested'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_order_lines(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_order_lines(uuid,jsonb,text,text) TO authenticated;

COMMENT ON FUNCTION public.submit_customer_order_amendment(uuid,jsonb,text,text) IS
  'Accepts a complete quantity-only proposal from the authenticated customer owner/buyer on a pending order before staff staging, or on a returned pre-confirmation order. It retains server prices and never confirms, reserves stock or posts finance.';
COMMENT ON FUNCTION public.review_order_lines(uuid,jsonb,text,text) IS
  'Staff-only order review/approval path. It closes a pending customer amendment as approved or rejected in the same transaction and keeps order confirmation, inventory reservation, invoice and payment request atomic.';
COMMIT;
