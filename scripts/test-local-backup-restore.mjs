import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

function criticalBusinessDataSignature(url) {
  // Row-set fingerprints make the isolated restore drill cover financial postings,
  // source documents, import jobs, immutable Onyx snapshots and reconciliation commands.
  // Hash each canonical row set in PostgreSQL, then SHA-256 the small deterministic manifest.
  const tables = [
    ["cash_expenses", "public.cash_expenses"],
    ["customer_invoices", "public.customer_invoices"],
    ["customer_payments", "public.customer_payments"],
    ["accounting_accounts", "public.accounting_accounts"],
    ["accounting_journal_entries", "public.accounting_journal_entries"],
    ["accounting_journal_lines", "public.accounting_journal_lines"],
    ["accounting_source_postings", "public.accounting_source_postings"],
    ["accounting_customer_source_postings", "public.accounting_customer_source_postings"],
    ["customer_return_credit_memos", "public.customer_return_credit_memos"],
    ["customer_return_credit_memo_items", "public.customer_return_credit_memo_items"],
    ["accounting_return_credit_memo_postings", "public.accounting_return_credit_memo_postings"],
    ["purchase_receipts", "public.purchase_receipts"],
    ["purchase_receipt_accounting_postings", "public.purchase_receipt_accounting_postings"],
    ["import_jobs", "public.import_jobs"],
    ["import_job_request_keys", "public.import_job_request_keys"],
    ["onyx_snapshots", "public.onyx_snapshots"],
    ["onyx_snapshot_rows", "public.onyx_snapshot_rows"],
    ["onyx_inventory_reconciliation_commands", "public.onyx_inventory_reconciliation_commands"],
    ["onyx_inventory_reconciliation_items", "public.onyx_inventory_reconciliation_items"],
    ["async_export_jobs", "public.async_export_jobs"],
    ["outbox_events", "public.outbox_events"],
    ["outbox_event_deliveries", "public.outbox_event_deliveries"],
    ["ai_tasks", "public.ai_tasks"],
  ];
  const fields = tables.map(([label, table]) =>
    "'" + label + "', jsonb_build_object(" +
      "'row_count', (SELECT count(*)::bigint FROM " + table + "), " +
      "'rows_sha256', (SELECT public.customer_company_invitation_sha256(COALESCE(string_agg(row_data, pg_catalog.chr(10) ORDER BY row_data), '')) " +
        "FROM (SELECT pg_catalog.to_jsonb(t)::text AS row_data FROM " + table + " t) AS backup_rows))"
  );
  const sql = "SELECT pg_catalog.jsonb_build_object(" + fields.join(", ") + ")::text";
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
    throw new Error("critical business data signature did not return valid JSON: " + String(cause?.message ?? cause));
  }
  assert.equal(Object.keys(parsed).length, tables.length, "all critical financial/import/Onyx tables must be fingerprinted");
  const totalRows = Object.values(parsed).reduce((sum, value) => sum + Number(value.row_count), 0);
  assert.ok(Number.isSafeInteger(totalRows) && totalRows >= 0, "critical business data row count must be valid");
  return {
    sha256: createHash("sha256").update(JSON.stringify(parsed)).digest("hex"),
    tableCount: Object.keys(parsed).length,
    totalRows,
  };
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

function stripCompleteParentheses(value) {
  let expression = value.trim();
  while (expression.startsWith("(") && expression.endsWith(")")) {
    let depth = 0;
    let singleQuoted = false;
    let doubleQuoted = false;
    let dollarTag = null;
    let closesAtEnd = false;

    for (let index = 0; index < expression.length; index += 1) {
      const character = expression[index];
      if (dollarTag) {
        if (expression.startsWith(dollarTag, index)) {
          index += dollarTag.length - 1;
          dollarTag = null;
        }
        continue;
      }
      if (singleQuoted) {
        if (character === "'" && expression[index + 1] === "'") { index += 1; continue; }
        if (character === "'") singleQuoted = false;
        continue;
      }
      if (doubleQuoted) {
        if (character === '"' && expression[index + 1] === '"') { index += 1; continue; }
        if (character === '"') doubleQuoted = false;
        continue;
      }
      if (character === "'") { singleQuoted = true; continue; }
      if (character === '"') { doubleQuoted = true; continue; }
      if (character === "$") {
        const tag = expression.slice(index).match(/^\$[A-Za-z_0-9]*\$/)?.[0];
        if (tag) { dollarTag = tag; index += tag.length - 1; continue; }
      }
      if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          closesAtEnd = index === expression.length - 1;
          if (!closesAtEnd) break;
        }
        if (depth < 0) break;
      }
    }

    if (!closesAtEnd || depth !== 0 || singleQuoted || doubleQuoted || dollarTag) break;
    expression = expression.slice(1, -1).trim();
  }
  return expression;
}

