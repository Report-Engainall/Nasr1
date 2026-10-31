import { describe, expect, it } from "vitest";
import {
  filterProductActivityRows,
  paginateProductActivityRows,
  sortProductActivityRows,
  type StoreProductActivityRow,
} from "@/lib/product-activity-report";

const rows: StoreProductActivityRow[] = [
  {
    product_id: "a", item_code: "000125", product_name: "سكر أبيض", unit: "كرتون",
    catalog_status: "active", activity_status: "active_last_30_days",
    sold_quantity_last_30_days: 30, sold_quantity_last_90_days: 90,
    last_sold_at: "2026-10-30T10:00:00.000Z", days_since_last_sale: 1, available_quantity: 5,
  },
  {
    product_id: "b", item_code: "000200", product_name: "زيت نباتي", unit: "علبة",
    catalog_status: "active", activity_status: "slow_moving_90_days",
    sold_quantity_last_30_days: 2, sold_quantity_last_90_days: 20,
    last_sold_at: "2026-09-01T10:00:00.000Z", days_since_last_sale: 60, available_quantity: 1,
  },
  {
    product_id: "c", item_code: "000300", product_name: "أرز بسمتي", unit: "كيس",
    catalog_status: "inactive", activity_status: "stagnant_over_90_days",
    sold_quantity_last_30_days: 0, sold_quantity_last_90_days: 1,
    last_sold_at: "2026-07-01T10:00:00.000Z", days_since_last_sale: 120, available_quantity: null,
  },
  {
    product_id: "d", item_code: "000400", product_name: "طحين", unit: "كيس",
    catalog_status: "active", activity_status: "never_sold",
    sold_quantity_last_30_days: 0, sold_quantity_last_90_days: 0,
    last_sold_at: null, days_since_last_sale: null, available_quantity: 0,
  },
];

describe("product activity report table controls", () => {
  it("searches Arabic product names, codes and units and combines search with activity status", () => {
    expect(filterProductActivityRows(rows, "all", "سكر").map((r) => r.product_id)).toEqual(["a"]);
    expect(filterProductActivityRows(rows, "all", "000200").map((r) => r.product_id)).toEqual(["b"]);
    expect(filterProductActivityRows(rows, "all", "كيس").map((r) => r.product_id)).toEqual(["c", "d"]);
    expect(filterProductActivityRows(rows, "stagnant_over_90_days", "أرز").map((r) => r.product_id)).toEqual(["c"]);
    expect(filterProductActivityRows(rows, "active_last_30_days", "زيت")).toEqual([]);
  });

  it("sorts oldest movement and sales quantities deterministically and keeps unknown stock last", () => {
    expect(sortProductActivityRows(rows, "days_since_sale_desc").map((r) => r.product_id)).toEqual(["c", "b", "a", "d"]);
    expect(sortProductActivityRows(rows, "sold_30_desc").map((r) => r.product_id)).toEqual(["a", "b", "c", "d"]);
    expect(sortProductActivityRows(rows, "sold_30_asc").map((r) => r.product_id)).toEqual(["c", "d", "b", "a"]);
    expect(sortProductActivityRows(rows, "stock_asc").map((r) => r.product_id)).toEqual(["d", "b", "a", "c"]);
    expect(sortProductActivityRows(rows, "name_asc")[0].product_name).toBe("أرز بسمتي");
  });

  it("paginates without dropping rows, clamps out-of-range pages and reports correct bounds", () => {
    const many = Array.from({ length: 53 }, (_, index) => index + 1);
    const first = paginateProductActivityRows(many, 1, 25);
    const second = paginateProductActivityRows(many, 2, 25);
    const third = paginateProductActivityRows(many, 3, 25);
    const clamped = paginateProductActivityRows(many, 99, 25);

    expect(first.rows).toEqual(many.slice(0, 25));
    expect([first.from, first.to, first.totalPages]).toEqual([1, 25, 3]);
    expect(second.rows).toEqual(many.slice(25, 50));
    expect([second.from, second.to]).toEqual([26, 50]);
    expect(third.rows).toEqual([51, 52, 53]);
    expect([third.from, third.to]).toEqual([51, 53]);
    expect(clamped.page).toBe(3);
    expect(clamped.rows).toEqual([51, 52, 53]);
  });

  it("keeps empty report bounds explicit and rejects invalid page sizes", () => {
    expect(paginateProductActivityRows([], 1)).toMatchObject({ rows: [], page: 1, totalPages: 1, from: 0, to: 0 });
    expect(paginateProductActivityRows(rows, Number.NaN).page).toBe(1);
    expect(() => paginateProductActivityRows(rows, 1, 0)).toThrow(/حجم صفحة/);
    expect(() => paginateProductActivityRows(rows, 1, 251)).toThrow(/حجم صفحة/);
  });
});
