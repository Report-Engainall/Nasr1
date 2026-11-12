-- Durable, tenant-scoped printable snapshots for atomic multi-invoice customer receipts.
BEGIN;

ALTER TABLE public.customer_payment_receipts
  ADD COLUMN IF NOT EXISTS receipt_number bigint GENERATED ALWAYS AS IDENTITY;

CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_receipts_org_number_uidx
  ON public.customer_payment_receipts (organization_id, receipt_number);
CREATE INDEX IF NOT EXISTS customer_payment_receipts_org_paid_at_idx
  ON public.customer_payment_receipts (organization_id, paid_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.get_customer_payment_receipt_print_options(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_organization_name text;
  v_total bigint;
  v_receipts jsonb;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.can_manage_finance()
     OR NOT EXISTS (
       SELECT 1
         FROM public.user_roles r
        WHERE r.profile_id = v_actor
          AND r.role IN ('admin', 'manager', 'accountant')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'finance permission required to list customer payment receipts';
  END IF;

  SELECT NULLIF(pg_catalog.btrim(o.name), '')
    INTO v_organization_name
    FROM public.organizations o
   WHERE o.id = v_org
     AND o.is_active = true;
  IF v_organization_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'active organization identity is unavailable for receipt printing';
  END IF;

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'receipt print page must use a limit of 1..200 and an offset of 0..10000000';
  END IF;

  SELECT pg_catalog.count(*)
    INTO v_total
    FROM public.customer_payment_receipts r
   WHERE r.organization_id = v_org;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', page.id::text,
        'receipt_number', page.receipt_number::text,
        'customer_code', page.customer_code,
        'customer_name', page.customer_name,
        'currency', page.currency,
        'total_amount', page.total_amount::text,
        'allocation_count', page.allocation_count,
        'paid_at', page.paid_at,
        'payment_method', page.payment_method,
        'reference', page.reference
      )
      ORDER BY page.paid_at DESC, page.id DESC
    ),
    '[]'::jsonb
  )
    INTO v_receipts
    FROM (
      SELECT
        r.id,
        r.receipt_number,
        c.customer_code,
        COALESCE(
          NULLIF(pg_catalog.btrim(c.business_name), ''),
          NULLIF(pg_catalog.btrim(c.contact_name), ''),
          'عميل غير مسمى'
        ) AS customer_name,
        r.currency,
        r.total_amount,
        r.allocation_count,
        r.paid_at,
        r.payment_method,
        r.reference
      FROM public.customer_payment_receipts r
      JOIN public.customers c
        ON c.id = r.customer_id
       AND c.organization_id = r.organization_id
      WHERE r.organization_id = v_org
      ORDER BY r.paid_at DESC, r.id DESC
      LIMIT p_limit
      OFFSET p_offset
    ) AS page;

  RETURN pg_catalog.jsonb_build_object(
    'organization_name', v_organization_name,
    'receipts', v_receipts,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', v_total > (p_offset::bigint + p_limit::bigint)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_customer_payment_receipt_print_data(
  p_receipt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_organization_name text;
  v_receipt public.customer_payment_receipts%ROWTYPE;
  v_customer jsonb;
  v_allocations jsonb;
  v_allocation_count integer;
  v_distinct_invoice_count integer;
  v_allocation_total numeric(15,2);
  v_invalid_allocation_count integer;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.can_manage_finance()
     OR NOT EXISTS (
       SELECT 1
         FROM public.user_roles r
        WHERE r.profile_id = v_actor
          AND r.role IN ('admin', 'manager', 'accountant')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'finance permission required to print a customer payment receipt';
  END IF;

  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'customer payment receipt id is required';
  END IF;

  SELECT r.*
    INTO v_receipt
    FROM public.customer_payment_receipts r
   WHERE r.id = p_receipt_id
     AND r.organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'customer payment receipt was not found in the active organization';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT cp.invoice_id)::integer,
    COALESCE(pg_catalog.sum(cp.amount), 0)::numeric(15,2),
    pg_catalog.count(*) FILTER (
      WHERE cp.amount <= 0
         OR cp.customer_id IS DISTINCT FROM v_receipt.customer_id
         OR invoice.id IS NULL
         OR invoice.currency IS DISTINCT FROM v_receipt.currency
    )::integer
    INTO
      v_allocation_count,
      v_distinct_invoice_count,
      v_allocation_total,
      v_invalid_allocation_count
    FROM public.customer_payments cp
    LEFT JOIN public.customer_invoices invoice
      ON invoice.id = cp.invoice_id
     AND invoice.organization_id = cp.organization_id
     AND invoice.customer_id = cp.customer_id
   WHERE cp.organization_id = v_org
     AND cp.receipt_id = v_receipt.id;

  IF v_receipt.receipt_number IS NULL
     OR v_allocation_count <> v_receipt.allocation_count
     OR v_allocation_count NOT BETWEEN 2 AND 50
     OR v_distinct_invoice_count <> v_allocation_count
     OR v_invalid_allocation_count <> 0
     OR v_allocation_total IS DISTINCT FROM v_receipt.total_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'receipt allocations do not reconcile to the saved receipt header; printing was denied';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', c.id::text,
    'customer_code', c.customer_code,
    'business_name', c.business_name,
    'contact_name', c.contact_name
  )
    INTO v_customer
    FROM public.customers c
   WHERE c.id = v_receipt.customer_id
     AND c.organization_id = v_org;
  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'receipt customer was not found in the active organization';
  END IF;

  SELECT NULLIF(pg_catalog.btrim(o.name), '')
    INTO v_organization_name
    FROM public.organizations o
   WHERE o.id = v_org
     AND o.is_active = true;
  IF v_organization_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'active organization identity is unavailable for receipt printing';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'invoice_number', invoice.invoice_number,
        'invoice_issued_at', invoice.issued_at,
        'currency', invoice.currency,
        'amount', cp.amount::text
      )
      ORDER BY invoice.issued_at, invoice.invoice_number, cp.id
    ),
    '[]'::jsonb
  )
    INTO v_allocations
    FROM public.customer_payments cp
    JOIN public.customer_invoices invoice
      ON invoice.id = cp.invoice_id
     AND invoice.organization_id = cp.organization_id
     AND invoice.customer_id = cp.customer_id
   WHERE cp.organization_id = v_org
     AND cp.customer_id = v_receipt.customer_id
     AND cp.receipt_id = v_receipt.id;

  IF pg_catalog.jsonb_array_length(v_allocations) <> v_receipt.allocation_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'receipt allocation details are incomplete; printing was denied';
  END IF;

  -- Deliberately omit private notes, idempotency keys, raw organization IDs and internal payment IDs.
  RETURN pg_catalog.jsonb_build_object(
    'organization_name', v_organization_name,
    'receipt', pg_catalog.jsonb_build_object(
      'id', v_receipt.id::text,
      'receipt_number', v_receipt.receipt_number::text,
      'currency', v_receipt.currency,
      'total_amount', v_receipt.total_amount::text,
      'allocation_count', v_receipt.allocation_count,
      'payment_method', v_receipt.payment_method,
      'reference', v_receipt.reference,
      'paid_at', v_receipt.paid_at
    ),
    'customer', v_customer,
    'allocations', v_allocations
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_payment_receipt_print_options(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_payment_receipt_print_options(integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_staff_customer_payment_receipt_print_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_customer_payment_receipt_print_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_customer_payment_receipt_print_options(integer,integer) IS
  'Paginated, tenant-derived selector for saved multi-invoice customer receipts. Excludes notes and idempotency metadata.';
COMMENT ON FUNCTION public.get_staff_customer_payment_receipt_print_data(uuid) IS
  'Finance-only receipt print snapshot. Reconciles allocation count, unique invoices, currency and exact total before returning a customer-facing allowlist.';

COMMIT;
