import { describe, expect, it } from "vitest";
import { getAuthEmailRedirectUrl } from "@/lib/auth-redirect";

const TOKEN = "a".repeat(64);

describe("auth email confirmation redirect", () => {
  it("keeps a valid company invitation token while dropping unrelated query parameters", () => {
    expect(getAuthEmailRedirectUrl(
      "https://shop.example",
      "/company/accept-invitation",
      `?token=${TOKEN}&next=https://evil.example`,
    )).toBe(`https://shop.example/company/accept-invitation?token=${TOKEN}`);
  });

  it("keeps a valid customer activation token in the path through email confirmation", () => {
    expect(getAuthEmailRedirectUrl(
      "https://shop.example",
      `/customer/activate/${TOKEN.toUpperCase()}`,
      "?redirect=https://evil.example",
    )).toBe(`https://shop.example/customer/activate/${TOKEN}`);
  });

  it("falls back to the login page for malformed or misplaced tokens", () => {
    expect(getAuthEmailRedirectUrl("https://shop.example", "/customer/activate/not-a-token", "")).toBe("https://shop.example/login");
    expect(getAuthEmailRedirectUrl("https://shop.example", "/company/accept-invitation", "?token=bad")).toBe("https://shop.example/login");
    expect(getAuthEmailRedirectUrl("https://shop.example", "/orders", `?token=${TOKEN}`)).toBe("https://shop.example/login");
  });

  it("normalizes only the origin, not arbitrary destinations", () => {
    expect(getAuthEmailRedirectUrl("https://shop.example:443/some/path", "/", "")).toBe("https://shop.example/login");
  });
});
