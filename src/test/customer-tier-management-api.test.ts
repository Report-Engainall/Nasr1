import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({
  supabase:{rpc:mocks.rpc},getCurrentTenantScope:vi.fn(),getStorefrontDataScope:vi.fn(),
}));
import { updateCustomerTier } from '@/lib/api';
const customerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('admin customer tier command client contract',()=>{
  beforeEach(()=>mocks.rpc.mockReset());
  it('calls the audited RPC with normalized expected tier and reason',async()=>{
    const result={customer_id:customerId,previous_tier:'retail',tier:'wholesale',changed:true};
    mocks.rpc.mockResolvedValue({data:result,error:null});
    await expect(updateCustomerTier(customerId,' retail ','wholesale','  تصنيف تجاري جديد  ')).resolves.toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledWith('set_admin_customer_tier',{
      p_customer_id:customerId,p_expected_tier:'retail',p_tier:'wholesale',p_reason:'تصنيف تجاري جديد',
    });
  });
  it('rejects malformed IDs, unsupported tiers, and missing reasons without RPC',async()=>{
    await expect(updateCustomerTier('not-a-uuid','retail','vip','سبب صحيح')).rejects.toThrow('معرّف العميل غير صالح');
    await expect(updateCustomerTier(customerId,'retail','discount','سبب صحيح')).rejects.toThrow('شريحة العميل غير صالحة');
    await expect(updateCustomerTier(customerId,'retail','vip','  ')).rejects.toThrow('سبب تغيير الشريحة مطلوب');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('surfaces RPC failure and rejects an unconfirmed response',async()=>{
    const failure={message:'permission denied'};
    mocks.rpc.mockResolvedValueOnce({data:null,error:failure});
    await expect(updateCustomerTier(customerId,'retail','vip','سبب صحيح')).rejects.toEqual(failure);
    mocks.rpc.mockResolvedValueOnce({data:{customer_id:customerId,tier:'vip',changed:true},error:null});
    await expect(updateCustomerTier(customerId,'retail','vip','سبب صحيح')).rejects.toThrow('لم يؤكد الخادم');
  });
});
