import type { Category } from '@/lib/types';

export interface AdminCategoryTreeNode {
  category: Category;
  children: AdminCategoryTreeNode[];
  relationshipWarning?: 'PARENT_NOT_FOUND' | 'CYCLIC_PARENT';
}

function compareNodes(a: AdminCategoryTreeNode, b: AdminCategoryTreeNode): number {
  return a.category.sort_order - b.category.sort_order
    || a.category.name.localeCompare(b.category.name, 'ar')
    || a.category.id.localeCompare(b.category.id);
}

/** Project the existing parent_id relation into a tree without dropping source rows. */
export function buildAdminCategoryTree(categories: readonly Category[]): AdminCategoryTreeNode[] {
  const nodes = new Map<string, AdminCategoryTreeNode>();
  for (const category of categories) nodes.set(category.id, { category, children: [] });
  const roots: AdminCategoryTreeNode[] = [];

  for (const node of nodes.values()) {
    const parentId = node.category.parent_id;
    if (!parentId) { roots.push(node); continue; }
    const parent = nodes.get(parentId);
    if (!parent) { node.relationshipWarning = 'PARENT_NOT_FOUND'; roots.push(node); continue; }

    const seen = new Set<string>([node.category.id]);
    let cursor: string | null = parentId;
    let cyclic = false;
    while (cursor) {
      if (seen.has(cursor)) { cyclic = true; break; }
      seen.add(cursor);
      cursor = nodes.get(cursor)?.category.parent_id ?? null;
    }
    if (cyclic) { node.relationshipWarning = 'CYCLIC_PARENT'; roots.push(node); }
    else parent.children.push(node);
  }

  const sort = (items: AdminCategoryTreeNode[]) => {
    items.sort(compareNodes);
    for (const item of items) sort(item.children);
  };
  sort(roots);
  return roots;
}

export function filterAdminCategoryTree(nodes: readonly AdminCategoryTreeNode[], query: string): AdminCategoryTreeNode[] {
  const needle = query.trim().toLocaleLowerCase('ar');
  if (!needle) return [...nodes];
  const visit = (node: AdminCategoryTreeNode): AdminCategoryTreeNode | null => {
    const children = node.children.map(visit).filter((item): item is AdminCategoryTreeNode => item !== null);
    const haystack = [node.category.name, node.category.code ?? '', node.category.name_en ?? ''].join(' ').toLocaleLowerCase('ar');
    return haystack.includes(needle) || children.length ? { ...node, children } : null;
  };
  return nodes.map(visit).filter((item): item is AdminCategoryTreeNode => item !== null);
}

export function getAdminCategoryAncestorIds(categories: readonly Category[], id: string): string[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const result: string[] = [];
  const visited = new Set<string>([id]);
  let parentId = byId.get(id)?.parent_id ?? null;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    result.unshift(parentId);
    parentId = byId.get(parentId)?.parent_id ?? null;
  }
  return result;
}

export function getAdminCategoryPath(categories: readonly Category[], id: string): Category[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  if (!byId.has(id)) return [];
  return [...getAdminCategoryAncestorIds(categories, id), id]
    .map((categoryId) => byId.get(categoryId))
    .filter((category): category is Category => Boolean(category));
}
