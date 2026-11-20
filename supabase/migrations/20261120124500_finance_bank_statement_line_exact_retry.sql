BEGIN;

-- Exact bank-statement line retries are read-only even after another reviewer verified or voided the statement.
-- A reused key with a changed payload or a different statement is rejected without creating another row.
CREATE OR REPLACE FUNCTION public.record_finance_bank_statement_line(
  p_statement_id uuid,
  p_line_number integer,
  p_transaction_date date,
  p_external_reference text,
  p_description text,
  p_signed_amount numeric,
  p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_statement public.finance_bank_statements%ROWTYPE;
  v_existing public.finance_bank_statement_lines%ROWTYPE;
  v_row public.finance_bank_statement_lines%ROWTYPE;
  v_fingerprint text;
  v_line_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to record bank statement lines';
  END IF;
  SELECT s.* INTO v_statement FROM public.finance_bank_statements s
  WHERE s.id=p_statement_id AND s.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bank statement is not available in this organization'; END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='bank statement line idempotency key is required';
  END IF;
  v_fingerprint:=md5(jsonb_build_object(
    'statement',p_statement_id,'line',p_line_number,'date',p_transaction_date,'reference',p_external_reference,
    'description',btrim(p_description),'amount',p_signed_amount
  )::text);
  -- A previously committed exact line is returned before lifecycle guards. This covers a
  -- response lost during insertion and a retry after another reviewer verified the statement.
  SELECT l.* INTO v_existing FROM public.finance_bank_statement_lines l
  WHERE l.organization_id=v_org AND l.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.statement_id=v_statement.id AND v_existing.payload_fingerprint=v_fingerprint THEN
      RETURN jsonb_build_object('line_id',v_existing.id,'replayed',true);
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505',
      MESSAGE='bank statement line idempotency key conflicts with another statement or payload';
  END IF;
  IF EXISTS(SELECT 1 FROM public.finance_bank_statement_voids v
    WHERE v.organization_id=v_org AND v.statement_id=v_statement.id) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='voided bank statement is closed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.finance_bank_statement_reconciliation_runs r
    WHERE r.organization_id=v_org AND r.statement_id=v_statement.id AND r.outcome='VERIFIED') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='verified bank statement is immutable and closed';
  END IF;
  IF p_line_number IS NULL OR p_line_number NOT BETWEEN 1 AND 10000
     OR p_transaction_date IS NULL OR p_transaction_date NOT BETWEEN v_statement.period_from AND v_statement.period_to
     OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 2 AND 500
     OR p_external_reference IS NOT NULL AND char_length(p_external_reference)>160
     OR p_signed_amount IS NULL OR p_signed_amount=0
     OR p_signed_amount<=-10000000000000000 OR p_signed_amount>=10000000000000000
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='bank statement line is invalid';
  END IF;
  SELECT count(*)::integer INTO v_line_count FROM public.finance_bank_statement_lines l
  WHERE l.organization_id=v_org AND l.statement_id=v_statement.id;
  IF v_line_count>=10000 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='bank statement line limit reached'; END IF;
  INSERT INTO public.finance_bank_statement_lines(
    organization_id,statement_id,line_number,transaction_date,external_reference,description,signed_amount,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES(v_org,v_statement.id,p_line_number,p_transaction_date,nullif(btrim(coalesce(p_external_reference,'')),''),btrim(p_description),
    p_signed_amount,p_idempotency_key,v_fingerprint,v_actor)
  RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.bank_statement_line_recorded','finance_bank_statement_line',v_row.id,'{}'::jsonb,
    jsonb_build_object('statement_id',v_row.statement_id,'line_number',v_row.line_number,'transaction_date',v_row.transaction_date,
      'reference',v_row.external_reference,'signed_amount',v_row.signed_amount));
  RETURN jsonb_build_object('line_id',v_row.id,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_finance_bank_statement_line(uuid,integer,date,text,text,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_finance_bank_statement_line(uuid,integer,date,text,text,numeric,uuid) TO authenticated;

COMMENT ON FUNCTION public.record_finance_bank_statement_line(uuid,integer,date,text,text,numeric,uuid) IS
  'Records one immutable tenant-scoped bank statement line. Exact idempotency retries return the committed line before closed-state checks, without a duplicate audit row; changed payload or statement conflicts.';

COMMIT;
