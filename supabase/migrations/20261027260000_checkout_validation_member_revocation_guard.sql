BEGIN;

-- A non-financial cart-validation RPC still exposes tenant product metadata and
-- must stop serving customer-company members after membership revocation.
-- Serialize it with revoke_customer_company_member using the same customer row.
CREATE OR REPLACE FUNCTION public.validate_checkout_cart(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_organization_id uuid;
  v_customer_id uuid;
  v_preview jsonb;
  v_items jsonb;
  v_safe_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sign in required';
  END IF;

  SELECT p.organization_id
    INTO v_organization_id
    FROM public.profiles AS p
   WHERE p.id = v_profile_id
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF v_organization_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.organizations AS o
        WHERE o.id = v_organization_id
          AND o.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization context required';
  END IF;

  IF NOT public.is_staff() THEN
    v_customer_id := public.current_customer_id();

    IF v_customer_id IS NULL OR NOT public.current_customer_can('catalog.read') THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'Active customer membership with storefront catalog access is required';
    END IF;

    -- Match the lock used by company-member revocation. Recheck capability after
    -- waiting so a request that races the revoke cannot validate with stale scope.
    PERFORM 1
      FROM public.customers AS c
     WHERE c.id = v_customer_id
       AND c.organization_id = v_organization_id
       AND c.status = 'approved'
     FOR SHARE;

    IF NOT FOUND OR NOT public.current_customer_can('catalog.read') THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'Active customer membership with storefront catalog access is required';
    END IF;
  END IF;

  -- Keep financial preview on the trusted server boundary; only safe metadata leaves.
  v_preview := public.preview_order_pricing(p_items);
  v_items := coalesce(v_preview->'items', '[]'::jsonb);
  IF pg_catalog.jsonb_typeof(v_items) <> 'array'
     OR pg_catalog.jsonb_array_length(v_items) < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'تعذر التحقق من أصناف السلة';
  END IF;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'product_id', line.value->'product_id',
      'name', line.value->'name',
      'item_code', line.value->'item_code',
      'unit', line.value->'unit',
      'quantity', line.value->'quantity'
    ) ORDER BY line.ordinality
  )
    INTO v_safe_items
    FROM pg_catalog.jsonb_array_elements(v_items) WITH ORDINALITY AS line(value, ordinality);

  RETURN pg_catalog.jsonb_build_object(
    'valid', true,
    'items', coalesce(v_safe_items, '[]'::jsonb),
    'item_count', pg_catalog.jsonb_array_length(v_items),
    'currency', coalesce(v_preview->>'currency', 'YER'),
    'pricing_verified', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.validate_checkout_cart(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_checkout_cart(jsonb) TO authenticated;

COMMENT ON FUNCTION public.validate_checkout_cart(jsonb) IS
  'Customer-facing non-financial validation only. Requires active approved membership for customer actors, serializes with membership revocation, and never returns unit prices or totals.';

COMMIT;
