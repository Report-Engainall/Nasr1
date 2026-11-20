-- Persisted purchase receipt history and a re-printable, tenant-authorized document snapshot.
-- Reading/printing never creates inventory movements or accounting entries.

CREATE OR REPLACE FUNCTION public.fetch_purchase_order_receipt_history(
  p_purchase_order_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_total integer;
  v_receipts jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true;

  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL
     OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'admin or manager role required for purchase receipt history';
  END IF;

  IF p_purchase_order_id IS NULL
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 500000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'valid purchase order and receipt history page are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = p_purchase_order_id AND po.organization_id = v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'purchase order is not available in this organization';
  END IF;

  SELECT count(*)::integer INTO v_total
  FROM public.purchase_receipts r
  WHERE r.organization_id = v_org
    AND r.purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', page.id,
        'receipt_number', page.receipt_number,
        'received_at', page.received_at,
        'item_count', page.item_count
      ) ORDER BY page.received_at DESC, page.id DESC
    ),
    '[]'::jsonb
  ) INTO v_receipts
  FROM (
    SELECT
      r.id,
      r.receipt_number,
      r.received_at,
      count(ri.id)::integer AS item_count
    FROM public.purchase_receipts r
    LEFT JOIN public.purchase_receipt_items ri
      ON ri.organization_id = r.organization_id
      AND ri.receipt_id = r.id
    WHERE r.organization_id = v_org
      AND r.purchase_order_id = p_purchase_order_id
    GROUP BY r.id, r.receipt_number, r.received_at
    ORDER BY r.received_at DESC, r.id DESC
    LIMIT p_limit OFFSET p_offset
  ) page;

  RETURN pg_catalog.jsonb_build_object(
    'receipts', v_receipts,
    'total_count', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_receipts) < v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_purchase_order_receipt_history(uuid, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_order_receipt_history(uuid, integer, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_purchase_receipt_print_data(
  p_receipt_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_receipt public.purchase_receipts%ROWTYPE;
  v_purchase_order_number text;
  v_supplier_name text;
  v_warehouse_name text;
  v_currency text;
  v_line_count integer;
  v_line_costs_complete boolean;
  v_line_total numeric(15,2);
  v_costs_complete boolean;
  v_items jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true;

  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL
     OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'admin or manager role required for purchase receipt printing';
  END IF;

  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'purchase receipt ID is required';
  END IF;

  SELECT r.*
    INTO v_receipt
  FROM public.purchase_receipts r
  WHERE r.id = p_receipt_id
    AND r.organization_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'purchase receipt is not available in this organization';
  END IF;

  SELECT po.purchase_order_number, s.name, w.name, o.currency
    INTO v_purchase_order_number, v_supplier_name, v_warehouse_name, v_currency
  FROM public.purchase_orders po
  JOIN public.suppliers s
    ON s.id = po.supplier_id
   AND s.organization_id = po.organization_id
  JOIN public.warehouses w
    ON w.id = v_receipt.warehouse_id
   AND w.organization_id = v_org
  JOIN public.organizations o
    ON o.id = v_org
   AND o.is_active = true
  WHERE po.id = v_receipt.purchase_order_id
    AND po.organization_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'purchase receipt references are unavailable for printing';
  END IF;

  SELECT
    count(*)::integer,
    COALESCE(bool_and(ri.unit_cost IS NOT NULL AND ri.line_total IS NOT NULL), false),
    sum(ri.line_total)::numeric(15,2)
  INTO v_line_count, v_line_costs_complete, v_line_total
  FROM public.purchase_receipt_items ri
  WHERE ri.organization_id = v_org
    AND ri.receipt_id = v_receipt.id;

  IF v_line_count < 1 OR v_line_count > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'purchase receipt item snapshot is outside the supported range';
  END IF;

  v_costs_complete :=
    v_receipt.received_cost IS NOT NULL
    AND v_line_costs_complete
    AND v_line_total IS NOT DISTINCT FROM v_receipt.received_cost;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'item_code', poi.item_code_snapshot,
      'product_name', poi.product_name_snapshot,
      'unit', poi.unit_snapshot,
      'quantity_received', ri.quantity_received::text,
      'unit_cost', CASE WHEN v_costs_complete THEN ri.unit_cost::text ELSE NULL END,
      'line_total', CASE WHEN v_costs_complete THEN ri.line_total::text ELSE NULL END
    ) ORDER BY poi.product_name_snapshot, poi.item_code_snapshot, poi.id, ri.id
  ) INTO v_items
  FROM public.purchase_receipt_items ri
  JOIN public.purchase_order_items poi
    ON poi.id = ri.purchase_order_item_id
    AND poi.organization_id = ri.organization_id
    AND poi.purchase_order_id = v_receipt.purchase_order_id
  WHERE ri.organization_id = v_org
    AND ri.receipt_id = v_receipt.id;

  IF v_items IS NULL OR pg_catalog.jsonb_array_length(v_items) <> v_line_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'purchase receipt item snapshot is incomplete';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'receipt_number', v_receipt.receipt_number,
    'purchase_order_number', v_purchase_order_number,
    'supplier_name', v_supplier_name,
    'warehouse_name', v_warehouse_name,
    'received_at', v_receipt.received_at,
    'currency', v_currency,
    'costs_complete', v_costs_complete,
    'received_cost', CASE WHEN v_costs_complete THEN v_receipt.received_cost::text ELSE NULL END,
    'items', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_purchase_receipt_print_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_receipt_print_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.fetch_purchase_order_receipt_history(uuid, integer, integer)
  IS 'Lists saved physical receipt identifiers and paging metadata for an active same-tenant admin/manager; never exposes direct receipt-table access.';
COMMENT ON FUNCTION public.get_purchase_receipt_print_data(uuid)
  IS 'Rebuilds a print-only snapshot from a saved receipt for an active same-tenant admin/manager; withholds all costs unless saved receipt lines reconcile exactly.';
