import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerOrderPricingPresentation } from "@/components/CustomerOrderPricingPresentation";

const validPayload = {
  visible: true,
  surface: "cart",
  items: [{
    product_id: "product-1",
    name: "صنف تجريبي",
    quantity: 2,
    unit_price: 1234,
    line_total: 2468,
    base_price: 99999,
    unit_cost: 1,
    margin: 90,
    tenant_id: "foreign-tenant",
  }],
  item_count: 1,
  currency: "YER",
  total_amount: 2468,
  customer_tier_visible: true,
  customer_tier_label: "الجملة",
};

function renderPricing(props: {
  policyValue: unknown;
  serverPayload: unknown;
  expectedSurface: "cart" | "orders";
}): string {
  return renderToStaticMarkup(createElement(CustomerOrderPricingPresentation, props));
}

describe("CustomerOrderPricingPresentation rendered output", () => {
  it("renders server-priced lines and total without client recomputation under explicit policy", () => {
    const html = renderPricing({
      policyValue: true,
      serverPayload: validPayload,
      expectedSurface: "cart",
    });

    expect(html).toContain('class="sf-order-pricing"');
    expect(html).toContain("صنف تجريبي");
    expect(html).toContain("سعر الوحدة");
    expect(html).toContain("الإجمالي");
    expect(html).toContain("الجملة");
    expect(html).not.toContain("99999");
    expect(html).not.toContain("foreign-tenant");
  });

  it("renders no price or totals when the matching visibility policy is disabled", () => {
    expect(renderPricing({
      policyValue: false,
      serverPayload: validPayload,
      expectedSurface: "cart",
    })).toBe("");
  });

  it.each([undefined, null, "true", 1, "enabled"])(
    "fails closed for a missing or malformed policy (%s)",
    (policyValue) => {
      expect(renderPricing({
        policyValue,
        serverPayload: validPayload,
        expectedSurface: "cart",
      })).toBe("");
    },
  );

  it("renders nothing for hidden, malformed, incomplete, or wrong-surface server payloads", () => {
    const invalidPayloads = [
      { ...validPayload, visible: false, total_amount: 2468 },
      { ...validPayload, items: [{ product_id: "product-1", quantity: 2 }] },
      { ...validPayload, item_count: 0 },
      { ...validPayload, currency: "YER " },
      { ...validPayload, surface: "invoice" },
    ];

    for (const serverPayload of invalidPayloads) {
      expect(renderPricing({
        policyValue: true,
        serverPayload,
        expectedSurface: "cart",
      })).toBe("");
    }
  });

  it("rejects a stale preview for another surface", () => {
    expect(renderPricing({
      policyValue: true,
      serverPayload: validPayload,
      expectedSurface: "orders",
    })).toBe("");
  });

  it("does not display the customer tier when the server tier flag is false", () => {
    const payload = {
      ...validPayload,
      customer_tier_visible: false,
      customer_tier_label: "الجملة",
    };
    const html = renderPricing({
      policyValue: true,
      serverPayload: payload,
      expectedSurface: "cart",
    });

    expect(html).toContain("الإجمالي");
    expect(html).not.toContain("فئة العميل");
  });
});
