import { describe, expect, it } from "vitest";
import { buildProductDemandForecast } from "./demand-forecast";
import type { GrowthOpportunitySignal } from "./growth-opportunities";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot, MetricUnit } from "./types";

const asOf = "2026-11-26T02:45:47.000Z";
const currentPeriod: EvidencePeriod = { from: "2026-10-28", to: "2026-11-26" };
const baselinePeriod: EvidencePeriod = { from: "2026-09-28", to: "2026-10-27" };
const productRef = "7f8d9c11-1234-4abc-8abc-1234567890ab";

function evidence(id: string, period: EvidencePeriod): EvidenceRecord {
  return {
    id,
    source: { kind: "RPC", name: "product-performance-aggregate", version: "1" },
    sourceTimestamp: asOf,
    asOf,
    period,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

function metric(input: {
  id: string;
  key: string;
  value: number | string;
  unit: MetricUnit;
  period: EvidencePeriod;
  evidenceId: string;
  unitOfMeasure?: string;
  formulaId?: string;
}): MetricSnapshot {
  return {
    id: input.id,
    key: input.key,
    value: input.value,
    unit: input.unit,
    ...(input.unitOfMeasure ? { unitOfMeasure: input.unitOfMeasure } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: input.period,
    asOf,
    lineage: {
      evidenceIds: [input.evidenceId],
      calculatedAt: asOf,
      formulaId: input.formulaId ?? input.key + ".v1",
      formulaVersion: "1",
      transformations: ["same-tenant order-line aggregate"],
    },
    warnings: [],
  };
}

const signal: GrowthOpportunitySignal = {
  id: "product-performance:" + productRef + ":EA",
  kind: "PRODUCT_PERFORMANCE_CHANGE",
  subjectRef: productRef,
  subjectLabel: "أرز بسمتي · EA",
  observedMetricId: "current-quantity",
  sampleMetricId: "current-orders",
  baselineMetricId: "baseline-quantity",
  baselineSampleMetricId: "baseline-orders",
};

function fixture(options: {
  currentQuantity?: number | string;
  baselineQuantity?: number | string;
  currentOrders?: number;
  baselineOrders?: number;
  currentUnit?: string;
  baselineUnit?: string;
  completePopulation?: boolean;
  signal?: Partial<GrowthOpportunitySignal>;
} = {}) {
  const records = [
    evidence("current-evidence", currentPeriod),
    evidence("baseline-evidence", baselinePeriod),
  ];
  const metrics = [
    metric({
      id: "current-quantity", key: "product.order_items.quantity",
      value: options.currentQuantity ?? "120.000000", unit: "QUANTITY",
      unitOfMeasure: options.currentUnit ?? "EA", period: currentPeriod, evidenceId: "current-evidence",
      formulaId: "nasr1.product-order-quantity",
    }),
    metric({
      id: "current-orders", key: "product.orders.sample_count",
      value: options.currentOrders ?? 10, unit: "COUNT", period: currentPeriod,
      evidenceId: "current-evidence", formulaId: "nasr1.product-order-sample-count",
    }),
    metric({
      id: "baseline-quantity", key: "product.order_items.quantity",
      value: options.baselineQuantity ?? "90.000000", unit: "QUANTITY",
      unitOfMeasure: options.baselineUnit ?? "EA", period: baselinePeriod, evidenceId: "baseline-evidence",
      formulaId: "nasr1.product-order-quantity",
    }),
    metric({
      id: "baseline-orders", key: "product.orders.sample_count",
      value: options.baselineOrders ?? 10, unit: "COUNT", period: baselinePeriod,
      evidenceId: "baseline-evidence", formulaId: "nasr1.product-order-sample-count",
    }),
  ];
  return buildProductDemandForecast({
    id: "demand-fixture",
    asOf,
    period: currentPeriod,
    baselinePeriod,
    completePopulation: options.completePopulation ?? true,
    evidenceRecords: records,
    metrics,
    signals: [{ ...signal, ...options.signal }],
  });
}

describe("evidence-backed product demand forecast", () => {
  it("forecasts 7, 30 and 90 days from the current verified rate and observed two-period rate envelope", () => {
    const result = fixture();
    expect(result).toMatchObject({
      status: "VERIFIED",
      completePopulation: true,
      forecasts: [{
        productRef,
        trend: "INCREASING",
        currentDailyDemand: 4,
        baselineDailyDemand: 3,
        changePercentHundredths: 3_333,
        currentOrders: 10,
        baselineOrders: 10,
        horizons: [
          { days: 7, lowQuantity: 21, expectedQuantity: 28, highQuantity: 28 },
          { days: 30, lowQuantity: 90, expectedQuantity: 120, highQuantity: 120 },
          { days: 90, lowQuantity: 270, expectedQuantity: 360, highQuantity: 360 },
        ],
        warnings: expect.arrayContaining([
          "SCENARIO_ENVELOPE_IS_OBSERVED_RATE_RANGE_NOT_A_CONFIDENCE_INTERVAL",
          "NO_SEASONALITY_PROMOTION_OR_STOCKOUT_ADJUSTMENT",
        ]),
      }],
      withheld: [],
    });
  });

  it("rounds fractional forecast quantities upward to the source precision", () => {
    const result = fixture({ currentQuantity: "1.000000", baselineQuantity: "0.500000" });
    expect(result.forecasts[0].horizons[0]).toMatchObject({
      days: 7,
      lowQuantity: 0.116667,
      expectedQuantity: 0.233334,
      highQuantity: 0.233334,
    });
  });

  it("classifies a newly observed demand without inventing a percentage over a zero baseline", () => {
    const result = fixture({
      currentQuantity: "30.000000",
      baselineQuantity: "0.000000",
      currentOrders: 5,
      baselineOrders: 0,
    });
    expect(result.forecasts[0]).toMatchObject({
      trend: "NEW_ACTIVITY",
      changePercentHundredths: null,
      horizons: [
        { days: 7, lowQuantity: 0, expectedQuantity: 7, highQuantity: 7 },
      ],
    });
  });

  it("withholds a product when either non-zero period has fewer than five orders", () => {
    const result = fixture({ currentOrders: 4 });
    expect(result.forecasts).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "SAMPLE_INSUFFICIENT" }]);
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it("does not compare incompatible units, even when quantities have the same numeric scale", () => {
    const result = fixture({ currentUnit: "EA", baselineUnit: "CARTON" });
    expect(result.forecasts).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "INVALID_COMPARISON" }]);
  });

  it("requires an explicit complete source population for a VERIFIED result", () => {
    const result = fixture({ completePopulation: false });
    expect(result.forecasts).toHaveLength(1);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.warnings).toContain("DEMAND_SOURCE_POPULATION_INCOMPLETE");
  });

  it("rejects non-adjacent, unequal or future periods instead of forecasting from them", () => {
    expect(() => buildProductDemandForecast({
      id: "invalid-period",
      asOf,
      period: currentPeriod,
      baselinePeriod: { from: "2026-09-27", to: "2026-10-26" },
      completePopulation: true,
      evidenceRecords: [],
      metrics: [],
      signals: [],
    })).toThrow("demand_forecast_periods_not_comparable");
  });

  it("treats a verified empty product population as an empty forecast, not an unavailable source", () => {
    const result = buildProductDemandForecast({
      id: "empty-product-population",
      asOf,
      period: currentPeriod,
      baselinePeriod,
      completePopulation: true,
      evidenceRecords: [],
      metrics: [],
      signals: [],
    });
    expect(result.status).toBe("VERIFIED");
    expect(result.forecasts).toHaveLength(0);
    expect(result.withheld).toHaveLength(0);
  });

  it("does not forecast from missing evidence", () => {
    const result = buildProductDemandForecast({
      id: "missing-evidence",
      asOf,
      period: currentPeriod,
      baselinePeriod,
      completePopulation: true,
      evidenceRecords: [],
      metrics: [
        metric({ id: "current-quantity", key: "product.order_items.quantity", value: 120, unit: "QUANTITY", unitOfMeasure: "EA", period: currentPeriod, evidenceId: "missing-current" }),
      ],
      signals: [signal],
    });
    expect(result.forecasts).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "METRIC_NOT_VERIFIED" }]);
  });
});
