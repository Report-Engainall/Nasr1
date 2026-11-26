-- Tenant-scoped supplier invoice search/status filtering before LIMIT/OFFSET.
-- Legacy three-argument workspace RPC remains intact for existing consumers.
BEGIN;
CREATE OR REPLACE FUNCTION public.normalize_supplier_invoice_search(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=''
AS $function$
 SELECT pg_catalog.btrim(pg_catalog.regexp_replace(
   pg_catalog.translate(
     pg_catalog.lower(pg_catalog.regexp_replace(coalesce(p_value,''),U&'[\064B-\065F\0670\0640]','','g')),
     'أإآٱى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
     'ااااي01234567890123456789'
   ),
   '[[:space:]]+',' ','g'
 ));
$function$;
REVOKE ALL ON FUNCTION public.normalize_supplier_invoice_search(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_invoice_workspace_filtered(
  p_purchase_order_id uuid,
  p_limit integer,
  p_offset integer,
  p_search text,
  p_match_status text
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
  v_orders jsonb;
  v_receivable_lines jsonb;
  v_invoices jsonb;
  v_invoice_count integer;
  v_search text;
  v_status text;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for supplier invoice workspace';
  END IF;
  IF (p_purchase_order_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.purchase_orders po
       WHERE po.id=p_purchase_order_id AND po.organization_id=v_org
     ))
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 2147483647-p_limit
     OR (p_search IS NOT NULL AND char_length(p_search)>120)
     OR (p_match_status IS NOT NULL AND p_match_status NOT IN ('all','matched','variance_pending','variance_approved','variance_rejected')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice search, status or pagination is invalid';
  END IF;
  v_search:=nullif(public.normalize_supplier_invoice_search(coalesce(p_search,'')),'');
  v_status:=CASE WHEN p_match_status IS NULL OR p_match_status='all' THEN NULL ELSE p_match_status END;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',po.id,'purchase_order_number',po.purchase_order_number,'supplier_id',s.id,
    'supplier_name',s.name,'status',po.status,'currency',org.currency
  ) ORDER BY po.created_at DESC,po.purchase_order_number DESC),'[]'::jsonb)
  INTO v_orders
  FROM public.purchase_orders po
  JOIN public.suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
  JOIN public.organizations org ON org.id=po.organization_id
  WHERE po.organization_id=v_org AND po.status IN ('submitted','partially_received','received')
    AND (p_purchase_order_id IS NULL OR po.id=p_purchase_order_id)
    AND EXISTS (
      SELECT 1 FROM public.purchase_receipts r
      JOIN public.purchase_receipt_items ri
        ON ri.receipt_id=r.id AND ri.organization_id=r.organization_id
      WHERE r.organization_id=v_org AND r.purchase_order_id=po.id
    );

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.received_at DESC,q.receipt_number DESC,q.receipt_item_id),'[]'::jsonb)
  INTO v_receivable_lines
  FROM (
    SELECT
      po.id AS purchase_order_id,po.purchase_order_number,s.id AS supplier_id,s.name AS supplier_name,
      org.currency,r.id AS receipt_id,r.receipt_number,r.received_at,ri.id AS receipt_item_id,
      poi.id AS purchase_order_item_id,ri.product_id,poi.item_code_snapshot,poi.product_name_snapshot,
      poi.unit_snapshot,ri.quantity_received AS source_received_quantity,
      coalesce(billed.invoiced_quantity,0)::numeric(15,3) AS invoiced_quantity,
      (ri.quantity_received-coalesce(billed.invoiced_quantity,0))::numeric(15,3) AS remaining_to_invoice,
      poi.unit_cost AS ordered_unit_cost,ri.unit_cost AS received_unit_cost,ri.line_total AS received_line_total,
      (poi.unit_cost IS NOT NULL AND ri.unit_cost IS NOT NULL AND ri.line_total IS NOT NULL) AS source_cost_complete
    FROM public.purchase_receipts r
    JOIN public.purchase_orders po ON po.id=r.purchase_order_id AND po.organization_id=r.organization_id
    JOIN public.suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
    JOIN public.organizations org ON org.id=po.organization_id
    JOIN public.purchase_receipt_items ri ON ri.receipt_id=r.id AND ri.organization_id=r.organization_id
    JOIN public.purchase_order_items poi ON poi.id=ri.purchase_order_item_id AND poi.organization_id=ri.organization_id
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(line.invoiced_quantity),0)::numeric(15,3) AS invoiced_quantity
      FROM public.purchase_supplier_invoice_lines line
      JOIN public.purchase_supplier_invoices inv
        ON inv.id=line.invoice_id AND inv.organization_id=line.organization_id
      WHERE line.organization_id=v_org AND line.receipt_item_id=ri.id
        AND inv.match_status<>'variance_rejected'
    ) billed ON true
    WHERE r.organization_id=v_org AND po.status IN ('submitted','partially_received','received')
      AND (p_purchase_order_id IS NULL OR po.id=p_purchase_order_id)
      AND ri.quantity_received>coalesce(billed.invoiced_quantity,0)
    ORDER BY r.received_at DESC,r.receipt_number DESC,ri.id
    LIMIT 500
  ) q;

  SELECT count(*)::integer INTO v_invoice_count
  FROM public.purchase_supplier_invoices i
  JOIN public.purchase_orders po ON po.id=i.purchase_order_id AND po.organization_id=i.organization_id
  JOIN public.suppliers s ON s.id=i.supplier_id AND s.organization_id=i.organization_id
  WHERE i.organization_id=v_org
    AND (p_purchase_order_id IS NULL OR i.purchase_order_id=p_purchase_order_id)
    AND (v_status IS NULL OR i.match_status=v_status)
    AND (
      v_search IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.unnest(pg_catalog.string_to_array(v_search,' ')) AS term(value)
        WHERE term.value<>'' AND pg_catalog.strpos(
          public.normalize_supplier_invoice_search(pg_catalog.concat_ws(' ',
            i.id::text,s.name,i.supplier_invoice_number,po.purchase_order_number,i.invoice_date::text
          )),
          term.value
        )=0
      )
    );

  SELECT coalesce(jsonb_agg(q.invoice_row ORDER BY q.invoice_date DESC,q.created_at DESC,q.invoice_id DESC),'[]'::jsonb)
  INTO v_invoices
  FROM (
    SELECT
      i.id AS invoice_id,i.invoice_date,i.created_at,
      jsonb_build_object(
        'id',i.id,'purchase_order_id',i.purchase_order_id,'purchase_order_number',po.purchase_order_number,
        'supplier_id',i.supplier_id,'supplier_name',s.name,
        'supplier_invoice_number',i.supplier_invoice_number,'invoice_date',i.invoice_date,'currency',i.currency,
        'merchandise_subtotal',i.merchandise_subtotal::text,'tax_amount',i.tax_amount::text,
        'invoice_total_amount',i.invoice_total_amount::text,
        'expected_merchandise_subtotal',i.expected_merchandise_subtotal::text,
        'merchandise_variance_amount',i.merchandise_variance_amount::text,
        'match_status',i.match_status,'tax_accounting_status',i.tax_accounting_status,
        'created_by_profile_id',i.created_by_profile_id,'created_at',i.created_at,
        'reviewed_by_profile_id',i.reviewed_by_profile_id,'reviewed_at',i.reviewed_at,'review_reason',i.review_reason,
        'lines',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id',line.id,'receipt_id',line.receipt_id,'receipt_number',r.receipt_number,
            'receipt_item_id',line.receipt_item_id,'purchase_order_item_id',line.purchase_order_item_id,
            'product_id',line.product_id,'item_code',line.item_code_snapshot,'product_name',line.product_name_snapshot,
            'unit',line.unit_snapshot,'source_received_quantity',line.source_received_quantity::text,
            'invoiced_quantity',line.invoiced_quantity::text,'ordered_unit_cost',line.ordered_unit_cost::text,
            'received_unit_cost',line.received_unit_cost::text,'invoiced_unit_cost',line.invoiced_unit_cost::text,
            'expected_line_total',line.expected_line_total::text,'actual_line_total',line.actual_line_total::text,
            'price_match',line.price_match
          ) ORDER BY r.receipt_number,line.id)
          FROM public.purchase_supplier_invoice_lines line
          JOIN public.purchase_receipts r ON r.id=line.receipt_id AND r.organization_id=line.organization_id
          WHERE line.organization_id=i.organization_id AND line.invoice_id=i.id
        ),'[]'::jsonb),
        'history',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'action',event.action,'actor_profile_id',event.actor_profile_id,
            'reason',event.reason,'created_at',event.created_at
          ) ORDER BY event.created_at,event.id)
          FROM public.purchase_supplier_invoice_events event
          WHERE event.organization_id=i.organization_id AND event.invoice_id=i.id
        ),'[]'::jsonb)
      ) AS invoice_row
    FROM public.purchase_supplier_invoices i
    JOIN public.purchase_orders po ON po.id=i.purchase_order_id AND po.organization_id=i.organization_id
    JOIN public.suppliers s ON s.id=i.supplier_id AND s.organization_id=i.organization_id
    WHERE i.organization_id=v_org
      AND (p_purchase_order_id IS NULL OR i.purchase_order_id=p_purchase_order_id)
      AND (v_status IS NULL OR i.match_status=v_status)
      AND (
      v_search IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.unnest(pg_catalog.string_to_array(v_search,' ')) AS term(value)
        WHERE term.value<>'' AND pg_catalog.strpos(
          public.normalize_supplier_invoice_search(pg_catalog.concat_ws(' ',
            i.id::text,s.name,i.supplier_invoice_number,po.purchase_order_number,i.invoice_date::text
          )),
          term.value
        )=0
      )
    )
    ORDER BY i.invoice_date DESC,i.created_at DESC,i.id DESC
    LIMIT p_limit OFFSET p_offset
  ) q;

  RETURN jsonb_build_object(
    'purchase_orders',v_orders,
    'receivable_lines',v_receivable_lines,
    'invoices',v_invoices,
    'invoice_count',v_invoice_count,
    'limit',p_limit,'offset',p_offset,
    'has_more',v_invoice_count>p_offset+p_limit,
    'as_of_date',current_date
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_invoice_workspace_filtered(uuid,integer,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_invoice_workspace_filtered(uuid,integer,integer,text,text) TO authenticated;
COMMIT;
