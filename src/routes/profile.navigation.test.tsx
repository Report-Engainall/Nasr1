/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    profileId: string;
    email: string;
    name: string;
    roles: string[];
    isStaff: boolean;
  },
  sessionRevision: 1,
  signOutCurrent: vi.fn(),
  signOutOtherSessions: vi.fn(),
  signOutEverywhere: vi.fn(),
  fetchAccountProfile: vi.fn(),
  saveAccountProfile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    sessionRevision: mocks.sessionRevision,
    signOut: mocks.signOutCurrent,
    signOutOtherSessions: mocks.signOutOtherSessions,
    signOutEverywhere: mocks.signOutEverywhere,
  }),
}));

vi.mock("@/components/Login", () => ({
  Login: () => <div data-testid="login-required">تسجيل الدخول مطلوب</div>,
}));

vi.mock("@/components/AccountPersonalizationSettings", () => ({
  AccountPersonalizationSettings: () => <div data-testid="account-personalization" />,
}));

vi.mock("@/lib/customer-account-profile", () => ({
  fetchMyCustomerAccountProfile: mocks.fetchAccountProfile,
  saveMyCustomerAccountProfile: mocks.saveAccountProfile,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    ClientOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
    Link: ({ to, children, params, ...props }: { to: string; children: ReactNode; params?: Record<string, string>; className?: string }) => {
      const href = params?.id ? to.replace("$id", params.id) : to;
      return <a href={href} {...props}>{children}</a>;
    },
  };
});

import { recordRecentlyViewedProduct } from "@/lib/recently-viewed-products";
import { CustomerAccountProfilePage } from "./profile";

const CUSTOMER = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "customer@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const STAFF = {
  id: "22222222-2222-4222-8222-222222222222",
  profileId: "e2222222-2222-4222-8222-222222222222",
  email: "staff@example.test",
  name: "موظف الاختبار",
  roles: ["admin"],
  isStaff: true,
};

const CUSTOMER_B = {
  id: "33333333-3333-4333-8333-333333333333",
  profileId: "f3333333-3333-4333-8333-333333333333",
  email: "customer-b@example.test",
  name: "العميل الثاني",
  roles: ["customer"],
  isStaff: false,
};

const CUSTOMER_ONLY_ROUTES = [
  { path: "/invoices", label: /فواتيري/ },
  { path: "/quotes", label: /عروض الأسعار/ },
  { path: "/wishlist", label: /المفضلة/ },
  { path: "/compare", label: /مقارنة المنتجات/ },
  { path: "/service-cases", label: /حالات خدمة العملاء/ },
];

