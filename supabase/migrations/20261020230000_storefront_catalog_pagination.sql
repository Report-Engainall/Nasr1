-- Tenant-scoped server-side pagination/search for the public storefront.
-- This RPC returns one authorized display price only; tier-price columns are never projected.
CREATE OR REPLACE FUNCTION public.normalize_storefront_catalog_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path=''
AS $function$
  SELECT pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            coalesce(p_value,''),
            '[ًٌٍَُِّْٰۣۖۗۘۙۚۛۜ۟۠ۡۢۤۥۦۧۨ۩۪ۭ۫۬]',
            '',
            'g'
          ),
          'ـ',
          '',
          'g'
        ),
        'أ',
        'ا'
      ),
      '[إآٱ]',
      'ا',
      'g'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.normalize_storefront_catalog_search(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path=''
AS $function$
  SELECT pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.lower(public.normalize_storefront_catalog_text(p_value)),
            'ى','ي'
          ),
          'ؤ','و'
        ),
        'ئ','ي'
      ),
      '[^[:alnum:]]+',
      ' ',
      'g'
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );
$function$;

CREATE OR REPLACE FUNCTION public.storefront_catalog_token_matches(
  p_candidate text,
  p_query text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=''
AS $function$
DECLARE
  v_i integer := 1;
  v_j integer := 1;
  v_edits integer := 0;
  v_candidate_len integer := pg_catalog.char_length(p_candidate);
  v_query_len integer := pg_catalog.char_length(p_query);
BEGIN
  IF p_candidate = '' OR p_query = '' THEN
    RETURN false;
  END IF;
  IF pg_catalog.strpos(p_candidate, p_query) > 0 THEN
    RETURN true;
  END IF;
  IF pg_catalog.abs(v_candidate_len - v_query_len) > 1 OR v_query_len < 4 THEN
    RETURN false;
  END IF;

  WHILE v_i <= v_candidate_len AND v_j <= v_query_len LOOP
    IF pg_catalog.substr(p_candidate, v_i, 1) = pg_catalog.substr(p_query, v_j, 1) THEN
      v_i := v_i + 1;
      v_j := v_j + 1;
    ELSE
      v_edits := v_edits + 1;
      IF v_edits > 1 THEN
        RETURN false;
      END IF;
      IF v_candidate_len = v_query_len THEN
        v_i := v_i + 1;
        v_j := v_j + 1;
      ELSIF v_candidate_len > v_query_len THEN
        v_i := v_i + 1;
      ELSE
        v_j := v_j + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_i <= v_candidate_len OR v_j <= v_query_len THEN
    v_edits := v_edits + 1;
  END IF;
  RETURN v_edits <= 1;
END
$function$;

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
      WHERE ib.organization_id = v_organization_id
        AND ib.product_id = p.id
        AND ib.warehouse_id = v_warehouse_id
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
            'base_price', CASE WHEN v_is_staff THEN prices.unit_price ELSE 0 END,
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

REVOKE ALL ON FUNCTION public.normalize_storefront_catalog_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_storefront_catalog_search(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.storefront_catalog_token_matches(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_storefront_catalog_page(text, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_catalog_page(text, uuid, integer, integer, boolean) TO anon, authenticated;

COMMENT ON FUNCTION public.get_storefront_catalog_page(text, uuid, integer, integer, boolean) IS
  'Tenant-scoped server-side storefront pagination/search/filter. Returns one caller-authorized price through get_storefront_product_prices and never exposes raw tier-price columns.';
