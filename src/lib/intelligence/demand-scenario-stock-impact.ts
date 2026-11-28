import type { DemandScenarioResult } from "./demand-forecast";
import { decimalToMinorUnits, minorUnitsToNumber } from "./financial-precision";
import type { ReplenishmentRecommendation } from "./replenishment";

export interface DemandScenarioStockHorizon {
  days: 7 | 30 | 90;
  baselineDemand: { low: number; expected: number; high: number };
  scenarioDemand: { low: number; expected: number; high: number };
  baselineRemainingAtp: number;
  scenarioRemainingAtp: number;
  scenarioPotentialShortfall: number;
  belowReorderPoint: boolean;
}
export interface DemandScenarioStockImpact {
  status: "READY" | "WITHHELD";
  reason: string | null;
  productRef: string;
  quantityUnit: string | null;
  availableToPromise: number | null;
  reorderPoint: number | null;
  leadTime: {
    sourceHorizonDays: 7 | 30 | 90;
    baselineDemand: { low: number; expected: number; high: number };
    scenarioDemand: { low: number; expected: number; high: number };
    baselineRemainingAtp: number;
    scenarioRemainingAtp: number;
    scenarioPotentialShortfall: number;
    belowReorderPoint: boolean;
  } | null;
  horizons: DemandScenarioStockHorizon[];
  inventoryEvidenceIds: string[];
  inventoryFormulaId: string | null;
  inventoryFormulaVersion: string | null;
  demandEvidenceIds: string[];
  limitations: string[];
}
function validLabel(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
const withheld = (scenario: DemandScenarioResult | null | undefined, reason: string): DemandScenarioStockImpact => ({
  status: "WITHHELD", reason,
  productRef: scenario && validLabel(scenario.productRef, 200) ? scenario.productRef : "",
  quantityUnit: null,
  availableToPromise: null, reorderPoint: null, leadTime: null, horizons: [],
  inventoryEvidenceIds: [], inventoryFormulaId: null, inventoryFormulaVersion: null,
  demandEvidenceIds: Array.isArray(scenario?.evidenceIds)
    ? scenario.evidenceIds.filter((value): value is string => validLabel(value)).slice(0, 500)
    : [],
  limitations: [reason, "NO_INVENTORY_OR_PURCHASE_SIDE_EFFECTS"],
});
function validEvidence(values: unknown): values is string[] {
  return Array.isArray(values) && values.length > 0 && values.length <= 500 &&
    values.every(value => typeof value === "string" && value.trim().length > 0) &&
    new Set(values).size === values.length;
}
function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((value, index) => value === sortedRight[index]);
}
function scale(value: number, percent: number): bigint | null {
  const units = decimalToMinorUnits(value, 6);
  if (units === null || units < 0n) return null;
  return (units * BigInt(100 + percent) + 50n) / 100n;
}
function toNumber(value: bigint): number | null { return minorUnitsToNumber(value, 6); }
function balance(available: bigint, demand: bigint): number | null { return toNumber(available - demand); }
function shortfall(available: bigint, demand: bigint): number | null {
  return toNumber(demand > available ? demand - available : 0n);
}

/**
 * Projects user-supplied demand scenarios against verified ATP for the same
 * product and exact demand evidence. Incoming purchase quantities are excluded
 * because this aggregate does not establish receipt dates.
 */
