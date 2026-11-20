-- NASR1-ORIGINAL-SPEC-OPERATIONAL-PURCHASE-TASKS-013
-- Derive role-scoped tasks from persisted purchase orders, physical receipts and journal-draft linkage.
-- No amounts or due dates are fabricated. A missing source cost is routed to purchasing, not posted as zero.

CREATE OR REPLACE FUNCTION public.operational_tasks_from_purchase_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text := lower(coalesce(NEW.status, ''));
  v_label text := coalesce(nullif(NEW.purchase_order_number, ''), NEW.id::text);
  v_remaining numeric(15,3) := 0;
  v_line_count integer := 0;
  v_status_changed boolean := TG_OP = 'INSERT';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_status_changed := OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF v_status IN ('submitted', 'partially_received') THEN
    SELECT count(*)::integer,
           coalesce(sum(i.quantity_ordered - i.quantity_received), 0)::numeric(15,3)
      INTO v_line_count, v_remaining
      FROM public.purchase_order_items i
     WHERE i.organization_id = NEW.organization_id
       AND i.purchase_order_id = NEW.id;

    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'متابعة استلام أمر الشراء ' || v_label,
      CASE WHEN v_status = 'partially_received' THEN
        'أمر الشراء استُلم جزئيًا؛ الكمية المتبقية حسب بنود الأمر: ' || v_remaining::text || '. راجع الإيصالات وحالة المورد.'
      ELSE
        'أمر الشراء معتمد للإرسال إلى المورد ويحتاج متابعة التوريد والاستلام الفعلي.'
      END,
      'purchasing',
      CASE WHEN v_status = 'partially_received' THEN 'high' ELSE 'medium' END,
      'purchase_order_receiving',
      'purchase-order-receiving:' || NEW.id::text,
      'purchase_orders',
      NEW.id,
      NULL,
      jsonb_build_object(
        'purchase_order_number', v_label,
        'status', v_status,
        'remaining_quantity', v_remaining,
        'line_count', v_line_count,
        'warehouse_id', NEW.warehouse_id
      ),
      v_status_changed
    );
  ELSIF v_status IN ('received', 'cancelled') THEN
    UPDATE public.ai_tasks
       SET status = 'completed',
           completed_at = coalesce(completed_at, now()),
           completed_by = NULL,
           resolution_note = CASE WHEN v_status = 'received'
             THEN 'أُغلقت تلقائيًا بعد اكتمال الاستلام الفعلي لأمر الشراء.'
             ELSE 'أُغلقت تلقائيًا بعد إلغاء أمر الشراء من المصدر.'
           END,
           updated_at = now()
     WHERE organization_id = NEW.organization_id
       AND source_event_key = 'purchase-order-receiving:' || NEW.id::text
       AND status IN ('pending', 'in_progress');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS operational_tasks_purchase_order_event ON public.purchase_orders;
