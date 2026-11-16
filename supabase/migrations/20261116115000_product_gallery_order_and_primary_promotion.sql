BEGIN;

CREATE OR REPLACE FUNCTION public.reorder_staff_product_gallery_images(
  p_product_id uuid,
  p_image_urls text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_organization uuid;
  v_old_order text[];
  v_new_order text[];
  v_current_count integer;
  v_requested_count integer;
BEGIN
  SELECT p.id,p.organization_id
    INTO v_actor,v_organization
    FROM public.profiles p
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active=true
     AND EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=p.id AND r.role IN ('admin','manager','staff')
     )
   ORDER BY p.created_at,p.id
   LIMIT 1;

  IF v_actor IS NULL OR v_organization IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-tenant catalog staff permission required';
  END IF;
  IF p_product_id IS NULL OR p_image_urls IS NULL
     OR cardinality(p_image_urls)>8
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_image_urls) u(url) WHERE url IS NULL OR pg_catalog.length(url)>2048)
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(p_image_urls)) <>
        (SELECT pg_catalog.count(DISTINCT url) FROM pg_catalog.unnest(p_image_urls) u(url)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='gallery order must contain at most eight unique valid image URLs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_image_urls) u(url)
     WHERE url !~ '^https://'
        OR pg_catalog.strpos(url,
          '/object/public/product-images/' || v_organization::text || '/' || p_product_id::text || '/')=0
        OR pg_catalog.right(url,5)<>'.webp'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='gallery order contains an image outside this product organization storage scope';
  END IF;

  PERFORM 1 FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_organization
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='product is unavailable in the active organization';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(pm.url ORDER BY pm.sort_order,pm.id),'{}'::text[]),
         pg_catalog.count(*)::integer
    INTO v_old_order,v_current_count
    FROM public.product_media pm
   WHERE pm.product_id=p_product_id AND pm.is_primary=false;

  v_requested_count:=cardinality(p_image_urls);
  IF v_requested_count<>v_current_count
     OR EXISTS (
       SELECT 1 FROM public.product_media pm
        WHERE pm.product_id=p_product_id AND pm.is_primary=false
          AND NOT (pm.url=ANY(p_image_urls))
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_image_urls) u(url)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.product_media pm
           WHERE pm.product_id=p_product_id AND pm.is_primary=false AND pm.url=u.url
        )
     ) THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='gallery contents changed; refresh the product before reordering';
  END IF;

  IF v_old_order IS NOT DISTINCT FROM p_image_urls THEN
    RETURN pg_catalog.jsonb_build_object(
      'id',p_product_id,'changed',false,'image_gallery_urls',pg_catalog.to_jsonb(v_old_order)
    );
  END IF;

  -- Move current positions out of the target range first to avoid unique
  -- (product_id, sort_order) index collisions during the permutation.
  UPDATE public.product_media pm
     SET sort_order = -(pm.sort_order+1)
   WHERE pm.product_id=p_product_id AND pm.is_primary=false;

  UPDATE public.product_media pm
     SET sort_order=(desired.ordinality-1)::integer
    FROM pg_catalog.unnest(p_image_urls) WITH ORDINALITY AS desired(url,ordinality)
   WHERE pm.product_id=p_product_id AND pm.is_primary=false AND pm.url=desired.url;

  SELECT coalesce(pg_catalog.array_agg(pm.url ORDER BY pm.sort_order,pm.id),'{}'::text[])
    INTO v_new_order
    FROM public.product_media pm
   WHERE pm.product_id=p_product_id AND pm.is_primary=false;

  UPDATE public.products p
     SET updated_at=pg_catalog.now()
   WHERE p.id=p_product_id AND p.organization_id=v_organization;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_organization,v_actor,'catalog.product_gallery_reordered','product',p_product_id,
    pg_catalog.jsonb_build_object('image_gallery_urls',pg_catalog.to_jsonb(v_old_order)),
    pg_catalog.jsonb_build_object('image_gallery_urls',pg_catalog.to_jsonb(v_new_order))
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',p_product_id,'changed',true,'image_gallery_urls',pg_catalog.to_jsonb(v_new_order)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.reorder_staff_product_gallery_images(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_staff_product_gallery_images(uuid,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_staff_product_primary_from_gallery(
  p_product_id uuid,
  p_image_url text,
  p_expected_image_url text
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
  v_gallery_media_id uuid;
  v_old_gallery_order text[];
  v_new_gallery_order text[];
  v_next_sort_order integer;
