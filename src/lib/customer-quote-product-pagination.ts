export const CUSTOMER_QUOTE_PRODUCT_PAGE_SIZE = 100;

type IdentifiedProduct = { id: string };

export function appendUniqueCustomerQuoteProducts<T extends IdentifiedProduct>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const seen = new Set(current.map((product) => product.id));
  const additions: T[] = [];
  for (const product of incoming) {
    if (typeof product.id !== "string" || product.id.length === 0 || seen.has(product.id)) continue;
    seen.add(product.id);
    additions.push(product);
  }
  return [...current, ...additions];
}

export function customerQuoteProductPageHasMore(
  rows: readonly unknown[],
  pageSize = CUSTOMER_QUOTE_PRODUCT_PAGE_SIZE,
): boolean {
  return Number.isInteger(pageSize) && pageSize > 0 && rows.length === pageSize;
}
