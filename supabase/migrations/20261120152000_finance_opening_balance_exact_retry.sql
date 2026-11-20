-- Exact retries of an already accepted opening-balance proposal must recover the original
-- result before rechecking mutable mapping/evidence state. New requests still require
-- an active same-tenant account mapping and same-account evidence.
BEGIN;

CREATE OR REPLACE FUNCTION public.submit_finance_cash_opening_balance(
  p_settlement_account_mapping_id uuid,
  p_evidence_id uuid,
  p_as_of_date date,
  p_opening_balance numeric,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_mapping public.purchase_supplier_payment_settlement_accounts%ROWTYPE;
  v_evidence public.finance_cash_account_evidence%ROWTYPE;
  v_fingerprint text;
  v_existing public.finance_cash_opening_balance_proposals%ROWTYPE;
  v_row public.finance_cash_opening_balance_proposals%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to submit an opening balance';
  END IF;

  IF p_settlement_account_mapping_id IS NULL OR p_evidence_id IS NULL OR p_as_of_date IS NULL
     OR p_as_of_date>(statement_timestamp() AT TIME ZONE 'UTC')::date
     OR p_opening_balance IS NULL
     OR p_opening_balance<>pg_catalog.trunc(p_opening_balance,2)
     OR p_opening_balance<=-10000000000000000
     OR p_opening_balance>=10000000000000000
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='opening balance submission is invalid';
  END IF;

  -- Serialize one request identity per organization. This lets a retry return the
  -- original proposal even after its account mapping has been disabled.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_org::text||':finance-opening-balance:'||p_idempotency_key::text,0
    )
  );

  SELECT p.* INTO v_existing
    FROM public.finance_cash_opening_balance_proposals p
   WHERE p.organization_id=v_org AND p.idempotency_key=p_idempotency_key
   FOR UPDATE;

  IF FOUND THEN
    v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
      'mapping',p_settlement_account_mapping_id,
      'evidence',p_evidence_id,
      'date',p_as_of_date,
      'amount',p_opening_balance,
      'currency',v_existing.currency
    )::text);

    IF v_existing.payload_fingerprint=v_fingerprint
       AND v_existing.settlement_account_mapping_id=p_settlement_account_mapping_id
       AND v_existing.evidence_id=p_evidence_id
       AND v_existing.as_of_date=p_as_of_date
       AND v_existing.opening_balance=p_opening_balance THEN
      RETURN pg_catalog.jsonb_build_object('proposal_id',v_existing.id,'replayed',true);
    END IF;

    RAISE EXCEPTION USING ERRCODE='23505',
      MESSAGE='opening balance idempotency key conflicts with another payload';
  END IF;

  SELECT m.* INTO v_mapping
    FROM public.purchase_supplier_payment_settlement_accounts m
   WHERE m.id=p_settlement_account_mapping_id
     AND m.organization_id=v_org
     AND m.is_active
   FOR SHARE;

  SELECT e.* INTO v_evidence
    FROM public.finance_cash_account_evidence e
   WHERE e.id=p_evidence_id
     AND e.organization_id=v_org
     AND e.settlement_account_mapping_id=p_settlement_account_mapping_id
     AND e.evidence_kind IN ('opening_balance','cash_count')
   FOR SHARE;

  IF v_mapping.id IS NULL OR v_evidence.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='same-tenant opening evidence and active account mapping are required';
  END IF;

  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'mapping',p_settlement_account_mapping_id,
    'evidence',p_evidence_id,
    'date',p_as_of_date,
    'amount',p_opening_balance,
    'currency',v_mapping.currency
  )::text);

  INSERT INTO public.finance_cash_opening_balance_proposals(
    organization_id,settlement_account_mapping_id,evidence_id,as_of_date,
    opening_balance,currency,idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES(
    v_org,p_settlement_account_mapping_id,p_evidence_id,p_as_of_date,
    p_opening_balance,v_mapping.currency,p_idempotency_key,v_fingerprint,v_actor
  )
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES(
    v_org,v_actor,'finance.cash_opening_balance_submitted',
    'finance_cash_opening_balance_proposal',v_row.id,'{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'mapping_id',v_row.settlement_account_mapping_id,
      'as_of_date',v_row.as_of_date,
      'amount',v_row.opening_balance,
      'currency',v_row.currency,
      'evidence_id',v_row.evidence_id
    )
  );

  RETURN pg_catalog.jsonb_build_object('proposal_id',v_row.id,'replayed',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_finance_cash_opening_balance(uuid,uuid,date,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_finance_cash_opening_balance(uuid,uuid,date,numeric,uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_finance_cash_opening_balance(uuid,uuid,date,numeric,uuid) IS
  'Creates a source-backed same-tenant opening-balance proposal. Exact idempotent retries return the original proposal before mutable account/evidence state is revalidated; new writes still require an active account mapping and same-account evidence. It never posts a journal entry.';

COMMIT;
