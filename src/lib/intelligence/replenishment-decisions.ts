import type { ReplenishmentProductInput, ReplenishmentRecommendation } from "./replenishment";
import { decimalToMinorUnits, minorUnitsToNumber } from "./financial-precision";
import type { DecisionCandidate } from "./types";

function strictInstant(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
  ) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const dayTime = Date.parse(day + "T00:00:00.000Z");
  if (!Number.isFinite(dayTime) || new Date(dayTime).toISOString().slice(0, 10) !== day) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sourceMetrics(product: ReplenishmentProductInput) {
  return [
    product.availableToPromise,
    product.reorderPoint,
    product.soldQuantityWindow,
    product.supplierLeadTimeDays,
    product.incomingPurchaseQuantity,
    ...(product.minimumOrderQuantity ? [product.minimumOrderQuantity] : []),
    ...(product.orderMultiple ? [product.orderMultiple] : []),
  ];
}

function minor(value: unknown): bigint | null {
  return decimalToMinorUnits(value, 6);
}

function matchesMinor(value: unknown, expected: bigint): boolean {
  const actual = minor(value);
  return actual !== null && actual === expected;
}

function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function periodLength(from: string, to: string): number | null {
  if (!validDay(from) || !validDay(to) || to < from) return null;
  const length = Math.floor((Date.parse(to + "T00:00:00.000Z") - Date.parse(from + "T00:00:00.000Z")) / 86_400_000) + 1;
  return Number.isSafeInteger(length) && length > 0 ? length : null;
}

function ceilDivNonNegative(numerator: bigint, denominator: bigint): bigint {
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Reconcile every decision-bearing number against the exact verified metric
 * snapshots. A typed recommendation object is not itself source evidence.
 */
function recommendationMatchesSources(
  product: ReplenishmentProductInput,
  recommendation: ReplenishmentRecommendation,
  asOf: string,
): boolean {
  const quantityUnit = product.quantityUnit.trim();
  if (!quantityUnit) return false;

  const quantityMetrics = [
    product.availableToPromise,
    product.reorderPoint,
    product.soldQuantityWindow,
    product.incomingPurchaseQuantity,
    ...(product.minimumOrderQuantity ? [product.minimumOrderQuantity] : []),
    ...(product.orderMultiple ? [product.orderMultiple] : []),
  ];
  if (quantityMetrics.some(metric =>
    metric.unit !== "QUANTITY" || metric.unitOfMeasure?.trim() !== quantityUnit
  )) return false;
  if (product.supplierLeadTimeDays.unit !== "DAYS" || product.supplierLeadTimeDays.period !== null) return false;

  const period = product.soldQuantityWindow.period;
  if (!period) return false;
  const days = periodLength(period.from, period.to);
  if (days === null || period.to > asOf.slice(0, 10)) return false;

  const available = minor(product.availableToPromise.value);
  const reorderPoint = minor(product.reorderPoint.value);
  const sold = minor(product.soldQuantityWindow.value);
  const leadDays = minor(product.supplierLeadTimeDays.value);
  const incoming = minor(product.incomingPurchaseQuantity.value);
  const minimum = product.minimumOrderQuantity ? minor(product.minimumOrderQuantity.value) : 0n;
  const multiple = product.orderMultiple ? minor(product.orderMultiple.value) : null;
  if ([available, reorderPoint, sold, leadDays, incoming, minimum].some(value => value === null) ||
      (product.orderMultiple && multiple === null) ||
      [available, reorderPoint, sold, leadDays, incoming, minimum, multiple].some(value => value !== null && value < 0n)) return false;
  if ((product.minimumOrderQuantity && minimum === 0n) || (product.orderMultiple && multiple === 0n)) return false;

  const availableValue = available as bigint;
  const reorderValue = reorderPoint as bigint;
  const soldValue = sold as bigint;
  const leadValue = leadDays as bigint;
  const incomingValue = incoming as bigint;
  const leadDemand = ceilDivNonNegative(soldValue * leadValue, BigInt(days) * 1_000_000n);
  const covered = availableValue + incomingValue;
  const target = reorderValue > leadDemand ? reorderValue : leadDemand;
  let recommended = target > covered ? target - covered : 0n;
  if (minimum !== null && minimum > 0n && recommended > 0n && recommended < minimum) recommended = minimum;
  if (multiple !== null && multiple > 0n && recommended > 0n) {
    recommended = ceilDivNonNegative(recommended, multiple) * multiple;
  }

  const soldNumber = minorUnitsToNumber(soldValue, 6);
  const expectedDailyDemand = soldNumber === null ? null : soldNumber / days;
  const actualDailyDemand = recommendation.dailyDemand;
  if (expectedDailyDemand === null || typeof actualDailyDemand !== "number" ||
      !Number.isFinite(actualDailyDemand) || Math.abs(actualDailyDemand - expectedDailyDemand) > 0.000001) return false;

  return matchesMinor(recommendation.availableToPromise, availableValue) &&
    matchesMinor(recommendation.incomingPurchaseQuantity, incomingValue) &&
    matchesMinor(recommendation.coveredAfterIncoming, covered) &&
    matchesMinor(recommendation.reorderPoint, reorderValue) &&
    matchesMinor(recommendation.leadTimeDemand, leadDemand) &&
    matchesMinor(recommendation.targetStock, target) &&
    matchesMinor(recommendation.recommendedQuantity, recommended) &&
    recommended > 0n;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(value => typeof value === "string" && value.trim().length > 0))];
}

