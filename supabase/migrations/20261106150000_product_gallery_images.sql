BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_gallery_urls text[] NOT NULL DEFAULT '{}'::text[];

GRANT SELECT (image_gallery_urls)
  ON TABLE public.products TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mutate_staff_product_gallery_image(
  p_product_id uuid,
  p_image_url text,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_organization uuid;
  v_images text[];
  v_next_images text[];
  v_event text;
BEGIN
  SELECT p.id, p.organization_id INTO v_actor, v_organization
    FROM public.profiles AS p
   WHERE p.auth_user_id = auth.uid() AND p.is_active = true;

  IF v_actor IS NULL OR v_organization IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization profile required for product gallery changes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles AS r
     WHERE r.profile_id = v_actor AND r.role IN ('admin', 'manager', 'staff')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'product gallery permission required';
  END IF;
  IF p_product_id IS NULL OR p_action IS NULL OR p_action NOT IN ('add', 'remove')
     OR p_image_url IS NULL OR length(p_image_url) > 2048
     OR p_image_url !~ '^https://'
     OR position('/object/public/product-images/' || v_organization::text || '/' || p_product_id::text || '/' IN p_image_url) = 0
     OR right(p_image_url, 5) <> '.webp' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid same-tenant WebP gallery image request';
  END IF;

  SELECT coalesce(p.image_gallery_urls, '{}'::text[]) INTO v_images
    FROM public.products AS p
   WHERE p.id = p_product_id AND p.organization_id = v_organization
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'product is not available in the active organization';
  END IF;

  IF p_action = 'add' THEN
    IF p_image_url = ANY(v_images) THEN
      RETURN pg_catalog.jsonb_build_object('id', p_product_id, 'image_url', p_image_url,
        'image_gallery_urls', to_jsonb(v_images), 'changed', false);
    END IF;
    IF cardinality(v_images) >= 8 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product gallery limit of eight images reached';
    END IF;
    v_next_images := array_append(v_images, p_image_url);
    v_event := 'catalog.product_gallery_image_added';
  ELSE
    IF NOT (p_image_url = ANY(v_images)) THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'gallery image changed; reload before retrying';
    END IF;
    v_next_images := array_remove(v_images, p_image_url);
    v_event := 'catalog.product_gallery_image_removed';
  END IF;

  UPDATE public.products AS p
     SET image_gallery_urls = v_next_images, updated_at = pg_catalog.now()
   WHERE p.id = p_product_id AND p.organization_id = v_organization;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_organization, v_actor, v_event, 'product', p_product_id,
    pg_catalog.jsonb_build_object('image_gallery_urls', to_jsonb(v_images)),
    pg_catalog.jsonb_build_object('image_gallery_urls', to_jsonb(v_next_images))
  );

  RETURN pg_catalog.jsonb_build_object('id', p_product_id, 'image_url', p_image_url,
    'image_gallery_urls', to_jsonb(v_next_images), 'changed', true);
END
$function$;

REVOKE ALL ON FUNCTION public.mutate_staff_product_gallery_image(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_staff_product_gallery_image(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.mutate_staff_product_gallery_image(uuid, text, text) IS
  'Adds or removes up to eight tenant-owned WebP product gallery images for active admin/manager/staff users, with product row locking and append-only audit events.';

COMMIT;
