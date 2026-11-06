BEGIN;

-- BODY-069: immutable line snapshots for every customer order-amendment submission.
-- The mutable order_items proposal is only a staging area; this table is the durable version history.

CREATE TABLE public.customer_order_amendment_line_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  amendment_id uuid NOT NULL REFERENCES public.customer_order_amendments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  item_code_snapshot text,
  unit_snapshot text,
  previous_quantity numeric(15,3) NOT NULL CHECK (previous_quantity > 0),
  proposed_quantity numeric(15,3) NOT NULL CHECK (proposed_quantity > 0),
  created_at timestamptz NOT NULL,
  CONSTRAINT customer_order_amendment_line_snapshot_unique
    UNIQUE (amendment_id, order_item_id)
);

CREATE INDEX customer_order_amendment_line_snapshots_order_idx
  ON public.customer_order_amendment_line_snapshots(organization_id, order_id, created_at, amendment_id);

ALTER TABLE public.customer_order_amendment_line_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_order_amendment_line_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.customer_order_amendment_line_snapshots TO authenticated;

CREATE POLICY customer_order_amendment_line_snapshots_select_parent_scope
  ON public.customer_order_amendment_line_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customer_order_amendments a
      WHERE a.id = customer_order_amendment_line_snapshots.amendment_id
        AND a.organization_id = customer_order_amendment_line_snapshots.organization_id
        AND a.order_id = customer_order_amendment_line_snapshots.order_id
    )
  );

CREATE OR REPLACE FUNCTION public.reject_customer_order_amendment_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000',
    MESSAGE = 'سجل نسخ تعديل الطلب محفوظ تاريخيًا ولا يقبل التعديل أو الحذف';
END;
$function$;

CREATE TRIGGER customer_order_amendment_line_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.customer_order_amendment_line_snapshots
FOR EACH ROW EXECUTE FUNCTION public.reject_customer_order_amendment_snapshot_mutation();

-- Preserve pending submissions already staged before this migration is applied.
DO $backfill$
DECLARE
  v_amendment record;
  v_snapshot_count integer;
BEGIN
  FOR v_amendment IN
    SELECT a.id, a.organization_id, a.order_id, a.line_count, a.created_at
    FROM public.customer_order_amendments a
    WHERE a.status = 'pending_review'
    ORDER BY a.created_at, a.id
  LOOP
    INSERT INTO public.customer_order_amendment_line_snapshots (
      organization_id, amendment_id, order_id, order_item_id,
      product_name_snapshot, item_code_snapshot, unit_snapshot,
      previous_quantity, proposed_quantity, created_at
    )
    SELECT
      v_amendment.organization_id, v_amendment.id, v_amendment.order_id, oi.id,
      oi.product_name_snapshot, oi.item_code, oi.unit_snapshot,
      coalesce(oi.approved_quantity, oi.quantity), oi.proposed_quantity, v_amendment.created_at
    FROM public.order_items oi
    WHERE oi.order_id = v_amendment.order_id
      AND oi.proposed_quantity IS NOT NULL
      AND oi.proposed_unit_price IS NOT NULL
    ON CONFLICT (amendment_id, order_item_id) DO NOTHING;

    SELECT count(*)::integer INTO v_snapshot_count
    FROM public.customer_order_amendment_line_snapshots s
    WHERE s.amendment_id = v_amendment.id;

    IF v_snapshot_count <> v_amendment.line_count THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'تعذر حفظ لقطة كاملة لطلب تعديل معلق؛ أوقف الترحيل دون تغيير البيانات';
    END IF;
  END LOOP;
END;
$backfill$;

CREATE OR REPLACE FUNCTION public.capture_customer_order_amendment_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_snapshot_count integer;
BEGIN
  INSERT INTO public.customer_order_amendment_line_snapshots (
    organization_id, amendment_id, order_id, order_item_id,
    product_name_snapshot, item_code_snapshot, unit_snapshot,
    previous_quantity, proposed_quantity, created_at
  )
  SELECT
    NEW.organization_id, NEW.id, NEW.order_id, oi.id,
    oi.product_name_snapshot, oi.item_code, oi.unit_snapshot,
    coalesce(oi.approved_quantity, oi.quantity), oi.proposed_quantity, NEW.created_at
  FROM public.order_items oi
  WHERE oi.order_id = NEW.order_id
    AND oi.proposed_quantity IS NOT NULL
    AND oi.proposed_unit_price IS NOT NULL;

  GET DIAGNOSTICS v_snapshot_count = ROW_COUNT;
  IF v_snapshot_count <> NEW.line_count THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'لم تُحفظ جميع بنود تعديل العميل؛ أُلغيت عملية الإرسال بالكامل';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER customer_order_amendments_capture_lines
