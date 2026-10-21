import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261021180000_target_native_catalog_trigram_search.sql"),
  "utf8",
);
const runtimeTest = readFileSync(
  join(process.cwd(), "scripts/test-admin-catalog-commands.mjs"),
  "utf8",
);

describe("target-native catalog trigram indexes", () => {
  it("resolves pg_trgm from the namespace available in Supabase or isolated PostgreSQL", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions");
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public");
    expect(migration).toContain("v_extension_schema");
    expect(migration).toContain("%I.gin_trgm_ops");
  });

  it("indexes Nasr1's real active-product search columns without importing donor sku schema", () => {
    expect(migration).toContain("products_org_name_trgm_idx");
    expect(migration).toContain("products_org_item_code_trgm_idx");
    expect(migration).toContain("name %I.gin_trgm_ops");
    expect(migration).toContain("item_code %I.gin_trgm_ops");
    expect(migration).toContain("WHERE status = %L");
    expect(migration).not.toMatch(/USING gin \(sku\b/i);
  });

  it("executes trigram matching using the installed PostgreSQL operator schema", () => {
    expect(runtimeTest).toContain("pg_extension e join pg_namespace n on n.oid=e.extnamespace");
    expect(runtimeTest).toContain("name OPERATOR(${trigramSchema}.%)");
    expect(runtimeTest).toContain("item_code OPERATOR(${trigramSchema}.%)");
    expect(runtimeTest).toContain("products_org_name_trgm_idx");
    expect(runtimeTest).toContain("products_org_item_code_trgm_idx");
  });
});
