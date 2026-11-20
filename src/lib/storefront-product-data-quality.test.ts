import { describe, expect, it } from "vitest";
import {
  assessProductDataQuality,
  formatProductUpdatedAt,
} from "./storefront-product-data-quality";

describe("storefront product data quality", () => {
  it("scores the required customer-facing fields and keeps alternate units optional", () => {
    const report = assessProductDataQuality({
      imageCount: 2,
      description: "وصف واضح للمنتج.",
      salesUnit: "قطعة",
      alternateUnitCount: 0,
      alternateUnitState: "ready",
    });

    expect(report.score).toBe(100);
    expect(report.completeCount).toBe(3);
    expect(report.alternateUnits.tone).toBe("optional");
  });

  it("identifies missing images, descriptions and sales units", () => {
    const report = assessProductDataQuality({
      imageCount: 0,
      description: "   ",
      salesUnit: "",
      alternateUnitCount: 0,
      alternateUnitState: "ready",
    });

    expect(report.score).toBe(0);
    expect(report.checks.filter((check) => !check.complete).map((check) => check.key))
      .toEqual(["image", "description", "sales-unit"]);
  });

  it("does not count loading or unavailable unit definitions as missing product data", () => {
    const loading = assessProductDataQuality({
      imageCount: 1,
      description: "وصف",
      salesUnit: "علبة",
      alternateUnitCount: 0,
      alternateUnitState: "loading",
    });
    const failed = assessProductDataQuality({
      imageCount: 1,
      description: "وصف",
      salesUnit: "علبة",
      alternateUnitCount: 0,
      alternateUnitState: "error",
    });

    expect(loading.alternateUnits.tone).toBe("pending");
    expect(failed.alternateUnits.tone).toBe("unknown");
    expect(loading.score).toBe(100);
    expect(failed.score).toBe(100);
  });

  it("reports the count of configured alternate units", () => {
    const report = assessProductDataQuality({
      imageCount: 1,
      description: "وصف",
      salesUnit: "قطعة",
      alternateUnitCount: 2,
      alternateUnitState: "ready",
    });

    expect(report.alternateUnits.label).toContain("2");
    expect(report.score).toBe(100);
  });
});

describe("storefront product information freshness", () => {
  it("formats a valid server timestamp", () => {
    expect(formatProductUpdatedAt("2026-11-19T12:30:00.000Z")).toBeTruthy();
  });

  it("does not invent an update date for absent or malformed timestamps", () => {
    expect(formatProductUpdatedAt(null)).toBeNull();
    expect(formatProductUpdatedAt(undefined)).toBeNull();
    expect(formatProductUpdatedAt("not-a-date")).toBeNull();
  });
});
