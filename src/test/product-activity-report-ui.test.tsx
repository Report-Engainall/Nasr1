import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { StoreProductActivityReport } from "@/lib/product-activity-report";
import { projectProductActivityPrintDocument } from "@/lib/product-activity-print";

const mocks = vi.hoisted(() => ({
  downloadActivity: vi.fn(),
}));

vi.mock("@/lib/useFetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useFetch")>();
  return {
    ...actual,
    useFetch: () => ({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }),
  };
});

vi.mock("@/lib/product-activity-xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-activity-xlsx")>();
  return { ...actual, downloadProductActivityWorkbookXlsx: mocks.downloadActivity };
});

vi.mock("@/components/StaffDashboardMetrics", () => ({ StaffDashboardMetrics: () => null }));

import { ProductActivityReport } from "@/components/ExecutiveStoreAnalytics";

function reportFixture(): StoreProductActivityReport & {
  kpis: {
    total_orders: number;
    eligible_sales: number;
    pending_orders: number;
    orders_last_30_days: number;
    sales_last_30_days: number;
    customers_last_30_days: number;
    active_products: number;
  };
  sales_trend: Array<{ day: string; orders: number; sales: number }>;
  top_products: Array<{ item_code: string; product_name: string; quantity: number; sales: number }>;
  top_customers: Array<{ customer_id: string; customer_name: string; order_count: number; sales: number }>;
} {
  const products = Array.from({ length: 30 }, (_, index) => ({
    product_id: "product-" + (index + 1),
    item_code: String(index + 1).padStart(5, "0"),
    product_name: "صنف " + String(index + 1).padStart(2, "0"),
    unit: "كرتون",
    catalog_status: "active",
    activity_status: "stagnant_over_90_days" as const,
    sold_quantity_last_30_days: index,
    sold_quantity_last_90_days: index + 1,
    last_sold_at: "2026-06-01T10:00:00.000Z",
    days_since_last_sale: 120 + index,
    available_quantity: index === 4 ? null : index,
  }));
  return {
    generated_at: "2026-10-31T10:00:00.000Z",
    recent_days: 30,
    slow_days: 90,
    total_products: products.length,
    returned_products: products.length,
    truncated: false,
    summary: {
      active_last_30_days: 0,
      slow_moving_90_days: 0,
      stagnant_over_90_days: products.length,
      never_sold: 0,
      stock_unknown_count: 1,
    },
    products,
    kpis: {
      total_orders: 0,
      eligible_sales: 0,
      pending_orders: 0,
      orders_last_30_days: 0,
      sales_last_30_days: 0,
      customers_last_30_days: 0,
      active_products: products.length,
    },
    sales_trend: [],
    top_products: [],
    top_customers: [],
  };
}

