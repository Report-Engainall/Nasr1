-- Customer-wide, keyset-paged return history.
-- Replaces the storefront's per-order RPC fan-out with one scoped page reader.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_my_customer_return_history(
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_customer public.customers%ROWTYPE;
  v_search text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_search,'')));
  v_total_count integer:=0;
  v_requests jsonb:='[]'::jsonb;
  v_has_more boolean:=false;
  v_next_created_at timestamptz;
  v_next_id uuid;
  v_as_of timestamptz:=pg_catalog.now();
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer profile required to read return history';
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers c
   WHERE c.profile_id=v_actor
     AND c.organization_id=v_org
     AND c.status='approved'
   ORDER BY c.created_at,c.id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='approved customer account required to read return history';
  END IF;

  IF p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='return history page size must be between 1 and 50';
  END IF;
  IF (p_after_created_at IS NULL) IS DISTINCT FROM (p_after_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='both return history cursor values must be supplied together';
  END IF;
  IF p_after_created_at IS NOT NULL AND p_after_created_at>v_as_of THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='return history cursor cannot be in the future';
  END IF;
  IF pg_catalog.char_length(v_search)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='return history search must contain 120 characters or fewer';
  END IF;

  -- Treat LIKE metacharacters as ordinary input, not as caller-controlled wildcards.
  v_search:=pg_catalog.replace(v_search,pg_catalog.chr(92),'');
  v_search:=pg_catalog.regexp_replace(v_search,'[%_]','','g');
  v_search:=nullif(v_search,'');

  SELECT pg_catalog.count(*)::integer INTO v_total_count
    FROM public.customer_return_requests r
    JOIN public.orders o
      ON o.id=r.order_id
     AND o.organization_id=r.organization_id
   WHERE r.organization_id=v_org
     AND r.customer_id=v_customer.id
     AND (
       v_search IS NULL
       OR o.order_number ILIKE '%' || v_search || '%'
       OR r.request_number ILIKE '%' || v_search || '%'
       OR r.status ILIKE '%' || v_search || '%'
       OR r.reason ILIKE '%' || v_search || '%'
       OR coalesce(r.notes,'') ILIKE '%' || v_search || '%'
       OR coalesce(r.review_note,'') ILIKE '%' || v_search || '%'
       OR coalesce(r.customer_cancellation_reason,'') ILIKE '%' || v_search || '%'
       OR EXISTS (
         SELECT 1
           FROM public.customer_return_request_items sri
          WHERE sri.organization_id=v_org
            AND sri.return_request_id=r.id
            AND (
              sri.product_name_snapshot ILIKE '%' || v_search || '%'
              OR coalesce(sri.item_code_snapshot,'') ILIKE '%' || v_search || '%'
            )
       )
     );

  WITH scoped AS MATERIALIZED (
    SELECT r.id,r.request_number,r.status,r.reason,r.notes,r.review_note,
           r.customer_cancelled_at,r.customer_cancellation_reason,r.created_at,
           o.id AS order_id,o.order_number,o.status AS order_status,o.created_at AS order_created_at
      FROM public.customer_return_requests r
      JOIN public.orders o
        ON o.id=r.order_id
       AND o.organization_id=r.organization_id
     WHERE r.organization_id=v_org
       AND r.customer_id=v_customer.id
       AND (
         v_search IS NULL
         OR o.order_number ILIKE '%' || v_search || '%'
         OR r.request_number ILIKE '%' || v_search || '%'
         OR r.status ILIKE '%' || v_search || '%'
         OR r.reason ILIKE '%' || v_search || '%'
         OR coalesce(r.notes,'') ILIKE '%' || v_search || '%'
         OR coalesce(r.review_note,'') ILIKE '%' || v_search || '%'
         OR coalesce(r.customer_cancellation_reason,'') ILIKE '%' || v_search || '%'
         OR EXISTS (
           SELECT 1
             FROM public.customer_return_request_items sri
            WHERE sri.organization_id=v_org
              AND sri.return_request_id=r.id
              AND (
                sri.product_name_snapshot ILIKE '%' || v_search || '%'
                OR coalesce(sri.item_code_snapshot,'') ILIKE '%' || v_search || '%'
              )
         )
       )
  ),
  page_plus_one AS MATERIALIZED (
    SELECT *
      FROM scoped
     WHERE p_after_created_at IS NULL
        OR (created_at,id)<(p_after_created_at,p_after_id)
     ORDER BY created_at DESC,id DESC
     LIMIT p_limit+1
  ),
  page AS MATERIALIZED (
    SELECT *
      FROM page_plus_one
     ORDER BY created_at DESC,id DESC
     LIMIT p_limit
  ),
  line_rollup AS (
    SELECT ri.return_request_id,
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'order_item_id',ri.order_item_id,
               'item_code',ri.item_code_snapshot,
               'product_name',ri.product_name_snapshot,
               'unit',ri.unit_snapshot,
               'requested_quantity',ri.requested_quantity
             ) ORDER BY ri.created_at,ri.id
           ) AS items
      FROM public.customer_return_request_items ri
      JOIN page p ON p.id=ri.return_request_id
     WHERE ri.organization_id=v_org
     GROUP BY ri.return_request_id
  )
  SELECT
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'order_id',p.order_id,
          'order_number',p.order_number,
          'order_status',p.order_status,
          'order_created_at',p.order_created_at,
          'request',pg_catalog.jsonb_build_object(
            'id',p.id,
            'request_number',p.request_number,
            'status',p.status,
            'reason',p.reason,
            'notes',p.notes,
            'review_note',p.review_note,
            'customer_cancelled_at',p.customer_cancelled_at,
            'customer_cancellation_reason',p.customer_cancellation_reason,
            'created_at',p.created_at,
            'items',coalesce(l.items,'[]'::jsonb)
          )
        ) ORDER BY p.created_at DESC,p.id DESC
      ),'[]'::jsonb
    ),
    coalesce((SELECT pg_catalog.count(*)>p_limit FROM page_plus_one),false),
    (SELECT last_page.created_at FROM page last_page ORDER BY last_page.created_at ASC,last_page.id ASC LIMIT 1),
    (SELECT last_page.id FROM page last_page ORDER BY last_page.created_at ASC,last_page.id ASC LIMIT 1)
    INTO v_requests,v_has_more,v_next_created_at,v_next_id
    FROM page p
    LEFT JOIN line_rollup l ON l.return_request_id=p.id;

  RETURN pg_catalog.jsonb_build_object(
    'as_of',v_as_of,
    'total_count',v_total_count,
    'page_size',p_limit,
    'has_more',v_has_more,
    'next_cursor',CASE WHEN v_has_more AND v_next_created_at IS NOT NULL
      THEN pg_catalog.jsonb_build_object('created_at',v_next_created_at,'id',v_next_id)
      ELSE NULL END,
    'requests',v_requests,
    'side_effects','NONE'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_customer_return_history(timestamptz,uuid,integer,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_my_customer_return_history(timestamptz,uuid,integer,text)
  TO authenticated;
COMMENT ON FUNCTION public.list_my_customer_return_history(timestamptz,uuid,integer,text) IS
  'Authenticated active approved customer reads their same-tenant return requests directly, with stable descending created_at/id keyset pages and server-side search across request/order/item evidence. Returns no unrelated customer data and performs no writes.';

COMMIT;
