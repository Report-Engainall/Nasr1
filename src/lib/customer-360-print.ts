import type { StaffCustomer360Summary } from "@/lib/customer-360-summary";

const MAX_RECENT_DETAIL_ROWS = 20;

export type Customer360PrintDocument = {
  generatedAt: string;
  customer: {
    customerCode: string;
    businessName: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    currentBalance: number | null;
    creditLimit: number | null;
  };
  orders: {
    orderCount: number;
    pendingOrderCount: number;
    fulfilledOrderCount: number;
    cancelledOrderCount: number;
    nonCancelledOrderValue: number | null;
    averageOrderValue: number | null;
    invalidOrderAmountCount: number;
    lastOrderAt: string | null;
    daysSinceLastOrder: number | null;
    averageDaysBetweenOrders: number | null;
    overdueInvoiceCount: number;
  };
  statusDistribution: Array<{ status: string; count: number }>;
  financeByCurrency: Array<{
    currency: string;
    invoiceCount: number;
    invoicedTotal: number | null;
    paidTotal: number | null;
    creditMemoTotal: number;
    outstandingTotal: number | null;
    overdueInvoiceCount: number;
    overdueOutstanding: number | null;
    unknownDueDateInvoiceCount: number;
    unknownDueDateOutstanding: number | null;
    invalidTotalAmountCount: number;
  }>;
  topProducts: Array<{
    itemCode: string;
    productName: string;
    quantity: number;
    sales: number | null;
    lastPurchasedAt: string | null;
  }>;
  recentOrders: Array<{
    orderNumber: string;
    status: string;
    totalAmount: number | null;
    totalItems: number | null;
    createdAt: string;
  }>;
  recentInvoices: Array<{
    invoiceNumber: string;
    status: string;
    issuedAt: string | null;
    dueAt: string | null;
    currency: string;
    totalAmount: number | null;
    paidAmount: number;
    creditMemoAmount: number;
    outstandingAmount: number | null;
  }>;
  recentPayments: Array<{
    invoiceNumber: string;
    paidAt: string;
    paymentMethod: string | null;
    amount: number | null;
    currency: string | null;
  }>;
  recommendations: Array<{
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    action: string;
    currency: string | null;
    overdueInvoiceCount: number | null;
    overdueOutstanding: number | null;
    pendingOrderCount: number | null;
    daysSinceLastOrder: number | null;
  }>;
};

function validDate(value: string | null): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function validOptionalText(value: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validCurrency(value: string): string | null {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3,8}$/.test(currency) ? currency : null;
}

/**
 * Customer 360 print allowlist. This intentionally strips customer, tenant,
 * invoice, payment, order and product database identifiers before rendering.
 * Detail rows stay bounded to the same 20-row window shown in the UI.
 */
export function projectCustomer360PrintDocument(
  summary: StaffCustomer360Summary,
): Customer360PrintDocument | null {
  if (
    !validDate(summary.generated_at) ||
    summary.recent_orders.length > MAX_RECENT_DETAIL_ROWS ||
    summary.recent_invoices.length > MAX_RECENT_DETAIL_ROWS ||
    summary.recent_payments.length > MAX_RECENT_DETAIL_ROWS ||
    !validOptionalText(summary.customer.business_name) ||
    !validOptionalText(summary.customer.customer_code)
  ) {
    return null;
  }

  const invoiceById = new Map(summary.recent_invoices.map((invoice) => [invoice.id, invoice]));
  const overdueInvoiceCount = summary.finance_by_currency.reduce(
    (total, row) => total + row.overdue_invoice_count,
    0,
  );

  return {
    generatedAt: summary.generated_at,
    customer: {
      customerCode: summary.customer.customer_code,
      businessName: summary.customer.business_name,
      contactName: validOptionalText(summary.customer.contact_name),
      phone: validOptionalText(summary.customer.phone),
      email: validOptionalText(summary.customer.email),
      currentBalance: summary.customer.current_balance,
      creditLimit: summary.customer.credit_limit,
    },
    orders: {
      orderCount: summary.order_summary.order_count,
      pendingOrderCount: summary.order_summary.pending_order_count,
      fulfilledOrderCount: summary.order_summary.fulfilled_order_count,
      cancelledOrderCount: summary.order_summary.cancelled_order_count,
      nonCancelledOrderValue: summary.order_summary.non_cancelled_order_value,
      averageOrderValue: summary.order_summary.average_order_value,
      invalidOrderAmountCount: summary.order_summary.invalid_order_amount_count,
      lastOrderAt: validDate(summary.order_summary.last_order_at),
      daysSinceLastOrder: summary.order_summary.days_since_last_order,
      averageDaysBetweenOrders: summary.order_summary.average_days_between_orders,
      overdueInvoiceCount,
    },
    statusDistribution: summary.order_summary.status_distribution.map((row) => ({
      status: row.status,
      count: row.count,
    })),
    financeByCurrency: summary.finance_by_currency.map((row) => ({
      currency: row.currency,
      invoiceCount: row.invoice_count,
      invoicedTotal: row.invoiced_total,
      paidTotal: row.paid_total,
      creditMemoTotal: row.credit_memo_total,
      outstandingTotal: row.outstanding_total,
      overdueInvoiceCount: row.overdue_invoice_count,
      overdueOutstanding: row.overdue_outstanding,
      unknownDueDateInvoiceCount: row.unknown_due_date_invoice_count,
      unknownDueDateOutstanding: row.unknown_due_date_outstanding,
      invalidTotalAmountCount: row.invalid_total_amount_count,
    })),
    topProducts: summary.top_products.map((row) => ({
      itemCode: row.item_code,
      productName: row.product_name,
      quantity: row.quantity,
      sales: row.sales,
      lastPurchasedAt: validDate(row.last_purchased_at),
    })),
    recentOrders: summary.recent_orders.map((row) => ({
      orderNumber: row.order_number,
      status: row.status,
      totalAmount: row.total_amount,
      totalItems: row.total_items,
      createdAt: row.created_at,
    })),
    recentInvoices: summary.recent_invoices.map((row) => ({
      invoiceNumber: row.invoice_number,
      status: row.status,
      issuedAt: validDate(row.issued_at),
      dueAt: validDate(row.due_at),
      currency: validCurrency(row.currency) ?? row.currency,
      totalAmount: row.total_amount,
      paidAmount: row.paid_amount,
      creditMemoAmount: row.credit_memo_amount,
      outstandingAmount: row.outstanding_amount,
    })),
    recentPayments: summary.recent_payments.map((row) => {
      const relatedInvoice = invoiceById.get(row.invoice_id);
      const currency = relatedInvoice ? validCurrency(relatedInvoice.currency) : null;
      return {
        invoiceNumber: relatedInvoice?.invoice_number ?? "خارج أحدث 20 فاتورة",
        paidAt: row.paid_at,
        paymentMethod: validOptionalText(row.payment_method),
        // Never print an amount when its invoice (and therefore currency) is outside the detail window.
        amount: currency ? row.amount : null,
        currency,
      };
    }),
    recommendations: summary.recommendations.map((row) => ({
      priority: row.priority,
      title: row.title,
      description: row.description,
      action: row.action,
      currency: row.currency ? validCurrency(row.currency) : null,
      overdueInvoiceCount: row.overdue_invoice_count ?? null,
      overdueOutstanding: row.overdue_outstanding ?? null,
      pendingOrderCount: row.pending_order_count ?? null,
      daysSinceLastOrder: row.days_since_last_order ?? null,
    })),
  };
}
