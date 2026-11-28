CREATE INDEX IF NOT EXISTS customer_return_requests_review_queue_cursor_idx
  ON public.customer_return_requests (organization_id, created_at, id)
  WHERE status IN ('submitted', 'under_review');

CREATE OR REPLACE FUNCTION public.list_customer_return_review_queue_page(
  p_limit integer DEFAULT 50,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid := public.current_organization_id();
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  v_status text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, ''))), '');
  v_items jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_has_more boolean := false;
  v_next_created_at timestamptz;
  v_next_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'administrator or manager permission required to review customer returns';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return review page limit must be between 1 and 100';
  END IF;

  IF (p_after_created_at IS NULL) <> (p_after_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'both return review cursor values must be supplied together';
  END IF;

  IF v_search IS NOT NULL AND pg_catalog.char_length(v_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return review search must be 120 characters or fewer';
  END IF;

  IF v_status IS NOT NULL AND v_status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported return review queue status';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT
      r.id,
      r.request_number,
      r.status,
      r.reason,
      r.notes,
      r.created_at,
      r.order_id,
      o.order_number,
      c.business_name AS customer_name,
      c.customer_code
    FROM public.customer_return_requests r
    JOIN public.orders o ON o.id = r.order_id AND o.organization_id = r.organization_id
    JOIN public.customers c ON c.id = r.customer_id AND c.organization_id = r.organization_id
    WHERE r.organization_id = v_org
      AND r.status IN ('submitted', 'under_review')
      AND (v_status IS NULL OR r.status = v_status)
      AND (
        v_search IS NULL
        OR pg_catalog.strpos(pg_catalog.lower(r.request_number), pg_catalog.lower(v_search)) > 0
        OR pg_catalog.strpos(pg_catalog.lower(o.order_number), pg_catalog.lower(v_search)) > 0
        OR pg_catalog.strpos(pg_catalog.lower(coalesce(c.business_name, '')), pg_catalog.lower(v_search)) > 0
        OR pg_catalog.strpos(pg_catalog.lower(coalesce(c.customer_code, '')), pg_catalog.lower(v_search)) > 0
        OR pg_catalog.strpos(pg_catalog.lower(coalesce(r.notes, '')), pg_catalog.lower(v_search)) > 0
        OR EXISTS (
          SELECT 1
          FROM public.customer_return_request_items ri
          WHERE ri.return_request_id = r.id
            AND ri.organization_id = v_org
            AND (
              pg_catalog.strpos(pg_catalog.lower(coalesce(ri.item_code_snapshot, '')), pg_catalog.lower(v_search)) > 0
              OR pg_catalog.strpos(pg_catalog.lower(coalesce(ri.product_name_snapshot, '')), pg_catalog.lower(v_search)) > 0
            )
        )
      )
  ),
  page AS MATERIALIZED (
    SELECT *
    FROM filtered
    WHERE p_after_created_at IS NULL
       OR (created_at, id) > (p_after_created_at, p_after_id)
    ORDER BY created_at, id
    LIMIT p_limit + 1
  ),
  visible AS MATERIALIZED (
    SELECT *
    FROM page
    ORDER BY created_at, id
    LIMIT p_limit
  )
  SELECT
    coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', visible.id,
          'request_number', visible.request_number,
          'status', visible.status,
          'reason', visible.reason,
          'notes', visible.notes,
          'created_at', visible.created_at,
          'order_id', visible.order_id,
          'order_number', visible.order_number,
          'customer_name', visible.customer_name,
          'customer_code', visible.customer_code,
          'items', coalesce((
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'item_code', ri.item_code_snapshot,
                'product_name', ri.product_name_snapshot,
                'unit', ri.unit_snapshot,
                'requested_quantity', ri.requested_quantity
              )
              ORDER BY ri.id
            )
            FROM public.customer_return_request_items ri
            WHERE ri.return_request_id = visible.id
              AND ri.organization_id = v_org
          ), '[]'::jsonb)
        )
        ORDER BY visible.created_at, visible.id
      )
      FROM visible
    ), '[]'::jsonb),
    (SELECT pg_catalog.count(*) FROM filtered),
    (SELECT pg_catalog.count(*) > p_limit FROM page),
    (SELECT created_at FROM visible ORDER BY created_at DESC, id DESC LIMIT 1),
    (SELECT id FROM visible ORDER BY created_at DESC, id DESC LIMIT 1)
  INTO v_items, v_total, v_has_more, v_next_created_at, v_next_id;

  IF v_has_more AND (v_next_created_at IS NULL OR v_next_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'return review page cursor could not be established';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'items', v_items,
    'total_count', v_total,
    'page_size', p_limit,
    'has_more', v_has_more,
    'next_cursor', CASE
      WHEN v_has_more THEN pg_catalog.jsonb_build_object('created_at', v_next_created_at, 'id', v_next_id)
      ELSE NULL
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_customer_return_review_queue_page(integer, timestamptz, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_customer_return_review_queue_page(integer, timestamptz, uuid, text, text) TO authenticated;