AFTER INSERT ON public.customer_order_amendments
FOR EACH ROW EXECUTE FUNCTION public.capture_customer_order_amendment_lines();

-- Amendment identity and submitted content never change. The only allowed parent
-- update is the single pending_review -> approved/rejected review decision.
CREATE OR REPLACE FUNCTION public.guard_customer_order_amendment_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'لا يمكن حذف نسخة تعديل الطلب من السجل التاريخي';
  END IF;

  IF OLD.status <> 'pending_review'
     OR NEW.status NOT IN ('approved', 'rejected')
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.submitted_by_profile IS DISTINCT FROM OLD.submitted_by_profile
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.line_count IS DISTINCT FROM OLD.line_count
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reviewed_by_profile IS NULL
     OR NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'لا يسمح بتغيير محتوى نسخة تعديل الطلب؛ يسمح فقط بتسجيل قرار المراجعة مرة واحدة';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER customer_order_amendments_version_guard
BEFORE UPDATE OR DELETE ON public.customer_order_amendments
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_order_amendment_version();

CREATE OR REPLACE FUNCTION public.list_customer_order_amendment_history(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_order public.orders%ROWTYPE;
  v_amendments jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'تسجيل الدخول مطلوب لعرض سجل تعديل الطلب';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_actor
    AND p.auth_user_id = auth.uid()
    AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'الحساب النشط غير مرتبط بمؤسسة صالحة';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.organization_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'الطلب غير موجود ضمن المؤسسة الحالية';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.user_roles r
      WHERE r.profile_id = v_actor
        AND r.role IN ('admin', 'manager', 'staff')
    )
    OR EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = v_order.customer_id
        AND c.organization_id = v_org
        AND c.profile_id = v_actor
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'لا تملك صلاحية عرض سجل تعديل هذا الطلب';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'amendment_id', a.id,
        'order_id', a.order_id,
        'status', a.status,
        'note', a.note,
        'review_note', a.review_note,
        'submitted_at', a.created_at,
        'submitted_by', submitter.full_name,
        'reviewed_at', a.reviewed_at,
        'reviewed_by', reviewer.full_name,
        'line_count', a.line_count,
        'lines', (
          SELECT coalesce(
            jsonb_agg(
              jsonb_build_object(
                'order_item_id', s.order_item_id,
                'product_name', s.product_name_snapshot,
                'item_code', s.item_code_snapshot,
                'unit', s.unit_snapshot,
                'previous_quantity', s.previous_quantity,
                'proposed_quantity', s.proposed_quantity
              )
              ORDER BY s.product_name_snapshot, s.order_item_id
            ),
            '[]'::jsonb
          )
          FROM public.customer_order_amendment_line_snapshots s
          WHERE s.amendment_id = a.id
            AND s.organization_id = v_org
            AND s.order_id = v_order.id
        )
      )
      ORDER BY a.created_at, a.id
    ),
    '[]'::jsonb
  )
  INTO v_amendments
  FROM public.customer_order_amendments a
  LEFT JOIN public.profiles submitter ON submitter.id = a.submitted_by_profile
  LEFT JOIN public.profiles reviewer ON reviewer.id = a.reviewed_by_profile
  WHERE a.organization_id = v_org
    AND a.order_id = v_order.id
    AND a.customer_id = v_order.customer_id;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'order_status', v_order.status,
    'amendments', v_amendments
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_customer_order_amendment_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_customer_order_amendment_history(uuid) TO authenticated;

COMMENT ON TABLE public.customer_order_amendment_line_snapshots IS
  'Append-only before/after quantity snapshots for every customer order amendment version; contains no price or financial fields.';
COMMENT ON FUNCTION public.list_customer_order_amendment_history(uuid) IS
  'Read-only, same-tenant and order-owner/staff authorized amendment history with immutable line snapshots and actor display names.';

COMMIT;
