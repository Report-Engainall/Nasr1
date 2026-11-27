import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
import { mapErpReadSyncError, parseErpReadSyncResult, runErpReadSync } from "./erp-read-sync";

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
  preview: {
    records: [{
      externalId: "ERP-INVOICE-1001",
      sourceUpdatedAt: "2026-11-28T00:45:00Z",
      lastDisposition: "created",
      fields: { document_number: "INV-1001", currency_code: "YER", total_amount: "1250.7500" },
    }],
    total: 1,
    limit: 20,
    offset: 0,
    checkpointVersion: 12,
    pendingWatermark: null,
    completedWatermark: "2026-11-28T00:45:00Z",
  },
  preview_error: null,
};

describe("ERP read-sync client contract", () => {
  it("parses a completed source snapshot with exact counters and watermarks", () => {
    expect(parseErpReadSyncResult(complete, "customer_financial_documents")).toEqual(complete);
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
    }, "customer_financial_documents");
    expect(result.status).toBe("continuation_required");
    expect(result.checkpoint.has_cursor).toBe(true);
    expect(JSON.stringify(result)).not.toContain("cursor_ciphertext");
    expect(JSON.stringify(result)).not.toContain("provider-cursor");
  });

  it("rejects malformed counters, timestamps and checkpoint cursors", () => {
    expect(() => parseErpReadSyncResult({ ...complete, records_read: -1 }, "customer_financial_documents")).toThrow();
    expect(() => parseErpReadSyncResult({
      ...complete,
      counts: { ...complete.counts, created: 1.5 },
    }, "customer_financial_documents")).toThrow();
    expect(() => parseErpReadSyncResult({
      ...complete,
      checkpoint: { ...complete.checkpoint, has_cursor: "false" },
    }, "customer_financial_documents")).toThrow();
    expect(() => parseErpReadSyncResult({
      ...complete,
      checkpoint: { ...complete.checkpoint, completed_watermark: "not-a-time" },
    }, "customer_financial_documents")).toThrow();
  });

  it("invokes only the authenticated read-sync function with the selected bounded request", async () => {
    const productResult = {
      ...complete,
      preview: {
        ...complete.preview,
        records: [{
          externalId: "ERP-PRODUCT-001",
          sourceUpdatedAt: "2026-11-28T00:45:00Z",
          lastDisposition: "updated",
          fields: { item_code: "000125", name: "منتج" },
        }],
      },
    };
    mocks.invoke.mockResolvedValueOnce({ data: productResult, error: null });
    const request = {
      provider: "onyx_pro" as const,
      object_type: "products" as const,
      company_external_id: "COMPANY-01",
      branch_external_id: "BRANCH-01",
      warehouse_external_id: null,
      currency_code: "YER",
      max_pages: 2,
      max_records: 500,
    };
    await expect(runErpReadSync(request)).resolves.toEqual(productResult);
    expect(mocks.invoke).toHaveBeenCalledWith("erp-read-sync", { body: request });
  });

  it("rejects a staged preview that contains a field outside the server-approved projection", () => {
    expect(() => parseErpReadSyncResult({
      ...complete,
      preview: {
        records: [{
          externalId: "ERP-INVOICE-1001",
          sourceUpdatedAt: "2026-11-28T00:45:00Z",
          lastDisposition: "created",
          fields: { document_number: "INV-1001", supplier_cost: "1.00" },
        }],
        total: 1, limit: 20, offset: 0, checkpointVersion: 12,
        pendingWatermark: null, completedWatermark: "2026-11-28T00:45:00Z",
      },
    }, "customer_financial_documents")).toThrow();
  });

  it("rejects unknown per-record disposition states", () => {
    expect(() => parseErpReadSyncResult({
      ...complete,
      preview: {
        ...complete.preview,
        records: [{
          externalId: "ERP-INVOICE-1001",
          sourceUpdatedAt: "2026-11-28T00:45:00Z",
          lastDisposition: "posting",
          fields: { document_number: "INV-1001" },
        }],
      },
    }, "customer_financial_documents")).toThrow();
  });

  it("accepts a successful sync when the separate preview read was unavailable", () => {
    const result = parseErpReadSyncResult({ ...complete, preview: null, preview_error: "ERP_STAGING_PREVIEW_FAILED" }, "customer_financial_documents");
    expect(result.status).toBe("complete");
    expect(result.preview).toBeNull();
    expect(result.preview_error).toBe("ERP_STAGING_PREVIEW_FAILED");
  });

  it("maps known provider readiness and tenant-scope failures to safe Arabic messages", () => {
    expect(mapErpReadSyncError("ERP_PROVIDER_NOT_ENABLED")).toContain("لم يثبت ترخيص");
    expect(mapErpReadSyncError("ERP_PROVIDER_SCOPE_NOT_ALLOWED")).toContain("غير معتمد");
    expect(mapErpReadSyncError("ERP_CHECKPOINT_CONFLICT")).toContain("تغيرت نقطة الاستئناف");
    expect(mapErpReadSyncError("UNRECOGNIZED_INTERNAL_CODE")).toContain("راجع سجل التكاملات");
    expect(mapErpReadSyncError(null)).toContain("تعذر الاتصال");
  });
});
