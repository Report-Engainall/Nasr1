import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261020120000_stock_count_start_audit.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const functionBody = migration.match(
  /CREATE OR REPLACE FUNCTION public\.audit_stock_count_session_start\(\)[\s\S]*?\$function\$;/i,
)?.[0] ?? "";
const auditInsert = functionBody.match(/INSERT INTO public\.audit_logs[\s\S]*?;/i)?.[0] ?? "";

describe("stock-count start audit migration contract", () => {
  it("uses a target-native SECURITY DEFINER trigger with an empty search path", () => {
    expect(functionBody).toMatch(/RETURNS trigger/i);
    expect(functionBody).toMatch(/SECURITY DEFINER/i);
    expect(functionBody).toMatch(/SET search_path\s*=\s*''/i);
    expect(migration).toMatch(
      /CREATE TRIGGER inventory_stock_count_start_audit\s+AFTER INSERT ON public\.stock_count_sessions\s+FOR EACH ROW EXECUTE FUNCTION public\.audit_stock_count_session_start\(\);/i,
    );
    expect(migration).not.toMatch(/CREATE TABLE[^;]*public\.stock_counts\b/i);
  });

  it("revalidates the active authenticated actor against the session tenant", () => {
    expect(functionBody).toMatch(/auth\.uid\(\) IS NULL/i);
    expect(functionBody).toMatch(/p\.id\s*=\s*NEW\.started_by/i);
    expect(functionBody).toMatch(/p\.auth_user_id\s*=\s*auth\.uid\(\)/i);
    expect(functionBody).toMatch(/p\.organization_id\s*=\s*NEW\.organization_id/i);
    expect(functionBody).toMatch(/p\.is_active\s*=\s*true/i);
    expect(functionBody).toMatch(/ERRCODE\s*=\s*'42501'/i);
  });

  it("logs one target-native creation event with metadata-only fields", () => {
    expect(auditInsert).toMatch(/NEW\.organization_id/i);
    expect(auditInsert).toMatch(/NEW\.started_by/i);
    expect(auditInsert).toMatch(/'inventory\.stock_count\.started'/i);
    expect(auditInsert).toMatch(/'stock_count_session'/i);
    expect(auditInsert).toMatch(/NEW\.id/i);
    expect(auditInsert).toMatch(/'warehouse_id',\s*NEW\.warehouse_id/i);
    expect(auditInsert).toMatch(/'status',\s*NEW\.status/i);
    expect(auditInsert).toMatch(/'started_at',\s*NEW\.started_at/i);
    expect(auditInsert).not.toMatch(/NEW\.(?:notes|idempotency_key|started_by_email)/i);
  });

  it("does not grant direct execution to client roles", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.audit_stock_count_session_start\(\) FROM PUBLIC,\s*anon,\s*authenticated;/i,
    );
    expect(migration).toMatch(/has_function_privilege\('anon',[\s\S]*?'EXECUTE'\)/i);
    expect(migration).toMatch(/has_function_privilege\('authenticated',[\s\S]*?'EXECUTE'\)/i);
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.audit_stock_count_session_start\(\) TO (?:PUBLIC|anon|authenticated)\b/i,
    );
  });

  it("limits the audit trigger to INSERT, leaving completion and cancellation to existing commands", () => {
    expect(migration).toMatch(
      /CREATE TRIGGER inventory_stock_count_start_audit\s+AFTER INSERT ON public\.stock_count_sessions/i,
    );
    expect(migration).not.toMatch(
      /CREATE TRIGGER inventory_stock_count_start_audit\s+AFTER (?:INSERT OR UPDATE|UPDATE|DELETE)/i,
    );
  });
});
