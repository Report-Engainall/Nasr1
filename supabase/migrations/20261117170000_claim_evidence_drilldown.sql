-- Read-only, tenant-scoped, allowlisted source drill-down for intelligence claim passports.
-- This endpoint returns only explicitly selected operational fields; it never returns PII,
-- tenant/warehouse/profile identifiers, costs/margins, storage paths, or document bytes.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_claim_evidence_drilldown(
  p_source_name text,
  p_record_id uuid,
  p_period_from date DEFAULT NULL,
  p_period_to date DEFAULT NULL,
  p_as_of timestamptz DEFAULT NULL,
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
  v_role text;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_count integer := 0;
  v_now timestamptz := statement_timestamp();
  v_period jsonb;
BEGIN
  SELECT p.organization_id, r.role
    INTO v_org, v_role
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id = p.id
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance administrator or manager permission required for claim evidence';
  END IF;

  IF p_source_name IS NULL OR pg_catalog.char_length(p_source_name) NOT BETWEEN 1 AND 100
     OR p_record_id IS NULL OR p_as_of IS NULL
     OR p_as_of > v_now + interval '1 minute'
     OR p_as_of < v_now - interval '365 days'
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
     OR ((p_period_from IS NULL) <> (p_period_to IS NULL))
     OR (p_period_from IS NOT NULL AND (
       p_period_from > p_period_to OR p_period_to - p_period_from > 365
     )) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid claim evidence drill-down source, period, as-of or page offset';
  END IF;

  IF p_period_from IS NOT NULL THEN
    v_period := pg_catalog.jsonb_build_object('from',p_period_from::text,'to',p_period_to::text);
  END IF;

  IF p_source_name NOT IN (
    'customer_invoices',
    'customer_payments',
    'inventory.current_balances',
    'inventory.movement_history',
    'orders.completed_sales_quantity',
    'purchase_receipt_items',
    'purchase_supplier_invoices',
    'purchase_supplier_invoice_due_dates',
    'supplier_payment_open_receipts',
    'cash_expense_commitments',
    'cash_expense_commitment_evidence',
    'finance_cash_account_evidence',
    'finance_cash_opening_balance_reviews'
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','UNSUPPORTED',
      'sourceName',p_source_name,
      'asOf',p_as_of,
      'period',v_period,
      'rows','[]'::jsonb,
      'hasMore',false,
      'nextOffset',NULL,
      'authorization',pg_catalog.jsonb_build_object(
        'tenantScope','SERVER_RESOLVED_AUTHENTICATED_TENANT',
        'effectiveRole',v_role
      ),
      'sideEffects','NONE'
    );
  END IF;

  IF p_source_name = 'customer_invoices' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'invoiceStatus',i.status,
          'issuedAt',i.issued_at,
          'dueAt',i.due_at,
          'totalAmount',i.total_amount::text,
          'currency',i.currency
        ) AS payload, i.issued_at AS sort_at
        FROM public.customer_invoices i
        WHERE i.id=p_record_id
          AND i.organization_id=v_org
          AND i.issued_at<=p_as_of
          AND (p_period_from IS NULL OR i.issued_at::date BETWEEN p_period_from AND p_period_to)
        ORDER BY i.issued_at DESC,i.id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'customer_payments' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'paidAt',p.paid_at,
          'amount',p.amount::text,
          'currency',i.currency
        ) AS payload, p.paid_at AS sort_at
        FROM public.customer_payments p
        JOIN public.customer_invoices i
          ON i.id=p.invoice_id AND i.organization_id=p.organization_id
        WHERE p.id=p_record_id
          AND p.organization_id=v_org
          AND p.paid_at<=p_as_of
          AND (p_period_from IS NULL OR p.paid_at::date BETWEEN p_period_from AND p_period_to)
        ORDER BY p.paid_at DESC,p.id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'inventory.current_balances' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'quantityAvailable',pg_catalog.sum(ib.quantity_available)::text,
          'reorderPoint',pg_catalog.sum(ib.reorder_point)::text,
          'unit',p.unit,
          'warehouseCount',pg_catalog.count(*)::integer,
          'lastUpdatedAt',pg_catalog.max(ib.updated_at)
        ) AS payload
        FROM public.inventory_balances ib
        JOIN public.warehouses w
          ON w.id=ib.warehouse_id AND w.organization_id=v_org
        JOIN public.products p
          ON p.id=ib.product_id AND p.organization_id=v_org
        WHERE ib.product_id=p_record_id
          AND ib.updated_at<=p_as_of
        GROUP BY p.unit
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'inventory.movement_history' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'movementType',m.movement_type,
          'quantity',m.quantity::text,
          'balanceAfter',m.balance_after::text,
          'occurredAt',m.created_at
        ) AS payload, m.created_at AS sort_at
        FROM public.inventory_movements m
        JOIN public.warehouses w
          ON w.id=m.warehouse_id AND w.organization_id=v_org
        JOIN public.products p
          ON p.id=m.product_id AND p.organization_id=v_org
        WHERE m.product_id=p_record_id
          AND m.created_at<=p_as_of
          AND (p_period_from IS NULL OR m.created_at::date BETWEEN p_period_from AND p_period_to)
        ORDER BY m.created_at DESC,m.id DESC
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'orders.completed_sales_quantity' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'quantity',oi.quantity::text,
          'orderStatus',o.status,
          'occurredAt',o.created_at
        ) AS payload, o.created_at AS sort_at
        FROM public.order_items oi
        JOIN public.orders o ON o.id=oi.order_id
        WHERE oi.product_id=p_record_id
          AND o.organization_id=v_org
          AND o.status IN ('delivered','invoiced')
          AND o.created_at<=p_as_of
          AND o.updated_at<=p_as_of
          AND (p_period_from IS NULL OR o.created_at::date BETWEEN p_period_from AND p_period_to)
        ORDER BY o.created_at DESC,o.id DESC
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'purchase_receipt_items' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'receiptNumber',r.receipt_number,
          'receivedAt',r.received_at,
          'quantityReceived',ri.quantity_received::text,
          'unit',poi.unit_snapshot,
          'batchNumber',ri.batch_number,
          'expiryDate',ri.expiry_date
        ) AS payload, r.received_at AS sort_at
        FROM public.purchase_receipt_items ri
        JOIN public.purchase_receipts r
          ON r.id=ri.receipt_id AND r.organization_id=ri.organization_id
        JOIN public.purchase_order_items poi
          ON poi.id=ri.purchase_order_item_id AND poi.organization_id=ri.organization_id
        JOIN public.purchase_orders po
          ON po.id=r.purchase_order_id AND po.organization_id=r.organization_id
        WHERE ri.id=p_record_id
          AND ri.organization_id=v_org
          AND r.received_at<=p_as_of
          AND (p_period_from IS NULL OR r.received_at::date BETWEEN p_period_from AND p_period_to)
        ORDER BY r.received_at DESC,ri.id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'purchase_supplier_invoice_due_dates' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'supplierInvoiceNumber',i.supplier_invoice_number,
          'invoiceDate',i.invoice_date,
          'currency',i.currency,
          'invoiceTotalAmount',i.invoice_total_amount::text,
          'matchStatus',i.match_status,
          'dueDate',d.due_date,
          'recordedAt',d.recorded_at
        ) AS payload, d.recorded_at AS sort_at
        FROM public.purchase_supplier_invoice_due_dates d
        JOIN public.purchase_supplier_invoices i
          ON i.id=d.invoice_id AND i.organization_id=d.organization_id
        WHERE d.id=p_record_id
          AND d.organization_id=v_org
          AND d.recorded_at<=p_as_of
          AND (p_period_from IS NULL OR d.due_date BETWEEN p_period_from AND p_period_to)
        ORDER BY d.recorded_at DESC,d.id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'purchase_supplier_invoices' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'supplierInvoiceNumber',i.supplier_invoice_number,
          'invoiceDate',i.invoice_date,
          'currency',i.currency,
          'invoiceTotalAmount',i.invoice_total_amount::text,
          'matchStatus',i.match_status,
          'createdAt',i.created_at
        ) AS payload, i.created_at AS sort_at
        FROM public.purchase_supplier_invoices i
        WHERE i.id=p_record_id
          AND i.organization_id=v_org
          AND i.created_at<=p_as_of
          AND (p_period_from IS NULL OR i.invoice_date BETWEEN p_period_from AND p_period_to)
        ORDER BY i.created_at DESC,i.id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'supplier_payment_open_receipts' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'receiptNumber',r.receipt_number,
          'receiptDate',r.receipt_date,
          'outstandingPayable',r.outstanding_payable::text,
          'currency',r.currency
        ) AS payload, r.receipt_date::timestamptz AS sort_at
        FROM public.supplier_payment_open_receipts(v_org,NULL,NULL) r
        WHERE r.receipt_id=p_record_id
          AND (p_period_from IS NULL OR r.receipt_date BETWEEN p_period_from AND p_period_to)
        ORDER BY r.receipt_date DESC,r.receipt_id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'cash_expense_commitments' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'category',c.category,
          'description',c.description,
          'amount',c.amount::text,
          'currency',c.currency,
          'paymentMethod',c.payment_method,
          'dueDate',c.due_date,
          'status',c.status,
          'createdAt',c.created_at,
          'approvedAt',c.approved_at,
          'approvalReason',c.approval_reason,
          'paymentRecordedAt',c.payment_recorded_at,
          'settledAt',c.settled_at
        ) AS payload, c.created_at AS sort_at
        FROM public.cash_expense_commitments c
        WHERE c.id=p_record_id
          AND c.organization_id=v_org
          AND c.created_at<=p_as_of
          AND c.updated_at<=p_as_of
          AND (p_period_from IS NULL OR c.due_date BETWEEN p_period_from AND p_period_to)
        ORDER BY c.created_at DESC,c.id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'cash_expense_commitment_evidence' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'fileName',e.file_name,
          'mimeType',e.mime_type,
          'byteSize',e.byte_size::text,
          'contentSha256',e.content_sha256,
          'createdAt',e.created_at
        ) AS payload, e.created_at AS sort_at
        FROM public.cash_expense_commitment_evidence e
        WHERE e.id=p_record_id
          AND e.organization_id=v_org
          AND e.created_at<=p_as_of
        ORDER BY e.created_at DESC,e.id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'finance_cash_account_evidence' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'evidenceKind',e.evidence_kind,
          'fileName',e.file_name,
          'mimeType',e.mime_type,
          'byteSize',e.byte_size::text,
          'contentSha256',e.content_sha256,
          'createdAt',e.created_at
        ) AS payload, e.created_at AS sort_at
        FROM public.finance_cash_account_evidence e
        WHERE e.id=p_record_id
          AND e.organization_id=v_org
          AND e.created_at<=p_as_of
        ORDER BY e.created_at DESC,e.id
        LIMIT 51 OFFSET p_offset
      ) q;

  ELSIF p_source_name = 'finance_cash_opening_balance_reviews' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(q.payload ORDER BY q.sort_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT pg_catalog.jsonb_build_object(
          'asOfDate',p.as_of_date,
          'openingBalance',p.opening_balance::text,
          'currency',p.currency,
          'decision',r.decision,
          'reviewReason',r.reason,
          'postedGlBalance',r.posted_gl_balance::text,
          'postedGlLineCount',r.posted_gl_line_count,
          'reviewedAt',r.reviewed_at
        ) AS payload, r.reviewed_at AS sort_at
        FROM public.finance_cash_opening_balance_proposals p
        JOIN public.finance_cash_opening_balance_reviews r
          ON r.organization_id=p.organization_id AND r.proposal_id=p.id
        WHERE p.id=p_record_id
          AND p.organization_id=v_org
          AND p.created_at<=p_as_of
          AND r.reviewed_at<=p_as_of
        ORDER BY r.reviewed_at DESC,p.id
        LIMIT 51 OFFSET p_offset
      ) q;
  END IF;

  v_count := pg_catalog.jsonb_array_length(v_rows);
  v_has_more := v_count > 50 AND p_offset < 10000;
  IF v_count > 50 THEN
    SELECT coalesce(pg_catalog.jsonb_agg(item.value ORDER BY item.ordinality),'[]'::jsonb)
      INTO v_rows
      FROM pg_catalog.jsonb_array_elements(v_rows) WITH ORDINALITY AS item(value,ordinality)
     WHERE item.ordinality <= 50;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN pg_catalog.jsonb_array_length(v_rows)>0 THEN 'OK' ELSE 'NOT_FOUND' END,
    'sourceName',p_source_name,
    'asOf',p_as_of,
    'period',v_period,
    'rows',v_rows,
    'hasMore',v_has_more,
    'nextOffset',CASE WHEN v_has_more THEN p_offset+50 ELSE NULL END,
    'authorization',pg_catalog.jsonb_build_object(
      'tenantScope','SERVER_RESOLVED_AUTHENTICATED_TENANT',
      'effectiveRole',v_role
    ),
    'sideEffects','NONE'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_claim_evidence_drilldown(text,uuid,date,date,timestamptz,integer)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fetch_claim_evidence_drilldown(text,uuid,date,date,timestamptz,integer)
  TO authenticated;

COMMIT;
