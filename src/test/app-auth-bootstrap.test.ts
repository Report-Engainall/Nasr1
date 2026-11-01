import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { Customer } from '@/lib/types';
import { synchronizeSession, type SessionSyncActions } from '@/lib/app-auth-bootstrap';

function createActions(): SessionSyncActions & {
  setSession: ReturnType<typeof vi.fn>;
  setCustomer: ReturnType<typeof vi.fn>;
  setAdmin: ReturnType<typeof vi.fn>;
  setLoading: ReturnType<typeof vi.fn>;
} {
  return {
    setSession: vi.fn(),
    setCustomer: vi.fn(),
    setAdmin: vi.fn(),
    setLoading: vi.fn(),
  };
}

describe('synchronizeSession', () => {
  it('clears customer state and ends loading for a signed-out session', async () => {
    const actions = createActions();
    const loadProfile = vi.fn();

    await synchronizeSession(null, actions, loadProfile, () => true);

    expect(actions.setSession).toHaveBeenCalledWith(null);
    expect(actions.setCustomer).toHaveBeenCalledWith(null);
    expect(actions.setAdmin).toHaveBeenCalledWith(false);
    expect(actions.setLoading).toHaveBeenCalledWith(false);
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it('hydrates the customer and administrator state for an active session', async () => {
    const actions = createActions();
    const activeSession = { user: { id: 'user-1' } } as unknown as Session;
    const customer = { id: 'customer-1' } as Customer;
    const loadProfile = vi.fn().mockResolvedValue({ customer, isAdmin: true });

    await synchronizeSession(activeSession, actions, loadProfile, () => true);

    expect(loadProfile).toHaveBeenCalledWith('user-1');
    expect(actions.setSession).toHaveBeenCalledWith(activeSession);
    expect(actions.setCustomer).toHaveBeenCalledWith(customer);
    expect(actions.setAdmin).toHaveBeenCalledWith(true);
    expect(actions.setLoading).toHaveBeenCalledWith(false);
  });

  it('does not apply an asynchronous profile after the component unmounts', async () => {
    const actions = createActions();
    const activeSession = { user: { id: 'user-2' } } as unknown as Session;
    const customer = { id: 'customer-2' } as Customer;
    let mounted = true;
    let resolveProfile: ((value: { customer: Customer; isAdmin: boolean }) => void) | undefined;
    const loadProfile = vi.fn(() => new Promise<{ customer: Customer; isAdmin: boolean }>((resolve) => {
      resolveProfile = resolve;
    }));

    const pending = synchronizeSession(activeSession, actions, loadProfile, () => mounted);
    expect(actions.setSession).toHaveBeenCalledWith(activeSession);
    mounted = false;
    resolveProfile?.({ customer, isAdmin: false });
    await pending;

    expect(actions.setCustomer).not.toHaveBeenCalled();
    expect(actions.setAdmin).not.toHaveBeenCalled();
    expect(actions.setLoading).not.toHaveBeenCalled();
  });
});
