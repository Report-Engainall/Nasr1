export type CustomerQuotePrintSource = {
  quote_number: string;
  status: string;
  notes: string | null;
  response_note: string | null;
  created_at: string;
  quoted_at: string | null;
  valid_until: string | null;
};
export type CustomerQuotePrintLineSource = {
  item_code: string | null;
  product_name_snapshot: string;
  unit_snapshot: string | null;
  requested_quantity: number | string;
  quoted_unit_price: number | string | null;
};
export type CustomerQuotePrintItem = {
  itemCode: string | null;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};
export type CustomerQuotePrintDocument = {
  quoteNumber: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  quotedAt: string | null;
  validUntil: string | null;
  customerNote: string | null;
  responseNote: string | null;
  items: CustomerQuotePrintItem[];
  totalAmount: number;
};
const STATUS_LABELS: Record<string, string> = {
  quoted: "تم التسعير",
  accepted: "مقبول من العميل",
  rejected: "مرفوض",
  expired: "منتهي الصلاحية",
};
function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
/** Customer-owned, RLS-scoped quote document. Only a saved, fully priced quote is printable. */
export function projectCustomerQuotePrintDocument(
  quote: CustomerQuotePrintSource,
  lines: readonly CustomerQuotePrintLineSource[],
): CustomerQuotePrintDocument | null {
  if (!["quoted", "accepted", "rejected", "expired"].includes(quote.status) || !lines.length) return null;
  const items: CustomerQuotePrintItem[] = [];
  for (const line of lines) {
    const quantity = finiteNumber(line.requested_quantity);
    const unitPrice = finiteNumber(line.quoted_unit_price);
    const productName = textOrNull(line.product_name_snapshot);
    if (quantity === null || unitPrice === null || productName === null) return null;
    items.push({
      itemCode: textOrNull(line.item_code),
      productName,
      unit: textOrNull(line.unit_snapshot),
      quantity,
      unitPrice,
      lineTotal: quantity * unitPrice,
    });
  }
  return {
    quoteNumber: textOrNull(quote.quote_number) ?? "غير مسجل",
    status: quote.status,
    statusLabel: STATUS_LABELS[quote.status],
    createdAt: quote.created_at,
    quotedAt: textOrNull(quote.quoted_at),
    validUntil: textOrNull(quote.valid_until),
    customerNote: textOrNull(quote.notes),
    responseNote: textOrNull(quote.response_note),
    items,
    totalAmount: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}
