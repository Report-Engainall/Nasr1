import { describe, expect, it } from "vitest";
import { formatCustomer360Money } from "@/lib/customer-360";

describe("formatCustomer360Money", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("does not render %s as zero", (_label, value) => {
    expect(formatCustomer360Money(value)).toBe("غير متاح");
  });

  it("keeps a known zero distinct from unavailable data", () => {
    const zero = formatCustomer360Money(0);
    expect(zero).toContain("YER");
    expect(zero).not.toBe("غير متاح");
  });

  it("preserves the supplied currency for known values", () => {
    expect(formatCustomer360Money(12.5, "USD")).toContain("USD");
  });
});
