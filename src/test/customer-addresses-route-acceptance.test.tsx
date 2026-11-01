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
  fetchCustomerAddresses: vi.fn(),
  saveCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
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

vi.mock("@/lib/customer-addresses", () => ({
  fetchCustomerAddresses: mocks.fetchCustomerAddresses,
  saveCustomerAddress: mocks.saveCustomerAddress,
  deleteCustomerAddress: mocks.deleteCustomerAddress,
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: vi.fn(),
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "address-customer@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const STAFF: TestUser = {
  ...CUSTOMER,
  id: "22222222-2222-4222-8222-222222222222",
  profileId: "f2222222-2222-4222-8222-222222222222",
  email: "address-staff@example.test",
  roles: ["admin"],
  isStaff: true,
};

function fillAddressFields(
  resolveInputForLabel: (label: string) => HTMLInputElement | HTMLTextAreaElement,
  values: Array<[string, string]>,
) {
  act(() => {
    for (const [label, value] of values) {
      fireEvent.change(resolveInputForLabel(label), { target: { value } });
    }
  });
}

describe("customer addresses real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.fetchCustomerAddresses.mockReset().mockResolvedValue([]);
    mocks.saveCustomerAddress.mockReset().mockResolvedValue("d1111111-1111-4111-8111-111111111111");
    mocks.deleteCustomerAddress.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function mountAddressesRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/addresses"] }),
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
    expect(router.state.location.pathname).toBe("/addresses");
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

  it("does not load customer addresses before guest authentication", async () => {
    await mountAddressesRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain("تسجيل الدخول مطلوب");
    expect(mocks.fetchCustomerAddresses).not.toHaveBeenCalled();
    expect(mocks.saveCustomerAddress).not.toHaveBeenCalled();
  });

  it("blocks staff from the customer address book before any address read", async () => {
    mocks.user = STAFF;
    await mountAddressesRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("هذه الشاشة مخصصة لحساب العميل");
    expect(mocks.fetchCustomerAddresses).not.toHaveBeenCalled();
    expect(mocks.saveCustomerAddress).not.toHaveBeenCalled();
    expect(mocks.deleteCustomerAddress).not.toHaveBeenCalled();
  });

  it("shows a failed address read and recovers through the real retry control", async () => {
    mocks.user = CUSTOMER;
    mocks.fetchCustomerAddresses
      .mockRejectedValueOnce(new Error("تعذر الوصول إلى دفتر العناوين"))
      .mockResolvedValueOnce([]);

    await mountAddressesRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر الوصول إلى دفتر العناوين");
    const retry = Array.from(host!.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("إعادة المحاولة"),
    );
    expect(retry).toBeDefined();

    await act(async () => {
      retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.fetchCustomerAddresses).toHaveBeenCalledTimes(2);
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(pageText()).toContain("لا توجد عناوين محفوظة بعد.");
  });

  it("keeps the user's draft and reports server rejection instead of showing save success", async () => {
    mocks.user = CUSTOMER;
    mocks.fetchCustomerAddresses.mockResolvedValue([]);
    mocks.saveCustomerAddress.mockRejectedValue(new Error("رفض الخادم التجريبي"));

    await mountAddressesRoute();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const values: Array<[string, string]> = [
      ["اسم العنوان", "المستودع الرئيسي"],
      ["اسم المستلم", "مؤسسة الاختبار"],
      ["رقم الهاتف", "+967777123456"],
      ["المدينة", "صنعاء"],
      ["العنوان التفصيلي", "شارع الاختبار، مبنى 12"],
    ];
    fillAddressFields(inputForLabel, values);

    const country = inputForLabel("رمز الدولة");
    act(() => fireEvent.change(country, { target: { value: "YE" } }));

    const save = Array.from(host!.querySelectorAll('button[type="submit"]')).find((button) =>
      button.textContent?.includes("حفظ العنوان"),
    );
    expect(save).toBeDefined();

    await act(async () => {
      fireEvent.click(save!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.saveCustomerAddress).toHaveBeenCalledTimes(1);
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("رفض الخادم التجريبي");
    expect(pageText()).not.toContain("تم حفظ عنوان التوصيل في الحساب.");
    expect(inputForLabel("اسم العنوان").value).toBe("المستودع الرئيسي");
  });
});
