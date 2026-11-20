-- Rename a category without allowing direct authenticated table mutation.
-- Uses the same category-name advisory-lock namespace as create_admin_catalog_category.
CREATE OR REPLACE FUNCTION public.rename_admin_catalog_category(
  p_category_id uuid,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  o uuid := public.current_organization_id();
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_old public.categories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR o IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role IN('admin','manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id=o AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required for catalog commands';
  END IF;

  IF p_category_id IS NULL OR pg_catalog.length(v_name) < 1 OR pg_catalog.length(v_name) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'category id or name is invalid';
  END IF;

  SELECT c.* INTO v_old
  FROM public.categories AS c
  WHERE c.id = p_category_id AND c.organization_id = o
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'category not found in organization';
  END IF;

  IF v_old.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'archived category cannot be renamed';
  END IF;

  -- Serialize creates and renames that target the same normalized tenant/parent/name.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      o::text || ':cat:' || coalesce(v_old.parent_id::text, 'root') || ':' ||
      pg_catalog.lower(v_name),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.categories AS c
    WHERE c.organization_id = o
      AND c.parent_id IS NOT DISTINCT FROM v_old.parent_id
      AND c.is_active = true
      AND c.id <> p_category_id
      AND pg_catalog.lower(pg_catalog.btrim(c.name)) = pg_catalog.lower(v_name)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'active category with the same name already exists under this parent';
  END IF;

  IF v_old.name IS DISTINCT FROM v_name THEN
    UPDATE public.categories
       SET name = v_name
     WHERE id = p_category_id AND organization_id = o;

    INSERT INTO public.audit_logs(
      organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
    ) VALUES (
      o, v_actor, 'catalog.category_renamed', 'category', p_category_id,
      pg_catalog.jsonb_build_object(
        'name', v_old.name,
        'parent_id', v_old.parent_id,
        'code', v_old.code,
        'sort_order', v_old.sort_order,
        'is_active', v_old.is_active
      ),
      pg_catalog.jsonb_build_object(
        'name', v_name,
        'parent_id', v_old.parent_id,
        'code', v_old.code,
        'sort_order', v_old.sort_order,
        'is_active', v_old.is_active
      )
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', p_category_id,
    'name', v_name,
    'renamed', v_old.name IS DISTINCT FROM v_name
  );
END
$function$;

REVOKE ALL ON FUNCTION public.rename_admin_catalog_category(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rename_admin_catalog_category(uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rename_admin_catalog_category(uuid,text) TO authenticated;
