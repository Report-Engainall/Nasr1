BEGIN;

-- AGH-STOREFRONT-PRICE-MEMBER-REVOCATION-001
-- A member may lose catalog.read while a price RPC is in flight. Lock the same
-- customer row used by revoke_customer_company_member(), then re-check permission
-- before the pricing function can emit any row. Hidden-price behavior remains NULL.
-- Hidden storefront prices are absent values, never numeric zero sentinels.
-- Preserve the live-session and membership checks from PR #144 when redefining the price RPC.
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
                  AND r.role IN ('admin','manager','staff')
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

      -- Serialize price resolution against owner-triggered membership revocation.
      -- The revocation RPC holds FOR UPDATE on this same customer row. After waiting,
      -- re-evaluate the active membership capability before returning any price row.
      SELECT c.status, c.tier INTO v_customer_status, v_tier
        FROM public.customers c
       WHERE c.id = v_customer_id
         AND c.organization_id = v_organization_id
       FOR SHARE;
      IF NOT FOUND OR v_customer_status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='approved customer required to resolve catalog prices';
      END IF;
      IF NOT public.current_customer_can('catalog.read') THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer membership lacks permission to resolve catalog prices';
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
      SELECT p.id, NULL::numeric(15,2)
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
REVOKE ALL ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) TO anon, authenticated;
COMMENT ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) IS
  'Returns only caller-specific prices from the current customer tier. When show_price_on_cards is disabled, customer RPC calls return NULL for unit_price, never a numeric sentinel; raw tier-price rows remain inaccessible to browser roles.';


COMMIT;
