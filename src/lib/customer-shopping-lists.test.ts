import { describe, expect, it, vi } from "vitest";
import {
  applyCustomerShoppingListRunToCart,
  fetchCustomerShoppingLists,
  saveCustomerShoppingList,
  shareCustomerShoppingList,
} from "@/lib/customer-shopping-lists";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn() },
}));

const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const validList = {
  id: uuid, name: "قائمة رمضان", category: "ramadan", is_draft: false, status: "active",
  recurrence: "weekly", next_run_on: "2026-11-25", timezone: "Asia/Aden",
  created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z",
  created_by_profile_id: uuid, can_edit: true,
  items: [{ product_id: productId, product_name: "أرز", item_code: "R-1", base_unit: "كيس",
    quantity: 2, unit_name: "كرتون", base_units_per_unit: 6 }],
  shares: [], runs: [],
};

describe("customer shopping list RPC contracts", () => {
  it("parses the persisted server list and exact unit factor", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [validList], error: null } as never);
    const lists = await fetchCustomerShoppingLists();
    expect(lists[0].items[0]).toMatchObject({ quantity: 2, base_units_per_unit: 6 });
  });

  it("fails closed when the server returns a duplicated product line", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{ ...validList, items: [validList.items[0], validList.items[0]] }], error: null,
    } as never);
    await expect(fetchCustomerShoppingLists()).rejects.toThrow("صنفًا مكررًا");
  });

  it("rejects client-side quantities that overflow a saved package conversion before RPC", async () => {
    vi.mocked(supabase.rpc).mockClear();
    await expect(saveCustomerShoppingList({
      name: "مخزن", category: "warehouse", isDraft: false, recurrence: "none",
      nextRunOn: null, items: [{ product_id: productId, quantity: 2000, unit_name: "كرتون", base_units_per_unit: 6 }],
    })).rejects.toThrow("تحقق من رمز الصنف");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("never accepts a successful share response unless the server confirms true", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: false, error: null } as never);
    await expect(shareCustomerShoppingList(uuid, productId, "view")).rejects.toThrow("لم يؤكد");
  });

  it("requires the server to confirm cart loading as one explicit state transition", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { status: "cart_loaded", requires_checkout_confirmation: false, cart: { items: [] } },
      error: null,
    } as never);
    await expect(applyCustomerShoppingListRunToCart(uuid)).rejects.toThrow("تأكيد الشراء");
  });
});
