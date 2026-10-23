import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StorefrontPricePresentation } from "@/components/StorefrontPricePresentation";

function renderPrice(props: {
  policyValue: unknown;
  serverUnitPrice: unknown;
  className?: string;
  unitLabel?: string;
}): string {
  return renderToStaticMarkup(createElement(StorefrontPricePresentation, props));
}

describe("StorefrontPricePresentation rendered output", () => {
  it("renders the unchanged server price only under an explicit enabled policy", () => {
    const html = renderPrice({
      policyValue: true,
      serverUnitPrice: 1234.5,
      unitLabel: "لكل كرتون",
    });

    expect(html).toContain('class="sf-product-price"');
    expect(html).toContain("ر.ي");
    expect(html).toContain("لكل كرتون");
  });

  it("renders no price markup when the policy is disabled", () => {
    expect(renderPrice({ policyValue: false, serverUnitPrice: 1234.5 })).toBe("");
  });

  it.each([undefined, null, "true", 1, "enabled"])(
    "renders no price markup for missing or malformed policy values (%s)",
    (policyValue) => {
      expect(renderPrice({ policyValue, serverUnitPrice: 1234.5 })).toBe("");
    },
  );

  it("never renders the catalog zero sentinel, even if a stale setting says enabled", () => {
    expect(renderPrice({ policyValue: true, serverUnitPrice: 0 })).toBe("");
  });

  it.each([undefined, null, "1234.5", Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "renders no price markup for invalid server amounts (%s)",
    (serverUnitPrice) => {
      expect(renderPrice({ policyValue: true, serverUnitPrice })).toBe("");
    },
  );

  it("supports the existing detail-price styling without changing the visibility guard", () => {
    const html = renderPrice({
      policyValue: true,
      serverUnitPrice: 2000,
      className: "sf-detail-price",
    });

    expect(html).toContain('class="sf-detail-price"');
    expect(html).toContain("ر.ي");
  });
});
