import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchProductGrossMargin, parseProductGrossMarginSnapshot } from "./product-gross-margin-client";

const asOf = "2026-11-26T03:00:00.000Z";
const request = { from: "2026-10-28", to: "2026-11-26", asOf };
const productRef = "7f8d9c11-1234-4abc-8abc-1234567890ab";
const formulaId = "nasr1.product-gross-margin.invoice-line-net-batch-cogs";
const evidenceIds = [
  "product-gross-margin:" + productRef + ":invoice-lines",
  "product-gross-margin:" + productRef + ":shipment-batches",
  "product-gross-margin:" + productRef + ":receipt-costs",
];

function product(overrides: Record<string, unknown> = {}) {
  return {
    productRef,
    productLabel: "أرز بسمتي",
    currency: "YER",
    currencyCount: 1,
    unitOfMeasure: "EA",
    unitVariantCount: 1,
    status: "VERIFIED",
    invoiceCount: 4,
    invoiceLineCount: 4,
    invoicedQuantity: "10.000",
    grossInvoiceLineAmount: "125.00",
    postedCreditAmount: "5.00",
    netRevenue: "120.00",
    expectedShippedQuantity: "10.000",
    actualShippedQuantity: "10.000",
    saleMovementCount: 6,
    uncostedMovementCount: 0,
    costOfGoodsSold: "75.00",
    grossProfit: "45.00",
    grossMarginPercent: "37.50",
    hasReturns: false,
    evidenceIds,
    formulaId,
    formulaVersion: "1",
    warnings: [],
    ...overrides,
  };
}

function evidence(id: string, name: string) {
  return {
    id,
    source: { kind: "RPC", name, version: "1" },
    sourceTimestamp: asOf,
    asOf,
    period: { from: request.from, to: request.to },
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    currency: "YER",
    warnings: [],
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    status: "VERIFIED",
    asOf,
    period: { from: request.from, to: request.to },
    completePopulation: true,
    invoiceCount: 4,
    invoiceLineCount: 4,
    invoicesWithoutLinesCount: 0,
    unmappedLineCount: 0,
    invalidCreditLineCount: 0,
    productCount: 1,
    verifiedProductCount: 1,
    currency: "YER",
    products: [product()],
    evidenceRecords: [
      evidence(evidenceIds[0], "customer_invoice_items_net_posted_credit_memos"),
      evidence(evidenceIds[1], "inventory_sale_movements_batch_lineage"),
      evidence(evidenceIds[2], "purchase_receipt_items_cost_lineage"),
    ],
    formulaId,
    formulaVersion: "1",
    formulaDescription: "Net invoiced amount less posted credits and fully traceable shipped sale batch costs.",
    sourceTables: [
      "customer_invoices", "customer_invoice_items", "customer_return_credit_memos",
      "customer_return_credit_memo_items", "customer_return_request_items",
      "customer_return_receipt_items", "customer_return_receipts", "orders", "order_items",
      "inventory_movements", "inventory_batches", "purchase_receipt_items", "purchase_receipts", "purchase_order_items",
    ],
    sideEffects: "NONE",
    ...overrides,
  };
}

