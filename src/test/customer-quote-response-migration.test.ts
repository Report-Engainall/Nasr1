import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261024130000_customer_quote_response_explicit_decision.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const functionStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.customer_respond_to_quote");
const functionEnd = migration.indexOf("$function$;", functionStart);
const functionSource = migration.slice(functionStart, functionEnd);

describe("customer quote response explicit-decision migration", () => {
  it("rejects null quote IDs and null accept/reject decisions before mutating quote status", () => {
    const invalidInputGuard = functionSource.indexOf(
      "IF p_quote_id IS NULL OR p_accept IS NULL THEN",
    );
    const update = functionSource.indexOf("UPDATE public.sales_quotes q");
    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionEnd).toBeGreaterThan(functionStart);
    expect(invalidInputGuard).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(invalidInputGuard);
    expect(functionSource).toMatch(
      /IF p_quote_id IS NULL OR p_accept IS NULL THEN[\s\S]*?ERRCODE='22023'[\s\S]*?explicit accept or reject decision is required/i,
    );
  });

  it("preserves customer capability, customer ownership, and quoted-state guards", () => {
    expect(functionSource).toContain("public.current_customer_can('quotes.manage')");
    expect(functionSource).toContain("v_customer:=public.current_customer_id()");
    expect(functionSource).toContain("q.id=p_quote_id AND q.customer_id=v_customer AND q.status='quoted'");
    expect(functionSource).toContain("quote is unavailable or no longer awaiting a response");
  });

  it("keeps the SECURITY DEFINER RPC isolated from public and anonymous callers", () => {
    expect(functionSource).toMatch(/SECURITY DEFINER\s+SET search_path = ''/i);
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.customer_respond_to_quote(uuid,boolean) FROM PUBLIC, anon",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.customer_respond_to_quote(uuid,boolean) TO authenticated",
    );
  });
});
