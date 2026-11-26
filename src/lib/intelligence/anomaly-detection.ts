import { buildEvidencePassport } from "./evidence-passport";
import { decimalToMinorUnits, minorUnitsToNumber, roundedPercentageHundredths } from "./financial-precision";
import type { EvidencePeriod, EvidenceRecord, EvidenceStatus, MetricSnapshot, MetricUnit } from "./types";

export type AnomalyDirection = "INCREASE" | "DECREASE" | "EITHER";
export type AnomalyPriority = "P1" | "P2" | "P3";

export interface AnomalyRule {
  id: string;
  version: string;
  metricKey: string;
  direction: AnomalyDirection;
  /** Hundredths of one percentage point: 2_000 means a 20.00% change. */
  minimumChangePercentHundredths: number;
  minimumCurrentSampleCount: number;
  minimumBaselineSampleCount: number;
  priority: AnomalyPriority;
  title: string;
  owner: string;
}

export interface AnomalySignal {
  id: string;
  ruleId: string;
  currentMetricId: string;
  baselineMetricId: string;
  currentSampleMetricId: string;
  baselineSampleMetricId: string;
}

export interface MetricAnomaly {
  id: string;
  ruleId: string;
  ruleVersion: string;
  metricKey: string;
  title: string;
  priority: AnomalyPriority;
  direction: "INCREASE" | "DECREASE";
  currentValue: number;
  baselineValue: number;
  changePercentHundredths: number;
  unit: MetricUnit;
  currency?: string;
  unitOfMeasure?: string;
  currentSampleCount: number;
  baselineSampleCount: number;
  period: EvidencePeriod;
  baselinePeriod: EvidencePeriod;
  asOf: string;
  owner: string;
  causeStatus: "NOT_INFERRED";
  recommendation: string;
  evidenceIds: string[];
  formulaVersions: string[];
}

export interface WithheldAnomaly {
  signalId: string;
  ruleId: string;
  reason:
    | "INVALID_RULE"
    | "DUPLICATE_SIGNAL"
    | "METRIC_MISSING"
    | "METRIC_AMBIGUOUS"
    | "METRIC_NOT_VERIFIED"
    | "METRIC_SCOPE_MISMATCH"
    | "SAMPLE_INSUFFICIENT"
    | "INVALID_COMPARISON"
    | "ZERO_OR_NEGATIVE_BASELINE"
    | "UNSUPPORTED_PRECISION";
}

export interface AnomalyDetectionResult {
  id: string;
  generatedAt: string;
  asOf: string;
  status: EvidenceStatus;
  anomalies: MetricAnomaly[];
  withheld: WithheldAnomaly[];
  evidenceIds: string[];
  warnings: string[];
}

type MetricRead = { metric: MetricSnapshot; minorUnits: bigint };

const DAY_MS = 86_400_000;
const MAX_THRESHOLD_HUNDREDTHS = 100_000_000;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validInstant(value: string): boolean {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
    return false;
  }
  const day = value.slice(0, 10);
  const dayMillis = Date.parse(day + "T00:00:00.000Z");
  return Number.isFinite(Date.parse(value)) &&
    Number.isFinite(dayMillis) &&
    new Date(dayMillis).toISOString().slice(0, 10) === day;
}

function validDay(value: string): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function samePeriod(a: EvidencePeriod | null, b: EvidencePeriod | null): boolean {
  return a !== null && b !== null && a.from === b.from && a.to === b.to;
}

function comparablePeriods(current: EvidencePeriod, baseline: EvidencePeriod, asOf: string): boolean {
  if (!validDay(current.from) || !validDay(current.to) ||
      !validDay(baseline.from) || !validDay(baseline.to) ||
      current.from > current.to || baseline.from > baseline.to) return false;
  const currentFrom = Date.parse(current.from + "T00:00:00.000Z");
  const currentTo = Date.parse(current.to + "T00:00:00.000Z");
  const baselineFrom = Date.parse(baseline.from + "T00:00:00.000Z");
  const baselineTo = Date.parse(baseline.to + "T00:00:00.000Z");
  const currentDays = (currentTo - currentFrom) / DAY_MS + 1;
  const baselineDays = (baselineTo - baselineFrom) / DAY_MS + 1;
  const snapshotDay = new Date(Date.parse(asOf)).toISOString().slice(0, 10);
  return current.to === snapshotDay &&
    baselineTo + DAY_MS === currentFrom &&
    currentDays === baselineDays;
}

