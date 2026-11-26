import { describe, expect, it } from "vitest";
import { isOnyxSnapshotReadyForApplication } from "./onyx-snapshot-acceptance";

describe("Onyx staged snapshot application readiness", () => {
  it("allows completed ProductUnits snapshots with a persisted snapshot id", () => {
    expect(isOnyxSnapshotReadyForApplication("product_units", "completed", "snapshot-1")).toBe(true);
  });

  it("allows ProductUnits warning snapshots for the server review/apply workflow", () => {
    expect(isOnyxSnapshotReadyForApplication("product_units", "completed_with_warnings", "snapshot-1")).toBe(true);
  });

  it("keeps StockBalances warning snapshots out of the reconciliation path", () => {
    expect(isOnyxSnapshotReadyForApplication("inventory", "completed_with_warnings", "snapshot-1")).toBe(false);
  });

  it("rejects a completion status without a persisted snapshot id", () => {
    expect(isOnyxSnapshotReadyForApplication("product_units", "completed_with_warnings", null)).toBe(false);
  });
});
