const CUSTOMER_PAYMENT_METHODS = new Set(["cash", "transfer", "card", "other"]);

/**
 * Validate the customer-payment form before invoking the authoritative server RPC.
 * The database transaction remains responsible for invoice state, tenant scope and outstanding balance.
 */
export function validateCustomerPaymentInput(
  rawAmount: string,
  method: string,
  reference: string,
  notes: string,
): number {
  const amount = rawAmount.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount)) {
    throw new Error("أدخل مبلغًا موجبًا وبحد أقصى منزلتين عشريتين.");
  }
  const value = Number(amount);
  const minorUnits = Math.round(value * 100);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(minorUnits)) {
    throw new Error("مبلغ الدفعة خارج نطاق الدقة الآمنة.");
  }
  if (!CUSTOMER_PAYMENT_METHODS.has(method)) {
    throw new Error("طريقة الدفع غير مسموحة.");
  }
  if (reference.length > 200) throw new Error("مرجع العملية طويل جدًا.");
  if (notes.length > 1000) throw new Error("الملاحظات تتجاوز الحد المسموح.");
  return value;
}
