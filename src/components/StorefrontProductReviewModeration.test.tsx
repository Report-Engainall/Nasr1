// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; profileId: string; roles: string[]; isStaff: boolean },
  fetchQueue: vi.fn(),
  moderate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/storefront-product-reviews", () => ({
  fetchPendingStorefrontProductReviews: mocks.fetchQueue,
  moderateStorefrontProductReview: mocks.moderate,
}));

import { StorefrontProductReviewModeration } from "./StorefrontProductReviewModeration";

const pending = {
  id: "b2000000-0000-0000-0000-000000000082",
  productId: "a2000000-0000-0000-0000-000000000082",
  productName: "سكر تجريبي",
  itemCode: "SUGAR-082",
  orderNumber: "AGH-2026-082",
  rating: 4,
  title: "جيد",
  body: "جودة العبوة جيدة والمنتج مطابق لما طلبته.",
  createdAt: "2026-11-13T04:00:00.000Z",
};
const manager = {
  id: "c2000000-0000-0000-0000-000000000082",
  profileId: "d2000000-0000-0000-0000-000000000082",
  roles: ["manager"],
  isStaff: true,
};

beforeEach(() => {
  mocks.user = manager;
  mocks.fetchQueue.mockReset().mockResolvedValue([pending]);
  mocks.moderate.mockReset().mockResolvedValue({ id: pending.id, status: "approved" });
});
afterEach(() => cleanup());

describe("StorefrontProductReviewModeration", () => {
  it("allows a manager to approve the pending review and removes it from the current queue", async () => {
    const onBack = vi.fn();
    render(<StorefrontProductReviewModeration onBack={onBack} />);

    expect(await screen.findByText("سكر تجريبي")).toBeInTheDocument();
    expect(screen.getByText("جودة العبوة جيدة والمنتج مطابق لما طلبته.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "اعتماد ونشر" }));

    await waitFor(() => {
      expect(mocks.moderate).toHaveBeenCalledWith({
        reviewId: pending.id,
        decision: "approve",
        note: "",
      });
    });
    expect(await screen.findByText("لا توجد تقييمات تنتظر المراجعة")).toBeInTheDocument();
  });

  it("requires a rejection reason and sends it to the audited moderation RPC", async () => {
    mocks.moderate.mockResolvedValue({ id: pending.id, status: "rejected" });
    render(<StorefrontProductReviewModeration onBack={vi.fn()} />);

    await screen.findByText("سكر تجريبي");
    const rejectButton = screen.getByRole("button", { name: "رفض مع السبب" });
    expect(rejectButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("سبب الرفض (إلزامي عند الرفض)"), {
      target: { value: "التقييم لا يتعلق بمواصفات المنتج" },
    });
    expect(rejectButton).toBeEnabled();
    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(mocks.moderate).toHaveBeenCalledWith({
        reviewId: pending.id,
        decision: "reject",
        note: "التقييم لا يتعلق بمواصفات المنتج",
      });
    });
  });

  it("does not load or moderate the queue for a customer", async () => {
    mocks.user = {
      id: "e2000000-0000-0000-0000-000000000082",
      profileId: "f2000000-0000-0000-0000-000000000082",
      roles: ["customer"],
      isStaff: false,
    };
    render(<StorefrontProductReviewModeration onBack={vi.fn()} />);

    expect(screen.getByText("مراجعة تقييمات العملاء متاحة للمسؤول والمدير فقط.")).toBeInTheDocument();
    expect(mocks.fetchQueue).not.toHaveBeenCalled();
    expect(mocks.moderate).not.toHaveBeenCalled();
  });
});
