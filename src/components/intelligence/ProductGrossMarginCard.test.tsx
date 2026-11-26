// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductGrossMarginSnapshot } from "@/lib/intelligence/product-gross-margin-client";
import { ProductGrossMarginCard } from "./ProductGrossMarginCard";

const snapshot: ProductGrossMarginSnapshot = {
  status: "VERIFIED",
  asOf: "2026-11-26T03:00:00.000Z",
  period: { from: "2026-10-28", to: "2026-11-26" },
  completePopulation: true,
  invoiceCount: 4,
  invoiceLineCount: 4,
  invoicesWithoutLinesCount: 0,
  unmappedLineCount: 0,
  invalidCreditLineCount: 0,
  productCount: 1,
  verifiedProductCount: 1,
  currency: "YER",
  products: [{
    productRef: "7f8d9c11-1234-4abc-8abc-1234567890ab",
    productLabel: "أرز بسمتي",
    currency: "YER",
    currencyCount: 1,
    unitOfMeasure: "EA",
    unitVariantCount: 1,
    status: "VERIFIED",
    invoiceCount: 4,
    invoiceLineCount: 4,
    invoicedQuantity: 10,
    grossInvoiceLineAmount: 125,
    postedCreditAmount: 5,
    netRevenue: 120,
    expectedShippedQuantity: 10,
    actualShippedQuantity: 10,
    saleMovementCount: 6,
    uncostedMovementCount: 0,
    costOfGoodsSold: 75,
    grossProfit: 45,
    grossMarginPercent: 37.5,
    hasReturns: false,
    evidenceIds: [
      "product-gross-margin:7f8d9c11-1234-4abc-8abc-1234567890ab:invoice-lines",
      "product-gross-margin:7f8d9c11-1234-4abc-8abc-1234567890ab:shipment-batches",
      "product-gross-margin:7f8d9c11-1234-4abc-8abc-1234567890ab:receipt-costs",
    ],
    formulaId: "nasr1.product-gross-margin.invoice-line-net-batch-cogs",
    formulaVersion: "1",
    warnings: [],
  }],
  evidenceRecords: [],
  formulaId: "nasr1.product-gross-margin.invoice-line-net-batch-cogs",
  formulaVersion: "1",
  formulaDescription: "Net invoice lines less posted returns and shipped batch COGS.",
  sourceTables: ["customer_invoices", "customer_invoice_items", "customer_return_credit_memos", "customer_return_credit_memo_items", "orders", "order_items", "inventory_movements", "inventory_batches", "purchase_receipt_items", "purchase_receipts", "purchase_order_items"],
};

describe("ProductGrossMarginCard", () => {
  afterEach(() => cleanup());

  it("renders invoice revenue, sourced COGS, gross profit and margin for verified rows", () => {
    render(<ProductGrossMarginCard result={{ ok: true, snapshot }} state="ready" />);
    const region = screen.getByRole("region", { name: "الربحية الإجمالية حسب المنتج" });
    expect(within(region).getByText("أرز بسمتي")).toBeInTheDocument();
    expect(within(region).getByText("ربحية مثبتة")).toBeInTheDocument();
    expect(within(region).getByText(/37.50%/)).toBeInTheDocument();
    expect(within(region).getByText(/لا يمثل صافي ربح الشركة/)).toBeInTheDocument();
  });

  it("withholds gross profit and COGS when a product row is not verified", () => {
    const partial: ProductGrossMarginSnapshot = {
      ...snapshot,
      status: "PARTIAL",
      completePopulation: false,
      verifiedProductCount: 0,
      products: [{
        ...snapshot.products[0],
        status: "NEEDS_REVIEW",
        costOfGoodsSold: null,
        grossProfit: null,
        grossMarginPercent: null,
        uncostedMovementCount: 1,
        warnings: ["SALE_BATCH_COST_NOT_FULLY_TRACEABLE_TO_PURCHASE_RECEIPT"],
      }],
    };
    render(<ProductGrossMarginCard result={{ ok: true, snapshot: partial }} state="ready" />);
    const region = screen.getByRole("region", { name: "الربحية الإجمالية حسب المنتج" });
    expect(within(region).getByText("الربحية محجوبة")).toBeInTheDocument();
    expect(within(region).getAllByText(/محجوب/).length).toBeGreaterThan(0);
  });

  it("shows a denied finance source without manufacturing financial figures", () => {
    render(
      <ProductGrossMarginCard
        result={{ ok: false, status: "DENIED", message: "لا تملك صلاحية قراءة ربحية المنتجات." }}
        state="error"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("لا تملك صلاحية قراءة ربحية المنتجات.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("does not show totals for an empty source", () => {
    render(<ProductGrossMarginCard result={{ ok: true, snapshot: { ...snapshot, status: "EMPTY", invoiceCount: 0, invoiceLineCount: 0, productCount: 0, verifiedProductCount: 0, products: [], evidenceRecords: [] } }} state="ready" />);
    expect(screen.getByText("لا توجد فواتير صادرة ضمن هذه الفترة")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
