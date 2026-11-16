BEGIN;

INSERT INTO public.authorization_capabilities
  (capability_key,domain,resource,action,sensitivity,scope_kind,approval_mode,separation_of_duties,state_requirements,legacy_operation_id)
VALUES
  ('inventory.balance.adjust','inventory','stock_balance','adjust','inventory','organization','none',false,
   '{"requires_expected_quantity":true,"requires_reason":true,"prevents_negative":true,"prevents_below_reserved":true,"immutable_history":true}',
   'inventory_balance_adjust')
ON CONFLICT (capability_key) DO UPDATE SET
  domain=EXCLUDED.domain,
  resource=EXCLUDED.resource,
  action=EXCLUDED.action,
  sensitivity=EXCLUDED.sensitivity,
  scope_kind=EXCLUDED.scope_kind,
  approval_mode=EXCLUDED.approval_mode,
  separation_of_duties=EXCLUDED.separation_of_duties,
  state_requirements=EXCLUDED.state_requirements,
  legacy_operation_id=EXCLUDED.legacy_operation_id,
  is_active=true,
  updated_at=statement_timestamp();

INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source)
VALUES
  ('admin','inventory.balance.adjust','RBAC-V2:INVENTORY-ADJUSTMENT'),
  ('manager','inventory.balance.adjust','RBAC-V2:INVENTORY-ADJUSTMENT')
ON CONFLICT (role,capability_key) DO NOTHING;

DROP POLICY IF EXISTS inventory_adjustments_manager_read ON public.inventory_adjustments;
CREATE POLICY inventory_adjustments_capability_read
  ON public.inventory_adjustments FOR SELECT TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND public.current_actor_has_capability('inventory.balance.adjust')
  );

