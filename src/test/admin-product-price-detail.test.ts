import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { fetchAdminProductPriceDetail } from "@/lib/api";

const PRODUCT_ID = "10000000-0000-4000-8000-000000000002";
const OTHER_PRODUCT_ID = "10000000-0000-4000-8000-000000000003";
const PRICE_ROW = {
  id: PRODUCT_ID,
  base_price: "120.00",
  price_wholesale_of_wholesale: "110.00",
  price_wholesale: 115,
  price_retail: 125,
};

describe("single-product admin price snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.rpc.mockReturnValue({ eq: mocks.eq });
    mocks.maybeSingle.mockResolvedValue({ data: PRICE_ROW, error: null });
  });

  it("requests one tenant-authorized price row using the product id filter", async () => {
    await expect(fetchAdminProductPriceDetail(PRODUCT_ID)).resolves.toEqual({
      id: PRODUCT_ID,
      base_price: 120,
      price_wholesale_of_wholesale: 110,
      price_wholesale: 115,
      price_retail: 125,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_admin_product_price_grid_with_inventory");
    expect(mocks.eq).toHaveBeenCalledWith("id", PRODUCT_ID);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid product id before making a server request", async () => {
    await expect(fetchAdminProductPriceDetail("not-a-uuid")).rejects.toThrow(/معرّف المنتج/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a response for a different product", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { ...PRICE_ROW, id: OTHER_PRODUCT_ID },
      error: null,
    });
    await expect(fetchAdminProductPriceDetail(PRODUCT_ID)).rejects.toThrow(/منتج مختلف/);
  });

  it("rejects missing or malformed tier prices instead of substituting zero", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { ...PRICE_ROW, price_retail: null },
      error: null,
    });
    await expect(fetchAdminProductPriceDetail(PRODUCT_ID)).rejects.toThrow(/price_retail/);
  });

  it("propagates a server authorization or read failure", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "active admin or manager required" },
    });
    await expect(fetchAdminProductPriceDetail(PRODUCT_ID)).rejects.toThrow(/active admin or manager required/);
  });
});
