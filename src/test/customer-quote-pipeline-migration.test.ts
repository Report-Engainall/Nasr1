import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261106170000_customer_quote_pipeline_intelligence.sql",
  "utf8",
);

describe("customer quote pipeline migration contract", () => {
  it("derives tenant from active staff context and returns aggregate counts only", () => {
    expect(migration).toContain("NOT public.is_staff()");
    expect(migration).toContain("public.current_profile_id()");
    expect(migration).toContain("public.current_organization_id()");
    expect(migration).toContain("p.is_active");
    expect(migration).toContain("'requestedForPricing',v_requested");
    expect(migration).toContain("'awaitingCustomerResponse',v_quoted");
    expect(migration).toContain("'sideEffects','NONE'");
    expect(migration).not.toContain("'customerName'");
    expect(migration).not.toContain("'customerId'");
    expect(migration).not.toContain("'orderId'");
  });

  it("documents that acceptance is not order conversion", () => {
    expect(migration).toContain("Accepted quotes are not represented as orders");
    expect(migration).toContain("sales_quotes has no order foreign key");
  });
});