function splitTopLevelBoolean(value, operator) {
  const parts = [];
  const keyword = operator.toUpperCase();
  let depth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let dollarTag = null;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (dollarTag) {
      if (value.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (singleQuoted) {
      if (character === "'" && value[index + 1] === "'") { index += 1; continue; }
      if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === '"' && value[index + 1] === '"') { index += 1; continue; }
      if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === "'") { singleQuoted = true; continue; }
    if (character === '"') { doubleQuoted = true; continue; }
    if (character === "$") {
      const tag = value.slice(index).match(/^\$[A-Za-z_0-9]*\$/)?.[0];
      if (tag) { dollarTag = tag; index += tag.length - 1; continue; }
    }
    if (character === "(") { depth += 1; continue; }
    if (character === ")") { depth -= 1; continue; }
    if (depth !== 0 || value.slice(index, index + keyword.length).toUpperCase() !== keyword) continue;

    const before = index === 0 ? " " : value[index - 1];
    const after = value[index + keyword.length] ?? " ";
    if (/[A-Za-z0-9_$]/.test(before) || /[A-Za-z0-9_$]/.test(after)) continue;
    if (keyword === "AND" && /\bBETWEEN\s*$/i.test(value.slice(start, index).trimEnd())) continue;

    parts.push(value.slice(start, index).trim());
    index += keyword.length - 1;
    start = index + 1;
  }

  if (parts.length === 0) return [value.trim()];
  parts.push(value.slice(start).trim());
  return parts;
}

function canonicalizeBooleanExpression(value) {
  const expression = stripCompleteParentheses(value);
  const disjunction = splitTopLevelBoolean(expression, "OR");
  if (disjunction.length > 1) {
    return {
      operator: "OR",
      sql: disjunction.map((term) => canonicalizeBooleanExpression(term).sql).join(" OR "),
    };
  }

  const conjunction = splitTopLevelBoolean(expression, "AND");
  if (conjunction.length > 1) {
    const terms = conjunction.map(canonicalizeBooleanExpression);
    return {
      operator: "AND",
      sql: terms.map((term) => term.operator === "OR" ? "(" + term.sql + ")" : term.sql).join(" AND "),
    };
  }

  return { operator: "ATOM", sql: expression };
}

function canonicalizeCheckConstraintLine(line) {
  const match = line.match(/^(\s*CONSTRAINT\s+.*?\s+CHECK\s*)\((.*)\)(,?)$/);
  if (!match) return line;
  return match[1] + "(" + canonicalizeBooleanExpression(match[2]).sql + ")" + match[3];
}

function canonicalSchemaDump(url) {
  // pg_dump schema output can retain redundant parentheses around associative
  // CHECK conjunctions that PostgreSQL normalizes when restoring the same DDL.
  // Normalize only boolean grouping in CHECK constraints; preserve operators,
  // literals, atom text, constraint names and every other schema definition.
  const schemaDump = runTool("pg_dump", [
    "--schema-only",
    "--no-owner",
    "--no-acl",
    "--dbname=" + url,
  ]);
  const canonical = schemaDump
    .split(/\r?\n/)
    .filter((line) => !/^\\(?:un)?restrict(?:\s|$)/.test(line))
    .map(canonicalizeCheckConstraintLine)
    .join("\n")
    .trim();
  assert.ok(canonical.length > 1000, "schema-only dump is unexpectedly small");
  return canonical;
}
function definitionSignatures(url) {
  const canonicalSchema = canonicalSchemaDump(url);

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
    schemaSha256: createHash("sha256").update(canonicalSchema).digest("hex"),
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
    if (restoredDefinitions.schemaSha256 !== sourceDefinitions.schemaSha256) {
      const sourceSchemaPath = join(workDir, "source-schema.sql");
      const restoredSchemaPath = join(workDir, "restored-schema.sql");
      writeFileSync(sourceSchemaPath, canonicalSchemaDump(sourceUrl.toString()), "utf8");
      writeFileSync(restoredSchemaPath, canonicalSchemaDump(restoreUrl.toString()), "utf8");
      const schemaDiff = spawnSync("diff", ["-u", sourceSchemaPath, restoredSchemaPath], {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      process.stderr.write(
        "BACKUP_RESTORE_SCHEMA_DEFINITION_DIFF (first 30000 chars):\\n" +
        (schemaDiff.stdout || schemaDiff.stderr || "diff utility produced no output").slice(0, 30_000) +
        "\\n",
      );
    }
    assert.deepEqual(
      restoredDefinitions,
      sourceDefinitions,
      "schema, routine, RLS policy and user-trigger definition SHA-256 signatures must match the source",
    );
    const sourceBusinessData = criticalBusinessDataSignature(sourceUrl.toString());
    const restoredBusinessData = criticalBusinessDataSignature(restoreUrl.toString());
    assert.deepEqual(
      restoredBusinessData,
      sourceBusinessData,
      "critical finance, import, Onyx, export-job, outbox and task row-set fingerprints must match after restore",
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
      "- Critical business data SHA-256 (source=restore): `" + sourceBusinessData.sha256 + "`",
      "- Fingerprinted financial/import/Onyx/export/outbox/task tables: " + sourceBusinessData.tableCount,
      "- Total rows across fingerprinted financial/import/Onyx/export/outbox/task tables: " + sourceBusinessData.totalRows,
      "- Source/restore schema, routines, policies, triggers, core row counts and critical finance/integration/queue data fingerprints: identical",
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
