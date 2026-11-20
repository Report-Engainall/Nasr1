-- Read-only executive diagnostics for public storefront publication readiness.
-- This function never enables publication or changes catalog, pricing, inventory, or tenant state.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_storefront_publication_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_publication_enabled boolean := false;
  v_warehouse_id uuid;
  v_warehouse_name text;
  v_warehouse_active boolean := false;
  v_updated_at timestamptz;
  v_product_count bigint := 0;
  v_active_product_count bigint := 0;
  v_category_count bigint := 0;
  v_active_category_count bigint := 0;
  v_active_warehouse_count bigint := 0;
  v_blockers text[] := ARRAY[]::text[];
  v_ready boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = v_profile
         AND p.auth_user_id = auth.uid()
         AND p.is_active = true
         AND p.organization_id = v_org
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.user_roles r
       WHERE r.profile_id = v_profile
         AND r.role IN ('admin', 'manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'administrator or manager role required for storefront publication diagnostics';
  END IF;

  SELECT c.is_enabled, c.warehouse_id, c.updated_at
    INTO v_publication_enabled, v_warehouse_id, v_updated_at
  FROM public.storefront_publication_config c
  WHERE c.singleton = true
    AND c.organization_id = v_org
  LIMIT 1;

  SELECT count(*)::bigint,
         count(*) FILTER (WHERE p.status = 'active')::bigint
    INTO v_product_count, v_active_product_count
  FROM public.products p
  WHERE p.organization_id = v_org;

  SELECT count(*)::bigint,
         count(*) FILTER (WHERE c.is_active = true)::bigint
    INTO v_category_count, v_active_category_count
  FROM public.categories c
  WHERE c.organization_id = v_org;

  SELECT count(*)::bigint
    INTO v_active_warehouse_count
  FROM public.warehouses w
  WHERE w.organization_id = v_org
    AND w.is_active = true;

  IF v_warehouse_id IS NOT NULL THEN
    SELECT w.name, w.is_active
      INTO v_warehouse_name, v_warehouse_active
    FROM public.warehouses w
    WHERE w.id = v_warehouse_id
      AND w.organization_id = v_org
    LIMIT 1;
    v_warehouse_active := coalesce(v_warehouse_active, false);
  END IF;

  IF v_active_product_count = 0 THEN
    v_blockers := pg_catalog.array_append(v_blockers, 'لا توجد منتجات نشطة في المؤسسة؛ أضف الأصناف المعتمدة وأسعار شرائحها قبل النشر.');
  END IF;
  IF v_active_category_count = 0 THEN
    v_blockers := pg_catalog.array_append(v_blockers, 'لا توجد تصنيفات نشطة لعرض مجموعات المنتجات في المتجر.');
  END IF;
  IF v_active_warehouse_count = 0 THEN
    v_blockers := pg_catalog.array_append(v_blockers, 'لا يوجد مستودع نشط يمكن ربط توفر المنتجات به.');
  END IF;
  IF v_warehouse_id IS NULL THEN
    v_blockers := pg_catalog.array_append(v_blockers, 'لم يتم تحديد مستودع المتجر العام؛ لا يمكن عرض الكميات المتاحة دون مصدر مخزون محدد.');
  ELSIF NOT v_warehouse_active THEN
    v_blockers := pg_catalog.array_append(v_blockers, 'المستودع المحدد للمتجر العام غير نشط أو لا يتبع المؤسسة الحالية.');
  END IF;

  v_ready := v_active_product_count > 0
    AND v_active_category_count > 0
    AND v_active_warehouse_count > 0
    AND v_warehouse_id IS NOT NULL
    AND v_warehouse_active;

  RETURN pg_catalog.jsonb_build_object(
    'publication_enabled', coalesce(v_publication_enabled, false),
    'ready_to_publish', v_ready,
    'counts', pg_catalog.jsonb_build_object(
      'products', v_product_count,
      'active_products', v_active_product_count,
      'categories', v_category_count,
      'active_categories', v_active_category_count,
      'active_warehouses', v_active_warehouse_count
    ),
    'selected_warehouse_name', v_warehouse_name,
    'selected_warehouse_active', coalesce(v_warehouse_active, false),
    'blockers', to_jsonb(v_blockers),
    'updated_at', v_updated_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_admin_storefront_publication_status()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_storefront_publication_status()
  TO authenticated;

COMMIT;
