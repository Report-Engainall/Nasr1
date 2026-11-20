import { describe, expect, it } from "vitest";
import {
  SUPPLIER_INVOICE_SERVICE_UNAVAILABLE_MESSAGE,
  supplierInvoiceUnavailableMessage,
} from "./supplier-invoice-messages";

describe("supplierInvoiceUnavailableMessage", () => {
  it("explains a missing PostgREST function without naming a development platform", () => {
    const message = supplierInvoiceUnavailableMessage({
      code: "PGRST202",
      message: "Could not find the function in the schema cache",
    });

    expect(message).toBe(SUPPLIER_INVOICE_SERVICE_UNAVAILABLE_MESSAGE);
    expect(message).not.toMatch(/bolt|vercel/i);
  });

  it("handles PostgreSQL missing-function errors consistently", () => {
    expect(supplierInvoiceUnavailableMessage({ code: "42883" }))
      .toBe(SUPPLIER_INVOICE_SERVICE_UNAVAILABLE_MESSAGE);
    expect(supplierInvoiceUnavailableMessage({
      message: "function public.fetch_purchase_supplier_invoice_workspace does not exist",
    })).toBe(SUPPLIER_INVOICE_SERVICE_UNAVAILABLE_MESSAGE);
  });

  it("preserves useful non-schema error messages", () => {
    expect(supplierInvoiceUnavailableMessage(new Error("انتهت مهلة الاتصال.")))
      .toBe("انتهت مهلة الاتصال.");
  });

  it("fails closed with a stable fallback for unknown error shapes", () => {
    expect(supplierInvoiceUnavailableMessage(null))
      .toBe("تعذر تحميل مساحة فواتير الموردين.");
    expect(supplierInvoiceUnavailableMessage({ code: 500 }))
      .toBe("تعذر تحميل مساحة فواتير الموردين.");
  });
});
