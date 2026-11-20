import { getInventoryAvailabilityStatus } from "./inventory-metrics";
import type { ProductWithInventory } from "./types";

export type AdminCategoryCatalogAccess = {
  canViewPrice: boolean;
  canViewInventory: boolean;
};

function nonNegativeFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Read-only projection for category details; missing balances never become zero. */
export function projectAdminCategoryCatalogMetrics(
  product: Pick<ProductWithInventory, "base_price" | "min_stock_level" | "inventory">,
  access: AdminCategoryCatalogAccess,
) {
  const inventory = access.canViewInventory ? product.inventory : undefined;
  const quantityOnHand = nonNegativeFinite(inventory?.quantity_on_hand);
  const quantityAvailable = nonNegativeFinite(inventory?.quantity_available);
  const reorderPoint = nonNegativeFinite(inventory?.reorder_point)
    ?? nonNegativeFinite(product.min_stock_level);

  return {
    price: access.canViewPrice ? nonNegativeFinite(product.base_price) : null,
    quantityOnHand: access.canViewInventory ? quantityOnHand : null,
    quantityAvailable: access.canViewInventory ? quantityAvailable : null,
    reorderPoint: access.canViewInventory ? reorderPoint : null,
    stockStatus: access.canViewInventory
      ? getInventoryAvailabilityStatus(quantityAvailable, reorderPoint)
      : "unknown" as const,
  };
}
