import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getScope: vi.fn(),
  tables: [] as string[],
  updates: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, unknown]>,
  selectColumns: [] as string[],
  responses: [] as Array<{ data: unknown; error: unknown }>,
  defaultResponse: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
  getCurrentTenantScope: mocks.getScope,
  getStorefrontDataScope: vi.fn(),
}));

import { updateCustomerStatus } from '@/lib/api';

const CUSTOMER_ID = 'c1111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeQuery() {
  const q = {
    update(payload: Record<string, unknown>) { mocks.updates.push(payload); return q; },
    eq(column: string, value: unknown) { mocks.filters.push([column, value]); return q; },
    select(columns: string) { mocks.selectColumns.push(columns); return q; },
    then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      const value = mocks.responses.shift() ?? mocks.defaultResponse;
      return Promise.resolve(value).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };
  return q;
}

describe('customer status mutation safety contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tables.splice(0); mocks.updates.splice(0); mocks.filters.splice(0);
    mocks.selectColumns.splice(0); mocks.responses.splice(0);
    mocks.defaultResponse = { data: [{ id: CUSTOMER_ID }], error: null };
    mocks.getScope.mockResolvedValue({
      profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organizationId: ORGANIZATION_ID,
      warehouseId: null,
      isStaff: true,
    });
    mocks.from.mockImplementation((table: string) => {
      mocks.tables.push(table);
      return makeQuery();
    });
  });

  it('scopes the mutation to the resolved organization and confirms the changed row', async () => {
    await expect(updateCustomerStatus(CUSTOMER_ID, 'approved')).resolves.toBeUndefined();
    expect(mocks.tables).toEqual(['customers']);
    expect(mocks.filters).toEqual([['id', CUSTOMER_ID], ['organization_id', ORGANIZATION_ID]]);
    expect(mocks.selectColumns).toEqual(['id']);
    expect(mocks.updates[0]).toMatchObject({ status: 'approved' });
    expect(new Date(String(mocks.updates[0].approved_at)).toString()).not.toBe('Invalid Date');
  });

  it('fails closed if a stale, denied, or unmatched customer ID affects no matching row', async () => {
    mocks.responses.push({ data: [], error: null });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'approved')).rejects.toThrow('لم يؤكد الخادم تحديث حالة العميل');
    mocks.responses.push({ data: [{ id: 'd2222222-2222-4222-8222-222222222222' }], error: null });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'approved')).rejects.toThrow('لم يؤكد الخادم تحديث حالة العميل');
  });

  it('rejects non-staff or missing organization scope before issuing a write', async () => {
    mocks.getScope.mockResolvedValueOnce({ profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', organizationId: ORGANIZATION_ID, warehouseId: null, isStaff: false });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'approved')).rejects.toThrow('صلاحية إدارة العملاء');
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.getScope.mockResolvedValueOnce({ profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', organizationId: '', warehouseId: null, isStaff: true });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'approved')).rejects.toThrow('صلاحية إدارة العملاء');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects empty identifiers and status values before resolving scope', async () => {
    await expect(updateCustomerStatus('  ', 'approved')).rejects.toThrow('هوية العميل غير صالحة');
    await expect(updateCustomerStatus(CUSTOMER_ID, '  ')).rejects.toThrow('حالة العميل غير صالحة');
    expect(mocks.getScope).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('preserves database write failures', async () => {
    mocks.responses.push({ data: null, error: new Error('permission denied') });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'approved')).rejects.toThrow('permission denied');
  });
});
