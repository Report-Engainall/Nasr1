import { describe, expect, it } from 'vitest';
import { filterTasksForPrint, operationalTaskPrintTitle } from '@/lib/task-print';
import type { OperationalTaskRole } from '@/lib/types';

const tasks: Array<{ id: string; task_role: OperationalTaskRole }> = [
  { id: 'sales-1', task_role: 'sales' },
  { id: 'accounting-1', task_role: 'accountant' },
  { id: 'warehouse-1', task_role: 'warehouse' },
  { id: 'purchase-1', task_role: 'purchasing' },
  { id: 'management-1', task_role: 'management' },
  { id: 'operations-1', task_role: 'operations' },
];

describe('role-scoped operational task printing', () => {
  it('uses the canonical Aghbari business identity in the printable task register title', () => {
    expect(operationalTaskPrintTitle()).toBe('متجر الأغبري | Aghbari Commerce — كشف المهام التشغيلية');
  });

  const allRoles: OperationalTaskRole[] = ['sales','accountant','warehouse','purchasing','management','operations'];

  it('prints every row allowed to the current account when scope is all', () => {
    expect(filterTasksForPrint(tasks, 'all', allRoles).map((task) => task.id)).toEqual(tasks.map((task) => task.id));
  });

  it('prints exactly the rows currently visible after role and other screen filters', () => {
    const nonRoleFiltered = tasks.filter((task) => task.id !== 'sales-1' && task.id !== 'purchase-1');
    const screenFiltered = nonRoleFiltered.filter((task) => task.task_role === 'accountant');
    expect(filterTasksForPrint(nonRoleFiltered, 'filtered', allRoles, screenFiltered)).toEqual(screenFiltered);
  });

  it('does not leak roles omitted from the permissions even if supplied by stale screen state', () => {
    const staffRoles: OperationalTaskRole[] = ['sales','warehouse','purchasing','operations'];
    const secretlyAddedRole = [...tasks.filter((task) => staffRoles.includes(task.task_role)), tasks[1]];
    expect(filterTasksForPrint(secretlyAddedRole, 'filtered', staffRoles, secretlyAddedRole).map((task) => task.task_role))
      .toEqual(staffRoles);
    expect(filterTasksForPrint(tasks, 'all', staffRoles).map((task) => task.task_role)).toEqual(staffRoles);
    expect(filterTasksForPrint(tasks, 'accountant', staffRoles)).toEqual([]);
    expect(filterTasksForPrint(tasks, 'management', staffRoles)).toEqual([]);
  });

  it.each([
    ['sales', 'sales-1'],
    ['accountant', 'accounting-1'],
    ['warehouse', 'warehouse-1'],
    ['purchasing', 'purchase-1'],
    ['management', 'management-1'],
  ] as const)('prints only the selected %s role with upstream non-role filters preserved', (role, id) => {
    const alreadyFiltered = tasks.filter((task) => task.id !== 'sales-1');
    const printable = filterTasksForPrint(alreadyFiltered, role, allRoles);
    expect(printable.map((task) => task.id)).toEqual(role === 'sales' ? [] : [id]);
  });

  it('returns no printable tasks rather than inventing content when no filter matches', () => {
    expect(filterTasksForPrint([], 'all', allRoles)).toEqual([]);
    expect(filterTasksForPrint(tasks, 'filtered', [], tasks)).toEqual([]);
  });
});
