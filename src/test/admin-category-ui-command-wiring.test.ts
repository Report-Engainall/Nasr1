import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminApp = readFileSync(join(process.cwd(), "src/components/AghbariApp.tsx"), "utf8");
const categoryScreen = readFileSync(join(process.cwd(), "src/components/AdminCategoryTree.tsx"), "utf8");
const categoryReader = readFileSync(join(process.cwd(), "src/lib/admin-category-products.ts"), "utf8");
const categoryCommands = readFileSync(join(process.cwd(), "src/lib/admin-catalog-commands.ts"), "utf8");
const accessMatrix = readFileSync(join(process.cwd(), "src/lib/admin-access-matrix.ts"), "utf8");
const routeTree = readFileSync(join(process.cwd(), "src/routeTree.gen.ts"), "utf8");

describe("admin category workspace wiring", () => {
  it("exposes one catalog category editor and keeps Data Center as a navigation entry", () => {
    expect(adminApp).toContain("onNavigate('categories')");
    expect(adminApp).toContain("AdminCategoryTree onNotice={onNotice}");
    expect(adminApp).not.toContain("createAdminCatalogCategory(");
    expect(adminApp).not.toContain("archiveAdminCatalogCategory(");
    expect(adminApp).not.toContain("renameAdminCatalogCategory(");
  });

  it("creates categories through the existing audited RPC with the selected parent identifier", () => {
    expect(categoryScreen).toContain("createAdminCatalogCategory(name, createParent ?? null, code || null)");
    expect(categoryCommands).toContain("supabase.rpc('create_admin_catalog_category'");
    expect(categoryCommands).not.toContain(".from('categories').insert(");
    expect(categoryScreen).not.toContain(".from('categories').insert(");
  });

  it("routes rename, archive and restore through existing audited commands", () => {
    expect(categoryScreen).toContain("renameAdminCatalogCategory(selected.id, name)");
    expect(categoryScreen).toContain("archiveAdminCatalogCategory(category.id)");
    expect(categoryScreen).toContain("restoreAdminCatalogCategory(category.id)");
    expect(categoryCommands).toContain("supabase.rpc('rename_admin_catalog_category'");
    expect(categoryCommands).toContain("supabase.rpc('archive_admin_catalog_category'");
    expect(categoryCommands).toContain("supabase.rpc('restore_admin_catalog_category'");
    expect(categoryScreen).not.toContain(".from('categories').update(");
    expect(categoryScreen).not.toContain(".from('categories').delete(");
  });

  it("prevents archiving an active parent while active child categories remain", () => {
    expect(categoryScreen).toContain("item.parent_id === category.id && item.is_active !== false");
    expect(categoryScreen).toContain("لا يمكن أرشفة تصنيف أب قبل معالجة فروعه النشطة");
    expect(categoryScreen).toContain("window.confirm(");
  });

  it("limits the related-product preview to tenant-scoped non-financial fields", () => {
    expect(categoryReader).toContain("getCurrentTenantScope()");
    expect(categoryReader).toContain(".eq('organization_id', organizationId)");
    expect(categoryReader).toContain(".eq('category_id', categoryId)");
    expect(categoryReader).toContain(".limit(100)");
    expect(categoryReader).toContain("select('id,name,item_code,unit,status')");
    expect(categoryReader).not.toMatch(/base_price|price_wholesale|balance|inventory_balances/);
  });

  it("places categories in the existing catalog group and registers the dedicated route", () => {
    expect(accessMatrix).toContain('views: ["products", "categories", "pricing", "offers"]');
    expect(routeTree).toContain("path: '/admin/categories'");
    expect(routeTree).toContain("AdminCategoriesRouteImport");
  });
});
