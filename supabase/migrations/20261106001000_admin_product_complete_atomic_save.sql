-- Extend the canonical atomic catalog command so metadata is persisted on both
-- create and edit; the base catalog function remains responsible for all core
-- product validation, tier pricing and its authorization boundary.
CREATE OR REPLACE FUNCTION public.save_admin_product_with_metadata(
  p_product_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_core_payload jsonb;
  v_core_result jsonb;
  v_product_id uuid;
  v_name_en text;
  v_is_featured boolean;
  v_sort_order integer;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff profile required for catalog product save';
  END IF;

  SELECT p.organization_id
  INTO v_org
  FROM public.profiles AS p
  WHERE p.id=v_actor
    AND p.auth_user_id=auth.uid()
    AND p.is_active=true
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active organization membership required for catalog product save';
  END IF;

  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='catalog product payload must be a JSON object';
  END IF;

  IF p_payload ? 'name_en' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'name_en') NOT IN ('string','null')
       OR pg_catalog.length(pg_catalog.coalesce(p_payload->>'name_en','')) > 240 THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='English product name must be at most 240 characters';
    END IF;
    v_name_en := pg_catalog.nullif(pg_catalog.btrim(p_payload->>'name_en'),'');
  END IF;

  IF p_payload ? 'is_featured' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'is_featured') <> 'boolean' THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='featured product flag must be boolean';
    END IF;
    v_is_featured := (p_payload->>'is_featured')::boolean;
  END IF;

  IF p_payload ? 'sort_order' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'sort_order') <> 'number'
       OR (p_payload->>'sort_order') !~ '^(0|[1-9][0-9]{0,5})$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='product display order must be an integer between 0 and 999999';
    END IF;
    v_sort_order := (p_payload->>'sort_order')::integer;
  END IF;

  -- Keep the established catalog command as the only writer for core fields,
  -- stock-related metadata and tier prices. Both calls run in this RPC transaction.
  v_core_payload := p_payload - 'name_en' - 'is_featured' - 'sort_order';
  v_core_result := public.save_admin_catalog_product(p_product_id, v_core_payload);

  IF pg_catalog.jsonb_typeof(v_core_result) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='catalog save returned an invalid result';
  END IF;

  v_product_id := pg_catalog.coalesce(
    pg_catalog.nullif(v_core_result->>'product_id','')::uuid,
    pg_catalog.nullif(v_core_result->>'id','')::uuid
  );

  IF v_product_id IS NULL THEN
    -- The canonical command has historically returned a compact result. Resolve
    -- the just-saved row only inside the authenticated organization if it does
    -- not expose its identifier as a top-level JSON field.
    SELECT p.id
    INTO v_product_id
    FROM public.products AS p
    WHERE p.organization_id=v_org
      AND p.item_code=pg_catalog.nullif(v_core_payload->>'item_code','')
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='catalog command completed without a resolvable product identifier';
  END IF;

  SELECT pg_catalog.to_jsonb(p)
  INTO v_before
  FROM public.products AS p
  WHERE p.id=v_product_id
    AND p.organization_id=v_org
  FOR UPDATE;

  IF v_before IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='saved product is outside the active organization';
  END IF;

  UPDATE public.products AS p
  SET
    name_en = CASE WHEN p_payload ? 'name_en' THEN v_name_en ELSE p.name_en END,
    is_featured = CASE WHEN p_payload ? 'is_featured' THEN v_is_featured ELSE p.is_featured END,
    sort_order = CASE WHEN p_payload ? 'sort_order' THEN v_sort_order ELSE p.sort_order END,
    updated_at = pg_catalog.now()
  WHERE p.id=v_product_id
    AND p.organization_id=v_org
  RETURNING pg_catalog.to_jsonb(p) INTO v_after;

  IF v_after IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='catalog product metadata could not be persisted';
  END IF;

  IF (v_before->'name_en') IS DISTINCT FROM (v_after->'name_en')
     OR (v_before->'is_featured') IS DISTINCT FROM (v_after->'is_featured')
     OR (v_before->'sort_order') IS DISTINCT FROM (v_after->'sort_order') THEN
    INSERT INTO public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
    )
    VALUES (
      v_org,v_actor,'catalog.product.metadata_saved','product',v_product_id,
      pg_catalog.jsonb_build_object(
        'name_en',v_before->'name_en',
        'is_featured',v_before->'is_featured',
        'sort_order',v_before->'sort_order'
      ),
      pg_catalog.jsonb_build_object(
        'name_en',v_after->'name_en',
        'is_featured',v_after->'is_featured',
        'sort_order',v_after->'sort_order'
      )
    );
  END IF;

  RETURN v_core_result || pg_catalog.jsonb_build_object(
    'product_id',v_product_id,
    'name_en',v_after->'name_en',
    'is_featured',v_after->'is_featured',
    'sort_order',v_after->'sort_order'
  );
END
$function$;

REVOKE ALL ON FUNCTION public.save_admin_product_with_metadata(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_product_with_metadata(uuid,jsonb) TO authenticated;