/**
 * Converts verified replenishment recommendations into reviewable daily decisions.
 * It never creates a purchase order and never invents a monetary impact.
 */
export function buildReplenishmentDecisionCandidates(input: {
  asOf: string;
  products: ReplenishmentProductInput[];
  recommendations: ReplenishmentRecommendation[];
}): DecisionCandidate[] {
  const snapshotTime = strictInstant(input.asOf);
  if (snapshotTime === null || !Array.isArray(input.products) || !Array.isArray(input.recommendations)) return [];

  const productCounts = new Map<string, number>();
  const products = new Map<string, ReplenishmentProductInput>();
  for (const product of input.products) {
    const ref = typeof product.productRef === "string" ? product.productRef.trim() : "";
    if (!ref) continue;
    productCounts.set(ref, (productCounts.get(ref) ?? 0) + 1);
    products.set(ref, product);
  }

  const RULE_VERSION = "1.0.0";
  const candidates: DecisionCandidate[] = [];
  for (const recommendation of input.recommendations) {
    const productRef = typeof recommendation.productRef === "string" ? recommendation.productRef.trim() : "";
    if (
      !productRef ||
      (productCounts.get(productRef) ?? 0) !== 1 ||
      recommendation.status !== "VERIFIED" ||
      recommendation.action !== "RECOMMEND" ||
      recommendation.automaticPurchase !== false ||
      typeof recommendation.recommendedQuantity !== "number" ||
      !Number.isFinite(recommendation.recommendedQuantity) ||
      recommendation.recommendedQuantity <= 0 ||
      !recommendation.quantityUnit?.trim() ||
      !Array.isArray(recommendation.evidenceIds) ||
      recommendation.evidenceIds.length === 0
    ) continue;

    const product = products.get(productRef);
    if (!product || product.quantityUnit.trim() !== recommendation.quantityUnit.trim()) continue;
    const metrics = sourceMetrics(product);
    const metricIds = metrics.map(metric => metric.id);
    if (new Set(metricIds).size !== metricIds.length) continue;
    const evidenceReady = metrics.every(metric => {
      const calculatedAt = strictInstant(metric.lineage?.calculatedAt);
      return metric.status === "VERIFIED" &&
        metric.completeness === "COMPLETE" &&
        metric.quality === "ACCEPTABLE" &&
        metric.asOf === input.asOf &&
        calculatedAt !== null &&
        calculatedAt <= snapshotTime &&
        metric.lineage.evidenceIds.length > 0;
    });
    if (!evidenceReady) continue;

    if (!recommendationMatchesSources(product, recommendation, input.asOf)) continue;

    const available = recommendation.availableToPromise;
    const incoming = recommendation.incomingPurchaseQuantity;
    const covered = recommendation.coveredAfterIncoming;
    const leadTimeDemand = recommendation.leadTimeDemand;
    if ([available, incoming, covered, leadTimeDemand].some(value =>
      typeof value !== "number" || !Number.isFinite(value) || value < 0
    )) continue;

    // A lead-time coverage deficit is the immediate risk; a reorder-point gap remains
    // a medium-priority purchasing review rather than a claimed stockout.
    const urgent = (covered as number) < (leadTimeDemand as number);
    const priority = urgent ? "P1" as const : "P2" as const;
    const priorityScore = urgent ? 300 : 200;
    const evidenceIds = unique(recommendation.evidenceIds);
    const sourceEvidenceIds = new Set(unique(metrics.flatMap(metric => metric.lineage.evidenceIds)));
    if (!evidenceIds.length || evidenceIds.length !== sourceEvidenceIds.size ||
        evidenceIds.some(id => !sourceEvidenceIds.has(id))) continue;

    const id = ("inventory.replenishment:" + productRef.slice(0, 90) + ":" + input.asOf.slice(0, 10)).slice(0, 150);
    const formulaVersions = unique([
      recommendation.formulaId + "@" + recommendation.formulaVersion,
      ...metrics.map(metric => metric.lineage.formulaId + "@" + metric.lineage.formulaVersion),
    ]).slice(0, 50);
    const metricKeys = unique(metrics.map(metric => metric.key));

    candidates.push({
      id,
      ruleId: "inventory.replenishment.review",
      ruleVersion: RULE_VERSION,
      priority,
      priorityScore,
      what: "مراجعة إعادة توريد الصنف " + productRef + " وإعداد مسودة شراء عند الاعتماد",
      why: "الكمية الموصى بها " + recommendation.recommendedQuantity + " " + recommendation.quantityUnit +
        "؛ المتاح " + available + " والوارد المؤكد " + incoming +
        "، والتغطية بعد الوارد " + covered + " مقابل طلب مهلة التوريد " + leadTimeDemand + ".",
      soWhat: urgent
        ? "التغطية الحالية والوارد المؤكد أقل من طلب مهلة التوريد المرصود؛ توجد مخاطرة نقص تستوجب مراجعة عاجلة، ولا تمثل هذه الإشارة ضماناً بحدوث نفاد."
        : "توجد فجوة عن مستوى المخزون المستهدف بعد احتساب الوارد؛ المتاح يغطي طلب مهلة التوريد المرصود حالياً، لذلك يلزم التخطيط للتوريد دون ادعاء نفاد وشيك.",
      impact: null,
      impactStatus: "WITHHELD",
      impactReason: "UNIT_COST_OR_CURRENCY_NOT_VERIFIED",
      whatNext: "تحقق من الرصيد والوارد وأي طلبات مفتوحة، ثم راجع المورد والسعر والوحدة وأنشئ مسودة شراء بالكمية الموصى بها بعد الموافقة.",
      proof: {
        evidenceIds,
        metricKeys,
        asOf: input.asOf,
        formulaVersions,
      },
      owner: "مسؤول المشتريات والمخزون",
      expectedOutcome: "تغطية الاحتياج المتوقع خلال مهلة التوريد وفق بيانات الطلب والمخزون المثبتة بعد اعتماد مسودة الشراء.",
      createdAt: input.asOf,
      expiresAt: null,
    });
  }

  return candidates.sort((left, right) =>
    right.priorityScore - left.priorityScore ||
    left.id.localeCompare(right.id)
  );
}
