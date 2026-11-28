import { buildDailyDecisions, type DecisionRule } from "./daily-decisions";
import { buildSupplierPayableConcentrationTrend } from "./supplier-payable-concentration-trend";
import { timestampMicroseconds, type ProductRevenueConcentrationSnapshot } from "./product-revenue-concentration-client";
import type { SupplierPostedPayableActivitySnapshot } from "./supplier-posted-payable-activity-client";
import type { DecisionCandidate, EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";

export interface BuildConcentrationDecisionCandidatesInput {
  generatedAt: string;
  productCurrent: ProductRevenueConcentrationSnapshot | null;
  productBaseline: ProductRevenueConcentrationSnapshot | null;
  supplierCurrent: SupplierPostedPayableActivitySnapshot | null;
  supplierBaseline: SupplierPostedPayableActivitySnapshot | null;
}
export interface ConcentrationDecisionCandidatesResult {
  candidates: DecisionCandidate[];
  evidenceRecords: EvidenceRecord[];
  metrics: MetricSnapshot[];
  withheld: string[];
}

const DAY_MS = 86_400_000;
const CURRENCY = /^[A-Z]{3}$/;

function validDay(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const value = Date.parse(day + "T00:00:00.000Z");
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day ? value : null;
}
function adjacentEqualPeriods(current: EvidencePeriod, baseline: EvidencePeriod): boolean {
  const currentFrom = validDay(current.from);
  const currentTo = validDay(current.to);
  const baselineFrom = validDay(baseline.from);
  const baselineTo = validDay(baseline.to);
  if (currentFrom === null || currentTo === null || baselineFrom === null || baselineTo === null ||
      currentFrom > currentTo || baselineFrom > baselineTo) return false;
  const currentDays = (currentTo - currentFrom) / DAY_MS + 1;
  const baselineDays = (baselineTo - baselineFrom) / DAY_MS + 1;
  return currentDays === baselineDays && currentDays <= 366 && baselineTo + DAY_MS === currentFrom;
}
function snapshotAligned(currentAsOf: string, baselineAsOf: string, generatedAt: string): boolean {
  const current = timestampMicroseconds(currentAsOf);
  const baseline = timestampMicroseconds(baselineAsOf);
  const generated = timestampMicroseconds(generatedAt);
  return current !== null && current === baseline && generated !== null && generated >= current;
}
function rpcEvidence(
  id: string,
  name: string,
  version: string,
  currency: string,
  asOf: string,
  period: EvidencePeriod,
): EvidenceRecord {
  return {
    id,
    source: { kind: "RPC", name, version },
    sourceTimestamp: asOf,
    asOf,
    period,
    currency,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}
function concentrationMetric(
  id: string,
  key: string,
  deltaPercentagePoints: number,
  asOf: string,
  _period: EvidencePeriod,
  evidenceIds: string[],
  formulaId: string,
  formulaVersion: string,
  transformation: string,
): MetricSnapshot {
  return {
    id,
    key,
    value: deltaPercentagePoints / 100,
    unit: "RATIO",
    unitOfMeasure: "FRACTION",
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    // A delta compares two adjacent periods; source periods remain on the two evidence records.
    period: null,
    asOf,
    lineage: {
      evidenceIds,
      calculatedAt: asOf,
      formulaId,
      formulaVersion,
      transformations: [transformation],
    },
    warnings: [],
  };
}
function buildCandidate(
  generatedAt: string,
  metric: MetricSnapshot,
  rule: DecisionRule,
  records: EvidenceRecord[],
): DecisionCandidate | null {
  const result = buildDailyDecisions({
    generatedAt,
    asOf: metric.asOf,
    evidenceRecords: records,
    metrics: [metric],
    rules: [rule],
  });
  return result.candidates[0] ?? null;
}

/**
 * Creates review-only daily decisions from a verified rise in concentration
 * across adjacent, equal-length periods. The evidence references identify the
 * two aggregate RPC snapshots, not individual invoices, suppliers or ledger rows.
 * No currency amount or financial impact is inferred from a concentration ratio.
 */
export function buildConcentrationDecisionCandidates(
  input: BuildConcentrationDecisionCandidatesInput,
): ConcentrationDecisionCandidatesResult {
  const candidates: DecisionCandidate[] = [];
  const evidenceRecords: EvidenceRecord[] = [];
  const metrics: MetricSnapshot[] = [];
  const withheld: string[] = [];

  const productCurrent = input.productCurrent;
  const productBaseline = input.productBaseline;
  if (productCurrent && productBaseline) {
    const compatible = productCurrent.status === "VERIFIED" &&
      productBaseline.status === "VERIFIED" &&
      productCurrent.completePopulation && productBaseline.completePopulation &&
      productCurrent.formulaId === productBaseline.formulaId &&
      productCurrent.formulaVersion === productBaseline.formulaVersion &&
      snapshotAligned(productCurrent.asOf, productBaseline.asOf, input.generatedAt) &&
      adjacentEqualPeriods(productCurrent.period, productBaseline.period);
    if (!compatible) {
      withheld.push("PRODUCT_CONCENTRATION_PERIOD_OR_EVIDENCE_NOT_COMPARABLE");
    } else {
      const baselineByCurrency = new Map(productBaseline.currencies.map(row => [row.currency, row]));
      for (const current of productCurrent.currencies) {
        const baseline = baselineByCurrency.get(current.currency);
        if (!baseline || !CURRENCY.test(current.currency) ||
            current.status !== "VERIFIED" || baseline.status !== "VERIFIED" ||
            current.top5ConcentrationPercent === null || baseline.top5ConcentrationPercent === null) continue;
        const delta = Number((current.top5ConcentrationPercent - baseline.top5ConcentrationPercent).toFixed(2));
        if (!Number.isFinite(delta) || delta <= 0.005) continue;

        const currentEvidenceId = "rpc:product-revenue-concentration:" + current.currency + ":" +
          productCurrent.period.from + ":" + productCurrent.period.to + ":" + productCurrent.asOf;
        const baselineEvidenceId = "rpc:product-revenue-concentration:" + current.currency + ":" +
          productBaseline.period.from + ":" + productBaseline.period.to + ":" + productBaseline.asOf;
        const records = [
          rpcEvidence(currentEvidenceId, "fetch_business_health_product_revenue_concentration",
            productCurrent.formulaVersion, current.currency, productCurrent.asOf, productCurrent.period),
          rpcEvidence(baselineEvidenceId, "fetch_business_health_product_revenue_concentration",
            productBaseline.formulaVersion, current.currency, productBaseline.asOf, productBaseline.period),
        ];
        const metricKey = "product.revenue.top5_concentration_change:" + current.currency;
        const metricId = "metric:" + metricKey + ":" + productCurrent.asOf;
        const metric = concentrationMetric(
          metricId, metricKey, delta, productCurrent.asOf, productCurrent.period,
          [currentEvidenceId, baselineEvidenceId],
          "nasr1.top5-product-revenue-concentration-period-delta", "1.0.0",
          "current top-five product concentration minus the immediately preceding equal-length period; expressed as a fractional ratio",
        );
        const rule: DecisionRule = {
          id: "finance.product-concentration.review-increase." + current.currency,
          version: "1.0.0",
          metricKey,
          operator: "GT",
          threshold: 0,
          priority: "P3",
          what: "مراجعة ارتفاع تركّز مبيعات المنتجات · " + current.currency,
          why: "ارتفعت حصة أعلى خمسة منتجات من " + baseline.top5ConcentrationPercent +
            "% إلى " + current.top5ConcentrationPercent + "%؛ الزيادة " + delta + " نقطة مئوية.",
          soWhat: "قد يزيد الاعتماد التجاري على مجموعة أصغر من المنتجات؛ لا يثبت هذا المؤشر وحده انخفاض الربحية أو نفاد المخزون.",
          whatNext: "راجع توافر الأصناف الأعلى مبيعاً ودورانها والبدائل ومخاطر التوريد، ثم وثّق إجراءً مناسباً عند الحاجة.",
          owner: "مدير المبيعات والمخزون",
          expectedOutcome: "تقييم الاعتماد على مجموعة المنتجات الأعلى مبيعاً دون افتراض إيراد أو ربح إضافي.",
        };
        const candidate = buildCandidate(input.generatedAt, metric, rule, records);
        if (candidate) {
          candidates.push(candidate);
          evidenceRecords.push(...records);
          metrics.push(metric);
        }
      }
    }
  }

  const supplierCurrent = input.supplierCurrent;
  const supplierBaseline = input.supplierBaseline;
  if (supplierCurrent && supplierBaseline) {
    const trend = buildSupplierPayableConcentrationTrend(supplierCurrent, supplierBaseline);
    if (trend.status === "UNAVAILABLE" || trend.status === "NOT_COMPARABLE") {
      withheld.push(...trend.warnings);
    }
    const currentByCurrency = new Map(supplierCurrent.currencies.map(row => [row.currency, row]));
    const baselineByCurrency = new Map(supplierBaseline.currencies.map(row => [row.currency, row]));
    for (const comparison of trend.comparisons) {
      if (!CURRENCY.test(comparison.currency) || comparison.changePercentagePoints <= 0.005) continue;
      const current = currentByCurrency.get(comparison.currency);
      const baseline = baselineByCurrency.get(comparison.currency);
      if (!current || !baseline || current.status !== "VERIFIED" || baseline.status !== "VERIFIED") continue;

      const currentEvidenceId = "rpc:supplier-posted-payable-activity:" + comparison.currency + ":" +
        supplierCurrent.period.from + ":" + supplierCurrent.period.to + ":" + supplierCurrent.asOf;
      const baselineEvidenceId = "rpc:supplier-posted-payable-activity:" + comparison.currency + ":" +
        supplierBaseline.period.from + ":" + supplierBaseline.period.to + ":" + supplierBaseline.asOf;
      const records = [
        rpcEvidence(currentEvidenceId, "fetch_business_health_supplier_posted_payable_activity",
          supplierCurrent.formulaVersion, comparison.currency, supplierCurrent.asOf, supplierCurrent.period),
        rpcEvidence(baselineEvidenceId, "fetch_business_health_supplier_posted_payable_activity",
          supplierBaseline.formulaVersion, comparison.currency, supplierBaseline.asOf, supplierBaseline.period),
      ];
      const metricKey = "supplier.posted_payable.top5_concentration_change:" + comparison.currency;
      const metricId = "metric:" + metricKey + ":" + supplierCurrent.asOf;
      const metric = concentrationMetric(
        metricId, metricKey, comparison.changePercentagePoints, supplierCurrent.asOf, supplierCurrent.period,
        [currentEvidenceId, baselineEvidenceId],
        trend.formulaId, trend.formulaVersion,
        "current top-five posted supplier payable concentration minus the immediately preceding equal-length period; expressed as a fractional ratio",
      );
      const rule: DecisionRule = {
        id: "finance.supplier-concentration.review-increase." + comparison.currency,
        version: "1.0.0",
        metricKey,
        operator: "GT",
        threshold: 0,
        priority: "P2",
        what: "مراجعة ارتفاع تركّز التزامات الموردين · " + comparison.currency,
        why: "ارتفعت حصة أعلى خمسة موردين من " + comparison.baselinePercent +
          "% إلى " + comparison.currentPercent + "%؛ الزيادة " +
          comparison.changePercentagePoints + " نقطة مئوية عبر قيود الاستلام المنشورة المؤهلة.",
        soWhat: "قد يرفع الاعتماد المتزايد على عدد محدود من الموردين مخاطر استمرارية التوريد؛ المؤشر لا يمثل إجمالي المشتريات أو رصيد الدائنين.",
        whatNext: "راجع بدائل التوريد وشروط الموردين ومواعيد التسليم وتوزيع أوامر الشراء، ثم وثّق خطة تنويع عند الحاجة.",
        owner: "مدير المشتريات",
        expectedOutcome: "تقييم مخاطر تركّز الموردين وتحسين استمرارية التوريد دون افتراض أرصدة أو مشتريات غير مثبتة.",
      };
      const candidate = buildCandidate(input.generatedAt, metric, rule, records);
      if (candidate) {
        candidates.push(candidate);
        evidenceRecords.push(...records);
        metrics.push(metric);
      }
    }
  }

  return {
    candidates,
    evidenceRecords,
    metrics,
    withheld: [...new Set(withheld)],
  };
}
