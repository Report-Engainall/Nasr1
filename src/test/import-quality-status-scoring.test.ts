import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20261024153000_import_quality_valid_row_scoring.sql", import.meta.url)),
  "utf8",
);

describe("DQS status scoring migration contract", () => {
  it("awards validity points only to explicit valid rows", () => {
    expect(migration).toMatch(/CASE WHEN r\.status='valid' THEN 100\.0 ELSE 0\.0 END/i);
    expect(migration).not.toMatch(/r\.status\s*<>\s*'rejected'/i);
  });

  it("retains tenant scope, active staff authorization and grants", () => {
    expect(migration).toContain("public.current_profile_id()");
    expect(migration).toContain("p.auth_user_id=auth.uid() AND p.is_active");
    expect(migration).toContain("j.id=p_job_id AND j.organization_id=v_org");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.calculate_import_job_quality(uuid) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.calculate_import_job_quality(uuid) TO authenticated");
  });
});
