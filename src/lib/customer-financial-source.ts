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



export type CustomerFinancialSourceChangeRequestResult = {
  request_id: string | null;
  status: "pending_reconciliation" | "pending_approval" | "approved" | "rejected" | "cancelled" | "unchanged";
  replayed: boolean;
  changed: boolean;
};


export type CustomerFinancialSourceChangeHistoryItem = {
  request_id: string;
  current_source_mode: CustomerFinancialSourceMode;
  target_source_mode: CustomerFinancialSourceMode;
  status: "pending_reconciliation" | "pending_approval" | "approved" | "rejected" | "cancelled";
  reason: string;
  review_reason: string | null;
  expected_binding_revision: number;
  requested_at: string;
  reviewed_at: string | null;
  reconciliation_result: "matched" | "mismatch" | null;
  reconciliation_source_as_of: string | null;
  reconciliation_currency_codes: string[];
  reconciliation_record_counts: Record<string, number>;
};

export type CustomerFinancialSourceChangeHistory = {
  records: CustomerFinancialSourceChangeHistoryItem[];
  total: number;
  limit: number;
};

function parseSourceChangeHistory(value: unknown): CustomerFinancialSourceChangeHistory {
  const row = asRecord(value);
  if (!row || !Array.isArray(row.records) || row.records.length > 20 ||
      typeof row.total !== "number" || !Number.isSafeInteger(row.total) || row.total < row.records.length ||
      typeof row.limit !== "number" || !Number.isSafeInteger(row.limit) || row.limit < 1 || row.limit > 20 ||
      row.records.length > row.limit) {
    throw new Error("استجابة سجل تغييرات مصدر الحساب غير مكتملة أو تجاوزت الحد المسموح.");
  }
  const records = row.records.map((candidate): CustomerFinancialSourceChangeHistoryItem => {
    const item = asRecord(candidate);
    const validMode = (mode: unknown): mode is CustomerFinancialSourceMode =>
      mode === "APP_ONLY" || mode === "ONYX" || mode === "MUTAKAMEL";
    const validStatus = (status: unknown): status is CustomerFinancialSourceChangeHistoryItem["status"] =>
      status === "pending_reconciliation" || status === "pending_approval" ||
      status === "approved" || status === "rejected" || status === "cancelled";
    if (!item ||
        typeof item.request_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.request_id) ||
        !validMode(item.current_source_mode) || !validMode(item.target_source_mode) ||
        !validStatus(item.status) ||
        typeof item.reason !== "string" || item.reason.length < 5 || item.reason.length > 500 ||
        !(item.review_reason === null || typeof item.review_reason === "string" && item.review_reason.length <= 500) ||
        typeof item.expected_binding_revision !== "number" ||
        !Number.isSafeInteger(item.expected_binding_revision) || item.expected_binding_revision < 1) {
      throw new Error("يحتوي سجل تغيير مصدر الحساب على طلب غير صالح.");
    }
    const requestedAt = parseTimestamp(item.requested_at, "requested_at");
    if (!requestedAt) throw new Error("سجل تغيير مصدر الحساب يفتقد وقت الطلب.");
    const reviewedAt = parseTimestamp(item.reviewed_at, "reviewed_at");
    const reconciliationAsOf = parseTimestamp(item.reconciliation_source_as_of, "reconciliation_source_as_of");
    const currencyCodes = item.reconciliation_currency_codes === null ? [] : item.reconciliation_currency_codes;
    if (!(item.reconciliation_result === null || item.reconciliation_result === "matched" || item.reconciliation_result === "mismatch") ||
        !Array.isArray(currencyCodes) ||
        currencyCodes.length > 10 ||
        currencyCodes.some(code => typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) ||
        new Set(currencyCodes).size !== currencyCodes.length) {
      throw new Error("بيانات المطابقة في سجل مصدر الحساب غير صالحة.");
    }
    const counts = item.reconciliation_record_counts === null
      ? {}
      : asRecord(item.reconciliation_record_counts);
    if (!counts || Object.values(counts).some(count =>
      typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)) {
      throw new Error("عدادات المطابقة في سجل مصدر الحساب غير صالحة.");
    }
    return {
      request_id: item.request_id,
      current_source_mode: item.current_source_mode,
      target_source_mode: item.target_source_mode,
      status: item.status,
      reason: item.reason,
      review_reason: item.review_reason as string | null,
      expected_binding_revision: item.expected_binding_revision,
      requested_at: requestedAt,
      reviewed_at: reviewedAt,
      reconciliation_result: item.reconciliation_result as "matched" | "mismatch" | null,
      reconciliation_source_as_of: reconciliationAsOf,
      reconciliation_currency_codes: [...currencyCodes] as string[],
      reconciliation_record_counts: counts as Record<string, number>,
    };
  });
  return { records, total: row.total, limit: row.limit };
}

