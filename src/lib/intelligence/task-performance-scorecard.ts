export type TaskPerformanceRole =
  | "sales"
  | "accountant"
  | "warehouse"
  | "purchasing"
  | "management"
  | "operations";

export type TaskPerformanceUnavailableMetric =
  | "REOPEN_RATE"
  | "DUPLICATE_REPLAY_RATE"
  | "ACTIONABILITY_RATE"
  | "FALSE_ALARM_RATE"
  | "REPEATED_CAUSE_RATE"
  | "WAITING_ON_OTHER_PARTY"
  | "IMPROVEMENT_OUTCOMES"
  | "PRINT_SUCCESS_RATE"
  | "EMPLOYEE_COMPARISON";

export interface TaskPerformanceGroup {
  taskType: string;
  taskRole: TaskPerformanceRole;
  taskCount: number;
  completedCount: number;
  resolutionSampleCount: number;
  resolutionExcludedCount: number;
  medianResolutionMinutes: number | null;
  p90ResolutionMinutes: number | null;
  sourceLinkedTaskCount: number;
  idempotencyKeyCount: number;
  traceableTaskCount: number;
  idempotencyKeyCoveragePercent: number | null;
  traceabilityCoveragePercent: number | null;
  resolutionStatus: "VERIFIED" | "PARTIAL" | "UNAVAILABLE";
}

export interface TaskPerformanceScorecard {
  status: "READY" | "EMPTY";
  asOf: string;
  scope: {
    visibleRoles: TaskPerformanceRole[];
    completePopulation: true;
    visibleTaskCount: number;
  };
  coverage: {
    sourceLinkedTaskCount: number;
    idempotencyKeyCount: number;
    traceableTaskCount: number;
    idempotencyKeyCoveragePercent: number | null;
    traceabilityCoveragePercent: number | null;
  };
  resolution: {
    completedTaskCount: number;
    sampleCount: number;
    excludedCount: number;
    status: "VERIFIED" | "PARTIAL" | "UNAVAILABLE";
  };
  audit: {
    observedReopenEventCount: number;
    observedReopenedTaskCount: number;
    completeness: "PARTIAL";
    reasonCode: "AUTOMATIC_SOURCE_TRANSITIONS_ARE_NOT_ALL_AUDITED";
    reopenRatePercent: null;
  };
  groups: TaskPerformanceGroup[];
  unavailableMetrics: TaskPerformanceUnavailableMetric[];
}

type PlainRecord = Record<string, unknown>;

function asRecord(value: unknown): PlainRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as PlainRecord
    : null;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPercent(value: unknown): value is number | null {
  return value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

const ROLES = new Set<TaskPerformanceRole>([
  "sales",
  "accountant",
  "warehouse",
  "purchasing",
  "management",
  "operations",
]);

const UNAVAILABLE_METRICS = new Set<TaskPerformanceUnavailableMetric>([
  "REOPEN_RATE",
  "DUPLICATE_REPLAY_RATE",
  "ACTIONABILITY_RATE",
  "FALSE_ALARM_RATE",
  "REPEATED_CAUSE_RATE",
  "WAITING_ON_OTHER_PARTY",
  "IMPROVEMENT_OUTCOMES",
  "PRINT_SUCCESS_RATE",
  "EMPLOYEE_COMPARISON",
]);

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator * 10000) / denominator) / 100 : null;
}

