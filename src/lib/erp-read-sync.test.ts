import { describe, expect, it } from "vitest";
import { mapErpReadSyncError, parseErpReadSyncResult } from "./erp-read-sync";

const complete = {
  status: "complete",
  pages_committed: 2,
  records_read: 38,
  counts: { created: 8, updated: 10, unchanged: 20, rejected: 0, conflicted: 0 },
  checkpoint: {
    version: 12,
    has_cursor: false,
    pending_watermark: null,
    completed_watermark: "2026-11-28T00:45:00Z",
  },
};

describe("ERP read-sync client contract", () => {
  it("parses a completed source snapshot with exact counters and watermarks", () => {
    expect(parseErpReadSyncResult(complete)).toEqual(complete);
  });

  it("parses a resumable page without exposing the opaque cursor", () => {
    const result = parseErpReadSyncResult({
      ...complete,
      status: "continuation_required",
      checkpoint: {
        version: 13,
        has_cursor: true,
        pending_watermark: "2026-11-28T00:50:00Z",
        completed_watermark: "2026-11-28T00:45:00Z",
      },
    });
    expect(result.status).toBe("continuation_required");
    expect(result.checkpoint.has_cursor).toBe(true);
    expect(JSON.stringify(result)).not.toContain("cursor_ciphertext");
    expect(JSON.stringify(result)).not.toContain("provider-cursor");
  });

  it("rejects malformed counters, timestamps and checkpoint cursors", () => {
    expect(() => parseErpReadSyncResult({ ...complete, records_read: -1 })).toThrow();
    expect(() => parseErpReadSyncResult({
      ...complete,
      counts: { ...complete.counts, created: 1.5 },
    })).toThrow();
    expect(() => parseErpReadSyncResult({
      ...complete,
      checkpoint: { ...complete.checkpoint, has_cursor: "false" },
    })).toThrow();
    expect(() => parseErpReadSyncResult({
      ...complete,
      checkpoint: { ...complete.checkpoint, completed_watermark: "not-a-time" },
    })).toThrow();
  });

  it("maps known provider readiness and tenant-scope failures to safe Arabic messages", () => {
    expect(mapErpReadSyncError("ERP_PROVIDER_NOT_ENABLED")).toContain("لم يثبت ترخيص");
    expect(mapErpReadSyncError("ERP_PROVIDER_SCOPE_NOT_ALLOWED")).toContain("غير معتمد");
    expect(mapErpReadSyncError("ERP_CHECKPOINT_CONFLICT")).toContain("تغيرت نقطة الاستئناف");
    expect(mapErpReadSyncError("UNRECOGNIZED_INTERNAL_CODE")).toContain("راجع سجل التكاملات");
    expect(mapErpReadSyncError(null)).toContain("تعذر الاتصال");
  });
});
