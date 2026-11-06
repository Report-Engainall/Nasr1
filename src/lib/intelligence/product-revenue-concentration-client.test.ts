import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProductRevenueConcentration } from "./product-revenue-concentration-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const request = {
  from: "2026-10-01",
  to: "2026-10-31",
  asOf: "2026-11-01T00:00:00.000Z",
};
const row = {
  currency: "YER",
  status: "VERIFIED",
  invoiceCount: 1,
  invoiceLineCount: 2,
  productCount: 2,
  mappedLineCount: 2,
  unmappedLineCount: 0,
  invalidCreditLineCount: 0,
  invoicesWithoutLines: 0,
  grossInvoiceLineAmount: 1000,
  netInvoiceLineAmount: 900,
  top5NetInvoiceLineAmount: 600,
  top5ConcentrationPercent: 66.67,
};
const snapshot = (currencyRow: Record<string, unknown>) => ({
  status: "VERIFIED",
  asOf: request.asOf,
  period: { from: request.from, to: request.to },
  completePopulation: true,
  invoiceCount: 1,
  invoiceWithoutLinesCount: 0,
  currencyCount: 1,
  currencies: [currencyRow],
  formulaId: "nasr1.invoice-line-product-concentration-net-posted-credit-memos",
  formulaVersion: "1",
  formulaDescription: "net posted invoice line concentration",
  sideEffects: "NONE",
});

describe("product revenue concentration exact percentage arithmetic", () => {
  beforeEach(() => rpc.mockReset());

  it("accepts a percentage rounded exactly as the SQL source", async () => {
    rpc.mockResolvedValue({ data: snapshot(row), error: null });
    const result = await fetchProductRevenueConcentration(request);
    expect(result).toMatchObject({
      ok: true,
      snapshot: { currencies: [{ top5NetInvoiceLineAmount: 600, top5ConcentrationPercent: 66.67 }] },
    });
  });

  it("rejects a one-hundredth percentage-point mismatch", async () => {
    rpc.mockResolvedValue({
      data: snapshot({ ...row, top5ConcentrationPercent: 66.66 }),
      error: null,
    });
    expect(await fetchProductRevenueConcentration(request)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects a top-five amount above the net invoice-line total", async () => {
    rpc.mockResolvedValue({
      data: snapshot({ ...row, top5NetInvoiceLineAmount: 900.01 }),
      error: null,
    });
    expect(await fetchProductRevenueConcentration(request)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects a missing nullable percentage field instead of treating it as null", async () => {
    const malformed = { ...row } as Record<string, unknown>;
    delete malformed.top5ConcentrationPercent;
    rpc.mockResolvedValue({ data: snapshot(malformed), error: null });
    expect(await fetchProductRevenueConcentration(request)).toMatchObject({ ok: false, status: "ERROR" });
  });
});
