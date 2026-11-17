// Re-exports the project-owned Supabase client with a loose schema type so the existing
// data layer (src/lib/api.ts) keeps its own hand-written contracts in src/lib/types.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as typedClient } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = typedClient as unknown as SupabaseClient<any>;

export type CurrentTenantScope = {
  profileId: string;
  organizationId: string;
  warehouseId: string | null;
  isStaff: boolean;
  canManageCustomers: boolean;
  canViewInternalProductPrices: boolean;
};

export type StorefrontDataScope = Pick<CurrentTenantScope, 'organizationId' | 'warehouseId' | 'isStaff' | 'canViewInternalProductPrices'>;

import { parseCurrentTenantScopePayload } from './tenant-scope';

let tenantScopeCache: { userId: string; pending: Promise<CurrentTenantScope> } | undefined;
let tenantScopeAuthListenerRegistered = false;

/**
 * PostgREST can briefly retain an older function cache during a schema deployment.
 * Retry this read once when it reports PGRST202; never fall back to client-supplied tenant IDs.
 */
async function fetchCurrentTenantContext() {
  let result = await supabase.rpc('get_current_tenant_context');
  if (result.error?.code === 'PGRST202') {
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    result = await supabase.rpc('get_current_tenant_context');
  }
  return result;
}

/**
 * Resolves identity scope on the server from auth.uid(); client-supplied IDs are not trusted.
 * The result is only a convenience filter. PostgreSQL RLS remains the authorization boundary.
 */
export async function getCurrentTenantScope(options: { forceRefresh?: boolean } = {}): Promise<CurrentTenantScope> {
  if (!tenantScopeAuthListenerRegistered) {
    supabase.auth.onAuthStateChange(() => {
      tenantScopeCache = undefined;
    });
    tenantScopeAuthListenerRegistered = true;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('تعذر التحقق من جلسة الحساب.');
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('يجب تسجيل الدخول لتحديد نطاق المؤسسة.');

  if (options.forceRefresh) tenantScopeCache = undefined;

  if (tenantScopeCache?.userId === userId) {
    return tenantScopeCache.pending;
  }

  const pending = (async (): Promise<CurrentTenantScope> => {
    const { data, error } = await fetchCurrentTenantContext();
    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error('تعذر تحميل نطاق المؤسسة بعد إعادة المحاولة؛ تحقق من اتصال المعاينة بمشروع Nasr1 ومن تحديث مخطط Supabase.');
      }
      throw new Error('تعذر تحميل نطاق المؤسسة من الخادم: ' + error.message);
    }

    return parseCurrentTenantScopePayload(data);

    return {
      profileId: payload.profile_id,
      organizationId: payload.organization_id,
      warehouseId: payload.warehouse_id,
      isStaff: payload.is_staff,
      canManageCustomers: payload.can_manage_customers === true,
      canViewInternalProductPrices: payload.can_view_internal_product_prices === true,
    };
  })();

  tenantScopeCache = { userId, pending };
  try {
    return await pending;
  } catch (error) {
    if (tenantScopeCache?.pending === pending) tenantScopeCache = undefined;
    throw error;
  }
}

/**
 * Resolves an authenticated tenant for operational data access only.
 * Anonymous storefront reads must use the allowlisted public-safe RPC contracts;
 * this helper deliberately refuses to return tenant or warehouse identifiers to guests.
 */
export async function getStorefrontDataScope(): Promise<StorefrontDataScope> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('تعذر التحقق من جلسة الحساب.');
  if (!sessionData.session?.user.id) {
    throw new Error('يجب استخدام واجهات المتجر العامة الآمنة بدل نطاق المؤسسة للزائر.');
  }

  const scope = await getCurrentTenantScope();
  return {
    organizationId: scope.organizationId,
    warehouseId: scope.warehouseId,
    isStaff: scope.isStaff,
    canViewInternalProductPrices: scope.canViewInternalProductPrices,
  };
}
