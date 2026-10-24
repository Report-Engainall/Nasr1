import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261024145000_ai_fallback_decision_reject_null.sql"),
  "utf8",
);
function bodyOf(name: string): string {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public." + name);
  const end = migration.indexOf("$function$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("AI gateway fallback outcome contract", () => {
  it("rejects missing fallback decision in v1 before reservation lock or any write", () => {
    const body = bodyOf("complete_ai_gateway_usage");
    const guard = body.indexOf("IF p_fallback_used IS NULL THEN");
    const lookup = body.indexOf("SELECT r.* INTO v_res");
    const update = body.indexOf("UPDATE public.ai_usage_reservations");
    expect(guard).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(guard);
    expect(update).toBeGreaterThan(lookup);
    expect(body).toContain("ERRCODE='22023'");
    expect(body).toContain("p_provider IS NULL");
    expect(body).toContain("p_result_status IS NULL");
  });

  it("rejects missing fallback decision in v2 even for unknown-measurement outcomes", () => {
    const body = bodyOf("complete_ai_gateway_usage_v2");
    const guard = body.indexOf("IF p_fallback_used IS NULL THEN");
    const loop = body.indexOf("FOR v_attempt IN");
    const lookup = body.indexOf("SELECT r.* INTO v_res");
    expect(guard).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(guard);
    expect(lookup).toBeGreaterThan(loop);
    expect(body).toContain("AI fallback decision must be explicit");
  });

  it("preserves trusted gateway authorization and observed-usage contracts", () => {
    for (const name of ["complete_ai_gateway_usage", "complete_ai_gateway_usage_v2"]) {
      expect(bodyOf(name)).toContain("trusted AI gateway required");
      expect(bodyOf(name)).toContain("public.ai_usage_reservations");
      expect(bodyOf(name)).toContain("ERRCODE='42501'");
    }
    const v2 = bodyOf("complete_ai_gateway_usage_v2");
    expect(v2).toContain("p_usage_measurement_status='measured'");
    expect(v2).toContain("p_usage_measurement_status='partial'");
    expect(v2).toContain("unknown usage cannot claim measured tokens");
  });
});
