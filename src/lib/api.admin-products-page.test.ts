import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getStorefrontDataScope: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: { rpc: mocks.rpc },
  getStorefrontDataScope: mocks.getStorefrontDataScope,
}));

import { fetchAdminProductsPage } from "./api";

const CATEGORY_ID = "2c4a6e80-1234-4abc-8def-1234567890ab";

function emptyPage(page = 1) {
  return {
    items: [],
    page,
    page_size: 40,
    has_next_page: false,
  };
}

describe("fetchAdminProductsPage server-side filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStorefrontDataScope.mockResolvedValue({
      organizationId: "1c4a6e80-1234-4abc-8def-1234567890ab",
      warehouseId: null,
      isStaff: true,
      canViewInternalProductPrices: false,
    });
    mocks.rpc.mockImplementation((_name: string, args: { p_page: number }) =>
      Promise.resolve({ data: emptyPage(args.p_page), error: null }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends status, category and normalized search to the tenant-derived server page RPC", async () => {
    await fetchAdminProductsPage({
      page: 2,
      search: " أرز Basmati ",
      status: "inactive",
      categoryId: CATEGORY_ID,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_admin_products_page_v2", {
      p_page: 2,
      p_page_size: 40,
      p_search: "أرز Basmati",
      p_status: "inactive",
      p_category_id: CATEGORY_ID,
    });
  });

  it("defaults to all product statuses without broadening the tenant or role scope", async () => {
    await fetchAdminProductsPage({ page: 1 });

    expect(mocks.rpc).toHaveBeenCalledWith("get_admin_products_page_v2", {
      p_page: 1,
      p_page_size: 40,
      p_search: null,
      p_status: "all",
      p_category_id: null,
    });
  });

  it("keeps the legacy activeOnly option mapped to the exact active status", async () => {
    await fetchAdminProductsPage({ page: 1, activeOnly: true });

    expect(mocks.rpc).toHaveBeenCalledWith("get_admin_products_page_v2", {
      p_page: 1,
      p_page_size: 40,
      p_search: null,
      p_status: "active",
      p_category_id: null,
    });
  });

  it("rejects unknown status values before requesting data", async () => {
    await expect(fetchAdminProductsPage({
      page: 1,
      status: "archived" as never,
    })).rejects.toThrow("حالة المنتج");

    expect(mocks.getStorefrontDataScope).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed category identifiers before requesting data", async () => {
    await expect(fetchAdminProductsPage({
      page: 1,
      categoryId: "not-a-category",
    })).rejects.toThrow("معرّف التصنيف");

    expect(mocks.getStorefrontDataScope).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not call the product page RPC for a non-staff identity", async () => {
    mocks.getStorefrontDataScope.mockResolvedValue({
      organizationId: "1c4a6e80-1234-4abc-8def-1234567890ab",
      warehouseId: null,
      isStaff: false,
      canViewInternalProductPrices: false,
    });

    await expect(fetchAdminProductsPage({
      page: 1,
      status: "inactive",
    })).rejects.toThrow("لا تملك صلاحية");

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves the authorized internal-price projection check for returned rows", async () => {
    mocks.getStorefrontDataScope.mockResolvedValue({
      organizationId: "1c4a6e80-1234-4abc-8def-1234567890ab",
      warehouseId: null,
      isStaff: true,
      canViewInternalProductPrices: false,
    });
    mocks.rpc.mockResolvedValue({
      data: {
        items: [{
          id: "54f85386-22be-44ac-9c2b-0ad32cf9c602",
          name: "صنف",
          item_code: "SKU-1",
          unit: "قطعة",
          status: "active",
          base_price: 100,
        }],
        page: 1,
        page_size: 40,
        has_next_page: false,
      },
      error: null,
    });

    await expect(fetchAdminProductsPage({ page: 1 })).rejects.toThrow("إسقاط السعر الأساسي");
  });
});
