-- AGH-INTELLIGENCE-PROCUREMENT-FINANCE-TASK-BRIDGE-001
-- Connect source-backed supplier payment/invoice exceptions to the existing role-scoped operational task engine.
-- upsert_operational_task() creates deduplicated ai_tasks; the existing notification trigger fans out to role queue recipients.
BEGIN;

CREATE OR REPLACE FUNCTION public.operational_tasks_from_supplier_invoice_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_invoice public.purchase_supplier_invoices%ROWTYPE;
  v_po_number text;
  v_supplier_name text;
BEGIN
  SELECT i.*,po.purchase_order_number,s.name
  INTO v_invoice,v_po_number,v_supplier_name
  FROM public.purchase_supplier_invoices i
  JOIN public.purchase_orders po
    ON po.id=i.purchase_order_id AND po.organization_id=i.organization_id
  JOIN public.suppliers s
    ON s.id=i.supplier_id AND s.organization_id=i.organization_id
  WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice task source is unavailable';
  END IF;

  IF NEW.action='recorded_variance_pending' THEN
    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'مراجعة فرق فاتورة المورد '||v_invoice.supplier_invoice_number,
      'فاتورة المورد '||v_invoice.supplier_invoice_number||' للمورد '||v_supplier_name||
        ' لا تتطابق سعريًا مع أمر الشراء '||v_po_number||' والاستلام. الفرق المسجل: '||
        v_invoice.merchandise_variance_amount::text||' '||v_invoice.currency||
        '. يلزم مراجع مالي مختلف عن منشئ الفاتورة وتسجيل سبب القرار قبل اعتمادها.',
      'purchasing','high','supplier_invoice_price_variance',
      'supplier-invoice-variance:'||v_invoice.id::text,
      'purchase_supplier_invoices',v_invoice.id,NULL,
      jsonb_build_object(
        'supplier_invoice_id',v_invoice.id,
        'supplier_invoice_number',v_invoice.supplier_invoice_number,
        'supplier_id',v_invoice.supplier_id,
        'supplier_name',v_supplier_name,
        'purchase_order_id',v_invoice.purchase_order_id,
        'purchase_order_number',v_po_number,
        'match_status',v_invoice.match_status,
        'merchandise_variance_amount',v_invoice.merchandise_variance_amount::text,
        'currency',v_invoice.currency,
        'requires_independent_finance_review',true
      ),
      false
    );
  ELSIF NEW.action IN ('variance_approved','variance_rejected') THEN
    UPDATE public.ai_tasks
    SET status='completed',
        completed_at=coalesce(completed_at,now()),
        completed_by=NEW.actor_profile_id,
        resolution_note=CASE WHEN NEW.action='variance_approved'
          THEN 'اعتمد مراجع مالي مستقل فرق فاتورة المورد مع حفظ سبب القرار.'
          ELSE 'رفض مراجع مالي مستقل فرق فاتورة المورد؛ يلزم التعامل مع المستند المرفوض دون تعديل مصدره.'
        END,
        updated_at=now()
    WHERE organization_id=NEW.organization_id
      AND source_event_key='supplier-invoice-variance:'||v_invoice.id::text
      AND status IN ('pending','in_progress');

    IF NEW.action='variance_rejected' THEN
      PERFORM public.upsert_operational_task(
        NEW.organization_id,
        'معالجة فاتورة مورد مرفوضة '||v_invoice.supplier_invoice_number,
        'رُفض فرق فاتورة المورد '||v_invoice.supplier_invoice_number||
          ' للمورد '||v_supplier_name||'. احتفظ بالمستند الأصلي، ونسّق مع المورد لإصدار مستند صحيح أو إشعار دائن/مرتجع معتمد؛ لا تعدّل الفاتورة المصدرية ولا تنشئ قيدًا بديلًا تلقائيًا.',
        'purchasing','high','supplier_invoice_rejected_followup',
        'supplier-invoice-rejected:'||v_invoice.id::text,
        'purchase_supplier_invoices',v_invoice.id,NULL,
        jsonb_build_object(
          'supplier_invoice_id',v_invoice.id,
          'supplier_invoice_number',v_invoice.supplier_invoice_number,
          'supplier_name',v_supplier_name,
          'purchase_order_number',v_po_number,
          'review_actor_profile_id',NEW.actor_profile_id,
          'review_reason',NEW.reason,
          'currency',v_invoice.currency,
          'merchandise_variance_amount',v_invoice.merchandise_variance_amount::text
        ),
        false
      );
      UPDATE public.ai_tasks
      SET status='completed',completed_at=coalesce(completed_at,now()),
          completed_by=NEW.actor_profile_id,
          resolution_note='أُغلق طلب ربط الضريبة لأن الفاتورة المصدرية رُفضت؛ لا تُعتمد ضريبتها.',
          updated_at=now()
      WHERE organization_id=NEW.organization_id
        AND source_event_key='supplier-invoice-tax-review:'||v_invoice.id::text
        AND status IN ('pending','in_progress');
    END IF;
  END IF;

  IF NEW.action IN ('recorded_matched','variance_approved')
     AND v_invoice.tax_amount>0
     AND v_invoice.match_status IN ('matched','variance_approved') THEN
    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'تحديد المعالجة الضريبية لفاتورة المورد '||v_invoice.supplier_invoice_number,
      'ضريبة فاتورة المورد موثقة بقيمة '||v_invoice.tax_amount::text||' '||v_invoice.currency||
        ' لكنها غير مربوطة بحساب أو سياسة ضريبية معتمدة. راجع المستند وتصنيف الضريبة وحساب الأستاذ وفق سياسة المنشأة قبل أي مسودة قيد. لا تفترض معدلًا ضريبيًا ولا ترحّل الضريبة تلقائيًا.',
      'accountant','medium','supplier_invoice_tax_accounting_review',
      'supplier-invoice-tax-review:'||v_invoice.id::text,
      'purchase_supplier_invoices',v_invoice.id,NULL,
      jsonb_build_object(
        'supplier_invoice_id',v_invoice.id,
        'supplier_invoice_number',v_invoice.supplier_invoice_number,
        'supplier_name',v_supplier_name,
        'tax_amount',v_invoice.tax_amount::text,
        'currency',v_invoice.currency,
        'tax_accounting_status',v_invoice.tax_accounting_status,
        'requires_explicit_tax_policy_and_account_mapping',true
      ),
      false
    );
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.operational_tasks_from_supplier_invoice_event() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS operational_tasks_supplier_invoice_event ON public.purchase_supplier_invoice_events;
CREATE TRIGGER operational_tasks_supplier_invoice_event
AFTER INSERT ON public.purchase_supplier_invoice_events
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_supplier_invoice_event();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_supplier_payment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_payment public.purchase_supplier_payments%ROWTYPE;
  v_supplier_name text;
  v_journal_number text;
