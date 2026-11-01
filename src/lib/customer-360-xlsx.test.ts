import { describe, expect, it } from "vitest";
import type { StaffCustomer360Summary } from "@/lib/customer-360-summary";
import { buildStaffCustomer360WorkbookXlsx } from "@/lib/customer-360-xlsx";

const CUSTOMER_FIXTURE: StaffCustomer360Summary["customer"] = {
  id: "11111111-1111-4111-8111-111111111111",
  customer_code: "000125",
  business_name: '=HYPERLINK("https://evil.invalid","open")',
  contact_name: "مسؤول المشتريات",
  phone: null,
  email: null,
  tier: "wholesale",
  status: "approved",
  current_balance: 375,
  credit_limit: 1000,
};

const ORDER_SUMMARY_FIXTURE: StaffCustomer360Summary["order_summary"] = {
  order_count: 40,
  pending_order_count: 2,
  fulfilled_order_count: 34,
  cancelled_order_count: 4,
  non_cancelled_order_value: 8500,
  average_order_value: 212.5,
  invalid_order_amount_count: 1,
  last_order_at: "2026-10-28T12:00:00.000Z",
  days_since_last_order: 1,
  average_days_between_orders: 8.5,
  status_distribution: [
    { status: "delivered", count: 34 },
    { status: "pending", count: 2 },
    { status: "cancelled", count: 4 },
  ],
};

const RECENT_ORDERS_FIXTURE: StaffCustomer360Summary["recent_orders"] = [{
  id: "order-1",
  order_number: "SO-0007",
  status: "delivered",
  total_amount: 500,
  total_items: 3,
  created_at: "2026-10-28T12:00:00.000Z",
}];

const RECENT_INVOICES_FIXTURE: StaffCustomer360Summary["recent_invoices"] = [{
  id: "invoice-1",
  invoice_number: "INV-0009",
  status: "issued",
  issued_at: "2026-10-28T12:00:00.000Z",
  due_at: null,
  currency: "YER",
  total_amount: 600,
  paid_amount: 250,
  credit_memo_amount: 25,
  outstanding_amount: 325,
}];

const RECENT_PAYMENTS_FIXTURE: StaffCustomer360Summary["recent_payments"] = [{
  id: "payment-1",
  invoice_id: "invoice-1",
  amount: 250,
  paid_at: "2026-10-28T13:00:00.000Z",
  payment_method: "cash",
}];

const FINANCE_BY_CURRENCY_FIXTURE: StaffCustomer360Summary["finance_by_currency"] = [
  {
    currency: "YER",
    invoice_count: 29,
    invoiced_total: 15000,
    paid_total: 10000,
    credit_memo_total: 125,
    outstanding_total: 4875,
    overdue_invoice_count: 4,
    overdue_outstanding: 900,
    unknown_due_date_invoice_count: 1,
    unknown_due_date_outstanding: 250,
    invalid_total_amount_count: 1,
  },
  {
    currency: "USD",
    invoice_count: 3,
    invoiced_total: null,
    paid_total: 0,
    credit_memo_total: 0,
    outstanding_total: null,
    overdue_invoice_count: 1,
    overdue_outstanding: null,
    unknown_due_date_invoice_count: 1,
    unknown_due_date_outstanding: null,
    invalid_total_amount_count: 1,
  },
];

const TOP_PRODUCTS_FIXTURE: StaffCustomer360Summary["top_products"] = [{
  item_code: "000125",
  product_name: "+CMD|payload",
  quantity: 6,
  sales: 600,
  last_purchased_at: "2026-10-28T12:00:00.000Z",
}];

const RECOMMENDATIONS_FIXTURE: StaffCustomer360Summary["recommendations"] = [{
  type: "overdue_follow_up",
  priority: "high",
  title: "متابعة التحصيل",
  description: "فواتير متأخرة بحسب بيانات السجل",
  action: "مراجعة كشف الحساب",
  currency: "YER",
  overdue_invoice_count: 4,
  overdue_outstanding: 900,
}];

