BEGIN;

-- Tenant-owned product brand identity. Client roles never read or mutate these tables directly.
CREATE TABLE IF NOT EXISTS public.product_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  name_en text CHECK (name_en IS NULL OR length(btrim(name_en)) <= 120),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_brands_org_name_uidx
  ON public.product_brands (organization_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS product_brands_active_lookup_idx
  ON public.product_brands (organization_id, is_active, lower(name));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id uuid;

-- A composite key makes it impossible to attach a brand from another organization.
CREATE UNIQUE INDEX IF NOT EXISTS products_id_organization_uidx
  ON public.products (id, organization_id);

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_brand_organization_fk'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_brand_organization_fk
      FOREIGN KEY (brand_id, organization_id)
      REFERENCES public.product_brands (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END
$block$;

CREATE INDEX IF NOT EXISTS products_brand_id_idx
  ON public.products (organization_id, brand_id)
  WHERE brand_id IS NOT NULL;

-- Only facts explicitly verified by an active catalog manager are projected publicly.
-- carton_unit_name references the existing product_unit_conversions contract; units_per_carton
-- is derived from that exact conversion row and is never stored a second time.
CREATE TABLE IF NOT EXISTS public.product_storefront_details (
  product_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  country_of_origin_code text,
  origin_verified_at timestamptz,
  origin_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  specifications_verified_at timestamptz,
  specifications_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  package_size_value numeric(14,3),
  package_size_unit text,
  carton_unit_name text,
  packaging_verified_at timestamptz,
  packaging_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_storefront_details_tenant_product_fk
    FOREIGN KEY (product_id, organization_id)
    REFERENCES public.products (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT product_storefront_origin_code_check
    CHECK (country_of_origin_code IS NULL OR country_of_origin_code ~ '^[A-Z]{2}$'),
  CONSTRAINT product_storefront_origin_verified_check
    CHECK (origin_verified_at IS NULL OR country_of_origin_code IS NOT NULL),
  CONSTRAINT product_storefront_specs_array_check
    CHECK (pg_catalog.jsonb_typeof(specifications) = 'array'
      AND pg_catalog.jsonb_array_length(specifications) <= 50),
  CONSTRAINT product_storefront_package_pair_check
    CHECK ((package_size_value IS NULL AND package_size_unit IS NULL)
      OR (package_size_value > 0 AND package_size_unit IS NOT NULL
        AND length(btrim(package_size_unit)) BETWEEN 1 AND 40)),
  CONSTRAINT product_storefront_package_size_check
    CHECK (package_size_value IS NULL OR
      (package_size_value::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND package_size_value > 0 AND package_size_value <= 1000000)),
  CONSTRAINT product_storefront_carton_name_check
    CHECK (carton_unit_name IS NULL OR length(btrim(carton_unit_name)) BETWEEN 1 AND 40),
  CONSTRAINT product_storefront_packaging_verified_check
    CHECK (packaging_verified_at IS NULL OR
      package_size_value IS NOT NULL OR carton_unit_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS product_storefront_details_org_idx
  ON public.product_storefront_details (organization_id, product_id);

-- Explicit, tenant-safe recommendations. Similar-category products are not treated as
-- alternatives or complements; a manager must create and publish each relationship.
CREATE TABLE IF NOT EXISTS public.product_storefront_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_product_id uuid NOT NULL,
  target_product_id uuid NOT NULL,
  relation_type text NOT NULL CHECK (relation_type IN ('alternative', 'complementary')),
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_storefront_relations_not_self_check
    CHECK (source_product_id <> target_product_id),
  CONSTRAINT product_storefront_relations_source_tenant_fk
    FOREIGN KEY (source_product_id, organization_id)
    REFERENCES public.products (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT product_storefront_relations_target_tenant_fk
    FOREIGN KEY (target_product_id, organization_id)
    REFERENCES public.products (id, organization_id)
    ON DELETE CASCADE,
  UNIQUE (organization_id, source_product_id, target_product_id, relation_type)
);
CREATE INDEX IF NOT EXISTS product_storefront_relations_public_lookup_idx
  ON public.product_storefront_relations
    (organization_id, source_product_id, relation_type, sort_order)
  WHERE is_published = true;

ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_storefront_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_storefront_relations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_brands FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_storefront_details FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_storefront_relations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.product_brands TO service_role;
GRANT ALL ON TABLE public.product_storefront_details TO service_role;
GRANT ALL ON TABLE public.product_storefront_relations TO service_role;

CREATE OR REPLACE FUNCTION public.get_admin_storefront_product_details(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_result jsonb;
  v_alternatives jsonb;
  v_complements jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = v_actor AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.profile_id = v_actor AND r.role IN ('admin', 'manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required';
  END IF;

  IF p_product_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.organization_id = v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'product not found in organization';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'target_product_id', r.target_product_id,
        'is_published', r.is_published,
        'sort_order', r.sort_order
      )
      ORDER BY r.sort_order, t.name, r.target_product_id
    ), '[]'::jsonb
  )
  INTO v_alternatives
  FROM public.product_storefront_relations r
  JOIN public.products t
    ON t.id = r.target_product_id AND t.organization_id = r.organization_id
  WHERE r.organization_id = v_org
    AND r.source_product_id = p_product_id
    AND r.relation_type = 'alternative';

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'target_product_id', r.target_product_id,
        'is_published', r.is_published,
        'sort_order', r.sort_order
      )
      ORDER BY r.sort_order, t.name, r.target_product_id
    ), '[]'::jsonb
  )
  INTO v_complements
  FROM public.product_storefront_relations r
  JOIN public.products t
    ON t.id = r.target_product_id AND t.organization_id = r.organization_id
  WHERE r.organization_id = v_org
    AND r.source_product_id = p_product_id
    AND r.relation_type = 'complementary';

  SELECT pg_catalog.jsonb_build_object(
    'product_id', p.id,
    'brand_name', b.name,
    'brand_name_en', b.name_en,
    'country_of_origin_code', d.country_of_origin_code,
    'origin_verified', d.origin_verified_at IS NOT NULL,
    'specifications', COALESCE(d.specifications, '[]'::jsonb),
    'specifications_verified', d.specifications_verified_at IS NOT NULL,
    'package_size_value', d.package_size_value,
    'package_size_unit', d.package_size_unit,
    'carton_unit_name', d.carton_unit_name,
    'packaging_verified', d.packaging_verified_at IS NOT NULL,
    'alternatives', COALESCE(v_alternatives, '[]'::jsonb),
    'complements', COALESCE(v_complements, '[]'::jsonb)
  )
  INTO v_result
  FROM public.products p
  LEFT JOIN public.product_brands b
    ON b.id = p.brand_id AND b.organization_id = p.organization_id
  LEFT JOIN public.product_storefront_details d
    ON d.product_id = p.id AND d.organization_id = p.organization_id
  WHERE p.id = p_product_id AND p.organization_id = v_org;

  RETURN COALESCE(v_result, pg_catalog.jsonb_build_object(
    'product_id', p_product_id,
    'brand_name', NULL,
    'brand_name_en', NULL,
    'country_of_origin_code', NULL,
    'origin_verified', false,
    'specifications', '[]'::jsonb,
    'specifications_verified', false,
    'package_size_value', NULL,
    'package_size_unit', NULL,
    'carton_unit_name', NULL,
    'packaging_verified', false,
    'alternatives', '[]'::jsonb,
    'complements', '[]'::jsonb
  ));
END
$function$;

CREATE OR REPLACE FUNCTION public.save_admin_storefront_product_details(
  p_product_id uuid,
  p_brand_name text DEFAULT NULL,
  p_brand_name_en text DEFAULT NULL,
  p_country_of_origin_code text DEFAULT NULL,
  p_origin_verified boolean DEFAULT false,
  p_specifications jsonb DEFAULT '[]'::jsonb,
  p_specifications_verified boolean DEFAULT false,
  p_package_size_value numeric DEFAULT NULL,
  p_package_size_unit text DEFAULT NULL,
  p_carton_unit_name text DEFAULT NULL,
  p_packaging_verified boolean DEFAULT false,
  p_relations jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_product_status text;
  v_brand_name text;
  v_brand_name_en text;
  v_brand_id uuid;
  v_origin_code text;
  v_spec jsonb;
  v_spec_name text;
  v_spec_value text;
  v_spec_unit text;
  v_spec_names text[] := ARRAY[]::text[];
  v_normalized_specs jsonb := '[]'::jsonb;
  v_relation jsonb;
  v_target_id uuid;
  v_relation_type text;
  v_is_published boolean;
  v_seen_relations text[] := ARRAY[]::text[];
  v_normalized_relations jsonb := '[]'::jsonb;
  v_relation_key text;
  v_sort_order integer := 0;
  v_carton_unit_name text;
  v_old_value jsonb;
  v_new_value jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_units_per_carton integer;
  v_brand_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = v_actor AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.profile_id = v_actor AND r.role IN ('admin', 'manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required';
  END IF;

  IF p_product_id IS NULL
     OR p_specifications IS NULL
     OR pg_catalog.jsonb_typeof(p_specifications) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_specifications) > 50
     OR p_relations IS NULL
     OR pg_catalog.jsonb_typeof(p_relations) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_relations) > 40
     OR p_origin_verified IS NULL
     OR p_specifications_verified IS NULL
     OR p_packaging_verified IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'invalid product details payload';
  END IF;

  SELECT p.status
    INTO v_product_status
  FROM public.products p
  WHERE p.id = p_product_id AND p.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'product is not available in the active organization';
  END IF;

  v_brand_name := NULLIF(pg_catalog.btrim(p_brand_name), '');
  v_brand_name_en := NULLIF(pg_catalog.btrim(p_brand_name_en), '');
  IF v_brand_name IS NOT NULL AND pg_catalog.char_length(v_brand_name) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'brand name is too long';
  END IF;
  IF v_brand_name_en IS NOT NULL AND pg_catalog.char_length(v_brand_name_en) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'English brand name is too long';
  END IF;
  IF v_brand_name IS NULL AND v_brand_name_en IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'brand English name requires a brand name';
  END IF;

  IF v_brand_name IS NOT NULL THEN
    INSERT INTO public.product_brands (
      organization_id, name, name_en, is_active, created_by, created_at, updated_at
    ) VALUES (
      v_org, v_brand_name, v_brand_name_en, true, v_actor, v_now, v_now
    )
    ON CONFLICT (organization_id, (lower(btrim(name))))
    DO UPDATE SET
      name_en = COALESCE(EXCLUDED.name_en, public.product_brands.name_en),
      is_active = true,
      updated_at = EXCLUDED.updated_at;

    SELECT b.id INTO v_brand_id
    FROM public.product_brands b
    WHERE b.organization_id = v_org
      AND lower(btrim(b.name)) = lower(v_brand_name)
      AND b.is_active = true
    FOR UPDATE;
    IF v_brand_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001',
        MESSAGE = 'brand changed while product details were being saved';
    END IF;
  END IF;

  v_origin_code := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_country_of_origin_code)), '');
  IF v_origin_code IS NOT NULL AND v_origin_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'country of origin must be a two-letter ISO country code';
  END IF;
  IF p_origin_verified AND v_origin_code IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'a country code is required before verifying origin';
  END IF;

  FOR v_spec IN
    SELECT value FROM pg_catalog.jsonb_array_elements(p_specifications)
  LOOP
    IF pg_catalog.jsonb_typeof(v_spec) IS DISTINCT FROM 'object'
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_object_keys(v_spec) AS k(key_name)
         WHERE key_name NOT IN ('name', 'value', 'unit')
       )
       OR pg_catalog.jsonb_typeof(v_spec->'name') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_spec->'value') IS DISTINCT FROM 'string'
       OR (v_spec ? 'unit' AND pg_catalog.jsonb_typeof(v_spec->'unit') NOT IN ('string', 'null')) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'each product specification requires only name, value and optional unit';
    END IF;

    v_spec_name := pg_catalog.btrim(v_spec->>'name');
    v_spec_value := pg_catalog.btrim(v_spec->>'value');
    v_spec_unit := NULLIF(pg_catalog.btrim(v_spec->>'unit'), '');
    IF v_spec_name = '' OR pg_catalog.char_length(v_spec_name) > 60
       OR v_spec_value = '' OR pg_catalog.char_length(v_spec_value) > 200
       OR (v_spec_unit IS NOT NULL AND pg_catalog.char_length(v_spec_unit) > 40) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'product specification name, value or unit is outside the supported range';
    END IF;
    IF lower(v_spec_name) = ANY(v_spec_names) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'product specification names must be unique';
    END IF;
    v_spec_names := pg_catalog.array_append(v_spec_names, lower(v_spec_name));
    v_normalized_specs := v_normalized_specs || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'name', v_spec_name,
        'value', v_spec_value,
        'unit', v_spec_unit
      )
    );
  END LOOP;

  IF p_specifications_verified AND pg_catalog.jsonb_array_length(v_normalized_specs) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'at least one specification is required before verifying specifications';
  END IF;

  IF p_package_size_value IS NULL AND p_package_size_unit IS NOT NULL
     OR p_package_size_value IS NOT NULL AND p_package_size_unit IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'package size value and unit must be provided together';
  END IF;
  IF p_package_size_value IS NOT NULL AND (
       p_package_size_value::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_package_size_value <= 0 OR p_package_size_value > 1000000
       OR p_package_size_value <> pg_catalog.round(p_package_size_value, 3)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'package size must be a positive finite value up to one million';
  END IF;
  IF p_package_size_unit IS NOT NULL
     AND pg_catalog.char_length(pg_catalog.btrim(p_package_size_unit)) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'package size unit is outside the supported range';
  END IF;

  v_carton_unit_name := NULLIF(pg_catalog.btrim(p_carton_unit_name), '');
  v_units_per_carton := NULL;
  IF v_carton_unit_name IS NOT NULL THEN
    SELECT u.base_units_per_unit
      INTO v_units_per_carton
    FROM public.product_unit_conversions u
    WHERE u.organization_id = v_org
      AND u.product_id = p_product_id
      AND lower(u.unit_name) = lower(v_carton_unit_name);
    IF v_units_per_carton IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'carton unit must match a saved product unit conversion';
    END IF;
  END IF;
  IF p_packaging_verified
     AND p_package_size_value IS NULL
     AND v_carton_unit_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'package size or a saved carton unit is required before verifying packaging';
  END IF;

  FOR v_relation IN
    SELECT value FROM pg_catalog.jsonb_array_elements(p_relations)
  LOOP
    IF pg_catalog.jsonb_typeof(v_relation) IS DISTINCT FROM 'object'
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_object_keys(v_relation) AS k(key_name)
         WHERE key_name NOT IN ('target_product_id', 'relation_type', 'is_published')
       )
       OR pg_catalog.jsonb_typeof(v_relation->'target_product_id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_relation->'relation_type') IS DISTINCT FROM 'string'
       OR (v_relation ? 'is_published'
         AND pg_catalog.jsonb_typeof(v_relation->'is_published') IS DISTINCT FROM 'boolean') THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'each product relation requires a target id, relation type and optional published flag';
    END IF;

    BEGIN
      v_target_id := (v_relation->>'target_product_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'product relation target id is invalid';
    END;

    v_relation_type := v_relation->>'relation_type';
    v_is_published := COALESCE((v_relation->>'is_published')::boolean, false);
    IF v_target_id = p_product_id
       OR v_relation_type NOT IN ('alternative', 'complementary') THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'product relation target or type is invalid';
    END IF;
    v_relation_key := v_target_id::text || ':' || v_relation_type;
    IF v_relation_key = ANY(v_seen_relations) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'duplicate product relation';
    END IF;
    v_seen_relations := pg_catalog.array_append(v_seen_relations, v_relation_key);

    IF NOT EXISTS (
      SELECT 1 FROM public.products target
      WHERE target.id = v_target_id AND target.organization_id = v_org
        AND (NOT v_is_published OR target.status = 'active')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'published recommendations must target an active product in the same organization';
    END IF;
    IF v_is_published AND v_product_status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'inactive products cannot publish recommendations';
    END IF;

    v_normalized_relations := v_normalized_relations || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'target_product_id', v_target_id,
        'relation_type', v_relation_type,
        'is_published', v_is_published,
        'sort_order', v_sort_order
      )
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;

  SELECT pg_catalog.jsonb_build_object(
    'brand_id', p.brand_id,
    'details', COALESCE((
      SELECT pg_catalog.jsonb_build_object(
        'country_of_origin_code', d.country_of_origin_code,
        'origin_verified', d.origin_verified_at IS NOT NULL,
        'specifications', d.specifications,
        'specifications_verified', d.specifications_verified_at IS NOT NULL,
        'package_size_value', d.package_size_value,
        'package_size_unit', d.package_size_unit,
        'carton_unit_name', d.carton_unit_name,
        'packaging_verified', d.packaging_verified_at IS NOT NULL
      )
      FROM public.product_storefront_details d
      WHERE d.product_id = p.id AND d.organization_id = v_org
    ), '{}'::jsonb),
    'relations', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'target_product_id', r.target_product_id,
          'relation_type', r.relation_type,
          'is_published', r.is_published,
          'sort_order', r.sort_order
        ) ORDER BY r.relation_type, r.sort_order, r.target_product_id
      )
      FROM public.product_storefront_relations r
      WHERE r.organization_id = v_org AND r.source_product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_old_value
  FROM public.products p
  WHERE p.id = p_product_id AND p.organization_id = v_org;

  INSERT INTO public.product_storefront_details (
    product_id, organization_id,
    country_of_origin_code, origin_verified_at, origin_verified_by,
    specifications, specifications_verified_at, specifications_verified_by,
    package_size_value, package_size_unit, carton_unit_name,
    packaging_verified_at, packaging_verified_by, created_at, updated_at
  ) VALUES (
    p_product_id, v_org,
    v_origin_code,
    CASE WHEN p_origin_verified THEN v_now ELSE NULL END,
    CASE WHEN p_origin_verified THEN v_actor ELSE NULL END,
    v_normalized_specs,
    CASE WHEN p_specifications_verified THEN v_now ELSE NULL END,
    CASE WHEN p_specifications_verified THEN v_actor ELSE NULL END,
    p_package_size_value,
    NULLIF(pg_catalog.btrim(p_package_size_unit), ''),
    v_carton_unit_name,
    CASE WHEN p_packaging_verified THEN v_now ELSE NULL END,
    CASE WHEN p_packaging_verified THEN v_actor ELSE NULL END,
    v_now, v_now
  )
  ON CONFLICT (product_id)
  DO UPDATE SET
    country_of_origin_code = EXCLUDED.country_of_origin_code,
    origin_verified_at = EXCLUDED.origin_verified_at,
    origin_verified_by = EXCLUDED.origin_verified_by,
    specifications = EXCLUDED.specifications,
    specifications_verified_at = EXCLUDED.specifications_verified_at,
    specifications_verified_by = EXCLUDED.specifications_verified_by,
    package_size_value = EXCLUDED.package_size_value,
    package_size_unit = EXCLUDED.package_size_unit,
    carton_unit_name = EXCLUDED.carton_unit_name,
    packaging_verified_at = EXCLUDED.packaging_verified_at,
    packaging_verified_by = EXCLUDED.packaging_verified_by,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.products p
     SET brand_id = v_brand_id,
         updated_at = v_now
   WHERE p.id = p_product_id AND p.organization_id = v_org;

  DELETE FROM public.product_storefront_relations r
   WHERE r.organization_id = v_org AND r.source_product_id = p_product_id;

  INSERT INTO public.product_storefront_relations (
    organization_id, source_product_id, target_product_id, relation_type,
    is_published, sort_order, created_by, updated_by, created_at, updated_at
  )
  SELECT
    v_org, p_product_id,
    (item->>'target_product_id')::uuid,
    item->>'relation_type',
    (item->>'is_published')::boolean,
    (item->>'sort_order')::integer,
    v_actor, v_actor, v_now, v_now
  FROM pg_catalog.jsonb_array_elements(v_normalized_relations) item;

  SELECT pg_catalog.jsonb_build_object(
    'brand_id', p.brand_id,
    'details', pg_catalog.jsonb_build_object(
      'country_of_origin_code', d.country_of_origin_code,
      'origin_verified', d.origin_verified_at IS NOT NULL,
      'specifications', d.specifications,
      'specifications_verified', d.specifications_verified_at IS NOT NULL,
      'package_size_value', d.package_size_value,
      'package_size_unit', d.package_size_unit,
      'carton_unit_name', d.carton_unit_name,
      'packaging_verified', d.packaging_verified_at IS NOT NULL
    ),
    'relations', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'target_product_id', r.target_product_id,
          'relation_type', r.relation_type,
          'is_published', r.is_published,
          'sort_order', r.sort_order
        ) ORDER BY r.relation_type, r.sort_order, r.target_product_id
      )
      FROM public.product_storefront_relations r
      WHERE r.organization_id = v_org AND r.source_product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_new_value
  FROM public.products p
  JOIN public.product_storefront_details d
    ON d.product_id = p.id AND d.organization_id = p.organization_id
  WHERE p.id = p_product_id AND p.organization_id = v_org;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_actor, 'catalog.product_storefront_details_saved',
    'product', p_product_id, v_old_value, v_new_value
  );

  RETURN pg_catalog.jsonb_build_object(
    'product_id', p_product_id,
    'brand_id', v_brand_id,
    'relations_saved', pg_catalog.jsonb_array_length(v_normalized_relations),
    'changed', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_admin_storefront_product_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_storefront_product_details(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_admin_storefront_product_details(uuid,text,text,text,boolean,jsonb,boolean,numeric,text,text,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_storefront_product_details(uuid,text,text,text,boolean,jsonb,boolean,numeric,text,text,boolean,jsonb) TO authenticated;

-- Keep base catalog mutation and public product-fact mutation in one RPC transaction.
-- This avoids a successful product write followed by a silently partial detail write.
CREATE OR REPLACE FUNCTION public.save_admin_catalog_product_with_storefront_details(
  p_product_id uuid,
  p_catalog_payload jsonb,
  p_storefront_details jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_product jsonb;
  v_details jsonb;
  v_saved_product_id uuid;
BEGIN
  IF p_catalog_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_catalog_payload) IS DISTINCT FROM 'object'
     OR p_storefront_details IS NULL
     OR pg_catalog.jsonb_typeof(p_storefront_details) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog and storefront detail objects are required';
  END IF;

  v_product := public.save_admin_product_with_metadata(p_product_id, p_catalog_payload);
  v_saved_product_id := NULLIF(v_product->>'id', '')::uuid;
  IF v_saved_product_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'catalog save did not return a product identity';
  END IF;

  v_details := public.save_admin_storefront_product_details(
    v_saved_product_id,
    NULLIF(p_storefront_details->>'brand_name', ''),
    NULLIF(p_storefront_details->>'brand_name_en', ''),
    NULLIF(p_storefront_details->>'country_of_origin_code', ''),
    COALESCE((p_storefront_details->>'origin_verified')::boolean, false),
    COALESCE(p_storefront_details->'specifications', '[]'::jsonb),
    COALESCE((p_storefront_details->>'specifications_verified')::boolean, false),
    NULLIF(p_storefront_details->>'package_size_value', '')::numeric,
    NULLIF(p_storefront_details->>'package_size_unit', ''),
    NULLIF(p_storefront_details->>'carton_unit_name', ''),
    COALESCE((p_storefront_details->>'packaging_verified')::boolean, false),
    COALESCE(p_storefront_details->'relations', '[]'::jsonb)
  );

  RETURN pg_catalog.jsonb_build_object(
    'product', v_product,
    'storefront_details', v_details
  );
END
$function$;

REVOKE ALL ON FUNCTION public.save_admin_catalog_product_with_storefront_details(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_catalog_product_with_storefront_details(uuid, jsonb, jsonb)
  TO authenticated;
COMMENT ON FUNCTION public.save_admin_catalog_product_with_storefront_details(uuid, jsonb, jsonb) IS
  'Atomically saves the standard admin product fields and its tenant-scoped brand, verified facts, packaging and explicit recommendations. Both underlying commands enforce their own admin/manager role and tenant checks; any failure rolls back the complete RPC transaction.';

-- Replace the public catalogue RPC in place. Keep its existing name and tenant/price resolver,
-- adding conjunctive server-side filters and only explicit, same-tenant verified product facts.
DROP FUNCTION public.get_storefront_catalog_page(text, uuid, integer, integer, boolean);

CREATE FUNCTION public.get_storefront_catalog_page(
  p_search text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 24,
  p_available_only boolean DEFAULT false,
  p_brand_id uuid DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_price_displayable_only boolean DEFAULT false,
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_context jsonb;
  v_organization_id uuid;
  v_warehouse_id uuid;
  v_is_staff boolean := false;
  v_can_view_internal_price boolean := false;
  v_show_customer_price boolean := true;
  v_price_displayable boolean := false;
  v_search text;
  v_search_compact text;
  v_unit text;
  v_page integer := COALESCE(p_page, 1);
  v_page_size integer := COALESCE(p_page_size, 24);
  v_offset integer;
  v_total_count bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_brand_options jsonb := '[]'::jsonb;
  v_unit_options jsonb := '[]'::jsonb;
BEGIN
  IF v_page < 1 OR v_page > 100000
     OR v_page_size < 1 OR v_page_size > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog page must be 1..100000 and page size 1..100';
  END IF;
  IF pg_catalog.length(COALESCE(p_search, '')) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog search is limited to 120 characters';
  END IF;
  IF p_available_only IS NULL OR p_price_displayable_only IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog boolean filters must be explicit';
  END IF;
  IF p_unit IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(p_unit)) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'catalog unit filter is outside the supported range';
  END IF;

  IF auth.uid() IS NULL THEN
    v_context := public.get_public_storefront_context();
  ELSE
    v_context := public.get_current_tenant_context();
  END IF;

  v_organization_id := NULLIF(v_context->>'organization_id', '')::uuid;
  v_warehouse_id := NULLIF(v_context->>'warehouse_id', '')::uuid;
  v_is_staff := COALESCE(NULLIF(v_context->>'is_staff', '')::boolean, false);
  v_can_view_internal_price := COALESCE(
    NULLIF(v_context->>'can_view_internal_product_prices', '')::boolean, false
  );

  IF v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = v_organization_id AND o.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active storefront organization is required';
  END IF;

  SELECT CASE
    WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
      THEN (s.value #>> '{}')::boolean
    ELSE true
  END
  INTO v_show_customer_price
  FROM public.admin_settings s
  WHERE s.organization_id = v_organization_id
    AND s.key = 'show_price_on_cards';
  v_show_customer_price := COALESCE(v_show_customer_price, true);

  -- This is derived from the caller's effective visibility policy, not from the
  -- existence or amount of any product/tier price row. Counts cannot reveal another tier.
  v_price_displayable := CASE
    WHEN v_is_staff THEN v_can_view_internal_price
    ELSE v_show_customer_price
  END;

  v_search := pg_catalog.btrim(public.normalize_storefront_catalog_search(p_search));
  v_search_compact := pg_catalog.regexp_replace(v_search, '[[:space:]]+', '', 'g');
  v_unit := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_unit)), '');
  v_offset := (v_page - 1) * v_page_size;

  -- Filter choices come from every active product in this tenant, not the current page.
  -- They never include an inactive brand, a product from another tenant, or internal values.
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', f.id, 'name', f.name, 'name_en', f.name_en)
      ORDER BY f.name, f.id
    ),
    '[]'::jsonb
  )
  INTO v_brand_options
  FROM (
    SELECT DISTINCT b.id, b.name, b.name_en
    FROM public.product_brands b
    JOIN public.products p
      ON p.brand_id = b.id
     AND p.organization_id = b.organization_id
     AND p.status = 'active'
    WHERE b.organization_id = v_organization_id
      AND b.is_active = true
  ) f;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(u.unit_name ORDER BY pg_catalog.lower(u.unit_name), u.unit_name),
    '[]'::jsonb
  )
  INTO v_unit_options
  FROM (
    SELECT DISTINCT pg_catalog.btrim(p.unit) AS unit_name
    FROM public.products p
    WHERE p.organization_id = v_organization_id
      AND p.status = 'active'
      AND pg_catalog.btrim(p.unit) <> ''
    UNION
    SELECT DISTINCT pg_catalog.btrim(c.unit_name) AS unit_name
    FROM public.product_unit_conversions c
    JOIN public.products p
      ON p.id = c.product_id
     AND p.organization_id = c.organization_id
    WHERE p.organization_id = v_organization_id
      AND p.status = 'active'
      AND pg_catalog.btrim(c.unit_name) <> ''
  ) u;

  WITH matched AS MATERIALIZED (
    SELECT
      p.id, p.organization_id, p.category_id, p.brand_id,
      b.name AS brand_name, b.name_en AS brand_name_en,
      p.name, p.name_en, p.item_code, p.sku, p.barcode, p.description,
      p.unit, p.image_url, p.status, p.created_at, p.updated_at,
      p.min_order_quantity, p.order_quantity_multiple,
      p.is_featured, p.sort_order,
      d.country_of_origin_code,
      d.origin_verified_at,
      d.specifications,
      d.specifications_verified_at,
      d.package_size_value,
      d.package_size_unit,
      d.carton_unit_name,
      d.packaging_verified_at,
      carton.base_units_per_unit AS units_per_carton,
      COALESCE(inv.quantity_available, 0)::numeric AS quantity_available
    FROM public.products p
    LEFT JOIN public.product_brands b
      ON b.id = p.brand_id
     AND b.organization_id = p.organization_id
     AND b.is_active = true
    LEFT JOIN public.product_storefront_details d
      ON d.product_id = p.id
     AND d.organization_id = p.organization_id
    LEFT JOIN LATERAL (
      SELECT u.base_units_per_unit
      FROM public.product_unit_conversions u
      WHERE u.organization_id = p.organization_id
        AND u.product_id = p.id
        AND d.carton_unit_name IS NOT NULL
        AND lower(u.unit_name) = lower(d.carton_unit_name)
      LIMIT 1
    ) carton ON true
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
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_brand_id IS NULL OR (
        p.brand_id = p_brand_id
        AND b.id IS NOT NULL
      ))
      AND (v_unit IS NULL OR lower(p.unit) = v_unit OR EXISTS (
        SELECT 1
        FROM public.product_unit_conversions u
        WHERE u.organization_id = p.organization_id
          AND u.product_id = p.id
          AND lower(u.unit_name) = v_unit
      ))
      AND (NOT p_price_displayable_only OR v_price_displayable)
      AND (NOT p_available_only OR (
        v_warehouse_id IS NOT NULL
        AND COALESCE(inv.quantity_available, 0) > 0
      ))
      AND (
        v_search = ''
        OR pg_catalog.regexp_replace(
          public.normalize_storefront_catalog_search(p.item_code),
          '[[:space:]]+', '', 'g'
        ) LIKE v_search_compact || '%'
        OR pg_catalog.regexp_replace(
          public.normalize_storefront_catalog_search(COALESCE(p.sku, '')),
          '[[:space:]]+', '', 'g'
        ) LIKE v_search_compact || '%'
        OR pg_catalog.regexp_replace(
          public.normalize_storefront_catalog_search(COALESCE(p.barcode, '')),
          '[[:space:]]+', '', 'g'
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
                  public.normalize_storefront_catalog_search(COALESCE(p.name_en, '')),
                  '[[:space:]]+'
                ) AS n(token)
                WHERE public.storefront_catalog_token_matches(n.token, q.token)
              )
              OR EXISTS (
                SELECT 1
                FROM pg_catalog.regexp_split_to_table(
                  public.normalize_storefront_catalog_search(COALESCE(p.description, '')),
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
    ORDER BY is_featured DESC, sort_order ASC, name, id
    OFFSET v_offset
    LIMIT v_page_size
  ),
  page_prices AS (
    SELECT prices.product_id, prices.unit_price
    FROM public.get_storefront_product_prices(
      CASE
        WHEN v_is_staff AND NOT v_can_view_internal_price THEN ARRAY[]::uuid[]
        ELSE (SELECT pg_catalog.array_agg(id) FROM page_rows)
      END,
      1
    ) AS prices
    UNION ALL
    SELECT r.id AS product_id, NULL::numeric(15,2) AS unit_price
    FROM page_rows r
    WHERE v_is_staff AND NOT v_can_view_internal_price
  )
  SELECT
    (SELECT pg_catalog.count(*)::bigint FROM matched),
    COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          (
            pg_catalog.jsonb_build_object(
              'id', r.id,
              'category_id', r.category_id,
              'brand_id', r.brand_id,
              'brand', CASE WHEN r.brand_name IS NOT NULL THEN
                pg_catalog.jsonb_build_object(
                  'id', r.brand_id,
                  'name', r.brand_name,
                  'name_en', r.brand_name_en
                )
                ELSE NULL
              END,
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
              'updated_at', GREATEST(r.updated_at, COALESCE(r.updated_at, r.created_at)),
              'country_of_origin_code',
                CASE WHEN r.origin_verified_at IS NOT NULL THEN r.country_of_origin_code ELSE NULL END,
              'specifications',
                CASE WHEN r.specifications_verified_at IS NOT NULL
                  THEN COALESCE(r.specifications, '[]'::jsonb)
                  ELSE '[]'::jsonb
                END,
              'packaging',
                CASE WHEN r.packaging_verified_at IS NOT NULL THEN
                  pg_catalog.jsonb_build_object(
                    'package_size_value', r.package_size_value,
                    'package_size_unit', r.package_size_unit,
                    'carton_unit_name', r.carton_unit_name,
                    'units_per_carton', r.units_per_carton
                  )
                  ELSE NULL
                END,
              'alternatives', COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'id', rel.target_id,
                    'name', rel.name,
                    'item_code', rel.item_code,
                    'unit', rel.unit,
                    'image_url', rel.image_url,
                    'brand_name', rel.brand_name
                  )
                  ORDER BY rel.sort_order, rel.name, rel.target_id
                )
                FROM (
                  SELECT
                    t.id AS target_id, t.name, t.item_code, t.unit, t.image_url,
                    b2.name AS brand_name, rs.sort_order
                  FROM public.product_storefront_relations rs
                  JOIN public.products t
                    ON t.id = rs.target_product_id
                   AND t.organization_id = rs.organization_id
                   AND t.status = 'active'
                  LEFT JOIN public.product_brands b2
                    ON b2.id = t.brand_id
                   AND b2.organization_id = t.organization_id
                   AND b2.is_active = true
                  WHERE rs.organization_id = r.organization_id
                    AND rs.source_product_id = r.id
                    AND rs.relation_type = 'alternative'
                    AND rs.is_published = true
                  ORDER BY rs.sort_order, t.name, t.id
                  LIMIT 8
                ) rel
              ), '[]'::jsonb),
              'complements', COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'id', rel.target_id,
                    'name', rel.name,
                    'item_code', rel.item_code,
                    'unit', rel.unit,
                    'image_url', rel.image_url,
                    'brand_name', rel.brand_name
                  )
                  ORDER BY rel.sort_order, rel.name, rel.target_id
                )
                FROM (
                  SELECT
                    t.id AS target_id, t.name, t.item_code, t.unit, t.image_url,
                    b2.name AS brand_name, rs.sort_order
                  FROM public.product_storefront_relations rs
                  JOIN public.products t
                    ON t.id = rs.target_product_id
                   AND t.organization_id = rs.organization_id
                   AND t.status = 'active'
                  LEFT JOIN public.product_brands b2
                    ON b2.id = t.brand_id
                   AND b2.organization_id = t.organization_id
                   AND b2.is_active = true
                  WHERE rs.organization_id = r.organization_id
                    AND rs.source_product_id = r.id
                    AND rs.relation_type = 'complementary'
                    AND rs.is_published = true
                  ORDER BY rs.sort_order, t.name, t.id
                  LIMIT 8
                ) rel
              ), '[]'::jsonb),
              'display_price', CASE
                WHEN v_price_displayable THEN prices.unit_price
                ELSE NULL::numeric(15,2)
              END,
              'inventory', pg_catalog.jsonb_build_object(
                'product_id', r.id,
                'quantity_available', r.quantity_available
              )
            ) || CASE WHEN v_can_view_internal_price
                 THEN pg_catalog.jsonb_build_object('base_price', prices.unit_price)
                 ELSE '{}'::jsonb
               END
          )
          ORDER BY r.is_featured DESC, r.sort_order ASC, r.name, r.id
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
    'filters', pg_catalog.jsonb_build_object(
      'brands', v_brand_options,
      'units', v_unit_options
    ),
    'items', v_items
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_storefront_catalog_page(
  text, uuid, integer, integer, boolean, uuid, text, boolean, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_storefront_catalog_page(
  text, uuid, integer, integer, boolean, uuid, text, boolean, uuid
) TO anon, authenticated;

COMMENT ON FUNCTION public.get_storefront_catalog_page(
  text, uuid, integer, integer, boolean, uuid, text, boolean, uuid
) IS
  'Tenant-scoped storefront catalogue. Brand, base/alternate unit and price-display filters are conjunctive server-side filters before count and pagination. Price display filtering derives only from the caller policy, not hidden tier-price existence. Only verified brand/specification/origin/packaging facts and published same-tenant alternatives/complements are projected.';

NOTIFY pgrst, 'reload schema';
COMMIT;
