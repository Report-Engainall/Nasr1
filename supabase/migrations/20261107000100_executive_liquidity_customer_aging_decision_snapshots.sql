-- NASR1: customer receivable ageing and immutable daily-decision metadata.
-- Additive migration. Historical decision rows remain valid with a NULL candidate_snapshot.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_executive_receivable_customer_aging()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_now timestamptz := pg_catalog.transaction_timestamp();
  v_today date;
  v_items jsonb := '[]'::jsonb;
  v_total_groups integer := 0;
  v_unresolved integer := 0;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for customer receivable ageing';
  END IF;
  v_today := (v_now AT TIME ZONE 'UTC')::date;

  SELECT pg_catalog.count(*)::integer INTO v_unresolved
    FROM public.customer_invoices i
   WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid') AND i.issued_at<=v_now
     AND i.total_amount>coalesce((
       SELECT pg_catalog.sum(p.amount) FROM public.customer_payments p
        WHERE p.organization_id=v_org AND p.invoice_id=i.id AND p.paid_at<=v_now
     ),0)
     AND (pg_catalog.upper(coalesce(i.currency,'')) !~ '^[A-Z]{3}$'
       OR nullif(pg_catalog.btrim(coalesce(i.customer_name,'')),'') IS NULL OR i.due_at IS NULL);

  WITH paid AS (
    SELECT p.invoice_id,pg_catalog.sum(p.amount)::numeric(18,2) AS paid_amount,
           pg_catalog.array_agg('customer-payment:'||p.id::text ORDER BY p.paid_at,p.id) AS payment_evidence
      FROM public.customer_payments p
     WHERE p.organization_id=v_org AND p.paid_at<=v_now
     GROUP BY p.invoice_id
  ),
  balances AS (
    SELECT i.id,nullif(pg_catalog.btrim(coalesce(i.customer_name,'')),'') AS customer_name,
           pg_catalog.upper(coalesce(i.currency,'')) AS currency,i.due_at,
           greatest(i.total_amount-coalesce(p.paid_amount,0),0)::numeric(18,2) AS outstanding,
           coalesce(p.paid_amount,0)::numeric(18,2) AS paid_amount,
           coalesce(p.payment_evidence,ARRAY[]::text[]) AS payment_evidence,
           CASE
             WHEN i.due_at IS NULL THEN 'UNKNOWN_DUE_DATE'
             WHEN (i.due_at AT TIME ZONE 'UTC')::date>=v_today THEN 'NOT_DUE'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=30 THEN 'OVERDUE_1_30'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=60 THEN 'OVERDUE_31_60'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=90 THEN 'OVERDUE_61_90'
             ELSE 'OVERDUE_90_PLUS'
           END AS aging_bucket,
           CASE WHEN i.due_at IS NULL THEN NULL ELSE greatest(v_today-(i.due_at AT TIME ZONE 'UTC')::date,0) END AS age_days
      FROM public.customer_invoices i LEFT JOIN paid p ON p.invoice_id=i.id
     WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid')
       AND i.issued_at<=v_now AND i.total_amount>coalesce(p.paid_amount,0)
  ),
  valid_balances AS (SELECT * FROM balances WHERE currency ~ '^[A-Z]{3}$'),
  bucket_totals AS (
    SELECT b.customer_name,b.currency,b.aging_bucket,
           pg_catalog.count(*)::integer AS invoice_count,
           pg_catalog.sum(b.outstanding)::numeric(18,2) AS amount,
           pg_catalog.count(*) FILTER(WHERE b.paid_amount>0)::integer AS partially_paid_count,
           max(b.age_days)::integer AS oldest_age_days,
           (pg_catalog.array_agg('customer-invoice:'||b.id::text ORDER BY b.id))[1:25] AS invoice_evidence,
           coalesce((
             SELECT (pg_catalog.array_agg(DISTINCT x.evidence_id ORDER BY x.evidence_id))[1:25]
               FROM valid_balances vb
               CROSS JOIN LATERAL pg_catalog.unnest(vb.payment_evidence) AS x(evidence_id)
              WHERE vb.customer_name IS NOT DISTINCT FROM b.customer_name
                AND vb.currency=b.currency AND vb.aging_bucket=b.aging_bucket
           ),ARRAY[]::text[]) AS payment_evidence
      FROM valid_balances b GROUP BY b.customer_name,b.currency,b.aging_bucket
  ),
  customer_totals AS (
    SELECT b.customer_name,b.currency,pg_catalog.sum(b.amount)::numeric(18,2) AS total_outstanding,
           coalesce(pg_catalog.sum(b.amount) FILTER(WHERE b.aging_bucket LIKE 'OVERDUE_%'),0)::numeric(18,2) AS overdue_amount,
           pg_catalog.sum(b.invoice_count)::integer AS invoice_count,
           pg_catalog.sum(b.partially_paid_count)::integer AS partially_paid_count,
           max(b.oldest_age_days)::integer AS oldest_age_days,
           pg_catalog.bool_or(b.aging_bucket='UNKNOWN_DUE_DATE') AS has_unknown_due_date
      FROM bucket_totals b GROUP BY b.customer_name,b.currency
  )
  SELECT pg_catalog.count(*)::integer INTO v_total_groups FROM customer_totals;

  WITH paid AS (
    SELECT p.invoice_id,pg_catalog.sum(p.amount)::numeric(18,2) AS paid_amount,
           pg_catalog.array_agg('customer-payment:'||p.id::text ORDER BY p.paid_at,p.id) AS payment_evidence
      FROM public.customer_payments p
     WHERE p.organization_id=v_org AND p.paid_at<=v_now GROUP BY p.invoice_id
  ),
  balances AS (
    SELECT i.id,nullif(pg_catalog.btrim(coalesce(i.customer_name,'')),'') AS customer_name,
           pg_catalog.upper(coalesce(i.currency,'')) AS currency,i.due_at,
           greatest(i.total_amount-coalesce(p.paid_amount,0),0)::numeric(18,2) AS outstanding,
           coalesce(p.paid_amount,0)::numeric(18,2) AS paid_amount,
           coalesce(p.payment_evidence,ARRAY[]::text[]) AS payment_evidence,
           CASE
             WHEN i.due_at IS NULL THEN 'UNKNOWN_DUE_DATE'
             WHEN (i.due_at AT TIME ZONE 'UTC')::date>=v_today THEN 'NOT_DUE'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=30 THEN 'OVERDUE_1_30'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=60 THEN 'OVERDUE_31_60'
             WHEN v_today-(i.due_at AT TIME ZONE 'UTC')::date<=90 THEN 'OVERDUE_61_90'
             ELSE 'OVERDUE_90_PLUS'
           END AS aging_bucket,
           CASE WHEN i.due_at IS NULL THEN NULL ELSE greatest(v_today-(i.due_at AT TIME ZONE 'UTC')::date,0) END AS age_days
      FROM public.customer_invoices i LEFT JOIN paid p ON p.invoice_id=i.id
     WHERE i.organization_id=v_org AND i.status IN ('issued','partially_paid')
       AND i.issued_at<=v_now AND i.total_amount>coalesce(p.paid_amount,0)
  ),
  valid_balances AS (SELECT * FROM balances WHERE currency ~ '^[A-Z]{3}$'),
  bucket_totals AS (
    SELECT b.customer_name,b.currency,b.aging_bucket,
           pg_catalog.count(*)::integer AS invoice_count,pg_catalog.sum(b.outstanding)::numeric(18,2) AS amount,
           pg_catalog.count(*) FILTER(WHERE b.paid_amount>0)::integer AS partially_paid_count,
           max(b.age_days)::integer AS oldest_age_days,
           (pg_catalog.array_agg('customer-invoice:'||b.id::text ORDER BY b.id))[1:25] AS invoice_evidence,
           coalesce((
             SELECT (pg_catalog.array_agg(DISTINCT x.evidence_id ORDER BY x.evidence_id))[1:25]
               FROM valid_balances vb
               CROSS JOIN LATERAL pg_catalog.unnest(vb.payment_evidence) AS x(evidence_id)
              WHERE vb.customer_name IS NOT DISTINCT FROM b.customer_name
                AND vb.currency=b.currency AND vb.aging_bucket=b.aging_bucket
           ),ARRAY[]::text[]) AS payment_evidence
      FROM valid_balances b GROUP BY b.customer_name,b.currency,b.aging_bucket
  ),
  customer_totals AS (
    SELECT b.customer_name,b.currency,pg_catalog.sum(b.amount)::numeric(18,2) AS total_outstanding,
           coalesce(pg_catalog.sum(b.amount) FILTER(WHERE b.aging_bucket LIKE 'OVERDUE_%'),0)::numeric(18,2) AS overdue_amount,
           pg_catalog.sum(b.invoice_count)::integer AS invoice_count,
           pg_catalog.sum(b.partially_paid_count)::integer AS partially_paid_count,
           max(b.oldest_age_days)::integer AS oldest_age_days,
           pg_catalog.bool_or(b.aging_bucket='UNKNOWN_DUE_DATE') AS has_unknown_due_date
      FROM bucket_totals b GROUP BY b.customer_name,b.currency
  )
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'customerName',coalesce(t.customer_name,'عميل غير محدد'),
      'customerNameStatus',CASE WHEN t.customer_name IS NULL THEN 'NEEDS_REVIEW' ELSE 'VERIFIED' END,
      'currency',t.currency,'totalOutstanding',t.total_outstanding::text,
      'overdueAmount',t.overdue_amount::text,'invoiceCount',t.invoice_count,
      'partiallyPaidCount',t.partially_paid_count,'oldestAgeDays',t.oldest_age_days,
      'status',CASE WHEN t.customer_name IS NULL OR t.has_unknown_due_date THEN 'NEEDS_REVIEW' ELSE 'VERIFIED' END,
      'agingBuckets',(
        SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'bucket',b.aging_bucket,'amount',b.amount::text,'invoiceCount',b.invoice_count,
          'partiallyPaidCount',b.partially_paid_count,'oldestAgeDays',b.oldest_age_days,
          'evidenceIds',to_jsonb(b.invoice_evidence||b.payment_evidence)
        ) ORDER BY CASE b.aging_bucket
          WHEN 'NOT_DUE' THEN 0 WHEN 'OVERDUE_1_30' THEN 1 WHEN 'OVERDUE_31_60' THEN 2
          WHEN 'OVERDUE_61_90' THEN 3 WHEN 'OVERDUE_90_PLUS' THEN 4 ELSE 5 END),'[]'::jsonb)
          FROM bucket_totals b WHERE b.customer_name IS NOT DISTINCT FROM t.customer_name AND b.currency=t.currency
      ),
      'asOf',v_now,'formulaId','receivables.customer-invoice-aging','formulaVersion','1.0.0',
      'calculatedAt',v_now,
      'warnings',CASE WHEN t.customer_name IS NULL THEN pg_catalog.jsonb_build_array('اسم العميل غير مثبت في مستند الفاتورة.')
        WHEN t.has_unknown_due_date THEN pg_catalog.jsonb_build_array('توجد فواتير مفتوحة بلا تاريخ استحقاق؛ عُرضت ضمن غير محدد.')
        ELSE '[]'::jsonb END
    ) ORDER BY t.currency,coalesce(t.overdue_amount,0) DESC,coalesce(t.customer_name,'')
  ),'[]'::jsonb) INTO v_items
    FROM (SELECT * FROM customer_totals
          ORDER BY currency,coalesce(overdue_amount,0) DESC,coalesce(customer_name,'')
          LIMIT 2000) t;

  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN v_unresolved>0 OR v_total_groups>2000 THEN 'PARTIAL' ELSE 'VERIFIED' END,
    'asOf',v_now,'totalGroups',v_total_groups,'returnedGroups',pg_catalog.jsonb_array_length(v_items),
    'unresolvedRows',v_unresolved,'complete',v_unresolved=0 AND v_total_groups<=2000,
    'formulaId','receivables.customer-invoice-aging','formulaVersion','1.0.0',
    'items',v_items,
    'warnings',CASE WHEN v_unresolved>0 OR v_total_groups>2000
      THEN pg_catalog.jsonb_build_array('توجد ذمم غير مكتملة أو تجاوز عدد مجموعات العملاء الحد المعروض؛ التغطية جزئية.')
      ELSE '[]'::jsonb END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_executive_receivable_customer_aging() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_executive_receivable_customer_aging() TO authenticated;

