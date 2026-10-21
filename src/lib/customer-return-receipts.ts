export interface CustomerReturnReceiptLine {
  request_item_id: string;
  product_id: string | null;
  item_code: string | null;
  product_name: string;
  unit: string | null;
  requested_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
}

export interface CustomerReturnReceiptRequest {
  id: string;
  request_number: string;
  order_number: string;
  customer_name: string;
  created_at: string;
  items: CustomerReturnReceiptLine[];
}

export interface CustomerReturnReceiptWarehouse {
  id: string;
  name: string;
  code: string | null;
}

export interface CustomerReturnReceiptQueue {
  warehouses: CustomerReturnReceiptWarehouse[];
  requests: CustomerReturnReceiptRequest[];
}

export interface CustomerReturnReceiptDraft {
  received_quantity: string;
  restockable_quantity: string;
}

export interface CustomerReturnReceiptLineInput {
  request_item_id: string;
  received_quantity: number;
  restockable_quantity: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("بيانات استلام المرتجع غير مكتملة: " + field);
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function decimalQuantity(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999999999999.999 ||
      Math.abs(parsed * 1000 - Math.round(parsed * 1000)) > 1e-7) {
    throw new Error("كمية غير صالحة في " + field + "؛ استخدم حتى ثلاث منازل عشرية.");
  }
  return Math.round(parsed * 1000) / 1000;
}

export function readCustomerReturnReceiptQueue(value: unknown): CustomerReturnReceiptQueue {
  if (!isRecord(value) || !Array.isArray(value.warehouses) || !Array.isArray(value.requests)) {
    throw new Error("أعاد الخادم قائمة استلام مرتجعات غير صالحة.");
  }
  const warehouses = value.warehouses.map((entry): CustomerReturnReceiptWarehouse => {
    if (!isRecord(entry)) throw new Error("بيانات مخزن الاستلام غير صالحة.");
    return {
      id: requiredText(entry.id, "warehouse.id"),
      name: requiredText(entry.name, "warehouse.name"),
      code: nullableText(entry.code),
    };
  });
  const requests = value.requests.map((entry): CustomerReturnReceiptRequest => {
    if (!isRecord(entry) || !Array.isArray(entry.items)) throw new Error("سجل طلب مرتجع للاستلام غير صالح.");
    const items = entry.items.map((line): CustomerReturnReceiptLine => {
      if (!isRecord(line)) throw new Error("سطر استلام مرتجع غير صالح.");
      const requested = decimalQuantity(line.requested_quantity, "requested_quantity");
      const received = decimalQuantity(line.received_quantity, "received_quantity");
      const remaining = decimalQuantity(line.remaining_quantity, "remaining_quantity");
      if (remaining <= 0 || Math.abs(requested - received - remaining) > 0.0011) {
        throw new Error("رصيد الكمية المتبقية للاستلام غير متسق.");
      }
      return {
        request_item_id: requiredText(line.request_item_id, "request_item_id"),
        product_id: nullableText(line.product_id),
        item_code: nullableText(line.item_code),
        product_name: requiredText(line.product_name, "product_name"),
        unit: nullableText(line.unit),
        requested_quantity: requested,
        received_quantity: received,
        remaining_quantity: remaining,
      };
    });
    return {
      id: requiredText(entry.id, "request.id"),
      request_number: requiredText(entry.request_number, "request_number"),
      order_number: requiredText(entry.order_number, "order_number"),
      customer_name: requiredText(entry.customer_name, "customer_name"),
      created_at: requiredText(entry.created_at, "created_at"),
      items,
    };
  });
  return { warehouses, requests };
}

export function buildCustomerReturnReceiptLines(
  drafts: Readonly<Record<string, CustomerReturnReceiptDraft>>,
  items: readonly CustomerReturnReceiptLine[],
): CustomerReturnReceiptLineInput[] {
  const byId = new Map(items.map((item) => [item.request_item_id, item]));
  const lines: CustomerReturnReceiptLineInput[] = [];
  for (const [requestItemId, draft] of Object.entries(drafts)) {
    if (!draft?.received_quantity?.trim()) continue;
    const item = byId.get(requestItemId);
    if (!item || item.remaining_quantity <= 0) {
      throw new Error("لا توجد كمية متبقية للاستلام لهذا الصنف.");
    }
    if (!draft.restockable_quantity?.trim()) {
      throw new Error("حدد الكمية الصالحة لإعادة المخزون بعد الفحص؛ والباقي يسجل تالفًا.");
    }
    const received = decimalQuantity(draft.received_quantity, "الكمية المستلمة");
    const restockable = decimalQuantity(draft.restockable_quantity, "الكمية الصالحة للمخزون");
    if (received <= 0) throw new Error("الكمية المستلمة يجب أن تكون أكبر من صفر.");
    if (received - item.remaining_quantity > 1e-7) {
      throw new Error("الكمية المستلمة تتجاوز المتبقي المعتمد للصنف: " + item.product_name);
    }
    if (restockable > received) {
      throw new Error("الكمية الصالحة للمخزون لا يمكن أن تتجاوز الكمية المستلمة.");
    }
    if (restockable > 0 && !item.product_id) {
      throw new Error("لا يمكن إرجاع الصنف للمخزون قبل ربطه بمنتج فعلي: " + item.product_name);
    }
    lines.push({
      request_item_id: requestItemId,
      received_quantity: received,
      restockable_quantity: restockable,
    });
  }
  if (!lines.length) throw new Error("أدخل كمية مستلمة لصنف واحد على الأقل.");
  if (lines.length > 100) throw new Error("لا يمكن استلام أكثر من 100 صنف في عملية واحدة.");
  return lines;
}

export function createReturnReceiptIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "return-receipt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 24);
}

export function readReturnReceiptMutationResult(value: unknown): {
  receipt_id: string;
  receipt_number: string;
  request_status: "approved" | "received";
  received_line_count: number;
  received_quantity: number;
  restockable_quantity: number;
  defective_quantity: number;
  idempotent_replay: boolean;
} {
  if (!isRecord(value)) throw new Error("لم يرجع الخادم نتيجة صالحة لاستلام المرتجع.");
  const status = requiredText(value.request_status, "request_status");
  if (status !== "approved" && status !== "received") throw new Error("حالة طلب المرتجع بعد الاستلام غير متوقعة.");
  const lineCount = value.received_line_count;
  if (typeof lineCount !== "number" || !Number.isInteger(lineCount) || lineCount < 1 || lineCount > 100) {
    throw new Error("عدد بنود الاستلام الذي أعاده الخادم غير صالح.");
  }
  if (typeof value.idempotent_replay !== "boolean") throw new Error("نتيجة تكرار الاستلام غير مكتملة.");
  return {
    receipt_id: requiredText(value.receipt_id, "receipt_id"),
    receipt_number: requiredText(value.receipt_number, "receipt_number"),
    request_status: status,
    received_line_count: lineCount,
    received_quantity: decimalQuantity(value.received_quantity, "received_quantity"),
    restockable_quantity: decimalQuantity(value.restockable_quantity, "restockable_quantity"),
    defective_quantity: decimalQuantity(value.defective_quantity, "defective_quantity"),
    idempotent_replay: value.idempotent_replay,
  };
}
