import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';

const adminScreens: Record<string, string> = {
  AdminRoute: '/admin',
  AdminProductsRoute: '/admin/products',
  AdminCustomersRoute: '/admin/customers',
  AdminOrdersRoute: '/admin/orders',
  AdminPricingRoute: '/admin/pricing',
  AdminOffersRoute: '/admin/offers',
  AdminReportsRoute: '/admin/reports',
  AdminDataRoute: '/admin/data',
  AdminOperationsRoute: '/admin/operations',
  AdminNotificationsRoute: '/admin/notifications',
  AdminAiRoute: '/admin/ai',
  AdminSuppliersRoute: '/admin/suppliers',
  AdminDevicesRoute: '/admin/devices',
  AdminSettingsRoute: '/admin/settings',
  AdminQuotesRoute: '/admin/quotes',
  AdminFinanceRoute: '/admin/finance',
  AdminTasksRoute: '/admin/tasks',
  AdminAuditRoute: '/admin/audit',
  AdminStockCountRoute: '/admin/stock-count',
  AdminInventoryTransfersRoute: '/admin/inventory-transfers',
  AdminPurchaseOrdersRoute: '/admin/purchase-orders',
  AdminExportsRoute: '/admin/exports',
};

describe('admin screen route registration', () => {
  it.each(Object.entries(adminScreens))('registers %s at its deep-link path', (routeName, path) => {
    const children = (routeTree as unknown as {
      children?: Record<string, { options?: { path?: string } }>;
    }).children;

    expect(children?.[routeName], routeName + ' must be registered in the route tree').toBeDefined();
    expect(children?.[routeName]?.options?.path).toBe(path);
  });
});
