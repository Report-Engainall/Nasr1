import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchStorefrontCatalogPage, parseStorefrontCartProductDetailsRow } from "./storefront-catalog";

const baseRow = {
  id: "a2000000-0000-4000-8000-000000000001",
  name: "أرز بسمتي",
  item_code: "RICE-A",
  unit: "كيس",
  display_price: null,
  created_at: "2026-11-01T00:00:00.000Z",
  min_order_quantity: 2,
  order_quantity_multiple: 2,
  inventory: null,
};

describe("storefront catalog product freshness", () => {
  it("preserves the exact server updated_at timestamp for the product detail screen", () => {
    const updatedAt = "2026-11-19T08:15:00.000Z";
    const product = parseStorefrontCartProductDetailsRow({ ...baseRow, updated_at: updatedAt });
    expect(product.updated_at).toBe(updatedAt);
  });

  it("does not fabricate a freshness timestamp when the server omits it or returns an invalid value", () => {
    const withoutTimestamp = parseStorefrontCartProductDetailsRow(baseRow);
    const malformedTimestamp = parseStorefrontCartProductDetailsRow({
      ...baseRow,
      updated_at: "not-a-timestamp",
    });
    expect(withoutTimestamp).not.toHaveProperty("updated_at");
    expect(malformedTimestamp).not.toHaveProperty("updated_at");
  });
});

const CATEGORY_ID = "2c4a6e80-1234-4abc-8def-1234567890ab";

describe("storefront catalog category filter boundary", () => {
  it("rejects a malformed category ID before calling the catalog RPC", async () => {
    mocks.rpc.mockReset();

    await expect(fetchStorefrontCatalogPage({
      search: "",
      categoryId: "not-a-category",
      page: 1,
      availableOnly: false,
    })).rejects.toThrow("معرّف التصنيف");

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("forwards a valid category UUID unchanged to the tenant-scoped catalog RPC", async () => {
    mocks.rpc.mockReset().mockResolvedValueOnce({
      data: {
        page: 1,
        page_size: 1,
        total_count: 0,
        total_pages: 0,
        items: [],
        filters: { brands: [], units: [] },
      },
      error: null,
    });

    await fetchStorefrontCatalogPage({
      search: "أرز",
      categoryId: CATEGORY_ID,
      page: 1,
      pageSize: 1,
      availableOnly: false,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_storefront_catalog_page", {
      p_search: "أرز",
      p_category_id: CATEGORY_ID,
      p_page: 1,
      p_page_size: 1,
      p_available_only: false,
      p_brand_id: null,
      p_unit: null,
      p_price_displayable_only: false,
      p_product_id: null,
    });
  });
});
