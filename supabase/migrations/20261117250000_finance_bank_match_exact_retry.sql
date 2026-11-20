-- Exact retries of the same bank-statement-to-ledger match are acknowledgements,
-- not a second write. A different match for the same statement line is rejected.
BEGIN;

CREATE OR REPLACE FUNCTION public.match_finance_bank_statement_line(
  p_statement_id uuid,
  p_statement_line_id uuid,
  p_journal_entry_id uuid,
  p_journal_line_number integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_statement public.finance_bank_statements%ROWTYPE;
  v_line public.finance_bank_statement_lines%ROWTYPE;
  v_account_id uuid;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
  v_entry_date date;
  v_status text;
  v_line_count integer;
  v_debit_total numeric(18,2);
  v_credit_total numeric(18,2);
  v_match public.finance_bank_statement_line_matches%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to match a bank statement line';
  END IF;

  SELECT s.* INTO v_statement
  FROM public.finance_bank_statements s
  WHERE s.id=p_statement_id AND s.organization_id=v_org
  FOR UPDATE;
  SELECT l.* INTO v_line
  FROM public.finance_bank_statement_lines l
  WHERE l.id=p_statement_line_id AND l.organization_id=v_org AND l.statement_id=p_statement_id
  FOR UPDATE;
  IF v_statement.id IS NULL OR v_line.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bank statement line is not available in this organization';
  END IF;

  -- Serialize all attempts to consume the same posted ledger line, including attempts
  -- arriving from different statements or browser sessions.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'finance-bank-match:'||v_org::text||':'||p_journal_entry_id::text||':'||p_journal_line_number::text,
      0
    )
  );

  -- A lost response followed by the exact same command returns the committed match.
  -- No audit or match row is inserted on this path, even after the statement is closed.
  SELECT m.* INTO v_match
  FROM public.finance_bank_statement_line_matches m
  WHERE m.organization_id=v_org AND m.statement_line_id=v_line.id
  FOR UPDATE;
  IF FOUND THEN
    IF v_match.journal_entry_id=p_journal_entry_id
       AND v_match.journal_line_number=p_journal_line_number THEN
      RETURN jsonb_build_object('match_id',v_match.id,'matched',true,'replayed',true);
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505',
      MESSAGE='bank statement line is already matched to a different ledger line';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.finance_bank_statement_voids v
    WHERE v.organization_id=v_org AND v.statement_id=v_statement.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='voided bank statement is closed';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.finance_bank_statement_reconciliation_runs r
    WHERE r.organization_id=v_org AND r.statement_id=v_statement.id AND r.outcome='VERIFIED'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='verified bank statement is immutable and closed';
  END IF;

  SELECT m.accounting_account_id INTO v_account_id
  FROM public.purchase_supplier_payment_settlement_accounts m
  WHERE m.id=v_statement.settlement_account_mapping_id
    AND m.organization_id=v_org AND m.is_active;
  SELECT l.debit,l.credit,e.entry_date,e.status
    INTO v_debit,v_credit,v_entry_date,v_status
  FROM public.accounting_journal_lines l
  JOIN public.accounting_journal_entries e
    ON e.id=l.journal_entry_id AND e.organization_id=l.organization_id
  WHERE l.organization_id=v_org AND l.journal_entry_id=p_journal_entry_id
    AND l.line_number=p_journal_line_number AND l.account_id=v_account_id;
  IF NOT FOUND OR v_status<>'posted'
     OR v_entry_date NOT BETWEEN v_statement.period_from AND v_statement.period_to
     OR NOT (
       (v_line.signed_amount>0 AND v_debit=v_line.signed_amount AND v_credit=0)
       OR
       (v_line.signed_amount<0 AND v_credit=abs(v_line.signed_amount) AND v_debit=0)
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='bank statement line must match one same-account posted GL line for the exact signed amount and period';
  END IF;

  SELECT count(*)::integer,coalesce(sum(l.debit),0)::numeric(18,2),
         coalesce(sum(l.credit),0)::numeric(18,2)
    INTO v_line_count,v_debit_total,v_credit_total
  FROM public.accounting_journal_lines l
  WHERE l.organization_id=v_org AND l.journal_entry_id=p_journal_entry_id;
  IF v_line_count<2 OR v_debit_total<>v_credit_total THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='matched general-ledger journal is not balanced';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM public.finance_bank_statement_line_matches prior_match
    JOIN public.finance_bank_statement_lines prior_line
      ON prior_line.organization_id=prior_match.organization_id
     AND prior_line.id=prior_match.statement_line_id
    JOIN public.finance_bank_statements prior_statement
      ON prior_statement.organization_id=prior_line.organization_id
     AND prior_statement.id=prior_line.statement_id
    WHERE prior_match.organization_id=v_org
      AND prior_match.journal_entry_id=p_journal_entry_id
      AND prior_match.journal_line_number=p_journal_line_number
      AND prior_line.id<>v_line.id
      AND NOT EXISTS(
        SELECT 1 FROM public.finance_bank_statement_voids v
        WHERE v.organization_id=prior_statement.organization_id
          AND v.statement_id=prior_statement.id
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505',
      MESSAGE='posted general-ledger line is already matched to an active bank statement';
  END IF;

  INSERT INTO public.finance_bank_statement_line_matches(
    organization_id,statement_line_id,journal_entry_id,journal_line_number,matched_by_profile_id
  ) VALUES(v_org,v_line.id,p_journal_entry_id,p_journal_line_number,v_actor)
  RETURNING * INTO v_match;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES(
    v_org,v_actor,'finance.bank_statement_line_matched',
    'finance_bank_statement_line_match',v_match.id,'{}'::jsonb,
    jsonb_build_object(
      'statement_id',v_statement.id,'statement_line_id',v_line.id,
      'journal_entry_id',p_journal_entry_id,
      'journal_line_number',p_journal_line_number,
      'signed_amount',v_line.signed_amount
    )
  );
  RETURN jsonb_build_object('match_id',v_match.id,'matched',true,'replayed',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.match_finance_bank_statement_line(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.match_finance_bank_statement_line(uuid,uuid,uuid,integer) TO authenticated;

COMMENT ON FUNCTION public.match_finance_bank_statement_line(uuid,uuid,uuid,integer) IS
  'Matches one tenant-scoped bank statement line to one posted general-ledger line. Exact retries replay the original match without duplicate match or audit rows; advisory locking prevents one GL line being consumed by concurrent matches.';

COMMIT;
