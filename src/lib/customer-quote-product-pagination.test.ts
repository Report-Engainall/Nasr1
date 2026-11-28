import { describe, expect, it } from "vitest";
import {
  appendUniqueCustomerQuoteProducts,
  customerQuoteProductPageHasMore,
  CUSTOMER_QUOTE_PRODUCT_PAGE_SIZE,
} from "./customer-quote-product-pagination";

describe("customer quote product pagination", () => {
  it("appends new products without duplicating identifiers across pages", () => {
    const first = [{ id: "a", name: "أرز" }, { id: "b", name: "دقيق" }];
    const next = [{ id: "b", name: "دقيق مكرر" }, { id: "c", name: "سكر" }];
    expect(appendUniqueCustomerQuoteProducts(first, next)).toEqual([
      { id: "a", name: "أرز" },
      { id: "b", name: "دقيق" },
      { id: "c", name: "سكر" },
    ]);
  });

  it("preserves page order and ignores empty identifiers", () => {
    expect(appendUniqueCustomerQuoteProducts([], [
      { id: "c" }, { id: "" }, { id: "a" }, { id: "b" },
    ])).toEqual([{ id: "c" }, { id: "a" }, { id: "b" }]);
  });

  it("continues only when the server fills the requested page", () => {
    expect(customerQuoteProductPageHasMore(Array(CUSTOMER_QUOTE_PRODUCT_PAGE_SIZE).fill({}))).toBe(true);
    expect(customerQuoteProductPageHasMore(Array(CUSTOMER_QUOTE_PRODUCT_PAGE_SIZE - 1).fill({}))).toBe(false);
    expect(customerQuoteProductPageHasMore([], 0)).toBe(false);
  });
});
