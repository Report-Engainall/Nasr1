export type TaskIntelligenceReportKind = "DAILY" | "WEEKLY" | "MONTHLY" | "MANAGER";
export type TaskIntelligenceRole = "sales" | "accountant" | "warehouse" | "purchasing" | "management" | "operations";
export type TaskIntelligencePriority = "low" | "medium" | "high" | "critical";

export interface TaskIntelligencePeriod {
  from: string;
  to: string;
  timeZone: "UTC";
}
export interface TaskIntelligenceRoleSummary {
  taskRole: TaskIntelligenceRole;
  newCount: number;
  openCount: number;
  overdueOpenCount: number;
  highImpactOpenCount: number;
  completedCount: number;
  reopenedTaskCount: number;
  reopenedEventCount: number;
  reopenRatePercent: number | null;
  resolvedTaskCount: number;
  averageResolutionMinutes: number | null;
  waitingOnOtherPartyCount: null;
  financialImpactAmount: null;
}
export interface TaskIntelligenceSourceSummary {
  sourceKey: string;
  taskRole: TaskIntelligenceRole;
  priority: TaskIntelligencePriority;
  createdCount: number;
  completedCount: number;
  reopenedEventCount: number;
  reopenedTaskCount: number;
  reopenRatePercent: number | null;
  resolvedTaskCount: number;
  averageResolutionMinutes: number | null;
}
export interface TaskIntelligenceWeeklyPoint {
  weekStart: string;
  createdCount: number;
  completedCount: number;
  reopenedTaskCount: number;
  reopenedEventCount: number;
  averageResolutionMinutes: number | null;
}
export interface TaskIntelligenceManagerRisk {
  id: string;
  title: string;
  taskType: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  taskRole: TaskIntelligenceRole;
  priority: "high" | "critical";
  status: "pending" | "in_progress";
  createdAt: string;
  dueAt: string | null;
  ageMinutes: number;
  overdueMinutes: number | null;
  assignedProfileId: string | null;
  isOverdue: boolean;
  delayReason: null;
  requiredManagementDecision: null;
}
export interface TaskIntelligenceReport {
  status: "VERIFIED";
  reportKind: TaskIntelligenceReportKind;
  asOf: string;
  period: TaskIntelligencePeriod;
  scope: {
    visibleRoles: TaskIntelligenceRole[];
    completePopulation: true;
    visibleTaskCount: number;
    managerViewAvailable: boolean;
    managerRiskTotalCount: number | null;
    managerRiskReturnedCount: number | null;
    managerRiskCompletePopulation: boolean;
  };
  state: "READY" | "EMPTY";
  roleSummaries: TaskIntelligenceRoleSummary[];
  sourceBreakdown: TaskIntelligenceSourceSummary[];
  weeklyTrend: TaskIntelligenceWeeklyPoint[];
  managerRisks: TaskIntelligenceManagerRisk[];
  quality: {
    reopenRateDefinition: string;
    waitingOnOtherPartyCount: null;
    falseAlarmCount: null;
    repeatedCauses: null;
    improvementOutcomes: null;
    employeeComparisonPerformed: false;
  };
  limitations: string[];
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue : null;
}
function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}
const ROLES = new Set<TaskIntelligenceRole>([
  "sales", "accountant", "warehouse", "purchasing", "management", "operations",
]);
const PRIORITIES = new Set<TaskIntelligencePriority>(["low", "medium", "high", "critical"]);

