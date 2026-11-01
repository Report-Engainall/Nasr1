import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Customer360PrintSheet } from "@/components/Customer360PrintSheet";
import type { Customer360PrintDocument } from "@/lib/customer-360-print";

function makeDocument(
  recentOrders: Customer360PrintDocument["recentOrders"],
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
  };
}

describe("Customer360PrintSheet recent order rows", () => {
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

    expect(screen.getAllByTestId("customer-360-print-order-row")).toHaveLength(2);
    expect(screen.getByText("ORD-001")).toBeInTheDocument();
    expect(screen.getByText("ORD-002")).toBeInTheDocument();
  });

  it("renders the empty state when there are no recent orders", () => {
    render(<Customer360PrintSheet document={makeDocument([])} />);

    expect(screen.getByText("لا توجد طلبات حديثة.")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-360-print-order-row")).not.toBeInTheDocument();
  });
});
