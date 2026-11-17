import { describe, expect, it } from "vitest";
import { buildSupplierPayableConcentrationTrend } from "./supplier-payable-concentration-trend";
import type { SupplierPostedPayableActivitySnapshot } from "./supplier-posted-payable-activity-client";

const asOf = "2026-11-17T12:00:00.000Z";
const scope = "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS" as const;
const formulaId = "nasr1.posted-supplier-payable-credit-concentration" as const;

function row(currency: string, overrides: Record<string, unknown> = {}) {
  return {
    currency,
    status: "VERIFIED" as const,
    supplierCount: 6,
    sourceEntryCount: 8,
    grossPayableCreditAmount: 1000,
    postedSupplierCreditNoteDebitAmount: 125,
    netPayableMovementAmount: 875,
    top5GrossPayableCreditAmount: 800,
    top5GrossPayableCreditPercent: 80,
    ...overrides,
  };
}

function snapshot(
  period: { from: string; to: string },
  currencies = [row("YER")],
  status: "VERIFIED" | "NEEDS_REVIEW" | "EMPTY" = "VERIFIED",
): SupplierPostedPayableActivitySnapshot {
  return {
    status,
    asOf,
    period,
    completeSourceAggregation: true,
    sourceEntryCount: currencies.reduce((sum, item) => sum + Number(item.sourceEntryCount), 0),
    currencyCount: currencies.length,
    currencies: currencies as SupplierPostedPayableActivitySnapshot["currencies"],
    activityScope: scope,
    formulaId,
    formulaVersion: "1",
    formulaDescription: "Only source-linked posted supplier journals.",
  };
}

const currentPeriod = { from: "2026-08-18", to: "2026-11-17" };
const baselinePeriod = { from: "2026-05-18", to: "2026-08-17" };

describe("supplier payable concentration trend", () => {
  it("compares adjacent equal-length UTC windows within the same currency", () => {
    const current = snapshot(currentPeriod, [row("YER", { top5GrossPayableCreditAmount: 850, top5GrossPayableCreditPercent: 85 })]);
    const baseline = snapshot(baselinePeriod);
    expect(buildSupplierPayableConcentrationTrend(current, baseline)).toMatchObject({
      status: "VERIFIED",
      asOf,
      currentPeriod,
      baselinePeriod,
      comparisons: [{
        currency: "YER",
        currentPercent: 85,
        baselinePercent: 80,
        changePercentagePoints: 5,
        direction: "INCREASED",
        currentSupplierCount: 6,
        baselineSupplierCount: 6,
        currentEntryCount: 8,
        baselineEntryCount: 8,
      }],
      withheld: [],
    });
  });

  it("keeps currencies separate and withholds a currency absent from one period", () => {
    const current = snapshot(currentPeriod, [row("YER"), row("USD", { supplierCount: 7, sourceEntryCount: 9 })]);
    const baseline = snapshot(baselinePeriod, [row("YER")]);
    const result = buildSupplierPayableConcentrationTrend(current, baseline);
    expect(result.status).toBe("PARTIAL");
    expect(result.comparisons.map(item => item.currency)).toEqual(["YER"]);
    expect(result.withheld).toEqual([{ currency: "USD", reason: "BASELINE_CURRENCY_MISSING" }]);
  });

  it("withholds ratios when either period has five or fewer suppliers", () => {
    const current = snapshot(currentPeriod, [row("YER", { supplierCount: 5, sourceEntryCount: 8 })]);
    const result = buildSupplierPayableConcentrationTrend(current, snapshot(baselinePeriod));
    expect(result.status).toBe("NOT_COMPARABLE");
    expect(result.comparisons).toEqual([]);
    expect(result.withheld).toEqual([{ currency: "YER", reason: "INSUFFICIENT_SUPPLIER_DIVERSITY" }]);
  });

  it.each([
    ["wrong financial net", snapshot(currentPeriod, [row("YER", { netPayableMovementAmount: 874.99 })]), "SUPPLIER_TREND_SOURCE_CONTRACT_INVALID"],
    ["wrong concentration ratio", snapshot(currentPeriod, [row("YER", { top5GrossPayableCreditPercent: 80.01 })]), "SUPPLIER_TREND_SOURCE_CONTRACT_INVALID"],
    ["duplicate currency", snapshot(currentPeriod, [row("YER"), row("YER", { sourceEntryCount: 9, supplierCount: 6 })]), "SUPPLIER_TREND_SOURCE_CONTRACT_INVALID"],
    ["different as-of snapshots", { ...snapshot(currentPeriod), asOf: "2026-11-17T11:59:59.000Z" }, "SUPPLIER_TREND_AS_OF_MISMATCH"],
    ["overlapping periods", snapshot({ from: "2026-05-01", to: "2026-08-01" }), "SUPPLIER_TREND_PERIODS_NOT_ADJACENT_AND_EQUAL"],
  ])("fails closed for %s", (_name, changedCurrent, warning) => {
    const result = buildSupplierPayableConcentrationTrend(
      changedCurrent as SupplierPostedPayableActivitySnapshot,
      snapshot(baselinePeriod),
    );
    expect(result.status).toBe("NOT_COMPARABLE");
    expect(result.comparisons).toEqual([]);
    expect(result.warnings).toContain(warning);
  });

  it("does not calculate a delta when the previous period is empty", () => {
    const emptyBaseline = snapshot(baselinePeriod, [], "EMPTY");
    const result = buildSupplierPayableConcentrationTrend(snapshot(currentPeriod), emptyBaseline);
    expect(result.status).toBe("NOT_COMPARABLE");
    expect(result.comparisons).toEqual([]);
    expect(result.withheld).toContainEqual({ currency: "YER", reason: "BASELINE_CURRENCY_MISSING" });
  });
});
