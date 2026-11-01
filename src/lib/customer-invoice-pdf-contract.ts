export type CustomerInvoicePdfPayload = {
  invoice: unknown;
  lines: unknown[];
  customer: Record<string, unknown>;
  financial_details_visible: boolean;
  customer_tier_visible: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate the server RPC projection before any invoice data reaches the PDF renderer.
 * Hidden tier data must be absent, not merely hidden by the presentation layer.
 */
export function parseCustomerInvoicePdfPayload(value: unknown): CustomerInvoicePdfPayload | null {
  if (!isRecord(value) || !value.invoice || !Array.isArray(value.lines)) return null;
  if (typeof value.financial_details_visible !== "boolean" ||
      typeof value.customer_tier_visible !== "boolean") return null;

  const customer = isRecord(value.customer) ? value.customer : null;
  if (!customer) return null;

  const tierPayloadValid = value.customer_tier_visible
    ? typeof customer.tier_label === "string" && customer.tier_label.trim().length > 0
    : !Object.prototype.hasOwnProperty.call(customer, "tier_label");

  if (!tierPayloadValid) return null;

  return {
    invoice: value.invoice,
    lines: value.lines,
    customer,
    financial_details_visible: value.financial_details_visible,
    customer_tier_visible: value.customer_tier_visible,
  };
}
