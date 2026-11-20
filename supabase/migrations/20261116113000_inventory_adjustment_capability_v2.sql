-- Enforce Authorization V2 for both the existing inventory-adjustment command and
-- its manager-only stock projection. The insert trigger keeps the already-tested
-- balance update, adjustment row, movement and audit in one atomic transaction.

BEGIN;

INSERT INTO public.authorization_capabilities (
  capability_key, domain, resource, action, sensitivity, scope_kind,
  approval_mode, separation_of_duties, state_requirements, legacy_operation_id
) VALUES (
  'inventory.balance.adjust',
  'inventory',
  'stock_balance',
  'adjust',
  'inventory',
  'organization',
  'none',
  false,
  '{"requires_reason":true,"server_command_only":true,"prevents_negative":true,"respects_reserved":true,"stale_writer_guard":true}',
  NULL
)
ON CONFLICT (capability_key) DO UPDATE SET
  domain = EXCLUDED.domain,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  sensitivity = EXCLUDED.sensitivity,
  scope_kind = EXCLUDED.scope_kind,
  approval_mode = EXCLUDED.approval_mode,
  separation_of_duties = EXCLUDED.separation_of_duties,
  state_requirements = EXCLUDED.state_requirements,
  legacy_operation_id = EXCLUDED.legacy_operation_id,
  is_active = true,
  updated_at = statement_timestamp();

INSERT INTO public.authorization_role_capabilities (role, capability_key, grant_source)
VALUES
  ('admin', 'inventory.balance.adjust', 'authorization-v2-single-item-adjustment'),
  ('manager', 'inventory.balance.adjust', 'authorization-v2-single-item-adjustment')
ON CONFLICT (role, capability_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_inventory_adjustment_capability_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = public.current_profile_id()
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL
     OR v_org IS NULL
     OR NEW.organization_id IS DISTINCT FROM v_org
     OR NOT public.current_actor_has_capability('inventory.balance.adjust') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'inventory.balance.adjust capability is required for this stock adjustment';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_inventory_adjustment_capability_v2() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventory_adjustments_v2_capability_guard ON public.inventory_adjustments;
CREATE TRIGGER inventory_adjustments_v2_capability_guard
  BEFORE INSERT ON public.inventory_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_adjustment_capability_v2();

DROP POLICY IF EXISTS inventory_adjustments_manager_read ON public.inventory_adjustments;
CREATE POLICY inventory_adjustments_v2_tenant_read
  ON public.inventory_adjustments
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
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
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id AND o.is_active = true
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL
     OR v_actor IS NULL
     OR v_org IS NULL
     OR NOT public.current_actor_has_capability('inventory.balance.adjust') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'inventory.balance.adjust capability is required to read adjustable inventory';
  END IF;

  IF p_warehouse_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.warehouses w
     WHERE w.id = p_warehouse_id
       AND w.organization_id = v_org
       AND w.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'warehouse is unavailable in this organization';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'product_id', p.id,
        'item_code', p.item_code,
        'product_name', p.name,
        'unit', p.unit,
        'warehouse_id', ib.warehouse_id,
        'quantity_on_hand', ib.quantity_on_hand,
        'quantity_reserved', ib.quantity_reserved,
        'quantity_available', ib.quantity_available,
        'last_movement_at', ib.last_movement_at,
        'updated_at', ib.updated_at
      ) ORDER BY p.item_code, p.id
    ),
    '[]'::jsonb
  )
    INTO v_items
    FROM public.inventory_balances ib
    JOIN public.products p
      ON p.id = ib.product_id
     AND p.organization_id = v_org
     AND p.status = 'active'
   WHERE ib.warehouse_id = p_warehouse_id;

  RETURN pg_catalog.jsonb_build_object(
    'warehouse_id', p_warehouse_id,
    'items', coalesce(v_items, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inventory_adjustment_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_adjustment_balances(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_inventory_adjustment_balances(uuid) IS
  'Authorization V2 scoped manager projection for inventory adjustments; exposes product identity and stock quantities only, never costs, selling prices or margins.';

COMMIT;
