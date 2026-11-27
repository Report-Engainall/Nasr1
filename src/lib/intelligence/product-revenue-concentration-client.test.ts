import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchProductRevenueConcentration } from "./product-revenue-concentration-client";

const request = {
  from: "2026-11-01",
  to: "2026-11-27",
  asOf: "2026-11-28T12:00:00.123456Z",
};
const formulaId = "nasr1.invoice-line-product-concentration-net-posted-credit-memos";

function currency(overrides: Record<string, unknown> = {}) {
  return {
    currency: "YER",
    status: "VERIFIED",
    invoiceCount: 3,
    invoiceLineCount: 10,
    productCount: 5,
    mappedLineCount: 10,
    unmappedLineCount: 0,
    invalidCreditLineCount: 0,
    invoicesWithoutLines: 0,
    grossInvoiceLineAmount: "1200.00",
    netInvoiceLineAmount: "1000.00",
    top5NetInvoiceLineAmount: "800.00",
    top5ConcentrationPercent: 80,
    ...overrides,
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    status: "VERIFIED",
    asOf: request.asOf,
    period: { from: request.from, to: request.to },
    completePopulation: true,
    invoiceCount: 3,
    invoiceWithoutLinesCount: 0,
    currencyCount: 1,
    currencies: [currency()],
    formulaId,
    formulaVersion: "1",
    formulaDescription: "Net posted invoice-line revenue concentration by product.",
    sideEffects: "NONE",
    ...overrides,
  };
}

