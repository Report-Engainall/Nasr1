-- Persist storefront favourites per active profile and tenant.
-- Adapted from the donor wishlist_items concept; the donor table was not copied
-- because it is unscoped to the current organization and uses a different schema.
CREATE TABLE IF NOT EXISTS public.storefront_saved_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storefront_saved_products_one_per_profile_product
    UNIQUE (organization_id, profile_id, product_id)
);

ALTER TABLE public.storefront_saved_products ENABLE ROW LEVEL SECURITY;

-- Browser clients must use the actor-derived RPC surface below; they cannot read
-- or mutate this table directly. The SECURITY DEFINER functions validate auth.uid()
-- and independently bind every operation to the active profile and organization.
REVOKE ALL ON TABLE public.storefront_saved_products FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_storefront_saved_products()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;

  SELECT p.id, p.organization_id
    INTO v_profile_id, v_organization_id
  FROM public.profiles AS p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;

  IF v_profile_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An active tenant profile is required';
  END IF;

  RETURN COALESCE(
    ARRAY(
      SELECT s.product_id
      FROM public.storefront_saved_products AS s
      JOIN public.products AS p
        ON p.id = s.product_id
       AND p.organization_id = v_organization_id
       AND p.status = 'active'
      WHERE s.organization_id = v_organization_id
        AND s.profile_id = v_profile_id
      ORDER BY s.created_at DESC, s.product_id
    ),
    ARRAY[]::uuid[]
  );
END
$function$;

REVOKE ALL ON FUNCTION public.list_storefront_saved_products() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_storefront_saved_products() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_storefront_saved_product(
  p_product_id uuid,
  p_saved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_changed boolean := false;
  v_rows integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;
  IF p_product_id IS NULL OR p_saved IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Product and saved state are required';
  END IF;

  SELECT p.id, p.organization_id
    INTO v_profile_id, v_organization_id
  FROM public.profiles AS p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;

  IF v_profile_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An active tenant profile is required';
  END IF;

  IF p_saved THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.products AS p
      WHERE p.id = p_product_id
        AND p.organization_id = v_organization_id
        AND p.status = 'active'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Product is not available in this storefront tenant';
    END IF;

    INSERT INTO public.storefront_saved_products(organization_id, profile_id, product_id)
    VALUES (v_organization_id, v_profile_id, p_product_id)
    ON CONFLICT (organization_id, profile_id, product_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_changed := v_rows > 0;

    IF v_changed THEN
      INSERT INTO public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)
      VALUES (
        v_organization_id, v_profile_id, 'storefront.saved_product.added',
        'storefront_saved_product', p_product_id,
        jsonb_build_object('saved', false), jsonb_build_object('saved', true)
      );
    END IF;
  ELSE
    DELETE FROM public.storefront_saved_products
    WHERE organization_id = v_organization_id
      AND profile_id = v_profile_id
      AND product_id = p_product_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_changed := v_rows > 0;

    IF v_changed THEN
      INSERT INTO public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)
      VALUES (
        v_organization_id, v_profile_id, 'storefront.saved_product.removed',
        'storefront_saved_product', p_product_id,
        jsonb_build_object('saved', true), jsonb_build_object('saved', false)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('product_id', p_product_id, 'saved', p_saved, 'changed', v_changed);
END
$function$;

REVOKE ALL ON FUNCTION public.set_storefront_saved_product(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_storefront_saved_product(uuid, boolean) TO authenticated;
