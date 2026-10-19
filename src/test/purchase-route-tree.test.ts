import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';

describe('generated TanStack route registration', () => {
  it('registers the purchase-orders route in the committed route tree', () => {
    const root = routeTree as unknown as {
      children: Record<string, { id: string; options?: { path?: string } }>;
    };
    const route = Object.values(root.children).find((candidate) =>
      candidate.id === '/admin_/purchase-orders',
    );

    expect(route).toBeDefined();
    expect(route?.id).toBe('/admin_/purchase-orders');
    expect(route?.options?.path).toBe('/admin/purchase-orders');
  });
});
