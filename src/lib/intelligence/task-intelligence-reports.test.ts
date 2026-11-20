import { describe, expect, it } from "vitest";
import { parseTaskIntelligenceReport } from "./task-intelligence-reports";

const AS_OF = "2026-11-20T10:00:00.000Z";
const SOURCE_ENTITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSIGNED_PROFILE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type RawReport = {
  status: string;
  reportKind: string;
  asOf: string;
  period: Record<string, unknown>;
  scope: Record<string, unknown>;
  roleSummaries: Array<Record<string, unknown>>;
  sourceBreakdown: Array<Record<string, unknown>>;
  weeklyTrend: Array<Record<string, unknown>>;
  managerRisks: Array<Record<string, unknown>>;
  quality: Record<string, unknown>;
  limitations: string[];
};

function uuid(index: number): string {
  return "00000000-0000-4000-8000-" + String(index).padStart(12, "0");
}

function roleSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

function sourceSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceKey: "orders",
    taskRole: "sales",
    priority: "high",
    createdCount: 1,
    completedCount: 1,
    reopenedEventCount: 1,
    reopenedTaskCount: 1,
    reopenRatePercent: 100,
    resolvedTaskCount: 1,
    averageResolutionMinutes: 15,
    ...overrides,
  };
}

function managerRisk(
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: uuid(index),
    title: "طلب يحتاج إلى مراجعة",
    taskType: "ORDER_REVIEW",
    sourceEntityType: "order",
    sourceEntityId: SOURCE_ENTITY_ID,
    taskRole: "sales",
    priority: "critical",
    status: "pending",
    createdAt: "2026-11-19T10:00:00.000Z",
    dueAt: "2026-11-20T09:00:00.000Z",
    ageMinutes: 1440,
    overdueMinutes: 60,
    assignedProfileId: ASSIGNED_PROFILE_ID,
    isOverdue: true,
    delayReason: null,
    requiredManagementDecision: null,
    ...overrides,
  };
}

function baseReport(): RawReport {
  return {
    status: "VERIFIED",
    reportKind: "DAILY",
    asOf: AS_OF,
    period: { from: "2026-11-20", to: "2026-11-20", timeZone: "UTC" },
    scope: {
      visibleRoles: ["sales"],
      completePopulation: true,
      visibleTaskCount: 1,
      managerViewAvailable: false,
      managerRiskTotalCount: null,
      managerRiskReturnedCount: null,
      managerRiskCompletePopulation: false,
    },
    roleSummaries: [roleSummary()],
    sourceBreakdown: [],
    weeklyTrend: [],
    managerRisks: [],
    quality: {
      reopenRateDefinition: "first completion then reopened within the report window",
      waitingOnOtherPartyCount: null,
      falseAlarmCount: null,
      repeatedCauses: null,
      improvementOutcomes: null,
      employeeComparisonPerformed: false,
    },
    limitations: [],
  };
}

function managerReport(
  rows: Array<Record<string, unknown>> = [managerRisk(1)],
  total = rows.length,
): RawReport {
  const result = baseReport();
  result.scope = {
    ...result.scope,
    managerViewAvailable: true,
    managerRiskTotalCount: total,
    managerRiskReturnedCount: Math.min(total, 25),
    managerRiskCompletePopulation: total <= 25,
  };
  result.managerRisks = rows;
  return result;
}

function weeklyReport(weekStarts: string[]): RawReport {
  const result = baseReport();
  result.reportKind = "WEEKLY";
  result.period = { from: "2026-11-14", to: "2026-11-20", timeZone: "UTC" };
  result.weeklyTrend = weekStarts.map(weekStart => ({
    weekStart,
    createdCount: 2,
    completedCount: 1,
    reopenedTaskCount: 0,
    reopenedEventCount: 0,
    averageResolutionMinutes: null,
  }));
  return result;
}

