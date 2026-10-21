export type CustomerReturnReason = "damaged" | "wrong_item" | "missing_item" | "quality" | "other";
export type CustomerReturnRequestStatus = "submitted" | "under_review" | "approved" | "rejected" | "received" | "closed" | "cancelled";

export interface ReturnableOrderItem {
  order_item_id: string;
  item_code: string | null;
  product_name: string;
  unit: string | null;
  ordered_quantity: number;
  already_requested_quantity: number;
  remaining_quantity: number;
}

export interface CustomerReturnRequestItem {
  order_item_id: string;
  item_code: string | null;
  product_name: string;
  unit: string | null;
  requested_quantity: number;
}

export interface CustomerReturnRequestRecord {
  id: string;
  request_number: string;
  status: CustomerReturnRequestStatus;
  reason: CustomerReturnReason;
  notes: string | null;
  review_note: string | null;
  created_at: string;
  items: CustomerReturnRequestItem[];
}

export interface CustomerReturnSummary {
  order_status: string;
  requests: CustomerReturnRequestRecord[];
  returnable_items: ReturnableOrderItem[];
}

export interface CustomerReturnLineInput {
  order_item_id: string;
  quantity: number;
}

const reasons = new Set<CustomerReturnReason>(["damaged", "wrong_item", "missing_item", "quality", "other"]);
const statuses = new Set<CustomerReturnRequestStatus>(["submitted", "under_review", "approved", "rejected", "received", "closed", "cancelled"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("بيانات المرتجع غير مكتملة: " + field);
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function finiteNonNegative(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < 0) throw new Error("قيمة غير صالحة في بيانات المرتجع: " + field);
  return number;
}

export function readCustomerReturnSummary(value: unknown): CustomerReturnSummary {
  if (!isRecord(value) || !Array.isArray(value.requests) || !Array.isArray(value.returnable_items)) {
    throw new Error("أعاد الخادم ملخص مرتجعات غير صالح.");
  }
  const orderStatus = requiredText(value.order_status, "order_status");
  const requests = value.requests.map((entry): CustomerReturnRequestRecord => {
    if (!isRecord(entry) || !Array.isArray(entry.items)) throw new Error("سجل طلب مرتجع غير صالح.");
    const status = requiredText(entry.status, "status") as CustomerReturnRequestStatus;
    const reason = requiredText(entry.reason, "reason") as CustomerReturnReason;
    if (!statuses.has(status) || !reasons.has(reason)) throw new Error("حالة أو سبب المرتجع غير معتمد.");
    const items = entry.items.map((line): CustomerReturnRequestItem => {
      if (!isRecord(line)) throw new Error("سطر مرتجع غير صالح.");
      return {
        order_item_id: requiredText(line.order_item_id, "order_item_id"),
        item_code: nullableText(line.item_code),
        product_name: requiredText(line.product_name, "product_name"),
        unit: nullableText(line.unit),
        requested_quantity: finiteNonNegative(line.requested_quantity, "requested_quantity"),
      };
    });
    return {
      id: requiredText(entry.id, "id"),
      request_number: requiredText(entry.request_number, "request_number"),
      status,
      reason,
      notes: nullableText(entry.notes),
      review_note: nullableText(entry.review_note),
      created_at: requiredText(entry.created_at, "created_at"),
      items,
    };
  });
  const returnableItems = value.returnable_items.map((entry): ReturnableOrderItem => {
    if (!isRecord(entry)) throw new Error("بيانات كمية مرتجعة غير صالحة.");
    return {
      order_item_id: requiredText(entry.order_item_id, "order_item_id"),
      item_code: nullableText(entry.item_code),
      product_name: requiredText(entry.product_name, "product_name"),
      unit: nullableText(entry.unit),
      ordered_quantity: finiteNonNegative(entry.ordered_quantity, "ordered_quantity"),
      already_requested_quantity: finiteNonNegative(entry.already_requested_quantity, "already_requested_quantity"),
      remaining_quantity: finiteNonNegative(entry.remaining_quantity, "remaining_quantity"),
    };
  });
  return { order_status: orderStatus, requests, returnable_items: returnableItems };
}

export function buildCustomerReturnLines(
  drafts: Readonly<Record<string, string>>,
  items: readonly ReturnableOrderItem[],
): CustomerReturnLineInput[] {
  const byId = new Map(items.map((item) => [item.order_item_id, item]));
  const lines: CustomerReturnLineInput[] = [];
  for (const [orderItemId, rawQuantity] of Object.entries(drafts)) {
    if (!rawQuantity.trim()) continue;
    const item = byId.get(orderItemId);
    const quantity = Number(rawQuantity);
    if (!item || item.remaining_quantity <= 0) throw new Error("لا توجد كمية متاحة للإرجاع لهذا الصنف.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("أدخل كمية إرجاع موجبة لكل صنف تختاره.");
    if (Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-8) {
      throw new Error("كمية الإرجاع تقبل حتى ثلاث منازل عشرية.");
    }
    if (quantity - item.remaining_quantity > 1e-9) {
      throw new Error("كمية الإرجاع تتجاوز الكمية المتاحة للصنف: " + item.product_name);
    }
    lines.push({ order_item_id: orderItemId, quantity: Math.round(quantity * 1000) / 1000 });
  }
  if (lines.length === 0) throw new Error("حدد صنفًا واحدًا وكمية الإرجاع قبل الإرسال.");
  if (lines.length > 100) throw new Error("لا يمكن إرسال أكثر من 100 صنف في طلب واحد.");
  return lines;
}

export function createReturnIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "return-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 24);
}

export function readReturnMutationResult(value: unknown): { request_id: string; request_number: string; status: CustomerReturnRequestStatus; idempotent_replay: boolean } {
  if (!isRecord(value)) throw new Error("لم يرجع الخادم نتيجة صالحة لطلب الإرجاع.");
  const status = requiredText(value.status, "status") as CustomerReturnRequestStatus;
  if (!statuses.has(status)) throw new Error("حالة طلب الإرجاع التي أعادها الخادم غير معتمدة.");
  if (typeof value.idempotent_replay !== "boolean") throw new Error("نتيجة تكرار طلب الإرجاع غير مكتملة.");
  return {
    request_id: requiredText(value.request_id, "request_id"),
    request_number: requiredText(value.request_number, "request_number"),
    status,
    idempotent_replay: value.idempotent_replay,
  };
}