BEGIN
  SELECT p.id,p.organization_id
    INTO v_actor,v_organization
    FROM public.profiles p
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active=true
     AND EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=p.id AND r.role IN ('admin','manager','staff')
     )
   ORDER BY p.created_at,p.id
   LIMIT 1;

  IF v_actor IS NULL OR v_organization IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-tenant catalog staff permission required';
  END IF;
  IF p_product_id IS NULL OR p_image_url IS NULL OR pg_catalog.length(p_image_url)>2048
     OR p_image_url !~ '^https://'
     OR pg_catalog.strpos(p_image_url,
       '/object/public/product-images/' || v_organization::text || '/' || p_product_id::text || '/')=0
     OR pg_catalog.right(p_image_url,5)<>'.webp' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='selected gallery image must be an owned same-tenant WebP object';
  END IF;
  IF p_expected_image_url IS NOT NULL AND (
     pg_catalog.length(p_expected_image_url)>2048
     OR p_expected_image_url !~ '^https://'
     OR pg_catalog.strpos(p_expected_image_url,
       '/object/public/product-images/' || v_organization::text || '/' || p_product_id::text || '/')=0
     OR pg_catalog.right(p_expected_image_url,5)<>'.webp'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='current primary image is not a verified same-tenant WebP object; refresh product media first';
  END IF;

  SELECT p.image_url
    INTO v_current_image_url
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_organization
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='product is unavailable in the active organization';
  END IF;
  IF v_current_image_url IS DISTINCT FROM p_expected_image_url THEN
    RAISE EXCEPTION USING ERRCODE='PT409',
      MESSAGE='primary product image changed; reload before retrying';
  END IF;
  IF v_current_image_url IS NOT DISTINCT FROM p_image_url THEN
    RETURN pg_catalog.jsonb_build_object('id',p_product_id,'image_url',p_image_url,'changed',false);
  END IF;

  SELECT pm.id INTO v_gallery_media_id
    FROM public.product_media pm
   WHERE pm.product_id=p_product_id AND pm.url=p_image_url AND pm.is_primary=false
   FOR UPDATE;
  IF v_gallery_media_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='selected image is no longer in this product gallery; refresh before promoting';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(pm.url ORDER BY pm.sort_order,pm.id),'{}'::text[])
    INTO v_old_gallery_order
    FROM public.product_media pm
   WHERE pm.product_id=p_product_id AND pm.is_primary=false;

  DELETE FROM public.product_media pm WHERE pm.id=v_gallery_media_id;
  UPDATE public.products p
     SET image_url=p_image_url,updated_at=pg_catalog.now()
   WHERE p.id=p_product_id AND p.organization_id=v_organization;

  -- Keep the old primary as the final gallery image instead of deleting it.
  IF v_current_image_url IS NOT NULL THEN
    SELECT coalesce(pg_catalog.max(pm.sort_order),-1)+1
      INTO v_next_sort_order
      FROM public.product_media pm
     WHERE pm.product_id=p_product_id AND pm.is_primary=false;
    INSERT INTO public.product_media(product_id,url,alt_text,sort_order,is_primary)
    VALUES(p_product_id,v_current_image_url,NULL,v_next_sort_order,false);
  END IF;

  SELECT coalesce(pg_catalog.array_agg(pm.url ORDER BY pm.sort_order,pm.id),'{}'::text[])
    INTO v_new_gallery_order
    FROM public.product_media pm
   WHERE pm.product_id=p_product_id AND pm.is_primary=false;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_organization,v_actor,'catalog.product_primary_promoted_from_gallery','product',p_product_id,
    pg_catalog.jsonb_build_object('image_url',v_current_image_url,'image_gallery_urls',pg_catalog.to_jsonb(v_old_gallery_order)),
    pg_catalog.jsonb_build_object('image_url',p_image_url,'image_gallery_urls',pg_catalog.to_jsonb(v_new_gallery_order))
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',p_product_id,'image_url',p_image_url,'previous_image_url',v_current_image_url,
    'changed',true,'image_gallery_urls',pg_catalog.to_jsonb(v_new_gallery_order)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.set_staff_product_primary_from_gallery(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_product_primary_from_gallery(uuid,text,text) TO authenticated;

COMMENT ON FUNCTION public.reorder_staff_product_gallery_images(uuid,text[]) IS
  'Reorders the exact existing set of same-tenant WebP gallery images under product row lock. Rejects missing, duplicate or foreign image paths and appends an audit record.';
COMMENT ON FUNCTION public.set_staff_product_primary_from_gallery(uuid,text,text) IS
  'Promotes one existing same-tenant gallery WebP to product primary with optimistic old-primary comparison; preserves the previous primary as the last gallery image and appends an audit record.';

COMMIT;
