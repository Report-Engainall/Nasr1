import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261020220000_staff_catalog_commands.sql"),
  "utf8",
);

describe("staff catalog RPC migration", () => {
  it("authorizes only active tenant admin/manager profiles", () => {
    expect(migration).toContain("r.role IN('admin','manager')");
    expect(migration).toContain("p.auth_user_id=auth.uid()");
    expect(migration).toContain("p.organization_id=o AND p.is_active");
    expect(migration).toContain("SET search_path=''");
  });

  it("audits changes and preserves old products", () => {
    expect(migration).toContain("catalog.category_created");
    expect(migration).toContain("catalog.product_created");
    expect(migration).toContain("catalog.product_updated");
    expect(migration).toContain("catalog.product_archived");
    expect(migration).toContain("old_value,new_value");
    expect(migration).toContain("SET status='inactive'");
    expect(migration).not.toContain("DELETE FROM public.products");
  });

  it("prevents stale prices and inventory side effects", () => {
    expect(migration).toContain("product prices changed after the form opened; reload before saving");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).not.toContain("UPDATE public.inventory_balances");
    expect(migration).not.toContain("INSERT INTO public.inventory_movements");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.save_admin_catalog_product(uuid,jsonb) FROM PUBLIC,anon;",
    );
  });
});
