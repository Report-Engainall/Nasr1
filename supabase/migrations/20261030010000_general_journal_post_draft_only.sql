BEGIN;

-- Fail closed with an explicit business error when a terminal void journal is submitted
-- to the posting command. The table CHECK remains a second integrity barrier.
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
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
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
REVOKE ALL ON FUNCTION public.post_general_journal_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_general_journal_entry(uuid) TO authenticated;

COMMENT ON FUNCTION public.post_general_journal_entry(uuid) IS
  'Posts only balanced draft journals. Posted replay is idempotent; void/non-draft states are rejected before accounting writes.';

COMMIT;