BEGIN
  SELECT p.*,s.name INTO v_payment,v_supplier_name
  FROM public.purchase_supplier_payments p
  JOIN public.suppliers s ON s.id=p.supplier_id AND s.organization_id=p.organization_id
  WHERE p.id=NEW.payment_id AND p.organization_id=NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier payment task source is unavailable';
  END IF;

  IF NEW.action='recorded' THEN
    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'مطابقة إثبات دفع المورد رقم '||v_payment.payment_number::text,
      'سُجل سند دفع للمورد '||v_supplier_name||' بقيمة '||v_payment.amount::text||' '||v_payment.currency||
        ' وبمرجع '||v_payment.payment_reference||
        '. تحقق من مستند الصرف الفعلي وسجّل المطابقة من مستخدم مالي مختلف عن منشئ السند قبل تسليمه للأستاذ العام.',
      'accountant','high','supplier_payment_reconciliation',
      'supplier-payment-workflow:'||v_payment.id::text,
      'purchase_supplier_payments',v_payment.id,NULL,
      jsonb_build_object(
        'supplier_payment_id',v_payment.id,
        'payment_number',v_payment.payment_number::text,
        'supplier_id',v_payment.supplier_id,
        'supplier_name',v_supplier_name,
        'amount',v_payment.amount::text,
        'currency',v_payment.currency,
        'payment_method',v_payment.payment_method,
        'payment_reference',v_payment.payment_reference,
        'requires_independent_reconciliation',true
      ),
      false
    );
  ELSIF NEW.action='journal_draft_created' THEN
    SELECT e.entry_number::text INTO v_journal_number
    FROM public.purchase_supplier_payment_accounting_drafts d
    JOIN public.accounting_journal_entries e
      ON e.id=d.journal_entry_id AND e.organization_id=d.organization_id
    WHERE d.organization_id=NEW.organization_id AND d.payment_id=v_payment.id;

    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'ترحيل مسودة سند دفع المورد رقم '||v_payment.payment_number::text,
      'أُنشئت مسودة القيد رقم '||coalesce(v_journal_number,'غير متاح')||
        ' لسند دفع المورد '||v_payment.payment_number::text||
        '. راجع طرفي القيد والعملة والمستند المصدر ثم رحّل عبر مسار الأستاذ العام المعتمد فقط.',
      'accountant','high','supplier_payment_general_ledger_posting',
      'supplier-payment-workflow:'||v_payment.id::text,
      'purchase_supplier_payments',v_payment.id,NULL,
      jsonb_build_object(
        'supplier_payment_id',v_payment.id,
        'payment_number',v_payment.payment_number::text,
        'journal_entry_number',v_journal_number,
        'amount',v_payment.amount::text,
        'currency',v_payment.currency,
        'journal_status','draft'
      ),
      false
    );
  ELSIF NEW.action='voided' THEN
    UPDATE public.ai_tasks
    SET status='completed',completed_at=coalesce(completed_at,now()),
        completed_by=NEW.actor_profile_id,
        resolution_note='أُلغي سند دفع المورد من المصدر مع حفظ أثر الإلغاء وسببه.',
        updated_at=now()
    WHERE organization_id=NEW.organization_id
      AND source_event_key='supplier-payment-workflow:'||v_payment.id::text
      AND status IN ('pending','in_progress');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.operational_tasks_from_supplier_payment_event() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS operational_tasks_supplier_payment_event ON public.purchase_supplier_payment_events;
