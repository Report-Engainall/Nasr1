/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    sessionRevision: 1,
    signOutOtherSessions: vi.fn().mockResolvedValue(undefined),
    signOutEverywhere: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/components/Login", () => ({
  Login: () => <div data-testid="login-required">تسجيل الدخول مطلوب</div>,
}));

vi.mock("@/components/AccountPersonalizationSettings", () => ({
  AccountPersonalizationSettings: () => <div data-testid="account-personalization" />,
}));

vi.mock("@/lib/customer-account-profile", () => ({
  fetchMyCustomerAccountProfile: vi.fn(async () => ({
    business_name: "شركة الاختبار",
    contact_name: "مسؤول الاختبار",
    phone: "777123456",
    email: "account@example.test",
    customer_code: "C-TEST",
    status: "approved",
    updated_at: "2026-11-01T10:00:00.000Z",
  })),
  saveMyCustomerAccountProfile: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    ClientOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode; className?: string }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

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
  });

  afterEach(() => {
    cleanup();
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
  });

  it("does not expose customer-only account shortcuts to an unclassified profile", () => {
    mocks.user = { ...CUSTOMER, roles: [], isStaff: false };
    render(<CustomerAccountProfilePage />);

    for (const route of CUSTOMER_ONLY_ROUTES) {
      expect(document.querySelector(`a[href="${route.path}"]`)).toBeNull();
    }
  });
});