CREATE TRIGGER operational_tasks_purchase_order_event
AFTER INSERT OR UPDATE OF status, updated_at ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_purchase_order();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_purchase_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_currency text;
BEGIN
  SELECT o.currency INTO v_currency
    FROM public.organizations o
   WHERE o.id = NEW.organization_id;

  -- A journal already linked to this receipt is authoritative: subsequent receipt
  -- row updates must not reopen finance work or reconstruct stale cost-review tasks.
  IF EXISTS (
    SELECT 1 FROM public.purchase_receipt_accounting_postings posting
     WHERE posting.organization_id = NEW.organization_id
       AND posting.receipt_id = NEW.id
  ) THEN
    UPDATE public.ai_tasks
       SET status = 'completed',
           completed_at = coalesce(completed_at, now()),
           completed_by = NULL,
           resolution_note = 'أُغلقت المهمة بعد وجود ارتباط محاسبي محفوظ للإيصال.',
           updated_at = now()
     WHERE organization_id = NEW.organization_id
       AND source_entity_type = 'purchase_receipts'
       AND source_entity_id = NEW.id
       AND status IN ('pending', 'in_progress');
    RETURN NEW;
  END IF;

  IF NEW.received_cost IS NOT NULL AND NEW.received_cost > 0 THEN
    -- Receipt creation may precede the UPDATE that finalizes received_cost.
    -- Resolve a cost-review task that was correctly opened while the cost was NULL.
    UPDATE public.ai_tasks
       SET status = 'completed',
           completed_at = coalesce(completed_at, now()),
           completed_by = NULL,
           resolution_note = 'أُغلقت بعد تسجيل تكلفة مصدرية موجبة للإيصال؛ انتقلت المتابعة إلى المحاسبة.',
           updated_at = now()
     WHERE organization_id = NEW.organization_id
       AND source_event_key = 'purchase-receipt-cost-review:' || NEW.id::text
       AND status IN ('pending', 'in_progress');

    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'إعداد مسودة القيد لإيصال الشراء ' || NEW.receipt_number,
      'سُجل إيصال استلام فعلي بتكلفة مصدرية؛ يلزم على المحاسبة التحقق من البنود والحسابات وإعداد مسودة القيد.',
      'accountant', 'medium', 'purchase_receipt_accounting_draft',
      'purchase-receipt-accounting:' || NEW.id::text, 'purchase_receipts', NEW.id, NULL,
      jsonb_build_object(
        'receipt_number', NEW.receipt_number, 'source_amount', NEW.received_cost,
        'source_currency', v_currency, 'purchase_order_id', NEW.purchase_order_id
      ),
      false
    );
  ELSE
    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'استكمال التكلفة المصدرية لإيصال الشراء ' || NEW.receipt_number,
      'تكلفة الإيصال غير مثبتة أو غير موجبة في المصدر؛ لا تُنشئ قيدًا بصفر أو تقدير. طابق مستند المورد وسجّل التكلفة المصدرية المعتمدة أولًا.',
      'purchasing', 'high', 'purchase_receipt_cost_review',
      'purchase-receipt-cost-review:' || NEW.id::text, 'purchase_receipts', NEW.id, NULL,
      jsonb_build_object(
        'receipt_number', NEW.receipt_number, 'source_amount', NEW.received_cost,
        'source_currency', v_currency, 'purchase_order_id', NEW.purchase_order_id,
        'requires_source_cost_reconciliation', true
      ),
      false
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS operational_tasks_purchase_receipt_event ON public.purchase_receipts;
CREATE TRIGGER operational_tasks_purchase_receipt_event
AFTER INSERT OR UPDATE OF received_cost ON public.purchase_receipts
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_purchase_receipt();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_purchase_receipt_accounting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.ai_tasks
     SET status = 'completed',
         completed_at = coalesce(completed_at, now()),
         completed_by = NULL,
         resolution_note = 'أُغلقت مهمة مسودة القيد بعد إنشاء الارتباط المحاسبي للمصدر.',
         updated_at = now()
   WHERE organization_id = NEW.organization_id
     AND source_entity_type = 'purchase_receipts'
     AND source_entity_id = NEW.receipt_id
     AND task_role = 'accountant'
     AND source_event_key = 'purchase-receipt-accounting:' || NEW.receipt_id::text
     AND status IN ('pending', 'in_progress');

  UPDATE public.ai_tasks
     SET status = 'completed',
         completed_at = coalesce(completed_at, now()),
         completed_by = NULL,
         resolution_note = 'أُغلقت مهمة استكمال التكلفة بعد نجاح إنشاء مسودة القيد المرتبطة بالإيصال.',
         updated_at = now()
   WHERE organization_id = NEW.organization_id
     AND source_entity_type = 'purchase_receipts'
     AND source_entity_id = NEW.receipt_id
     AND task_role = 'purchasing'
     AND source_event_key = 'purchase-receipt-cost-review:' || NEW.receipt_id::text
     AND status IN ('pending', 'in_progress');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS operational_tasks_purchase_receipt_accounting_event ON public.purchase_receipt_accounting_postings;
CREATE TRIGGER operational_tasks_purchase_receipt_accounting_event
AFTER INSERT ON public.purchase_receipt_accounting_postings
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_purchase_receipt_accounting();

-- Wrap the mature refresh routine so source-generated purchase tasks can also be reconstructed.
DO $block$
BEGIN
  IF to_regprocedure('public.refresh_operational_tasks_pre_purchase_v1()') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.refresh_operational_tasks() RENAME TO refresh_operational_tasks_pre_purchase_v1';
  END IF;
END
$block$;

