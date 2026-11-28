import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { fetchAdminProductPriceGrid } from "@/lib/api";

const PRODUCT_ID = "10000000-0000-4000-8000-000000000002";
const CATEGORY_ID = "20000000-0000-4000-8000-000000000002";
const ROW = {
  id: PRODUCT_ID,
  name: "أرز بسمتي",
  item_code: "RICE-001",
  unit: "كيس",
  is_active: true,
  category_id: CATEGORY_ID,
  category_name: "مواد غذائية",
  base_price: "120.00",
  price_wholesale_of_wholesale: "110.00",
  price_wholesale: "115.00",
  price_retail: "125.00",
  quantity_on_hand_total: "10.000",
  quantity_reserved_total: "1.000",
  quantity_available_total: "9.000",
  reorder_point_total: "5.000",
  inventory_warehouse_count: 1,
};

describe("admin price-grid v2 category contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [ROW], error: null });
  });

  it("reads the v2 tenant-scoped projection and preserves the actual category label", async () => {
    await expect(fetchAdminProductPriceGrid()).resolves.toEqual([{
      id: PRODUCT_ID,
      name: "أرز بسمتي",
      item_code: "RICE-001",
      unit: "كيس",
      is_active: true,
      category_id: CATEGORY_ID,
      category_name: "مواد غذائية",
      base_price: 120,
      price_wholesale_of_wholesale: 110,
      price_wholesale: 115,
      price_retail: 125,
      quantity_on_hand_total: 10,
      quantity_reserved_total: 1,
      quantity_available_total: 9,
      reorder_point_total: 5,
      inventory_warehouse_count: 1,
    }]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_admin_product_price_grid_v2");
  });

  it("keeps genuinely uncategorized products explicitly null", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...ROW, category_id: null, category_name: null }], error: null });
    await expect(fetchAdminProductPriceGrid()).resolves.toMatchObject([
      { category_id: null, category_name: null },
    ]);
  });

  it("rejects malformed category identifiers or an incomplete category identity pair", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...ROW, category_id: "not-a-uuid" }], error: null });
    await expect(fetchAdminProductPriceGrid()).rejects.toThrow("تصنيفًا غير صالح");
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...ROW, category_name: null }], error: null });
    await expect(fetchAdminProductPriceGrid()).rejects.toThrow("تصنيفًا غير صالح");
  });

  it("rejects missing category fields rather than silently inferring them", async () => {
    const { category_id: _categoryId, category_name: _categoryName, ...incomplete } = ROW;
    mocks.rpc.mockResolvedValueOnce({ data: [incomplete], error: null });
    await expect(fetchAdminProductPriceGrid()).rejects.toThrow("تصنيفًا غير صالح");
  });

  it("propagates server-side authorization failures without presenting a successful empty grid", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Price grid category projection requires an active admin or manager in this organization" } });
    await expect(fetchAdminProductPriceGrid()).rejects.toThrow("active admin or manager");
  });
});