CREATE TRIGGER operational_tasks_supplier_payment_event
AFTER INSERT ON public.purchase_supplier_payment_events
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_supplier_payment_event();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_supplier_payment_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_payment public.purchase_supplier_payments%ROWTYPE;
  v_supplier_name text;
  v_title text;
  v_description text;
  v_priority text;
  v_type text;
BEGIN
  SELECT p.*,s.name INTO v_payment,v_supplier_name
  FROM public.purchase_supplier_payments p
  JOIN public.suppliers s ON s.id=p.supplier_id AND s.organization_id=p.organization_id
  WHERE p.id=NEW.payment_id AND p.organization_id=NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier payment reconciliation task source is unavailable';
  END IF;

  IF NEW.action='exception' THEN
    v_title:='استثناء في مطابقة دفع المورد رقم '||v_payment.payment_number::text;
    v_description:='سند دفع المورد '||v_supplier_name||' بقيمة '||v_payment.amount::text||' '||v_payment.currency||
      ' لم يطابق مستند الصرف. السبب المسجل: '||coalesce(NEW.reason,'غير محدد')||
      '. راجع المرجع والمبلغ والعملة، ولا تنشئ مسودة قيد حتى تسجل أدلة مطابقة صحيحة من مراجع مستقل.';
    v_priority:='high';
    v_type:='supplier_payment_reconciliation_exception';
  ELSE
    v_title:='إعداد مسودة قيد دفع المورد رقم '||v_payment.payment_number::text;
    v_description:='تمت مطابقة مستند الصرف لسند المورد '||v_payment.payment_number::text||
      ' من مستخدم مالي مستقل. جهّز المسودة عبر أمر الخدمة ثم أحلها إلى الأستاذ العام للمراجعة والترحيل اليدوي.';
    v_priority:='medium';
    v_type:='supplier_payment_journal_handoff';
  END IF;

  PERFORM public.upsert_operational_task(
    NEW.organization_id,v_title,v_description,'accountant',v_priority,v_type,
    'supplier-payment-workflow:'||v_payment.id::text,
    'purchase_supplier_payments',v_payment.id,NULL,
    jsonb_build_object(
      'supplier_payment_id',v_payment.id,
      'payment_number',v_payment.payment_number::text,
      'supplier_name',v_supplier_name,
      'amount',v_payment.amount::text,
      'currency',v_payment.currency,
      'reconciliation_action',NEW.action,
      'evidence_type',NEW.evidence_type,
      'evidence_reference',NEW.evidence_reference,
      'observed_amount',NEW.observed_amount::text,
      'reason',NEW.reason,
      'independent_actor_profile_id',NEW.actor_profile_id
    ),
    false
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.operational_tasks_from_supplier_payment_reconciliation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS operational_tasks_supplier_payment_reconciliation_event ON public.purchase_supplier_payment_reconciliation_events;
CREATE TRIGGER operational_tasks_supplier_payment_reconciliation_event
AFTER INSERT ON public.purchase_supplier_payment_reconciliation_events
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_supplier_payment_reconciliation();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_supplier_payment_journal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_payment public.purchase_supplier_payments%ROWTYPE;
  v_supplier_name text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.source_type<>'purchase_supplier_payment'
     OR NEW.status NOT IN ('posted','void') THEN
    RETURN NEW;
  END IF;

  SELECT p.*,s.name INTO v_payment,v_supplier_name
  FROM public.purchase_supplier_payments p
  JOIN public.suppliers s ON s.id=p.supplier_id AND s.organization_id=p.organization_id
  WHERE p.organization_id=NEW.organization_id
    AND p.payment_number::text=NEW.source_reference;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status='posted' THEN
    UPDATE public.ai_tasks
    SET status='completed',completed_at=coalesce(completed_at,now()),
        completed_by=NULL,
        resolution_note='رُحّل قيد دفع المورد في الأستاذ العام بعد المطابقة والمراجعة.',
        updated_at=now()
    WHERE organization_id=NEW.organization_id
      AND source_event_key='supplier-payment-workflow:'||v_payment.id::text
      AND status IN ('pending','in_progress');
  ELSE
    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'معالجة سند دفع مورد بعد إلغاء قيد الأستاذ '||v_payment.payment_number::text,
      'أُلغي قيد الأستاذ المرتبط بسند دفع المورد '||v_payment.payment_number::text||
        ' بقيمة '||v_payment.amount::text||' '||v_payment.currency||
        '. راجع سبب الإلغاء، ثم ألغِ سند المصدر بصلاحية مدير/مسؤول لتحرير التخصيصات أو ابدأ دورة دفع جديدة. لا تعد استخدام القيد الملغى.',
      'management','high','supplier_payment_voided_journal',
      'supplier-payment-voided-journal:'||v_payment.id::text,
      'purchase_supplier_payments',v_payment.id,NULL,
      jsonb_build_object(
        'supplier_payment_id',v_payment.id,
        'payment_number',v_payment.payment_number::text,
        'journal_entry_id',NEW.id,
        'journal_entry_number',NEW.entry_number::text,
        'amount',v_payment.amount::text,
        'currency',v_payment.currency,
        'journal_status',NEW.status
      ),
      false
    );
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.operational_tasks_from_supplier_payment_journal_status() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS operational_tasks_supplier_payment_journal_status ON public.accounting_journal_entries;
CREATE TRIGGER operational_tasks_supplier_payment_journal_status
AFTER UPDATE OF status ON public.accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_supplier_payment_journal_status();

COMMENT ON FUNCTION public.operational_tasks_from_supplier_invoice_event() IS
  'Creates deduplicated purchasing/finance tasks from real supplier invoice match, rejection and pending-tax events using the existing role-scoped operational task engine.';
COMMENT ON FUNCTION public.operational_tasks_from_supplier_payment_event() IS
  'Creates or closes one source-linked accountant task across supplier payment capture, draft handoff and source void transitions.';
COMMENT ON FUNCTION public.operational_tasks_from_supplier_payment_reconciliation() IS
  'Updates the same deduplicated supplier payment workflow task when independently reviewed cash/bank/cheque evidence matches or has an exception.';
COMMENT ON FUNCTION public.operational_tasks_from_supplier_payment_journal_status() IS
  'Closes supplier payment work after a posted journal and alerts management when its draft journal is voided, keeping source reservation visible.';

COMMIT;
