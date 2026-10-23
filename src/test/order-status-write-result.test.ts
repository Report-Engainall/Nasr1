import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  writeResult: { data: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null, error: null as { message: string } | null },
  lastQuery: null as null | {
    table: string;
    updatePayload?: Record<string, unknown>;
    filters: Array<{ column: string; value: unknown }>;
    selected?: string;
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
  getCurrentTenantScope: vi.fn(),
  getStorefrontDataScope: vi.fn(),
}));

import { updateOrderStatus } from "@/lib/api";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function setupOrderQuery() {
  const query = {
    table: "orders",
    filters: [] as Array<{ column: string; value: unknown }>,
    selected: undefined as string | undefined,
    updatePayload: undefined as Record<string, unknown> | undefined,
  };
  const builder = {
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
    maybeSingle: async () => mocks.writeResult,
  };
  mocks.lastQuery = query;
  return builder;
}

describe("order status write-result confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastQuery = null;
    mocks.writeResult = { data: { id: ORDER_ID }, error: null };
    mocks.from.mockImplementation((table: string) => {
      if (table !== "orders") throw new Error("Unexpected table " + table);
      return setupOrderQuery();
    });
  });

  it("confirms the affected order using only the RLS-granted id projection", async () => {
    await expect(updateOrderStatus(ORDER_ID, "processing")).resolves.toBeUndefined();
    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.lastQuery?.updatePayload).toEqual({ status: "processing" });
    expect(mocks.lastQuery?.filters).toEqual([{ column: "id", value: ORDER_ID }]);
    expect(mocks.lastQuery?.selected).toBe("id");
  });

  it("fails closed when RLS or a missing order yields zero updated rows without an error", async () => {
    mocks.writeResult = { data: null, error: null };
    await expect(updateOrderStatus(ORDER_ID, "processing")).rejects.toThrow(
      /لم يؤكد الخادم تحديث حالة الطلب/,
    );
  });

  it("fails closed if the write returns an unexpected order id", async () => {
    mocks.writeResult = {
      data: { id: "22222222-2222-4222-8222-222222222222" },
      error: null,
    };
    await expect(updateOrderStatus(ORDER_ID, "processing")).rejects.toThrow(
      /لم يؤكد الخادم تحديث حالة الطلب/,
    );
  });

  it("rejects unsupported states before issuing a write", async () => {
    await expect(updateOrderStatus(ORDER_ID, "refunded")).rejects.toThrow(
      /حالة الطلب غير مدعومة/,
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("propagates database/RLS/state-machine errors", async () => {
    mocks.writeResult = { data: null, error: { message: "invalid transition" } };
    await expect(updateOrderStatus(ORDER_ID, "processing")).rejects.toMatchObject({
      message: "invalid transition",
    });
  });

  it.each(["draft", "pending", "confirmed", "processing", "shipped", "delivered", "cancelled"])(
    "accepts supported status value %s for server-side transition validation",
    async (status) => {
      await expect(updateOrderStatus(ORDER_ID, status)).resolves.toBeUndefined();
      expect(mocks.lastQuery?.updatePayload).toEqual({ status });
    },
  );
});
