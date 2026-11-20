-- Print and reprint customer-return receipts only from tenant-authorized persisted rows.
-- The client must not reconstruct print evidence from the current queue or submitted form fields.
CREATE OR REPLACE FUNCTION public.get_customer_return_receipt_print_data(p_receipt_id uuid)
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
      MESSAGE = 'administrator or manager permission required to read a return receipt';
  END IF;

  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'receipt id is required';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'receipt_number', r.receipt_number,
    'request_number', rr.request_number,
    'order_number', o.order_number,
    'customer_name', c.business_name,
    'warehouse_name', w.name,
    'received_at', r.received_at,
    'notes', r.notes,
    'received_line_count', pg_catalog.count(ri.id)::integer,
    'received_quantity', COALESCE(pg_catalog.sum(ri.received_quantity), 0)::numeric(15,3),
    'restockable_quantity', COALESCE(pg_catalog.sum(ri.restockable_quantity), 0)::numeric(15,3),
    'defective_quantity', COALESCE(pg_catalog.sum(ri.defective_quantity), 0)::numeric(15,3),
    'lines', COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'item_code', ri.item_code_snapshot,
          'product_name', ri.product_name_snapshot,
          'unit', ri.unit_snapshot,
          'received_quantity', ri.received_quantity,
          'restockable_quantity', ri.restockable_quantity,
          'defective_quantity', ri.defective_quantity
        ) ORDER BY ri.created_at, ri.id
      ) FILTER (WHERE ri.id IS NOT NULL),
      '[]'::jsonb
    )
  )
    INTO v_result
    FROM public.customer_return_receipts r
    JOIN public.customer_return_requests rr
      ON rr.id = r.return_request_id AND rr.organization_id = r.organization_id
    JOIN public.orders o
      ON o.id = rr.order_id AND o.organization_id = rr.organization_id
    JOIN public.customers c
      ON c.id = rr.customer_id AND c.organization_id = rr.organization_id
    JOIN public.warehouses w
      ON w.id = r.warehouse_id AND w.organization_id = r.organization_id
    LEFT JOIN public.customer_return_receipt_items ri
      ON ri.receipt_id = r.id AND ri.organization_id = r.organization_id
   WHERE r.id = p_receipt_id
     AND r.organization_id = v_org
   GROUP BY r.id, rr.request_number, o.order_number, c.business_name, w.name;

  IF v_result IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'receipt was not found in the active organization';
  END IF;

  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.get_customer_return_receipt_print_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_return_receipt_print_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_customer_return_receipt_print_data(uuid) IS
  'Returns a tenant-scoped allowlist of persisted receipt header and item snapshots for printing; excludes internal UUIDs, costs, margins and financial posting fields.';
