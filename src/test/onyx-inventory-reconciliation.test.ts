import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import {
  applyOnyxInventoryReconciliation,
  getOnyxReconciliationWarehouses,
  listOnyxReconciliationCommands,
  previewOnyxInventoryReconciliation,
  rollbackOnyxInventoryReconciliation,
} from "@/lib/onyx-inventory-reconciliation";

const id = "11111111-1111-4111-8111-111111111111";
const commandFixture = {
  command_id: id,
  snapshot_id: "22222222-2222-4222-8222-222222222222",
  warehouse_id: "33333333-3333-4333-8333-333333333333",
  status: "previewed",
  source_row_count: 4,
  adjusted_lines: 0,
  created_at: "2026-10-20T12:00:00.000Z",
  applied_at: null,
  rolled_back_at: null,
};

afterEach(() => rpc.mockReset());

describe("warehouse-scoped Onyx reconciliation RPC contract", () => {
  it("reads only server-returned active warehouse options and preserves codes as strings", async () => {
    rpc.mockResolvedValue({ data: [{ id, name: "مخزن صنعاء", code: "0007" }], error: null });
    await expect(getOnyxReconciliationWarehouses()).resolves.toEqual([
      { id, name: "مخزن صنعاء", code: "0007" },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_onyx_reconciliation_warehouses", {});
  });

  it("rejects malformed lists and non-integral row counts rather than showing defaults", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id, name: "مخزن", code: null }], error: null });
    await expect(listOnyxReconciliationCommands(id)).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: [{ ...commandFixture, source_row_count: "4" }], error: null });
    await expect(listOnyxReconciliationCommands(id)).rejects.toThrow(/source_row_count/i);
  });

  it("sends an explicit snapshot, warehouse, idempotency key and audit reason for preview", async () => {
    rpc.mockResolvedValue({ data: commandFixture, error: null });
    const result = await previewOnyxInventoryReconciliation({
      snapshotId: "22222222-2222-4222-8222-222222222222",
      warehouseId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "abcdefghijklmnop1234",
      reason: "اختبار مصالحة مخزون",
    });
    expect(result.status).toBe("previewed");
    expect(rpc).toHaveBeenCalledWith("preview_onyx_inventory_reconciliation", {
      p_snapshot_id: "22222222-2222-4222-8222-222222222222",
      p_warehouse_id: "33333333-3333-4333-8333-333333333333",
      p_idempotency_key: "abcdefghijklmnop1234",
      p_reason: "اختبار مصالحة مخزون",
    });
  });

  it("uses separate guarded RPCs for apply and compensating rollback", async () => {
    rpc.mockResolvedValueOnce({ data: { ...commandFixture, status: "applied", adjusted_lines: 3, applied_at: "2026-10-20T12:01:00.000Z" }, error: null });
    await expect(applyOnyxInventoryReconciliation(id, "apply-key-1234567890")).resolves.toMatchObject({ status: "applied" });
    expect(rpc).toHaveBeenNthCalledWith(1, "apply_onyx_inventory_reconciliation", {
      p_command_id: id, p_idempotency_key: "apply-key-1234567890",
    });

    rpc.mockResolvedValueOnce({ data: { ...commandFixture, status: "rolled_back", adjusted_lines: 3, applied_at: "2026-10-20T12:01:00.000Z", rolled_back_at: "2026-10-20T12:02:00.000Z" }, error: null });
    await expect(rollbackOnyxInventoryReconciliation({
      commandId: id, idempotencyKey: "rollback-key-1234567890", reason: "حماية الحركات اللاحقة",
    })).resolves.toMatchObject({ status: "rolled_back" });
    expect(rpc).toHaveBeenNthCalledWith(2, "rollback_onyx_inventory_reconciliation", {
      p_command_id: id, p_idempotency_key: "rollback-key-1234567890", p_reason: "حماية الحركات اللاحقة",
    });
  });

  it("surfaces PostgreSQL permission, freshness and scope denials instead of reporting success", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "stock balance changed after preview" } });
    await expect(applyOnyxInventoryReconciliation(id, "apply-key-1234567890")).rejects.toThrow(/stock balance changed/i);
  });
});
