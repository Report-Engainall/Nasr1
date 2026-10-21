import { describe, expect, it } from "vitest";
import {
  isCustomerTierVisible,
  resolveCustomerOrderPricingPresentation,
  resolveStorefrontPricePresentation,
} from "@/lib/storefront-price-visibility";

describe("storefront price visibility presentation guard", () => {
  it("suppresses the zero sentinel and omits an amount while card prices are disabled", () => {
    const result = resolveStorefrontPricePresentation(false, 0);
    expect(result).toEqual({ visible: false });
    expect(Object.hasOwn(result, "amount")).toBe(false);
  });

  it("never exposes any returned amount while the policy is disabled", () => {
    expect(resolveStorefrontPricePresentation(false, 99999)).toEqual({ visible: false });
  });

  it.each([undefined, null, "true", 1, false])(
    "fails closed for a non-true visibility policy (%s)",
    (policy) => {
      expect(resolveStorefrontPricePresentation(policy, 1250)).toEqual({ visible: false });
    },
  );

  it("suppresses the catalog zero sentinel even if the separately fetched setting says enabled", () => {
    expect(resolveStorefrontPricePresentation(true, 0)).toEqual({ visible: false });
  });

  it("renders the exact server amount when the setting is explicitly enabled", () => {
    expect(resolveStorefrontPricePresentation(true, 1234.5)).toEqual({
      visible: true,
      amount: 1234.5,
    });
  });

  it("does not coerce strings or display invalid, negative, or non-finite amounts", () => {
    for (const amount of [null, undefined, "1234", Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(resolveStorefrontPricePresentation(true, amount)).toEqual({ visible: false });
    }
  });

  it("requires the explicit public setting before showing a customer price tier", () => {
    expect(isCustomerTierVisible(true)).toBe(true);
    for (const policy of [false, undefined, null, "true", 1]) {
      expect(isCustomerTierVisible(policy)).toBe(false);
    }
  });
});

describe("server-computed cart/order pricing presentation guard", () => {
  const validPayload = {
    visible: true,
    surface: "cart",
    items: [{
      product_id: "product-1",
      name: "صنف",
      quantity: 2,
      unit_price: 1234,
      line_total: 2468,
    }],
    item_count: 1,
    currency: "YER",
    total_amount: 2468,
    customer_tier_visible: true,
    customer_tier_label: "الجملة",
  };

  it("preserves server-priced lines and totals without recalculation", () => {
    expect(resolveCustomerOrderPricingPresentation(true, validPayload)).toEqual({
      visible: true,
      items: validPayload.items,
      totalAmount: 2468,
      currency: "YER",
      customerTierVisible: true,
      customerTierLabel: "الجملة",
    });
  });

  it("hides all financial output if the client policy is disabled, even if a stale payload says visible", () => {
    expect(resolveCustomerOrderPricingPresentation(false, validPayload)).toEqual({ visible: false });
  });

  it("does not pass through financial keys from a server-hidden response", () => {
    const hiddenPayload = {
      visible: false,
      total_amount: 2468,
      items: [{ unit_price: 1234, line_total: 2468 }],
    };
    const result = resolveCustomerOrderPricingPresentation(true, hiddenPayload);
    expect(result).toEqual({ visible: false });
    expect(Object.hasOwn(result, "items")).toBe(false);
    expect(Object.hasOwn(result, "totalAmount")).toBe(false);
  });

  it("fails closed if a visible response is missing a server-priced line amount or total", () => {
    expect(resolveCustomerOrderPricingPresentation(true, {
      ...validPayload,
      items: [{ product_id: "product-1", quantity: 2, unit_price: 1234 }],
    })).toEqual({ visible: false });

    const { total_amount: _totalAmount, ...withoutTotal } = validPayload;
    expect(resolveCustomerOrderPricingPresentation(true, withoutTotal)).toEqual({ visible: false });
  });

  it("fails closed for empty, missing, or inconsistent server line counts", () => {
    expect(resolveCustomerOrderPricingPresentation(true, {
      ...validPayload,
      items: [],
      item_count: 0,
    })).toEqual({ visible: false });

    expect(resolveCustomerOrderPricingPresentation(true, {
      ...validPayload,
      item_count: 2,
    })).toEqual({ visible: false });
  });

  it("fails closed for incomplete product identity/quantity and duplicate product lines", () => {
    for (const line of [
      { name: "صنف", quantity: 2, unit_price: 1234, line_total: 2468 },
      { product_id: "product-1", name: " ", quantity: 2, unit_price: 1234, line_total: 2468 },
      { product_id: "product-1", name: "صنف", quantity: "2", unit_price: 1234, line_total: 2468 },
      { product_id: "product-1", name: "صنف", quantity: 0, unit_price: 1234, line_total: 2468 },
    ]) {
      expect(resolveCustomerOrderPricingPresentation(true, {
        ...validPayload,
        items: [line],
        item_count: 1,
      })).toEqual({ visible: false });
    }

    expect(resolveCustomerOrderPricingPresentation(true, {
      ...validPayload,
      items: [validPayload.items[0], validPayload.items[0]],
      item_count: 2,
    })).toEqual({ visible: false });
  });

  it("requires a supported preview surface and valid currency, and can reject a stale surface response", () => {
    expect(resolveCustomerOrderPricingPresentation(true, {
      ...validPayload,
      surface: "invoice",
    })).toEqual({ visible: false });

    expect(resolveCustomerOrderPricingPresentation(true, {
      ...validPayload,
      currency: "YER ",
    })).toEqual({ visible: false });

    expect(resolveCustomerOrderPricingPresentation(true, validPayload, "orders")).toEqual({ visible: false });
    expect(resolveCustomerOrderPricingPresentation(true, validPayload, "cart").visible).toBe(true);
  });

  it("does not infer a hidden customer tier from the returned label alone", () => {
    const payload = { ...validPayload, customer_tier_visible: false, customer_tier_label: null };
    const result = resolveCustomerOrderPricingPresentation(true, payload);
    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.customerTierVisible).toBe(false);
      expect("customerTierLabel" in result).toBe(false);
    }
  });
});
