import { describe, expect, it } from "vitest";
import {
  buildBusinessHealthMap,
  type BusinessHealthMapInput,
} from "./business-health-map";
import type { ProductRevenueConcentrationSnapshot } from "./product-revenue-concentration-client";

const asOf = "2026-11-27T12:00:00.000Z";
const period = { from: "2026-11-01", to: "2026-11-27" };

function input(overrides: Partial<BusinessHealthMapInput> = {}): BusinessHealthMapInput {
  return {
    id: "business-health-test",
    generatedAt: asOf,
    asOf,
    period,
    ...overrides,
  };
}

function concentration(asOfValue: string): ProductRevenueConcentrationSnapshot {
  return {
    status: "VERIFIED",
    asOf: asOfValue,
    period,
    completePopulation: true,
    invoiceCount: 1,
    invoiceWithoutLinesCount: 0,
    currencyCount: 0,
    currencies: [],
    formulaId: "nasr1.invoice-line-product-concentration-net-posted-credit-memos",
    formulaVersion: "1",
    formulaDescription: "Test snapshot",
  };
}

describe("business health map evidence clocks", () => {
  it("accepts a timezone-qualified snapshot with a valid calendar day", () => {
    const result = buildBusinessHealthMap(input());
    expect(result).toMatchObject({
      id: "business-health-test",
      generatedAt: asOf,
      asOf,
      period,
      totalCapitalAtRisk: null,
    });
  });

  it.each([
    ["timezone-less as-of", { asOf: "2026-11-27T12:00:00" }],
    ["timezone-less generated-at", { generatedAt: "2026-11-27T12:00:00" }],
    ["impossible calendar date", { asOf: "2026-02-30T12:00:00.000Z" }],
    ["offset beyond fourteen hours", { asOf: "2026-11-27T12:00:00+14:01" }],
    ["date-only value", { asOf: "2026-11-27" }],
    ["invalid wall-clock hour", { asOf: "2026-11-27T24:00:00Z" }],
  ])("rejects %s at the business-health map boundary", (_label, override) => {
    expect(() => buildBusinessHealthMap(input(override))).toThrow("business_health_map_input_invalid");
  });

  it("withholds a concentration snapshot whose local timestamp lacks a timezone", () => {
    const result = buildBusinessHealthMap(input({
      productRevenueConcentration: concentration("2026-11-27T12:00:00"),
    }));
    expect(result.productRevenueConcentration).toBeNull();
    expect(result.warnings).toContain("PRODUCT_REVENUE_CONCENTRATION_AS_OF_OR_PERIOD_MISMATCH");
  });

  it("withholds an impossible concentration snapshot date", () => {
    const result = buildBusinessHealthMap(input({
      productRevenueConcentration: concentration("2026-02-31T12:00:00.000Z"),
    }));
    expect(result.productRevenueConcentration).toBeNull();
    expect(result.warnings).toContain("PRODUCT_REVENUE_CONCENTRATION_AS_OF_OR_PERIOD_MISMATCH");
  });
});


describe("business health map exact as-of precision", () => {
  it("withholds a product concentration snapshot that differs by one microsecond", () => {
    const mapAsOf = "2026-11-27T12:00:00.123456Z";
    const result = buildBusinessHealthMap(input({
      asOf: mapAsOf,
      generatedAt: mapAsOf,
      productRevenueConcentration: concentration("2026-11-27T12:00:00.123457Z"),
    }));
    expect(result.productRevenueConcentration).toBeNull();
    expect(result.warnings).toContain("PRODUCT_REVENUE_CONCENTRATION_AS_OF_OR_PERIOD_MISMATCH");
  });

  it("accepts the same product concentration instant expressed with a different valid offset", () => {
    const mapAsOf = "2026-11-27T12:00:00.123456Z";
    const result = buildBusinessHealthMap(input({
      asOf: mapAsOf,
      generatedAt: mapAsOf,
      productRevenueConcentration: concentration("2026-11-27T15:00:00.123456+03:00"),
    }));
    expect(result.productRevenueConcentration?.asOf).toBe("2026-11-27T15:00:00.123456+03:00");
  });

  it("rejects timestamps with precision finer than PostgreSQL microseconds", () => {
    expect(() => buildBusinessHealthMap(input({
      asOf: "2026-11-27T12:00:00.1234567Z",
    }))).toThrow("business_health_map_input_invalid");
  });
});
