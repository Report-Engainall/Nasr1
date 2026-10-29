import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261029270000_staff_finance_print_customer_uuid_label_guard.sql",
), "utf8");

describe("finance print customer label privacy migration", () => {
  it("uses a customer-facing fallback instead of an internal UUID in selectors and credit-memo PDFs", () => {
    expect(migration).toContain("'عميل غير مسمى'");
    expect(migration).not.toMatch(/'customer_name'\s*,\s*COALESCE\([\s\S]{0,180}?(?:i|m)\.customer_id::text/i);
    expect(migration).not.toMatch(/'name'\s*,\s*COALESCE\([\s\S]{0,180}?c\.id::text/i);
  });

  it("preserves the authenticated finance-role and tenant boundary", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_finance_document_print_options\(p_limit integer, p_offset integer\)[\s\S]*?SECURITY DEFINER\s+SET search_path=''/i);
    expect(migration).toMatch(/p\.auth_user_id\s*=\s*auth\.uid\(\)/i);
    expect(migration).toMatch(/public\.can_manage_finance\(\)/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_finance_document_print_options\(integer,integer\) FROM PUBLIC,anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_finance_document_print_options\(integer,integer\) TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_customer_return_credit_memo_pdf\(uuid\) FROM PUBLIC,anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_customer_return_credit_memo_pdf\(uuid\) TO authenticated/i);
  });
});
