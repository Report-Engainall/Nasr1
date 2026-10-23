import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for the isolated backup/restore drill.");

const sourceUrl = new URL(databaseUrl);
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const sourceDatabase = decodeURIComponent(sourceUrl.pathname.replace(/^\//, ""));
if (!allowedHosts.has(sourceUrl.hostname) || sourceDatabase !== "aghbari_test") {
  throw new Error("Refusing backup/restore: source must be the loopback-only CI database named aghbari_test.");
}

const maintenanceUrl = new URL(sourceUrl);
maintenanceUrl.pathname = "/postgres";
const restoreDatabase = "aghbari_restore_" + process.pid + "_" + Date.now().toString(36);
const restoreUrl = new URL(sourceUrl);
restoreUrl.pathname = "/" + restoreDatabase;
const workDir = mkdtempSync(join(tmpdir(), "aghbari-backup-restore-"));
const backupPath = join(workDir, "aghbari-test.dump");
const dockerTools = process.env.PGTOOLS_DOCKER === "true";
let restoreDatabaseCreated = false;
const startedAt = new Date().toISOString();
const startedClock = performance.now();

function runTool(name, args) {
  const mappedArgs = args.map((arg) => {
    if (typeof arg !== "string") return arg;
    return arg.includes(workDir) ? arg.replaceAll(workDir, "/drill") : arg;
  });
  const command = dockerTools
    ? "docker"
    : name;
  const commandArgs = dockerTools
    ? ["run", "--rm", "--network", "host", "--volume", workDir + ":/drill:rw", "postgres:17", name, ...mappedArgs]
    : mappedArgs;
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    timeout: 180_000,
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw new Error(name + " could not start: " + result.error.message);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(-6000);
    throw new Error(name + " exited with status " + result.status + (detail ? ":\n" + detail : ""));
  }
  return (result.stdout || "").trim();
}

function schemaDataSignature(url) {
  const sql = `select concat_ws('|',
    (select count(*)::text from information_schema.tables where table_schema in ('public','auth','storage') and table_type='BASE TABLE'),
    (select count(*)::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','storage')),
    (select count(*)::text from pg_catalog.pg_policies where schemaname='public'),
    (select count(*)::text from information_schema.triggers where trigger_schema='public'),
    (select count(*)::text from public.organizations),
    (select count(*)::text from public.products),
    (select count(*)::text from public.orders),
    (select count(*)::text from public.inventory_balances),
    (select count(*)::text from public.audit_logs),
    (select count(*)::text from public.inventory_movements),
    (select count(*)::text from public.inventory_transfer_batches),
    (select md5(coalesce(string_agg(row_data, E'\n' order by row_data), '')) from (select to_jsonb(t)::text as row_data from public.organizations t) as backup_rows),
    (select md5(coalesce(string_agg(row_data, E'\n' order by row_data), '')) from (select to_jsonb(t)::text as row_data from public.products t) as backup_rows),
    (select md5(coalesce(string_agg(row_data, E'\n' order by row_data), '')) from (select to_jsonb(t)::text as row_data from public.orders t) as backup_rows),
    (select md5(coalesce(string_agg(row_data, E'\n' order by row_data), '')) from (select to_jsonb(t)::text as row_data from public.inventory_balances t) as backup_rows),
    (select md5(coalesce(string_agg(row_data, E'\n' order by row_data), '')) from (select to_jsonb(t)::text as row_data from public.audit_logs t) as backup_rows),
    (select md5(coalesce(string_agg(row_data, E'\n' order by row_data), '')) from (select to_jsonb(t)::text as row_data from public.inventory_movements t) as backup_rows),
    (select md5(coalesce(string_agg(row_data, E'\n' order by row_data), '')) from (select to_jsonb(t)::text as row_data from public.inventory_transfer_batches t) as backup_rows)
  )`;
  return runTool("psql", [
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--dbname=" + url.toString(),
    "--command=" + sql,
  ]);
}

function catalogJsonSha256(url, label, sql) {
  const output = runTool("psql", [
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--dbname=" + url,
    "--command=" + sql,
  ]);
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (cause) {
    throw new Error(label + " catalog query did not return valid JSON: " + String(cause?.message ?? cause));
  }
  return createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
}

function definitionSignatures(url) {
  // pg_dump's schema-only form covers relations, columns, constraints, indexes,
  // types, functions, policies and triggers. PostgreSQL 17 emits a randomized
  // psql restriction token; remove only those wrapper lines before fingerprinting.
  const schemaDump = runTool("pg_dump", [
    "--schema-only",
    "--no-owner",
    "--no-acl",
    "--dbname=" + url,
  ]);
  const canonicalSchemaDump = schemaDump
    .split(/\r?\n/)
    .filter((line) => !/^\\(?:un)?restrict(?:\s|$)/.test(line))
    .join("\n")
    .trim();
  assert.ok(canonicalSchemaDump.length > 1000, "schema-only dump is unexpectedly small");

  const routinesSql = [
    "SELECT COALESCE(jsonb_agg(jsonb_build_array(",
    "n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid),",
    "p.prokind::text, l.lanname, pg_catalog.format_type(p.prorettype, NULL),",
    "p.prosecdef, p.provolatile::text, p.proisstrict, p.proretset,",
    "COALESCE(p.proconfig, ARRAY[]::text[]), pg_catalog.pg_get_functiondef(p.oid)",
    ") ORDER BY n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),",
    "'[]'::jsonb)::text",
    "FROM pg_catalog.pg_proc p",
    "JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace",
    "JOIN pg_catalog.pg_language l ON l.oid=p.prolang",
    "WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND p.prokind IN ('f','p','w')",
  ].join(" ");

  const policiesSql = [
    "SELECT COALESCE(jsonb_agg(jsonb_build_array(",
    "schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check",
    ") ORDER BY schemaname, tablename, policyname), '[]'::jsonb)::text",
    "FROM pg_catalog.pg_policies",
    "WHERE schemaname <> 'information_schema' AND schemaname !~ '^pg_'",
  ].join(" ");

  const triggersSql = [
    "SELECT COALESCE(jsonb_agg(jsonb_build_array(",
    "n.nspname, c.relname, t.tgname, t.tgenabled::text,",
    "pg_catalog.pg_get_triggerdef(t.oid, true)",
    ") ORDER BY n.nspname, c.relname, t.tgname), '[]'::jsonb)::text",
    "FROM pg_catalog.pg_trigger t",
    "JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid",
    "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
    "WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND NOT t.tgisinternal",
  ].join(" ");

  return {
    schemaSha256: createHash("sha256").update(canonicalSchemaDump).digest("hex"),
    routineSha256: catalogJsonSha256(url.toString(), "routine", routinesSql),
    policySha256: catalogJsonSha256(url.toString(), "RLS policy", policiesSql),
    triggerSha256: catalogJsonSha256(url.toString(), "user trigger", triggersSql),
  };
}

function appendSummary(lines) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) appendFileSync(path, "\n" + lines.join("\n") + "\n", "utf8");
}

