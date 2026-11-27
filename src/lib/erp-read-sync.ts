import { supabase } from "@/lib/supabase";

export type ErpReadSyncProvider = "onyx_pro" | "al_mutakamel";
export type ErpReadSyncObject =
  | "products"
  | "customers"
  | "warehouses"
  | "stock_balances"
  | "product_units"
  | "product_prices"
  | "customer_financial_documents"
  | "customer_payment_receipts"
  | "customer_statement_entries";

export type ErpReadSyncRequest = {
  provider: ErpReadSyncProvider;
  object_type: ErpReadSyncObject;
  company_external_id: string;
  branch_external_id: string;
  warehouse_external_id?: string | null;
  currency_code?: string | null;
  max_pages?: number;
  max_records?: number;
};

export type ErpReadSyncDisposition = "created" | "updated" | "unchanged" | "rejected" | "conflicted";

export type ErpReadSyncPreviewRecord = {
  externalId: string;
  sourceUpdatedAt: string;
  lastDisposition: ErpReadSyncDisposition | null;
  fields: Record<string, string | number | boolean | null>;
};

export type ErpReadSyncPreview = {
  records: ErpReadSyncPreviewRecord[];
  total: number;
  limit: number;
  offset: number;
  checkpointVersion: number;
  pendingWatermark: string | null;
  completedWatermark: string | null;
};

export type ErpReadSyncResult = {
  status: "complete" | "continuation_required";
  pages_committed: number;
  records_read: number;
  counts: {
    created: number;
    updated: number;
    unchanged: number;
    rejected: number;
    conflicted: number;
  };
  preview: ErpReadSyncPreview | null;
  preview_error: string | null;
  checkpoint: {
    version: number;
    has_cursor: boolean;
    pending_watermark: string | null;
    completed_watermark: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error("استجابة مزامنة ERP تحتوي عدادًا غير صالح: " + label);
  return Number(value);
}
function timestamp(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("استجابة مزامنة ERP تحتوي تاريخًا غير صالح: " + label);
  }
  return value;
}
const CLIENT_PREVIEW_FIELDS: Record<ErpReadSyncObject, readonly string[]> = {
  products: ["item_code", "sku", "barcode", "name", "name_en", "description", "category_code", "category_name", "brand_name", "unit_code", "unit_name", "is_active"],
  customers: ["customer_code", "business_name", "phone", "email", "customer_status"],
  warehouses: ["warehouse_code", "warehouse_name", "is_active"],
  stock_balances: ["item_code", "warehouse_code", "quantity_on_hand", "quantity_reserved", "quantity_available"],
  product_units: ["item_code", "unit_code", "base_unit_code", "conversion_factor", "is_base_unit", "is_active"],
  product_prices: ["item_code", "price_list_code", "customer_tier", "currency_code", "unit_code", "unit_price", "minimum_quantity", "discount_percent", "is_active"],
  customer_financial_documents: ["external_customer_id", "document_number", "document_type", "document_status", "issue_date", "due_date", "currency_code", "total_amount", "paid_amount", "outstanding_amount", "reference"],
  customer_payment_receipts: ["external_customer_id", "receipt_number", "receipt_date", "currency_code", "amount", "payment_status", "payment_method", "applied_document_number", "reference"],
  customer_statement_entries: ["external_customer_id", "entry_reference", "entry_date", "due_date", "currency_code", "entry_type", "debit_amount", "credit_amount", "source_document_number", "description"],
};

function parsePreview(value: unknown, objectType: ErpReadSyncObject): ErpReadSyncPreview | null {
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.records)) {
    throw new Error("معاينة سجلات ERP لا تطابق العقد المرحلي.");
  }
  const total = count(value.total, "preview.total");
  const limit = count(value.limit, "preview.limit");
  const offset = count(value.offset, "preview.offset");
  const checkpointVersion = count(value.checkpointVersion, "preview.checkpointVersion");
  if (limit < 1 || limit > 50 || offset > 5000 || value.records.length > limit || value.records.length > total) {
    throw new Error("حدود معاينة سجلات ERP غير صالحة.");
  }
  const allowedFields = new Set(CLIENT_PREVIEW_FIELDS[objectType]);
  const records = value.records.map((item): ErpReadSyncPreviewRecord => {
    if (!isRecord(item) || typeof item.externalId !== "string" || !item.externalId.trim() ||
        typeof item.sourceUpdatedAt !== "string" || !Number.isFinite(Date.parse(item.sourceUpdatedAt)) ||
        !isRecord(item.fields)) {
      throw new Error("أحد سجلات معاينة ERP غير صالح.");
    }
    const disposition = item.lastDisposition;
    if (disposition !== null && disposition !== "created" && disposition !== "updated" &&
        disposition !== "unchanged" && disposition !== "rejected" && disposition !== "conflicted") {
      throw new Error("حالة سجل ERP المرحلي غير معتمدة.");
    }
    const fields: Record<string, string | number | boolean | null> = {};
    for (const [key, fieldValue] of Object.entries(item.fields)) {
      if (!allowedFields.has(key) ||
          !(fieldValue === null || typeof fieldValue === "string" || typeof fieldValue === "boolean" ||
            (typeof fieldValue === "number" && Number.isFinite(fieldValue)))) {
        throw new Error("معاينة ERP تحتوي حقلًا خارج الإسقاط الآمن.");
      }
      fields[key] = fieldValue;
    }
    return { externalId: item.externalId, sourceUpdatedAt: item.sourceUpdatedAt, lastDisposition: disposition, fields };
  });
  return {
    records,
    total,
    limit,
    offset,
    checkpointVersion,
    pendingWatermark: timestamp(value.pendingWatermark, "preview.pendingWatermark"),
    completedWatermark: timestamp(value.completedWatermark, "preview.completedWatermark"),
  };
}

