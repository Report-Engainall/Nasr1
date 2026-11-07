-- Product images are public catalog assets; uploads and deletion are server-mediated.
-- Supabase owns storage.objects (supabase_storage_admin). Do not ALTER that managed table
-- or add application RLS policies to it from this migration.
-- The product-image-upload Edge Function authenticates the caller, checks the active
-- staff profile, role, tenant and product, then uses the server-only service key for writes.
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
END
$product_images$;
