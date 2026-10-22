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
});
