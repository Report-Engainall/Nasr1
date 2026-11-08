-- Public-safe storefront category projection.
-- Never grant browser roles access to tenant/warehouse resolver helpers.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_storefront_categories()
RETURNS TABLE (
  id uuid,
  name text,
  code text,
  parent_id uuid,
  sort_order integer,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    c.id,
    c.name,
    c.code,
    c.parent_id,
    c.sort_order,
    c.is_active
  FROM public.categories AS c
  WHERE c.organization_id = public.public_storefront_organization_id()
    AND c.is_active = true
  ORDER BY c.sort_order ASC, c.name ASC, c.id ASC;
$function$;

-- Keep the internal tenant resolver private. The new RPC returns only public category fields.
REVOKE ALL ON FUNCTION public.get_public_storefront_categories()
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_categories()
  TO anon;

COMMIT;
