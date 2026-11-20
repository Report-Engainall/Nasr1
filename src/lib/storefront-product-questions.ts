import { supabase } from "@/lib/supabase";

export type StorefrontProductQuestionStatus = "pending" | "answered" | "rejected";

export interface StorefrontProductQuestion {
  id: string;
  questionText: string;
  answerText: string;
  verifiedPurchase: boolean;
  createdAt: string;
  answeredAt: string;
}

export interface StorefrontProductQuestionSummary {
  questionCount: number;
  items: StorefrontProductQuestion[];
  hasMore: boolean;
}

export interface CustomerProductQuestion {
  id: string;
  questionText: string;
  answerText: string | null;
  status: StorefrontProductQuestionStatus;
  moderationNote: string | null;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
}

export interface PendingProductQuestion {
  id: string;
  productId: string;
  productName: string;
  itemCode: string;
  questionText: string;
  verifiedPurchase: boolean;
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
  if (typeof value !== "string" || value.length === 0) throw new Error("استجابة أسئلة المنتج تفتقد الحقل " + field);
  return value;
}
function boundedString(value: unknown, maximum: number, field: string): string {
  if (typeof value !== "string" || value.length > maximum) throw new Error("استجابة أسئلة المنتج غير صالحة في الحقل " + field);
  return value;
}
function optionalString(value: unknown, maximum: number, field: string): string | null {
  if (value === null || value === undefined) return null;
  return boundedString(value, maximum, field);
}
function validTimestamp(value: unknown, field: string): string {
  const timestamp = requiredString(value, field);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("أعاد الخادم تاريخاً غير صالح في " + field);
  return timestamp;
}
function questionStatus(value: unknown): StorefrontProductQuestionStatus {
  if (value !== "pending" && value !== "answered" && value !== "rejected") {
    throw new Error("أعاد الخادم حالة سؤال غير معروفة.");
  }
  return value;
}
function verifiedPurchase(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("أعاد الخادم حالة شراء موثّق غير صالحة.");
  return value;
}

export function normalizeStorefrontProductQuestionSummary(value: unknown): StorefrontProductQuestionSummary {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("تعذر قراءة أسئلة المنتج.");
  const questionCount = Number(value.question_count);
  if (!Number.isSafeInteger(questionCount) || questionCount < 0 || typeof value.has_more !== "boolean") {
    throw new Error("أعاد الخادم ملخص أسئلة غير صالح.");
  }
  const items = value.items.map((entry): StorefrontProductQuestion => {
    if (!isRecord(entry)) throw new Error("أعاد الخادم سؤالاً عاماً غير صالح.");
    return {
      id: requiredString(entry.id, "question.id"),
      questionText: boundedString(entry.question_text, 800, "question.question_text"),
      answerText: boundedString(entry.answer_text, 1500, "question.answer_text"),
      verifiedPurchase: verifiedPurchase(entry.verified_purchase),
      createdAt: validTimestamp(entry.created_at, "question.created_at"),
      answeredAt: validTimestamp(entry.answered_at, "question.answered_at"),
    };
  });
  return { questionCount, items, hasMore: value.has_more };
}

export function normalizeCustomerProductQuestions(value: unknown): CustomerProductQuestion[] {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("تعذر قراءة أسئلتك الخاصة.");
  return value.items.map((entry): CustomerProductQuestion => {
    if (!isRecord(entry)) throw new Error("أعاد الخادم سؤالاً خاصاً غير صالح.");
    const status = questionStatus(entry.moderation_status);
    const answerText = optionalString(entry.answer_text, 1500, "question.answer_text");
    const answeredAt = entry.answered_at === null || entry.answered_at === undefined
      ? null : validTimestamp(entry.answered_at, "question.answered_at");
    if ((status === "answered") !== (answerText !== null && answeredAt !== null)) {
      throw new Error("حالة إجابة السؤال لا تتوافق مع بياناته.");
    }
    return {
      id: requiredString(entry.id, "question.id"),
      questionText: boundedString(entry.question_text, 800, "question.question_text"),
      answerText,
      status,
      moderationNote: optionalString(entry.moderation_note, 500, "question.moderation_note"),
      verifiedPurchase: verifiedPurchase(entry.verified_purchase),
      createdAt: validTimestamp(entry.created_at, "question.created_at"),
      updatedAt: validTimestamp(entry.updated_at, "question.updated_at"),
      answeredAt,
    };
  });
}

