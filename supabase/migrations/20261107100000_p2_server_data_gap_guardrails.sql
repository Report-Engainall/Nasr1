-- P2 server/data enforcement increment on 2026-11-06.
-- Additive follow-up to already-defined engines; no competing service, RPC, or UI engine is introduced.
-- All privacy decisions and side effects are committed atomically by process_outbox_event.
BEGIN;
-- The existing open-purchase-order aggregate is hardened with supplier, warehouse, unit and as-of checks.
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
  v_incoming_invalid_source_rows integer;
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

    -- Confirmed supplier commitments reduce replenishment need before another order is suggested.
    -- Draft, cancelled and fully received orders are deliberately excluded; UOM changes fail closed.
    SELECT
      (pg_catalog.count(*) FILTER (
        WHERE poi.unit_snapshot IS DISTINCT FROM v_product.unit
           OR s.id IS NULL OR w.id IS NULL
      ))::integer,
      coalesce(pg_catalog.sum(poi.quantity_ordered-poi.quantity_received)
        FILTER (
          WHERE poi.unit_snapshot IS NOT DISTINCT FROM v_product.unit
            AND s.id IS NOT NULL AND w.id IS NOT NULL
        ),0)::numeric(18,3),
      pg_catalog.max(po.updated_at)
      INTO v_incoming_invalid_source_rows,v_incoming_quantity,v_incoming_updated_at
      FROM public.purchase_order_items poi
      JOIN public.purchase_orders po
        ON po.id=poi.purchase_order_id AND po.organization_id=poi.organization_id
      LEFT JOIN public.suppliers s
        ON s.id=po.supplier_id AND s.organization_id=po.organization_id
      LEFT JOIN public.warehouses w
        ON w.id=po.warehouse_id AND w.organization_id=po.organization_id
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
      JOIN public.suppliers supplier
        ON supplier.id=po.supplier_id AND supplier.organization_id=po.organization_id
      JOIN public.warehouses order_warehouse
        ON order_warehouse.id=po.warehouse_id AND order_warehouse.organization_id=po.organization_id
      JOIN public.warehouses receipt_warehouse
        ON receipt_warehouse.id=pr.warehouse_id AND receipt_warehouse.organization_id=pr.organization_id
       AND receipt_warehouse.id=order_warehouse.id
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
        'source',pg_catalog.jsonb_build_object('kind','RPC','name','orders.completed_sales_quantity','recordId',v_product.id::text,'version','v1'),
        'sourceTimestamp',p_as_of,'asOf',p_as_of,'period',v_period,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'id',v_incoming_evidence_id,
        'source',pg_catalog.jsonb_build_object('kind','RPC','name','purchase_orders.remaining_quantity','recordId',v_product.id::text,'version','v1'),
        'sourceTimestamp',coalesce(v_incoming_updated_at,p_as_of),'asOf',p_as_of,'period',NULL,
        'status',CASE WHEN v_incoming_invalid_source_rows=0 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
        'completeness',CASE WHEN v_incoming_invalid_source_rows=0 THEN 'COMPLETE' ELSE 'PARTIAL' END,
        'quality',CASE WHEN v_incoming_invalid_source_rows=0 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
        'warnings',CASE WHEN v_incoming_invalid_source_rows=0 THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('OPEN_PURCHASE_ORDER_SOURCE_OR_UNIT_MISMATCH') END
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

    v_incoming_metric:=pg_catalog.jsonb_build_object(
      'id','metric:inventory.incoming-purchase-quantity:'||v_product.id::text,
      'key','inventory.incoming_purchase_order_quantity',
      'value',CASE WHEN v_incoming_invalid_source_rows=0 THEN coalesce(v_incoming_quantity,0) ELSE NULL END,
      'unit','QUANTITY','unitOfMeasure',v_product.unit,
      'status',CASE WHEN v_incoming_invalid_source_rows=0 THEN 'VERIFIED' ELSE 'NEEDS_REVIEW' END,
      'completeness',CASE WHEN v_incoming_invalid_source_rows=0 THEN 'COMPLETE' ELSE 'PARTIAL' END,
      'quality',CASE WHEN v_incoming_invalid_source_rows=0 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
      'period',NULL,'asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object('evidenceIds',pg_catalog.jsonb_build_array(v_incoming_evidence_id),
        'calculatedAt',p_as_of,'formulaId','inventory.open-purchase-order-commitments','formulaVersion','1',
        'transformations',pg_catalog.jsonb_build_array('sum remaining quantities for same-organization submitted/partially received orders; exclude draft, cancelled and fully received; require matching product unit snapshot')),
      'warnings',CASE WHEN v_incoming_invalid_source_rows=0 THEN '[]'::jsonb ELSE pg_catalog.jsonb_build_array('OPEN_PURCHASE_ORDER_SOURCE_OR_UNIT_MISMATCH') END
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
  'Tenant-scoped complete inventory intelligence. Open purchase commitments count remaining quantities only from submitted/partially received orders at one as-of timestamp, with matching product unit and same-organization supplier/warehouse ownership. Draft, cancelled, received and exhausted lines are excluded; a source or unit mismatch withholds the incoming metric. One product loop prevents duplicate recommendation aggregation.';

