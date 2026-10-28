-- AGH-CATALOG-FEATURED-PROJECTION-001
-- Forward-only correction: preserve persisted public product-discovery metadata.
-- Public storefront payloads still omit tenant/warehouse IDs, internal inventory IDs,
-- physical on-hand counts, reservations, reorder thresholds, and financial source fields.
BEGIN;

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
      p.id, p.organization_id, p.category_id, p.name, p.name_en, p.item_code, p.sku,
      p.barcode, p.description, p.unit, p.image_url, p.status, p.created_at,
      p.min_order_quantity, p.order_quantity_multiple, p.is_featured, p.sort_order,
      coalesce(inv.quantity_available, 0)::numeric AS quantity_available
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT ib.quantity_available
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
        OR pg_catalog.regexp_replace(public.normalize_storefront_catalog_search(coalesce(p.sku,'')),'[[:space:]]+','','g')
             LIKE v_search_compact || '%'
        OR pg_catalog.regexp_replace(public.normalize_storefront_catalog_search(coalesce(p.barcode,'')),'[[:space:]]+','','g')
             LIKE v_search_compact || '%'
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
          (
            pg_catalog.jsonb_build_object(
            'id', r.id,
            'category_id', r.category_id,
            'name', r.name,
            'name_en', r.name_en,
            'item_code', r.item_code,
            'sku', r.sku,
            'barcode', r.barcode,
            'unit', r.unit,
            'description', r.description,
            'image_url', r.image_url,
            'is_active', true,
            'is_featured', r.is_featured,
            'sort_order', r.sort_order,
            'reserved_quantity', 0,
            'min_stock_level', 0,
            'min_order_quantity', r.min_order_quantity,
            'order_quantity_multiple', r.order_quantity_multiple,
            'status', r.status,
            'created_at', r.created_at,
            'display_price', prices.unit_price,
            'inventory', pg_catalog.jsonb_build_object(
              'product_id', r.id,
              'quantity_available', r.quantity_available
            )
            ) || CASE WHEN v_is_staff
                 THEN pg_catalog.jsonb_build_object('base_price', prices.unit_price)
                 ELSE '{}'::jsonb
               END
          )
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
  'Tenant-scoped catalog search and pagination over item code, SKU, barcode, Arabic and English names, and description. Returns one caller-authorized display price only; never exposes tier-price columns.';

COMMIT;