function parseRoleSummary(value: unknown): TaskIntelligenceRoleSummary | null {
  const row = record(value);
  if (!row || typeof row.taskRole !== "string" || !ROLES.has(row.taskRole as TaskIntelligenceRole) ||
    !isCount(row.newCount) || !isCount(row.openCount) || !isCount(row.overdueOpenCount) ||
    !isCount(row.highImpactOpenCount) || !isCount(row.completedCount) ||
    !isCount(row.reopenedTaskCount) || !isCount(row.reopenedEventCount) ||
    !isNumberOrNull(row.reopenRatePercent) || !isCount(row.resolvedTaskCount) ||
    !isNumberOrNull(row.averageResolutionMinutes) ||
    row.waitingOnOtherPartyCount !== null || row.financialImpactAmount !== null) return null;
  if (row.reopenRatePercent !== null && row.reopenRatePercent > 100) return null;
  return {
    taskRole: row.taskRole as TaskIntelligenceRole, newCount: row.newCount,
    openCount: row.openCount, overdueOpenCount: row.overdueOpenCount,
    highImpactOpenCount: row.highImpactOpenCount, completedCount: row.completedCount,
    reopenedTaskCount: row.reopenedTaskCount, reopenedEventCount: row.reopenedEventCount,
    reopenRatePercent: row.reopenRatePercent, resolvedTaskCount: row.resolvedTaskCount,
    averageResolutionMinutes: row.averageResolutionMinutes,
    waitingOnOtherPartyCount: null, financialImpactAmount: null,
  };
}
function parseSourceSummary(value: unknown): TaskIntelligenceSourceSummary | null {
  const row = record(value);
  if (!row || typeof row.sourceKey !== "string" || row.sourceKey.length < 1 || row.sourceKey.length > 120 ||
    typeof row.taskRole !== "string" || !ROLES.has(row.taskRole as TaskIntelligenceRole) ||
    typeof row.priority !== "string" || !PRIORITIES.has(row.priority as TaskIntelligencePriority) ||
    !isCount(row.createdCount) || !isCount(row.completedCount) ||
    !isCount(row.reopenedEventCount) || !isCount(row.reopenedTaskCount) ||
    !isNumberOrNull(row.reopenRatePercent) || (row.reopenRatePercent !== null && row.reopenRatePercent > 100) ||
    !isCount(row.resolvedTaskCount) || !isNumberOrNull(row.averageResolutionMinutes)) return null;
  return {
    sourceKey: row.sourceKey, taskRole: row.taskRole as TaskIntelligenceRole,
    priority: row.priority as TaskIntelligencePriority, createdCount: row.createdCount,
    completedCount: row.completedCount, reopenedEventCount: row.reopenedEventCount,
    reopenedTaskCount: row.reopenedTaskCount, reopenRatePercent: row.reopenRatePercent as number | null,
    resolvedTaskCount: row.resolvedTaskCount, averageResolutionMinutes: row.averageResolutionMinutes,
  };
}
function parseWeeklyPoint(value: unknown): TaskIntelligenceWeeklyPoint | null {
  const row = record(value);
  if (!row || !isDay(row.weekStart) || !isCount(row.createdCount) ||
    !isCount(row.completedCount) || !isCount(row.reopenedTaskCount) ||
    !isCount(row.reopenedEventCount) || !isNumberOrNull(row.averageResolutionMinutes)) return null;
  return {
    weekStart: row.weekStart, createdCount: row.createdCount,
    completedCount: row.completedCount, reopenedTaskCount: row.reopenedTaskCount,
    reopenedEventCount: row.reopenedEventCount,
    averageResolutionMinutes: row.averageResolutionMinutes as number | null,
  };
}
function parseManagerRisk(value: unknown): TaskIntelligenceManagerRisk | null {
  const row = record(value);
  if (!row || typeof row.id !== "string" || typeof row.title !== "string" ||
    typeof row.taskType !== "string" || (row.sourceEntityType !== null && typeof row.sourceEntityType !== "string") ||
    (row.sourceEntityId !== null && typeof row.sourceEntityId !== "string") ||
    typeof row.taskRole !== "string" || !ROLES.has(row.taskRole as TaskIntelligenceRole) ||
    (row.priority !== "high" && row.priority !== "critical") ||
    (row.status !== "pending" && row.status !== "in_progress") ||
    !isTimestamp(row.createdAt) || (row.dueAt !== null && !isTimestamp(row.dueAt)) ||
    !isNumberOrNull(row.ageMinutes) || row.ageMinutes === null ||
    !isNumberOrNull(row.overdueMinutes) ||
    (row.assignedProfileId !== null && typeof row.assignedProfileId !== "string") ||
    typeof row.isOverdue !== "boolean" || row.delayReason !== null ||
    row.requiredManagementDecision !== null) return null;
  return {
    id: row.id, title: row.title, taskType: row.taskType,
    sourceEntityType: row.sourceEntityType as string | null,
    sourceEntityId: row.sourceEntityId as string | null,
    taskRole: row.taskRole as TaskIntelligenceRole,
    priority: row.priority, status: row.status, createdAt: row.createdAt,
    dueAt: row.dueAt as string | null, ageMinutes: row.ageMinutes,
    overdueMinutes: row.overdueMinutes, assignedProfileId: row.assignedProfileId as string | null,
    isOverdue: row.isOverdue, delayReason: null, requiredManagementDecision: null,
  };
}

