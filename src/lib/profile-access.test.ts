import { describe, expect, it } from "vitest";
import { resolveProfileAccessMode } from "./profile-access";

describe("resolveProfileAccessMode", () => {
  it("keeps staff in the staff workspace even if another role is also present", () => {
    expect(resolveProfileAccessMode({ isStaff: true, roles: ["admin", "customer"] }))
      .toBe("staff");
  });

  it("grants customer profile navigation only to an explicit customer role", () => {
    expect(resolveProfileAccessMode({ isStaff: false, roles: ["customer"] }))
      .toBe("customer");
    expect(resolveProfileAccessMode({ isStaff: false, roles: ["buyer", "customer"] }))
      .toBe("customer");
  });

  it("does not treat unknown or non-customer roles as customer accounts", () => {
    for (const roles of [["buyer"], ["finance"], ["viewer"], ["unknown"], []]) {
      expect(resolveProfileAccessMode({ isStaff: false, roles })).toBe("restricted");
    }
  });
});
