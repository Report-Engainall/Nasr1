import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261027290000_customer_order_pricing_preview_member_revocation_guard.sql",
), "utf8");
const directRpcRevocation = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261027300000_revoke_direct_legacy_order_pricing_rpc.sql",
), "utf8");
const runtimeAcceptance = readFileSync(join(process.cwd(), "scripts/test-customer-returns.mjs"), "utf8");

describe("customer cart/order pricing preview member-revocation guard", () => {
  it("locks the resolved tenant customer and rechecks the surface-specific capability after a lock wait", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.preview_customer_order_pricing(");
    expect(migration).toContain("v_required_capability := CASE p_surface WHEN 'cart' THEN 'catalog.read' ELSE 'orders.create' END;");
    const customerLock = migration.indexOf("FOR SHARE;");
    const capabilityRecheck = migration.indexOf(
      "IF v_locked_customer IS NULL OR NOT public.current_customer_can(v_required_capability)",
      customerLock,
    );
    expect(customerLock).toBeGreaterThan(-1);
    expect(capabilityRecheck).toBeGreaterThan(customerLock);
    expect(migration).toContain("customer membership lacks permission for requested price preview");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.preview_customer_order_pricing(jsonb, text) FROM PUBLIC, anon;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.preview_customer_order_pricing(jsonb, text) TO authenticated;");
  });

  it("removes direct browser execution of the legacy monetary RPC while preserving the safe checkout wrapper", () => {
    expect(directRpcRevocation).toContain("REVOKE ALL ON FUNCTION public.preview_order_pricing(jsonb) FROM PUBLIC, anon, authenticated;");
    expect(directRpcRevocation).toContain("GRANT EXECUTE ON FUNCTION public.preview_order_pricing(jsonb) TO service_role;");
    expect(runtimeAcceptance).toContain("has_function_privilege('authenticated','public.preview_order_pricing(jsonb)','EXECUTE')");
    expect(runtimeAcceptance).toContain("authenticated customer cannot call the legacy monetary pricing RPC directly");
    expect(runtimeAcceptance).toContain("public.validate_checkout_cart($1::jsonb)");
    expect(runtimeAcceptance).toContain('Object.hasOwn(safeCheckout.items[0], "unit_price"), false');
  });

  it("proves a real pricing payload is available before revocation and denied after the forced customer-row lock wait", () => {
    expect(runtimeAcceptance).toContain("assert.equal(pricingBefore.visible, true");
    expect(runtimeAcceptance).toContain("blockedPricePreview");
    expect(runtimeAcceptance).toContain('wait_event_type, "Lock"');
    expect(runtimeAcceptance).toContain("public.revoke_customer_company_member($1::uuid)");
    expect(runtimeAcceptance).toContain("assert.equal(pricingOutcome.ok, false");
    expect(runtimeAcceptance).toContain('pricingOutcome.error.code, "42501"');
    expect(runtimeAcceptance).toContain("pricing buyer revocation persists");
  });
});
