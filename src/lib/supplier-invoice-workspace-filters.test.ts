import { describe, expect, it } from "vitest";
import type { SupplierInvoiceRecord } from "./supplier-invoices";
import { filterSupplierInvoicePage } from "./supplier-invoice-workspace-filters";

function invoice(overrides: Partial<SupplierInvoiceRecord> = {}): SupplierInvoiceRecord {
  return {
    id: "invoice-1",
    purchaseOrderId: "po-1",
    purchaseOrderNumber: "PO-045",
    supplierId: "supplier-1",
    supplierName: "مَتْجَرُ الأَغْبَرِي",
    invoiceNumber: "INV-2026-٠٠٢",
    invoiceDate: "2026-11-15",
    currency: "YER",
    merchandiseSubtotal: "100.00",
    taxAmount: "0.00",
    invoiceTotalAmount: "100.00",
    expectedMerchandiseSubtotal: "100.00",
    merchandiseVarianceAmount: "0.00",
    matchStatus: "matched",
    taxAccountingStatus: "not_required",
    createdByProfileId: "creator-1",
    createdAt: "2026-11-15T10:00:00.000Z",
    reviewedByProfileId: null,
    reviewedAt: null,
    reviewReason: null,
    lines: [],
    history: [],
    ...overrides,
  };
}

describe("supplier invoice page filters", () => {
  it("preserves server order when search is empty and all statuses are selected", () => {
    const rows = [
      invoice({ id: "first" }),
      invoice({ id: "second", matchStatus: "variance_pending" }),
      invoice({ id: "third", matchStatus: "variance_rejected" }),
    ];

    const result = filterSupplierInvoicePage(rows, "   ", "all");

    expect(result).toEqual(rows);
    expect(result[0]).toBe(rows[0]);
    expect(result[1]).toBe(rows[1]);
    expect(result[2]).toBe(rows[2]);
  });

  it("matches Arabic supplier names regardless of tashkeel and hamza spelling", () => {
    const row = invoice();

    expect(filterSupplierInvoicePage([row], "متجر الاغبري")).toEqual([row]);
    expect(filterSupplierInvoicePage([row], "الأَغْبَرِي")).toEqual([row]);
  });

  it("matches a supplier invoice record by its UUID reference", () => {
    const row = invoice({ id: "11111111-1111-4111-8111-111111111111" });

    expect(filterSupplierInvoicePage([row], row.id)).toEqual([row]);
  });

  it("matches multi-word queries across invoice number and purchase order fields", () => {
    const row = invoice({ supplierName: "مؤسسة الساحل", invoiceNumber: "SUP-045" });

    expect(filterSupplierInvoicePage([row], "SUP-045 الساحل PO-045")).toEqual([row]);
    expect(filterSupplierInvoicePage([row], "SUP-045 مدينة")).toEqual([]);
  });

  it("normalizes Arabic-Indic invoice digits for search", () => {
    const row = invoice();

    expect(filterSupplierInvoicePage([row], "INV-2026-002")).toEqual([row]);
  });

  it("filters each review outcome without changing the source list", () => {
    const rows = [
      invoice({ id: "matched", matchStatus: "matched" }),
      invoice({ id: "pending", matchStatus: "variance_pending" }),
      invoice({ id: "approved", matchStatus: "variance_approved" }),
      invoice({ id: "rejected", matchStatus: "variance_rejected" }),
    ];

    expect(filterSupplierInvoicePage(rows, "", "variance_pending").map((row) => row.id)).toEqual(["pending"]);
    expect(filterSupplierInvoicePage(rows, "", "variance_approved").map((row) => row.id)).toEqual(["approved"]);
    expect(filterSupplierInvoicePage(rows, "", "variance_rejected").map((row) => row.id)).toEqual(["rejected"]);
    expect(filterSupplierInvoicePage(rows, "", "matched").map((row) => row.id)).toEqual(["matched"]);
    expect(rows.map((row) => row.id)).toEqual(["matched", "pending", "approved", "rejected"]);
  });

  it("requires every normalized query term to match the invoice search fields", () => {
    const rows = [
      invoice({ id: "one", invoiceNumber: "INV-001", supplierName: "مؤسسة صنعاء" }),
      invoice({ id: "two", invoiceNumber: "INV-002", supplierName: "مؤسسة عدن" }),
    ];

    expect(filterSupplierInvoicePage(rows, "مؤسسة صنعاء")).toEqual([rows[0]]);
    expect(filterSupplierInvoicePage(rows, "مؤسسة تعز")).toEqual([]);
  });
});
