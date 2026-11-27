import { describe, expect, it } from "vitest";
import { buildConcentrationDecisionCandidates } from "./concentration-decisions";
import type { ProductRevenueConcentrationSnapshot } from "./product-revenue-concentration-client";
import type { SupplierPostedPayableActivitySnapshot } from "./supplier-posted-payable-activity-client";

const asOf = "2026-10-31T09:00:00.000Z";
const currentPeriod = { from: "2026-08-01", to: "2026-10-31" };
const baselinePeriod = { from: "2026-05-01", to: "2026-07-31" };

function productSnapshot(
  period: { from: string; to: string },
  percentages: Array<{ currency: string; percent: number }>,
): ProductRevenueConcentrationSnapshot {
  return {
    status: "VERIFIED",
    asOf,
    period,
    completePopulation: true,
    invoiceCount: percentages.length * 10,
    invoiceWithoutLinesCount: 0,
    currencyCount: percentages.length,
    currencies: percentages.map(row => ({
      currency: row.currency,
      status: "VERIFIED",
      invoiceCount: 10,
      invoiceLineCount: 20,
      productCount: 8,
      mappedLineCount: 20,
      unmappedLineCount: 0,
      invalidCreditLineCount: 0,
      invoicesWithoutLines: 0,
      grossInvoiceLineAmount: 2000,
      netInvoiceLineAmount: 1800,
      top5NetInvoiceLineAmount: 1800 * row.percent / 100,
      top5ConcentrationPercent: row.percent,
    })),
    formulaId: "nasr1.invoice-line-product-concentration-net-posted-credit-memos",
    formulaVersion: "1",
    formulaDescription: "verified product revenue concentration",
  };
}
function supplierSnapshot(
  period: { from: string; to: string },
  percentages: Array<{ currency: string; percent: number }>,
): SupplierPostedPayableActivitySnapshot {
  return {
    status: "VERIFIED",
    asOf,
    period,
    completeSourceAggregation: true,
    sourceEntryCount: percentages.length * 8,
    currencyCount: percentages.length,
    currencies: percentages.map(row => ({
      currency: row.currency,
      status: "VERIFIED",
      supplierCount: 6,
      sourceEntryCount: 8,
      grossPayableCreditAmount: 1000,
      postedSupplierCreditNoteDebitAmount: 100,
      netPayableMovementAmount: 900,
      top5GrossPayableCreditAmount: 1000 * row.percent / 100,
      top5GrossPayableCreditPercent: row.percent,
    })),
    activityScope: "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS",
    formulaId: "nasr1.posted-supplier-payable-credit-concentration",
    formulaVersion: "1",
    formulaDescription: "verified posted supplier activity",
  };
}

describe("concentration-driven daily decisions", () => {
  it("creates separate, source-backed review decisions for product and supplier concentration increases by currency", () => {
    const result = buildConcentrationDecisionCandidates({
      generatedAt: asOf,
      productBaseline: productSnapshot(baselinePeriod, [{ currency: "YER", percent: 75 }, { currency: "USD", percent: 80 }]),
      productCurrent: productSnapshot(currentPeriod, [{ currency: "YER", percent: 82 }, { currency: "USD", percent: 78 }]),
      supplierBaseline: supplierSnapshot(baselinePeriod, [{ currency: "YER", percent: 80 }, { currency: "USD", percent: 85 }]),
      supplierCurrent: supplierSnapshot(currentPeriod, [{ currency: "YER", percent: 86 }, { currency: "USD", percent: 82 }]),
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map(item => item.ruleId).sort()).toEqual([
      "finance.product-concentration.review-increase.YER",
      "finance.supplier-concentration.review-increase.YER",
    ]);
    expect(result.candidates.every(item => item.impact === null && item.impactStatus === "NOT_CONFIGURED")).toBe(true);
    expect(result.candidates[0].proof.evidenceIds).toHaveLength(2);
    expect(result.candidates[0].proof.asOf).toBe(asOf);
    expect(result.evidenceRecords).toHaveLength(4);
    expect(result.metrics).toHaveLength(2);
    expect(result.metrics.every(item => item.unit === "RATIO" && item.currency === undefined)).toBe(true);
    expect(result.candidates.every(item => item.proof.evidenceIds.every(id => id.includes(":YER:")))).toBe(true);
  });

  it("withholds decisions when the product windows are not adjacent and never converts missing supplier history into zero", () => {
    const result = buildConcentrationDecisionCandidates({
      generatedAt: asOf,
      productBaseline: productSnapshot({ from: "2026-04-30", to: "2026-07-30" }, [{ currency: "YER", percent: 75 }]),
      productCurrent: productSnapshot(currentPeriod, [{ currency: "YER", percent: 82 }]),
      supplierBaseline: null,
      supplierCurrent: supplierSnapshot(currentPeriod, [{ currency: "YER", percent: 86 }]),
    });

    expect(result.candidates).toEqual([]);
    expect(result.metrics).toEqual([]);
    expect(result.withheld).toContain("PRODUCT_CONCENTRATION_PERIOD_OR_EVIDENCE_NOT_COMPARABLE");
  });

  it("does not recommend anything for flat or falling concentration", () => {
    const result = buildConcentrationDecisionCandidates({
      generatedAt: asOf,
      productBaseline: productSnapshot(baselinePeriod, [{ currency: "YER", percent: 80 }]),
      productCurrent: productSnapshot(currentPeriod, [{ currency: "YER", percent: 80 }]),
      supplierBaseline: supplierSnapshot(baselinePeriod, [{ currency: "YER", percent: 85 }]),
      supplierCurrent: supplierSnapshot(currentPeriod, [{ currency: "YER", percent: 80 }]),
    });
    expect(result.candidates).toEqual([]);
  });
});
