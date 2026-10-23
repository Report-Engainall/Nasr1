import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  useAuth: vi.fn(),
  fetchSettings: vi.fn(),
  updateSetting: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, fetchSettings: mocks.fetchSettings, updateSetting: mocks.updateSetting };
});
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, useAuth: mocks.useAuth };
});
vi.mock('@/lib/useFetch', () => ({
  useFetch: () => ({ data: [], loading: false, error: null, refetch: mocks.refetch }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
  getCurrentTenantScope: vi.fn(),
  getStorefrontDataScope: vi.fn(),
}));

import { SettingsPage } from '@/components/AdminPages';

const profiles = [
  { profile_id: 'admin-profile', full_name: 'مدير النظام', email: 'admin@example.test', is_active: true, roles: ['admin'] },
  { profile_id: 'staff-profile', full_name: 'موظف المبيعات', email: 'sales@example.test', is_active: true, roles: ['staff'] },
  { profile_id: 'customer-profile', full_name: 'حساب عميل', email: 'customer@example.test', is_active: true, roles: ['customer'] },
];

describe('customer-manager role assignment is reachable from admin settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { profileId: 'admin-profile', roles: ['admin'] },
    });
    mocks.fetchSettings.mockResolvedValue([]);
    mocks.updateSetting.mockResolvedValue(undefined);
    mocks.refetch.mockResolvedValue(undefined);
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_user_roles') return { data: profiles, error: null };
      return { data: null, error: { message: 'unexpected RPC' } };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts the customer-manager assignment panel on the real access-settings tab and retains its server RPC boundary', async () => {
    render(<SettingsPage onNotice={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'المستخدمون والصلاحيات' }));

    expect(await screen.findByRole('heading', { name: 'إسناد وإدارة دور مسؤول العملاء' })).toBeTruthy();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('list_organization_user_roles'));

    const staffButton = await screen.findByRole('button', { name: 'إسناد مسؤول العملاء إلى موظف المبيعات' });
    const selfButton = screen.getByRole('button', { name: 'إسناد مسؤول العملاء إلى مدير النظام' });
    const customerButton = screen.getByRole('button', { name: 'إسناد مسؤول العملاء إلى حساب عميل' });

    expect(staffButton.disabled).toBe(false);
    expect(selfButton.disabled).toBe(true);
    expect(customerButton.disabled).toBe(true);
  });

  it('does not expose or mount role management for non-admin roles, including customer_manager', () => {
    mocks.useAuth.mockReturnValue({
      user: { profileId: 'manager-profile', roles: ['customer_manager'] },
    });
    render(<SettingsPage onNotice={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'المستخدمون والصلاحيات' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'إسناد وإدارة دور مسؤول العملاء' })).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
