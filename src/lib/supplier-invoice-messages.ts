export const SUPPLIER_INVOICE_SERVICE_UNAVAILABLE_MESSAGE =
  "خدمة فواتير الموردين غير متاحة في قاعدة البيانات الحالية. لم تُعرض بيانات بديلة؛ يرجى التواصل مع مسؤول النظام للتحقق من تفعيل وظائف قاعدة البيانات وصلاحياتها.";

export function supplierInvoiceUnavailableMessage(cause: unknown): string {
  const failure = cause && typeof cause === "object" && !Array.isArray(cause)
    ? cause as { code?: unknown; message?: unknown }
    : null;
  const code = typeof failure?.code === "string" ? failure.code : "";
  const message = typeof failure?.message === "string" ? failure.message : "";

  if (
    code === "PGRST202" ||
    code === "42883" ||
    /could not find the function|function .* does not exist/i.test(message)
  ) {
    return SUPPLIER_INVOICE_SERVICE_UNAVAILABLE_MESSAGE;
  }

  return cause instanceof Error ? cause.message : "تعذر تحميل مساحة فواتير الموردين.";
}
