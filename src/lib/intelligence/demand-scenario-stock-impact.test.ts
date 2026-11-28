import { describe, expect, it } from "vitest";
import { buildDemandScenarioStockImpact } from "./demand-scenario-stock-impact";
import type { DemandScenarioResult } from "./demand-forecast";
import type { ReplenishmentRecommendation } from "./replenishment";

const scenario: DemandScenarioResult = {
  id: "demand-scenario:test", status: "SIMULATED", reason: null,
  productRef: "product-1", productLabel: "منتج تجريبي", unitOfMeasure: "EA",
  changePercent: 50, asOf: "2026-11-28T10:00:00.000Z",
  period: { from: "2026-10-28", to: "2026-11-26" },
  baselinePeriod: { from: "2026-09-28", to: "2026-10-27" },
  horizons: [
    { days: 7, baselineLowQuantity: 10, baselineExpectedQuantity: 14, baselineHighQuantity: 14, scenarioLowQuantity: 15, scenarioExpectedQuantity: 21, scenarioHighQuantity: 21, expectedDeltaQuantity: 7 },
    { days: 30, baselineLowQuantity: 40, baselineExpectedQuantity: 60, baselineHighQuantity: 60, scenarioLowQuantity: 60, scenarioExpectedQuantity: 90, scenarioHighQuantity: 90, expectedDeltaQuantity: 30 },
    { days: 90, baselineLowQuantity: 120, baselineExpectedQuantity: 180, baselineHighQuantity: 180, scenarioLowQuantity: 180, scenarioExpectedQuantity: 270, scenarioHighQuantity: 270, expectedDeltaQuantity: 90 },
  ],
  evidenceIds: ["demand-a","demand-b"],
  metricKeys: ["product.order_items.quantity","product.orders.sample_count"],
  formulaVersions: ["quantity@1","sample@1"],
  formulaId: "product-demand.what-if", formulaVersion: "1.0.0",
  assumptionBoundary: "USER_SUPPLIED", accountingFact: false, limitations: [],
};

const recommendation: ReplenishmentRecommendation = {
  productRef: "product-1", status: "VERIFIED", action: "RECOMMEND", quantityUnit: "EA",
  availableToPromise: 70, incomingPurchaseQuantity: 20, coveredAfterIncoming: 90, reorderPoint: 25,
  dailyDemand: 2, leadTimeDemand: 20, targetStock: 25, recommendedQuantity: 0,
  formulaId: "inventory.replenishment-target", formulaVersion: "1.2.0",
  evidenceIds: ["stock-a","stock-b","demand-a","demand-b"], warnings: [], automaticPurchase: false,
  demandSource: "FORECAST", demandTrend: "INCREASING",
  forecastLeadTimeDemand: { horizonDays: 7, lowQuantity: 10, expectedQuantity: 14, highQuantity: 14 },
  forecastEvidenceIds: ["demand-a","demand-b"],
  forecastMetricKeys: ["product.order_items.quantity","product.orders.sample_count"],
  forecastFormulaVersions: ["quantity@1","sample@1"],
};

