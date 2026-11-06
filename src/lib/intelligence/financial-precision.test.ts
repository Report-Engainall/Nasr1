import { describe, expect, it } from "vitest";
import {
  decimalToMinorUnits,
  minorUnitsToNumber,
  percentageToHundredths,
  roundedPercentageHundredths,
} from "./financial-precision";

describe("exact financial decimal precision", () => {
  it("parses safe currency decimals as exact integer minor units", () => {
    expect(decimalToMinorUnits("123.45", 2)).toBe(12345n);
    expect(decimalToMinorUnits(0.29, 2)).toBe(29n);
    expect(decimalToMinorUnits("0.00", 2)).toBe(0n);
    expect(minorUnitsToNumber(12345n, 2)).toBe(123.45);
  });

  it("rejects excess fractional precision, malformed and unsafe amounts", () => {
    expect(decimalToMinorUnits("1.001", 2)).toBeNull();
    expect(decimalToMinorUnits("NaN", 2)).toBeNull();
    expect(decimalToMinorUnits(-1, 2)).toBeNull();
    expect(decimalToMinorUnits("-1.25", 2, true)).toBe(-125n);
    expect(decimalToMinorUnits("10000000000000.01", 2)).toBeNull();
  });

  it("matches PostgreSQL numeric round to two percentage decimals", () => {
    expect(roundedPercentageHundredths(1n, 8n)).toBe(1250n);
    expect(roundedPercentageHundredths(1n, 20000n)).toBe(1n);
    expect(roundedPercentageHundredths(1n, 20001n)).toBe(0n);
    expect(percentageToHundredths("72.00")).toBe(7200n);
    expect(percentageToHundredths("100.01")).toBeNull();
  });

  it("withholds invalid denominators and negative concentration numerators", () => {
    expect(roundedPercentageHundredths(10n, 0n)).toBeNull();
    expect(roundedPercentageHundredths(-1n, 10n)).toBeNull();
  });
});
