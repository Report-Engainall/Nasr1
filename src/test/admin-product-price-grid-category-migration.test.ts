import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261117130000_admin_product_price_grid_category_projection.sql", import.meta.url),
  "utf8",
);

describe("admin price grid category projection migration", () => {
  it("authorizes only an active same-tenant admin or manager", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("auth.uid() IS NULL");
    expect(migration).toContain("v_profile_id");
    expect(migration).toContain("p.organization_id = v_organization_id");
    expect(migration).toContain("p.auth_user_id = auth.uid()");
    expect(migration).toContain("p.is_active = true");
    expect(migration).toContain("r.role IN ('admin','manager')");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_admin_product_price_grid_v2() TO authenticated");
  });

  it("joins category identity only inside the caller organization", () => {
    expect(migration).toContain("LEFT JOIN public.categories c");
    expect(migration).toContain("c.id = p.category_id");
    expect(migration).toContain("c.organization_id = v_organization_id");
    expect(migration).toContain("c.id,");
    expect(migration).toContain("c.name,");
    expect(migration).toContain("WHERE p.organization_id = v_organization_id");
  });

  it("preserves saved price tiers and read-only inventory aggregates", () => {
    for (const field of [
      "base_price", "price_wholesale_of_wholesale", "price_wholesale", "price_retail",
      "quantity_on_hand_total", "quantity_reserved_total", "quantity_available_total",
      "reorder_point_total", "inventory_warehouse_count",
    ]) expect(migration).toContain(field);
    expect(migration).toContain("LEFT JOIN LATERAL");
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+INTO?\s+public\.(?:products|inventory_balances|inventory_movements)/i);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("keeps the prior price-grid RPC contract intact", () => {
    expect(migration).not.toContain("DROP FUNCTION");
    expect(migration).not.toContain("get_admin_product_price_grid_with_inventory");
    expect(migration).toContain("get_admin_product_price_grid_v2");
  });
});
