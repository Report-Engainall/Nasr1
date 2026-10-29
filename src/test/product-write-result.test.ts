import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentTenantScope: vi.fn(),
  getStorefrontDataScope: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  insertResult: { data: { id: "product-001" } as { id: string } | null, error: null as { message: string } | null },
  updateResult: { data: { id: "product-001" } as { id: string } | null, error: null as { message: string } | null },
  rpcResult: { data: [] as Array<Record<string, unknown>>, error: null as { message: string } | null },
  saveResult: { data: { id: "product-001", created: false } as Record<string, unknown> | null, error: null as { message: string } | null },
  lastQuery: null as null | {
    table: string;
    insertPayload?: Record<string, unknown>;
    updatePayload?: Record<string, unknown>;
    filters: Array<{ column: string; value: unknown }>;
    selected?: string;
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
  getCurrentTenantScope: mocks.getCurrentTenantScope,
  getStorefrontDataScope: mocks.getStorefrontDataScope,
}));

import { createProduct, updateProduct } from "@/lib/api";

const ORGANIZATION_ID = "org-current";
const PRODUCT_ID = "product-001";
const PRODUCT = {
  id: PRODUCT_ID,
  organization_id: ORGANIZATION_ID,
  name: "Product",
  item_code: "P-001",
  unit: "unit",
  base_price: 123,
  price_wholesale_of_wholesale: 103,
  price_wholesale: 113,
  price_retail: 123,
  cost_price: 80,
  status: "active",
};

function setupQuery() {
  const query = {
    table: "products",
    filters: [] as Array<{ column: string; value: unknown }>,
    selected: undefined as string | undefined,
    insertPayload: undefined as Record<string, unknown> | undefined,
    updatePayload: undefined as Record<string, unknown> | undefined,
  };
  const builder = {
    insert(payload: Record<string, unknown>) {
      query.insertPayload = payload;
      return builder;
    },
    update(payload: Record<string, unknown>) {
      query.updatePayload = payload;
      return builder;
    },
    eq(column: string, value: unknown) {
      query.filters.push({ column, value });
      return builder;
    },
    select(columns: string) {
      query.selected = columns;
      return builder;
    },
    single: async () => mocks.insertResult,
    maybeSingle: async () => mocks.updateResult,
  };
  mocks.lastQuery = query;
  return builder;
}

describe("product write result verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastQuery = null;
    mocks.insertResult = { data: { id: PRODUCT_ID }, error: null };
    mocks.updateResult = { data: { id: PRODUCT_ID }, error: null };
    mocks.rpcResult = { data: [PRODUCT], error: null };
    mocks.saveResult = { data: { id: PRODUCT_ID, created: false }, error: null };
    mocks.getCurrentTenantScope.mockResolvedValue({ organizationId: ORGANIZATION_ID });
    mocks.from.mockImplementation((table: string) => {
      if (table !== "products") throw new Error("Unexpected table " + table);
      return setupQuery();
    });
    mocks.rpc.mockImplementation(async (name: string, args: { p_product_id: string | null }) => {
      if (name === "fetch_staff_products") {
        return {
          data: mocks.rpcResult.data.filter((product) => product.id === args.p_product_id),
          error: null,
        };
      }
      if (name === "save_admin_product_with_metadata") {
        return { data: mocks.saveResult.data, error: mocks.saveResult.error };
      }
      throw new Error("Unexpected RPC " + name);
    });
  });

  it("confirms creation through the safe id projection before reading private fields through the staff RPC", async () => {
    await expect(createProduct({ id: PRODUCT_ID, name: "Product", item_code: "P-001" })).resolves.toMatchObject(PRODUCT);
    expect(mocks.lastQuery?.insertPayload).toMatchObject({
      id: PRODUCT_ID,
      organization_id: ORGANIZATION_ID,
      name: "Product",
      item_code: "P-001",
    });
    expect(mocks.lastQuery?.selected).toBe("id");
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_staff_products", { p_product_id: PRODUCT_ID });
  });

  it("does not report successful creation when the insert returned no id", async () => {
    mocks.insertResult = { data: null, error: null };
    await expect(createProduct({ name: "Product", item_code: "P-001" })).rejects.toThrow(
      /تعذر تأكيد إنشاء الصنف/,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed if creation returns an unexpected product id", async () => {
    mocks.insertResult = { data: { id: "different-product" }, error: null };
    await expect(createProduct({ id: PRODUCT_ID, name: "Product", item_code: "P-001" })).rejects.toThrow(
      /تعذر تأكيد إنشاء الصنف/,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("propagates an insert error without attempting a follow-up private read", async () => {
    mocks.insertResult = { data: null, error: { message: "permission denied" } };
    await expect(createProduct({ name: "Product", item_code: "P-001" })).rejects.toMatchObject({
      message: "permission denied",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("confirms a same-tenant update through the audited save RPC and rereads the persisted product", async () => {
    await expect(updateProduct(PRODUCT_ID, { name: "Renamed" })).resolves.toMatchObject(PRODUCT);
    expect(mocks.rpc).toHaveBeenCalledWith("save_admin_product_with_metadata", {
      p_product_id: PRODUCT_ID,
      p_payload: expect.objectContaining({
        name: "Renamed",
        base_price: 123,
        price_wholesale_of_wholesale: 103,
        price_wholesale: 113,
        price_retail: 123,
        expected_base_price: 123,
        expected_price_wholesale_of_wholesale: 103,
        expected_price_wholesale: 113,
        expected_price_retail: 123,
        min_order_quantity: 1,
        order_quantity_multiple: 1,
      }),
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "fetch_staff_products", { p_product_id: PRODUCT_ID });
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "fetch_staff_products", { p_product_id: PRODUCT_ID });
  });

  it("fails closed when the staff RPC cannot resolve the product in the active tenant", async () => {
    mocks.rpcResult = { data: [], error: null };
    await expect(updateProduct("product-not-in-tenant", { name: "Do not save" })).rejects.toThrow(
      /الصنف غير موجود في المؤسسة الحالية أو لا تملك صلاحية قراءته/,
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith("save_admin_product_with_metadata", expect.anything());
  });

  it("fails closed before mutation if the current price grid is incomplete", async () => {
    mocks.rpcResult = { data: [{ ...PRODUCT, price_retail: undefined }], error: null };
    await expect(updateProduct(PRODUCT_ID, { name: "Do not save" })).rejects.toThrow(
      /تعذر التحقق من شبكة أسعار المنتج الحالية؛ لم تُحفظ أي تعديلات/,
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith("save_admin_product_with_metadata", expect.anything());
  });

  it("fails closed if the save RPC confirms a different product id", async () => {
    mocks.saveResult = { data: { id: "different-product", created: false }, error: null };
    await expect(updateProduct(PRODUCT_ID, { name: "Do not save" })).rejects.toThrow(
      /لم يؤكد الخادم حفظ المنتج ضمن المؤسسة الحالية/,
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "fetch_staff_products", { p_product_id: PRODUCT_ID });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "save_admin_product_with_metadata", expect.anything());
  });

  it("propagates save RPC errors without issuing a follow-up staff read", async () => {
    mocks.saveResult = { data: null, error: { message: "permission denied" } };
    await expect(updateProduct(PRODUCT_ID, { name: "Do not save" })).rejects.toMatchObject({
      message: "permission denied",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "fetch_staff_products", { p_product_id: PRODUCT_ID });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "save_admin_product_with_metadata", expect.anything());
  });
});
