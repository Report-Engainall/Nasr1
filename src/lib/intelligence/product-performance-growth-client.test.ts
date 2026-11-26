import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchProductPerformanceGrowthContext } from "./product-performance-growth-client";

const asOf = "2026-11-26T02:45:47.000Z";
const productRef = "7f8d9c11-1234-4abc-8abc-1234567890ab";
const evidenceId = "product-performance:" + productRef + ":" + "a".repeat(32);

function product(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId,
    productRef,
    productLabel: "أرز بسمتي",
    unitOfMeasure: "EA",
    unitComparable: true,
    currentQuantity: "12.500000",
    currentOrderCount: 5,
    baselineQuantity: "10.000000",
    baselineOrderCount: 5,
    ...overrides,
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    asOf,
    period: { from: "2026-10-28", to: "2026-11-26" },
    baselinePeriod: { from: "2026-09-28", to: "2026-10-27" },
    status: "VERIFIED",
    totalCount: 1,
    returnedCount: 1,
    uncomparableUnitCount: 0,
    completePopulation: true,
    products: [product()],
    sourceTables: ["orders", "order_items", "products"],
    sideEffects: "NONE",
    ...overrides,
  };
}

describe("product performance growth evidence client", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("builds four period-bound metrics from a verified same-tenant aggregate", async () => {
    mocks.rpc.mockResolvedValue({ data: response(), error: null });

    const result = await fetchProductPerformanceGrowthContext(30, asOf);

    expect(mocks.rpc).toHaveBeenCalledWith("fetch_product_performance_growth_aggregate", {
      p_period_days: 30,
      p_as_of: asOf,
    });
    expect(result).toMatchObject({
      ok: true,
      context: {
        completePopulation: true,
        totalProductUnitCount: 1,
        returnedProductUnitCount: 1,
        uncomparableUnitCount: 0,
        metrics: [
          { value: 12.5, unit: "QUANTITY", period: { from: "2026-10-28", to: "2026-11-26" } },
          { value: 10, unit: "QUANTITY", period: { from: "2026-09-28", to: "2026-10-27" } },
          { value: 5, unit: "COUNT" },
          { value: 5, unit: "COUNT" },
        ],
        signals: [{ kind: "PRODUCT_PERFORMANCE_CHANGE", subjectRef: productRef }],
      },
    });
    if (result.ok) {
      expect(result.context.metrics.every(metric =>
        metric.status === "VERIFIED" &&
        metric.completeness === "COMPLETE" &&
        metric.quality === "ACCEPTABLE" &&
        metric.lineage.evidenceIds.length === 1
      )).toBe(true);
    }
  });

  it.each([
    ["timezone-less local timestamp", "2026-11-26T02:45:47"],
    ["impossible calendar date", "2026-02-31T02:45:47.000Z"],
  ])("rejects %s before querying the database", async (_label, invalidAsOf) => {
    await expect(fetchProductPerformanceGrowthContext(30, invalidAsOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts an explicit offset and compares the aggregate period to the UTC snapshot day", async () => {
    const offsetAsOf = "2026-11-27T02:45:47.000+03:00";
    mocks.rpc.mockResolvedValue({
      data: response({ asOf: "2026-11-26T23:45:47.000Z" }),
      error: null,
    });

    const result = await fetchProductPerformanceGrowthContext(30, offsetAsOf);

    expect(result).toMatchObject({ ok: true, context: { period: { to: "2026-11-26" } } });
  });

  it.each([
    ["scientific notation", "1e3"],
    ["more than six decimal places", "12.0000001"],
    ["negative quantity", "-0.5"],
    ["quantity beyond the bounded decimal range", "10000000000"],
  ])("withholds %s instead of coercing the source quantity", async (_label, invalidQuantity) => {
    mocks.rpc.mockResolvedValue({
      data: response({ products: [product({ currentQuantity: invalidQuantity })] }),
      error: null,
    });

    await expect(fetchProductPerformanceGrowthContext(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects duplicate product and unit rows before creating duplicate signals", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({
        totalCount: 2,
        returnedCount: 2,
        products: [product(), product({ evidenceId: evidenceId + "-duplicate" })],
      }),
      error: null,
    });

    await expect(fetchProductPerformanceGrowthContext(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("keeps non-comparable unit groups visible as partial coverage but emits no metrics for them", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({
        status: "PARTIAL",
        uncomparableUnitCount: 1,
        completePopulation: false,
        products: [product({ unitComparable: false })],
      }),
      error: null,
    });

    const result = await fetchProductPerformanceGrowthContext(30, asOf);

    expect(result).toMatchObject({
      ok: true,
      context: {
        completePopulation: false,
        uncomparableUnitCount: 1,
        evidenceRecords: [],
        metrics: [],
        signals: [{ kind: "PRODUCT_PERFORMANCE_CHANGE" }],
        warnings: expect.arrayContaining(["PRODUCT_UNIT_VARIANTS_WITHHELD"]),
      },
    });
  });

  it("does not convert a missing RPC into an empty verified product population", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function does not exist" },
    });

    await expect(fetchProductPerformanceGrowthContext(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "UNAVAILABLE" });
  });
});
