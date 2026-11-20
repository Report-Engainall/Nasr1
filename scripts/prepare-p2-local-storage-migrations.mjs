import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const runnerTemp = resolve(requiredEnv("RUNNER_TEMP"));
const migrationsDirectory = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("Pass the isolated P2 migration-copy directory as the first argument.");
}

const relativeDirectory = relative(runnerTemp, migrationsDirectory);
if (
  relativeDirectory !== ["p2-local-supabase", "supabase", "migrations"].join(sep)
) {
  throw new Error("Refusing to rewrite migrations outside the isolated RUNNER_TEMP Supabase copy.");
}

const bucketMigration = "20261018100000_product_image_storage.sql";
const policyScopeMigration = "20261018110000_product_image_storage_policy_scope.sql";
const edgeBoundaryMigration = "20261018120000_product_image_edge_upload_boundary.sql";

const bucketPath = resolve(migrationsDirectory, bucketMigration);
const bucketSource = await readFile(bucketPath, "utf8");
assert.ok(bucketSource.includes("INSERT INTO storage.buckets"), "The product-images bucket migration must retain its real bucket upsert.");
assert.ok(bucketSource.includes("file_size_limit = 8388608"), "The product-images bucket must retain its 8 MiB limit.");
assert.ok(bucketSource.includes("ARRAY['image/webp']::text[]"), "The product-images bucket must retain its WebP-only MIME restriction.");

const storageObjectsBlockStart = bucketSource.indexOf(
  "  IF to_regclass('storage.objects') IS NOT NULL THEN",
);
assert.notEqual(storageObjectsBlockStart, -1, "Expected the historical storage.objects DDL block.");
const storageObjectsBlockEnd = bucketSource.indexOf("\n  END IF;", storageObjectsBlockStart);
assert.notEqual(storageObjectsBlockEnd, -1, "Expected the closing storage.objects guard.");
const bucketOnlySource =
  bucketSource.slice(0, storageObjectsBlockStart) +
  bucketSource.slice(storageObjectsBlockEnd + "\n  END IF;".length);
assert.ok(!bucketOnlySource.includes("storage.objects"), "The local bucket migration must not issue DDL against storage.objects.");
await writeFile(bucketPath, bucketOnlySource, "utf8");

const policyScopePath = resolve(migrationsDirectory, policyScopeMigration);
const policyScopeSource = await readFile(policyScopePath, "utf8");
assert.ok(policyScopeSource.includes("CREATE POLICY product_images_tenant_insert ON storage.objects"));
assert.ok(policyScopeSource.includes("CREATE POLICY product_images_tenant_delete ON storage.objects"));

const edgeBoundaryPath = resolve(migrationsDirectory, edgeBoundaryMigration);
const edgeBoundarySource = await readFile(edgeBoundaryPath, "utf8");
assert.ok(edgeBoundarySource.includes("DROP POLICY IF EXISTS product_images_tenant_insert ON storage.objects"));
assert.ok(edgeBoundarySource.includes("REVOKE INSERT, UPDATE, DELETE ON TABLE storage.objects"));

const localOnlyNoop = (migrationName) =>
  [
    "-- Local P2 compatibility copy only.",
    "-- Supabase Storage owns storage.objects; its managed owner controls table RLS and grants.",
    "-- The product-image Edge handler uses the server-only service-role client for object writes.",
    "-- The hosted migration chain remains unchanged. The real local Storage API is exercised by test-product-image-storage.ts.",
    `-- Source migration: ${migrationName}`,
    "SELECT 1;",
    "",
  ].join("\n");

await writeFile(policyScopePath, localOnlyNoop(policyScopeMigration), "utf8");
await writeFile(edgeBoundaryPath, localOnlyNoop(edgeBoundaryMigration), "utf8");

for (const file of [bucketMigration, policyScopeMigration, edgeBoundaryMigration]) {
  const content = await readFile(resolve(migrationsDirectory, file), "utf8");
  assert.ok(!content.includes("ALTER TABLE storage.objects"), `${file} must not alter managed Storage tables in the local migration runner.`);
  assert.ok(!content.includes("CREATE POLICY"), `${file} must not create Storage RLS policies in the local migration runner.`);
}

process.stdout.write(
  "P2_LOCAL_STORAGE_MIGRATION_PREP_PASS: retained product-images public/WebP/8 MiB bucket metadata; isolated only the three historical storage.objects policy/grant migrations; all repository source migrations remain untouched.\n",
);
