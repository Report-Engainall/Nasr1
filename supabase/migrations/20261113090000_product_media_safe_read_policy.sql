-- Keep storefront tenant identifiers private while allowing RLS to evaluate
-- product media visibility for anonymous and authenticated browser sessions.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_read_product_media(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.products AS p
    WHERE p.id = p_product_id
      AND (
        (
          p.status = 'active'
          AND p.organization_id = (
            SELECT c.organization_id
            FROM public.storefront_publication_config AS c
            JOIN public.organizations AS org
              ON org.id = c.organization_id
             AND org.is_active = true
            WHERE c.singleton = true
              AND c.is_enabled = true
            LIMIT 1
          )
        )
        OR (
          auth.uid() IS NOT NULL
          AND p.organization_id = public.current_organization_id()
          AND public.is_staff()
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_read_product_media(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_product_media(uuid)
  TO anon, authenticated;

-- Replace the stale policy that directly called the intentionally revoked
-- public_storefront_organization_id() helper. The new helper returns only a
-- boolean decision and does not disclose organization or warehouse identifiers.
DROP POLICY IF EXISTS product_media_tenant_read ON public.product_media;

CREATE POLICY product_media_tenant_read
  ON public.product_media
  FOR SELECT
  TO anon, authenticated
  USING (public.can_read_product_media(product_id));

COMMENT ON FUNCTION public.can_read_product_media(uuid) IS
  'Boolean-only RLS helper: permits media for active products in the enabled public storefront, or staff media in their current tenant. Does not expose tenant or warehouse identifiers.';

-- Migration-time regression assertions: browser roles may call only the narrow
-- boolean helper; the internal storefront context resolvers stay private.
DO $assertions$
DECLARE
  v_security_definer boolean;
  v_search_path_locked boolean;
  v_policy_qual text;
  v_rls_enabled boolean;
BEGIN
  SELECT p.prosecdef,
         coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[]
    INTO v_security_definer, v_search_path_locked
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'public.can_read_product_media(uuid)'::pg_catalog.regprocedure;

  IF v_security_definer IS DISTINCT FROM true OR v_search_path_locked IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'can_read_product_media must be SECURITY DEFINER with an empty search_path';
  END IF;

  IF NOT pg_catalog.has_function_privilege('anon', 'public.can_read_product_media(uuid)'::regprocedure, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.can_read_product_media(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'browser roles must be able to evaluate the narrow product-media RLS helper';
  END IF;

  IF pg_catalog.has_function_privilege('anon', 'public.public_storefront_organization_id()'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.public_storefront_organization_id()'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.public_storefront_warehouse_id()'::regprocedure, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.public_storefront_warehouse_id()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'internal storefront tenant and warehouse resolvers must remain unavailable to browser roles';
  END IF;

  SELECT pol.qual
    INTO v_policy_qual
  FROM pg_catalog.pg_policies AS pol
  WHERE pol.schemaname = 'public'
    AND pol.tablename = 'product_media'
    AND pol.policyname = 'product_media_tenant_read';

  IF v_policy_qual IS NULL OR pg_catalog.strpos(v_policy_qual, 'can_read_product_media') = 0 THEN
    RAISE EXCEPTION 'product_media RLS policy must use the boolean-only tenant-safe helper';
  END IF;

  SELECT c.relrowsecurity
    INTO v_rls_enabled
  FROM pg_catalog.pg_class AS c
  WHERE c.oid = 'public.product_media'::pg_catalog.regclass;

  IF v_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'product_media row-level security must remain enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'product_media'
      AND pol.policyname = 'tenant_relation_scope_product_media'
      AND pol.permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'authenticated product_media tenant relation restriction must remain installed';
  END IF;
END
$assertions$;

COMMIT;
