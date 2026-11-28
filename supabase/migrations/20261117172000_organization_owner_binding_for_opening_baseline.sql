BEGIN;

-- Ownership is a tenant relationship, not an assumed synonym for the admin role.
-- The only writer is a service-role provisioning RPC; there is no client self-claim path.
CREATE TABLE public.organization_owner_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  bound_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  bound_by text NOT NULL CHECK (bound_by='service_role'),
  reason text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(reason)) BETWEEN 10 AND 500),
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  CONSTRAINT organization_owner_binding_revocation_fields_check CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR
    (revoked_at IS NOT NULL AND revoked_by='service_role'
      AND revoke_reason IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(revoke_reason)) BETWEEN 10 AND 500)
  )
);
CREATE UNIQUE INDEX organization_owner_bindings_one_active_per_org
  ON public.organization_owner_bindings(organization_id)
  WHERE revoked_at IS NULL;
CREATE INDEX organization_owner_bindings_profile_history_idx
  ON public.organization_owner_bindings(owner_profile_id,bound_at DESC);

ALTER TABLE public.organization_owner_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_owner_bindings FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_organization_owner_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='organization owner bindings are retained as immutable ownership history';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.owner_profile_id IS DISTINCT FROM OLD.owner_profile_id
     OR NEW.bound_at IS DISTINCT FROM OLD.bound_at
     OR NEW.bound_by IS DISTINCT FROM OLD.bound_by
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL
     OR NEW.revoked_by IS DISTINCT FROM 'service_role'
     OR NEW.revoke_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='owner binding identity is immutable; only a one-time service-role revocation is allowed';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_organization_owner_binding_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER organization_owner_binding_immutable
  BEFORE UPDATE OR DELETE ON public.organization_owner_bindings
  FOR EACH ROW EXECUTE FUNCTION public.guard_organization_owner_binding_mutation();

CREATE OR REPLACE FUNCTION public.current_actor_is_organization_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.organization_owner_bindings b
        ON b.organization_id=p.organization_id
       AND b.owner_profile_id=p.id
       AND b.revoked_at IS NULL
      JOIN public.organizations o
        ON o.id=p.organization_id AND o.is_active=true
     WHERE p.id=public.current_profile_id()
       AND p.auth_user_id=auth.uid()
       AND p.is_active=true
  );
