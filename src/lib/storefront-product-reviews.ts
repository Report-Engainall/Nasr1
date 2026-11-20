import { supabase } from "@/lib/supabase";

export type ProductReviewModerationStatus = "pending" | "approved" | "rejected";

export interface StorefrontProductReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  verifiedPurchase: true;
}

export interface StorefrontProductReviewSummary {
  averageRating: number;
  reviewCount: number;
  items: StorefrontProductReview[];
  hasMore: boolean;
}

export interface CustomerProductReviewDraft {
  id: string;
  rating: number;
  title: string;
  body: string;
  status: ProductReviewModerationStatus;
  moderationNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProductReviewContext {
  eligible: boolean;
  orderItemId: string | null;
  orderNumber: string | null;
  deliveredAt: string | null;
  review: CustomerProductReviewDraft | null;
}

export interface PendingProductReview {
  id: string;
  productId: string;
  productName: string;
  itemCode: string;
  orderNumber: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResult> };
const rpcClient = supabase as unknown as RpcClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("استجابة التقييمات تفتقد الحقل " + field);
  return value;
}

function boundedString(value: unknown, maximum: number, field: string): string {
  if (typeof value !== "string" || value.length > maximum) throw new Error("استجابة التقييمات غير صالحة في الحقل " + field);
  return value;
}

function validRating(value: unknown): number {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("أعاد الخادم درجة تقييم غير صالحة.");
  return rating;
}

function validTimestamp(value: unknown, field: string): string {
  const timestamp = requiredString(value, field);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("أعاد الخادم تاريخاً غير صالح في " + field);
  return timestamp;
}

function reviewStatus(value: unknown): ProductReviewModerationStatus {
  if (value !== "pending" && value !== "approved" && value !== "rejected") {
    throw new Error("أعاد الخادم حالة مراجعة غير معروفة.");
  }
  return value;
}

/** Parse only the public allow-list; customer/order/tenant identifiers are discarded. */
export function normalizeStorefrontProductReviewSummary(value: unknown): StorefrontProductReviewSummary {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("تعذر قراءة ملخص تقييمات المنتج.");
  const averageRating = Number(value.average_rating);
  const reviewCount = Number(value.review_count);
  if (!Number.isFinite(averageRating) || averageRating < 0 || averageRating > 5 ||
      !Number.isSafeInteger(reviewCount) || reviewCount < 0 || typeof value.has_more !== "boolean") {
    throw new Error("أعاد الخادم ملخص تقييمات غير صالح.");
  }
  const items = value.items.map((entry): StorefrontProductReview => {
    if (!isRecord(entry) || entry.verified_purchase !== true) throw new Error("رفض التطبيق عرض تقييم غير موثق.");
    return {
      id: requiredString(entry.id, "review.id"),
      rating: validRating(entry.rating),
      title: boundedString(entry.title, 100, "review.title"),
      body: boundedString(entry.body, 1500, "review.body"),
      createdAt: validTimestamp(entry.created_at, "review.created_at"),
      verifiedPurchase: true,
    };
  });
  return { averageRating, reviewCount, items, hasMore: value.has_more };
}

export function normalizeCustomerProductReviewContext(value: unknown): CustomerProductReviewContext {
  if (!isRecord(value) || typeof value.eligible !== "boolean") {
    throw new Error("تعذر قراءة أهلية تقييم المنتج.");
  }
  let review: CustomerProductReviewDraft | null = null;
  if (value.review !== null && value.review !== undefined) {
    if (!isRecord(value.review)) throw new Error("أعاد الخادم مسودة تقييم غير صالحة.");
    review = {
      id: requiredString(value.review.id, "review.id"),
      rating: validRating(value.review.rating),
      title: boundedString(value.review.title, 100, "review.title"),
      body: boundedString(value.review.body, 1500, "review.body"),
      status: reviewStatus(value.review.moderation_status),
      moderationNote: value.review.moderation_note === null || value.review.moderation_note === undefined
        ? null : boundedString(value.review.moderation_note, 500, "review.moderation_note"),
      createdAt: validTimestamp(value.review.created_at, "review.created_at"),
      updatedAt: validTimestamp(value.review.updated_at, "review.updated_at"),
    };
  }
  return {
    eligible: value.eligible,
    orderItemId: typeof value.order_item_id === "string" && UUID_PATTERN.test(value.order_item_id)
      ? value.order_item_id : null,
    orderNumber: typeof value.order_number === "string" ? value.order_number : null,
    deliveredAt: typeof value.delivered_at === "string" ? value.delivered_at : null,
    review,
  };
}

