import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchSupplierPostedPayableActivity } from "./supplier-posted-payable-activity-client";

const asOf = "2026-11-17T12:00:00.000Z";
const request = { from: "2026-08-18", to: "2026-11-17", asOf };
const formulaId = "nasr1.posted-supplier-payable-credit-concentration";
const activityScope = "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS";

function response(overrides: Record<string, unknown> = {}) {
  return {
    asOf,
    period: { from: request.from, to: request.to },
    status: "VERIFIED",
    completeSourceAggregation: true,
    sourceEntryCount: 8,
    currencyCount: 1,
    currencies: [{
      currency: "YER",
      status: "VERIFIED",
      supplierCount: 6,
      sourceEntryCount: 8,
      grossPayableCreditAmount: "1000.00",
      postedSupplierCreditNoteDebitAmount: "125.00",
      netPayableMovementAmount: "875.00",
      top5GrossPayableCreditAmount: "800.00",
      top5GrossPayableCreditPercent: 80,
    }],
    activityScope,
    formulaId,
    formulaVersion: "1",
    formulaDescription: "Verified posted source-linked payable movement.",
    settlementIncluded: false,
    sideEffects: "NONE",
    ...overrides,
  };
}

describe("supplier posted payable activity client", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("parses an exact as-of, source-scoped and arithmetically reconciled RPC result", async () => {
    mocks.rpc.mockResolvedValue({ data: response(), error: null });
    const result = await fetchSupplierPostedPayableActivity(request);
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_business_health_supplier_posted_payable_activity", {
      p_from: request.from, p_to: request.to, p_as_of: asOf,
    });
    expect(result).toMatchObject({
      ok: true,
      snapshot: {
        status: "VERIFIED",
        sourceEntryCount: 8,
        currencyCount: 1,
        currencies: [{
          currency: "YER",
          grossPayableCreditAmount: 1000,
          postedSupplierCreditNoteDebitAmount: 125,
          netPayableMovementAmount: 875,
          top5GrossPayableCreditAmount: 800,
          top5GrossPayableCreditPercent: 80,
        }],
      },
    });
  });

  it("denies an unauthorized reader and does not query an alternate source", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(fetchSupplierPostedPayableActivity(request)).resolves.toMatchObject({ ok: false, status: "DENIED" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing database function unavailable, not as an empty payable result", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "function does not exist" } });
    await expect(fetchSupplierPostedPayableActivity(request)).resolves.toMatchObject({ ok: false, status: "UNAVAILABLE" });
  });

  it.each([
    ["one-cent net mismatch", response({ currencies: [{ ...response().currencies[0], netPayableMovementAmount: "874.99" }] })],
    ["one-hundredth percentage mismatch", response({ currencies: [{ ...response().currencies[0], top5GrossPayableCreditPercent: 80.01 }] })],
    ["duplicate currency rows", response({ currencyCount: 2, sourceEntryCount: 16, currencies: [...response().currencies, ...response().currencies] })],
    ["mismatched source entry total", response({ sourceEntryCount: 9 })],
    ["future snapshot", response({ asOf: "2026-11-17T12:00:01.000Z" })],
    ["unapproved settlement inclusion", response({ settlementIncluded: true })],
  ])("rejects %s without returning percentages", async (_label, payload) => {
    mocks.rpc.mockResolvedValue({ data: payload, error: null });
    await expect(fetchSupplierPostedPayableActivity(request)).resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects invalid periods before making an RPC request", async () => {
    const result = await fetchSupplierPostedPayableActivity({ ...request, from: "2026-02-31" });
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