CREATE OR REPLACE FUNCTION public._is_valid_decision_candidate_snapshot(
  p_snapshot jsonb,p_candidate_id text,p_rule_id text,p_rule_version text,p_expected_outcome text
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $function$
DECLARE v_proof jsonb; v_impact jsonb; v_score integer; v_value text;
BEGIN
  IF p_snapshot IS NULL OR pg_catalog.jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  v_proof:=p_snapshot->'proof'; v_impact:=p_snapshot->'impact';
  v_score:=CASE p_snapshot->>'priority' WHEN 'P0' THEN 400 WHEN 'P1' THEN 300 WHEN 'P2' THEN 200 WHEN 'P3' THEN 100 ELSE -1 END;
  IF p_snapshot->>'schemaVersion' IS DISTINCT FROM '1.0.0'
     OR p_snapshot->>'candidateId' IS DISTINCT FROM p_candidate_id
     OR p_snapshot->>'ruleId' IS DISTINCT FROM p_rule_id
     OR p_snapshot->>'ruleVersion' IS DISTINCT FROM p_rule_version
     OR p_snapshot->>'expectedOutcome' IS DISTINCT FROM p_expected_outcome
     OR p_snapshot->>'priorityScore' IS DISTINCT FROM v_score::text
     OR p_snapshot->>'priority' NOT IN ('P0','P1','P2','P3')
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_snapshot->>'what',''))) NOT BETWEEN 1 AND 500
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_snapshot->>'why',''))) NOT BETWEEN 1 AND 2000
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_snapshot->>'risk',''))) NOT BETWEEN 1 AND 2000
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_snapshot->>'soWhat',''))) NOT BETWEEN 1 AND 2000
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_snapshot->>'whatNext',''))) NOT BETWEEN 1 AND 2000
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_snapshot->>'owner',''))) NOT BETWEEN 1 AND 150
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_snapshot->>'expectedOutcome',''))) NOT BETWEEN 1 AND 2000
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(p_snapshot->>'createdAt','')))<10
     OR pg_catalog.char_length(pg_catalog.btrim(coalesce(v_proof->>'asOf','')))<10
     OR p_snapshot->>'impactStatus' NOT IN ('CALCULATED','NOT_CONFIGURED','WITHHELD') THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(v_proof) IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(v_proof->'evidenceIds') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_proof->'metricKeys') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_proof->'formulaVersions') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF pg_catalog.jsonb_array_length(v_proof->'evidenceIds') NOT BETWEEN 1 AND 500
     OR pg_catalog.jsonb_array_length(v_proof->'metricKeys') NOT BETWEEN 1 AND 50
     OR pg_catalog.jsonb_array_length(v_proof->'formulaVersions') NOT BETWEEN 1 AND 50 THEN RETURN false; END IF;
  BEGIN
    PERFORM (v_proof->>'asOf')::timestamptz;
    PERFORM (p_snapshot->>'createdAt')::timestamptz;
    IF nullif(p_snapshot->>'expiresAt','') IS NOT NULL THEN PERFORM (p_snapshot->>'expiresAt')::timestamptz; END IF;
  EXCEPTION WHEN OTHERS THEN RETURN false;
  END;
  FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements_text(v_proof->'evidenceIds') AS a(value)
  LOOP IF pg_catalog.char_length(pg_catalog.btrim(v_value)) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF; END LOOP;
  FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements_text(v_proof->'metricKeys') AS a(value)
  LOOP IF pg_catalog.char_length(pg_catalog.btrim(v_value)) NOT BETWEEN 1 AND 150 THEN RETURN false; END IF; END LOOP;
  FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements_text(v_proof->'formulaVersions') AS a(value)
  LOOP IF pg_catalog.char_length(pg_catalog.btrim(v_value)) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF; END LOOP;
  IF p_snapshot->>'impactStatus'='CALCULATED' THEN
    IF pg_catalog.jsonb_typeof(v_impact) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_impact->'value') IS DISTINCT FROM 'number'
       OR pg_catalog.char_length(pg_catalog.btrim(coalesce(v_impact->>'unit',''))) NOT BETWEEN 1 AND 80
       OR pg_catalog.char_length(pg_catalog.btrim(coalesce(v_impact->>'formulaId',''))) NOT BETWEEN 1 AND 150
       OR pg_catalog.char_length(pg_catalog.btrim(coalesce(v_impact->>'formulaVersion',''))) NOT BETWEEN 1 AND 80
       OR pg_catalog.jsonb_typeof(v_impact->'sourceMetricIds') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF pg_catalog.abs((v_impact->>'value')::numeric)>=10000000000000000 THEN RETURN false; END IF;
    IF v_impact->>'currency' IS NOT NULL AND v_impact->>'currency' !~ '^[A-Z]{3}$' THEN RETURN false; END IF;
    IF v_impact->>'unit' IN ('CURRENCY','CURRENCY_PER_UNIT') AND coalesce(v_impact->>'currency','') !~ '^[A-Z]{3}$' THEN RETURN false; END IF;
  ELSIF v_impact IS NOT NULL AND v_impact <> 'null'::jsonb THEN RETURN false;
  END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public._is_valid_decision_candidate_snapshot(jsonb,text,text,text,text) FROM PUBLIC,anon,authenticated;

