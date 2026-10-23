import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentTenantScope: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getCurrentTenantScope: mocks.getCurrentTenantScope,
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import { fetchCustomerDirectoryPage } from '@/lib/customer-directory';

const ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const CUSTOMER_ID = 'c1111111-1111-4111-8111-111111111111';

const safeCustomer = {
  id: CUSTOMER_ID,
  business_name: 'شركة اختبار تركيبية',
  contact_name: 'مستخدم اختبار',
  phone: '+967700000001',
  email: 'customer@example.test',
  customer_code: 'TEST-001',
  tier: 'wholesale',
  status: 'approved',
  created_at: '2026-10-23T10:00:00.000Z',
  // Deliberately hostile extra columns: the manager projection must remove them even if
  // a future RPC/migration accidentally returns them.
  current_balance: 84500,
  credit_limit: 120000,
  cost_price: 400,
  bank_account: 'SYNTHETIC-SHOULD-NEVER-LEAK',
};

function rpcPage(rows: unknown[]) {
  return {
    rows,
    total_count: rows.length,
    page: 1,
    page_size: 25,
  };
}

describe('customer-manager directory financial privacy boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentTenantScope.mockResolvedValue({
      profileId: 'f1111111-1111-4111-8111-111111111111',
      organizationId: ORG_ID,
      warehouseId: null,
      isStaff: false,
      canManageCustomers: true,
    });
    mocks.rpc.mockResolvedValue({ data: rpcPage([safeCustomer]), error: null });
  });

  it('uses the tenant-authorized projection RPC and strips every unknown/financial field before returning rows', async () => {
    const page = await fetchCustomerDirectoryPage({ search: '@example.test', page: 1, pageSize: 25 });

    expect(mocks.rpc).toHaveBeenCalledWith('fetch_customer_manager_directory', {
      p_search: '@example.test',
      p_page: 1,
      p_page_size: 25,
    });
    expect(mocks.from).not.toHaveBeenCalled();

    const row = page.rows[0] as unknown as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual([
      'business_name',
      'contact_name',
      'created_at',
      'customer_code',
      'email',
      'id',
      'phone',
      'status',
      'tier',
    ]);
    expect(row).toMatchObject({
      id: CUSTOMER_ID,
      business_name: 'شركة اختبار تركيبية',
      tier: 'wholesale',
      status: 'approved',
    });
    for (const forbidden of ['current_balance', 'credit_limit', 'cost_price', 'bank_account']) {
      expect(row).not.toHaveProperty(forbidden);
      expect(JSON.stringify(row)).not.toContain(forbidden);
    }
  });

  it('fails closed on RPC denial and never falls back to direct customers-table access', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied' },
    });

    await expect(fetchCustomerDirectoryPage()).rejects.toThrow(
      'تعذر تحميل دليل العملاء: permission denied',
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects malformed rows instead of dropping required fields or returning an unverified object', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: rpcPage([{ id: CUSTOMER_ID, business_name: 'سجل غير مكتمل', current_balance: 0 }]),
      error: null,
    });

    await expect(fetchCustomerDirectoryPage()).rejects.toThrow(
      'أعاد الخادم سجلات غير صالحة لدليل العملاء.',
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
