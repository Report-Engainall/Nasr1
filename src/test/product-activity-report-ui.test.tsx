import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { fetchStoreProductActivityReport } from "@/lib/api";
import type { StoreProductActivityReport } from "@/lib/product-activity-report";

const mocks = vi.hoisted(() => ({
  downloadActivity: vi.fn(),
  report: null as unknown,
}));

vi.mock("@/lib/useFetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useFetch")>();
  return {
    ...actual,
    useFetch: (fetcher: unknown) => ({
      data: fetcher === fetchStoreProductActivityReport
        ? mocks.report
        : {
            generated_at: "2026-10-31T10:00:00.000Z",
            kpis: {
              total_orders: 0,
              eligible_sales: 0,
              pending_orders: 0,
              orders_last_30_days: 0,
              sales_last_30_days: 0,
              customers_last_30_days: 0,
              active_products: 0,
            },
            sales_trend: [],
            top_products: [],
            top_customers: [],
          },
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

import { ExecutiveStoreAnalytics } from "@/components/ExecutiveStoreAnalytics";

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
  mocks.report = reportFixture();
  mocks.downloadActivity.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("product activity report interactive screen", () => {
  it("searches and sorts the current view, paginates 25 rows, and exports the full report", () => {
    render(<ExecutiveStoreAnalytics />);

    expect(screen.getByRole("heading", { name: "حركة الأصناف والركود" })).toBeInTheDocument();
    expect(screen.getByText("صنف 01")).toBeInTheDocument();
    expect(screen.queryByText("صنف 26")).not.toBeInTheDocument();
    expect(screen.getByText("صفحة 1 من 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getByText("صنف 26")).toBeInTheDocument();
    expect(screen.queryByText("صنف 01")).not.toBeInTheDocument();
    expect(screen.getByText("صفحة 2 من 2")).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "البحث في تقرير حركة الأصناف" });
    fireEvent.change(search, { target: { value: "00030" } });
    expect(screen.getByText("صنف 30")).toBeInTheDocument();
    expect(screen.queryByText("صنف 26")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "ترقيم صفحات تقرير حركة الأصناف" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    const sort = screen.getByLabelText("ترتيب النتائج");
    fireEvent.change(sort, { target: { value: "sold_30_desc" } });
    const table = screen.getByRole("table");
    const firstRow = within(table).getAllByRole("row")[1];
    expect(within(firstRow).getByText("صنف 30")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "صنف 30" } });
    fireEvent.click(screen.getByRole("button", { name: "تنزيل Excel كامل (.xlsx)" }));
    expect(mocks.downloadActivity).toHaveBeenCalledTimes(1);
    expect((mocks.downloadActivity.mock.calls[0][0] as StoreProductActivityReport).products).toHaveLength(30);
  });
});
