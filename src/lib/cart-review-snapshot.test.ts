import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCartAvailabilitySnapshot,
  compareCartAvailabilitySnapshots,
  planCartAvailabilityAdjustments,
  compareCartPricingSnapshots,
  getCartAvailabilitySnapshot,
  getCartPricingSnapshot,
  rememberCartAvailabilitySnapshot,
  rememberCartPricingSnapshot,
  type CartReviewIdentity,
} from "./cart-review-snapshot";
import type { CustomerOrderPricingPresentation } from "./storefront-price-visibility";

const identity: CartReviewIdentity = { userId: "auth-user-a", profileId: "profile-a" };
const otherIdentity: CartReviewIdentity = { userId: "auth-user-b", profileId: "profile-b" };
const lines = [
  { product_id: "a1000000-0000-4000-8000-000000000001", quantity: 4 },
  { product_id: "a1000000-0000-4000-8000-000000000002", quantity: 2 },
];

function pricing(unitPrice: number, originalPrice = unitPrice): CustomerOrderPricingPresentation {
  return {
    visible: true,
    currency: "YER",
    discountTotal: 0,
    totalAmount: unitPrice * 6,
    customerTierVisible: false,
    items: lines.map((line, index) => ({
      product_id: line.product_id,
      name: index === 0 ? "أرز بسمتي" : "سكر",
      quantity: line.quantity,
      original_unit_price: originalPrice,
      discount_per_unit: 0,
      discount_amount: 0,
      promotion_title: null,
      unit_price: unitPrice,
      line_total: unitPrice * line.quantity,
    })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cart pricing change review", () => {
  it("retains a matching server preview only in the current runtime and customer scope", () => {
    rememberCartPricingSnapshot(identity, lines, pricing(20));
    expect(getCartPricingSnapshot(identity, [...lines].reverse())?.totalAmount).toBe(120);
    expect(getCartPricingSnapshot(otherIdentity, lines)).toBeNull();
    expect(getCartPricingSnapshot(identity, [{ ...lines[0], quantity: 5 }, lines[1]])?.items[0].quantity).toBe(4);
  });

  it("compares the actual server unit prices and reports increases and decreases", () => {
    const before = pricing(20);
    const after = {
      ...pricing(24),
      items: pricing(24).items.map((line, index) => index === 0 ? line : { ...line, unit_price: 15 }),
    };
    expect(compareCartPricingSnapshots(before, after).map((change) => change.kind)).toEqual(["increase", "decrease"]);
  });

  it("detects a quantity-tier unit-price change between cart and checkout", () => {
    const before = pricing(20);
    const current = {
      ...pricing(18),
      items: pricing(18).items.map((line) => ({ ...line, quantity: line.quantity + 1 })),
    };
    const changes = compareCartPricingSnapshots(before, current);
    expect(changes).toHaveLength(2);
    expect(changes[0].previous_quantity).toBe(4);
    expect(changes[0].quantity).toBe(5);
    expect(changes[0].kind).toBe("decrease");
  });

  it("detects changed promotional terms even when the payable unit price is unchanged", () => {
    const before = pricing(20);
    const after = {
      ...pricing(20),
      items: pricing(20).items.map((line, index) => index === 0
        ? { ...line, original_unit_price: 25, discount_per_unit: 5, discount_amount: 20, promotion_title: "عرض جديد" }
        : line),
    };
    const changes = compareCartPricingSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("terms");
  });

  it("does not compare hidden or different-currency previews", () => {
    expect(compareCartPricingSnapshots(pricing(20), { visible: false })).toEqual([]);
    expect(compareCartPricingSnapshots(pricing(20), { ...pricing(20), currency: "USD" })).toEqual([]);
    rememberCartPricingSnapshot(identity, lines, { visible: false });
    expect(getCartPricingSnapshot(identity, lines)).toBeNull();
  });

  it("rejects a preview that does not describe the exact cart lines", () => {
    rememberCartPricingSnapshot(identity, lines, {
      ...pricing(20),
      items: pricing(20).items.slice(0, 1),
    });
    expect(getCartPricingSnapshot(identity, lines)).toBeNull();
  });
});

describe("cart availability change review", () => {
  const ids = lines.map((line) => line.product_id);
  const products = [
    { id: ids[0], status: "active", inventory: { quantity_available: 30 } },
    { id: ids[1], status: "active", inventory: { quantity_available: 10 } },
  ];

  it("captures only active products and compares the fresh server snapshot", () => {
    const before = buildCartAvailabilitySnapshot(ids, products);
    const after = buildCartAvailabilitySnapshot(ids, [
      { ...products[0], inventory: { quantity_available: 12 } },
      { id: ids[1], status: "inactive", inventory: { quantity_available: 0 } },
    ]);
    expect(compareCartAvailabilitySnapshots(before, after).map((change) => change.kind))
      .toEqual(["reduced", "unavailable"]);
  });

  it("stores the availability baseline within the authenticated profile only", () => {
    const snapshot = buildCartAvailabilitySnapshot(ids, products);
    rememberCartAvailabilitySnapshot(identity, ids, snapshot);
    expect(getCartAvailabilitySnapshot(identity, [...ids].reverse())).toEqual(snapshot);
    expect(getCartAvailabilitySnapshot(otherIdentity, ids)).toBeNull();
  });

  it("plans valid quantity reductions and removes lines that cannot meet minimum order rules", () => {
    const changes = [
      { product_id: ids[0], previous_status: "active" as const, current_status: "active" as const, previous_available: 30, current_available: 7, kind: "reduced" as const },
      { product_id: ids[1], previous_status: "active" as const, current_status: "active" as const, previous_available: 10, current_available: 1, kind: "reduced" as const },
    ];
    const plan = planCartAvailabilityAdjustments(
      [{ product_id: ids[0], quantity: 10 }, { product_id: ids[1], quantity: 4 }],
      changes,
      [
        { product_id: ids[0], min_order_quantity: 2, order_quantity_multiple: 2 },
        { product_id: ids[1], min_order_quantity: 2, order_quantity_multiple: 2 },
      ],
    );
    expect(plan).toEqual([
      { product_id: ids[0], previous_quantity: 10, next_quantity: 6, action: "reduce" },
      { product_id: ids[1], previous_quantity: 4, next_quantity: null, action: "remove" },
    ]);
  });

  it("blocks automatic quantity changes when the server cannot confirm availability", () => {
    const changes = [
      { product_id: ids[0], previous_status: "active" as const, current_status: "active" as const, previous_available: 30, current_available: null, kind: "unknown" as const },
    ];
    expect(planCartAvailabilityAdjustments(
      [{ product_id: ids[0], quantity: 4 }],
      changes,
      [],
    )).toEqual([
      { product_id: ids[0], previous_quantity: 4, next_quantity: null, action: "blocked" },
    ]);
  });

  it("distinguishes restored, increased and unknown availability", () => {
    const previous = [
      { product_id: ids[0], status: "unavailable" as const, quantity_available: null },
      { product_id: ids[1], status: "active" as const, quantity_available: 5 },
    ];
    const current = [
      { product_id: ids[0], status: "active" as const, quantity_available: 7 },
      { product_id: ids[1], status: "active" as const, quantity_available: null },
    ];
    expect(compareCartAvailabilitySnapshots(previous, current).map((change) => change.kind))
      .toEqual(["restored", "unknown"]);
  });

  it("ignores unchanged availability and unavailable stock values are never coerced to zero", () => {
    const snapshot = buildCartAvailabilitySnapshot(ids, [
      { id: ids[0], status: "active", inventory: { quantity_available: undefined } },
      { id: ids[1], status: "active", inventory: { quantity_available: 8 } },
    ]);
    expect(snapshot[0].quantity_available).toBeNull();
    expect(compareCartAvailabilitySnapshots(snapshot, [...snapshot])).toEqual([]);
  });
});