function parseGroup(value: unknown): TaskPerformanceGroup | null {
  const row = asRecord(value);
  if (
    !row ||
    typeof row.taskType !== "string" ||
    row.taskType.length < 1 ||
    row.taskType.length > 120 ||
    typeof row.taskRole !== "string" ||
    !ROLES.has(row.taskRole as TaskPerformanceRole) ||
    !isCount(row.taskCount) ||
    !isCount(row.completedCount) ||
    !isCount(row.resolutionSampleCount) ||
    !isCount(row.resolutionExcludedCount) ||
    !isCount(row.sourceLinkedTaskCount) ||
    !isCount(row.idempotencyKeyCount) ||
    !isCount(row.traceableTaskCount) ||
    !isPercent(row.idempotencyKeyCoveragePercent) ||
    !isPercent(row.traceabilityCoveragePercent)
  ) return null;

  const median = row.medianResolutionMinutes;
  const p90 = row.p90ResolutionMinutes;
  if (
    (median !== null && (typeof median !== "number" || !Number.isFinite(median) || median < 0)) ||
    (p90 !== null && (typeof p90 !== "number" || !Number.isFinite(p90) || p90 < 0)) ||
    row.completedCount > row.taskCount ||
    row.resolutionSampleCount + row.resolutionExcludedCount !== row.completedCount ||
    row.resolutionSampleCount > row.completedCount ||
    row.sourceLinkedTaskCount > row.taskCount ||
    row.idempotencyKeyCount > row.sourceLinkedTaskCount ||
    row.traceableTaskCount > row.idempotencyKeyCount ||
    (row.resolutionSampleCount === 0 && (median !== null || p90 !== null)) ||
    (row.resolutionSampleCount > 0 && (median === null || p90 === null || p90 < median)) ||
    row.idempotencyKeyCoveragePercent !== percentage(row.idempotencyKeyCount, row.sourceLinkedTaskCount) ||
    row.traceabilityCoveragePercent !== percentage(row.traceableTaskCount, row.sourceLinkedTaskCount)
  ) return null;

  const resolutionStatus = row.resolutionSampleCount === 0
    ? "UNAVAILABLE"
    : row.resolutionExcludedCount > 0
      ? "PARTIAL"
      : "VERIFIED";

  return {
    taskType: row.taskType,
    taskRole: row.taskRole as TaskPerformanceRole,
    taskCount: row.taskCount,
    completedCount: row.completedCount,
    resolutionSampleCount: row.resolutionSampleCount,
    resolutionExcludedCount: row.resolutionExcludedCount,
    medianResolutionMinutes: median as number | null,
    p90ResolutionMinutes: p90 as number | null,
    sourceLinkedTaskCount: row.sourceLinkedTaskCount,
    idempotencyKeyCount: row.idempotencyKeyCount,
    traceableTaskCount: row.traceableTaskCount,
    idempotencyKeyCoveragePercent: row.idempotencyKeyCoveragePercent,
    traceabilityCoveragePercent: row.traceabilityCoveragePercent,
    resolutionStatus,
  };
}

/**
 * Parse the trusted RPC contract without upgrading partial evidence to complete.
 * A reopen rate is rejected unless it is explicitly null: the current writer set
 * does not audit every automatic source-triggered reopen.
 */