function validRule(rule: AnomalyRule): boolean {
  return object(rule) &&
    typeof rule.id === "string" && rule.id.trim().length > 0 && rule.id.length <= 120 &&
    typeof rule.version === "string" && rule.version.trim().length > 0 && rule.version.length <= 40 &&
    typeof rule.metricKey === "string" && rule.metricKey.trim().length > 0 && rule.metricKey.length <= 160 &&
    ["INCREASE", "DECREASE", "EITHER"].includes(rule.direction) &&
    Number.isSafeInteger(rule.minimumChangePercentHundredths) &&
    rule.minimumChangePercentHundredths > 0 &&
    rule.minimumChangePercentHundredths <= MAX_THRESHOLD_HUNDREDTHS &&
    Number.isSafeInteger(rule.minimumCurrentSampleCount) &&
    rule.minimumCurrentSampleCount >= 3 && rule.minimumCurrentSampleCount <= 1_000_000 &&
    Number.isSafeInteger(rule.minimumBaselineSampleCount) &&
    rule.minimumBaselineSampleCount >= 3 && rule.minimumBaselineSampleCount <= 1_000_000 &&
    ["P1", "P2", "P3"].includes(rule.priority) &&
    typeof rule.title === "string" && rule.title.trim().length > 0 && rule.title.length <= 180 &&
    typeof rule.owner === "string" && rule.owner.trim().length > 0 && rule.owner.length <= 100;
}

function unitIdentity(metric: MetricSnapshot): string | null {
  if (metric.unit === "CURRENCY" || metric.unit === "CURRENCY_PER_UNIT") {
    if (!metric.currency?.trim()) return null;
  }
  if (metric.unit === "QUANTITY" || metric.unit === "CURRENCY_PER_UNIT") {
    if (!metric.unitOfMeasure?.trim()) return null;
  }
  return metric.unit + "|" + (metric.currency?.trim().toUpperCase() ?? "") + "|" +
    (metric.unitOfMeasure?.trim().toUpperCase() ?? "");
}

function readMetric(
  id: string,
  index: Map<string, MetricSnapshot[]>,
): { read: MetricRead | null; reason: WithheldAnomaly["reason"] | null } {
  const matches = index.get(id) ?? [];
  if (matches.length === 0) return { read: null, reason: "METRIC_MISSING" };
  if (matches.length !== 1) return { read: null, reason: "METRIC_AMBIGUOUS" };
  const metric = matches[0];
  if (metric.status !== "VERIFIED" || metric.completeness !== "COMPLETE" || metric.quality !== "ACCEPTABLE") {
    return { read: null, reason: "METRIC_NOT_VERIFIED" };
  }
  if (!metric.period || !metric.lineage?.evidenceIds?.length ||
      !metric.lineage.formulaId?.trim() || !metric.lineage.formulaVersion?.trim() ||
      !validInstant(metric.lineage.calculatedAt) || Date.parse(metric.lineage.calculatedAt) > Date.parse(metric.asOf)) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  const scaled = decimalToMinorUnits(metric.value, 6, metric.unit === "CURRENCY" || metric.unit === "RATIO");
  if (scaled === null) return { read: null, reason: "UNSUPPORTED_PRECISION" };
  if ((metric.unit === "COUNT" || metric.unit === "QUANTITY" || metric.unit === "DAYS") && scaled < 0n) {
    return { read: null, reason: "METRIC_NOT_VERIFIED" };
  }
  if (metric.unit === "COUNT" && (scaled % 1_000_000n !== 0n || scaled / 1_000_000n > BigInt(Number.MAX_SAFE_INTEGER))) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  if (!unitIdentity(metric)) return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  return { read: { metric, minorUnits: scaled }, reason: null };
}

function readSample(
  id: string,
  reference: MetricRead,
  index: Map<string, MetricSnapshot[]>,
): { read: MetricRead | null; reason: WithheldAnomaly["reason"] | null } {
  const result = readMetric(id, index);
  if (!result.read) return result;
  if (result.read.metric.unit !== "COUNT" ||
      !samePeriod(result.read.metric.period, reference.metric.period)) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  return result;
}

function withheld(signal: AnomalySignal, reason: WithheldAnomaly["reason"]): WithheldAnomaly {
  return { signalId: signal.id || "unknown", ruleId: signal.ruleId || "unknown", reason };
}

/**
 * Deterministic paired-period anomaly detection over caller-supplied evidence.
 * It is read-only and intentionally does not fetch data, infer causes or write business state.
 */
