-- Adapt donor 0017 to Nasr1's profile-scoped persistent cart and current order RPC.
-- place_order and submit_customer_order own pricing, identity, stock policy and idempotency.
-- A deferred trigger sees the full order-item set at commit and converts only a matching active
-- cart; a mismatch aborts the entire transaction and preserves the original cart.
BEGIN;

CREATE OR REPLACE FUNCTION public.convert_customer_cart_after_order_commit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cart_id uuid;
  v_cart_snapshot jsonb;
BEGIN
  IF NEW.created_by IS NULL OR NEW.organization_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
        WHERE r.profile_id = NEW.created_by AND r.role = 'customer'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_cart_id
    FROM public.customer_carts AS c
   WHERE c.organization_id = NEW.organization_id
     AND c.profile_id = NEW.created_by
     AND c.status = 'active'
   FOR UPDATE;
  IF v_cart_id IS NULL THEN RETURN NEW; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items AS oi WHERE oi.order_id = NEW.id)
     OR EXISTS (
       WITH cart_lines AS (
         SELECT i.product_id, pg_catalog.sum(i.quantity::numeric) AS quantity
           FROM public.customer_cart_items AS i
          WHERE i.organization_id = NEW.organization_id AND i.cart_id = v_cart_id
          GROUP BY i.product_id
       ),
       order_lines AS (
         SELECT oi.product_id, pg_catalog.sum(oi.quantity::numeric) AS quantity
           FROM public.order_items AS oi
          WHERE oi.order_id = NEW.id
          GROUP BY oi.product_id
       )
       SELECT 1
         FROM cart_lines AS c FULL OUTER JOIN order_lines AS o USING (product_id)
        WHERE c.quantity IS DISTINCT FROM o.quantity
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'checkout lines do not match active persistent cart; refresh cart and retry';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)
      ORDER BY i.product_id
    ), '[]'::jsonb
  )
    INTO v_cart_snapshot
    FROM public.customer_cart_items AS i
   WHERE i.organization_id = NEW.organization_id AND i.cart_id = v_cart_id;

  UPDATE public.customer_carts AS c
     SET status = 'checked_out', updated_at = pg_catalog.now()
   WHERE c.id = v_cart_id AND c.organization_id = NEW.organization_id
     AND c.profile_id = NEW.created_by AND c.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'active persistent cart changed during checkout; retry order';
  END IF;

  DELETE FROM public.customer_cart_items AS i
   WHERE i.organization_id = NEW.organization_id AND i.cart_id = v_cart_id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    NEW.organization_id, NEW.created_by, 'customer.cart.checked_out', 'customer_cart', v_cart_id,
    pg_catalog.jsonb_build_object('status', 'active', 'items', v_cart_snapshot),
    pg_catalog.jsonb_build_object('status', 'checked_out', 'order_id', NEW.id)
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_customer_cart_after_order_commit() FROM PUBLIC, anon, authenticated;
DO $cart_trigger$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS customer_cart_atomic_order_conversion ON public.orders';

  EXECUTE $ddl$
    CREATE CONSTRAINT TRIGGER customer_cart_atomic_order_conversion
      AFTER INSERT ON public.orders
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.convert_customer_cart_after_order_commit()
  $ddl$;

  EXECUTE $ddl$
    COMMENT ON FUNCTION public.convert_customer_cart_after_order_commit() IS
      'At transaction commit, converts a customer profile’s active persistent cart only when its product/quantity set matches persisted order_items; mismatch aborts the order transaction.'
  $ddl$;

  EXECUTE $ddl$
    COMMENT ON TRIGGER customer_cart_atomic_order_conversion ON public.orders IS
      'Atomic persistent-cart status transition, line cleanup and actor/tenant audit; uses the existing order RPC without a parallel order or pricing path.'
  $ddl$;
END;
$cart_trigger$;

COMMIT;
