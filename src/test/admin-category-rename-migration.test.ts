import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261022200000_admin_catalog_category_rename.sql"),
  "utf8",
);

describe("admin category rename migration contract", () => {
  it("derives active actor and tenant and limits the command to admin/manager", () => {
    expect(migration).toContain("v_actor uuid := public.current_profile_id()");
    expect(migration).toContain("o uuid := public.current_organization_id()");
    expect(migration).toContain("r.role IN('admin','manager')");
    expect(migration).toContain("p.auth_user_id=auth.uid()");
    expect(migration).toContain("p.organization_id=o AND p.is_active");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path=''");
  });

  it("locks the canonical tenant/parent/name key and rejects active duplicates", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("':cat:'");
    expect(migration).toContain("c.parent_id IS NOT DISTINCT FROM v_old.parent_id");
    expect(migration).toContain("c.id <> p_category_id");
    expect(migration).toContain("active category with the same name already exists under this parent");
  });

  it("changes only the category name and writes before/after audit on a real rename", () => {
    expect(migration).toContain("SET name = v_name");
    expect(migration).toContain("'catalog.category_renamed'");
    expect(migration).toContain("old_value, new_value");
    expect(migration).toContain("'parent_id', v_old.parent_id");
    expect(migration).toContain("'code', v_old.code");
    expect(migration).toContain("'sort_order', v_old.sort_order");
    expect(migration).toContain("v_old.name IS DISTINCT FROM v_name");
    expect(migration).toContain("archived category cannot be renamed");
  });

  it("grants only the authenticated execution path, with no client table-DML grant", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.rename_admin_catalog_category(uuid,text) FROM PUBLIC,anon;");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.rename_admin_catalog_category(uuid,text) FROM authenticated;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.rename_admin_catalog_category(uuid,text) TO authenticated;");
    expect(migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE).*public\.categories/i);
  });
});
