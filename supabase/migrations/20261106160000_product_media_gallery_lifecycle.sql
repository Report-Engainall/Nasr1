BEGIN;

-- BODY-048 introduced a provisional array column. Keep the original product_media
-- relation as the only persisted multi-image store.
ALTER TABLE public.products
  DROP COLUMN IF EXISTS image_gallery_urls;

GRANT SELECT ON TABLE public.product_media TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.product_media FROM PUBLIC, anon, authenticated;

-- Replace the original unrestricted read and global staff-write policies with
-- a same-tenant public storefront read and a current-tenant staff read.
DROP POLICY IF EXISTS public_read_product_media ON public.product_media;
DROP POLICY IF EXISTS staff_all_product_media ON public.product_media;
DROP POLICY IF EXISTS product_media_tenant_read ON public.product_media;

CREATE POLICY product_media_tenant_read
  ON public.product_media
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.products AS p
       WHERE p.id = product_media.product_id
         AND (
           (
             p.organization_id = public.public_storefront_organization_id()
             AND p.status = 'active'
           )
           OR (
             auth.uid() IS NOT NULL
             AND p.organization_id = public.current_organization_id()
             AND public.is_staff()
           )
         )
    )
  );

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
  v_media_id uuid;
  v_sort_order integer;
  v_media_count integer;
  v_old_value jsonb;
  v_new_value jsonb;
  v_event text;
BEGIN
  SELECT p.id, p.organization_id
    INTO v_actor, v_organization
    FROM public.profiles AS p
   WHERE p.auth_user_id = auth.uid()
     AND p.is_active = true
     AND EXISTS (
       SELECT 1
         FROM public.user_roles AS r
        WHERE r.profile_id = p.id
          AND r.role IN ('admin', 'manager', 'staff')
     )
   ORDER BY p.created_at, p.id
   LIMIT 1;

  IF v_actor IS NULL OR v_organization IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active staff organization required for product gallery changes';
  END IF;

  IF p_product_id IS NULL
     OR p_action IS NULL
     OR p_action NOT IN ('add', 'remove')
     OR p_image_url IS NULL
     OR length(p_image_url) > 2048
     OR p_image_url !~ '^https://'
     OR position(
       '/object/public/product-images/' || v_organization::text || '/' || p_product_id::text || '/'
       IN p_image_url
     ) = 0
     OR right(p_image_url, 5) <> '.webp' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'invalid same-tenant product gallery image request';
  END IF;

  PERFORM 1
    FROM public.products AS p
   WHERE p.id = p_product_id
     AND p.organization_id = v_organization
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'product is not available in the active organization';
  END IF;

  IF p_action = 'add' THEN
    SELECT pm.id
      INTO v_media_id
      FROM public.product_media AS pm
     WHERE pm.product_id = p_product_id
       AND pm.url = p_image_url
       AND pm.is_primary = false
     LIMIT 1;

    IF v_media_id IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'id', p_product_id,
        'image_url', p_image_url,
        'changed', false
      );
    END IF;

    SELECT count(*)::integer, coalesce(max(pm.sort_order), -1) + 1
      INTO v_media_count, v_sort_order
      FROM public.product_media AS pm
     WHERE pm.product_id = p_product_id
       AND pm.is_primary = false;

    IF v_media_count >= 8 THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'product gallery limit of eight additional images reached';
    END IF;

    INSERT INTO public.product_media (
      product_id, url, alt_text, sort_order, is_primary
    ) VALUES (
      p_product_id, p_image_url, NULL, v_sort_order, false
    )
    RETURNING id INTO v_media_id;

    v_event := 'catalog.product_gallery_image_added';
    v_old_value := NULL;
    v_new_value := pg_catalog.jsonb_build_object(
      'media_id', v_media_id,
      'url', p_image_url,
      'sort_order', v_sort_order,
      'is_primary', false
    );
  ELSE
    DELETE FROM public.product_media AS pm
     WHERE pm.product_id = p_product_id
       AND pm.url = p_image_url
       AND pm.is_primary = false
    RETURNING pm.id INTO v_media_id;

    IF v_media_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001',
        MESSAGE = 'gallery image changed; reload before retrying';
    END IF;

    v_event := 'catalog.product_gallery_image_removed';
    v_old_value := pg_catalog.jsonb_build_object(
      'media_id', v_media_id,
      'url', p_image_url,
      'is_primary', false
    );
    v_new_value := NULL;
  END IF;

  UPDATE public.products AS p
     SET updated_at = pg_catalog.now()
   WHERE p.id = p_product_id
     AND p.organization_id = v_organization;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_organization,
    v_actor,
    v_event,
    'product',
    p_product_id,
    v_old_value,
    v_new_value
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_product_id,
    'image_url', p_image_url,
    'changed', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.mutate_staff_product_gallery_image(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_staff_product_gallery_image(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.mutate_staff_product_gallery_image(uuid, text, text) IS
  'Adds/removes up to eight non-primary product_media rows for an active same-tenant admin/manager/staff actor. Validates the owned WebP storage path, locks the product, blocks direct browser media DML and records append-only audit events.';

COMMIT;
