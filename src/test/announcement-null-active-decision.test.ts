import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261024144500_announcement_null_active_decision.sql"),
  "utf8",
);
const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.save_storefront_announcement");
const end = migration.indexOf("$function$;", start);
const body = migration.slice(start, end);

describe("storefront announcement active-state contract", () => {
  it("rejects a NULL active decision before create/update writes", () => {
    const guard = body.indexOf("IF p_is_active IS NULL THEN");
    const insert = body.indexOf("INSERT INTO public.storefront_announcements");
    const update = body.indexOf("UPDATE public.storefront_announcements");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(guard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(guard);
    expect(update).toBeGreaterThan(guard);
    expect(body).toContain("ERRCODE='22023'");
    expect(body).not.toContain("coalesce(p_is_active,false)");
  });

  it("preserves active admin/manager authorization and audit writes", () => {
    expect(body).toContain("public.current_organization_id()");
    expect(body).toContain("r.role IN ('admin','manager')");
    expect(body).toContain("INSERT INTO public.audit_logs");
    expect(body).toContain("'storefront_announcement.updated'");
  });
});
