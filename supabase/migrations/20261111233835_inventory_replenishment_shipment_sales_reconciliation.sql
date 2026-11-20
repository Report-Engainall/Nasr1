-- Preserve shipment-time sales velocity while retaining open-purchase-order commitments.
-- Every shipped order line must reconcile to its same-tenant sale movements before sales velocity is trusted.
-- Draft, cancelled and fully received purchase orders remain excluded; unit mismatches withhold incoming quantity.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_inventory_intelligence_aggregate(
  p_period_from date,
  p_period_to date,
  p_as_of timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_role text;
  v_now timestamptz;
  v_period jsonb;
  v_product_count integer;
  v_product public.products%ROWTYPE;
  v_balance_count integer;
  v_available numeric(18,3);
  v_reorder numeric(18,3);
  v_balance_updated_at timestamptz;
  v_last_movement timestamptz;
  v_sold numeric(18,3);
  v_sold_rows integer;
  v_sales_history_valid boolean:=true;
  v_incoming_unit_mismatch_rows integer;
  v_incoming_quantity numeric(18,3);
  v_incoming_updated_at timestamptz;
  v_incoming_evidence_id text;
  v_incoming_metric jsonb;
  v_lead_rows integer;
  v_lead_days numeric(12,3);
  v_lead_ids text[];
  v_lead_evidence jsonb;
  v_balance_evidence_id text;
  v_movement_evidence_id text;
  v_sales_evidence_id text;
  v_available_metric jsonb;
  v_reorder_metric jsonb;
  v_sold_metric jsonb;
  v_lead_metric jsonb;
  v_dead_stock_products jsonb:='[]'::jsonb;
  v_replenishment_products jsonb:='[]'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance manager permission required for inventory intelligence';
  END IF;

  SELECT p.organization_id,r.role
    INTO v_org,v_role
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active
     AND r.role IN ('admin','manager')
   ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
   LIMIT 1;
  IF v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active inventory organization required';
  END IF;

  v_now:=pg_catalog.now();
  IF p_period_from IS NULL OR p_period_to IS NULL OR p_as_of IS NULL
     OR p_period_from>p_period_to
     OR p_period_to<>(p_as_of AT TIME ZONE 'UTC')::date
     OR p_period_from<p_period_to-179
     OR p_as_of<v_now-interval '1 minute'
     OR p_as_of>v_now+interval '1 minute' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='inventory evidence period must be a current, bounded historical window';
  END IF;
  v_period:=pg_catalog.jsonb_build_object('from',p_period_from::text,'to',p_period_to::text);

  SELECT pg_catalog.count(*)::integer INTO v_product_count
    FROM public.products p
   WHERE p.organization_id=v_org AND p.status='active';

  IF v_product_count=0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','UNAVAILABLE','asOf',p_as_of,'period',v_period,
      'authorization',pg_catalog.jsonb_build_object('tenantScope','SERVER_RESOLVED_AUTHENTICATED_TENANT','effectiveRole',v_role),
      'totalProducts',0,'returnedProducts',0,'deadStockProducts','[]'::jsonb,
      'replenishmentProducts','[]'::jsonb,'evidenceRecords','[]'::jsonb,
      'sideEffects','NONE','warnings',pg_catalog.jsonb_build_array('NO_ACTIVE_PRODUCT_POPULATION')
    );
  END IF;

  -- Do not return a partial product population that could be mistaken for a complete stock report.
  IF v_product_count>2000 THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','PARTIAL','asOf',p_as_of,'period',v_period,
      'authorization',pg_catalog.jsonb_build_object('tenantScope','SERVER_RESOLVED_AUTHENTICATED_TENANT','effectiveRole',v_role),
      'totalProducts',v_product_count,'returnedProducts',0,'deadStockProducts','[]'::jsonb,
      'replenishmentProducts','[]'::jsonb,'evidenceRecords','[]'::jsonb,
      'sideEffects','NONE','warnings',pg_catalog.jsonb_build_array('PRODUCT_POPULATION_EXCEEDS_COMPLETE_REPORT_BOUND')
    );
  END IF;

  -- Validate the complete same-tenant shipment ledger before exposing sales velocity.
  -- Stock is issued on shipment, not order creation; every shipped/delivered/invoiced
  -- order line must reconcile exactly to its append-only sale movements.
  WITH expected AS (
    SELECT o.id AS order_id,oi.product_id,
           pg_catalog.sum(oi.quantity)::numeric(18,3) AS quantity
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id=o.id
     WHERE o.organization_id=v_org
       AND o.status IN ('shipped','delivered','invoiced')
       AND o.created_at<=p_as_of
       AND o.updated_at<=p_as_of
     GROUP BY o.id,oi.product_id
  ),
  actual AS (
    SELECT o.id AS order_id,im.product_id,
           pg_catalog.sum(-im.quantity)::numeric(18,3) AS quantity,
           pg_catalog.bool_and(im.quantity<0) AS all_negative
      FROM public.inventory_movements im
      JOIN public.orders o
        ON o.id=im.reference_id AND o.organization_id=v_org
      JOIN public.warehouses w
        ON w.id=im.warehouse_id AND w.organization_id=v_org
     WHERE im.reference_type='order'
       AND im.movement_type='sale'
       AND im.created_at<=p_as_of
       AND o.created_at<=p_as_of
       AND o.updated_at<=p_as_of
     GROUP BY o.id,im.product_id
  )
  SELECT NOT EXISTS (
    SELECT 1
      FROM expected e
      FULL OUTER JOIN actual a
        ON a.order_id=e.order_id AND a.product_id=e.product_id
     WHERE e.order_id IS NULL
        OR a.order_id IS NULL
        OR e.product_id IS NULL
        OR e.quantity IS DISTINCT FROM a.quantity
        OR a.all_negative IS DISTINCT FROM true
  )
    INTO v_sales_history_valid;
  FOR v_product IN
    SELECT p.* FROM public.products p
     WHERE p.organization_id=v_org AND p.status='active'
     ORDER BY p.item_code,p.id
  LOOP
    SELECT pg_catalog.count(*)::integer,
           pg_catalog.sum(ib.quantity_available)::numeric(18,3),
           pg_catalog.sum(ib.reorder_point)::numeric(18,3),
           pg_catalog.max(ib.updated_at)
      INTO v_balance_count,v_available,v_reorder,v_balance_updated_at
      FROM public.inventory_balances ib
      JOIN public.warehouses w
        ON w.id=ib.warehouse_id AND w.organization_id=v_org
     WHERE ib.product_id=v_product.id
       AND ib.updated_at<=p_as_of;

    SELECT pg_catalog.max(m.created_at)
      INTO v_last_movement
      FROM public.inventory_movements m
      JOIN public.warehouses w
        ON w.id=m.warehouse_id AND w.organization_id=v_org
     WHERE m.product_id=v_product.id AND m.created_at<=p_as_of;

    SELECT pg_catalog.count(*)::integer,
           coalesce(pg_catalog.sum(-im.quantity),0)::numeric(18,3)
      INTO v_sold_rows,v_sold
      FROM public.inventory_movements im
      JOIN public.orders o
        ON o.id=im.reference_id AND o.organization_id=v_org
      JOIN public.warehouses w
        ON w.id=im.warehouse_id AND w.organization_id=v_org
     WHERE im.product_id=v_product.id
       AND im.reference_type='order'
       AND im.movement_type='sale'
       AND im.quantity<0
       AND o.status IN ('shipped','delivered','invoiced')
       AND im.created_at>=(p_period_from::timestamp AT TIME ZONE 'UTC')
       AND im.created_at<((p_period_to+1)::timestamp AT TIME ZONE 'UTC')
       AND im.created_at<=p_as_of
       AND o.created_at<=p_as_of
       AND o.updated_at<=p_as_of;

    -- Confirmed supplier commitments reduce replenishment need before another order is suggested.
    -- Draft, cancelled and fully received orders are deliberately excluded; UOM changes fail closed.
    SELECT
      (pg_catalog.count(*) FILTER (WHERE poi.unit_snapshot IS DISTINCT FROM v_product.unit))::integer,
      coalesce(pg_catalog.sum(poi.quantity_ordered-poi.quantity_received)
        FILTER (WHERE poi.unit_snapshot IS NOT DISTINCT FROM v_product.unit),0)::numeric(18,3),
      pg_catalog.max(po.updated_at)
      INTO v_incoming_unit_mismatch_rows,v_incoming_quantity,v_incoming_updated_at
      FROM public.purchase_order_items poi
      JOIN public.purchase_orders po ON po.id=poi.purchase_order_id AND po.organization_id=poi.organization_id
     WHERE poi.organization_id=v_org AND poi.product_id=v_product.id
       AND po.status IN ('submitted','partially_received') AND po.submitted_at IS NOT NULL
       AND po.submitted_at<=p_as_of AND po.updated_at<=p_as_of AND poi.created_at<=p_as_of
       AND poi.quantity_ordered>poi.quantity_received;

    SELECT pg_catalog.count(*)::integer
      INTO v_lead_rows
      FROM public.purchase_receipt_items pri
      JOIN public.purchase_receipts pr
        ON pr.id=pri.receipt_id AND pr.organization_id=pri.organization_id
      JOIN public.purchase_orders po
        ON po.id=pr.purchase_order_id AND po.organization_id=pr.organization_id
     WHERE pri.product_id=v_product.id
       AND pri.organization_id=v_org
       AND pr.received_at<=p_as_of
       AND pr.received_at>=p_as_of-interval '365 days'
       AND po.status IN ('partially_received','received')
       AND po.submitted_at IS NOT NULL
       AND pr.received_at>=po.submitted_at
       AND pri.quantity_received>0;

    v_balance_evidence_id:='inventory-balance:'||v_product.id::text;
    v_movement_evidence_id:='movement-window:'||v_product.id::text;
    v_sales_evidence_id:='sales-window:'||v_product.id::text;
    v_incoming_evidence_id:='purchase-order-commitments:'||v_product.id::text;

    v_evidence:=v_evidence||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id',v_movement_evidence_id,
        'source',pg_catalog.jsonb_build_object('kind','RPC','name','inventory.movement_history','recordId',v_product.id::text,'version','v1'),
        'sourceTimestamp',p_as_of,'asOf',p_as_of,'period',v_period,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'id',v_sales_evidence_id,
        'source',pg_catalog.jsonb_build_object('kind','RPC','name','inventory.sale_movements','recordId',v_product.id::text,'version','v2'),
        'sourceTimestamp',p_as_of,'asOf',p_as_of,'period',v_period,
        'status',CASE WHEN v_sales_history_valid THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
        'completeness',CASE WHEN v_sales_history_valid THEN 'COMPLETE' ELSE 'PARTIAL' END,
        'quality',CASE WHEN v_sales_history_valid THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
        'warnings',CASE WHEN v_sales_history_valid THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('SALES_MOVEMENT_HISTORY_NOT_RECONCILED') END
      ),
      pg_catalog.jsonb_build_object(
        'id',v_incoming_evidence_id,
        'source',pg_catalog.jsonb_build_object('kind','RPC','name','purchase_orders.remaining_quantity','recordId',v_product.id::text,'version','v1'),
        'sourceTimestamp',coalesce(v_incoming_updated_at,p_as_of),'asOf',p_as_of,'period',NULL,
        'status',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
        'completeness',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN 'COMPLETE' ELSE 'PARTIAL' END,
        'quality',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
        'warnings',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('OPEN_PURCHASE_ORDER_UNIT_MISMATCH') END
      )
    );

    IF v_balance_count>0 THEN
      v_evidence:=v_evidence||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id',v_balance_evidence_id,
          'source',pg_catalog.jsonb_build_object('kind','RPC','name','inventory.current_balances','recordId',v_product.id::text,'version','v1'),
          'sourceTimestamp',coalesce(v_balance_updated_at,p_as_of),'asOf',p_as_of,'period',NULL,
          'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
        )
      );
    END IF;

    v_available_metric:=pg_catalog.jsonb_build_object(
      'id','metric:inventory.available:'||v_product.id::text,
      'key','inventory.available_to_promise',
      'value',CASE WHEN v_balance_count>0 THEN coalesce(v_available,0) ELSE NULL END,
      'unit','QUANTITY','unitOfMeasure',v_product.unit,
      'status',CASE WHEN v_balance_count>0 THEN 'VERIFIED' ELSE 'UNAVAILABLE' END,
      'completeness',CASE WHEN v_balance_count>0 THEN 'COMPLETE' ELSE 'UNKNOWN' END,
      'quality',CASE WHEN v_balance_count>0 THEN 'ACCEPTABLE' ELSE 'UNKNOWN' END,
      'period',NULL,'asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',CASE WHEN v_balance_count>0 THEN pg_catalog.jsonb_build_array(v_balance_evidence_id) ELSE '[]'::jsonb END,
        'calculatedAt',p_as_of,'formulaId','inventory.available-to-promise','formulaVersion','1',
        'transformations',pg_catalog.jsonb_build_array('sum of current quantity_available across same-organization warehouses')
      ),
      'warnings',CASE WHEN v_balance_count>0 THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('NO_INVENTORY_BALANCE') END
    );
    v_reorder_metric:=pg_catalog.jsonb_build_object(
      'id','metric:inventory.reorder-point:'||v_product.id::text,
      'key','inventory.reorder_point',
      'value',CASE WHEN v_balance_count>0 THEN coalesce(v_reorder,0) ELSE NULL END,
      'unit','QUANTITY','unitOfMeasure',v_product.unit,
      'status',CASE WHEN v_balance_count>0 THEN 'VERIFIED' ELSE 'UNAVAILABLE' END,
      'completeness',CASE WHEN v_balance_count>0 THEN 'COMPLETE' ELSE 'UNKNOWN' END,
      'quality',CASE WHEN v_balance_count>0 THEN 'ACCEPTABLE' ELSE 'UNKNOWN' END,
      'period',NULL,'asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',CASE WHEN v_balance_count>0 THEN pg_catalog.jsonb_build_array(v_balance_evidence_id) ELSE '[]'::jsonb END,
        'calculatedAt',p_as_of,'formulaId','inventory.reorder-point','formulaVersion','1',
        'transformations',pg_catalog.jsonb_build_array('sum of persisted warehouse reorder points; no missing warehouse row is substituted with zero')
      ),
      'warnings',CASE WHEN v_balance_count>0 THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('NO_INVENTORY_BALANCE') END
    );
    v_sold_metric:=pg_catalog.jsonb_build_object(
      'id','metric:inventory.sold-quantity:'||v_product.id::text,
      'key','inventory.sold_quantity_window',
      'value',CASE WHEN v_sales_history_valid THEN v_sold ELSE NULL END,
      'unit','QUANTITY','unitOfMeasure',v_product.unit,
      'status',CASE WHEN v_sales_history_valid THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
      'completeness',CASE WHEN v_sales_history_valid THEN 'COMPLETE' ELSE 'PARTIAL' END,
      'quality',CASE WHEN v_sales_history_valid THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
      'period',v_period,'asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',pg_catalog.jsonb_build_array(v_sales_evidence_id),
        'calculatedAt',p_as_of,'formulaId','inventory.sale-movement-quantity','formulaVersion','2',
        'transformations',pg_catalog.jsonb_build_array('sum of same-tenant negative sale inventory movements by movement timestamp; shipment is the stock-issue point')
      ),
      'warnings',CASE WHEN v_sales_history_valid THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('SALES_MOVEMENT_HISTORY_NOT_RECONCILED') END
    );

    v_incoming_metric:=pg_catalog.jsonb_build_object(
      'id','metric:inventory.incoming-purchase-quantity:'||v_product.id::text,
      'key','inventory.incoming_purchase_order_quantity',
      'value',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN coalesce(v_incoming_quantity,0) ELSE NULL END,
      'unit','QUANTITY','unitOfMeasure',v_product.unit,
      'status',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
      'completeness',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN 'COMPLETE' ELSE 'PARTIAL' END,
      'quality',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
      'period',NULL,'asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object('evidenceIds',pg_catalog.jsonb_build_array(v_incoming_evidence_id),
        'calculatedAt',p_as_of,'formulaId','inventory.open-purchase-order-commitments','formulaVersion','1',
        'transformations',pg_catalog.jsonb_build_array('sum remaining quantities for same-organization submitted/partially received orders; exclude draft, cancelled and fully received; require matching product unit snapshot')),
      'warnings',CASE WHEN v_incoming_unit_mismatch_rows=0 THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('OPEN_PURCHASE_ORDER_UNIT_MISMATCH') END
    );

    v_lead_ids:=ARRAY[]::text[];
    v_lead_evidence:='[]'::jsonb;
    v_lead_days:=NULL;
    IF v_lead_rows>0 AND v_lead_rows<=500 THEN
      SELECT
        (pg_catalog.sum(pg_catalog.date_part('epoch',pr.received_at-po.submitted_at)/86400*pri.quantity_received)
          /NULLIF(pg_catalog.sum(pri.quantity_received),0))::numeric(12,3),
        pg_catalog.array_agg('purchase-receipt-item:'||pri.id::text ORDER BY pr.received_at,pri.id),
        coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id','purchase-receipt-item:'||pri.id::text,
            'source',pg_catalog.jsonb_build_object('kind','TABLE','name','purchase_receipt_items','recordId',pri.id::text),
            'sourceTimestamp',pr.received_at,'asOf',p_as_of,'period',NULL,
            'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
          ) ORDER BY pr.received_at,pri.id
        ),'[]'::jsonb)
        INTO v_lead_days,v_lead_ids,v_lead_evidence
        FROM public.purchase_receipt_items pri
        JOIN public.purchase_receipts pr
          ON pr.id=pri.receipt_id AND pr.organization_id=pri.organization_id
        JOIN public.purchase_orders po
          ON po.id=pr.purchase_order_id AND po.organization_id=pr.organization_id
       WHERE pri.product_id=v_product.id
         AND pri.organization_id=v_org
         AND pr.received_at<=p_as_of
         AND pr.received_at>=p_as_of-interval '365 days'
         AND po.status IN ('partially_received','received')
         AND po.submitted_at IS NOT NULL
         AND pr.received_at>=po.submitted_at
         AND pri.quantity_received>0;
      v_evidence:=v_evidence||v_lead_evidence;
    END IF;
    v_lead_metric:=pg_catalog.jsonb_build_object(
      'id','metric:inventory.observed-lead-time:'||v_product.id::text,
      'key','inventory.observed_supplier_lead_time_days',
      'value',CASE WHEN v_lead_rows>0 AND v_lead_rows<=500 THEN v_lead_days ELSE NULL END,
      'unit','DAYS',
      'status',CASE WHEN v_lead_rows>0 AND v_lead_rows<=500 THEN 'VERIFIED' WHEN v_lead_rows>500 THEN 'NEEDS_REVIEW' ELSE 'UNAVAILABLE' END,
      'completeness',CASE WHEN v_lead_rows>0 AND v_lead_rows<=500 THEN 'COMPLETE' WHEN v_lead_rows>500 THEN 'PARTIAL' ELSE 'UNKNOWN' END,
      'quality',CASE WHEN v_lead_rows>0 AND v_lead_rows<=500 THEN 'ACCEPTABLE' WHEN v_lead_rows>500 THEN 'WARNINGS' ELSE 'UNKNOWN' END,
      'period',NULL,'asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',to_jsonb(CASE WHEN v_lead_rows>0 AND v_lead_rows<=500 THEN v_lead_ids ELSE ARRAY[]::text[] END),
        'calculatedAt',p_as_of,'formulaId','inventory.observed-receipt-lead-time','formulaVersion','1',
        'transformations',pg_catalog.jsonb_build_array('quantity-weighted average days from purchase order submission to actual same-organization receipt; trailing 365 days')
      ),
      'warnings',CASE WHEN v_lead_rows>500 THEN pg_catalog.jsonb_build_array('RECEIPT_EVIDENCE_EXCEEDS_COMPLETE_LINEAGE_BOUND') WHEN v_lead_rows=0 THEN pg_catalog.jsonb_build_array('NO_OBSERVED_SUPPLIER_RECEIPT_HISTORY') ELSE '[]'::jsonb END
    );

    v_dead_stock_products:=v_dead_stock_products||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'productRef',coalesce(nullif(pg_catalog.btrim(v_product.item_code),''),v_product.id::text),
        'lastMovementAt',v_last_movement,
        'movementCoverage',pg_catalog.jsonb_build_object(
          'status','VERIFIED','period',v_period,'completeness','COMPLETE','quality','ACCEPTABLE',
          'evidenceIds',pg_catalog.jsonb_build_array(v_movement_evidence_id)
        ),
        'availableQuantity',v_available_metric,
        'quantityUnit',v_product.unit,
        'unitCost',NULL,
        'soldQuantityWindow',v_sold_metric,
        'averageInventoryWindow',NULL
      )
    );
    v_replenishment_products:=v_replenishment_products||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'productRef',coalesce(nullif(pg_catalog.btrim(v_product.item_code),''),v_product.id::text),
        'availableToPromise',v_available_metric,
        'reorderPoint',v_reorder_metric,
        'soldQuantityWindow',v_sold_metric,
        'supplierLeadTimeDays',v_lead_metric,
        'incomingPurchaseQuantity',v_incoming_metric,
        'quantityUnit',v_product.unit
      )
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'status','OK','asOf',p_as_of,'period',v_period,
    'authorization',pg_catalog.jsonb_build_object(
      'tenantScope','SERVER_RESOLVED_AUTHENTICATED_TENANT','effectiveRole',v_role
    ),
    'totalProducts',v_product_count,'returnedProducts',v_product_count,
    'deadStockProducts',v_dead_stock_products,
    'replenishmentProducts',v_replenishment_products,
    'evidenceRecords',v_evidence,
    'sideEffects','NONE',
    'warnings',v_warnings
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inventory_intelligence_aggregate(date,date,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_intelligence_aggregate(date,date,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.get_inventory_intelligence_aggregate(date,date,timestamptz) IS
  'Tenant-scoped inventory intelligence with shipment-time sales velocity. Every same-tenant shipped/delivered/invoiced order line must reconcile exactly to negative sale movements before any product sales quantity is exposed. Sales windows use stock-issue movement timestamps, not order creation timestamps. Open submitted/partially received purchase-order remainder is included only with matching UOM; drafts, cancelled and fully received orders are excluded. Current ATP/reorder requires persisted balances; observed lead time uses actual submitted-to-received purchase records. Cost exposure and average historical inventory remain unavailable until their source contracts exist.';

COMMIT;