function normalizePendingReview(value: unknown): PendingProductReview {
  if (!isRecord(value)) throw new Error("أعاد الخادم عنصراً غير صالح في قائمة التقييمات.");
  return {
    id: requiredString(value.id, "queue.id"),
    productId: requiredString(value.product_id, "queue.product_id"),
    productName: boundedString(value.product_name, 200, "queue.product_name"),
    itemCode: boundedString(value.item_code, 100, "queue.item_code"),
    orderNumber: boundedString(value.order_number, 100, "queue.order_number"),
    rating: validRating(value.rating),
    title: boundedString(value.title, 100, "queue.title"),
    body: boundedString(value.body, 1500, "queue.body"),
    createdAt: validTimestamp(value.created_at, "queue.created_at"),
  };
}

async function callRpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw new Error(error.message || "تعذر تنفيذ عملية تقييم المنتج.");
  return data;
}

export async function fetchStorefrontProductReviews(
  productId: string,
  limit = 8,
  offset = 0,
): Promise<StorefrontProductReviewSummary> {
  if (!UUID_PATTERN.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  const data = await callRpc("get_storefront_product_reviews", {
    p_product_id: productId,
    p_limit: limit,
    p_offset: offset,
  });
  return normalizeStorefrontProductReviewSummary(data);
}

export async function fetchCustomerProductReviewContext(productId: string): Promise<CustomerProductReviewContext> {
  if (!UUID_PATTERN.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  return normalizeCustomerProductReviewContext(await callRpc("get_customer_product_review_context", {
    p_product_id: productId,
  }));
}

export async function submitStorefrontProductReview(input: {
  productId: string;
  orderItemId: string;
  rating: number;
  title: string;
  body: string;
}): Promise<{ id: string; moderationStatus: "pending"; message: string }> {
  if (!UUID_PATTERN.test(input.productId) || !UUID_PATTERN.test(input.orderItemId)) {
    throw new Error("تعذر ربط التقييم بعملية شراء موثقة.");
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("اختر تقييماً من نجمة إلى خمس نجوم.");
  }
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length > 100 || body.length < 10 || body.length > 1500) {
    throw new Error("اكتب وصفاً من 10 إلى 1500 حرف، وعنواناً لا يتجاوز 100 حرف.");
  }
  const data = await callRpc("submit_storefront_product_review", {
    p_product_id: input.productId,
    p_order_item_id: input.orderItemId,
    p_rating: input.rating,
    p_title: title,
    p_body: body,
  });
  if (!isRecord(data) || !UUID_PATTERN.test(String(data.id ?? "")) || data.moderation_status !== "pending") {
    throw new Error("لم يؤكد الخادم حفظ التقييم للمراجعة.");
  }
  return {
    id: String(data.id),
    moderationStatus: "pending",
    message: typeof data.message === "string" ? data.message : "تم إرسال التقييم للمراجعة قبل النشر.",
  };
}

export async function fetchPendingStorefrontProductReviews(limit = 50): Promise<PendingProductReview[]> {
  const data = await callRpc("list_pending_storefront_product_reviews", { p_limit: limit });
  if (!Array.isArray(data)) throw new Error("أعاد الخادم قائمة مراجعة غير صالحة.");
  return data.map(normalizePendingReview);
}

export async function moderateStorefrontProductReview(input: {
  reviewId: string;
  decision: "approve" | "reject";
  note?: string;
}): Promise<{ id: string; status: "approved" | "rejected" }> {
  if (!UUID_PATTERN.test(input.reviewId)) throw new Error("معرّف التقييم غير صالح.");
  const note = (input.note ?? "").trim();
  if (input.decision === "reject" && !note) throw new Error("اكتب سبب رفض التقييم.");
  const data = await callRpc("moderate_storefront_product_review", {
    p_review_id: input.reviewId,
    p_decision: input.decision,
    p_note: note,
  });
  if (!isRecord(data) || data.id !== input.reviewId ||
      (data.moderation_status !== "approved" && data.moderation_status !== "rejected")) {
    throw new Error("لم يؤكد الخادم قرار مراجعة التقييم.");
  }
  return { id: input.reviewId, status: data.moderation_status };
}
