import { describe, expect, it } from "vitest";
import { calculateShiftCashVariance, classifyShiftCashVariance, isSafeShiftCashAmount } from "./shift-operations";

describe("shift cash cent precision", () => {
  it("accepts ordinary non-negative amounts represented to two decimal places", () => {
    expect(isSafeShiftCashAmount(0)).toBe(true);
    expect(isSafeShiftCashAmount(125.5)).toBe(true);
    expect(isSafeShiftCashAmount(125.57)).toBe(true);
  });

  it("rejects negative, non-finite, sub-cent and unsafe cent amounts", () => {
    expect(isSafeShiftCashAmount(-0.01)).toBe(false);
    expect(isSafeShiftCashAmount(Number.NaN)).toBe(false);
    expect(isSafeShiftCashAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isSafeShiftCashAmount(12.001)).toBe(false);
    expect(isSafeShiftCashAmount(Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("calculates cash variance using integer cents", () => {
    expect(calculateShiftCashVariance(100.2, 100.25)).toBe(0.05);
    expect(calculateShiftCashVariance(100.25, 100.2)).toBe(-0.05);
    expect(calculateShiftCashVariance(0, 0)).toBe(0);
  });

  it("withholds variance when either amount is outside accepted cent precision", () => {
    expect(calculateShiftCashVariance(100.001, 100.25)).toBeNull();
    expect(calculateShiftCashVariance(100.25, 100.001)).toBeNull();
  });

  it("marks even a one-cent difference as a variance rather than silently matching it", () => {
    expect(classifyShiftCashVariance(0)).toBe("MATCHED");
    expect(classifyShiftCashVariance(0.01)).toBe("VARIANCE");
    expect(classifyShiftCashVariance(-0.01)).toBe("VARIANCE");
    expect(classifyShiftCashVariance(null)).toBe("UNKNOWN");
    expect(classifyShiftCashVariance(Number.POSITIVE_INFINITY)).toBe("UNKNOWN");
  });
});
