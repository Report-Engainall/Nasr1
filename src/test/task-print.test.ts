import { describe, expect, it } from 'vitest';
import { filterTasksForPrint, operationalTaskPrintTitle, projectOperationalTaskPrintRow } from '@/lib/task-print';
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


  it('projects only approved task fields into the printable document row', () => {
    const unsafe = {
      id: 'task-print-1',
      organization_id: 'FOREIGN-ORG-PRINT-SENTINEL',
      title: 'متابعة استلام البضاعة',
      description: 'مطابقة الكميات من المصدر',
      task_role: 'warehouse',
      priority: 'high',
      status: 'pending',
      due_at: '2026-10-31T10:00:00.000Z',
      source_entity_type: 'purchase_receipts',
      source_entity_id: 'INTERNAL-SOURCE-UUID-PRINT-SENTINEL',
      source_event_key: 'INTERNAL-EVENT-KEY-PRINT-SENTINEL',
      assigned_to: 'INTERNAL-ASSIGNEE-UUID-PRINT-SENTINEL',
      created_by: 'INTERNAL-CREATOR-UUID-PRINT-SENTINEL',
      completed_by: 'INTERNAL-COMPLETER-UUID-PRINT-SENTINEL',
      created_at: '2026-10-30T08:00:00.000Z',
      completed_at: null,
      updated_at: '2026-10-31T09:00:00.000Z',
      resolution_note: null,
      task_payload: { internal_cost: 'INTERNAL-COST-PRINT-SENTINEL', margin: 'INTERNAL-MARGIN-PRINT-SENTINEL' },
    } as unknown as import('@/lib/types').OperationalTask;

    const printable = projectOperationalTaskPrintRow(unsafe, 'أمين المخزن');
    expect(Object.keys(printable).sort()).toEqual([
      'assigned_label', 'completed_at', 'created_at', 'description', 'due_at',
      'id', 'priority', 'resolution_note', 'source_entity_type', 'status',
      'task_role', 'title',
    ].sort());
    expect(printable.assigned_label).toBe('أمين المخزن');

    const serialized = JSON.stringify(printable);
    for (const secret of [
      'FOREIGN-ORG-PRINT-SENTINEL',
      'INTERNAL-SOURCE-UUID-PRINT-SENTINEL',
      'INTERNAL-EVENT-KEY-PRINT-SENTINEL',
      'INTERNAL-ASSIGNEE-UUID-PRINT-SENTINEL',
      'INTERNAL-CREATOR-UUID-PRINT-SENTINEL',
      'INTERNAL-COMPLETER-UUID-PRINT-SENTINEL',
      'INTERNAL-COST-PRINT-SENTINEL',
      'INTERNAL-MARGIN-PRINT-SENTINEL',
    ]) expect(serialized).not.toContain(secret);
  });

  it('returns no printable tasks rather than inventing content when no filter matches', () => {
    expect(filterTasksForPrint([], 'all', allRoles)).toEqual([]);
    expect(filterTasksForPrint(tasks, 'filtered', [], tasks)).toEqual([]);
  });
});
