import { supabase } from "@/lib/supabase";

export type CustomerReturnReviewStatus = "submitted" | "under_review";
export type CustomerReturnReviewReason = "damaged" | "wrong_item" | "missing_item" | "quality" | "other";
export type CustomerReturnReviewLine = {
  item_code: string | null;
  product_name: string;
  unit: string | null;
  requested_quantity: number;
};
export type CustomerReturnReviewRow = {
  id: string;
  request_number: string;
  status: CustomerReturnReviewStatus;
  reason: CustomerReturnReviewReason;
  notes: string | null;
  created_at: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_code: string;
  items: CustomerReturnReviewLine[];
};
export type CustomerReturnReviewCursor = { created_at: string; id: string };
export type CustomerReturnReviewFilters = {
  search: string;
  status: CustomerReturnReviewStatus | "";
};
export type CustomerReturnReviewPage = {
  items: CustomerReturnReviewRow[];
  totalCount: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor: CustomerReturnReviewCursor | null;
};

export const CUSTOMER_RETURN_REVIEW_PAGE_SIZE = 50;
export const CUSTOMER_RETURN_REVIEW_EXPORT_PAGE_SIZE = 100;
export const CUSTOMER_RETURN_REVIEW_EXPORT_MAX = 1000;
export const CUSTOMER_RETURN_REVIEW_EXPORT_MAX_LINES = 25000;

