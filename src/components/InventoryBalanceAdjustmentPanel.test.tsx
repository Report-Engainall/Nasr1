// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryBalanceAdjustmentPanel } from './InventoryBalanceAdjustmentPanel';
import { adjustInventoryBalance, fetchInventoryAdjustmentBalances } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  adjustInventoryBalance: vi.fn(),
  fetchInventoryAdjustmentBalances: vi.fn(),
}));

const initialBalance = {
  product_id: '44444444-4444-4444-8444-444444444444',
  item_code: 'SKU-001',
  product_name: 'أرز 10 كجم',
  unit: 'كيس',
  warehouse_id: '55555555-5555-4555-8555-555555555555',
  quantity_on_hand: 100,
  quantity_reserved: 15,
  quantity_available: 85,
  last_movement_at: null,
  updated_at: '2026-11-16T00:00:00Z',
};

const successfulAdjustment = {
  adjustment_id: '66666666-6666-4666-8666-666666666666',
  product_id: initialBalance.product_id,
  warehouse_id: initialBalance.warehouse_id,
  previous_quantity_on_hand: 100,
  new_quantity_on_hand: 125,
  quantity_delta: 25,
  reserved_quantity: 15,
  quantity_available_after: 110,
  idempotent_replay: false,
};

beforeEach(() => {
  vi.mocked(fetchInventoryAdjustmentBalances).mockResolvedValue([initialBalance]);
  vi.mocked(adjustInventoryBalance).mockResolvedValue(successfulAdjustment);
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('InventoryBalanceAdjustmentPanel', () => {
  it('loads server balances and submits an explicitly confirmed single-item adjustment', async () => {
    render(<InventoryBalanceAdjustmentPanel warehouseId={initialBalance.warehouse_id} warehouseName="المستودع الرئيسي" />);
    await screen.findByRole('option', { name: 'SKU-001 — أرز 10 كجم' });

    fireEvent.change(screen.getByLabelText('الرصيد الجديد للصنف أرز 10 كجم'), { target: { value: '125' } });
    fireEvent.change(screen.getByLabelText('سبب التسوية'), { target: { value: 'نتيجة عدّ مستقل' } });
    fireEvent.change(screen.getByLabelText('مرجع التسوية'), { target: { value: 'محضر-INV-1' } });
    fireEvent.change(screen.getByLabelText('ملاحظات التسوية'), { target: { value: 'تصحيح رصيد صنف منفرد' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد زيادة الرصيد' }));

    await waitFor(() => expect(adjustInventoryBalance).toHaveBeenCalledTimes(1));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(adjustInventoryBalance).toHaveBeenCalledWith(expect.objectContaining({
      productId: initialBalance.product_id,
      warehouseId: initialBalance.warehouse_id,
      expectedQuantity: 100,
      newQuantity: 125,
      reason: 'نتيجة عدّ مستقل',
      reference: 'محضر-INV-1',
      notes: 'تصحيح رصيد صنف منفرد',
      idempotencyKey: expect.stringMatching(/^inventory-adjustment-/),
    }));
    await waitFor(() => expect(fetchInventoryAdjustmentBalances).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/تم تنفيذ التسوية وحفظ حركتها وتدقيقها/)).toBeInTheDocument();
  });


  it('accepts valid three-decimal quantities without floating-point representation false negatives', async () => {
    const fractionalBalance = {
      ...initialBalance,
      quantity_on_hand: 1,
      quantity_reserved: 0,
      quantity_available: 1,
    };
    vi.mocked(fetchInventoryAdjustmentBalances).mockResolvedValue([fractionalBalance]);
    vi.mocked(adjustInventoryBalance).mockResolvedValue({
      ...successfulAdjustment,
      previous_quantity_on_hand: 1,
      new_quantity_on_hand: 1.001,
      quantity_delta: 0.001,
      reserved_quantity: 0,
      quantity_available_after: 1.001,
    });
    render(<InventoryBalanceAdjustmentPanel warehouseId={initialBalance.warehouse_id} warehouseName="المستودع الرئيسي" />);
    await screen.findByRole('option', { name: 'SKU-001 — أرز 10 كجم' });
    fireEvent.change(screen.getByLabelText('الرصيد الجديد للصنف أرز 10 كجم'), { target: { value: '1.001' } });
    fireEvent.change(screen.getByLabelText('سبب التسوية'), { target: { value: 'فرق وزن موثق' } });
    expect(screen.getByRole('button', { name: 'اعتماد زيادة الرصيد' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد زيادة الرصيد' }));
    await waitFor(() => expect(adjustInventoryBalance).toHaveBeenCalledWith(expect.objectContaining({
      expectedQuantity: 1,
      newQuantity: 1.001,
    })));
  });

  it('blocks quantities below reserved stock before the command reaches the server', async () => {
    render(<InventoryBalanceAdjustmentPanel warehouseId={initialBalance.warehouse_id} warehouseName="المستودع الرئيسي" />);
    await screen.findByRole('option', { name: 'SKU-001 — أرز 10 كجم' });
    fireEvent.change(screen.getByLabelText('الرصيد الجديد للصنف أرز 10 كجم'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('سبب التسوية'), { target: { value: 'محاولة غير صالحة' } });
    expect(screen.getByText(/الرصيد الجديد أقل من المحجوز/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اعتماد نقص الرصيد' })).toBeDisabled();
    expect(adjustInventoryBalance).not.toHaveBeenCalled();
  });

  it('retains the server stale-writer rejection instead of showing optimistic balance success', async () => {
    vi.mocked(adjustInventoryBalance).mockRejectedValueOnce(new Error('stock quantity changed since it was loaded'));
    render(<InventoryBalanceAdjustmentPanel warehouseId={initialBalance.warehouse_id} warehouseName="المستودع الرئيسي" />);
    await screen.findByRole('option', { name: 'SKU-001 — أرز 10 كجم' });
    fireEvent.change(screen.getByLabelText('الرصيد الجديد للصنف أرز 10 كجم'), { target: { value: '130' } });
    fireEvent.change(screen.getByLabelText('سبب التسوية'), { target: { value: 'تعديل بعد تحديث آخر' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد زيادة الرصيد' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('stock quantity changed since it was loaded');
    expect(fetchInventoryAdjustmentBalances).toHaveBeenCalledTimes(1);
  });
});
