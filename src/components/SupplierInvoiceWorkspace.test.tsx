// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupplierInvoiceRecord } from "@/lib/supplier-invoices";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  fetchPurchaseOrders: vi.fn(),
  fetchWorkspace: vi.fn(),
  fetchDueDates: vi.fn(),
  fetchEvidence: vi.fn(),
  recordInvoice: vi.fn(),
  reviewVariance: vi.fn(),
  fetchAccountingStatus: vi.fn(),
  prepareAccountingDraft: vi.fn(),
  recordDueDate: vi.fn(),
  uploadEvidence: vi.fn(),
  signedEvidenceUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/api", () => ({ fetchPurchaseOrders: mocks.fetchPurchaseOrders }));
vi.mock("@/lib/supplier-invoices", () => ({
  fetchSupplierInvoiceWorkspace: mocks.fetchWorkspace,
  recordSupplierInvoice: mocks.recordInvoice,
  reviewSupplierInvoiceVariance: mocks.reviewVariance,
  fetchSupplierInvoiceAccountingStatus: mocks.fetchAccountingStatus,
  prepareSupplierInvoiceAccountingDraft: mocks.prepareAccountingDraft,
  fetchSupplierInvoiceEvidence: mocks.fetchEvidence,
  fetchSupplierInvoiceDueDates: mocks.fetchDueDates,
  recordSupplierInvoiceDueDate: mocks.recordDueDate,
  uploadSupplierInvoiceEvidence: mocks.uploadEvidence,
  createSupplierInvoiceEvidenceSignedUrl: mocks.signedEvidenceUrl,
}));
vi.mock("@/lib/supplier-invoice-accounting-print", () => ({
  projectSupplierInvoiceAccountingPrintDocument: vi.fn(),
}));
vi.mock("@/lib/supplier-invoice-accounting-xlsx", () => ({
  downloadSupplierInvoiceAccountingWorkbookXlsx: vi.fn(),
}));
vi.mock("@/components/SupplierInvoiceAccountingPrintSheet", () => ({
  SupplierInvoiceAccountingPrintSheet: () => null,
}));

import { SupplierInvoiceWorkspace } from "./SupplierInvoiceWorkspace";

function invoice(overrides: Partial<SupplierInvoiceRecord> = {}): SupplierInvoiceRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    purchaseOrderId: "22222222-2222-4222-8222-222222222222",
    purchaseOrderNumber: "PO-045",
    supplierId: "33333333-3333-4333-8333-333333333333",
    supplierName: "مؤسسة الميناء",
    invoiceNumber: "INV-001",
    invoiceDate: "2026-11-15",
    currency: "YER",
    merchandiseSubtotal: "100.00",
    taxAmount: "0.00",
    invoiceTotalAmount: "100.00",
    expectedMerchandiseSubtotal: "100.00",
    merchandiseVarianceAmount: "0.00",
    matchStatus: "matched",
    taxAccountingStatus: "not_required",
    createdByProfileId: "44444444-4444-4444-8444-444444444444",
    createdAt: "2026-11-15T10:00:00.000Z",
    reviewedByProfileId: null,
    reviewedAt: null,
    reviewReason: null,
    lines: [],
    history: [],
    ...overrides,
  };
}

const invoices = Array.from({ length: 27 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  const numericId = String(index + 1).padStart(8, "0");
  const numericTail = String(index + 1).padStart(12, "0");
  return invoice({
    id: numericId + "-1111-4111-8111-" + numericTail,
    invoiceNumber: "INV-" + number,
    purchaseOrderNumber: "PO-" + String(index + 45).padStart(3, "0"),
    supplierName: index === 25 ? "مَتْجَرُ الأَغْبَرِي" : "مؤسسة الميناء",
    matchStatus: index === 26 ? "variance_pending" : "matched",
    merchandiseVarianceAmount: index === 26 ? "5.00" : "0.00",
    createdAt: "2026-11-15T10:" + String(index).padStart(2, "0") + ":00.000Z",
  });
});

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, " ").trim();
}

