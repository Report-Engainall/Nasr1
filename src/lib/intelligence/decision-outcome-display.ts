export interface DecisionOutcomeDisplayPeriod {
  from: string;
  to: string;
}
export interface DecisionOutcomeDisplayScope {
  label: string;
  currency: string | null;
  period: DecisionOutcomeDisplayPeriod | null;
  baselinePeriod: DecisionOutcomeDisplayPeriod | null;
  asOf: string | null;
  sourceNote: string | null;
  measurementKind: "CURRENCY" | "RATIO" | "UNKNOWN";
}
interface DecisionOutcomeDisplaySource {
  candidateId: string;
  ruleId: string;
  candidateSnapshot: {
    proof: {
      evidenceIds: string[];
      metricKeys: string[];
      asOf: string;
    };
  } | null;
}
interface ConcentrationEvidence {
  domain: "product" | "supplier";
  currency: string;
  period: DecisionOutcomeDisplayPeriod;
  asOf: string;
}
const CURRENCY = /^[A-Z]{3}$/;
const DAY = /^\\d{4}-\\d{2}-\\d{2}$/;
const DAY_MS = 86_400_000;

function validDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function validInstant(value: string): boolean {
  return value.includes("T") && Number.isFinite(Date.parse(value));
}
function validAdjacentEqualPeriods(earlier: DecisionOutcomeDisplayPeriod, later: DecisionOutcomeDisplayPeriod): boolean {
  if (!validDay(earlier.from) || !validDay(earlier.to) ||
      !validDay(later.from) || !validDay(later.to) ||
      earlier.from > earlier.to || later.from > later.to) return false;
  const earlierFrom = Date.parse(earlier.from + "T00:00:00.000Z");
  const earlierTo = Date.parse(earlier.to + "T00:00:00.000Z");
  const laterFrom = Date.parse(later.from + "T00:00:00.000Z");
  const laterTo = Date.parse(later.to + "T00:00:00.000Z");
  return earlierTo + DAY_MS === laterFrom &&
    earlierTo - earlierFrom === laterTo - laterFrom;
}
function parseConcentrationEvidence(id: string): ConcentrationEvidence | null {
  const match = /^rpc:(product-revenue-concentration|supplier-posted-payable-activity):([A-Z]{3}):(\\d{4}-\\d{2}-\\d{2}):(\\d{4}-\\d{2}-\\d{2}):(.+)$/.exec(id);
  if (!match || !CURRENCY.test(match[2]) ||
      !validDay(match[3]) || !validDay(match[4]) ||
      match[3] > match[4] || !validInstant(match[5])) return null;
  return {
    domain: match[1] === "product-revenue-concentration" ? "product" : "supplier",
    currency: match[2],
    period: { from: match[3], to: match[4] },
    asOf: match[5],
  };
}

/**
 * Presents the saved evidence scope without treating aggregate RPC snapshot IDs as
 * invoice or ledger-row references. Ratio decisions are deliberately not eligible
 * for the existing currency-only outcome measurement command.
 */
export function buildDecisionOutcomeDisplayScope(
  outcome: DecisionOutcomeDisplaySource,
): DecisionOutcomeDisplayScope {
  const productMatch = /^finance\\.product-concentration\\.review-increase\\.([A-Z]{3})$/.exec(outcome.ruleId);
  const supplierMatch = /^finance\\.supplier-concentration\\.review-increase\\.([A-Z]{3})$/.exec(outcome.ruleId);
  const concentration = productMatch || supplierMatch;
  if (concentration) {
    const domain = productMatch ? "product" : "supplier";
    const currency = concentration[1];
    const expectedMetric = (domain === "product"
      ? "product.revenue.top5_concentration_change:"
      : "supplier.posted_payable.top5_concentration_change:") + currency;
    const proof = outcome.candidateSnapshot?.proof;
    const rawIds = proof?.evidenceIds ?? [];
    const parsed = rawIds.map(parseConcentrationEvidence);
    const evidence = parsed.filter((item): item is ConcentrationEvidence => item !== null);
    const aligned = proof?.metricKeys.includes(expectedMetric) === true &&
      proof.asOf !== undefined && validInstant(proof.asOf) &&
      evidence.length === 2 && evidence.length === rawIds.length &&
      new Set(rawIds).size === rawIds.length &&
      evidence.every(item => item.domain === domain && item.currency === currency && item.asOf === proof.asOf);
    const ordered = aligned
      ? [...evidence].sort((a, b) => a.period.from.localeCompare(b.period.from))
      : [];
    const comparable = ordered.length === 2 &&
      validAdjacentEqualPeriods(ordered[0].period, ordered[1].period);
    return {
      label: domain === "product" ? "تركيز مبيعات المنتجات" : "تركيز التزامات الموردين",
      currency,
      period: comparable ? ordered[1].period : null,
      baselinePeriod: comparable ? ordered[0].period : null,
      asOf: comparable ? proof!.asOf : null,
      sourceNote: comparable
        ? "الإثبات لقطتا RPC تجميعيّتان للفترتين؛ لا تمثلان معرفات فواتير أو قيود منفردة."
        : "تعذر إظهار فترتي المقارنة: مراجع اللقطات المحفوظة غير مكتملة أو غير متطابقة.",
      measurementKind: "RATIO",
    };
  }

  const cashflowMatch = /^cashflow\\.expected_collections:([A-Z]{3}):(\\d{4}-\\d{2}-\\d{2}):(\\d{4}-\\d{2}-\\d{2})$/.exec(outcome.candidateId);
  if (cashflowMatch && CURRENCY.test(cashflowMatch[1]) &&
      validDay(cashflowMatch[2]) && validDay(cashflowMatch[3]) &&
      cashflowMatch[2] <= cashflowMatch[3]) {
    return {
      label: "التحصيلات المجدولة",
      currency: cashflowMatch[1],
      period: { from: cashflowMatch[2], to: cashflowMatch[3] },
      baselinePeriod: null,
      asOf: outcome.candidateSnapshot?.proof.asOf ?? null,
      sourceNote: "رصيد مستحقات موثق للفترة؛ لا يمثل المقبوضات البنكية.",
      measurementKind: "CURRENCY",
    };
  }

  return {
    label: "نطاق القرار المحفوظ",
    currency: null,
    period: null,
    baselinePeriod: null,
    asOf: outcome.candidateSnapshot?.proof.asOf ?? null,
    sourceNote: null,
    measurementKind: "UNKNOWN",
  };
}
