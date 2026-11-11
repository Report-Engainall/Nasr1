import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261110103000_admin_import_snapshot_replay_safety.sql", import.meta.url),
  "utf8",
);

describe("admin Onyx snapshot application migration guards", () => {
  it("rejects a missing or incomplete source import job before applying rows", () => {
    const lookup = migration.match(/select\\s+j\\.status\\s+into\\s+v_job_status[\\s\\S]*?;/i)?.[0] ?? "";
    expect(lookup).toMatch(/where\\s+j\\.id\\s*=\\s*v_snapshot\\.source_import_job_id\\s+and\\s+j\\.organization_id\\s*=\\s*v_org/i);
    const guard = /if\\s+v_job_status\\s+is\\s+null\\s+or\\s+v_job_status\\s+not\\s+in\\s*\\(\\s*'completed'\\s*,\\s*'completed_with_warnings'\\s*\\)\\s+then/i;
    expect(migration).toMatch(guard);
    expect(migration.indexOf("for v_row in")).toBeGreaterThan(migration.search(guard));
  });

  it("rejects null or sub-threshold snapshot quality instead of treating null as ready", () => {
    expect(migration).toMatch(/if\\s+not\\s+found\\s+or\\s+coalesce\\(v_snapshot\\.data_quality_score,\\s*0\\)\\s*<\\s*75\\s+then/i);
  });

  it("rejects null and unsupported source-row states before import-kind handling", () => {
    const guard = /if\\s+v_row\\.status\\s+is\\s+null\\s+or\\s+v_row\\.status\\s+not\\s+in\\s*\\(\\s*'valid'\\s*,\\s*'warning'\\s*\\)\\s+then/i;
    expect(migration).toMatch(guard);
    expect(migration.indexOf("continue;")).toBeGreaterThan(migration.search(guard));
  });
});
