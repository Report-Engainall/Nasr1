import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';

describe('generated TanStack route registration', () => {
  it('registers the purchase-orders route in the committed route tree', () => {
    const children = (routeTree as unknown as {
      children: Record<string, { id: string }>;
    }).children;

    expect(children.AdminPurchaseOrdersRoute).toBeDefined();
    expect(children.AdminPurchaseOrdersRoute.id).toBe('/admin_/purchase-orders');
  });
});
