BEGIN;

-- BODY-070: provide a deliberate, reasoned staff command to return an unconfirmed
-- sales order to its customer before any reservation, invoice or financial posting.

CREATE OR REPLACE FUNCTION public.guard_order_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_customer public.customers%ROWTYPE;
  v_has_reservation boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF OLD.status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='delivered and cancelled orders are terminal; use a documented return/reopen process';
  END IF;

  IF OLD.status IN ('returned','needs_customer_amendment','returned_for_adjustment')
     AND (
       NEW.status<>'confirmed'
       OR NOT EXISTS (
         SELECT 1 FROM public.customer_order_amendments a
         WHERE a.order_id=OLD.id
           AND a.organization_id=NEW.organization_id
           AND a.status='pending_review'
       )
       OR EXISTS (
         SELECT 1 FROM public.inventory_movements im
         WHERE im.reference_type='order' AND im.reference_id=OLD.id
           AND im.movement_type IN ('reserve','sale')
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='لا يسمح باعتماد الطلب المعاد إلا بعد وجود تعديل عميل صالح وقبل أي حجز أو صرف مخزني';
  END IF;

  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF NOT public.is_staff() OR v_org IS NULL OR v_org<>NEW.organization_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff from the order organization is required to change order status';
  END IF;

  IF NEW.status='confirmed' THEN
    IF OLD.status NOT IN ('pending','draft','returned','needs_customer_amendment','returned_for_adjustment') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only draft or pending orders can be confirmed';
    END IF;
    SELECT c.* INTO v_customer FROM public.customers c
     WHERE c.id=NEW.customer_id AND c.organization_id=NEW.organization_id
     FOR UPDATE;
    IF NOT FOUND OR v_customer.status<>'approved' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account must be approved before order confirmation';
    END IF;
    IF NEW.payment_terms='credit' AND (
      coalesce(v_customer.credit_limit,0)<=0 OR
      coalesce(v_customer.current_balance,0)+NEW.total_amount>v_customer.credit_limit
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='order exceeds the available approved credit limit';
    END IF;
    PERFORM public.reserve_order_inventory(NEW.id);

  ELSIF NEW.status='processing' THEN
    IF OLD.status<>'confirmed' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only confirmed orders can enter processing';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
    ) INTO v_has_reservation;
    IF NOT v_has_reservation THEN PERFORM public.reserve_order_inventory(NEW.id); END IF;

  ELSIF NEW.status='shipped' THEN
    IF OLD.status NOT IN ('confirmed','processing') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only confirmed or processing orders can be shipped';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
    ) INTO v_has_reservation;
    IF NOT v_has_reservation THEN PERFORM public.reserve_order_inventory(NEW.id); END IF;

  ELSIF NEW.status='delivered' THEN
    IF OLD.status NOT IN ('confirmed','processing','shipped') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only confirmed, processing, or shipped orders can be delivered';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
    ) INTO v_has_reservation;
    IF NOT v_has_reservation THEN PERFORM public.reserve_order_inventory(NEW.id); END IF;

  ELSIF NEW.status='cancelled' THEN
    IF OLD.status NOT IN ('draft','pending','confirmed','processing') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a shipped order cannot be cancelled without a documented return process';
    END IF;

  ELSIF NEW.status='pending' THEN
    IF OLD.status<>'draft' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only draft orders can become pending';
    END IF;

  ELSIF NEW.status='returned_for_adjustment' THEN
    IF OLD.status<>'pending' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only an unconfirmed pending order can be returned to its customer';
    END IF;
    IF nullif(pg_catalog.btrim(coalesce(NEW.customer_adjustment_note,'')),'') IS NULL
       OR pg_catalog.char_length(NEW.customer_adjustment_note)>1000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سبب إعادة الطلب مطلوب وبحد أقصى 1000 حرف';
    END IF;
    IF coalesce(NEW.quantity_review_required,false) OR EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id=NEW.id
        AND (oi.proposed_quantity IS NOT NULL OR oi.proposed_unit_price IS NOT NULL)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ألغِ مسودة مراجعة الموظف قبل إعادة الطلب للعميل';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements im
      WHERE im.reference_type='order' AND im.reference_id=NEW.id
        AND im.movement_type IN ('reserve','sale')
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='لا يمكن إعادة طلب سبق أن حجز أو صرف مخزونه';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.customer_order_amendments a
      WHERE a.order_id=NEW.id AND a.organization_id=NEW.organization_id
        AND a.status='pending_review'
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='يوجد تعديل عميل قيد المراجعة بالفعل';
    END IF;

  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported order status transition';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_order_confirmation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.return_order_for_customer_amendment(
  p_order_id uuid,
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
  v_customer_profile uuid;
  v_order public.orders%ROWTYPE;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_returned_at timestamptz;
  v_dedupe_key text := 'order-return-amendment:' || p_order_id::text || ':' || gen_random_uuid()::text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='تسجيل الدخول مطلوب لإعادة الطلب';
  END IF;
  IF pg_catalog.char_length(v_reason)<3 OR pg_catalog.char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='اكتب سبب إعادة واضحًا من 3 إلى 1000 حرف';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;

  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='صلاحية موظف نشط في المؤسسة مطلوبة لإعادة الطلب';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id=p_order_id AND o.organization_id=v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='الطلب غير موجود ضمن المؤسسة الحالية';
  END IF;
  IF v_order.status<>'pending' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يمكن إعادة الطلب فقط قبل اعتماده وأثناء انتظار المراجعة';
  END IF;
  IF coalesce(v_order.quantity_review_required,false) OR EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id=v_order.id
      AND (oi.proposed_quantity IS NOT NULL OR oi.proposed_unit_price IS NOT NULL)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ألغِ مسودة مراجعة الموظف قبل إعادة الطلب للعميل';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements im
    WHERE im.reference_type='order' AND im.reference_id=v_order.id
      AND im.movement_type IN ('reserve','sale')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='لا يمكن إعادة طلب سبق أن حجز أو صرف مخزونه';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_order_amendments a
    WHERE a.order_id=v_order.id AND a.organization_id=v_org
      AND a.status='pending_review'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='يوجد تعديل عميل قيد المراجعة بالفعل';
  END IF;

  SELECT c.profile_id INTO v_customer_profile
  FROM public.customers c
  WHERE c.id=v_order.customer_id AND c.organization_id=v_org;

  UPDATE public.orders
  SET status='returned_for_adjustment',
      customer_adjustment_note=v_reason,
      updated_at=pg_catalog.now()
  WHERE id=v_order.id AND organization_id=v_org
  RETURNING updated_at INTO v_returned_at;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_org,v_actor,'order.returned_for_customer_amendment','order',v_order.id,
    pg_catalog.jsonb_build_object('status',v_order.status),
    pg_catalog.jsonb_build_object(
      'status','returned_for_adjustment',
      'reason',v_reason,
      'returned_at',v_returned_at,
      'inventory_unchanged',true,
      'financial_documents_unchanged',true
    )
  );

  IF v_customer_profile IS NOT NULL THEN
    INSERT INTO public.notifications(
      organization_id,profile_id,title,body,type,is_read,dedupe_key,entity_type,entity_id
    ) VALUES (
      v_org,v_customer_profile,
      'الطلب ' || coalesce(v_order.order_number::text,v_order.id::text) || ' يحتاج إلى تعديل',
      'أعادت الإدارة الطلب إليك. السبب: ' || v_reason || '. راجع الأصناف والكميات ثم أعد تقديمه للمراجعة.',
      'info',false,v_dedupe_key,'order',v_order.id
    )
    ON CONFLICT (organization_id,dedupe_key)
      WHERE dedupe_key IS NOT NULL
    DO NOTHING;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'order_id',v_order.id,
    'status','returned_for_adjustment',
    'reason',v_reason,
    'returned_at',v_returned_at,
    'customer_notified',v_customer_profile IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.return_order_for_customer_amendment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.return_order_for_customer_amendment(uuid,text) TO authenticated;

-- Keep the reason in the canonical order-status timeline, not only in the current order row.
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id,from_status,to_status,changed_by,notes)
    VALUES(
      NEW.id,OLD.status,NEW.status,public.current_profile_id(),
      CASE
        WHEN NEW.status='returned_for_adjustment'
          THEN 'سبب إعادة الطلب للتعديل: ' || coalesce(nullif(pg_catalog.btrim(NEW.customer_adjustment_note),''),'غير مسجل')
        ELSE 'Order status changed from ' || coalesce(OLD.status,'(none)') || ' to ' || NEW.status
      END
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC,anon;

COMMIT;
