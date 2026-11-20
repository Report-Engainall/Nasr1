import { afterEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { fetchExecutiveCustomerReceivableAging } from "./customer-receivable-aging-client";

const asOf = "2026-11-13T22:00:00.000Z";
const customerA = "11111111-1111-4111-8111-111111111111";
const customerB = "22222222-2222-4222-8222-222222222222";

function item(customerId: string, totalOutstanding: number) {
  return {
    customerId,
    customerName: "شركة الأغبري التجارية",
    customerNameStatus: "VERIFIED",
    currency: "YER",
    totalOutstanding,
    overdueAmount: totalOutstanding,
    invoiceCount: 1,
    partiallyPaidCount: 0,
    oldestAgeDays: 10,
    status: "VERIFIED",
    agingBuckets: [{
      bucket: "OVERDUE_1_30",
      amount: totalOutstanding,
      invoiceCount: 1,
      partiallyPaidCount: 0,
      oldestAgeDays: 10,
      evidenceIds: [],
    }],
    asOf,
    formulaId: "receivables.customer-invoice-aging",
    formulaVersion: "1.0.0",
    calculatedAt: asOf,
    warnings: [],
  };
}

function response(items: ReturnType<typeof item>[]) {
  return {
    status: "VERIFIED",
    asOf,
    complete: true,
    totalGroups: items.length,
    returnedGroups: items.length,
    unresolvedRows: 0,
    items,
    warnings: [],
  };
}

afterEach(() => vi.clearAllMocks());

describe("customer receivable aging client identity", () => {
  it("keeps different customer UUIDs separate when their display name and currency match", async () => {
    rpc.mockResolvedValue({ data: response([item(customerA, 111), item(customerB, 222)]), error: null });

    const result = await fetchExecutiveCustomerReceivableAging();

    expect(result).toMatchObject({
      ok: true,
      data: {
        complete: true,
        items: [
          { customerId: customerA, customerName: "شركة الأغبري التجارية", currency: "YER", totalOutstanding: 111 },
          { customerId: customerB, customerName: "شركة الأغبري التجارية", currency: "YER", totalOutstanding: 222 },
        ],
      },
    });
  });

  it("rejects an actual duplicate customer UUID and currency group", async () => {
    rpc.mockResolvedValue({ data: response([item(customerA, 111), item(customerA, 111)]), error: null });

    const result = await fetchExecutiveCustomerReceivableAging();

    expect(result).toMatchObject({ ok: false, status: "ERROR" });
  });
});
