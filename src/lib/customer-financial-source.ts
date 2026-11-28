import { supabase } from "@/lib/supabase";
export type CustomerFinancialSourceMode = "APP_ONLY" | "ONYX" | "MUTAKAMEL";
export type CustomerFinancialSourceStatus = "active" | "suspended";
export type CustomerFinancialSource = {
  source_mode: CustomerFinancialSourceMode;
  source_status: CustomerFinancialSourceStatus;
  source_as_of: string | null;
  last_synced_at: string | null;
  verified_at: string | null;
  revision: number;
  is_stale: boolean;
  can_read_app_ledger: boolean;
  external_account_ref?: string | null;
  company_external_ref?: string | null;
  branch_external_ref?: string | null;
};
function parseExternalReference(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("مرجع النظام الخارجي غير صالح في " + field + ".");
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maxLength || normalized.includes("://") || normalized.includes("@")) {
    throw new Error("مرجع النظام الخارجي غير آمن في " + field + ".");
  }
  return normalized;
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function parseTimestamp(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("عقد مصدر الحساب يحتوي تاريخًا غير صالح في " + field + ".");
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match) throw new Error("عقد مصدر الحساب يحتوي طابعًا زمنيًا غير صالح في " + field + ".");
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]), hour = Number(match[4]);
  const offsetHour = match[9] ? Number(match[9]) : 0;
  const offsetMinute = match[10] ? Number(match[10]) : 0;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 ||
      offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0) ||
      !Number.isFinite(Date.parse(value))) {
    throw new Error("عقد مصدر الحساب يحتوي تاريخًا خارج النطاق في " + field + ".");
  }
  return value;
}
export function parseCustomerFinancialSource(value: unknown): CustomerFinancialSource {
  const row = asRecord(value);
  if (!row) throw new Error("لم يُرجع الخادم مصدرًا ماليًا صالحًا للحساب.");
  const mode = row.source_mode, status = row.source_status;
  if ((mode !== "APP_ONLY" && mode !== "ONYX" && mode !== "MUTAKAMEL") ||
      (status !== "active" && status !== "suspended") ||
      typeof row.is_stale !== "boolean" || typeof row.can_read_app_ledger !== "boolean" ||
      typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error("لم تطابق استجابة مصدر الحساب العقد المالي المعتمد.");
  }
  const sourceAsOf = parseTimestamp(row.source_as_of, "source_as_of");
  const lastSyncedAt = parseTimestamp(row.last_synced_at, "last_synced_at");
  const verifiedAt = parseTimestamp(row.verified_at, "verified_at");
  const expectedAppLedgerAccess = mode === "APP_ONLY" && status === "active" && !row.is_stale;
  if ((mode !== "APP_ONLY" && sourceAsOf === null) || (mode === "APP_ONLY" && row.is_stale) ||
      row.can_read_app_ledger !== expectedAppLedgerAccess) {
    throw new Error("تعارضت صلاحية قراءة دفتر العميل مع مصدره المالي؛ أوقف عرض البيانات.");
  }
  return {
    source_mode: mode, source_status: status, source_as_of: sourceAsOf,
    last_synced_at: lastSyncedAt, verified_at: verifiedAt, revision: row.revision,
    is_stale: row.is_stale, can_read_app_ledger: row.can_read_app_ledger,
  };
}
export function canReadCustomerAppLedger(source: CustomerFinancialSource | null): boolean {
  return Boolean(source && source.source_mode === "APP_ONLY" && source.source_status === "active" &&
    !source.is_stale && source.can_read_app_ledger);
}
export async function fetchMyCustomerFinancialSource(): Promise<CustomerFinancialSource> {
  const { data, error } = await supabase.rpc("get_my_customer_financial_source");
  if (error) throw new Error("تعذر التحقق من مصدر الحساب المالي؛ أوقفنا عرض الفواتير والدفعات حتى يتأكد الخادم من المصدر المعتمد.");
  return parseCustomerFinancialSource(data);
}


export async function fetchStaffCustomerFinancialSource(customerId: string): Promise<CustomerFinancialSource> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
    throw new Error("معرف العميل غير صالح للتحقق من مصدر الحساب المالي.");
  }
  const { data, error } = await supabase.rpc("get_customer_financial_source_for_staff", {
    p_customer_id: customerId,
  });
  if (error) {
    throw new Error("تعذر التحقق من مصدر العميل المالي؛ أوقفنا تسجيل الدفعة المحلية حتى يثبت الخادم مصدر الحساب.");
  }
  const row = asRecord(data);
  if (!row) throw new Error("لم يُرجع الخادم مصدرًا ماليًا صالحًا للعميل.");
  if (row.customer_id !== customerId) {
    throw new Error("لم يطابق مصدر الحساب هوية العميل المحدد؛ أوقفنا تسجيل الدفعة.");
  }
  const canReadAppLedger = row.source_mode === "APP_ONLY" &&
    row.source_status === "active" && row.is_stale === false;
  const source = parseCustomerFinancialSource({
    ...row,
    can_read_app_ledger: canReadAppLedger,
  });
  const externalAccountRef = parseExternalReference(row.external_account_ref, "external_account_ref", 160);
  const companyExternalRef = parseExternalReference(row.company_external_ref, "company_external_ref", 256);
  const branchExternalRef = parseExternalReference(row.branch_external_ref, "branch_external_ref", 256);
  if (source.source_mode !== "APP_ONLY" && (!externalAccountRef || !companyExternalRef || !branchExternalRef)) {
    throw new Error("نطاق ربط ERP غير مكتمل؛ يجب تحديد حساب العميل والشركة والفرع معًا.");
  }
  return {
    ...source,
    external_account_ref: externalAccountRef,
    company_external_ref: companyExternalRef,
    branch_external_ref: branchExternalRef,
  };
}


/**
 * Bind one customer ledger response to the same server-selected financial-source
 * revision that authorized its request. Revisions are monotonic across cutovers.
 */
export function isSameCustomerFinancialSourceVersion(
  expected: CustomerFinancialSource,
  actual: CustomerFinancialSource,
): boolean {
  return expected.revision === actual.revision &&
    expected.source_mode === actual.source_mode &&
    expected.source_status === actual.source_status &&
    expected.is_stale === actual.is_stale &&
    expected.can_read_app_ledger === actual.can_read_app_ledger;
}

/**
 * Re-read the server-owned customer source immediately before a document
 * leaves the page. The caller must not export when this snapshot differs.
 */
export async function revalidateMyCustomerFinancialSource(
  expected: CustomerFinancialSource,
): Promise<{ source: CustomerFinancialSource; unchanged: boolean }> {
  const source = await fetchMyCustomerFinancialSource();
  return {
    source,
    unchanged: canReadCustomerAppLedger(source) &&
      isSameCustomerFinancialSourceVersion(expected, source),
  };
}
