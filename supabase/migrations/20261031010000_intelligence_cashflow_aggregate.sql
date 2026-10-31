-- Read-only, tenant-bound first slice of the intelligence aggregate contract.
-- This endpoint exposes scheduled receivables only. Cash on hand, supplier due dates,
-- stock exposure and customer-retention coverage remain explicitly outside this slice.
CREATE OR REPLACE FUNCTION public.get_intelligence_aggregate(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_role text;
  v_request_id text;
  v_metric_keys text[];
  v_period_from date;
  v_period_to date;
  v_as_of timestamptz;
  v_as_of_date date;
  v_currency text;
  v_wants_schedule boolean;
  v_unknown_keys integer := 0;
  v_unresolved_rows integer := 0;
  v_status text := 'OK';
  v_completeness text := 'COMPLETE';
  v_quality text := 'ACCEPTABLE';
  v_warnings jsonb := '[]'::jsonb;
  v_metrics jsonb := '[]'::jsonb;
  v_evidence jsonb := '[]'::jsonb;
  v_entries jsonb := '[]'::jsonb;
  v_schedule jsonb;
  v_period jsonb;
  v_now timestamptz := now();
BEGIN
  -- Authenticate and resolve tenant/role exclusively from the active server identity.
  SELECT p.organization_id, r.role
    INTO v_org, v_role
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required for intelligence aggregates';
  END IF;

  IF p_request IS NULL OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='intelligence aggregate request must be an object';
  END IF;

  -- Tenant, actor, role, tables and formulas are deliberately not accepted from the client.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request) AS k(key)
     WHERE k.key NOT IN ('requestId','metricKeys','period','asOf','currency')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported intelligence aggregate request field';
  END IF;

  v_request_id := nullif(pg_catalog.btrim(coalesce(p_request->>'requestId','')),'');
  IF v_request_id IS NULL OR pg_catalog.char_length(v_request_id)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='valid intelligence requestId is required';
  END IF;

  IF pg_catalog.jsonb_typeof(p_request->'metricKeys') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_request->'metricKeys') NOT BETWEEN 1 AND 20
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_request->'metricKeys') AS k(value)
        WHERE pg_catalog.jsonb_typeof(k.value) IS DISTINCT FROM 'string'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='metricKeys must be an array of 1 to 20 strings';
  END IF;

  SELECT pg_catalog.array_agg(k.key ORDER BY k.key)
    INTO v_metric_keys
    FROM (
      SELECT DISTINCT value AS key
        FROM pg_catalog.jsonb_array_elements_text(p_request->'metricKeys')
    ) k;
  IF pg_catalog.cardinality(v_metric_keys) <>
     (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(p_request->'metricKeys')) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='duplicate metric keys are not allowed';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_unknown_keys
    FROM pg_catalog.unnest(v_metric_keys) AS k(key)
   WHERE k.key <> 'cashflow.schedule';

  v_wants_schedule := 'cashflow.schedule' = ANY(v_metric_keys);

  IF pg_catalog.jsonb_typeof(p_request->'period') IS DISTINCT FROM 'object'
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request->'period') AS k(key)
        WHERE k.key NOT IN ('from','to')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='period must contain only from and to dates';
  END IF;

  BEGIN
    v_period_from := (p_request->'period'->>'from')::date;
    v_period_to := (p_request->'period'->>'to')::date;
    v_as_of := (p_request->>'asOf')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='period and asOf must be valid ISO date/time values';
  END;

  IF v_period_from IS NULL OR v_period_to IS NULL OR v_as_of IS NULL
     OR v_period_from > v_period_to THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid intelligence aggregate period';
  END IF;
  v_as_of_date := (v_as_of AT TIME ZONE 'UTC')::date;
  IF v_as_of > v_now + interval '1 minute'
     OR v_period_from < v_as_of_date
     OR v_period_to > v_as_of_date + 90 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cashflow period must begin on/after asOf and end within 90 days';
  END IF;

  v_currency := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_request->>'currency',''))),'');
  IF v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='currency must be a three-letter ISO code';
  END IF;
  v_period := pg_catalog.jsonb_build_object('from',v_period_from::text,'to',v_period_to::text);

  IF v_unknown_keys > 0 THEN
    v_status := 'PARTIAL';
    v_warnings := v_warnings || pg_catalog.jsonb_build_array(
      'One or more requested metric keys are not implemented by this aggregate slice.'
    );
  END IF;

  IF v_wants_schedule THEN
    -- Any outstanding invoice with no due date or an invalid currency makes the
    -- projection incomplete. Never silently omit it and publish a partial forecast.
    WITH paid AS (
      SELECT p.invoice_id, pg_catalog.sum(p.amount)::numeric(15,2) AS paid_amount
        FROM public.customer_payments p
       WHERE p.organization_id=v_org
       GROUP BY p.invoice_id
    )
    SELECT pg_catalog.count(*)::integer
      INTO v_unresolved_rows
      FROM public.customer_invoices i
      LEFT JOIN paid p ON p.invoice_id=i.id
     WHERE i.organization_id=v_org
       AND i.status IN ('issued','partially_paid')
       AND i.total_amount > coalesce(p.paid_amount,0)
       AND (v_currency IS NULL OR pg_catalog.upper(i.currency)=v_currency)
       AND (
         i.due_at IS NULL
         OR pg_catalog.upper(coalesce(i.currency,'')) !~ '^[A-Z]{3}$'
       );

    IF v_unresolved_rows > 0 THEN
      v_completeness := 'PARTIAL';
      v_quality := 'WARNINGS';
      v_status := 'PARTIAL';
      v_warnings := v_warnings || pg_catalog.jsonb_build_array(
        'Cashflow schedule withheld: at least one outstanding invoice has no valid due date or currency.'
      );
    ELSE
      WITH paid AS (
        SELECT p.invoice_id,
               pg_catalog.sum(p.amount)::numeric(15,2) AS paid_amount,
               pg_catalog.array_agg('payment:'||p.id::text ORDER BY p.paid_at,p.id) AS evidence_ids
          FROM public.customer_payments p
         WHERE p.organization_id=v_org
         GROUP BY p.invoice_id
      ),
      scheduled AS (
        SELECT i.id,i.created_at,i.due_at,i.currency,
               greatest(i.total_amount-coalesce(p.paid_amount,0),0)::numeric(15,2) AS outstanding,
               coalesce(p.evidence_ids,ARRAY[]::text[]) AS payment_evidence_ids
          FROM public.customer_invoices i
          LEFT JOIN paid p ON p.invoice_id=i.id
         WHERE i.organization_id=v_org
           AND i.status IN ('issued','partially_paid')
           AND i.total_amount > coalesce(p.paid_amount,0)
           AND (v_currency IS NULL OR pg_catalog.upper(i.currency)=v_currency)
           AND (i.due_at AT TIME ZONE 'UTC')::date BETWEEN v_period_from AND v_period_to
      )
      SELECT coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id',s.id::text,
            'direction','INFLOW',
            'dueDate',(s.due_at AT TIME ZONE 'UTC')::date::text,
            'amount',pg_catalog.jsonb_build_object(
              'id','metric:'||s.id::text,
              'key','receivables.outstanding',
              'value',s.outstanding,
              'unit','CURRENCY',
              'currency',s.currency,
              'status','VERIFIED',
              'completeness','COMPLETE',
              'quality','ACCEPTABLE',
              'period',v_period,
              'asOf',v_as_of,
              'lineage',pg_catalog.jsonb_build_object(
                'evidenceIds',pg_catalog.array_prepend('invoice:'||s.id::text,s.payment_evidence_ids),
                'calculatedAt',v_now,
                'formulaId','nasr1.receivables-outstanding',
                'formulaVersion','1',
                'transformations',pg_catalog.jsonb_build_array('invoice total minus recorded same-tenant payments')
              ),
              'warnings','[]'::jsonb
            )
          ) ORDER BY s.due_at,s.id
        ),
        '[]'::jsonb
      )
        INTO v_entries
        FROM scheduled s;

      WITH paid AS (
        SELECT p.invoice_id,
               pg_catalog.sum(p.amount)::numeric(15,2) AS paid_amount,
               pg_catalog.array_agg('payment:'||p.id::text ORDER BY p.paid_at,p.id) AS evidence_ids
          FROM public.customer_payments p
         WHERE p.organization_id=v_org
         GROUP BY p.invoice_id
      ),
      scheduled AS (
        SELECT i.id,i.created_at,i.due_at,i.currency,
               greatest(i.total_amount-coalesce(p.paid_amount,0),0)::numeric(15,2) AS outstanding,
               coalesce(p.evidence_ids,ARRAY[]::text[]) AS payment_evidence_ids
          FROM public.customer_invoices i
          LEFT JOIN paid p ON p.invoice_id=i.id
         WHERE i.organization_id=v_org
           AND i.status IN ('issued','partially_paid')
           AND i.total_amount > coalesce(p.paid_amount,0)
           AND (v_currency IS NULL OR pg_catalog.upper(i.currency)=v_currency)
           AND (i.due_at AT TIME ZONE 'UTC')::date BETWEEN v_period_from AND v_period_to
      )
      SELECT coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id','metric:cashflow.expected_collections:'||g.currency,
            'key','cashflow.expected_collections',
            'value',g.total_outstanding,
            'unit','CURRENCY',
            'currency',g.currency,
            'status','VERIFIED',
            'completeness','COMPLETE',
            'quality','ACCEPTABLE',
            'period',v_period,
            'asOf',v_as_of,
            'lineage',pg_catalog.jsonb_build_object(
              'evidenceIds',g.evidence_ids,
              'calculatedAt',v_now,
              'formulaId','nasr1.receivables-outstanding',
              'formulaVersion','1',
              'transformations',pg_catalog.jsonb_build_array('sum of scheduled invoice balances after recorded payments')
            ),
            'warnings','[]'::jsonb
          ) ORDER BY g.currency
        ),
        '[]'::jsonb
      )
        INTO v_metrics
        FROM (
          SELECT s.currency,
                 pg_catalog.sum(s.outstanding)::numeric(15,2) AS total_outstanding,
                 (
                   SELECT pg_catalog.array_agg(DISTINCT evidence_id ORDER BY evidence_id)
                     FROM scheduled evidence_schedule
                     CROSS JOIN LATERAL pg_catalog.unnest(
                       pg_catalog.array_prepend(
                         'invoice:'||evidence_schedule.id::text,
                         evidence_schedule.payment_evidence_ids
                       )
                     ) AS evidence_id
                    WHERE evidence_schedule.currency=s.currency
                 ) AS evidence_ids
            FROM scheduled s
           GROUP BY s.currency
        ) g;

      WITH paid AS (
        SELECT p.invoice_id
          FROM public.customer_payments p
         WHERE p.organization_id=v_org
      ),
      scheduled_ids AS (
        SELECT i.id
          FROM public.customer_invoices i
         WHERE i.organization_id=v_org
           AND i.status IN ('issued','partially_paid')
           AND i.total_amount > coalesce((
             SELECT pg_catalog.sum(p2.amount)
               FROM public.customer_payments p2
              WHERE p2.organization_id=v_org AND p2.invoice_id=i.id
           ),0)
           AND (v_currency IS NULL OR pg_catalog.upper(i.currency)=v_currency)
           AND (i.due_at AT TIME ZONE 'UTC')::date BETWEEN v_period_from AND v_period_to
      ),
      evidence AS (
        SELECT 'invoice:'||i.id::text AS id,
               pg_catalog.jsonb_build_object(
                 'id','invoice:'||i.id::text,
                 'source',pg_catalog.jsonb_build_object('kind','TABLE','name','customer_invoices','recordId',i.id::text),
                 'sourceTimestamp',i.created_at,
                 'asOf',v_as_of,
                 'period',v_period,
                 'currency',i.currency,
                 'status','VERIFIED',
                 'completeness','COMPLETE',
                 'quality','ACCEPTABLE',
                 'warnings','[]'::jsonb
               ) AS payload
          FROM public.customer_invoices i
          JOIN scheduled_ids s ON s.id=i.id
        UNION ALL
        SELECT 'payment:'||p.id::text AS id,
               pg_catalog.jsonb_build_object(
                 'id','payment:'||p.id::text,
                 'source',pg_catalog.jsonb_build_object('kind','TABLE','name','customer_payments','recordId',p.id::text),
                 'sourceTimestamp',p.paid_at,
                 'asOf',v_as_of,
                 'period',v_period,
                 'currency',i.currency,
                 'status','VERIFIED',
                 'completeness','COMPLETE',
                 'quality','ACCEPTABLE',
                 'warnings','[]'::jsonb
               ) AS payload
          FROM public.customer_payments p
          JOIN public.customer_invoices i ON i.id=p.invoice_id AND i.organization_id=p.organization_id
          JOIN scheduled_ids s ON s.id=i.id
         WHERE p.organization_id=v_org
      )
      SELECT coalesce(pg_catalog.jsonb_agg(e.payload ORDER BY e.id),'[]'::jsonb)
        INTO v_evidence
        FROM evidence e;
    END IF;

    v_schedule := pg_catalog.jsonb_build_object(
      'status',CASE WHEN v_unresolved_rows>0 THEN 'NEEDS_REVIEW' ELSE 'VERIFIED' END,
      'completeness',CASE WHEN v_unresolved_rows>0 THEN 'PARTIAL' ELSE 'COMPLETE' END,
      'quality',CASE WHEN v_unresolved_rows>0 THEN 'WARNINGS' ELSE 'ACCEPTABLE' END,
      'entries',CASE WHEN v_unresolved_rows>0 THEN '[]'::jsonb ELSE v_entries END,
      'warnings',CASE WHEN v_unresolved_rows>0
        THEN pg_catalog.jsonb_build_array('At least one outstanding invoice could not be placed on a verified due-date schedule.')
        ELSE '[]'::jsonb END
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status',v_status,
    'requestId',v_request_id,
    'asOf',v_as_of,
    'period',v_period,
    'currency',v_currency,
    'authorization',pg_catalog.jsonb_build_object(
      'tenantScope','SERVER_RESOLVED_AUTHENTICATED_TENANT',
      'effectiveRole',v_role,
      'capabilities',pg_catalog.jsonb_build_array('can_manage_finance')
    ),
    'sourceTables',pg_catalog.jsonb_build_array('customer_invoices','customer_payments'),
    'evidenceRecords',v_evidence,
    'metrics',v_metrics,
    'formulaVersions',pg_catalog.jsonb_build_array('nasr1.receivables-outstanding:1'),
    'completeness',v_completeness,
    'quality',v_quality,
    'warnings',v_warnings,
    'errors','[]'::jsonb,
    'sqlState',NULL,
    'sideEffects','NONE',
    'cashflowSchedule',v_schedule
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_intelligence_aggregate(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_intelligence_aggregate(jsonb) TO authenticated;

COMMENT ON FUNCTION public.get_intelligence_aggregate(jsonb) IS
  'Read-only finance-role, server-tenant-derived cashflow aggregate. Returns only scheduled receivables backed by same-tenant invoice/payment rows; withholds the whole schedule if any open invoice lacks a due date or valid currency. Unsupported requested metrics are explicitly PARTIAL.';
