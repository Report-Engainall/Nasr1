BEGIN;

-- REF-SECTION-50-UNAVAILABLE-PRODUCT-SEARCH-DEMAND-001
-- Stores only server-verified product references and pseudonymous unique-customer observations.
-- Raw search text, customer IDs, contact details, cart contents and prices are never persisted.

CREATE TABLE IF NOT EXISTS public.storefront_search_demand_coverage (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  tracking_started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

INSERT INTO public.storefront_search_demand_coverage (organization_id, tracking_started_at)
SELECT o.id, pg_catalog.clock_timestamp()
FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.initialize_storefront_search_demand_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  INSERT INTO public.storefront_search_demand_coverage (organization_id, tracking_started_at)
  VALUES (NEW.id, pg_catalog.clock_timestamp())
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.initialize_storefront_search_demand_coverage() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS organizations_storefront_search_demand_coverage ON public.organizations;
CREATE TRIGGER organizations_storefront_search_demand_coverage
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.initialize_storefront_search_demand_coverage();

CREATE TABLE IF NOT EXISTS public.storefront_unavailable_product_search_observations (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  searcher_fingerprint text NOT NULL
    CHECK (searcher_fingerprint ~ '^[0-9a-f]{32}$'),
  product_id uuid NOT NULL,
  observed_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT storefront_unavailable_product_search_daily_unique
    UNIQUE (organization_id, searcher_fingerprint, product_id, observed_on)
);

CREATE INDEX IF NOT EXISTS storefront_unavailable_search_period_product_idx
  ON public.storefront_unavailable_product_search_observations
    (organization_id, observed_on, product_id);

ALTER TABLE public.storefront_unavailable_product_search_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_search_demand_coverage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.storefront_unavailable_product_search_observations
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.storefront_search_demand_coverage
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_storefront_unavailable_product_search(
  p_search text,
  p_product_ids uuid[],
  p_category_id uuid DEFAULT NULL
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
  v_context jsonb;
  v_warehouse_id uuid;
  v_search text;
  v_search_compact text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_day date;
  v_submitted integer;
  v_verified integer := 0;
  v_inserted integer := 0;
  v_searcher_fingerprint text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR public.is_staff()
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       JOIN public.user_roles r ON r.profile_id = p.id
       WHERE p.id = v_actor
         AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org
         AND p.is_active = true
         AND r.role = 'customer'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization customer profile required for search observation';
  END IF;

  v_context := public.get_current_tenant_context();
  v_warehouse_id := NULLIF(v_context->>'warehouse_id','')::uuid;

  v_search := pg_catalog.btrim(public.normalize_storefront_catalog_search(coalesce(p_search,'')));
  v_search_compact := pg_catalog.regexp_replace(v_search, '[[:space:]]+', '', 'g');

  IF pg_catalog.char_length(v_search) < 2 OR pg_catalog.char_length(v_search) > 120
     OR p_product_ids IS NULL
     OR pg_catalog.cardinality(p_product_ids) < 1
     OR pg_catalog.cardinality(p_product_ids) > 24
     OR pg_catalog.array_position(p_product_ids, NULL) IS NOT NULL
     OR (SELECT pg_catalog.count(DISTINCT x)::integer
           FROM pg_catalog.unnest(p_product_ids) AS requested(x))
          <> pg_catalog.cardinality(p_product_ids) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='search observation input is outside its allowed bounds';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE c.id = p_category_id
      AND c.organization_id = v_org
      AND c.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='search category is not active in the current organization';
  END IF;

  IF v_warehouse_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = v_warehouse_id
      AND w.organization_id = v_org
      AND w.is_active = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','UNAVAILABLE',
      'reason','ACTIVE_WAREHOUSE_UNAVAILABLE',
      'verifiedProductCount',0,
      'insertedObservationCount',0,
      'duplicateObservationCount',0,
      'sideEffects','NONE'
    );
  END IF;

  WITH requested AS MATERIALIZED (
    SELECT x AS product_id
    FROM pg_catalog.unnest(p_product_ids) AS submitted(x)
  ),
  matched AS MATERIALIZED (
    SELECT p.id, inv.quantity_available
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT ib.quantity_available
      FROM public.inventory_balances ib
      WHERE ib.product_id = p.id
        AND ib.warehouse_id = v_warehouse_id
        AND EXISTS (
          SELECT 1 FROM public.warehouses w
          WHERE w.id = ib.warehouse_id
            AND w.organization_id = v_org
            AND w.is_active = true
        )
      ORDER BY ib.id
      LIMIT 1
    ) inv ON true
    WHERE p.organization_id = v_org
      AND p.status = 'active'
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (
        pg_catalog.regexp_replace(
          public.normalize_storefront_catalog_search(p.item_code),
          '[[:space:]]+','','g'
        ) LIKE v_search_compact || '%'
        OR pg_catalog.regexp_replace(
          public.normalize_storefront_catalog_search(coalesce(p.sku,'')),
          '[[:space:]]+','','g'
        ) LIKE v_search_compact || '%'
        OR pg_catalog.regexp_replace(
          public.normalize_storefront_catalog_search(coalesce(p.barcode,'')),
          '[[:space:]]+','','g'
        ) LIKE v_search_compact || '%'
        OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.regexp_split_to_table(v_search, '[[:space:]]+') AS q(token)
          WHERE q.token <> ''
            AND NOT (
              EXISTS (
                SELECT 1
                FROM pg_catalog.regexp_split_to_table(
                  public.normalize_storefront_catalog_search(p.name),
                  '[[:space:]]+'
                ) AS n(token)
                WHERE public.storefront_catalog_token_matches(n.token, q.token)
              )
              OR EXISTS (
                SELECT 1
                FROM pg_catalog.regexp_split_to_table(
                  public.normalize_storefront_catalog_search(coalesce(p.name_en,'')),
                  '[[:space:]]+'
                ) AS n(token)
                WHERE public.storefront_catalog_token_matches(n.token, q.token)
              )
              OR EXISTS (
                SELECT 1
                FROM pg_catalog.regexp_split_to_table(
                  public.normalize_storefront_catalog_search(coalesce(p.description,'')),
                  '[[:space:]]+'
                ) AS n(token)
                WHERE public.storefront_catalog_token_matches(n.token, q.token)
              )
            )
        )
      )
  ),
  eligible AS MATERIALIZED (
    SELECT r.product_id
    FROM requested r
    JOIN matched m ON m.id = r.product_id
    WHERE m.quantity_available = 0
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_verified
  FROM eligible;

  v_submitted := pg_catalog.cardinality(p_product_ids);
  IF v_verified <> v_submitted THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','STALE',
      'reason','SEARCH_RESULT_OR_AVAILABILITY_CHANGED',
      'verifiedProductCount',v_verified,
      'submittedProductCount',v_submitted,
      'insertedObservationCount',0,
      'duplicateObservationCount',0,
      'sideEffects','NONE'
    );
  END IF;

  v_day := (v_now AT TIME ZONE 'UTC')::date;
  v_searcher_fingerprint := pg_catalog.md5(v_org::text || ':' || v_actor::text);

  INSERT INTO public.storefront_unavailable_product_search_observations (
    organization_id, searcher_fingerprint, product_id, observed_on, created_at
  )
  SELECT v_org, v_searcher_fingerprint, requested.product_id, v_day, v_now
  FROM pg_catalog.unnest(p_product_ids) AS requested(product_id)
  ON CONFLICT (organization_id, searcher_fingerprint, product_id, observed_on) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN pg_catalog.jsonb_build_object(
    'status','RECORDED',
    'observedOn',v_day,
    'verifiedProductCount',v_verified,
    'insertedObservationCount',v_inserted,
    'duplicateObservationCount',v_verified-v_inserted,
    'sideEffects','ANALYTICS_ONLY'
  );
