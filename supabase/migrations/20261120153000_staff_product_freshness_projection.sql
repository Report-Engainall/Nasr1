-- Keep the safe staff projection source-backed for product freshness.
-- The return type changes by one allowlisted, non-financial column; recreate the RPC.
BEGIN;

DROP FUNCTION public.fetch_staff_catalog_products(uuid);

CREATE FUNCTION public.fetch_staff_catalog_products(p_product_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  category_id uuid,
  name text,
  name_en text,
  item_code text,
  sku text,
  barcode text,
  description text,
  unit text,
  status text,
  image_url text,
  created_at timestamptz,
  updated_at timestamptz,
  min_order_quantity integer,
  order_quantity_multiple integer,
  min_stock numeric,
  is_featured boolean,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff role required for safe product catalog';
  END IF;

  SELECT p.organization_id
    INTO v_organization_id
    FROM public.profiles p
   WHERE p.id=public.current_profile_id()
     AND p.auth_user_id=auth.uid()
     AND p.is_active=true
     AND EXISTS (
       SELECT 1
       FROM public.user_roles r
       WHERE r.profile_id=p.id AND r.role IN ('admin','manager','staff')
     )
   ORDER BY p.created_at,p.id
   LIMIT 1;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff role and organization required for safe product catalog';
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.category_id,
      p.name::text,
      p.name_en::text,
      p.item_code::text,
      p.sku::text,
      p.barcode::text,
      p.description::text,
      p.unit::text,
      p.status::text,
      p.image_url::text,
      p.created_at,
      p.updated_at,
      p.min_order_quantity,
      p.order_quantity_multiple,
      p.min_stock::numeric,
      p.is_featured,
      p.sort_order::integer
    FROM public.products p
    WHERE p.organization_id=v_organization_id
      AND (p_product_id IS NULL OR p.id=p_product_id)
    ORDER BY p.name,p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_staff_catalog_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_catalog_products(uuid) TO authenticated;

COMMENT ON FUNCTION public.fetch_staff_catalog_products(uuid) IS
  'Returns tenant-scoped operational product fields plus persisted updated_at. Omits base price, tier prices, cost and margins.';

COMMIT;
