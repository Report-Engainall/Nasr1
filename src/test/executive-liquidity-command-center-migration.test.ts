import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261106233100_executive_liquidity_command_center.sql"), "utf8");
const supplierDueDates = readFileSync(join(process.cwd(), "supabase/migrations/20261106310000_supplier_invoice_due_date_cashflow_outflows.sql"), "utf8");

describe("executive liquidity command-center migration contract", () => {
  it("contains one complete function and no duplicated or orphaned SQL tail", () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION public\.fetch_executive_liquidity_workspace/g)).toHaveLength(1);
    expect(migration.match(/\$function\$;/g)).toHaveLength(1);
    expect(migration.match(/COMMENT ON FUNCTION public\.fetch_executive_liquidity_workspace/g)).toHaveLength(1);
    const unresolvedStart = migration.indexOf("unresolved AS (");
    const unresolvedEnd = migration.indexOf("valid_balances AS (", unresolvedStart);
    expect(unresolvedStart).toBeGreaterThanOrEqual(0);
    expect(unresolvedEnd).toBeGreaterThan(unresolvedStart);
    expect(migration.slice(unresolvedStart, unresolvedEnd)).toContain("OR aging_bucket = 'UNKNOWN_DUE_DATE'");
    expect(migration).not.toContain("!~ '^[A-Z]{3}\\n");
  });

  it("keeps unknown due dates and invalid currencies out of inferred aging totals", () => {
    expect(migration).toContain("OR aging_bucket = 'UNKNOWN_DUE_DATE'");
    expect(migration).toContain("OR i.due_at IS NULL");
    expect(migration).toContain("v_unresolved_receivables > 0");
    expect(migration).toContain("لم تُسند إلى فئة أعمار أو عملة تقديرية");
  });

  it("marks incomplete source-linked cash and receivables as partial", () => {
    expect(migration).toContain("v_unclassified_cash_lines > 0 OR v_unlinked_cash_expenses > 0 OR v_unlinked_customer_payments > 0");
    expect(migration).toContain("v_completeness := 'PARTIAL'");
    expect(migration).toContain("الحركات الفعلية تقتصر على تحصيلات العملاء");
  });

  it("does not synthesize balances, blend currencies or count reversed journals", () => {
    expect(migration).toContain("'balance', NULL");
    expect(migration).toContain("'balance_status', 'UNAVAILABLE'");
    expect(migration).toContain("GROUP BY account_id, currency");
    expect(migration).toContain("GROUP BY currency, aging_bucket");
    expect(migration).toContain("public.accounting_journal_reversals");
  });

  it("points to the separately evidenced supplier due-date cashflow schedule", () => {
    expect(supplierDueDates).toContain("public.purchase_supplier_invoice_due_dates");
    expect(supplierDueDates).toContain("public.fetch_supplier_payable_cashflow_schedule");
    expect(migration).toContain("'due_date_status', 'SEE_VERIFIED_CASHFLOW_SCHEDULE'");
    expect(migration).toContain("تواريخ استحقاق الموردين الموثقة متاحة عبر سجل أدلة مستقل");
  });

  it("retains authenticated finance authorization and active-tenant resolution", () => {
    expect(migration).toContain("p.auth_user_id = auth.uid()");
    expect(migration).toContain("p.is_active = true");
    expect(migration).toContain("NOT public.can_manage_finance()");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("TO authenticated");
  });
});
