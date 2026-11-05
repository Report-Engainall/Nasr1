import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskPerformanceScorecard } from "./TaskPerformanceScorecard";
import { parseTaskPerformanceScorecard } from "@/lib/intelligence/task-performance-scorecard";

const data = parseTaskPerformanceScorecard({
  status: "READY",
  asOf: "2026-11-06T02:00:00.000Z",
  scope: { visibleRoles: ["accountant"], completePopulation: true, visibleTaskCount: 1 },
  coverage: {
    sourceLinkedTaskCount: 1,
    idempotencyKeyCount: 1,
    traceableTaskCount: 1,
    idempotencyKeyCoveragePercent: 100,
    traceabilityCoveragePercent: 100,
  },
  resolution: { completedTaskCount: 0, sampleCount: 0, excludedCount: 0 },
  audit: {
    observedReopenEventCount: 1,
    observedReopenedTaskCount: 1,
    completeness: "PARTIAL",
    reasonCode: "AUTOMATIC_SOURCE_TRANSITIONS_ARE_NOT_ALL_AUDITED",
    reopenRatePercent: null,
  },
  groups: [{
    taskType: "invoice_collection", taskRole: "accountant", taskCount: 1,
    completedCount: 0, resolutionSampleCount: 0, resolutionExcludedCount: 0,
    medianResolutionMinutes: null, p90ResolutionMinutes: null,
    sourceLinkedTaskCount: 1, idempotencyKeyCount: 1, traceableTaskCount: 1,
    idempotencyKeyCoveragePercent: 100, traceabilityCoveragePercent: 100,
  }],
  unavailableMetrics: [
    "REOPEN_RATE", "DUPLICATE_REPLAY_RATE", "ACTIONABILITY_RATE", "FALSE_ALARM_RATE",
    "REPEATED_CAUSE_RATE", "WAITING_ON_OTHER_PARTY", "IMPROVEMENT_OUTCOMES",
    "PRINT_SUCCESS_RATE", "EMPLOYEE_COMPARISON",
  ],
});

describe("TaskPerformanceScorecard", () => {
  it("shows the audit limitation instead of translating observed reopens into a complete rate", () => {
    render(<TaskPerformanceScorecard scorecard={data} />);
    expect(screen.getByRole("heading", { name: "بطاقة أداء المهام" })).toBeInTheDocument();
    expect(screen.getByText(/معدل إعادة الفتح: غير متاح/)).toBeInTheDocument();
    expect(screen.getByText(/حد أدنى مرصود/)).toBeInTheDocument();
  });

  it("shows the exact reopen rate only inside the recorded audit-coverage window", () => {
    const windowData = parseTaskPerformanceScorecard({
      status: "READY",
      asOf: "2026-11-06T04:00:00.000Z",
      scope: { visibleRoles: ["accountant"], completePopulation: true, visibleTaskCount: 1 },
      coverage: {
        sourceLinkedTaskCount: 1, idempotencyKeyCount: 1, traceableTaskCount: 1,
        idempotencyKeyCoveragePercent: 100, traceabilityCoveragePercent: 100,
      },
      resolution: { completedTaskCount: 0, sampleCount: 0, excludedCount: 0 },
      audit: {
        reopenEventCount: 1, reopenedTaskCount: 1, firstCompletedTaskCount: 2,
        windowStartedAt: "2026-11-06T03:00:00.000Z",
        completeness: "WINDOW_COMPLETE",
        reasonCode: "COMPLETE_SINCE_AUDIT_ACTIVATION",
        reopenRatePercent: 50,
      },
      groups: [{
        taskType: "invoice_collection", taskRole: "accountant", taskCount: 1,
        completedCount: 0, resolutionSampleCount: 0, resolutionExcludedCount: 0,
        medianResolutionMinutes: null, p90ResolutionMinutes: null,
        sourceLinkedTaskCount: 1, idempotencyKeyCount: 1, traceableTaskCount: 1,
        idempotencyKeyCoveragePercent: 100, traceabilityCoveragePercent: 100,
      }],
      unavailableMetrics: [
        "DUPLICATE_REPLAY_RATE", "ACTIONABILITY_RATE", "FALSE_ALARM_RATE",
        "REPEATED_CAUSE_RATE", "WAITING_ON_OTHER_PARTY", "IMPROVEMENT_OUTCOMES",
        "PRINT_SUCCESS_RATE", "EMPLOYEE_COMPARISON",
      ],
    });
    render(<TaskPerformanceScorecard scorecard={windowData} />);
    expect(screen.getByText(/٥٠|50/)).toBeInTheDocument();
    expect(screen.getByText(/بداية التغطية الكاملة/)).toBeInTheDocument();
  });

  it("keeps unavailable and error states explicit and retryable", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <TaskPerformanceScorecard state="unavailable" errorMessage="الخدمة غير مطبقة" onRetry={onRetry} />,
    );
    expect(screen.getByText("الخدمة غير مطبقة")).toBeInTheDocument();
    rerender(<TaskPerformanceScorecard state="error" errorMessage="رفض المصدر" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("رفض المصدر");
  });
});
