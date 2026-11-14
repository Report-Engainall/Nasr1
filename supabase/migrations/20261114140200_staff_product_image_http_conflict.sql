BEGIN;

CREATE OR REPLACE FUNCTION public.set_staff_product_image(
  p_product_id uuid,
  p_expected_image_url text,
  p_image_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_organization uuid;
  v_current_image_url text;
BEGIN
  SELECT p.id, p.organization_id
    INTO v_actor, v_organization
    FROM public.profiles AS p
   WHERE p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF v_actor IS NULL OR v_organization IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active organization profile required for product image changes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS r
     WHERE r.profile_id = v_actor
       AND r.role IN ('admin', 'manager', 'staff')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'product image permission required';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product id is required';
  END IF;

  IF p_image_url IS NOT NULL AND (
    length(p_image_url) > 2048
    OR p_image_url !~ '^https://'
    OR position(
      '/object/public/product-images/' || v_organization::text || '/' || p_product_id::text || '/'
      IN p_image_url
    ) = 0
    OR right(p_image_url, 5) <> '.webp'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product image URL must be a same-tenant WebP object';
  END IF;

  SELECT p.image_url
    INTO v_current_image_url
    FROM public.products AS p
   WHERE p.id = p_product_id
     AND p.organization_id = v_organization
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'product is not available in the active organization';
  END IF;

  IF v_current_image_url IS DISTINCT FROM p_expected_image_url THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'product image changed; reload before retrying';
  END IF;

  IF v_current_image_url IS NOT DISTINCT FROM p_image_url THEN
    RETURN pg_catalog.jsonb_build_object(
      'id', p_product_id,
      'image_url', v_current_image_url,
      'changed', false
    );
  END IF;

  UPDATE public.products AS p
     SET image_url = p_image_url,
         updated_at = pg_catalog.now()
   WHERE p.id = p_product_id
     AND p.organization_id = v_organization;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_organization,
    v_actor,
    'catalog.product_image_updated',
    'product',
    p_product_id,
    pg_catalog.jsonb_build_object('image_url', v_current_image_url),
    pg_catalog.jsonb_build_object('image_url', p_image_url)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_product_id,
    'image_url', p_image_url,
    'changed', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.set_staff_product_image(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_product_image(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.set_staff_product_image(uuid, text, text) IS
  'Atomically links or unlinks a same-tenant product WebP image for active admin/manager/staff users, checks the previous image URL as an optimistic version, returns PT409 for a stale image version without triggering PostgREST 14 serialization retries, and appends a product-image audit event.';

COMMIT;
