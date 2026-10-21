import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261021130000_target_native_tenant_integrity.sql"),
  "utf8",
);
const runtimeTest = readFileSync(
  join(process.cwd(), "scripts/test-admin-catalog-commands.mjs"),
  "utf8",
);

describe("target-native tenant integrity migration", () => {
  it("adds composite organization-preserving foreign keys to tenant-owned relationships", () => {
    for (const constraint of [
      "tenant_integrity_warehouses_branch_org_fk",
      "tenant_integrity_categories_parent_org_fk",
      "tenant_integrity_products_category_org_fk",
      "tenant_integrity_orders_customer_org_fk",
      "tenant_integrity_customer_cart_items_product_org_fk",
      "tenant_integrity_purchase_orders_supplier_org_fk",
      "tenant_integrity_purchase_orders_warehouse_org_fk",
      "tenant_integrity_po_items_product_org_fk",
      "tenant_integrity_invoices_order_org_fk",
      "tenant_integrity_customer_payments_invoice_org_fk",
      "tenant_integrity_transfer_batches_destination_org_fk",
    ]) {
      expect(migration).toContain(constraint);
    }
  });

  it("guards cross-tenant links in child tables that do not carry organization_id", () => {
    expect(migration).toMatch(/assert_same_tenant_inventory_product_warehouse/i);
    expect(migration).toMatch(/assert_same_tenant_order_item_product/i);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF product_id, warehouse_id ON public\.inventory_balances/i);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF product_id, warehouse_id ON public\.inventory_movements/i);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF order_id, product_id ON public\.order_items/i);
  });

  it("fails closed on existing mismatches and never silently changes organization ownership", () => {
    expect(migration).toMatch(/tenant integrity preflight/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.(products|categories|orders|purchase_orders)\s+SET\s+organization_id/i);
  });

  it("proves privileged direct-DML tenant violations are rejected in PostgreSQL", () => {
    expect(runtimeTest).toMatch(/privileged direct DML cannot bind a product to another organization's category/i);
    expect(runtimeTest).toMatch(/privileged direct DML cannot create stock for a product in another organization's warehouse/i);
    expect(runtimeTest).toContain("public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved)");
  });

  it("does not import legacy-only schema contracts", () => {
    expect(migration).not.toMatch(/public\.price_lists\b|public\.carts\b|public\.cart_items\b|public\.audit_events\b/i);
  });
});
