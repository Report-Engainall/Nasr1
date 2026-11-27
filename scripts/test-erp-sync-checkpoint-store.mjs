import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for ERP checkpoint PostgreSQL 17 acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + stableJson(value[key])
    ).join(",") + "}";
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("ERP test scope is not serializable.");
  return encoded;
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

const db = postgres(requiredEnv("TEST_DATABASE_URL"), {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 10,
});
const organizationA = randomUUID();
const organizationB = randomUUID();
const provider = "onyx_pro";
const objectType = "products";
const baseScope = {
  organizationId: organizationA,
  provider,
  companyExternalId: "acceptance-company",
  branchExternalId: "branch-main",
  warehouseExternalId: "warehouse-1",
  currencyCode: "YER",
  objectType,
};
const scopeKey = (scope) => sha256(stableJson({
  provider: scope.provider,
  organizationId: scope.organizationId.toLowerCase(),
  companyExternalId: scope.companyExternalId,
  branchExternalId: scope.branchExternalId,
  warehouseExternalId: scope.warehouseExternalId,
  currencyCode: scope.currencyCode,
  objectType: scope.objectType,
}));
const cursorCiphertext = (value) => "v1:acceptance-" + value;
const timestamp1 = "2026-11-28T00:00:01.000000Z";
const timestamp2 = "2026-11-28T00:00:02.000000Z";
const timestamp3 = "2026-11-28T00:00:03.000000Z";

async function setRole(role) {
  await db.unsafe("reset role").catch(() => {});
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [
    role === "service_role" ? "" : randomUUID(),
  ]);
  await db.unsafe("select set_config('request.jwt.claim.role',$1,false)", [role]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(role === "service_role" ? { role } : { sub: randomUUID(), role }),
  ]);
  await db.unsafe("set role " + role);
}

async function expectSql(label, action, expectedCode) {
  let error;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, label + " must be rejected");
  assert.equal(String(error.code), expectedCode, label + " SQLSTATE");
  return error;
}

async function loadCheckpoint(scope) {
  const rows = await db.unsafe(
    "select public.load_erp_sync_checkpoint(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text) as result",
    [
      scope.organizationId, scopeKey(scope), scope.provider, scope.companyExternalId,
      scope.branchExternalId, scope.warehouseExternalId, scope.currencyCode, scope.objectType,
    ],
  );
  assert.equal(rows.length, 1);
  return asJson(rows[0].result);
}

async function persistPage(input) {
  const nextCursor = input.nextCursor ?? null;
  const nextCursorSha256 = nextCursor === null ? null : sha256(nextCursor);
  const rows = await db.unsafe(
    "select public.persist_erp_sync_page_atomically(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text," +
      "$9::bigint,$10::text,$11::integer,$12::text,$13::text,$14::jsonb,$15::text,$16::text," +
      "$17::timestamptz,$18::timestamptz,$19::boolean) as result",
    [
      input.scope.organizationId,
      scopeKey(input.scope),
      input.scope.provider,
      input.scope.companyExternalId,
      input.scope.branchExternalId,
      input.scope.warehouseExternalId,
      input.scope.currencyCode,
      input.scope.objectType,
      input.expectedVersion,
      input.pageFingerprint,
      200,
      input.externalRequestId ?? null,
      input.responseSha256,
      JSON.stringify(input.records),
      nextCursor,
      nextCursorSha256,
      input.pendingWatermark ?? null,
      input.completedWatermark ?? null,
      input.completed,
    ],
  );
  assert.equal(rows.length, 1);
  return asJson(rows[0].result);
}

function stagedRecord(name, sourceUpdatedAt, overrides = {}) {
  const fields = { item_code: "000001", name, is_active: true, ...overrides };
  return {
    external_id: "ONYX-ITEM-000001",
    source_updated_at: sourceUpdatedAt,
    idempotency_key: sha256(stableJson({ fields, sourceUpdatedAt })),
    fields,
  };
}

function page(input) {
  return {
    scope: baseScope,
    expectedVersion: input.expectedVersion,
    pageFingerprint: sha256("page:" + input.label),
    responseSha256: sha256("response:" + input.label),
    records: input.records ?? [],
    nextCursor: input.nextCursor === undefined ? cursorCiphertext(input.label) : input.nextCursor,
    pendingWatermark: input.pendingWatermark ?? null,
    completedWatermark: input.completedWatermark ?? null,
    completed: input.completed ?? false,
    externalRequestId: "local-erp-" + input.label,
  };
}