END
$function$;

REVOKE ALL ON FUNCTION public.record_storefront_unavailable_product_search(text, uuid[], uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_storefront_unavailable_product_search(text, uuid[], uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_unavailable_product_search_demand(
  p_from date,
  p_to date,
  p_as_of timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_as_of_date date;
  v_tracking_started_at timestamptz;
  v_tracking_started_on date;
  v_tracking_complete boolean := false;
  v_total_count bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_returned_count integer := 0;
  v_complete_population boolean := false;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.is_staff()
     OR NOT public.operational_tasks_can_manage()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_actor
         AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org
         AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization manager permission required for product search demand';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to
     OR p_to - p_from > 364
     OR p_as_of IS NULL
     OR p_as_of > v_now + interval '5 minutes'
     OR p_as_of < v_now - interval '5 minutes'
     OR p_to <> (p_as_of AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='product search demand period or as-of is invalid';
  END IF;

  SELECT c.tracking_started_at
  INTO v_tracking_started_at
  FROM public.storefront_search_demand_coverage c
  WHERE c.organization_id = v_org;

  IF v_tracking_started_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','PARTIAL',
      'asOf',p_as_of,
      'period',pg_catalog.jsonb_build_object('from',p_from,'to',p_to),
      'coverageStartedOn',NULL,
      'totalCount',0,
      'returnedCount',0,
      'completePopulation',false,
      'products','[]'::jsonb,
      'sourceTables',pg_catalog.jsonb_build_array('storefront_unavailable_product_search_observations','products'),
      'sideEffects','NONE',
      'warnings',pg_catalog.jsonb_build_array('SEARCH_DEMAND_COVERAGE_START_MISSING')
    );
  END IF;

  v_tracking_started_on := (v_tracking_started_at AT TIME ZONE 'UTC')::date;
  v_tracking_complete := p_from >= v_tracking_started_on
    AND v_tracking_started_at <= p_as_of;

  WITH product_aggregate AS MATERIALIZED (
    SELECT
      e.product_id,
      pg_catalog.count(*)::bigint AS search_count,
      pg_catalog.count(DISTINCT e.searcher_fingerprint)::bigint AS distinct_searchers,
      pg_catalog.min(e.observed_on) AS first_observed_on,
      pg_catalog.max(e.observed_on) AS last_observed_on,
      pg_catalog.max(e.created_at) AS source_timestamp
    FROM public.storefront_unavailable_product_search_observations e
    WHERE e.organization_id = v_org
      AND e.observed_on >= p_from
      AND e.observed_on <= p_to
      AND e.created_at <= p_as_of
    GROUP BY e.product_id
  ),
  counted AS (
    SELECT pg_catalog.count(*)::bigint AS total_count
    FROM product_aggregate
  ),
  selected AS (
    SELECT
      a.*,
      p.name AS product_label
    FROM product_aggregate a
    LEFT JOIN public.products p
      ON p.id = a.product_id
     AND p.organization_id = v_org
    ORDER BY a.search_count DESC, a.distinct_searchers DESC, a.product_id
    LIMIT 500
  )
  SELECT
    c.total_count,
    pg_catalog.count(s.product_id)::integer,
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'productRef',s.product_id,
          'productLabel',s.product_label,
          'searchCount',s.search_count,
          'distinctSearchers',s.distinct_searchers,
          'firstObservedOn',s.first_observed_on,
          'lastObservedOn',s.last_observed_on,
          'sourceTimestamp',s.source_timestamp
        )
        ORDER BY s.search_count DESC, s.distinct_searchers DESC, s.product_id
      ) FILTER (WHERE s.product_id IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total_count,v_returned_count,v_rows
  FROM counted c
  LEFT JOIN selected s ON true
  GROUP BY c.total_count;

  v_complete_population := v_tracking_complete AND v_total_count <= 500;
  v_status := CASE
    WHEN NOT v_complete_population THEN 'PARTIAL'
    WHEN v_total_count = 0 THEN 'EMPTY'
    ELSE 'VERIFIED'
  END;

  RETURN pg_catalog.jsonb_build_object(
    'status',v_status,
    'asOf',p_as_of,
    'period',pg_catalog.jsonb_build_object('from',p_from,'to',p_to),
    'coverageStartedOn',v_tracking_started_on,
    'totalCount',v_total_count,
    'returnedCount',v_returned_count,
    'completePopulation',v_complete_population,
    'products',v_rows,
    'sourceTables',pg_catalog.jsonb_build_array(
      'storefront_unavailable_product_search_observations','products'
    ),
    'sideEffects','NONE',
    'warnings',CASE
      WHEN NOT v_tracking_complete
        THEN pg_catalog.jsonb_build_array('SEARCH_DEMAND_WINDOW_PRECEDES_TRACKING_COVERAGE')
      WHEN v_total_count > 500
        THEN pg_catalog.jsonb_build_array('SEARCH_DEMAND_PRODUCT_LIMIT_REACHED')
      ELSE '[]'::jsonb
    END
  );
END
$function$;

REVOKE ALL ON FUNCTION public.fetch_unavailable_product_search_demand(date, date, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_unavailable_product_search_demand(date, date, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.record_storefront_unavailable_product_search(text, uuid[], uuid) IS
  'Records only currently server-verified zero-available product references from an authenticated same-tenant customer search. Never persists raw search text or customer identity; one pseudonymous customer/product observation per UTC day.';

COMMENT ON FUNCTION public.fetch_unavailable_product_search_demand(date, date, timestamptz) IS
  'Manager-only aggregate of customer searches that surfaced active catalog products with known zero available quantity. Historical periods before tracking coverage and populations over 500 products remain PARTIAL. No customer identity, raw query, price or order data is returned.';

COMMIT;
