import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hiddenPriceContract = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261024120000_storefront_hidden_price_null_contract.sql",
), "utf8");
const memberRevocationGuard = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261027270000_storefront_price_member_revocation_guard.sql",
), "utf8");

describe("hidden storefront price RPC contract", () => {
  it("uses NULL for hidden catalog prices in the live price resolver and catalog JSON", () => {
    expect(hiddenPriceContract).toContain("SELECT p.id, NULL::numeric(15,2)");
    expect(hiddenPriceContract).toContain("'display_price', prices.unit_price");
    expect(hiddenPriceContract).toContain("Hidden storefront prices are absent values, never numeric zero sentinels.");
    expect(memberRevocationGuard).toContain("SELECT p.id, NULL::numeric(15,2)");
    expect(memberRevocationGuard).toContain("'display_price', prices.unit_price");
    expect(memberRevocationGuard).not.toContain("SELECT p.id, 0::numeric(15,2)");
  });

  it("retains live member-revocation serialization alongside the NULL contract", () => {
    expect(memberRevocationGuard).toContain("FOR SHARE;");
    expect(memberRevocationGuard).toContain("NOT public.current_customer_can('catalog.read')");
    expect(memberRevocationGuard).toContain("customer membership lacks permission to resolve catalog prices");
  });
});
