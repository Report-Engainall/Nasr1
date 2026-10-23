-- NASR1-FIN-LEDGER-001: source-safe reversal drafts for posted manual/adjustment journals.
-- Customer invoice/payment and cash-expense reversals remain in their existing source-specific workflows.
CREATE TABLE public.accounting_journal_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  original_journal_entry_id uuid NOT NULL,
  reversal_journal_entry_id uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, original_journal_entry_id),
  UNIQUE (organization_id, reversal_journal_entry_id),
  UNIQUE (organization_id, idempotency_key),
  CHECK (original_journal_entry_id <> reversal_journal_entry_id),
  FOREIGN KEY (organization_id, original_journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, reversal_journal_entry_id)
    REFERENCES public.accounting_journal_entries(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.accounting_journal_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_journal_reversals_finance_read_same_org
  ON public.accounting_journal_reversals FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id = public.current_profile_id()
         AND p.auth_user_id = auth.uid()
         AND p.is_active = true
    )
  );
REVOKE ALL ON public.accounting_journal_reversals FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_general_journal_entry(
  p_entry_id uuid,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_fingerprint text;
  v_original public.accounting_journal_entries%ROWTYPE;
  v_reversal public.accounting_journal_entries%ROWTYPE;
  v_existing public.accounting_journal_reversals%ROWTYPE;
  v_link public.accounting_journal_reversals%ROWTYPE;
  v_line_count integer;
  v_debit_total numeric(18,2);
  v_credit_total numeric(18,2);
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'administrator or manager permission required to reverse a posted journal entry';
  END IF;
  IF p_entry_id IS NULL OR p_idempotency_key IS NULL
     OR pg_catalog.char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'journal entry, idempotency key and a reversal reason between 5 and 500 characters are required';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'original_journal_entry_id', p_entry_id,
    'reason', v_reason
  )::text);

  -- Serialize same-key retries even when two independent authenticated sessions race.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':' || p_idempotency_key::text, 0)
  );

  SELECT r.* INTO v_existing
    FROM public.accounting_journal_reversals r
   WHERE r.organization_id = v_org
     AND r.idempotency_key = p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.original_journal_entry_id IS DISTINCT FROM p_entry_id
       OR v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'idempotency key payload conflict';
    END IF;
    SELECT e.* INTO v_reversal
      FROM public.accounting_journal_entries e
     WHERE e.organization_id = v_org
       AND e.id = v_existing.reversal_journal_entry_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'reversal result could not be resolved; safely retry the same request';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'original_journal_entry_id', v_existing.original_journal_entry_id,
      'reversal_journal_entry_id', v_reversal.id,
      'entry_number', v_reversal.entry_number::text,
      'status', v_reversal.status,
      'replayed', true
    );
  END IF;

  SELECT e.* INTO v_original
    FROM public.accounting_journal_entries e
   WHERE e.organization_id = v_org
     AND e.id = p_entry_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'journal entry not found in this organization';
  END IF;
  IF v_original.status <> 'posted' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'only posted journal entries can be reversed';
  END IF;
  IF v_original.source_type NOT IN ('manual', 'adjustment') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'source-linked entries must use their source-specific reversal workflow';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accounting_journal_reversals r
     WHERE r.organization_id = v_org
       AND r.reversal_journal_entry_id = v_original.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'a reversal journal cannot itself be reversed by this command';
  END IF;
  SELECT r.* INTO v_link
    FROM public.accounting_journal_reversals r
   WHERE r.organization_id = v_org
     AND r.original_journal_entry_id = v_original.id
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'original journal entry already has a reversal';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accounting_journal_entries e
     WHERE e.organization_id = v_org
       AND e.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'idempotency key is already used by another journal operation';
  END IF;

  SELECT pg_catalog.count(*)::integer,
         coalesce(pg_catalog.sum(l.debit), 0)::numeric(18,2),
         coalesce(pg_catalog.sum(l.credit), 0)::numeric(18,2)
    INTO v_line_count, v_debit_total, v_credit_total
    FROM public.accounting_journal_lines l
   WHERE l.organization_id = v_org
     AND l.journal_entry_id = v_original.id;
  IF v_line_count < 2 OR v_debit_total <= 0 OR v_debit_total <> v_credit_total THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'posted journal has no complete balanced line set to reverse';
  END IF;

  INSERT INTO public.accounting_journal_entries(
    organization_id, entry_date, description, source_type, source_reference,
    status, idempotency_key, payload_fingerprint, created_by_profile_id
  ) VALUES (
    v_org, CURRENT_DATE,
    'عكس قيد اليومية رقم ' || v_original.entry_number::text,
    'adjustment', v_original.id::text,
    'draft', p_idempotency_key, v_fingerprint, v_actor
  ) RETURNING * INTO v_reversal;

  INSERT INTO public.accounting_journal_lines(
    organization_id, journal_entry_id, line_number, account_id, debit, credit, memo
  )
  SELECT l.organization_id, v_reversal.id, l.line_number, l.account_id,
         l.credit, l.debit,
         pg_catalog.left('عكس: ' || coalesce(l.memo, ''), 300)
    FROM public.accounting_journal_lines l
   WHERE l.organization_id = v_org
     AND l.journal_entry_id = v_original.id
   ORDER BY l.line_number;

  INSERT INTO public.accounting_journal_reversals(
    organization_id, original_journal_entry_id, reversal_journal_entry_id,
    reason, idempotency_key, payload_fingerprint, created_by_profile_id
  ) VALUES (
    v_org, v_original.id, v_reversal.id, v_reason,
    p_idempotency_key, v_fingerprint, v_actor
  ) RETURNING * INTO v_link;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_actor, 'accounting.journal_reversal_draft_created',
    'accounting_journal_reversal', v_link.id,
    pg_catalog.jsonb_build_object(
      'original_journal_entry_id', v_original.id,
      'original_entry_number', v_original.entry_number::text,
      'status', v_original.status
    ),
    pg_catalog.jsonb_build_object(
      'reversal_journal_entry_id', v_reversal.id,
      'reversal_entry_number', v_reversal.entry_number::text,
      'status', v_reversal.status,
      'reason', v_reason,
      'debit_total', v_debit_total::text,
      'credit_total', v_credit_total::text
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'original_journal_entry_id', v_original.id,
    'reversal_journal_entry_id', v_reversal.id,
    'entry_number', v_reversal.entry_number::text,
    'status', v_reversal.status,
    'replayed', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_general_journal_entry(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_general_journal_entry(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accounting_validate_general_journal_reversal_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.accounting_journal_reversals%ROWTYPE;
  v_original public.accounting_journal_entries%ROWTYPE;
  v_original_count integer;
  v_reversal_count integer;
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' OR NEW.status IS DISTINCT FROM 'posted' THEN
    RETURN NEW;
  END IF;

  SELECT r.* INTO v_link
    FROM public.accounting_journal_reversals r
   WHERE r.organization_id = NEW.organization_id
     AND r.reversal_journal_entry_id = NEW.id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT e.* INTO v_original
    FROM public.accounting_journal_entries e
   WHERE e.organization_id = NEW.organization_id
     AND e.id = v_link.original_journal_entry_id
   FOR UPDATE;
  IF NOT FOUND OR v_original.status <> 'posted'
     OR v_original.source_type NOT IN ('manual', 'adjustment')
     OR NEW.source_type <> 'adjustment'
     OR NEW.source_reference IS DISTINCT FROM v_original.id::text THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'reversal can post only while its original manual/adjustment journal remains posted and linked';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_original_count
    FROM public.accounting_journal_lines l
   WHERE l.organization_id = NEW.organization_id
     AND l.journal_entry_id = v_original.id;
  SELECT pg_catalog.count(*)::integer INTO v_reversal_count
    FROM public.accounting_journal_lines l
   WHERE l.organization_id = NEW.organization_id
     AND l.journal_entry_id = NEW.id;
  IF v_original_count < 2 OR v_original_count <> v_reversal_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'reversal lines must exactly mirror the original journal line count';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.accounting_journal_lines o
      LEFT JOIN public.accounting_journal_lines r
        ON r.organization_id = o.organization_id
       AND r.journal_entry_id = NEW.id
       AND r.line_number = o.line_number
     WHERE o.organization_id = NEW.organization_id
       AND o.journal_entry_id = v_original.id
       AND (r.line_number IS NULL OR r.account_id IS DISTINCT FROM o.account_id
         OR r.debit IS DISTINCT FROM o.credit OR r.credit IS DISTINCT FROM o.debit)
  ) OR EXISTS (
    SELECT 1
      FROM public.accounting_journal_lines r
      LEFT JOIN public.accounting_journal_lines o
        ON o.organization_id = r.organization_id
       AND o.journal_entry_id = v_original.id
       AND o.line_number = r.line_number
     WHERE r.organization_id = NEW.organization_id
       AND r.journal_entry_id = NEW.id
       AND o.line_number IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'reversal lines must exactly mirror the original journal accounts and debit/credit sides';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.accounting_validate_general_journal_reversal_post() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER accounting_general_journal_reversal_post_guard
BEFORE UPDATE OF status ON public.accounting_journal_entries
FOR EACH ROW
WHEN (OLD.status = 'draft' AND NEW.status = 'posted')
EXECUTE FUNCTION public.accounting_validate_general_journal_reversal_post();

-- The workspace asks only about the entries on the current page; never scan all reversal links from the browser.
CREATE OR REPLACE FUNCTION public.fetch_general_journal_reversal_links(
  p_entry_ids uuid[]
) RETURNS TABLE(original_journal_entry_id uuid, reversal_journal_entry_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'finance permission required';
  END IF;
  IF p_entry_ids IS NULL OR pg_catalog.cardinality(p_entry_ids) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_entry_ids) AS requested(id) WHERE requested.id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'between 1 and 100 journal entry ids are required';
  END IF;
  RETURN QUERY
    SELECT r.original_journal_entry_id, r.reversal_journal_entry_id
      FROM public.accounting_journal_reversals r
     WHERE r.organization_id = v_org
       AND (r.original_journal_entry_id = ANY(p_entry_ids)
         OR r.reversal_journal_entry_id = ANY(p_entry_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_general_journal_reversal_links(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_general_journal_reversal_links(uuid[]) TO authenticated;

-- Keep a created reversal draft available for explicit authorized posting.
-- Voiding it would leave a permanent uniqueness link and make a safe retry impossible.
CREATE OR REPLACE FUNCTION public.void_general_journal_draft(p_entry_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_entry public.accounting_journal_entries%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to void a journal draft';
  END IF;
  IF p_entry_id IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal identifier and a reason between 5 and 500 characters are required';
  END IF;
  SELECT e.* INTO v_entry FROM public.accounting_journal_entries e
   WHERE e.id=p_entry_id AND e.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='journal entry not found in this organization';
  END IF;
  IF v_entry.status='void' THEN
    IF v_entry.void_reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='voided journal draft keeps its original reason';
    END IF;
    RETURN pg_catalog.jsonb_build_object('id',v_entry.id,'status',v_entry.status,'replayed',true);
  END IF;
  IF v_entry.status='draft' AND EXISTS (
    SELECT 1 FROM public.accounting_journal_reversals r
     WHERE r.organization_id=v_org AND r.reversal_journal_entry_id=v_entry.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='reversal draft cannot be voided; post the linked reversal explicitly';
  END IF;
  IF v_entry.status<>'draft' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='posted journal entries cannot be voided through the draft cancellation operation';
  END IF;
  UPDATE public.accounting_journal_entries
     SET status='void',voided_by_profile_id=v_actor,voided_at=pg_catalog.now(),
         void_reason=v_reason,updated_at=pg_catalog.now()
   WHERE id=v_entry.id AND organization_id=v_org
   RETURNING * INTO v_entry;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'accounting.journal_draft_voided','accounting_journal_entry',v_entry.id,
    pg_catalog.jsonb_build_object('status','draft'),
    pg_catalog.jsonb_build_object('status','void','entry_number',v_entry.entry_number::text,'reason',v_reason));
  RETURN pg_catalog.jsonb_build_object('id',v_entry.id,'status',v_entry.status,'replayed',false);
END;
$;
REVOKE ALL ON FUNCTION public.void_general_journal_draft(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_general_journal_draft(uuid,text) TO authenticated;

