-- Keep operating-expense evidence within the requested immutable as-of snapshot.
-- A file uploaded after the caller's asOf cannot be mixed into an earlier cashflow projection.
BEGIN;
CREATE OR REPLACE FUNCTION public.fetch_cash_expense_commitment_cashflow_schedule(
  p_from date,p_to date,p_as_of timestamptz,p_currency text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_role text;
  v_currency text:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency,''))),'');
  v_today date;
  v_now timestamptz:=statement_timestamp();
  v_pending integer:=0;
  v_overdue integer:=0;
  v_payment_pending integer:=0;
  v_missing_evidence integer:=0;
  v_changed_after_asof integer:=0;
  v_entries jsonb:='[]'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_period jsonb;
BEGIN
  SELECT p.organization_id,r.role INTO v_org,v_role
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true
    AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance administrator or manager permission required for operating expense cashflow';
  END IF;
  v_today:=(p_as_of AT TIME ZONE 'UTC')::date;
  IF p_from IS NULL OR p_to IS NULL OR p_as_of IS NULL OR p_from>p_to
     OR p_from<v_today OR p_to>v_today+90
     OR p_as_of<v_now-interval '5 minutes' OR p_as_of>v_now+interval '1 minute'
     OR (v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='operating expense cashflow period, currency or as-of snapshot is invalid';
  END IF;
  v_period:=pg_catalog.jsonb_build_object('from',p_from::text,'to',p_to::text);

  SELECT count(*)::integer INTO v_pending FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.status='pending_approval' AND c.due_date<=p_to AND c.created_at<=p_as_of AND c.updated_at<=p_as_of
     AND (v_currency IS NULL OR c.currency=v_currency);
  SELECT count(*)::integer INTO v_overdue FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.status='approved' AND c.due_date<p_from AND c.created_at<=p_as_of AND c.updated_at<=p_as_of
     AND (v_currency IS NULL OR c.currency=v_currency);
  SELECT count(*)::integer INTO v_payment_pending FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.status='payment_recorded' AND c.due_date<=p_to AND c.created_at<=p_as_of AND c.updated_at<=p_as_of
     AND (v_currency IS NULL OR c.currency=v_currency);
  SELECT count(*)::integer INTO v_missing_evidence FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.status='approved' AND c.due_date BETWEEN p_from AND p_to
     AND c.created_at<=p_as_of AND c.updated_at<=p_as_of AND (v_currency IS NULL OR c.currency=v_currency)
     AND NOT EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e
       WHERE e.organization_id=c.organization_id AND e.commitment_id=c.id AND e.created_at<=p_as_of);

  SELECT count(*)::integer INTO v_changed_after_asof
    FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.due_date<=p_to
     AND (v_currency IS NULL OR c.currency=v_currency)
     AND (c.created_at>p_as_of OR c.updated_at>p_as_of
       OR EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence future_evidence
         WHERE future_evidence.organization_id=c.organization_id
           AND future_evidence.commitment_id=c.id AND future_evidence.created_at>p_as_of));

  WITH approved AS (
    SELECT c.* FROM public.cash_expense_commitments c
    WHERE c.organization_id=v_org AND c.status='approved' AND c.due_date BETWEEN p_from AND p_to
      AND (v_currency IS NULL OR c.currency=v_currency)
      AND c.created_at<=p_as_of AND c.updated_at<=p_as_of
      AND EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e
        WHERE e.organization_id=c.organization_id AND e.commitment_id=c.id AND e.created_at<=p_as_of)
  ), positions AS (
    SELECT a.id,a.commitment_number,a.category,a.currency,a.due_date,a.created_at,a.amount,
      (SELECT array_agg(e.id::text ORDER BY e.id)
       FROM public.cash_expense_commitment_evidence e
       WHERE e.organization_id=a.organization_id AND e.commitment_id=a.id AND e.created_at<=p_as_of) AS evidence_ids
    FROM approved a
  )
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id','cash-expense-commitment-outflow:'||p.id::text,
    'direction','OUTFLOW','dueDate',p.due_date::text,
    'amount',pg_catalog.jsonb_build_object(
      'id','metric:cash-expense-commitment:'||p.id::text,
      'key','cashflow.operating_expense_commitment',
      'value',p.amount::text,'unit','CURRENCY','currency',p.currency,
      'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',pg_catalog.to_jsonb(ARRAY['cash-expense-commitment:'||p.id::text]||
          ARRAY(SELECT 'cash-expense-commitment-evidence:'||u.evidence_id FROM pg_catalog.unnest(p.evidence_ids) AS u(evidence_id))),
        'formulaId','nasr1.approved-operating-expense-commitment','formulaVersion','1'
      )
    )
  ) ORDER BY p.due_date,p.id),'[]'::jsonb)
  INTO v_entries FROM positions p;

  WITH approved AS (
    SELECT c.* FROM public.cash_expense_commitments c
    WHERE c.organization_id=v_org AND c.status='approved' AND c.due_date BETWEEN p_from AND p_to
      AND (v_currency IS NULL OR c.currency=v_currency)
      AND c.created_at<=p_as_of AND c.updated_at<=p_as_of
      AND EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e
        WHERE e.organization_id=c.organization_id AND e.commitment_id=c.id AND e.created_at<=p_as_of)
  ), commitment_records AS (
    SELECT
      'cash-expense-commitment:'||c.id::text AS id,
      pg_catalog.jsonb_build_object(
        'id','cash-expense-commitment:'||c.id::text,
        'source',pg_catalog.jsonb_build_object('kind','TABLE','name','cash_expense_commitments','recordId',c.id::text),
        'sourceTimestamp',c.created_at,'asOf',p_as_of,'period',v_period,'currency',c.currency,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      ) AS payload
    FROM approved c
    UNION ALL
    SELECT
      'cash-expense-commitment-evidence:'||e.id::text,
      pg_catalog.jsonb_build_object(
        'id','cash-expense-commitment-evidence:'||e.id::text,
        'source',pg_catalog.jsonb_build_object('kind','TABLE','name','cash_expense_commitment_evidence','recordId',e.id::text),
        'sourceTimestamp',e.created_at,'asOf',p_as_of,'period',v_period,'currency',c.currency,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      )
    FROM approved c JOIN public.cash_expense_commitment_evidence e
      ON e.organization_id=c.organization_id AND e.commitment_id=c.id AND e.created_at<=p_as_of
  )
  SELECT coalesce(pg_catalog.jsonb_agg(payload ORDER BY id),'[]'::jsonb)
    INTO v_evidence FROM commitment_records;

  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN v_pending=0 AND v_overdue=0 AND v_payment_pending=0 AND v_missing_evidence=0 AND v_changed_after_asof=0 THEN 'OK' ELSE 'PARTIAL' END,
    'completeness',CASE WHEN v_pending=0 AND v_overdue=0 AND v_payment_pending=0 AND v_missing_evidence=0 AND v_changed_after_asof=0 THEN 'COMPLETE' ELSE 'PARTIAL' END,
    'quality',CASE WHEN v_pending=0 AND v_overdue=0 AND v_payment_pending=0 AND v_missing_evidence=0 AND v_changed_after_asof=0 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
    'asOf',p_as_of,'period',v_period,'currency',v_currency,'sideEffects','NONE',
    'entries',v_entries,'evidenceRecords',v_evidence,
    'pendingApprovalCount',v_pending,'overdueApprovedCount',v_overdue,
    'paymentAwaitingJournalCount',v_payment_pending,'missingEvidenceCount',v_missing_evidence,
    'changedAfterAsOfCount',v_changed_after_asof,
    'warnings',CASE
      WHEN v_pending>0 AND v_overdue>0 AND v_payment_pending>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: commitments await approval, overdue approved commitments exist, and recorded payments await posted journals.'
      )
      WHEN v_pending>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: one or more due commitments await independent approval and are not included as verified outflows.'
      )
      WHEN v_overdue>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: overdue approved commitments fall before the forecast window and are not assigned fabricated future dates.'
      )
      WHEN v_payment_pending>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: cash-expense payment sources exist but their original accounting journals are not yet posted; projected cash remains withheld.'
      )
      WHEN v_missing_evidence>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: an approved commitment has no registered source evidence.'
      )
      WHEN v_changed_after_asof>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: one or more commitment records changed after this snapshot timestamp; refresh the schedule before relying on its totals.'
      )
      ELSE '[]'::jsonb
    END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_cash_expense_commitment_cashflow_schedule(date,date,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_cash_expense_commitment_cashflow_schedule(date,date,timestamptz,text) TO authenticated;
COMMENT ON COLUMN public.cash_expense_commitment_evidence.content_sha256 IS
  'SHA-256 computed by the browser and supplied as evidence metadata. The database verifies upload metadata and format but does not re-hash stored object bytes; this value is not a server-verified content digest.';
COMMENT ON FUNCTION public.fetch_cash_expense_commitment_cashflow_schedule(date,date,timestamptz,text) IS
  'Tenant-scoped and currency-isolated forward outflows; only commitments and evidence created/updated at or before p_as_of are included. Any post-as-of commitment/evidence change forces PARTIAL completeness and withholds closing cash.';
COMMIT;
