import { describe, expect, it } from "vitest";
import { filterCustomerPaymentHistory } from "./customer-payment-history-filter";

const invoices = [
  { id: "invoice-1", invoice_number: "INV-123", currency: "YER" },
  { id: "invoice-2", invoice_number: "فاتورة-٤٥٦", currency: "USD" },
];

const payments = [
  { invoice_id: "invoice-1", amount: "125.50", paid_at: "2026-11-01T12:00:00.000Z" },
  { invoice_id: "invoice-2", amount: 75, paid_at: "2026-11-02T12:00:00.000Z" },
  { invoice_id: "invoice-outside-detail-window", amount: 999, paid_at: "2026-11-03T12:00:00.000Z" },
  { invoice_id: "invoice-1", amount: 10 },
];

function localDayIso(date: string, hour = 12): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, hour).toISOString();
}

describe("filterCustomerPaymentHistory", () => {
  it("filters by inclusive local calendar dates and excludes undated movements", () => {
    const result = filterCustomerPaymentHistory({
      payments: [
        { ...payments[0], paid_at: localDayIso("2026-11-01", 0) },
        { ...payments[1], paid_at: localDayIso("2026-11-01", 23) },
        { ...payments[2], paid_at: localDayIso("2026-11-02", 0) },
        payments[3],
      ],
      invoices,
      search: "",
      paidFrom: "2026-11-01",
      paidThrough: "2026-11-01",
    });
    expect(result.error).toBeNull();
    expect(result.active).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it("searches invoice references, Arabic digits, amount and currency", () => {
    expect(filterCustomerPaymentHistory({ payments, invoices, search: "INV-١٢٣" }).items).toEqual([payments[0], payments[3]]);
    expect(filterCustomerPaymentHistory({ payments, invoices, search: "١٢٥٫٥" }).items).toEqual([payments[0]]);
    expect(filterCustomerPaymentHistory({ payments, invoices, search: "yer" }).items).toEqual([payments[0], payments[3]]);
    expect(filterCustomerPaymentHistory({ payments, invoices, search: "فاتُورَة-456" }).items).toEqual([payments[1]]);
  });

  it("does not search amounts or currencies for payments whose invoice detail is unavailable", () => {
    expect(filterCustomerPaymentHistory({ payments, invoices, search: "999" }).items).toEqual([]);
    expect(filterCustomerPaymentHistory({ payments, invoices, search: "USD" }).items).toEqual([payments[1]]);
  });

  it("rejects invalid calendar dates and reversed ranges", () => {
    const invalid = filterCustomerPaymentHistory({ payments, invoices, search: "", paidFrom: "2026-02-30" });
    expect(invalid.items).toEqual([]);
    expect(invalid.error).toContain("غير صالح");
    const invalidEnd = filterCustomerPaymentHistory({ payments, invoices, search: "", paidThrough: "2026-02-30" });
    expect(invalidEnd.items).toEqual([]);
    expect(invalidEnd.error).toContain("غير صالح");
    const reversed = filterCustomerPaymentHistory({
      payments, invoices, search: "", paidFrom: "2026-11-03", paidThrough: "2026-11-01",
    });
    expect(reversed.items).toEqual([]);
    expect(reversed.error).toContain("البداية");
  });

  it("keeps an empty unfiltered result distinct from an active filter with no matches", () => {
    const empty = filterCustomerPaymentHistory({ payments: [], invoices, search: "" });
    const active = filterCustomerPaymentHistory({ payments: [], invoices, search: "missing" });
    expect(empty.active).toBe(false);
    expect(active.active).toBe(true);
    expect(empty.error).toBeNull();
    expect(active.items).toEqual([]);
  });
});
