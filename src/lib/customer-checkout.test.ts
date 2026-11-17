import { describe, expect, it } from "vitest";
import {
  canUseCustomerCheckout,
  customerOrderRejectionMessage,
  isCustomerAuthorizationRejection,
  isDefinitiveCustomerOrderRejection,
} from "./customer-checkout";

describe("customer checkout identity and submission outcomes", () => {
  it("allows an authenticated customer role without staff privileges", () => {
    expect(canUseCustomerCheckout({ isStaff: false, roles: ["customer"] })).toBe(true);
  });

  it.each([
    ["admin", { isStaff: true, roles: ["admin"] }],
    ["manager", { isStaff: true, roles: ["manager"] }],
    ["staff", { isStaff: true, roles: ["staff", "customer"] }],
    ["unlinked account", { isStaff: false, roles: ["viewer"] }],
    ["anonymous", null],
  ])("does not treat %s as a customer checkout identity", (_label, identity) => {
    expect(canUseCustomerCheckout(identity)).toBe(false);
  });

  it("classifies the live 42501/403 membership denial as a definite rejection", () => {
    const error = { code: "42501", status: 403 };
    expect(isCustomerAuthorizationRejection(error)).toBe(true);
    expect(isDefinitiveCustomerOrderRejection(error)).toBe(true);
    expect(customerOrderRejectionMessage(error)).toContain("لم يُنشأ أي طلب");
  });

  it.each(["28000", "22023", "23503", "23514", "P0001", "PGRST202"])(
    "recognizes transaction-rolled-back RPC rejection code %s",
    (code) => {
      expect(isDefinitiveCustomerOrderRejection({ code })).toBe(true);
    },
  );

  it.each([
    { status: 502, code: "PGRST000" },
    { status: 503, code: "08006" },
    { status: 408, code: "57014" },
    { status: 429, code: "rate_limit" },
    { status: 409, code: "23505" },
    new TypeError("network connection dropped"),
  ])("retains the idempotency key for an ambiguous outcome: %o", (error) => {
    expect(isDefinitiveCustomerOrderRejection(error)).toBe(false);
  });
});
