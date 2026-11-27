import { describe, expect, it } from "vitest";
import { parseTaskIntelligenceReport } from "./task-intelligence-reports";

const asOf = "2026-11-27T00:10:00.000Z";

function report(overrides: {
  asOf?: string;
  createdAt?: string;
  dueAt?: string | null;
} = {}) {
  return {
    status: "VERIFIED",
    reportKind: "DAILY",
    asOf: overrides.asOf ?? asOf,
    period: { from: "2026-11-27", to: "2026-11-27", timeZone: "UTC" },
    scope: {
      visibleRoles: ["sales"],
      completePopulation: true,
      visibleTaskCount: 1,
      managerViewAvailable: true,
      managerRiskTotalCount: 1,
      managerRiskReturnedCount: 1,
      managerRiskCompletePopulation: true,
    },
    roleSummaries: [{
      taskRole: "sales",
      newCount: 0,
      openCount: 1,
      overdueOpenCount: 1,
      highImpactOpenCount: 1,
      completedCount: 0,
      reopenedTaskCount: 0,
      reopenedEventCount: 0,
      reopenRatePercent: null,
      resolvedTaskCount: 0,
      averageResolutionMinutes: null,
      waitingOnOtherPartyCount: null,
      financialImpactAmount: null,
    }],
    sourceBreakdown: [],
    weeklyTrend: [],
    managerRisks: [{
      id: "11111111-1111-4111-8111-111111111111",
      title: "مراجعة طلب متأخر",
      taskType: "ORDER_REVIEW",
      sourceEntityType: null,
      sourceEntityId: null,
      taskRole: "sales",
      priority: "high",
      status: "pending",
      createdAt: overrides.createdAt ?? "2026-11-27T00:00:00.000Z",
      dueAt: overrides.dueAt === undefined ? "2026-11-27T00:05:00.000Z" : overrides.dueAt,
      ageMinutes: 10,
      overdueMinutes: 5,
      assignedProfileId: null,
      isOverdue: true,
      delayReason: null,
      requiredManagementDecision: null,
    }],
    quality: {
      reopenRateDefinition: "Reopened tasks / resolved tasks",
      waitingOnOtherPartyCount: null,
      falseAlarmCount: null,
      repeatedCauses: null,
      improvementOutcomes: null,
      employeeComparisonPerformed: false,
    },
    limitations: [],
  };
}

describe("task intelligence report strict timestamp contract", () => {
  it.each([
    ["+14:00", "2026-11-27T14:10:00.000+14:00"],
    ["-14:00", "2026-11-26T10:10:00.000-14:00"],
  ])("accepts the ISO maximum UTC offset for report asOf %s", (_label, timestamp) => {
    expect(parseTaskIntelligenceReport(report({ asOf: timestamp }), "DAILY")).not.toBeNull();
  });

  it.each([
    "2026-11-27T00:10:00.000",
    "2026-11-27T14:11:00.000+14:01",
    "2026-11-26T10:09:00.000-14:01",
    "2026-11-27T23:59:00.000+23:59",
    "2026-02-30T00:10:00.000Z",
  ])("rejects an invalid report asOf timestamp: %s", timestamp => {
    expect(parseTaskIntelligenceReport(report({ asOf: timestamp }), "DAILY")).toBeNull();
  });

  it.each([
    ["timezone-less task creation", { createdAt: "2026-11-27T00:00:00.000" }],
    ["task creation offset +14:01", { createdAt: "2026-11-27T14:01:00.000+14:01" }],
    ["task due offset +14:01", { dueAt: "2026-11-27T14:06:00.000+14:01" }],
  ])("rejects %s instead of calculating age or overdue minutes from it", (_label, overrides) => {
    expect(parseTaskIntelligenceReport(report(overrides), "DAILY")).toBeNull();
  });
});
