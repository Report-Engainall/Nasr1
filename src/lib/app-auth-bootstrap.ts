import type { Session } from '@supabase/supabase-js';
import type { Customer } from './types';

export interface SessionSyncActions {
  setSession: (session: Session | null) => void;
  setCustomer: (customer: Customer | null) => void;
  setAdmin: (isAdmin: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export type CustomerProfileLoader = (
  userId: string,
) => Promise<{ customer: Customer | null; isAdmin: boolean }>;

export async function synchronizeSession(
  session: Session | null,
  actions: SessionSyncActions,
  loadProfile: CustomerProfileLoader,
  isMounted: () => boolean,
): Promise<void> {
  if (!isMounted()) return;

  actions.setSession(session);
  if (!session?.user) {
    actions.setCustomer(null);
    actions.setAdmin(false);
    actions.setLoading(false);
    return;
  }

  const { customer, isAdmin } = await loadProfile(session.user.id);
  if (!isMounted()) return;

  actions.setCustomer(customer);
  actions.setAdmin(isAdmin);
  actions.setLoading(false);
}
