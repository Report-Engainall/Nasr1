// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InventoryTransferHistoryPage } from './InventoryTransferHistoryPage';

const mocks = vi.hoisted(() => ({
  warehouses: [
    { id: 'warehouse-1', name: 'المخزن الرئيسي', code: 'WH-01' },
    { id: 'warehouse-2', name: 'فرع عدن', code: 'WH-02' },
  ],
  products: [],
  history: [] as Array<Record<string, unknown>>,
  fetchWarehouses: vi.fn(),
  fetchProducts: vi.fn(),
  fetchHistory: vi.fn(),
  refetchHistory: vi.fn(),
  download: vi.fn(),
  transfer: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  fetchActiveInventoryWarehouses: mocks.fetchWarehouses,
  fetchInventoryTransferProducts: mocks.fetchProducts,
  fetchInventoryTransferHistory: mocks.fetchHistory,
  transferInventoryBatch: mocks.transfer,
}));

vi.mock('@/lib/useFetch', () => ({
  useFetch: (fetcher: unknown) => {
    if (fetcher === mocks.fetchWarehouses) return { data: mocks.warehouses, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchProducts) return { data: mocks.products, loading: false, error: null, refetch: vi.fn() };
    return { data: mocks.history, loading: false, error: null, refetch: mocks.refetchHistory };
  },
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { isStaff: true, roles: ['manager'] } }),
}));

vi.mock('@/lib/inventory-transfer-history-xlsx', () => ({
  downloadInventoryTransferHistoryWorkbookXlsx: mocks.download,
}));

vi.mock('@/lib/inventory-transfer-history-print', () => ({
  projectInventoryTransferPrintRow: (row: Record<string, unknown>) => ({ ...row, transfer_type: 'تحويل دفعة' }),
}));

function makeTransfer(index: number): Record<string, unknown> {
  const day = String(index).padStart(2, '0');
  return {
    id: 'transfer-' + index,
    organization_id: 'org-1',
    product_id: 'product-' + index,
    source_warehouse_id: 'warehouse-1',
    destination_warehouse_id: 'warehouse-2',
    quantity: index + 0.5,
    reason: 'تغذية فرع عدن',
    created_by: 'موظف المخزون',
    created_at: '2026-11-' + day + 'T09:00:00.000Z',
    batch_id: 'batch-' + index,
    product_name: 'سكر أبيض ' + index,
    item_code: 'SKU-' + String(index).padStart(3, '0'),
    unit: 'كرتون',
    source_warehouse_name: 'المخزن الرئيسي',
    destination_warehouse_name: 'فرع عدن',
    batch_line_count: 2,
  };
}

describe('InventoryTransferHistoryPage', () => {
  beforeEach(() => {
    mocks.history = Array.from({ length: 12 }, (_, index) => makeTransfer(index + 1));
    mocks.download.mockReset();
    mocks.refetchHistory.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the operational transfer table and paginates newest-first', () => {
    render(<InventoryTransferHistoryPage />);

    const table = screen.getByRole('table', { name: 'جدول سجل تحويلات المخزون' });
    expect(table).toBeInTheDocument();
    expect(withinTableRow(table, 'transfer-12')).toBeInTheDocument();
    expect(withinTableRow(table, 'transfer-1')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('حركة');

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(withinTableRow(table, 'transfer-1')).toBeInTheDocument();
    expect(withinTableRow(table, 'transfer-12')).not.toBeInTheDocument();
    expect(screen.getByText('صفحة 2 من 2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('عدد الحركات في الصفحة'), { target: { value: '25' } });
    expect(withinTableRow(table, 'transfer-12')).toBeInTheDocument();
    expect(withinTableRow(table, 'transfer-1')).toBeInTheDocument();
    expect(screen.getByText('صفحة 1 من 1')).toBeInTheDocument();
  });

  it('normalizes Arabic search and exports the entire filtered set beyond the current page', () => {
    render(<InventoryTransferHistoryPage />);

    fireEvent.change(screen.getByLabelText('بحث في الحركات'), { target: { value: 'سُكَر' } });
    expect(withinTableRow(screen.getByRole('table', { name: 'جدول سجل تحويلات المخزون' }), 'transfer-12')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('حركة');

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    fireEvent.click(screen.getByRole('button', { name: 'تنزيل Excel للنتائج' }));

    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.download.mock.calls[0][0]).toHaveLength(12);
    expect(mocks.download.mock.calls[0][0].map((row: Record<string, unknown>) => row.id))
      .toEqual(Array.from({ length: 12 }, (_, index) => 'transfer-' + (12 - index)));
  });

  it('filters on either warehouse endpoint, supports date bounds and clears filters', () => {
    render(<InventoryTransferHistoryPage />);

    fireEvent.change(screen.getByLabelText('تصفية المستودع'), { target: { value: 'warehouse-2' } });
    fireEvent.change(screen.getByLabelText('من تاريخ'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('إلى تاريخ'), { target: { value: '2026-11-12' } });
    const table = screen.getByRole('table', { name: 'جدول سجل تحويلات المخزون' });
    expect(withinTableRow(table, 'transfer-12')).toBeInTheDocument();
    expect(withinTableRow(table, 'transfer-10')).toBeInTheDocument();
    expect(withinTableRow(table, 'transfer-9')).not.toBeInTheDocument();
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'مسح الفلاتر' }));
    expect(withinTableRow(table, 'transfer-12')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('حركة');
  });
});

function withinTableRow(table: HTMLElement, id: string): HTMLElement | null {
  return Array.from(table.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes(
    id.replace('transfer-', 'SKU-').replace(/^SKU-(\d+)$/, (_, number: string) => 'SKU-' + number.padStart(3, '0')),
  )) ?? null;
}
