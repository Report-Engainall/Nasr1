import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentTenantScope: vi.fn(), rpc: vi.fn(),
  rpcResult: { data: [] as Array<Record<string, unknown>>, error: null as { message: string } | null },
  saveResult: { data: null as Record<string, unknown> | null, error: null as { message: string } | null },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc }, getCurrentTenantScope: mocks.getCurrentTenantScope,
}));
import { createProduct, updateProduct } from "@/lib/api";

const ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_PRODUCT_ID = "10000000-0000-4000-8000-000000000002";
const PRODUCT = {
  id: PRODUCT_ID, organization_id: ORGANIZATION_ID, name: "Product", item_code: "P-001",
  unit: "unit", base_price: 123, price_wholesale_of_wholesale: 103, price_wholesale: 113,
  price_retail: 123, cost_price: 80, status: "active",
};
const NEW_PRODUCT = {
  name: "New product", item_code: "NEW-001", unit: "unit", base_price: 123,
  price_wholesale_of_wholesale: 103, price_wholesale: 113, price_retail: 123,
};

describe("product write result verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpcResult = { data: [PRODUCT], error: null };
    mocks.saveResult = { data: { id: PRODUCT_ID, status: "active", created: false }, error: null };
    mocks.getCurrentTenantScope.mockResolvedValue({ organizationId: ORGANIZATION_ID, isStaff: true });
    mocks.rpc.mockImplementation(async (name: string, args: { p_product_id?: string | null }) => {
      if (name === "fetch_staff_products") {
        return { data: mocks.rpcResult.data.filter(product => product.id === args.p_product_id), error: mocks.rpcResult.error };
      }
      if (name === "save_admin_product_with_metadata") return mocks.saveResult;
      throw new Error("Unexpected RPC " + name);
    });
  });

  it("creates through the atomic catalog RPC and verifies the saved product through the staff read RPC", async () => {
    mocks.saveResult = { data: { id: PRODUCT_ID, status: "active", created: true }, error: null };
    await expect(createProduct(NEW_PRODUCT)).resolves.toMatchObject(PRODUCT);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "save_admin_product_with_metadata", {
      p_product_id: null,
      p_payload: expect.objectContaining({
        name: "New product", item_code: "NEW-001", base_price: 123,
        price_wholesale_of_wholesale: 103, price_wholesale: 113, price_retail: 123,
      }),
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "fetch_staff_products", { p_product_id: PRODUCT_ID });
  });

  it("rejects incomplete tier prices before any server write", async () => {
    await expect(createProduct({ ...NEW_PRODUCT, price_retail: undefined })).rejects.toThrow(/أسعار شرائح العملاء الثلاث/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not claim successful creation when the atomic save RPC does not return an acknowledgement", async () => {
    mocks.saveResult = { data: null, error: null };
    await expect(createProduct(NEW_PRODUCT)).rejects.toThrow(/لم يُرجع الخادم نتيجة صالحة/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith("fetch_staff_products", expect.anything());
  });

  it("propagates a create RPC error without attempting a follow-up private read", async () => {
    mocks.saveResult = { data: null, error: { message: "permission denied" } };
    await expect(createProduct(NEW_PRODUCT)).rejects.toMatchObject({ message: "permission denied" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("confirms a same-tenant update through the audited save RPC and rereads the persisted product", async () => {
    await expect(updateProduct(PRODUCT_ID, { name: "Renamed" })).resolves.toMatchObject(PRODUCT);
    expect(mocks.rpc).toHaveBeenCalledWith("save_admin_product_with_metadata", {
      p_product_id: PRODUCT_ID,
      p_payload: expect.objectContaining({
        name: "Renamed", base_price: 123, price_wholesale_of_wholesale: 103,
        price_wholesale: 113, price_retail: 123, expected_base_price: 123,
        expected_price_wholesale_of_wholesale: 103, expected_price_wholesale: 113,
        expected_price_retail: 123, min_order_quantity: 1, order_quantity_multiple: 1,
      }),
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "fetch_staff_products", { p_product_id: PRODUCT_ID });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "save_admin_product_with_metadata", expect.anything());
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "fetch_staff_products", { p_product_id: PRODUCT_ID });
  });

  it("fails closed before mutation when the staff RPC cannot resolve the product in the active tenant", async () => {
    mocks.rpcResult = { data: [], error: null };
    await expect(updateProduct(OTHER_PRODUCT_ID, { name: "Do not save" })).rejects.toThrow(/الصنف غير موجود في المؤسسة الحالية أو لا تملك صلاحية قراءته/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith("save_admin_product_with_metadata", expect.anything());
  });

  it("fails closed before mutation if the current price grid is incomplete", async () => {
    mocks.rpcResult = { data: [{ ...PRODUCT, price_retail: undefined }], error: null };
    await expect(updateProduct(PRODUCT_ID, { name: "Do not save" })).rejects.toThrow(/تعذر التحقق من شبكة أسعار المنتج الحالية؛ لم تُحفظ أي تعديلات/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith("save_admin_product_with_metadata", expect.anything());
  });

  it("fails closed if the save RPC confirms a different product id", async () => {
    mocks.saveResult = { data: { id: OTHER_PRODUCT_ID, status: "active", created: false }, error: null };
    await expect(updateProduct(PRODUCT_ID, { name: "Do not save" })).rejects.toThrow(/لم يؤكد الخادم حفظ المنتج ضمن المؤسسة الحالية/);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "fetch_staff_products", { p_product_id: PRODUCT_ID });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "save_admin_product_with_metadata", expect.anything());
  });

  it("propagates update RPC errors without issuing a follow-up staff read", async () => {
    mocks.saveResult = { data: null, error: { message: "permission denied" } };
    await expect(updateProduct(PRODUCT_ID, { name: "Do not save" })).rejects.toMatchObject({ message: "permission denied" });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "fetch_staff_products", { p_product_id: PRODUCT_ID });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "save_admin_product_with_metadata", expect.anything());
  });
});
