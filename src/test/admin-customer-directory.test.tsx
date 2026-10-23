import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  updateCustomerStatus: vi.fn(),
  updateCustomerTier: vi.fn(),
  createCustomer: vi.fn(),
}));

vi.mock('@/lib/customer-directory', () => ({ fetchCustomerDirectoryPage: mocks.fetchPage }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { roles: ['admin', 'manager'], isStaff: true } }) }));
vi.mock('@/lib/api', () => ({
  createCustomer: mocks.createCustomer,
  createProduct: vi.fn(), createPricingRule: vi.fn(), deletePricingRule: vi.fn(), deleteProduct: vi.fn(),
  fetchAiAlerts: vi.fn(), fetchActiveInventoryWarehouses: vi.fn(), fetchInventoryReorderPoint: vi.fn(),
  fetchCategories: vi.fn(), fetchCustomers: vi.fn(), fetchDashboardStats: vi.fn(), fetchOrders: vi.fn(),
  fetchPricingRules: vi.fn(), fetchProducts: vi.fn(), setInventoryReorderPoint: vi.fn(),
  togglePricingRule: vi.fn(), transferInventory: vi.fn(), updateCustomerStatus: mocks.updateCustomerStatus,
  updateCustomerTier: mocks.updateCustomerTier,
  updatePricingRule: vi.fn(), updateProduct: vi.fn(), uploadProductImage: vi.fn(), approvePricingRule: vi.fn(),
  previewCustomerTierPrice: vi.fn(),
}));
vi.mock('@/components/AdminCustomer360', () => ({ AdminCustomer360: () => null }));
vi.mock('@/components/CustomerActivationInvitationDialog', () => ({ CustomerActivationInvitationDialog: () => null }));

import { Customers } from '@/components/AghbariApp';

function customer(index: number) {
  return {
    id: `customer-${index}`, business_name: `متجر ${index}`, contact_name: 'مسؤول',
    phone: `777000${String(index).padStart(3, '0')}`, email: null, customer_code: `CUST-${index}`,
    tier: 'retail', current_balance: 0, credit_limit: 0, status: 'approved', created_at: '2026-10-23T00:00:00Z',
  } as never;
}

describe('admin customer directory paging', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    mocks.fetchPage.mockReset();
    mocks.updateCustomerStatus.mockReset();
    mocks.updateCustomerTier.mockReset();
    mocks.createCustomer.mockReset();
    mocks.fetchPage.mockImplementation(async ({ search, page, pageSize }: { search: string; page: number; pageSize: number }) => {
      const all = Array.from({ length: 30 }, (_, index) => customer(index + 1));
      const filtered = search ? [customer(7)] : all;
      const totalCount = filtered.length;
      const start = (page - 1) * pageSize;
      return { rows: filtered.slice(start, start + pageSize), totalCount, page: Math.min(page, Math.max(1, Math.ceil(totalCount / pageSize))), pageSize };
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  it('shows the exact count and only the requested 25-row page', async () => {
    await act(async () => {
      root?.render(<Customers onNotice={vi.fn()} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain('متجر 1');
    expect(host?.textContent).toContain('متجر 25');
    expect(host?.textContent).not.toContain('متجر 26');
    expect(host?.querySelector('[aria-label="إجمالي نتائج دليل العملاء"]')?.textContent).toContain('٣٠');

    await act(async () => {
      host?.querySelector<HTMLButtonElement>('button[aria-label="صفحة العملاء التالية"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.fetchPage).toHaveBeenLastCalledWith({ search: '', page: 2, pageSize: 25 });
    expect(host?.textContent).toContain('متجر 26');
    expect(host?.textContent).toContain('متجر 30');
    expect(host?.textContent).not.toContain('متجر 1');

    await act(async () => {
      host?.querySelector<HTMLButtonElement>('button[aria-label="صفحة العملاء السابقة"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.fetchPage).toHaveBeenLastCalledWith({ search: '', page: 1, pageSize: 25 });
  });
  it('requires a reason, submits the audited tier change, and refreshes the directory', async () => {
    const onNotice = vi.fn();
    mocks.updateCustomerTier.mockResolvedValue({ customer_id: 'customer-1', previous_tier: 'retail', tier: 'wholesale', changed: true });
    await act(async () => {
      root?.render(<Customers onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const tierButton = [...(host?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .find((button) => button.textContent?.includes('تغيير الشريحة') && !button.disabled);
    expect(tierButton).toBeTruthy();
    await act(async () => { tierButton?.click(); });
    const tierSelect = host?.querySelector<HTMLSelectElement>('select[aria-label="شريحة العميل الجديدة"]');
    const reasonInput = host?.querySelector<HTMLTextAreaElement>('textarea[aria-label="سبب تغيير الشريحة"]');
    const saveButton = [...(host?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .find((button) => button.textContent?.includes('حفظ تغيير الشريحة'));
    expect(tierSelect).toBeTruthy();
    expect(reasonInput).toBeTruthy();
    expect(saveButton?.disabled).toBe(true);
    await act(async () => {
      if (tierSelect) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(tierSelect, 'wholesale');
        tierSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (reasonInput) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(reasonInput, 'تحديث حسب حجم المشتريات');
        reasonInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    expect(saveButton?.disabled).toBe(false);
    await act(async () => { saveButton?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mocks.updateCustomerTier).toHaveBeenCalledWith('customer-1', 'retail', 'wholesale', 'تحديث حسب حجم المشتريات');
    expect(mocks.fetchPage).toHaveBeenCalledTimes(2);
    expect(onNotice).toHaveBeenCalledWith('تم تحديث شريحة العميل وتسجيل السبب في سجل التدقيق.');
    expect(host?.textContent).not.toContain('حفظ تغيير الشريحة');
  });

});
