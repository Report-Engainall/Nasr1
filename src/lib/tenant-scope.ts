import type { CurrentTenantScope } from './supabase';

type TenantScopePayload = {
  profile_id?: unknown;
  organization_id?: unknown;
  warehouse_id?: unknown;
  is_staff?: unknown;
  can_manage_customers?: unknown;
  can_view_internal_product_prices?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Accepts the pre-capability-registry tenant RPC contract without inventing grants.
 * Missing capability metadata always resolves to false; malformed supplied metadata
 * and invalid identity scope still fail closed.
 */
export function parseCurrentTenantScopePayload(data: unknown): CurrentTenantScope {
  const payload = data as TenantScopePayload | null;
  if (
    !payload ||
    !isUuid(payload.profile_id) ||
    !isUuid(payload.organization_id) ||
    (payload.warehouse_id !== null && !isUuid(payload.warehouse_id)) ||
    typeof payload.is_staff !== 'boolean' ||
    (payload.can_manage_customers !== undefined && typeof payload.can_manage_customers !== 'boolean') ||
    (payload.can_view_internal_product_prices !== undefined &&
      typeof payload.can_view_internal_product_prices !== 'boolean') ||
    (payload.can_view_internal_product_prices === true && payload.is_staff !== true)
  ) {
    throw new Error('أعاد الخادم نطاق مؤسسة غير صالح؛ تم إيقاف العملية لحماية البيانات.');
  }

  return {
    profileId: payload.profile_id,
    organizationId: payload.organization_id,
    warehouseId: payload.warehouse_id,
    isStaff: payload.is_staff,
    canManageCustomers: payload.can_manage_customers === true,
    // The older live RPC does not publish this capability. Never infer it from a role.
    canViewInternalProductPrices: payload.can_view_internal_product_prices === true,
  };
}
