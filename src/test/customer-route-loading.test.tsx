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
}));

vi.mock("@/components/CustomerOrders", () => ({
  OrderInvoice: () => null,
  MyOrders: () => null,
}));
vi.mock("@/components/CustomerWorkflows", () => ({
  CustomerInvoicesPage: () => null,
  CustomerStatementPage: () => null,
}));

import { Route as OrderDetailRoute } from "@/routes/orders.$id";
import { Route as OrdersIndexRoute } from "@/routes/orders.index";
import { Route as InvoicesRoute } from "@/routes/invoices";
import { Route as StatementRoute } from "@/routes/statement";

type RouteWithComponent = { options: { component: ComponentType } };
const customerRoutes = [
  { label: "order detail", route: OrderDetailRoute, expected: "جار تحميل تفاصيل الطلب..." },
  { label: "orders list", route: OrdersIndexRoute, expected: "جار تحميل طلباتك..." },
  { label: "invoices", route: InvoicesRoute, expected: "جار تحميل الفواتير..." },
  { label: "account statement", route: StatementRoute, expected: "جار تحميل كشف الحساب..." },
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
