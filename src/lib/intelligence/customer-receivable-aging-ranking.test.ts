import { describe, expect, it } from "vitest";
import { buildCustomerReceivableCollectionCandidateId, compareCustomerReceivableAgingRows } from "./customer-receivable-aging-ranking";

const row = (currency: string, overdueAmount: number, oldestAgeDays: number | null) => ({
  currency, overdueAmount, oldestAgeDays,
});

describe("customer receivable aging ranking", () => {
  it("prioritizes older debt before amount", () => {
    const olderSmall = row("YER", 10, 91);
    const youngerLarge = row("YER", 100000, 30);
    expect([youngerLarge, olderSmall].sort(compareCustomerReceivableAgingRows)).toEqual([olderSmall, youngerLarge]);
  });
  it("compares amounts only within the same currency", () => {
    const smaller = row("YER", 100, 45);
    const larger = row("YER", 900, 45);
    expect([smaller, larger].sort(compareCustomerReceivableAgingRows)).toEqual([larger, smaller]);
  });
  it("does not compare raw amounts across currencies", () => {
    const largeYER = row("YER", 900000, 45);
    const smallUSD = row("USD", 20, 45);
    expect([largeYER, smallUSD].sort(compareCustomerReceivableAgingRows)).toEqual([smallUSD, largeYER]);
    expect([smallUSD, largeYER].sort(compareCustomerReceivableAgingRows)).toEqual([smallUSD, largeYER]);
  });
  it("places undated debt after dated debt", () => {
    const unknown = row("YER", 100000, null);
    const dated = row("YER", 1, 1);
    expect([unknown, dated].sort(compareCustomerReceivableAgingRows)).toEqual([dated, unknown]);
  });

  it("creates distinct stable decision IDs for same-name customers using their immutable UUIDs", () => {
    const first = { customerId: "11111111-1111-4111-8111-111111111111", currency: "YER", asOf: "2026-11-13T22:00:00.000Z" };
    const second = { customerId: "22222222-2222-4222-8222-222222222222", currency: "YER", asOf: "2026-11-13T22:00:00.000Z" };
    expect(buildCustomerReceivableCollectionCandidateId(first)).toBe(
      "receivables.collection:11111111-1111-4111-8111-111111111111:YER:2026-11-13",
    );
    expect(buildCustomerReceivableCollectionCandidateId(second)).not.toBe(
      buildCustomerReceivableCollectionCandidateId(first),
    );
  });
});
