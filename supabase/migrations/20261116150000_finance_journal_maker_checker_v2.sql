-- Authorization V2 for general-ledger creation, posting and reversal.
-- Existing tenant scope, balance validation, locks, idempotency and audits are preserved.

BEGIN;

DO $finance_journal_capability_contract$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.authorization_capabilities
   WHERE capability_key IN ('finance.journal.create_draft','finance.journal.post','finance.journal.reverse')
     AND is_active=true;
  IF v_count<>3 THEN
    RAISE EXCEPTION 'required finance journal V2 capabilities are missing or inactive';
  END IF;
  UPDATE public.authorization_capabilities
     SET scope_kind='organization',approval_mode='none',separation_of_duties=false,
         state_requirements=state_requirements || '{"creates_status":"draft"}'::jsonb,
         updated_at=statement_timestamp()
   WHERE capability_key='finance.journal.create_draft';
  UPDATE public.authorization_capabilities
     SET scope_kind='organization',approval_mode='maker_checker',separation_of_duties=true,
         state_requirements=state_requirements || '{"required_status":"draft","reviewer_must_differ_from_creator":true}'::jsonb,
         updated_at=statement_timestamp()
   WHERE capability_key='finance.journal.post';
  UPDATE public.authorization_capabilities
     SET scope_kind='organization',approval_mode='maker_checker',separation_of_duties=true,
         state_requirements=state_requirements || '{"requires_posted_source_and_reason":true,"reviewer_must_differ_from_original_creator_and_poster":true}'::jsonb,
         updated_at=statement_timestamp()
   WHERE capability_key='finance.journal.reverse';
END
$finance_journal_capability_contract$;

-- Command grants are derived from the existing finance workspace role set.
-- No user assignment or effective role boundary is expanded.
INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source,valid_from,expires_at)
SELECT rc.role,'finance.journal.create_draft','command-parity:finance.workspace.manage',rc.valid_from,rc.expires_at
  FROM public.authorization_role_capabilities rc
 WHERE rc.capability_key='finance.workspace.manage'
   AND rc.role IN ('admin','manager','accountant')
ON CONFLICT(role,capability_key) DO NOTHING;

INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source,valid_from,expires_at)
SELECT rc.role,'finance.journal.post','command-parity:finance.workspace.manage',rc.valid_from,rc.expires_at
  FROM public.authorization_role_capabilities rc
 WHERE rc.capability_key='finance.workspace.manage'
   AND rc.role IN ('admin','manager','accountant')
ON CONFLICT(role,capability_key) DO NOTHING;

INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source,valid_from,expires_at)
SELECT rc.role,'finance.journal.reverse','command-parity:finance.workspace.manage',rc.valid_from,rc.expires_at
  FROM public.authorization_role_capabilities rc
 WHERE rc.capability_key='finance.workspace.manage'
   AND rc.role IN ('admin','manager')
ON CONFLICT(role,capability_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_accounting_journal_entry_create_authorization_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_organization_id uuid;
BEGIN
  -- Trusted service-role/background work has no authenticated profile identity.
  -- Authenticated user flows always prove creator, tenant and command capability.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT p.organization_id INTO v_organization_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true
   LIMIT 1;
  IF v_actor IS NULL OR v_organization_id IS NULL
     OR NEW.organization_id IS DISTINCT FROM v_organization_id
     OR NEW.created_by_profile_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='journal creator must be the active profile in the current organization';
  END IF;
  IF NOT public.current_actor_has_capability('finance.journal.create_draft') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='finance.journal.create_draft capability required';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_accounting_journal_entry_create_authorization_v2() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS accounting_journal_entry_create_authorization_v2 ON public.accounting_journal_entries;
CREATE TRIGGER accounting_journal_entry_create_authorization_v2
BEFORE INSERT ON public.accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_journal_entry_create_authorization_v2();

CREATE OR REPLACE FUNCTION public.post_general_journal_entry(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_entry public.accounting_journal_entries%ROWTYPE;
  v_line_count integer;
  v_debit_total numeric(18,2);
  v_credit_total numeric(18,2);
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_actor_has_capability('finance.journal.post') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to post a journal entry';
  END IF;
  SELECT e.* INTO v_entry
    FROM public.accounting_journal_entries e
   WHERE e.id=p_entry_id AND e.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='journal entry not found in this organization';
  END IF;
  IF v_entry.status='posted' THEN
    RETURN pg_catalog.jsonb_build_object('id',v_entry.id,'status',v_entry.status,'replayed',true);
  END IF;
  IF v_entry.status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only draft journal entries can be posted';
  END IF;
  IF v_entry.created_by_profile_id IS NULL
     OR v_entry.created_by_profile_id IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='journal posting requires an independent checker different from the journal creator';
  END IF;
  SELECT pg_catalog.count(*)::integer,
         coalesce(pg_catalog.sum(l.debit),0)::numeric(18,2),
         coalesce(pg_catalog.sum(l.credit),0)::numeric(18,2)
    INTO v_line_count,v_debit_total,v_credit_total
    FROM public.accounting_journal_lines l
   WHERE l.organization_id=v_org AND l.journal_entry_id=v_entry.id;
  IF v_line_count < 2 OR v_debit_total <= 0 OR v_debit_total <> v_credit_total THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='journal cannot be posted until its lines are balanced';
  END IF;
  UPDATE public.accounting_journal_entries
     SET status='posted',posted_by_profile_id=v_actor,posted_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE id=v_entry.id AND organization_id=v_org
   RETURNING * INTO v_entry;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_org,v_actor,'accounting.journal_posted','accounting_journal_entry',v_entry.id,
    pg_catalog.jsonb_build_object('status','draft'),
    pg_catalog.jsonb_build_object(
      'status','posted','entry_number',v_entry.entry_number::text,
      'debit_total',v_debit_total::text,'credit_total',v_credit_total::text
    ));
  RETURN pg_catalog.jsonb_build_object('id',v_entry.id,'status',v_entry.status,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.post_general_journal_entry(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_general_journal_entry(uuid) TO authenticated;

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
     OR NOT public.current_actor_has_capability('finance.journal.reverse') THEN
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
  IF v_original.created_by_profile_id IS NULL
     OR v_original.created_by_profile_id IS NOT DISTINCT FROM v_actor
     OR v_original.posted_by_profile_id IS NULL
     OR v_original.posted_by_profile_id IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'journal reversal requires an independent reviewer different from the original creator and poster';
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
REVOKE ALL ON FUNCTION public.reverse_general_journal_entry(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_general_journal_entry(uuid,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.guard_accounting_journal_entry_create_authorization_v2() IS
  'Authenticated journal drafts require a same-tenant server-attributed creator and finance.journal.create_draft. Trusted no-session backend jobs remain separately bounded by their service credentials.';
COMMENT ON FUNCTION public.post_general_journal_entry(uuid) IS
  'Requires finance.journal.post, a balanced draft and a poster distinct from its server-attributed creator; successful posting remains append-only audited and replay-safe.';
COMMENT ON FUNCTION public.reverse_general_journal_entry(uuid,text,uuid) IS
  'Requires finance.journal.reverse; reversal creator must differ from the original creator and poster; the new reversal journal must then be posted by another actor.';

COMMIT;
