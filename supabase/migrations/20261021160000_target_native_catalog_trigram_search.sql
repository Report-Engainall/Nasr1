-- Target-native adaptation of aghbari-commerce 0024_catalog_search_index.
-- Nasr1 uses products.item_code in place of the donor's products.sku.
-- Use Supabase's extensions schema when it exists; isolated PostgreSQL CI may expose
-- pg_trgm in public instead. Index definitions follow the extension's actual namespace.
BEGIN;

DO $trigram$
DECLARE
  v_extension_schema text;
BEGIN
  SELECT n.nspname
    INTO v_extension_schema
    FROM pg_catalog.pg_extension AS e
    JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';

  IF v_extension_schema IS NULL THEN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'extensions') THEN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions';
    ELSE
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public';
    END IF;
    SELECT n.nspname
      INTO v_extension_schema
      FROM pg_catalog.pg_extension AS e
      JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
     WHERE e.extname = 'pg_trgm';
  END IF;

  IF v_extension_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm must be installed before catalog search indexes are created';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE INDEX IF NOT EXISTS products_org_name_trgm_idx ON public.products USING gin (name %I.gin_trgm_ops) WHERE status = %L',
    v_extension_schema, 'active'
  );
  EXECUTE pg_catalog.format(
    'CREATE INDEX IF NOT EXISTS products_org_item_code_trgm_idx ON public.products USING gin (item_code %I.gin_trgm_ops) WHERE status = %L',
    v_extension_schema, 'active'
  );
END;
$trigram$;

COMMENT ON INDEX public.products_org_name_trgm_idx IS
  'Partial trigram index for tenant-scoped active product-name substring search.';
COMMENT ON INDEX public.products_org_item_code_trgm_idx IS
  'Partial trigram index for tenant-scoped active product item-code/SKU substring search.';

COMMIT;