-- The quality event stream remains append-only, including protection against direct TRUNCATE.
DROP TRIGGER IF EXISTS operational_task_quality_events_no_truncate ON public.operational_task_quality_events;
CREATE TRIGGER operational_task_quality_events_no_truncate
BEFORE TRUNCATE ON public.operational_task_quality_events
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_operational_task_quality_event_mutation();
CREATE OR REPLACE FUNCTION public.fetch_operational_task_quality_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','RESTRICTED',
      'reasonCode','QUALITY_REVIEW_MANAGER_ONLY'
    );
  END IF;

  WITH visible_tasks AS MATERIALIZED (
    SELECT t.id
    FROM public.ai_tasks t
    WHERE t.organization_id=v_org
      AND public.can_view_operational_task_role(t.task_role)
  ),
  ranked AS MATERIALIZED (
    SELECT e.*,
      coalesce(e.decision_outcome_id::text,'task:'||e.task_id::text) AS review_subject,
      pg_catalog.row_number() OVER (
        PARTITION BY e.review_type,e.task_id,e.decision_outcome_id
        ORDER BY e.created_at DESC,e.id DESC
      ) AS review_rank
    FROM public.operational_task_quality_events e
    JOIN visible_tasks t ON t.id=e.task_id
    WHERE e.organization_id=v_org
  ),
  latest AS MATERIALIZED (
    SELECT * FROM ranked WHERE review_rank=1
  ),
  event_counts AS (
    SELECT count(*)::integer AS total_count,
      count(*) FILTER (WHERE e.review_type='ACTIONABILITY')::integer AS actionability_event_count,
      count(*) FILTER (WHERE e.review_type='RECOMMENDATION_DISPOSITION')::integer AS disposition_event_count,
      count(*) FILTER (WHERE e.review_type='ALERT_VALIDATION')::integer AS alert_event_count
    FROM public.operational_task_quality_events e
    JOIN visible_tasks t ON t.id=e.task_id
    WHERE e.organization_id=v_org
  ),
  action_counts AS (
    SELECT
      count(*) AS reviewed_count,
      count(*) FILTER (WHERE actionability='ACTIONABLE') AS actionable_count,
      count(*) FILTER (WHERE actionability='NOT_ACTIONABLE') AS not_actionable_count,
      count(*) FILTER (WHERE actionability='DEFERRED') AS deferred_count
    FROM latest WHERE review_type='ACTIONABILITY'
  ),
  disposition_counts AS (
    SELECT
      count(*) AS reviewed_count,
      count(*) FILTER (WHERE disposition='APPROVED') AS approved_count,
      count(*) FILTER (WHERE disposition='REJECTED') AS rejected_count,
      count(*) FILTER (WHERE disposition='DEFERRED') AS deferred_count
    FROM latest WHERE review_type='RECOMMENDATION_DISPOSITION'
  ),
  alert_counts AS (
    SELECT
      count(*) AS reviewed_count,
      count(*) FILTER (WHERE alert_verdict='TRUE_POSITIVE') AS true_positive_count,
      count(*) FILTER (WHERE alert_verdict='FALSE_POSITIVE') AS false_positive_count,
      count(*) FILTER (WHERE alert_verdict='NEEDS_REVIEW') AS needs_review_count
    FROM latest WHERE review_type='ALERT_VALIDATION'
  ),
  cause_counts AS (
    SELECT reason_code,count(DISTINCT task_id) AS task_count,count(*) AS event_count
    FROM latest
    WHERE reason_code IS NOT NULL
      AND (
        (review_type='ACTIONABILITY' AND actionability IN ('NOT_ACTIONABLE','DEFERRED'))
        OR (review_type='RECOMMENDATION_DISPOSITION' AND disposition IN ('REJECTED','DEFERRED'))
        OR (review_type='ALERT_VALIDATION' AND alert_verdict='FALSE_POSITIVE')
      )
    GROUP BY reason_code
    HAVING count(DISTINCT task_id)>1
  ),
  rejection_reasons AS (
    SELECT reason_code,count(*) AS review_count,count(DISTINCT task_id) AS task_count
    FROM latest
    WHERE review_type='RECOMMENDATION_DISPOSITION' AND disposition='REJECTED' AND reason_code IS NOT NULL
    GROUP BY reason_code
  ),
  deferral_reasons AS (
    SELECT reason_code,count(*) AS review_count,count(DISTINCT task_id) AS task_count
    FROM latest
    WHERE (
      (review_type='RECOMMENDATION_DISPOSITION' AND disposition='DEFERRED')
      OR (review_type='ACTIONABILITY' AND actionability='DEFERRED')
    ) AND reason_code IS NOT NULL
    GROUP BY reason_code
  ),
  non_actionable_reasons AS (
    SELECT reason_code,count(*) AS review_count,count(DISTINCT task_id) AS task_count
    FROM latest
    WHERE review_type='ACTIONABILITY' AND actionability='NOT_ACTIONABLE' AND reason_code IS NOT NULL
    GROUP BY reason_code
  )
  SELECT pg_catalog.jsonb_build_object(
    'status',CASE WHEN (SELECT count(*) FROM latest)=0 THEN 'EMPTY' ELSE 'READY' END,
    'eventCounts',(SELECT pg_catalog.jsonb_build_object(
      'totalEvents',e.total_count,'actionabilityEvents',e.actionability_event_count,
      'dispositionEvents',e.disposition_event_count,'alertValidationEvents',e.alert_event_count
    ) FROM event_counts e),
    'scope',pg_catalog.jsonb_build_object(
      'visibleTaskCount',(SELECT count(*) FROM visible_tasks),
      'reviewedTaskCount',(SELECT count(DISTINCT task_id) FROM latest)
    ),
    'actionability',(
      SELECT pg_catalog.jsonb_build_object(
        'reviewedCount',a.reviewed_count,
        'actionableCount',a.actionable_count,
        'notActionableCount',a.not_actionable_count,
        'deferredCount',a.deferred_count,
        'deferralDenominator',a.reviewed_count,
        'deferralRatePercent',CASE WHEN a.reviewed_count>0
          THEN pg_catalog.round(a.deferred_count*100.0/a.reviewed_count,2) ELSE NULL END,
        'rateDenominator',a.actionable_count+a.not_actionable_count,
        'actionableRatePercent',CASE WHEN a.actionable_count+a.not_actionable_count>0
          THEN pg_catalog.round(a.actionable_count*100.0/(a.actionable_count+a.not_actionable_count),2) ELSE NULL END,
        'notActionableReasons',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'reasonCode',r.reason_code,'reviewCount',r.review_count,'affectedTaskCount',r.task_count
          ) ORDER BY r.review_count DESC,r.reason_code)
          FROM non_actionable_reasons r
        ),'[]'::jsonb)
      ) FROM action_counts a
    ),
    'disposition',(
      SELECT pg_catalog.jsonb_build_object(
        'reviewedCount',d.reviewed_count,
        'approvedCount',d.approved_count,
        'rejectedCount',d.rejected_count,
        'deferredCount',d.deferred_count,
        'decisionDenominator',d.approved_count+d.rejected_count,
        'deferralDenominator',d.approved_count+d.rejected_count+d.deferred_count,
        'approvalRatePercent',CASE WHEN d.approved_count+d.rejected_count>0
          THEN pg_catalog.round(d.approved_count*100.0/(d.approved_count+d.rejected_count),2) ELSE NULL END,
        'rejectionRatePercent',CASE WHEN d.approved_count+d.rejected_count>0
          THEN pg_catalog.round(d.rejected_count*100.0/(d.approved_count+d.rejected_count),2) ELSE NULL END,
        'deferralRatePercent',CASE WHEN d.approved_count+d.rejected_count+d.deferred_count>0
          THEN pg_catalog.round(d.deferred_count*100.0/(d.approved_count+d.rejected_count+d.deferred_count),2) ELSE NULL END,
        'rejectionReasons',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'reasonCode',r.reason_code,'reviewCount',r.review_count,'affectedTaskCount',r.task_count
          ) ORDER BY r.review_count DESC,r.reason_code)
          FROM rejection_reasons r
        ),'[]'::jsonb),
        'deferralReasons',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'reasonCode',r.reason_code,'reviewCount',r.review_count,'affectedTaskCount',r.task_count
          ) ORDER BY r.review_count DESC,r.reason_code)
          FROM deferral_reasons r
        ),'[]'::jsonb)
      ) FROM disposition_counts d
    ),
    'alerts',(
      SELECT pg_catalog.jsonb_build_object(
        'reviewedCount',a.reviewed_count,
        'truePositiveCount',a.true_positive_count,
        'falsePositiveCount',a.false_positive_count,
        'needsReviewCount',a.needs_review_count,
        'verdictDenominator',a.reviewed_count,
        'needsReviewRatePercent',CASE WHEN a.reviewed_count>0
          THEN pg_catalog.round(a.needs_review_count*100.0/a.reviewed_count,2) ELSE NULL END,
        'falseAlarmDenominator',a.true_positive_count+a.false_positive_count,
        'falseAlarmRatePercent',CASE WHEN a.true_positive_count+a.false_positive_count>0
          THEN pg_catalog.round(a.false_positive_count*100.0/(a.true_positive_count+a.false_positive_count),2) ELSE NULL END
      ) FROM alert_counts a
    ),
    'causeReviewCount',(
      SELECT count(*) FROM latest
      WHERE reason_code IS NOT NULL
        AND (
          (review_type='ACTIONABILITY' AND actionability IN ('NOT_ACTIONABLE','DEFERRED'))
          OR (review_type='RECOMMENDATION_DISPOSITION' AND disposition IN ('REJECTED','DEFERRED'))
          OR (review_type='ALERT_VALIDATION' AND alert_verdict='FALSE_POSITIVE')
        )
    ),
    'repeatedCauses',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reasonCode',c.reason_code,'affectedTaskCount',c.task_count,'reviewCount',c.event_count
      ) ORDER BY c.task_count DESC,c.reason_code)
      FROM cause_counts c
    ),'[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;


