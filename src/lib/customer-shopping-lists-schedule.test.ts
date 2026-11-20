import { describe, expect, it, vi } from "vitest";
import { saveCustomerShoppingList } from "@/lib/customer-shopping-lists";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn() },
}));

const productId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const baseInput = {
  name: "قائمة المبيعات الشهرية",
  category: "monthly_sales" as const,
  isDraft: false,
  recurrence: "monthly" as const,
  nextRunOn: null as string | null,
  items: [{
    product_id: productId,
    quantity: 2,
    unit_name: "كرتون",
    base_units_per_unit: 6,
  }],
};

describe("customer shopping-list recurrence contract", () => {
  it("requires a first review date before a recurring schedule can be stored", async () => {
    vi.mocked(supabase.rpc).mockClear();
    await expect(saveCustomerShoppingList(baseInput)).rejects.toThrow("حدد تاريخًا صحيحًا");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects a scheduled date on a quick-order draft", async () => {
    vi.mocked(supabase.rpc).mockClear();
    await expect(saveCustomerShoppingList({
      ...baseInput,
      isDraft: true,
      nextRunOn: "2026-12-01",
    })).rejects.toThrow("لا يمكن ضبط موعد تكرار");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("persists an explicit monthly recurrence and first local due date through the server RPC", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      error: null,
    } as never);
    const id = await saveCustomerShoppingList({
      ...baseInput,
      nextRunOn: "2026-12-01",
    });
    expect(id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(supabase.rpc).toHaveBeenCalledWith("save_customer_shopping_list", expect.objectContaining({
      p_recurrence: "monthly",
      p_next_run_on: "2026-12-01",
    }));
  });
});