$function$;
REVOKE ALL ON FUNCTION public.current_actor_is_organization_owner() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_actor_is_organization_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.bind_organization_owner(
  p_organization_id uuid,
  p_owner_profile_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_binding public.organization_owner_bindings%ROWTYPE;
  v_owner uuid;
  v_reason text:=pg_catalog.btrim(coalesce(p_reason,''));
  v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='organization owner provisioning requires the trusted service role';
  END IF;
  IF p_organization_id IS NULL OR p_owner_profile_id IS NULL
     OR pg_catalog.length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='organization, owner profile and a 10-to-500 character reason are required';
  END IF;

  PERFORM 1 FROM public.organizations o
   WHERE o.id=p_organization_id AND o.is_active=true
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='organization is unavailable for owner provisioning';
  END IF;

  SELECT p.id INTO v_owner
    FROM public.profiles p
   WHERE p.id=p_owner_profile_id
     AND p.organization_id=p_organization_id
     AND p.is_active=true
     AND p.auth_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.profile_id=p.id AND r.role='admin')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.profile_id=p.id AND r.role='customer')
   FOR KEY SHARE;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='owner must be an active authenticated administrator in the same organization';
  END IF;

  SELECT b.* INTO v_binding
    FROM public.organization_owner_bindings b
   WHERE b.organization_id=p_organization_id AND b.revoked_at IS NULL
   FOR UPDATE;
  IF FOUND THEN
    IF v_binding.owner_profile_id=p_owner_profile_id THEN
      RETURN pg_catalog.jsonb_build_object(
        'binding_id',v_binding.id,'organization_id',p_organization_id,
        'owner_profile_id',p_owner_profile_id,'bound_at',v_binding.bound_at,
        'idempotent_replay',true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505',
      MESSAGE='an active owner is already bound; revoke the previous binding before replacement';
  END IF;

  INSERT INTO public.organization_owner_bindings(
    organization_id,owner_profile_id,bound_at,bound_by,reason
  ) VALUES(p_organization_id,p_owner_profile_id,v_now,'service_role',v_reason)
  RETURNING * INTO v_binding;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  ) VALUES(
    p_organization_id,NULL,'organization.owner.bound','organization_owner_binding',v_binding.id,NULL,
    pg_catalog.jsonb_build_object(
      'owner_profile_id',p_owner_profile_id,'bound_at',v_now,
      'provisioning_role','service_role','reason',v_reason
    ),v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'binding_id',v_binding.id,'organization_id',p_organization_id,
    'owner_profile_id',p_owner_profile_id,'bound_at',v_binding.bound_at,
    'idempotent_replay',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.bind_organization_owner(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_organization_owner(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_organization_owner_binding(
  p_organization_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_binding public.organization_owner_bindings%ROWTYPE;
  v_reason text:=pg_catalog.btrim(coalesce(p_reason,''));
  v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='organization owner revocation requires the trusted service role';
  END IF;
  IF p_organization_id IS NULL OR pg_catalog.length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='organization and a 10-to-500 character revocation reason are required';
  END IF;
  PERFORM 1 FROM public.organizations o
   WHERE o.id=p_organization_id AND o.is_active=true
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='organization is unavailable for owner revocation';
  END IF;

  SELECT b.* INTO v_binding
    FROM public.organization_owner_bindings b
   WHERE b.organization_id=p_organization_id AND b.revoked_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='no active owner binding exists for this organization';
  END IF;

  UPDATE public.organization_owner_bindings
     SET revoked_at=v_now,revoked_by='service_role',revoke_reason=v_reason
   WHERE id=v_binding.id;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  ) VALUES(
    p_organization_id,NULL,'organization.owner.revoked','organization_owner_binding',v_binding.id,
    pg_catalog.jsonb_build_object('owner_profile_id',v_binding.owner_profile_id,'bound_at',v_binding.bound_at),
    pg_catalog.jsonb_build_object('revoked_at',v_now,'provisioning_role','service_role','reason',v_reason),
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'binding_id',v_binding.id,'owner_profile_id',v_binding.owner_profile_id,
    'revoked_at',v_now,'revoked',true
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.revoke_organization_owner_binding(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_owner_binding(uuid,text) TO service_role;

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
     OR NOT public.current_actor_has_capability('inventory.opening_balance.approve')
     OR NOT public.current_actor_is_organization_owner() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='verified organization owner identity and approval capability are required';
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
     OR NOT public.current_actor_has_capability('inventory.opening_balance.approve')
     OR NOT public.current_actor_is_organization_owner() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='verified organization owner identity and approval capability are required';
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

COMMENT ON FUNCTION public.current_actor_is_organization_owner() IS
  'True only when the live authenticated profile is the explicitly service-provisioned owner binding for its active organization; no role can self-claim ownership.';
COMMENT ON FUNCTION public.bind_organization_owner(uuid,uuid,text) IS
  'Service-role-only owner provisioning. Requires an active same-tenant admin identity, records an audit event, and is idempotent for the same owner.';
COMMENT ON FUNCTION public.revoke_organization_owner_binding(uuid,text) IS
  'Service-role-only revocation with immutable ownership history and an audit event; a new owner must be separately provisioned.';
COMMENT ON FUNCTION public.approve_opening_inventory_baseline(uuid) IS
  'One-time snapshot of the exact owner-authorized 114-product/3,235-unit source batch. Requires both the current admin capability and the explicit organization-owner relationship. Does not alter balances or create stock movements.';

COMMIT;
