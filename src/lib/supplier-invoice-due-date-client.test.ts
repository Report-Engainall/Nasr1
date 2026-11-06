import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSupplierInvoiceDueDates, recordSupplierInvoiceDueDate } from "./supplier-invoices";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const invoiceId = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";
const dueDateId = "55555555-5555-4555-8555-555555555555";
const profileId = "66666666-6666-4666-8666-666666666666";
const idempotencyKey = "77777777-7777-4777-8777-777777777777";

function dueDateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: dueDateId,
    invoice_id: invoiceId,
    due_date: "2026-11-20",
    source_evidence_id: evidenceId,
    source_reference: "INV-SUP-1002 / Due date",
    reason: "تاريخ السداد كما ورد في خانة الاستحقاق بالمرفق المحفوظ.",
    recorded_by_profile_id: profileId,
    recorded_at: "2026-11-06T10:00:00.000Z",
    replayed: false,
    ...overrides,
  };
}

describe("supplier invoice source-attested due-date client", () => {
  beforeEach(() => rpc.mockReset());

  it("reads the immutable tenant-scoped due-date contract through its RPC", async () => {
    rpc.mockResolvedValue({ data: [dueDateRow()], error: null });
    const rows = await fetchSupplierInvoiceDueDates(invoiceId);
    expect(rpc).toHaveBeenCalledWith("fetch_purchase_supplier_invoice_due_dates", { p_invoice_id: invoiceId });
    expect(rows).toEqual([{
      id: dueDateId,
      invoiceId,
      dueDate: "2026-11-20",
      sourceEvidenceId: evidenceId,
      sourceReference: "INV-SUP-1002 / Due date",
      reason: "تاريخ السداد كما ورد في خانة الاستحقاق بالمرفق المحفوظ.",
      recordedByProfileId: profileId,
      recordedAt: "2026-11-06T10:00:00.000Z",
    }]);
  });

  it("rejects multiple due-date rows for the same invoice instead of choosing one", async () => {
    rpc.mockResolvedValue({ data: [dueDateRow(), dueDateRow({ id: "88888888-8888-4888-8888-888888888888" })], error: null });
    await expect(fetchSupplierInvoiceDueDates()).rejects.toThrow(/أكثر من تاريخ استحقاق/);
  });

  it("records due date only with the exact attached evidence reference and idempotency key", async () => {
    rpc.mockResolvedValue({ data: dueDateRow({ replayed: true }), error: null });
    const result = await recordSupplierInvoiceDueDate({
      invoiceId,
      dueDate: "2026-11-20",
      sourceEvidenceId: evidenceId,
      sourceReference: "INV-SUP-1002 / Due date",
      reason: "تاريخ السداد كما ورد في خانة الاستحقاق بالمرفق المحفوظ.",
      idempotencyKey,
    });
    expect(rpc).toHaveBeenCalledWith("record_purchase_supplier_invoice_due_date", {
      p_invoice_id: invoiceId,
      p_due_date: "2026-11-20",
      p_source_evidence_id: evidenceId,
      p_source_reference: "INV-SUP-1002 / Due date",
      p_reason: "تاريخ السداد كما ورد في خانة الاستحقاق بالمرفق المحفوظ.",
      p_idempotency_key: idempotencyKey,
    });
    expect(result.replayed).toBe(true);
    expect(result.sourceEvidenceId).toBe(evidenceId);
  });

  it("rejects a server response whose due date or attachment differs from the submitted payload", async () => {
    rpc.mockResolvedValue({ data: dueDateRow({ due_date: "2026-11-21" }), error: null });
    await expect(recordSupplierInvoiceDueDate({
      invoiceId,
      dueDate: "2026-11-20",
      sourceEvidenceId: evidenceId,
      sourceReference: "INV-SUP-1002 / Due date",
      reason: "تاريخ السداد كما ورد في خانة الاستحقاق بالمرفق المحفوظ.",
      idempotencyKey,
    })).rejects.toThrow(/لم يؤكد الخادم حفظ تاريخ الاستحقاق/);
  });

  it("refuses incomplete evidence input before invoking the RPC", async () => {
    await expect(recordSupplierInvoiceDueDate({
      invoiceId,
      dueDate: "2026-11-20",
      sourceEvidenceId: evidenceId,
      sourceReference: "   ",
      reason: "سبب",
      idempotencyKey,
    })).rejects.toThrow(/بيانات تاريخ استحقاق المورد/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