describe("product revenue concentration client evidence contract", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("fetches the authenticated source and returns reconciled currency metrics", async () => {
    mocks.rpc.mockResolvedValue({ data: response(), error: null });

    const result = await fetchProductRevenueConcentration(request);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_business_health_product_revenue_concentration", {
      p_from: request.from,
      p_to: request.to,
      p_as_of: request.asOf,
    });
    expect(result).toMatchObject({
      ok: true,
      snapshot: {
        status: "VERIFIED",
        completePopulation: true,
        invoiceCount: 3,
        currencyCount: 1,
        currencies: [{
          currency: "YER",
          grossInvoiceLineAmount: 1200,
          netInvoiceLineAmount: 1000,
          top5NetInvoiceLineAmount: 800,
          top5ConcentrationPercent: 80,
        }],
      },
    });
  });

  it("accepts the same exact microsecond instant expressed with a different UTC offset", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({ asOf: "2026-11-28T14:00:00.123456+02:00" }),
      error: null,
    });

    await expect(fetchProductRevenueConcentration(request)).resolves.toMatchObject({ ok: true });
  });

  it("rejects an as-of mismatch that Date.parse would collapse to the same millisecond", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({ asOf: "2026-11-28T12:00:00.123457Z" }),
      error: null,
    });

    await expect(fetchProductRevenueConcentration(request)).resolves.toMatchObject({
      ok: false,
      status: "ERROR",
    });
  });

  it("accepts the largest valid ISO UTC offset", async () => {
    const asOf = "2026-11-28T12:00:00.123456+14:00";
    mocks.rpc.mockResolvedValue({ data: response({ asOf }), error: null });

    await expect(fetchProductRevenueConcentration({ ...request, asOf })).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ["offset beyond fourteen hours", "2026-11-28T12:00:00.123456+15:00"],
    ["fourteen-hour offset with extra minutes", "2026-11-28T12:00:00.123456+14:01"],
    ["twenty-three-hour offset", "2026-11-28T12:00:00.123456+23:59"],
    ["more than PostgreSQL microsecond precision", "2026-11-28T12:00:00.1234567Z"],
    ["timezone-less timestamp", "2026-11-28T12:00:00.123456"],
    ["impossible calendar date", "2026-02-31T12:00:00.123456Z"],
  ])("rejects %s before contacting the RPC", async (_label, asOf) => {
    const result = await fetchProductRevenueConcentration({ ...request, asOf });

    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["reversed period", { from: "2026-11-27", to: "2026-11-01" }],
    ["impossible start date", { from: "2026-02-31", to: "2026-03-01" }],
    ["period beyond 365 days", { from: "2025-10-31", to: "2026-11-01" }],
  ])("rejects an invalid %s before contacting the RPC", async (_label, period) => {
    const result = await fetchProductRevenueConcentration({ ...request, ...period });

    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves an honest partial population and withholds all concentration values", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({
        status: "PARTIAL",
        completePopulation: false,
        invoiceWithoutLinesCount: 1,
        currencies: [currency({
          status: "PARTIAL",
          invoicesWithoutLines: 1,
          mappedLineCount: 9,
          unmappedLineCount: 1,
          netInvoiceLineAmount: null,
          top5NetInvoiceLineAmount: null,
          top5ConcentrationPercent: null,
        })],
      }),
      error: null,
    });

    await expect(fetchProductRevenueConcentration(request)).resolves.toMatchObject({
      ok: true,
      snapshot: {
        status: "PARTIAL",
        completePopulation: false,
        currencies: [{
          status: "PARTIAL",
          netInvoiceLineAmount: null,
          top5NetInvoiceLineAmount: null,
          top5ConcentrationPercent: null,
        }],
      },
    });
  });

  it("represents an empty source distinctly from an unavailable source", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({
        status: "EMPTY",
        invoiceCount: 0,
        currencyCount: 0,
        currencies: [],
      }),
      error: null,
    });

    await expect(fetchProductRevenueConcentration(request)).resolves.toMatchObject({
      ok: true,
      snapshot: { status: "EMPTY", currencyCount: 0, currencies: [] },
    });
  });

  it.each([
    ["unauthorized reader", { code: "42501" }, "DENIED"],
    ["missing RPC", { code: "PGRST202" }, "UNAVAILABLE"],
    ["unexpected source error", { code: "XX000" }, "ERROR"],
  ])("preserves the %s source state", async (_label, error, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(fetchProductRevenueConcentration(request)).resolves.toMatchObject({
      ok: false,
      status,
    });
  });

  it.each([
    ["future or different snapshot", response({ asOf: "2026-11-28T12:00:01.000000Z" })],
    ["wrong reporting period", response({ period: { from: "2026-11-02", to: request.to } })],
    ["wrong formula identity", response({ formulaId: "another.formula" })],
    ["side-effecting source", response({ sideEffects: "WRITES" })],
    ["duplicate currency", response({ currencyCount: 2, currencies: [currency(), currency()] })],
    ["non-standard currency", response({ currencies: [currency({ currency: "YER1" })] })],
    ["unbalanced line coverage", response({ currencies: [currency({ mappedLineCount: 9, unmappedLineCount: 0 })] })],
    ["top-five amount / percentage mismatch", response({ currencies: [currency({ top5NetInvoiceLineAmount: "799.90" })] })],
    ["one-hundredth concentration mismatch", response({ currencies: [currency({ top5ConcentrationPercent: 80.01 })] })],
    ["partial row leaking a concentration", response({
      status: "PARTIAL",
      completePopulation: false,
      currencies: [currency({ status: "PARTIAL", unmappedLineCount: 1, mappedLineCount: 9 })],
    })],
    ["aggregate invoice count mismatch", response({ invoiceCount: 4 })],
    ["zero currency count with a populated row", response({ currencyCount: 0 })],
  ])("rejects %s and withholds the result", async (_label, payload) => {
    mocks.rpc.mockResolvedValue({ data: payload, error: null });

    await expect(fetchProductRevenueConcentration(request)).resolves.toMatchObject({
      ok: false,
      status: "ERROR",
    });
  });

  it("maps thrown transport failures to UNAVAILABLE without substituting data", async () => {
    mocks.rpc.mockImplementation(() => { throw new Error("network unavailable"); });

    await expect(fetchProductRevenueConcentration(request)).resolves.toMatchObject({
      ok: false,
      status: "UNAVAILABLE",
    });
  });
});