async function main() {
  let backupElapsedMs = 0;
  let restoreElapsedMs = 0;
  let backupSha256 = "";
  let backupBytes = 0;
  try {
    const backupStarted = performance.now();
    runTool("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--file=" + backupPath,
      "--dbname=" + sourceUrl.toString(),
    ]);
    backupElapsedMs = Math.round(performance.now() - backupStarted);
    const backupBytesResult = statSync(backupPath).size;
    assert.ok(backupBytesResult > 1024, "custom-format database backup is unexpectedly small");
    backupBytes = backupBytesResult;
    backupSha256 = createHash("sha256").update(readFileSync(backupPath)).digest("hex");
    assert.match(backupSha256, /^[0-9a-f]{64}$/, "backup SHA-256 fingerprint must be recorded");

    runTool("createdb", ["--maintenance-db=" + maintenanceUrl.toString(), restoreDatabase]);
    restoreDatabaseCreated = true;
    const restoreStarted = performance.now();
    runTool("pg_restore", [
      "--no-owner",
      "--no-acl",
      "--dbname=" + restoreUrl.toString(),
      backupPath,
    ]);
    restoreElapsedMs = Math.round(performance.now() - restoreStarted);

    const sourceSignature = schemaDataSignature(sourceUrl.toString());
    const restoredSignature = schemaDataSignature(restoreUrl.toString());
    assert.equal(
      restoredSignature,
      sourceSignature,
      "restored schema/function/policy/trigger counts and critical row counts must match the source signature",
    );
    const sourceDefinitions = definitionSignatures(sourceUrl.toString());
    const restoredDefinitions = definitionSignatures(restoreUrl.toString());
    assert.deepEqual(
      restoredDefinitions,
      sourceDefinitions,
      "schema, routine, RLS policy and user-trigger definition SHA-256 signatures must match the source",
    );

    const requiredFunctions = runTool("psql", [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--dbname=" + restoreUrl.toString(),
      "--command=select (to_regprocedure('public.transfer_inventory_batch(uuid,uuid,text,jsonb,text)') is not null and to_regprocedure('public.apply_onyx_inventory_reconciliation(uuid,text)') is not null)::text",
    ]);
    assert.equal(requiredFunctions, "true", "restore must preserve inventory-batch and Onyx reconciliation RPC contracts");

    const finishedAt = new Date().toISOString();
    const elapsedMs = Math.round(performance.now() - startedClock);
    const lines = [
      "## Isolated PostgreSQL 17 backup/restore drill",
      "- Result: **PASS**",
      "- Source: loopback-only `aghbari_test`; no hosted or production database accessed",
      "- Backup started: " + startedAt,
      "- Finished: " + finishedAt,
      "- Backup format: PostgreSQL custom archive",
      "- Backup size bytes: " + backupBytes,
      "- Backup SHA-256: `" + backupSha256 + "`",
      "- Backup duration ms: " + backupElapsedMs,
      "- Restore duration ms: " + restoreElapsedMs,
      "- Total measured duration ms: " + elapsedMs,
      "- Schema definition SHA-256 (source=restore): `" + sourceDefinitions.schemaSha256 + "`",
      "- Function/procedure definition SHA-256 (source=restore): `" + sourceDefinitions.routineSha256 + "`",
      "- RLS policy definition SHA-256 (source=restore): `" + sourceDefinitions.policySha256 + "`",
      "- User-trigger definition SHA-256 (source=restore): `" + sourceDefinitions.triggerSha256 + "`",
      "- Source/restore schema, routines, policies, triggers and critical row-count signature: identical",
      "- Critical RPCs restored: `transfer_inventory_batch`, `apply_onyx_inventory_reconciliation`",
      "- Temporary restore database: removed after verification",
    ];
    process.stdout.write(lines.join("\n") + "\n");
    appendSummary(lines);
  } catch (error) {
    appendSummary([
      "## Isolated PostgreSQL 17 backup/restore drill",
      "- Result: **FAIL**",
      "- Source was constrained to loopback-only `aghbari_test`.",
      "- Root error: `" + String(error?.message ?? error).replaceAll("`", "'").slice(0, 1500) + "`",
    ]);
    throw error;
  } finally {
    if (restoreDatabaseCreated) {
      try {
        runTool("dropdb", ["--if-exists", "--maintenance-db=" + maintenanceUrl.toString(), restoreDatabase]);
        process.stdout.write("PASS cleanup: temporary restore database dropped\n");
      } catch (error) {
        process.stderr.write("CLEANUP_FAILED: temporary restore database " + restoreDatabase + ": " + String(error?.message ?? error) + "\n");
        throw error;
      }
    }
    rmSync(workDir, { recursive: true, force: true });
  }
}

await main();
