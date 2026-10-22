import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261023010000_customer_statement_credit_memo_parity.sql",
), "utf8");

describe("customer statement posted-credit parity migration", () => {
  it("preserves the authenticated active customer and tenant boundary", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_customer_account_statement\(\)/i);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*?SET search_path\s*=\s*''/i);
    expect(migration).toMatch(/p\.auth_user_id\s*=\s*auth\.uid\(\)/i);
    expect(migration).toMatch(/p\.is_active\s*=\s*true/i);
    expect(migration).toMatch(/cm\.organization_id=v_org[\s\S]*?cm\.customer_id=v_customer/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_customer_account_statement\(\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_customer_account_statement\(\) TO authenticated/i);
  });

  it("subtracts only posted, invoice-linked credits from each invoice and ledger-wide balance", () => {
    expect(migration).toContain("public.customer_return_credit_memos");
    expect(migration).toMatch(/cm\.status='posted'/i);
    expect(migration).toMatch(/ci\.organization_id=cm\.organization_id/i);
    expect(migration).toMatch(/ci\.customer_id=cm\.customer_id/i);
    expect(migration).toMatch(/cm\.currency IS DISTINCT FROM ci\.currency/i);
    expect(migration).toContain("AS credit_memo_amount");
    expect(migration).toMatch(/GREATEST\(ci\.total_amount-COALESCE\(pbi\.paid_amount,0\)-COALESCE\(cbi\.credited_amount,0\),0\)/i);
    expect(migration).toMatch(/'credited',s\.credited::text/i);
    expect(migration).toMatch(/'credits',v_credits/i);
    expect(migration).toMatch(/ORDER BY cm\.posted_at DESC,cm\.id[\s\S]*?LIMIT 500/i);
  });

  it("fails closed for posted credit memos whose invoice identity or currency is inconsistent", () => {
    expect(migration).toContain("posted credit memo source or currency does not reconcile to the customer invoice");
    expect(migration).toMatch(/LEFT JOIN public\.customer_invoices ci[\s\S]*?ci\.customer_id=cm\.customer_id/i);
    expect(migration).toMatch(/cm\.status='posted'[\s\S]*?ci\.id IS NULL OR cm\.currency IS DISTINCT FROM ci\.currency/i);
  });
});
