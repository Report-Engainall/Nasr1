// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Customer360PrintSheet } from "@/components/Customer360PrintSheet";
import type { Customer360PrintDocument } from "@/lib/customer-360-print";

function makeDocument(
  recentOrders: Customer360PrintDocument["recentOrders"],
  interactions: Customer360PrintDocument["interactions"] = [],
): Customer360PrintDocument {
  return {
    generatedAt: "2026-11-01T10:00:00.000Z",
    customer: {
      businessName: "شركة الاختبار",
      customerCode: "C-100",
      tier: "retail",
      status: "active",
      currentBalance: null,
      creditLimit: null,
    },
    orderSummary: {
      orderCount: recentOrders.length,
      pendingOrderCount: 0,
      fulfilledOrderCount: recentOrders.length,
      cancelledOrderCount: 0,
      nonCancelledOrderValue: null,
      averageOrderValue: null,
      invalidOrderAmountCount: 0,
      lastOrderAt: null,
      daysSinceLastOrder: null,
      averageDaysBetweenOrders: null,
      statusDistribution: [],
    },
    recentOrders,
    recentInvoices: [],
    recentPayments: [],
    financeByCurrency: [],
    topProducts: [],
    recommendations: [],
    interactions,
  };
}

describe("Customer360PrintSheet recent order rows", () => {
  afterEach(() => cleanup());
  it("renders every supplied recent order row", () => {
    render(
      <Customer360PrintSheet
        document={makeDocument([
          {
            orderNumber: "ORD-001",
            status: "delivered",
            totalAmount: null,
            totalItems: 2,
            createdAt: "2026-10-30T10:00:00.000Z",
          },
          {
            orderNumber: "ORD-002",
            status: "pending",
            totalAmount: 125,
            totalItems: 1,
            createdAt: "2026-10-31T10:00:00.000Z",
          },
        ])}
      />,
    );

    const rows = screen.getAllByTestId("customer-360-print-order-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("ORD-001");
    expect(rows[1]).toHaveTextContent("ORD-002");
    expect(screen.getByText("ORD-002")).toBeInTheDocument();
  });

  it("renders the empty state when there are no recent orders", () => {
    render(<Customer360PrintSheet document={makeDocument([])} />);

    expect(screen.getByText("لا توجد طلبات حديثة.")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-360-print-order-row")).not.toBeInTheDocument();
  });

  it("prints all bounded interaction fields including the creation timestamp", () => {
    render(
      <Customer360PrintSheet
        document={makeDocument([], [{
          interactionType: "whatsapp",
          subject: "متابعة طلب الأرز",
          details: "تم الاتفاق على إعادة التواصل غدًا",
          interactionAt: "2026-10-30T09:15:00.000Z",
          nextFollowUpAt: "2026-10-31T10:30:00.000Z",
          createdAt: "2026-10-30T09:20:00.000Z",
          recordedByName: "موظف المبيعات",
        }])}
      />,
    );

    expect(screen.getByText("وقت التسجيل")).toBeInTheDocument();
    expect(screen.getByText("وقت التواصل")).toBeInTheDocument();
    expect(screen.getByText("سُجل بواسطة")).toBeInTheDocument();
    const rows = screen.getAllByTestId("customer-360-print-interaction-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("متابعة طلب الأرز");
    expect(rows[0]).toHaveTextContent("تم الاتفاق على إعادة التواصل غدًا");
    expect(rows[0]).toHaveTextContent("موظف المبيعات");
    expect(rows[0]).toHaveTextContent(new Intl.DateTimeFormat("ar-YE", { dateStyle: "short", timeStyle: "short" }).format(new Date("2026-10-30T09:15:00.000Z")));
    expect(rows[0]).toHaveTextContent(new Intl.DateTimeFormat("ar-YE", { dateStyle: "short", timeStyle: "short" }).format(new Date("2026-10-30T09:20:00.000Z")));
    expect(rows[0]).toHaveTextContent(new Intl.DateTimeFormat("ar-YE", { dateStyle: "short", timeStyle: "short" }).format(new Date("2026-10-31T10:30:00.000Z")));
  });

});