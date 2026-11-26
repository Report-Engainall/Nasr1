import { describe, expect, it } from "vitest";
import { buildAnomalyDetection, type AnomalyRule, type AnomalySignal } from "./anomaly-detection";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot, MetricUnit } from "./types";

const asOf = "2026-11-26T02:45:47.000Z";
const currentPeriod: EvidencePeriod = { from: "2026-10-28", to: "2026-11-26" };
const baselinePeriod: EvidencePeriod = { from: "2026-09-28", to: "2026-10-27" };

function evidence(id: string, period: EvidencePeriod, currency?: string): EvidenceRecord {
  return {
    id,
    source: { kind: "RPC", name: "anomaly-engine-test-source", version: "1" },
    sourceTimestamp: asOf,
    asOf,
    period,
    ...(currency ? { currency } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

function metric(input: {
  id: string;
  key: string;
  value: number | string;
  unit?: MetricUnit;
  unitOfMeasure?: string;
  currency?: string;
  period?: EvidencePeriod;
  evidenceId: string;
  formulaId?: string;
}): MetricSnapshot {
  const unit = input.unit ?? "CURRENCY";
  return {
    id: input.id,
    key: input.key,
    value: input.value,
    unit,
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.unitOfMeasure ? { unitOfMeasure: input.unitOfMeasure } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: input.period ?? currentPeriod,
    asOf,
    lineage: {
      evidenceIds: [input.evidenceId],
      calculatedAt: asOf,
      formulaId: input.formulaId ?? input.key + ".v1",
      formulaVersion: "1",
      transformations: ["same-tenant aggregate"],
    },
    warnings: [],
  };
}

const rule: AnomalyRule = {
  id: "cash-outflow-spike",
  version: "1.0.0",
  metricKey: "cashflow.scheduled_outflows",
  direction: "EITHER",
  minimumChangePercentHundredths: 2_000,
  minimumCurrentSampleCount: 3,
  minimumBaselineSampleCount: 3,
  priority: "P1",
  title: "ارتفاع المصروفات المجدولة",
  owner: "المالية",
};

const signal: AnomalySignal = {
  id: "cash-outflow-period-comparison",
  ruleId: rule.id,
  currentMetricId: "outflow-current",
  baselineMetricId: "outflow-baseline",
  currentSampleMetricId: "outflow-current-samples",
  baselineSampleMetricId: "outflow-baseline-samples",
};

function fixture(options: {
  currentValue?: number | string;
  baselineValue?: number | string;
  currentSamples?: number;
  baselineSamples?: number;
  currentCurrency?: string;
  baselineCurrency?: string;
  currentUnit?: "EA" | "CARTON";
  baselineUnit?: "EA" | "CARTON";
  baselinePeriod?: EvidencePeriod;
  currentPeriod?: EvidencePeriod;
  ruleOverrides?: Partial<AnomalyRule>;
  signalOverrides?: Partial<AnomalySignal>;
  sourceSnapshotVerified?: boolean;
  duplicateMetricId?: boolean;
} = {}) {
  const currentCurrency = options.currentCurrency ?? "YER";
  const baselineCurrency = options.baselineCurrency ?? "YER";
  const current = options.currentPeriod ?? currentPeriod;
  const baseline = options.baselinePeriod ?? baselinePeriod;
  const records = [
    evidence("evidence-current", current, currentCurrency),
    evidence("evidence-baseline", baseline, baselineCurrency),
  ];
  const currentValue = metric({
    id: "outflow-current",
    key: rule.metricKey,
    value: options.currentValue ?? "125.00",
    unit: "CURRENCY",
    currency: currentCurrency,
    period: current,
    evidenceId: "evidence-current",
  });
  const baselineValue = metric({
    id: "outflow-baseline",
    key: rule.metricKey,
    value: options.baselineValue ?? "100.00",
    unit: "CURRENCY",
    currency: baselineCurrency,
    period: baseline,
    evidenceId: "evidence-baseline",
  });
  const currentSample = metric({
    id: "outflow-current-samples",
    key: "cashflow.scheduled_outflow_sample_count",
    value: options.currentSamples ?? 5,
    unit: "COUNT",
    period: current,
    evidenceId: "evidence-current",
    formulaId: "cashflow.scheduled_outflow_sample_count",
  });
  const baselineSample = metric({
    id: "outflow-baseline-samples",
    key: "cashflow.scheduled_outflow_sample_count",
    value: options.baselineSamples ?? 5,
    unit: "COUNT",
    period: baseline,
    evidenceId: "evidence-baseline",
    formulaId: "cashflow.scheduled_outflow_sample_count",
  });
  const metrics = [currentValue, baselineValue, currentSample, baselineSample];
  if (options.duplicateMetricId) metrics.push({ ...currentValue, value: "126.00" });
  return buildAnomalyDetection({
    id: "cash-anomalies",
    generatedAt: asOf,
    asOf,
    evidenceRecords: records,
    metrics,
    rules: [{ ...rule, ...options.ruleOverrides }],
    signals: [{ ...signal, ...options.signalOverrides }],
    sourceSnapshotVerified: options.sourceSnapshotVerified ?? true,
  });
}

describe("deterministic evidence-backed anomaly detection", () => {
  it("detects a verified increase using exact percentage arithmetic and source lineage", () => {
    const result = fixture();
    expect(result).toMatchObject({
      status: "VERIFIED",
      anomalies: [{
        ruleId: rule.id,
        direction: "INCREASE",
        currentValue: 125,
        baselineValue: 100,
        changePercentHundredths: 2_500,
        currency: "YER",
        currentSampleCount: 5,
        baselineSampleCount: 5,
        causeStatus: "NOT_INFERRED",
        evidenceIds: ["evidence-baseline", "evidence-current"],
      }],
      withheld: [],
    });
  });

  it("detects a decrease when the rule explicitly allows decreases", () => {
    const result = fixture({
      currentValue: "70.00",
      baselineValue: "100.00",
      ruleOverrides: { direction: "DECREASE" },
    });
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatchObject({
      direction: "DECREASE",
      changePercentHundredths: -3_000,
    });
  });

  it("does not emit an anomaly below the configured threshold", () => {
    const result = fixture({
      currentValue: "119.99",
      baselineValue: "100.00",
    });
    expect(result.anomalies).toHaveLength(0);
    expect(result.withheld).toHaveLength(0);
    expect(result.status).toBe("VERIFIED");
  });

  it("withholds a candidate when either sample is below its minimum", () => {
    const result = fixture({ currentSamples: 2 });
    expect(result.anomalies).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "SAMPLE_INSUFFICIENT" }]);
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it("withholds zero or negative baseline values because percentage change is undefined or misleading", () => {
    for (const baselineValue of ["0", "-10"]) {
      const result = fixture({ baselineValue });
      expect(result.withheld).toMatchObject([{ reason: "ZERO_OR_NEGATIVE_BASELINE" }]);
    }
  });

  it("does not compare different currencies or unit identities", () => {
    const currencyResult = fixture({ currentCurrency: "YER", baselineCurrency: "USD" });
    expect(currencyResult.anomalies).toHaveLength(0);
    expect(currencyResult.withheld).toMatchObject([{ reason: "INVALID_COMPARISON" }]);

    const unitResult = buildAnomalyDetection({
      id: "quantity-unit-mismatch",
      generatedAt: asOf,
      asOf,
      evidenceRecords: [evidence("current", currentPeriod), evidence("baseline", baselinePeriod)],
      metrics: [
        metric({ id: "current", key: "product.units.sold", value: 120, unit: "QUANTITY", unitOfMeasure: "EA", period: currentPeriod, evidenceId: "current" }),
        metric({ id: "baseline", key: "product.units.sold", value: 100, unit: "QUANTITY", unitOfMeasure: "CARTON", period: baselinePeriod, evidenceId: "baseline" }),
        metric({ id: "current-samples", key: "product.order.sample_count", value: 5, unit: "COUNT", period: currentPeriod, evidenceId: "current", formulaId: "sample.v1" }),
        metric({ id: "baseline-samples", key: "product.order.sample_count", value: 5, unit: "COUNT", period: baselinePeriod, evidenceId: "baseline", formulaId: "sample.v1" }),
      ],
      rules: [{ ...rule, metricKey: "product.units.sold" }],
      sourceSnapshotVerified: true,
      signals: [{
        ...signal,
        id: "unit-mismatch",
        currentMetricId: "current",
        baselineMetricId: "baseline",
        currentSampleMetricId: "current-samples",
        baselineSampleMetricId: "baseline-samples",
      }],
    });
    expect(unitResult.withheld).toMatchObject([{ reason: "INVALID_COMPARISON" }]);
  });

  it("requires adjacent equal-length periods ending on the UTC as-of day", () => {
    const gap = fixture({ baselinePeriod: { from: "2026-09-27", to: "2026-10-26" } });
    const unequal = fixture({ baselinePeriod: { from: "2026-10-01", to: "2026-10-27" } });
    expect(gap.withheld).toMatchObject([{ reason: "INVALID_COMPARISON" }]);
    expect(unequal.withheld).toMatchObject([{ reason: "INVALID_COMPARISON" }]);
  });

  it("withholds duplicate metric identities instead of choosing one arbitrarily", () => {
    const result = fixture({ duplicateMetricId: true });
    expect(result.anomalies).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "METRIC_AMBIGUOUS" }]);
  });

  it("rejects duplicate signal IDs rather than counting the same anomaly twice", () => {
    const result = buildAnomalyDetection({
      id: "duplicate-signal",
      generatedAt: asOf,
      asOf,
      evidenceRecords: [evidence("evidence-current", currentPeriod, "YER"), evidence("evidence-baseline", baselinePeriod, "YER")],
      metrics: [
        metric({ id: "outflow-current", key: rule.metricKey, value: 125, currency: "YER", evidenceId: "evidence-current" }),
        metric({ id: "outflow-baseline", key: rule.metricKey, value: 100, currency: "YER", period: baselinePeriod, evidenceId: "evidence-baseline" }),
        metric({ id: "outflow-current-samples", key: "cashflow.scheduled_outflow_sample_count", value: 5, unit: "COUNT", evidenceId: "evidence-current", formulaId: "sample.v1" }),
        metric({ id: "outflow-baseline-samples", key: "cashflow.scheduled_outflow_sample_count", value: 5, unit: "COUNT", period: baselinePeriod, evidenceId: "evidence-baseline", formulaId: "sample.v1" }),
      ],
      rules: [rule],
      signals: [signal, signal],
      sourceSnapshotVerified: true,
    });
    expect(result.anomalies).toHaveLength(1);
    expect(result.withheld).toMatchObject([{ reason: "DUPLICATE_SIGNAL" }]);
  });

  it("downgrades incomplete source populations even when an anomaly is otherwise supported", () => {
    const result = fixture({ sourceSnapshotVerified: false });
    expect(result.anomalies).toHaveLength(1);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.warnings).toContain("ANOMALY_SOURCE_POPULATION_INCOMPLETE");
  });

  it("does not infer a cause or perform a business mutation", () => {
    const result = fixture();
    expect(result.anomalies[0]).toMatchObject({ causeStatus: "NOT_INFERRED" });
    expect(result.anomalies[0].recommendation).toContain("لا يثبت الانحراف");
  });

  it("rejects malformed timestamp and identifier before evaluating signals", () => {
    expect(() => buildAnomalyDetection({
      id: "invalid-time",
      generatedAt: asOf,
      asOf: "2026-11-26T02:45:47",
      evidenceRecords: [],
      metrics: [],
      rules: [],
      signals: [],
      sourceSnapshotVerified: true,
    })).toThrow("anomaly_detection_timestamp_or_id_invalid");
  });
});
