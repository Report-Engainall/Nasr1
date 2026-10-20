-- Tenant-native audited catalog commands.
-- All customer-tier writes are delegated to the existing save_product_price_grid RPC;
-- product rows do not duplicate the tier-price storage in public.product_prices.
CREATE OR REPLACE FUNCTION public.create_admin_catalog_category(
  p_name text,
  p_parent_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_code text := NULLIF(pg_catalog.btrim(coalesce(p_code, '')), '');
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role IN('admin','manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required for catalog commands';
  END IF;

  IF pg_catalog.length(v_name) < 1 OR pg_catalog.length(v_name) > 100
     OR (v_code IS NOT NULL AND pg_catalog.length(v_code) > 64) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'category name/code length is invalid';
  END IF;

  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories AS parent
    WHERE parent.id = p_parent_id AND parent.organization_id = v_org
      AND parent.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'active parent category not found in organization';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':cat:' ||
      coalesce(p_parent_id::text, 'root') || ':' ||
      pg_catalog.lower(v_name), 0)
  );

  SELECT c.id INTO v_id
  FROM public.categories AS c
  WHERE c.organization_id = v_org
    AND c.parent_id IS NOT DISTINCT FROM p_parent_id
    AND pg_catalog.lower(pg_catalog.btrim(c.name)) = pg_catalog.lower(v_name)
    AND c.is_active = true
  ORDER BY c.id
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('id', v_id, 'name', v_name, 'created', false);
  END IF;

  INSERT INTO public.categories(organization_id, parent_id, name, code, is_active)
  VALUES (v_org, p_parent_id, v_name, v_code, true)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_org, v_actor, 'catalog.category_created', 'category', v_id,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object('name', v_name, 'parent_id', p_parent_id, 'code', v_code)
  );

  RETURN pg_catalog.jsonb_build_object('id', v_id, 'name', v_name, 'created', true);
END
$function$;

