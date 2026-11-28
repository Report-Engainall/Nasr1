BEGIN;
CREATE OR REPLACE FUNCTION public.list_inventory_batch_products(p_warehouse_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid; v_items jsonb;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p
 WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated active profile required'; END IF;
 IF p_warehouse_id IS NULL OR NOT public.current_actor_has_capability('inventory.read_balance',p_warehouse_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory.read_balance capability and assigned warehouse required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='warehouse unavailable in current organization'; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'product_id',p.id,'item_code',p.item_code,'product_name',p.name,'unit',p.unit
 ) ORDER BY p.name,p.item_code,p.id),'[]'::jsonb)
 INTO v_items FROM public.inventory_balances ib
 JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org
 WHERE ib.warehouse_id=p_warehouse_id AND ib.quantity_on_hand>0;
 RETURN pg_catalog.jsonb_build_object('items',v_items,'warehouse_id',p_warehouse_id,'as_of',pg_catalog.now());
END;
$function$;
REVOKE ALL ON FUNCTION public.list_inventory_batch_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_inventory_batch_products(uuid) TO authenticated;
COMMENT ON FUNCTION public.list_inventory_batch_products(uuid) IS
 'Returns product identity only for positive inventory balances in a warehouse the caller can read; no cost or price is exposed.';
COMMIT;
