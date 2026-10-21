import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261021170000_staff_dashboard_metrics_finance_parity.sql"),
  "utf8",
);
const commerce = readFileSync(
  join(process.cwd(), "supabase/migrations/20261009010000_commerce_completion.sql"),
  "utf8",
);
const commands = readFileSync(
  join(process.cwd(), "supabase/migrations/20261009020000_commerce_commands.sql"),
  "utf8",
);
const cashExpenses = readFileSync(
  join(process.cwd(), "supabase/migrations/20261019100000_finance_cash_expenses.sql"),
  "utf8",
);
const customerPostings = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020030000_accounting_customer_source_posting.sql"),
  "utf8",
);
const runtimeTest = readFileSync(
  join(process.cwd(), "scripts/test-admin-catalog-commands.mjs"),
  "utf8",
);

describe("staff dashboard finance-parity migration contract", () => {
  it("preserves the 12-field staff-dashboard compatibility contract", () => {
    expect(migration).toMatch(/RETURNS TABLE\s*\([\s\S]*orders_total bigint[\s\S]*orders_pending bigint[\s\S]*orders_confirmed bigint[\s\S]*orders_preparing bigint[\s\S]*orders_ready bigint[\s\S]*orders_completed bigint[\s\S]*orders_cancelled bigint[\s\S]*completed_sales numeric[\s\S]*active_customers bigint[\s\S]*active_products bigint[\s\S]*available_stock numeric[\s\S]*receivables_issued numeric/i);
    expect(migration).toMatch(/status IN \('processing','preparing'\)/i);
    expect(migration).toMatch(/status IN \('shipped','ready','dispatched'\)/i);
    expect(migration).toMatch(/status IN \('delivered','completed'\)/i);
  });

  it("derives tenant from the active authenticated profile and denies customer/anon use", () => {
    expect(migration).toMatch(/p\.auth_user_id\s*=\s*auth\.uid\(\)/i);
    expect(migration).toMatch(/p\.is_active\s*=\s*true/i);
    expect(migration).toMatch(/public\.is_staff\(\) OR public\.can_manage_finance\(\)/i);
    expect(migration).toMatch(/SET search_path\s*=\s*''/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_staff_dashboard_metrics\(\) FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_staff_dashboard_metrics\(\) TO authenticated/i);
    expect(runtimeTest).toContain('customer.unsafe("select * from public.get_staff_dashboard_metrics()")');
  });

  it("uses the target invoice, payment, warehouse, product and inventory tables", () => {
    expect(migration).toContain("public.customer_invoices");
    expect(migration).toContain("public.customer_payments");
    expect(migration).toContain("public.inventory_balances");
    expect(migration).toContain("public.warehouses");
    expect(migration).toContain("public.products");
    expect(migration).toContain("i.total_amount - coalesce(sum(cp.amount),0)");
    expect(migration).toContain("ib.quantity_available");
    expect(migration).toMatch(/count\(DISTINCT ib\.currency\).*?> 1/s);
    expect(migration).toMatch(/count\(\*\) FILTER \(WHERE sr\.balance_id IS NULL\) > 0/i);
    expect(migration).toMatch(/count\(DISTINCT sr\.unit\) > 1/i);
    expect(migration).not.toMatch(/CREATE\s+TABLE\s+(IF NOT EXISTS\s+)?public\.cash_accounts/i);
    expect(migration).not.toMatch(/public\.sales_invoices/i);
    expect(migration).not.toMatch(/public\.company_memberships/i);
    expect(migration).not.toMatch(/public\.payments\s*\(/i);
  });

  it("retains the existing server-authoritative payment and double-entry treasury paths", () => {
    expect(commands).toMatch(/CREATE OR REPLACE FUNCTION public\.record_customer_payment\(/i);
    expect(cashExpenses).toMatch(/CREATE TABLE public\.cash_expenses/i);
    expect(cashExpenses).toMatch(/public\.record_cash_expense\(/i);
    expect(customerPostings).toContain("public.accounting_customer_source_postings");
    expect(customerPostings).toMatch(/public\.create_customer_payment_journal_draft\(/i);
    expect(commerce).not.toMatch(/CREATE\s+TABLE\s+(IF NOT EXISTS\s+)?public\.cash_accounts/i);
  });

  it("has PostgreSQL runtime coverage for all major KPI groups and a foreign tenant", () => {
    expect(runtimeTest).toContain("CI-P1-METRICS-FOREIGN");
    expect(runtimeTest).toContain("processing","shipped","delivered","cancelled");
    expect(runtimeTest).toContain("metricsAfter.completed_sales");
    expect(runtimeTest).toContain("metricsAfter.available_stock");
    expect(runtimeTest).toContain("metricsAfter.receivables_issued");
    expect(runtimeTest).toContain("700,0");
    expect(runtimeTest).toContain("800");
  });
});
