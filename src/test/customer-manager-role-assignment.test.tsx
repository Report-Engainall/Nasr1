import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), onNotice: vi.fn(),
  rows: [] as Array<{ profile_id: string; full_name: string; email: string | null; is_active: boolean; roles: string[] }>,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
import { CustomerManagerRoleAssignment } from '@/components/CustomerManagerRoleAssignment';

function setup() {
  mocks.rows = [
    { profile_id: 'admin-profile', full_name: 'مدير النظام', email: 'admin@example.test', is_active: true, roles: ['admin'] },
    { profile_id: 'sales-profile', full_name: 'موظف المبيعات', email: 'sales@example.test', is_active: true, roles: ['staff'] },
    { profile_id: 'customer-profile', full_name: 'حساب عميل', email: 'customer@example.test', is_active: true, roles: ['customer'] },
    { profile_id: 'inactive-profile', full_name: 'حساب غير نشط', email: 'inactive@example.test', is_active: false, roles: ['staff'] },
  ];
  mocks.rpc.mockImplementation(async (name: string, args?: { p_profile_id?: string; p_roles?: string[] }) => {
    if (name === 'list_organization_user_roles') return { data: mocks.rows, error: null };
    if (name === 'set_organization_user_roles') {
      const row = mocks.rows.find((item) => item.profile_id === args?.p_profile_id);
      if (!row) return { data: null, error: { message: 'profile not found' } };
      row.roles = [...(args?.p_roles ?? [])];
      return { data: { profile_id: row.profile_id, roles: row.roles }, error: null };
    }
    return { data: null, error: { message: 'unexpected RPC' } };
  });
}
describe('customer-manager role assignment', () => {
  let root: Root | undefined; let host: HTMLDivElement | undefined;
  beforeEach(() => {
    mocks.rpc.mockReset(); mocks.onNotice.mockReset(); setup();
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => {
    if (root) { await act(async () => root?.unmount()); root = undefined; }
    host?.remove(); host = undefined;
  });

  it('assigns through RPC and reports success only after matching server confirmation', async () => {
    await act(async () => {
      root?.render(<CustomerManagerRoleAssignment currentProfileId="admin-profile" onNotice={mocks.onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain('موظف المبيعات');
    expect(host?.textContent).not.toContain('حساب غير نشط');
    expect(host?.querySelector<HTMLButtonElement>('button[aria-label="إسناد مسؤول العملاء إلى مدير النظام"]')?.disabled).toBe(true);
    expect(host?.querySelector<HTMLButtonElement>('button[aria-label="إسناد مسؤول العملاء إلى حساب عميل"]')?.disabled).toBe(true);
    await act(async () => {
      host?.querySelector<HTMLButtonElement>('button[aria-label="إسناد مسؤول العملاء إلى موظف المبيعات"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.rpc).toHaveBeenCalledWith('set_organization_user_roles', {
      p_profile_id: 'sales-profile', p_roles: ['customer_manager', 'staff'],
    });
    expect(mocks.onNotice).toHaveBeenCalledWith(expect.stringContaining('تم إسناد دور مسؤول العملاء'));
  });

  it('requires an explicit replacement on removal and never reports an RPC failure as success', async () => {
    mocks.rows = [
      { profile_id: 'admin-profile', full_name: 'مدير النظام', email: 'admin@example.test', is_active: true, roles: ['admin'] },
      { profile_id: 'manager-profile', full_name: 'مسؤول العملاء', email: 'manager@example.test', is_active: true, roles: ['customer_manager'] },
    ];
    mocks.rpc.mockImplementation(async (name: string) => name === 'list_organization_user_roles'
      ? { data: mocks.rows, error: null } : { data: null, error: { message: 'network rejected' } });
    await act(async () => {
      root?.render(<CustomerManagerRoleAssignment currentProfileId="admin-profile" onNotice={mocks.onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const button = host?.querySelector<HTMLButtonElement>('button[aria-label="إزالة دور مسؤول العملاء من مسؤول العملاء"]');
    expect(button?.disabled).toBe(true);
    const select = host?.querySelector<HTMLSelectElement>('select[aria-label="الدور البديل بعد إزالة مسؤول العملاء من مسؤول العملاء"]');
    expect(select).toBeTruthy();
    await act(async () => {
      if (select) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'staff');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    expect(button?.disabled).toBe(false);
    await act(async () => { button?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mocks.rpc).toHaveBeenCalledWith('set_organization_user_roles', {
      p_profile_id: 'manager-profile', p_roles: ['staff'],
    });
    expect(mocks.onNotice).not.toHaveBeenCalled();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain('رفض الخادم تغيير الأدوار');
  });
});
