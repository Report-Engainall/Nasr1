-- NASR1-ORIGINAL-SPEC-RETURN-CREDIT-MEMO-TASKS-014
-- Surface real source-linked credit-memo draft review in the existing operational task inbox.
-- Tasks are informational workflow records only: no automatic journal posting or cash refund is performed.

CREATE OR REPLACE FUNCTION public.operational_tasks_from_return_credit_memo_posting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_memo public.customer_return_credit_memos%ROWTYPE;
  v_journal public.accounting_journal_entries%ROWTYPE;
BEGIN
  SELECT m.* INTO v_memo
    FROM public.customer_return_credit_memos m
   WHERE m.organization_id = NEW.organization_id
     AND m.id = NEW.credit_memo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='return credit memo source is missing for its accounting posting';
  END IF;

  SELECT e.* INTO v_journal
    FROM public.accounting_journal_entries e
   WHERE e.organization_id = NEW.organization_id
     AND e.id = NEW.journal_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='source journal is missing for the return credit memo';
  END IF;

  IF v_memo.status = 'draft' AND v_journal.status = 'draft' THEN
    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'مراجعة وترحيل قيد الإشعار الدائن ' || v_memo.memo_number,
      'يوجد إشعار دائن محفوظ بمسودة قيد مرتبطة بمستند المرتجع والفاتورة الأصلية. راجع التوازن والحسابات ومصدر المبلغ ثم رحّل القيد وفق صلاحيتك؛ لا ينفذ النظام استردادًا نقديًا تلقائيًا.',
      'accountant', 'medium', 'return_credit_memo_accounting_review',
      'return-credit-memo-posting:' || NEW.credit_memo_id::text,
      'customer_return_credit_memos', NEW.credit_memo_id, NULL,
      jsonb_build_object(
        'credit_memo_id', NEW.credit_memo_id,
        'memo_number', v_memo.memo_number,
        'return_request_id', v_memo.return_request_id,
        'invoice_id', v_memo.invoice_id,
        'journal_entry_id', v_journal.id,
        'journal_entry_number', v_journal.entry_number::text,
        'source_amount', NEW.source_amount,
        'source_currency', NEW.source_currency,
        'memo_status', v_memo.status,
        'journal_status', v_journal.status
      ),
      false
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS operational_tasks_return_credit_memo_posting ON public.accounting_return_credit_memo_postings;
CREATE TRIGGER operational_tasks_return_credit_memo_posting
AFTER INSERT ON public.accounting_return_credit_memo_postings
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_return_credit_memo_posting();

CREATE OR REPLACE FUNCTION public.operational_tasks_from_return_credit_memo_journal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_credit_memo_id uuid;
  v_memo_status text;
  v_memo_number text;
  v_key text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.source_type IS DISTINCT FROM 'customer_return_credit_memo'
     OR NEW.status NOT IN ('posted','void') THEN
    RETURN NEW;
  END IF;

  SELECT posting.credit_memo_id, memo.status, memo.memo_number
    INTO v_credit_memo_id, v_memo_status, v_memo_number
    FROM public.accounting_return_credit_memo_postings posting
    JOIN public.customer_return_credit_memos memo
      ON memo.organization_id = posting.organization_id
     AND memo.id = posting.credit_memo_id
   WHERE posting.organization_id = NEW.organization_id
     AND posting.journal_entry_id = NEW.id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  v_key := 'return-credit-memo-posting:' || v_credit_memo_id::text;

  UPDATE public.ai_tasks
     SET status = 'completed',
         completed_at = coalesce(completed_at, now()),
         completed_by = public.current_profile_id(),
         resolution_note = CASE
           WHEN NEW.status = 'posted' THEN 'أُغلقت بعد ترحيل القيد المحاسبي المرتبط بالإشعار الدائن ' || v_memo_number || '.'
           ELSE 'أُغلقت بعد إلغاء مسودة القيد المرتبط بالإشعار الدائن ' || v_memo_number || '.'
         END,
         updated_at = now()
   WHERE organization_id = NEW.organization_id
     AND source_event_key = v_key
     AND source_entity_type = 'customer_return_credit_memos'
     AND source_entity_id = v_credit_memo_id
     AND status IN ('pending','in_progress');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS operational_tasks_return_credit_memo_journal_status ON public.accounting_journal_entries;
CREATE TRIGGER operational_tasks_return_credit_memo_journal_status
AFTER UPDATE OF status ON public.accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_return_credit_memo_journal_status();