function sample(): StaffCustomer360Summary {
  return {
    generated_at: "2026-10-29T12:00:00.000Z",
    customer: CUSTOMER_FIXTURE,
    order_summary: ORDER_SUMMARY_FIXTURE,
    recent_orders: RECENT_ORDERS_FIXTURE,
    recent_invoices: RECENT_INVOICES_FIXTURE,
    recent_payments: RECENT_PAYMENTS_FIXTURE,
    finance_by_currency: FINANCE_BY_CURRENCY_FIXTURE,
    top_products: TOP_PRODUCTS_FIXTURE,
    recommendations: RECOMMENDATIONS_FIXTURE,
  };
}

function unzipStore(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 30 < bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (view.getUint16(offset + 8, true) !== 0) throw new Error("Expected uncompressed ZIP entry.");
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    files.set(
      decoder.decode(bytes.slice(nameStart, nameStart + nameLength)),
      decoder.decode(bytes.slice(dataStart, dataStart + size)),
    );
    offset = dataStart + size;
  }
  return files;
}

describe("staff customer 360 XLSX export", () => {
  it("exports complete per-currency aggregates separately from latest-20 detail rows", () => {
    const files = unzipStore(buildStaffCustomer360WorkbookXlsx(sample()));
    const workbook = files.get("xl/workbook.xml") ?? "";
    const overview = files.get("xl/worksheets/sheet1.xml") ?? "";
    const finance = files.get("xl/worksheets/sheet2.xml") ?? "";
    const invoices = files.get("xl/worksheets/sheet4.xml") ?? "";
    expect(workbook).toContain('sheet name="حسب العملة"');
    expect(workbook).toContain('sheet name="آخر الفواتير"');
    expect(workbook).toContain('sheet name="توزيع الحالات"');
    expect(overview).toContain("أحدث 20 حركة");
    expect(overview).toContain("إجماليات الخادم الكاملة");
    expect(finance).toContain("USD");
    expect(finance).toContain("<v>29</v>");
    expect(finance).toContain("<v>15000</v>");
    // USD's complete-ledger outstanding value is unknown, not the numeric zero in paid_total.
    expect(finance).not.toContain('r="F3"');
    // The detail sheet has only the one latest invoice row despite the full-ledger count of 29.
    expect(invoices).toContain("INV-0009");
    expect(invoices).not.toContain("<v>29</v>");
    expect(files.size).toBe(14); // 6 package files + 8 worksheets.
  });

  it("keeps business IDs as strings, XML-escapes untrusted text and never emits formulas", () => {
    const files = unzipStore(buildStaffCustomer360WorkbookXlsx(sample()));
    const overview = files.get("xl/worksheets/sheet1.xml") ?? "";
    const products = files.get("xl/worksheets/sheet6.xml") ?? "";
    expect(overview).toContain("000125");
    expect(overview).toContain("&quot;https://evil.invalid&quot;");
    expect(products).toContain("000125");
    expect(products).toContain("+CMD|payload");
    for (const name of ["sheet1.xml", "sheet2.xml", "sheet3.xml", "sheet4.xml", "sheet5.xml", "sheet6.xml", "sheet7.xml", "sheet8.xml"]) {
      expect(files.get("xl/worksheets/" + name)).not.toMatch(/<f(?:\s|>)/);
    }
    expect(overview).not.toContain("cost_price");
    expect(overview).not.toContain("profit_margin");
    expect(products).not.toContain("cost_price");
    expect(products).not.toContain("profit_margin");
  });

  it("refuses to label an oversized recent-detail response as the latest-20 contract", () => {
    const input = sample();
    input.recent_orders = Array.from({ length: 21 }, (_value, index) => ({
      ...input.recent_orders[0],
      id: "order-" + String(index + 1),
      order_number: "SO-" + String(index + 1).padStart(4, "0"),
    }));
    expect(() => buildStaffCustomer360WorkbookXlsx(input)).toThrow(/حد آخر 20 حركة/);
  });
});
