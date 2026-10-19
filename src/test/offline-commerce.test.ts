import { describe, expect, it } from "vitest";
import {
  createOfflineCartDraft,
  createOfflineCatalogSnapshot,
  createOfflineTenantHint,
  getCommerceLocalKeys,
  offlineCartDraftMatchesScope,
  parseOfflineCartDraft,
  parseOfflineCatalogSnapshot,
  parseOfflineTenantHint,
} from "@/lib/offline-commerce";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const productB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const timestamp = "2026-10-20T00:00:00.000Z";

describe("offline commerce persistence", () => {
  it("isolates authenticated carts and restore drafts from other users and guest state", () => {
    const a = getCommerceLocalKeys(userA);
    const b = getCommerceLocalKeys(userB);
    const guest = getCommerceLocalKeys(null);
    expect(a.cart).not.toBe(b.cart);
    expect(a.cartRestore).not.toBe(b.cartRestore);
    expect(a.cart).not.toBe(guest.cart);
    expect(a.cartRestore).not.toBe(guest.cartRestore);
    expect(a.offlineCartDraft).toContain(userA);
  });

  it("normalizes stored cart lines to bounded product IDs and integer quantities only", () => {
    const draft = createOfflineCartDraft(userA, orgA, [
      { product_id: productA, quantity: 2, unit_price: 777 },
      { product_id: productA, quantity: 9 },
      { product_id: productB, quantity: 1.25 },
      { product_id: "not-a-uuid", quantity: 1 },
      { product_id: productB, quantity: 3 },
    ], timestamp);
    expect(draft).toEqual({
      version: 1,
      user_id: userA,
      organization_id: orgA,
      updated_at: timestamp,
      items: [
        { product_id: productA, quantity: 2 },
        { product_id: productB, quantity: 3 },
      ],
    });
    expect(draft?.items[0]).not.toHaveProperty("unit_price");
  });

  it("rejects malformed envelopes and never parses another user's draft", () => {
    const draft = createOfflineCartDraft(userA, orgA, [{ product_id: productA, quantity: 2 }], timestamp);
    expect(parseOfflineCartDraft(draft, userB)).toBeNull();
    expect(parseOfflineCartDraft({ ...draft, version: 2 }, userA)).toBeNull();
    expect(parseOfflineCartDraft({ ...draft, organization_id: "bad" }, userA)).toBeNull();
    expect(parseOfflineCartDraft({ ...draft, updated_at: "invalid" }, userA)).toBeNull();
  });

  it("binds a restored draft to both the authenticated user and the current organization", () => {
    const draft = createOfflineCartDraft(userA, orgA, [{ product_id: productA, quantity: 1 }], timestamp);
    expect(draft).not.toBeNull();
    expect(offlineCartDraftMatchesScope(draft!, userA, orgA)).toBe(true);
    expect(offlineCartDraftMatchesScope(draft!, userB, orgA)).toBe(false);
    expect(offlineCartDraftMatchesScope(draft!, userA, orgB)).toBe(false);
  });

  it("validates and reads only a matching tenant hint", () => {
    const hint = createOfflineTenantHint(userA, orgA);
    expect(parseOfflineTenantHint(hint, userA)).toEqual(hint);
    expect(parseOfflineTenantHint(hint, userB)).toBeNull();
    expect(parseOfflineTenantHint({ ...hint, organization_id: "bad" }, userA)).toBeNull();
  });

  it("sanitizes cached catalog snapshots so customer tier prices and staff costs are never persisted", () => {
    const snapshot = createOfflineCatalogSnapshot(userA, orgA, [{
      id: productA,
      name: "Sugar",
      item_code: "000123",
      unit: "carton",
      status: "active",
      base_price: 500,
      display_price: 300,
      retail_price: 350,
      wholesale_price: 275,
      cost_price: 200,
      reorder_point: 14,
      inventory: { id: "i1", product_id: productA, warehouse_id: orgA, quantity_on_hand: 9, quantity_available: 7, reserved_quantity: 2 },
    }], timestamp);
    expect(snapshot?.products).toHaveLength(1);
    const product = snapshot!.products[0] as unknown as Record<string, unknown>;
    expect(product).not.toHaveProperty("display_price");
    expect(product).not.toHaveProperty("retail_price");
    expect(product).not.toHaveProperty("wholesale_price");
    expect(product).not.toHaveProperty("cost_price");
    expect(product).not.toHaveProperty("reorder_point");
    expect(product.base_price).toBe(0);
    expect(parseOfflineCatalogSnapshot(snapshot, userA)?.organization_id).toBe(orgA);
    expect(parseOfflineCatalogSnapshot(snapshot, userB)).toBeNull();
  });
});