describe("demand scenario stock impact", () => {
  it("projects scenario demand against matched verified ATP and lead-time inventory evidence", () => {
    const result = buildDemandScenarioStockImpact({ scenario, recommendations: [recommendation] });
    expect(result).toMatchObject({
      status: "READY", productRef: "product-1", quantityUnit: "EA",
      availableToPromise: 70, reorderPoint: 25,
      horizons: [
        { days: 7, baselineRemainingAtp: 56, scenarioRemainingAtp: 49, scenarioPotentialShortfall: 0, belowReorderPoint: false },
        { days: 30, baselineRemainingAtp: 10, scenarioRemainingAtp: -20, scenarioPotentialShortfall: 20, belowReorderPoint: true },
        { days: 90, baselineRemainingAtp: -110, scenarioRemainingAtp: -200, scenarioPotentialShortfall: 200, belowReorderPoint: true },
      ],
      leadTime: {
        sourceHorizonDays: 7,
        baselineDemand: { expected: 14 },
        scenarioDemand: { expected: 21 },
        baselineRemainingAtp: 56,
        scenarioRemainingAtp: 49,
        scenarioPotentialShortfall: 0,
        belowReorderPoint: false,
      },
    });
    expect(result.limitations).toContain("INCOMING_PURCHASE_QUANTITY_EXCLUDED_WITHOUT_RECEIPT_DATE_PROOF");
  });

  it("withholds projections when inventory fell back to historical demand", () => {
    const result = buildDemandScenarioStockImpact({
      scenario, recommendations: [{ ...recommendation, demandSource: "HISTORICAL" }],
    });
    expect(result.status).toBe("WITHHELD");
    expect(result.reason).toBe("INVENTORY_AND_DEMAND_EVIDENCE_MISMATCH");
    expect(result.horizons).toHaveLength(0);
  });

  it("withholds mismatched evidence, metric keys, formula versions and units", () => {
    expect(buildDemandScenarioStockImpact({
      scenario, recommendations: [{ ...recommendation, forecastEvidenceIds: ["other"] }],
    }).status).toBe("WITHHELD");
    expect(buildDemandScenarioStockImpact({
      scenario, recommendations: [{ ...recommendation, forecastMetricKeys: ["product.order_items.quantity"] }],
    }).status).toBe("WITHHELD");
    expect(buildDemandScenarioStockImpact({
      scenario, recommendations: [{ ...recommendation, forecastFormulaVersions: ["quantity@2"] }],
    }).status).toBe("WITHHELD");
    expect(buildDemandScenarioStockImpact({
      scenario: { ...scenario, unitOfMeasure: "BOX" }, recommendations: [recommendation],
    }).status).toBe("WITHHELD");
  });

  it("withholds duplicate product rows, incomplete inventory metrics and unavailable source", () => {
    expect(buildDemandScenarioStockImpact({ scenario, recommendations: null }).reason).toBe("INVENTORY_SOURCE_UNAVAILABLE");
    expect(buildDemandScenarioStockImpact({ scenario, recommendations: [] }).reason).toBe("PRODUCT_INVENTORY_NOT_UNIQUE");
    expect(buildDemandScenarioStockImpact({ scenario, recommendations: [recommendation, recommendation] }).reason)
      .toBe("PRODUCT_INVENTORY_NOT_UNIQUE");
    expect(buildDemandScenarioStockImpact({
      scenario, recommendations: [{ ...recommendation, availableToPromise: null }],
    }).status).toBe("WITHHELD");
  });

  it("rejects invalid lead-time ranges and incomplete scenario horizons", () => {
    expect(buildDemandScenarioStockImpact({
      scenario, recommendations: [{
        ...recommendation,
        forecastLeadTimeDemand: { horizonDays: 45 as 7, lowQuantity: 1, expectedQuantity: 1, highQuantity: 1 },
      }],
    }).status).toBe("WITHHELD");
    expect(buildDemandScenarioStockImpact({
      scenario: { ...scenario, horizons: [] }, recommendations: [recommendation],
    }).reason).toBe("SCENARIO_HORIZONS_INVALID");
  });

  it("handles complete depletion and a zero-demand assumption", () => {
    const depleted = buildDemandScenarioStockImpact({
      scenario, recommendations: [{ ...recommendation, availableToPromise: 0, reorderPoint: 0 }],
    });
    expect(depleted.status).toBe("READY");
    expect(depleted.horizons[0].scenarioPotentialShortfall).toBe(21);
    const zeroDemand = buildDemandScenarioStockImpact({
      scenario: { ...scenario, changePercent: -100 }, recommendations: [recommendation],
    });
    expect(zeroDemand.status).toBe("READY");
    expect(zeroDemand.horizons.every(item => item.scenarioDemand.expected === 0)).toBe(true);
  });
});
