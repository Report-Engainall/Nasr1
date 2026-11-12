import { describe, expect, it } from 'vitest';
import type { Category } from '@/lib/types';
import { buildAdminCategoryTree, filterAdminCategoryTree, getAdminCategoryAncestorIds, getAdminCategoryPath } from '@/lib/admin-category-tree';

function category(id: string, parent_id: string | null, name = id): Category {
  return { id, name, name_en: null, code: null, parent_id, sort_order: 0, is_active: true, icon: null };
}

describe('admin catalog category tree', () => {
  it('builds nested levels and preserves parent identifiers', () => {
    const rows = [category('root', null, 'رئيسي'), category('child', 'root', 'فرعي'), category('leaf', 'child', 'مستوى ثالث')];
    const tree = buildAdminCategoryTree(rows);
    expect(tree[0].children[0].children[0].category.id).toBe('leaf');
    expect(getAdminCategoryAncestorIds(rows, 'leaf')).toEqual(['root', 'child']);
    expect(getAdminCategoryPath(rows, 'leaf').map((item) => item.id)).toEqual(['root', 'child', 'leaf']);
  });

  it('does not hide orphaned or cyclic source rows', () => {
    const tree = buildAdminCategoryTree([category('orphan', 'missing'), category('cycle-a', 'cycle-b'), category('cycle-b', 'cycle-a')]);
    const visible = new Set<string>();
    const visit = (nodes: typeof tree) => nodes.forEach((node) => { visible.add(node.category.id); visit(node.children); });
    visit(tree);
    expect(visible).toEqual(new Set(['orphan', 'cycle-a', 'cycle-b']));
    expect(tree.find((node) => node.category.id === 'orphan')?.relationshipWarning).toBe('PARENT_NOT_FOUND');
    expect(tree.filter((node) => node.relationshipWarning === 'CYCLIC_PARENT')).toHaveLength(2);
  });

  it('keeps parent context when searching for a nested category', () => {
    const filtered = filterAdminCategoryTree(buildAdminCategoryTree([
      category('root', null, 'الأدوات'), category('child', 'root', 'معدات البناء'), category('other', 'root', 'مستلزمات'),
    ]), 'البناء');
    expect(filtered.map((node) => node.category.id)).toEqual(['root']);
    expect(filtered[0].children.map((node) => node.category.id)).toEqual(['child']);
  });

  it('keeps every row for empty searches', () => {
    expect(filterAdminCategoryTree(buildAdminCategoryTree([category('root', null)]), '  ')).toHaveLength(1);
  });
});
