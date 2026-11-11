import { describe, expect, it } from "vitest";

import { buildCustomerPricingSearchFilter } from "./customer-directory";

describe("buildCustomerPricingSearchFilter", () => {
  it("preserves a valid partial email address for server-side matching", () => {
    expect(buildCustomerPricingSearchFilter("@Example.com")).toBe(
      "business_name.ilike.%@example.com%,contact_name.ilike.%@example.com%,phone.ilike.%@example.com%,email.ilike.%@example.com%,customer_code.ilike.%@example.com%",
    );
  });

  it("escapes SQL LIKE wildcards in email-like searches", () => {
    const filter = buildCustomerPricingSearchFilter("user_name@example.com");
    expect(filter).toContain("email.ilike.%user\\_name@example.com%");
    expect(filter?.split(",")).toHaveLength(5);
  });

  it("removes PostgREST separators and user wildcard grammar", () => {
    const filter = buildCustomerPricingSearchFilter("x),organization_id.eq.true,%*");
    const clauses = filter?.split(",") ?? [];
    expect(clauses).toHaveLength(5);
    expect(clauses.every((clause) => clause.includes(".ilike.%x organization id eq true%"))).toBe(true);
    expect(filter).not.toContain("(");
    expect(filter).not.toContain(")");
    expect(filter).not.toContain("*");
  });

  it("does not create a broad unfiltered query for an unsupported-only term", () => {
    expect(buildCustomerPricingSearchFilter("(),%*")).toBeNull();
    expect(buildCustomerPricingSearchFilter("   ")).toBeNull();
  });
});
