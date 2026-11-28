import type { RecentlyViewedProduct } from '@/lib/recently-viewed-products';
import type { ProductWithInventory } from '@/lib/types';

/**
 * Resolve history against the current server-projected catalogue. The local
 * history is only an ordered list of IDs; it is never a source of product data.
 */
export function resolveRecentlyViewedProducts(
  entries: RecentlyViewedProduct[],
  products: ProductWithInventory[],
  currentProductId: string,
): ProductWithInventory[] {
  const liveById = new Map(products.map((product) => [product.id, product]));
  const seen = new Set<string>();
  const resolved: ProductWithInventory[] = [];

  for (const entry of entries) {
    if (!entry.id || entry.id === currentProductId || seen.has(entry.id)) continue;
    const product = liveById.get(entry.id);
    if (!product) continue;
    seen.add(entry.id);
    resolved.push(product);
  }

  return resolved;
}
