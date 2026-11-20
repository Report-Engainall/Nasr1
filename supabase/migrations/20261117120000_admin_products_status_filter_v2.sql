BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_products_page_v2(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 40,
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_category_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_can_view_internal_prices boolean := false;
  v_page integer := coalesce(p_page,1);
  v_page_size integer := coalesce(p_page_size,40);
  v_offset integer;
  v_search text := pg_catalog.btrim(coalesce(p_search,''));
  v_search_pattern text;
  v_items jsonb := '[]'::jsonb;
  v_has_next boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated staff session required';
  END IF;
  IF v_page<1 OR v_page>2500 OR v_page_size<1 OR v_page_size>50
     OR p_status IS NULL OR p_status NOT IN ('all','active','inactive')
     OR pg_catalog.length(coalesce(p_search,''))>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid product administration page arguments';
  END IF;

  SELECT p.id,p.organization_id INTO v_profile_id,v_organization_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.auth_user_id=auth.uid() AND p.is_active=true AND p.organization_id IS NOT NULL
   ORDER BY p.created_at,p.id LIMIT 1;

  IF v_profile_id IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','staff')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization staff membership required';
  END IF;

  v_can_view_internal_prices := public.current_actor_has_capability('catalog.internal_prices.read');
  v_offset := (v_page-1)*v_page_size;
  v_search_pattern := pg_catalog.replace(
    pg_catalog.replace(pg_catalog.replace(v_search,E'\\',E'\\\\'),'%',
      E'\\%'),
    '_',E'\\_'
  );

  WITH page_rows AS MATERIALIZED (
    SELECT p.id,p.category_id,p.name,p.name_en,p.item_code,p.sku,p.barcode,p.description,
      p.unit,p.status,p.image_url,p.base_price,p.min_stock,p.created_at,
      p.min_order_quantity,p.order_quantity_multiple,p.is_featured,p.sort_order
    FROM public.products p
    WHERE p.organization_id=v_organization_id
      AND (p_category_id IS NULL OR p.category_id=p_category_id)
      AND (p_status='all' OR p.status=p_status)
      AND (
        v_search=''
        OR p.name ILIKE ('%'||v_search_pattern||'%') ESCAPE E'\\'
        OR p.item_code ILIKE ('%'||v_search_pattern||'%') ESCAPE E'\\'
        OR coalesce(p.sku,'') ILIKE ('%'||v_search_pattern||'%') ESCAPE E'\\'
        OR coalesce(p.barcode,'') ILIKE ('%'||v_search_pattern||'%') ESCAPE E'\\'
      )
    ORDER BY p.name,p.id
    OFFSET v_offset
    LIMIT (v_page_size+1)
  ),
  numbered_rows AS MATERIALIZED (
    SELECT r.*,pg_catalog.row_number() OVER(ORDER BY r.name,r.id) AS row_number
    FROM page_rows r
  )
  SELECT
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',r.id,'category_id',r.category_id,'name',r.name,'name_en',r.name_en,
          'item_code',r.item_code,'sku',r.sku,'barcode',r.barcode,'description',r.description,
          'unit',r.unit,'status',r.status,'image_url',r.image_url,'min_stock',r.min_stock,
          'created_at',r.created_at,'min_order_quantity',r.min_order_quantity,
          'order_quantity_multiple',r.order_quantity_multiple,'is_featured',r.is_featured,
          'sort_order',r.sort_order
        ) ||
        CASE WHEN v_can_view_internal_prices
          THEN pg_catalog.jsonb_build_object('base_price',r.base_price)
          ELSE '{}'::jsonb
        END
        ORDER BY r.row_number
      ) FILTER (WHERE r.row_number<=v_page_size),
      '[]'::jsonb
    ),
    coalesce(pg_catalog.bool_or(r.row_number>v_page_size),false)
    INTO v_items,v_has_next
    FROM numbered_rows r;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,'page',v_page,'page_size',v_page_size,'has_next_page',v_has_next
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_admin_products_page_v2(integer,integer,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_products_page_v2(integer,integer,text,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.get_admin_products_page_v2(integer,integer,text,text,uuid) IS
  'Tenant-derived PostgreSQL product administration pagination v2; applies literal all/active/inactive status and category filters before LIMIT and JSON aggregation, and omits base_price unless authorized.';

COMMIT;
