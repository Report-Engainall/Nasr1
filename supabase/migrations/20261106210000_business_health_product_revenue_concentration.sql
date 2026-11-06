-- Section 51 — product concentration of issued invoice-line value, net of posted return credit memos.
-- One currency per row; never add currencies together or expose product/customer identities.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_business_health_product_revenue_concentration(
  p_from date,
  p_to date,
  p_as_of timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_as_of timestamptz:=coalesce(p_as_of,pg_catalog.clock_timestamp());
  v_invoice_count integer:=0;
  v_invoice_without_lines integer:=0;
  v_currency_count integer:=0;
  v_partial_currency_count integer:=0;
  v_rows jsonb:='[]'::jsonb;
  v_status text;
  v_complete boolean;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.can_manage_finance()
     OR NOT EXISTS(
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.organization_id=v_org
          AND p.auth_user_id=auth.uid() AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization finance permission required for product revenue concentration';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to
     OR p_to-p_from>365 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='business-health product revenue period is invalid or exceeds 366 inclusive days';
  END IF;

  IF v_as_of IS NULL OR v_as_of>v_now+interval '5 minutes'
     OR v_as_of<v_now-interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='business-health product revenue as-of must represent the current snapshot';
  END IF;

  WITH invoice_scope AS (
    SELECT i.id,i.currency,i.issued_at
      FROM public.customer_invoices i
     WHERE i.organization_id=v_org
       AND i.status IN ('issued','partially_paid','paid')
       AND i.issued_at >= (p_from::timestamp AT TIME ZONE 'UTC')
       AND i.issued_at < ((p_to+1)::timestamp AT TIME ZONE 'UTC')
       AND i.issued_at<=v_as_of
  ),
  invoice_lines AS (
    SELECT cii.id AS invoice_item_id,cii.invoice_id,cii.product_id,
           cii.line_total,ins.currency
      FROM public.customer_invoice_items cii
      JOIN invoice_scope ins
        ON ins.id=cii.invoice_id
     WHERE cii.organization_id=v_org
  ),
  credit_rollup AS (
    SELECT il.invoice_item_id,
           coalesce(sum(cmi.credited_subtotal) FILTER (
             WHERE cm.status='posted'
               AND cm.posted_at IS NOT NULL
               AND cm.posted_at<=v_as_of
               AND cm.currency=il.currency
               AND cm.invoice_id=il.invoice_id
               AND cmi.product_id IS NOT DISTINCT FROM il.product_id
           ),0)::numeric AS posted_credited_subtotal,
           count(*) FILTER (
             WHERE cm.status='posted'
               AND cm.posted_at IS NOT NULL
               AND cm.posted_at<=v_as_of
               AND (
                 cm.currency IS DISTINCT FROM il.currency
                 OR cm.invoice_id IS DISTINCT FROM il.invoice_id
                 OR cmi.product_id IS DISTINCT FROM il.product_id
               )
           )::integer AS mismatched_credit_item_count
      FROM invoice_lines il
      LEFT JOIN public.customer_return_credit_memo_items cmi
        ON cmi.invoice_item_id=il.invoice_item_id
       AND cmi.organization_id=v_org
      LEFT JOIN public.customer_return_credit_memos cm
        ON cm.id=cmi.credit_memo_id
       AND cm.organization_id=v_org
     GROUP BY il.invoice_item_id
  ),
  resolved_lines AS (
    SELECT il.invoice_item_id,il.invoice_id,il.currency,il.line_total,
           il.product_id,p.id AS same_tenant_product_id,
           coalesce(cr.posted_credited_subtotal,0)::numeric AS posted_credit,
           coalesce(cr.mismatched_credit_item_count,0)::integer AS mismatched_credit_item_count,
           CASE
             WHEN p.id IS NULL THEN true
             WHEN coalesce(cr.mismatched_credit_item_count,0)>0 THEN true
             WHEN coalesce(cr.posted_credited_subtotal,0)>il.line_total THEN true
             ELSE false
           END AS line_unresolved
      FROM invoice_lines il
      LEFT JOIN public.products p
        ON p.id=il.product_id AND p.organization_id=v_org
      LEFT JOIN credit_rollup cr
        ON cr.invoice_item_id=il.invoice_item_id
  ),
  product_amounts AS (
    SELECT currency,same_tenant_product_id AS product_id,
           sum(line_total-posted_credit)::numeric AS net_line_amount
      FROM resolved_lines
     WHERE same_tenant_product_id IS NOT NULL
       AND NOT line_unresolved
     GROUP BY currency,same_tenant_product_id
  ),
  ranked_products AS (
    SELECT currency,product_id,net_line_amount,
           row_number() OVER(
             PARTITION BY currency
             ORDER BY net_line_amount DESC,product_id
           ) AS product_rank
      FROM product_amounts
  ),
  top_five AS (
    SELECT currency,
           count(*)::integer AS product_count,
           coalesce(sum(net_line_amount),0)::numeric AS total_net_line_amount,
           coalesce(sum(net_line_amount) FILTER (WHERE product_rank<=5),0)::numeric AS top5_net_line_amount
      FROM ranked_products
     GROUP BY currency
  ),
  invoice_line_coverage AS (
    SELECT ins.currency,
           count(DISTINCT ins.id)::integer AS invoice_count,
           count(rl.invoice_item_id)::integer AS invoice_line_count,
           count(*) FILTER (WHERE rl.same_tenant_product_id IS NOT NULL AND NOT rl.line_unresolved)::integer AS mapped_line_count,
           count(*) FILTER (WHERE rl.line_unresolved)::integer AS unmapped_line_count,
           count(*) FILTER (WHERE rl.mismatched_credit_item_count>0 OR rl.posted_credit>rl.line_total)::integer AS invalid_credit_line_count,
           coalesce(sum(rl.line_total) FILTER (WHERE rl.invoice_item_id IS NOT NULL),0)::numeric AS gross_invoice_line_amount,
           count(DISTINCT ins.id) FILTER (WHERE rl.invoice_item_id IS NOT NULL)::integer AS invoices_with_lines
      FROM invoice_scope ins
      LEFT JOIN resolved_lines rl ON rl.invoice_id=ins.id
     GROUP BY ins.currency
  ),
  currency_summary AS (
    SELECT c.currency,c.invoice_count,c.invoice_line_count,c.mapped_line_count,
           c.unmapped_line_count,c.invalid_credit_line_count,
           (c.invoice_count-c.invoices_with_lines)::integer AS invoices_without_lines,
           c.gross_invoice_line_amount,
           coalesce(t.product_count,0)::integer AS product_count,
           CASE
             WHEN c.unmapped_line_count=0 AND c.invalid_credit_line_count=0
              AND c.invoices_without_lines=0 AND c.invoice_line_count>0
              AND coalesce(t.total_net_line_amount,0)>0
             THEN t.total_net_line_amount::numeric
             ELSE NULL
           END AS net_invoice_line_amount,
           CASE
             WHEN c.unmapped_line_count=0 AND c.invalid_credit_line_count=0
              AND c.invoices_without_lines=0 AND c.invoice_line_count>0
              AND coalesce(t.total_net_line_amount,0)>0
             THEN coalesce(t.top5_net_line_amount,0)::numeric
             ELSE NULL
           END AS top5_net_invoice_line_amount,
           CASE
             WHEN c.unmapped_line_count=0 AND c.invalid_credit_line_count=0
              AND c.invoices_without_lines=0 AND c.invoice_line_count>0
              AND coalesce(t.total_net_line_amount,0)>0
             THEN round((coalesce(t.top5_net_line_amount,0)/t.total_net_line_amount)*100,2)
             ELSE NULL
           END AS top5_concentration_percent,
           CASE
             WHEN c.unmapped_line_count>0 OR c.invalid_credit_line_count>0 OR c.invoices_without_lines>0
               OR c.invoice_line_count=0 THEN 'PARTIAL'
             WHEN coalesce(t.total_net_line_amount,0)<=0 THEN 'NEEDS_REVIEW'
             ELSE 'VERIFIED'
           END AS status
      FROM invoice_line_coverage c
      LEFT JOIN top_five t ON t.currency=c.currency
  )
  SELECT
    coalesce(sum(invoice_count),0)::integer,
    coalesce(sum(invoices_without_lines),0)::integer,
    count(*)::integer,
    count(*) FILTER (WHERE status<>'VERIFIED')::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'currency',currency,
        'status',status,
        'invoiceCount',invoice_count,
        'invoiceLineCount',invoice_line_count,
        'productCount',product_count,
        'mappedLineCount',mapped_line_count,
        'unmappedLineCount',unmapped_line_count,
        'invalidCreditLineCount',invalid_credit_line_count,
        'invoicesWithoutLines',invoices_without_lines,
        'grossInvoiceLineAmount',gross_invoice_line_amount,
        'netInvoiceLineAmount',net_invoice_line_amount,
        'top5NetInvoiceLineAmount',top5_net_invoice_line_amount,
        'top5ConcentrationPercent',top5_concentration_percent
      ) ORDER BY currency
    ),'[]'::jsonb)
    INTO v_invoice_count,v_invoice_without_lines,v_currency_count,v_partial_currency_count,v_rows
    FROM currency_summary;

  v_complete:=v_partial_currency_count=0;
  v_status:=CASE
    WHEN v_invoice_count=0 THEN 'EMPTY'
    WHEN v_complete THEN 'VERIFIED'
    ELSE 'PARTIAL'
  END;

  RETURN jsonb_build_object(
    'asOf',v_as_of,
    'period',jsonb_build_object('from',p_from::text,'to',p_to::text),
    'status',v_status,
    'completePopulation',v_complete,
    'invoiceCount',v_invoice_count,
    'invoiceWithoutLinesCount',v_invoice_without_lines,
    'currencyCount',v_currency_count,
    'currencies',v_rows,
    'formulaId','nasr1.invoice-line-product-concentration-net-posted-credit-memos',
    'formulaVersion','1',
    'formulaDescription','sum issued customer_invoice_items.line_total less same-tenant posted customer_return_credit_memo_items.credited_subtotal by currency/product; top-five concentration over net invoiced line value, not tax, payment receipts or accounting profit',
    'sideEffects','NONE'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_business_health_product_revenue_concentration(date,date,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_business_health_product_revenue_concentration(date,date,timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.fetch_business_health_product_revenue_concentration(date,date,timestamptz) IS
  'Finance-role-only, same-tenant, currency-separated product concentration of issued invoice-line value net of posted linked return credit memos. Unmapped product lines, inconsistent credit memo links or invoices without lines withhold concentration percentages. No product/customer/order identities are returned and no write occurs.';

COMMIT;
