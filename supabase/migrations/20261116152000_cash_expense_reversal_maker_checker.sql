-- Cash expense source reversals follow an independent journal-post workflow.
BEGIN;

CREATE OR REPLACE FUNCTION public.accounting_handle_cash_expense_void()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_original record;
  v_expense public.cash_expenses%ROWTYPE;
  v_reversal public.accounting_journal_entries%ROWTYPE;
  v_reversal_key uuid:=gen_random_uuid();
  v_reversal_fingerprint text;
  v_reversal_description text;
  v_reason text;
BEGIN
  IF OLD.status<>'posted' OR NEW.status<>'void' THEN RETURN NEW; END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active same-organization actor required to void a cash expense';
  END IF;

  SELECT sp.*,je.status AS linked_status INTO v_original
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
   WHERE sp.organization_id=OLD.organization_id AND sp.source_type='cash_expense' AND sp.source_id=OLD.id
     AND sp.posting_kind='original'
   ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1 FOR UPDATE OF je;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_original.linked_status='draft' THEN
    v_reason:=pg_catalog.left('إلغاء مسودة قيد مصدرها المصروف رقم '||OLD.expense_number::text||': '||coalesce(NEW.void_reason,'إلغاء المصروف'),495);
    UPDATE public.accounting_journal_entries
       SET status='void',voided_by_profile_id=v_actor,voided_at=pg_catalog.now(),void_reason=v_reason,updated_at=pg_catalog.now()
     WHERE id=v_original.journal_entry_id AND organization_id=OLD.organization_id AND status='draft';
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES (OLD.organization_id,v_actor,'accounting.cash_expense_journal_draft_voided','accounting_journal_entry',v_original.journal_entry_id,
      pg_catalog.jsonb_build_object('source_id',OLD.id,'status','draft'),
      pg_catalog.jsonb_build_object('status','void','reason',v_reason));
    RETURN NEW;
  END IF;

  IF v_original.linked_status='posted' THEN
    SELECT ce.* INTO v_expense FROM public.cash_expenses ce
     WHERE ce.id=OLD.id AND ce.organization_id=OLD.organization_id FOR UPDATE;
    IF NOT FOUND OR v_expense.amount IS DISTINCT FROM v_original.source_amount
       OR v_expense.currency IS DISTINCT FROM v_original.source_currency THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source amount differs from posted cash expense journal; manual reconciliation required';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.accounting_source_postings rp
      JOIN public.accounting_journal_entries re ON re.id=rp.journal_entry_id AND re.organization_id=rp.organization_id
      WHERE rp.organization_id=OLD.organization_id AND rp.source_id=OLD.id AND rp.posting_kind='reversal'
    ) THEN
      RETURN NEW;
    END IF;
    v_reason:=pg_catalog.left(pg_catalog.btrim(coalesce(NEW.void_reason,'إلغاء المصروف')),500);
    v_reversal_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
      'source_id',OLD.id,'original_entry_id',v_original.journal_entry_id,
      'amount',v_expense.amount::text,'currency',v_expense.currency,'reason',v_reason,
      'expense_account_id',v_original.expense_account_id,'settlement_account_id',v_original.settlement_account_id
    )::text);
    v_reversal_description:='عكس مصروف نقدي #'||OLD.expense_number::text;
    INSERT INTO public.accounting_journal_entries(
      organization_id,entry_date,description,source_type,source_reference,status,idempotency_key,
      payload_fingerprint,created_by_profile_id,posted_by_profile_id,posted_at
    ) VALUES (
      OLD.organization_id,coalesce(NEW.voided_at::date,current_date),v_reversal_description,'adjustment',
      'cash-expense-reversal:'||OLD.id::text,'draft',v_reversal_key,v_reversal_fingerprint,v_actor,NULL,NULL
    ) RETURNING * INTO v_reversal;
    INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
    VALUES
      (OLD.organization_id,v_reversal.id,1,v_original.settlement_account_id,v_expense.amount,0,'عكس دائن القيد الأصلي'),
      (OLD.organization_id,v_reversal.id,2,v_original.expense_account_id,0,v_expense.amount,'عكس مدين القيد الأصلي');
    INSERT INTO public.accounting_source_postings(
      organization_id,source_type,source_id,posting_kind,journal_entry_id,source_amount,source_currency,
      expense_account_id,settlement_account_id,idempotency_key,payload_fingerprint,reversal_reason,created_by_profile_id
    ) VALUES (
      OLD.organization_id,'cash_expense',OLD.id,'reversal',v_reversal.id,v_expense.amount,v_expense.currency,
      v_original.expense_account_id,v_original.settlement_account_id,v_reversal_key,v_reversal_fingerprint,v_reason,v_actor
    );
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES (OLD.organization_id,v_actor,'accounting.cash_expense_journal_reversal_draft_created','cash_expense',OLD.id,
      pg_catalog.jsonb_build_object('journal_entry_id',v_original.journal_entry_id,'status','posted','amount',v_expense.amount::text),
      pg_catalog.jsonb_build_object('reversal_entry_id',v_reversal.id,'reversal_entry_number',v_reversal.entry_number::text,
        'status','draft','reason',v_reason));
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.accounting_handle_cash_expense_void() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS accounting_cash_expense_void_journal_guard ON public.cash_expenses;
CREATE TRIGGER accounting_cash_expense_void_journal_guard
BEFORE UPDATE OF status ON public.cash_expenses
FOR EACH ROW EXECUTE FUNCTION public.accounting_handle_cash_expense_void();

