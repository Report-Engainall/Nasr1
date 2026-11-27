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
      evidenceIds: [] as string[],
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

  it.each([
    ["+14:00", "2026-11-14T12:00:00.000+14:00"],
    ["-14:00", "2026-11-13T08:00:00.000-14:00"],
  ])("accepts the ISO maximum UTC offset %s", async (_label, offsetAsOf) => {
    const validItem = { ...item(customerA, 111), asOf: offsetAsOf, calculatedAt: offsetAsOf };
    rpc.mockResolvedValue({ data: { ...response([validItem]), asOf: offsetAsOf }, error: null });
    await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: true });
  });

  it("rejects offsets beyond the ISO maximum in the report timestamp", async () => {
    for (const invalidAsOf of [
      "2026-11-14T12:01:00.000+14:01",
      "2026-11-13T07:59:00.000-14:01",
      "2026-11-14T23:59:00.000+23:59",
    ]) {
      rpc.mockResolvedValue({ data: { ...response([item(customerA, 111)]), asOf: invalidAsOf }, error: null });
      await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: false, status: "ERROR" });
    }
  });

  it("accepts exact six-digit PostgreSQL microseconds and rejects finer precision", async () => {
    const precise = "2026-11-13T22:00:00.123456Z";
    const validItem = { ...item(customerA, 111), asOf: precise, calculatedAt: precise };
    rpc.mockResolvedValue({ data: { ...response([validItem]), asOf: precise }, error: null });
    await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: true });

    const invalidItem = { ...item(customerA, 111), calculatedAt: "2026-11-13T22:00:00.1234567Z" };
    rpc.mockResolvedValue({ data: response([invalidItem]), error: null });
    await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: false, status: "ERROR" });

    const futureCalculation = { ...item(customerA, 111), calculatedAt: "2026-11-13T22:00:00.000001Z" };
    rpc.mockResolvedValue({ data: response([futureCalculation]), error: null });
    await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects timezone-less and impossible as-of timestamps", async () => {
    for (const invalidAsOf of ["2026-11-13T22:00:00", "2026-02-31T22:00:00.000Z", "2026-11-13T22:00:00.1234567Z"]) {
      rpc.mockResolvedValue({ data: { ...response([item(customerA, 111)]), asOf: invalidAsOf }, error: null });
      await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: false, status: "ERROR" });
    }
  });

  it("rejects numeric-looking non-decimal currency payloads", async () => {
    const malformed = item(customerA, 111);
    malformed.totalOutstanding = "1e2" as unknown as number;
    rpc.mockResolvedValue({ data: response([malformed]), error: null });
    await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it.each([
    ["invoice count", { invoiceCount: 2 }],
    ["partial payment count", { partiallyPaidCount: 1 }],
    ["oldest age", { oldestAgeDays: 99 }],
  ])("rejects a bucket aggregate that does not reconcile its %s", async (_label, changed) => {
    const malformed = item(customerA, 111);
    malformed.agingBuckets = [{ ...malformed.agingBuckets[0], ...changed }];
    rpc.mockResolvedValue({ data: response([malformed]), error: null });
    await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("accepts the SQL-bounded maximum of 75 combined invoice, payment and credit evidence references", async () => {
    const valid = item(customerA, 111);
    valid.agingBuckets[0].evidenceIds = Array.from({ length: 75 }, (_, index) => "source:" + index);
    rpc.mockResolvedValue({ data: response([valid]), error: null });
    await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: true });
  });

  it("rejects more than the SQL-bounded evidence reference limit", async () => {
    const malformed = item(customerA, 111);
    malformed.agingBuckets[0].evidenceIds = Array.from({ length: 76 }, (_, index) => "source:" + index);
    rpc.mockResolvedValue({ data: response([malformed]), error: null });
    await expect(fetchExecutiveCustomerReceivableAging()).resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects an actual duplicate customer UUID and currency group", async () => {
    rpc.mockResolvedValue({ data: response([item(customerA, 111), item(customerA, 111)]), error: null });

    const result = await fetchExecutiveCustomerReceivableAging();

    expect(result).toMatchObject({ ok: false, status: "ERROR" });
  });
});
