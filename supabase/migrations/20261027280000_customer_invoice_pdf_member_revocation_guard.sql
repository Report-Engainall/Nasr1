-- AGH-CUSTOMER-INVOICE-PDF-MEMBER-REVOCATION-001
-- Prevent an in-flight financial invoice PDF read from outliving company-member revocation.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_invoice_pdf(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid := public.current_customer_id();
  v_org uuid := public.current_organization_id();
  v_invoice jsonb;
  v_lines jsonb;
  v_customer_document jsonb;
  v_line_count integer;
  v_locked_customer uuid;
  v_show_financial boolean := false;
  v_show_tier boolean := false;
  v_customer_tier text := 'retail';
  v_customer_status text;
  v_tier_label text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_customer IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = v_profile AND p.auth_user_id = auth.uid()
          AND p.is_active AND p.organization_id = v_org
     )
     OR NOT public.current_customer_can('invoices.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='authenticated active customer with invoice-read permission required';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice id required';
  END IF;

  -- Serialize sensitive invoice reads with customer-company member revocation.
  -- The second capability check must see the committed result after a lock wait.
  SELECT c.id
    INTO v_locked_customer
    FROM public.customers c
   WHERE c.id = v_customer
     AND c.organization_id = v_org
   FOR SHARE;

  IF v_locked_customer IS NULL OR NOT public.current_customer_can('invoices.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='authenticated active customer with invoice-read permission required';
  END IF;

  SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
              THEN (s.value #>> '{}')::boolean ELSE false END
    INTO v_show_financial
  FROM public.admin_settings AS s
  WHERE s.organization_id = v_org AND s.key = 'show_price_in_invoice';
  v_show_financial := COALESCE(v_show_financial, false);

  SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
              THEN (s.value #>> '{}')::boolean ELSE false END
    INTO v_show_tier
  FROM public.admin_settings AS s
  WHERE s.organization_id = v_org AND s.key = 'show_customer_tier_in_customer_views';
  v_show_tier := COALESCE(v_show_tier, false);

  SELECT pg_catalog.jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'customer_id', i.customer_id,
    'status', i.status,
    'issued_at', i.issued_at,
    'due_at', i.due_at,
    'currency', i.currency
  ) || CASE WHEN v_show_financial THEN pg_catalog.jsonb_build_object(
    'subtotal', i.subtotal,
    'tax_amount', i.tax_amount,
    'total_amount', i.total_amount
  ) ELSE '{}'::jsonb END
    INTO v_invoice
    FROM public.customer_invoices i
   WHERE i.id = p_invoice_id
     AND i.customer_id = v_customer
     AND i.organization_id = v_org;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='الفاتورة غير موجودة أو غير متاحة لهذا الحساب';
  END IF;

  SELECT count(*)::integer INTO v_line_count
    FROM public.customer_invoice_items i
   WHERE i.invoice_id = p_invoice_id AND i.organization_id = v_org;
  IF v_line_count > 500 THEN
    RAISE EXCEPTION USING ERRCODE='54000', MESSAGE='invoice contains too many lines for a complete PDF';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', i.id,
        'item_code', i.item_code,
        'description', i.description,
        'unit', i.unit,
        'quantity', i.quantity
      ) || CASE WHEN v_show_financial THEN pg_catalog.jsonb_build_object(
        'unit_price', i.unit_price,
        'line_total', i.line_total
      ) ELSE '{}'::jsonb END
      ORDER BY i.created_at, i.id
    ),
    '[]'::jsonb
  ) INTO v_lines
    FROM public.customer_invoice_items i
   WHERE i.invoice_id = p_invoice_id AND i.organization_id = v_org;

  SELECT c.tier, c.status
    INTO v_customer_tier, v_customer_status
  FROM public.customers c
  WHERE c.id = v_customer AND c.organization_id = v_org;

  IF v_customer_status IS DISTINCT FROM 'approved' THEN v_customer_tier := 'retail'; END IF;
  v_tier_label := CASE COALESCE(NULLIF(v_customer_tier, ''), 'retail')
    WHEN 'super_wholesale' THEN 'جملة الجملة'
    WHEN 'wholesale' THEN 'الجملة'
    ELSE 'التجزئة'
  END;

  SELECT pg_catalog.jsonb_build_object(
    'customer_code', c.customer_code,
    'business_name', c.business_name,
    'contact_name', c.contact_name
  ) || CASE WHEN v_show_tier THEN pg_catalog.jsonb_build_object('tier_label', v_tier_label) ELSE '{}'::jsonb END
    INTO v_customer_document
    FROM public.customers c
   WHERE c.id = v_customer AND c.organization_id = v_org;
  IF v_customer_document IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='customer account is not linked to the active profile';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'invoice', v_invoice,
    'lines', v_lines,
    'customer', v_customer_document,
    'financial_details_visible', v_show_financial,
    'customer_tier_visible', v_show_tier
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_invoice_pdf(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_invoice_pdf(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_customer_invoice_pdf(uuid) IS
  'Returns only the active customer''s own invoice, omits financial values according to tenant settings, and locks/re-checks invoices.read after waits so an in-flight PDF read cannot outlive company-member revocation.';

COMMIT;
