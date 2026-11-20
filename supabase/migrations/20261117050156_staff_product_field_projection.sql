-- Server-authoritative field-level product projection for staff.
CREATE OR REPLACE FUNCTION public.get_current_tenant_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_profile_id uuid; v_organization_id uuid; v_warehouse_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='28000', MESSAGE='Authentication required'; END IF;
  SELECT p.id,p.organization_id INTO v_profile_id,v_organization_id
  FROM public.profiles p WHERE p.auth_user_id=auth.uid() AND p.is_active=true LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='An active profile is required'; END IF;
  IF v_organization_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='The profile has no organization scope'; END IF;
  SELECT w.id INTO v_warehouse_id FROM public.warehouses w
  WHERE w.organization_id=v_organization_id AND w.is_active=true ORDER BY w.created_at,w.id LIMIT 1;
  RETURN jsonb_build_object(
    'profile_id',v_profile_id,'organization_id',v_organization_id,'warehouse_id',v_warehouse_id,
    'is_staff',EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','staff')),
    'can_manage_customers',EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','customer_manager')),
    'can_view_internal_product_prices',(
      EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager'))
      AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role='accountant')
    )
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_current_tenant_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_context() TO authenticated;


CREATE OR REPLACE FUNCTION public.fetch_staff_products(p_product_id uuid DEFAULT NULL)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff role required for product details';
  END IF;

  SELECT p.organization_id
    INTO v_organization_id
    FROM public.profiles p
   WHERE p.id=public.current_profile_id()
     AND p.auth_user_id=auth.uid()
     AND p.is_active=true
     AND EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=p.id AND r.role IN ('admin','manager')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=p.id AND r.role='accountant'
     )
   ORDER BY p.created_at, p.id
   LIMIT 1;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff role and organization required for product details';
  END IF;

  RETURN QUERY
    SELECT p.*
      FROM public.products p
     WHERE p.organization_id=v_organization_id
       AND (p_product_id IS NULL OR p.id=p_product_id)
     ORDER BY p.name, p.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_staff_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_products(uuid) TO authenticated;
COMMENT ON FUNCTION public.fetch_staff_products(uuid) IS
  'Full product financial projection restricted to active admin/manager identities without accountant scope.';

CREATE OR REPLACE FUNCTION public.fetch_staff_catalog_products(p_product_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,category_id uuid,name text,name_en text,item_code text,sku text,barcode text,
  description text,unit text,status text,image_url text,created_at timestamptz,
  min_order_quantity integer,order_quantity_multiple integer,min_stock numeric,
  is_featured boolean,sort_order integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff role required for safe product catalog'; END IF;
  SELECT p.organization_id INTO v_organization_id
  FROM public.profiles p
  WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=p.id AND r.role IN ('admin','manager','staff'))
  ORDER BY p.created_at,p.id LIMIT 1;
  IF v_organization_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff role and organization required for safe product catalog'; END IF;
  RETURN QUERY
    SELECT p.id,p.category_id,p.name::text,p.name_en::text,p.item_code::text,p.sku::text,
      p.barcode::text,p.description::text,p.unit::text,p.status::text,p.image_url::text,
      p.created_at,p.min_order_quantity,p.order_quantity_multiple,p.min_stock::numeric,
      p.is_featured,p.sort_order::integer
    FROM public.products p
    WHERE p.organization_id=v_organization_id AND (p_product_id IS NULL OR p.id=p_product_id)
    ORDER BY p.name,p.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_staff_catalog_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_catalog_products(uuid) TO authenticated;
COMMENT ON FUNCTION public.fetch_staff_catalog_products(uuid) IS
  'Returns tenant-scoped allowlisted operational fields. Omits base price, tier prices, cost and margins.';


CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(
  p_product_ids uuid[],
  p_quantity numeric DEFAULT 1
)
RETURNS TABLE(product_id uuid, unit_price numeric(15,2))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_customer_id uuid;
  v_tier text := 'retail';
  v_customer_status text;
  v_is_staff boolean := false;
  v_show_price boolean := true;
BEGIN
  IF p_product_ids IS NULL OR pg_catalog.cardinality(p_product_ids) = 0 THEN RETURN; END IF;
  IF pg_catalog.cardinality(p_product_ids) > 500
     OR pg_catalog.array_position(p_product_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product batch must contain at most 500 non-null ids';
  END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity <> pg_catalog.trunc(p_quantity) OR p_quantity < 1 OR p_quantity > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='price quantity must be an integer between 1 and 10000';
  END IF;

  IF auth.uid() IS NULL THEN
    v_organization_id := public.public_storefront_organization_id();
  ELSE
    -- Resolve the canonical profile only while its server-side Auth session is live.
    v_profile_id := public.current_profile_id();
    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active profile and organization required to resolve catalog prices';
    END IF;
    SELECT p.organization_id,
           (
             EXISTS (
               SELECT 1 FROM public.user_roles r
                WHERE r.profile_id = p.id
                  AND r.role IN ('admin','manager')
             )
             AND NOT EXISTS (
               SELECT 1 FROM public.user_roles r
                WHERE r.profile_id = p.id
                  AND r.role = 'accountant'
             )
           )
      INTO v_organization_id, v_is_staff
      FROM public.profiles p
     WHERE p.id = v_profile_id
       AND p.auth_user_id = auth.uid()
       AND p.is_active = true;
    IF v_organization_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active profile and organization required to resolve catalog prices';
    END IF;
    IF NOT v_is_staff THEN
      v_customer_id := public.current_customer_id();
      IF v_customer_id IS NULL OR NOT public.current_customer_can('catalog.read') THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer membership lacks permission to resolve catalog prices';
      END IF;

      SELECT c.status, c.tier INTO v_customer_status, v_tier
        FROM public.customers c
       WHERE c.id = v_customer_id
         AND c.organization_id = v_organization_id;
      IF NOT FOUND OR v_customer_status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='approved customer required to resolve catalog prices';
      END IF;
      v_tier := COALESCE(NULLIF(v_tier,''),'retail');
    END IF;
  END IF;

  IF v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = v_organization_id AND o.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active storefront organization is required';
  END IF;

  SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
              THEN (s.value #>> '{}')::boolean ELSE true END
    INTO v_show_price
    FROM public.admin_settings s
   WHERE s.organization_id = v_organization_id AND s.key = 'show_price_on_cards';
  v_show_price := COALESCE(v_show_price, true);

  IF NOT v_is_staff AND NOT v_show_price THEN
    RETURN QUERY
      SELECT p.id, 0::numeric(15,2)
        FROM public.products p
       WHERE p.id = ANY(p_product_ids)
         AND p.organization_id = v_organization_id
         AND p.status = 'active'
       ORDER BY p.id;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id,
           CASE WHEN v_is_staff THEN pg_catalog.round(p.base_price,2)
                ELSE (
                  SELECT resolved.net_unit_price
                    FROM public.resolve_active_promotion_price(
                      p.id,
                      v_organization_id,
                      public.customer_product_unit_price(p.id, v_organization_id, v_tier, p_quantity)
                    ) AS resolved
                )
           END::numeric(15,2)
      FROM public.products p
     WHERE p.id = ANY(p_product_ids)
       AND p.organization_id = v_organization_id
       AND p.status = 'active'
     ORDER BY p.id;
END
$function$;
REVOKE ALL ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) TO anon,authenticated;
COMMENT ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) IS
  'Returns customer tier prices to authorized customers; internal base price only to admin/manager without accountant scope. Staff-only sessions are denied.';