describe("supplier invoice server-side register search", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      sessionRevision: 1,
      user: { id: "manager-1", profileId: "manager-profile-1", roles: ["manager"] },
    });
    mocks.fetchWorkspace.mockImplementation(async (input: {
      search?: string;
      matchStatus?: string;
      limit?: number;
      offset?: number;
    } = {}) => {
      const limit = input.limit ?? 25;
      const offset = input.offset ?? 0;
      const terms = normalize(input.search ?? "").split(" ").filter(Boolean);
      const filtered = invoices.filter((row) => {
        if (input.matchStatus && input.matchStatus !== "all" && row.matchStatus !== input.matchStatus) return false;
        const searchable = normalize([
          row.id, row.invoiceNumber, row.supplierName, row.purchaseOrderNumber, row.invoiceDate,
        ].join(" "));
        return terms.every((term) => searchable.includes(term));
      });
      return {
        purchaseOrders: [],
        receivableLines: [],
        invoices: filtered.slice(offset, offset + limit),
        invoiceCount: filtered.length,
        limit,
        offset,
        hasMore: filtered.length > offset + limit,
        asOfDate: "2026-11-16",
      };
    });
    mocks.fetchDueDates.mockResolvedValue([]);
    mocks.fetchEvidence.mockResolvedValue([]);
  });

  async function mountWorkspace(initialInvoiceId?: string) {
    render(createElement(SupplierInvoiceWorkspace, {
      mode: "capture",
      accounts: [],
      purchaseOrders: [],
      initialInvoiceId,
    }));
    await screen.findByRole("button", { name: /INV-001/ });
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(1));
  }

  it("searches records beyond page one and normalizes Arabic diacritics, hamza and digits", async () => {
    await mountWorkspace();
    expect(screen.queryByRole("button", { name: /INV-026/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "بحث فواتير المورد" }), {
      target: { value: "الأَغْبَرِي INV-٠٢٦" },
    });

    expect(await screen.findByRole("button", { name: /INV-026/ })).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "الأَغْبَرِي INV-٠٢٦", matchStatus: "all", offset: 0, limit: 25 }),
    ));
    expect(screen.getByText(/إجمالي النتائج المطابقة في السجل: 1/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /INV-001/ })).not.toBeInTheDocument();
  });

  it("applies matching status to the complete register rather than the visible page", async () => {
    await mountWorkspace();
    expect(screen.queryByRole("button", { name: /INV-027/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حالة مطابقة فواتير المورد" }), {
      target: { value: "variance_pending" },
    });

    expect(await screen.findByRole("button", { name: /INV-027/ })).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ matchStatus: "variance_pending", offset: 0, limit: 25 }),
    ));
    expect(screen.getByText(/إجمالي النتائج المطابقة في السجل: 1/)).toBeInTheDocument();
  });

  it("opens a linked invoice by UUID through the same server-side search", async () => {
    const linked = invoices[25];
    await mountWorkspace(linked.id);

    expect(await screen.findByRole("button", { name: /INV-026/ })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: linked.id, matchStatus: "all", offset: 0 }),
    ));
    expect(screen.queryByRole("button", { name: /INV-001/ })).not.toBeInTheDocument();
  });

  it("shows a global no-results state and clears filters by reloading page one", async () => {
    await mountWorkspace();

    fireEvent.change(screen.getByRole("searchbox", { name: "بحث فواتير المورد" }), {
      target: { value: "رقم لا يوجد" },
    });
    expect(await screen.findByText(
      "لا توجد فواتير مطابقة لعبارة البحث وحالة المطابقة في كامل السجل.",
    )).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث والتصفية" }));
    expect(await screen.findByRole("button", { name: /INV-001/ })).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "", matchStatus: "all", offset: 0 }),
    ));
  });

  it("preserves active search and status while paging through server-filtered records", async () => {
    await mountWorkspace();

    fireEvent.change(screen.getByRole("searchbox", { name: "بحث فواتير المورد" }), {
      target: { value: "INV" },
    });
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "INV", matchStatus: "all", offset: 0 }),
    ));

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "INV", matchStatus: "all", offset: 25 }),
    ));
    expect(await screen.findByRole("button", { name: /INV-026/ })).toBeInTheDocument();
  });

  it("clears a previous user's search and status when the authenticated identity changes", async () => {
    const props = { mode: "capture" as const, accounts: [], purchaseOrders: [] as const };
    render(createElement(SupplierInvoiceWorkspace, props));
    await screen.findByRole("button", { name: /INV-001/ });

    fireEvent.change(screen.getByRole("searchbox", { name: "بحث فواتير المورد" }), {
      target: { value: "INV-026" },
    });
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "INV-026", matchStatus: "all" }),
    ));

    mocks.useAuth.mockReturnValue({
      sessionRevision: 2,
      user: { id: "manager-2", profileId: "manager-profile-2", roles: ["manager"] },
    });
    const { rerender } = render(createElement(SupplierInvoiceWorkspace, props));
    rerender(createElement(SupplierInvoiceWorkspace, props));

    expect(await screen.findByRole("button", { name: /INV-001/ })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "بحث فواتير المورد" })).toHaveValue("");
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "", matchStatus: "all", offset: 0 }),
    ));
  });
});
