import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: () => ({ id: "test-order" }),
  }),
  ClientOnly: ({ fallback }: { fallback?: ReactNode }) => fallback ?? null,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/Login", () => ({ Login: () => null }));
vi.mock("@/components/CustomerOrders", () => ({
  OrderInvoice: () => null,
  MyOrders: () => null,
}));
vi.mock("@/components/CustomerWorkflows", () => ({
  CustomerInvoicesPage: () => null,
  CustomerStatementPage: () => null,
  CommerceAssistantPage: () => null,
  BarcodeWorkspacePage: () => null,
  OfflineWorkspacePage: () => null,
  QuoteWorkspacePage: () => null,
  ReorderWorkspacePage: () => null,
}));

import { Route as OrderDetailRoute } from "@/routes/orders.$id";
import { Route as OrdersIndexRoute } from "@/routes/orders.index";
import { Route as InvoicesRoute } from "@/routes/invoices";
import { Route as StatementRoute } from "@/routes/statement";
import { Route as AssistantRoute } from "@/routes/assistant";
import { Route as BarcodeRoute } from "@/routes/barcode";
import { Route as OfflineRoute } from "@/routes/offline";
import { Route as LoginRoute } from "@/routes/login";
import { Route as ForgotPasswordRoute } from "@/routes/forgot-password";
import { Route as RegisterRoute } from "@/routes/register";
import { Route as QuotesRoute } from "@/routes/quotes";
import { Route as ReorderRoute } from "@/routes/reorder";

type RouteWithComponent = { options: { component: ComponentType } };
const customerRoutes = [
  { label: "order detail", route: OrderDetailRoute, expected: "جار تحميل تفاصيل الطلب..." },
  { label: "orders list", route: OrdersIndexRoute, expected: "جار تحميل طلباتك..." },
  { label: "invoices", route: InvoicesRoute, expected: "جار تحميل الفواتير..." },
  { label: "account statement", route: StatementRoute, expected: "جار تحميل كشف الحساب..." },
  { label: "assistant", route: AssistantRoute, expected: "جار تحميل المساعد الذكي..." },
  { label: "barcode scanner", route: BarcodeRoute, expected: "جار تحميل ماسح الباركود..." },
  { label: "offline workspace", route: OfflineRoute, expected: "جار تحميل مساحة العمل دون اتصال..." },
  { label: "login", route: LoginRoute, expected: "جار تحميل تسجيل الدخول..." },
  { label: "forgot password", route: ForgotPasswordRoute, expected: "جار تحميل استعادة كلمة المرور..." },
  { label: "registration", route: RegisterRoute, expected: "جار تحميل إنشاء الحساب..." },
  { label: "quotes workspace", route: QuotesRoute, expected: "جار تحميل عروض الأسعار..." },
  { label: "reorder workspace", route: ReorderRoute, expected: "جار تحميل قائمة إعادة الطلب..." },
] as const;

afterEach(() => cleanup());

describe("customer route hydration loading states", () => {
  it.each(customerRoutes)("$label exposes an Arabic RTL loading status", ({ route, expected }) => {
    const component = (route as unknown as RouteWithComponent).options.component;
    render(createElement(component));
    const status = screen.getByRole("status");
    expect(status.tagName).toBe("MAIN");
    expect(status).toHaveAttribute("dir", "rtl");
    expect(status).toHaveTextContent(expected);
  });
});
