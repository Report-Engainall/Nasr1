-- Atomically save editable product fields and storefront metadata through one
-- tenant-scoped audited command. Direct authenticated UPDATE on products stays revoked.
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
  o uuid := public.current_organization_id();
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
  v_sort_order_numeric numeric;
  v_min_order_quantity_numeric numeric;
  v_order_quantity_multiple_numeric numeric;
  v_sort_order integer;
  v_min_order_quantity integer;
  v_order_quantity_multiple integer;
  v_before jsonb;
  v_after jsonb;
  v_core_payload jsonb;
  v_core_result jsonb;
  v_metadata_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR o IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role IN ('admin', 'manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id = auth.uid()
         AND p.organization_id = o AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required for catalog commands';
  END IF;

  IF p_product_id IS NULL
     OR p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product id and payload object are required';
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

  IF NOT (
       p_payload ? 'name_en'
       AND p_payload ? 'sku'
       AND p_payload ? 'is_featured'
       AND p_payload ? 'sort_order'
       AND p_payload ? 'min_order_quantity'
       AND p_payload ? 'order_quantity_multiple'
     )
     OR (
       pg_catalog.jsonb_typeof(p_payload->'name_en') IS DISTINCT FROM 'string'
       AND pg_catalog.jsonb_typeof(p_payload->'name_en') IS DISTINCT FROM 'null'
     )
     OR (
       pg_catalog.jsonb_typeof(p_payload->'sku') IS DISTINCT FROM 'string'
       AND pg_catalog.jsonb_typeof(p_payload->'sku') IS DISTINCT FROM 'null'
     )
     OR pg_catalog.jsonb_typeof(p_payload->'is_featured') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(p_payload->'sort_order') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_payload->'min_order_quantity') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_payload->'order_quantity_multiple') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product metadata fields are invalid';
  END IF;

  v_name_en := NULLIF(pg_catalog.btrim(p_payload->>'name_en'), '');
  v_sku := NULLIF(pg_catalog.btrim(p_payload->>'sku'), '');
  v_is_featured := (p_payload->>'is_featured')::boolean;

  IF (v_name_en IS NOT NULL AND pg_catalog.length(v_name_en) > 240)
     OR (v_sku IS NOT NULL AND pg_catalog.length(v_sku) > 80) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product metadata field length is invalid';
  END IF;

  BEGIN
    v_sort_order_numeric := (p_payload->>'sort_order')::numeric;
    v_min_order_quantity_numeric := (p_payload->>'min_order_quantity')::numeric;
    v_order_quantity_multiple_numeric := (p_payload->>'order_quantity_multiple')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product metadata numeric fields are invalid';
  END;

  IF v_sort_order_numeric IS NULL
     OR v_sort_order_numeric <> pg_catalog.trunc(v_sort_order_numeric)
     OR v_sort_order_numeric < 0 OR v_sort_order_numeric > 1000000000
     OR v_min_order_quantity_numeric IS NULL
     OR v_min_order_quantity_numeric <> pg_catalog.trunc(v_min_order_quantity_numeric)
     OR v_min_order_quantity_numeric < 1 OR v_min_order_quantity_numeric > 10000
     OR v_order_quantity_multiple_numeric IS NULL
     OR v_order_quantity_multiple_numeric <> pg_catalog.trunc(v_order_quantity_multiple_numeric)
     OR v_order_quantity_multiple_numeric < 1 OR v_order_quantity_multiple_numeric > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product metadata numeric fields are outside the supported range';
  END IF;

  v_sort_order := v_sort_order_numeric::integer;
  v_min_order_quantity := v_min_order_quantity_numeric::integer;
  v_order_quantity_multiple := v_order_quantity_multiple_numeric::integer;

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
  WHERE p.id = p_product_id AND p.organization_id = o
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'product not found in organization';
  END IF;

  -- Reuse the canonical product/price command so expected price values, active
  -- category validation, tenant role checks and core before/after audit stay authoritative.
  v_core_payload := p_payload - v_metadata_fields;
  v_core_result := public.save_admin_catalog_product(p_product_id, v_core_payload);

  UPDATE public.products
     SET name_en = v_name_en,
         sku = v_sku,
         is_featured = v_is_featured,
         sort_order = v_sort_order,
         min_order_quantity = v_min_order_quantity,
         order_quantity_multiple = v_order_quantity_multiple
   WHERE id = p_product_id AND organization_id = o
  RETURNING pg_catalog.jsonb_build_object(
      'name_en', name_en,
      'sku', sku,
      'is_featured', is_featured,
      'sort_order', sort_order,
      'min_order_quantity', min_order_quantity,
      'order_quantity_multiple', order_quantity_multiple
    ) INTO v_after;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'product not found in organization';
  END IF;

  v_metadata_changed := v_before IS DISTINCT FROM v_after;
  IF v_metadata_changed THEN
    INSERT INTO public.audit_logs(
      organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
    ) VALUES (
      o, v_actor, 'catalog.product_metadata_updated', 'product', p_product_id,
      v_before, v_after
    );
  END IF;

  RETURN coalesce(v_core_result, '{}'::jsonb)
    || pg_catalog.jsonb_build_object('metadata_updated', v_metadata_changed);
END
$function$;

REVOKE ALL ON FUNCTION public.save_admin_product_with_metadata(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_product_with_metadata(uuid,jsonb)
  TO authenticated;
