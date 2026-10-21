import type { OperationalTaskRole } from '@/lib/types';
import { BUSINESS_BRAND_NAME } from '@/lib/brand';

type HasTaskRole = { task_role: OperationalTaskRole };
export type TaskPrintScope = OperationalTaskRole | 'all' | 'filtered';

/** Canonical title used by the printable operational task register. */
export function operationalTaskPrintTitle(): string {
  return BUSINESS_BRAND_NAME + ' — كشف المهام التشغيلية';
}

/**
 * Selects tasks from rows already filtered by status, priority, assignee, dates and search.
 * The caller supplies the role-filtered screen rows for "filtered"; the permission check remains
 * an additional UI boundary and PostgreSQL/RLS remains authoritative.
 */
export function filterTasksForPrint<T extends HasTaskRole>(
  tasks: readonly T[],
  scope: TaskPrintScope,
  allowedRoles: readonly OperationalTaskRole[],
  currentlyDisplayedTasks: readonly T[] = tasks,
): T[] {
  if (scope === 'filtered') {
    return currentlyDisplayedTasks.filter((task) => allowedRoles.includes(task.task_role));
  }
  if (scope !== 'all' && !allowedRoles.includes(scope)) return [];
  return tasks.filter((task) =>
    allowedRoles.includes(task.task_role) && (scope === 'all' || task.task_role === scope),
  );
}
