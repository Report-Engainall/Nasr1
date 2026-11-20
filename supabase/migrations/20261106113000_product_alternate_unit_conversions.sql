BEGIN;

CREATE TABLE IF NOT EXISTS public.product_unit_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_name text NOT NULL CHECK (
    unit_name=pg_catalog.btrim(unit_name)
    AND pg_catalog.char_length(unit_name) BETWEEN 1 AND 40
  ),
  base_units_per_unit integer NOT NULL CHECK (base_units_per_unit BETWEEN 2 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_unit_conversions_name_unique
  ON public.product_unit_conversions(organization_id,product_id,pg_catalog.lower(unit_name));
CREATE INDEX IF NOT EXISTS product_unit_conversions_product_idx
  ON public.product_unit_conversions(organization_id,product_id);

ALTER TABLE public.product_unit_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_unit_conversions FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.product_unit_conversions TO service_role;

CREATE OR REPLACE FUNCTION public.get_product_unit_conversions(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_context jsonb;
  v_org uuid;
  v_is_staff boolean:=false;
  v_base_unit text;
  v_status text;
  v_units jsonb;
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='product id is required';
  END IF;

  IF auth.uid() IS NULL THEN
    v_context:=public.get_public_storefront_context();
  ELSE
    v_context:=public.get_current_tenant_context();
  END IF;
  v_org:=NULLIF(v_context->>'organization_id','')::uuid;
  v_is_staff:=COALESCE(NULLIF(v_context->>'is_staff','')::boolean,false);
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active storefront organization required';
  END IF;

  SELECT p.unit,p.status INTO v_base_unit,v_status
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_org;
  IF NOT FOUND OR (NOT v_is_staff AND v_status<>'active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='product is not available in the active organization';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'unit_name',u.unit_name,
      'base_units_per_unit',u.base_units_per_unit
    ) ORDER BY u.base_units_per_unit,u.unit_name
  ),'[]'::jsonb)
  INTO v_units
  FROM public.product_unit_conversions u
  WHERE u.organization_id=v_org AND u.product_id=p_product_id;

  RETURN pg_catalog.jsonb_build_object(
    'base_unit',v_base_unit,
    'units',v_units
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.save_product_unit_conversions(
  p_product_id uuid,
  p_units jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_base_unit text;
  v_line jsonb;
  v_name text;
  v_factor numeric;
  v_seen text[]:=ARRAY[]::text[];
  v_normalized jsonb:='[]'::jsonb;
  v_before jsonb;
  v_after jsonb;
  v_changed boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     )
     OR NOT EXISTS(
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=v_actor AND r.role IN('admin','manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active admin or manager required to manage product units';
  END IF;
  IF p_product_id IS NULL OR p_units IS NULL
     OR pg_catalog.jsonb_typeof(p_units)<>'array'
     OR pg_catalog.jsonb_array_length(p_units)>20 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='provide up to 20 alternate product units';
  END IF;

  SELECT p.unit INTO v_base_unit
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='product is not available in the active organization';
  END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_units) LOOP
    IF pg_catalog.jsonb_typeof(v_line)<>'object'
       OR pg_catalog.jsonb_typeof(v_line->'unit_name')<>'string'
       OR pg_catalog.jsonb_typeof(v_line->'base_units_per_unit')<>'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each alternate unit requires a name and numeric base-unit factor';
    END IF;
    v_name:=pg_catalog.btrim(v_line->>'unit_name');
    BEGIN
      v_factor:=(v_line->>'base_units_per_unit')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid alternate unit conversion factor';
    END;
    IF v_name='' OR pg_catalog.char_length(v_name)>40
       OR pg_catalog.lower(v_name)=pg_catalog.lower(v_base_unit)
       OR v_factor IS NULL OR v_factor<>pg_catalog.trunc(v_factor)
       OR v_factor<2 OR v_factor>1000000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='alternate unit name or conversion factor is outside the supported range';
    END IF;
    IF pg_catalog.lower(v_name)=ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='alternate unit names must be unique per product';
    END IF;
    v_seen:=pg_catalog.array_append(v_seen,pg_catalog.lower(v_name));
    v_normalized:=v_normalized||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('unit_name',v_name,'base_units_per_unit',v_factor::integer)
    );
  END LOOP;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('unit_name',u.unit_name,'base_units_per_unit',u.base_units_per_unit)
    ORDER BY pg_catalog.lower(u.unit_name)
  ),'[]'::jsonb)
  INTO v_before
  FROM public.product_unit_conversions u
  WHERE u.organization_id=v_org AND u.product_id=p_product_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(value ORDER BY pg_catalog.lower(value->>'unit_name')),'[]'::jsonb)
  INTO v_after
  FROM pg_catalog.jsonb_array_elements(v_normalized) value;

  IF v_before IS DISTINCT FROM v_after THEN
    DELETE FROM public.product_unit_conversions
     WHERE organization_id=v_org AND product_id=p_product_id;
    INSERT INTO public.product_unit_conversions(
      organization_id,product_id,unit_name,base_units_per_unit
    )
    SELECT v_org,p_product_id,item->>'unit_name',(item->>'base_units_per_unit')::integer
      FROM pg_catalog.jsonb_array_elements(v_normalized) item;
    v_changed:=true;
    INSERT INTO public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
    ) VALUES(
      v_org,v_actor,'catalog.product_units_updated','product',p_product_id,
      pg_catalog.jsonb_build_object('base_unit',v_base_unit,'alternate_units',v_before),
      pg_catalog.jsonb_build_object('base_unit',v_base_unit,'alternate_units',v_after)
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'product_id',p_product_id,
    'base_unit',v_base_unit,
    'units',v_after,
    'changed',v_changed
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.guard_product_base_unit_conversion_name()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.unit IS DISTINCT FROM OLD.unit AND EXISTS(
    SELECT 1 FROM public.product_unit_conversions u
     WHERE u.organization_id=NEW.organization_id
       AND u.product_id=NEW.id
       AND pg_catalog.lower(u.unit_name)=pg_catalog.lower(pg_catalog.btrim(NEW.unit))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='new base unit conflicts with a saved alternate unit; update alternate units first';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS products_base_unit_conversion_guard ON public.products;
CREATE TRIGGER products_base_unit_conversion_guard
  BEFORE UPDATE OF unit ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_product_base_unit_conversion_name();

REVOKE ALL ON FUNCTION public.get_product_unit_conversions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_unit_conversions(uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.save_product_unit_conversions(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_unit_conversions(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_product_base_unit_conversion_name() FROM PUBLIC,anon,authenticated;

COMMENT ON TABLE public.product_unit_conversions IS
  'Tenant-scoped alternate product units. base_units_per_unit is an exact integer multiplier into products.unit; all order, price and stock contracts continue to use the base unit.';
COMMENT ON FUNCTION public.get_product_unit_conversions(uuid) IS
  'Returns only the base unit and its alternate-unit conversion names/factors for an active tenant-visible product; no sensitive price or stock fields.';
COMMENT ON FUNCTION public.save_product_unit_conversions(uuid,jsonb) IS
  'Admin/manager atomic replacement of one product alternate-unit conversion list with tenant derivation, base-unit uniqueness, exact integer multipliers and audit event.';

COMMIT;
