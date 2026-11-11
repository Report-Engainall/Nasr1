import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261112000000_public_self_service_customer_registration.sql", import.meta.url),
  "utf8",
);
const pendingOrderGate = readFileSync(
  new URL("../../supabase/migrations/20261112001000_pending_customer_order_creation_gate.sql", import.meta.url),
  "utf8",
);

describe("public self-service customer registration migration", () => {
  it("exposes one authenticated-only security-definer command with a fixed empty search_path", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.ensure_my_customer_account()");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("IF v_uid IS NULL");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.ensure_my_customer_account() FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.ensure_my_customer_account() TO authenticated");
  });

  it("requires a real Auth identity and a verified phone or email before creating a customer row", () => {
    expect(migration).toContain("FROM auth.users u");
    expect(migration).toContain("u.phone_confirmed_at");
    expect(migration).toContain("u.email_confirmed_at");
    expect(migration).toContain("IF v_phone_confirmed_at IS NULL AND v_email_confirmed_at IS NULL");
    expect(migration).toContain("v_phone_confirmed_at IS NOT NULL");
    expect(migration).toContain("v_email_confirmed_at IS NOT NULL");
    expect(migration).toContain("phone number is not in E.164 format");
  });

  it("never promotes self-registered users or accepts client-controlled tenant, status, tier or balances", () => {
    expect(migration).toContain("v_profile.organization_id");
    expect(migration).toContain("r.role = 'customer'");
    expect(migration).toContain("'admin', 'manager', 'staff', 'accountant', 'customer_manager'");
    expect(migration).toContain("'retail'");
    expect(migration).toContain("'pending'");
    expect(migration).toContain("credit_limit");
    expect(migration).toContain("current_balance");
    expect(migration).toContain("0,\n    0");
  });

  it("is idempotent, preserves existing company memberships, and writes a registration audit event", () => {
    expect(migration).toContain("Repeated login, refresh and OTP-confirmation callbacks are idempotent");
    expect(migration).toContain("customer_company_memberships");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("customer.self_service_registered");
    expect(migration).toContain("'customer_code'");
    expect(migration).toContain("'status', 'pending'");
  });

  it("blocks order creation until staff approval, including for direct owners and company buyers", () => {
    expect(pendingOrderGate).toContain("CREATE OR REPLACE FUNCTION public.current_customer_can(p_capability text)");
    expect(pendingOrderGate).toContain("IF p_capability = 'orders.create'");
    expect(pendingOrderGate).toContain("c.status = 'approved'");
    expect(pendingOrderGate).toContain("IF v_role IS NULL THEN");
    expect(pendingOrderGate).toContain("'orders.create'");
    expect(pendingOrderGate.indexOf("IF p_capability = 'orders.create'"))
      .toBeLessThan(pendingOrderGate.indexOf("IF EXISTS (\n    SELECT 1\n    FROM public.customers c"));
  });
});
