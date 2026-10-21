-- Target-native adaptation of aghbari-commerce 0024_catalog_search_index.
-- Nasr1 stores SKU-like identifiers in products.item_code and uses status='active'.
-- Preserve tenant/status predicates while supporting substring/similarity search.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS products_org_name_trgm_idx
  ON public.products USING gin (name extensions.gin_trgm_ops)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS products_org_item_code_trgm_idx
  ON public.products USING gin (item_code extensions.gin_trgm_ops)
  WHERE status = 'active';

COMMENT ON INDEX public.products_org_name_trgm_idx IS
  'Partial trigram index for tenant-scoped active product-name substring search.';
COMMENT ON INDEX public.products_org_item_code_trgm_idx IS
  'Partial trigram index for tenant-scoped active product item-code/SKU substring search.';

COMMIT;
