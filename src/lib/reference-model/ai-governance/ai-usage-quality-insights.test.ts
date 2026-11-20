import { describe, expect, it } from "vitest";
import type { AiUsageAuditRecord, AiUsageProviderAttempt } from "./ai-usage-audit-client";
import { buildAiUsageQualityInsights } from "./ai-usage-quality-insights";

const succeededAttempt: AiUsageProviderAttempt = {
  provider: "openai_compatible",
  model: "test-model",
  fallback: false,
  status: "succeeded",
  elapsedMs: 500,
  observedInputTokens: 10,
  observedOutputTokens: 8,
  estimatedCost: 0.001,
  errorCode: null,
};

function auditRecord(index: number, overrides: Partial<AiUsageAuditRecord> = {}): AiUsageAuditRecord {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    requestId: `quality-test-${index}`,
    actorProfileId: null,
    modelName: "openai_compatible/test-model",
    estimatedCost: 0.001,
    executionTimeMs: 500,
    fallbackUsed: false,
    resultStatus: "completed",
    measurementStatus: "measured",
    observedInputTokens: 10,
    observedOutputTokens: 8,
    providerAttemptCount: 1,
    providerAttemptTelemetryAvailable: true,
    providerAttempts: [{ ...succeededAttempt }],
    outcomeReason: null,
    createdAt: "2026-11-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("deterministic AI usage quality insights", () => {
  it("does not describe an empty page as healthy", () => {
    const result = buildAiUsageQualityInsights([]);
    expect(result.recordsAnalyzed).toBe(0);
    expect(result.providerFailures.status).toBe("NOT_MEASURABLE");
    expect(result.fallbackReliance.status).toBe("NOT_MEASURABLE");
    expect(result.p95Latency).toMatchObject({ p95Ms: null, sampleCount: 0, status: "NOT_MEASURABLE" });
    expect(result.measurementGaps.status).toBe("NOT_MEASURABLE");
  });

  it("withholds a healthy or degraded label below the minimum provider sample", () => {
    const rows = Array.from({ length: 4 }, (_, index) => auditRecord(index, {
      providerAttempts: [{
        ...succeededAttempt,
        status: "failed",
        observedInputTokens: null,
        observedOutputTokens: null,
        estimatedCost: null,
        errorCode: "provider_error",
      }],
    }));
    expect(buildAiUsageQualityInsights(rows).providerFailures).toMatchObject({
      numerator: 4, denominator: 4, rate: 1, status: "INSUFFICIENT_SAMPLE",
    });
  });

  it("calculates provider failure rate over provider attempts", () => {
    const rows = Array.from({ length: 5 }, (_, index) => auditRecord(index, {
      providerAttempts: [{
        ...succeededAttempt,
        status: index < 2 ? "failed" : "succeeded",
        observedInputTokens: index < 2 ? null : 10,
        observedOutputTokens: index < 2 ? null : 8,
        estimatedCost: index < 2 ? null : 0.001,
        errorCode: index < 2 ? "provider_error" : null,
      }],
    }));
    expect(buildAiUsageQualityInsights(rows).providerFailures).toMatchObject({
      numerator: 2, denominator: 5, rate: 0.4, status: "DEGRADED",
    });
  });

  it("calculates fallback reliance over requests that attempted a provider", () => {
    const rows = Array.from({ length: 5 }, (_, index) => auditRecord(index, { fallbackUsed: index < 2 }));
    expect(buildAiUsageQualityInsights(rows).fallbackReliance).toMatchObject({
      numerator: 2, denominator: 5, rate: 0.4, status: "DEGRADED",
    });
  });

  it("uses nearest-rank P95 and explicit latency thresholds", () => {
    const rows = [100, 200, 300, 400, 12000].map((duration, index) =>
      auditRecord(index, { executionTimeMs: duration }),
    );
    expect(buildAiUsageQualityInsights(rows).p95Latency).toMatchObject({
      p95Ms: 12000, sampleCount: 5, status: "DEGRADED",
    });
  });

  it("counts partial and unknown measurement only among attempted requests", () => {
    const rows = [
      auditRecord(0, { measurementStatus: "unknown", observedInputTokens: null, observedOutputTokens: null }),
      auditRecord(1, { measurementStatus: "partial", observedInputTokens: null, observedOutputTokens: 8 }),
      auditRecord(2),
      auditRecord(3),
      auditRecord(4),
      auditRecord(5, { providerAttemptCount: 0, providerAttempts: [], measurementStatus: "not_attempted", observedInputTokens: null, observedOutputTokens: null }),
      auditRecord(6, { providerAttemptCount: 0, providerAttempts: [], measurementStatus: "not_attempted", observedInputTokens: null, observedOutputTokens: null }),
    ];
    expect(buildAiUsageQualityInsights(rows).measurementGaps).toMatchObject({
      numerator: 2, denominator: 5, rate: 0.4, status: "DEGRADED",
    });
    expect(buildAiUsageQualityInsights(rows).attemptedRecords).toBe(5);
  });

  it("does not classify malformed historical attempt telemetry as success", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, index) => auditRecord(index)),
      auditRecord(6, { providerAttemptTelemetryAvailable: false, providerAttemptCount: 1, providerAttempts: [] }),
    ];
    const result = buildAiUsageQualityInsights(rows);
    expect(result.unclassifiedAttemptRecords).toBe(1);
    expect(result.providerFailures.status).toBe("INSUFFICIENT_SAMPLE");
  });

  it("preserves source records without mutation", () => {
    const row = Object.freeze({
      ...auditRecord(1),
      providerAttempts: Object.freeze([{ ...succeededAttempt }]),
    }) as AiUsageAuditRecord;
    const before = JSON.stringify(row);
    buildAiUsageQualityInsights(Object.freeze([row]));
    expect(JSON.stringify(row)).toBe(before);
  });
});
