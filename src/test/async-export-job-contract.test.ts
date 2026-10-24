import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASYNC_EXPORT_DOWNLOAD_TTL_SECONDS, ASYNC_EXPORT_MAX_BYTES, ASYNC_EXPORT_MAX_ITEMS,
  ASYNC_EXPORT_MAX_ORDERS, ASYNC_EXPORT_RETENTION_DAYS, buildOrdersCsv,
  sha256Hex, validateOrdersExportFilters,
} from "@/lib/async-export-csv";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020240000_async_export_jobs.sql"),
  "utf8",
);
const worker = readFileSync(join(process.cwd(), "supabase/functions/async-export-worker/index.ts"), "utf8");
const download = readFileSync(join(process.cwd(), "supabase/functions/async-export-download/index.ts"), "utf8");
const downloadHandler = readFileSync(join(process.cwd(), "supabase/functions/_shared/async-export-download-handler.ts"), "utf8");
const jobClient = readFileSync(join(process.cwd(), "src/lib/async-export-jobs.ts"), "utf8");

describe("asynchronous order export contracts", () => {
  it("validates exactly bounded date filters and rejects malformed or unsupported filters", () => {
    expect(validateOrdersExportFilters({ date_from: "2026-10-01", date_to: "2026-10-20" }))
      .toEqual({ date_from: "2026-10-01", date_to: "2026-10-20" });
    expect(() => validateOrdersExportFilters({ date_from: "2026-10-21", date_to: "2026-10-20" })).toThrow();
    expect(() => validateOrdersExportFilters({ date_from: "2025-01-01", date_to: "2026-01-02" })).toThrow();
    expect(() => validateOrdersExportFilters({ date_from: "2026-02-30", date_to: "2026-03-01" })).toThrow();
    expect(() => validateOrdersExportFilters({ date_from: "2026-10-01", date_to: "2026-10-20", organization_id: "foreign" })).toThrow();
    expect(() => validateOrdersExportFilters(["2026-10-01", "2026-10-20"])).toThrow();
  });

  it("writes a UTF-8 CSV with Arabic headers, correctly escaped cells and formula-injection protection", () => {
    const csv = buildOrdersCsv([{
      orderNumber: "=HYPERLINK(\"https://bad.test\")", createdAt: "2026-10-01T00:00:00Z",
      status: "confirmed", customerCode: "000012", customerName: "شركة \"الأغبري\", فرع 2",
      itemCode: "000125", itemName: "سكر\nبرازيلي", unit: "كرتون",
      quantity: "2.5", unitPrice: "10.25", discount: "0", lineTotal: "25.625", orderTotal: "25.625",
    }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("رقم الطلب");
    expect(csv).toContain("000012");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('""الأغبري""');
    expect(csv).toContain("سكر\nبرازيلي");
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("rejects invalid numeric cells and produces a stable hexadecimal SHA-256 digest", async () => {
    const base = {
      orderNumber: "ORD-1", createdAt: "2026-10-01T00:00:00Z", status: "confirmed",
      customerCode: "C1", customerName: "عميل", itemCode: "P1", itemName: "منتج", unit: "كرتون",
      quantity: 1, unitPrice: 5, discount: 0, lineTotal: 5, orderTotal: 5,
    };
    expect(() => buildOrdersCsv([{ ...base, quantity: 0 }])).toThrow();
    expect(() => buildOrdersCsv([{ ...base, unitPrice: Number.POSITIVE_INFINITY }])).toThrow();
    const digest = await sha256Hex(new TextEncoder().encode("test"));
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(ASYNC_EXPORT_MAX_ORDERS).toBe(1000);
    expect(ASYNC_EXPORT_MAX_ITEMS).toBe(10000);
    expect(ASYNC_EXPORT_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(ASYNC_EXPORT_RETENTION_DAYS).toBe(7);
    expect(ASYNC_EXPORT_DOWNLOAD_TTL_SECONDS).toBe(60);
  });

  it("uses a private worker queue, per-actor tenant filters, retry leases and expiring one-minute signed links", () => {
    expect(migration).toMatch(/ALTER TABLE public\.async_export_jobs ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.async_export_jobs FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT ALL ON TABLE public\.async_export_jobs TO service_role/i);
    expect(migration).toMatch(/UNIQUE \(organization_id, requested_by, idempotency_key\)/i);
    expect(migration).toMatch(/FOR UPDATE SKIP LOCKED/i);
    expect(migration).toMatch(/lease_expires_at/i);
    expect(migration).toMatch(/status='expired'/i);
    expect(migration).toMatch(/get_my_async_export_download/i);
    expect(migration).toMatch(/role IN \('admin','manager','accountant'\)/i);
    expect(worker).toMatch(/constantTimeEqual/);
    expect(worker).toMatch(/claim_my_async_export_job/);
    expect(worker).toMatch(/claim_async_export_jobs/);
    expect(worker).toMatch(/complete_async_export_job/);
    expect(worker).toMatch(/fail_async_export_job/);
    expect(worker).toMatch(/organization_id/);
    expect(worker).toMatch(/quantity_review_required/);
    expect(worker).toMatch(/ASYNC_EXPORT_MAX_ORDERS/);
    expect(worker).toMatch(/sha256Hex/);
    expect(download).toContain("createAsyncExportDownloadHandler");
    expect(download).toMatch(/get_my_async_export_download/);
    expect(downloadHandler).toMatch(/getMyAsyncExportDownload\(jobId\)/);
    expect(downloadHandler).toMatch(/createSignedUrl\(\s*job\.artifact_path,\s*ttlSeconds,/);
    expect(downloadHandler).toMatch(/Math\.min\(60, Math\.floor\(\(jobExpiryMs - signingStartedMs - 1000\) \/ 1000\)\)/);
    expect(downloadHandler).toMatch(/ttl_seconds: ttlSeconds/);
    expect(downloadHandler).toContain("readBoundedTextBody");
    expect(jobClient).toMatch(/request_async_export_job/);
    expect(jobClient).toMatch(/async-export-worker/);
    expect(jobClient).toMatch(/async-export-download/);
  });
});
