import { describe, expect, it } from "vitest";
import { DataQualityAccumulator } from "./unified-import";

describe("import data quality date scoring", () => {
  it("treats null and empty dates as missing, but rejects whitespace and impossible dates", () => {
    const accumulator = new DataQualityAccumulator([], "item_code");
    const dates: Array<string | undefined> = [
      undefined,
      "",
      "   ",
      "2026-02-31",
      "2024-02-29",
    ];

    dates.forEach((date, index) => {
      accumulator.add({
        row_number: index + 1,
        data: {
          item_code: `DQS-DATE-${index + 1}`,
          quantity: "1",
          revenue: "10",
          price: "10",
          date,
        },
        status: "valid",
        errors: [],
      });
    });

    expect(accumulator.result().temporalReferentialIntegrity).toBe(60);
  });
});
