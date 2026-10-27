import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261027290000_customer_order_pricing_preview_member_revocation_guard.sql",
), "utf8");
const runtimeAcceptance = readFileSync(join(process.cwd(), "scripts/test-customer-returns.mjs"), "utf8");

describe("customer cart/order pricing preview member-revocation guard", () => {
  it("locks the resolved tenant customer and rechecks the surface-specific capability after a lock wait", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\\.preview_customer_order_pricing\\(\\s*p_items jsonb,\\s*p_surface text\\)/i);
    expect(migration).toMatch(/v_required_capability := CASE p_surface WHEN 'cart' THEN 'catalog\\.read' ELSE 'orders\\.create' END/i);
    expect(migration).toMatch(/FROM public\\.customers AS c[\\s\\S]*?WHERE c\\.id = v_customer[\\s\\S]*?c\\.organization_id = v_org[\\s\\S]*?FOR SHARE/i);
    expect(migration).toMatch(/FOR SHARE;[\\s\\S]*?IF v_locked_customer IS NULL OR NOT public\\.current_customer_can\\(v_required_capability\\)/i);
    expect(migration).toContain("customer membership lacks permission for requested price preview");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\\.preview_customer_order_pricing\\(jsonb, text\\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\\.preview_customer_order_pricing\\(jsonb, text\\) TO authenticated/i);
  });

  it("proves a real pricing payload is available before revocation and denied after the forced customer-row lock wait", () => {
    expect(runtimeAcceptance).toMatch(/pricingBefore\\.visible, true/);
    expect(runtimeAcceptance).toMatch(/blockedPricePreview[\\s\\S]*?wait_event_type, "Lock"/);
    expect(runtimeAcceptance).toMatch(/revoke_customer_company_member\\(\\$1::uuid\\)[\\s\\S]*?buyerProfileId/);
    expect(runtimeAcceptance).toMatch(/pricingOutcome\\.ok, false/);
    expect(runtimeAcceptance).toMatch(/pricingOutcome\\.error\\.code, "42501"/);
    expect(runtimeAcceptance).toMatch(/pricing buyer revocation persists/);
  });
});
