-- Hidden storefront prices are absent values, never numeric zero sentinels.
-- Preserve the live-session and membership checks from PR #144 when redefining the price RPC.
CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(
  p_product_ids uuid[],
  p_quantity numeric DEFAULT 1
)
RETURNS TABLE(product_id uuid, unit_price numeric(15,2))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_customer_id uuid;
  v_tier text := 'retail';
  v_customer_status text;
  v_is_staff boolean := false;
  v_show_price boolean := true;
BEGIN
  IF p_product_ids IS NULL OR pg_catalog.cardinality(p_product_ids) = 0 THEN RETURN; END IF;
  IF pg_catalog.cardinality(p_product_ids) > 500
     OR pg_catalog.array_position(p_product_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product batch must contain at most 500 non-null ids';
  END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity <> pg_catalog.trunc(p_quantity) OR p_quantity < 1 OR p_quantity > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='price quantity must be an integer between 1 and 10000';
  END IF;

  IF auth.uid() IS NULL THEN
    v_organization_id := public.public_storefront_organization_id();
  ELSE
    -- Resolve the canonical profile only while its server-side Auth session is live.
    v_profile_id := public.current_profile_id();
    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active profile and organization required to resolve catalog prices';
    END IF;
    SELECT p.organization_id,
           (
             EXISTS (
               SELECT 1 FROM public.user_roles r
                WHERE r.profile_id = p.id
                  AND r.role IN ('admin','manager','staff')
             )
             AND NOT EXISTS (
               SELECT 1 FROM public.user_roles r
                WHERE r.profile_id = p.id
                  AND r.role = 'accountant'
             )
           )
      INTO v_organization_id, v_is_staff
      FROM public.profiles p
     WHERE p.id = v_profile_id
       AND p.auth_user_id = auth.uid()
       AND p.is_active = true;
    IF v_organization_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active profile and organization required to resolve catalog prices';
    END IF;
    IF NOT v_is_staff THEN
      v_customer_id := public.current_customer_id();
      IF v_customer_id IS NOT NULL THEN
        SELECT c.status, c.tier INTO v_customer_status, v_tier
          FROM public.customers c WHERE c.id = v_customer_id AND c.organization_id = v_organization_id;
        IF NOT FOUND OR v_customer_status IS DISTINCT FROM 'approved' THEN
          v_tier := 'retail';
        ELSE
          v_tier := COALESCE(NULLIF(v_tier,''),'retail');
        END IF;
      ELSE
        v_tier := 'retail';
      END IF;
    END IF;
  END IF;

  IF v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = v_organization_id AND o.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active storefront organization is required';
  END IF;

  SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
              THEN (s.value #>> '{}')::boolean ELSE true END
    INTO v_show_price
    FROM public.admin_settings s
   WHERE s.organization_id = v_organization_id AND s.key = 'show_price_on_cards';
  v_show_price := COALESCE(v_show_price, true);

  IF NOT v_is_staff AND NOT v_show_price THEN
    RETURN QUERY
      SELECT p.id, NULL::numeric(15,2)
        FROM public.products p
       WHERE p.id = ANY(p_product_ids)
         AND p.organization_id = v_organization_id
         AND p.status = 'active'
       ORDER BY p.id;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id,
           CASE WHEN v_is_staff THEN pg_catalog.round(p.base_price,2)
                ELSE (
                  SELECT resolved.net_unit_price
                    FROM public.resolve_active_promotion_price(
                      p.id,
                      v_organization_id,
                      public.customer_product_unit_price(p.id, v_organization_id, v_tier, p_quantity)
                    ) AS resolved
                )
           END::numeric(15,2)
      FROM public.products p
     WHERE p.id = ANY(p_product_ids)
       AND p.organization_id = v_organization_id
       AND p.status = 'active'
     ORDER BY p.id;
END
$function$;
REVOKE ALL ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) TO anon, authenticated;
COMMENT ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) IS
  'Returns only caller-specific prices from the current customer tier. When show_price_on_cards is disabled, customer RPC calls return NULL for unit_price, never a numeric sentinel; raw tier-price rows remain inaccessible to browser roles.';

