import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261117120000_admin_products_status_filter_v2.sql", import.meta.url),
  "utf8",
);

describe("admin product status filter migration contract", () => {
  it("uses an authenticated tenant-derived security-definer page RPC", () => {
    expect(migration).toContain("public.get_admin_products_page_v2");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path=''");
    expect(migration).toContain("auth.uid() IS NULL");
    expect(migration).toContain("p.organization_id=v_organization_id");
    expect(migration).toContain("role IN ('admin','manager','staff')");
  });

  it("accepts only the three exact server-side status filters", () => {
    expect(migration).toContain("p_status NOT IN ('all','active','inactive')");
    expect(migration).toContain("p_status='all' OR p.status=p_status");
  });

  it("filters category, status and search before server pagination", () => {
    const statusFilter = migration.indexOf("p_status='all' OR p.status=p_status");
    const categoryFilter = migration.indexOf("p_category_id IS NULL OR p.category_id=p_category_id");
    const searchFilter = migration.indexOf("v_search=''");
    const offset = migration.indexOf("OFFSET v_offset");
    expect(statusFilter).toBeGreaterThan(-1);
    expect(categoryFilter).toBeGreaterThan(-1);
    expect(searchFilter).toBeGreaterThan(-1);
    expect(statusFilter).toBeLessThan(offset);
    expect(categoryFilter).toBeLessThan(offset);
    expect(searchFilter).toBeLessThan(offset);
    expect(migration).toContain("LIMIT (v_page_size+1)");
  });

  it("preserves the conditional internal base-price projection and denies public execution", () => {
    expect(migration).toContain("CASE WHEN v_can_view_internal_prices");
    expect(migration).toContain("THEN pg_catalog.jsonb_build_object('base_price',r.base_price)");
    expect(migration).toContain("FROM PUBLIC,anon");
    expect(migration).toContain("TO authenticated");
    expect(migration).not.toContain("SELECT p.*");
  });
});
