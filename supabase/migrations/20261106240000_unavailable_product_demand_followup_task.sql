BEGIN;

-- REF-SECTION-50-UNAVAILABLE-PRODUCT-DEMAND-FOLLOWUP-001
-- Explicit manager action: create one idempotent purchasing review task for a verified demand signal.
-- This does not create a purchase order, reserve stock, change prices or post a financial entry.

CREATE OR REPLACE FUNCTION public.create_unavailable_product_demand_follow_up_task(
  p_product_id uuid,
  p_from date,
  p_to date,
  p_as_of timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_tracking_started_at timestamptz;
  v_product_name text;
  v_product_code text;
  v_search_count integer := 0;
  v_distinct_searchers integer := 0;
  v_event_key text;
  v_task_id uuid;
  v_reused boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_actor
         AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org
         AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization manager permission required for demand follow-up tasks';
  END IF;

  IF p_product_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to
     OR p_to - p_from > 364
     OR p_as_of IS NULL
     OR p_as_of > v_now + interval '5 minutes'
     OR p_as_of < v_now - interval '5 minutes'
     OR p_to <> (p_as_of AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='unavailable product demand follow-up period is invalid';
  END IF;

  SELECT c.tracking_started_at
  INTO v_tracking_started_at
  FROM public.storefront_search_demand_coverage c
  WHERE c.organization_id = v_org;

  IF v_tracking_started_at IS NULL
     OR p_from < (v_tracking_started_at AT TIME ZONE 'UTC')::date
     OR v_tracking_started_at > p_as_of THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','NOT_ELIGIBLE',
      'reason','DEMAND_PERIOD_NOT_FULLY_TRACKED',
      'taskId',NULL,
      'sideEffects','NONE'
    );
  END IF;

  SELECT p.name, p.item_code
  INTO v_product_name, v_product_code
  FROM public.products p
  WHERE p.id = p_product_id
    AND p.organization_id = v_org
    AND p.status = 'active';

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','NOT_ELIGIBLE',
      'reason','PRODUCT_NOT_ACTIVE_IN_CURRENT_ORGANIZATION',
      'taskId',NULL,
      'sideEffects','NONE'
    );
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT e.searcher_fingerprint)::integer
  INTO v_search_count, v_distinct_searchers
  FROM public.storefront_unavailable_product_search_observations e
  WHERE e.organization_id = v_org
    AND e.product_id = p_product_id
    AND e.observed_on BETWEEN p_from AND p_to
    AND e.created_at <= p_as_of;

  IF v_search_count < 5 OR v_distinct_searchers < 3 THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','NOT_ELIGIBLE',
      'reason','DEMAND_SAMPLE_BELOW_RADAR_THRESHOLD',
      'searchCount',v_search_count,
      'distinctSearchers',v_distinct_searchers,
      'taskId',NULL,
      'sideEffects','NONE'
    );
  END IF;

  v_event_key := 'growth-unavailable-demand:'||p_product_id::text||':'||
    p_from::text||':'||p_to::text;

  -- Serialize repeated clicks for the exact product and evidence window before checking
  -- whether the same source event already owns an operational task.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':'||v_event_key,0)
  );

  SELECT t.id
  INTO v_task_id
  FROM public.ai_tasks t
  WHERE t.organization_id = v_org
    AND t.source_event_key = v_event_key;

  v_reused := FOUND;

  v_task_id := public.upsert_operational_task(
    v_org,
    'مراجعة طلب العملاء على صنف غير متاح: '||
      pg_catalog.left(coalesce(nullif(pg_catalog.btrim(v_product_code),''),v_product_name),150),
    'سجل البحث الموثق '||v_search_count::text||' ملاحظة من '||
      v_distinct_searchers::text||' عملاء مميزين خلال '||
      p_from::text||' إلى '||p_to::text||
      '. تحقّق من التوفر الحالي وسبب فجوة الطلب والبدائل قبل اتخاذ قرار شراء. لا يوجد أمر شراء أو حجز مخزون منشأ من هذه المهمة.',
    'purchasing',
    'medium',
    'unavailable_product_demand_review',
    v_event_key,
    'products',
    p_product_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'source','storefront_unavailable_product_search_observations',
      'period_from',p_from,
      'period_to',p_to,
      'as_of',p_as_of,
      'search_count',v_search_count,
      'distinct_searchers',v_distinct_searchers,
      'action','HUMAN_REVIEW_ONLY'
    ),
    false
  );

  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN v_reused THEN 'REUSED' ELSE 'CREATED' END,
    'taskId',v_task_id,
    'productId',p_product_id,
    'period',pg_catalog.jsonb_build_object('from',p_from,'to',p_to),
    'searchCount',v_search_count,
    'distinctSearchers',v_distinct_searchers,
    'sideEffects','OPERATIONAL_TASK_ONLY'
  );
END
$function$;

REVOKE ALL ON FUNCTION public.create_unavailable_product_demand_follow_up_task(uuid,date,date,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_unavailable_product_demand_follow_up_task(uuid,date,date,timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.create_unavailable_product_demand_follow_up_task(uuid,date,date,timestamptz) IS
  'Manager-only, same-tenant explicit action. Rechecks a fully tracked period with at least five customer/product/day observations from at least three distinct pseudonymous customers, then creates or reuses one purchasing review task per product and evidence window. No PO, stock, price or ledger mutation.';

COMMIT;
