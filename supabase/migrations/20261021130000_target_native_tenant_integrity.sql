-- Target-native adaptation of aghbari-commerce 0012_cross_tenant_integrity.
-- Donor SQL assumes legacy price_lists/carts tables and organization_id columns on child
-- rows absent from Nasr1. Keep product_prices/customer_carts and add tenant-preserving
-- relations on current tables; triggers guard children that intentionally lack organization_id.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_branches_id_org_uidx ON public.branches(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_categories_id_org_uidx ON public.categories(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_products_id_org_uidx ON public.products(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_warehouses_id_org_uidx ON public.warehouses(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_customers_id_org_uidx ON public.customers(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_orders_id_org_uidx ON public.orders(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_suppliers_id_org_uidx ON public.suppliers(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_profiles_id_org_uidx ON public.profiles(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_purchase_orders_id_org_uidx ON public.purchase_orders(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_purchase_order_items_id_org_uidx ON public.purchase_order_items(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_purchase_receipts_id_org_uidx ON public.purchase_receipts(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_customer_invoices_id_org_uidx ON public.customer_invoices(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_inventory_transfer_batches_id_org_uidx ON public.inventory_transfer_batches(id,organization_id);

-- Existing mismatches abort the migration; this migration does not silently reassign ownership.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventory_balances ib
    JOIN public.products p ON p.id=ib.product_id
    JOIN public.warehouses w ON w.id=ib.warehouse_id
    WHERE p.organization_id IS DISTINCT FROM w.organization_id) THEN
    RAISE EXCEPTION 'tenant integrity preflight: inventory balance product/warehouse tenant mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_movements im
    JOIN public.products p ON p.id=im.product_id
    JOIN public.warehouses w ON w.id=im.warehouse_id
    WHERE p.organization_id IS DISTINCT FROM w.organization_id) THEN
    RAISE EXCEPTION 'tenant integrity preflight: inventory movement product/warehouse tenant mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items i
    JOIN public.orders o ON o.id=i.order_id
    LEFT JOIN public.products p ON p.id=i.product_id
    WHERE i.product_id IS NOT NULL AND o.organization_id IS DISTINCT FROM p.organization_id) THEN
    RAISE EXCEPTION 'tenant integrity preflight: order item product belongs to another organization';
  END IF;
END $$;

DO $foreign_keys$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.warehouses'::regclass AND conname='tenant_integrity_warehouses_branch_org_fk') THEN
    ALTER TABLE public.warehouses ADD CONSTRAINT tenant_integrity_warehouses_branch_org_fk
      FOREIGN KEY(branch_id,organization_id) REFERENCES public.branches(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.categories'::regclass AND conname='tenant_integrity_categories_parent_org_fk') THEN
    ALTER TABLE public.categories ADD CONSTRAINT tenant_integrity_categories_parent_org_fk
      FOREIGN KEY(parent_id,organization_id) REFERENCES public.categories(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.products'::regclass AND conname='tenant_integrity_products_category_org_fk') THEN
    ALTER TABLE public.products ADD CONSTRAINT tenant_integrity_products_category_org_fk
      FOREIGN KEY(category_id,organization_id) REFERENCES public.categories(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='tenant_integrity_orders_customer_org_fk') THEN
    ALTER TABLE public.orders ADD CONSTRAINT tenant_integrity_orders_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_carts'::regclass AND conname='tenant_integrity_customer_carts_profile_org_fk') THEN
    ALTER TABLE public.customer_carts ADD CONSTRAINT tenant_integrity_customer_carts_profile_org_fk
      FOREIGN KEY(profile_id,organization_id) REFERENCES public.profiles(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_cart_items'::regclass AND conname='tenant_integrity_customer_cart_items_product_org_fk') THEN
    ALTER TABLE public.customer_cart_items ADD CONSTRAINT tenant_integrity_customer_cart_items_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_orders'::regclass AND conname='tenant_integrity_purchase_orders_supplier_org_fk') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT tenant_integrity_purchase_orders_supplier_org_fk
      FOREIGN KEY(supplier_id,organization_id) REFERENCES public.suppliers(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_orders'::regclass AND conname='tenant_integrity_purchase_orders_warehouse_org_fk') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT tenant_integrity_purchase_orders_warehouse_org_fk
      FOREIGN KEY(warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_order_items'::regclass AND conname='tenant_integrity_po_items_parent_org_fk') THEN
    ALTER TABLE public.purchase_order_items ADD CONSTRAINT tenant_integrity_po_items_parent_org_fk
      FOREIGN KEY(purchase_order_id,organization_id) REFERENCES public.purchase_orders(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_order_items'::regclass AND conname='tenant_integrity_po_items_product_org_fk') THEN
    ALTER TABLE public.purchase_order_items ADD CONSTRAINT tenant_integrity_po_items_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_receipts'::regclass AND conname='tenant_integrity_purchase_receipts_order_org_fk') THEN
    ALTER TABLE public.purchase_receipts ADD CONSTRAINT tenant_integrity_purchase_receipts_order_org_fk
      FOREIGN KEY(purchase_order_id,organization_id) REFERENCES public.purchase_orders(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_receipts'::regclass AND conname='tenant_integrity_purchase_receipts_warehouse_org_fk') THEN
    ALTER TABLE public.purchase_receipts ADD CONSTRAINT tenant_integrity_purchase_receipts_warehouse_org_fk
      FOREIGN KEY(warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_receipt_items'::regclass AND conname='tenant_integrity_receipt_items_receipt_org_fk') THEN
    ALTER TABLE public.purchase_receipt_items ADD CONSTRAINT tenant_integrity_receipt_items_receipt_org_fk
      FOREIGN KEY(receipt_id,organization_id) REFERENCES public.purchase_receipts(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_receipt_items'::regclass AND conname='tenant_integrity_receipt_items_po_item_org_fk') THEN
    ALTER TABLE public.purchase_receipt_items ADD CONSTRAINT tenant_integrity_receipt_items_po_item_org_fk
      FOREIGN KEY(purchase_order_item_id,organization_id) REFERENCES public.purchase_order_items(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.purchase_receipt_items'::regclass AND conname='tenant_integrity_receipt_items_product_org_fk') THEN
    ALTER TABLE public.purchase_receipt_items ADD CONSTRAINT tenant_integrity_receipt_items_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_invoices'::regclass AND conname='tenant_integrity_invoices_customer_org_fk') THEN
    ALTER TABLE public.customer_invoices ADD CONSTRAINT tenant_integrity_invoices_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_invoices'::regclass AND conname='tenant_integrity_invoices_order_org_fk') THEN
    ALTER TABLE public.customer_invoices ADD CONSTRAINT tenant_integrity_invoices_order_org_fk
      FOREIGN KEY(order_id,organization_id) REFERENCES public.orders(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_invoice_items'::regclass AND conname='tenant_integrity_invoice_items_invoice_org_fk') THEN
    ALTER TABLE public.customer_invoice_items ADD CONSTRAINT tenant_integrity_invoice_items_invoice_org_fk
      FOREIGN KEY(invoice_id,organization_id) REFERENCES public.customer_invoices(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_invoice_items'::regclass AND conname='tenant_integrity_invoice_items_product_org_fk') THEN
    ALTER TABLE public.customer_invoice_items ADD CONSTRAINT tenant_integrity_invoice_items_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_payments'::regclass AND conname='tenant_integrity_customer_payments_customer_org_fk') THEN
    ALTER TABLE public.customer_payments ADD CONSTRAINT tenant_integrity_customer_payments_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_payments'::regclass AND conname='tenant_integrity_customer_payments_invoice_org_fk') THEN
    ALTER TABLE public.customer_payments ADD CONSTRAINT tenant_integrity_customer_payments_invoice_org_fk
      FOREIGN KEY(invoice_id,organization_id) REFERENCES public.customer_invoices(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_company_contacts'::regclass AND conname='tenant_integrity_company_contacts_customer_org_fk') THEN
    ALTER TABLE public.customer_company_contacts ADD CONSTRAINT tenant_integrity_company_contacts_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_company_memberships'::regclass AND conname='tenant_integrity_company_memberships_customer_org_fk') THEN
    ALTER TABLE public.customer_company_memberships ADD CONSTRAINT tenant_integrity_company_memberships_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_transfer_batches'::regclass AND conname='tenant_integrity_transfer_batches_source_org_fk') THEN
    ALTER TABLE public.inventory_transfer_batches ADD CONSTRAINT tenant_integrity_transfer_batches_source_org_fk
      FOREIGN KEY(source_warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_transfer_batches'::regclass AND conname='tenant_integrity_transfer_batches_destination_org_fk') THEN
    ALTER TABLE public.inventory_transfer_batches ADD CONSTRAINT tenant_integrity_transfer_batches_destination_org_fk
      FOREIGN KEY(destination_warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id);
  END IF;
END;
$foreign_keys$;

CREATE OR REPLACE FUNCTION public.assert_same_tenant_inventory_product_warehouse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_product_org uuid; v_warehouse_org uuid;
BEGIN
  SELECT p.organization_id INTO v_product_org FROM public.products AS p WHERE p.id=NEW.product_id;
  SELECT w.organization_id INTO v_warehouse_org FROM public.warehouses AS w WHERE w.id=NEW.warehouse_id;
  IF v_product_org IS NULL OR v_warehouse_org IS NULL OR v_product_org IS DISTINCT FROM v_warehouse_org THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='inventory product and warehouse must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tenant_integrity_inventory_balances_product_warehouse ON public.inventory_balances;
CREATE TRIGGER tenant_integrity_inventory_balances_product_warehouse
  BEFORE INSERT OR UPDATE OF product_id, warehouse_id ON public.inventory_balances
  FOR EACH ROW EXECUTE FUNCTION public.assert_same_tenant_inventory_product_warehouse();
DROP TRIGGER IF EXISTS tenant_integrity_inventory_movements_product_warehouse ON public.inventory_movements;
CREATE TRIGGER tenant_integrity_inventory_movements_product_warehouse
  BEFORE INSERT OR UPDATE OF product_id, warehouse_id ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.assert_same_tenant_inventory_product_warehouse();

CREATE OR REPLACE FUNCTION public.assert_same_tenant_order_item_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_order_org uuid; v_product_org uuid;
BEGIN
  SELECT o.organization_id INTO v_order_org FROM public.orders AS o WHERE o.id=NEW.order_id;
  IF v_order_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='order item must reference an existing order organization';
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    SELECT p.organization_id INTO v_product_org FROM public.products AS p WHERE p.id=NEW.product_id;
    IF v_product_org IS NULL OR v_product_org IS DISTINCT FROM v_order_org THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='order item product must belong to the order organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tenant_integrity_order_item_product ON public.order_items;
CREATE TRIGGER tenant_integrity_order_item_product
  BEFORE INSERT OR UPDATE OF order_id, product_id ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.assert_same_tenant_order_item_product();

REVOKE ALL ON FUNCTION public.assert_same_tenant_inventory_product_warehouse() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_same_tenant_order_item_product() FROM PUBLIC, anon, authenticated;

COMMENT ON INDEX public.tenant_integrity_products_id_org_uidx IS
  'Composite target for tenant-preserving product foreign keys.';
COMMENT ON CONSTRAINT tenant_integrity_products_category_org_fk ON public.products IS
  'Prevents privileged writes from linking a product to a category owned by another organization.';
COMMENT ON CONSTRAINT tenant_integrity_customer_cart_items_product_org_fk ON public.customer_cart_items IS
  'Prevents a cart item from referencing a product outside the cart organization.';

COMMIT;
