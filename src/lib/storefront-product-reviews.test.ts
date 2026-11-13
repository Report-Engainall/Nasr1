import { describe, expect, it } from "vitest";
import {
  normalizeCustomerProductReviewContext,
  normalizeStorefrontProductReviewSummary,
} from "./storefront-product-reviews";

const reviewId = "11111111-1111-4111-8111-111111111111";
const orderItemId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-11-13T04:00:00.000Z";

describe("storefront product review response contracts", () => {
  it("accepts and allow-lists approved public reviews without retaining customer or tenant identifiers", () => {
    const normalized = normalizeStorefrontProductReviewSummary({
      average_rating: 4.5,
      review_count: 2,
      has_more: true,
      organization_id: "foreign-tenant",
      customer_id: "private-customer",
      items: [{
        id: reviewId,
        rating: 5,
        title: "جودة ممتازة",
        body: "وصل المنتج مطابقاً للوصف والتغليف جيد.",
        created_at: createdAt,
        verified_purchase: true,
        customer_name: "اسم خاص",
        email: "private@example.test",
        order_id: "private-order",
        organization_id: "foreign-tenant",
      }],
    });

    expect(normalized).toEqual({
      averageRating: 4.5,
      reviewCount: 2,
      hasMore: true,
      items: [{
        id: reviewId,
        rating: 5,
        title: "جودة ممتازة",
        body: "وصل المنتج مطابقاً للوصف والتغليف جيد.",
        createdAt,
        verifiedPurchase: true,
      }],
    });
    expect(JSON.stringify(normalized)).not.toContain("private@example.test");
    expect(JSON.stringify(normalized)).not.toContain("foreign-tenant");
    expect(JSON.stringify(normalized)).not.toContain("private-order");
  });

  it("rejects any public review that is not explicitly marked as a verified purchase", () => {
    expect(() => normalizeStorefrontProductReviewSummary({
      average_rating: 5,
      review_count: 1,
      has_more: false,
      items: [{
        id: reviewId,
        rating: 5,
        title: "",
        body: "رأي غير مرتبط بطلب مسلّم.",
        created_at: createdAt,
        verified_purchase: false,
      }],
    })).toThrow(/غير موثق/);
  });

  it.each([0, 6, 2.5, "unknown", null])("rejects an invalid star rating (%s)", (rating) => {
    expect(() => normalizeStorefrontProductReviewSummary({
      average_rating: 3,
      review_count: 1,
      has_more: false,
      items: [{
        id: reviewId,
        rating,
        title: "",
        body: "تقييم اختبار غير صالح",
        created_at: createdAt,
        verified_purchase: true,
      }],
    })).toThrow(/درجة تقييم غير صالحة/);
  });

  it("rejects malformed aggregate data instead of displaying fabricated metrics", () => {
    expect(() => normalizeStorefrontProductReviewSummary({
      average_rating: 8,
      review_count: -1,
      has_more: "false",
      items: [],
    })).toThrow(/ملخص تقييمات غير صالح/);
  });

  it("returns only the current customer's review fields and verified delivered-order context", () => {
    const normalized = normalizeCustomerProductReviewContext({
      eligible: true,
      order_item_id: orderItemId,
      order_number: "AGH-2026-001",
      delivered_at: createdAt,
      review: {
        id: reviewId,
        rating: 4,
        title: "جيد",
        body: "المنتج مطابق لما طلبته ووصل بحالة سليمة.",
        moderation_status: "rejected",
        moderation_note: "يرجى إزالة معلومة خارج موضوع المنتج",
        created_at: createdAt,
        updated_at: createdAt,
        customer_id: "must-not-be-kept",
        organization_id: "must-not-be-kept",
        email: "must-not-be-kept@example.test",
      },
    });

    expect(normalized).toEqual({
      eligible: true,
      orderItemId,
      orderNumber: "AGH-2026-001",
      deliveredAt: createdAt,
      review: {
        id: reviewId,
        rating: 4,
        title: "جيد",
        body: "المنتج مطابق لما طلبته ووصل بحالة سليمة.",
        status: "rejected",
        moderationNote: "يرجى إزالة معلومة خارج موضوع المنتج",
        createdAt,
        updatedAt: createdAt,
      },
    });
    expect(JSON.stringify(normalized)).not.toContain("must-not-be-kept");
  });

  it("rejects malformed or unknown moderation statuses", () => {
    expect(() => normalizeCustomerProductReviewContext({
      eligible: true,
      order_item_id: orderItemId,
      order_number: "AGH-1",
      delivered_at: createdAt,
      review: {
        id: reviewId,
        rating: 4,
        title: "",
        body: "محتوى تقييم اختباري صالح",
        moderation_status: "published-without-review",
        moderation_note: null,
        created_at: createdAt,
        updated_at: createdAt,
      },
    })).toThrow(/حالة مراجعة غير معروفة/);
  });

  it("does not infer purchase eligibility from missing or malformed order-line ids", () => {
    const normalized = normalizeCustomerProductReviewContext({
      eligible: false,
      order_item_id: "not-a-uuid",
      order_number: null,
      delivered_at: null,
      review: null,
    });
    expect(normalized.eligible).toBe(false);
    expect(normalized.orderItemId).toBeNull();
    expect(normalized.review).toBeNull();
  });
});
