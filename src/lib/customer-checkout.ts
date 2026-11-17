export type CustomerCheckoutIdentity = {
  isStaff: boolean;
  roles: readonly string[];
} | null | undefined;

const DEFINITIVE_REJECTION_CODES = new Set([
  "42501",
  "28000",
  "22023",
  "23502",
  "23503",
  "23514",
  "P0001",
  "PGRST202",
]);

/** Customer checkout is separate from staff/admin order-management authority. */
export function canUseCustomerCheckout(user: CustomerCheckoutIdentity): boolean {
  return Boolean(user && !user.isStaff && user.roles.includes("customer"));
}

function readErrorField(error: unknown, field: "status" | "code"): unknown {
  if (typeof error !== "object" || error === null || Array.isArray(error)) return undefined;
  return (error as Record<string, unknown>)[field];
}

export function isCustomerAuthorizationRejection(error: unknown): boolean {
  const rawStatus = readErrorField(error, "status");
  const status = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);
  const code = readErrorField(error, "code");
  return status === 401 || status === 403 || code === "42501" || code === "28000";
}

/**
 * Only known, transaction-rolled-back client/business rejections may release an
 * idempotency key. Timeouts, 5xx responses, rate limits and 409 replay conflicts
 * remain ambiguous and must retain the original key.
 */
export function isDefinitiveCustomerOrderRejection(error: unknown): boolean {
  const rawStatus = readErrorField(error, "status");
  const status = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);
  if (Number.isInteger(status) && [400, 401, 403, 404, 405, 415, 422, 425].includes(status)) {
    return true;
  }
  const code = readErrorField(error, "code");
  return typeof code === "string" && DEFINITIVE_REJECTION_CODES.has(code);
}

export function customerOrderRejectionMessage(error: unknown): string {
  if (isCustomerAuthorizationRejection(error)) {
    return "رفض الخادم الطلب لأن الحساب الحالي لا يملك عضوية عميل معتمدة أو صلاحية إنشاء الطلب. لم يُنشأ أي طلب. استخدم حساب عميل معتمد أو اطلب من الإدارة اعتماد عضوية الشراء.";
  }
  const code = readErrorField(error, "code");
  if (code === "22023" || code === "23502" || code === "23503" || code === "23514") {
    return "رفض الخادم بيانات الطلب أو أحد أصنافه. لم يُنشأ الطلب؛ راجع الكميات والأصناف وعنوان التوصيل ثم أعد المعاينة.";
  }
  return "رفض الخادم الطلب قبل اعتماده. لم يُنشأ طلب؛ راجع البيانات ثم أعد المحاولة.";
}
