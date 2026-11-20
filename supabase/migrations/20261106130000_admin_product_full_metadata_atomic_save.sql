-- Restore one atomic product writer for both create and update.
-- Preserve the complete metadata contract (SKU, order policy, storefront metadata)
-- while the canonical catalog function owns identity, active-category checks and prices.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_admin_product_with_metadata(
  p_product_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_allowed_fields text[] := ARRAY[
    'name', 'item_code', 'barcode', 'unit', 'description', 'category_id',
    'base_price', 'price_wholesale_of_wholesale', 'price_wholesale', 'price_retail',
    'status', 'expected_base_price', 'expected_price_wholesale_of_wholesale',
    'expected_price_wholesale', 'expected_price_retail',
    'name_en', 'sku', 'is_featured', 'sort_order',
    'min_order_quantity', 'order_quantity_multiple'
  ]::text[];
  v_metadata_fields text[] := ARRAY[
    'name_en', 'sku', 'is_featured', 'sort_order',
    'min_order_quantity', 'order_quantity_multiple'
  ]::text[];
  v_unsupported_fields text;
  v_name_en text;
  v_sku text;
  v_is_featured boolean;
  v_sort_order numeric;
  v_min_order_quantity numeric;
  v_order_quantity_multiple numeric;
  v_product_id uuid;
  v_core_payload jsonb;
  v_core_result jsonb;
  v_before jsonb;
  v_current jsonb;
  v_after jsonb;
  v_metadata_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role IN ('admin', 'manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required for catalog commands';
  END IF;

  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product payload must be a JSON object';
  END IF;

  SELECT pg_catalog.string_agg(k.key_name, ', ' ORDER BY k.key_name)
    INTO v_unsupported_fields
  FROM pg_catalog.jsonb_object_keys(p_payload) AS k(key_name)
  WHERE NOT (k.key_name = ANY (v_allowed_fields));

  IF v_unsupported_fields IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product save payload contains unsupported fields',
      DETAIL = 'unsupported fields: ' || v_unsupported_fields;
  END IF;

  IF (p_payload ? 'name_en'
      AND pg_catalog.jsonb_typeof(p_payload->'name_en') NOT IN ('string', 'null'))
     OR (p_payload ? 'sku'
      AND pg_catalog.jsonb_typeof(p_payload->'sku') NOT IN ('string', 'null'))
     OR (p_payload ? 'is_featured'
      AND pg_catalog.jsonb_typeof(p_payload->'is_featured') IS DISTINCT FROM 'boolean')
     OR (p_payload ? 'sort_order'
      AND pg_catalog.jsonb_typeof(p_payload->'sort_order') IS DISTINCT FROM 'number')
     OR (p_payload ? 'min_order_quantity'
      AND pg_catalog.jsonb_typeof(p_payload->'min_order_quantity') IS DISTINCT FROM 'number')
     OR (p_payload ? 'order_quantity_multiple'
      AND pg_catalog.jsonb_typeof(p_payload->'order_quantity_multiple') IS DISTINCT FROM 'number') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product metadata fields have invalid types';
  END IF;

  v_name_en := CASE WHEN p_payload ? 'name_en'
    THEN NULLIF(pg_catalog.btrim(p_payload->>'name_en'), '') ELSE NULL END;
  v_sku := CASE WHEN p_payload ? 'sku'
    THEN NULLIF(pg_catalog.btrim(p_payload->>'sku'), '') ELSE NULL END;

  IF (v_name_en IS NOT NULL AND pg_catalog.length(v_name_en) > 240)
     OR (v_sku IS NOT NULL AND pg_catalog.length(v_sku) > 80) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product metadata field length is invalid';
  END IF;

  BEGIN
    IF p_payload ? 'sort_order' THEN v_sort_order := (p_payload->>'sort_order')::numeric; END IF;
    IF p_payload ? 'min_order_quantity' THEN v_min_order_quantity := (p_payload->>'min_order_quantity')::numeric; END IF;
    IF p_payload ? 'order_quantity_multiple' THEN v_order_quantity_multiple := (p_payload->>'order_quantity_multiple')::numeric; END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product metadata numeric fields are invalid';
  END;

  IF (v_sort_order IS NOT NULL AND
      (v_sort_order <> pg_catalog.trunc(v_sort_order) OR v_sort_order < 0 OR v_sort_order > 1000000000))
     OR (v_min_order_quantity IS NOT NULL AND
      (v_min_order_quantity <> pg_catalog.trunc(v_min_order_quantity) OR v_min_order_quantity < 1 OR v_min_order_quantity > 10000))
     OR (v_order_quantity_multiple IS NOT NULL AND
      (v_order_quantity_multiple <> pg_catalog.trunc(v_order_quantity_multiple) OR v_order_quantity_multiple < 1 OR v_order_quantity_multiple > 10000)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product metadata numeric fields are outside the supported range';
  END IF;

  IF p_product_id IS NULL THEN
    v_before := '{}'::jsonb;
  ELSE
    SELECT pg_catalog.jsonb_build_object(
      'name_en', p.name_en,
      'sku', p.sku,
      'is_featured', p.is_featured,
      'sort_order', p.sort_order,
      'min_order_quantity', p.min_order_quantity,
      'order_quantity_multiple', p.order_quantity_multiple
    )
    INTO v_before
    FROM public.products AS p
    WHERE p.id = p_product_id AND p.organization_id = v_org
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002',
        MESSAGE = 'product not found in organization';
    END IF;
  END IF;

  -- One canonical command owns product INSERT/UPDATE, pricing, stale-value checks and core audit.
  v_core_payload := p_payload - v_metadata_fields;
  v_core_result := public.save_admin_catalog_product(p_product_id, v_core_payload);

  IF pg_catalog.jsonb_typeof(v_core_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog product command returned an invalid result';
  END IF;

  v_product_id := coalesce(NULLIF(v_core_result->>'id', '')::uuid, p_product_id);
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'catalog product command did not return a product identifier';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'name_en', p.name_en,
    'sku', p.sku,
    'is_featured', p.is_featured,
    'sort_order', p.sort_order,
    'min_order_quantity', p.min_order_quantity,
    'order_quantity_multiple', p.order_quantity_multiple
  )
  INTO v_current
  FROM public.products AS p
  WHERE p.id = v_product_id AND p.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'saved product is outside the active organization';
  END IF;

  UPDATE public.products AS p
  SET name_en = CASE WHEN p_payload ? 'name_en' THEN v_name_en ELSE p.name_en END,
      sku = CASE WHEN p_payload ? 'sku' THEN v_sku ELSE p.sku END,
      is_featured = CASE WHEN p_payload ? 'is_featured' THEN (p_payload->>'is_featured')::boolean ELSE p.is_featured END,
      sort_order = CASE WHEN p_payload ? 'sort_order' THEN v_sort_order::integer ELSE p.sort_order END,
      min_order_quantity = CASE WHEN p_payload ? 'min_order_quantity' THEN v_min_order_quantity::integer ELSE p.min_order_quantity END,
      order_quantity_multiple = CASE WHEN p_payload ? 'order_quantity_multiple' THEN v_order_quantity_multiple::integer ELSE p.order_quantity_multiple END,
      updated_at = pg_catalog.now()
  WHERE p.id = v_product_id AND p.organization_id = v_org
  RETURNING pg_catalog.jsonb_build_object(
    'name_en', name_en,
    'sku', sku,
    'is_featured', is_featured,
    'sort_order', sort_order,
    'min_order_quantity', min_order_quantity,
    'order_quantity_multiple', order_quantity_multiple
  )
  INTO v_after;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'product metadata could not be persisted';
  END IF;

  v_metadata_changed := v_before IS DISTINCT FROM v_after;
  IF v_metadata_changed THEN
    INSERT INTO public.audit_logs(
      organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
    ) VALUES (
      v_org, v_actor, 'catalog.product_metadata_updated', 'product', v_product_id,
      v_before, v_after
    );
  END IF;

  RETURN coalesce(v_core_result, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'product_id', v_product_id,
      'metadata_updated', v_metadata_changed
    );
END
$function$;

REVOKE ALL ON FUNCTION public.save_admin_product_with_metadata(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_product_with_metadata(uuid, jsonb)
  TO authenticated;
COMMIT;
