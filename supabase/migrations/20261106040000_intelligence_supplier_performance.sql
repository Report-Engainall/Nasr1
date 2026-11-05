-- REF-SUPPLIER-PERFORMANCE-INTELLIGENCE-001
-- Tenant-scoped, read-only operational metrics; no costs, balances, stock writes or supplier score.
CREATE OR REPLACE FUNCTION public.fetch_supplier_performance_snapshot(p_from date,p_to date,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_org uuid; v_as_of timestamptz:=now(); v_total_suppliers integer:=0; v_suppliers jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required for supplier performance';
  END IF;
  v_org:=public.current_organization_id();
  IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR (p_to-p_from)>730 OR
     p_limit IS NULL OR p_limit<1 OR p_limit>200 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid supplier performance period or result limit';
  END IF;

  SELECT count(DISTINCT po.supplier_id)::integer INTO v_total_suppliers
  FROM public.purchase_orders po JOIN public.suppliers s
    ON s.id=po.supplier_id AND s.organization_id=po.organization_id
  WHERE po.organization_id=v_org AND po.status IN ('submitted','partially_received','received')
    AND po.submitted_at >= (p_from::timestamp AT TIME ZONE 'UTC')
    AND po.submitted_at < ((p_to+1)::timestamp AT TIME ZONE 'UTC');

  WITH order_facts AS MATERIALIZED (
    SELECT po.id,po.supplier_id,s.name AS supplier_name,s.supplier_code,po.purchase_order_number,po.status,
      po.submitted_at,COALESCE(li.line_count,0)::integer AS line_count,
      COALESCE(li.ordered_quantity,0)::numeric AS ordered_quantity,
      COALESCE(li.received_quantity,0)::numeric AS received_quantity,
      COALESCE(rr.receipt_count,0)::integer AS receipt_count,rr.last_receipt_at,
      quote.delivery_days AS promised_delivery_days,
      (po.status='received' AND COALESCE(li.line_count,0)>0 AND COALESCE(li.ordered_quantity,0)>0
       AND COALESCE(li.received_quantity,0)>=COALESCE(li.ordered_quantity,0)
       AND rr.last_receipt_at IS NOT NULL AND rr.last_receipt_at>=po.submitted_at) AS is_completed
    FROM public.purchase_orders po JOIN public.suppliers s
      ON s.id=po.supplier_id AND s.organization_id=po.organization_id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS line_count,sum(i.quantity_ordered) AS ordered_quantity,
        sum(i.quantity_received) AS received_quantity
      FROM public.purchase_order_items i
      WHERE i.organization_id=po.organization_id AND i.purchase_order_id=po.id
    ) li ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS receipt_count,max(r.received_at) AS last_receipt_at
      FROM public.purchase_receipts r
      WHERE r.organization_id=po.organization_id AND r.purchase_order_id=po.id
    ) rr ON true
    LEFT JOIN public.purchase_supplier_quotes quote
      ON quote.organization_id=po.organization_id AND quote.purchase_order_id=po.id AND quote.status='awarded'
    WHERE po.organization_id=v_org AND po.status IN ('submitted','partially_received','received')
      AND po.submitted_at >= (p_from::timestamp AT TIME ZONE 'UTC')
      AND po.submitted_at < ((p_to+1)::timestamp AT TIME ZONE 'UTC')
  ),
  measured_orders AS (
    SELECT f.*,
      CASE WHEN f.is_completed
        THEN round((extract(epoch FROM (f.last_receipt_at-f.submitted_at))/86400)::numeric,2) ELSE NULL END AS actual_lead_days,
      CASE WHEN f.is_completed AND f.promised_delivery_days IS NOT NULL
        THEN f.last_receipt_at<=f.submitted_at+make_interval(days=>f.promised_delivery_days) ELSE NULL END AS on_time
    FROM order_facts f
  ),
  supplier_aggregate AS (
    SELECT o.supplier_id,o.supplier_name,o.supplier_code,count(*)::integer AS purchase_order_count,
      count(*) FILTER(WHERE o.is_completed)::integer AS completed_order_count,
      count(*) FILTER(WHERE o.status IN ('submitted','partially_received'))::integer AS open_order_count,
      count(*) FILTER(WHERE o.status='received' AND NOT o.is_completed)::integer AS inconsistent_received_count,
      round(sum(CASE WHEN o.status IN ('submitted','partially_received')
        THEN greatest(o.ordered_quantity-o.received_quantity,0) ELSE 0 END)::numeric,3) AS backlog_quantity,
      count(o.actual_lead_days)::integer AS lead_time_sample_count,
      round(avg(o.actual_lead_days)::numeric,2) AS average_lead_days,
      round((percentile_cont(0.5) WITHIN GROUP(ORDER BY o.actual_lead_days))::numeric,2) AS median_lead_days,
      round((percentile_cont(0.9) WITHIN GROUP(ORDER BY o.actual_lead_days))::numeric,2) AS p90_lead_days,
      count(*) FILTER(WHERE o.on_time IS NOT NULL)::integer AS promised_delivery_sample_count,
      count(*) FILTER(WHERE o.on_time IS TRUE)::integer AS on_time_count,
      count(*) FILTER(WHERE o.is_completed AND o.promised_delivery_days IS NULL)::integer AS completed_without_promise_count,
      max(o.submitted_at) AS latest_submitted_at
    FROM measured_orders o GROUP BY o.supplier_id,o.supplier_name,o.supplier_code
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'supplierId',a.supplier_id,'supplierName',a.supplier_name,'supplierCode',a.supplier_code,
    'purchaseOrderCount',a.purchase_order_count,'completedOrderCount',a.completed_order_count,
    'openOrderCount',a.open_order_count,'inconsistentReceivedCount',a.inconsistent_received_count,
    'backlogQuantity',a.backlog_quantity,'leadTimeSampleCount',a.lead_time_sample_count,
    'averageLeadDays',a.average_lead_days,'medianLeadDays',a.median_lead_days,'p90LeadDays',a.p90_lead_days,
    'promisedDeliverySampleCount',a.promised_delivery_sample_count,'onTimeCount',a.on_time_count,
    'completedWithoutPromiseCount',a.completed_without_promise_count,
    'latestSubmittedAt',a.latest_submitted_at,'recentOrders',recent.items
  ) ORDER BY a.completed_order_count DESC,a.open_order_count DESC,a.supplier_name,a.supplier_id),'[]'::jsonb)
  INTO v_suppliers
  FROM (SELECT * FROM supplier_aggregate
        ORDER BY completed_order_count DESC,open_order_count DESC,supplier_name,supplier_id LIMIT p_limit) a
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'purchaseOrderId',x.id,'purchaseOrderNumber',x.purchase_order_number,'status',x.status,
      'submittedAt',x.submitted_at,'lastReceivedAt',x.last_receipt_at,
      'orderedQuantity',x.ordered_quantity,'receivedQuantity',x.received_quantity,
      'remainingQuantity',greatest(x.ordered_quantity-x.received_quantity,0),'receiptCount',x.receipt_count,
      'actualLeadDays',x.actual_lead_days,'promisedDeliveryDays',x.promised_delivery_days,'onTime',x.on_time
    ) ORDER BY x.submitted_at DESC,x.id DESC),'[]'::jsonb) AS items
    FROM (SELECT m.* FROM measured_orders m WHERE m.supplier_id=a.supplier_id
          ORDER BY m.submitted_at DESC,m.id DESC LIMIT 5) x
  ) recent;

  RETURN jsonb_build_object('asOf',v_as_of,'period',jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC'),
    'source','purchase_orders + purchase_order_items + purchase_receipts + awarded supplier quote delivery terms',
    'totalSupplierCount',v_total_suppliers,'returnedSupplierCount',jsonb_array_length(v_suppliers),
    'resultLimit',p_limit,'completePopulation',(v_total_suppliers<=p_limit),'suppliers',v_suppliers);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_supplier_performance_snapshot(date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_supplier_performance_snapshot(date,date,integer) TO authenticated;
COMMENT ON FUNCTION public.fetch_supplier_performance_snapshot(date,date,integer) IS
  'Read-only tenant-scoped supplier metrics. Lead time requires fully received orders; on-time requires awarded quote delivery days. No costs, balances, supplier score or mutations.';
