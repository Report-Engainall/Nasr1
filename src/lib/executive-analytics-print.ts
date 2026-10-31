import type { StoreExecutiveAnalytics } from "@/lib/executive-analytics";

export type ExecutiveAnalyticsPrintDocument = {
  generatedAt: string;
  kpis: {
    totalOrders: number;
    eligibleSales: number;
    pendingOrders: number;
    ordersLast30Days: number;
    salesLast30Days: number;
    customersLast30Days: number;
    activeProducts: number;
  };
  salesTrend: Array<{ day: string; orders: number; sales: number }>;
  topProducts: Array<{ itemCode: string; productName: string; quantity: number; sales: number }>;
  topCustomers: Array<{ customerName: string; orderCount: number; sales: number }>;
};

/**
 * Explicit admin report print projection. Internal customer IDs and raw server
 * objects are intentionally not copied into the printable document.
 */
export function projectExecutiveAnalyticsPrintDocument(
  source: StoreExecutiveAnalytics,
): ExecutiveAnalyticsPrintDocument | null {
  if (!source || !Number.isFinite(Date.parse(source.generated_at))) return null;

  return {
    generatedAt: source.generated_at,
    kpis: {
      totalOrders: source.kpis.total_orders,
      eligibleSales: source.kpis.eligible_sales,
      pendingOrders: source.kpis.pending_orders,
      ordersLast30Days: source.kpis.orders_last_30_days,
      salesLast30Days: source.kpis.sales_last_30_days,
      customersLast30Days: source.kpis.customers_last_30_days,
      activeProducts: source.kpis.active_products,
    },
    salesTrend: source.sales_trend.map((row) => ({
      day: row.day,
      orders: row.orders,
      sales: row.sales,
    })),
    topProducts: source.top_products.map((row) => ({
      itemCode: row.item_code,
      productName: row.product_name,
      quantity: row.quantity,
      sales: row.sales,
    })),
    topCustomers: source.top_customers.map((row) => ({
      customerName: row.customer_name,
      orderCount: row.order_count,
      sales: row.sales,
    })),
  };
}
