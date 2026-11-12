-- Preserve the business labels printed on a physical return receipt.
-- Later edits to a customer, order or warehouse must not rewrite a historical receipt.
ALTER TABLE public.customer_return_receipts
  ADD COLUMN IF NOT EXISTS request_number_snapshot text,
  ADD COLUMN IF NOT EXISTS order_number_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text,
  ADD COLUMN IF NOT EXISTS warehouse_name_snapshot text;

UPDATE public.customer_return_receipts r
   SET request_number_snapshot = COALESCE(r.request_number_snapshot, rr.request_number),
       order_number_snapshot = COALESCE(r.order_number_snapshot, o.order_number),
       customer_name_snapshot = COALESCE(
         r.customer_name_snapshot,
         NULLIF(pg_catalog.btrim(c.business_name), ''),
         NULLIF(pg_catalog.btrim(c.contact_name), ''),
         NULLIF(pg_catalog.btrim(c.customer_code), ''),
         'عميل غير مسمى'
       ),
       warehouse_name_snapshot = COALESCE(r.warehouse_name_snapshot, w.name)
  FROM public.customer_return_requests rr
  JOIN public.orders o ON o.id = rr.order_id AND o.organization_id = rr.organization_id
  JOIN public.customers c ON c.id = rr.customer_id AND c.organization_id = rr.organization_id
  JOIN public.warehouses w ON w.organization_id = rr.organization_id
 WHERE r.return_request_id = rr.id
   AND r.organization_id = rr.organization_id
   AND w.id = r.warehouse_id
   AND (
     r.request_number_snapshot IS NULL OR
     r.order_number_snapshot IS NULL OR
     r.customer_name_snapshot IS NULL OR
     r.warehouse_name_snapshot IS NULL
   );

ALTER TABLE public.customer_return_receipts
  ALTER COLUMN request_number_snapshot SET NOT NULL,
  ALTER COLUMN order_number_snapshot SET NOT NULL,
  ALTER COLUMN customer_name_snapshot SET NOT NULL,
  ALTER COLUMN warehouse_name_snapshot SET NOT NULL;

CREATE OR REPLACE FUNCTION public.capture_customer_return_receipt_document_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request_number text;
  v_order_number text;
  v_customer_name text;
  v_warehouse_name text;
BEGIN
  SELECT rr.request_number,
         o.order_number,
         COALESCE(
           NULLIF(pg_catalog.btrim(c.business_name), ''),
           NULLIF(pg_catalog.btrim(c.contact_name), ''),
           NULLIF(pg_catalog.btrim(c.customer_code), ''),
           'عميل غير مسمى'
         ),
         w.name
    INTO v_request_number, v_order_number, v_customer_name, v_warehouse_name
    FROM public.customer_return_requests rr
    JOIN public.orders o
      ON o.id = rr.order_id AND o.organization_id = rr.organization_id
    JOIN public.customers c
      ON c.id = rr.customer_id AND c.organization_id = rr.organization_id
    JOIN public.warehouses w
      ON w.id = NEW.warehouse_id AND w.organization_id = NEW.organization_id
   WHERE rr.id = NEW.return_request_id
     AND rr.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = 'receipt source and receiving warehouse must belong to the same organization';
  END IF;

  NEW.request_number_snapshot := v_request_number;
  NEW.order_number_snapshot := v_order_number;
  NEW.customer_name_snapshot := v_customer_name;
  NEW.warehouse_name_snapshot := v_warehouse_name;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.capture_customer_return_receipt_document_snapshots() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_return_receipt_document_snapshots_before_insert
  ON public.customer_return_receipts;
CREATE TRIGGER customer_return_receipt_document_snapshots_before_insert
  BEFORE INSERT ON public.customer_return_receipts
  FOR EACH ROW EXECUTE FUNCTION public.capture_customer_return_receipt_document_snapshots();

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
    'request_number', r.request_number_snapshot,
    'order_number', r.order_number_snapshot,
    'customer_name', r.customer_name_snapshot,
    'warehouse_name', r.warehouse_name_snapshot,
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

COMMENT ON COLUMN public.customer_return_receipts.request_number_snapshot IS
  'Request number as displayed when the physical receipt was created.';
COMMENT ON COLUMN public.customer_return_receipts.order_number_snapshot IS
  'Original order number as displayed when the physical receipt was created.';
COMMENT ON COLUMN public.customer_return_receipts.customer_name_snapshot IS
  'Customer display name as displayed when the physical receipt was created.';
COMMENT ON COLUMN public.customer_return_receipts.warehouse_name_snapshot IS
  'Receiving warehouse display name as displayed when the physical receipt was created.';
COMMENT ON FUNCTION public.get_customer_return_receipt_print_data(uuid) IS
  'Returns the persisted and immutable-label receipt header and item snapshots under live tenant/staff authorization; omits internal IDs, costs, margins and financial posting fields.';
