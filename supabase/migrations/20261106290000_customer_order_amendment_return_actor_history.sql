BEGIN;

-- BODY-072: extend the history read model without rewriting the already-versioned snapshot migration.
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
  v_return_events jsonb;
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

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'changed_at', h.created_at,
        'changed_by', actor.full_name,
        'reason', h.notes
      )
      ORDER BY h.created_at, h.id
    ),
    '[]'::jsonb
  )
  INTO v_return_events
  FROM public.order_status_history h
  LEFT JOIN public.profiles actor
    ON actor.id = h.changed_by
   AND actor.organization_id = v_org
  WHERE h.order_id = v_order.id
    AND h.to_status = 'returned_for_adjustment';

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'order_status', v_order.status,
    'return_events', v_return_events,
    'amendments', v_amendments
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_customer_order_amendment_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_customer_order_amendment_history(uuid) TO authenticated;
COMMENT ON FUNCTION public.list_customer_order_amendment_history(uuid) IS
  'Read-only, same-tenant and order-owner/staff authorized amendment history with immutable line snapshots, submit/review actors and the reasoned return-event timeline.';

COMMIT;