CREATE OR REPLACE FUNCTION public.fetch_cash_expense_accounting_inbox(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_status text DEFAULT 'unposted'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_limit integer:=coalesce(p_limit,50);
  v_offset integer:=coalesce(p_offset,0);
  v_status text:=lower(btrim(coalesce(p_status,'unposted')));
  v_items jsonb;
  v_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read cash expense accounting inbox';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 100000
     OR v_status NOT IN ('all','unposted','draft','posted','void','source_void') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid accounting inbox filter or page bounds';
  END IF;

  WITH latest_original AS (
    SELECT DISTINCT ON (sp.source_id)
      sp.organization_id,sp.source_id,sp.journal_entry_id,sp.expense_account_id,sp.settlement_account_id,
      je.status AS journal_status,je.entry_number
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je
      ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), latest_reversal AS (
     SELECT DISTINCT ON (sp.source_id)
       sp.organization_id,sp.source_id,sp.journal_entry_id,je.status AS reversal_status,
       je.entry_number AS reversal_entry_number,
       (je.status='draft'
        AND je.created_by_profile_id IS DISTINCT FROM v_actor
        AND original.created_by_profile_id IS DISTINCT FROM v_actor
        AND original.posted_by_profile_id IS DISTINCT FROM v_actor
        AND public.current_actor_has_capability('finance.journal.post')) AS reversal_can_post
     FROM public.accounting_source_postings sp
     JOIN public.accounting_journal_entries je
       ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
     JOIN LATERAL (
       SELECT oe.created_by_profile_id,oe.posted_by_profile_id
         FROM public.accounting_source_postings original_link
         JOIN public.accounting_journal_entries oe
           ON oe.id=original_link.journal_entry_id AND oe.organization_id=original_link.organization_id
        WHERE original_link.organization_id=sp.organization_id
          AND original_link.source_type='cash_expense'
          AND original_link.source_id=sp.source_id
          AND original_link.posting_kind='original'
        ORDER BY original_link.created_at DESC,original_link.id DESC LIMIT 1
     ) original ON true
     WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.posting_kind='reversal'
     ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), filtered AS (
    SELECT e.id,e.expense_number,e.category,e.description,e.amount,e.currency,e.payment_method,e.reference,
           e.expense_date,e.status AS source_status,e.created_at,
           o.journal_entry_id,o.journal_status,o.entry_number AS journal_entry_number,
           o.expense_account_id,o.settlement_account_id,
           r.journal_entry_id AS reversal_entry_id,r.reversal_status,r.reversal_entry_number,r.reversal_can_post
      FROM public.cash_expenses e
      LEFT JOIN latest_original o ON o.organization_id=e.organization_id AND o.source_id=e.id
      LEFT JOIN latest_reversal r ON r.organization_id=e.organization_id AND r.source_id=e.id
     WHERE e.organization_id=v_org
       AND (
         v_status='all'
         OR (v_status='unposted' AND e.status='posted' AND (o.journal_status IS NULL OR o.journal_status='void'))
         OR (v_status IN ('draft','posted','void') AND e.status='posted' AND o.journal_status=v_status)
         OR (v_status='source_void' AND e.status='void')
       )
  )
  SELECT count(*)::integer INTO v_count FROM filtered;

  WITH latest_original AS (
    SELECT DISTINCT ON (sp.source_id)
      sp.organization_id,sp.source_id,sp.journal_entry_id,sp.expense_account_id,sp.settlement_account_id,
      je.status AS journal_status,je.entry_number
    FROM public.accounting_source_postings sp
    JOIN public.accounting_journal_entries je ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
    WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.posting_kind='original'
    ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), latest_reversal AS (
     SELECT DISTINCT ON (sp.source_id)
       sp.organization_id,sp.source_id,sp.journal_entry_id,je.status AS reversal_status,
       je.entry_number AS reversal_entry_number,
       (je.status='draft'
        AND je.created_by_profile_id IS DISTINCT FROM v_actor
        AND original.created_by_profile_id IS DISTINCT FROM v_actor
        AND original.posted_by_profile_id IS DISTINCT FROM v_actor
        AND public.current_actor_has_capability('finance.journal.post')) AS reversal_can_post
     FROM public.accounting_source_postings sp
     JOIN public.accounting_journal_entries je
       ON je.id=sp.journal_entry_id AND je.organization_id=sp.organization_id
     JOIN LATERAL (
       SELECT oe.created_by_profile_id,oe.posted_by_profile_id
         FROM public.accounting_source_postings original_link
         JOIN public.accounting_journal_entries oe
           ON oe.id=original_link.journal_entry_id AND oe.organization_id=original_link.organization_id
        WHERE original_link.organization_id=sp.organization_id
          AND original_link.source_type='cash_expense'
          AND original_link.source_id=sp.source_id
          AND original_link.posting_kind='original'
        ORDER BY original_link.created_at DESC,original_link.id DESC LIMIT 1
     ) original ON true
     WHERE sp.organization_id=v_org AND sp.source_type='cash_expense' AND sp.posting_kind='reversal'
     ORDER BY sp.source_id,sp.created_at DESC,sp.id DESC
  ), filtered AS (
    SELECT e.id,e.expense_number,e.category,e.description,e.amount,e.currency,e.payment_method,e.reference,
           e.expense_date,e.status AS source_status,e.created_at,
           o.journal_entry_id,o.journal_status,o.entry_number AS journal_entry_number,
           o.expense_account_id,o.settlement_account_id,r.journal_entry_id AS reversal_entry_id,r.reversal_status,r.reversal_entry_number,r.reversal_can_post
      FROM public.cash_expenses e
      LEFT JOIN latest_original o ON o.organization_id=e.organization_id AND o.source_id=e.id
      LEFT JOIN latest_reversal r ON r.organization_id=e.organization_id AND r.source_id=e.id
     WHERE e.organization_id=v_org
       AND (
         v_status='all'
         OR (v_status='unposted' AND e.status='posted' AND (o.journal_status IS NULL OR o.journal_status='void'))
         OR (v_status IN ('draft','posted','void') AND e.status='posted' AND o.journal_status=v_status)
         OR (v_status='source_void' AND e.status='void')
       )
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id::text,'expense_number',q.expense_number::text,'category',q.category,'description',q.description,
    'amount',q.amount::text,'currency',q.currency,'payment_method',q.payment_method,'reference',q.reference,
    'expense_date',q.expense_date::text,'source_status',q.source_status,'created_at',q.created_at,
    'journal_entry_id',q.journal_entry_id::text,'journal_status',q.journal_status,
    'journal_entry_number',q.journal_entry_number::text,'expense_account_id',q.expense_account_id::text,
    'settlement_account_id',q.settlement_account_id::text,
     'reversal_entry_id',q.reversal_entry_id::text,
     'reversal_status',q.reversal_status,'reversal_entry_number',q.reversal_entry_number::text,
     'reversal_can_post',coalesce(q.reversal_can_post,false)
  ) ORDER BY q.expense_date DESC,q.created_at DESC,q.id DESC),'[]'::jsonb)
    INTO v_items
    FROM (
      SELECT f.* FROM filtered f
       ORDER BY f.expense_date DESC,f.created_at DESC,f.id DESC
       LIMIT v_limit OFFSET v_offset
    ) q;
  RETURN jsonb_build_object('items',v_items,'total_count',v_count,'has_more',(v_offset+jsonb_array_length(v_items))<v_count,'limit',v_limit,'offset',v_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_cash_expense_accounting_inbox(integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_cash_expense_accounting_inbox(integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_cash_expense_reversal_post_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_link public.accounting_source_postings%ROWTYPE;
  v_original public.accounting_journal_entries%ROWTYPE;
  v_expense public.cash_expenses%ROWTYPE;
  v_line_count integer;
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' OR NEW.status IS DISTINCT FROM 'posted' THEN RETURN NEW; END IF;
  SELECT sp.* INTO v_link
    FROM public.accounting_source_postings sp
   WHERE sp.organization_id=NEW.organization_id AND sp.journal_entry_id=NEW.id
     AND sp.source_type='cash_expense' AND sp.posting_kind='reversal'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT e.* INTO v_expense FROM public.cash_expenses e
   WHERE e.organization_id=v_link.organization_id AND e.id=v_link.source_id FOR UPDATE;
  SELECT je.* INTO v_original
    FROM public.accounting_source_postings op
    JOIN public.accounting_journal_entries je
      ON je.id=op.journal_entry_id AND je.organization_id=op.organization_id
   WHERE op.organization_id=v_link.organization_id AND op.source_type='cash_expense'
     AND op.source_id=v_link.source_id AND op.posting_kind='original'
   ORDER BY op.created_at DESC,op.id DESC LIMIT 1 FOR UPDATE OF je;
  IF v_expense.id IS NULL OR v_original.id IS NULL OR v_original.status IS DISTINCT FROM 'posted'
     OR v_expense.status IS DISTINCT FROM 'void' OR v_expense.currency IS DISTINCT FROM 'YER'
     OR v_expense.amount IS DISTINCT FROM v_link.source_amount
     OR v_expense.currency IS DISTINCT FROM v_link.source_currency
     OR NEW.source_type IS DISTINCT FROM 'adjustment'
     OR NEW.source_reference IS DISTINCT FROM ('cash-expense-reversal:'||v_expense.id::text)
     OR NEW.created_by_profile_id IS DISTINCT FROM v_link.created_by_profile_id
     OR v_original.created_by_profile_id IS NULL OR v_original.posted_by_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='cash expense reversal source, original posting or creator identity changed; posting rejected';
  END IF;
  IF auth.uid() IS NULL OR v_actor IS NULL
     OR v_actor IS NOT DISTINCT FROM v_link.created_by_profile_id
     OR v_actor IS NOT DISTINCT FROM v_original.created_by_profile_id
     OR v_actor IS NOT DISTINCT FROM v_original.posted_by_profile_id
     OR NEW.posted_by_profile_id IS DISTINCT FROM v_actor
     OR NOT public.current_actor_has_capability('finance.journal.post') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='cash expense reversal requires a finance.journal.post reviewer different from the reversal creator, original creator and original poster';
  END IF;
  SELECT count(*)::integer INTO v_line_count FROM public.accounting_journal_lines l
   WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id;
  IF v_line_count<>2
     OR NOT EXISTS (
       SELECT 1 FROM public.accounting_journal_lines l
        WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id
          AND l.line_number=1 AND l.account_id=v_link.settlement_account_id
          AND l.debit=v_expense.amount AND l.credit=0
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.accounting_journal_lines l
        WHERE l.organization_id=NEW.organization_id AND l.journal_entry_id=NEW.id
          AND l.line_number=2 AND l.account_id=v_link.expense_account_id
          AND l.debit=0 AND l.credit=v_expense.amount
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='cash expense reversal must exactly reverse the source amount and accounts';
  END IF;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(
    NEW.organization_id,v_actor,'accounting.cash_expense_journal_reversal_posted','cash_expense',v_expense.id,
    jsonb_build_object('original_journal_entry_id',v_original.id,'reversal_journal_entry_id',NEW.id,'status','draft'),
    jsonb_build_object('original_journal_entry_id',v_original.id,'reversal_journal_entry_id',NEW.id,
      'status','posted','amount',v_expense.amount::text,'currency',v_expense.currency)
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_cash_expense_reversal_post_v2() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS cash_expense_reversal_independent_poster_guard_v2 ON public.accounting_journal_entries;
CREATE TRIGGER cash_expense_reversal_independent_poster_guard_v2
BEFORE UPDATE OF status ON public.accounting_journal_entries
FOR EACH ROW WHEN (OLD.status='draft' AND NEW.status='posted')
EXECUTE FUNCTION public.guard_cash_expense_reversal_post_v2();

COMMENT ON FUNCTION public.guard_cash_expense_reversal_post_v2() IS
  'Source-linked cash expense reversal requires finance.journal.post and a checker different from reversal creator, original creator and original poster.';



COMMENT ON FUNCTION public.accounting_handle_cash_expense_void() IS
  'Voids a cash expense and atomically voids any original draft or creates one balanced reversal draft. A different finance reviewer posts it separately.';
COMMENT ON FUNCTION public.fetch_cash_expense_accounting_inbox(integer,integer,text) IS
  'Tenant-scoped cash expense accounting inbox with reversal identity and reviewer eligibility.';

COMMIT;
