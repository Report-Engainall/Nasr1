import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
  getCurrentTenantScope: vi.fn(),
  getStorefrontDataScope: vi.fn(),
}));

import { updateCustomerStatus } from '@/lib/api';

const CUSTOMER_ID = 'c1111111-1111-4111-8111-111111111111';

describe('audited customer lifecycle command contract', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({
      data: { customer_id: CUSTOMER_ID, previous_status: 'pending', status: 'approved', changed: true },
      error: null,
    });
  });

  it('sends normalized expected status, destination and reason to the audited tenant RPC', async () => {
    await expect(updateCustomerStatus(CUSTOMER_ID, ' pending ', ' approved ', '  مراجعة مستندات العميل  ')).resolves.toEqual({
      customer_id: CUSTOMER_ID, previous_status: 'pending', status: 'approved', changed: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('set_admin_customer_status', {
      p_customer_id: CUSTOMER_ID,
      p_expected_status: 'pending',
      p_status: 'approved',
      p_reason: 'مراجعة مستندات العميل',
    });
  });

  it('validates UUID, expected status, destination command and reason before contacting the server', async () => {
    await expect(updateCustomerStatus('customer-1', 'pending', 'approved', 'سبب صالح')).rejects.toThrow('معرّف العميل غير صالح');
    await expect(updateCustomerStatus(CUSTOMER_ID, 'unknown', 'approved', 'سبب صالح')).rejects.toThrow('انتقال حالة العميل غير صالح');
    await expect(updateCustomerStatus(CUSTOMER_ID, 'pending', 'deleted', 'سبب صالح')).rejects.toThrow('انتقال حالة العميل غير صالح');
    await expect(updateCustomerStatus(CUSTOMER_ID, 'pending', 'approved', '  ')).rejects.toThrow('سبب تغيير الحالة مطلوب');
    await expect(updateCustomerStatus(CUSTOMER_ID, 'pending', 'approved', 'xx')).rejects.toThrow('سبب تغيير الحالة مطلوب');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('accepts server-computed archive restoration and rejects an unconfirmed restore target', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { customer_id: CUSTOMER_ID, previous_status: 'archived', status: 'frozen', changed: true },
      error: null,
    });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'archived', 'restore', 'استرجاع الحالة السابقة')).resolves.toMatchObject({ status: 'frozen' });
    expect(mocks.rpc).toHaveBeenCalledWith('set_admin_customer_status', {
      p_customer_id: CUSTOMER_ID, p_expected_status: 'archived', p_status: 'restore', p_reason: 'استرجاع الحالة السابقة',
    });

    mocks.rpc.mockResolvedValueOnce({
      data: { customer_id: CUSTOMER_ID, previous_status: 'archived', status: 'archived', changed: true },
      error: null,
    });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'archived', 'restore', 'استرجاع الحالة السابقة')).rejects.toThrow('لم يؤكد الخادم تحديث حالة العميل');
  });

  it('surfaces server permission/concurrency failures and rejects malformed acknowledgements', async () => {
    const failure = { message: 'customer status changed since directory loaded' };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: failure });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'pending', 'approved', 'سبب صحيح')).rejects.toEqual(failure);

    mocks.rpc.mockResolvedValueOnce({
      data: { customer_id: 'd2222222-2222-4222-8222-222222222222', previous_status: 'pending', status: 'approved', changed: true },
      error: null,
    });
    await expect(updateCustomerStatus(CUSTOMER_ID, 'pending', 'approved', 'سبب صحيح')).rejects.toThrow('لم يؤكد الخادم تحديث حالة العميل');
  });
});
