import { describe, expect, it } from "vitest";
import { buildDemandScenario, buildProductDemandForecast } from "./demand-forecast";
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
  currentQuantityUnit?: MetricUnit;
  baselineQuantityUnit?: MetricUnit;
  currentOrdersUnit?: MetricUnit;
  baselineOrdersUnit?: MetricUnit;
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
      value: options.currentQuantity ?? "120.000000", unit: options.currentQuantityUnit ?? "QUANTITY",
      unitOfMeasure: options.currentUnit ?? "EA", period: currentPeriod, evidenceId: "current-evidence",
      formulaId: "nasr1.product-order-quantity",
    }),
    metric({
      id: "current-orders", key: "product.orders.sample_count",
      value: options.currentOrders ?? 10, unit: options.currentOrdersUnit ?? "COUNT", period: currentPeriod,
      evidenceId: "current-evidence", formulaId: "nasr1.product-order-sample-count",
    }),
    metric({
      id: "baseline-quantity", key: "product.order_items.quantity",
      value: options.baselineQuantity ?? "90.000000", unit: options.baselineQuantityUnit ?? "QUANTITY",
      unitOfMeasure: options.baselineUnit ?? "EA", period: baselinePeriod, evidenceId: "baseline-evidence",
      formulaId: "nasr1.product-order-quantity",
    }),
    metric({
      id: "baseline-orders", key: "product.orders.sample_count",
      value: options.baselineOrders ?? 10, unit: options.baselineOrdersUnit ?? "COUNT", period: baselinePeriod,
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
    });
    expect(result.forecasts[0].horizons.find((horizon) => horizon.days === 7)).toMatchObject({
      lowQuantity: 0,
      expectedQuantity: 7,
      highQuantity: 7,
    });
  });

  it("withholds a product when either non-zero period has fewer than five orders", () => {
    const result = fixture({ currentOrders: 4 });
    expect(result.forecasts).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "SAMPLE_INSUFFICIENT" }]);
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it.each([
    ["current quantity", { currentQuantityUnit: "TEXT" as const }],
    ["baseline quantity", { baselineQuantityUnit: "TEXT" as const }],
    ["current sample count", { currentOrdersUnit: "TEXT" as const }],
    ["baseline sample count", { baselineOrdersUnit: "TEXT" as const }],
  ])("withholds numeric-looking TEXT %s before forecast classification", (_label, options) => {
    const result = fixture(options);
    expect(result.forecasts).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "METRIC_SCOPE_MISMATCH" }]);
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

describe("demand forecast ISO timestamp offset contract", () => {
  function resultAt(timestamp: string) {
    return buildProductDemandForecast({
      id: "timestamp-offset-boundary",
      asOf: timestamp,
      period: currentPeriod,
      baselinePeriod,
      completePopulation: true,
      evidenceRecords: [],
      metrics: [],
      signals: [],
    });
  }

  for (const timestamp of [
    "2026-11-26T16:45:47.000+14:00",
    "2026-11-26T02:45:47.000-14:00",
  ]) {
    it("accepts the ISO maximum UTC offset " + timestamp.slice(-6), () => {
      expect(resultAt(timestamp).asOf).toBe(timestamp);
    });
  }

  for (const timestamp of [
    "2026-11-26T16:45:47.000+14:01",
    "2026-11-26T02:45:47.000-14:01",
    "2026-11-26T16:45:47.000+15:00",
    "2026-11-26T02:45:47.000-23:59",
  ]) {
    it("rejects an ISO UTC offset beyond 14 hours: " + timestamp.slice(-6), () => {
      expect(() => resultAt(timestamp)).toThrow("demand_forecast_id_or_timestamp_invalid");
    });
  }
});


