BEGIN;

-- BODY-067: customer cancellation before staff confirmation.
CREATE TABLE public.customer_order_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  cancelled_by_profile uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (pg_catalog.char_length(reason) BETWEEN 3 AND 500),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT customer_order_cancellations_idempotency_uq
    UNIQUE (organization_id,cancelled_by_profile,idempotency_key)
);
CREATE INDEX customer_order_cancellations_customer_history_idx
  ON public.customer_order_cancellations(customer_id,created_at DESC);

ALTER TABLE public.customer_order_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_order_cancellations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.customer_order_cancellations TO authenticated;

CREATE POLICY customer_order_cancellations_select_own_or_staff
  ON public.customer_order_cancellations
  FOR SELECT TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND (
      customer_id=public.current_customer_id()
      OR (
        public.is_staff()
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id=public.current_profile_id()
            AND p.auth_user_id=auth.uid()
            AND p.is_active
            AND p.organization_id=customer_order_cancellations.organization_id
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.cancel_customer_order(
  p_order_id uuid,
  p_reason text,
  p_idempotency_key text
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
  v_existing public.customer_order_cancellations%ROWTYPE;
  v_by_order public.customer_order_cancellations%ROWTYPE;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
  v_cancelled_at timestamptz;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='حساب عميل نشط مطلوب لإلغاء الطلب';
  END IF;

  v_customer_id := public.current_customer_id();
  IF v_customer_id IS NULL OR NOT public.current_customer_can('orders.create') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='إلغاء الطلب متاح لصاحب الحساب أو عضو المشتريات المخوّل فقط';
  END IF;
  IF pg_catalog.char_length(v_reason)<3 OR pg_catalog.char_length(v_reason)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سبب الإلغاء مطلوب بطول من 3 إلى 500 حرف';
  END IF;
  IF v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح منع تكرار الإلغاء غير صالح';
  END IF;

  -- Serialize with customer-company membership revocation; recheck after lock wait.
  PERFORM 1
    FROM public.customers c
   WHERE c.id=v_customer_id AND c.organization_id=v_org AND c.status='approved'
   FOR SHARE;
  IF NOT FOUND
     OR public.current_customer_id() IS DISTINCT FROM v_customer_id
     OR NOT public.current_customer_can('orders.create') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='عضوية العميل غير نشطة أو لم تعد تملك صلاحية إدارة الطلبات';
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

  SELECT c.* INTO v_existing
    FROM public.customer_order_cancellations c
   WHERE c.organization_id=v_org
     AND c.cancelled_by_profile=v_actor
     AND c.idempotency_key=v_key;
  IF FOUND THEN
    IF v_existing.order_id IS DISTINCT FROM v_order.id
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح الإلغاء مستخدم مع طلب أو سبب مختلف';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'order_id',v_order.id,'status','cancelled',
      'cancelled_at',v_existing.created_at,'replayed',true
    );
  END IF;

  SELECT c.* INTO v_by_order
    FROM public.customer_order_cancellations c
   WHERE c.order_id=v_order.id;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='تم تسجيل إلغاء هذا الطلب مسبقًا بمفتاح إرسال آخر';
  END IF;

  IF v_order.created_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='يمكن لصاحب الطلب الأصلي فقط إلغاء هذا الطلب';
  END IF;
  IF v_order.status NOT IN ('draft','pending') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا يمكن إلغاء الطلب بعد بدء مراجعته أو اعتماده؛ استخدم الإجراء المعتمد لدى الإدارة';
  END IF;
  IF coalesce(v_order.quantity_review_required,false)
     OR EXISTS (
       SELECT 1 FROM public.order_items oi
        WHERE oi.order_id=v_order.id
          AND (oi.proposed_quantity IS NOT NULL OR oi.proposed_unit_price IS NOT NULL)
     ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='لا يمكن إلغاء الطلب أثناء وجود مراجعة كميات أو أسعار مفتوحة';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements im
     WHERE im.reference_type='order' AND im.reference_id=v_order.id
       AND im.movement_type IN ('reserve','sale')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بدأ حجز أو صرف المخزون؛ لا يمكن استخدام إلغاء العميل';
  END IF;

  INSERT INTO public.customer_order_cancellations(
    organization_id,customer_id,order_id,cancelled_by_profile,reason,idempotency_key
  ) VALUES(v_org,v_customer_id,v_order.id,v_actor,v_reason,v_key)
  RETURNING created_at INTO v_cancelled_at;

  UPDATE public.orders
     SET status='cancelled',updated_at=pg_catalog.now()
   WHERE id=v_order.id AND organization_id=v_org AND status IN ('draft','pending');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='تغيرت حالة الطلب أثناء الإلغاء؛ أعد تحميله قبل المحاولة';
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(
    v_org,v_actor,'order.customer.cancelled','order',v_order.id,
    pg_catalog.jsonb_build_object(
      'order_number',v_order.order_number,'reason',v_reason,
      'previous_status',v_order.status,'status','cancelled','cancelled_at',v_cancelled_at
    )
  );

  INSERT INTO public.notifications(
    organization_id,profile_id,title,body,type,is_read,dedupe_key,entity_type,entity_id
  )
  SELECT
    v_org,p.id,
    'ألغى العميل الطلب '||coalesce(v_order.order_number::text,v_order.id::text),
    'أُلغي الطلب من صاحب الحساب قبل اعتماد الإدارة. افتح سجل الطلب لمراجعة سبب الإلغاء.',
    'warning',false,
    'customer-order-cancel:'||v_order.id::text||':'||p.id::text,
    'order',v_order.id
  FROM public.profiles p
  JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL
    AND r.role IN ('admin','manager','staff')
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
    'order_id',v_order.id,'status','cancelled',
    'cancelled_at',v_cancelled_at,'replayed',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_customer_order(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_order_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- Narrow customer cancellation path: only a draft/pending order with a
  -- matching cancellation evidence row may be cancelled by its own creator.
  IF NEW.status='cancelled' AND OLD.status IN ('draft','pending') AND NOT public.is_staff() THEN
    SELECT p.organization_id INTO v_org
      FROM public.profiles p
     WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
    IF auth.uid() IS NULL
       OR v_org IS NULL
       OR v_org IS DISTINCT FROM NEW.organization_id
       OR OLD.created_by IS DISTINCT FROM v_actor
       OR public.current_customer_id() IS DISTINCT FROM NEW.customer_id
       OR NOT public.current_customer_can('orders.create')
       OR NOT EXISTS (
         SELECT 1 FROM public.customer_order_cancellations c
          WHERE c.order_id=OLD.id
            AND c.organization_id=NEW.organization_id
            AND c.customer_id=NEW.customer_id
            AND c.cancelled_by_profile=v_actor
       )
       OR EXISTS (
         SELECT 1 FROM public.inventory_movements im
          WHERE im.reference_type='order' AND im.reference_id=OLD.id
            AND im.movement_type IN ('reserve','sale')
       ) THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='إلغاء الطلب غير مصرح أو أن الطلب لم يعد ضمن الطلبات القابلة لإلغاء العميل';
    END IF;
    RETURN NEW;
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

  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.is_active;
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

  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported order status transition';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_order_confirmation() FROM PUBLIC,anon,authenticated;

COMMENT ON TABLE public.customer_order_cancellations IS
  'Server-recorded customer cancellations of their own draft/pending order before staff review or inventory reservation; no direct customer writes are permitted.';
COMMENT ON FUNCTION public.cancel_customer_order(uuid,text,text) IS
  'Allows the authenticated owner or buyer to cancel only their own draft/pending order. It serializes with membership revocation, stores an idempotent reason, records audit and notifies same-tenant staff; stock and finance effects are excluded.';
COMMIT;
