import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminApp = readFileSync(join(process.cwd(), "src/components/AghbariApp.tsx"), "utf8");
const categoryCommands = readFileSync(join(process.cwd(), "src/lib/admin-catalog-commands.ts"), "utf8");

describe("admin category command wiring", () => {
  it("routes Data Center category creation through the audited target-native RPC service", () => {
    expect(adminApp).toContain("import { createAdminCatalogCategory } from '@/lib/admin-catalog-commands';");
    expect(adminApp).toContain("await createAdminCatalogCategory(name);");
    expect(adminApp).not.toContain("await createCategory({ name,");
  });

  it("keeps category creation behind the established server RPC instead of direct table inserts", () => {
    expect(categoryCommands).toContain("supabase.rpc('create_admin_catalog_category'");
    expect(categoryCommands).not.toContain(".from('categories').insert(");
  });
  it("wires category archive to the same audited server command and gates it by role", () => {
    expect(adminApp).toContain("import { archiveAdminCatalogCategory, createAdminCatalogCategory } from '@/lib/admin-catalog-commands';");
    expect(adminApp).toContain("await archiveAdminCatalogCategory(category.id);");
    expect(adminApp).toContain("window.confirm(");
    expect(adminApp).toContain("canManageImports && category.is_active !== false");
    expect(adminApp).toContain("سيبقى السجل محفوظًا");
    expect(categoryCommands).toContain("supabase.rpc('archive_admin_catalog_category'");
    expect(categoryCommands).toContain("لم يؤكد الخادم أرشفة التصنيف.");
    expect(adminApp).not.toContain(".from('categories').update(");
    expect(adminApp).not.toContain(".from('categories').delete(");
  });

});
