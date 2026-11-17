// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OpeningInventoryBaselineApprovalPanel } from './OpeningInventoryBaselineApprovalPanel';
import { approveOpeningInventoryBaseline, fetchOpeningInventoryBaselinePreview } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  approveOpeningInventoryBaseline: vi.fn(),
  fetchOpeningInventoryBaselinePreview: vi.fn(),
}));

const preview = {
  organization_id: '11111111-1111-4111-8111-111111111111',
  warehouse_id: '55555555-5555-4555-8555-555555555555',
  source_batch_id: '98dbfb5e-cc46-457e-b532-7efde84a914a',
  source_marker: 'OWNER_AUTHORIZED_OPENING_ESTIMATE_PENDING_PHYSICAL_COUNT',
  active_product_count: 114,
  opening_movement_count: 114,
  distinct_opening_products: 114,
  opening_total_quantity: 3235,
  matching_balance_count: 114,
  missing_opening_product_count: 0,
  duplicate_opening_product_count: 0,
  missing_balance_count: 0,
  invalid_quantity_count: 0,
  ready_to_approve: true,
  approval_id: null,
  approved_at: null,
  approved_by: null,
  approval_status: null,
  items: [{
    product_id: '44444444-4444-4444-8444-444444444444',
    item_code: 'SKU-001',
    product_name: 'أرز 10 كجم',
    unit: 'كيس',
    opening_movement_id: '66666666-6666-4666-8666-666666666666',
    opening_quantity: 28,
    source_movement_count: 1,
    quantity_on_hand: 28,
    quantity_reserved: 0,
    quantity_available: 28,
    movement_created_at: '2026-10-16T12:00:00Z',
    source_marker_present: true,
  }],
};

const approvedPreview = {
  ...preview,
  ready_to_approve: false,
  approval_id: '77777777-7777-4777-8777-777777777777',
  approved_at: '2026-11-16T01:30:00Z',
  approved_by: '22222222-2222-4222-8222-222222222222',
  approval_status: 'approved_pending_physical_count',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchOpeningInventoryBaselinePreview).mockResolvedValue(preview);
  vi.mocked(approveOpeningInventoryBaseline).mockResolvedValue({
    approval_id: approvedPreview.approval_id,
    status: 'approved_pending_physical_count',
    approved_at: approvedPreview.approved_at,
    approved_by: approvedPreview.approved_by,
    product_count: 114,
    total_opening_quantity: 3235,
    idempotent_replay: false,
  });
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OpeningInventoryBaselineApprovalPanel', () => {
  it('previews the actual source and explicitly approves an immutable pending-count snapshot', async () => {
    vi.mocked(fetchOpeningInventoryBaselinePreview)
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(approvedPreview);
    render(<OpeningInventoryBaselineApprovalPanel
      warehouseId={preview.warehouse_id}
      warehouseName="المستودع الرئيسي"
    />);

    expect(await screen.findByText('أرز 10 كجم')).toBeTruthy();
    expect(screen.getByText('المصدر مكتمل وجاهز للاعتماد')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد خط الأساس الافتتاحي' }));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(approveOpeningInventoryBaseline).toHaveBeenCalledWith(preview.warehouse_id));
    expect(await screen.findByText('رصيد افتتاحي معتمد من المالك — بانتظار الجرد الميداني')).toBeTruthy();
    expect(document.body.textContent).toContain(approvedPreview.approval_id);
    expect(fetchOpeningInventoryBaselinePreview).toHaveBeenCalledTimes(2);
  });

  it('explains that owner approval must be provisioned when an admin has no verified owner binding', async () => {
    vi.mocked(fetchOpeningInventoryBaselinePreview).mockRejectedValue({
      code: '42501',
      message: 'verified organization owner identity and approval capability are required',
    });
    render(<OpeningInventoryBaselineApprovalPanel
      warehouseId={preview.warehouse_id}
      warehouseName="المستودع الرئيسي"
    />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'لم تُسجّل هوية مالك المؤسسة بشكل موثوق بعد',
    );
    expect(screen.queryByRole('button', { name: 'اعتماد خط الأساس الافتتاحي' })).toBeNull();
    expect(approveOpeningInventoryBaseline).not.toHaveBeenCalled();
  });

  it('refuses to offer approval when the source count or quantity does not match the owner batch', async () => {
    vi.mocked(fetchOpeningInventoryBaselinePreview).mockResolvedValue({
      ...preview,
      ready_to_approve: false,
      opening_movement_count: 113,
      missing_opening_product_count: 1,
      opening_total_quantity: 3200,
    });
    render(<OpeningInventoryBaselineApprovalPanel
      warehouseId={preview.warehouse_id}
      warehouseName="المستودع الرئيسي"
    />);

    expect(await screen.findByText('الاعتماد محجوب حتى تطابق المصدر بالكامل')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'اعتماد خط الأساس الافتتاحي' }) as HTMLButtonElement).disabled).toBe(true);
    expect(approveOpeningInventoryBaseline).not.toHaveBeenCalled();
  });
});
