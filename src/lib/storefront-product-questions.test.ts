import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  fetchCustomerProductQuestions,
  fetchPendingStorefrontProductQuestions,
  fetchStorefrontProductQuestions,
  moderateStorefrontProductQuestion,
  normalizeCustomerProductQuestions,
  normalizeStorefrontProductQuestionSummary,
  submitStorefrontProductQuestion,
} from "./storefront-product-questions";

const productId = "a1000000-0000-0000-0000-000000000001";
const questionId = "b1000000-0000-0000-0000-000000000001";
const validQuestion = {
  id: questionId,
  question_text: "هل يناسب الاستخدام اليومي؟",
  answer_text: "نعم، المنتج مناسب للاستخدام اليومي وفق تعليمات العبوة.",
  verified_purchase: true,
  created_at: "2026-11-13T08:00:00.000Z",
  answered_at: "2026-11-13T09:00:00.000Z",
};

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("storefront product questions contract", () => {
  it("normalizes only public answered fields and drops identity/tenant/order internals", () => {
    const result = normalizeStorefrontProductQuestionSummary({
      question_count: 1,
      has_more: false,
      items: [{
        ...validQuestion,
        organization_id: "private-tenant",
        customer_id: "private-customer",
        profile_id: "private-profile",
        email: "secret@example.invalid",
        order_id: "private-order",
      }],
    });
    expect(result).toEqual({
      questionCount: 1,
      hasMore: false,
      items: [{
        id: questionId,
        questionText: validQuestion.question_text,
        answerText: validQuestion.answer_text,
        verifiedPurchase: true,
        createdAt: validQuestion.created_at,
        answeredAt: validQuestion.answered_at,
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(/organization_id|customer_id|profile_id|email|order_id/);
  });

  it("rejects a malformed public answer and invalid summary metadata", () => {
    expect(() => normalizeStorefrontProductQuestionSummary({
      question_count: 1, has_more: false, items: [{ ...validQuestion, answer_text: null }],
    })).toThrow();
    expect(() => normalizeStorefrontProductQuestionSummary({
      question_count: -1, has_more: false, items: [],
    })).toThrow();
    expect(() => normalizeStorefrontProductQuestionSummary({
      question_count: 1, has_more: "false", items: [],
    })).toThrow();
  });

  it("keeps private pending/rejected states out of the public contract", () => {
    const result = normalizeCustomerProductQuestions({ items: [
      {
        id: questionId, question_text: "هل يناسب الاستخدام اليومي؟", answer_text: null,
        moderation_status: "pending", moderation_note: null, verified_purchase: false,
        created_at: "2026-11-13T08:00:00.000Z", updated_at: "2026-11-13T08:00:00.000Z",
        answered_at: null, customer_id: "must-not-be-exposed",
      },
      {
        id: "c1000000-0000-0000-0000-000000000001", question_text: "هل توجد ألوان أخرى؟",
        answer_text: null, moderation_status: "rejected", moderation_note: "السؤال خارج نطاق المنتج",
        verified_purchase: true, created_at: "2026-11-13T08:00:00.000Z",
        updated_at: "2026-11-13T09:00:00.000Z", answered_at: null,
      },
    ] });
    expect(result.map((item) => item.status)).toEqual(["pending", "rejected"]);
    expect(result[1].moderationNote).toBe("السؤال خارج نطاق المنتج");
    expect(JSON.stringify(result)).not.toContain("customer_id");
  });

  it("rejects inconsistent answered status and invalid moderation states", () => {
    expect(() => normalizeCustomerProductQuestions({ items: [{
      id: questionId, question_text: "سؤال عن المنتج", answer_text: null,
      moderation_status: "answered", moderation_note: null, verified_purchase: true,
      created_at: "2026-11-13T08:00:00.000Z", updated_at: "2026-11-13T08:00:00.000Z",
      answered_at: null,
    }] })).toThrow(/حالة إجابة السؤال/);
    expect(() => normalizeCustomerProductQuestions({ items: [{
      id: questionId, question_text: "سؤال عن المنتج", answer_text: null,
      moderation_status: "published", moderation_note: null, verified_purchase: true,
      created_at: "2026-11-13T08:00:00.000Z", updated_at: "2026-11-13T08:00:00.000Z",
      answered_at: null,
    }] })).toThrow(/حالة سؤال غير معروفة/);
  });

  it("passes bounded public pagination to the public-only RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { question_count: 0, items: [], has_more: false }, error: null });
    await fetchStorefrontProductQuestions(productId, 8, 16);
    expect(mocks.rpc).toHaveBeenCalledWith("get_storefront_product_questions", {
      p_product_id: productId, p_limit: 8, p_offset: 16,
    });
    await expect(fetchStorefrontProductQuestions("invalid")).rejects.toThrow(/معرّف المنتج/);
    await expect(fetchStorefrontProductQuestions(productId, 21, 0)).rejects.toThrow(/نطاق تحميل/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("loads only the signed-in customer's private context", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [] }, error: null });
    await expect(fetchCustomerProductQuestions(productId)).resolves.toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_product_questions_context", { p_product_id: productId });
  });

  it("submits a bounded customer question and validates the server result", async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: questionId, moderation_status: "pending", message: "تم إرسال السؤال" }, error: null,
    });
    await expect(submitStorefrontProductQuestion({
      productId, questionText: "  هل يناسب الاستخدام اليومي؟  ",
    })).resolves.toEqual({ id: questionId, moderationStatus: "pending", message: "تم إرسال السؤال" });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_storefront_product_question", {
      p_product_id: productId, p_question_text: "هل يناسب الاستخدام اليومي؟",
    });
    await expect(submitStorefrontProductQuestion({ productId, questionText: "قصير" })).rejects.toThrow();
  });

  it("loads bounded manager queue and requires complete answer/rejection payloads", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(fetchPendingStorefrontProductQuestions(50)).resolves.toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_pending_storefront_product_questions", { p_limit: 50 });
    await expect(fetchPendingStorefrontProductQuestions(101)).rejects.toThrow();

    mocks.rpc.mockResolvedValue({ data: { id: questionId, moderation_status: "answered" }, error: null });
    await expect(moderateStorefrontProductQuestion({
      questionId, decision: "answer", answer: "نعم، مناسب للاستخدام اليومي.",
    })).resolves.toEqual({ id: questionId, status: "answered" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("moderate_storefront_product_question", {
      p_question_id: questionId, p_decision: "answer",
      p_answer: "نعم، مناسب للاستخدام اليومي.", p_note: "",
    });
    await expect(moderateStorefrontProductQuestion({
      questionId, decision: "answer", answer: "لا",
    })).rejects.toThrow(/إجابة/);
    await expect(moderateStorefrontProductQuestion({
      questionId, decision: "reject", note: "",
    })).rejects.toThrow(/سبب رفض/);
  });
});
