import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required; run only against the isolated migrated PostgreSQL 17 test database.");

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
assert.ok(migrations.length >= 100, "expected the complete versioned migration set, not a partial workspace");
const typeRoots = new Set([
  "smallint", "int2", "integer", "int", "int4", "bigint", "int8", "serial", "bigserial",
  "real", "float4", "double", "numeric", "decimal", "money", "character", "char", "varchar",
  "text", "bytea", "timestamp", "timestamptz", "time", "timetz", "date", "interval",
  "boolean", "bool", "uuid", "json", "jsonb", "xml", "inet", "cidr", "macaddr", "macaddr8",
  "tsvector", "tsquery", "void", "trigger", "record", "anyelement", "anyarray", "anycompatible",
  "anycompatiblearray", "regclass", "regtype", "oid", "name", "bit", "varbit", "geometry",
  "geography", "public", "pg_catalog"
]);

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote === "'") {
      if (char === "'" && value[i + 1] === "'") { i += 1; continue; }
      if (char === "'") quote = "";
      continue;
    }
    if (quote === '"') {
      if (char === '"' && value[i + 1] === '"') { i += 1; continue; }
      if (char === '"') quote = "";
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (value.slice(start).trim()) parts.push(value.slice(start).trim());
  return parts;
}

function stripArgumentDefault(value) {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote === "'") {
      if (char === "'" && value[i + 1] === "'") { i += 1; continue; }
      if (char === "'") quote = "";
      continue;
    }
    if (quote === '"') {
      if (char === '"' && value[i + 1] === '"') { i += 1; continue; }
      if (char === '"') quote = "";
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth === 0 && /^\s+DEFAULT\s+/i.test(value.slice(i))) return value.slice(0, i).trim();
    if (depth === 0 && char === "=" && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trim();
  }
  return value.trim();
}

function normalizeType(value) {
  let type = value.toLowerCase().replace(/\s+/g, " ").trim();
  type = type.replace(/\btimestamp with time zone\b/g, "timestamptz");
  type = type.replace(/\btimestamp without time zone\b/g, "timestamp");
  type = type.replace(/\bcharacter varying\b/g, "varchar");
  type = type.replace(/\bint4\b|\bint\b/g, "integer");
  type = type.replace(/\bint2\b/g, "smallint");
  type = type.replace(/\bint8\b/g, "bigint");
  type = type.replace(/\bfloat8\b/g, "double precision");
  type = type.replace(/\bfloat4\b/g, "real");
  type = type.replace(/\bdecimal\b/g, "numeric");
  type = type.replace(/\bbool\b/g, "boolean");
  return type;
}

function argumentType(raw) {
  let arg = stripArgumentDefault(raw).replace(/^(INOUT|IN|OUT|VARIADIC)\s+/i, "").trim();
  const firstWhitespace = arg.search(/\s/);
  if (firstWhitespace > 0) {
    const first = arg.slice(0, firstWhitespace).toLowerCase();
    const recognizedType = typeRoots.has(first) || first.startsWith("public.") || first.startsWith("pg_catalog.");
    if (!recognizedType) arg = arg.slice(firstWhitespace + 1).trim();
  }
  return normalizeType(arg);
}

function typeSignature(argumentsText) {
  if (!argumentsText || !argumentsText.trim()) return "";
  return splitTopLevel(argumentsText).map(argumentType).join(",");
}

