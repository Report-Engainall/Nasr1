export type CustomerShoppingListCatalogSearchable = { name: string; item_code: string; sku?: string | null; barcode?: string | null; };
export const CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE = 80;
export function filterCustomerShoppingListCatalog<T extends CustomerShoppingListCatalogSearchable>(products: readonly T[], search: string): T[] {
  const query = search.trim().toLocaleLowerCase("ar");
  if (!query) return [...products];
  return products.filter((product) => [product.name, product.item_code, product.sku ?? "", product.barcode ?? ""]
    .some((value) => value.toLocaleLowerCase("ar").includes(query)));
}
export function projectCustomerShoppingListCatalogPage<T>(filteredProducts: readonly T[], visibleCount: number) {
  const safeVisibleCount = Number.isSafeInteger(visibleCount) && visibleCount > 0 ? visibleCount : CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE;
  return { items: filteredProducts.slice(0, safeVisibleCount), total: filteredProducts.length, hasMore: filteredProducts.length > safeVisibleCount,
    nextVisibleCount: Math.min(filteredProducts.length, safeVisibleCount + CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE) };
}
