/**
 * Client presentation guards for the server-owned storefront price/privacy contract.
 *
 * These helpers never calculate prices. A price is displayable only when the exact
 * server policy value is boolean true and the RPC returned a finite numeric amount.
 * Order previews additionally require the server's explicit visible=true response
 * and complete server-priced lines; hidden/malformed payloads carry no amounts out.
 */

export type StorefrontPricePresentation =
  | { visible: false }
  | { visible: true; amount: number };

type ServerPricedLine = Record<string, unknown> & {
  unit_price: number;
  line_total: number;
};

export type CustomerOrderPricingPresentation =
  | { visible: false }
  | {
      visible: true;
      items: readonly ServerPricedLine[];
      totalAmount: number;
      currency?: string;
      customerTierVisible: boolean;
      customerTierLabel?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * A disabled price policy always suppresses the RPC's zero sentinel. Missing,
 * malformed, or unknown policy values fail closed. The server amount is preserved;
 * no client-side price fallback or computation is allowed here.
 */
export function resolveStorefrontPricePresentation(
  policyValue: unknown,
  serverUnitPrice: unknown,
): StorefrontPricePresentation {
  // A catalog zero is the hidden-price sentinel. Suppress it unconditionally,
  // including if a separately fetched policy setting is stale or disagrees.
  if (
    policyValue !== true
    || !isFiniteNonNegativeAmount(serverUnitPrice)
    || serverUnitPrice === 0
  ) {
    return { visible: false };
  }

  return { visible: true, amount: serverUnitPrice };
}

/** Only an explicit server/public-settings boolean enables the customer tier label. */
export function isCustomerTierVisible(policyValue: unknown): boolean {
  return policyValue === true;
}

function isServerPricedLine(value: unknown): value is ServerPricedLine {
  return isRecord(value)
    && isFiniteNonNegativeAmount(value.unit_price)
    && isFiniteNonNegativeAmount(value.line_total);
}

/**
 * Maps a server preview into a safe presentation contract. This rejects client-hidden
 * responses even if unexpected financial keys are present, rejects incomplete visible
 * responses, and returns source amounts unchanged (never recomputed by the browser).
 */
export function resolveCustomerOrderPricingPresentation(
  policyValue: unknown,
  payload: unknown,
): CustomerOrderPricingPresentation {
  if (
    policyValue !== true
    || !isRecord(payload)
    || payload.visible !== true
    || !Array.isArray(payload.items)
    || !isFiniteNonNegativeAmount(payload.total_amount)
    || !payload.items.every(isServerPricedLine)
  ) {
    return { visible: false };
  }

  const customerTierLabel =
    typeof payload.customer_tier_label === "string" && payload.customer_tier_label.trim()
      ? payload.customer_tier_label
      : undefined;

  return {
    visible: true,
    items: payload.items,
    totalAmount: payload.total_amount,
    ...(typeof payload.currency === "string" ? { currency: payload.currency } : {}),
    customerTierVisible: payload.customer_tier_visible === true && customerTierLabel !== undefined,
    ...(payload.customer_tier_visible === true && customerTierLabel !== undefined
      ? { customerTierLabel }
      : {}),
  };
}
