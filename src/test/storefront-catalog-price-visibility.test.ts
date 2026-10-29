import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc },
}));

import { fetchStorefrontCatalogPage } from "@/lib/storefront-catalog";

describe("storefront catalog price absence contract", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  const payload = (displayPrice: number | null, extra: Record<string, unknown> = {}) => ({
    page: 1,
    page_size: 24,
    total_count: 1,
    total_pages: 1,
    items: [{
      id: "a1000000-0000-0000-0000-000000000001",
      organization_id: "a0000000-0000-0000-0000-000000000001",
      category_id: null,
      name: "أرز الاختبار",
      name_en: null,
      item_code: "RICE-001",
      sku: null,
      barcode: null,
      brand_id: null,
      unit: "كيس",
      description: null,
      image_url: null,
      is_active: true,
      is_featured: false,
      sort_order: 0,
      stock_quantity: 0,
      reserved_quantity: 0,
      min_stock_level: 0,
      status: "active",
      created_at: "2026-10-24T00:00:00Z",
      display_price: displayPrice,
      ...extra,
    }],
  });

  it("omits hidden prices instead of synthesizing base/tier price zeros", async () => {
    rpc.mockResolvedValueOnce({ data: payload(null), error: null });

    const result = await fetchStorefrontCatalogPage({
      search: "",
      categoryId: null,
      page: 1,
      availableOnly: false,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("display_price");
    expect(result.items[0]).not.toHaveProperty("base_price");
    expect(result.items[0]).not.toHaveProperty("price_wholesale_of_wholesale");
    expect(result.items[0]).not.toHaveProperty("price_wholesale");
    expect(result.items[0]).not.toHaveProperty("price_retail");
  });

  it("does not pass through any raw base/tier price even if malformed payload contains those keys", async () => {
    rpc.mockResolvedValueOnce({
      data: payload(1234, {
        base_price: 99000,
        price_wholesale_of_wholesale: 89000,
        price_wholesale: 92000,
        price_retail: 95000,
      }),
      error: null,
    });

    const result = await fetchStorefrontCatalogPage({
      search: "",
      categoryId: null,
      page: 1,
      availableOnly: false,
    });

    expect(result.items[0].display_price).toBe(1234);
    expect(result.items[0]).not.toHaveProperty("base_price");
    expect(result.items[0]).not.toHaveProperty("price_wholesale_of_wholesale");
    expect(result.items[0]).not.toHaveProperty("price_wholesale");
    expect(result.items[0]).not.toHaveProperty("price_retail");
  });

  it("derives public stock only from quantity_available and ignores raw inventory identifiers and on-hand counts", async () => {
    rpc.mockResolvedValueOnce({
      data: payload(1234, {
        organization_id: "FOREIGN-ORGANIZATION-SENTINEL",
        stock_quantity: 140,
        inventory: {
          id: "PRIVATE-INVENTORY-ROW-SENTINEL",
          organization_id: "FOREIGN-INVENTORY-ORGANIZATION-SENTINEL",
          product_id: "a1000000-0000-0000-0000-000000000001",
          warehouse_id: "PRIVATE-WAREHOUSE-SENTINEL",
          quantity_on_hand: 140,
          quantity_reserved: 16,
          quantity_available: 124,
          reorder_point: 24,
        },
      }),
      error: null,
    });

    const result = await fetchStorefrontCatalogPage({
      search: "",
      categoryId: null,
      page: 1,
      availableOnly: false,
    });

    expect(result.items[0].stock_quantity).toBe(124);
    expect(result.items[0].inventory).toEqual({
      id: "",
      product_id: "a1000000-0000-0000-0000-000000000001",
      warehouse_id: "",
      quantity_on_hand: 0,
      quantity_reserved: 0,
      quantity_available: 124,
    });
    expect(result.items[0]).not.toHaveProperty("organization_id");
    expect(result.items[0].inventory).not.toHaveProperty("organization_id");
    expect(result.items[0].inventory).not.toHaveProperty("reorder_point");
  });

  it("rejects missing display_price instead of treating it as zero", async () => {
    const data = payload(null);
    delete (data.items[0] as { display_price?: number | null }).display_price;
    rpc.mockResolvedValueOnce({ data, error: null });

    await expect(fetchStorefrontCatalogPage({
      search: "",
      categoryId: null,
      page: 1,
      availableOnly: false,
    })).rejects.toThrow(/استجابة السعر من الخادم غير مكتملة/);
  });
});
