-- Enforce required product identity fields at the database boundary.
-- The current admin editor also has direct table-write paths, so browser checks alone
-- cannot prevent whitespace-only values from being persisted.
CREATE OR REPLACE FUNCTION public.enforce_product_required_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.name IS NULL OR pg_catalog.btrim(NEW.name) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'product name is required';
  END IF;

  IF NEW.item_code IS NULL OR pg_catalog.btrim(NEW.item_code) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'product code is required';
  END IF;

  NEW.name := pg_catalog.btrim(NEW.name);
  NEW.item_code := pg_catalog.btrim(NEW.item_code);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS products_required_fields_guard ON public.products;
CREATE TRIGGER products_required_fields_guard
BEFORE INSERT OR UPDATE OF name, item_code ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_product_required_fields();
