import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261021160000_target_native_catalog_trigram_search.sql"),
  "utf8",
);
const runtimeTest = readFileSync(
  join(process.cwd(), "scripts/test-admin-catalog-commands.mjs"),
  "utf8",
);

describe("target-native catalog trigram indexes", () => {
  it("uses the installed pg_trgm extension and Nasr1's actual searchable columns", () => {
    expect(migration).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions/i);
    expect(migration).toMatch(/ON public\.products USING gin \(name extensions\.gin_trgm_ops\)/i);
    expect(migration).toMatch(/ON public\.products USING gin \(item_code extensions\.gin_trgm_ops\)/i);
    expect(migration).not.toMatch(/\bsku\b/i);
  });

  it("limits trigram indexes to active rows and tests the actual PostgreSQL operator", () => {
    expect(migration).toMatch(/WHERE status = 'active'/i);
    expect(runtimeTest).toContain("products_org_name_trgm_idx");
    expect(runtimeTest).toContain("products_org_item_code_trgm_idx");
    expect(runtimeTest).toMatch(/name OPERATOR\(extensions\. %\)/i);
    expect(runtimeTest).toMatch(/item_code OPERATOR\(extensions\. %\)/i);
  });
});
