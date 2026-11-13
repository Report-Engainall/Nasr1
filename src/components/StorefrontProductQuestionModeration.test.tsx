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
vi.mock("@/lib/storefront-product-questions", () => ({
  fetchPendingStorefrontProductQuestions: mocks.fetchQueue,
  moderateStorefrontProductQuestion: mocks.moderate,
}));
import { StorefrontProductQuestionModeration } from "./StorefrontProductQuestionModeration";

const pending = {
  id: "b1000000-0000-0000-0000-000000000001",
  productId: "a1000000-0000-0000-0000-000000000001",
  productName: "سكر تجريبي", itemCode: "SUGAR-001",
  questionText: "هل يناسب الاستخدام اليومي؟", verifiedPurchase: true,
  createdAt: "2026-11-13T08:00:00.000Z",
};
const manager = { id: "manager-1", profileId: "manager-profile", roles: ["manager"], isStaff: true };
beforeEach(() => {
  mocks.user = manager;
  mocks.fetchQueue.mockReset().mockResolvedValue([pending]);
  mocks.moderate.mockReset().mockResolvedValue({ id: pending.id, status: "answered" });
});
afterEach(() => cleanup());

describe("StorefrontProductQuestionModeration", () => {
  it("allows a manager to publish a bounded answer and removes the queue item", async () => {
    render(<StorefrontProductQuestionModeration onBack={vi.fn()} />);
    expect(await screen.findByText("سكر تجريبي")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("إجابة المتجر (5–1500 حرف)"), {
      target: { value: "نعم، المنتج مناسب للاستخدام اليومي وفق تعليمات العبوة." },
    });
    fireEvent.click(screen.getByRole("button", { name: "إجابة ونشر" }));
    await waitFor(() => expect(mocks.moderate).toHaveBeenCalledWith({
      questionId: pending.id, decision: "answer",
      answer: "نعم، المنتج مناسب للاستخدام اليومي وفق تعليمات العبوة.", note: "",
    }));
    expect(await screen.findByText("لا توجد أسئلة تنتظر الإجابة.")).toBeInTheDocument();
  });

  it("requires a rejection reason and forwards it to the audited moderation operation", async () => {
    mocks.moderate.mockResolvedValue({ id: pending.id, status: "rejected" });
    render(<StorefrontProductQuestionModeration onBack={vi.fn()} />);
    await screen.findByText("سكر تجريبي");
    const reject = screen.getByRole("button", { name: "رفض مع السبب" });
    expect(reject).toBeDisabled();
    fireEvent.change(screen.getByLabelText("سبب الرفض (5–500 حرف، عند الرفض فقط)"), {
      target: { value: "السؤال خارج نطاق مواصفات المنتج" },
    });
    expect(reject).toBeEnabled();
    fireEvent.click(reject);
    await waitFor(() => expect(mocks.moderate).toHaveBeenCalledWith({
      questionId: pending.id, decision: "reject", answer: "", note: "السؤال خارج نطاق مواصفات المنتج",
    }));
  });

  it("does not load or mutate the queue for a customer", async () => {
    mocks.user = { id: "customer-1", profileId: "customer-profile", roles: ["customer"], isStaff: false };
    render(<StorefrontProductQuestionModeration onBack={vi.fn()} />);
    expect(screen.getByText("أسئلة العملاء متاحة للمسؤول والمدير فقط.")).toBeInTheDocument();
    expect(mocks.fetchQueue).not.toHaveBeenCalled();
    expect(mocks.moderate).not.toHaveBeenCalled();
  });
});
