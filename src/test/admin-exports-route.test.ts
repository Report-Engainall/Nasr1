import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tree = readFileSync(join(process.cwd(), 'src/routeTree.gen.ts'), 'utf8');

const adminScreens: Array<{ name: string; id: string; path: string }> = [
  { name: 'AdminRoute', id: '/admin', path: '/admin' },
  { name: 'AdminProductsRoute', id: '/admin_/products', path: '/admin/products' },
  { name: 'AdminCustomersRoute', id: '/admin_/customers', path: '/admin/customers' },
  { name: 'AdminOrdersRoute', id: '/admin_/orders', path: '/admin/orders' },
  { name: 'AdminPricingRoute', id: '/admin_/pricing', path: '/admin/pricing' },
  { name: 'AdminOffersRoute', id: '/admin_/offers', path: '/admin/offers' },
  { name: 'AdminReportsRoute', id: '/admin_/reports', path: '/admin/reports' },
  { name: 'AdminDataRoute', id: '/admin_/data', path: '/admin/data' },
  { name: 'AdminOperationsRoute', id: '/admin_/operations', path: '/admin/operations' },
  { name: 'AdminNotificationsRoute', id: '/admin_/notifications', path: '/admin/notifications' },
  { name: 'AdminAiRoute', id: '/admin_/ai', path: '/admin/ai' },
  { name: 'AdminSuppliersRoute', id: '/admin_/suppliers', path: '/admin/suppliers' },
  { name: 'AdminDevicesRoute', id: '/admin_/devices', path: '/admin/devices' },
  { name: 'AdminSettingsRoute', id: '/admin_/settings', path: '/admin/settings' },
  { name: 'AdminQuotesRoute', id: '/admin_/quotes', path: '/admin/quotes' },
  { name: 'AdminFinanceRoute', id: '/admin_/finance', path: '/admin/finance' },
  { name: 'AdminTasksRoute', id: '/admin_/tasks', path: '/admin/tasks' },
  { name: 'AdminAuditRoute', id: '/admin_/audit', path: '/admin/audit' },
  { name: 'AdminStockCountRoute', id: '/admin_/stock-count', path: '/admin/stock-count' },
  { name: 'AdminInventoryTransfersRoute', id: '/admin_/inventory-transfers', path: '/admin/inventory-transfers' },
  { name: 'AdminPurchaseOrdersRoute', id: '/admin_/purchase-orders', path: '/admin/purchase-orders' },
  { name: 'AdminExportsRoute', id: '/admin_/exports', path: '/admin/exports' },
];

describe('admin screen route registration', () => {
  it.each(adminScreens)('$name is imported, mapped to the intended URL, and attached to the root tree', ({ name, id, path }) => {
    expect(tree).toContain('const ' + name + ' = ' + name + 'Import.update({');
    expect(tree).toContain("id: '" + id + "'");
    expect(tree).toContain("path: '" + path + "'");
    expect(tree).toContain(name + ': ' + name + ',');
  });

  it('exposes the export deep link in route type maps and preserves the existing export page source', () => {
    expect(tree).toContain("import { Route as AdminExportsRouteImport } from './routes/admin_.exports'");
    expect(tree).toContain("'/admin/exports': typeof AdminExportsRoute");
    expect(tree).toContain("'/admin_/exports': typeof AdminExportsRoute");
    expect(tree).toContain("'/admin_/exports': {");
    expect(tree).toContain('preLoaderRoute: typeof AdminExportsRouteImport');
  });
});
