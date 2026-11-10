import { describe, expect, it } from "vitest";
import { buildOnyxDetailRows, ONYX_ORDER_COLUMNS, type OnyxOrderWorkbookInput } from "./onyx-export";

const input: OnyxOrderWorkbookInput = {
  orderId: "order-id",
  orderNumber: "SO-0042",
  orderStatus: "approved",
  orderCreatedAt: "2026-11-10T10:00:00.000Z",
  customerCode: "0007",
  customerName: "عميل اختبار",
  items: [
    {
      item_code: "000125",
      product_name_snapshot: "أرز بسمتي",
      unit_snapshot: "كيس",
      quantity: 5,
      unit_price_snapshot: 42.5,
    },
    {
      item_code: "000126",
      product_name_snapshot: "سكر",
      unit_snapshot: "كيس",
      quantity: 2,
      unit_price_snapshot: 35,
    },
  ],
};

describe("Onyx 27-column order detail export", () => {
  it("writes exactly one cell per canonical template column", () => {
    const rows = buildOnyxDetailRows(input);

    expect(ONYX_ORDER_COLUMNS).toHaveLength(27);
    expect(rows[0]).toEqual([...ONYX_ORDER_COLUMNS]);
    expect(rows.slice(1)).toHaveLength(input.items.length);
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(ONYX_ORDER_COLUMNS.length);
    }
  });

  it("preserves leading-zero item codes and places order number in the البيان column", () => {
    const [, first] = buildOnyxDetailRows(input);

    expect(first.slice(0, 7)).toEqual([
      "000125",
      "أرز بسمتي",
      "كيس",
      "",
      5,
      "",
      42.5,
    ]);
    expect(ONYX_ORDER_COLUMNS[22]).toBe("البيان");
    expect(first[22]).toBe("SO-0042");
    expect(first.slice(23)).toEqual(["", "", "", ""]);
  });

  it("keeps every item's field positions stable", () => {
    const [, first, second] = buildOnyxDetailRows(input);

    expect(first[0]).toBe("000125");
    expect(second[0]).toBe("000126");
    expect(first[4]).toBe(5);
    expect(second[4]).toBe(2);
    expect(first[6]).toBe(42.5);
    expect(second[6]).toBe(35);
    expect(first[22]).toBe(second[22]);
  });
});