export function parseErpReadSyncResult(value: unknown, objectType: ErpReadSyncObject): ErpReadSyncResult {
  if (!isRecord(value) || (value.status !== "complete" && value.status !== "continuation_required") ||
      !isRecord(value.counts) || !isRecord(value.checkpoint)) {
    throw new Error("استجابة مزامنة ERP لا تطابق عقد القبول.");
  }
  if (typeof value.checkpoint.has_cursor !== "boolean") {
    throw new Error("استجابة مزامنة ERP لا توضح حالة نقطة الاستئناف.");
  }
  return {
    status: value.status,
    pages_committed: count(value.pages_committed, "pages_committed"),
    records_read: count(value.records_read, "records_read"),
    counts: {
      created: count(value.counts.created, "created"),
      updated: count(value.counts.updated, "updated"),
      unchanged: count(value.counts.unchanged, "unchanged"),
      rejected: count(value.counts.rejected, "rejected"),
      conflicted: count(value.counts.conflicted, "conflicted"),
    },
    preview: value.preview === undefined ? null : parsePreview(value.preview, objectType),
    preview_error: value.preview_error === undefined || value.preview_error === null ? null :
      typeof value.preview_error === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value.preview_error)
        ? value.preview_error
        : (() => { throw new Error("رمز خطأ معاينة ERP غير صالح."); })(),
    checkpoint: {
      version: count(value.checkpoint.version, "version"),
      has_cursor: value.checkpoint.has_cursor,
      pending_watermark: timestamp(value.checkpoint.pending_watermark, "pending_watermark"),
      completed_watermark: timestamp(value.checkpoint.completed_watermark, "completed_watermark"),
    },
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  ERP_PROVIDER_NOT_ENABLED: "لم يثبت ترخيص أو تفعيل واجهة ERP؛ أبقينا الاتصال متوقفًا.",
  ERP_PROVIDER_NOT_CONFIGURED: "موصل ERP لم يُهيأ بعد على الخادم بعقد رسمي وبيانات Sandbox.",
  ERP_PROVIDER_TENANT_SCOPE_MISMATCH: "إعداد اتصال ERP غير مربوط بمؤسسة الحساب الحالية.",
  ERP_PROVIDER_SCOPE_NOT_ALLOWED: "الشركة أو الفرع أو المستودع المحدد غير معتمد لهذا الاتصال.",
  ERP_STORE_UNAVAILABLE: "مخزن استئناف المزامنة غير متاح؛ أعد المحاولة بعد استعادة قاعدة البيانات.",
  ERP_CHECKPOINT_CONFLICT: "تغيرت نقطة الاستئناف بواسطة عملية أخرى؛ أعد المحاولة لتحميل الإصدار الأحدث.",
  ERP_STORE_FORBIDDEN: "رفض الخادم صلاحية مخزن مزامنة ERP.",
  ERP_CURSOR_DECRYPT_FAILED: "تعذر التحقق من مؤشر الاستئناف؛ أوقفنا المتابعة لحماية سلامة المزامنة.",
  ERP_SYNC_SERVER_NOT_CONFIGURED: "وظيفة مزامنة ERP غير مهيأة على الخادم.",
};
export function mapErpReadSyncError(code: string | null): string {
  return code ? ERROR_MESSAGES[code] ?? "تعذر إكمال مزامنة القراءة من ERP؛ راجع سجل التكاملات." :
    "تعذر الاتصال بخدمة مزامنة ERP.";
}

async function safeErrorCode(error: unknown): Promise<string | null> {
  if (!isRecord(error) || !(error.context instanceof Response)) return null;
  try {
    const body: unknown = await error.context.clone().json();
    return isRecord(body) && typeof body.error === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(body.error)
      ? body.error
      : null;
  } catch {
    return null;
  }
}

export async function runErpReadSync(input: ErpReadSyncRequest): Promise<ErpReadSyncResult> {
  const { data, error } = await supabase.functions.invoke("erp-read-sync", { body: input });
  if (error) throw new Error(mapErpReadSyncError(await safeErrorCode(error)));
  return parseErpReadSyncResult(data, input.object_type);
}