REVOKE ALL ON FUNCTION public.refresh_operational_tasks_pre_purchase_v1() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_operational_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid := public.current_organization_id();
  v_existing_result jsonb;
  v_count integer := 0;
  r record;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'administrator or manager permission required to refresh tasks';
  END IF;
  v_existing_result := public.refresh_operational_tasks_pre_purchase_v1();

  FOR r IN
    SELECT po.id, po.purchase_order_number, po.status, po.warehouse_id,
           count(i.id)::integer AS line_count,
           coalesce(sum(i.quantity_ordered - i.quantity_received), 0)::numeric(15,3) AS remaining_quantity
      FROM public.purchase_orders po
      LEFT JOIN public.purchase_order_items i
        ON i.organization_id = po.organization_id AND i.purchase_order_id = po.id
     WHERE po.organization_id = v_org AND po.status IN ('submitted', 'partially_received')
     GROUP BY po.id, po.purchase_order_number, po.status, po.warehouse_id
  LOOP
    PERFORM public.upsert_operational_task(
      v_org,
      'متابعة استلام أمر الشراء ' || coalesce(r.purchase_order_number, r.id::text),
      CASE WHEN r.status = 'partially_received' THEN
        'أمر الشراء استُلم جزئيًا؛ الكمية المتبقية حسب بنود الأمر: ' || r.remaining_quantity::text || '. راجع الإيصالات وحالة المورد.'
      ELSE
        'أمر الشراء معتمد للإرسال إلى المورد ويحتاج متابعة التوريد والاستلام الفعلي.'
      END,
      'purchasing',
      CASE WHEN r.status = 'partially_received' THEN 'high' ELSE 'medium' END,
      'purchase_order_receiving',
      'purchase-order-receiving:' || r.id::text, 'purchase_orders', r.id, NULL,
      jsonb_build_object(
        'purchase_order_number', coalesce(r.purchase_order_number, r.id::text),
        'status', r.status, 'remaining_quantity', r.remaining_quantity,
        'line_count', r.line_count, 'warehouse_id', r.warehouse_id
      ),
      false
    );
    v_count := v_count + 1;
  END LOOP;

  FOR r IN
    SELECT pr.id, pr.receipt_number, pr.received_cost, pr.purchase_order_id, o.currency
      FROM public.purchase_receipts pr
      JOIN public.organizations o ON o.id = pr.organization_id
     WHERE pr.organization_id = v_org
       AND NOT EXISTS (
         SELECT 1 FROM public.purchase_receipt_accounting_postings posting
          WHERE posting.organization_id = pr.organization_id AND posting.receipt_id = pr.id
       )
  LOOP
    IF r.received_cost IS NOT NULL AND r.received_cost > 0 THEN
      UPDATE public.ai_tasks
         SET status = 'completed', completed_at = coalesce(completed_at, now()),
             completed_by = NULL,
             resolution_note = 'أُغلقت بعد تسجيل تكلفة مصدرية موجبة للإيصال؛ انتقلت المتابعة إلى المحاسبة.',
             updated_at = now()
       WHERE organization_id = v_org
         AND source_event_key = 'purchase-receipt-cost-review:' || r.id::text
         AND status IN ('pending', 'in_progress');

      PERFORM public.upsert_operational_task(
        v_org, 'إعداد مسودة القيد لإيصال الشراء ' || r.receipt_number,
        'سُجل إيصال استلام فعلي بتكلفة مصدرية؛ يلزم على المحاسبة التحقق من البنود والحسابات وإعداد مسودة القيد.',
        'accountant', 'medium', 'purchase_receipt_accounting_draft',
        'purchase-receipt-accounting:' || r.id::text, 'purchase_receipts', r.id, NULL,
        jsonb_build_object('receipt_number', r.receipt_number, 'source_amount', r.received_cost,
          'source_currency', r.currency, 'purchase_order_id', r.purchase_order_id),
        false
      );
    ELSE
      PERFORM public.upsert_operational_task(
        v_org, 'استكمال التكلفة المصدرية لإيصال الشراء ' || r.receipt_number,
        'تكلفة الإيصال غير مثبتة أو غير موجبة في المصدر؛ لا تُنشئ قيدًا بصفر أو تقدير. طابق مستند المورد وسجّل التكلفة المصدرية المعتمدة أولًا.',
        'purchasing', 'high', 'purchase_receipt_cost_review',
        'purchase-receipt-cost-review:' || r.id::text, 'purchase_receipts', r.id, NULL,
        jsonb_build_object('receipt_number', r.receipt_number, 'source_amount', r.received_cost,
          'source_currency', r.currency, 'purchase_order_id', r.purchase_order_id,
          'requires_source_cost_reconciliation', true),
        false
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.ai_tasks t
     SET status = 'completed', completed_at = coalesce(t.completed_at, now()),
         completed_by = NULL,
         resolution_note = 'أُغلقت مهمة استلام أمر الشراء بعد اكتمال الاستلام أو إلغاء الأمر.',
         updated_at = now()
   WHERE t.organization_id = v_org AND t.source_entity_type = 'purchase_orders'
     AND t.source_event_key LIKE 'purchase-order-receiving:%'
     AND t.status IN ('pending', 'in_progress')
     AND EXISTS (
       SELECT 1 FROM public.purchase_orders po
        WHERE po.organization_id = v_org AND po.id = t.source_entity_id
          AND po.status IN ('received', 'cancelled')
     );

  UPDATE public.ai_tasks t
     SET status = 'completed', completed_at = coalesce(t.completed_at, now()),
         completed_by = NULL,
         resolution_note = 'أُغلقت مهام الإيصال بعد إنشاء مسودة القيد المرتبطة بالمصدر.',
         updated_at = now()
   WHERE t.organization_id = v_org AND t.source_entity_type = 'purchase_receipts'
     AND t.status IN ('pending', 'in_progress')
     AND EXISTS (
       SELECT 1 FROM public.purchase_receipt_accounting_postings posting
        WHERE posting.organization_id = v_org AND posting.receipt_id = t.source_entity_id
     );

  RETURN coalesce(v_existing_result, '{}'::jsonb)
    || jsonb_build_object(
      'source_records_refreshed',
      coalesce(nullif(v_existing_result ->> 'source_records_refreshed', '')::integer, 0) + v_count,
      'purchase_workflows_refreshed', v_count,
      'refreshed_at', now()
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_operational_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_operational_tasks() TO authenticated;

COMMENT ON FUNCTION public.operational_tasks_from_purchase_order() IS
  'Builds an idempotent purchasing follow-up task from the persisted order lifecycle.';
COMMENT ON FUNCTION public.operational_tasks_from_purchase_receipt() IS
  'Routes source-costed receipts to finance, and receipts without recorded source costs to purchasing.';
