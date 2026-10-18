-- Product images are public catalog assets; upload/delete stays within a staff member's tenant.
DO $product_images$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $bucket$
      INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('product-images', 'product-images', true, 8388608, ARRAY['image/webp']::text[])
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = true,
        file_size_limit = 8388608, allowed_mime_types = ARRAY['image/webp']::text[]
    $bucket$;
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS product_images_tenant_insert ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS product_images_tenant_delete ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY product_images_tenant_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'product-images'
        AND public.is_staff()
        AND (storage.foldername(name))[1] = (SELECT p.organization_id FROM public.profiles p WHERE p.id = public.current_profile_id())::text
        AND cardinality(storage.foldername(name)) = 2
        AND EXISTS (SELECT 1 FROM public.products p
          WHERE p.id::text = (storage.foldername(name))[2]
            AND p.organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = public.current_profile_id()))
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY product_images_tenant_delete ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'product-images'
        AND public.is_staff()
        AND (storage.foldername(name))[1] = (SELECT p.organization_id FROM public.profiles p WHERE p.id = public.current_profile_id())::text
        AND cardinality(storage.foldername(name)) = 2
        AND EXISTS (SELECT 1 FROM public.products p
          WHERE p.id::text = (storage.foldername(name))[2]
            AND p.organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = public.current_profile_id()))
      )
    $policy$;
  END IF;
END
$product_images$;
