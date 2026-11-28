-- Read only the products already present in a storefront cart.
-- This deliberately avoids loading the full catalogue and never resolves prices.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_storefront_cart_product_details(
  p_product_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_context jsonb;
  v_organization_id uuid;
  v_warehouse_id uuid;
  v_product_ids uuid[] := coalesce(p_product_ids, ARRAY[]::uuid[]);
  v_unique_count integer;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF pg_catalog.cardinality(v_product_ids) > 100
     OR pg_catalog.array_position(v_product_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'cart product lookup accepts at most 100 non-null product IDs';
  END IF;

  SELECT pg_catalog.count(DISTINCT requested.product_id)::integer
    INTO v_unique_count
    FROM pg_catalog.unnest(v_product_ids) AS requested(product_id);

  IF v_unique_count <> pg_catalog.cardinality(v_product_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'cart product lookup does not accept duplicate product IDs';
  END IF;

  IF auth.uid() IS NULL THEN
    v_context := public.get_public_storefront_context();
  ELSE
    v_context := public.get_current_tenant_context();
  END IF;

  v_organization_id := nullif(v_context ->> 'organization_id', '')::uuid;
  v_warehouse_id := nullif(v_context ->> 'warehouse_id', '')::uuid;

  IF v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.organizations AS organization
     WHERE organization.id = v_organization_id
       AND organization.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active storefront organization is required';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', product.id,
        'category_id', product.category_id,
        'brand_id', NULL,
        'name', product.name,
        'name_en', product.name_en,
        'item_code', product.item_code,
        'sku', product.sku,
        'barcode', product.barcode,
        'unit', product.unit,
        'description', product.description,
        'image_url', product.image_url,
        'is_active', true,
        'is_featured', product.is_featured,
        'sort_order', product.sort_order,
        'min_order_quantity', product.min_order_quantity,
        'order_quantity_multiple', product.order_quantity_multiple,
        'status', product.status,
        'created_at', product.created_at,
        -- Cart rendering does not need price data. The dedicated pricing-preview
        -- RPC remains responsible for any authorized price disclosure.
        'display_price', NULL,
        'inventory',
          CASE WHEN inventory.product_id IS NULL THEN NULL
            ELSE pg_catalog.jsonb_build_object(
              'product_id', product.id,
              'quantity_available', inventory.quantity_available
            )
          END
      )
      ORDER BY requested.ordinality
    ),
    '[]'::jsonb
  )
    INTO v_items
    FROM pg_catalog.unnest(v_product_ids) WITH ORDINALITY AS requested(product_id, ordinality)
    JOIN public.products AS product
      ON product.id = requested.product_id
     AND product.organization_id = v_organization_id
     AND product.status = 'active'
    LEFT JOIN LATERAL (
      SELECT balance.product_id, balance.quantity_available
        FROM public.inventory_balances AS balance
        JOIN public.warehouses AS warehouse
          ON warehouse.id = balance.warehouse_id
         AND warehouse.organization_id = v_organization_id
         AND warehouse.is_active = true
       WHERE balance.product_id = product.id
         AND balance.warehouse_id = v_warehouse_id
       ORDER BY balance.id
       LIMIT 1
    ) AS inventory ON true;

  RETURN pg_catalog.jsonb_build_object('items', v_items);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_storefront_cart_product_details(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_cart_product_details(uuid[]) TO anon, authenticated;

COMMENT ON FUNCTION public.get_storefront_cart_product_details(uuid[]) IS
  'Returns only active same-tenant product display fields and selected-warehouse availability for up to 100 cart product IDs. Does not load the full catalogue or resolve prices; prices remain on the authorized pricing-preview RPC.';

COMMIT;