CREATE OR REPLACE FUNCTION public.save_admin_catalog_product(
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
    'expected_price_wholesale', 'expected_price_retail'
  ]::text[];
  v_unsupported_fields text;
  v_name text;
  v_item_code text;
  v_barcode text;
  v_unit text;
  v_description text;
  v_status text;
  v_category_id uuid;
  v_base_price numeric;
  v_vip_price numeric;
  v_wholesale_price numeric;
  v_retail_price numeric;
  v_expected_base_price numeric;
  v_expected_vip_price numeric;
  v_expected_wholesale_price numeric;
  v_expected_retail_price numeric;
  v_old public.products%ROWTYPE;
  v_created boolean := p_product_id IS NULL;
  v_product_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role IN('admin','manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required for catalog commands';
  END IF;

  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog payload must be a JSON object';
  END IF;

  -- Enumerate keys explicitly instead of relying on jsonb subtraction. The DETAIL
  -- records the exact rejected key(s), making allowlist failures diagnosable.
  SELECT pg_catalog.string_agg(k.key_name, ', ' ORDER BY k.key_name)
    INTO v_unsupported_fields
  FROM pg_catalog.jsonb_object_keys(p_payload) AS k(key_name)
  WHERE NOT (k.key_name = ANY (v_allowed_fields));

  IF v_unsupported_fields IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog payload contains unsupported fields',
      DETAIL = 'unsupported fields: ' || v_unsupported_fields;
  END IF;

  IF pg_catalog.jsonb_typeof(p_payload->'name') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_payload->'item_code') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_payload->'unit') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_payload->'base_price') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_payload->'price_wholesale_of_wholesale') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_payload->'price_wholesale') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_payload->'price_retail') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_payload->'status') IS DISTINCT FROM 'string'
     OR NOT (p_payload ? 'barcode')
     OR NOT (p_payload ? 'description')
     OR NOT (p_payload ? 'category_id')
     OR (pg_catalog.jsonb_typeof(p_payload->'barcode') IS DISTINCT FROM 'string'
         AND pg_catalog.jsonb_typeof(p_payload->'barcode') IS DISTINCT FROM 'null')
     OR (pg_catalog.jsonb_typeof(p_payload->'description') IS DISTINCT FROM 'string'
         AND pg_catalog.jsonb_typeof(p_payload->'description') IS DISTINCT FROM 'null')
     OR (pg_catalog.jsonb_typeof(p_payload->'category_id') IS DISTINCT FROM 'string'
         AND pg_catalog.jsonb_typeof(p_payload->'category_id') IS DISTINCT FROM 'null') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog payload is missing required fields or has invalid types';
  END IF;

  IF v_created AND (
       p_payload ? 'expected_base_price'
       OR p_payload ? 'expected_price_wholesale_of_wholesale'
       OR p_payload ? 'expected_price_wholesale'
       OR p_payload ? 'expected_price_retail'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'expected price values are only valid when editing an existing product';
  END IF;

  IF NOT v_created AND (
       pg_catalog.jsonb_typeof(p_payload->'expected_base_price') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(p_payload->'expected_price_wholesale_of_wholesale') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(p_payload->'expected_price_wholesale') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(p_payload->'expected_price_retail') IS DISTINCT FROM 'number'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product edit requires expected price values';
  END IF;

  v_name := pg_catalog.btrim(p_payload->>'name');
  v_item_code := pg_catalog.upper(pg_catalog.btrim(p_payload->>'item_code'));
  v_barcode := NULLIF(pg_catalog.btrim(p_payload->>'barcode'), '');
  v_unit := pg_catalog.btrim(p_payload->>'unit');
  v_description := NULLIF(pg_catalog.btrim(p_payload->>'description'), '');
  v_status := p_payload->>'status';

  BEGIN
    v_base_price := (p_payload->>'base_price')::numeric;
    v_vip_price := (p_payload->>'price_wholesale_of_wholesale')::numeric;
    v_wholesale_price := (p_payload->>'price_wholesale')::numeric;
    v_retail_price := (p_payload->>'price_retail')::numeric;
    IF p_payload->'category_id' <> 'null'::jsonb THEN
      v_category_id := (p_payload->>'category_id')::uuid;
    END IF;
    IF NOT v_created THEN
      v_expected_base_price := (p_payload->>'expected_base_price')::numeric;
      v_expected_vip_price := (p_payload->>'expected_price_wholesale_of_wholesale')::numeric;
      v_expected_wholesale_price := (p_payload->>'expected_price_wholesale')::numeric;
      v_expected_retail_price := (p_payload->>'expected_price_retail')::numeric;
    END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog category or price is malformed';
  END;

  IF pg_catalog.length(v_name) < 1 OR pg_catalog.length(v_name) > 200
     OR pg_catalog.length(v_item_code) < 1 OR pg_catalog.length(v_item_code) > 100
     OR pg_catalog.length(v_unit) < 1 OR pg_catalog.length(v_unit) > 40
     OR (v_barcode IS NOT NULL AND pg_catalog.length(v_barcode) > 100)
     OR (v_description IS NOT NULL AND pg_catalog.length(v_description) > 2000)
     OR v_status NOT IN ('active', 'inactive')
     OR v_base_price IS NULL OR v_vip_price IS NULL OR v_wholesale_price IS NULL OR v_retail_price IS NULL
     OR v_base_price::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_vip_price::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_wholesale_price::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_retail_price::text IN ('NaN', 'Infinity', '-Infinity')
     OR least(v_base_price, v_vip_price, v_wholesale_price, v_retail_price) < 0
     OR greatest(v_base_price, v_vip_price, v_wholesale_price, v_retail_price) > 999999999999
     OR v_base_price <> pg_catalog.round(v_base_price, 2)
     OR v_vip_price <> pg_catalog.round(v_vip_price, 2)
     OR v_wholesale_price <> pg_catalog.round(v_wholesale_price, 2)
     OR v_retail_price <> pg_catalog.round(v_retail_price, 2) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog fields or prices are invalid';
  END IF;

  IF v_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories AS c
    WHERE c.id = v_category_id AND c.organization_id = v_org AND c.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'active category not found in organization';
  END IF;

  IF NOT v_created THEN
    SELECT p.* INTO v_old
    FROM public.products AS p
    WHERE p.id = p_product_id AND p.organization_id = v_org
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002',
        MESSAGE = 'product not found in organization';
    END IF;

    v_before := pg_catalog.jsonb_build_object(
      'name', v_old.name, 'item_code', v_old.item_code, 'barcode', v_old.barcode,
      'unit', v_old.unit, 'description', v_old.description,
      'category_id', v_old.category_id, 'status', v_old.status
    );

    UPDATE public.products
       SET name = v_name,
           item_code = v_item_code,
           barcode = v_barcode,
           unit = v_unit,
           description = v_description,
           category_id = v_category_id,
           status = v_status,
           updated_at = pg_catalog.now()
     WHERE id = p_product_id AND organization_id = v_org;

    v_product_id := p_product_id;
  ELSE
    INSERT INTO public.products(
      organization_id, category_id, name, item_code, barcode, description, unit, status
    )
    VALUES (
      v_org, v_category_id, v_name, v_item_code, v_barcode, v_description, v_unit, v_status
    )
    RETURNING id INTO v_product_id;

    v_before := '{}'::jsonb;
  END IF;

  -- Use the established price-grid contract for both creation and edits. The
  -- price-grid RPC alone performs optimistic concurrency checks, writes base_price
  -- plus public.product_prices tiers, and records price-change audit events.
  IF v_created THEN
    SELECT g.base_price, g.price_wholesale_of_wholesale, g.price_wholesale, g.price_retail
      INTO v_expected_base_price, v_expected_vip_price, v_expected_wholesale_price, v_expected_retail_price
    FROM public.get_admin_product_price_grid() AS g
    WHERE g.id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002',
        MESSAGE = 'new product is missing from the admin price grid';
    END IF;
  END IF;

  BEGIN
    PERFORM public.save_product_price_grid(
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_product_id,
          'expected_base_price', v_expected_base_price,
          'expected_price_wholesale_of_wholesale', v_expected_vip_price,
          'expected_price_wholesale', v_expected_wholesale_price,
          'expected_price_retail', v_expected_retail_price,
          'base_price', v_base_price,
          'price_wholesale_of_wholesale', v_vip_price,
          'price_wholesale', v_wholesale_price,
          'price_retail', v_retail_price
        )
      )
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'product prices changed after the form opened; reload before saving';
  END;

  v_after := pg_catalog.jsonb_build_object(
    'name', v_name, 'item_code', v_item_code, 'barcode', v_barcode,
    'unit', v_unit, 'description', v_description,
    'category_id', v_category_id, 'status', v_status
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_org, v_actor,
    CASE WHEN v_created THEN 'catalog.product_created' ELSE 'catalog.product_updated' END,
    'product', v_product_id, v_before, v_after
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_product_id, 'status', v_status, 'created', v_created
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.archive_admin_catalog_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_old public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role IN('admin','manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required for catalog commands';
  END IF;

  SELECT p.* INTO v_old
  FROM public.products AS p
  WHERE p.id = p_product_id AND p.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'product not found in organization';
  END IF;

  IF v_old.status <> 'inactive' THEN
    UPDATE public.products
       SET status='inactive', updated_at = pg_catalog.now()
     WHERE id = p_product_id AND organization_id = v_org;

    INSERT INTO public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
    ) VALUES (
      v_org, v_actor, 'catalog.product_archived', 'product', p_product_id,
      pg_catalog.jsonb_build_object('status', v_old.status),
      pg_catalog.jsonb_build_object('status', 'inactive')
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object('id', p_product_id, 'status', 'inactive', 'archived', true);
END
$function$;

CREATE OR REPLACE FUNCTION public.archive_admin_catalog_category(p_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_old public.categories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role IN('admin','manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required for catalog commands';
  END IF;

  SELECT c.* INTO v_old
  FROM public.categories AS c
  WHERE c.id = p_category_id AND c.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'category not found in organization';
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.products AS p
       WHERE p.organization_id = v_org AND p.category_id = p_category_id AND p.status = 'active'
     )
     OR EXISTS (
       SELECT 1 FROM public.categories AS child
       WHERE child.organization_id = v_org AND child.parent_id = p_category_id AND child.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = 'category has active products or child categories; reassign or archive them first';
  END IF;

  IF v_old.is_active THEN
    UPDATE public.categories SET is_active = false
    WHERE id = p_category_id AND organization_id = v_org;

    INSERT INTO public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
    ) VALUES (
      v_org, v_actor, 'catalog.category_archived', 'category', p_category_id,
      pg_catalog.jsonb_build_object('name', v_old.name, 'code', v_old.code, 'is_active', true),
      pg_catalog.jsonb_build_object('name', v_old.name, 'code', v_old.code, 'is_active', false)
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object('id', p_category_id, 'is_active', false, 'archived', true);
END
$function$;

REVOKE ALL ON FUNCTION public.create_admin_catalog_category(text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_admin_catalog_category(text,uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.save_admin_catalog_product(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_admin_catalog_product(uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.archive_admin_catalog_product(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.archive_admin_catalog_product(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.archive_admin_catalog_category(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.archive_admin_catalog_category(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_catalog_category(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_catalog_product(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_admin_catalog_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_admin_catalog_category(uuid) TO authenticated;
