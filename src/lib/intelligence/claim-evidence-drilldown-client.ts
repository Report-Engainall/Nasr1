import { supabase } from "@/lib/supabase";
import type { EvidenceRecord } from "./types";

type JsonScalar = string | number | null;
export type ClaimEvidenceRow = Record<string, JsonScalar>;
export type ClaimEvidenceDrilldownStatus =
  | "READY"
  | "NOT_FOUND"
  | "UNSUPPORTED"
  | "DENIED"
  | "UNAVAILABLE"
  | "ERROR";

export interface ClaimEvidenceDrilldownResult {
  status: ClaimEvidenceDrilldownStatus;
  rows: ClaimEvidenceRow[];
  hasMore: boolean;
  nextOffset: number | null;
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sourceFields: Record<string, readonly string[]> = {
  customer_invoices: ["invoiceStatus", "issuedAt", "dueAt", "totalAmount", "currency"],
  customer_payments: ["paidAt", "amount", "currency"],
  "inventory.current_balances": ["quantityAvailable", "reorderPoint", "unit", "warehouseCount", "lastUpdatedAt"],
  "inventory.movement_history": ["movementType", "quantity", "balanceAfter", "occurredAt"],
  "orders.completed_sales_quantity": ["quantity", "orderStatus", "occurredAt"],
  purchase_receipt_items: ["receiptNumber", "receivedAt", "quantityReceived", "unit", "batchNumber", "expiryDate"],
  purchase_supplier_invoices: [
    "supplierInvoiceNumber", "invoiceDate", "currency", "invoiceTotalAmount", "matchStatus", "createdAt",
  ],
  purchase_supplier_invoice_due_dates: [
    "supplierInvoiceNumber", "invoiceDate", "currency", "invoiceTotalAmount", "matchStatus", "dueDate", "recordedAt",
  ],
  supplier_payment_open_receipts: ["receiptNumber", "receiptDate", "outstandingPayable", "currency"],
  cash_expense_commitments: [
    "category", "description", "amount", "currency", "paymentMethod", "dueDate", "status", "createdAt",
    "approvedAt", "approvalReason", "paymentRecordedAt", "settledAt",
  ],
  cash_expense_commitment_evidence: ["fileName", "mimeType", "byteSize", "contentSha256", "createdAt"],
  finance_cash_account_evidence: [
    "evidenceKind", "fileName", "mimeType", "byteSize", "contentSha256", "createdAt",
  ],
  finance_cash_opening_balance_reviews: [
    "asOfDate", "openingBalance", "currency", "decision", "reviewReason", "postedGlBalance",
    "postedGlLineCount", "reviewedAt",
  ],
};

export const claimEvidenceFieldLabels: Record<string, string> = {
  invoiceStatus: "حالة الفاتورة",
  issuedAt: "تاريخ الإصدار",
  dueAt: "تاريخ الاستحقاق",
  totalAmount: "إجمالي الفاتورة",
  currency: "العملة",
  paidAt: "تاريخ الدفع",
  amount: "المبلغ",
  quantityAvailable: "الكمية المتاحة",
  reorderPoint: "حد إعادة الطلب",
  unit: "وحدة القياس",
  warehouseCount: "عدد المستودعات المشمولة",
  lastUpdatedAt: "آخر تحديث للرصيد",
  movementType: "نوع الحركة",
  quantity: "كمية الحركة",
  balanceAfter: "الرصيد بعد الحركة",
  occurredAt: "وقت الحركة",
  orderStatus: "حالة الطلب",
  receiptNumber: "رقم سند الاستلام",
  receivedAt: "تاريخ الاستلام",
  quantityReceived: "الكمية المستلمة",
  batchNumber: "رقم التشغيلة",
  expiryDate: "تاريخ الصلاحية",
  supplierInvoiceNumber: "رقم فاتورة المورد",
  createdAt: "تاريخ الإنشاء",
  invoiceDate: "تاريخ فاتورة المورد",
  invoiceTotalAmount: "إجمالي فاتورة المورد",
  matchStatus: "حالة المطابقة",
  dueDate: "تاريخ الاستحقاق",
  recordedAt: "تاريخ تسجيل الاستحقاق",
  receiptDate: "تاريخ سند المورد",
  outstandingPayable: "المبلغ المتبقي للمورد",
  category: "التصنيف",
  description: "الوصف",
  paymentMethod: "وسيلة الدفع",
  status: "الحالة",

  approvedAt: "تاريخ الاعتماد",
  approvalReason: "سبب الاعتماد",
  paymentRecordedAt: "تاريخ تسجيل الدفع",
  settledAt: "تاريخ التسوية",
  fileName: "اسم المستند",
  mimeType: "نوع الملف",
  byteSize: "حجم الملف بالبايت",
  contentSha256: "بصمة SHA-256 للمستند",
  evidenceKind: "نوع الإثبات",
  asOfDate: "تاريخ الرصيد الافتتاحي",
  openingBalance: "الرصيد الافتتاحي",
  decision: "قرار المراجعة",
  reviewReason: "سبب المراجعة",
  postedGlBalance: "رصيد الأستاذ المرحّل",
  postedGlLineCount: "عدد سطور الأستاذ المرحّلة",
  reviewedAt: "تاريخ المراجعة",
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}

function periodMatches(value: unknown, expected: EvidenceRecord["period"]): boolean {
  if (expected === null) return value === null || value === undefined;
  const raw = object(value);
  return Boolean(raw && raw.from === expected.from && raw.to === expected.to);
}

function parseRows(value: unknown, sourceName: string): ClaimEvidenceRow[] | null {
  const allowed = sourceFields[sourceName];
  if (!allowed || !Array.isArray(value) || value.length > 50) return null;
  const allowedKeys = new Set(allowed);
  const rows: ClaimEvidenceRow[] = [];
  for (const item of value) {
    const raw = object(item);
    if (!raw) return null;
    const entries = Object.entries(raw);
    if (entries.length === 0 || entries.some(([key, field]) =>
      !allowedKeys.has(key) ||
      !(field === null || typeof field === "string" || (typeof field === "number" && Number.isFinite(field))) ||
      (typeof field === "string" && field.length > 800)
    )) return null;
    const row: ClaimEvidenceRow = {};
    for (const [key, field] of entries) row[key] = field as JsonScalar;
    rows.push(row);
  }
  return rows;
}

export function supportsClaimEvidenceDrilldown(sourceName: string): boolean {
  return Object.prototype.hasOwnProperty.call(sourceFields, sourceName);
}

export function parseClaimEvidenceDrilldownResponse(
  value: unknown,
  record: EvidenceRecord,
  requestedOffset: number,
): ClaimEvidenceDrilldownResult | null {
  const raw = object(value);
  const authorization = object(raw?.authorization);
  if (
    !raw ||
    !authorization ||
    authorization.tenantScope !== "SERVER_RESOLVED_AUTHENTICATED_TENANT" ||
    (authorization.effectiveRole !== "admin" && authorization.effectiveRole !== "manager") ||
    raw.sideEffects !== "NONE" ||
    raw.sourceName !== record.source.name ||
    !isIsoTimestamp(raw.asOf) ||
    Date.parse(raw.asOf) !== Date.parse(record.asOf) ||
    !periodMatches(raw.period, record.period) ||
    typeof raw.hasMore !== "boolean"
  ) return null;

  const status = raw.status;
  if (status === "UNSUPPORTED") {
    return {
      status: "UNSUPPORTED", rows: [], hasMore: false, nextOffset: null,
      message: "هذا المصدر لا يوفّر تفصيلاً آمناً ضمن عقد القراءة الحالي.",
    };
  }
  if (status === "NOT_FOUND") {
    if (!Array.isArray(raw.rows) || raw.rows.length !== 0 || raw.hasMore) return null;
    return {
      status: "NOT_FOUND", rows: [], hasMore: false, nextOffset: null,
      message: "لم يُعثر على سجل مطابق داخل المؤسسة ووقت اللقطة المحددين.",
    };
  }
  if (status !== "OK") return null;

  const rows = parseRows(raw.rows, record.source.name);
  if (!rows || rows.length === 0) return null;
  const nextOffset = raw.nextOffset;
  if (raw.hasMore) {
    if (!Number.isInteger(nextOffset) || nextOffset !== requestedOffset + 50 || rows.length !== 50) return null;
  } else if (nextOffset !== null) {
    return null;
  }
  return {
    status: "READY",
    rows,
    hasMore: raw.hasMore,
    nextOffset: raw.hasMore ? nextOffset as number : null,
    message: "",
  };
}

function errorCode(error: unknown): string | null {
  const code = object(error)?.code;
  return typeof code === "string" ? code : null;
}

export async function fetchClaimEvidenceDrilldown(
  source: EvidenceRecord,
  offset = 0,
): Promise<ClaimEvidenceDrilldownResult> {
  if (
    !supportsClaimEvidenceDrilldown(source.source.name) ||
    !source.source.recordId ||
    !UUID.test(source.source.recordId) ||
    !isIsoTimestamp(source.asOf) ||
    !Number.isInteger(offset) || offset < 0 || offset > 10000
  ) {
    return {
      status: "UNSUPPORTED", rows: [], hasMore: false, nextOffset: null,
      message: "لا يوجد عقد قراءة آمن لهذا المرجع أو أن معرّفه غير صالح.",
    };
  }

  try {
    const { data, error } = await supabase.rpc("fetch_claim_evidence_drilldown", {
      p_source_name: source.source.name,
      p_record_id: source.source.recordId,
      p_period_from: source.period?.from ?? null,
      p_period_to: source.period?.to ?? null,
      p_as_of: source.asOf,
      p_offset: offset,
    });
    if (error) {
      const code = errorCode(error);
      if (code === "42501") {
        return {
          status: "DENIED", rows: [], hasMore: false, nextOffset: null,
          message: "رفض الخادم قراءة الأدلة لهذه الصلاحية؛ لم تُعرض أي بيانات.",
        };
      }
      if (code === "22023") {
        return {
          status: "ERROR", rows: [], hasMore: false, nextOffset: null,
          message: "رفض الخادم نطاق طلب تفاصيل الدليل.",
        };
      }
      return {
        status: "UNAVAILABLE", rows: [], hasMore: false, nextOffset: null,
        message: "خدمة تفاصيل الأدلة غير متاحة؛ لم تُعرض بيانات بديلة.",
      };
    }
    const parsed = parseClaimEvidenceDrilldownResponse(data, source, offset);
    return parsed ?? {
      status: "ERROR", rows: [], hasMore: false, nextOffset: null,
      message: "استجابة المصدر غير مطابقة لقائمة الحقول أو نطاق اللقطة؛ أُوقف عرضها.",
    };
  } catch {
    return {
      status: "UNAVAILABLE", rows: [], hasMore: false, nextOffset: null,
      message: "تعذر الاتصال بخدمة تفاصيل الأدلة؛ لم تُعرض بيانات بديلة.",
    };
  }
}
