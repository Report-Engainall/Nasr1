import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261024151500_customer_payment_record_audit.sql"),
  "utf8",
);

describe("customer payment audit migration contract", () => {
  it("uses a privileged trigger with an empty search path and one INSERT-only event", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.audit_customer_payment_recorded\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
    expect(migration).toMatch(/CREATE TRIGGER customer_payment_recorded_audit\s+AFTER INSERT ON public\.customer_payments/i);
    expect(migration).not.toMatch(/CREATE TRIGGER customer_payment_recorded_audit\s+AFTER INSERT OR (?:UPDATE|DELETE)/i);
  });

  it("audits tenant, actor, invoice, customer, amount, currency and payment method", () => {
    for (const required of [
      "'customer_payment.recorded'",
      "'customer_payment'",
      "NEW.organization_id",
      "NEW.created_by",
      "NEW.invoice_id",
      "NEW.customer_id",
      "NEW.amount::text",
      "v_currency",
      "NEW.payment_method",
      "'idempotency_key_present', NEW.idempotency_key IS NOT NULL",
    ]) {
      expect(migration).toContain(required);
    }
  });

  it("fails closed for invoice/customer/organization mismatches and avoids sensitive raw fields", () => {
    expect(migration).toContain("NEW.organization_id");
    expect(migration).toContain("AND i.organization_id = NEW.organization_id");
    expect(migration).toContain("AND i.customer_id = NEW.customer_id");
    expect(migration).toContain("ERRCODE = '23514'");
    expect(migration).not.toMatch(/'notes'\s*,\s*NEW\.notes/i);
    expect(migration).not.toMatch(/'idempotency_key'\s*,\s*NEW\.idempotency_key(?!\s+IS)/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.audit_customer_payment_recorded\(\) FROM PUBLIC, anon, authenticated, service_role/i);
  });
});
