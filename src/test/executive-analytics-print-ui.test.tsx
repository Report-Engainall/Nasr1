import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExecutiveStoreAnalytics } from "@/components/ExecutiveStoreAnalytics";
import type { StoreExecutiveAnalytics } from "@/lib/executive-analytics";
import { formatCurrency } from "@/lib/format";

vi.mock("@/lib/useFetch", () => ({
  useFetch: () => ({
    data: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/api", () => ({
  fetchStoreExecutiveAnalytics: vi.fn(),
  fetchStoreProductActivityReport: vi.fn(),
}));
vi.mock("@/components/StaffDashboardMetrics", () => ({
  StaffDashboardMetrics: () => null,
}));
vi.mock("@/components/AdminPages", () => ({
  Empty: ({ text }: { text: string }) => <p>{text}</p>,
  ErrorBox: ({ message }: { message: string }) => <p role="alert">{message}</p>,
  Loading: () => <p>تحميل</p>,
}));
vi.mock("@/lib/executive-analytics-xlsx", () => ({
  downloadExecutiveAnalyticsWorkbookXlsx: vi.fn(),
}));
vi.mock("@/lib/product-activity-xlsx", () => ({
  downloadProductActivityWorkbookXlsx: vi.fn(),
}));

const report = {
  generated_at: "2026-10-31T10:30:00.000Z",
  organization_id: "PRIVATE-TENANT-ID",
  kpis: {
    total_orders: 8,
    eligible_sales: 8450.5,
    pending_orders: 2,
    orders_last_30_days: 5,
    sales_last_30_days: 6200,
    customers_last_30_days: 4,
    active_products: 17,
  },
  sales_trend: [
    { day: "2026-10-30", orders: 2, sales: 1200.25 },
    { day: "2026-10-31", orders: 3, sales: 6200 },
  ],
  top_products: [
    { item_code: "000041", product_name: "سكر", quantity: 6, sales: 5400, cost_price: "PRIVATE-COST" },
  ],
  top_customers: [
    { customer_id: "PRIVATE-CUSTOMER-ID", customer_name: "متجر صنعاء", order_count: 3, sales: 6200, margin: "PRIVATE-MARGIN" },
  ],
} as unknown as StoreExecutiveAnalytics;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("executive analytics PDF/print interface", () => {
  it("prints the full server aggregate through the approved display fields only", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<ExecutiveStoreAnalytics analyticsOverride={report} />);

    const printButton = screen.getByRole("button", { name: /طباعة التحليل التنفيذي PDF/ });
    expect(printButton).toBeEnabled();
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalledTimes(1);
    const document = screen.getByTestId("executive-analytics-print-document");
    expect(document).toHaveTextContent("متجر الأغبري");
    expect(document).toHaveTextContent(formatCurrency(report.kpis.eligible_sales));
    expect(document).toHaveTextContent("سكر");
    expect(document).toHaveTextContent("متجر صنعاء");
    expect(document).toHaveTextContent(formatCurrency(1200.25));
    expect(document).toHaveTextContent(formatCurrency(6200));
    expect(document).toHaveTextContent("التنبؤ غير متاح");
    expect(document).toHaveTextContent("21 يومًا متتاليًا");

    const trendTable = document.querySelector('[data-testid="executive-print-sales-trend"]');
    expect(trendTable?.querySelectorAll("tbody tr")).toHaveLength(2);
    const serialized = document.innerHTML;
    for (const privateValue of [
      "PRIVATE-TENANT-ID", "PRIVATE-CUSTOMER-ID", "PRIVATE-COST", "PRIVATE-MARGIN",
    ]) expect(serialized).not.toContain(privateValue);
    const forbiddenAttributes = new Set([
      "organization_id", "customer_id", "product_id", "cost_price", "margin", "profit_margin",
    ]);
    const attributeNames = Array.from(document.querySelectorAll("*"))
      .flatMap((element) => Array.from(element.attributes, (attribute) => attribute.name));
    expect(attributeNames.some((name) => forbiddenAttributes.has(name))).toBe(false);
  });

  it("does not allow printing when tenant-scoped analytics have not loaded", () => {
    render(<ExecutiveStoreAnalytics analyticsOverride={null} />);
    expect(screen.getByRole("button", { name: /طباعة التحليل التنفيذي PDF/ })).toBeDisabled();
  });
});
