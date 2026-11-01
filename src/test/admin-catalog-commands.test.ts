import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  archiveAdminCatalogProduct,
  createAdminCatalogCategory,
  saveAdminCatalogProduct,
} from "@/lib/admin-catalog-commands";

const PRODUCT_ID = "a1000000-0000-0000-0000-000000000001";
const PRODUCT_INPUT = {
  name: " أرز ",
  item_code: " rice-1 ",
  barcode: "",
  unit: "كيس",
  description: "",
  category_id: null,
  base_price: 12,
  price_wholesale_of_wholesale: 10,
  price_wholesale: 11,
  price_retail: 13,
  status: "active" as const,
  expected_base_price: 9,
  expected_price_wholesale_of_wholesale: 8,
  expected_price_wholesale: 8.5,
  expected_price_retail: 10,
  brand_id: PRODUCT_ID,
  stock_quantity: 500,
};
const NORMALIZED_PRODUCT_PAYLOAD = {
  name: "أرز",
  item_code: "RICE-1",
  barcode: null,
  unit: "كيس",
  description: null,
  category_id: null,
  base_price: 12,
  price_wholesale_of_wholesale: 10,
  price_wholesale: 11,
  price_retail: 13,
  status: "active",
  expected_base_price: 9,
  expected_price_wholesale_of_wholesale: 8,
  expected_price_wholesale: 8.5,
  expected_price_retail: 10,
};
const SAVE_PRODUCT_RPC_ARGS = {
  p_product_id: PRODUCT_ID,
  p_payload: NORMALIZED_PRODUCT_PAYLOAD,
};
const CREATED_PRODUCT_RESPONSE = {
  data: { id: PRODUCT_ID, created: false, status: "active" },
  error: null,
};
const ARCHIVED_PRODUCT_RESPONSE = {
  data: { id: PRODUCT_ID, status: "inactive", archived: true },
  error: null,
};
const CREATED_CATEGORY_RESPONSE = {
  data: { id: PRODUCT_ID, name: "حبوب", created: true },
  error: null,
};
const ARCHIVE_PRODUCT_RPC_ARGS = { p_product_id: PRODUCT_ID };
const CREATE_CATEGORY_RPC_ARGS = {
  p_name: "حبوب",
  p_parent_id: null,
  p_code: null,
};

describe("staff catalog service", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("sends an allowlisted normalized payload", async () => {
    mocks.rpc.mockResolvedValueOnce(CREATED_PRODUCT_RESPONSE);

    await expect(saveAdminCatalogProduct(PRODUCT_ID, PRODUCT_INPUT))
      .resolves.toMatchObject({ id: PRODUCT_ID, created: false });
    expect(mocks.rpc).toHaveBeenCalledWith("save_admin_catalog_product", SAVE_PRODUCT_RPC_ARGS);
  });

  it("fails closed on invalid fields and server rejection", async () => {
    await expect(saveAdminCatalogProduct(PRODUCT_ID, { ...PRODUCT_INPUT, base_price: Infinity }))
      .rejects.toThrow(/base_price/);
    await expect(saveAdminCatalogProduct("bad", PRODUCT_INPUT))
      .rejects.toThrow(/معرّف المنتج/);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("role denied") });
    await expect(saveAdminCatalogProduct(null, PRODUCT_INPUT)).rejects.toThrow("role denied");
  });

  it("archives and creates categories with dedicated RPCs", async () => {
    mocks.rpc.mockResolvedValueOnce(ARCHIVED_PRODUCT_RESPONSE);
    await expect(archiveAdminCatalogProduct(PRODUCT_ID)).resolves.toMatchObject({ archived: true });
    expect(mocks.rpc).toHaveBeenLastCalledWith("archive_admin_catalog_product", ARCHIVE_PRODUCT_RPC_ARGS);

    mocks.rpc.mockResolvedValueOnce(CREATED_CATEGORY_RESPONSE);
    await expect(createAdminCatalogCategory(" حبوب ")).resolves.toMatchObject({ created: true });
    expect(mocks.rpc).toHaveBeenLastCalledWith("create_admin_catalog_category", CREATE_CATEGORY_RPC_ARGS);
  });
});