beforeEach(() => {
  mocks.downloadActivity.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("product activity report interactive screen", () => {
  it("searches and sorts the current view, paginates 25 rows, and exports the full report", () => {
    const { container } = render(<ProductActivityReport reportOverride={reportFixture()} />);
    const reportPanel = container.querySelector('section[aria-labelledby="product-activity-title"]');
    expect(reportPanel).not.toBeNull();
    const view = within(reportPanel as HTMLElement);

    expect(view.getByRole("heading", { name: "حركة الأصناف والركود" })).toBeInTheDocument();
    expect(view.getByText("صنف 30")).toBeInTheDocument();
    expect(view.queryByText("صنف 05")).not.toBeInTheDocument();
    expect(view.getByText("صفحة ١ من ٢")).toBeInTheDocument();

    fireEvent.click(view.getByRole("button", { name: "التالي" }));
    expect(view.getByText("صنف 05")).toBeInTheDocument();
    expect(view.queryByText("صنف 30")).not.toBeInTheDocument();
    expect(view.getByText("صفحة ٢ من ٢")).toBeInTheDocument();

    const search = view.getByRole("searchbox", { name: "البحث في تقرير حركة الأصناف" });
    fireEvent.change(search, { target: { value: "00030" } });
    expect(view.getByText("صنف 30")).toBeInTheDocument();
    expect(view.queryByText("صنف 26")).not.toBeInTheDocument();
    expect(view.queryByRole("navigation", { name: "ترقيم صفحات تقرير حركة الأصناف" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    const sort = view.getByLabelText("ترتيب النتائج");
    fireEvent.change(sort, { target: { value: "sold_30_desc" } });
    const table = view.getByRole("table");
    const firstRow = within(table).getAllByRole("row")[1];
    expect(within(firstRow).getByText("صنف 30")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "صنف 30" } });
    fireEvent.click(view.getByRole("button", { name: "تنزيل Excel كامل (.xlsx)" }));
    expect(mocks.downloadActivity).toHaveBeenCalledTimes(1);
    expect((mocks.downloadActivity.mock.calls[0][0] as StoreProductActivityReport).products).toHaveLength(30);
  });

  it("prints every authorized product row, not only the current filtered or paginated view", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      expect(document.body.getAttribute("data-print-mode")).toBe("product-activity");
    });
    render(<ProductActivityReport reportOverride={reportFixture()} />);

    fireEvent.change(screen.getByLabelText("حالة الحركة"), { target: { value: "active_last_30_days" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "البحث في تقرير حركة الأصناف" }), { target: { value: "not-a-match" } });
    expect(screen.getByText("لا توجد أصناف مطابقة للبحث وحالة الحركة المحددة.")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "طباعة التقرير الكامل / PDF" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(printSpy).toHaveBeenCalledTimes(1);

    const sheet = screen.getByTestId("product-activity-print-document");
    expect(sheet.parentElement).toBe(document.body);
    expect(sheet.textContent).toContain("كامل — ٣٠ من ٣٠ صنفًا");
    expect(sheet.textContent).toContain("نشط آخر 30 يومًا");
    expect(sheet.textContent).toContain("راكد أكثر من 90 يومًا");
    expect(sheet.textContent).toContain("صنف 01");
    expect(sheet.textContent).toContain("صنف 30");
    expect(sheet.textContent).toContain("00001");
    expect(sheet.textContent).toContain("غير متاح");
    expect(sheet.querySelectorAll('[data-testid="product-activity-print-row"]')).toHaveLength(30);
    expect(sheet.innerHTML).not.toContain("product-1");
    expect(sheet.innerHTML).not.toContain("product_id");
    fireEvent(window, new Event("afterprint"));
    expect(document.body.hasAttribute("data-print-mode")).toBe(false);
  });

  it("keeps unknown stock as unknown and rejects a truncated report from printable output", () => {
    const report = reportFixture();
    const projected = projectProductActivityPrintDocument(report);
    expect(projected.products[4].availableQuantity).toBeNull();
    expect(projected.summary.stockUnknownCount).toBe(1);
    expect(JSON.stringify(projected)).not.toContain("product_id");
    expect(JSON.stringify(projected)).not.toContain("product-1");

    const incomplete = { ...report, total_products: 31, truncated: false };
    expect(() => projectProductActivityPrintDocument(incomplete)).toThrow(/غير مكتمل/);
    expect(() => projectProductActivityPrintDocument({ ...report, recent_days: 29 })).toThrow(/حدود التحليل/);
    expect(() => projectProductActivityPrintDocument({
      ...report, total_products: 5001, returned_products: 5001, truncated: false,
    })).toThrow(/5000 صنف/);
    expect(() => projectProductActivityPrintDocument({
      ...report, summary: { ...report.summary, stagnant_over_90_days: report.summary.stagnant_over_90_days - 1 },
    })).toThrow(/لا يطابق/);

    const truncated = { ...report, total_products: 5001, truncated: true };
    render(<ProductActivityReport reportOverride={truncated} />);
    const button = screen.getByRole("button", { name: "طباعة التقرير الكامل / PDF" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/تجاوز العدد حد التقرير البالغ 5000 صنف/)).toBeInTheDocument();
    expect(screen.queryByTestId("product-activity-print-document")).not.toBeInTheDocument();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    fireEvent.click(button);
    expect(printSpy).not.toHaveBeenCalled();
  });

  it("does not expose a print action as ready before report data is available", () => {
    render(<ProductActivityReport reportOverride={null} />);
    const button = screen.getByRole("button", { name: "طباعة التقرير الكامل / PDF" });
    expect(button).toBeDisabled();
    expect(screen.queryByTestId("product-activity-print-document")).not.toBeInTheDocument();
  });

});