DO $block$
BEGIN
  IF to_regprocedure('public.refresh_operational_tasks_pre_credit_memo_v1()') IS NULL THEN
    ALTER FUNCTION public.refresh_operational_tasks() RENAME TO refresh_operational_tasks_pre_credit_memo_v1;
  END IF;
END
$block$;

REVOKE ALL ON FUNCTION public.refresh_operational_tasks_pre_credit_memo_v1() FROM PUBLIC, anon, authenticated;

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
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to refresh tasks';
  END IF;
  v_existing_result := public.refresh_operational_tasks_pre_credit_memo_v1();

  FOR r IN
    SELECT memo.id, memo.memo_number, memo.return_request_id, memo.invoice_id,
           memo.total_amount, memo.currency, posting.journal_entry_id,
           entry.entry_number::text AS journal_entry_number
      FROM public.customer_return_credit_memos memo
      JOIN public.accounting_return_credit_memo_postings posting
        ON posting.organization_id = memo.organization_id
       AND posting.credit_memo_id = memo.id
      JOIN public.accounting_journal_entries entry
        ON entry.organization_id = posting.organization_id
       AND entry.id = posting.journal_entry_id
     WHERE memo.organization_id = v_org
       AND memo.status = 'draft'
       AND entry.status = 'draft'
  LOOP
    PERFORM public.upsert_operational_task(
      v_org,
      'مراجعة وترحيل قيد الإشعار الدائن ' || r.memo_number,
      'يوجد إشعار دائن محفوظ بمسودة قيد مرتبطة بمستند المرتجع والفاتورة الأصلية. راجع التوازن والحسابات ومصدر المبلغ ثم رحّل القيد وفق صلاحيتك؛ لا ينفذ النظام استردادًا نقديًا تلقائيًا.',
      'accountant', 'medium', 'return_credit_memo_accounting_review',
      'return-credit-memo-posting:' || r.id::text,
      'customer_return_credit_memos', r.id, NULL,
      jsonb_build_object(
        'credit_memo_id', r.id,
        'memo_number', r.memo_number,
        'return_request_id', r.return_request_id,
        'invoice_id', r.invoice_id,
        'journal_entry_id', r.journal_entry_id,
        'journal_entry_number', r.journal_entry_number,
        'source_amount', r.total_amount,
        'source_currency', r.currency,
        'memo_status', 'draft',
        'journal_status', 'draft'
      ),
      false
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.ai_tasks task
     SET status = 'completed',
         completed_at = coalesce(task.completed_at, now()),
         completed_by = NULL,
         resolution_note = CASE WHEN entry.status = 'posted'
           THEN 'أُغلقت بعد ترحيل القيد المحاسبي المرتبط بالإشعار الدائن ' || memo.memo_number || '.'
           ELSE 'أُغلقت بعد إلغاء مسودة القيد المرتبط بالإشعار الدائن ' || memo.memo_number || '.'
         END,
         updated_at = now()
    FROM public.customer_return_credit_memos memo
    JOIN public.accounting_return_credit_memo_postings posting
      ON posting.organization_id = memo.organization_id AND posting.credit_memo_id = memo.id
    JOIN public.accounting_journal_entries entry
      ON entry.organization_id = posting.organization_id AND entry.id = posting.journal_entry_id
   WHERE task.organization_id = v_org
     AND task.source_event_key = 'return-credit-memo-posting:' || memo.id::text
     AND task.source_entity_type = 'customer_return_credit_memos'
     AND task.source_entity_id = memo.id
     AND task.status IN ('pending','in_progress')
     AND (memo.status IN ('posted','void','reversed') OR entry.status IN ('posted','void'));

  RETURN coalesce(v_existing_result, '{}'::jsonb)
    || jsonb_build_object(
      'source_records_refreshed',
      coalesce(nullif(v_existing_result ->> 'source_records_refreshed', '')::integer, 0) + v_count,
      'return_credit_memo_tasks_refreshed', v_count,
      'refreshed_at', now()
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_operational_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_operational_tasks() TO authenticated;

COMMENT ON FUNCTION public.operational_tasks_from_return_credit_memo_posting() IS
  'Creates one accountant-owned operational task from a persisted draft return-credit-memo journal link.';
COMMENT ON FUNCTION public.operational_tasks_from_return_credit_memo_journal_status() IS
  'Closes the source-linked accountant task only when the credit-memo journal is posted or its draft is voided.';
COMMENT ON FUNCTION public.refresh_operational_tasks() IS
  'Rebuilds open source-linked tasks across native commerce, receiving, and return credit-memo workflows without duplicate tasks.';
