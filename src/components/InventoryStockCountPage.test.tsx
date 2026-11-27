// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InventoryStockCountPage } from './InventoryStockCountPage';

const mocks = vi.hoisted(() => ({
  warehouse: { id: 'warehouse-1', name: 'المخزن الرئيسي', code: 'WH-01' },
  session: {
    id: 'session-1', organization_id: 'org-1', warehouse_id: 'warehouse-1', status: 'open' as const,
    idempotency_key: 'stock-count-session-1', notes: null, started_by: 'manager-1',
    started_at: '2026-11-27T08:00:00.000Z', total_lines: 12, counted_lines: 6,
    completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null, cancellation_reason: null,
  },
  lines: [] as Array<Record<string, unknown>>,
  fetchWarehouses: vi.fn(), fetchOpenSession: vi.fn(), fetchLines: vi.fn(),
  start: vi.fn(), saveLine: vi.fn(), complete: vi.fn(), cancel: vi.fn(), download: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  fetchActiveInventoryWarehouses: mocks.fetchWarehouses,
  fetchOpenStockCountForWarehouse: mocks.fetchOpenSession,
  fetchStockCountLines: mocks.fetchLines,
  startStockCount: mocks.start,
  setStockCountLine: mocks.saveLine,
  completeStockCount: mocks.complete,
  cancelStockCount: mocks.cancel,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { roles: ['staff'], isStaff: true } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/lib/stock-count-xlsx', () => ({ downloadStockCountWorkbookXlsx: mocks.download }));
vi.mock('@/components/InventoryBatchTracePanel', () => ({ InventoryBatchTracePanel: () => null }));
vi.mock('@/components/InventoryBalanceAdjustmentPanel', () => ({ InventoryBalanceAdjustmentPanel: () => null }));
vi.mock('@/components/OpeningInventoryBaselineApprovalPanel', () => ({ OpeningInventoryBaselineApprovalPanel: () => null }));

function makeLine(index: number): Record<string, unknown> {
  const counted = index % 2 === 1;
  const expected = 10 + index;
  return {
    id: 'line-' + index, organization_id: 'org-1', session_id: 'session-1', product_id: 'product-' + index,
    product_code: 'SKU-' + String(index).padStart(3, '0'), product_name: 'سكر أبيض ' + index, unit: 'كرتون',
    expected_quantity: expected, expected_reserved_quantity: 1, expected_last_movement_at: null,
    counted_quantity: counted ? expected + 1 : null, counted_at: counted ? '2026-11-27T08:15:00.000Z' : null,
    completed_quantity: null, variance: counted ? 1 : null, completed_at: null,
  };
}
const allLines = Array.from({ length: 12 }, (_, index) => makeLine(index + 1));

beforeEach(() => {
  mocks.lines = allLines;
  mocks.fetchWarehouses.mockResolvedValue([mocks.warehouse]);
  mocks.fetchOpenSession.mockResolvedValue(mocks.session);
  mocks.fetchLines.mockImplementation(async () => mocks.lines);
  mocks.download.mockReset();
  mocks.download.mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('InventoryStockCountPage operational list', () => {
  it('shows ten rows per page and allows staff to reach the remaining lines', async () => {
    render(<InventoryStockCountPage />);
    const table = await screen.findByRole('table', { name: 'جدول أصناف الجرد' });
    await waitFor(() => expect(table.querySelectorAll('tbody tr')).toHaveLength(10));
    expect(within(table).getByText('SKU-010')).toBeInTheDocument();
    expect(within(table).queryByText('SKU-011')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(within(table).getByText('SKU-011')).toBeInTheDocument();
    expect(within(table).getByText('SKU-012')).toBeInTheDocument();
    expect(screen.getByText('صفحة 2 من 2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('عدد الأصناف في الصفحة'), { target: { value: '25' } });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(12);
    expect(screen.getByText('صفحة 1 من 1')).toBeInTheDocument();
  });
  it('normalizes Arabic digits in search and shows an explicit empty state', async () => {
    render(<InventoryStockCountPage />);
    const table = await screen.findByRole('table', { name: 'جدول أصناف الجرد' });
    await within(table).findByText('SKU-010');
    fireEvent.change(screen.getByLabelText('بحث في أصناف الجرد'), { target: { value: 'SKU-٠١٢' } });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(within(table).getByText('SKU-012')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بحث في أصناف الجرد'), { target: { value: 'منتج غير موجود' } });
    expect(screen.getByText('لا توجد أصناف تطابق البحث أو حالة العد الحالية.')).toBeInTheDocument();
  });
  it('filters counted, uncounted and variance rows while export retains every session line', async () => {
    render(<InventoryStockCountPage />);
    const table = await screen.findByRole('table', { name: 'جدول أصناف الجرد' });
    await within(table).findByText('SKU-010');
    fireEvent.change(screen.getByLabelText('تصفية حالة العد'), { target: { value: 'counted' } });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(6);
    fireEvent.change(screen.getByLabelText('تصفية حالة العد'), { target: { value: 'uncounted' } });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(6);
    fireEvent.change(screen.getByLabelText('تصفية حالة العد'), { target: { value: 'variance' } });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'تصدير الجرد إلى Excel' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(mocks.session, allLines, 'المخزن الرئيسي'));
  });
});