const REASONS = new Set<CustomerReturnReviewReason>(["damaged", "wrong_item", "missing_item", "quality", "other"]);
const STATUSES = new Set<CustomerReturnReviewStatus>(["submitted", "under_review"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("بيانات قائمة مراجعة المرتجعات غير مكتملة: " + field);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("أعاد الخادم نصًا اختياريًا غير صالح.");
  return value.trim() ? value : null;
}

function validTimestamp(value: unknown): string {
  const timestamp = requiredText(value, "created_at");
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("تاريخ إنشاء طلب المرتجع غير صالح.");
  return timestamp;
}

function readRow(value: unknown): CustomerReturnReviewRow {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("سجل مراجعة مرتجع غير صالح.");
  const status = requiredText(value.status, "status");
  if (!STATUSES.has(status as CustomerReturnReviewStatus)) throw new Error("تتضمن قائمة المراجعة حالة غير متوقعة.");
  const reason = requiredText(value.reason, "reason");
  if (!REASONS.has(reason as CustomerReturnReviewReason)) throw new Error("تتضمن قائمة المراجعة سبب مرتجع غير معتمد.");
  const items = value.items.map((line): CustomerReturnReviewLine => {
    if (!isRecord(line)) throw new Error("تفاصيل صنف المرتجع غير صالحة.");
    const quantity = Number(line.requested_quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("كمية صنف المرتجع غير صالحة.");
    const scaled = Math.round(quantity * 1000);
    if (!Number.isSafeInteger(scaled) || Math.abs(quantity * 1000 - scaled) > 1e-7) {
      throw new Error("كمية صنف المرتجع تتجاوز دقة التخزين المعتمدة.");
    }
    return {
      item_code: nullableText(line.item_code),
      product_name: requiredText(line.product_name, "product_name"),
      unit: nullableText(line.unit),
      requested_quantity: scaled / 1000,
    };
  });
  if (items.length < 1 || items.length > 100) throw new Error("عدد أصناف طلب المرتجع خارج الحدود المعتمدة.");
  return {
    id: requiredText(value.id, "id"),
    request_number: requiredText(value.request_number, "request_number"),
    status: status as CustomerReturnReviewStatus,
    reason: reason as CustomerReturnReviewReason,
    notes: nullableText(value.notes),
    created_at: validTimestamp(value.created_at),
    order_id: requiredText(value.order_id, "order_id"),
    order_number: requiredText(value.order_number, "order_number"),
    customer_name: requiredText(value.customer_name, "customer_name"),
    customer_code: requiredText(value.customer_code, "customer_code"),
    items,
  };
}

function readCursor(value: unknown): CustomerReturnReviewCursor {
  if (!isRecord(value)) throw new Error("مؤشر صفحة مراجعة المرتجعات غير صالح.");
  return {
    created_at: validTimestamp(value.created_at),
    id: requiredText(value.id, "cursor.id"),
  };
}

export function readCustomerReturnReviewPage(value: unknown): CustomerReturnReviewPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("أعاد الخادم صفحة مراجعة مرتجعات غير صالحة.");
  }
  const totalCount = value.total_count;
  const pageSize = value.page_size;
  if (!Number.isSafeInteger(totalCount) || (totalCount as number) < 0) {
    throw new Error("أعاد الخادم عدد نتائج غير صالح لقائمة المرتجعات.");
  }
  if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > CUSTOMER_RETURN_REVIEW_EXPORT_PAGE_SIZE) {
    throw new Error("أعاد الخادم حجم صفحة غير صالح لقائمة المرتجعات.");
  }
  if (typeof value.has_more !== "boolean") throw new Error("حالة استمرار صفحات المرتجعات غير صالحة.");

  const items = value.items.map(readRow);
  if (items.length > (pageSize as number) || items.length > (totalCount as number)) {
    throw new Error("تجاوزت صفحة المرتجعات حدود العدد المعلن من الخادم.");
  }
  const ids = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const row = items[index];
    if (ids.has(row.id)) throw new Error("تكرر طلب مرتجع في الصفحة نفسها.");
    ids.add(row.id);
    if (index > 0) {
      const previous = items[index - 1];
      const previousTime = Date.parse(previous.created_at);
      const currentTime = Date.parse(row.created_at);
      if (currentTime < previousTime || (currentTime === previousTime && row.id <= previous.id)) {
        throw new Error("ترتيب صفحة المرتجعات غير ثابت.");
      }
    }
  }

  const nextCursor = value.next_cursor === null || value.next_cursor === undefined
    ? null
    : readCursor(value.next_cursor);
  if (value.has_more) {
    const last = items[items.length - 1];
    if (!last || !nextCursor || nextCursor.id !== last.id || nextCursor.created_at !== last.created_at) {
      throw new Error("لم يتطابق مؤشر الصفحة التالية مع آخر سجل معروض.");
    }
    if ((totalCount as number) <= items.length) {
      throw new Error("أعلن الخادم عن صفحات إضافية دون وجود نتائج كافية.");
    }
  } else if (nextCursor !== null) {
    throw new Error("أعاد الخادم مؤشرًا إضافيًا رغم اكتمال القائمة.");
  }

  return {
    items,
    totalCount: totalCount as number,
    pageSize: pageSize as number,
    hasMore: value.has_more,
    nextCursor,
  };
}

type ReviewRpcArgs = {
  p_limit: number;
  p_after_created_at: string | null;
  p_after_id: string | null;
  p_search: string | null;
  p_status: CustomerReturnReviewStatus | null;
};

