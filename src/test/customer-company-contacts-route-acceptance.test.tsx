import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";

type TestUser = {
  id: string;
  profileId: string;
  email: string;
  name: string;
  roles: string[];
  isStaff: boolean;
};

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  fetchContacts: vi.fn(),
  saveContact: vi.fn(),
  deleteContact: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    loading: false,
    configurationError: null,
    signOut: mocks.signOut,
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/Login", () => ({
  Login: () => <div data-testid="login-required">تسجيل الدخول مطلوب</div>,
}));

vi.mock("@/components/FinanceDocumentPrintActions", () => ({
  FinanceDocumentPrintActions: () => null,
}));

vi.mock("@/components/CashExpenseLedger", () => ({
  CashExpenseLedger: () => null,
}));

vi.mock("@/components/GeneralLedgerWorkspace", () => ({
  GeneralLedgerWorkspace: () => null,
}));

vi.mock("@/lib/customer-company-contacts", () => ({
  fetchCustomerCompanyContacts: mocks.fetchContacts,
  saveCustomerCompanyContact: mocks.saveContact,
  deleteCustomerCompanyContact: mocks.deleteContact,
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: vi.fn(),
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "contacts-customer@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const STAFF: TestUser = {
  ...CUSTOMER,
  id: "22222222-2222-4222-8222-222222222222",
  profileId: "f2222222-2222-4222-8222-222222222222",
  email: "contacts-staff@example.test",
  roles: ["admin"],
  isStaff: true,
};

describe("customer company contacts real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.fetchContacts.mockReset().mockResolvedValue([]);
    mocks.saveContact.mockReset().mockResolvedValue("d1111111-1111-4111-8111-111111111111");
    mocks.deleteContact.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function mountContactsRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/company/contacts"] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(router.state.location.pathname).toBe("/company/contacts");
  }

  function pageText() {
    return host?.textContent ?? "";
  }

  function inputForLabel(labelText: string): HTMLInputElement | HTMLTextAreaElement {
    const label = Array.from(host!.querySelectorAll("form label")).find((node) =>
      node.textContent?.trim().startsWith(labelText),
    );
    const input = label?.querySelector("input, textarea");
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      throw new Error("Expected a visible form field labelled: " + labelText);
    }
    return input;
  }

  it("does not load company contacts before guest authentication", async () => {
    await mountContactsRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain("تسجيل الدخول مطلوب");
    expect(mocks.fetchContacts).not.toHaveBeenCalled();
    expect(mocks.saveContact).not.toHaveBeenCalled();
  });

  it("blocks staff from the customer contacts workspace before any contact read", async () => {
    mocks.user = STAFF;
    await mountContactsRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("هذه الشاشة مخصصة لحساب العميل");
    expect(mocks.fetchContacts).not.toHaveBeenCalled();
    expect(mocks.saveContact).not.toHaveBeenCalled();
    expect(mocks.deleteContact).not.toHaveBeenCalled();
  });

  it("shows a failed contact read and recovers through the real retry control", async () => {
    mocks.user = CUSTOMER;
    mocks.fetchContacts
      .mockRejectedValueOnce(new Error("تعذر تحميل جهات اتصال الشركة"))
      .mockResolvedValueOnce([]);

    await mountContactsRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل جهات اتصال الشركة");
    const retry = Array.from(host!.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("إعادة المحاولة"),
    );
    expect(retry).toBeDefined();

    await act(async () => {
      retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.fetchContacts).toHaveBeenCalledTimes(2);
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(pageText()).toContain("لا توجد جهات اتصال محفوظة بعد.");
  });

  it("keeps the user's draft and shows server rejection instead of save success", async () => {
    mocks.user = CUSTOMER;
    mocks.fetchContacts.mockResolvedValue([]);
    mocks.saveContact.mockRejectedValue(new Error("رفض الخادم التجريبي"));

    await mountContactsRoute();

    act(() => {
      fireEvent.change(inputForLabel("اسم جهة الاتصال"), {
        target: { value: "مسؤول مشتريات تجريبي" },
      });
      fireEvent.change(inputForLabel("رقم الهاتف"), {
        target: { value: "+967777123456" },
      });
      fireEvent.change(inputForLabel("البريد الإلكتروني"), {
        target: { value: "buyer@example.test" },
      });
    });

    const save = Array.from(host!.querySelectorAll('button[type="submit"]')).find((button) =>
      button.textContent?.includes("حفظ جهة الاتصال"),
    );
    expect(save).toBeDefined();

    await act(async () => {
      fireEvent.click(save!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.saveContact).toHaveBeenCalledTimes(1);
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("رفض الخادم التجريبي");
    expect(pageText()).not.toContain("تم حفظ جهة الاتصال.");
    expect(inputForLabel("اسم جهة الاتصال").value).toBe("مسؤول مشتريات تجريبي");
    expect(inputForLabel("رقم الهاتف").value).toBe("+967777123456");
  });
});
