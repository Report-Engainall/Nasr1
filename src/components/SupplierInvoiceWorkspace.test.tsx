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
    supplierName: "مَتْجَرُ الأَغْبَرِي",
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

const invoices = [
  invoice(),
  invoice({
    id: "55555555-5555-4555-8555-555555555555",
    supplierId: "66666666-6666-4666-8666-666666666666",
    purchaseOrderId: "77777777-7777-4777-8777-777777777777",
    purchaseOrderNumber: "PO-046",
    supplierName: "مؤسسة الميناء",
    invoiceNumber: "INV-002",
    matchStatus: "variance_pending",
    merchandiseVarianceAmount: "5.00",
  }),
];

describe("supplier invoice workspace register controls", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      sessionRevision: 1,
      user: {
        id: "manager-1",
        profileId: "manager-profile-1",
        roles: ["manager"],
      },
    });
    mocks.fetchWorkspace.mockResolvedValue({
      purchaseOrders: [],
      receivableLines: [],
      invoices,
      invoiceCount: 2,
      limit: 25,
      offset: 0,
      hasMore: false,
      asOfDate: "2026-11-16",
    });
    mocks.fetchDueDates.mockResolvedValue([]);
    mocks.fetchEvidence.mockResolvedValue([]);
  });

  async function mountWorkspace() {
    render(createElement(SupplierInvoiceWorkspace, {
      mode: "capture",
      accounts: [],
      purchaseOrders: [],
    }));
    await screen.findByRole("button", { name: /INV-001/ });
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(1));
  }

  it("searches supplier and invoice fields with Arabic normalization without another server request", async () => {
    await mountWorkspace();

    fireEvent.change(screen.getByRole("searchbox", { name: "بحث فواتير المورد" }), {
      target: { value: "الأَغْبَرِي INV-001" },
    });

    expect(screen.getByRole("button", { name: /INV-001/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /INV-002/ })).not.toBeInTheDocument();
    expect(screen.getByText(/نتائج الصفحة: 1 من 2/)).toBeInTheDocument();
    expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(1);
  });

  it("filters the current page by each server matching status", async () => {
    await mountWorkspace();

    fireEvent.change(screen.getByRole("combobox", { name: "تصفية حالة مطابقة فواتير المورد" }), {
      target: { value: "variance_pending" },
    });

    expect(screen.getByRole("button", { name: /INV-002/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /INV-001/ })).not.toBeInTheDocument();
    expect(screen.getByText(/نتائج الصفحة: 1 من 2/)).toBeInTheDocument();
    expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(1);
  });

  it("clears page filters when the authenticated identity changes", async () => {
    const props = {
      mode: "capture" as const,
      accounts: [],
      purchaseOrders: [] as const,
    };
    const { rerender } = render(createElement(SupplierInvoiceWorkspace, props));
    await screen.findByRole("button", { name: /INV-001/ });
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole("searchbox", { name: "بحث فواتير المورد" }), {
      target: { value: "INV-001" },
    });
    expect(screen.queryByRole("button", { name: /INV-002/ })).not.toBeInTheDocument();

    mocks.useAuth.mockReturnValue({
      sessionRevision: 2,
      user: {
        id: "manager-2",
        profileId: "manager-profile-2",
        roles: ["manager"],
      },
    });
    rerender(createElement(SupplierInvoiceWorkspace, props));

    expect(await screen.findByRole("button", { name: /INV-002/ })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "بحث فواتير المورد" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "تصفية حالة مطابقة فواتير المورد" })).toHaveValue("all");
    await waitFor(() => expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(2));
  });

  it("shows a real no-results state and restores the list when filters are cleared", async () => {
    await mountWorkspace();

    fireEvent.change(screen.getByRole("searchbox", { name: "بحث فواتير المورد" }), {
      target: { value: "رقم غير موجود" },
    });
    expect(await screen.findByText("لا توجد فواتير مطابقة لعبارة البحث وحالة المطابقة في هذه الصفحة.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "مسح البحث والتصفية" }));

    expect(await screen.findByRole("button", { name: /INV-001/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /INV-002/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "تصفية حالة مطابقة فواتير المورد" })).toHaveValue("all");
    expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(1);
  });
});