async function callReviewQueueRpc(args: ReviewRpcArgs): Promise<unknown> {
  const client = supabase as unknown as {
    rpc: (functionName: string, parameters: ReviewRpcArgs) =>
      Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const response = await client.rpc("list_customer_return_review_queue_page", args);
  if (response.error) throw new Error(response.error.message || "تعذر تحميل قائمة مراجعة المرتجعات.");
  return response.data;
}

export async function fetchCustomerReturnReviewPage(
  filters: CustomerReturnReviewFilters,
  cursor: CustomerReturnReviewCursor | null,
  pageSize = CUSTOMER_RETURN_REVIEW_PAGE_SIZE,
): Promise<CustomerReturnReviewPage> {
  const search = filters.search.trim();
  if (search.length > 120) throw new Error("يجب ألا يتجاوز البحث 120 حرفًا.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > CUSTOMER_RETURN_REVIEW_EXPORT_PAGE_SIZE) {
    throw new Error("حجم صفحة مراجعة المرتجعات خارج الحدود المسموحة.");
  }
  if (filters.status && !STATUSES.has(filters.status)) throw new Error("حالة تصفية المرتجعات غير معتمدة.");
  const data = await callReviewQueueRpc({
    p_limit: pageSize,
    p_after_created_at: cursor?.created_at ?? null,
    p_after_id: cursor?.id ?? null,
    p_search: search || null,
    p_status: filters.status || null,
  });
  const result = readCustomerReturnReviewPage(data);
  if (cursor && result.items.some((row) => {
    const time = Date.parse(row.created_at);
    const cursorTime = Date.parse(cursor.created_at);
    return time < cursorTime || (time === cursorTime && row.id <= cursor.id);
  })) {
    throw new Error("لم يتقدم سجل المرتجعات بعد مؤشر الصفحة السابق.");
  }
  return result;
}

export async function fetchAllCustomerReturnReviewRows(
  filters: CustomerReturnReviewFilters,
  maxRecords = CUSTOMER_RETURN_REVIEW_EXPORT_MAX,
): Promise<CustomerReturnReviewRow[]> {
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > CUSTOMER_RETURN_REVIEW_EXPORT_MAX) {
    throw new Error("حد تصدير مراجعة المرتجعات غير صالح.");
  }
  const rows: CustomerReturnReviewRow[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let itemLineCount = 0;
  let cursor: CustomerReturnReviewCursor | null = null;
  let expectedTotal: number | null = null;

  for (let pageNumber = 0; pageNumber <= Math.ceil(maxRecords / CUSTOMER_RETURN_REVIEW_EXPORT_PAGE_SIZE); pageNumber += 1) {
    const page = await fetchCustomerReturnReviewPage(filters, cursor, CUSTOMER_RETURN_REVIEW_EXPORT_PAGE_SIZE);
    if (expectedTotal === null) {
      expectedTotal = page.totalCount;
      if (expectedTotal > maxRecords) {
        throw new Error("تتجاوز القائمة " + maxRecords.toLocaleString("ar-YE") + " طلب؛ لم يُنشأ ملف جزئي. استخدم البحث أو تصفية الحالة لتقسيم التصدير.");
      }
    } else if (page.totalCount !== expectedTotal) {
      throw new Error("تغير عدد طلبات المراجعة أثناء التصدير؛ أُوقف إنشاء الملف لتجنب تقرير غير مكتمل. أعد المحاولة.");
    }

    for (const row of page.items) {
      if (seenIds.has(row.id)) throw new Error("تكرر سجل مرتجع بين الصفحات؛ أُوقف التصدير دون إنشاء ملف.");
      seenIds.add(row.id);
      itemLineCount += row.items.length;
      if (itemLineCount > CUSTOMER_RETURN_REVIEW_EXPORT_MAX_LINES) {
        throw new Error("تجاوز التصدير 25000 سطر صنف؛ لم يُنشأ ملف جزئي. قسّم التصدير باستخدام البحث أو الحالة.");
      }
      rows.push(row);
      if (rows.length > maxRecords) throw new Error("تجاوز التصدير الحد الآمن؛ لم يُنشأ ملف جزئي.");
    }

    if (!page.hasMore) {
      if (rows.length !== expectedTotal) {
        throw new Error("لم تكتمل قراءة كل طلبات المراجعة؛ أُوقف التصدير دون إنشاء ملف جزئي. أعد المحاولة.");
      }
      return rows;
    }

    if (!page.nextCursor) throw new Error("فقد مؤشر المتابعة أثناء التصدير؛ لم يُنشأ ملف جزئي.");
    const cursorKey = page.nextCursor.created_at + "|" + page.nextCursor.id;
    if (seenCursors.has(cursorKey)) throw new Error("لم يتقدم مؤشر صفحات المراجعة؛ أُوقف التصدير.");
    seenCursors.add(cursorKey);
    cursor = page.nextCursor;
  }

  throw new Error("تجاوزت قراءة مرتجعات المراجعة عدد الصفحات الآمن؛ لم يُنشأ ملف جزئي.");
}
