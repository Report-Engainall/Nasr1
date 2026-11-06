import { describe, expect, it } from "vitest";
import { parseTaskIntelligenceReport } from "./task-intelligence-reports";

const AS_OF = "2026-11-06T12:00:00.000Z";
const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";
const PROFILE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const roleSummary = () => ({
  taskRole: "sales",
  newCount: 1,
  openCount: 1,
  overdueOpenCount: 0,
  highImpactOpenCount: 0,
  completedCount: 0,
  reopenedTaskCount: 0,
  reopenedEventCount: 0,
  reopenRatePercent: null,
  resolvedTaskCount: 0,
  averageResolutionMinutes: null,
  waitingOnOtherPartyCount: null,
  financialImpactAmount: null,
});
const managerRisk = (id = ID_1) => ({
  id,
  title: "مراجعة طلب متأخر",
  taskType: "ORDER_REVIEW",
  sourceEntityType: "orders",
  sourceEntityId: ID_2,
  taskRole: "sales",
  priority: "high",
  status: "pending",
  createdAt: "2026-11-06T11:00:00.000Z",
  dueAt: "2026-11-06T11:30:00.000Z",
  ageMinutes: 60,
  overdueMinutes: 30,
  assignedProfileId: PROFILE,
  isOverdue: true,
  delayReason: null,
  requiredManagementDecision: null,
});
const report = () => ({
  status: "VERIFIED",
  reportKind: "DAILY",
  asOf: AS_OF,
  period: { from: "2026-11-06", to: "2026-11-06", timeZone: "UTC" },
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
  weeklyTrend: [{
    weekStart: "2026-11-02",
    createdCount: 1,
    completedCount: 0,
    reopenedTaskCount: 0,
    reopenedEventCount: 0,
    averageResolutionMinutes: null,
  }],
  managerRisks: [],
  quality: {
    reopenRateDefinition: "first completion and reopen within the same reporting window",
    waitingOnOtherPartyCount: null,
    falseAlarmCount: null,
    repeatedCauses: null,
    improvementOutcomes: null,
    employeeComparisonPerformed: false,
  },
  limitations: [],
});

describe("parseTaskIntelligenceReport source reconciliation", () => {
  it("accepts a normal role-scoped report with no manager risk scope", () => {
    expect(parseTaskIntelligenceReport(report(), "DAILY")?.scope).toMatchObject({
      managerViewAvailable: false,
      managerRiskTotalCount: null,
      managerRiskReturnedCount: null,
      managerRiskCompletePopulation: false,
    });
  });

  it("accepts manager-authorized risk rows inside a daily report", () => {
    const value = report();
    value.scope.managerViewAvailable = true;
    value.scope.managerRiskTotalCount = 1;
    value.scope.managerRiskReturnedCount = 1;
    value.scope.managerRiskCompletePopulation = true;
    value.managerRisks = [managerRisk()];
    const parsed = parseTaskIntelligenceReport(value, "DAILY");
    expect(parsed?.managerRisks).toHaveLength(1);
    expect(parsed?.managerRisks[0]).toMatchObject({
      id: ID_1, ageMinutes: 60, overdueMinutes: 30, isOverdue: true,
    });
  });

  it("accepts exactly 25 returned risk rows as partial when total population is larger", () => {
    const value = report();
    value.scope.managerViewAvailable = true;
    value.scope.managerRiskTotalCount = 30;
    value.scope.managerRiskReturnedCount = 25;
    value.scope.managerRiskCompletePopulation = false;
    value.managerRisks = Array.from({ length: 25 }, (_, index) =>
      managerRisk("00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"))
    );
    expect(parseTaskIntelligenceReport(value, "DAILY")?.scope.managerRiskCompletePopulation).toBe(false);
  });

  it("rejects manager risk total, returned, completeness or row-count contradictions", () => {
    const base = report();
    base.scope.managerViewAvailable = true;
    base.scope.managerRiskTotalCount = 1;
    base.scope.managerRiskReturnedCount = 1;
    base.scope.managerRiskCompletePopulation = true;
    base.managerRisks = [managerRisk()];
    expect(parseTaskIntelligenceReport({ ...base, scope: { ...base.scope, managerRiskReturnedCount: 0 } }, "DAILY")).toBeNull();
    expect(parseTaskIntelligenceReport({ ...base, scope: { ...base.scope, managerRiskCompletePopulation: false } }, "DAILY")).toBeNull();
    expect(parseTaskIntelligenceReport({ ...base, managerRisks: [] }, "DAILY")).toBeNull();
    expect(parseTaskIntelligenceReport({ ...base, managerRisks: [managerRisk(), managerRisk()] }, "DAILY")).toBeNull();
  });

  it("rejects future task creation, forged age and inconsistent overdue evidence", () => {
    const value = report();
    value.scope.managerViewAvailable = true;
    value.scope.managerRiskTotalCount = 1;
    value.scope.managerRiskReturnedCount = 1;
    value.scope.managerRiskCompletePopulation = true;
    value.managerRisks = [
      { ...managerRisk(), ageMinutes: 59 },
    ];
    expect(parseTaskIntelligenceReport(value, "DAILY")).toBeNull();
    value.managerRisks = [
      { ...managerRisk(), isOverdue: false },
    ];
    expect(parseTaskIntelligenceReport(value, "DAILY")).toBeNull();
    value.managerRisks = [
      { ...managerRisk(), createdAt: "2026-11-06T12:01:00.000Z", ageMinutes: 0 },
    ];
    expect(parseTaskIntelligenceReport(value, "DAILY")).toBeNull();
  });

  it("rejects duplicate role/source/week identities and invalid weekly boundaries", () => {
    const duplicateRole = report();
    duplicateRole.scope.visibleRoles = ["sales", "sales"];
    duplicateRole.roleSummaries = [roleSummary(), roleSummary()];
    expect(parseTaskIntelligenceReport(duplicateRole, "DAILY")).toBeNull();

    const duplicateWeek = report();
    duplicateWeek.weeklyTrend = [duplicateWeek.weeklyTrend[0], duplicateWeek.weeklyTrend[0]];
    expect(parseTaskIntelligenceReport(duplicateWeek, "DAILY")).toBeNull();

    const invalidWeek = report();
    invalidWeek.weeklyTrend[0].weekStart = "2026-11-03";
    expect(parseTaskIntelligenceReport(invalidWeek, "DAILY")).toBeNull();
  });

  it("rejects incoherent task quality denominators exposed by role summaries", () => {
    const value = report();
    value.roleSummaries[0].overdueOpenCount = 2;
    expect(parseTaskIntelligenceReport(value, "DAILY")).toBeNull();
  });
});
