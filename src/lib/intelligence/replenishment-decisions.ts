import type { ReplenishmentProductInput, ReplenishmentRecommendation } from "./replenishment";
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
    if (!evidenceIds.length || evidenceIds.some(id => !sourceEvidenceIds.has(id))) continue;

    const id = ("inventory.replenishment:" + productRef.slice(0, 90) + ":" + input.asOf.slice(0, 10)).slice(0, 150);
    const formulaVersions = unique([
      recommendation.formulaId + "@" + recommendation.formulaVersion,
      ...metrics.map(metric => metric.lineage.formulaId + "@" + metric.lineage.formulaVersion),
    ]).slice(0, 50);
    const metricKeys = unique(metrics.map(metric => metric.key));

    candidates.push({
      id,
      ruleId: "inventory.replenishment.review",
      ruleVersion: recommendation.formulaVersion,
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
