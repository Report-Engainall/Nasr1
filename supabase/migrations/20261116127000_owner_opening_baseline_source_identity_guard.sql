BEGIN;

-- Bind opening-source recognition to the immutable source batch identifier.
-- A movement with the same descriptive marker but a different reference_id is not part of this approved baseline.

CREATE OR REPLACE FUNCTION public.get_opening_inventory_baseline_preview(p_warehouse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_active_count integer:=0;
  v_source_count integer:=0;
  v_distinct_source_products integer:=0;
  v_total numeric(15,3):=0;
  v_duplicate_count integer:=0;
  v_missing_source_count integer:=0;
  v_balance_count integer:=0;
  v_missing_balance_count integer:=0;
  v_invalid_quantity_count integer:=0;
  v_ready boolean:=false;
  v_items jsonb:='[]'::jsonb;
  v_existing public.inventory_opening_balance_approvals%ROWTYPE;
  v_marker constant text:='OWNER_AUTHORIZED_OPENING_ESTIMATE_PENDING_PHYSICAL_COUNT';
  v_batch constant uuid:='98dbfb5e-cc46-457e-b532-7efde84a914a';
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_actor_has_capability('inventory.opening_balance.approve') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='inventory.opening_balance.approve capability is required';
  END IF;
  IF p_warehouse_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.warehouses w
     WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active=true
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='warehouse is unavailable in the active organization';
  END IF;

  SELECT a.* INTO v_existing
    FROM public.inventory_opening_balance_approvals a
   WHERE a.organization_id=v_org AND a.warehouse_id=p_warehouse_id AND a.source_batch_id=v_batch;

  WITH active_products AS (
    SELECT p.id,p.item_code,p.name,p.unit
      FROM public.products p
     WHERE p.organization_id=v_org AND p.status='active'
  ),
  opening_sources AS (
    SELECT im.id,im.product_id,im.warehouse_id,im.quantity,im.created_at,im.reason,
           pg_catalog.count(*) OVER(PARTITION BY im.product_id) AS source_count
      FROM public.inventory_movements im
      JOIN active_products p ON p.id=im.product_id
     WHERE im.warehouse_id=p_warehouse_id
       AND im.reference_id=v_batch
       AND im.movement_type='opening_balance'
       AND pg_catalog.strpos(coalesce(im.reason,''),v_marker)>0
  )
  SELECT
    (SELECT pg_catalog.count(*)::integer FROM active_products),
    (SELECT pg_catalog.count(*)::integer FROM opening_sources),
    (SELECT pg_catalog.count(DISTINCT product_id)::integer FROM opening_sources),
    (SELECT coalesce(pg_catalog.sum(quantity),0)::numeric(15,3) FROM opening_sources),
    (SELECT pg_catalog.count(*)::integer FROM opening_sources WHERE source_count<>1),
    (SELECT pg_catalog.count(*)::integer FROM active_products p
      WHERE NOT EXISTS(SELECT 1 FROM opening_sources s WHERE s.product_id=p.id)),
    (SELECT pg_catalog.count(*)::integer FROM active_products p
      JOIN opening_sources s ON s.product_id=p.id
      JOIN public.inventory_balances ib ON ib.product_id=p.id AND ib.warehouse_id=p_warehouse_id),
    (SELECT pg_catalog.count(*)::integer FROM active_products p
      WHERE EXISTS(SELECT 1 FROM opening_sources s WHERE s.product_id=p.id)
        AND NOT EXISTS(SELECT 1 FROM public.inventory_balances ib WHERE ib.product_id=p.id AND ib.warehouse_id=p_warehouse_id)),
    (SELECT pg_catalog.count(*)::integer FROM opening_sources s
      LEFT JOIN public.inventory_balances ib ON ib.product_id=s.product_id AND ib.warehouse_id=p_warehouse_id
     WHERE s.quantity<0 OR (ib.id IS NOT NULL AND
       (ib.quantity_on_hand<0 OR ib.quantity_reserved<0 OR ib.quantity_available<0)))
  INTO v_active_count,v_source_count,v_distinct_source_products,v_total,
       v_duplicate_count,v_missing_source_count,v_balance_count,v_missing_balance_count,
       v_invalid_quantity_count;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'product_id',p.id,'item_code',p.item_code,'product_name',p.name,'unit',p.unit,
        'opening_movement_id',s.id,'opening_quantity',s.quantity,
        'source_movement_count',coalesce(s.source_count,0),
        'quantity_on_hand',ib.quantity_on_hand,
        'quantity_reserved',ib.quantity_reserved,
        'quantity_available',ib.quantity_available,
        'movement_created_at',s.created_at,
        'source_marker_present',s.id IS NOT NULL
      ) ORDER BY p.item_code,p.id
    ),'[]'::jsonb
  ) INTO v_items
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT im.id,im.quantity,im.created_at,
           pg_catalog.count(*) OVER(PARTITION BY im.product_id) AS source_count
      FROM public.inventory_movements im
     WHERE im.product_id=p.id AND im.warehouse_id=p_warehouse_id
       AND im.reference_id=v_batch
       AND im.movement_type='opening_balance'
       AND pg_catalog.strpos(coalesce(im.reason,''),v_marker)>0
     ORDER BY im.created_at,im.id
     LIMIT 1
  ) s ON true
  LEFT JOIN public.inventory_balances ib
    ON ib.product_id=p.id AND ib.warehouse_id=p_warehouse_id
  WHERE p.organization_id=v_org AND p.status='active';

  v_ready := v_active_count=114 AND v_source_count=114
    AND v_distinct_source_products=114 AND v_total=3235
    AND v_duplicate_count=0 AND v_missing_source_count=0
    AND v_balance_count=114 AND v_missing_balance_count=0
    AND v_invalid_quantity_count=0 AND v_existing.id IS NULL;

  RETURN pg_catalog.jsonb_build_object(
    'organization_id',v_org,'warehouse_id',p_warehouse_id,
    'source_batch_id',v_batch,'source_marker',v_marker,
    'active_product_count',v_active_count,'opening_movement_count',v_source_count,
    'distinct_opening_products',v_distinct_source_products,
    'opening_total_quantity',v_total,'matching_balance_count',v_balance_count,
    'missing_opening_product_count',v_missing_source_count,
    'duplicate_opening_product_count',v_duplicate_count,
    'missing_balance_count',v_missing_balance_count,
    'invalid_quantity_count',v_invalid_quantity_count,
    'ready_to_approve',v_ready,
    'approval_id',v_existing.id,'approved_at',v_existing.approved_at,
    'approved_by',v_existing.approved_by,'approval_status',v_existing.status,
    'items',v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_opening_inventory_baseline_preview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_opening_inventory_baseline_preview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_opening_inventory_baseline(p_warehouse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_existing public.inventory_opening_balance_approvals%ROWTYPE;
  v_preview jsonb;
  v_snapshot_id uuid;
  v_inserted integer:=0;
  v_total numeric(15,3):=0;
  v_lock_id uuid;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_marker constant text:='OWNER_AUTHORIZED_OPENING_ESTIMATE_PENDING_PHYSICAL_COUNT';
  v_batch constant uuid:='98dbfb5e-cc46-457e-b532-7efde84a914a';
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_actor_has_capability('inventory.opening_balance.approve') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='inventory.opening_balance.approve capability is required';
  END IF;
  IF p_warehouse_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.warehouses w
     WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active=true
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='warehouse is unavailable in the active organization';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':opening-baseline:' || p_warehouse_id::text || ':' || v_batch::text,0)
  );
  SELECT a.* INTO v_existing
    FROM public.inventory_opening_balance_approvals a
   WHERE a.organization_id=v_org AND a.warehouse_id=p_warehouse_id AND a.source_batch_id=v_batch
   FOR UPDATE;
  IF FOUND THEN
    SELECT coalesce(pg_catalog.sum(l.opening_quantity),0)::numeric(15,3)
      INTO v_total
      FROM public.inventory_opening_balance_approval_lines l WHERE l.approval_id=v_existing.id;
    RETURN pg_catalog.jsonb_build_object(
      'approval_id',v_existing.id,'status',v_existing.status,'approved_at',v_existing.approved_at,
      'approved_by',v_existing.approved_by,'product_count',v_existing.product_count,
      'total_opening_quantity',v_total,'idempotent_replay',true
    );
  END IF;

  -- Lock every existing stock balance and its source opening movement in stable
  -- product order so stock commands cannot move quantities during snapshot capture.
  FOR v_lock_id IN
    SELECT ib.id
      FROM public.inventory_balances ib
      JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
      JOIN public.inventory_movements im ON im.product_id=p.id AND im.warehouse_id=p_warehouse_id
        AND im.reference_id=v_batch
        AND im.movement_type='opening_balance'
        AND pg_catalog.strpos(coalesce(im.reason,''),v_marker)>0
     WHERE ib.warehouse_id=p_warehouse_id
     ORDER BY p.id,im.created_at,im.id
     FOR UPDATE OF ib,im,p
  LOOP
    NULL;
  END LOOP;

  v_preview:=public.get_opening_inventory_baseline_preview(p_warehouse_id);
  IF coalesce((v_preview->>'ready_to_approve')::boolean,false)=false THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='opening inventory baseline does not match the exact owner-authorized source set; review preview metrics before approval';
  END IF;

  INSERT INTO public.inventory_opening_balance_approvals(
    organization_id,warehouse_id,source_batch_id,source_marker,status,
    product_count,total_opening_quantity,approved_by,approved_at
  ) VALUES (
    v_org,p_warehouse_id,v_batch,v_marker,
    'approved_pending_physical_count',114,3235,v_actor,v_now
  ) RETURNING id INTO v_snapshot_id;

  INSERT INTO public.inventory_opening_balance_approval_lines(
    approval_id,organization_id,product_id,warehouse_id,opening_movement_id,
    item_code_snapshot,product_name_snapshot,unit_snapshot,opening_quantity,
    quantity_on_hand_at_approval,quantity_reserved_at_approval,quantity_available_at_approval,
    opening_movement_created_at,opening_movement_reason
  )
  SELECT
    v_snapshot_id,v_org,p.id,p_warehouse_id,im.id,
    p.item_code,p.name,p.unit,im.quantity,
    ib.quantity_on_hand,ib.quantity_reserved,ib.quantity_available,
    im.created_at,im.reason
  FROM public.products p
  JOIN public.inventory_movements im
    ON im.product_id=p.id AND im.warehouse_id=p_warehouse_id
   AND im.reference_id=v_batch
   AND im.movement_type='opening_balance'
   AND pg_catalog.strpos(coalesce(im.reason,''),v_marker)>0
  JOIN public.inventory_balances ib
    ON ib.product_id=p.id AND ib.warehouse_id=p_warehouse_id
  WHERE p.organization_id=v_org AND p.status='active'
  ORDER BY p.item_code,p.id;

  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  SELECT coalesce(pg_catalog.sum(l.opening_quantity),0)::numeric(15,3)
    INTO v_total
    FROM public.inventory_opening_balance_approval_lines l
   WHERE l.approval_id=v_snapshot_id;
  IF v_inserted<>114 OR v_total<>3235 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='opening baseline snapshot row count or aggregate changed during approval';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  ) VALUES (
    v_org,v_actor,'inventory.opening_balance.approved','inventory_opening_balance_approval',
    v_snapshot_id,NULL,
    pg_catalog.jsonb_build_object(
      'status','approved_pending_physical_count',
      'source_marker',v_marker,'source_batch_id',v_batch,
      'warehouse_id',p_warehouse_id,'product_count',v_inserted,
      'total_opening_quantity',v_total,
      'inventory_balances_changed',false,'inventory_movements_created',0,
      'note','Owner-approved operational baseline; physical stocktake remains pending.'
    ),v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'approval_id',v_snapshot_id,'status','approved_pending_physical_count',
    'approved_at',v_now,'approved_by',v_actor,
    'product_count',v_inserted,'total_opening_quantity',v_total,
    'idempotent_replay',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_opening_inventory_baseline(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_opening_inventory_baseline(uuid) TO authenticated;

COMMIT;
