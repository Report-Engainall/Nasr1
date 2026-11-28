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


export const CUSTOMER_SHOPPING_LIST_SERVER_PAGE_SIZE = 200;

export function projectCustomerShoppingListServerPage<T extends { id: string }>(
  rows: readonly T[],
  pageSize = CUSTOMER_SHOPPING_LIST_SERVER_PAGE_SIZE,
) {
  const page = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : CUSTOMER_SHOPPING_LIST_SERVER_PAGE_SIZE;
  const items = rows.slice(0, page);
  return { items, cursor: items.length ? items[items.length - 1].id : null, hasMore: rows.length > page };
}

export function mergeCustomerShoppingListCatalogProducts<T extends { id: string; name: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map(current.map((product) => [product.id, product]));
  for (const product of incoming) byId.set(product.id, product);
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, "ar") || left.id.localeCompare(right.id));
}
