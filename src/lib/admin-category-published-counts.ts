/**
 * Counts only published products directly assigned to each requested category.
 * Descendant-category totals remain distinct so the customer-facing category count
 * is not silently inflated by products assigned to a child.
 */
export function countPublishedProductsByCategory(
  categoryIds: readonly string[],
  productCategoryIds: readonly (string | null | undefined)[],
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(categoryIds.map((id) => [id, 0]));
  const validIds = new Set(categoryIds);
  for (const categoryId of productCategoryIds) {
    if (typeof categoryId === 'string' && validIds.has(categoryId)) {
      counts[categoryId] += 1;
    }
  }
  return counts;
}