describe("task intelligence report source contract", () => {
  it("accepts a non-manager report only with explicit empty manager-risk fields", () => {
    const parsed = parseTaskIntelligenceReport(baseReport(), "DAILY");
    expect(parsed).not.toBeNull();
    expect(parsed?.scope.managerViewAvailable).toBe(false);
    expect(parsed?.scope.managerRiskTotalCount).toBeNull();
    expect(parsed?.scope.managerRiskReturnedCount).toBeNull();
    expect(parsed?.scope.managerRiskCompletePopulation).toBe(false);
    expect(parsed?.managerRisks).toEqual([]);
  });

  it("accepts manager risk rows on a manager's daily report", () => {
    const parsed = parseTaskIntelligenceReport(managerReport(), "DAILY");
    expect(parsed?.scope.managerViewAvailable).toBe(true);
    expect(parsed?.managerRisks).toHaveLength(1);
    expect(parsed?.managerRisks[0]).toMatchObject({
      priority: "critical",
      status: "pending",
      ageMinutes: 1440,
      overdueMinutes: 60,
      isOverdue: true,
    });
  });

  it("requires the manager permission flag for the dedicated manager report", () => {
    expect(parseTaskIntelligenceReport(baseReport(), "MANAGER")).toBeNull();
  });

  it("rejects manager-risk rows and metadata in a non-manager payload", () => {
    const result = baseReport();
    result.managerRisks = [managerRisk(1)];
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();

    const withCounts = baseReport();
    withCounts.scope = { ...withCounts.scope, managerRiskTotalCount: 0 };
    expect(parseTaskIntelligenceReport(withCounts, "DAILY")).toBeNull();
  });

  it("rejects role summaries outside the server-declared visible role set", () => {
    const result = baseReport();
    result.roleSummaries = [roleSummary({ taskRole: "management" })];
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects source aggregates outside the server-declared visible role set", () => {
    const result = baseReport();
    result.sourceBreakdown = [sourceSummary({ taskRole: "management" })];
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects manager-risk rows outside the server-declared visible role set", () => {
    const result = managerReport([managerRisk(1, { taskRole: "management" })]);
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects a missing summary for a server-declared visible role", () => {
    const result = baseReport();
    result.scope = { ...result.scope, visibleRoles: ["sales", "warehouse"] };
    result.roleSummaries = [roleSummary()];
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects duplicate role-summary identities", () => {
    const result = baseReport();
    result.scope = { ...result.scope, visibleRoles: ["sales", "warehouse"] };
    result.roleSummaries = [
      roleSummary(),
      roleSummary({ openCount: 0, overdueOpenCount: 0, highImpactOpenCount: 0 }),
    ];
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects duplicate source aggregate identities", () => {
    const result = baseReport();
    result.sourceBreakdown = [sourceSummary(), sourceSummary()];
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects duplicate roles in the server-declared visible role set", () => {
    const result = baseReport();
    result.scope = { ...result.scope, visibleRoles: ["sales", "sales"] };
    result.roleSummaries = [roleSummary(), roleSummary()];
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("accepts a manager's first 25 rows while disclosing that 26-row population is incomplete", () => {
    const rows = Array.from({ length: 25 }, (_, index) => managerRisk(index + 1));
    const parsed = parseTaskIntelligenceReport(managerReport(rows, 26), "DAILY");
    expect(parsed?.managerRisks).toHaveLength(25);
    expect(parsed?.scope.managerRiskTotalCount).toBe(26);
    expect(parsed?.scope.managerRiskReturnedCount).toBe(25);
    expect(parsed?.scope.managerRiskCompletePopulation).toBe(false);
  });

  it("accepts a fully returned 25-row risk population", () => {
    const rows = Array.from({ length: 25 }, (_, index) => managerRisk(index + 1));
    const parsed = parseTaskIntelligenceReport(managerReport(rows, 25), "DAILY");
    expect(parsed?.scope.managerRiskCompletePopulation).toBe(true);
  });

  it("rejects risk-count, row-count and completeness contradictions", () => {
    const tooMany = Array.from({ length: 26 }, (_, index) => managerRisk(index + 1));
    expect(parseTaskIntelligenceReport(managerReport(tooMany, 26), "DAILY")).toBeNull();

    const missingRow = managerReport([managerRisk(1)], 2);
    expect(parseTaskIntelligenceReport(missingRow, "DAILY")).toBeNull();

    const wrongFlag = managerReport([managerRisk(1)], 1);
    wrongFlag.scope = { ...wrongFlag.scope, managerRiskCompletePopulation: false };
    expect(parseTaskIntelligenceReport(wrongFlag, "DAILY")).toBeNull();
  });

  it("rejects future task creation evidence", () => {
    const result = managerReport([managerRisk(1, {
      createdAt: "2026-11-20T10:00:00.001Z",
      ageMinutes: 0,
      dueAt: null,
      overdueMinutes: null,
      isOverdue: false,
    })]);
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects age values that do not reconcile to the report as-of timestamp", () => {
    const result = managerReport([managerRisk(1, { ageMinutes: 1439.8 })]);
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects overdue flags or minutes that do not reconcile to dueAt and asOf", () => {
    const wrongFlag = managerReport([managerRisk(1, { isOverdue: false })]);
    expect(parseTaskIntelligenceReport(wrongFlag, "DAILY")).toBeNull();

    const wrongMinutes = managerReport([managerRisk(1, { overdueMinutes: 59 })]);
    expect(parseTaskIntelligenceReport(wrongMinutes, "DAILY")).toBeNull();
  });

  it("does not treat a missing due date as an overdue task", () => {
    const result = managerReport([managerRisk(1, {
      dueAt: null,
      overdueMinutes: null,
      isOverdue: false,
    })]);
    expect(parseTaskIntelligenceReport(result, "DAILY")?.managerRisks[0]).toMatchObject({
      dueAt: null,
      overdueMinutes: null,
      isOverdue: false,
    });
  });

  it("rejects duplicate risk IDs in the bounded manager projection", () => {
    const duplicate = managerRisk(1);
    const result = managerReport([duplicate, { ...duplicate }], 2);
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });

  it("rejects an overdue count greater than the open-task denominator", () => {
    const result = baseReport();
    result.roleSummaries = [roleSummary({ overdueOpenCount: 2 })];
    expect(parseTaskIntelligenceReport(result, "DAILY")).toBeNull();
  });
});

describe("task intelligence weekly window contract", () => {
  it("accepts Monday buckets intersecting the UTC report window", () => {
    const parsed = parseTaskIntelligenceReport(
      weeklyReport(["2026-11-09", "2026-11-16"]),
      "WEEKLY",
    );
    expect(parsed?.weeklyTrend.map(point => point.weekStart)).toEqual([
      "2026-11-09",
      "2026-11-16",
    ]);
  });

  it("rejects non-Monday buckets and Mondays outside the report window", () => {
    expect(parseTaskIntelligenceReport(weeklyReport(["2026-11-15"]), "WEEKLY")).toBeNull();
    expect(parseTaskIntelligenceReport(weeklyReport(["2026-11-02"]), "WEEKLY")).toBeNull();
    expect(parseTaskIntelligenceReport(weeklyReport(["2026-11-23"]), "WEEKLY")).toBeNull();
  });

  it("rejects duplicate or non-chronological weekly buckets", () => {
    expect(parseTaskIntelligenceReport(
      weeklyReport(["2026-11-09", "2026-11-09"]),
      "WEEKLY",
    )).toBeNull();
    expect(parseTaskIntelligenceReport(
      weeklyReport(["2026-11-16", "2026-11-09"]),
      "WEEKLY",
    )).toBeNull();
  });
});
