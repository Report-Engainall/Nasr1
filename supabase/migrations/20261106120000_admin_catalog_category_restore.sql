-- Restore an archived category through the same audited, tenant-scoped catalog command family.
-- An active category with the same normalized name under the same parent wins: restore returns a
-- conflict instead of creating duplicate active names or silently merging category identities.
CREATE OR REPLACE FUNCTION public.restore_admin_catalog_category(p_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_category public.categories%ROWTYPE;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role IN ('admin', 'manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager profile required for catalog commands';
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'category id is required';
  END IF;

  SELECT c.* INTO v_category
  FROM public.categories AS c
  WHERE c.id = p_category_id AND c.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'category not found in organization';
  END IF;

  IF v_category.is_active = true THEN
    RETURN pg_catalog.jsonb_build_object(
      'id', p_category_id, 'is_active', true, 'restored', false
    );
  END IF;

  IF v_category.parent_id IS NOT NULL THEN
    PERFORM 1
    FROM public.categories AS parent
    WHERE parent.id = v_category.parent_id
      AND parent.organization_id = v_org
      AND parent.is_active = true
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503',
        MESSAGE = 'parent category must be restored before this category';
    END IF;
  END IF;

  -- Serialize with the existing create/rename commands for the same tenant/name.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_org::text || ':cat:' ||
      coalesce(v_category.parent_id::text, 'root') || ':' ||
      pg_catalog.lower(pg_catalog.btrim(v_category.name)),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.categories AS active_category
    WHERE active_category.organization_id = v_org
      AND active_category.parent_id IS NOT DISTINCT FROM v_category.parent_id
      AND active_category.is_active = true
      AND active_category.id <> p_category_id
      AND pg_catalog.lower(pg_catalog.btrim(active_category.name))
        = pg_catalog.lower(pg_catalog.btrim(v_category.name))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'an active category with the same name already exists under this parent';
  END IF;

  UPDATE public.categories AS c
  SET is_active = true
  WHERE c.id = p_category_id AND c.organization_id = v_org
    AND c.is_active = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'category state changed while restore was being applied';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_actor, 'catalog.category_restored', 'category', p_category_id,
    pg_catalog.jsonb_build_object(
      'name', v_category.name,
      'parent_id', v_category.parent_id,
      'code', v_category.code,
      'is_active', false
    ),
    pg_catalog.jsonb_build_object(
      'name', v_category.name,
      'parent_id', v_category.parent_id,
      'code', v_category.code,
      'is_active', true
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_category_id, 'is_active', true, 'restored', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.restore_admin_catalog_category(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_admin_catalog_category(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_admin_catalog_category(uuid) TO authenticated;
