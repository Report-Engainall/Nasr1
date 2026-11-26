import type { SupplierInvoiceMatchStatus, SupplierInvoiceRecord } from "./supplier-invoices";

export type SupplierInvoiceWorkspaceStatusFilter = "all" | SupplierInvoiceMatchStatus;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search and filter the already loaded server page only.
 * Server pagination remains authoritative for the complete invoice register.
 */
export function filterSupplierInvoicePage(
  invoices: readonly SupplierInvoiceRecord[],
  query: string,
  status: SupplierInvoiceWorkspaceStatusFilter = "all",
): SupplierInvoiceRecord[] {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);

  return invoices.filter((invoice) => {
    if (status !== "all" && invoice.matchStatus !== status) return false;
    if (terms.length === 0) return true;

    const searchable = normalizeSearchText([
      invoice.id,
      invoice.invoiceNumber,
      invoice.supplierName,
      invoice.purchaseOrderNumber,
      invoice.invoiceDate,
    ].join(" "));

    return terms.every((term) => searchable.includes(term));
  });
}