describe("My Aghbari customer account navigation", () => {
  beforeEach(() => {
    mocks.user = CUSTOMER;
    mocks.sessionRevision = 1;
    mocks.signOutCurrent.mockReset().mockResolvedValue(undefined);
    mocks.signOutOtherSessions.mockReset().mockResolvedValue(undefined);
    mocks.signOutEverywhere.mockReset().mockResolvedValue(undefined);
    mocks.fetchAccountProfile.mockReset().mockResolvedValue({
      business_name: "شركة الاختبار",
      contact_name: "مسؤول الاختبار",
      phone: "777123456",
      email: "account@example.test",
      customer_code: "C-TEST",
      status: "approved",
      updated_at: "2026-11-01T10:00:00.000Z",
    });
    mocks.saveAccountProfile.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("recovers from a failed customer-profile load without requiring a full page refresh", async () => {
    mocks.fetchAccountProfile
      .mockRejectedValueOnce(new Error("تعذر تحميل بيانات الشركة"))
      .mockResolvedValueOnce({
        business_name: "شركة الاختبار",
        contact_name: "مسؤول الاختبار",
        phone: "777123456",
        email: "account@example.test",
        customer_code: "C-TEST",
        status: "approved",
        updated_at: "2026-11-01T10:00:00.000Z",
      });

    render(<CustomerAccountProfilePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل بيانات الشركة");
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل بيانات الشركة" }));

    expect(await screen.findByLabelText("اسم الشركة")).toHaveValue("شركة الاختبار");
    expect(mocks.fetchAccountProfile).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("signs out only the current device without revoking other sessions", async () => {
    render(<CustomerAccountProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "تسجيل الخروج من هذا الجهاز" }));

    await waitFor(() => expect(mocks.signOutCurrent).toHaveBeenCalledTimes(1));
    expect(mocks.signOutOtherSessions).not.toHaveBeenCalled();
    expect(mocks.signOutEverywhere).not.toHaveBeenCalled();
  });

  it("shows a recoverable error when current-device sign out fails", async () => {
    mocks.signOutCurrent.mockRejectedValueOnce(new Error("تعذر إنهاء الجلسة المحلية"));

    render(<CustomerAccountProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الخروج من هذا الجهاز" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر إنهاء الجلسة المحلية");
    expect(screen.getByRole("button", { name: "تسجيل الخروج من هذا الجهاز" })).toBeEnabled();
    expect(mocks.signOutOtherSessions).not.toHaveBeenCalled();
    expect(mocks.signOutEverywhere).not.toHaveBeenCalled();
  });

  it("links the customer account hub to existing invoice, quote, saved-product and support routes", async () => {
    render(<CustomerAccountProfilePage />);

    expect(screen.getByRole("heading", { name: "ملفي الشخصي" })).toBeInTheDocument();
    for (const route of CUSTOMER_ONLY_ROUTES) {
      const link = screen.getByRole("link", { name: route.label });
      expect(link).toHaveAttribute("href", route.path);
    }

    await waitFor(() => {
      expect(screen.getByLabelText("اسم الشركة")).toHaveValue("شركة الاختبار");
    });
  });

  it("does not expose customer-only account shortcuts to a staff profile", () => {
    mocks.user = STAFF;
    render(<CustomerAccountProfilePage />);

    for (const route of CUSTOMER_ONLY_ROUTES) {
      expect(document.querySelector(`a[href="${route.path}"]`)).toBeNull();
    }
    expect(document.querySelector('a[href="/admin"]')).not.toBeNull();
    expect(screen.queryByLabelText("اسم الشركة")).not.toBeInTheDocument();
  });

  it("keeps staff precedence when a staff identity also carries a customer role", () => {
    mocks.user = { ...STAFF, roles: ["admin", "customer"] };
    render(<CustomerAccountProfilePage />);

    expect(document.querySelector('a[href="/admin"]')).not.toBeNull();
    expect(document.querySelector('a[href="/orders"]')).toBeNull();
    expect(screen.queryByLabelText("اسم الشركة")).not.toBeInTheDocument();
  });

  it("resets customer profile drafts when the Auth identity or session revision changes", async () => {
    mocks.fetchAccountProfile
      .mockResolvedValueOnce({
        business_name: "شركة العميل الأول",
        contact_name: "مسؤول العميل الأول",
        phone: "777123456",
        email: "first@example.test",
        customer_code: "C-FIRST",
        status: "approved",
        updated_at: "2026-11-27T01:00:00.000Z",
      })
      .mockResolvedValueOnce({
        business_name: "شركة العميل الثاني",
        contact_name: "مسؤول العميل الثاني",
        phone: "777654321",
        email: "second@example.test",
        customer_code: "C-SECOND",
        status: "approved",
        updated_at: "2026-11-27T02:00:00.000Z",
      })
      .mockResolvedValueOnce({
        business_name: "شركة العميل الثاني بعد تجديد الجلسة",
        contact_name: "مسؤول العميل الثاني",
        phone: "777654321",
        email: "second@example.test",
        customer_code: "C-SECOND",
        status: "approved",
        updated_at: "2026-11-27T03:00:00.000Z",
      });

    const { rerender } = render(<CustomerAccountProfilePage />);
    const businessName = await screen.findByLabelText("اسم الشركة");
    expect(businessName).toHaveValue("شركة العميل الأول");
    fireEvent.change(businessName, { target: { value: "مسودة خاصة بالعميل الأول" } });
    expect(businessName).toHaveValue("مسودة خاصة بالعميل الأول");

    mocks.user = CUSTOMER_B;
    mocks.sessionRevision = 2;
    rerender(<CustomerAccountProfilePage />);

    expect(await screen.findByLabelText("اسم الشركة")).toHaveValue("شركة العميل الثاني");
    expect(screen.queryByDisplayValue("مسودة خاصة بالعميل الأول")).not.toBeInTheDocument();

    mocks.sessionRevision = 3;
    rerender(<CustomerAccountProfilePage />);

    expect(await screen.findByLabelText("اسم الشركة")).toHaveValue("شركة العميل الثاني بعد تجديد الجلسة");
    expect(screen.queryByDisplayValue("مسودة خاصة بالعميل الأول")).not.toBeInTheDocument();
    expect(mocks.fetchAccountProfile).toHaveBeenCalledTimes(3);
  });

  it("shows recent public product views inside the matching customer account", async () => {
    const productId = "a1000000-0000-0000-0000-000000000081";
    expect(recordRecentlyViewedProduct(window.localStorage, CUSTOMER.profileId, {
      id: productId,
      name: "هاتف الأغبري",
      itemCode: "PHONE-081",
      imageUrl: "https://cdn.example.test/phone.webp",
    }, "2026-11-13T03:00:00.000Z")).toBe(true);

    render(<CustomerAccountProfilePage />);

    expect(await screen.findByRole("heading", { name: "شوهدت مؤخراً" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /هاتف الأغبري/ })).toHaveAttribute("href", `/product/${productId}`);
    expect(screen.getByText(/لا تتم مزامنته مع أجهزة أخرى/)).toBeInTheDocument();
  });

  it("lets the customer remove one viewed product", async () => {
    const productId = "a1000000-0000-0000-0000-000000000082";
    recordRecentlyViewedProduct(window.localStorage, CUSTOMER.profileId, {
      id: productId, name: "حاسوب الأغبري",
    }, "2026-11-13T03:00:00.000Z");
    render(<CustomerAccountProfilePage />);

    expect(await screen.findByRole("link", { name: /حاسوب الأغبري/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إزالة حاسوب الأغبري من سجل المشاهدة" }));
    expect(screen.queryByRole("link", { name: /حاسوب الأغبري/ })).not.toBeInTheDocument();
    expect(screen.getByText(/لا توجد منتجات شوهدت مؤخراً/)).toBeInTheDocument();
  });

  it("lets the customer clear only the current profile's viewed history", async () => {
    recordRecentlyViewedProduct(window.localStorage, CUSTOMER.profileId, {
      id: "product-current", name: "منتج حساب العميل",
    }, "2026-11-13T03:00:00.000Z");
    recordRecentlyViewedProduct(window.localStorage, STAFF.profileId, {
      id: "product-staff", name: "منتج حساب آخر",
    }, "2026-11-13T03:00:00.000Z");
    render(<CustomerAccountProfilePage />);

    expect(await screen.findByRole("link", { name: /منتج حساب العميل/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "مسح السجل" }));
    expect(screen.queryByRole("link", { name: /منتج حساب العميل/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("aghbari:recently-viewed:v1:" + CUSTOMER.profileId)).toBeNull();
    expect(window.localStorage.getItem("aghbari:recently-viewed:v1:" + STAFF.profileId)).not.toBeNull();
  });

  it("does not render customer product history for staff or restricted profiles", () => {
    recordRecentlyViewedProduct(window.localStorage, CUSTOMER.profileId, {
      id: "product-hidden",
      name: "منتج خاص بالحساب",
    }, "2026-11-13T03:00:00.000Z");

    mocks.user = STAFF;
    const { rerender } = render(<CustomerAccountProfilePage />);
    expect(screen.queryByRole("heading", { name: "شوهدت مؤخراً" })).not.toBeInTheDocument();

    mocks.user = { ...CUSTOMER, roles: [], isStaff: false };
    rerender(<CustomerAccountProfilePage />);
    expect(screen.queryByRole("heading", { name: "شوهدت مؤخراً" })).not.toBeInTheDocument();
  });

  it("does not expose customer-only account shortcuts to an unclassified profile", () => {
    mocks.user = { ...CUSTOMER, roles: [], isStaff: false };
    render(<CustomerAccountProfilePage />);

    for (const route of CUSTOMER_ONLY_ROUTES) {
      expect(document.querySelector(`a[href="${route.path}"]`)).toBeNull();
    }
  });
});
