-- Route product-facts administration through Authorization V2 while preserving
-- the legacy tenant/profile/role checks as a second, narrower guard.
BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('public.authorization_capabilities') IS NULL
     OR pg_catalog.to_regclass('public.authorization_role_capabilities') IS NULL
     OR pg_catalog.to_regclass('public.authorization_profile_denials') IS NULL
     OR pg_catalog.to_regprocedure('public.current_actor_has_capability(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='Authorization V2 registry and capability decision function must be applied before product-details authorization';
  END IF;
END
$preflight$;

-- Seed admin/manager once, only when this new capability row is first created.
-- If a grant is deliberately removed later, replaying this migration will not restore it.
DO $seed$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.authorization_capabilities(
    capability_key,domain,resource,action,sensitivity,scope_kind,
    approval_mode,separation_of_duties,state_requirements,legacy_operation_id
  ) VALUES(
    'catalog.product.details.manage','catalog','product_storefront_details','manage',
    'catalog','organization','none',false,
    '{"verified_facts_only":true,"tenant_scoped":true}'::jsonb,NULL
  )
  ON CONFLICT(capability_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted=1 THEN
    INSERT INTO public.authorization_role_capabilities(
      role,capability_key,grant_source,valid_from,expires_at
    )
    VALUES
      ('admin','catalog.product.details.manage','migration:20261126120000',statement_timestamp(),NULL),
      ('manager','catalog.product.details.manage','migration:20261126120000',statement_timestamp(),NULL)
    ON CONFLICT(role,capability_key) DO NOTHING;
  END IF;
END
$seed$;

DO $rename$
BEGIN
  IF pg_catalog.to_regprocedure('public.get_admin_storefront_product_details_v2_legacy(uuid)') IS NULL THEN
    ALTER FUNCTION public.get_admin_storefront_product_details(uuid)
      RENAME TO get_admin_storefront_product_details_v2_legacy;
  END IF;

  IF pg_catalog.to_regprocedure(
    'public.save_admin_storefront_product_details_v2_legacy(uuid,text,text,text,boolean,jsonb,boolean,numeric,text,text,boolean,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.save_admin_storefront_product_details(
      uuid,text,text,text,boolean,jsonb,boolean,numeric,text,text,boolean,jsonb
    ) RENAME TO save_admin_storefront_product_details_v2_legacy;
  END IF;
END
$rename$;

CREATE OR REPLACE FUNCTION public.get_admin_storefront_product_details(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.current_actor_has_capability('catalog.product.details.manage') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='catalog.product.details.manage capability required';
  END IF;

  RETURN public.get_admin_storefront_product_details_v2_legacy(p_product_id);
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
SET search_path=''
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.current_actor_has_capability('catalog.product.details.manage') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='catalog.product.details.manage capability required';
  END IF;

  RETURN public.save_admin_storefront_product_details_v2_legacy(
    p_product_id,p_brand_name,p_brand_name_en,p_country_of_origin_code,p_origin_verified,
    p_specifications,p_specifications_verified,p_package_size_value,p_package_size_unit,
    p_carton_unit_name,p_packaging_verified,p_relations
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_admin_storefront_product_details_v2_legacy(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_admin_storefront_product_details_v2_legacy(
  uuid,text,text,text,boolean,jsonb,boolean,numeric,text,text,boolean,jsonb
) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.get_admin_storefront_product_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_storefront_product_details(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_admin_storefront_product_details(
  uuid,text,text,text,boolean,jsonb,boolean,numeric,text,text,boolean,jsonb
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_admin_storefront_product_details(
  uuid,text,text,text,boolean,jsonb,boolean,numeric,text,text,boolean,jsonb
) TO authenticated;

COMMENT ON FUNCTION public.get_admin_storefront_product_details(uuid) IS
  'Reads same-tenant management product facts only when Authorization V2 grants catalog.product.details.manage; legacy profile and role checks remain enforced.';
COMMENT ON FUNCTION public.save_admin_storefront_product_details(uuid,text,text,text,boolean,jsonb,boolean,numeric,text,text,boolean,jsonb) IS
  'Writes same-tenant management product facts only when Authorization V2 grants catalog.product.details.manage; legacy profile, role, validation and audit checks remain enforced.';

COMMIT;
