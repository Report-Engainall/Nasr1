import type { DemandScenarioResult } from "./demand-forecast";
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
  ].join("|");
  const candidateId = "demand.whatif:" + fingerprint64(identity);
  const what = boundedText("محاكاة تغير الطلب — " + scenario.productLabel + " (" + assumption + "%)", 500);
  const horizonSummary = orderedHorizons.map((horizon) =>
    horizon.days + " يوماً: " + horizon.baselineExpectedQuantity + " → " +
    horizon.scenarioExpectedQuantity + " " + scenario.unitOfMeasure +
    " (فرق " + (horizon.expectedDeltaQuantity > 0 ? "+" : "") + horizon.expectedDeltaQuantity + ")"
  ).join("؛ ");
  const why = boundedText(
    "افتراض إداري يدوي بتغير معدل الطلب بنسبة " + assumption + "%، مطبق على توقع موثق للمنتج " +
    scenario.productLabel + " للفترة " + scenario.period.from + " إلى " + scenario.period.to +
    ". نتائج الأساس مقابل السيناريو: " + horizonSummary +
    ". هذه نتائج افتراضية وليست طلباً محققاً أو مبيعات أو كمية شحن.",
    2000,
  );
  const soWhat = boundedText(
    "توضح المحاكاة حساسية كميات الطلب المفترضة على الآفاق الزمنية؛ ولا تثبت وحدها حاجة شراء أو ربحية أو توفر سيولة.",
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
      evidenceIds: [...scenario.evidenceIds],
      metricKeys: [...scenario.metricKeys],
      asOf: scenario.asOf,
      formulaVersions: [...new Set([
        scenario.formulaId + "@" + scenario.formulaVersion,
        ...scenario.formulaVersions,
      ])],
    },
    owner: "مدير المبيعات والمخزون",
    expectedOutcome: boundedText("نتيجة السيناريو المسجلة — " + horizonSummary + ". المطلوب مراجعة الفرضية مقابل الطلب الفعلي قبل أي إجراء.", 2000),
    createdAt: scenario.asOf,
    expiresAt: null,
  };
}
