import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';

describe('admin export route registration', () => {
  it('registers the existing async export screen at the deep-link path', () => {
    const children = (routeTree as unknown as {
      children?: Record<string, { options?: { path?: string } }>;
    }).children;

    expect(children?.AdminExportsRoute).toBeDefined();
    expect(children?.AdminExportsRoute.options?.path).toBe('/admin/exports');
  });
});
