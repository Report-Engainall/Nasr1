-- Source-linked return credit memo reversals use a two-person maker/checker lifecycle.
-- Preparing a reversal creates an immutable draft; a different finance poster commits it.
BEGIN;

ALTER TABLE public.accounting_return_credit_memo_reversals
  ALTER COLUMN reversed_at DROP NOT NULL,
  ALTER COLUMN reversed_at DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS posted_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- Preserve any legacy completed reversal evidence while allowing new drafts to remain pending.
UPDATE public.accounting_return_credit_memo_reversals r
   SET posted_by_profile_id=m.reversed_by_profile_id,
       posted_at=m.reversed_at,
       reversed_at=m.reversed_at
  FROM public.customer_return_credit_memos m
 WHERE m.organization_id=r.organization_id
   AND m.id=r.credit_memo_id
   AND m.status='reversed'
   AND r.posted_by_profile_id IS NULL;

ALTER TABLE public.accounting_return_credit_memo_reversals
  ADD CONSTRAINT accounting_return_credit_memo_reversals_checker_pair_guard
  CHECK (
    (posted_by_profile_id IS NULL AND posted_at IS NULL AND reversed_at IS NULL)
    OR
    (posted_by_profile_id IS NOT NULL AND posted_at IS NOT NULL AND reversed_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.reverse_customer_return_credit_memo(
  p_credit_memo_id uuid,p_reason text,p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
  v_memo public.customer_return_credit_memos%ROWTYPE;
  v_source public.accounting_return_credit_memo_postings%ROWTYPE;
  v_original public.accounting_journal_entries%ROWTYPE;
  v_reversal public.accounting_journal_entries%ROWTYPE;
  v_existing public.accounting_return_credit_memo_reversals%ROWTYPE;
  v_line_count integer;
  v_debit numeric(15,2);
  v_credit numeric(15,2);
  v_fingerprint text;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_actor_has_capability('finance.journal.reverse') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance.journal.reverse capability required to prepare a return credit memo reversal';
  END IF;
  IF p_credit_memo_id IS NULL OR p_idempotency_key IS NULL
     OR pg_catalog.char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo id, idempotency key and a 5-500 character reversal reason are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':return-credit-memo-reversal:'||p_credit_memo_id::text,0)
  );
  SELECT m.* INTO v_memo FROM public.customer_return_credit_memos m
   WHERE m.id=p_credit_memo_id AND m.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='return credit memo not found in this organization';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'organization_id',v_org,'credit_memo_id',v_memo.id,'reason',v_reason,
    'source_amount',v_memo.total_amount::text,'source_currency',v_memo.currency
  )::text);

  SELECT r.* INTO v_existing FROM public.accounting_return_credit_memo_reversals r
   WHERE r.organization_id=v_org AND r.credit_memo_id=v_memo.id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.idempotency_key IS DISTINCT FROM p_idempotency_key
       OR v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='this return credit memo already has an immutable reversal request';
    END IF;
    SELECT e.* INTO v_reversal FROM public.accounting_journal_entries e
     WHERE e.id=v_existing.reversal_journal_entry_id AND e.organization_id=v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='recorded reversal journal is missing';
    END IF;
    IF v_memo.status='reversed' AND v_reversal.status='posted'
       AND v_existing.posted_by_profile_id IS NOT NULL
       AND v_existing.reversed_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'credit_memo_id',v_memo.id,'memo_number',v_memo.memo_number,'status','reversed',
        'original_journal_entry_id',v_existing.original_journal_entry_id,
        'reversal_journal_entry_id',v_reversal.id,'reversal_journal_entry_number',v_reversal.entry_number::text,
        'reversal_status',v_reversal.status,'reason',v_existing.reason,'replayed',true
      );
    END IF;
    IF v_memo.status='posted' AND v_reversal.status='draft'
       AND v_existing.posted_by_profile_id IS NULL
       AND v_existing.posted_at IS NULL AND v_existing.reversed_at IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'credit_memo_id',v_memo.id,'memo_number',v_memo.memo_number,'status','reversal_pending',
        'original_journal_entry_id',v_existing.original_journal_entry_id,
        'reversal_journal_entry_id',v_reversal.id,'reversal_journal_entry_number',v_reversal.entry_number::text,
        'reversal_status',v_reversal.status,'reason',v_existing.reason,'replayed',true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='recorded reversal state does not reconcile with its source memo';
  END IF;

  IF v_memo.status<>'posted' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a posted return credit memo can begin reversal; void unposted drafts separately';
  END IF;
  IF v_memo.currency<>'YER' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo currency has no approved reversal policy';
  END IF;

  SELECT sp.* INTO v_source FROM public.accounting_return_credit_memo_postings sp
   WHERE sp.organization_id=v_org AND sp.credit_memo_id=v_memo.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo is missing its authoritative accounting source link';
  END IF;
  SELECT e.* INTO v_original FROM public.accounting_journal_entries e
   WHERE e.id=v_source.journal_entry_id AND e.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_original.status<>'posted'
     OR v_original.source_type<>'customer_return_credit_memo'
     OR v_original.source_reference IS DISTINCT FROM v_memo.id::text
     OR v_source.source_amount IS DISTINCT FROM v_memo.total_amount
     OR v_source.source_currency IS DISTINCT FROM v_memo.currency
     OR v_source.payload_fingerprint IS DISTINCT FROM v_memo.payload_fingerprint
     OR v_original.idempotency_key IS DISTINCT FROM v_source.idempotency_key THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='posted source credit memo and original journal do not reconcile';
  END IF;
  IF v_original.created_by_profile_id IS NULL
     OR v_original.created_by_profile_id IS NOT DISTINCT FROM v_actor
     OR v_original.posted_by_profile_id IS NULL
     OR v_original.posted_by_profile_id IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='reversal maker must differ from the original journal creator and poster';
  END IF;

  SELECT pg_catalog.count(*)::integer,COALESCE(pg_catalog.sum(l.debit),0)::numeric(15,2),
         COALESCE(pg_catalog.sum(l.credit),0)::numeric(15,2)
    INTO v_line_count,v_debit,v_credit FROM public.accounting_journal_lines l
   WHERE l.organization_id=v_org AND l.journal_entry_id=v_original.id;
  IF v_line_count<2 OR v_debit<=0 OR v_debit<>v_credit
     OR v_debit IS DISTINCT FROM v_memo.total_amount OR v_credit IS DISTINCT FROM v_memo.total_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original credit memo journal does not balance to the exact memo amount';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_journal_entries e
    WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journal idempotency key has already been used by another operation';
  END IF;

  INSERT INTO public.accounting_journal_entries(
    organization_id,entry_date,description,source_type,source_reference,status,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES (
    v_org,(pg_catalog.now() AT TIME ZONE 'UTC')::date,'مسودة عكس إشعار دائن '||v_memo.memo_number,
    'adjustment','customer-return-credit-memo-reversal:'||v_memo.id::text,'draft',p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_reversal;
  INSERT INTO public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit,memo)
  SELECT v_org,v_reversal.id,l.line_number,l.account_id,l.credit,l.debit,
         pg_catalog.left('عكس: '||COALESCE(l.memo,'سطر القيد الأصلي'),300)
    FROM public.accounting_journal_lines l
   WHERE l.organization_id=v_org AND l.journal_entry_id=v_original.id
   ORDER BY l.line_number;
  INSERT INTO public.accounting_return_credit_memo_reversals(
    organization_id,credit_memo_id,original_journal_entry_id,reversal_journal_entry_id,
    source_amount,source_currency,idempotency_key,payload_fingerprint,reason,created_by_profile_id
  ) VALUES (
    v_org,v_memo.id,v_original.id,v_reversal.id,v_memo.total_amount,v_memo.currency,
    p_idempotency_key,v_fingerprint,v_reason,v_actor
  );

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'accounting.customer_return_credit_memo_reversal_draft_created','customer_return_credit_memo',v_memo.id,
    pg_catalog.jsonb_build_object('status','posted','original_journal_entry_id',v_original.id),
    pg_catalog.jsonb_build_object('status','reversal_pending','reversal_journal_entry_id',v_reversal.id,
      'reversal_entry_number',v_reversal.entry_number::text,'reason',v_reason,'source_amount',v_memo.total_amount::text,
      'currency',v_memo.currency,'requires_independent_checker',true));
  RETURN pg_catalog.jsonb_build_object(
    'credit_memo_id',v_memo.id,'memo_number',v_memo.memo_number,'status','reversal_pending',
    'original_journal_entry_id',v_original.id,'reversal_journal_entry_id',v_reversal.id,
    'reversal_journal_entry_number',v_reversal.entry_number::text,'reversal_status','draft',
    'reason',v_reason,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.reverse_customer_return_credit_memo(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_customer_return_credit_memo(uuid,text,uuid) TO authenticated;
COMMENT ON FUNCTION public.reverse_customer_return_credit_memo(uuid,text,uuid) IS
  'Prepares one immutable source-linked counter-entry draft for a posted return credit memo. The maker differs from the original journal creator and poster; an independent finance checker must post it. No cash refund or stock movement is created.';

CREATE OR REPLACE FUNCTION public.post_customer_return_credit_memo_reversal(p_credit_memo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_memo public.customer_return_credit_memos%ROWTYPE;
  v_link public.accounting_return_credit_memo_reversals%ROWTYPE;
  v_source public.accounting_return_credit_memo_postings%ROWTYPE;
  v_original public.accounting_journal_entries%ROWTYPE;
  v_reversal public.accounting_journal_entries%ROWTYPE;
  v_post_result jsonb;
  v_original_line_count integer;
  v_reversal_line_count integer;
  v_debit numeric(15,2);
  v_credit numeric(15,2);
  v_now timestamptz:=pg_catalog.now();
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_actor_has_capability('finance.journal.post') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance.journal.post capability required to post a return credit memo reversal';
  END IF;
  IF p_credit_memo_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo id is required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':return-credit-memo-reversal:'||p_credit_memo_id::text,0)
  );
  SELECT m.* INTO v_memo FROM public.customer_return_credit_memos m
   WHERE m.id=p_credit_memo_id AND m.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='return credit memo not found in this organization';
  END IF;
  SELECT r.* INTO v_link FROM public.accounting_return_credit_memo_reversals r
   WHERE r.organization_id=v_org AND r.credit_memo_id=v_memo.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='no prepared return credit memo reversal exists';
  END IF;
  SELECT e.* INTO v_reversal FROM public.accounting_journal_entries e
   WHERE e.id=v_link.reversal_journal_entry_id AND e.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='prepared reversal journal is missing';
  END IF;

  IF v_memo.status='reversed' THEN
    IF v_reversal.status<>'posted' OR v_link.posted_by_profile_id IS NULL
       OR v_link.posted_at IS NULL OR v_link.reversed_at IS NULL
       OR v_memo.reversal_journal_entry_id IS DISTINCT FROM v_reversal.id THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='completed reversal evidence is inconsistent; manual reconciliation required';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'credit_memo_id',v_memo.id,'memo_number',v_memo.memo_number,'status','reversed',
      'original_journal_entry_id',v_link.original_journal_entry_id,
      'reversal_journal_entry_id',v_reversal.id,'reversal_journal_entry_number',v_reversal.entry_number::text,
      'reversal_status','posted','reason',v_link.reason,'replayed',true
    );
  END IF;
  IF v_memo.status<>'posted' OR v_reversal.status<>'draft'
     OR v_link.posted_by_profile_id IS NOT NULL OR v_link.posted_at IS NOT NULL OR v_link.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='return credit memo reversal is not awaiting an independent checker';
  END IF;
  IF v_link.created_by_profile_id IS NULL
     OR v_link.created_by_profile_id IS NOT DISTINCT FROM v_actor
     OR v_reversal.created_by_profile_id IS DISTINCT FROM v_link.created_by_profile_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='reversal posting requires a checker different from the reversal maker';
  END IF;

  SELECT sp.* INTO v_source FROM public.accounting_return_credit_memo_postings sp
   WHERE sp.organization_id=v_org AND sp.credit_memo_id=v_memo.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo is missing its authoritative accounting source link';
  END IF;
  SELECT e.* INTO v_original FROM public.accounting_journal_entries e
   WHERE e.id=v_link.original_journal_entry_id AND e.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_original.id IS DISTINCT FROM v_source.journal_entry_id
     OR v_original.status<>'posted'
     OR v_original.source_type<>'customer_return_credit_memo'
     OR v_original.source_reference IS DISTINCT FROM v_memo.id::text
     OR v_original.created_by_profile_id IS NOT DISTINCT FROM v_link.created_by_profile_id
     OR v_original.posted_by_profile_id IS NOT DISTINCT FROM v_link.created_by_profile_id
     OR v_source.source_amount IS DISTINCT FROM v_memo.total_amount
     OR v_source.source_currency IS DISTINCT FROM v_memo.currency
     OR v_source.payload_fingerprint IS DISTINCT FROM v_memo.payload_fingerprint
     OR v_original.idempotency_key IS DISTINCT FROM v_source.idempotency_key
     OR v_reversal.source_type<>'adjustment'
     OR v_reversal.source_reference IS DISTINCT FROM 'customer-return-credit-memo-reversal:'||v_memo.id::text
     OR v_reversal.idempotency_key IS DISTINCT FROM v_link.idempotency_key
     OR v_reversal.payload_fingerprint IS DISTINCT FROM v_link.payload_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original credit memo and reversal source links do not reconcile';
  END IF;

  SELECT count(*)::integer,COALESCE(sum(l.debit),0)::numeric(15,2),COALESCE(sum(l.credit),0)::numeric(15,2)
    INTO v_original_line_count,v_debit,v_credit
    FROM public.accounting_journal_lines l
   WHERE l.organization_id=v_org AND l.journal_entry_id=v_original.id;
  IF v_original_line_count<2 OR v_debit<=0 OR v_debit<>v_credit
     OR v_debit IS DISTINCT FROM v_memo.total_amount OR v_credit IS DISTINCT FROM v_memo.total_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original credit memo journal is not balanced to its source amount';
  END IF;
  SELECT count(*)::integer INTO v_reversal_line_count
    FROM public.accounting_journal_lines l
   WHERE l.organization_id=v_org AND l.journal_entry_id=v_reversal.id;
  IF v_reversal_line_count<>v_original_line_count
     OR EXISTS (
       SELECT 1
         FROM public.accounting_journal_lines original_line
         LEFT JOIN public.accounting_journal_lines reversal_line
           ON reversal_line.organization_id=original_line.organization_id
          AND reversal_line.journal_entry_id=v_reversal.id
          AND reversal_line.line_number=original_line.line_number
        WHERE original_line.organization_id=v_org AND original_line.journal_entry_id=v_original.id
          AND (reversal_line.journal_entry_id IS NULL
            OR reversal_line.account_id IS DISTINCT FROM original_line.account_id
            OR reversal_line.debit IS DISTINCT FROM original_line.credit
            OR reversal_line.credit IS DISTINCT FROM original_line.debit)
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reversal journal lines are not an exact mirror of the original source journal';
  END IF;

  v_post_result:=public.post_general_journal_entry(v_reversal.id);
  IF pg_catalog.jsonb_typeof(v_post_result) IS DISTINCT FROM 'object'
     OR v_post_result->>'status' IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ledger did not confirm independent reversal journal posting';
  END IF;

  UPDATE public.accounting_return_credit_memo_reversals
     SET posted_by_profile_id=v_actor,posted_at=v_now,reversed_at=v_now
   WHERE id=v_link.id AND organization_id=v_org
     AND posted_by_profile_id IS NULL AND posted_at IS NULL AND reversed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='reversal checker state changed before commit; safely retry';
  END IF;
  UPDATE public.customer_return_credit_memos
     SET status='reversed',reversed_by_profile_id=v_actor,reversed_at=v_now,
         reversal_reason=v_link.reason,reversal_journal_entry_id=v_reversal.id
   WHERE id=v_memo.id AND organization_id=v_org AND status='posted';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='credit memo changed before reversal commit; safely retry';
  END IF;
  UPDATE public.customers
     SET current_balance=COALESCE(current_balance,0)+v_memo.total_amount,updated_at=v_now
   WHERE id=v_memo.customer_id AND organization_id=v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='customer balance source could not be updated; reversal transaction rolled back';
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'accounting.customer_return_credit_memo_reversed','customer_return_credit_memo',v_memo.id,
    pg_catalog.jsonb_build_object('status','posted','journal_entry_id',v_original.id,'total_amount',v_memo.total_amount::text),
    pg_catalog.jsonb_build_object('status','reversed','reversal_journal_entry_id',v_reversal.id,
      'reversal_entry_number',v_reversal.entry_number::text,'reversal_maker_profile_id',v_link.created_by_profile_id,
      'reversal_checker_profile_id',v_actor,'reason',v_link.reason,'total_amount',v_memo.total_amount::text,'currency',v_memo.currency));
  RETURN pg_catalog.jsonb_build_object(
    'credit_memo_id',v_memo.id,'memo_number',v_memo.memo_number,'status','reversed',
    'original_journal_entry_id',v_original.id,'reversal_journal_entry_id',v_reversal.id,
    'reversal_journal_entry_number',v_reversal.entry_number::text,'reversal_status','posted',
    'reason',v_link.reason,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.post_customer_return_credit_memo_reversal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_customer_return_credit_memo_reversal(uuid) TO authenticated;
COMMENT ON FUNCTION public.post_customer_return_credit_memo_reversal(uuid) IS
  'Posts a prepared return-credit-memo reversal only through a distinct finance.journal.post checker; verifies exact inverse lines, closes the memo and restores receivables once. No cash refund or stock movement.';

CREATE OR REPLACE FUNCTION public.fetch_customer_return_credit_memo_queue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to review customer return credits';
  END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit memo queue limit must be between 1 and 100';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'accounts',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',a.id,'code',a.code,'name',a.name,'account_type',a.account_type
      ) ORDER BY a.account_type,a.code,a.id)
      FROM public.accounting_accounts a
      WHERE a.organization_id=v_org AND a.is_active
        AND a.account_type IN ('asset','revenue','liability')
    ),'[]'::jsonb),
    'requests',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'request_id',r.id,
        'request_number',r.request_number,
        'order_id',r.order_id,
        'order_number',o.order_number,
        'customer_id',r.customer_id,
        'customer_name',COALESCE(NULLIF(pg_catalog.btrim(c.business_name),''),NULLIF(pg_catalog.btrim(c.contact_name),''),c.id::text),
        'created_at',r.created_at,
        'invoice_id',i.id,
        'invoice_number',i.invoice_number,
        'currency',i.currency,
        'invoice_subtotal',i.subtotal,
        'invoice_tax_amount',i.tax_amount,
        'invoice_total_amount',i.total_amount,
        'invoice_status',i.status,
        'invoice_totals_reconcile',COALESCE(i.subtotal+i.tax_amount=i.total_amount,false),
        'mapping_ready',COALESCE(lines.mapping_ready,false)
          AND i.id IS NOT NULL AND i.status<>'void' AND i.currency='YER'
          AND i.subtotal>=0 AND i.tax_amount>=0 AND i.total_amount>0
          AND pg_catalog.round(i.subtotal+i.tax_amount,2)=i.total_amount,
        'items',COALESCE(lines.items,'[]'::jsonb),
        'credit_memo',memo.data
      ) ORDER BY r.created_at,r.id)
      FROM (
        SELECT rr.*
          FROM public.customer_return_requests rr
         WHERE rr.organization_id=v_org AND rr.status='received'
         ORDER BY rr.created_at DESC,rr.id
         LIMIT p_limit
      ) r
      JOIN public.orders o ON o.id=r.order_id AND o.organization_id=r.organization_id
      JOIN public.customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id
      LEFT JOIN LATERAL (
        SELECT ci.*
          FROM public.customer_invoices ci
         WHERE ci.organization_id=v_org AND ci.order_id=r.order_id AND ci.customer_id=r.customer_id
         ORDER BY ci.issued_at DESC,ci.id DESC
         LIMIT 1
      ) i ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(pg_catalog.bool_and(
            ciitem.id IS NOT NULL
            AND q.received_quantity=ri.requested_quantity
            AND q.received_quantity + COALESCE(credit_history.returned_quantity,0) <= COALESCE(ciitem.quantity,0)
          ),false) AS mapping_ready,
          pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'request_item_id',ri.id,
            'order_item_id',ri.order_item_id,
            'product_id',ri.product_id,
            'item_code',ri.item_code_snapshot,
            'product_name',ri.product_name_snapshot,
            'unit',ri.unit_snapshot,
            'requested_quantity',ri.requested_quantity,
            'received_quantity',q.received_quantity,
            'invoice_item_id',ciitem.id,
            'invoice_item_quantity',ciitem.quantity,
            'invoice_item_line_total',ciitem.line_total,
            'already_credited_quantity',COALESCE(credit_history.returned_quantity,0),
            'remaining_invoice_quantity',GREATEST(COALESCE(ciitem.quantity,0)-COALESCE(credit_history.returned_quantity,0),0)
          ) ORDER BY ri.created_at,ri.id) AS items
        FROM public.customer_return_request_items ri
        LEFT JOIN LATERAL (
          SELECT COALESCE(pg_catalog.sum(rli.received_quantity),0)::numeric(15,3) AS received_quantity
            FROM public.customer_return_receipt_items rli
           WHERE rli.organization_id=v_org AND rli.request_item_id=ri.id
        ) q ON true
        LEFT JOIN public.customer_invoice_items ciitem
          ON ciitem.organization_id=v_org AND ciitem.invoice_id=i.id AND ciitem.order_item_id=ri.order_item_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(pg_catalog.sum(mi.returned_quantity),0)::numeric(15,3) AS returned_quantity
            FROM public.customer_return_credit_memo_items mi
            JOIN public.customer_return_credit_memos m
              ON m.id=mi.credit_memo_id AND m.organization_id=mi.organization_id
           WHERE mi.organization_id=v_org AND mi.invoice_item_id=ciitem.id AND m.status IN ('draft','posted','reversed')
        ) credit_history ON true
        WHERE ri.organization_id=v_org AND ri.return_request_id=r.id
      ) lines ON true
      LEFT JOIN LATERAL (
        SELECT pg_catalog.jsonb_build_object(
          'id',m.id,'memo_number',m.memo_number,'status',m.status,
          'currency',m.currency,'subtotal_amount',m.subtotal_amount,
          'tax_amount',m.tax_amount,'total_amount',m.total_amount,
          'journal_entry_id',je.id,'journal_entry_number',je.entry_number::text,
          'journal_status',je.status,
          'receivable_account_id',sp.receivable_account_id,
          'revenue_account_id',sp.revenue_account_id,'tax_account_id',sp.tax_account_id,
          'created_at',m.created_at,'posted_at',m.posted_at,
          'reversed_at',COALESCE(m.reversed_at,rev.reversed_at),
          'reversal_reason',COALESCE(m.reversal_reason,rev.reason),
          'reversal_journal_status',rj.status,
          'reversal_created_at',rev.created_at,
          'reversal_posted_at',rev.posted_at,
          'reversal_journal_entry_id',rj.id,
          'reversal_journal_entry_number',rj.entry_number::text
        ) AS data
        FROM public.customer_return_credit_memos m
        JOIN public.accounting_return_credit_memo_postings sp
          ON sp.organization_id=m.organization_id AND sp.credit_memo_id=m.id
        JOIN public.accounting_journal_entries je
          ON je.organization_id=sp.organization_id AND je.id=sp.journal_entry_id
        LEFT JOIN public.accounting_return_credit_memo_reversals rev
          ON rev.organization_id=m.organization_id AND rev.credit_memo_id=m.id
        LEFT JOIN public.accounting_journal_entries rj
          ON rj.organization_id=rev.organization_id AND rj.id=rev.reversal_journal_entry_id
        WHERE m.organization_id=v_org AND m.return_request_id=r.id AND m.status<>'void'
        ORDER BY m.created_at DESC,m.id DESC
        LIMIT 1
      ) memo ON true
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

COMMIT;