const declarations = new Map();
const declarationsByName = new Map();
for (const filename of migrations) {
  const source = stripComments(await readFile(resolve(migrationDir, filename), "utf8"));

  // Match schema-qualified declarations and functions created under the migration's
  // effective search_path. Unqualified declarations are credited only when the name and
  // signature also exist in the queried public runtime catalog.
  const createRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(public)\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*?)\)\s*RETURNS\b/gi;
  let match;
  while ((match = createRegex.exec(source)) !== null) {
    const name = match[2].toLowerCase();
    const types = typeSignature(match[3]);
    const declaration = {
      name,
      types,
      filename,
      sourceKind: match[1] ? "CREATE FUNCTION public" : "unqualified CREATE FUNCTION resolved against public runtime catalog",
    };
    declarations.set(name + "|" + types, declaration);
    if (!declarationsByName.has(name)) declarationsByName.set(name, new Map());
    declarationsByName.get(name).set(types, declaration);
  }

  // Historical operational-task implementations remain in pg_proc after a migration
  // renames the previous function. Record ALTER FUNCTION RENAME as source provenance.
  const renameRegex = /ALTER\s+FUNCTION\s+public\.([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*?)\)\s+RENAME\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)\s*'?\s*;/gi;
  while ((match = renameRegex.exec(source)) !== null) {
    const previousName = match[1].toLowerCase();
    const types = typeSignature(match[2]);
    const renamedName = match[3].toLowerCase();
    const declaration = {
      name: renamedName,
      types,
      filename,
      sourceKind: "ALTER FUNCTION RENAME from public." + previousName,
    };
    declarations.set(renamedName + "|" + types, declaration);
    if (!declarationsByName.has(renamedName)) declarationsByName.set(renamedName, new Map());
    declarationsByName.get(renamedName).set(types, declaration);
  }
}

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
let rows;
try {
  const roleRows = await db.unsafe("select rolname from pg_roles where rolname = any($1::text[])", [["anon", "authenticated", "service_role"]]);
  const roles = new Set(roleRows.map((row) => row.rolname));
  for (const role of ["anon", "authenticated", "service_role"]) assert.ok(roles.has(role), "missing isolated test role: " + role);

  rows = await db.unsafe(`
    select
      p.oid::text as oid,
      p.proname as name,
      p.prokind as kind_code,
      pg_get_function_identity_arguments(p.oid) as identity_args,
      pg_get_function_arguments(p.oid) as all_args,
      coalesce(pg_get_function_result(p.oid), 'procedure') as result_type,
      l.lanname as language,
      p.prosecdef as security_definer,
      p.proconfig as function_config,
      pg_get_userbyid(p.proowner) as owner_name,
      coalesce(p.proacl::text, '<default ACL>') as raw_acl,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
      coalesce(p.prosrc, '') as body,
      pg_get_functiondef(p.oid) as definition,
      e.extname as extension_name,
      exists (
        select 1 from pg_trigger t
        where t.tgfoid = p.oid and not t.tgisinternal
      ) as has_user_trigger_binding
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    left join pg_depend d on d.classid = 'pg_proc'::regclass
      and d.objid = p.oid and d.refclassid = 'pg_extension'::regclass and d.deptype = 'e'
    left join pg_extension e on e.oid = d.refobjid
    where n.nspname = 'public' and p.prokind in ('f','p')
    order by p.proname, pg_get_function_identity_arguments(p.oid), p.oid
  `);
} finally {
  await db.end({ timeout: 5 });
}

