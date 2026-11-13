import { describe, expect, it } from "vitest";
import { buildSupplierInvoiceOrderedQuantityIndex } from "./supplier-invoice-order-quantities";

describe("supplier invoice ordered quantity projection", () => {
  it("joins the exact PO item ID without matching by product identity", () => {
    const result = buildSupplierInvoiceOrderedQuantityIndex([
      {
        items: [
          { id: "po-item-1", quantity_ordered: 24 },
          { id: "po-item-2", quantity_ordered: 2.5 },
        ],
      },
      {
        items: [
          { id: "po-item-3", quantity_ordered: 0 },
        ],
      },
    ]);

    expect(result.get("po-item-1")).toBe("24");
    expect(result.get("po-item-2")).toBe("2.5");
    expect(result.get("po-item-3")).toBe("0");
    expect(result.has("same-product-id")).toBe(false);
  });

  it("rejects inconsistent duplicate item identifiers instead of choosing an arbitrary quantity", () => {
    expect(() => buildSupplierInvoiceOrderedQuantityIndex([
      { items: [{ id: "po-item-1", quantity_ordered: 24 }] },
      { items: [{ id: "po-item-1", quantity_ordered: 12 }] },
    ])).toThrow(/معرف مكرر/);
  });
});
