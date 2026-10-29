import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const api = readFileSync(join(root, "src/lib/api.ts"), "utf8");
const migration = readFileSync(
  join(root, "supabase/migrations/20261029153500_admin_product_metadata_atomic_save.sql"),
  "utf8",
);
const runtimeTest = readFileSync(join(root, "scripts/test-admin-catalog-commands.mjs"), "utf8");
const updateStart = api.indexOf("export async function updateProduct(");
const updateEnd = api.indexOf("export class ProductImageCleanupError", updateStart);
const updateProduct = api.slice(updateStart, updateEnd);

describe("atomic administrator product save contract", () => {
  it("routes edits through the audited command instead of revoked direct product UPDATE", () => {
    expect(updateStart).toBeGreaterThanOrEqual(0);
    expect(updateEnd).toBeGreaterThan(updateStart);
    expect(updateProduct).toContain("fetchStaffProductById(id)");
    expect(updateProduct).toContain("supabase.rpc('save_admin_product_with_metadata'");
    expect(updateProduct).not.toContain(".from('products')");
    expect(updateProduct).not.toContain(".update(updates)");
    expect(updateProduct).toContain("expected_base_price: currentPrices[0]");
    expect(updateProduct).toContain("expected_price_wholesale_of_wholesale: currentPrices[1]");
    expect(updateProduct).toContain("min_order_quantity");
    expect(updateProduct).toContain("order_quantity_multiple");
  });

  it("uses tenant-bound admin/manager authorization and the canonical core price-grid command", () => {
    expect(migration).toMatch(/SECURITY DEFINER/i);
    expect(migration).toContain("public.current_profile_id()");
    expect(migration).toContain("public.current_organization_id()");
    expect(migration).toContain("r.role IN ('admin', 'manager')");
    expect(migration).toContain("p.organization_id = o");
    expect(migration).toContain("public.save_admin_catalog_product(p_product_id, v_core_payload)");
    expect(migration).toContain("expected_price_wholesale_of_wholesale");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.save_admin_product_with_metadata(uuid,jsonb)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.save_admin_product_with_metadata(uuid,jsonb)");
  });

  it("validates metadata, preserves bounded order policies, and audits only real metadata changes", () => {
    for (const field of ["name_en", "sku", "is_featured", "sort_order", "min_order_quantity", "order_quantity_multiple"]) {
      expect(migration).toContain("'" + field + "'");
    }
    expect(migration).toContain("v_sort_order_numeric > 1000000000");
    expect(migration).toContain("v_min_order_quantity_numeric > 10000");
    expect(migration).toContain("v_order_quantity_multiple_numeric > 10000");
    expect(migration).toContain("'catalog.product_metadata_updated'");
    expect(migration).toContain("v_before IS DISTINCT FROM v_after");
    expect(runtimeTest).toContain("metadata type failures are rejected before core or metadata mutations");
    expect(runtimeTest).toContain("metadata save cannot address another tenant's product");
    expect(runtimeTest).toContain("metadata change writes one audit event");
  });
});
