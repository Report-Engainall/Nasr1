import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getScope: vi.fn(),
  selects: [] as Array<{ columns: string; options: unknown }>,
  equals: [] as Array<[string, unknown]>,
  orders: [] as Array<{ column: string; ascending: boolean }>,
  filters: [] as string[],
  ranges: [] as Array<[number, number]>,
  responses: [] as Array<{ data: unknown[] | null; error: null | { message: string }; count: number | null }>,
  defaultResponse: { data: [] as unknown[], error: null as null | { message: string }, count: 0 as number | null },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
  getCurrentTenantScope: mocks.getScope,
}));

import { fetchCustomerDirectoryPage, normalizeCustomerDirectorySearch } from '@/lib/customer-directory';

function query() {
  const q = {
    select(columns: string, options?: unknown) { mocks.selects.push({ columns, options }); return q; },
    eq(column: string, value: unknown) { mocks.equals.push([column, value]); return q; },
    order(column: string, options: { ascending: boolean }) { mocks.orders.push({ column, ascending: options.ascending }); return q; },
    or(filter: string) { mocks.filters.push(filter); return q; },
    range(start: number, end: number) { mocks.ranges.push([start, end]); return q; },
    then<TResult1 = { data: unknown[] | null; error: null | { message: string }; count: number | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown[] | null; error: null | { message: string }; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      const next = mocks.responses.shift() ?? mocks.defaultResponse;
      return Promise.resolve(next).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };
  return q;
}

describe('customer directory query contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selects.splice(0);
    mocks.equals.splice(0);
    mocks.orders.splice(0);
    mocks.filters.splice(0);
    mocks.ranges.splice(0);
    mocks.responses.splice(0);
    mocks.defaultResponse = { data: [], error: null, count: 0 };
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('customers');
      return query();
    });
    mocks.getScope.mockResolvedValue({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      warehouseId: null,
      isStaff: true,
    });
  });

  it('uses tenant scope, explicit columns, exact count, a stable sort, and a bounded page', async () => {
    mocks.defaultResponse = { data: [{ id: 'customer-26' }], error: null, count: 51 };
    const result = await fetchCustomerDirectoryPage({ search: '  متجر النور  ', page: 2, pageSize: 25 });

    expect(result).toMatchObject({ totalCount: 51, page: 2, pageSize: 25 });
    expect(result.rows).toHaveLength(1);
    expect(mocks.equals).toContainEqual(['organization_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
    expect(mocks.selects).toEqual([{
      columns: 'id,business_name,contact_name,phone,email,customer_code,tier,current_balance,credit_limit,status,created_at',
      options: { count: 'exact' },
    }]);
    expect(mocks.orders).toEqual([
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ]);
    expect(mocks.filters).toEqual([
      'business_name.ilike.%متجر النور%,contact_name.ilike.%متجر النور%,phone.ilike.%متجر النور%,email.ilike.%متجر النور%,customer_code.ilike.%متجر النور%',
    ]);
    expect(mocks.ranges).toEqual([[25, 49]]);
  });

  it('strips PostgREST separators and wildcard syntax from untrusted search text', async () => {
    expect(normalizeCustomerDirectorySearch('متجر,)(status.eq.approved_%')).toBe('متجر status eq approved');
    await fetchCustomerDirectoryPage({ search: 'متجر,)(status.eq.approved_%' });
    expect(mocks.filters).toHaveLength(1);
    expect(mocks.filters[0].split(',')).toHaveLength(5);
    expect(mocks.filters[0]).not.toContain('.eq.approved');
  });

  it('searches contact details and preserves a validated full email query', async () => {
    await fetchCustomerDirectoryPage({ search: 'مسؤول المشتريات' });
    expect(mocks.filters[0]).toContain('contact_name.ilike.%مسؤول المشتريات%');
    expect(mocks.filters[0]).toContain('email.ilike.%مسؤول المشتريات%');

    await fetchCustomerDirectoryPage({ search: 'Buyer+Ops@example.test' });
    expect(mocks.filters[1]).toContain('email.ilike.%buyer+ops@example.test%');
    expect(mocks.filters[1]).not.toMatch(/\\),status\\.|,status\\.eq/i);
  });

  it('clamps an out-of-range page against the exact count after deletions', async () => {
    mocks.responses.push(
      { data: [], error: null, count: 25 },
      { data: [{ id: 'last-customer' }], error: null, count: 25 },
    );
    const result = await fetchCustomerDirectoryPage({ page: 2, pageSize: 25 });
    expect(mocks.ranges).toEqual([[25, 49], [0, 24]]);
    expect(result).toMatchObject({ page: 1, totalCount: 25 });
    expect(result.rows).toEqual([{ id: 'last-customer' }]);
  });

  it('fails closed when the exact count is unavailable or the query fails', async () => {
    mocks.defaultResponse = { data: [], error: null, count: null };
    await expect(fetchCustomerDirectoryPage()).rejects.toThrow('تعذر تأكيد إجمالي العملاء');
    mocks.responses.push({ data: null, error: { message: 'permission denied' }, count: null });
    await expect(fetchCustomerDirectoryPage()).rejects.toThrow('تعذر تحميل دليل العملاء: permission denied');
  });

  it('rejects non-staff sessions and malformed pagination before returning rows', async () => {
    mocks.getScope.mockResolvedValueOnce({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      warehouseId: null,
      isStaff: false,
    });
    await expect(fetchCustomerDirectoryPage()).rejects.toThrow('صلاحية موظف المؤسسة مطلوبة');
    expect(mocks.from).not.toHaveBeenCalled();
    await expect(fetchCustomerDirectoryPage({ page: 0 })).rejects.toThrow('رقم صفحة العملاء غير صالح');
    await expect(fetchCustomerDirectoryPage({ pageSize: 101 })).rejects.toThrow('حجم صفحة العملاء خارج النطاق');
  });
});