async function main() {
  await setRole("authenticated");
  await expectSql(
    "authenticated user cannot initialize ERP checkpoint",
    () => loadCheckpoint(baseScope),
    "42501",
  );
  await expectSql(
    "authenticated user cannot read ERP checkpoint tables directly",
    () => db.unsafe("select count(*) from public.erp_sync_checkpoints"),
    "42501",
  );

  await setRole("service_role");
  const initialized = await loadCheckpoint(baseScope);
  assert.equal(initialized.version, 0);
  assert.equal(initialized.cursor_ciphertext, null);
  assert.equal(initialized.completed_watermark, null);

  const invalidSensitivePage = page({
    expectedVersion: 0,
    label: "sensitive-field-rejected",
    records: [stagedRecord("Should not be stored", timestamp1, { supplier_cost: 900, gross_margin: 100 })],
    nextCursor: cursorCiphertext("must-not-advance"),
    pendingWatermark: timestamp1,
  });
  await expectSql(
    "ERP projection rejects supplier cost and gross margin before commit",
    () => persistPage(invalidSensitivePage),
    "22023",
  );
  const afterRejected = await loadCheckpoint(baseScope);
  assert.equal(afterRejected.version, 0, "rejected projection must not advance its checkpoint");

  const first = page({
    expectedVersion: 0,
    label: "initial-page",
    records: [stagedRecord("Product version one", timestamp1)],
    pendingWatermark: timestamp1,
  });
  const committed1 = await persistPage(first);
  assert.equal(committed1.checkpoint.version, 1);
  assert.equal(committed1.counts.created, 1);
  assert.equal(committed1.duplicate_page, false);
  assert.ok(committed1.checkpoint.cursor_ciphertext.includes("initial-page"));
  assert.ok(!committed1.checkpoint.cursor_ciphertext.includes("private-provider-cursor"));

  const replay = await persistPage(first);
  assert.equal(replay.duplicate_page, true, "lost-response replay must be deduplicated before checkpoint CAS");
  assert.equal(replay.checkpoint.version, 1);
  assert.deepEqual(replay.counts, { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 });

  await expectSql(
    "reusing a page fingerprint with changed response evidence is rejected",
    () => persistPage({ ...first, responseSha256: sha256("tampered-response") }),
    "23505",
  );
  const stillAtOne = await loadCheckpoint(baseScope);
  assert.equal(stillAtOne.version, 1);

  await expectSql(
    "a new page cannot commit from a stale checkpoint version",
    () => persistPage(page({
      expectedVersion: 0,
      label: "stale-writer",
      records: [],
      pendingWatermark: timestamp1,
    })),
    "40001",
  );

  const update = page({
    expectedVersion: 1,
    label: "newer-source-version",
    records: [stagedRecord("Product version two", timestamp2)],
    pendingWatermark: timestamp2,
  });
  const committed2 = await persistPage(update);
  assert.equal(committed2.checkpoint.version, 2);
  assert.equal(committed2.counts.updated, 1);

  const staleRecord = page({
    expectedVersion: 2,
    label: "stale-source-row",
    records: [stagedRecord("Older source projection", timestamp1)],
    pendingWatermark: timestamp2,
  });
  const committed3 = await persistPage(staleRecord);
  assert.equal(committed3.checkpoint.version, 3);
  assert.equal(committed3.counts.rejected, 1);

  const sameTimeConflict = page({
    expectedVersion: 3,
    label: "same-time-source-conflict",
    records: [stagedRecord("Conflicting same-time projection", timestamp2)],
    pendingWatermark: timestamp2,
  });
  const committed4 = await persistPage(sameTimeConflict);
  assert.equal(committed4.checkpoint.version, 4);
  assert.equal(committed4.counts.conflicted, 1);

  const completed = page({
    expectedVersion: 4,
    label: "complete-source-snapshot",
    records: [],
    nextCursor: null,
    pendingWatermark: null,
    completedWatermark: timestamp2,
    completed: true,
  });
  const committed5 = await persistPage(completed);
  assert.equal(committed5.checkpoint.version, 5);
  assert.equal(committed5.checkpoint.cursor_ciphertext, null);
  assert.equal(Date.parse(committed5.checkpoint.completed_watermark), Date.parse(timestamp2));

  const delta = page({
    expectedVersion: 5,
    label: "new-delta-window",
    records: [],
    pendingWatermark: timestamp3,
    completedWatermark: timestamp2,
    completed: false,
  });
  const committed6 = await persistPage(delta);
  assert.equal(committed6.checkpoint.version, 6);
  assert.ok(committed6.checkpoint.cursor_ciphertext);
  assert.equal(committed6.checkpoint.completed_watermark, timestamp2);

  const resetRows = await db.unsafe(
    "select public.reset_erp_sync_expired_cursor($1::uuid,$2::text,$3::bigint) as result",
    [organizationA, scopeKey(baseScope), 6],
  );
  const reset = asJson(resetRows[0].result);
  assert.equal(reset.version, 7);
  assert.equal(reset.cursor_ciphertext, null);
  assert.equal(reset.pending_watermark, null);
  assert.equal(Date.parse(reset.completed_watermark), Date.parse(timestamp2), "cursor reset must preserve the last completed watermark");

  const tenantScope = { ...baseScope, organizationId: organizationB };
  const tenantInit = await loadCheckpoint(tenantScope);
  assert.equal(tenantInit.version, 0, "a different tenant must have an independent checkpoint");
  const tenantWrite = await persistPage({
    scope: tenantScope,
    expectedVersion: 0,
    pageFingerprint: sha256("tenant-b-page"),
    responseSha256: sha256("tenant-b-response"),
    records: [stagedRecord("Organization B product", timestamp2)],
    nextCursor: null,
    pendingWatermark: null,
    completedWatermark: timestamp2,
    completed: true,
  });
  assert.equal(tenantWrite.counts.created, 1);
  assert.equal(tenantWrite.checkpoint.version, 1);

  await db.unsafe("reset role");
  const [records, receipts, checkpoints] = await Promise.all([
    db.unsafe(
      "select organization_id::text,scope_key,external_id,fields from public.erp_sync_staged_records " +
      "where organization_id in ($1::uuid,$2::uuid) order by organization_id",
      [organizationA, organizationB],
    ),
    db.unsafe(
      "select organization_id::text,count(*)::integer as pages from public.erp_sync_page_receipts " +
      "where organization_id in ($1::uuid,$2::uuid) group by organization_id",
      [organizationA, organizationB],
    ),
    db.unsafe(
      "select organization_id::text,version,cursor_ciphertext,completed_watermark from public.erp_sync_checkpoints " +
      "where organization_id in ($1::uuid,$2::uuid) order by organization_id",
      [organizationA, organizationB],
    ),
  ]);
  assert.equal(records.length, 2, "same provider key across tenants must remain two isolated staging records");
  assert.notEqual(records[0].organization_id, records[1].organization_id);
  assert.equal(receipts.find((row) => row.organization_id === organizationA)?.pages, 6,
    "replay, rejected input and stale CAS must not create duplicate receipts");
  assert.equal(receipts.find((row) => row.organization_id === organizationB)?.pages, 1);
  assert.equal(checkpoints.find((row) => row.organization_id === organizationA)?.version, 7);
  assert.equal(new Date(checkpoints.find((row) => row.organization_id === organizationA)?.completed_watermark).getTime(),
    new Date(timestamp2).getTime());
  assert.equal(checkpoints.find((row) => row.organization_id === organizationA)?.cursor_ciphertext, null);

  const latestA = records.find((row) => row.organization_id === organizationA);
  assert.equal(asJson(latestA.fields).name, "Product version two",
    "stale and same-time-conflicting projections must not overwrite the latest accepted record");

  // Direct SQL access is intentionally absent even for service_role; writes are RPC-only.
  await db.unsafe("set role service_role");
  await expectSql(
    "service_role cannot bypass the audited ERP staging RPC for direct table writes",
    () => db.unsafe("update public.erp_sync_staged_records set fields='{}'::jsonb"),
    "42501",
  );

  await db.unsafe("reset role");
  await db.unsafe(
    "delete from public.erp_sync_page_receipts where organization_id in ($1::uuid,$2::uuid)",
    [organizationA, organizationB],
  );
  await db.unsafe(
    "delete from public.erp_sync_staged_records where organization_id in ($1::uuid,$2::uuid)",
    [organizationA, organizationB],
  );
  await db.unsafe(
    "delete from public.erp_sync_checkpoints where organization_id in ($1::uuid,$2::uuid)",
    [organizationA, organizationB],
  );
  console.log("ERP_SYNC_CHECKPOINT_POSTGRES17_PASS: service-role RPC, RLS, tenant scope, encrypted cursor storage, immutable receipts, replay-before-CAS, stale writer denial, row idempotency, stale/conflict ordering, completed watermark preservation and isolated cleanup.");
}

try {
  await main();
} finally {
  await db.end({ timeout: 5 }).catch(() => {});
}
