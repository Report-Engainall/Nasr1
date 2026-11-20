export type BusinessInventoryProduct = {
  id: string;
  base_price: unknown;
};

export type BusinessInventoryBalance = {
  product_id: string;
  quantity_available: unknown;
};

/**
 * Reproduce the analytics inventory valuation only when every product has
 * one finite selected-warehouse available balance and one valid base price.
 * Missing data remains null; no missing stock is coerced to zero.
 */
export function calculateBusinessInventoryValue(
  productsValue: unknown,
  balancesValue: unknown,
  hasActiveWarehouse: boolean,
): number | null {
  if (!Array.isArray(productsValue) || !Array.isArray(balancesValue)) return null;
  const products = productsValue as BusinessInventoryProduct[];
  const balances = balancesValue as BusinessInventoryBalance[];
  if (products.length === 0) return 0;
  if (!hasActiveWarehouse) return null;

  const productIds = new Set<string>();
  const prices = new Map<string, number>();
  for (const product of products) {
    if (
      !product ||
      typeof product.id !== "string" ||
      product.id.trim() === "" ||
      productIds.has(product.id) ||
      product.base_price === null ||
      product.base_price === undefined
    ) return null;
    const price = Number(product.base_price);
    if (!Number.isFinite(price) || price < 0) return null;
    productIds.add(product.id);
    prices.set(product.id, price);
  }

  const quantities = new Map<string, number>();
  for (const balance of balances) {
    if (!balance || typeof balance.product_id !== "string") continue;
    if (!productIds.has(balance.product_id)) continue;
    if (quantities.has(balance.product_id)) return null;
    if (typeof balance.quantity_available !== "number" || !Number.isFinite(balance.quantity_available)) {
      return null;
    }
    quantities.set(balance.product_id, balance.quantity_available);
  }

  let total = 0;
  for (const productId of productIds) {
    const price = prices.get(productId);
    const quantity = quantities.get(productId);
    if (price === undefined || quantity === undefined) return null;
    total += price * quantity;
    if (!Number.isFinite(total) || Math.abs(total) > Number.MAX_SAFE_INTEGER) return null;
  }
  return total;
}
