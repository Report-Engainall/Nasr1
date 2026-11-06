import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { searchAdminWorkspaceRecords } from "@/lib/admin-workspace-search";

describe("admin workspace search client", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("does not call the server for a one-character query", async () => {
    await expect(searchAdminWorkspaceRecords(" أ ")).resolves.toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("normalizes a bounded query and maps only a known source route", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [{
      kind: "order", id: "order-1", title: "ORD-001", subtitle: "قيد المعالجة · متجر الاختبار",
      status: "processing", route: "/admin/orders", created_at: "2026-11-06T08:00:00Z",
    }] }, error: null });
    await expect(searchAdminWorkspaceRecords("  ORD-001  ")).resolves.toEqual([{
      id: "order-1", kind: "order", title: "ORD-001", subtitle: "قيد المعالجة · متجر الاختبار",
      status: "processing", route: "/admin/orders", createdAt: "2026-11-06T08:00:00Z",
    }]);
    expect(mocks.rpc).toHaveBeenCalledWith("search_admin_workspace", { p_query: "ORD-001", p_limit: 30 });
  });

  it("rejects an unexpected destination and never returns a partial result", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [{
      kind: "invoice", id: "invoice-1", title: "INV-1", subtitle: "مدفوعة",
      status: "paid", route: "/admin/orders", created_at: null,
    }] }, error: null });
    await expect(searchAdminWorkspaceRecords("INV-1")).rejects.toThrow("مرجع غير صالح");
  });

  it("rejects excessive input and server result size", async () => {
    await expect(searchAdminWorkspaceRecords("x".repeat(121))).rejects.toThrow("120");
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: { items: Array.from({ length: 31 }, (_, index) => ({
      kind: "product", id: String(index), title: "صنف", subtitle: "",
      status: "active", route: "/admin/products", created_at: null,
    })) }, error: null });
    await expect(searchAdminWorkspaceRecords("منتج")).rejects.toThrow("الحد المطلوب");
  });
});