export async function fetchCustomerFinancialSourceChangeHistory(
  customerId: string,
  limit = 10,
): Promise<CustomerFinancialSourceChangeHistory> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("معرف العميل أو حد سجل تغييرات المصدر غير صالح.");
  }
  const { data, error } = await supabase.rpc("get_customer_financial_source_change_history", {
    p_customer_id: customerId,
    p_limit: limit,
  });
  if (error) {
    throw new Error("تعذر تحميل سجل تغييرات مصدر الحساب. يلزم توفر صلاحية طلب أو اعتماد المصدر المالي.");
  }
  return parseSourceChangeHistory(data);
}

export type CustomerFinancialSourceChangeRequestInput = {
  customerId: string;
  targetSourceMode: CustomerFinancialSourceMode;
  externalAccountRef?: string | null;
  companyExternalRef?: string | null;
  branchExternalRef?: string | null;
  reason: string;
  idempotencyKey: string;
  expectedBindingRevision: number;
};

const requestStatuses = new Set([
  "pending_reconciliation",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
]);

export async function requestCustomerFinancialSourceChange(
  input: CustomerFinancialSourceChangeRequestInput,
): Promise<CustomerFinancialSourceChangeRequestResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.customerId) ||
      !Number.isSafeInteger(input.expectedBindingRevision) || input.expectedBindingRevision < 1 ||
      input.reason.trim().length < 5 || input.reason.trim().length > 500 ||
      input.idempotencyKey.trim().length < 16 || input.idempotencyKey.trim().length > 128 ||
      !["APP_ONLY", "ONYX", "MUTAKAMEL"].includes(input.targetSourceMode)) {
    throw new Error("بيانات طلب تغيير مصدر الحساب غير مكتملة أو غير صالحة.");
  }

  let externalAccountRef: string | null = null;
  let companyExternalRef: string | null = null;
  let branchExternalRef: string | null = null;
  if (input.targetSourceMode === "APP_ONLY") {
    if ([input.externalAccountRef, input.companyExternalRef, input.branchExternalRef]
      .some((value) => typeof value === "string" && value.trim().length > 0)) {
      throw new Error("لا ترسل مراجع ERP عند طلب العودة إلى دفتر التطبيق.");
    }
  } else {
    externalAccountRef = parseExternalReference(input.externalAccountRef, "external_account_ref", 160);
    companyExternalRef = parseExternalReference(input.companyExternalRef, "company_external_ref", 256);
    branchExternalRef = parseExternalReference(input.branchExternalRef, "branch_external_ref", 256);
    if (!externalAccountRef || !companyExternalRef || !branchExternalRef) {
      throw new Error("يتطلب مصدر ERP معرف حساب العميل والشركة والفرع.");
    }
  }

  const { data, error } = await supabase.rpc("request_customer_financial_source_change", {
    p_customer_id: input.customerId,
    p_target_source_mode: input.targetSourceMode,
    p_target_external_account_ref: externalAccountRef,
    p_reason: input.reason.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
    p_expected_binding_revision: input.expectedBindingRevision,
    p_target_company_external_ref: companyExternalRef,
    p_target_branch_external_ref: branchExternalRef,
  });
  if (error) {
    throw new Error("تعذر إنشاء طلب تغيير مصدر الحساب. تحقق من صلاحية طلب التغيير ومن حالة ربط العميل ثم أعد المحاولة.");
  }

  const row = asRecord(data);
  if (!row || typeof row.replayed !== "boolean") {
    throw new Error("استجابة طلب تغيير مصدر الحساب غير صالحة.");
  }
  if (row.changed === false) {
    if (row.source_mode !== input.targetSourceMode ||
        typeof row.revision !== "number" || row.revision !== input.expectedBindingRevision) {
      throw new Error("تغير ربط مصدر الحساب أثناء الطلب؛ أعد تحميل ملف العميل.");
    }
    return { request_id: null, status: "unchanged", replayed: false, changed: false };
  }

  if (typeof row.request_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.request_id) ||
      typeof row.status !== "string" || !requestStatuses.has(row.status)) {
    throw new Error("لم يُرجع الخادم حالة موثوقة لطلب تغيير مصدر الحساب.");
  }
  return {
    request_id: row.request_id,
    status: row.status as CustomerFinancialSourceChangeRequestResult["status"],
    replayed: row.replayed,
    changed: true,
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
