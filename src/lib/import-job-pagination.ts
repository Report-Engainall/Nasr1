export const DEFAULT_IMPORT_JOBS_PAGE_SIZE = 30;
export const MAX_IMPORT_JOBS_PAGE_SIZE = 50;
export const MAX_IMPORT_JOBS_PAGE = 100_000;

export type ImportJobsPageBounds = {
  page: number;
  pageSize: number;
  from: number;
  to: number;
  totalPages: number | null;
};

/** Calculates a bounded, zero-based inclusive range for the tenant import history. */
export function getImportJobsPageBounds(
  page: number,
  pageSize = DEFAULT_IMPORT_JOBS_PAGE_SIZE,
  totalCount?: number,
): ImportJobsPageBounds {
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_IMPORT_JOBS_PAGE) {
    throw new Error('رقم صفحة سجل الاستيراد غير صالح.');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_IMPORT_JOBS_PAGE_SIZE) {
    throw new Error('حجم صفحة سجل الاستيراد خارج النطاق المسموح.');
  }
  if (totalCount !== undefined && (!Number.isSafeInteger(totalCount) || totalCount < 0)) {
    throw new Error('إجمالي دفعات الاستيراد غير صالح.');
  }

  const totalPages = totalCount === undefined
    ? null
    : Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = totalPages === null ? page : Math.min(page, totalPages);
  const from = (currentPage - 1) * pageSize;

  return {
    page: currentPage,
    pageSize,
    from,
    to: from + pageSize - 1,
    totalPages,
  };
}
