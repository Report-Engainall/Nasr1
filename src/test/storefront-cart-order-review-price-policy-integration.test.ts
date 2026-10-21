import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const storefront = readFileSync(join(process.cwd(), "src/components/Storefront.tsx"), "utf8");
const visibilityControls = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020040000_customer_price_visibility_controls.sql"),
  "utf8",
);
const visibilityHelper = readFileSync(
  join(process.cwd(), "src/lib/storefront-price-visibility.ts"),
  "utf8",
);

describe("storefront cart and pre-submit order-review price policy wiring", () => {
  it("mounts the server-priced preview in the actual cart branch using show_price_in_cart", () => {
    const cartBranch = storefront.slice(storefront.indexOf("{view === 'cart' &&"), storefront.indexOf("{view === 'checkout' &&"));
    expect(storefront).toMatch(/import\s+\{\s*CustomerOrderPricingPreview\s*\}\s+from\s+["']@\/components\/CustomerOrderPricingPreview["'];/);
    expect(cartBranch).toContain("<CustomerOrderPricingPreview");
    expect(cartBranch).toContain("policyValue={settings?.show_price_in_cart}");
    expect(cartBranch).toContain('surface="cart"');
  });

  it("mounts a server-priced preview in Checkout using show_price_in_orders, not catalog totals", () => {
    const checkoutBranch = storefront.slice(storefront.indexOf("function Checkout("));
    expect(storefront).toContain("priceVisibilityPolicy={settings?.show_price_in_orders}");
    expect(checkoutBranch).toContain("<CustomerOrderPricingPreview");
    expect(checkoutBranch).toContain("policyValue={priceVisibilityPolicy}");
    expect(checkoutBranch).toContain('surface="orders"');
    expect(checkoutBranch).not.toContain("unit_price: item.product.display_price");
  });

  it("retains a source-side visibility gate for the configured public surfaces and a complete server-price schema", () => {
    expect(visibilityControls).toContain("'show_price_in_cart', false");
    expect(visibilityControls).toContain("'show_price_in_orders', false");
    expect(visibilityControls).toContain("'show_price_on_cards', true");
    expect(visibilityControls).toContain("public.preview_customer_order_pricing");
    expect(visibilityControls).toContain("v_setting_key := CASE p_surface WHEN 'cart' THEN 'show_price_in_cart' ELSE 'show_price_in_orders' END");
    expect(visibilityHelper).toContain("payload.visible !== true");
    expect(visibilityHelper).toContain("payload.surface !== expectedSurface");
  });
});
