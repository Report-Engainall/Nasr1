import { describe, expect, it } from "vitest";
import {
  filterCustomerPaymentHistory,
  parseCustomerPaymentHistoryPayload,
} from "./customer-payment-history-filter";

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

const statementInvoiceId = "10000000-0000-4000-8000-000000000001";
const statementPaymentId = "20000000-0000-4000-8000-000000000001";
const statementInvoiceId2 = "10000000-0000-4000-8000-000000000002";
const statementPaymentId2 = "20000000-0000-4000-8000-000000000002";

describe("parseCustomerPaymentHistoryPayload", () => {
  const validPayload = () => ({
    invoices: [{
      id: statementInvoiceId,
      invoice_number: " INV-100 ",
      currency: "YER",
      customer_id: "private-customer-id",
      organization_id: "private-tenant-id",
      total_amount: "999999.99",
    }],
    payments: [{
      id: statementPaymentId,
      invoice_id: statementInvoiceId,
      amount: "125.50",
      paid_at: "2026-11-01T12:00:00.000Z",
      organization_id: "private-tenant-id",
      reference: "must-not-be-projected",
    }],
  });

  it("projects only validated invoice references and payment fields", () => {
    expect(parseCustomerPaymentHistoryPayload(validPayload())).toEqual({
      invoices: [{ id: statementInvoiceId, invoice_number: "INV-100", currency: "YER" }],
      payments: [{
        id: statementPaymentId,
        invoice_id: statementInvoiceId,
        amount: "125.50",
        paid_at: "2026-11-01T12:00:00.000Z",
      }],
    });
  });

  it("accepts a payment whose invoice is outside the bounded invoice detail page", () => {
    const payload = validPayload();
    payload.payments[0].invoice_id = "10000000-0000-4000-8000-000000000099";
    expect(parseCustomerPaymentHistoryPayload(payload).payments[0]?.invoice_id)
      .toBe("10000000-0000-4000-8000-000000000099");
  });

  it("enforces both server detail bounds and requires actual arrays", () => {
    const payload = validPayload();
    expect(() => parseCustomerPaymentHistoryPayload({ ...payload, invoices: new Array(201).fill(payload.invoices[0]) }))
      .toThrow("حدود القراءة");
    expect(() => parseCustomerPaymentHistoryPayload({ ...payload, payments: new Array(501).fill(payload.payments[0]) }))
      .toThrow("حدود القراءة");
    expect(() => parseCustomerPaymentHistoryPayload({ invoices: {}, payments: [] })).toThrow();
    expect(() => parseCustomerPaymentHistoryPayload(null)).toThrow();
  });

  it("rejects malformed or duplicated invoice identities and incomplete references", () => {
    const payload = validPayload();
    expect(() => parseCustomerPaymentHistoryPayload({
      ...payload, invoices: [{ ...payload.invoices[0], id: "invoice-1" }],
    })).toThrow("تفاصيل الفاتورة");
    expect(() => parseCustomerPaymentHistoryPayload({
      ...payload,
      invoices: [payload.invoices[0], { ...payload.invoices[0], invoice_number: "INV-101" }],
    })).toThrow("تفاصيل الفاتورة");
    expect(() => parseCustomerPaymentHistoryPayload({
      ...payload, invoices: [{ ...payload.invoices[0], invoice_number: " " }],
    })).toThrow("تفاصيل الفاتورة");
    expect(() => parseCustomerPaymentHistoryPayload({
      ...payload, invoices: [{ ...payload.invoices[0], currency: "yer" }],
    })).toThrow("تفاصيل الفاتورة");
  });

  it("rejects malformed, duplicated and unreferenced payment identifiers", () => {
    const payload = validPayload();
    expect(() => parseCustomerPaymentHistoryPayload({
      ...payload, payments: [{ ...payload.payments[0], id: "payment-1" }],
    })).toThrow("حركة الدفع");
    expect(() => parseCustomerPaymentHistoryPayload({
      ...payload,
      payments: [payload.payments[0], { ...payload.payments[0], amount: "12.00" }],
    })).toThrow("حركة الدفع");
    expect(() => parseCustomerPaymentHistoryPayload({
      ...payload, payments: [{ ...payload.payments[0], invoice_id: "missing-invoice-id" }],
    })).toThrow("حركة الدفع");
  });

  it("rejects invalid monetary values instead of coercing them to zero or rounded amounts", () => {
    for (const amount of ["", " ", "-1.00", "1e3", "12.345", "10000000000000.00", Number.NaN, Number.POSITIVE_INFINITY]) {
      const payload = validPayload();
      payload.payments[0].amount = amount as string;
      expect(() => parseCustomerPaymentHistoryPayload(payload), String(amount)).toThrow("حركة الدفع");
    }
  });

  it("accepts a null or omitted paid_at, but rejects invalid non-null timestamps", () => {
    const omitted = validPayload();
    delete (omitted.payments[0] as Partial<typeof omitted.payments[0]>).paid_at;
    expect(parseCustomerPaymentHistoryPayload(omitted).payments[0]).toEqual({
      id: statementPaymentId, invoice_id: statementInvoiceId, amount: "125.50",
    });

    const nullable = validPayload();
    nullable.payments[0].paid_at = null as unknown as string;
    expect(parseCustomerPaymentHistoryPayload(nullable).payments[0]?.paid_at).toBeUndefined();

    const malformed = validPayload();
    malformed.payments[0].paid_at = "yesterday";
    expect(() => parseCustomerPaymentHistoryPayload(malformed)).toThrow("حركة الدفع");
  });
});
