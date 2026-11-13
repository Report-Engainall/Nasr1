// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; profileId: string; roles: string[]; isStaff: boolean },
  fetchSummary: vi.fn(),
  fetchContext: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/storefront-product-reviews", () => ({
  fetchStorefrontProductReviews: mocks.fetchSummary,
  fetchCustomerProductReviewContext: mocks.fetchContext,
  submitStorefrontProductReview: mocks.submit,
}));

import { StorefrontProductReviews } from "./StorefrontProductReviews";

const productId = "a1000000-0000-0000-0000-000000000081";
const review = {
  id: "b1000000-0000-0000-0000-000000000081",
  rating: 5,
  title: "جودة جيدة",
  body: "وصل المنتج بحالة سليمة ومطابقاً للوصف.",
  createdAt: "2026-11-13T04:00:00.000Z",
  verifiedPurchase: true as const,
};
const customer = {
  id: "c1000000-0000-0000-0000-000000000081",
  profileId: "d1000000-0000-0000-0000-000000000081",
  roles: ["customer"],
  isStaff: false,
};

beforeEach(() => {
  mocks.user = null;
  mocks.fetchSummary.mockReset().mockResolvedValue({
    averageRating: 5, reviewCount: 1, items: [review], hasMore: false,
  });
  mocks.fetchContext.mockReset().mockResolvedValue({
    eligible: false, orderItemId: null, orderNumber: null, deliveredAt: null, review: null,
  });
  mocks.submit.mockReset().mockResolvedValue({
    id: "b1000000-0000-0000-0000-000000000081",
    moderationStatus: "pending",
    message: "تم إرسال التقييم للمراجعة قبل النشر",
  });
});

afterEach(() => cleanup());

describe("StorefrontProductReviews", () => {
  it("shows only the server-approved, verified reviews to a visitor", async () => {
    render(<StorefrontProductReviews productId={productId} />);

    expect(await screen.findByText("وصل المنتج بحالة سليمة ومطابقاً للوصف.")).toBeInTheDocument();
    expect(screen.getByText("شراء موثّق")).toBeInTheDocument();
    expect(screen.getByText("(1 تقييم معتمد)")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByText(/سجّل الدخول بحساب عميل/)).toBeInTheDocument();
  });

  it("does not offer a review form before the matching order is delivered", async () => {
    mocks.user = customer;
    render(<StorefrontProductReviews productId={productId} />);

    expect(await screen.findByText(/يتاح التقييم بعد تسليم طلب/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إرسال التقييم" })).not.toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("submits a review only with the server-returned delivered order-line ID", async () => {
    mocks.user = customer;
    mocks.fetchContext.mockResolvedValue({
      eligible: true,
      orderItemId: "e1000000-0000-0000-0000-000000000081",
      orderNumber: "AGH-2026-081",
      deliveredAt: "2026-11-12T10:00:00.000Z",
      review: null,
    });
    render(<StorefrontProductReviews productId={productId} />);

    const body = await screen.findByLabelText("تجربتك مع المنتج");
    fireEvent.change(body, { target: { value: "المنتج مطابق لما طلبته ووصل بحالة جيدة." } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال التقييم" }));

    await waitFor(() => {
      expect(mocks.submit).toHaveBeenCalledWith({
        productId,
        orderItemId: "e1000000-0000-0000-0000-000000000081",
        rating: 5,
        title: "",
        body: "المنتج مطابق لما طلبته ووصل بحالة جيدة.",
      });
    });
    expect(await screen.findByText("تم إرسال التقييم للمراجعة قبل النشر")).toBeInTheDocument();
  });

  it("shows the private customer's moderation status without exposing it publicly", async () => {
    mocks.user = customer;
    mocks.fetchContext.mockResolvedValue({
      eligible: true,
      orderItemId: "e1000000-0000-0000-0000-000000000081",
      orderNumber: "AGH-2026-081",
      deliveredAt: "2026-11-12T10:00:00.000Z",
      review: {
        id: review.id, rating: 3, title: "ملاحظة", body: "التقييم بانتظار اعتماد الإدارة.",
        status: "pending", moderationNote: null,
        createdAt: review.createdAt, updatedAt: review.createdAt,
      },
    });
    render(<StorefrontProductReviews productId={productId} />);

    expect(await screen.findByText(/تقييمك قيد مراجعة المتجر/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعادة إرسال للمراجعة" })).toBeInTheDocument();
    expect(screen.getByText("وصل المنتج بحالة سليمة ومطابقاً للوصف.")).toBeInTheDocument();
    expect(screen.queryByText(/التقييم بانتظار اعتماد الإدارة/)).not.toBeInTheDocument();
  });
});
