-- Additive target-native tenant consistency for tables introduced after the donor's older core schema.
-- Keep immutable migration history; never add legacy price_lists/carts/audit_events contracts.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_import_jobs_id_org_uidx
  ON public.import_jobs(id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_onyx_snapshots_id_org_uidx
  ON public.onyx_snapshots(id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_onyx_snapshot_rows_id_org_uidx
  ON public.onyx_snapshot_rows(id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_onyx_commands_id_org_uidx
  ON public.onyx_inventory_reconciliation_commands(id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_sales_quotes_id_org_uidx
  ON public.sales_quotes(id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrity_reorder_templates_id_org_uidx
  ON public.reorder_templates(id, organization_id);

DO $additional_tenant_fks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_addresses'::regclass AND conname='tenant_integrity_customer_addresses_customer_org_fk') THEN
    ALTER TABLE public.customer_addresses ADD CONSTRAINT tenant_integrity_customer_addresses_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_company_invitations'::regclass AND conname='tenant_integrity_company_invitations_customer_org_fk') THEN
    ALTER TABLE public.customer_company_invitations ADD CONSTRAINT tenant_integrity_company_invitations_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_company_invitations'::regclass AND conname='tenant_integrity_company_invitations_inviter_org_fk') THEN
    ALTER TABLE public.customer_company_invitations ADD CONSTRAINT tenant_integrity_company_invitations_inviter_org_fk
      FOREIGN KEY(invited_by,organization_id) REFERENCES public.profiles(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_company_invitations'::regclass AND conname='tenant_integrity_company_invitations_acceptor_org_fk') THEN
    ALTER TABLE public.customer_company_invitations ADD CONSTRAINT tenant_integrity_company_invitations_acceptor_org_fk
      FOREIGN KEY(accepted_by,organization_id) REFERENCES public.profiles(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_activation_invitations'::regclass AND conname='tenant_integrity_activation_invitations_customer_org_fk') THEN
    ALTER TABLE public.customer_activation_invitations ADD CONSTRAINT tenant_integrity_activation_invitations_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_activation_invitations'::regclass AND conname='tenant_integrity_activation_invitations_inviter_org_fk') THEN
    ALTER TABLE public.customer_activation_invitations ADD CONSTRAINT tenant_integrity_activation_invitations_inviter_org_fk
      FOREIGN KEY(invited_by_profile_id,organization_id) REFERENCES public.profiles(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_activation_invitations'::regclass AND conname='tenant_integrity_activation_invitations_acceptor_org_fk') THEN
    ALTER TABLE public.customer_activation_invitations ADD CONSTRAINT tenant_integrity_activation_invitations_acceptor_org_fk
      FOREIGN KEY(accepted_by_profile_id,organization_id) REFERENCES public.profiles(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_company_memberships'::regclass AND conname='tenant_integrity_company_memberships_profile_org_fk') THEN
    ALTER TABLE public.customer_company_memberships ADD CONSTRAINT tenant_integrity_company_memberships_profile_org_fk
      FOREIGN KEY(profile_id,organization_id) REFERENCES public.profiles(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_company_memberships'::regclass AND conname='tenant_integrity_company_memberships_inviter_org_fk') THEN
    ALTER TABLE public.customer_company_memberships ADD CONSTRAINT tenant_integrity_company_memberships_inviter_org_fk
      FOREIGN KEY(invited_by,organization_id) REFERENCES public.profiles(id,organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storefront_saved_products'::regclass AND conname='tenant_integrity_saved_products_profile_org_fk') THEN
    ALTER TABLE public.storefront_saved_products ADD CONSTRAINT tenant_integrity_saved_products_profile_org_fk
      FOREIGN KEY(profile_id,organization_id) REFERENCES public.profiles(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storefront_saved_products'::regclass AND conname='tenant_integrity_saved_products_product_org_fk') THEN
    ALTER TABLE public.storefront_saved_products ADD CONSTRAINT tenant_integrity_saved_products_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_transfers'::regclass AND conname='tenant_integrity_inventory_transfers_product_org_fk') THEN
    ALTER TABLE public.inventory_transfers ADD CONSTRAINT tenant_integrity_inventory_transfers_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_transfers'::regclass AND conname='tenant_integrity_inventory_transfers_source_warehouse_org_fk') THEN
    ALTER TABLE public.inventory_transfers ADD CONSTRAINT tenant_integrity_inventory_transfers_source_warehouse_org_fk
      FOREIGN KEY(source_warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_transfers'::regclass AND conname='tenant_integrity_transfer_dest_warehouse_org_fk') THEN
    ALTER TABLE public.inventory_transfers ADD CONSTRAINT tenant_integrity_transfer_dest_warehouse_org_fk
      FOREIGN KEY(destination_warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_transfers'::regclass AND conname='tenant_integrity_inventory_transfers_actor_org_fk') THEN
    ALTER TABLE public.inventory_transfers ADD CONSTRAINT tenant_integrity_inventory_transfers_actor_org_fk
      FOREIGN KEY(created_by,organization_id) REFERENCES public.profiles(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onyx_snapshots'::regclass AND conname='tenant_integrity_onyx_snapshot_import_org_fk') THEN
    ALTER TABLE public.onyx_snapshots ADD CONSTRAINT tenant_integrity_onyx_snapshot_import_org_fk
      FOREIGN KEY(source_import_job_id,organization_id) REFERENCES public.import_jobs(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onyx_snapshot_rows'::regclass AND conname='tenant_integrity_onyx_rows_snapshot_org_fk') THEN
    ALTER TABLE public.onyx_snapshot_rows ADD CONSTRAINT tenant_integrity_onyx_rows_snapshot_org_fk
      FOREIGN KEY(snapshot_id,organization_id) REFERENCES public.onyx_snapshots(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_reconciliation_runs'::regclass AND conname='tenant_integrity_reconciliation_runs_snapshot_org_fk') THEN
    ALTER TABLE public.inventory_reconciliation_runs ADD CONSTRAINT tenant_integrity_reconciliation_runs_snapshot_org_fk
      FOREIGN KEY(snapshot_id,organization_id) REFERENCES public.onyx_snapshots(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onyx_inventory_reconciliation_commands'::regclass AND conname='tenant_integrity_onyx_commands_snapshot_org_fk') THEN
    ALTER TABLE public.onyx_inventory_reconciliation_commands ADD CONSTRAINT tenant_integrity_onyx_commands_snapshot_org_fk
      FOREIGN KEY(snapshot_id,organization_id) REFERENCES public.onyx_snapshots(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onyx_inventory_reconciliation_commands'::regclass AND conname='tenant_integrity_onyx_commands_warehouse_org_fk') THEN
    ALTER TABLE public.onyx_inventory_reconciliation_commands ADD CONSTRAINT tenant_integrity_onyx_commands_warehouse_org_fk
      FOREIGN KEY(warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onyx_inventory_reconciliation_commands'::regclass AND conname='tenant_integrity_onyx_commands_actor_org_fk') THEN
    ALTER TABLE public.onyx_inventory_reconciliation_commands ADD CONSTRAINT tenant_integrity_onyx_commands_actor_org_fk
      FOREIGN KEY(created_by,organization_id) REFERENCES public.profiles(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onyx_inventory_reconciliation_items'::regclass AND conname='tenant_integrity_onyx_items_command_org_fk') THEN
    ALTER TABLE public.onyx_inventory_reconciliation_items ADD CONSTRAINT tenant_integrity_onyx_items_command_org_fk
      FOREIGN KEY(command_id,organization_id) REFERENCES public.onyx_inventory_reconciliation_commands(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onyx_inventory_reconciliation_items'::regclass AND conname='tenant_integrity_onyx_items_snapshot_row_org_fk') THEN
    ALTER TABLE public.onyx_inventory_reconciliation_items ADD CONSTRAINT tenant_integrity_onyx_items_snapshot_row_org_fk
      FOREIGN KEY(snapshot_row_id,organization_id) REFERENCES public.onyx_snapshot_rows(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.onyx_inventory_reconciliation_items'::regclass AND conname='tenant_integrity_onyx_items_product_org_fk') THEN
    ALTER TABLE public.onyx_inventory_reconciliation_items ADD CONSTRAINT tenant_integrity_onyx_items_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sales_quotes'::regclass AND conname='tenant_integrity_sales_quotes_customer_org_fk') THEN
    ALTER TABLE public.sales_quotes ADD CONSTRAINT tenant_integrity_sales_quotes_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sales_quote_items'::regclass AND conname='tenant_integrity_sales_quote_items_quote_org_fk') THEN
    ALTER TABLE public.sales_quote_items ADD CONSTRAINT tenant_integrity_sales_quote_items_quote_org_fk
      FOREIGN KEY(quote_id,organization_id) REFERENCES public.sales_quotes(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sales_quote_items'::regclass AND conname='tenant_integrity_sales_quote_items_product_org_fk') THEN
    ALTER TABLE public.sales_quote_items ADD CONSTRAINT tenant_integrity_sales_quote_items_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id) ON DELETE SET NULL (product_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reorder_templates'::regclass AND conname='tenant_integrity_reorder_templates_customer_org_fk') THEN
    ALTER TABLE public.reorder_templates ADD CONSTRAINT tenant_integrity_reorder_templates_customer_org_fk
      FOREIGN KEY(customer_id,organization_id) REFERENCES public.customers(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reorder_templates'::regclass AND conname='tenant_integrity_reorder_templates_source_order_org_fk') THEN
    ALTER TABLE public.reorder_templates ADD CONSTRAINT tenant_integrity_reorder_templates_source_order_org_fk
      FOREIGN KEY(source_order_id,organization_id) REFERENCES public.orders(id,organization_id) ON DELETE SET NULL (source_order_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reorder_template_items'::regclass AND conname='tenant_integrity_reorder_template_items_template_org_fk') THEN
    ALTER TABLE public.reorder_template_items ADD CONSTRAINT tenant_integrity_reorder_template_items_template_org_fk
      FOREIGN KEY(template_id,organization_id) REFERENCES public.reorder_templates(id,organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reorder_template_items'::regclass AND conname='tenant_integrity_reorder_template_items_product_org_fk') THEN
    ALTER TABLE public.reorder_template_items ADD CONSTRAINT tenant_integrity_reorder_template_items_product_org_fk
      FOREIGN KEY(product_id,organization_id) REFERENCES public.products(id,organization_id) ON DELETE SET NULL (product_id);
  END IF;
END;
$additional_tenant_fks$;

COMMIT;