describe("verified demand what-if scenario", () => {
  it("simulates a bounded user assumption across all three demand horizons and preserves evidence lineage", () => {
    const source = fixture();
    const result = buildDemandScenario({ forecast: source, productRef, changePercent: 20 });
    expect(result).toMatchObject({
      status: "SIMULATED",
      productRef,
      changePercent: 20,
      unitOfMeasure: "EA",
      assumptionBoundary: "USER_SUPPLIED",
      accountingFact: false,
      formulaId: "product-demand.what-if",
      evidenceIds: ["baseline-evidence", "current-evidence"],
      metricKeys: ["product.order_items.quantity", "product.orders.sample_count"],
      horizons: [
        { days: 7, baselineExpectedQuantity: 28, scenarioExpectedQuantity: 33.6, expectedDeltaQuantity: 5.6 },
        { days: 30, baselineExpectedQuantity: 120, scenarioExpectedQuantity: 144, expectedDeltaQuantity: 24 },
        { days: 90, baselineExpectedQuantity: 360, scenarioExpectedQuantity: 432, expectedDeltaQuantity: 72 },
      ],
    });
    expect(source.forecasts[0].horizons[0].expectedQuantity).toBe(28);
    expect(result.limitations).toContain("SIMULATION_ONLY_NO_BUSINESS_RECORD_MUTATION");
  });

  it("supports the lower bound of -100 percent without producing negative quantities", () => {
    const result = buildDemandScenario({ forecast: fixture(), productRef, changePercent: -100 });
    expect(result.status).toBe("SIMULATED");
    expect(result.horizons.every((item) =>
      item.scenarioLowQuantity === 0 && item.scenarioExpectedQuantity === 0 && item.scenarioHighQuantity === 0
    )).toBe(true);
  });

  it("supports the upper bound of +300 percent and rejects assumptions outside the declared range", () => {
    const maximum = buildDemandScenario({ forecast: fixture(), productRef, changePercent: 300 });
    expect(maximum.status).toBe("SIMULATED");
    expect(maximum.horizons[0].scenarioExpectedQuantity).toBe(112);
    expect(buildDemandScenario({ forecast: fixture(), productRef, changePercent: 301 }).reason).toBe("ASSUMPTION_OUT_OF_BOUNDS");
    expect(buildDemandScenario({ forecast: fixture(), productRef, changePercent: -100.5 }).reason).toBe("ASSUMPTION_OUT_OF_BOUNDS");
  });

  it("withholds when the population or forecast evidence is not verified", () => {
    expect(buildDemandScenario({ forecast: fixture({ completePopulation: false }), productRef, changePercent: 15 }).reason)
      .toBe("DEMAND_SOURCE_NOT_VERIFIED");
    const nonVerified = { ...fixture(), status: "NEEDS_REVIEW" as const };
    expect(buildDemandScenario({ forecast: nonVerified, productRef, changePercent: 15 }).status).toBe("WITHHELD");
  });

  it("withholds duplicated product rows and missing evidence lineage", () => {
    const source = fixture();
    expect(buildDemandScenario({
      forecast: { ...source, forecasts: [...source.forecasts, source.forecasts[0]] },
      productRef,
      changePercent: 15,
    }).reason).toBe("PRODUCT_NOT_UNIQUELY_AVAILABLE");
    const noEvidence = { ...source, forecasts: [{ ...source.forecasts[0], evidenceIds: [] }] };
    expect(buildDemandScenario({ forecast: noEvidence, productRef, changePercent: 15 }).reason)
      .toBe("PRODUCT_EVIDENCE_INCOMPLETE");
  });

  it("scales fractional quantities at six-decimal precision without floating-point percentage arithmetic", () => {
    const source = fixture({ currentQuantity: "1.000000", baselineQuantity: "0.500000" });
    const result = buildDemandScenario({ forecast: source, productRef, changePercent: 50 });
    expect(result.status).toBe("SIMULATED");
    expect(result.horizons[0]).toMatchObject({
      baselineExpectedQuantity: 0.233334,
      scenarioExpectedQuantity: 0.350001,
      expectedDeltaQuantity: 0.116667,
    });
  });
});
