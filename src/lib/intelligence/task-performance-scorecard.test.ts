import { describe, expect, it } from "vitest";
import { parseTaskPerformanceScorecard } from "./task-performance-scorecard";

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "READY",
    asOf: "2026-11-06T02:00:00.000Z",
    scope: {
      visibleRoles: ["accountant", "sales"],
      completePopulation: true,
      visibleTaskCount: 3,
    },
    coverage: {
      sourceLinkedTaskCount: 2,
      idempotencyKeyCount: 1,
      traceableTaskCount: 1,
      idempotencyKeyCoveragePercent: 50,
      traceabilityCoveragePercent: 50,
    },
    resolution: {
      completedTaskCount: 2,
      sampleCount: 1,
      excludedCount: 1,
    },
    audit: {
      observedReopenEventCount: 2,
      observedReopenedTaskCount: 1,
      completeness: "PARTIAL",
      reasonCode: "AUTOMATIC_SOURCE_TRANSITIONS_ARE_NOT_ALL_AUDITED",
      reopenRatePercent: null,
    },
    groups: [{
      taskType: "invoice_collection",
      taskRole: "accountant",
      taskCount: 3,
      completedCount: 2,
      resolutionSampleCount: 1,
      resolutionExcludedCount: 1,
      medianResolutionMinutes: 90,
      p90ResolutionMinutes: 90,
      sourceLinkedTaskCount: 2,
      idempotencyKeyCount: 1,
      traceableTaskCount: 1,
      idempotencyKeyCoveragePercent: 50,
      traceabilityCoveragePercent: 50,
    }],
    unavailableMetrics: [
      "REOPEN_RATE",
      "DUPLICATE_REPLAY_RATE",
      "ACTIONABILITY_RATE",
      "FALSE_ALARM_RATE",
      "REPEATED_CAUSE_RATE",
      "WAITING_ON_OTHER_PARTY",
      "IMPROVEMENT_OUTCOMES",
      "PRINT_SUCCESS_RATE",
      "EMPLOYEE_COMPARISON",
    ],
    ...overrides,
  };
}