export function parseTaskIntelligenceReport(
  value: unknown,
  expectedKind: TaskIntelligenceReportKind,
): TaskIntelligenceReport | null {
  const row = record(value);
  const scope = record(row?.scope);
  const quality = record(row?.quality);
  const period = record(row?.period);
  if (!row || !scope || !quality || !period || row.status !== "VERIFIED" ||
    row.reportKind !== expectedKind || !isTimestamp(row.asOf) ||
    !isDay(period.from) || !isDay(period.to) || period.from > period.to ||
    period.timeZone !== "UTC" || !Array.isArray(scope.visibleRoles) ||
    scope.visibleRoles.length === 0 ||
    scope.visibleRoles.some(role => typeof role !== "string" || !ROLES.has(role as TaskIntelligenceRole)) ||
    new Set(scope.visibleRoles).size !== scope.visibleRoles.length ||
    scope.completePopulation !== true || !isCount(scope.visibleTaskCount) ||
    typeof scope.managerViewAvailable !== "boolean" ||
    (scope.managerRiskTotalCount !== null && !isCount(scope.managerRiskTotalCount)) ||
    (scope.managerRiskReturnedCount !== null && !isCount(scope.managerRiskReturnedCount)) ||
    typeof scope.managerRiskCompletePopulation !== "boolean" ||
    !Array.isArray(row.roleSummaries) || !Array.isArray(row.sourceBreakdown) ||
    !Array.isArray(row.weeklyTrend) || !Array.isArray(row.managerRisks) ||
    typeof quality.reopenRateDefinition !== "string" ||
    quality.waitingOnOtherPartyCount !== null || quality.falseAlarmCount !== null ||
    quality.repeatedCauses !== null || quality.improvementOutcomes !== null ||
    quality.employeeComparisonPerformed !== false ||
    !Array.isArray(row.limitations) ||
    row.limitations.some(item => typeof item !== "string")) return null;

  const roleSummaries = row.roleSummaries.map(parseRoleSummary);
  const sourceBreakdown = row.sourceBreakdown.map(parseSourceSummary);
  const weeklyTrend = row.weeklyTrend.map(parseWeeklyPoint);
  const managerRisks = row.managerRisks.map(parseManagerRisk);
  if (roleSummaries.some(item => item === null) ||
    sourceBreakdown.some(item => item === null) ||
    weeklyTrend.some(item => item === null) ||
    managerRisks.some(item => item === null) ||
    roleSummaries.length !== scope.visibleRoles.length ||
    (expectedKind === "MANAGER" && !scope.managerViewAvailable) ||
    (expectedKind !== "MANAGER" && managerRisks.length > 0)) return null;

  return {
    status: "VERIFIED", reportKind: expectedKind, asOf: row.asOf,
    period: { from: period.from, to: period.to, timeZone: "UTC" },
    scope: {
      visibleRoles: scope.visibleRoles as TaskIntelligenceRole[],
      completePopulation: true, visibleTaskCount: scope.visibleTaskCount,
      managerViewAvailable: scope.managerViewAvailable,
      managerRiskTotalCount: scope.managerRiskTotalCount as number | null,
      managerRiskReturnedCount: scope.managerRiskReturnedCount as number | null,
      managerRiskCompletePopulation: scope.managerRiskCompletePopulation,
    },
    state: scope.visibleTaskCount === 0 ? "EMPTY" : "READY",
    roleSummaries: roleSummaries as TaskIntelligenceRoleSummary[],
    sourceBreakdown: sourceBreakdown as TaskIntelligenceSourceSummary[],
    weeklyTrend: weeklyTrend as TaskIntelligenceWeeklyPoint[],
    managerRisks: managerRisks as TaskIntelligenceManagerRisk[],
    quality: {
      reopenRateDefinition: quality.reopenRateDefinition,
      waitingOnOtherPartyCount: null, falseAlarmCount: null,
      repeatedCauses: null, improvementOutcomes: null,
      employeeComparisonPerformed: false,
    },
    limitations: row.limitations as string[],
  };
}
