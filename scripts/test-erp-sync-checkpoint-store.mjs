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

const connectionString = requiredEnv("TEST_DATABASE_URL");
const db = postgres(connectionString, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 10,
});
const concurrentDb = postgres(connectionString, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 10,
});
let organizationA;
let organizationB;
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

async function setRoleOn(client, role) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [
    role === "service_role" ? "" : randomUUID(),
  ]);
  await client.unsafe("select set_config('request.jwt.claim.role',$1,false)", [role]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(role === "service_role" ? { role } : { sub: randomUUID(), role }),
  ]);
  await client.unsafe("set role " + role);
}
async function setRole(role) {
  await setRoleOn(db, role);
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

async function loadCheckpoint(scope, client = db) {
  const rows = await client.unsafe(
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

async function previewStagedRecords(scope, client = db) {
  const rows = await client.unsafe(
    "select public.list_erp_sync_staged_records(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::integer,$10::integer) as result",
    [
      scope.organizationId, scopeKey(scope), scope.provider, scope.companyExternalId,
      scope.branchExternalId, scope.warehouseExternalId, scope.currencyCode,
      scope.objectType, 20, 0,
    ],
  );
  assert.equal(rows.length, 1);
  return asJson(rows[0].result);
}

async function persistPage(input, client = db) {
  const nextCursor = input.nextCursor ?? null;
  const rows = await client.unsafe(
    "select public.persist_erp_sync_page_atomically(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text," +
      "$9::bigint,$10::text,$11::integer,$12::text,$13::text,$14::jsonb,$15::text," +
      "$16::timestamptz,$17::timestamptz,$18::boolean) as result",
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
function financialRecord(externalId, sourceUpdatedAt, fields) {
  return {
    external_id: externalId,
    source_updated_at: sourceUpdatedAt,
    idempotency_key: sha256(stableJson({ externalId, sourceUpdatedAt, fields })),
    fields,
  };
}

async function main() {
  const organizations = await db.unsafe(
    "select id::text as id from public.organizations where is_active=true order by id limit 2",
  );
  assert.equal(organizations.length, 2, "ERP PostgreSQL 17 acceptance requires two real active tenant organizations");
  organizationA = organizations[0].id;
  organizationB = organizations[1].id;
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
  const rpcPrivileges = await db.unsafe(
    "select " +
      "has_function_privilege('anon','public.load_erp_sync_checkpoint(uuid,text,text,text,text,text,text,text)','EXECUTE') as anon_load," +
      "has_function_privilege('authenticated','public.load_erp_sync_checkpoint(uuid,text,text,text,text,text,text,text)','EXECUTE') as auth_load," +
      "has_function_privilege('service_role','public.load_erp_sync_checkpoint(uuid,text,text,text,text,text,text,text)','EXECUTE') as service_load," +
      "has_function_privilege('anon','public.persist_erp_sync_page_atomically(uuid,text,text,text,text,text,text,text,bigint,text,integer,text,text,jsonb,text,timestamptz,timestamptz,boolean)','EXECUTE') as anon_persist," +
      "has_function_privilege('authenticated','public.persist_erp_sync_page_atomically(uuid,text,text,text,text,text,text,text,bigint,text,integer,text,text,jsonb,text,timestamptz,timestamptz,boolean)','EXECUTE') as auth_persist," +
      "has_function_privilege('service_role','public.persist_erp_sync_page_atomically(uuid,text,text,text,text,text,text,text,bigint,text,integer,text,text,jsonb,text,timestamptz,timestamptz,boolean)','EXECUTE') as service_persist," +
      "has_function_privilege('anon','public.reset_erp_sync_expired_cursor(uuid,text,bigint)','EXECUTE') as anon_reset," +
      "has_function_privilege('authenticated','public.reset_erp_sync_expired_cursor(uuid,text,bigint)','EXECUTE') as auth_reset," +
      "has_function_privilege('service_role','public.reset_erp_sync_expired_cursor(uuid,text,bigint)','EXECUTE') as service_reset," +
      "has_function_privilege('anon','public.list_erp_sync_staged_records(uuid,text,text,text,text,text,text,text,integer,integer)','EXECUTE') as anon_preview," +
      "has_function_privilege('authenticated','public.list_erp_sync_staged_records(uuid,text,text,text,text,text,text,text,integer,integer)','EXECUTE') as auth_preview," +
      "has_function_privilege('service_role','public.list_erp_sync_staged_records(uuid,text,text,text,text,text,text,text,integer,integer)','EXECUTE') as service_preview," +
      "has_table_privilege('anon','public.erp_sync_page_record_outcomes','SELECT') as anon_outcomes_read," +
      "has_table_privilege('authenticated','public.erp_sync_page_record_outcomes','SELECT') as auth_outcomes_read," +
      "has_table_privilege('service_role','public.erp_sync_page_record_outcomes','SELECT') as service_outcomes_read",
  );
  assert.deepEqual(
    Object.values(rpcPrivileges[0]),
    [false,false,true,false,false,true,false,false,true,false,false,true,false,false,false],
    "ERP checkpoint RPC ACLs must grant EXECUTE only to service_role",
  );
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
  const createdPreview = await previewStagedRecords(baseScope);
  assert.equal(createdPreview.records[0].last_disposition, "created");
  assert.ok(committed1.checkpoint.cursor_ciphertext.includes("initial-page"));
  assert.ok(!committed1.checkpoint.cursor_ciphertext.includes("private-provider-cursor"));

  const replay = await persistPage({
    ...first,
    externalRequestId: "local-erp-retry-with-new-request-id",
    nextCursor: cursorCiphertext("initial-page-reencrypted-with-fresh-aes-gcm-iv"),
  });
  assert.equal(replay.duplicate_page, true, "the same page must replay despite fresh randomized cursor ciphertext");
  assert.equal(replay.checkpoint.version, 1);
  assert.deepEqual(replay.counts, { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 });

  await expectSql(
    "reusing a page fingerprint with changed pending watermark is rejected",
    () => persistPage({ ...first, pendingWatermark: timestamp2 }),
    "23505",
  );

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

  // Two independent database sessions race the exact same page after the first
  // caller may have committed while its acknowledgement was lost.
  const concurrentScope = { ...baseScope, branchExternalId: "branch-same-page-concurrency" };
  assert.equal((await loadCheckpoint(concurrentScope)).version, 0);
  await setRoleOn(concurrentDb, "service_role");
  const concurrentPage = {
    ...page({
      expectedVersion: 0,
      label: "same-page-concurrent-replay",
      records: [stagedRecord("Concurrent replay product", timestamp1, {}, "ONYX-CONCURRENT-REPLAY")],
      pendingWatermark: timestamp1,
    }),
    scope: concurrentScope,
  };
  const samePageRace = await Promise.all([
    persistPage(concurrentPage, db),
    persistPage(concurrentPage, concurrentDb),
  ]);
  assert.deepEqual(
    samePageRace.map(result => result.duplicate_page).sort(),
    [false,true],
    "concurrent duplicate page requests must commit once and replay once",
  );
  assert.ok(samePageRace.every(result => result.checkpoint.version === 1));

  // Two different pages cannot both win the same expectedVersion. The loser
  // receives 40001 and its staged record/receipt/checkpoint write is rolled back.
  const versionRaceScope = { ...baseScope, branchExternalId: "branch-version-cas-race" };
  assert.equal((await loadCheckpoint(versionRaceScope)).version, 0);
  const racePageA = {
    ...page({
      expectedVersion: 0,
      label: "version-race-a",
      records: [stagedRecord("Version race A", timestamp1, {}, "ONYX-RACE-A")],
      pendingWatermark: timestamp1,
    }),
    scope: versionRaceScope,
  };
  const racePageB = {
    ...page({
      expectedVersion: 0,
      label: "version-race-b",
      records: [stagedRecord("Version race B", timestamp1, {}, "ONYX-RACE-B")],
      pendingWatermark: timestamp1,
    }),
    scope: versionRaceScope,
  };
  const versionRace = await Promise.allSettled([
    persistPage(racePageA, db),
    persistPage(racePageB, concurrentDb),
  ]);
  assert.equal(versionRace.filter(result => result.status === "fulfilled").length, 1);
  const versionRaceFailure = versionRace.find(result => result.status === "rejected");
  assert.ok(versionRaceFailure && versionRaceFailure.status === "rejected");
  assert.equal(String(versionRaceFailure.reason?.code), "40001",
    "only one different page may advance a checkpoint version");

  // A forced receipt-ledger failure occurs after staging and checkpoint UPDATE
  // inside the RPC. The statement must roll back all of those earlier writes.
  const rollbackScope = { ...baseScope, branchExternalId: "branch-atomic-receipt-rollback" };
  assert.equal((await loadCheckpoint(rollbackScope)).version, 0);
  const rollbackFingerprint = sha256("erp-checkpoint-force-receipt-failure");
  await db.unsafe("reset role");
  await db.unsafe("drop trigger if exists erp_sync_test_fail_receipt_insert on public.erp_sync_page_receipts");
  await db.unsafe("drop function if exists public.erp_sync_test_fail_receipt_insert()");
  await db.unsafe(
    "create function public.erp_sync_test_fail_receipt_insert() returns trigger " +
    "language plpgsql as $test$ begin " +
    "if new.page_fingerprint = '" + rollbackFingerprint + "' then " +
    "raise exception using errcode='P0001', message='test-only forced receipt failure'; " +
    "end if; return new; end; $test$",
  );
  await db.unsafe(
    "create trigger erp_sync_test_fail_receipt_insert before insert on public.erp_sync_page_receipts " +
    "for each row execute function public.erp_sync_test_fail_receipt_insert()",
  );
  await setRole("service_role");
  try {
    await expectSql(
      "receipt insert failure rolls back staging rows and checkpoint advancement",
      () => persistPage({
        ...page({
          expectedVersion: 0,
          label: "forced-atomic-rollback",
          records: [stagedRecord("Must not survive rollback", timestamp1, {}, "ONYX-ROLLBACK-ITEM")],
          pendingWatermark: timestamp1,
        }),
        scope: rollbackScope,
        pageFingerprint: rollbackFingerprint,
      }),
      "P0001",
    );
    const afterForcedRollback = await loadCheckpoint(rollbackScope);
    assert.equal(afterForcedRollback.version, 0);
    await db.unsafe("reset role");
    const [rollbackRows, rollbackReceipts] = await Promise.all([
      db.unsafe(
        "select count(*)::integer as count from public.erp_sync_staged_records where organization_id=$1::uuid and scope_key=$2",
        [organizationA, scopeKey(rollbackScope)],
      ),
      db.unsafe(
        "select count(*)::integer as count from public.erp_sync_page_receipts where organization_id=$1::uuid and scope_key=$2",
        [organizationA, scopeKey(rollbackScope)],
      ),
    ]);
    assert.equal(rollbackRows[0].count, 0, "no partial staging rows survive a receipt write failure");
    assert.equal(rollbackReceipts[0].count, 0, "no source receipt survives a failed page transaction");
  } finally {
    await db.unsafe("reset role").catch(() => {});
    await db.unsafe("drop trigger if exists erp_sync_test_fail_receipt_insert on public.erp_sync_page_receipts").catch(() => {});
    await db.unsafe("drop function if exists public.erp_sync_test_fail_receipt_insert()").catch(() => {});
    await setRole("service_role");
  }


  const update = page({
    expectedVersion: 1,
    label: "newer-source-version",
    records: [stagedRecord("Product version two", timestamp2)],
    pendingWatermark: timestamp2,
  });
  const committed2 = await persistPage(update);
  assert.equal(committed2.checkpoint.version, 2);
  assert.equal(committed2.counts.updated, 1);
  const updatedPreview = await previewStagedRecords(baseScope);
  assert.equal(updatedPreview.records[0].last_disposition, "updated");

  const staleRecord = page({
    expectedVersion: 2,
    label: "stale-source-row",
    records: [stagedRecord("Older source projection", timestamp1)],
    pendingWatermark: timestamp2,
  });
  const committed3 = await persistPage(staleRecord);
  assert.equal(committed3.checkpoint.version, 3);
  assert.equal(committed3.counts.rejected, 1);
  const rejectedPreview = await previewStagedRecords(baseScope);
  assert.equal(rejectedPreview.records[0].last_disposition, "rejected");
  assert.equal(rejectedPreview.records[0].last_disposition_reason, "source_timestamp_older");
  assert.equal(rejectedPreview.records[0].fields.name, "Older source projection",
    "preview must show the exact rejected source projection rather than the older accepted snapshot");

  const sameTimeConflict = page({
    expectedVersion: 3,
    label: "same-time-source-conflict",
    records: [stagedRecord("Conflicting same-time projection", timestamp2)],
    pendingWatermark: timestamp2,
  });
  const committed4 = await persistPage(sameTimeConflict);
  assert.equal(committed4.checkpoint.version, 4);
  assert.equal(committed4.counts.conflicted, 1);
  const conflictedPreview = await previewStagedRecords(baseScope);
  assert.equal(conflictedPreview.records[0].last_disposition, "conflicted");
  assert.equal(conflictedPreview.records[0].last_disposition_reason, "same_timestamp_payload_mismatch");
  assert.equal(conflictedPreview.records[0].fields.name, "Conflicting same-time projection");

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
  assert.equal(Date.parse(committed6.checkpoint.completed_watermark), Date.parse(timestamp2));

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

  // The same organization may have independent company, branch, warehouse,
  // currency and object scopes. A repeated ERP external ID in a second warehouse
  // must never overwrite the first warehouse's staged projection.
  const isolatedScopes = [
    { ...baseScope, companyExternalId: "acceptance-company-two" },
    { ...baseScope, branchExternalId: "branch-secondary" },
    { ...baseScope, warehouseExternalId: "warehouse-2" },
    { ...baseScope, currencyCode: "USD" },
  ];
  const isolatedResults = [];
  for (let index = 0; index < isolatedScopes.length; index += 1) {
    const isolatedScope = isolatedScopes[index];
    const empty = await loadCheckpoint(isolatedScope);
    assert.equal(empty.version, 0, "different scope dimensions must start with independent checkpoints");
    const saved = await persistPage({
      ...page({
        expectedVersion: 0,
        label: "isolated-scope-" + index,
        records: [stagedRecord("Isolated projection " + index, timestamp1, {}, "ONYX-ITEM-000001")],
        pendingWatermark: timestamp1,
      }),
      scope: isolatedScope,
    });
    assert.equal(saved.counts.created, 1);
    assert.equal(saved.checkpoint.version, 1);
    isolatedResults.push({ scope: isolatedScope, scope_key: scopeKey(isolatedScope) });
  }
  assert.equal(new Set(isolatedResults.map(item => item.scope_key)).size, isolatedScopes.length,
    "company, branch, warehouse and currency each contribute to the canonical scope key");

  const objectScope = { ...baseScope, objectType: "customers" };
  const objectCheckpoint = await loadCheckpoint(objectScope);
  assert.equal(objectCheckpoint.version, 0, "object type is an independent checkpoint dimension");
  const providerScope = { ...baseScope, provider: "al_mutakamel" };
  const providerCheckpoint = await loadCheckpoint(providerScope);
  assert.equal(providerCheckpoint.version, 0, "ERP provider is an independent checkpoint dimension");

  await db.unsafe("reset role");
  const [records, receipts, checkpoints] = await Promise.all([
    db.unsafe(
      "select organization_id::text,scope_key,external_id,fields from public.erp_sync_staged_records " +
      "where organization_id in ($1::uuid,$2::uuid) order by organization_id",
      [organizationA, organizationB],
    ),
    db.unsafe(
      "select organization_id::text,scope_key,count(*)::integer as pages from public.erp_sync_page_receipts " +
      "where organization_id in ($1::uuid,$2::uuid) group by organization_id,scope_key",
      [organizationA, organizationB],
    ),
    db.unsafe(
      "select organization_id::text,scope_key,version,cursor_ciphertext,completed_watermark from public.erp_sync_checkpoints " +
      "where organization_id in ($1::uuid,$2::uuid) order by organization_id,scope_key",
      [organizationA, organizationB],
    ),
  ]);
  const baseRecord = records.find(row => row.organization_id === organizationA &&
    row.scope_key === scopeKey(baseScope) && row.external_id === "ONYX-ITEM-000001");
  const tenantRecord = records.find(row => row.organization_id === organizationB &&
    row.scope_key === scopeKey(tenantScope));
  assert.ok(baseRecord, "the main scope contains its own accepted product projection");
  assert.ok(tenantRecord, "the second tenant contains a distinct projection");
  assert.equal(asJson(baseRecord.fields).name, "Product version two",
    "stale and same-time-conflicting projections must not overwrite the latest accepted record");
  assert.notEqual(baseRecord.organization_id, tenantRecord.organization_id);
  assert.equal(records.filter(row => row.organization_id === organizationA).length, 8,
    "base, concurrent replay, version-race winner and four company/branch/warehouse/currency scopes stage exactly eight rows");

  const receiptFor = (scope) => receipts.find(row =>
    row.organization_id === scope.organizationId && row.scope_key === scopeKey(scope)
  )?.pages ?? 0;
  assert.equal(receiptFor(baseScope), 6,
    "replay, rejected input, stale writer and source conflicts must not create duplicate base receipts");
  assert.equal(receiptFor(concurrentScope), 1,
    "two concurrent identical page requests create one receipt");
  assert.equal(receiptFor(versionRaceScope), 1,
    "two different writers with the same expected version create one receipt");
  for (const isolated of isolatedScopes) {
    assert.equal(receiptFor(isolated), 1, "each ERP scope dimension persists its own receipt");
  }
  assert.equal(receiptFor(tenantScope), 1);

  const checkpointFor = (scope) => checkpoints.find(row =>
    row.organization_id === scope.organizationId && row.scope_key === scopeKey(scope)
  );
  assert.equal(Number(checkpointFor(baseScope)?.version), 7);
  assert.equal(new Date(checkpointFor(baseScope)?.completed_watermark).getTime(), new Date(timestamp2).getTime());
  assert.equal(checkpointFor(baseScope)?.cursor_ciphertext, null);
  assert.equal(Number(checkpointFor(concurrentScope)?.version), 1);
  assert.equal(Number(checkpointFor(versionRaceScope)?.version), 1);
  for (const isolated of isolatedScopes) {
    assert.equal(Number(checkpointFor(isolated)?.version), 1);
  }
  assert.equal(Number(checkpointFor(tenantScope)?.version), 1);
  assert.equal(Number(checkpointFor(objectScope)?.version), 0);
  assert.equal(Number(checkpointFor(providerScope)?.version), 0);

  await setRole("service_role");
  // Financial ERP projections are staged in their own object scopes. Amounts are
  // decimal strings, currencies stay attached to each row, and no app ledger is posted.
  const financeOrganization = organizationA;
  const invoiceScope = { ...baseScope, organizationId: financeOrganization, objectType: "customer_financial_documents" };
  assert.equal((await loadCheckpoint(invoiceScope)).version, 0);
  const invoice = financialRecord("ONYX-INVOICE-1001", timestamp3, {
    external_customer_id: "ONYX-CUSTOMER-001",
    document_number: "INV-1001",
    document_type: "invoice",
    document_status: "posted",
    issue_date: "2026-11-27",
    due_date: "2026-12-10",
    currency_code: "YER",
    total_amount: "1250.7500",
    paid_amount: "250.7500",
    outstanding_amount: "1000.0000",
  });
  const invoiceSaved = await persistPage({
    ...page({
      expectedVersion: 0,
      label: "finance-invoice-valid",
      records: [invoice],
      nextCursor: null,
      pendingWatermark: null,
      completedWatermark: timestamp3,
      completed: true,
    }),
    scope: invoiceScope,
  });
  assert.equal(invoiceSaved.counts.created, 1);
  assert.equal(invoiceSaved.checkpoint.version, 1);

  const badInvoice = financialRecord("ONYX-INVOICE-BAD-AMOUNT", timestamp3, {
    ...invoice.fields,
    document_number: "INV-BAD-AMOUNT",
    total_amount: 1250.75,
  });
  await expectSql(
    "financial invoice amount rejects JSON numbers and requires exact decimal strings",
    () => persistPage({
      ...page({
        expectedVersion: 1,
        label: "finance-invoice-invalid-number",
        records: [badInvoice],
        nextCursor: null,
        pendingWatermark: null,
        completedWatermark: timestamp3,
        completed: true,
      }),
      scope: invoiceScope,
    }),
    "22023",
  );
  await expectSql(
    "financial invoice rejects null document status",
    () => persistPage({
      ...page({
        expectedVersion: 1,
        label: "finance-invoice-null-status",
        records: [financialRecord("ONYX-INVOICE-NULL-STATUS", timestamp3, {
          ...invoice.fields,
          document_number: "INV-NULL-STATUS",
          document_status: null,
        })],
        nextCursor: null,
        pendingWatermark: null,
        completedWatermark: timestamp3,
        completed: true,
      }),
      scope: invoiceScope,
    }),
    "22023",
  );
  await expectSql(
    "financial invoice rejects impossible calendar dates",
    () => persistPage({
      ...page({
        expectedVersion: 1,
        label: "finance-invoice-invalid-date",
        records: [financialRecord("ONYX-INVOICE-INVALID-DATE", timestamp3, {
          ...invoice.fields,
          document_number: "INV-INVALID-DATE",
          issue_date: "2026-02-31",
        })],
        nextCursor: null,
        pendingWatermark: null,
        completedWatermark: timestamp3,
        completed: true,
      }),
      scope: invoiceScope,
    }),
    "22023",
  );
  assert.equal((await loadCheckpoint(invoiceScope)).version, 1,
    "invalid amount, status and date metadata must not advance the invoice checkpoint");

  const receiptScope = { ...baseScope, organizationId: financeOrganization, objectType: "customer_payment_receipts" };
  const receipt = financialRecord("ONYX-RECEIPT-1001", timestamp3, {
    external_customer_id: "ONYX-CUSTOMER-001",
    receipt_number: "RCPT-1001",
    receipt_date: "2026-11-28",
    currency_code: "YER",
    amount: "250.7500",
    payment_status: "confirmed",
    payment_method: "bank_transfer",
    applied_document_number: "INV-1001",
  });
  const receiptSaved = await persistPage({
    ...page({
      expectedVersion: 0,
      label: "finance-receipt-valid",
      records: [receipt],
      nextCursor: null,
      pendingWatermark: null,
      completedWatermark: timestamp3,
      completed: true,
    }),
    scope: receiptScope,
  });
  assert.equal(receiptSaved.counts.created, 1);

  const statementScope = { ...baseScope, organizationId: financeOrganization, objectType: "customer_statement_entries" };
  const statementEntry = financialRecord("ONYX-ENTRY-1001", timestamp3, {
    external_customer_id: "ONYX-CUSTOMER-001",
    entry_reference: "ENTRY-1001",
    entry_date: "2026-11-28",
    currency_code: "YER",
    entry_type: "invoice",
    debit_amount: "1250.7500",
    credit_amount: "0.0000",
    source_document_number: "INV-1001",
  });
  const statementSaved = await persistPage({
    ...page({
      expectedVersion: 0,
      label: "finance-statement-valid",
      records: [statementEntry],
      nextCursor: null,
      pendingWatermark: null,
      completedWatermark: timestamp3,
      completed: true,
    }),
    scope: statementScope,
  });
  assert.equal(statementSaved.counts.created, 1);
  await expectSql(
    "financial statement entry rejects an impossible calendar date",
    () => persistPage({
      ...page({
        expectedVersion: 1,
        label: "finance-statement-invalid-date",
        records: [financialRecord("ONYX-ENTRY-INVALID-DATE", timestamp3, {
          ...statementEntry.fields,
          entry_reference: "ENTRY-INVALID-DATE",
          entry_date: "2026-13-40",
        })],
        nextCursor: null,
        pendingWatermark: null,
        completedWatermark: timestamp3,
        completed: true,
      }),
      scope: statementScope,
    }),
    "22023",
  );

  const dualSidedEntry = financialRecord("ONYX-ENTRY-DUAL-SIDED", timestamp3, {
    ...statementEntry.fields,
    entry_reference: "ENTRY-DUAL-SIDED",
    debit_amount: "10.00",
    credit_amount: "10.00",
  });
  await expectSql(
    "financial statement entry rejects simultaneous debit and credit amounts",
    () => persistPage({
      ...page({
        expectedVersion: 1,
        label: "finance-statement-dual-sided",
        records: [dualSidedEntry],
        nextCursor: null,
        pendingWatermark: null,
        completedWatermark: timestamp3,
        completed: true,
      }),
      scope: statementScope,
    }),
    "22023",
  );
  assert.equal((await loadCheckpoint(statementScope)).version, 1,
    "invalid dual-sided statement entry must not advance its checkpoint");

  const unchangedPage = page({
    expectedVersion: 7,
    label: "same-time-unchanged",
    records: [stagedRecord("Product version two", timestamp2)],
    nextCursor: cursorCiphertext("same-time-unchanged"),
    pendingWatermark: timestamp3,
    completedWatermark: timestamp2,
    completed: false,
  });
  const unchangedSaved = await persistPage(unchangedPage);
  assert.equal(unchangedSaved.checkpoint.version, 8);
  assert.equal(unchangedSaved.counts.unchanged, 1);

  const unchangedPreview = await previewStagedRecords(baseScope);
  assert.equal(unchangedPreview.records[0].last_disposition, "unchanged");
  assert.equal(unchangedPreview.records[0].fields.name, "Product version two",
    "after the same-time unchanged replay the accepted projection remains unchanged");

  const invoicePreviewRows = await db.unsafe(
    "select public.list_erp_sync_staged_records(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::integer,$10::integer) as result",
    [
      invoiceScope.organizationId,
      scopeKey(invoiceScope),
      invoiceScope.provider,
      invoiceScope.companyExternalId,
      invoiceScope.branchExternalId,
      invoiceScope.warehouseExternalId,
      invoiceScope.currencyCode,
      invoiceScope.objectType,
      20,
      0,
    ],
  );
  const invoicePreview = asJson(invoicePreviewRows[0].result);
  assert.equal(invoicePreview.total, 1);
  assert.equal(invoicePreview.records.length, 1);
  assert.equal(invoicePreview.records[0].external_id, "ONYX-INVOICE-1001");
  assert.equal(invoicePreview.records[0].last_disposition, "created");
  assert.equal(invoicePreview.records[0].last_disposition_reason, null);
  assert.equal(asJson(invoicePreview.records[0].fields).total_amount, "1250.7500");
  assert.equal(asJson(invoicePreview.records[0].fields).currency_code, "YER");
  assert.equal(Object.prototype.hasOwnProperty.call(invoicePreview.records[0], "idempotency_key"), false,
    "preview must not expose internal idempotency keys");

  await expectSql(
    "ERP staged preview cannot be rebound to another company metadata",
    () => db.unsafe(
      "select public.list_erp_sync_staged_records(" +
        "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::integer,$10::integer)",
      [
        invoiceScope.organizationId, scopeKey(invoiceScope), invoiceScope.provider,
        "another-company", invoiceScope.branchExternalId, invoiceScope.warehouseExternalId,
        invoiceScope.currencyCode, invoiceScope.objectType, 20, 0,
      ],
    ),
    "23505",
  );

  await setRole("authenticated");
  await expectSql(
    "authenticated users cannot invoke the service-role ERP staged preview RPC",
    () => db.unsafe(
      "select public.list_erp_sync_staged_records(" +
        "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::integer,$10::integer)",
      [
        invoiceScope.organizationId, scopeKey(invoiceScope), invoiceScope.provider,
        invoiceScope.companyExternalId, invoiceScope.branchExternalId,
        invoiceScope.warehouseExternalId, invoiceScope.currencyCode,
        invoiceScope.objectType, 20, 0,
      ],
    ),
    "42501",
  );
  await setRole("service_role");

  await db.unsafe("reset role");

  // Direct SQL access is intentionally absent even for service_role; writes are RPC-only.
  await db.unsafe("set role service_role");
  await expectSql(
    "service_role cannot bypass the audited ERP staging RPC for direct table writes",
    () => db.unsafe("update public.erp_sync_staged_records set fields='{}'::jsonb"),
    "42501",
  );

  await db.unsafe("reset role");
  await db.unsafe(
    "delete from public.erp_sync_page_record_outcomes where organization_id in ($1::uuid,$2::uuid)",
    [organizationA, organizationB],
  );
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
  console.log("ERP_SYNC_CHECKPOINT_POSTGRES17_PASS: service-role-only RPC ACLs, RLS, tenant/company/branch/warehouse/currency/object/provider isolation, encrypted cursor storage, immutable receipts, concurrent duplicate replay, competing-version CAS, injected post-staging receipt failure with full rollback, row idempotency, stale/conflict ordering, completed watermark preservation, all five per-record dispositions, invoice/receipt/statement staging, exact decimal-string validation and financial debit-credit exclusivity.");
}

try {
  await main();
} finally {
  await Promise.all([
    db.end({ timeout: 5 }).catch(() => {}),
    concurrentDb.end({ timeout: 5 }).catch(() => {}),
  ]);
}
