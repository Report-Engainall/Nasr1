BEGIN;

INSERT INTO public.authorization_capabilities (
  capability_key,domain,resource,action,sensitivity,scope_kind,approval_mode,
  separation_of_duties,state_requirements,legacy_operation_id
) VALUES (
  'inventory.opening_balance.approve','inventory','opening_inventory_baseline','approve',
  'inventory','organization','none',false,
  '{"requires_exact_opening_source":true,"expected_products":114,"expected_opening_quantity":3235,"pending_physical_count":true,"snapshot_only":true}',
  NULL
)
ON CONFLICT (capability_key) DO UPDATE SET
  domain=EXCLUDED.domain,resource=EXCLUDED.resource,action=EXCLUDED.action,
  sensitivity=EXCLUDED.sensitivity,scope_kind=EXCLUDED.scope_kind,
  approval_mode=EXCLUDED.approval_mode,separation_of_duties=EXCLUDED.separation_of_duties,
  state_requirements=EXCLUDED.state_requirements,legacy_operation_id=EXCLUDED.legacy_operation_id,
  is_active=true,updated_at=statement_timestamp();

INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source)
VALUES ('admin','inventory.opening_balance.approve','owner-approved-opening-baseline')
ON CONFLICT(role,capability_key) DO NOTHING;

CREATE TABLE public.inventory_opening_balance_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  source_batch_id uuid NOT NULL,
  source_marker text NOT NULL CHECK (source_marker='OWNER_AUTHORIZED_OPENING_ESTIMATE_PENDING_PHYSICAL_COUNT'),
  status text NOT NULL CHECK (status='approved_pending_physical_count'),
  product_count integer NOT NULL CHECK (product_count=114),
  total_opening_quantity numeric(15,3) NOT NULL CHECK (total_opening_quantity=3235),
  approved_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT inventory_opening_balance_approval_once
    UNIQUE (organization_id,warehouse_id,source_batch_id)
);
CREATE INDEX inventory_opening_balance_approvals_org_created_idx
  ON public.inventory_opening_balance_approvals(organization_id,approved_at DESC);

CREATE TABLE public.inventory_opening_balance_approval_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES public.inventory_opening_balance_approvals(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  opening_movement_id uuid NOT NULL REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  item_code_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  opening_quantity numeric(15,3) NOT NULL CHECK (opening_quantity>=0),
  quantity_on_hand_at_approval numeric(15,3) NOT NULL CHECK (quantity_on_hand_at_approval>=0),
  quantity_reserved_at_approval numeric(15,3) NOT NULL CHECK (quantity_reserved_at_approval>=0),
  quantity_available_at_approval numeric(15,3) NOT NULL CHECK (quantity_available_at_approval>=0),
  opening_movement_created_at timestamptz NOT NULL,
  opening_movement_reason text NOT NULL,
  CONSTRAINT inventory_opening_balance_line_available_check CHECK (
    quantity_available_at_approval=quantity_on_hand_at_approval-quantity_reserved_at_approval
  ),
  CONSTRAINT inventory_opening_balance_line_product_once UNIQUE (approval_id,product_id),
  CONSTRAINT inventory_opening_balance_line_movement_once UNIQUE (opening_movement_id)
);
CREATE INDEX inventory_opening_balance_lines_approval_idx
  ON public.inventory_opening_balance_approval_lines(approval_id,item_code_snapshot);

ALTER TABLE public.inventory_opening_balance_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_opening_balance_approval_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_opening_balance_approvals FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.inventory_opening_balance_approval_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.inventory_opening_balance_approvals TO authenticated;
GRANT SELECT ON TABLE public.inventory_opening_balance_approval_lines TO authenticated;
GRANT ALL ON TABLE public.inventory_opening_balance_approvals TO service_role;
GRANT ALL ON TABLE public.inventory_opening_balance_approval_lines TO service_role;

CREATE POLICY inventory_opening_balance_approvals_capability_read
  ON public.inventory_opening_balance_approvals FOR SELECT TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND public.current_actor_has_capability('inventory.opening_balance.approve')
  );
CREATE POLICY inventory_opening_balance_lines_capability_read
  ON public.inventory_opening_balance_approval_lines FOR SELECT TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND public.current_actor_has_capability('inventory.opening_balance.approve')
  );

CREATE OR REPLACE FUNCTION public.reject_opening_inventory_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',
    MESSAGE='approved opening inventory snapshots are append-only';
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_opening_inventory_snapshot_mutation() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER inventory_opening_balance_approvals_append_only
  BEFORE UPDATE OR DELETE ON public.inventory_opening_balance_approvals
  FOR EACH ROW EXECUTE FUNCTION public.reject_opening_inventory_snapshot_mutation();
CREATE TRIGGER inventory_opening_balance_lines_append_only
  BEFORE UPDATE OR DELETE ON public.inventory_opening_balance_approval_lines
  FOR EACH ROW EXECUTE FUNCTION public.reject_opening_inventory_snapshot_mutation();

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
       AND im.movement_type='opening_balance'
       AND pg_catalog.position(v_marker IN coalesce(im.reason,''))>0
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
       AND im.movement_type='opening_balance'
       AND pg_catalog.position(v_marker IN coalesce(im.reason,''))>0
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
        AND im.movement_type='opening_balance'
        AND pg_catalog.position(v_marker IN coalesce(im.reason,''))>0
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
   AND im.movement_type='opening_balance'
   AND pg_catalog.position(v_marker IN coalesce(im.reason,''))>0
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

COMMENT ON TABLE public.inventory_opening_balance_approvals IS
  'Immutable owner-approved opening stock baseline snapshot. Approval preserves existing quantities and is explicitly pending physical stocktake.';
COMMENT ON TABLE public.inventory_opening_balance_approval_lines IS
  'Per-product opening movement and live balance snapshot captured at owner approval time; no stock movement is created by approval.';
COMMENT ON FUNCTION public.approve_opening_inventory_baseline(uuid) IS
  'One-time, idempotent, admin-capability-gated approval of the exact 114-product/3,235-selling-unit owner-authorized source batch. Captures per-item snapshot and audit only; never changes stock or creates movements.';

COMMIT;