-- The public catalog RPC omits base_price for customers and returns it only to authorized staff. The display_price key is JSON null
-- when show_price_on_cards is disabled, letting the client distinguish hidden from malformed data.
CREATE OR REPLACE FUNCTION public.get_storefront_catalog_page(
  p_search text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 24,
  p_available_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_context jsonb;
  v_organization_id uuid;
  v_warehouse_id uuid;
  v_is_staff boolean := false;
  v_search text;
  v_search_compact text;
  v_page integer := coalesce(p_page, 1);
  v_page_size integer := coalesce(p_page_size, 24);
  v_offset integer;
  v_total_count bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_page < 1 OR v_page > 100000
     OR v_page_size < 1 OR v_page_size > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='catalog page must be 1..100000 and page size 1..100';
  END IF;
  IF pg_catalog.length(coalesce(p_search,'')) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='catalog search is limited to 120 characters';
  END IF;
  IF p_available_only IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='availability filter must be explicit';
  END IF;

  IF auth.uid() IS NULL THEN
    v_context := public.get_public_storefront_context();
  ELSE
    v_context := public.get_current_tenant_context();
  END IF;

  v_organization_id := nullif(v_context->>'organization_id','')::uuid;
  v_warehouse_id := nullif(v_context->>'warehouse_id','')::uuid;
  v_is_staff := coalesce(nullif(v_context->>'is_staff','')::boolean, false);

  IF v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = v_organization_id AND o.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active storefront organization is required';
  END IF;

  v_search := pg_catalog.btrim(public.normalize_storefront_catalog_search(p_search));
  v_search_compact := pg_catalog.regexp_replace(v_search, '[[:space:]]+', '', 'g');
  v_offset := (v_page - 1) * v_page_size;

  WITH matched AS MATERIALIZED (
    SELECT
      p.id, p.organization_id, p.category_id, p.name, p.item_code,
      p.barcode, p.description, p.unit, p.image_url, p.status, p.created_at,
      inv.id AS inventory_id,
      inv.quantity_on_hand AS inventory_quantity_on_hand,
      inv.quantity_available AS inventory_quantity_available,
      coalesce(inv.quantity_available, 0)::numeric AS quantity_available
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT ib.id, ib.quantity_on_hand, ib.quantity_available
      FROM public.inventory_balances ib
      WHERE ib.product_id = p.id
        AND ib.warehouse_id = v_warehouse_id
        AND EXISTS (
          SELECT 1
          FROM public.warehouses w
          WHERE w.id = ib.warehouse_id
            AND w.organization_id = v_organization_id
            AND w.is_active = true
        )
      ORDER BY ib.id
      LIMIT 1
    ) inv ON true
    WHERE p.organization_id = v_organization_id
      AND p.status = 'active'
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (NOT p_available_only OR
        (v_warehouse_id IS NOT NULL AND coalesce(inv.quantity_available,0) > 0))
      AND (
        v_search = ''
        OR pg_catalog.regexp_replace(public.normalize_storefront_catalog_search(p.item_code),'[[:space:]]+','','g')
             LIKE v_search_compact || '%'
        OR pg_catalog.regexp_replace(public.normalize_storefront_catalog_search(coalesce(p.barcode,'')),'[[:space:]]+','','g')
             LIKE v_search_compact || '%'
        OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.regexp_split_to_table(v_search, '[[:space:]]+') AS q(token)
          WHERE q.token <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.regexp_split_to_table(
                public.normalize_storefront_catalog_search(p.name),
                '[[:space:]]+'
              ) AS n(token)
              WHERE public.storefront_catalog_token_matches(n.token, q.token)
            )
        )
      )
  ),
  page_rows AS MATERIALIZED (
    SELECT *
    FROM matched
    ORDER BY name, id
    OFFSET v_offset
    LIMIT v_page_size
  ),
  page_prices AS (
    SELECT prices.product_id, prices.unit_price
    FROM public.get_storefront_product_prices(
      (SELECT pg_catalog.array_agg(id) FROM page_rows),
      1
    ) AS prices
  )
  SELECT
    (SELECT pg_catalog.count(*)::bigint FROM matched),
    coalesce(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', r.id,
            'organization_id', r.organization_id,
            'category_id', r.category_id,
            'name', r.name,
            'name_en', NULL,
            'item_code', r.item_code,
            'sku', NULL,
            'barcode', r.barcode,
            'brand_id', NULL,
            'unit', r.unit,
            'description', r.description,
            'image_url', r.image_url,
            'is_active', true,
            'is_featured', false,
            'sort_order', 0,
            'stock_quantity', coalesce(r.inventory_quantity_on_hand,0),
            'reserved_quantity', 0,
            'min_stock_level', 0,
            'status', r.status,
            'created_at', r.created_at,
            'display_price', prices.unit_price,
            'inventory',
              CASE WHEN r.inventory_id IS NULL THEN NULL
                ELSE pg_catalog.jsonb_build_object(
                  'id', r.inventory_id,
                  'organization_id', r.organization_id,
                  'product_id', r.id,
                  'warehouse_id', v_warehouse_id,
                  'quantity_on_hand', coalesce(r.inventory_quantity_on_hand,0),
                  'quantity_available', r.quantity_available
                )
              END
          ) || CASE WHEN v_is_staff
               THEN pg_catalog.jsonb_build_object('base_price', prices.unit_price)
               ELSE '{}'::jsonb
             END
          ORDER BY r.name, r.id
        )
        FROM page_rows r
        JOIN page_prices prices ON prices.product_id = r.id
      ),
      '[]'::jsonb
    )
  INTO v_total_count, v_items;

  RETURN pg_catalog.jsonb_build_object(
    'page', v_page,
    'page_size', v_page_size,
    'total_count', v_total_count,
    'total_pages', CASE WHEN v_total_count = 0 THEN 0
      ELSE ((v_total_count + v_page_size - 1) / v_page_size) END,
    'items', v_items
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_storefront_catalog_page(text, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_catalog_page(text, uuid, integer, integer, boolean) TO anon, authenticated;
COMMENT ON FUNCTION public.get_storefront_catalog_page(text, uuid, integer, integer, boolean) IS
  'Tenant-scoped catalog page. Customer payloads omit base_price; authorized staff receive only the base price resolved through the pricing RPC. Hidden customer display_price is NULL, not zero.';
