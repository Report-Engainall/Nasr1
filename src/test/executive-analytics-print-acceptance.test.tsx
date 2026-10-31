import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreExecutiveAnalytics } from "@/lib/executive-analytics";
import { formatCurrency } from "@/lib/format";
import { ExecutiveStoreAnalytics } from "@/components/ExecutiveStoreAnalytics";

const mocks = vi.hoisted(() => ({
  fetchExecutive: vi.fn(),
  fetchProductActivity: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchStoreExecutiveAnalytics: mocks.fetchExecutive,
  fetchStoreProductActivityReport: mocks.fetchProductActivity,
}));

vi.mock("@/components/StaffDashboardMetrics", () => ({
  StaffDashboardMetrics: () => null,
}));

function makeTrend(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10);
    return { day, orders: index + 1, sales: (index + 1) * 125.5 };
  });
}

function makeAnalytics(days = 30): StoreExecutiveAnalytics {
  const value = {
    generated_at: "2026-10-31T18:30:00.000Z",
    kpis: {
      total_orders: 321,
      eligible_sales: 1234567.89,
      pending_orders: 12,
      orders_last_30_days: 98,
      sales_last_30_days: 987654.32,
      customers_last_30_days: 45,
      active_products: 67,
      cost_amount: 99112233,
      profit_margin: 554433,
    },
    sales_trend: makeTrend(days),
    top_products: [{
      item_code: "000125",
      product_name: "سكر ممتاز",
      quantity: 640,
      sales: 654321.25,
      product_id: "PRIVATE-PRODUCT-ID",
      organization_id: "PRIVATE-ORG-ID",
      cost_price: 887766,
      profit_margin: 778899,
    }],
    top_customers: [{
      customer_id: "PRIVATE-CUSTOMER-ID",
      customer_name: "مؤسسة الريادة",
      order_count: 17,
      sales: 321654.75,
      organization_id: "PRIVATE-ORG-ID",
      cost_amount: 887766,
      margin: 778899,
    }],
    organization_id: "PRIVATE-ORG-ID",
  };
  return value as unknown as StoreExecutiveAnalytics;
}

const productActivity = {
  generated_at: "2026-10-31T18:30:00.000Z",
  recent_days: 30,
  slow_days: 90,
  total_products: 0,
  returned_products: 0,
  truncated: false,
  summary: {
    active_last_30_days: 0,
    slow_moving_90_days: 0,
    stagnant_over_90_days: 0,
    never_sold: 0,
    stock_unknown_count: 0,
  },
  products: [],
};

describe("executive analytics print acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProductActivity.mockResolvedValue(productActivity);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("prints all server aggregate days, all executive KPIs and allowlisted top rows only", async () => {
    mocks.fetchExecutive.mockResolvedValue(makeAnalytics());
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);

    render(<ExecutiveStoreAnalytics />);

    const printButton = await screen.findByRole("button", { name: /طباعة التقرير التنفيذي.*PDF/ });
    await waitFor(() => expect(printButton).toBeEnabled());
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalledTimes(1);
    const sheet = screen.getByTestId("executive-analytics-print-document");
    expect(sheet.textContent).toContain("متجر الأغبري");
    expect(sheet.textContent).toContain("مبيعات آخر 30 يومًا");
    expect(sheet.textContent).toContain(formatCurrency(1234567.89));
    expect(sheet.textContent).toContain(formatCurrency(987654.32));
    expect(sheet.textContent).toContain("مؤسسة الريادة");
    expect(sheet.textContent).toContain("سكر ممتاز");
    expect(sheet.textContent).toContain("000125");
    expect(sheet.textContent).toContain(formatCurrency(654321.25));
    expect(sheet.querySelectorAll('[data-testid="executive-analytics-sales-row"]')).toHaveLength(30);
    expect(sheet.querySelectorAll('[data-testid="executive-analytics-forecast-row"]')).toHaveLength(7);
    expect(sheet.textContent).not.toContain("insufficient_history");

    for (const secret of [
      "PRIVATE-PRODUCT-ID", "PRIVATE-CUSTOMER-ID", "PRIVATE-ORG-ID",
      "887766", "778899", "99112233", "554433",
      "customer_id", "organization_id", "cost_price", "profit_margin", "margin",
    ]) {
      expect(sheet.innerHTML).not.toContain(secret);
    }
  });

  it("does not print when the server-backed report has not loaded", async () => {
    mocks.fetchExecutive.mockReturnValue(new Promise(() => undefined));
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);

    render(<ExecutiveStoreAnalytics />);

    const printButton = screen.getByRole("button", { name: /طباعة التقرير التنفيذي.*PDF/ });
    expect(printButton).toBeDisabled();
    fireEvent.click(printButton);
    expect(printSpy).not.toHaveBeenCalled();
  });

  it("prints the exact forecast-unavailable reason and never fabricates forecast values", async () => {
    mocks.fetchExecutive.mockResolvedValue(makeAnalytics(3));
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);

    render(<ExecutiveStoreAnalytics />);

    const printButton = await screen.findByRole("button", { name: /طباعة التقرير التنفيذي.*PDF/ });
    await waitFor(() => expect(printButton).toBeEnabled());
    fireEvent.click(printButton);

    const sheet = screen.getByTestId("executive-analytics-print-document");
    const unavailable = screen.getByTestId("executive-analytics-forecast-unavailable");
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(unavailable.textContent).toContain("insufficient_history");
    expect(unavailable.textContent).toContain("3");
    expect(unavailable.textContent).not.toContain("خط أساس تخطيطي:");
    expect(sheet.querySelectorAll('[data-testid="executive-analytics-forecast-row"]')).toHaveLength(0);
  });
});