export function buildDemandScenarioStockImpact(input: {
  scenario: DemandScenarioResult;
  recommendations: readonly ReplenishmentRecommendation[] | null | undefined;
}): DemandScenarioStockImpact {
  const scenario = input.scenario;
  if (!scenario || typeof scenario !== "object" || scenario.status !== "SIMULATED" ||
      scenario.assumptionBoundary !== "USER_SUPPLIED" || scenario.accountingFact !== false ||
      !Number.isInteger(scenario.changePercent) || scenario.changePercent === null ||
      scenario.changePercent < -100 || scenario.changePercent > 300) {
    return withheld(scenario, "SCENARIO_NOT_VERIFIED");
  }
  if (!validLabel(scenario.productRef, 200) || !validLabel(scenario.unitOfMeasure, 64) ||
      !validLabel(scenario.formulaId, 128) || !validLabel(scenario.formulaVersion, 64)) {
    return withheld(scenario, "SCENARIO_IDENTITY_INVALID");
  }
  if (!Array.isArray(scenario.horizons) || scenario.horizons.length !== 3 ||
      scenario.horizons.some(horizon => !horizon || typeof horizon !== "object")) {
    return withheld(scenario, "SCENARIO_HORIZONS_INVALID");
  }
  if (!Array.isArray(input.recommendations)) return withheld(scenario, "INVENTORY_SOURCE_UNAVAILABLE");
  if (input.recommendations.some(item => !item || typeof item !== "object" ||
      !validLabel(item.productRef, 200))) {
    return withheld(scenario, "INVENTORY_SOURCE_UNAVAILABLE");
  }
  const matches = input.recommendations.filter(item => item.productRef === scenario.productRef);
  if (matches.length !== 1) return withheld(scenario, "PRODUCT_INVENTORY_NOT_UNIQUE");
  const recommendation = matches[0];
  if (recommendation.status !== "VERIFIED" || recommendation.demandSource !== "FORECAST" ||
      !recommendation.forecastLeadTimeDemand ||
      recommendation.quantityUnit !== scenario.unitOfMeasure ||
      recommendation.availableToPromise === null || recommendation.reorderPoint === null ||
      !Number.isFinite(recommendation.availableToPromise) || !Number.isFinite(recommendation.reorderPoint) ||
      recommendation.availableToPromise < 0 || recommendation.reorderPoint < 0 ||
      !validEvidence(recommendation.evidenceIds) ||
      !validLabel(recommendation.formulaId, 128) || !validLabel(recommendation.formulaVersion, 64) ||
      !validEvidence(recommendation.forecastEvidenceIds) ||
      !validEvidence(recommendation.forecastMetricKeys) ||
      !validEvidence(recommendation.forecastFormulaVersions) ||
      !validEvidence(scenario.evidenceIds) || !validEvidence(scenario.metricKeys) ||
      !validEvidence(scenario.formulaVersions) ||
      !recommendation.forecastEvidenceIds.every(id => recommendation.evidenceIds.includes(id)) ||
      !sameSet(recommendation.forecastEvidenceIds, scenario.evidenceIds) ||
      !sameSet(recommendation.forecastMetricKeys, scenario.metricKeys) ||
      !sameSet(recommendation.forecastFormulaVersions, scenario.formulaVersions)) {
    return withheld(scenario, "INVENTORY_AND_DEMAND_EVIDENCE_MISMATCH");
  }
  const atp = decimalToMinorUnits(recommendation.availableToPromise, 6);
  const reorderPoint = decimalToMinorUnits(recommendation.reorderPoint, 6);
  const lead = recommendation.forecastLeadTimeDemand;
  const leadLow = decimalToMinorUnits(lead.lowQuantity, 6);
  const leadExpected = decimalToMinorUnits(lead.expectedQuantity, 6);
  const leadHigh = decimalToMinorUnits(lead.highQuantity, 6);
  if (atp === null || reorderPoint === null || atp < 0n || reorderPoint < 0n ||
      leadLow === null || leadExpected === null || leadHigh === null ||
      leadLow < 0n || leadLow > leadExpected || leadExpected > leadHigh ||
      ![7, 30, 90].includes(lead.horizonDays)) {
    return withheld(scenario, "INVENTORY_QUANTITY_INVALID");
  }
  const horizons = [...scenario.horizons].sort((a, b) => a.days - b.days);
  if (horizons.some((horizon, index) => horizon.days !== [7, 30, 90][index])) {
    return withheld(scenario, "SCENARIO_HORIZONS_INVALID");
  }
  const projected: DemandScenarioStockHorizon[] = [];
  for (const horizon of horizons) {
    const baselineLow = decimalToMinorUnits(horizon.baselineLowQuantity, 6);
    const baselineExpected = decimalToMinorUnits(horizon.baselineExpectedQuantity, 6);
    const baselineHigh = decimalToMinorUnits(horizon.baselineHighQuantity, 6);
    const scenarioLow = decimalToMinorUnits(horizon.scenarioLowQuantity, 6);
    const scenarioExpected = decimalToMinorUnits(horizon.scenarioExpectedQuantity, 6);
    const scenarioHigh = decimalToMinorUnits(horizon.scenarioHighQuantity, 6);
    const quantities = [baselineLow, baselineExpected, baselineHigh, scenarioLow, scenarioExpected, scenarioHigh];
    if (quantities.some(value => value === null || value < 0n) ||
        baselineLow! > baselineExpected! || baselineExpected! > baselineHigh! ||
        scenarioLow! > scenarioExpected! || scenarioExpected! > scenarioHigh!) {
      return withheld(scenario, "SCENARIO_HORIZON_QUANTITY_INVALID");
    }
    const baselineRemaining = balance(atp, baselineExpected!);
    const scenarioRemaining = balance(atp, scenarioExpected!);
    const scenarioShortfall = shortfall(atp, scenarioExpected!);
    const low = toNumber(baselineLow!), expected = toNumber(baselineExpected!), high = toNumber(baselineHigh!);
    const scenarioLowNumber = toNumber(scenarioLow!), scenarioExpectedNumber = toNumber(scenarioExpected!), scenarioHighNumber = toNumber(scenarioHigh!);
    if ([baselineRemaining, scenarioRemaining, scenarioShortfall, low, expected, high, scenarioLowNumber, scenarioExpectedNumber, scenarioHighNumber]
      .some(value => value === null)) return withheld(scenario, "SCENARIO_STOCK_PROJECTION_UNSAFE");
    projected.push({
      days: horizon.days,
      baselineDemand: { low: low as number, expected: expected as number, high: high as number },
      scenarioDemand: { low: scenarioLowNumber as number, expected: scenarioExpectedNumber as number, high: scenarioHighNumber as number },
      baselineRemainingAtp: baselineRemaining as number,
      scenarioRemainingAtp: scenarioRemaining as number,
      scenarioPotentialShortfall: scenarioShortfall as number,
      belowReorderPoint: atp - scenarioExpected! < reorderPoint,
    });
  }
  const scenarioLead = [leadLow, leadExpected, leadHigh].map(value => scale(toNumber(value) as number, scenario.changePercent));
  if (scenarioLead.some(value => value === null) ||
      scenarioLead[0]! > scenarioLead[1]! || scenarioLead[1]! > scenarioLead[2]!) {
    return withheld(scenario, "SCENARIO_LEAD_TIME_QUANTITY_UNSAFE");
  }
  const baselineLeadRemaining = balance(atp, leadExpected);
  const scenarioLeadRemaining = balance(atp, scenarioLead[1]!);
  const leadShortfall = shortfall(atp, scenarioLead[1]!);
  if (baselineLeadRemaining === null || scenarioLeadRemaining === null || leadShortfall === null) {
    return withheld(scenario, "SCENARIO_LEAD_TIME_PROJECTION_UNSAFE");
  }
  const scenarioLeadLow = toNumber(scenarioLead[0]!), scenarioLeadExpected = toNumber(scenarioLead[1]!), scenarioLeadHigh = toNumber(scenarioLead[2]!);
  if (scenarioLeadLow === null || scenarioLeadExpected === null || scenarioLeadHigh === null) {
    return withheld(scenario, "SCENARIO_LEAD_TIME_PROJECTION_UNSAFE");
  }
  return {
    status: "READY", reason: null, productRef: scenario.productRef, quantityUnit: scenario.unitOfMeasure,
    availableToPromise: toNumber(atp), reorderPoint: toNumber(reorderPoint),
    leadTime: {
      sourceHorizonDays: lead.horizonDays,
      baselineDemand: { low: toNumber(leadLow) as number, expected: toNumber(leadExpected) as number, high: toNumber(leadHigh) as number },
      scenarioDemand: { low: scenarioLeadLow, expected: scenarioLeadExpected, high: scenarioLeadHigh },
      baselineRemainingAtp: baselineLeadRemaining,
      scenarioRemainingAtp: scenarioLeadRemaining,
      scenarioPotentialShortfall: leadShortfall,
      belowReorderPoint: atp - scenarioLead[1]! < reorderPoint,
    },
    horizons: projected,
    inventoryEvidenceIds: [...recommendation.evidenceIds],
    inventoryFormulaId: recommendation.formulaId,
    inventoryFormulaVersion: recommendation.formulaVersion,
    demandEvidenceIds: [...scenario.evidenceIds],
    limitations: [
      "SCENARIO_USES_USER_SUPPLIED_DEMAND_CHANGE",
      "ORDER_LINE_QUANTITY_IS_NOT_VERIFIED_SHIPPED_OR_RECOGNIZED_SALES",
      "INCOMING_PURCHASE_QUANTITY_EXCLUDED_WITHOUT_RECEIPT_DATE_PROOF",
      "STOCK_BALANCE_IS_CONSERVATIVE_ATP_MINUS_SCENARIO_DEMAND_NOT_A_POSTED_STOCK_BALANCE",
      "NO_PURCHASE_OR_INVENTORY_SIDE_EFFECTS",
    ],
  };
}
