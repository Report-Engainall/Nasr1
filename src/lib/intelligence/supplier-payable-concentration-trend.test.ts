import { describe, expect, it } from "vitest";
import type { SupplierPostedPayableActivitySnapshot } from "./supplier-posted-payable-activity-client";
import { buildSupplierPayableConcentrationTrend } from "./supplier-payable-concentration-trend";

const asOf = "2026-11-06T05:00:00.000Z";
function snapshot(
  period: { from: string; to: string },
  percent: number,
  overrides: Partial<SupplierPostedPayableActivitySnapshot> = {},
): SupplierPostedPayableActivitySnapshot {
  return {
    status: "VERIFIED",
    asOf,
    period,
    completeSourceAggregation: true,
    sourceEntryCount: 18,
    currencyCount: 1,
    currencies: [{
      currency: "YER",
      status: "VERIFIED",
      supplierCount: 8,
      sourceEntryCount: 18,
      grossPayableCreditAmount: 1000,
      postedSupplierCreditNoteDebitAmount: 0,
      netPayableMovementAmount: 1000,
      top5GrossPayableCreditAmount: percent * 10,
      top5GrossPayableCreditPercent: percent,
    }],
    activityScope: "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS",
    formulaId: "nasr1.posted-supplier-payable-credit-concentration",
    formulaVersion: "1",
    formulaDescription: "test",
    ...overrides,
  };
}

describe("posted supplier payable concentration trend", () => {
  it("compares equal adjacent periods and reports percentage-point change", () => {
    const result = buildSupplierPayableConcentrationTrend(
      snapshot({ from: "2026-10-07", to: "2026-11-06" }, 72),
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61),
    );
    expect(result).toMatchObject({
      status: "VERIFIED",
      formulaId: "nasr1.top5-posted-supplier-payable-concentration-period-delta",
      comparisons: [{
        currency: "YER",
        currentPercent: 72,
        baselinePercent: 61,
        changePercentagePoints: 11,
        direction: "INCREASED",
        currentSupplierCount: 8,
        baselineSupplierCount: 8,
      }],
    });
  });

  it("withholds the concentration trend when either period has five or fewer suppliers", () => {
    const base = snapshot({ from: "2026-10-07", to: "2026-11-06" }, 72);
    const current = {
      ...base,
      currencies: [{ ...base.currencies[0], supplierCount: 5 }],
    };
    const result = buildSupplierPayableConcentrationTrend(
      current,
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61),
    );
    expect(result.status).toBe("NOT_COMPARABLE");
    expect(result.withheld).toEqual([{ currency: "YER", reason: "INSUFFICIENT_SUPPLIER_DIVERSITY" }]);
    expect(result.comparisons).toHaveLength(0);
  });

  it("refuses different as-of instants and unequal or non-adjacent periods", () => {
    expect(buildSupplierPayableConcentrationTrend(
      snapshot({ from: "2026-10-07", to: "2026-11-06" }, 72),
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61, { asOf: "2026-11-06T05:01:00.000Z" }),
    )).toMatchObject({ status: "NOT_COMPARABLE", warnings: ["SUPPLIER_TREND_AS_OF_MISMATCH"] });

    expect(buildSupplierPayableConcentrationTrend(
      snapshot({ from: "2026-10-08", to: "2026-11-06" }, 72),
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61),
    )).toMatchObject({ status: "NOT_COMPARABLE", warnings: ["SUPPLIER_TREND_PERIODS_NOT_ADJACENT_AND_EQUAL"] });
  });

  it("rejects duplicate currency rows instead of silently overwriting them in a Map", () => {
    const base = snapshot({ from: "2026-10-07", to: "2026-11-06" }, 72);
    const duplicate = {
      ...base,
      sourceEntryCount: 36,
      currencyCount: 2,
      currencies: [base.currencies[0], { ...base.currencies[0] }],
    };
    expect(buildSupplierPayableConcentrationTrend(
      duplicate,
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61),
    )).toMatchObject({
      status: "NOT_COMPARABLE",
      warnings: ["SUPPLIER_TREND_SOURCE_CONTRACT_INVALID"],
      comparisons: [],
    });
  });

  it("rejects inconsistent source row totals and currency population metadata", () => {
    const base = snapshot({ from: "2026-10-07", to: "2026-11-06" }, 72);
    expect(buildSupplierPayableConcentrationTrend(
      { ...base, sourceEntryCount: 19 },
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61),
    )).toMatchObject({ status: "NOT_COMPARABLE", warnings: ["SUPPLIER_TREND_SOURCE_CONTRACT_INVALID"] });

    expect(buildSupplierPayableConcentrationTrend(
      { ...base, currencyCount: 2 },
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61),
    )).toMatchObject({ status: "NOT_COMPARABLE", warnings: ["SUPPLIER_TREND_SOURCE_CONTRACT_INVALID"] });
  });

  it("rejects one-cent net movement and one-hundredth concentration mismatches", () => {
    const base = snapshot({ from: "2026-10-07", to: "2026-11-06" }, 72);
    const netMismatch = {
      ...base,
      currencies: [{ ...base.currencies[0], netPayableMovementAmount: 999.99 }],
    };
    expect(buildSupplierPayableConcentrationTrend(
      netMismatch,
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61),
    )).toMatchObject({ status: "NOT_COMPARABLE", warnings: ["SUPPLIER_TREND_SOURCE_CONTRACT_INVALID"] });

    const percentMismatch = {
      ...base,
      currencies: [{ ...base.currencies[0], top5GrossPayableCreditPercent: 71.99 }],
    };
    expect(buildSupplierPayableConcentrationTrend(
      percentMismatch,
      snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61),
    )).toMatchObject({ status: "NOT_COMPARABLE", warnings: ["SUPPLIER_TREND_SOURCE_CONTRACT_INVALID"] });
  });

  it("compares available currencies and withholds a currency missing from the baseline", () => {
    const currentBase = snapshot({ from: "2026-10-07", to: "2026-11-06" }, 72);
    const baselineBase = snapshot({ from: "2026-09-06", to: "2026-10-06" }, 61);
    const current = {
      ...currentBase,
      currencyCount: 2,
      sourceEntryCount: 36,
      currencies: [
        currentBase.currencies[0],
        { ...currentBase.currencies[0], currency: "USD", top5GrossPayableCreditAmount: 650, top5GrossPayableCreditPercent: 65 },
      ],
    };
    const baseline = {
      ...baselineBase,
      currencies: [
        { ...baselineBase.currencies[0], currency: "USD", top5GrossPayableCreditAmount: 600, top5GrossPayableCreditPercent: 60 },
      ],
    };
    const result = buildSupplierPayableConcentrationTrend(current, baseline);
    expect(result.status).toBe("PARTIAL");
    expect(result.comparisons).toMatchObject([{ currency: "USD", changePercentagePoints: 5 }]);
    expect(result.withheld).toEqual([{ currency: "YER", reason: "BASELINE_CURRENCY_MISSING" }]);
  });
});
