// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; profileId: string; roles: string[]; isStaff: boolean },
  fetchPublic: vi.fn(),
  fetchMine: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/storefront-product-questions", () => ({
  fetchStorefrontProductQuestions: mocks.fetchPublic,
  fetchCustomerProductQuestions: mocks.fetchMine,
  submitStorefrontProductQuestion: mocks.submit,
}));
import { StorefrontProductQuestions } from "./StorefrontProductQuestions";

const productId = "a1000000-0000-0000-0000-000000000001";
const publicItem = {
  id: "b1000000-0000-0000-0000-000000000001",
  questionText: "هل يناسب الاستخدام اليومي؟",
  answerText: "نعم، المنتج مناسب للاستخدام اليومي وفق تعليمات العبوة.",
  verifiedPurchase: true,
  createdAt: "2026-11-13T08:00:00.000Z",
  answeredAt: "2026-11-13T09:00:00.000Z",
};
const customer = {
  id: "c1000000-0000-0000-0000-000000000001",
  profileId: "d1000000-0000-0000-0000-000000000001",
  roles: ["customer"], isStaff: false,
};
beforeEach(() => {
  mocks.user = null;
  mocks.fetchPublic.mockReset().mockResolvedValue({ questionCount: 1, items: [publicItem], hasMore: false });
  mocks.fetchMine.mockReset().mockResolvedValue([]);
  mocks.submit.mockReset().mockResolvedValue({ id: "e1000000-0000-0000-0000-000000000001", moderationStatus: "pending", message: "تم إرسال سؤالك إلى فريق المتجر" });
});
afterEach(() => cleanup());

describe("StorefrontProductQuestions", () => {
  it("shows public answered Q&A but never exposes a customer form to visitors", async () => {
    render(<StorefrontProductQuestions productId={productId} />);
    expect(await screen.findByText(publicItem.questionText)).toBeInTheDocument();
    expect(screen.getByText(publicItem.answerText)).toBeInTheDocument();
    expect(screen.getByText("صاحب السؤال اشترى المنتج فعلياً")).toBeInTheDocument();
    expect(screen.getByText("طرح الأسئلة متاح لحساب العميل المسجّل فقط.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إرسال السؤال للمراجعة" })).not.toBeInTheDocument();
    expect(mocks.fetchMine).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("allows a customer to submit a question and keeps it in private pending state", async () => {
    mocks.user = customer;
    mocks.fetchMine.mockResolvedValue([{
      id: "e1000000-0000-0000-0000-000000000001",
      questionText: "هل يناسب الاستخدام اليومي؟", answerText: null,
      status: "pending", moderationNote: null, verifiedPurchase: true,
      createdAt: "2026-11-13T08:00:00.000Z", updatedAt: "2026-11-13T08:00:00.000Z", answeredAt: null,
    }]);
    render(<StorefrontProductQuestions productId={productId} />);
    const field = await screen.findByLabelText("سؤالك عن المنتج");
    fireEvent.change(field, { target: { value: "هل يناسب الاستخدام اليومي؟" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال السؤال للمراجعة" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({
      productId, questionText: "هل يناسب الاستخدام اليومي؟",
    }));
    expect(await screen.findByText("تم إرسال سؤالك إلى فريق المتجر")).toBeInTheDocument();
    expect(screen.getByText("بانتظار الإجابة")).toBeInTheDocument();
  });

  it("loads the customer's own rejection note privately", async () => {
    mocks.user = customer;
    mocks.fetchMine.mockResolvedValue([{
      id: "f1000000-0000-0000-0000-000000000001",
      questionText: "هل يمكن السؤال عن منتج آخر هنا؟", answerText: null,
      status: "rejected", moderationNote: "السؤال خارج نطاق المنتج",
      verifiedPurchase: false, createdAt: "2026-11-13T08:00:00.000Z",
      updatedAt: "2026-11-13T09:00:00.000Z", answeredAt: null,
    }]);
    render(<StorefrontProductQuestions productId={productId} />);
    expect(await screen.findByText(/سبب المراجعة: السؤال خارج نطاق المنتج/)).toBeInTheDocument();
  });

  it("does not expose question submission or private history to a staff account", async () => {
    mocks.user = { id: "staff-1", profileId: "staff-profile", roles: ["manager"], isStaff: true };
    render(<StorefrontProductQuestions productId={productId} />);
    expect(await screen.findByText(publicItem.questionText)).toBeInTheDocument();
    expect(screen.queryByLabelText("سؤالك عن المنتج")).not.toBeInTheDocument();
    expect(mocks.fetchMine).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
