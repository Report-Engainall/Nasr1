-- P3 product gross margin: invoice-line revenue net of posted credit memos,
-- reconciled to shipped sales and exact receipt-cost batch lineage.
-- Unknown/unattributed stock cost or physical returns withhold gross profit.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_product_gross_margin_by_invoice_source(
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
  v_org uuid;
  v_currency text;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_as_of timestamptz:=coalesce(p_as_of,pg_catalog.clock_timestamp());
  v_invoice_count integer:=0;
  v_invoice_line_count integer:=0;
  v_invoices_without_lines integer:=0;
  v_unmapped_line_count integer:=0;
  v_invalid_credit_line_count integer:=0;
  v_product_count integer:=0;
  v_verified_product_count integer:=0;
  v_products jsonb:='[]'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_status text;
  v_complete boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL
     OR NOT public.can_manage_finance()
     OR NOT EXISTS(
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active finance manager permission required for product gross margin';
  END IF;

  SELECT o.organization_id,org.currency
    INTO v_org,v_currency
    FROM public.profiles o
    JOIN public.organizations org ON org.id=o.organization_id AND org.is_active
   WHERE o.id=v_actor AND o.auth_user_id=auth.uid() AND o.is_active;

  IF v_org IS NULL OR v_currency IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active organization and currency are required for product gross margin';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to
     OR p_to-p_from>365
     OR v_as_of IS NULL
     OR p_to<>(v_as_of AT TIME ZONE 'UTC')::date
     OR v_as_of>v_now+interval '5 minutes'
     OR v_as_of<v_now-interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='product gross margin period must be a current bounded UTC window';
  END IF;

  WITH RECURSIVE invoice_scope AS MATERIALIZED (
    SELECT ci.id AS invoice_id,ci.order_id,ci.organization_id,
           ci.currency,ci.issued_at
      FROM public.customer_invoices ci
     WHERE ci.organization_id=v_org
       AND ci.status IN ('issued','partially_paid','paid')
       AND ci.issued_at>=(p_from::timestamp AT TIME ZONE 'UTC')
       AND ci.issued_at<((p_to+1)::timestamp AT TIME ZONE 'UTC')
       AND ci.issued_at<=v_as_of
  ),
  invoice_line_base AS MATERIALIZED (
    SELECT
      scope.invoice_id,scope.order_id,scope.currency,scope.issued_at,
      cii.id AS invoice_item_id,cii.order_item_id,cii.product_id,
      cii.description AS product_label,cii.unit AS unit_of_measure,
      cii.quantity,cii.line_total,
      oi.id AS resolved_order_item_id,oi.order_id AS resolved_order_id,
      oi.product_id AS order_product_id,oi.unit_snapshot AS order_unit,
      oi.quantity AS order_quantity,oi.line_total AS order_line_total,
      p.id AS resolved_product_id
    FROM invoice_scope scope
    JOIN public.customer_invoice_items cii
      ON cii.organization_id=scope.organization_id
     AND cii.invoice_id=scope.invoice_id
    LEFT JOIN public.order_items oi
      ON oi.id=cii.order_item_id
     AND oi.organization_id=scope.organization_id
     AND oi.order_id=scope.order_id
    LEFT JOIN public.products p
      ON p.id=cii.product_id
     AND p.organization_id=scope.organization_id
  ),
  credit_rollup AS (
    SELECT
      il.invoice_item_id,
      coalesce(sum(cmi.credited_subtotal) FILTER(
        WHERE cm.status='posted'
          AND cm.posted_at IS NOT NULL
          AND cm.posted_at<=v_as_of
          AND cm.organization_id=v_org
          AND cm.invoice_id=il.invoice_id
          AND cm.currency=il.currency
          AND cmi.product_id IS NOT DISTINCT FROM il.product_id
          AND cmi.order_item_id IS NOT DISTINCT FROM il.order_item_id
      ),0)::numeric(18,2) AS posted_credit_amount,
      count(*) FILTER(
        WHERE cm.status='posted'
          AND cm.posted_at IS NOT NULL
          AND cm.posted_at<=v_as_of
          AND (
            cm.organization_id IS DISTINCT FROM v_org
            OR cm.invoice_id IS DISTINCT FROM il.invoice_id
            OR cm.currency IS DISTINCT FROM il.currency
            OR cmi.product_id IS DISTINCT FROM il.product_id
            OR cmi.order_item_id IS DISTINCT FROM il.order_item_id
          )
      )::integer AS invalid_credit_item_count,
      count(*) FILTER(
        WHERE cm.status='posted'
          AND cm.posted_at IS NOT NULL
          AND cm.posted_at<=v_as_of
      )::integer AS posted_credit_item_count
    FROM invoice_line_base il
    LEFT JOIN public.customer_return_credit_memo_items cmi
      ON cmi.organization_id=v_org
     AND cmi.invoice_item_id=il.invoice_item_id
    LEFT JOIN public.customer_return_credit_memos cm
      ON cm.id=cmi.credit_memo_id
     AND cm.organization_id=cmi.organization_id
    GROUP BY il.invoice_item_id
  ),
  invoice_lines AS MATERIALIZED (
    SELECT il.*,
      coalesce(cr.posted_credit_amount,0)::numeric(18,2) AS posted_credit_amount,
      coalesce(cr.invalid_credit_item_count,0)::integer AS invalid_credit_item_count,
      coalesce(cr.posted_credit_item_count,0)::integer AS posted_credit_item_count,
      (
        il.product_id IS NOT NULL
        AND il.resolved_product_id IS NOT NULL
        AND il.order_item_id IS NOT NULL
        AND il.resolved_order_item_id IS NOT NULL
        AND il.resolved_order_id=il.order_id
        AND il.order_product_id=il.product_id
        AND il.order_unit IS NOT DISTINCT FROM il.unit_of_measure
        AND il.order_quantity IS NOT DISTINCT FROM il.quantity
        AND il.order_line_total IS NOT DISTINCT FROM il.line_total
        AND il.quantity>0
        AND il.line_total>=0
      ) AS source_line_valid,
      (
        coalesce(cr.invalid_credit_item_count,0)=0
        AND coalesce(cr.posted_credit_amount,0)<=il.line_total
      ) AS credit_line_valid
    FROM invoice_line_base il
    LEFT JOIN credit_rollup cr ON cr.invoice_item_id=il.invoice_item_id
  ),
  invoice_coverage AS (
    SELECT
      (SELECT count(*)::integer FROM invoice_scope) AS invoice_count,
      count(*)::integer AS invoice_line_count,
      count(DISTINCT invoice_id)::integer AS invoices_with_lines,
      count(*) FILTER(WHERE NOT source_line_valid)::integer AS unmapped_line_count,
      count(*) FILTER(WHERE NOT credit_line_valid)::integer AS invalid_credit_line_count
    FROM invoice_lines
  ),
  expected_order_product AS MATERIALIZED (
    SELECT order_id,product_id,
      sum(quantity)::numeric(18,3) AS expected_quantity,
      count(DISTINCT unit_of_measure)::integer AS unit_variant_count,
      min(unit_of_measure) AS unit_of_measure,
      count(DISTINCT order_item_id)::integer AS order_item_count
    FROM invoice_lines
    WHERE product_id IS NOT NULL AND order_item_id IS NOT NULL
    GROUP BY order_id,product_id
  ),
  sale_movements AS MATERIALIZED (
    SELECT im.id AS movement_id,im.reference_id AS order_id,
      im.product_id,im.warehouse_id,im.inventory_batch_id,
      (-im.quantity)::numeric(18,3) AS sale_quantity,
      im.created_at
    FROM public.inventory_movements im
    JOIN expected_order_product expected
      ON expected.order_id=im.reference_id
     AND expected.product_id=im.product_id
    JOIN public.orders o
      ON o.id=im.reference_id
     AND o.organization_id=v_org
    JOIN public.warehouses w
      ON w.id=im.warehouse_id
     AND w.organization_id=v_org
    WHERE im.reference_type='order'
      AND im.movement_type='sale'
      AND im.quantity<0
      AND im.created_at<=v_as_of
      AND o.created_at<=v_as_of
      AND o.updated_at<=v_as_of
      AND o.status IN ('shipped','delivered','invoiced')
  ),
  batch_walk AS (
    SELECT sm.movement_id,sm.order_id,sm.product_id,sm.warehouse_id,
      b.id AS batch_id,b.parent_batch_id,b.source_type,b.receipt_id,
      b.receipt_item_id,b.source_reference_type,b.source_reference_id,
      b.unit_cost,b.organization_id,b.product_id AS batch_product_id,
      0 AS depth,
      CASE WHEN b.id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[b.id]::uuid[] END AS path,
      false AS cycle
    FROM sale_movements sm
    LEFT JOIN public.inventory_batches b
      ON b.id=sm.inventory_batch_id
     AND b.organization_id=v_org
     AND b.product_id=sm.product_id
     AND b.warehouse_id=sm.warehouse_id
    UNION ALL
    SELECT bw.movement_id,bw.order_id,bw.product_id,bw.warehouse_id,
      parent.id,parent.parent_batch_id,parent.source_type,parent.receipt_id,
      parent.receipt_item_id,parent.source_reference_type,parent.source_reference_id,
      parent.unit_cost,parent.organization_id,parent.product_id,
      bw.depth+1,bw.path||parent.id,parent.id=ANY(bw.path)
    FROM batch_walk bw
    JOIN public.inventory_batches parent
      ON parent.id=bw.parent_batch_id
     AND parent.organization_id=v_org
     AND parent.product_id=bw.product_id
    WHERE bw.parent_batch_id IS NOT NULL
      AND NOT bw.cycle
      AND bw.depth<32
  ),
  batch_lineage_quality AS (
    SELECT movement_id,
      count(*)::integer AS chain_rows,
      coalesce(bool_or(cycle),false) AS has_cycle,
      coalesce(bool_and(unit_cost IS NOT NULL AND unit_cost>=0),false) AS all_costs_present,
      count(*) FILTER(WHERE parent_batch_id IS NULL)::integer AS root_count,
      coalesce(bool_and(product_id=batch_product_id),false) AS product_chain_valid
    FROM batch_walk
    GROUP BY movement_id
  ),
  root_batches AS (
    SELECT movement_id,batch_id AS root_batch_id,source_type,receipt_id,
      receipt_item_id,source_reference_type,source_reference_id,unit_cost,
      organization_id,batch_product_id
    FROM batch_walk
    WHERE parent_batch_id IS NULL
  ),
  movement_cost_validation AS (
    SELECT sm.movement_id,sm.order_id,sm.product_id,sm.sale_quantity,
      root.unit_cost AS resolved_unit_cost,
      (
        sm.inventory_batch_id IS NOT NULL
        AND quality.root_count=1
        AND quality.chain_rows BETWEEN 1 AND 33
        AND NOT quality.has_cycle
        AND quality.all_costs_present
        AND quality.product_chain_valid
        AND root.source_type='purchase_receipt'
        AND root.receipt_item_id IS NOT NULL
        AND root.receipt_id IS NOT NULL
        AND root.source_reference_type='purchase_receipt'
        AND root.source_reference_id=root.receipt_id
        AND root.unit_cost IS NOT NULL
        AND root.unit_cost>=0
        AND root.unit_cost=pri.unit_cost
        AND pri.organization_id=v_org
        AND pri.product_id=sm.product_id
        AND pri.receipt_id=root.receipt_id
        AND pri.quantity_received>0
        AND pri.line_total IS NOT NULL
        AND pri.line_total=round(pri.quantity_received*pri.unit_cost,2)
        AND poi.id=pri.purchase_order_item_id
        AND poi.organization_id=v_org
        AND poi.product_id=sm.product_id
        AND expected.unit_variant_count=1
        AND poi.unit_snapshot=expected.unit_of_measure
        AND pr.id=pri.receipt_id
        AND pr.organization_id=v_org
        AND pr.received_at<=v_as_of
        AND po.id=pr.purchase_order_id
        AND po.organization_id=v_org
        AND org.currency='YER'
        AND costs.line_count>0
        AND costs.costs_complete
        AND costs.line_total=pr.received_cost
        AND pr.received_cost IS NOT NULL
        AND NOT EXISTS(
          SELECT 1 FROM batch_walk chain
           WHERE chain.movement_id=sm.movement_id
             AND chain.unit_cost IS DISTINCT FROM root.unit_cost
        )
      ) AS cost_valid
    FROM sale_movements sm
    JOIN expected_order_product expected
      ON expected.order_id=sm.order_id AND expected.product_id=sm.product_id
    LEFT JOIN batch_lineage_quality quality ON quality.movement_id=sm.movement_id
    LEFT JOIN root_batches root ON root.movement_id=sm.movement_id
    LEFT JOIN public.purchase_receipt_items pri
      ON pri.id=root.receipt_item_id
     AND pri.organization_id=v_org
    LEFT JOIN public.purchase_order_items poi
      ON poi.id=pri.purchase_order_item_id
     AND poi.organization_id=v_org
    LEFT JOIN public.purchase_receipts pr
      ON pr.id=root.receipt_id
     AND pr.organization_id=v_org
    LEFT JOIN public.purchase_orders po
      ON po.id=pr.purchase_order_id
     AND po.organization_id=v_org
    JOIN public.organizations org ON org.id=v_org
    LEFT JOIN LATERAL(
      SELECT count(*)::integer AS line_count,
        coalesce(bool_and(item.unit_cost IS NOT NULL AND item.line_total IS NOT NULL),false) AS costs_complete,
        sum(item.line_total)::numeric(18,2) AS line_total
      FROM public.purchase_receipt_items item
      WHERE item.organization_id=v_org AND item.receipt_id=pr.id
    ) costs ON true
  ),
  order_product_sales AS (
    SELECT expected.order_id,expected.product_id,
      expected.expected_quantity,expected.unit_variant_count,
      coalesce(sum(sm.sale_quantity),0)::numeric(18,3) AS actual_quantity,
      count(sm.movement_id)::integer AS sale_movement_count,
      count(*) FILTER(WHERE sm.movement_id IS NOT NULL AND NOT coalesce(costs.cost_valid,false))::integer AS uncosted_movement_count,
      CASE
        WHEN count(sm.movement_id)>0
         AND bool_and(coalesce(costs.cost_valid,false))
        THEN round(sum(sm.sale_quantity*costs.resolved_unit_cost),2)::numeric(18,2)
        ELSE NULL
      END AS cost_of_goods_sold,
      (
        expected.expected_quantity>0
        AND expected.unit_variant_count=1
        AND coalesce(sum(sm.sale_quantity),0)=expected.expected_quantity
        AND count(sm.movement_id)>0
        AND bool_and(coalesce(costs.cost_valid,false))
      ) AS shipment_cost_complete
    FROM expected_order_product expected
    LEFT JOIN sale_movements sm
      ON sm.order_id=expected.order_id AND sm.product_id=expected.product_id
    LEFT JOIN movement_cost_validation costs
      ON costs.movement_id=sm.movement_id
    GROUP BY expected.order_id,expected.product_id,
      expected.expected_quantity,expected.unit_variant_count
  ),
  product_sales AS (
    SELECT product_id,
      sum(expected_quantity)::numeric(18,3) AS expected_shipped_quantity,
      sum(actual_quantity)::numeric(18,3) AS actual_shipped_quantity,
      sum(sale_movement_count)::integer AS sale_movement_count,
      sum(uncosted_movement_count)::integer AS uncosted_movement_count,
      coalesce(bool_and(shipment_cost_complete),false) AS shipment_cost_complete,
      CASE WHEN bool_and(shipment_cost_complete)
        THEN sum(cost_of_goods_sold)::numeric(18,2) ELSE NULL END AS cost_of_goods_sold
    FROM order_product_sales
    GROUP BY product_id
  ),
  return_affected_products AS (
    SELECT DISTINCT il.product_id
    FROM invoice_lines il
    WHERE il.product_id IS NOT NULL AND (
      EXISTS(
        SELECT 1
        FROM public.customer_return_request_items request_item
        JOIN public.customer_return_receipt_items receipt_item
          ON receipt_item.organization_id=request_item.organization_id
         AND receipt_item.request_item_id=request_item.id
        JOIN public.customer_return_receipts receipt
          ON receipt.id=receipt_item.receipt_id
         AND receipt.organization_id=receipt_item.organization_id
        WHERE request_item.organization_id=v_org
          AND request_item.order_item_id=il.order_item_id
          AND receipt.received_at<=v_as_of
          AND receipt_item.received_quantity>0
      )
      OR EXISTS(
        SELECT 1
        FROM public.customer_return_credit_memo_items credit_item
        JOIN public.customer_return_credit_memos memo
          ON memo.id=credit_item.credit_memo_id
         AND memo.organization_id=credit_item.organization_id
        WHERE credit_item.organization_id=v_org
          AND credit_item.order_item_id=il.order_item_id
          AND memo.status='posted'
          AND memo.posted_at IS NOT NULL
          AND memo.posted_at<=v_as_of
      )
    )
  ),
  product_revenue AS (
    SELECT product_id,
      min(product_label) AS product_label,
      CASE WHEN count(DISTINCT unit_of_measure)=1 THEN min(unit_of_measure) ELSE NULL END AS unit_of_measure,
      count(DISTINCT unit_of_measure)::integer AS unit_variant_count,
      CASE WHEN count(DISTINCT currency)=1 THEN min(currency) ELSE NULL END AS currency,
      count(DISTINCT currency)::integer AS currency_count,
      count(DISTINCT invoice_id)::integer AS invoice_count,
      count(*)::integer AS invoice_line_count,
      sum(quantity)::numeric(18,3) AS invoiced_quantity,
      CASE
        WHEN bool_and(source_line_valid AND credit_line_valid) AND count(DISTINCT currency)=1
        THEN sum(line_total)::numeric(18,2) ELSE NULL
      END AS gross_invoice_line_amount,
      CASE
        WHEN bool_and(source_line_valid AND credit_line_valid) AND count(DISTINCT currency)=1
        THEN sum(posted_credit_amount)::numeric(18,2) ELSE NULL
      END AS posted_credit_amount,
      CASE
        WHEN bool_and(source_line_valid AND credit_line_valid) AND count(DISTINCT currency)=1
        THEN sum(line_total-posted_credit_amount)::numeric(18,2)
        ELSE NULL
      END AS net_revenue,
      (coalesce(bool_and(source_line_valid AND credit_line_valid),false)
        AND count(DISTINCT currency)=1) AS revenue_complete,
      sum(invalid_credit_item_count)::integer AS invalid_credit_item_count
    FROM invoice_lines
    WHERE product_id IS NOT NULL
    GROUP BY product_id
  ),
  product_assessment AS (
    SELECT revenue.product_id,revenue.product_label,revenue.unit_of_measure,
      revenue.currency,revenue.currency_count,revenue.unit_variant_count,
      revenue.invoice_count,revenue.invoice_line_count,revenue.invoiced_quantity,
      revenue.gross_invoice_line_amount,revenue.posted_credit_amount,revenue.net_revenue,
      revenue.revenue_complete,
      coalesce(sales.expected_shipped_quantity,0)::numeric(18,3) AS expected_shipped_quantity,
      coalesce(sales.actual_shipped_quantity,0)::numeric(18,3) AS actual_shipped_quantity,
      coalesce(sales.sale_movement_count,0)::integer AS sale_movement_count,
      coalesce(sales.uncosted_movement_count,0)::integer AS uncosted_movement_count,
      sales.cost_of_goods_sold,
      coalesce(sales.shipment_cost_complete,false) AS shipment_cost_complete,
      (returns.product_id IS NOT NULL) AS has_returns
    FROM product_revenue revenue
    LEFT JOIN product_sales sales ON sales.product_id=revenue.product_id
    LEFT JOIN return_affected_products returns ON returns.product_id=revenue.product_id
  ),
  assessed AS (
    SELECT product_assessment.*,
      (
        revenue_complete
        AND expected_shipped_quantity>0
        AND actual_shipped_quantity=expected_shipped_quantity
        AND sale_movement_count>0
        AND shipment_cost_complete
        AND NOT has_returns
        AND v_currency='YER'
        AND currency='YER'
        AND currency_count=1
      ) AS gross_profit_verified,
      CASE
        WHEN revenue_complete AND expected_shipped_quantity>0
         AND actual_shipped_quantity=expected_shipped_quantity
         AND sale_movement_count>0 AND shipment_cost_complete
         AND NOT has_returns AND v_currency='YER'
         AND currency='YER' AND currency_count=1
        THEN 'VERIFIED'
        WHEN NOT revenue_complete OR has_returns OR v_currency<>'YER'
          OR currency IS DISTINCT FROM 'YER' OR currency_count<>1
        THEN 'NEEDS_REVIEW'
        ELSE 'PARTIAL'
      END AS row_status
    FROM product_assessment
  ),
  coverage AS (
    SELECT
      invoice_coverage.invoice_count,
      invoice_coverage.invoice_line_count,
      greatest(invoice_coverage.invoice_count-invoice_coverage.invoices_with_lines,0)::integer AS invoices_without_lines,
      invoice_coverage.unmapped_line_count,
      invoice_coverage.invalid_credit_line_count,
      (invoice_coverage.invoice_count>0
        AND invoice_coverage.invoice_line_count>0
        AND invoice_coverage.invoice_count=invoice_coverage.invoices_with_lines
        AND invoice_coverage.unmapped_line_count=0
        AND invoice_coverage.invalid_credit_line_count=0
        AND v_currency='YER') AS complete_population
    FROM invoice_coverage
  )
  SELECT
    coverage.invoice_count,coverage.invoice_line_count,coverage.invoices_without_lines,
    coverage.unmapped_line_count,coverage.invalid_credit_line_count,
    count(assessed.product_id)::integer,
    count(*) FILTER(WHERE assessed.row_status='VERIFIED')::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'productRef',assessed.product_id::text,
        'productLabel',assessed.product_label,
        'currency',assessed.currency,
        'currencyCount',assessed.currency_count,
        'unitOfMeasure',assessed.unit_of_measure,
        'unitVariantCount',assessed.unit_variant_count,
        'status',CASE WHEN NOT coverage.complete_population AND assessed.row_status='VERIFIED' THEN 'NEEDS_REVIEW' ELSE assessed.row_status END,
        'invoiceCount',assessed.invoice_count,
        'invoiceLineCount',assessed.invoice_line_count,
        'invoicedQuantity',assessed.invoiced_quantity::text,
        'grossInvoiceLineAmount',assessed.gross_invoice_line_amount::text,
        'postedCreditAmount',assessed.posted_credit_amount::text,
        'netRevenue',assessed.net_revenue::text,
        'expectedShippedQuantity',assessed.expected_shipped_quantity::text,
        'actualShippedQuantity',assessed.actual_shipped_quantity::text,
        'saleMovementCount',assessed.sale_movement_count,
        'uncostedMovementCount',assessed.uncosted_movement_count,
        'costOfGoodsSold',CASE WHEN coverage.complete_population AND assessed.gross_profit_verified THEN assessed.cost_of_goods_sold::text ELSE NULL END,
        'grossProfit',CASE WHEN coverage.complete_population AND assessed.gross_profit_verified
          THEN (assessed.net_revenue-assessed.cost_of_goods_sold)::numeric(18,2)::text ELSE NULL END,
        'grossMarginPercent',CASE WHEN coverage.complete_population AND assessed.gross_profit_verified AND assessed.net_revenue>0
          THEN round(((assessed.net_revenue-assessed.cost_of_goods_sold)/assessed.net_revenue)*100,2)::text ELSE NULL END,
        'hasReturns',assessed.has_returns,
        'evidenceIds',jsonb_build_array(
          'product-gross-margin:'||assessed.product_id::text||':invoice-lines',
          'product-gross-margin:'||assessed.product_id::text||':shipment-batches',
          'product-gross-margin:'||assessed.product_id::text||':receipt-costs'
        ),
        'formulaId','nasr1.product-gross-margin.invoice-line-net-batch-cogs',
        'formulaVersion','1',
        'warnings',to_jsonb(ARRAY_REMOVE(ARRAY[
          CASE WHEN NOT assessed.revenue_complete THEN 'INVOICE_LINE_OR_CREDIT_EVIDENCE_INCOMPLETE' END,
          CASE WHEN assessed.expected_shipped_quantity<=0 OR assessed.actual_shipped_quantity<>assessed.expected_shipped_quantity THEN 'SHIPPED_QUANTITY_NOT_RECONCILED_TO_INVOICE' END,
          CASE WHEN assessed.uncosted_movement_count>0 OR NOT assessed.shipment_cost_complete THEN 'SALE_BATCH_COST_NOT_FULLY_TRACEABLE_TO_PURCHASE_RECEIPT' END,
          CASE WHEN assessed.has_returns THEN 'RETURNED_PRODUCT_GROSS_PROFIT_WITHHELD' END,
          CASE WHEN v_currency<>'YER' OR assessed.currency IS DISTINCT FROM 'YER' OR assessed.currency_count<>1
            THEN 'MULTI_CURRENCY_OR_FX_POLICY_UNAVAILABLE' END,
          CASE WHEN NOT coverage.complete_population THEN 'INVOICE_COHORT_NOT_COMPLETE' END
        ],NULL))
      ) ORDER BY assessed.product_label,assessed.product_id
    ),'[]'::jsonb)
  INTO v_invoice_count,v_invoice_line_count,v_invoices_without_lines,
    v_unmapped_line_count,v_invalid_credit_line_count,v_product_count,
    v_verified_product_count,v_products
  FROM coverage
  LEFT JOIN assessed ON true
  GROUP BY coverage.invoice_count,coverage.invoice_line_count,coverage.invoices_without_lines,
    coverage.unmapped_line_count,coverage.invalid_credit_line_count,coverage.complete_population;

  IF v_invoice_count=0 THEN
    v_status:='EMPTY';
    v_complete:=true;
  ELSE
    v_complete:=v_invoices_without_lines=0
      AND v_unmapped_line_count=0
      AND v_invalid_credit_line_count=0
      AND v_currency='YER'
      AND v_verified_product_count=v_product_count;
    v_status:=CASE WHEN v_complete THEN 'VERIFIED' ELSE 'PARTIAL' END;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',source.id,
      'source',jsonb_build_object('kind','RPC','name',source.name,'version','1'),
      'sourceTimestamp',v_as_of,
      'asOf',v_as_of,
      'period',jsonb_build_object('from',p_from::text,'to',p_to::text),
      'status',source.status,
      'completeness',CASE WHEN source.status='VERIFIED' THEN 'COMPLETE' ELSE 'PARTIAL' END,
      'quality',CASE WHEN source.status='VERIFIED' THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
      'currency',source.currency,
      'warnings',CASE WHEN source.status='VERIFIED' THEN '[]'::jsonb ELSE jsonb_build_array(source.warning) END
    ) ORDER BY source.id
  ),'[]'::jsonb)
  INTO v_evidence
  FROM (
    SELECT
      'product-gross-margin:'||product.productRef||':invoice-lines' AS id,
      'customer_invoice_items_net_posted_credit_memos' AS name,
      CASE WHEN product.status='VERIFIED' AND product.netRevenue IS NOT NULL THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END AS status,
      product.currency,
      'INVOICE_LINE_OR_CREDIT_EVIDENCE_INCOMPLETE' AS warning
    FROM jsonb_to_recordset(v_products) AS product(
      productRef text,netRevenue text,status text,currency text
    )
    UNION ALL
    SELECT
      'product-gross-margin:'||product.productRef||':shipment-batches',
      'inventory_sale_movements_batch_lineage',
      CASE WHEN product.status='VERIFIED' AND product.costOfGoodsSold IS NOT NULL THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
      product.currency,
      'SALE_BATCH_COST_NOT_FULLY_TRACEABLE_TO_PURCHASE_RECEIPT'
    FROM jsonb_to_recordset(v_products) AS product(
      productRef text,costOfGoodsSold text,status text,currency text
    )
    UNION ALL
    SELECT
      'product-gross-margin:'||product.productRef||':receipt-costs',
      'purchase_receipt_items_cost_lineage',
      CASE WHEN product.status='VERIFIED' AND product.costOfGoodsSold IS NOT NULL THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
      product.currency,
      'PURCHASE_RECEIPT_COST_LINEAGE_INCOMPLETE'
    FROM jsonb_to_recordset(v_products) AS product(
      productRef text,costOfGoodsSold text,status text,currency text
    )
  ) source;

  RETURN jsonb_build_object(
    'status',v_status,
    'asOf',v_as_of,
    'period',jsonb_build_object('from',p_from::text,'to',p_to::text),
    'completePopulation',v_complete,
    'invoiceCount',v_invoice_count,
    'invoiceLineCount',v_invoice_line_count,
    'invoicesWithoutLinesCount',v_invoices_without_lines,
    'unmappedLineCount',v_unmapped_line_count,
    'invalidCreditLineCount',v_invalid_credit_line_count,
    'productCount',v_product_count,
    'verifiedProductCount',v_verified_product_count,
    'currency',v_currency,
    'products',v_products,
    'evidenceRecords',v_evidence,
    'formulaId','nasr1.product-gross-margin.invoice-line-net-batch-cogs',
    'formulaVersion','1',
    'formulaDescription','Net revenue is issued invoice-line value less same-tenant posted return credit memos. COGS uses exact shipped sale movements joined to the purchase-receipt root of the consumed FEFO batch lineage. Physical returns, uncosted or unattributed batches, unmatched shipment quantities, incomplete invoice mappings, and non-YER currency withhold gross profit. Excludes tax, freight, overhead and operating expenses; this is product gross profit, not net profit.',
    'sourceTables',jsonb_build_array(
      'customer_invoices','customer_invoice_items','customer_return_credit_memos',
      'customer_return_credit_memo_items','orders','order_items','inventory_movements',
      'inventory_batches','purchase_receipt_items','purchase_receipts','purchase_order_items'
    ),
    'sideEffects','NONE'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_product_gross_margin_by_invoice_source(date,date,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_product_gross_margin_by_invoice_source(date,date,timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.fetch_product_gross_margin_by_invoice_source(date,date,timestamptz) IS
  'Finance-only, tenant-scoped read-only product gross margin. Uses issued invoice lines net posted credit memos and exact shipped sale movement quantities/costs from purchase-receipt-rooted FEFO batch lineage. Any return, unmapped line, uncosted lot, mismatch or unsupported currency withholds gross profit. Excludes tax, freight and operating costs; not net profit.';

COMMIT;
