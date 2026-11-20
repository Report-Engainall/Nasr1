import type { Category } from "@/lib/types";

export interface StorefrontCategoryGroup {
  category: Category;
  children: Category[];
  detached: boolean;
}

export interface StorefrontCategoryGrouping {
  groups: StorefrontCategoryGroup[];
  additionalCategories: Category[];
}

/**
 * Groups active storefront categories by their immediate visible parent.
 *
 * Categories whose parent is not in the public active-category projection are kept
 * as independent groups. Deeper or cyclic relationships are returned separately
 * instead of silently disappearing from the customer directory.
 */
export function groupStorefrontCategories(
  categories: readonly Category[],
): StorefrontCategoryGrouping {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const roots = categories.filter(
    (category) => !category.parent_id || !byId.has(category.parent_id),
  );

  const childrenByParent = new Map<string, Category[]>();
  for (const category of categories) {
    if (!category.parent_id || !byId.has(category.parent_id)) continue;
    const siblings = childrenByParent.get(category.parent_id) ?? [];
    siblings.push(category);
    childrenByParent.set(category.parent_id, siblings);
  }

  const placedIds = new Set<string>();
  const groups = roots.map((category) => {
    placedIds.add(category.id);
    const children = childrenByParent.get(category.id) ?? [];
    for (const child of children) placedIds.add(child.id);

    return {
      category,
      children,
      detached: Boolean(category.parent_id),
    };
  });

  return {
    groups,
    additionalCategories: categories.filter((category) => !placedIds.has(category.id)),
  };
}
