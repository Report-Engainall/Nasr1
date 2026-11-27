import { describe, expect, it } from "vitest";
import { buildDecisionOutcomeDisplayScope } from "./decision-outcome-display";

const asOf = "2026-10-31T09:00:00.000Z";
function savedOutcome(ruleId: string, evidenceIds: string[], metricKey: string, candidateId = ruleId + ":snapshot") {
  return {
    ruleId,
    candidateId,
    candidateSnapshot: {
      proof: { evidenceIds, metricKeys: [metricKey], asOf },
    },
  };
}
const productMetric = "product.revenue.top5_concentration_change:YER";
const supplierMetric = "supplier.posted_payable.top5_concentration_change:YER";

describe("decision outcome display scope", () => {
  it("shows product concentration currency and both verified comparison windows", () => {
    const result = buildDecisionOutcomeDisplayScope(savedOutcome(
      "finance.product-concentration.review-increase.YER",
      [
        "rpc:product-revenue-concentration:YER:2026-08-01:2026-10-31:" + asOf,
        "rpc:product-revenue-concentration:YER:2026-05-01:2026-07-31:" + asOf,
      ],
      productMetric,
    ));
    expect(result).toMatchObject({
      label: "تركيز مبيعات المنتجات",
      currency: "YER",
      period: { from: "2026-08-01", to: "2026-10-31" },
      baselinePeriod: { from: "2026-05-01", to: "2026-07-31" },
      asOf,
      measurementKind: "RATIO",
    });
    expect(result.sourceNote).toContain("لقطتا RPC تجميعيّتان");
  });

  it("keeps supplier concentration separate from product concentration", () => {
    const result = buildDecisionOutcomeDisplayScope(savedOutcome(
      "finance.supplier-concentration.review-increase.USD",
      [
        "rpc:supplier-posted-payable-activity:USD:2026-08-01:2026-10-31:" + asOf,
        "rpc:supplier-posted-payable-activity:USD:2026-05-01:2026-07-31:" + asOf,
      ],
      "supplier.posted_payable.top5_concentration_change:USD",
    ));
    expect(result).toMatchObject({
      label: "تركيز التزامات الموردين",
      currency: "USD",
      period: { from: "2026-08-01", to: "2026-10-31" },
      baselinePeriod: { from: "2026-05-01", to: "2026-07-31" },
      measurementKind: "RATIO",
    });
  });

  it("withholds periods when one of the evidence snapshots is cross-currency", () => {
    const result = buildDecisionOutcomeDisplayScope(savedOutcome(
      "finance.product-concentration.review-increase.YER",
      [
        "rpc:product-revenue-concentration:YER:2026-08-01:2026-10-31:" + asOf,
        "rpc:product-revenue-concentration:USD:2026-05-01:2026-07-31:" + asOf,
      ],
      productMetric,
    ));
    expect(result.currency).toBe("YER");
    expect(result.period).toBeNull();
    expect(result.baselinePeriod).toBeNull();
    expect(result.measurementKind).toBe("RATIO");
  });

  it("keeps the existing receivables scope as a currency measurement", () => {
    const result = buildDecisionOutcomeDisplayScope({
      ruleId: "cashflow.collection.followup",
      candidateId: "cashflow.expected_collections:YER:2026-10-01:2026-10-31",
      candidateSnapshot: null,
    });
    expect(result).toMatchObject({
      label: "التحصيلات المجدولة",
      currency: "YER",
      period: { from: "2026-10-01", to: "2026-10-31" },
      measurementKind: "CURRENCY",
    });
  });

  it("withholds windows longer than the source RPC's 366-day maximum", () => {
    const result = buildDecisionOutcomeDisplayScope(savedOutcome(
      "finance.product-concentration.review-increase.YER",
      [
        "rpc:product-revenue-concentration:YER:2024-01-01:2024-12-31:" + asOf,
        "rpc:product-revenue-concentration:YER:2025-01-01:2025-12-31:" + asOf,
      ],
      productMetric,
    ));
    expect(result.period).toBeNull();
    expect(result.baselinePeriod).toBeNull();
  });

  it("rejects timezone-less snapshot timestamps", () => {
    const noZone = "2026-10-31T09:00:00";
    const result = buildDecisionOutcomeDisplayScope(savedOutcome(
      "finance.product-concentration.review-increase.YER",
      [
        "rpc:product-revenue-concentration:YER:2026-08-01:2026-10-31:" + noZone,
        "rpc:product-revenue-concentration:YER:2026-05-01:2026-07-31:" + noZone,
      ],
      productMetric,
    ));
    expect(result.period).toBeNull();
    expect(result.asOf).toBeNull();
  });

  it("does not parse an invalid calendar period or an unrelated rule as concentration", () => {
    const invalid = buildDecisionOutcomeDisplayScope(savedOutcome(
      "finance.product-concentration.review-increase.YER",
      [
        "rpc:product-revenue-concentration:YER:2026-02-30:2026-04-30:" + asOf,
        "rpc:product-revenue-concentration:YER:2026-05-01:2026-07-30:" + asOf,
      ],
      productMetric,
    ));
    expect(invalid.period).toBeNull();
    const unrelated = buildDecisionOutcomeDisplayScope({
      ruleId: "finance.other.review.YER",
      candidateId: "finance.other.review.YER:metric",
      candidateSnapshot: null,
    });
    expect(unrelated.currency).toBeNull();
    expect(unrelated.measurementKind).toBe("UNKNOWN");
  });
});
