BEGIN;

-- Product-level minimum and pack multiple are explicit catalog policy, never inferred from stock.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_order_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS order_quantity_multiple integer NOT NULL DEFAULT 1;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_min_order_quantity_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_min_order_quantity_check
      CHECK (min_order_quantity BETWEEN 1 AND 10000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_order_quantity_multiple_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_order_quantity_multiple_check
      CHECK (order_quantity_multiple BETWEEN 1 AND 10000);
  END IF;
END
$constraints$;

-- Safe order-policy metadata is readable; financial columns remain behind existing RPCs.
GRANT SELECT (min_order_quantity, order_quantity_multiple)
  ON TABLE public.products TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_product_order_quantity(
  p_product_id uuid,
  p_organization_id uuid,
  p_quantity numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_min_order_quantity integer;
  v_order_quantity_multiple integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity <> pg_catalog.trunc(p_quantity)
     OR p_quantity < 1 OR p_quantity > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000';
  END IF;

  SELECT p.min_order_quantity, p.order_quantity_multiple
    INTO v_min_order_quantity, v_order_quantity_multiple
    FROM public.products AS p
   WHERE p.id = p_product_id
     AND p.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا توجد سياسة كمية موثوقة لهذا الصنف ضمن المؤسسة الحالية';
  END IF;

  IF p_quantity < v_min_order_quantity
     OR pg_catalog.mod(p_quantity - v_min_order_quantity, v_order_quantity_multiple) <> 0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE = 'الكمية لا تطابق الحد الأدنى أو مضاعف الطلب للصنف',
      DETAIL = pg_catalog.format('min_order_quantity=%s; order_quantity_multiple=%s', v_min_order_quantity, v_order_quantity_multiple);
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.assert_product_order_quantity(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_product_order_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.organization_id
    INTO v_organization_id
    FROM public.orders AS o
   WHERE o.id = NEW.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='order quantity policy requires a valid order';
  END IF;

  PERFORM public.assert_product_order_quantity(NEW.product_id, v_organization_id, NEW.quantity);
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.guard_product_order_quantity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_product_quantity_policy ON public.order_items;
CREATE TRIGGER order_items_product_quantity_policy
  BEFORE INSERT OR UPDATE OF order_id, product_id, quantity
  ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_product_order_quantity();

CREATE OR REPLACE FUNCTION public.preview_order_pricing(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_tier text := 'retail';
  v_customer_status text := 'pending';
  v_currency text := 'YER';
  v_line jsonb;
  v_aggregated record;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_unit_price numeric(15,2);
  v_line_total numeric(15,2);
  v_discount_per_unit numeric(15,2) := 0;
  v_promotion record;
  v_total numeric(15,2):=0;
  v_items jsonb:='[]'::jsonb;
  v_count integer:=0;
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  IF _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='items must be an array';
  END IF;
  IF pg_catalog.jsonb_array_length(_items)<1 OR pg_catalog.jsonb_array_length(_items)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cart must contain between 1 and 100 items';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization context required';
  END IF;

  SELECT c.tier,c.status INTO v_tier,v_customer_status
    FROM public.customers c
   WHERE c.profile_id=v_profile AND c.organization_id=v_org
   ORDER BY c.created_at LIMIT 1;
  IF NOT FOUND THEN
    v_tier:='retail';
    v_customer_status:='pending';
  END IF;
  v_tier:=coalesce(nullif(v_tier,''),'retail');
  IF v_customer_status<>'approved' THEN v_tier:='retail'; END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(_items) LOOP
    BEGIN
      v_product_id:=(v_line->>'product_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid product id or quantity';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<>pg_catalog.trunc(v_quantity)
       OR v_quantity<1 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be a positive integer not exceeding 10000';
    END IF;
  END LOOP;

  FOR v_aggregated IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
     ORDER BY (entry.value->>'product_id')::uuid
  LOOP
    v_product_id:=v_aggregated.product_id;
    v_quantity:=v_aggregated.quantity;
    IF v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='aggregate quantity exceeds 10000 for one product';
    END IF;
    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product is unavailable in this organization'; END IF;

    PERFORM public.assert_product_order_quantity(v_product.id, v_org, v_quantity);
    v_unit_price:=public.customer_product_unit_price(v_product.id,v_org,v_tier,v_quantity);
    SELECT * INTO v_promotion
      FROM public.resolve_active_promotion_price(v_product.id,v_org,v_unit_price);
    v_discount_per_unit:=v_promotion.discount_per_unit;
    v_line_total:=pg_catalog.round((v_unit_price-v_discount_per_unit)*v_quantity,2);
    v_total:=v_total+v_line_total;
    v_count:=v_count+1;
    v_items:=v_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id',v_product.id,
      'name',v_product.name,
      'item_code',v_product.item_code,
      'unit',v_product.unit,
      'quantity',v_quantity,
      'unit_price',pg_catalog.round(v_unit_price-v_discount_per_unit,2),
      'original_unit_price',v_unit_price,
      'discount_per_unit',v_discount_per_unit,
      'discount_amount',pg_catalog.round(v_discount_per_unit*v_quantity,2),
      'promotion_title',v_promotion.promotion_title,
      'line_total',v_line_total
    ));
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,
    'total_amount',v_total,
    'currency',coalesce(v_currency,'YER'),
    'customer_tier',v_tier,
    'price_basis','server'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.preview_order_pricing(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_order_pricing(jsonb) TO authenticated;


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
            'organization_id', r.organization_id,
            'category_id', r.category_id,
            'name', r.name,
            'name_en', r.name_en,
            'item_code', r.item_code,
            'sku', r.sku,
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
