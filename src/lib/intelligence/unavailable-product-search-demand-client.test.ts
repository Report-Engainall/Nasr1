import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  createUnavailableProductDemandFollowUpTask,
  fetchUnavailableProductSearchDemand,
} from "./unavailable-product-search-demand-client";

const asOf = "2026-11-28T12:00:00.123456Z";
const period = { from: "2026-10-30", to: "2026-11-28" };
const productRef = "7f8d9c11-1234-4abc-8abc-1234567890ab";

function response(overrides: Record<string, unknown> = {}) {
  return {
    asOf,
    period,
    coverageStartedOn: period.from,
    status: "EMPTY",
    totalCount: 0,
    returnedCount: 0,
    completePopulation: true,
    products: [],
    sourceTables: ["storefront_unavailable_product_search_observations", "products"],
    sideEffects: "NONE",
    warnings: [],
    ...overrides,
  };
}

function product(sourceTimestamp: string) {
  return {
    productRef,
    productLabel: "أرز بسمتي",
    searchCount: 5,
    distinctSearchers: 3,
    firstObservedOn: period.from,
    lastObservedOn: period.to,
    sourceTimestamp,
  };
}

describe("unavailable product search demand source timestamp contract", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it.each([
    ["timezone-less clock", "2026-11-28T12:00:00"],
    ["impossible calendar date", "2026-02-30T12:00:00.000Z"],
    ["offset beyond fourteen hours", "2026-11-28T12:00:00+14:01"],
    ["precision finer than PostgreSQL microseconds", "2026-11-28T12:00:00.1234567Z"],
  ])("rejects %s before the source RPC", async (_label, invalidAsOf) => {
    await expect(fetchUnavailableProductSearchDemand(30, invalidAsOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("withholds a returned snapshot that differs by one microsecond", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({ asOf: "2026-11-28T12:00:00.123457Z" }),
      error: null,
    });

    await expect(fetchUnavailableProductSearchDemand(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects malformed source timestamps in product observations", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({ status: "VERIFIED", totalCount: 1, returnedCount: 1, products: [product("2026-11-28T12:00:00.000+14:01")] }),
      error: null,
    });

    await expect(fetchUnavailableProductSearchDemand(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects invalid as-of precision before creating a manager follow-up task", async () => {
    await expect(createUnavailableProductDemandFollowUpTask({
      productId: productRef,
      period,
      asOf: "2026-11-28T12:00:00.1234567Z",
    })).resolves.toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});


describe("unavailable product demand exact source chronology", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("rejects a product observation one microsecond later than the requested snapshot", async () => {
    mocks.rpc.mockResolvedValue({
      data: response({
        status: "VERIFIED",
        totalCount: 1,
        returnedCount: 1,
        products: [product("2026-11-28T12:00:00.123457Z")],
      }),
      error: null,
    });

    await expect(fetchUnavailableProductSearchDemand(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
  });
});
