import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { renameAdminCatalogCategory } from "@/lib/admin-catalog-commands";

const CATEGORY_ID = "a1000000-0000-0000-0000-000000000001";

describe("admin category rename command", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("trims the new name and accepts a matching audited RPC response", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { id: CATEGORY_ID, name: "حبوب", renamed: true },
      error: null,
    });

    await expect(renameAdminCatalogCategory(CATEGORY_ID, " حبوب ")).resolves.toEqual({
      id: CATEGORY_ID,
      name: "حبوب",
      renamed: true,
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("rename_admin_catalog_category", {
      p_category_id: CATEGORY_ID,
      p_name: "حبوب",
    });
  });

  it("rejects malformed IDs and empty/overlong names before touching the server", async () => {
    await expect(renameAdminCatalogCategory("not-a-uuid", "حبوب")).rejects.toThrow("معرّف التصنيف غير صالح.");
    await expect(renameAdminCatalogCategory(CATEGORY_ID, "   ")).rejects.toThrow("اسم التصنيف مطلوب ويجب ألا يتجاوز 100 حرف.");
    await expect(renameAdminCatalogCategory(CATEGORY_ID, "ا".repeat(101))).rejects.toThrow("اسم التصنيف مطلوب ويجب ألا يتجاوز 100 حرف.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("propagates authorization, tenant and duplicate-name RPC errors", async () => {
    const denied = new Error("active admin or manager profile required");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: denied });
    await expect(renameAdminCatalogCategory(CATEGORY_ID, "حبوب")).rejects.toBe(denied);
  });

  it.each([
    null,
    { id: "b2000000-0000-0000-0000-000000000002", name: "حبوب", renamed: true },
    { id: CATEGORY_ID, name: "اسم آخر", renamed: true },
    { id: CATEGORY_ID, name: "حبوب", renamed: "yes" },
  ])("fails closed on an incomplete or mismatched response: %o", async (data) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(renameAdminCatalogCategory(CATEGORY_ID, "حبوب")).rejects.toThrow("لم يؤكد الخادم إعادة تسمية التصنيف.");
  });
});
