-- Complete, tenant-derived inventory evidence for dead-stock and replenishment engines.
-- Only historical movements, fulfilled order quantities, current balances and posted receipt history are used.
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
           coalesce(pg_catalog.sum(oi.quantity),0)::numeric(18,3)
      INTO v_sold_rows,v_sold
      FROM public.order_items oi
      JOIN public.orders o
        ON o.id=oi.order_id AND o.organization_id=v_org
     WHERE oi.product_id=v_product.id
       AND o.status IN ('delivered','invoiced')
       AND o.created_at>=p_period_from::timestamp
       AND o.created_at<(p_period_to+1)::timestamp
       AND o.created_at<=p_as_of
       AND o.updated_at<=p_as_of;

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

    v_evidence:=v_evidence||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id',v_movement_evidence_id,
        'source',pg_catalog.jsonb_build_object('kind','RPC','name','inventory.movement_history','recordId',v_product.id::text,'version','v1'),
        'sourceTimestamp',p_as_of,'asOf',p_as_of,'period',v_period,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'id',v_sales_evidence_id,
        'source',pg_catalog.jsonb_build_object('kind','RPC','name','orders.completed_sales_quantity','recordId',v_product.id::text,'version','v1'),
        'sourceTimestamp',p_as_of,'asOf',p_as_of,'period',v_period,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
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
      'value',v_sold,
      'unit','QUANTITY','unitOfMeasure',v_product.unit,
      'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE',
      'period',v_period,'asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',pg_catalog.jsonb_build_array(v_sales_evidence_id),
        'calculatedAt',p_as_of,'formulaId','inventory.completed-sales-quantity','formulaVersion','1',
        'transformations',pg_catalog.jsonb_build_array('sum of delivered and invoiced order item quantities in the requested period')
      ),
      'warnings','[]'::jsonb
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
  'Complete tenant-scoped inventory evidence. Movement coverage and sales quantities come from full same-organization scans; current ATP/reorder values require persisted balances; supplier lead time is quantity-weighted from actual submitted-to-received purchase records. Cost exposure and average historical inventory remain unavailable until source records exist.';
