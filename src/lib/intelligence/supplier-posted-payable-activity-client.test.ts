import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSupplierPostedPayableActivity } from "./supplier-posted-payable-activity-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const request = {
  from: "2026-10-01",
  to: "2026-10-31",
  asOf: "2026-11-01T00:00:00.000Z",
};
const row = {
  currency: "YER",
  status: "VERIFIED",
  supplierCount: 8,
  sourceEntryCount: 10,
  grossPayableCreditAmount: 1000,
  postedSupplierCreditNoteDebitAmount: 100,
  netPayableMovementAmount: 900,
  top5GrossPayableCreditAmount: 600,
  top5GrossPayableCreditPercent: 60,
};
const snapshot = (currencyRow: Record<string, unknown>) => ({
  status: "VERIFIED",
  asOf: request.asOf,
  period: { from: request.from, to: request.to },
  completeSourceAggregation: true,
  sourceEntryCount: 10,
  currencyCount: 1,
  currencies: [currencyRow],
  activityScope: "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS",
  formulaId: "nasr1.posted-supplier-payable-credit-concentration",
  formulaVersion: "1",
  formulaDescription: "posted source-linked supplier activity",
  settlementIncluded: false,
  sideEffects: "NONE",
});

describe("supplier posted payable activity exact financial arithmetic", () => {
  beforeEach(() => rpc.mockReset());

  it("accepts source-aligned net movement and rounded concentration percentage", async () => {
    rpc.mockResolvedValue({ data: snapshot(row), error: null });
    const result = await fetchSupplierPostedPayableActivity(request);
    expect(result).toMatchObject({
      ok: true,
      snapshot: { currencies: [{ netPayableMovementAmount: 900, top5GrossPayableCreditPercent: 60 }] },
    });
  });

  it("rejects a one-cent net movement mismatch", async () => {
    rpc.mockResolvedValue({
      data: snapshot({ ...row, netPayableMovementAmount: 899.99 }),
      error: null,
    });
    expect(await fetchSupplierPostedPayableActivity(request)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects a one-hundredth percentage-point mismatch", async () => {
    rpc.mockResolvedValue({
      data: snapshot({ ...row, top5GrossPayableCreditPercent: 59.99 }),
      error: null,
    });
    expect(await fetchSupplierPostedPayableActivity(request)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects a missing nullable percentage field instead of treating it as null", async () => {
    const malformed = { ...row } as Record<string, unknown>;
    delete malformed.top5GrossPayableCreditPercent;
    rpc.mockResolvedValue({ data: snapshot(malformed), error: null });
    expect(await fetchSupplierPostedPayableActivity(request)).toMatchObject({ ok: false, status: "ERROR" });
  });
});
