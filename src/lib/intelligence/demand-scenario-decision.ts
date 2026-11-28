import type { DemandScenarioResult } from "./demand-forecast";
import type { DemandScenarioStockImpact } from "./demand-scenario-stock-impact";
import type { DecisionCandidate } from "./types";

const boundedText = (value: string, maximum: number) => value.trim().slice(0, maximum);

/** Stable, bounded, non-security fingerprint used only for idempotent candidate identity. */
function fingerprint64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(value.charCodeAt(index))) * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Convert a verified what-if simulation into a PROPOSED daily decision candidate.
 * The assumption is preserved as user input; it is never promoted to financial impact.
 */
export function buildDemandScenarioDecisionCandidate(
  scenario: DemandScenarioResult,
  stockImpact?: DemandScenarioStockImpact | null,
): DecisionCandidate | null {
  if (
    !scenario ||
    scenario.status !== "SIMULATED" ||
    scenario.assumptionBoundary !== "USER_SUPPLIED" ||
    scenario.accountingFact !== false ||
    !Number.isInteger(scenario.changePercent) ||
    scenario.changePercent === null ||
    scenario.changePercent < -100 ||
    scenario.changePercent > 300 ||
    !scenario.productRef?.trim() ||
    !scenario.productLabel?.trim() ||
    !scenario.unitOfMeasure?.trim() ||
    !scenario.asOf ||
    !Number.isFinite(Date.parse(scenario.asOf)) ||
    !scenario.period ||
    !scenario.baselinePeriod ||
    !Array.isArray(scenario.horizons) ||
    scenario.horizons.length !== 3 ||
    !Array.isArray(scenario.evidenceIds) ||
    scenario.evidenceIds.length === 0 ||
    scenario.evidenceIds.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(scenario.evidenceIds).size !== scenario.evidenceIds.length ||
    !Array.isArray(scenario.metricKeys) ||
    scenario.metricKeys.length === 0 ||
    scenario.metricKeys.some((key) => typeof key !== "string" || !key.trim()) ||
    !Array.isArray(scenario.formulaVersions) ||
    scenario.formulaVersions.length === 0 ||
    scenario.formulaVersions.some((version) => typeof version !== "string" || !version.trim())
  ) {
    return null;
  }

  const expectedHorizons = [7, 30, 90];
  const orderedHorizons = [...scenario.horizons].sort((left, right) => left.days - right.days);
  if (orderedHorizons.some((horizon, index) =>
    horizon.days !== expectedHorizons[index] ||
    !Number.isFinite(horizon.baselineExpectedQuantity) ||
    !Number.isFinite(horizon.scenarioExpectedQuantity) ||
    !Number.isFinite(horizon.expectedDeltaQuantity) ||
    horizon.baselineExpectedQuantity < 0 ||
    horizon.scenarioExpectedQuantity < 0
  )) return null;

  const assumption = scenario.changePercent > 0 ? "+" + scenario.changePercent : String(scenario.changePercent);
  const identity = [
    scenario.productRef,
    scenario.asOf,
    scenario.period.from,
    scenario.period.to,
    scenario.baselinePeriod.from,
    scenario.baselinePeriod.to,
    String(scenario.changePercent),
    scenario.formulaId,
    scenario.formulaVersion,
    [...scenario.evidenceIds].sort().join(","),
    [...scenario.metricKeys].sort().join(","),
    [...scenario.formulaVersions].sort().join(","),
    ...(stockImpact?.status === "READY" ? [
      Array.isArray(stockImpact.inventoryEvidenceIds) ? [...stockImpact.inventoryEvidenceIds].sort().join(",") : "INVALID_INVENTORY_EVIDENCE",
      typeof stockImpact.inventoryFormulaId === "string" ? stockImpact.inventoryFormulaId : "INVALID_INVENTORY_FORMULA",
      typeof stockImpact.inventoryFormulaVersion === "string" ? stockImpact.inventoryFormulaVersion : "INVALID_INVENTORY_FORMULA_VERSION",
    ] : []),
  ].join("|");
  const candidateId = "demand.whatif:" + fingerprint64(identity);
  const validStockImpact = stockImpact?.status === "READY" &&
    stockImpact.productRef === scenario.productRef &&
    stockImpact.quantityUnit === scenario.unitOfMeasure &&
    typeof stockImpact.availableToPromise === "number" && Number.isFinite(stockImpact.availableToPromise) &&
    typeof stockImpact.reorderPoint === "number" && Number.isFinite(stockImpact.reorderPoint) &&
    stockImpact.availableToPromise >= 0 && stockImpact.reorderPoint >= 0 &&
    Array.isArray(stockImpact.inventoryEvidenceIds) && stockImpact.inventoryEvidenceIds.length > 0 &&
    stockImpact.inventoryEvidenceIds.every(id => typeof id === "string" && id.trim()) &&
    typeof stockImpact.inventoryFormulaId === "string" && stockImpact.inventoryFormulaId.trim() &&
    typeof stockImpact.inventoryFormulaVersion === "string" && stockImpact.inventoryFormulaVersion.trim() &&
    Array.isArray(stockImpact.horizons) && stockImpact.horizons.length === 3 &&
    [7, 30, 90].every(days => stockImpact.horizons.some(item =>
      item.days === days && Number.isFinite(item.scenarioDemand.expected) &&
      Number.isFinite(item.scenarioPotentialShortfall) && item.scenarioPotentialShortfall >= 0
    )) &&
    stockImpact.leadTime !== null &&
    Number.isFinite(stockImpact.leadTime.scenarioDemand.expected) &&
    Number.isFinite(stockImpact.leadTime.scenarioPotentialShortfall);
  if (stockImpact?.status === "READY" && !validStockImpact) return null;
  const inventorySummary = validStockImpact
    ? " لقطة المخزون: ATP " + stockImpact.availableToPromise + " " + scenario.unitOfMeasure +
      "، ونقطة إعادة الطلب " + stockImpact.reorderPoint + " " + scenario.unitOfMeasure +
      "؛ المتبقي الافتراضي بعد 7/30/90 يوماً: " +
      [...stockImpact.horizons].sort((a, b) => a.days - b.days).map(item =>
        item.days + " يوم " + item.scenarioRemainingAtp + " (عجز محتمل " + item.scenarioPotentialShortfall + ")"
      ).join("، ") +
      "؛ والتقدير المحسوب لمهلة المورد باستخدام أفق توقع " + stockImpact.leadTime.sourceHorizonDays + " يوم، العجز المحتمل " +
      stockImpact.leadTime.scenarioPotentialShortfall + "."
    : "";
  const evidenceIds = [...new Set([
    ...scenario.evidenceIds,
    ...(validStockImpact ? stockImpact.inventoryEvidenceIds : []),
  ])];
  const formulaVersions = [...new Set([
    scenario.formulaId + "@" + scenario.formulaVersion,
    ...scenario.formulaVersions,
    ...(validStockImpact ? [stockImpact.inventoryFormulaId + "@" + stockImpact.inventoryFormulaVersion] : []),
  ])];
  if (evidenceIds.length > 500 || formulaVersions.length > 50) return null;
  const what = boundedText("محاكاة تغير الطلب — " + scenario.productLabel + " (" + assumption + "%)", 500);
  const horizonSummary = orderedHorizons.map((horizon) =>
    horizon.days + " يوماً: " + horizon.baselineExpectedQuantity + " → " +
    horizon.scenarioExpectedQuantity + " " + scenario.unitOfMeasure +
    " (فرق " + (horizon.expectedDeltaQuantity > 0 ? "+" : "") + horizon.expectedDeltaQuantity + ")"
  ).join("؛ ");
  const why = boundedText(
    "افتراض إداري يدوي بتغير معدل الطلب بنسبة " + assumption + "%، مطبق على توقع موثق للمنتج " +
    scenario.productLabel + " للفترة " + scenario.period.from + " إلى " + scenario.period.to +
    ". نتائج الأساس مقابل السيناريو: " + horizonSummary + inventorySummary +
    ". هذه نتائج افتراضية وليست طلباً محققاً أو مبيعات أو كمية شحن أو رصيداً مرحلاً.",
    2000,
  );
  const soWhat = boundedText(
    validStockImpact && stockImpact.horizons.some(item => item.scenarioPotentialShortfall > 0)
      ? "تشير المحاكاة إلى عجز محتمل أمام ATP في واحد أو أكثر من الآفاق؛ يجب مراجعة الاستلامات والطلب الفعلي قبل أي قرار شراء."
      : "توضح المحاكاة حساسية كميات الطلب المفترضة على الآفاق الزمنية؛ ولا تثبت وحدها حاجة شراء أو ربحية أو توفر سيولة.",
    2000,
  );
  const whatNext = boundedText(
    "راجع الفرضية مع مسؤول المبيعات والمخزون، وسجّل مراجعة مستقلة للطلب الفعلي بعد اكتمال الأفق؛ لا تنفذ شراءً أو تغيير مخزون من هذه المحاكاة وحدها.",
    2000,
  );

  return {
    id: candidateId,
    ruleId: "demand.scenario.what-if",
    ruleVersion: "1.0.0",
    priority: "P3",
    priorityScore: 100,
    what,
    why,
    soWhat,
    impact: null,
    impactStatus: "WITHHELD",
    impactReason: "USER_SUPPLIED_DEMAND_SCENARIO_IS_NOT_VERIFIED_FINANCIAL_IMPACT",
    whatNext,
    proof: {
      evidenceIds,
      metricKeys: [...scenario.metricKeys],
      asOf: scenario.asOf,
      formulaVersions,
    },
    owner: "مدير المبيعات والمخزون",
    expectedOutcome: boundedText("نتيجة السيناريو المسجلة — " + horizonSummary + inventorySummary + ". المطلوب مراجعة الفرضية مقابل الطلب الفعلي والاستلامات قبل أي إجراء.", 2000),
    createdAt: scenario.asOf,
    expiresAt: null,
  };
}