assert.ok(rows.length > 0, "no public functions/procedures found after migrations");
const mappedRows = [];
for (const row of rows) {
  const name = row.name.toLowerCase();
  const types = typeSignature(row.identity_args || "");
  let source = declarations.get(name + "|" + types) || null;
  if (!source) {
    const candidates = declarationsByName.get(name);
    if (candidates?.size === 1) source = [...candidates.values()][0];
  }
  const body = row.body || "";
  const config = Array.isArray(row.function_config) ? row.function_config.join("; ") : (row.function_config || "");
  const executeRoles = [
    row.anon_execute ? "anon" : null,
    row.authenticated_execute ? "authenticated" : null,
    row.service_role_execute ? "service_role" : null
  ].filter(Boolean);
  const signals = [];
  if (/auth\.uid\s*\(/i.test(body)) signals.push("auth.uid");
  if (/current_profile_id|profiles\s+p|is_active/i.test(body)) signals.push("profile/active");
  if (/organization_id|current_organization_id|v_org|tenant_id/i.test(body)) signals.push("tenant signal");
  if (/can_manage_finance|is_staff|user_roles|role\s+in/i.test(body)) signals.push("role signal");
  if (/idempotency|request_hash|on\s+conflict/i.test(body)) signals.push("idempotency");
  if (/for\s+update|skip\s+locked|pg_advisory/i.test(body)) signals.push("locking");
  if (/audit_logs|actor_id|audit/i.test(body)) signals.push("audit signal");
  if (row.result_type.toLowerCase() === "trigger") signals.push("trigger-only return");
  const hash = createHash("sha256").update(row.definition).digest("hex");
  const sourceLabel = source
    ? source.filename + " (" + source.sourceKind + ")"
    : row.extension_name ? "extension:" + row.extension_name : "**NO MIGRATION MATCH**";
  const surface = row.extension_name
    ? "EXTENSION FUNCTION"
    : row.kind_code === "p"
      ? "SQL PROCEDURE (not a PostgREST function RPC)"
      : row.has_user_trigger_binding || row.result_type.toLowerCase() === "trigger"
        ? "TRIGGER CALLBACK (database-internal execution surface)"
        : executeRoles.length > 0
          ? "PUBLIC FUNCTION / EXECUTE GRANTED (RPC candidate; contract still needs review)"
          : "PUBLIC FUNCTION / no target-role EXECUTE (review internal callers)";
  mappedRows.push({
    name,
    identityArgs: row.identity_args || "",
    allArgs: row.all_args || "",
    resultType: row.result_type,
    kind: row.kind_code === "p" ? "PROCEDURE" : "FUNCTION",
    surface,
    language: row.language,
    security: row.security_definer ? "DEFINER" : "INVOKER",
    config,
    owner: row.owner_name,
    acl: row.raw_acl,
    executeRoles,
    signals,
    sourceLabel,
    sourceMissing: !source && !row.extension_name,
    hasUserTriggerBinding: Boolean(row.has_user_trigger_binding),
    hash
  });
}
const mapped = mappedRows.filter((row) => !row.sourceMissing).length;
const missingSource = mappedRows.filter((row) => row.sourceMissing);
assert.equal(
  missingSource.length,
  0,
  "every runtime public function/procedure must map to a migration declaration, an ALTER FUNCTION rename, or an extension; unmatched: " +
    missingSource.map((row) => "public." + row.name + "(" + row.identityArgs + ")").join(", "),
);
const esc = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
const lines = [
  "# Public PostgreSQL RPC/function inventory — runtime snapshot",
  "",
  "**Generated from:** isolated PostgreSQL 17 database after applying the ordered Supabase migration tree.",
  "**Migration files scanned:** " + migrations.length + ". **Runtime public functions/procedures:** " + mappedRows.length + ". **Matched to migration or extension source:** " + mapped + "/" + mappedRows.length + ". **Unmatched source rows:** " + missingSource.length + ".",
  "",
  "This inventory reads the effective PostgreSQL catalog; the three EXECUTE columns reflect `has_function_privilege` in the isolated test database, including inherited and PUBLIC grants. The ACL string is shown as returned by `pg_proc.proacl`; `<default ACL>` means PostgreSQL default ACL semantics apply. This is not proof that a function body safely enforces its contract. The source markers below are heuristic signals only.",
  "",
  "**Review flags:** an exposed `SECURITY DEFINER` function must be examined against its body, role/tenant checks and search path; a `trigger-only return` is not an ordinary PostgREST RPC entrypoint. Functions with no matched migration or extension source remain explicit review items.",
  "",
  "| Signature | Result | Catalog surface classification | Runtime kind / language | Security | Effective EXECUTE | Function config / search_path | Static body signals (heuristic) | Source migration / extension | Definition SHA-256 | ACL snapshot |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  ...mappedRows.map((row) => {
    const signature = "`public." + row.name + "(" + row.identityArgs + ")`";
    return "| " + [
      signature,
      "`" + esc(row.resultType) + "`",
      row.surface,
      row.kind + " / " + row.language,
      row.security,
      row.executeRoles.length ? row.executeRoles.map((role) => "`" + role + "`").join(", ") : "none of target roles",
      "`" + esc(row.config || "(no per-function config)") + "`",
      row.signals.length ? row.signals.join(", ") : "none detected",
      row.sourceLabel,
      "`" + row.hash + "`",
      "`" + esc(row.acl) + "`"
    ].join(" | ") + " |";
  }),
  "",
  "## Unmatched source map",
  "",
  ...(missingSource.length ? missingSource.map((row) => "- `public." + row.name + "(" + row.identityArgs + ")` — no exact migration declaration or extension owner was matched; review the function source before declaring the RPC catalogue complete.") : ["None."]),
  "",
  "## Reproduction",
  "",
  "`TEST_DATABASE_URL=postgresql://... npm run api-ops:rpc-inventory` against the same isolated PostgreSQL 17 database after `npm run test-database-migrations`.",
  "The report is generated read-only. It does not configure production secrets, exercise external providers, or claim production deployment."
];
const report = lines.join("\n") + "\n";
process.stdout.write("BEGIN_PUBLIC_RPC_CONTRACT_INVENTORY\n");
process.stdout.write(report);
process.stdout.write("END_PUBLIC_RPC_CONTRACT_INVENTORY\n");
process.stdout.write("RPC_INVENTORY_SUMMARY functions=" + mappedRows.length + " matched=" + mapped + " unmatched=" + missingSource.length + " migration_files=" + migrations.length + "\n");
