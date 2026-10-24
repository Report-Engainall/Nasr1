import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261024151500_import_quality_validity_status.sql"),
  "utf8",
);

describe("import quality row-status validity contract", () => {
  it("scores only rows explicitly marked valid", () => {
    expect(migration).toContain("CASE WHEN r.status = 'valid' THEN 100.0 ELSE 0.0 END");
    expect(migration).not.toContain("r.status<>'rejected'");
  });

  it("retains tenant-scope authorization before resolving job identifiers", () => {
    expect(migration).toContain("auth.uid() IS NULL OR v_actor IS NULL");
    expect(migration).toContain("j.id=p_job_id AND j.organization_id=v_org");
    expect(migration).toContain("p.id=v_job.profile_id AND p.organization_id=v_org");
  });
});
