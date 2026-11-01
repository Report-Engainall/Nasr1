import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  cancel: vi.fn(),
  download: vi.fn(),
  request: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('@/lib/async-export-jobs', () => ({
  listMyAsyncExportJobs: mocks.list,
  cancelMyAsyncExportJob: mocks.cancel,
  getMyAsyncExportDownload: mocks.download,
  requestAsyncOrdersCsvExport: mocks.request,
  triggerAsyncExportWorker: mocks.retry,
}));

vi.mock('@/lib/async-export-csv', () => ({
  exportJobIdempotencyKey: () => 'test-key-12345678',
}));

import { AsyncExportCenter } from '@/components/AsyncExportCenter';

const readyJob = {
  job_id: '11111111-1111-4111-8111-111111111111',
  export_type: 'orders_csv' as const,
  status: 'ready' as const,
  row_count: 8,
  file_name: 'orders.csv',
  byte_size: 512,
  error_code: null,
  error_message: null,
  created_at: '2026-10-24T17:00:00.000Z',
  completed_at: '2026-10-24T17:01:00.000Z',
  expires_at: '2026-10-31T17:00:00.000Z',
};

const queuedJob = {
  ...readyJob,
  job_id: '22222222-2222-4222-8222-222222222222',
  status: 'queued' as const,
  file_name: null,
  byte_size: null,
  completed_at: null,
};

describe('async export screen refresh failure', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.cancel.mockReset();
    mocks.download.mockReset();
    mocks.request.mockReset();
    mocks.retry.mockReset();
  });

  afterEach(() => cleanup());

  it('clears a previous ready snapshot and shows a recoverable error when refresh fails', async () => {
    mocks.list
      .mockResolvedValueOnce([readyJob])
      .mockRejectedValueOnce(new Error('simulated network failure'));

    render(<AsyncExportCenter />);

    expect(await screen.findByText('جاهز للتنزيل')).toBeInTheDocument();
    expect(screen.queryByText('orders.csv')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /تحديث السجل/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'تعذر تأكيد حالة سجل التصدير',
    );
    expect(screen.queryByText('جاهز للتنزيل')).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
  
  it('keeps retry and cancel actions bound to the selected queued export row', async () => {
    mocks.list.mockResolvedValue([queuedJob]);
    mocks.retry.mockResolvedValue(true);

    render(<AsyncExportCenter />);

    fireEvent.click(await screen.findByRole('button', { name: 'تنبيه العامل' }));

    expect(await screen.findByText('أُرسل الطلب الحالي إلى العامل.')).toBeInTheDocument();
    expect(mocks.retry).toHaveBeenCalledWith(queuedJob.job_id);
  });

});
