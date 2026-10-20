import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020220000_staff_catalog_commands.sql"),
  "utf8",
);
const runtimeTest = readFileSync(
  join(process.cwd(), "scripts/test-admin-catalog-commands.mjs"),
  "utf8",
);

describe("staff catalog commands migration contract", () => {
  it("binds JSONB payload objects without double-serializing them into JSON strings", () => {
    for (const forbidden of [
      "JSON.stringify(payload)",
      "JSON.stringify(update)",
      "JSON.stringify({ ...payload",
      "JSON.stringify({ ...update",
    ]) {
      expect(runtimeTest).not.toContain(forbidden);
    }
    expect(runtimeTest).toContain('[payload]');
    expect(runtimeTest).toContain('[created.id, update]');
  });

  it("reports unsupported payload keys explicitly rather than relying on JSONB key subtraction", () => {
    expect(migration).toMatch(/jsonb_object_keys\(p_payload\)/i);
    expect(migration).toMatch(/catalog payload contains unsupported fields/i);
    expect(migration).toMatch(/unsupported fields: /i);
  });

  it("delegates all base and tier price writes to the canonical price-grid RPC", () => {
    expect(migration).toMatch(/public\.save_product_price_grid\(/i);
    expect(migration).toMatch(/public\.get_admin_product_price_grid\(\)/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.products\s+SET[^;]*\bprice_wholesale_of_wholesale\s*=/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.products\s*\([^)]*\bprice_wholesale_of_wholesale/i);
    expect(migration).toMatch(/public\.audit_logs/i);
    expect(migration).not.toMatch(/public\.audit_events/i);
  });

  it("records actor, tenant, before and after values for product and category changes", () => {
    expect(migration).toMatch(/v_actor\s+uuid\s*:=\s*public\.current_profile_id\(\)/i);
    expect(migration).toMatch(/o\s+uuid\s*:=\s*public\.current_organization_id\(\)/i);
    expect(migration).toMatch(/catalog\.product_created/);
    expect(migration).toMatch(/catalog\.product_updated/);
    expect(migration).toMatch(/catalog\.product_archived/);
    expect(migration).toMatch(/catalog\.category_created/);
    expect(migration).toMatch(/catalog\.category_archived/);
    expect(migration).toMatch(/old_value,\s*new_value/i);
  });

  it("adds tenant-scoped soft archive and keeps direct table writes behind RPCs", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.archive_admin_catalog_category/i);
    expect(migration).toMatch(/category not found in organization/i);
    expect(migration).toMatch(/category has active products or child categories/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.save_admin_catalog_product\(uuid,jsonb\) FROM PUBLIC,anon;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.save_admin_catalog_product\(uuid,jsonb\) FROM authenticated;/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_admin_catalog_product\(uuid, jsonb\) TO authenticated/i);
  });
  
  it("revokes direct authenticated DML on catalog, tier prices and audit records", () => {
    for (const table of ["categories", "product_prices", "audit_logs"]) {
      expect(migration).toContain(`REVOKE INSERT, UPDATE, DELETE ON TABLE public.${table} FROM authenticated;`);
    }
    expect(migration).toContain("REVOKE UPDATE, DELETE ON TABLE public.products FROM authenticated;");
    expect(migration).not.toContain("staff_catalog_products_insert_rpc_only");
  });
});
