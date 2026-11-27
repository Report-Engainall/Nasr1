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

export type ErpReadSyncPreviewRecord = {
  externalId: string;
  sourceUpdatedAt: string;
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
function parsePreview(value: unknown): ErpReadSyncPreview | null {
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
  const records = value.records.map((item): ErpReadSyncPreviewRecord => {
    if (!isRecord(item) || typeof item.externalId !== "string" || !item.externalId.trim() ||
        typeof item.sourceUpdatedAt !== "string" || !Number.isFinite(Date.parse(item.sourceUpdatedAt)) ||
        !isRecord(item.fields)) {
      throw new Error("أحد سجلات معاينة ERP غير صالح.");
    }
    const fields: Record<string, string | number | boolean | null> = {};
    for (const [key, fieldValue] of Object.entries(item.fields)) {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) ||
          !(fieldValue === null || typeof fieldValue === "string" || typeof fieldValue === "boolean" ||
            (typeof fieldValue === "number" && Number.isFinite(fieldValue)))) {
        throw new Error("معاينة ERP تحتوي حقلًا خارج الإسقاط الآمن.");
      }
      fields[key] = fieldValue;
    }
    return { externalId: item.externalId, sourceUpdatedAt: item.sourceUpdatedAt, fields };
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

export function parseErpReadSyncResult(value: unknown): ErpReadSyncResult {
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
    preview: parsePreview(value.preview),
    preview_error: value.preview_error === null ? null :
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
  return parseErpReadSyncResult(data);
}