describe("parseTaskPerformanceScorecard", () => {
  it("accepts balanced aggregates and keeps the resolution sample partial when timestamps are missing", () => {
    const parsed = parseTaskPerformanceScorecard(fixture());
    expect(parsed?.status).toBe("READY");
    expect(parsed?.coverage.traceabilityCoveragePercent).toBe(50);
    expect(parsed?.resolution.status).toBe("PARTIAL");
    expect(parsed?.groups[0].resolutionStatus).toBe("PARTIAL");
    expect(parsed?.audit.reopenRatePercent).toBeNull();
  });

  it("accepts a precisely bounded reopen rate only after the audit activation baseline", () => {
    const data = fixture();
    data.audit = {
      reopenEventCount: 2,
      reopenedTaskCount: 1,
      firstCompletedTaskCount: 4,
      windowStartedAt: "2026-11-06T03:00:00.000Z",
      completeness: "WINDOW_COMPLETE",
      reasonCode: "COMPLETE_SINCE_AUDIT_ACTIVATION",
      reopenRatePercent: 25,
    };
    data.unavailableMetrics = [
      "DUPLICATE_REPLAY_RATE",
      "ACTIONABILITY_RATE",
      "FALSE_ALARM_RATE",
      "REPEATED_CAUSE_RATE",
      "WAITING_ON_OTHER_PARTY",
      "IMPROVEMENT_OUTCOMES",
      "PRINT_SUCCESS_RATE",
      "EMPLOYEE_COMPARISON",
    ];
    const parsed = parseTaskPerformanceScorecard(data);
    expect(parsed?.audit.completeness).toBe("WINDOW_COMPLETE");
    expect(parsed?.audit.reopenRatePercent).toBe(25);
    expect(parsed?.audit.firstCompletedTaskCount).toBe(4);
    expect(parsed?.audit.windowStartedAt).toBe("2026-11-06T03:00:00.000Z");
  });

  it("rejects a bounded reopen rate that does not reconcile to its source counts", () => {
    const data = fixture();
    data.audit = {
      reopenEventCount: 2,
      reopenedTaskCount: 1,
      firstCompletedTaskCount: 4,
      windowStartedAt: "2026-11-06T03:00:00.000Z",
      completeness: "WINDOW_COMPLETE",
      reasonCode: "COMPLETE_SINCE_AUDIT_ACTIVATION",
      reopenRatePercent: 0,
    };
    data.unavailableMetrics = [
      "DUPLICATE_REPLAY_RATE",
      "ACTIONABILITY_RATE",
      "FALSE_ALARM_RATE",
      "REPEATED_CAUSE_RATE",
      "WAITING_ON_OTHER_PARTY",
      "IMPROVEMENT_OUTCOMES",
      "PRINT_SUCCESS_RATE",
      "EMPLOYEE_COMPARISON",
    ];
    expect(parseTaskPerformanceScorecard(data)).toBeNull();
  });

  it("rejects a visible population that does not reconcile to task-type and role groups", () => {
    const data = fixture();
    data.scope = { ...(data.scope as Record<string, unknown>), visibleTaskCount: 4 };
    expect(parseTaskPerformanceScorecard(data)).toBeNull();
  });

  it("rejects a fabricated complete reopen rate", () => {
    const data = fixture();
    data.audit = { ...(data.audit as Record<string, unknown>), reopenRatePercent: 0 };
    expect(parseTaskPerformanceScorecard(data)).toBeNull();
  });

  it("rejects groups outside the server-declared visible roles", () => {
    const data = fixture();
    data.groups = [{
      ...(data.groups as Array<Record<string, unknown>>)[0],
      taskRole: "warehouse",
    }];
    expect(parseTaskPerformanceScorecard(data)).toBeNull();
  });

  it("rejects invalid lineage percentages and inconsistent sample totals", () => {
    const data = fixture();
    data.coverage = { ...(data.coverage as Record<string, unknown>), traceabilityCoveragePercent: 100 };
    expect(parseTaskPerformanceScorecard(data)).toBeNull();

    const changed = fixture();
    changed.resolution = { ...(changed.resolution as Record<string, unknown>), sampleCount: 2 };
    expect(parseTaskPerformanceScorecard(changed)).toBeNull();
  });

  it("keeps zero linked-source denominator unavailable rather than displaying zero percent", () => {
    const data = fixture();
    data.coverage = {
      sourceLinkedTaskCount: 0,
      idempotencyKeyCount: 0,
      traceableTaskCount: 0,
      idempotencyKeyCoveragePercent: null,
      traceabilityCoveragePercent: null,
    };
    data.groups = [{
      taskType: "manual_operational_task",
      taskRole: "accountant",
      taskCount: 3,
      completedCount: 2,
      resolutionSampleCount: 1,
      resolutionExcludedCount: 1,
      medianResolutionMinutes: 90,
      p90ResolutionMinutes: 90,
      sourceLinkedTaskCount: 0,
      idempotencyKeyCount: 0,
      traceableTaskCount: 0,
      idempotencyKeyCoveragePercent: null,
      traceabilityCoveragePercent: null,
    }];
    expect(parseTaskPerformanceScorecard(data)?.coverage.traceabilityCoveragePercent).toBeNull();
  });
  it("uses exact integer rounding for large task coverage ratios at a half-hundredth boundary", () => {
    const data = fixture();
    const denominator = 9_007_199_253_760_000;
    const numerator = 1_111_938_747_876_672;
    data.scope = {
      visibleRoles: ["accountant", "sales"],
      completePopulation: true,
      visibleTaskCount: denominator,
    };
    data.coverage = {
      sourceLinkedTaskCount: denominator,
      idempotencyKeyCount: numerator,
      traceableTaskCount: 0,
      idempotencyKeyCoveragePercent: 12.35,
      traceabilityCoveragePercent: 0,
    };
    data.resolution = {
      completedTaskCount: 0,
      sampleCount: 0,
      excludedCount: 0,
    };
    data.groups = [{
      taskType: "invoice_collection",
      taskRole: "accountant",
      taskCount: denominator,
      completedCount: 0,
      resolutionSampleCount: 0,
      resolutionExcludedCount: 0,
      medianResolutionMinutes: null,
      p90ResolutionMinutes: null,
      sourceLinkedTaskCount: denominator,
      idempotencyKeyCount: numerator,
      traceableTaskCount: 0,
      idempotencyKeyCoveragePercent: 12.35,
      traceabilityCoveragePercent: 0,
    }];

    const parsed = parseTaskPerformanceScorecard(data);
    expect(parsed?.coverage.idempotencyKeyCoveragePercent).toBe(12.35);
  });

});