export function buildAnomalyDetection(input: {
  id: string;
  generatedAt: string;
  asOf: string;
  evidenceRecords: EvidenceRecord[];
  metrics: MetricSnapshot[];
  rules: AnomalyRule[];
  signals: AnomalySignal[];
  /** Required caller attestation that every source population used by these signals is complete. */
  sourceSnapshotVerified: boolean;
}): AnomalyDetectionResult {
  if (!input.id.trim() || input.id.length > 160 ||
      !validInstant(input.generatedAt) || !validInstant(input.asOf) ||
      Date.parse(input.generatedAt) < Date.parse(input.asOf)) {
    throw new Error("anomaly_detection_timestamp_or_id_invalid");
  }
  if (!Array.isArray(input.evidenceRecords) || !Array.isArray(input.metrics) ||
      !Array.isArray(input.rules) || !Array.isArray(input.signals)) {
    throw new Error("anomaly_detection_payload_invalid");
  }

  const passport = buildEvidencePassport({
    id: "anomaly-detection:" + input.id,
    generatedAt: input.generatedAt,
    asOf: input.asOf,
    evidenceRecords: input.evidenceRecords,
    metrics: input.metrics,
  });
  const metricIndex = new Map<string, MetricSnapshot[]>();
  for (const metric of passport.metrics) {
    const rows = metricIndex.get(metric.id) ?? [];
    rows.push(metric);
    metricIndex.set(metric.id, rows);
  }

  const rules = new Map<string, AnomalyRule[]>();
  for (const rule of input.rules) {
    if (!rule || typeof rule.id !== "string" || !rule.id.trim()) continue;
    const rows = rules.get(rule.id) ?? [];
    rows.push(rule);
    rules.set(rule.id, rows);
  }

  const anomalies: MetricAnomaly[] = [];
  const withheldSignals: WithheldAnomaly[] = [];
  const seenSignals = new Set<string>();

  for (const signal of input.signals) {
    if (!signal || typeof signal.id !== "string" || !signal.id.trim() || signal.id.length > 200 ||
        typeof signal.ruleId !== "string" || !signal.ruleId.trim() ||
        typeof signal.currentMetricId !== "string" || !signal.currentMetricId.trim() ||
        typeof signal.baselineMetricId !== "string" || !signal.baselineMetricId.trim() ||
        typeof signal.currentSampleMetricId !== "string" || !signal.currentSampleMetricId.trim() ||
        typeof signal.baselineSampleMetricId !== "string" || !signal.baselineSampleMetricId.trim()) {
      withheldSignals.push(withheld(signal ?? ({} as AnomalySignal), "INVALID_RULE"));
      continue;
    }
    if (seenSignals.has(signal.id)) {
      withheldSignals.push(withheld(signal, "DUPLICATE_SIGNAL"));
      continue;
    }
    seenSignals.add(signal.id);

    const matchingRules = rules.get(signal.ruleId) ?? [];
    if (matchingRules.length !== 1 || !validRule(matchingRules[0])) {
      withheldSignals.push(withheld(signal, "INVALID_RULE"));
      continue;
    }
    const rule = matchingRules[0];

    const currentResult = readMetric(signal.currentMetricId, metricIndex);
    if (!currentResult.read) {
      withheldSignals.push(withheld(signal, currentResult.reason ?? "METRIC_MISSING"));
      continue;
    }
    const baselineResult = readMetric(signal.baselineMetricId, metricIndex);
    if (!baselineResult.read) {
      withheldSignals.push(withheld(signal, baselineResult.reason ?? "METRIC_MISSING"));
      continue;
    }
    const current = currentResult.read;
    const baseline = baselineResult.read;

    if (current.metric.key !== rule.metricKey || baseline.metric.key !== rule.metricKey ||
        current.metric.unit !== baseline.metric.unit ||
        unitIdentity(current.metric) !== unitIdentity(baseline.metric) ||
        current.metric.lineage.formulaId !== baseline.metric.lineage.formulaId ||
        current.metric.lineage.formulaVersion !== baseline.metric.lineage.formulaVersion ||
        !current.metric.period || !baseline.metric.period ||
        !comparablePeriods(current.metric.period, baseline.metric.period, input.asOf)) {
      withheldSignals.push(withheld(signal, "INVALID_COMPARISON"));
      continue;
    }

    const currentSampleResult = readSample(signal.currentSampleMetricId, current, metricIndex);
    if (!currentSampleResult.read) {
      withheldSignals.push(withheld(signal, currentSampleResult.reason ?? "METRIC_MISSING"));
      continue;
    }
    const baselineSampleResult = readSample(signal.baselineSampleMetricId, baseline, metricIndex);
    if (!baselineSampleResult.read) {
      withheldSignals.push(withheld(signal, baselineSampleResult.reason ?? "METRIC_MISSING"));
      continue;
    }
    const currentSample = currentSampleResult.read;
    const baselineSample = baselineSampleResult.read;
    if (currentSample.metric.key !== baselineSample.metric.key ||
        currentSample.metric.lineage.formulaId !== baselineSample.metric.lineage.formulaId ||
        currentSample.metric.lineage.formulaVersion !== baselineSample.metric.lineage.formulaVersion) {
      withheldSignals.push(withheld(signal, "INVALID_COMPARISON"));
      continue;
    }

    const currentCount = currentSample.minorUnits / 1_000_000n;
    const baselineCount = baselineSample.minorUnits / 1_000_000n;
    if (currentCount < BigInt(rule.minimumCurrentSampleCount) ||
        baselineCount < BigInt(rule.minimumBaselineSampleCount)) {
      withheldSignals.push(withheld(signal, "SAMPLE_INSUFFICIENT"));
      continue;
    }
    if (baseline.minorUnits <= 0n) {
      withheldSignals.push(withheld(signal, "ZERO_OR_NEGATIVE_BASELINE"));
      continue;
    }

    const delta = current.minorUnits - baseline.minorUnits;
    if (delta === 0n) continue;
    const isIncrease = delta > 0n;
    if ((rule.direction === "INCREASE" && !isIncrease) ||
        (rule.direction === "DECREASE" && isIncrease)) continue;

    const absoluteChange = delta < 0n ? -delta : delta;
    const percent = roundedPercentageHundredths(absoluteChange, baseline.minorUnits);
    if (percent === null || percent > BigInt(Number.MAX_SAFE_INTEGER)) {
      withheldSignals.push(withheld(signal, "UNSUPPORTED_PRECISION"));
      continue;
    }
    if (percent < BigInt(rule.minimumChangePercentHundredths)) continue;

    const currentValue = minorUnitsToNumber(current.minorUnits, 6);
    const baselineValue = minorUnitsToNumber(baseline.minorUnits, 6);
    if (currentValue === null || baselineValue === null) {
      withheldSignals.push(withheld(signal, "UNSUPPORTED_PRECISION"));
      continue;
    }
    const signedPercent = Number(percent) * (isIncrease ? 1 : -1);
    const sourceMetrics = [current.metric, baseline.metric, currentSample.metric, baselineSample.metric];
    const evidenceIds = [...new Set(sourceMetrics.flatMap(metric => metric.lineage.evidenceIds))].sort();
    const formulaVersions = [...new Set(sourceMetrics.map(metric =>
      metric.lineage.formulaId + "@" + metric.lineage.formulaVersion
    ))].sort();

    anomalies.push({
      id: "anomaly:" + signal.id + ":" + input.asOf,
      ruleId: rule.id,
      ruleVersion: rule.version,
      metricKey: rule.metricKey,
      title: rule.title.trim(),
      priority: rule.priority,
      direction: isIncrease ? "INCREASE" : "DECREASE",
      currentValue,
      baselineValue,
      changePercentHundredths: signedPercent,
      unit: current.metric.unit,
      ...(current.metric.currency ? { currency: current.metric.currency } : {}),
      ...(current.metric.unitOfMeasure ? { unitOfMeasure: current.metric.unitOfMeasure } : {}),
      currentSampleCount: Number(currentCount),
      baselineSampleCount: Number(baselineCount),
      period: current.metric.period as EvidencePeriod,
      baselinePeriod: baseline.metric.period as EvidencePeriod,
      asOf: input.asOf,
      owner: rule.owner.trim(),
      causeStatus: "NOT_INFERRED",
      recommendation: "راجع السجلات الأصلية ومصدر المؤشر والعوامل المتزامنة قبل اعتماد أي إجراء؛ لا يثبت الانحراف وحده سبباً محدداً.",
      evidenceIds,
      formulaVersions,
    });
  }

  const warnings = [...passport.warnings];
  const sourceSnapshotVerified = input.sourceSnapshotVerified === true;
  if (!sourceSnapshotVerified) warnings.push("ANOMALY_SOURCE_POPULATION_INCOMPLETE");
  if (withheldSignals.length > 0) warnings.push("ANOMALY_SIGNALS_WITHHELD");
  const status: EvidenceStatus = passport.status !== "VERIFIED"
    ? passport.status
    : !sourceSnapshotVerified || withheldSignals.length > 0 ? "NEEDS_REVIEW" : "VERIFIED";

  return {
    id: "anomaly-detection:" + input.id,
    generatedAt: input.generatedAt,
    asOf: input.asOf,
    status,
    anomalies: anomalies.sort((a, b) =>
      (a.priority === b.priority ? 0 : a.priority === "P1" ? -1 : b.priority === "P1" ? 1 :
        a.priority === "P2" ? -1 : b.priority === "P2" ? 1 : 0) ||
      Math.abs(b.changePercentHundredths) - Math.abs(a.changePercentHundredths) ||
      a.metricKey.localeCompare(b.metricKey)
    ),
    withheld: withheldSignals,
    evidenceIds: [...new Set(anomalies.flatMap(item => item.evidenceIds))].sort(),
    warnings: [...new Set(warnings)],
  };
}