export function parseTaskPerformanceScorecard(value: unknown): TaskPerformanceScorecard | null {
  const row = asRecord(value);
  const scope = asRecord(row?.scope);
  const coverage = asRecord(row?.coverage);
  const resolution = asRecord(row?.resolution);
  const audit = asRecord(row?.audit);

  if (
    !row ||
    !scope ||
    !coverage ||
    !resolution ||
    !audit ||
    (row.status !== "READY" && row.status !== "EMPTY") ||
    !isTimestamp(row.asOf) ||
    !Array.isArray(scope.visibleRoles) ||
    scope.visibleRoles.length === 0 ||
    scope.visibleRoles.some(role => typeof role !== "string" || !ROLES.has(role as TaskPerformanceRole)) ||
    new Set(scope.visibleRoles).size !== scope.visibleRoles.length ||
    scope.completePopulation !== true ||
    !isCount(scope.visibleTaskCount) ||
    !isCount(coverage.sourceLinkedTaskCount) ||
    !isCount(coverage.idempotencyKeyCount) ||
    !isCount(coverage.traceableTaskCount) ||
    !isPercent(coverage.idempotencyKeyCoveragePercent) ||
    !isPercent(coverage.traceabilityCoveragePercent) ||
    !isCount(resolution.completedTaskCount) ||
    !isCount(resolution.sampleCount) ||
    !isCount(resolution.excludedCount) ||
    !isCount(audit.observedReopenEventCount) ||
    !isCount(audit.observedReopenedTaskCount) ||
    audit.completeness !== "PARTIAL" ||
    audit.reasonCode !== "AUTOMATIC_SOURCE_TRANSITIONS_ARE_NOT_ALL_AUDITED" ||
    audit.reopenRatePercent !== null ||
    !Array.isArray(row.groups) ||
    !Array.isArray(row.unavailableMetrics) ||
    row.unavailableMetrics.some(metric =>
      typeof metric !== "string" || !UNAVAILABLE_METRICS.has(metric as TaskPerformanceUnavailableMetric),
    ) ||
    row.unavailableMetrics.length !== UNAVAILABLE_METRICS.size ||
    new Set(row.unavailableMetrics).size !== UNAVAILABLE_METRICS.size
  ) return null;

  const visibleRoles = scope.visibleRoles as TaskPerformanceRole[];
  const groups = row.groups.map(parseGroup);
  if (groups.some(group => group === null)) return null;
  const typedGroups = groups as TaskPerformanceGroup[];
  const groupKeys = typedGroups.map(group => group.taskRole + "::" + group.taskType);
  if (new Set(groupKeys).size !== groupKeys.length) return null;

  const total = (select: (group: TaskPerformanceGroup) => number) =>
    typedGroups.reduce((sum, group) => sum + select(group), 0);

  if (
    row.status !== (scope.visibleTaskCount === 0 ? "EMPTY" : "READY") ||
    typedGroups.some(group => !visibleRoles.includes(group.taskRole)) ||
    total(group => group.taskCount) !== scope.visibleTaskCount ||
    total(group => group.sourceLinkedTaskCount) !== coverage.sourceLinkedTaskCount ||
    total(group => group.idempotencyKeyCount) !== coverage.idempotencyKeyCount ||
    total(group => group.traceableTaskCount) !== coverage.traceableTaskCount ||
    total(group => group.completedCount) !== resolution.completedTaskCount ||
    total(group => group.resolutionSampleCount) !== resolution.sampleCount ||
    total(group => group.resolutionExcludedCount) !== resolution.excludedCount ||
    coverage.idempotencyKeyCount > coverage.sourceLinkedTaskCount ||
    coverage.traceableTaskCount > coverage.idempotencyKeyCount ||
    coverage.sourceLinkedTaskCount > scope.visibleTaskCount ||
    coverage.idempotencyKeyCoveragePercent !== percentage(
      coverage.idempotencyKeyCount,
      coverage.sourceLinkedTaskCount,
    ) ||
    coverage.traceabilityCoveragePercent !== percentage(
      coverage.traceableTaskCount,
      coverage.sourceLinkedTaskCount,
    ) ||
    resolution.sampleCount + resolution.excludedCount !== resolution.completedTaskCount ||
    audit.observedReopenedTaskCount > audit.observedReopenEventCount
  ) return null;

  const resolutionStatus = resolution.sampleCount === 0
    ? "UNAVAILABLE"
    : resolution.excludedCount > 0
      ? "PARTIAL"
      : "VERIFIED";

  return {
    status: row.status,
    asOf: row.asOf,
    scope: {
      visibleRoles: [...visibleRoles],
      completePopulation: true,
      visibleTaskCount: scope.visibleTaskCount,
    },
    coverage: {
      sourceLinkedTaskCount: coverage.sourceLinkedTaskCount,
      idempotencyKeyCount: coverage.idempotencyKeyCount,
      traceableTaskCount: coverage.traceableTaskCount,
      idempotencyKeyCoveragePercent: coverage.idempotencyKeyCoveragePercent,
      traceabilityCoveragePercent: coverage.traceabilityCoveragePercent,
    },
    resolution: {
      completedTaskCount: resolution.completedTaskCount,
      sampleCount: resolution.sampleCount,
      excludedCount: resolution.excludedCount,
      status: resolutionStatus,
    },
    audit: {
      observedReopenEventCount: audit.observedReopenEventCount,
      observedReopenedTaskCount: audit.observedReopenedTaskCount,
      completeness: "PARTIAL",
      reasonCode: "AUTOMATIC_SOURCE_TRANSITIONS_ARE_NOT_ALL_AUDITED",
      reopenRatePercent: null,
    },
    groups: typedGroups,
    unavailableMetrics: [...new Set(row.unavailableMetrics as TaskPerformanceUnavailableMetric[])],
  };
}
