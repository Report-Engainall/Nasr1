import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { archiveAdminCatalogCategory } from "@/lib/admin-catalog-commands";

const CATEGORY_ID = "a1000000-0000-0000-0000-000000000001";

describe("admin category archive command", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("uses the audited target-native archive RPC and confirms the same category was archived", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { id: CATEGORY_ID, is_active: false, archived: true },
      error: null,
    });

    await expect(archiveAdminCatalogCategory(CATEGORY_ID)).resolves.toEqual({
      id: CATEGORY_ID,
      is_active: false,
      archived: true,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("archive_admin_catalog_category", {
      p_category_id: CATEGORY_ID,
    });
  });

  it("rejects malformed IDs before any RPC call", async () => {
    await expect(archiveAdminCatalogCategory("not-a-uuid")).rejects.toThrow("معرّف التصنيف غير صالح.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("propagates server-side role, tenant and dependency conflicts without success", async () => {
    const denied = new Error("category has active products or child categories");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: denied });

    await expect(archiveAdminCatalogCategory(CATEGORY_ID)).rejects.toBe(denied);
  });

  it.each([
    null,
    { id: CATEGORY_ID, is_active: true, archived: true },
    { id: "a2000000-0000-0000-0000-000000000002", is_active: false, archived: true },
    { id: CATEGORY_ID, is_active: false, archived: false },
  ])("fails closed on an incomplete or mismatched RPC result: %o", async (data) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    await expect(archiveAdminCatalogCategory(CATEGORY_ID)).rejects.toThrow("لم يؤكد الخادم أرشفة التصنيف.");
  });
});
