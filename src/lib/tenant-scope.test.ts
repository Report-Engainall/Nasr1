import { describe, expect, it } from 'vitest';
import { parseCurrentTenantScopePayload } from './tenant-scope';

const base = {
  profile_id: '00000000-0000-4000-8000-000000000001',
  organization_id: '00000000-0000-4000-8000-000000000002',
  warehouse_id: null,
  is_staff: true,
  can_manage_customers: true,
};

describe('parseCurrentTenantScopePayload', () => {
  it('accepts the live legacy tenant contract and defaults missing sensitive capability to denied', () => {
    expect(parseCurrentTenantScopePayload(base)).toEqual({
      profileId: base.profile_id,
      organizationId: base.organization_id,
      warehouseId: null,
      isStaff: true,
      canManageCustomers: true,
      canViewInternalProductPrices: false,
    });
  });

  it('preserves an explicit server-authorized internal-price capability', () => {
    expect(parseCurrentTenantScopePayload({
      ...base,
      can_view_internal_product_prices: true,
    }).canViewInternalProductPrices).toBe(true);
  });

  it('keeps missing optional customer-management metadata denied', () => {
    const legacy = {
      profile_id: base.profile_id,
      organization_id: base.organization_id,
      warehouse_id: base.warehouse_id,
      is_staff: base.is_staff,
    };
    expect(parseCurrentTenantScopePayload(legacy).canManageCustomers).toBe(false);
  });

  it('rejects malformed identity and organization identifiers', () => {
    expect(() => parseCurrentTenantScopePayload({ ...base, organization_id: 'not-a-uuid' }))
      .toThrow('نطاق مؤسسة غير صالح');
    expect(() => parseCurrentTenantScopePayload({ ...base, profile_id: null }))
      .toThrow('نطاق مؤسسة غير صالح');
  });

  it('rejects malformed capability metadata rather than silently coercing it', () => {
    expect(() => parseCurrentTenantScopePayload({
      ...base,
      can_view_internal_product_prices: 'true',
    })).toThrow('نطاق مؤسسة غير صالح');
  });

  it('rejects an internal-price grant without a staff identity', () => {
    expect(() => parseCurrentTenantScopePayload({
      ...base,
      is_staff: false,
      can_view_internal_product_prices: true,
    })).toThrow('نطاق مؤسسة غير صالح');
  });

  it('accepts a null warehouse but rejects a malformed non-null warehouse', () => {
    expect(parseCurrentTenantScopePayload(base).warehouseId).toBeNull();
    expect(() => parseCurrentTenantScopePayload({
      ...base,
      warehouse_id: 'warehouse',
    })).toThrow('نطاق مؤسسة غير صالح');
  });
});
