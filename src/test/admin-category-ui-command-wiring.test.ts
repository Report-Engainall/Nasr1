import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminApp = readFileSync(join(process.cwd(), "src/components/AghbariApp.tsx"), "utf8");
const categoryScreen = readFileSync(join(process.cwd(), "src/components/AdminCategoryTree.tsx"), "utf8");
const categoryReader = readFileSync(join(process.cwd(), "src/lib/admin-category-products.ts"), "utf8");
const categoryCatalog = readFileSync(join(process.cwd(), "src/lib/admin-category-catalog.ts"), "utf8");
const productApi = readFileSync(join(process.cwd(), "src/lib/api.ts"), "utf8");
const categoryCommands = readFileSync(join(process.cwd(), "src/lib/admin-catalog-commands.ts"), "utf8");
const accessMatrix = readFileSync(join(process.cwd(), "src/lib/admin-access-matrix.ts"), "utf8");
const routeTree = readFileSync(join(process.cwd(), "src/routeTree.gen.ts"), "utf8");
const dataRoute = readFileSync(join(process.cwd(), "src/routes/admin_.data.tsx"), "utf8");
const importEngine = readFileSync(join(process.cwd(), "src/components/UnifiedImportEngine.tsx"), "utf8");
const dataCenterStart = adminApp.indexOf("function DataCenter(");
const dataCenterEnd = adminApp.indexOf("function ReportMetric(", dataCenterStart);
const dataCenter = adminApp.slice(dataCenterStart, dataCenterEnd);

describe("admin category workspace wiring", () => {
  it("exposes one catalog category editor and keeps Data Center as a navigation entry", () => {
    expect(adminApp).toContain("onNavigate('categories')");
    expect(adminApp).toContain("const AdminCategoryTree = lazy");
    expect(adminApp).toContain("return <AdminCategoryTree");
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

  it("shows category price and stock through the existing tenant-scoped paginated product reader", () => {
    expect(categoryScreen).toContain("fetchAdminProductsPage({ page: catalogPage, categoryId: selected.id })");
    expect(categoryScreen).toContain('aria-label="الأسعار والمخزون"');
    expect(categoryScreen).toContain("canViewPrices");
    expect(categoryScreen).toContain("projectAdminCategoryCatalogMetrics");
    expect(productApi).toContain("input.categoryId");
    expect(productApi).toContain(".eq('category_id', input.categoryId)");
    expect(categoryCatalog).toContain("getInventoryAvailabilityStatus");
    expect(categoryCatalog).toContain("access.canViewPrice ? nonNegativeFinite(product.base_price) : null");
  });

  it("opens a related product in the existing product workspace without duplicating product editing", () => {
    expect(categoryScreen).toContain("onOpenProduct(product)");
    expect(categoryScreen).toContain("aria-label={`فتح المنتج ${product.name}`}");
    expect(adminApp).toContain('keepSourceContext(\n            "product"');
    expect(adminApp).toContain('"فتح المنتج من شجرة التصنيفات"');
  });

  it("places categories in the existing catalog group and registers the dedicated route", () => {
    expect(accessMatrix).toContain('defineAdminNavigationGroup("catalog", "الكتالوج والتسعير"');
    expect(accessMatrix).toContain('{ id: "categories", label: "التصنيفات الرئيسية والفرعية", path: "/admin/categories" }');
    expect(routeTree).toContain("path: '/admin/categories'");
    expect(routeTree).toContain("AdminCategoriesRouteImport");
  });

  it("opens the existing server-backed import batch history directly from Data Center", () => {
    expect(dataCenter).toContain("setSection('import-history')");
    expect(dataCenter).toContain("سجل دفعات الاستيراد");
    expect(dataCenter).toContain("initialSection={section === 'import-history' ? 'history' : 'upload'}");
    expect(importEngine).toContain("fetchImportJobsPage(jobsPage)");
    expect(importEngine).toContain('id="admin-import-jobs"');
    expect(importEngine).toContain("fetchImportRowErrors");
    expect(importEngine).toContain("rollbackImportSnapshot");
  });

  it("keeps Onyx snapshot and inventory-reconciliation entry points inside Data Center", () => {
    expect(adminApp).toContain("const OnyxInventoryReconciliationWorkspace = lazy(");
    expect(dataCenter).toContain("إدارة لقطات Onyx وتحليلها");
    expect(dataCenter).toContain("<OnyxInventoryReconciliationWorkspace />");
    expect(dataCenter).toContain("{canManageImports && <OnyxInventoryReconciliationWorkspace />}");
    expect(dataRoute).not.toContain("OnyxInventoryReconciliationWorkspace");
    expect(dataRoute).toContain('<AdminApp initialView="data" />');
  });
});
