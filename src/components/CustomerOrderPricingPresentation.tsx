import type { ReactNode } from "react";
import { resolveCustomerOrderPricingPresentation } from "@/lib/storefront-price-visibility";

export type CustomerOrderPricingPresentationProps = {
  /** Use show_price_in_cart or show_price_in_orders from public server settings. */
  policyValue: unknown;
  /** Exact RPC payload from preview_customer_order_pricing; never client-calculated. */
  serverPayload: unknown;
  expectedSurface: "cart" | "orders";
  title?: ReactNode;
  className?: string;
};

function formatServerAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ar-YE", {
      style: "currency",
      currency,
      maximumFractionDigits: 3,
    }).format(amount);
  } catch {
    // The resolver already requires a bounded ISO-style code. Keep the raw source
    // value visible with its code rather than silently relabeling it as Yemeni rial.
    return `${new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(amount)} ${currency}`;
  }
}

/**
 * Fail-closed renderer for the cart and order-review surfaces.
 * It consumes only server-priced payload fields whitelisted by the resolver and
 * never derives line totals, customer tier, or order totals in the browser.
 */
export function CustomerOrderPricingPresentation({
  policyValue,
  serverPayload,
  expectedSurface,
  title = "ملخص الأسعار",
  className = "sf-order-pricing",
}: CustomerOrderPricingPresentationProps) {
  const presentation = resolveCustomerOrderPricingPresentation(
    policyValue,
    serverPayload,
    expectedSurface,
  );

  if (!presentation.visible) return null;

  return (
    <section className={className} aria-label={title}>
      {presentation.customerTierVisible && presentation.customerTierLabel ? (
        <p className="sf-order-pricing-tier">
          فئة العميل: <strong>{presentation.customerTierLabel}</strong>
        </p>
      ) : null}
      <ul className="sf-order-pricing-lines">
        {presentation.items.map((line) => (
          <li key={line.product_id}>
            <span className="sf-order-pricing-item">
              {line.name} × {line.quantity}
            </span>
            <span className="sf-order-pricing-unit">
              سعر الوحدة: {formatServerAmount(line.unit_price, presentation.currency ?? "YER")}
            </span>
            <span className="sf-order-pricing-line-total">
              {formatServerAmount(line.line_total, presentation.currency ?? "YER")}
            </span>
          </li>
        ))}
      </ul>
      <div className="sf-order-pricing-total">
        <span>الإجمالي</span>
        <strong>{formatServerAmount(presentation.totalAmount, presentation.currency ?? "YER")}</strong>
      </div>
    </section>
  );
}
