import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMPORT_JOBS_PAGE_SIZE,
  MAX_IMPORT_JOBS_PAGE,
  MAX_IMPORT_JOBS_PAGE_SIZE,
  getImportJobsPageBounds,
} from "./import-job-pagination";

describe("import job history pagination", () => {
  it("uses a bounded first page and the default page size", () => {
    expect(getImportJobsPageBounds(1)).toEqual({
      page: 1,
      pageSize: DEFAULT_IMPORT_JOBS_PAGE_SIZE,
      from: 0,
      to: 29,
      totalPages: null,
    });
  });

  it("calculates contiguous non-overlapping ranges for adjacent pages", () => {
    const first = getImportJobsPageBounds(1, 30);
    const second = getImportJobsPageBounds(2, 30);
    expect(first.to + 1).toBe(second.from);
    expect(second).toMatchObject({ page: 2, from: 30, to: 59 });
  });

  it("reports the exact page count and final partial page", () => {
    expect(getImportJobsPageBounds(3, 30, 61)).toEqual({
      page: 3,
      pageSize: 30,
      from: 60,
      to: 89,
      totalPages: 3,
    });
  });

  it("clamps a stale page after rows are deleted", () => {
    expect(getImportJobsPageBounds(9, 30, 61)).toMatchObject({
      page: 3,
      from: 60,
      to: 89,
      totalPages: 3,
    });
  });

  it("keeps an empty history at page one with no fabricated count", () => {
    expect(getImportJobsPageBounds(9, 30, 0)).toMatchObject({
      page: 1,
      from: 0,
      to: 29,
      totalPages: 1,
    });
  });

  it("rejects malformed or excessively large page inputs", () => {
    for (const page of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER, MAX_IMPORT_JOBS_PAGE + 1]) {
      expect(() => getImportJobsPageBounds(page)).toThrow("رقم صفحة سجل الاستيراد غير صالح");
    }
    for (const pageSize of [0, -1, 1.5, MAX_IMPORT_JOBS_PAGE_SIZE + 1]) {
      expect(() => getImportJobsPageBounds(1, pageSize)).toThrow("حجم صفحة سجل الاستيراد خارج النطاق");
    }
  });

  it("rejects an invalid exact count", () => {
    for (const count of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => getImportJobsPageBounds(1, 30, count)).toThrow("إجمالي دفعات الاستيراد غير صالح");
    }
  });
});
