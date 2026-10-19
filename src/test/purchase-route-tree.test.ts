import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';

describe('generated TanStack route registration', () => {
  it('registers purchase orders and inventory transfers in the committed route tree', () => {
    const root = routeTree as unknown as {
      children: Record<string, { options?: { id?: string; path?: string } }>;
    };
    const purchaseRoute = root.children.AdminPurchaseOrdersRoute;
    expect(purchaseRoute).toBeDefined();
    expect(purchaseRoute?.options?.id).toBe('/admin_/purchase-orders');
    expect(purchaseRoute?.options?.path).toBe('/admin/purchase-orders');

    const transferRoute = root.children.AdminInventoryTransfersRoute;
    expect(transferRoute).toBeDefined();
    expect(transferRoute?.options?.id).toBe('/admin_/inventory-transfers');
    expect(transferRoute?.options?.path).toBe('/admin/inventory-transfers');
  });
});