ALTER TABLE public.decision_outcomes ADD COLUMN IF NOT EXISTS candidate_snapshot jsonb;
ALTER TABLE public.decision_outcomes DROP CONSTRAINT IF EXISTS decision_outcomes_candidate_snapshot_check;
ALTER TABLE public.decision_outcomes ADD CONSTRAINT decision_outcomes_candidate_snapshot_check CHECK (
  candidate_snapshot IS NULL OR public._is_valid_decision_candidate_snapshot(
    candidate_snapshot,candidate_id,rule_id,rule_version,expected_outcome
  )
);

CREATE OR REPLACE FUNCTION public._guard_decision_candidate_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $function$
BEGIN
  IF OLD.candidate_snapshot IS NOT NULL AND NEW.candidate_snapshot IS DISTINCT FROM OLD.candidate_snapshot THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='decision candidate snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._guard_decision_candidate_snapshot_immutable() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS decision_outcomes_candidate_snapshot_immutable ON public.decision_outcomes;
CREATE TRIGGER decision_outcomes_candidate_snapshot_immutable
  BEFORE UPDATE ON public.decision_outcomes FOR EACH ROW
  EXECUTE FUNCTION public._guard_decision_candidate_snapshot_immutable();

CREATE OR REPLACE FUNCTION public.create_decision_outcome_proposal_with_snapshot(
  p_candidate_id text,p_rule_id text,p_rule_version text,p_owner_profile_id uuid,
  p_expected_outcome text,p_reason text,p_candidate_snapshot jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_existing_id uuid;
  v_existing_snapshot jsonb; v_result jsonb; v_outcome jsonb; v_duplicate boolean;
BEGIN
  IF NOT public.can_manage_finance() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to persist a ranked decision'; END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization required'; END IF;
  IF NOT public._is_valid_decision_candidate_snapshot(p_candidate_snapshot,p_candidate_id,p_rule_id,p_rule_version,p_expected_outcome)
     OR p_owner_profile_id IS NULL OR p_idempotency_key IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ranked decision snapshot or command metadata is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':decision-candidate:'||p_candidate_id,0));
  SELECT o.id,o.candidate_snapshot INTO v_existing_id,v_existing_snapshot
    FROM public.decision_outcomes o WHERE o.organization_id=v_org AND o.candidate_id=p_candidate_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing_snapshot IS NULL OR v_existing_snapshot IS DISTINCT FROM p_candidate_snapshot THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='candidate already has a different immutable decision snapshot';
    END IF;
    v_outcome:=public._decision_outcome_snapshot(v_org,v_existing_id)||pg_catalog.jsonb_build_object('candidateSnapshot',v_existing_snapshot);
    RETURN pg_catalog.jsonb_build_object('ok',true,'duplicate',true,'outcome',v_outcome);
  END IF;
  v_result:=public.create_decision_outcome_proposal(
    p_candidate_id,p_rule_id,p_rule_version,p_owner_profile_id,p_expected_outcome,p_reason,p_idempotency_key
  );
  IF coalesce((v_result->>'ok')::boolean,false) IS DISTINCT FROM true THEN RETURN v_result; END IF;
  v_duplicate:=coalesce((v_result->>'duplicate')::boolean,false);
  IF v_duplicate THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='idempotent replay has no original candidate snapshot'; END IF;
  v_existing_id:=(v_result->'outcome'->>'id')::uuid;
  UPDATE public.decision_outcomes SET candidate_snapshot=p_candidate_snapshot
   WHERE organization_id=v_org AND id=v_existing_id AND candidate_snapshot IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='candidate snapshot could not be attached atomically'; END IF;
  v_outcome:=public._decision_outcome_snapshot(v_org,v_existing_id)||pg_catalog.jsonb_build_object('candidateSnapshot',p_candidate_snapshot);
  RETURN pg_catalog.jsonb_build_object('ok',true,'duplicate',false,'outcome',v_outcome);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_decision_outcome_proposal_with_snapshot(text,text,text,uuid,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_decision_outcome_proposal_with_snapshot(text,text,text,uuid,text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_decision_outcomes(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid; v_org uuid; v_items jsonb; v_total integer;
BEGIN
  IF NOT public.can_manage_finance() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read decision outcomes'; END IF;
  SELECT p.id,p.organization_id INTO v_actor,v_org
    FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.auth_user_id=auth.uid() AND p.is_active AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF v_actor IS NULL OR v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization required'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='decision outcome pagination is invalid';
  END IF;
  SELECT pg_catalog.count(*)::integer INTO v_total FROM public.decision_outcomes o WHERE o.organization_id=v_org;
  SELECT coalesce(pg_catalog.jsonb_agg(
    page.snapshot||pg_catalog.jsonb_build_object(
      'memorySnapshot',public._decision_memory_snapshot(v_org,page.id),
      'candidateSnapshot',page.candidate_snapshot
    ) ORDER BY page.updated_at DESC,page.id DESC
  ),'[]'::jsonb) INTO v_items
  FROM (
    SELECT o.id,o.updated_at,o.candidate_snapshot,public._decision_outcome_snapshot(v_org,o.id) AS snapshot
      FROM public.decision_outcomes o WHERE o.organization_id=v_org
     ORDER BY o.updated_at DESC,o.id DESC LIMIT p_limit OFFSET p_offset
  ) page;
  RETURN pg_catalog.jsonb_build_object('items',v_items,'total',v_total,'limit',p_limit,'offset',p_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_decision_outcomes(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_decision_outcomes(integer,integer) TO authenticated;

COMMENT ON FUNCTION public.fetch_executive_receivable_customer_aging() IS
  'Tenant-scoped customer receivable ageing net of recorded same-invoice payments; retains currency and due-age buckets and exposes unresolved rows.';
COMMENT ON FUNCTION public.create_decision_outcome_proposal_with_snapshot(text,text,text,uuid,text,text,jsonb,text) IS
  'Persists an immutable ranked candidate snapshot with the existing append-only decision lifecycle and tenant authorization.';
COMMIT;
