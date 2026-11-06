import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskPerformanceScorecard } from "./TaskPerformanceScorecard";
import { parseTaskPerformanceScorecard } from "@/lib/intelligence/task-performance-scorecard";
import { parseTaskQualityMetrics } from "@/lib/intelligence/task-quality-reviews";

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

  it("renders quality metrics only when reviewed source populations reconcile", () => {
    const quality = parseTaskQualityMetrics({
      status:"READY",
      scope:{visibleTaskCount:5,reviewedTaskCount:3},
      actionability:{
        reviewedCount:2,actionableCount:1,notActionableCount:1,deferredCount:0,
        rateDenominator:2,actionableRatePercent:50,
        notActionableReasons:[{reasonCode:"ALREADY_RESOLVED",reviewCount:1,affectedTaskCount:1}],
      },
      disposition:{
        reviewedCount:1,approvedCount:0,rejectedCount:1,deferredCount:0,
        rejectionReasons:[{reasonCode:"DUPLICATE_RECOMMENDATION",reviewCount:1,affectedTaskCount:1}],
        deferralReasons:[],
      },
      alerts:{
        reviewedCount:2,truePositiveCount:1,falsePositiveCount:1,needsReviewCount:0,
        falseAlarmDenominator:2,falseAlarmRatePercent:50,
      },
      causeReviewCount:2,
      repeatedCauses:[{reasonCode:"THRESHOLD_NOT_MET",affectedTaskCount:2,reviewCount:2}],
    });
    const scorecard = parseTaskPerformanceScorecard({
      status:"READY",
      asOf:"2026-11-06T04:00:00.000Z",
      scope:{visibleRoles:["accountant"],completePopulation:true,visibleTaskCount:1},
      coverage:{sourceLinkedTaskCount:1,idempotencyKeyCount:1,traceableTaskCount:1,idempotencyKeyCoveragePercent:100,traceabilityCoveragePercent:100},
      resolution:{completedTaskCount:0,sampleCount:0,excludedCount:0},
      audit:{reopenEventCount:0,reopenedTaskCount:0,firstCompletedTaskCount:0,windowStartedAt:"2026-11-06T03:00:00.000Z",completeness:"WINDOW_COMPLETE",reasonCode:"COMPLETE_SINCE_AUDIT_ACTIVATION",reopenRatePercent:null},
      groups:[{taskType:"x",taskRole:"accountant",taskCount:1,completedCount:0,resolutionSampleCount:0,resolutionExcludedCount:0,medianResolutionMinutes:null,p90ResolutionMinutes:null,sourceLinkedTaskCount:1,idempotencyKeyCount:1,traceableTaskCount:1,idempotencyKeyCoveragePercent:100,traceabilityCoveragePercent:100}],
      unavailableMetrics:["DUPLICATE_REPLAY_RATE","WAITING_ON_OTHER_PARTY","IMPROVEMENT_OUTCOMES","PRINT_SUCCESS_RATE","EMPLOYEE_COMPARISON"],
      quality,
    });
    render(<TaskPerformanceScorecard scorecard={scorecard} />);
    expect(screen.getByText("جودة المهام والتوصيات")).toBeInTheDocument();
    expect(screen.getByText("50٪")).toBeInTheDocument();
    expect(screen.getByText("الإنذارات الكاذبة")).toBeInTheDocument();
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
