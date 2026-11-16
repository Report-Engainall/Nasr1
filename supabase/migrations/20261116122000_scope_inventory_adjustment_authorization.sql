BEGIN;

-- The adjustment capability is warehouse-scoped, not organization-wide.
UPDATE public.authorization_capabilities
   SET scope_kind='warehouse',
       state_requirements=state_requirements || '{"requires_active_warehouse_assignment":true}'::jsonb,
       updated_at=statement_timestamp()
 WHERE capability_key='inventory.balance.adjust';

DO $scope_rpc$
DECLARE
  v_definition text;
BEGIN
  v_definition:=pg_catalog.pg_get_functiondef(
    'public.get_inventory_adjustment_balances(uuid)'::regprocedure
  );
  IF pg_catalog.position('current_actor_has_capability(''inventory.balance.adjust'')' IN v_definition)=0 THEN
    RAISE EXCEPTION 'unscoped inventory balance projection guard was not found';
  END IF;
  v_definition:=pg_catalog.replace(
    v_definition,
    'current_actor_has_capability(''inventory.balance.adjust'')',
    'current_actor_has_capability(''inventory.balance.adjust'', p_warehouse_id)'
  );
  EXECUTE v_definition;

  v_definition:=pg_catalog.pg_get_functiondef(
    'public.adjust_inventory_balance(uuid,uuid,numeric,numeric,text,text,text,text)'::regprocedure
  );
  IF pg_catalog.position('current_actor_has_capability(''inventory.balance.adjust'')' IN v_definition)=0 THEN
    RAISE EXCEPTION 'unscoped inventory adjustment guard was not found';
  END IF;
  v_definition:=pg_catalog.replace(
    v_definition,
    'current_actor_has_capability(''inventory.balance.adjust'')',
    'current_actor_has_capability(''inventory.balance.adjust'', p_warehouse_id)'
  );
  EXECUTE v_definition;

  v_definition:=pg_catalog.pg_get_functiondef(
    'public.guard_inventory_adjustment_capability_v2()'::regprocedure
  );
  IF pg_catalog.position('current_actor_has_capability(''inventory.balance.adjust'')' IN v_definition)=0 THEN
    RAISE EXCEPTION 'unscoped adjustment insert trigger guard was not found';
  END IF;
  v_definition:=pg_catalog.replace(
    v_definition,
    'current_actor_has_capability(''inventory.balance.adjust'')',
    'current_actor_has_capability(''inventory.balance.adjust'', NEW.warehouse_id)'
  );
  EXECUTE v_definition;
END
$scope_rpc$;

DROP POLICY IF EXISTS inventory_adjustments_capability_read ON public.inventory_adjustments;
DROP POLICY IF EXISTS inventory_adjustments_v2_tenant_read ON public.inventory_adjustments;
CREATE POLICY inventory_adjustments_v2_warehouse_read
  ON public.inventory_adjustments
  FOR SELECT TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND public.current_actor_has_capability('inventory.balance.adjust',warehouse_id)
  );

COMMENT ON FUNCTION public.get_inventory_adjustment_balances(uuid) IS
  'Returns only product and quantity fields for a warehouse explicitly assigned to the authenticated staff profile by Authorization V2.';
COMMENT ON FUNCTION public.adjust_inventory_balance(uuid,uuid,numeric,numeric,text,text,text,text) IS
  'Atomic stock adjustment. Authorization V2 requires an active profile assignment to the specified warehouse; explicit denials override role grants.';

COMMIT;
