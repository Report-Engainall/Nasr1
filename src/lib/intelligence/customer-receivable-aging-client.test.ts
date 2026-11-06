import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchExecutiveCustomerReceivableAging } from "./customer-receivable-aging-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const asOf = "2026-11-07T00:00:00.000Z";
const item = (currency: string, amount: string, invoiceId: string) => ({
  customerName: "شركة الاختبار",
  customerNameStatus: "VERIFIED",
  currency,
  totalOutstanding: amount,
  overdueAmount: amount,
  invoiceCount: 1,
  partiallyPaidCount: 0,
  oldestAgeDays: 45,
  status: "VERIFIED",
  agingBuckets: [{
    bucket: "OVERDUE_31_60",
    amount,
    invoiceCount: 1,
    partiallyPaidCount: 0,
    oldestAgeDays: 45,
    evidenceIds: ["customer-invoice:" + invoiceId],
  }],
  asOf,
  formulaId: "receivables.customer-invoice-aging",
  formulaVersion: "1.0.0",
  calculatedAt: asOf,
  warnings: [],
});
const response = (items: unknown[]) => ({
  status: "VERIFIED",
  asOf,
  totalGroups: items.length,
  returnedGroups: items.length,
  unresolvedRows: 0,
  complete: true,
  items,
  warnings: [],
});

describe("customer receivable ageing source contract", () => {
  beforeEach(() => rpc.mockReset());

  it("keeps each customer currency as a separate reconciled group", async () => {
    rpc.mockResolvedValue({
      data: response([
        item("YER", "1000.00", "11111111-1111-4111-8111-111111111111"),
        item("USD", "25.50", "22222222-2222-4222-8222-222222222222"),
      ]),
      error: null,
    });
    const result = await fetchExecutiveCustomerReceivableAging();
    expect(rpc).toHaveBeenCalledWith("fetch_executive_receivable_customer_aging");
    expect(result).toMatchObject({
      ok: true,
      data: { status: "VERIFIED", complete: true, returnedGroups: 2,
        items: [{ currency: "YER", totalOutstanding: 1000 }, { currency: "USD", totalOutstanding: 25.5 }] },
    });
  });

  it("fails closed when bucket totals do not reconcile with the customer total", async () => {
    rpc.mockResolvedValue({
      data: response([{
        ...item("YER", "1000.00", "11111111-1111-4111-8111-111111111111"),
        agingBuckets: [{ ...item("YER", "1000.00", "11111111-1111-4111-8111-111111111111").agingBuckets[0], amount: "900.00" }],
      }]),
      error: null,
    });
    expect(await fetchExecutiveCustomerReceivableAging()).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects malformed currencies instead of merging or normalizing them", async () => {
    rpc.mockResolvedValue({
      data: response([item("YER ", "1000.00", "11111111-1111-4111-8111-111111111111")]),
      error: null,
    });
    expect(await fetchExecutiveCustomerReceivableAging()).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("preserves partial source coverage and reports finance permission denial", async () => {
    rpc.mockResolvedValueOnce({
      data: { ...response([item("YER", "1000.00", "11111111-1111-4111-8111-111111111111")]),
        status: "PARTIAL", unresolvedRows: 1, complete: false,
        warnings: ["توجد فواتير مفتوحة غير مكتملة."] },
      error: null,
    });
    expect(await fetchExecutiveCustomerReceivableAging()).toMatchObject({ ok: true, data: { status: "PARTIAL", complete: false, unresolvedRows: 1 } });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(await fetchExecutiveCustomerReceivableAging()).toMatchObject({ ok: false, status: "DENIED" });
  });
});