REVOKE ALL ON FUNCTION public.fetch_operational_task_quality_metrics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_operational_task_quality_metrics() TO authenticated;
COMMENT ON FUNCTION public.fetch_operational_task_quality_metrics() IS
  'Manager-only tenant-scoped task quality metrics. Current rates use the latest review per task/decision subject; eventCounts separately report every immutable review event. Approval and rejection share the approved+rejected denominator; deferral uses all final dispositions; alert false-alarm rates exclude NEEDS_REVIEW and expose their own denominator.';

-- Extend the existing outbox processor; the Edge handler remains a transport-only adapter.
CREATE OR REPLACE FUNCTION public.process_outbox_event(p_event_id uuid,p_worker text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_event public.outbox_events%ROWTYPE;
  v_order_number text;
  v_order_status text;
  v_delivery_id uuid;
  v_notifications integer:=0;
  v_policy jsonb:='{}'::jsonb;
  v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_event_id IS NULL OR coalesce(length(btrim(p_worker)),0)<1 OR length(p_worker)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid outbox event or worker';
  END IF;
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='outbox processing requires a trusted worker';
  END IF;
  SELECT e.* INTO v_event FROM public.outbox_events e WHERE e.id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='outbox event not found'; END IF;
  IF v_event.status='processed' THEN
    RETURN pg_catalog.jsonb_build_object('status','already_processed','event_id',v_event.id);
  END IF;
  IF v_event.status<>'processing' OR v_event.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='outbox event is not leased to this worker';
  END IF;
  IF v_event.organization_id IS NULL OR v_event.event_type<>'OrderCreated' OR v_event.aggregate_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='0A000',MESSAGE='unsupported outbox event type or missing tenant/aggregate';
  END IF;
  SELECT o.order_number,o.status INTO v_order_number,v_order_status
  FROM public.orders o
  WHERE o.id=v_event.aggregate_id AND o.organization_id=v_event.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='OrderCreated aggregate is missing from its organization';
  END IF;

  INSERT INTO public.outbox_event_deliveries(event_id,organization_id,consumer_key)
  VALUES(v_event.id,v_event.organization_id,'in_app_order_created')
  ON CONFLICT(event_id,consumer_key) DO NOTHING
  RETURNING event_id INTO v_delivery_id;

  IF v_delivery_id IS NOT NULL THEN
    WITH recipient_preferences AS MATERIALIZED (
      SELECT p.id AS profile_id,
        coalesce(pref.notification_channels,ARRAY['IN_APP']::text[]) AS channels,
        coalesce(pref.notification_level,'ALL') AS notification_level,
        coalesce(pref.quiet_hours_enabled,false) AS quiet_hours_enabled,
        coalesce(pref.quiet_hours_start,TIME '22:00') AS quiet_hours_start,
        coalesce(pref.quiet_hours_end,TIME '07:00') AS quiet_hours_end,
        coalesce(pref.quiet_hours_time_zone,'UTC') AS quiet_hours_time_zone,
        coalesce(pref.detail_level,'SUMMARY') AS detail_level,
        coalesce(pref.external_processing_enabled,false) AS external_processing_enabled,
        EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z
          WHERE z.name=coalesce(pref.quiet_hours_time_zone,'UTC')) AS timezone_valid,
        CASE WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z
          WHERE z.name=coalesce(pref.quiet_hours_time_zone,'UTC'))
          THEN (v_now AT TIME ZONE coalesce(pref.quiet_hours_time_zone,'UTC'))::time
          ELSE NULL::time END AS local_now
      FROM public.profiles p
      LEFT JOIN public.profile_personalization_preferences pref
        ON pref.profile_id=p.id AND pref.organization_id=p.organization_id
      WHERE p.organization_id=v_event.organization_id
        AND p.is_active=true AND p.auth_user_id IS NOT NULL
        AND EXISTS(SELECT 1 FROM public.user_roles r
          WHERE r.profile_id=p.id AND r.role IN ('admin','manager','staff'))
    ),
    decisions AS MATERIALIZED (
      SELECT rp.*,
        CASE
          WHEN NOT ('IN_APP'=ANY(rp.channels)) THEN 'SUPPRESS'
          WHEN NOT rp.timezone_valid THEN 'REVIEW'
          WHEN rp.notification_level NOT IN ('ALL','IMPORTANT') THEN 'SUPPRESS'
          WHEN rp.quiet_hours_enabled AND
            (CASE WHEN rp.quiet_hours_start<rp.quiet_hours_end
              THEN rp.local_now>=rp.quiet_hours_start AND rp.local_now<rp.quiet_hours_end
              ELSE rp.local_now>=rp.quiet_hours_start OR rp.local_now<rp.quiet_hours_end END)
            THEN 'SUPPRESS'
          ELSE 'ALLOW'
        END AS in_app_decision,
        CASE
          WHEN NOT (rp.channels && ARRAY['EMAIL','WHATSAPP','SMS']::text[]) THEN 'SUPPRESS'
          WHEN NOT rp.external_processing_enabled THEN 'DENY'
          ELSE 'REVIEW'
        END AS external_decision,
        CASE
          WHEN NOT ('IN_APP'=ANY(rp.channels)) THEN 'IN_APP_CHANNEL_DISABLED'
          WHEN NOT rp.timezone_valid THEN 'INVALID_QUIET_HOURS_TIME_ZONE'
          WHEN rp.notification_level NOT IN ('ALL','IMPORTANT') THEN 'IMPORTANCE_BELOW_PREFERENCE'
          WHEN rp.quiet_hours_enabled AND
            (CASE WHEN rp.quiet_hours_start<rp.quiet_hours_end
              THEN rp.local_now>=rp.quiet_hours_start AND rp.local_now<rp.quiet_hours_end
              ELSE rp.local_now>=rp.quiet_hours_start OR rp.local_now<rp.quiet_hours_end END)
            THEN 'QUIET_HOURS'
          ELSE 'POLICY_ALLOWED'
        END AS in_app_reason,
        CASE
          WHEN NOT (rp.channels && ARRAY['EMAIL','WHATSAPP','SMS']::text[]) THEN 'EXTERNAL_CHANNEL_NOT_REQUESTED'
          WHEN NOT rp.external_processing_enabled THEN 'EXTERNAL_PROCESSING_DISABLED'
          ELSE 'EXACT_DESTINATION_CONSENT_OR_PROVIDER_CAPABILITY_UNVERIFIED'
        END AS external_reason
      FROM recipient_preferences rp
    ),
    inserted AS (
      INSERT INTO public.notifications(organization_id,profile_id,title,body,type)
      SELECT v_event.organization_id,d.profile_id,'طلب جديد',
        CASE WHEN d.detail_level='SUMMARY' THEN 'تم استلام طلب جديد.'
          ELSE 'تم استلام الطلب '||v_order_number||'. الحالة الحالية: '||v_order_status||'.' END,
        'order'
      FROM decisions d WHERE d.in_app_decision='ALLOW'
      RETURNING id
    )
    SELECT
      (SELECT count(*)::integer FROM inserted),
      pg_catalog.jsonb_build_object(
        'schemaVersion',1,'evaluatedAt',v_now,'eventType','OrderCreated','importance','IMPORTANT',
        'inApp',pg_catalog.jsonb_build_object(
          'ALLOW',count(*) FILTER(WHERE d.in_app_decision='ALLOW'),
          'SUPPRESS',count(*) FILTER(WHERE d.in_app_decision='SUPPRESS'),
          'DENY',0,
          'REVIEW',count(*) FILTER(WHERE d.in_app_decision='REVIEW'),
          'reasonCounts',coalesce((SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('reasonCode',x.reason_code,'count',x.reason_count) ORDER BY x.reason_code)
            FROM (SELECT in_app_reason reason_code,count(*)::integer reason_count
              FROM decisions GROUP BY in_app_reason) x),'[]'::jsonb)
        ),
        'external',pg_catalog.jsonb_build_object(
          'dispatchAttempted',false,'providerCapability','UNAVAILABLE','ALLOW',0,
          'SUPPRESS',count(*) FILTER(WHERE d.external_decision='SUPPRESS'),
          'DENY',count(*) FILTER(WHERE d.external_decision='DENY'),
          'REVIEW',count(*) FILTER(WHERE d.external_decision='REVIEW'),
          'reasonCounts',coalesce((SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('reasonCode',x.reason_code,'count',x.reason_count) ORDER BY x.reason_code)
            FROM (SELECT external_reason reason_code,count(*)::integer reason_count
              FROM decisions GROUP BY external_reason) x),'[]'::jsonb)
        )
      )
    INTO v_notifications,v_policy
    FROM decisions d;

    UPDATE public.outbox_event_deliveries
    SET result=pg_catalog.jsonb_build_object(
      'notifications_created',v_notifications,'event_type',v_event.event_type,'privacy_policy',v_policy)
    WHERE event_id=v_event.id AND consumer_key='in_app_order_created';
  ELSE
    SELECT coalesce((d.result->>'notifications_created')::integer,0),
      coalesce(d.result->'privacy_policy',pg_catalog.jsonb_build_object(
        'schemaVersion',1,'status','REVIEW','reasonCode','LEGACY_RECEIPT_WITHOUT_POLICY_DECISION',
        'dispatchAttempted',false))
    INTO v_notifications,v_policy
    FROM public.outbox_event_deliveries d
    WHERE d.event_id=v_event.id AND d.consumer_key='in_app_order_created';
  END IF;

  UPDATE public.outbox_events
  SET status='processed',processed_at=coalesce(processed_at,v_now),
      locked_at=NULL,locked_by=NULL,last_error=NULL,error_class=NULL
  WHERE id=v_event.id;

  RETURN pg_catalog.jsonb_build_object(
    'status','processed','event_id',v_event.id,'event_type',v_event.event_type,
    'notifications_created',v_notifications,'privacy_policy',v_policy);
END;
$function$;
REVOKE ALL ON FUNCTION public.process_outbox_event(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_outbox_event(uuid,text) TO service_role;
COMMENT ON FUNCTION public.process_outbox_event(uuid,text) IS
  'Atomically evaluates profile channel/importance/quiet-hours/detail preferences before in-app fan-out. Stores aggregate ALLOW/SUPPRESS/DENY/REVIEW policy outcomes without message bodies or contacts. External delivery is fail-closed until provider capabilities, recipient destination and exact active consent can be independently verified.';

COMMIT;
