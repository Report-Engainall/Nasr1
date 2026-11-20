-- Bounded, tenant-scoped history list for reprinting persisted warehouse receipt snapshots.
CREATE OR REPLACE FUNCTION public.list_customer_return_receipt_print_history(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL
     OR v_actor IS NULL
     OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'administrator or manager permission required to list warehouse return receipt history';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return receipt history limit must be between 1 and 100';
  END IF;

  WITH receipt_rows AS (
    SELECT
      r.id AS receipt_id,
      r.receipt_number,
      r.request_number_snapshot AS request_number,
      r.order_number_snapshot AS order_number,
      r.customer_name_snapshot AS customer_name,
      r.warehouse_name_snapshot AS warehouse_name,
      r.received_at,
      pg_catalog.count(ri.id)::integer AS received_line_count,
      COALESCE(pg_catalog.sum(ri.received_quantity), 0)::numeric(15,3) AS received_quantity,
      COALESCE(pg_catalog.sum(ri.restockable_quantity), 0)::numeric(15,3) AS restockable_quantity,
      COALESCE(pg_catalog.sum(ri.defective_quantity), 0)::numeric(15,3) AS defective_quantity
    FROM public.customer_return_receipts r
    LEFT JOIN public.customer_return_receipt_items ri
      ON ri.receipt_id = r.id AND ri.organization_id = r.organization_id
    WHERE r.organization_id = v_org
    GROUP BY r.id
    ORDER BY r.received_at DESC, r.id DESC
    LIMIT p_limit + 1
  ),
  ranked AS (
    SELECT receipt_rows.*,
      pg_catalog.row_number() OVER (ORDER BY received_at DESC, receipt_id DESC) AS ordinal
    FROM receipt_rows
  )
  SELECT pg_catalog.jsonb_build_object(
    'receipts',
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'receipt_id', receipt_id,
            'receipt_number', receipt_number,
            'request_number', request_number,
            'order_number', order_number,
            'customer_name', customer_name,
            'warehouse_name', warehouse_name,
            'received_at', received_at,
            'received_line_count', received_line_count,
            'received_quantity', received_quantity,
            'restockable_quantity', restockable_quantity,
            'defective_quantity', defective_quantity
          ) ORDER BY ordinal
        ) FILTER (WHERE ordinal <= p_limit),
        '[]'::jsonb
      ),
    'has_more', COALESCE(pg_catalog.bool_or(ordinal > p_limit), false),
    'limit', p_limit
  )
  INTO v_result
  FROM ranked;

  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.list_customer_return_receipt_print_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_customer_return_receipt_print_history(integer) TO authenticated;

COMMENT ON FUNCTION public.list_customer_return_receipt_print_history(integer) IS
  'Returns at most 100 receipt-time history headers for the active organization and operational manager/admin; receipt UUID is used only as a server lookup key and never included in the printable artifact.';
