import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getCurrentTenantScope: vi.fn(),
  calls: [] as Array<{ method: string; args: unknown[] }>,
}));

vi.mock('./supabase', () => ({
  supabase: { rpc: mocks.rpc },
  getCurrentTenantScope: mocks.getCurrentTenantScope,
}));

import { fetchAdminOrdersPage } from './api';

function createQueryBuilder() {
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    mocks.calls.push({ method, args });
    return query;
  };
  query.select = chain('select');
  query.eq = chain('eq');
  query.ilike = chain('ilike');
  query.order = chain('order');
  query.range = chain('range');
  const result = Promise.resolve({ data: [], error: null });
  query.then = result.then.bind(result) as unknown as (...args: unknown[]) => unknown;
  return query;
}

describe('fetchAdminOrdersPage server-side filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.getCurrentTenantScope.mockResolvedValue({
      organizationId: '1c4a6e80-1234-4abc-8def-1234567890ab',
      isStaff: true,
    });
    mocks.rpc.mockImplementation(() => createQueryBuilder());
  });

  it('applies exact status and order-number search before pagination', async () => {
    await fetchAdminOrdersPage({ page: 2, status: 'processing', search: ' AGH-2026-001 ' });

    expect(mocks.rpc).toHaveBeenCalledWith('fetch_staff_orders');
    expect(mocks.calls).toContainEqual({ method: 'eq', args: ['status', 'processing'] });
    expect(mocks.calls).toContainEqual({ method: 'ilike', args: ['order_number', '%AGH-2026-001%'] });
    const rangeIndex = mocks.calls.findIndex((call) => call.method === 'range');
    expect(mocks.calls.findIndex((call) => call.method === 'eq')).toBeLessThan(rangeIndex);
    expect(mocks.calls.findIndex((call) => call.method === 'ilike')).toBeLessThan(rangeIndex);
    expect(mocks.calls).toContainEqual({ method: 'range', args: [40, 80] });
  });

  it('does not add a status or search filter for the unfiltered queue', async () => {
    await fetchAdminOrdersPage({ page: 1, status: 'all', search: '   ' });

    expect(mocks.calls.some((call) => call.method === 'eq' && call.args[0] === 'status')).toBe(false);
    expect(mocks.calls.some((call) => call.method === 'ilike')).toBe(false);
    expect(mocks.calls).toContainEqual({ method: 'range', args: [0, 40] });
  });

  it('sorts by amount on the server and uses a stable created-at and id tie-break', async () => {
    await fetchAdminOrdersPage({ page: 1, sort: 'amount_high' });

    expect(mocks.calls).toContainEqual({ method: 'order', args: ['total_amount', { ascending: false }] });
    expect(mocks.calls).toContainEqual({ method: 'order', args: ['created_at', { ascending: false }] });
    expect(mocks.calls).toContainEqual({ method: 'order', args: ['id', { ascending: true }] });
    expect(mocks.calls).toContainEqual({ method: 'range', args: [0, 40] });
  });

  it('rejects unsupported sort options before requesting the order list', async () => {
    await expect(fetchAdminOrdersPage({ page: 1, sort: 'random' })).rejects.toThrow('ترتيب الطلبات');
    expect(mocks.getCurrentTenantScope).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects unsupported status filters before tenant reads or RPC calls', async () => {
    await expect(fetchAdminOrdersPage({ page: 1, status: 'unknown' })).rejects.toThrow('حالة تصفية الطلبات');
    expect(mocks.getCurrentTenantScope).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects control characters, oversized and wildcard-bearing search input', async () => {
    await expect(fetchAdminOrdersPage({ page: 1, search: 'رقم\nطلب' })).rejects.toThrow('عبارة البحث');
    await expect(fetchAdminOrdersPage({ page: 1, search: 'x'.repeat(81) })).rejects.toThrow('عبارة البحث');
    await expect(fetchAdminOrdersPage({ page: 1, search: 'AGH_%' })).rejects.toThrow('عبارة البحث');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('denies non-staff identities before listing orders', async () => {
    mocks.getCurrentTenantScope.mockResolvedValue({
      organizationId: '1c4a6e80-1234-4abc-8def-1234567890ab',
      isStaff: false,
    });
    await expect(fetchAdminOrdersPage({ page: 1, status: 'pending' })).rejects.toThrow('صلاحية الموظف');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
