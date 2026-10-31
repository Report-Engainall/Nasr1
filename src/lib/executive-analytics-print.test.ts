import { describe, expect, it } from "vitest";
import { projectExecutiveAnalyticsPrintDocument } from "@/lib/executive-analytics-print";
import type { StoreExecutiveAnalytics } from "@/lib/executive-analytics";

const source = {
  generated_at: "2026-10-31T10:30:00.000Z",
  organization_id: "PRIVATE-TENANT-ID",
  internal_metadata: "PRIVATE-RAW-METADATA",
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
    { day: "2026-10-30", orders: 2, sales: 1200.25, cost: "PRIVATE-COST" },
    { day: "2026-10-31", orders: 3, sales: 6200, margin: "PRIVATE-MARGIN" },
  ],
  top_products: [
    { item_code: "000041", product_name: "سكر", quantity: 6, sales: 5400, cost_price: "PRIVATE-PRODUCT-COST" },
  ],
  top_customers: [
    { customer_id: "PRIVATE-CUSTOMER-ID", customer_name: "متجر صنعاء", order_count: 3, sales: 6200, margin: "PRIVATE-CUSTOMER-MARGIN" },
  ],
} as unknown as StoreExecutiveAnalytics;

describe("executive analytics printable projection", () => {
  it("projects all report rows and KPI values through an exact display allowlist", () => {
    const document = projectExecutiveAnalyticsPrintDocument(source);
    expect(document).not.toBeNull();
    expect(Object.keys(document!).sort()).toEqual([
      "generatedAt", "kpis", "salesTrend", "topProducts", "topCustomers",
    ].sort());
    expect(Object.keys(document!.kpis).sort()).toEqual([
      "totalOrders", "eligibleSales", "pendingOrders", "ordersLast30Days",
      "salesLast30Days", "customersLast30Days", "activeProducts",
    ].sort());
    expect(document!.salesTrend).toHaveLength(2);
    expect(document!.topProducts).toEqual([{
      itemCode: "000041", productName: "سكر", quantity: 6, sales: 5400,
    }]);
    expect(document!.topCustomers).toEqual([{
      customerName: "متجر صنعاء", orderCount: 3, sales: 6200,
    }]);
    const serialized = JSON.stringify(document);
    for (const privateValue of [
      "PRIVATE-TENANT-ID", "PRIVATE-RAW-METADATA", "PRIVATE-COST",
      "PRIVATE-MARGIN", "PRIVATE-PRODUCT-COST", "PRIVATE-CUSTOMER-ID",
      "PRIVATE-CUSTOMER-MARGIN", "organization_id", "customer_id",
    ]) expect(serialized).not.toContain(privateValue);
  });

  it("rejects a missing or invalid report timestamp rather than printing an untraceable report", () => {
    expect(projectExecutiveAnalyticsPrintDocument({
      ...source, generated_at: "not-a-date",
    } as unknown as StoreExecutiveAnalytics)).toBeNull();
  });
});
