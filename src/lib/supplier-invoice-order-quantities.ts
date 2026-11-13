/**
 * Indexes the ordered quantity by the immutable purchase-order item ID.
 * It deliberately does not match by product ID or name: the invoice evidence line
 * must reference the exact purchase-order item that was received.
 */
export function buildSupplierInvoiceOrderedQuantityIndex(
  orders: readonly { items: readonly { id: string; quantity_ordered: number }[] }[],
): ReadonlyMap<string, string> {
  const quantities = new Map<string, string>();
  for (const order of orders) {
    for (const item of order.items) {
      if (!item.id.trim() || !Number.isFinite(item.quantity_ordered) || item.quantity_ordered < 0) {
        throw new Error("تعذر التحقق من كمية بند أمر الشراء.");
      }
      const quantity = String(item.quantity_ordered);
      const previous = quantities.get(item.id);
      if (previous !== undefined && previous !== quantity) {
        throw new Error("ظهر بند أمر شراء بمعرف مكرر وكمية مختلفة؛ أوقف عرض المطابقة.");
      }
      quantities.set(item.id, quantity);
    }
  }
  return quantities;
}