describe("product gross margin client", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("parses gross profit only when invoice revenue, posted credits and receipt-rooted shipment cost reconcile", async () => {
    mocks.rpc.mockResolvedValue({ data: response(), error: null });
    const result = await fetchProductGrossMargin(request);

    expect(mocks.rpc).toHaveBeenCalledWith("fetch_product_gross_margin_by_invoice_source", {
      p_from: request.from,
      p_to: request.to,
      p_as_of: asOf,
    });
    expect(result).toMatchObject({
      ok: true,
      snapshot: {
        status: "VERIFIED",
        completePopulation: true,
        products: [{
          productRef,
          grossInvoiceLineAmount: 125,
          postedCreditAmount: 5,
          netRevenue: 120,
          expectedShippedQuantity: 10,
          actualShippedQuantity: 10,
          costOfGoodsSold: 75,
          grossProfit: 45,
          grossMarginPercent: 37.5,
          status: "VERIFIED",
        }],
      },
    });
  });

  it("rejects a revenue arithmetic mismatch", () => {
    const result = parseProductGrossMarginSnapshot(
      response({ products: [product({ netRevenue: "119.99" })] }),
      request,
    );
    expect(result).toBeNull();
  });

  it("rejects a gross profit that does not equal net revenue less COGS", () => {
    const result = parseProductGrossMarginSnapshot(
      response({ products: [product({ grossProfit: "44.99" })] }),
      request,
    );
    expect(result).toBeNull();
  });

  it("rejects a gross margin percentage that does not reconcile to verified gross profit", () => {
    const result = parseProductGrossMarginSnapshot(
      response({ products: [product({ grossMarginPercent: "37.49" })] }),
      request,
    );
    expect(result).toBeNull();
  });

  it("rejects verified profit if a product has physical returns", () => {
    const result = parseProductGrossMarginSnapshot(
      response({ products: [product({ hasReturns: true })] }),
      request,
    );
    expect(result).toBeNull();
  });

  it("rejects a verified profit when the shipment quantity differs from invoiced quantity", () => {
    const result = parseProductGrossMarginSnapshot(
      response({ products: [product({ actualShippedQuantity: "9.000" })] }),
      request,
    );
    expect(result).toBeNull();
  });

  it("accepts a partial row with withheld COGS and gross profit for an unattributed shipment lot", () => {
    const partial = product({
      status: "NEEDS_REVIEW",
      costOfGoodsSold: null,
      grossProfit: null,
      grossMarginPercent: null,
      uncostedMovementCount: 2,
      warnings: ["SALE_BATCH_COST_NOT_FULLY_TRACEABLE_TO_PURCHASE_RECEIPT"],
    });
    const raw = response({
      status: "PARTIAL",
      completePopulation: false,
      verifiedProductCount: 0,
      products: [partial],
      evidenceRecords: [
        evidence(evidenceIds[0], "customer_invoice_items_net_posted_credit_memos"),
        { ...evidence(evidenceIds[1], "inventory_sale_movements_batch_lineage"), status: "NEEDS_REVIEW", completeness: "PARTIAL", quality: "WARNINGS", warnings: ["SALE_BATCH_COST_NOT_FULLY_TRACEABLE_TO_PURCHASE_RECEIPT"] },
        { ...evidence(evidenceIds[2], "purchase_receipt_items_cost_lineage"), status: "NEEDS_REVIEW", completeness: "PARTIAL", quality: "WARNINGS", warnings: ["PURCHASE_RECEIPT_COST_LINEAGE_INCOMPLETE"] },
      ],
    });
    const parsed = parseProductGrossMarginSnapshot(raw, request);
    expect(parsed).not.toBeNull();
    expect(parsed?.products[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      netRevenue: 120,
      costOfGoodsSold: null,
      grossProfit: null,
      grossMarginPercent: null,
    });
  });

  it("accepts a verified empty invoice population without inventing zero-margin products", () => {
    const empty = response({
      status: "EMPTY",
      completePopulation: true,
      invoiceCount: 0,
      invoiceLineCount: 0,
      invoicesWithoutLinesCount: 0,
      productCount: 0,
      verifiedProductCount: 0,
      products: [],
      evidenceRecords: [],
    });
    expect(parseProductGrossMarginSnapshot(empty, request)).toMatchObject({
      status: "EMPTY",
      completePopulation: true,
      products: [],
    });
  });

  it("denies an unauthorized reader and does not query another source", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(fetchProductGrossMargin(request))
      .resolves.toMatchObject({ ok: false, status: "DENIED" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing migration function unavailable instead of returning an empty margin report", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function does not exist" },
    });
    await expect(fetchProductGrossMargin(request))
      .resolves.toMatchObject({ ok: false, status: "UNAVAILABLE" });
  });

  it("rejects an impossible date before querying the RPC", async () => {
    const result = await fetchProductGrossMargin({ ...request, from: "2026-02-31" });
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects future as-of snapshot day mismatches before querying the RPC", async () => {
    const result = await fetchProductGrossMargin({
      ...request,
      asOf: "2026-11-27T01:00:00.000Z",
    });
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
