import { describe, expect, it } from "vitest";
import { buildDemandScenarioDecisionCandidate } from "./demand-scenario-decision";
import type { DemandScenarioResult } from "./demand-forecast";
import type { DemandScenarioStockImpact } from "./demand-scenario-stock-impact";

const scenario: DemandScenarioResult = {
  id: "demand-scenario:test:product:20",
  status: "SIMULATED",
  reason: null,
  productRef: "product-123",
  productLabel: "أرز بسمتي",
  unitOfMeasure: "EA",
  changePercent: 20,
  asOf: "2026-11-28T01:00:00.000Z",
  period: { from: "2026-10-28", to: "2026-11-26" },
  baselinePeriod: { from: "2026-09-28", to: "2026-10-27" },
  horizons: [
    { days: 7, baselineLowQuantity: 21, baselineExpectedQuantity: 28, baselineHighQuantity: 28, scenarioLowQuantity: 25.2, scenarioExpectedQuantity: 33.6, scenarioHighQuantity: 33.6, expectedDeltaQuantity: 5.6 },
    { days: 30, baselineLowQuantity: 90, baselineExpectedQuantity: 120, baselineHighQuantity: 120, scenarioLowQuantity: 108, scenarioExpectedQuantity: 144, scenarioHighQuantity: 144, expectedDeltaQuantity: 24 },
    { days: 90, baselineLowQuantity: 270, baselineExpectedQuantity: 360, baselineHighQuantity: 360, scenarioLowQuantity: 324, scenarioExpectedQuantity: 432, scenarioHighQuantity: 432, expectedDeltaQuantity: 72 },
  ],
  evidenceIds: ["evidence-current", "evidence-baseline"],
  metricKeys: ["product.order_items.quantity", "product.orders.sample_count"],
  formulaVersions: ["quantity@1", "sample@1"],
  formulaId: "product-demand.what-if",
  formulaVersion: "1.0.0",
  assumptionBoundary: "USER_SUPPLIED",
  accountingFact: false,
  limitations: ["USER_SUPPLIED_DEMAND_CHANGE_ASSUMPTION"],
};

const stockImpact: DemandScenarioStockImpact = {
  status: "READY", reason: null, productRef: "product-123", quantityUnit: "EA",
  availableToPromise: 40, reorderPoint: 10,
  leadTime: {
    sourceHorizonDays: 7,
    baselineDemand: { low: 21, expected: 28, high: 28 },
    scenarioDemand: { low: 25.2, expected: 33.6, high: 33.6 },
    baselineRemainingAtp: 12, scenarioRemainingAtp: 6.4,
    scenarioPotentialShortfall: 0, belowReorderPoint: true,
  },
  horizons: [
    { days: 7, baselineDemand: { low: 21, expected: 28, high: 28 }, scenarioDemand: { low: 25.2, expected: 33.6, high: 33.6 }, baselineRemainingAtp: 12, scenarioRemainingAtp: 6.4, scenarioPotentialShortfall: 0, belowReorderPoint: true },
    { days: 30, baselineDemand: { low: 90, expected: 120, high: 120 }, scenarioDemand: { low: 108, expected: 144, high: 144 }, baselineRemainingAtp: -80, scenarioRemainingAtp: -104, scenarioPotentialShortfall: 104, belowReorderPoint: true },
    { days: 90, baselineDemand: { low: 270, expected: 360, high: 360 }, scenarioDemand: { low: 324, expected: 432, high: 432 }, baselineRemainingAtp: -320, scenarioRemainingAtp: -392, scenarioPotentialShortfall: 392, belowReorderPoint: true },
  ],
  inventoryEvidenceIds: ["inventory-evidence"],
  inventoryFormulaId: "inventory.replenishment-target",
  inventoryFormulaVersion: "1.2.0",
  demandEvidenceIds: ["evidence-current", "evidence-baseline"],
  limitations: ["INCOMING_PURCHASE_QUANTITY_EXCLUDED_WITHOUT_RECEIPT_DATE_PROOF"],
};

describe("demand scenario decision candidate", () => {
  it("maps a scenario to an evidence-linked P3 proposal with no calculated impact", () => {
    const candidate = buildDemandScenarioDecisionCandidate(scenario);
    expect(candidate).toMatchObject({
      ruleId: "demand.scenario.what-if",
      ruleVersion: "1.0.0",
      priority: "P3",
      priorityScore: 100,
      impact: null,
      impactStatus: "WITHHELD",
      impactReason: "USER_SUPPLIED_DEMAND_SCENARIO_IS_NOT_VERIFIED_FINANCIAL_IMPACT",
      createdAt: scenario.asOf,
      expiresAt: null,
      proof: {
        evidenceIds: scenario.evidenceIds,
        metricKeys: scenario.metricKeys,
        asOf: scenario.asOf,
      },
    });
    expect(candidate?.id).toMatch(/^demand\.whatif:[0-9a-f]{16}$/);
    expect(candidate?.why).toContain("+20%");
    expect(candidate?.why).toContain("7 يوماً: 28 → 33.6 EA");
    expect(candidate?.expectedOutcome).toContain("30 يوماً: 120 → 144 EA");
    expect(candidate?.expectedOutcome).toContain("90 يوماً: 360 → 432 EA");
  });

  it("keeps verified stock coverage and shortages inside the saved decision evidence", () => {
    const candidate = buildDemandScenarioDecisionCandidate(scenario, stockImpact);
    expect(candidate).toMatchObject({
      impact: null,
      impactStatus: "WITHHELD",
      proof: {
        evidenceIds: expect.arrayContaining(["evidence-current", "evidence-baseline", "inventory-evidence"]),
        formulaVersions: expect.arrayContaining(["inventory.replenishment-target@1.2.0"]),
      },
    });
    expect(candidate?.why).toContain("ATP 40 EA");
    expect(candidate?.why).toContain("يستبعد الوارد لعدم ثبوت تواريخ الاستلام");
    expect(candidate?.expectedOutcome).toContain("90 يوماً: 360 → 432 EA");
    expect(candidate?.id).not.toBe(buildDemandScenarioDecisionCandidate(scenario)?.id);
    expect(buildDemandScenarioDecisionCandidate(scenario, { ...stockImpact, productRef: "another-product" })).toBeNull();
    expect(buildDemandScenarioDecisionCandidate(scenario, { ...stockImpact, inventoryEvidenceIds: [] })).toBeNull();
  });

  it("uses the same id for an exact replay and a different id for a changed assumption", () => {
    const first = buildDemandScenarioDecisionCandidate(scenario);
    expect(buildDemandScenarioDecisionCandidate({ ...scenario })).toEqual(first);
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, changePercent: 25 })?.id).not.toBe(first?.id);
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, formulaVersions: ["quantity@2", "sample@1"] })?.id).not.toBe(first?.id);
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, evidenceIds: ["corrected-current", "evidence-baseline"] })?.id).not.toBe(first?.id);
  });

  it("withholds invalid, partial, duplicate or incomplete scenario payloads", () => {
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, status: "WITHHELD" })).toBeNull();
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, accountingFact: true })).toBeNull();
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, evidenceIds: [] })).toBeNull();
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, evidenceIds: ["same", "same"] })).toBeNull();
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, horizons: scenario.horizons.slice(0, 2) })).toBeNull();
    expect(buildDemandScenarioDecisionCandidate({ ...scenario, changePercent: 301 })).toBeNull();
  });
});
