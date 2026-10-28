import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchStorefrontCatalogPage } from "./storefront-catalog";

const emptyPage = {
  page: 1,
  page_size: 24,
  total_count: 0,
  total_pages: 0,
  items: [],
};

const hiddenPriceProduct = {
  id: "product-1",
  name: "صنف اختبار",
  item_code: "000017",
  unit: "كرتون",
  display_price: null,
};

function request(overrides: Partial<Parameters<typeof fetchStorefrontCatalogPage>[0]> = {}) {
  return fetchStorefrontCatalogPage({
    search: "",
    categoryId: null,
    page: 1,
    availableOnly: false,
    ...overrides,
  });
}

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: emptyPage, error: null });
});

describe("storefront catalog RPC response boundary", () => {
  it("normalizes non-finite page arguments to safe defaults", async () => {
    await request({ page: Number.NaN, pageSize: Number.POSITIVE_INFINITY });

    expect(mocks.rpc).toHaveBeenCalledWith("get_storefront_catalog_page", {
      p_search: "",
      p_category_id: null,
      p_page: 1,
      p_page_size: 24,
      p_available_only: false,
    });
  });

  it("caps page and page size to the server RPC bounds", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { page: 100000, page_size: 100, total_count: 0, total_pages: 0, items: [] },
      error: null,
    });

    await request({ page: 1_000_001, pageSize: 250 });

    expect(mocks.rpc).toHaveBeenCalledWith("get_storefront_catalog_page", {
      p_search: "",
      p_category_id: null,
      p_page: 100000,
      p_page_size: 100,
      p_available_only: false,
    });
  });

  it("preserves the server null-price decision instead of creating a zero price", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { page: 1, page_size: 24, total_count: 1, total_pages: 1, items: [hiddenPriceProduct] },
      error: null,
    });

    const result = await request();
    expect(result.items).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(result.items[0], "display_price")).toBe(false);
    expect(result.items[0].display_price).toBeUndefined();
  });

  it("rejects fractional or unsafe page metadata", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { page: 1, page_size: 24, total_count: 1.5, total_pages: 1, items: [hiddenPriceProduct] },
      error: null,
    });

    await expect(request()).rejects.toThrow("بيانات ترقيم صفحات الكتالوج غير صالحة");
  });

  it("rejects totals that disagree with the page-size contract", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { page: 1, page_size: 24, total_count: 25, total_pages: 1, items: [] },
      error: null,
    });

    await expect(request()).rejects.toThrow("بيانات ترقيم صفحات الكتالوج غير متسقة");
  });
});
