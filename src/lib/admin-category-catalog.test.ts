import { describe, expect, it } from "vitest";
import type { ProductWithInventory } from "./types";
import { projectAdminCategoryCatalogMetrics } from "./admin-category-catalog";

function product(overrides: Partial<ProductWithInventory> = {}): Pick<ProductWithInventory, "base_price" | "min_stock_level" | "inventory"> {
  return {
    base_price: 125,
    min_stock_level: 5,
    inventory: {
      id: "balance-1", product_id: "product-1", warehouse_id: "warehouse-1",
      quantity_on_hand: 8, quantity_reserved: 8, quantity_available: 0,
      reorder_point: 5, last_movement_at: null,
    },
    ...overrides,
  } as Pick<ProductWithInventory, "base_price" | "min_stock_level" | "inventory">;
}

describe("admin category price and inventory projection", () => {
  it("shows a verified zero balance as zero and classifies it against the saved threshold", () => {
    const metrics = projectAdminCategoryCatalogMetrics(product(), { canViewPrice: true, canViewInventory: true });
    expect(metrics).toEqual({ price: 125, quantityOnHand: 8, quantityAvailable: 0, reorderPoint: 5, stockStatus: "low" });
  });

  it("hides the base price from staff while retaining permitted warehouse quantities", () => {
    const metrics = projectAdminCategoryCatalogMetrics(product(), { canViewPrice: false, canViewInventory: true });
    expect(metrics.price).toBeNull();
    expect(metrics.quantityAvailable).toBe(0);
    expect(metrics.stockStatus).toBe("low");
  });

  it("does not turn a missing warehouse balance into a zero balance", () => {
    const metrics = projectAdminCategoryCatalogMetrics(product({ inventory: undefined }), { canViewPrice: true, canViewInventory: true });
    expect(metrics.price).toBe(125);
    expect(metrics.quantityOnHand).toBeNull();
    expect(metrics.quantityAvailable).toBeNull();
    expect(metrics.reorderPoint).toBe(5);
    expect(metrics.stockStatus).toBe("unknown");
  });

  it("fails closed for negative, infinite and unavailable price or stock values", () => {
    const metrics = projectAdminCategoryCatalogMetrics(product({
      base_price: -1,
      min_stock_level: -2,
      inventory: {
        id: "balance-1", product_id: "product-1", warehouse_id: "warehouse-1",
        quantity_on_hand: Number.POSITIVE_INFINITY, quantity_reserved: 0,
        quantity_available: -1, reorder_point: -1, last_movement_at: null,
      },
    }), { canViewPrice: true, canViewInventory: true });
    expect(metrics.price).toBeNull();
    expect(metrics.quantityOnHand).toBeNull();
    expect(metrics.quantityAvailable).toBeNull();
    expect(metrics.reorderPoint).toBeNull();
    expect(metrics.stockStatus).toBe("unknown");
  });

  it("does not project pricing or inventory when the caller lacks read permission", () => {
    const metrics = projectAdminCategoryCatalogMetrics(product(), { canViewPrice: false, canViewInventory: false });
    expect(metrics).toEqual({ price: null, quantityOnHand: null, quantityAvailable: null, reorderPoint: null, stockStatus: "unknown" });
  });
});
