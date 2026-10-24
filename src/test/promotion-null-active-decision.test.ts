import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261024143000_promotion_null_active_decision.sql"),
  "utf8",
);
function functionBody(name: string): string {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public." + name);
  const end = migration.indexOf("$function$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("promotion explicit active-state contract", () => {
  it("rejects NULL is_active in save_promotion before inserts or updates", () => {
    const body = functionBody("save_promotion");
    const guard = body.indexOf("IF p_is_active IS NULL THEN");
    const insert = body.indexOf("INSERT INTO public.promotions");
    const update = body.indexOf("UPDATE public.promotions");
    expect(guard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(guard);
    expect(update).toBeGreaterThan(guard);
    expect(body).toContain("ERRCODE = '22023'");
    expect(body).not.toContain("coalesce(p_is_active, false)");
  });

  it("rejects NULL toggle decisions before reading/locking a promotion", () => {
    const body = functionBody("set_promotion_active");
    const guard = body.indexOf("IF p_is_active IS NULL THEN");
    const select = body.indexOf("SELECT p.* INTO v_row");
    expect(guard).toBeGreaterThan(-1);
    expect(select).toBeGreaterThan(guard);
    expect(body).toContain("v_active boolean := p_is_active;");
    expect(body).not.toContain("coalesce(p_is_active, false)");
  });

  it("preserves manager/admin authorization and audit logging", () => {
    for (const name of ["save_promotion", "set_promotion_active"]) {
      const body = functionBody(name);
      expect(body).toContain("public.current_organization_id()");
      expect(body).toContain("r.role IN ('admin', 'manager')");
      expect(body).toContain("INSERT INTO public.audit_logs");
    }
  });
});