function normalizePendingQuestion(value: unknown): PendingProductQuestion {
  if (!isRecord(value)) throw new Error("أعاد الخادم عنصراً غير صالح في قائمة أسئلة العملاء.");
  return {
    id: requiredString(value.id, "queue.id"),
    productId: requiredString(value.product_id, "queue.product_id"),
    productName: boundedString(value.product_name, 200, "queue.product_name"),
    itemCode: boundedString(value.item_code, 100, "queue.item_code"),
    questionText: boundedString(value.question_text, 800, "queue.question_text"),
    verifiedPurchase: verifiedPurchase(value.verified_purchase),
    createdAt: validTimestamp(value.created_at, "queue.created_at"),
  };
}

async function callRpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw new Error(error.message || "تعذر تنفيذ عملية سؤال المنتج.");
  return data;
}

export async function fetchStorefrontProductQuestions(
  productId: string,
  limit = 8,
  offset = 0,
): Promise<StorefrontProductQuestionSummary> {
  if (!UUID_PATTERN.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new Error("نطاق تحميل أسئلة المنتج غير صالح.");
  }
  return normalizeStorefrontProductQuestionSummary(await callRpc("get_storefront_product_questions", {
    p_product_id: productId,
    p_limit: limit,
    p_offset: offset,
  }));
}

export async function fetchCustomerProductQuestions(productId: string): Promise<CustomerProductQuestion[]> {
  if (!UUID_PATTERN.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  return normalizeCustomerProductQuestions(await callRpc("get_customer_product_questions_context", {
    p_product_id: productId,
  }));
}

export async function submitStorefrontProductQuestion(input: {
  productId: string;
  questionText: string;
}): Promise<{ id: string; moderationStatus: "pending"; message: string }> {
  if (!UUID_PATTERN.test(input.productId)) throw new Error("معرّف المنتج غير صالح.");
  const questionText = input.questionText.trim();
  if (questionText.length < 10 || questionText.length > 800) {
    throw new Error("اكتب سؤالاً واضحاً من 10 إلى 800 حرف.");
  }
  const data = await callRpc("submit_storefront_product_question", {
    p_product_id: input.productId,
    p_question_text: questionText,
  });
  if (!isRecord(data) || !UUID_PATTERN.test(String(data.id ?? "")) || data.moderation_status !== "pending") {
    throw new Error("لم يؤكد الخادم حفظ السؤال للمراجعة.");
  }
  return {
    id: String(data.id),
    moderationStatus: "pending",
    message: typeof data.message === "string" ? data.message : "تم إرسال سؤالك للمراجعة قبل الإجابة.",
  };
}

export async function fetchPendingStorefrontProductQuestions(limit = 50): Promise<PendingProductQuestion[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("حد قائمة الأسئلة غير صالح.");
  const data = await callRpc("list_pending_storefront_product_questions", { p_limit: limit });
  if (!Array.isArray(data)) throw new Error("أعاد الخادم قائمة أسئلة غير صالحة.");
  return data.map(normalizePendingQuestion);
}

export async function moderateStorefrontProductQuestion(input: {
  questionId: string;
  decision: "answer" | "reject";
  answer?: string;
  note?: string;
}): Promise<{ id: string; status: "answered" | "rejected" }> {
  if (!UUID_PATTERN.test(input.questionId)) throw new Error("معرّف السؤال غير صالح.");
  const answer = (input.answer ?? "").trim();
  const note = (input.note ?? "").trim();
  if (input.decision === "answer" && (answer.length < 5 || answer.length > 1500)) {
    throw new Error("اكتب إجابة من 5 إلى 1500 حرف قبل النشر.");
  }
  if (input.decision === "reject" && (note.length < 5 || note.length > 500)) {
    throw new Error("اكتب سبب رفض من 5 إلى 500 حرف.");
  }
  const data = await callRpc("moderate_storefront_product_question", {
    p_question_id: input.questionId,
    p_decision: input.decision,
    p_answer: answer,
    p_note: note,
  });
  const expected = input.decision === "answer" ? "answered" : "rejected";
  if (!isRecord(data) || data.id !== input.questionId || data.moderation_status !== expected) {
    throw new Error("لم يؤكد الخادم قرار مراجعة السؤال.");
  }
  return { id: input.questionId, status: expected };
}
