import { describe, expect, it } from "vitest";
import { resolveOnyxSnapshotImportKind } from "./onyx-snapshot-import-kind";

describe("Onyx snapshot source-kind binding", () => {
  it("binds customer snapshots to their customer import job", () => {
    expect(resolveOnyxSnapshotImportKind("unified_import_customers")).toBe("customers");
  });

  it("binds product snapshots to their product import job", () => {
    expect(resolveOnyxSnapshotImportKind("unified_import_products")).toBe("products");
  });

  it("keeps legacy unified product jobs on the product path", () => {
    expect(resolveOnyxSnapshotImportKind("unified_import")).toBe("products");
  });

  it.each([null, undefined, "", "tabular", "inventory", "customer_import", "unified_import_inventory"])(
    "fails closed for an unrecognized source job type: %s",
    (jobType) => {
      expect(resolveOnyxSnapshotImportKind(jobType)).toBeNull();
    },
  );
});
