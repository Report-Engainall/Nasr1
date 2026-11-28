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
