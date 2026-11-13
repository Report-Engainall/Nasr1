import type { AiUsageAuditRecord } from "./ai-usage-audit-client";

export type AiUsageQualityStatus =
  | "INSUFFICIENT_SAMPLE"
  | "NOT_MEASURABLE"
  | "HEALTHY"
  | "WATCH"
  | "DEGRADED";

export interface AiUsageRateInsight {
  numerator: number;
  denominator: number;
  rate: number | null;
  status: AiUsageQualityStatus;
}

export interface AiUsageLatencyInsight {
  p95Ms: number | null;
  sampleCount: number;
  status: AiUsageQualityStatus;
}

export interface AiUsageQualityInsights {
  recordsAnalyzed: number;
  attemptedRecords: number;
  unclassifiedAttemptRecords: number;
  providerFailures: AiUsageRateInsight;
  fallbackReliance: AiUsageRateInsight;
  p95Latency: AiUsageLatencyInsight;
  measurementGaps: AiUsageRateInsight;
}

export const AI_USAGE_QUALITY_THRESHOLDS = Object.freeze({
  minimumSample: 5,
  providerFailureWatchRate: 0.15,
  providerFailureDegradedRate: 0.30,
  fallbackWatchRate: 0.25,
  fallbackDegradedRate: 0.40,
  latencyWatchMs: 5000,
  latencyDegradedMs: 10000,
  measurementGapWatchRate: 0.20,
  measurementGapDegradedRate: 0.40,
});

function rateInsight(
  numerator: number,
  denominator: number,
  watchRate: number,
  degradedRate: number,
  forceInsufficient = false,
): AiUsageRateInsight {
  if (denominator === 0) {
    return { numerator, denominator, rate: null, status: "NOT_MEASURABLE" };
  }
  const rate = numerator / denominator;
  if (denominator < AI_USAGE_QUALITY_THRESHOLDS.minimumSample || forceInsufficient) {
    return { numerator, denominator, rate, status: "INSUFFICIENT_SAMPLE" };
  }
  if (rate >= degradedRate) return { numerator, denominator, rate, status: "DEGRADED" };
  if (rate >= watchRate) return { numerator, denominator, rate, status: "WATCH" };
  return { numerator, denominator, rate, status: "HEALTHY" };
}

function latencyInsight(records: readonly AiUsageAuditRecord[]): AiUsageLatencyInsight {
  const latencies = records
    .filter(record => record.providerAttemptCount > 0)
    .map(record => record.executionTimeMs)
    .filter(value => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (latencies.length === 0) {
    return { p95Ms: null, sampleCount: 0, status: "NOT_MEASURABLE" };
  }
  if (latencies.length < AI_USAGE_QUALITY_THRESHOLDS.minimumSample) {
    return { p95Ms: latencies[latencies.length - 1], sampleCount: latencies.length, status: "INSUFFICIENT_SAMPLE" };
  }
  const p95Ms = latencies[Math.ceil(0.95 * latencies.length) - 1];
  if (p95Ms >= AI_USAGE_QUALITY_THRESHOLDS.latencyDegradedMs) {
    return { p95Ms, sampleCount: latencies.length, status: "DEGRADED" };
  }
  if (p95Ms >= AI_USAGE_QUALITY_THRESHOLDS.latencyWatchMs) {
    return { p95Ms, sampleCount: latencies.length, status: "WATCH" };
  }
  return { p95Ms, sampleCount: latencies.length, status: "HEALTHY" };
}

export function buildAiUsageQualityInsights(
  records: readonly AiUsageAuditRecord[],
): AiUsageQualityInsights {
  const attempted = records.filter(record => record.providerAttemptCount > 0);
  const unclassifiedAttemptRecords = attempted.filter(record => !record.providerAttemptTelemetryAvailable).length;
  const knownAttempts = attempted
    .filter(record => record.providerAttemptTelemetryAvailable)
    .flatMap(record => record.providerAttempts);
  const failedAttempts = knownAttempts.filter(attempt => attempt.status === "failed").length;
  const fallbackRecords = attempted.filter(record => record.fallbackUsed).length;
  const incompleteMeasurements = attempted.filter(record =>
    record.measurementStatus === "partial" ||
    record.measurementStatus === "unknown" ||
    record.measurementStatus === "legacy_unknown"
  ).length;

  return {
    recordsAnalyzed: records.length,
    attemptedRecords: attempted.length,
    unclassifiedAttemptRecords,
    providerFailures: rateInsight(
      failedAttempts,
      knownAttempts.length,
      AI_USAGE_QUALITY_THRESHOLDS.providerFailureWatchRate,
      AI_USAGE_QUALITY_THRESHOLDS.providerFailureDegradedRate,
      unclassifiedAttemptRecords > 0,
    ),
    fallbackReliance: rateInsight(
      fallbackRecords,
      attempted.length,
      AI_USAGE_QUALITY_THRESHOLDS.fallbackWatchRate,
      AI_USAGE_QUALITY_THRESHOLDS.fallbackDegradedRate,
    ),
    p95Latency: latencyInsight(records),
    measurementGaps: rateInsight(
      incompleteMeasurements,
      attempted.length,
      AI_USAGE_QUALITY_THRESHOLDS.measurementGapWatchRate,
      AI_USAGE_QUALITY_THRESHOLDS.measurementGapDegradedRate,
    ),
  };
}
