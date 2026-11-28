import { describe, expect, it } from "vitest";
import { isCheckoutAuthorizationDenied } from "@/lib/checkout-errors";

describe("checkout authorization rejection classification", () => {
  it("recognizes PostgreSQL permission-denied responses", () => {
    expect(isCheckoutAuthorizationDenied({ code: "42501", message: "permission denied" })).toBe(true);
  });

  it("recognizes explicit HTTP authentication and authorization responses", () => {
    expect(isCheckoutAuthorizationDenied({ status: 401 })).toBe(true);
    expect(isCheckoutAuthorizationDenied({ status: 403 })).toBe(true);
  });

  it("does not mistake network failures or gateway uncertainty for authorization rejection", () => {
    expect(isCheckoutAuthorizationDenied(new Error("Failed to fetch"))).toBe(false);
    expect(isCheckoutAuthorizationDenied({ status: 502 })).toBe(false);
    expect(isCheckoutAuthorizationDenied({ code: "57014", status: 500 })).toBe(false);
    expect(isCheckoutAuthorizationDenied(null)).toBe(false);
  });
});