CREATE OR REPLACE FUNCTION public.get_inventory_adjustment_balances(p_warehouse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_items jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_actor_has_capability('inventory.balance.adjust') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required to read adjustable inventory';
  END IF;

  IF p_warehouse_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.warehouses w
     WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='warehouse is unavailable in this organization';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'product_id',p.id,
        'item_code',p.item_code,
        'product_name',p.name,
        'unit',p.unit,
        'warehouse_id',ib.warehouse_id,
        'quantity_on_hand',ib.quantity_on_hand,
        'quantity_reserved',ib.quantity_reserved,
        'quantity_available',ib.quantity_available,
        'last_movement_at',ib.last_movement_at,
        'updated_at',ib.updated_at
      ) ORDER BY p.item_code,p.id
    ),
    '[]'::jsonb
  ) INTO v_items
  FROM public.inventory_balances ib
  JOIN public.products p
    ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
  WHERE ib.warehouse_id=p_warehouse_id;

  RETURN pg_catalog.jsonb_build_object(
    'warehouse_id',p_warehouse_id,
    'items',coalesce(v_items,'[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inventory_adjustment_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_adjustment_balances(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_inventory_balance(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_reference text,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_product public.products%ROWTYPE;
  v_warehouse public.warehouses%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_existing public.inventory_adjustments%ROWTYPE;
  v_adjustment_id uuid;
  v_delta numeric(15,3);
  v_available numeric(15,3);
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
  v_reference text := nullif(pg_catalog.btrim(coalesce(p_reference,'')),'');
  v_notes text := nullif(pg_catalog.btrim(coalesce(p_notes,'')),'');
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_actor_has_capability('inventory.balance.adjust') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required to adjust inventory';
  END IF;

  IF p_product_id IS NULL OR p_warehouse_id IS NULL
     OR p_expected_quantity IS NULL OR p_new_quantity IS NULL
     OR p_expected_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_new_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_expected_quantity < 0 OR p_new_quantity < 0
     OR p_expected_quantity > 999999999999.999 OR p_new_quantity > 999999999999.999
     OR pg_catalog.round(p_expected_quantity,3) <> p_expected_quantity
     OR pg_catalog.round(p_new_quantity,3) <> p_new_quantity THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='stock quantities must be non-negative with at most three decimal places';
  END IF;

  IF v_reason IS NULL OR pg_catalog.char_length(v_reason)>1000
     OR (v_reference IS NOT NULL AND pg_catalog.char_length(v_reference)>200)
     OR (v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>1000)
     OR v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='valid reason, reference, notes and idempotency key are required';
  END IF;

  -- A retry returns the original result; reusing the same key for another payload fails.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':inventory-adjustment:' || v_key,0)
  );
  SELECT a.* INTO v_existing
    FROM public.inventory_adjustments a
   WHERE a.organization_id=v_org AND a.idempotency_key=v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.product_id IS DISTINCT FROM p_product_id
       OR v_existing.warehouse_id IS DISTINCT FROM p_warehouse_id
       OR v_existing.previous_quantity_on_hand IS DISTINCT FROM p_expected_quantity
       OR v_existing.new_quantity_on_hand IS DISTINCT FROM p_new_quantity
       OR v_existing.reason IS DISTINCT FROM v_reason
       OR v_existing.reference IS DISTINCT FROM v_reference
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='inventory adjustment idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'adjustment_id',v_existing.id,
      'product_id',v_existing.product_id,
      'warehouse_id',v_existing.warehouse_id,
      'previous_quantity_on_hand',v_existing.previous_quantity_on_hand,
      'new_quantity_on_hand',v_existing.new_quantity_on_hand,
      'quantity_delta',v_existing.quantity_delta,
      'reserved_quantity',v_existing.reserved_quantity,
      'quantity_available_after',v_existing.quantity_available_after,
      'idempotent_replay',true
    );
  END IF;

  SELECT p.* INTO v_product
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_org AND p.status='active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='product is unavailable in this organization';
  END IF;

  SELECT w.* INTO v_warehouse
    FROM public.warehouses w
   WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='warehouse is unavailable in this organization';
  END IF;

  SELECT ib.* INTO v_balance
    FROM public.inventory_balances ib
   WHERE ib.product_id=p_product_id AND ib.warehouse_id=p_warehouse_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='no verified inventory balance exists for this product and warehouse';
  END IF;

  IF v_balance.quantity_on_hand IS DISTINCT FROM p_expected_quantity THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='stock quantity changed since it was loaded; refresh the balance before retrying';
  END IF;
  IF p_new_quantity < v_balance.quantity_reserved THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='new stock quantity cannot be below reserved stock';
  END IF;

  v_delta := p_new_quantity - v_balance.quantity_on_hand;
  INSERT INTO public.inventory_adjustments(
    organization_id,product_id,warehouse_id,
    previous_quantity_on_hand,new_quantity_on_hand,quantity_delta,
    reserved_quantity,quantity_available_after,
    reason,reference,notes,idempotency_key,created_by,created_at
  ) VALUES (
    v_org,p_product_id,p_warehouse_id,
    v_balance.quantity_on_hand,p_new_quantity,v_delta,
    v_balance.quantity_reserved,p_new_quantity-v_balance.quantity_reserved,
    v_reason,v_reference,v_notes,v_key,v_actor,v_now
  ) RETURNING id INTO v_adjustment_id;

  IF v_delta <> 0 THEN
    UPDATE public.inventory_balances
       SET quantity_on_hand=p_new_quantity,
           last_movement_at=v_now,
           updated_at=v_now
     WHERE id=v_balance.id
     RETURNING quantity_available INTO v_available;

    INSERT INTO public.inventory_movements(
      product_id,warehouse_id,movement_type,quantity,balance_after,
      reference_type,reference_id,reason,created_by,created_at
    ) VALUES (
      p_product_id,p_warehouse_id,'inventory_adjustment',v_delta,v_available,
      'inventory_adjustment',v_adjustment_id,
      pg_catalog.left(v_reason || CASE WHEN v_reference IS NULL THEN '' ELSE ' · ' || v_reference END,1000),
      v_actor,v_now
    );
  ELSE
    v_available := v_balance.quantity_available;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  ) VALUES (
    v_org,v_actor,'inventory.balance.adjusted','inventory_adjustment',v_adjustment_id,
    pg_catalog.jsonb_build_object(
      'product_id',p_product_id,'warehouse_id',p_warehouse_id,
      'quantity_on_hand',v_balance.quantity_on_hand,
      'quantity_reserved',v_balance.quantity_reserved
    ),
    pg_catalog.jsonb_build_object(
      'product_id',p_product_id,'warehouse_id',p_warehouse_id,
      'previous_quantity_on_hand',v_balance.quantity_on_hand,
      'new_quantity_on_hand',p_new_quantity,
      'quantity_delta',v_delta,
      'quantity_reserved',v_balance.quantity_reserved,
      'quantity_available_after',v_available,
      'reason',v_reason,'reference',v_reference,'notes',v_notes,
      'idempotency_key',v_key
    ),
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'adjustment_id',v_adjustment_id,
    'product_id',p_product_id,
    'warehouse_id',p_warehouse_id,
    'previous_quantity_on_hand',v_balance.quantity_on_hand,
    'new_quantity_on_hand',p_new_quantity,
    'quantity_delta',v_delta,
    'reserved_quantity',v_balance.quantity_reserved,
    'quantity_available_after',v_available,
    'idempotent_replay',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid,uuid,numeric,numeric,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_balance(uuid,uuid,numeric,numeric,text,text,text,text) TO authenticated;

COMMENT ON TABLE public.inventory_adjustments IS
  'Append-only manager-approved single-product stock adjustments. Every command captures before/after quantities, reservations, reason, reference, actor, idempotency key, and links to the stock movement and audit record.';
COMMENT ON FUNCTION public.adjust_inventory_balance(uuid,uuid,numeric,numeric,text,text,text,text) IS
  'Atomic tenant-scoped single-product stock adjustment with stale-writer, reserved-stock and negative-stock guards, idempotent replay, append-only command history, inventory movement and audit logging.';
COMMENT ON FUNCTION public.get_inventory_adjustment_balances(uuid) IS
  'Returns a manager-only, tenant-scoped minimal inventory projection for the standalone stock adjustment workspace; never returns prices or costs.';


COMMIT;
