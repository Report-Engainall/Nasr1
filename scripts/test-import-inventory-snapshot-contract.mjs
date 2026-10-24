import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required for inventory snapshot contract acceptance.");

const db = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });
const uuid = () => randomUUID();
const suffix = uuid().replaceAll("-", "").slice(0, 10);
const organizationId = uuid();
const managerProfileId = uuid();
const managerAuthId = uuid();
const warehouseId = uuid();
const productChangedId = uuid();
const productMatchedId = uuid();
const itemChanged = "CI-STOCK-A-" + suffix;
const itemMatched = "CI-STOCK-B-" + suffix;
const warehouseCode = "CI-WH-" + suffix;
const warehouseName = "CI inventory snapshot " + suffix;
const managerEmail = "ci-import-stock-" + suffix + "@example.test";
const fileHash = "a".repeat(64);
const chunkHash = "c".repeat(64);

async function setIdentity(authUserId = managerAuthId, email = managerEmail) {
  const priorRole = (await db.unsafe("select current_setting('role', true) as role"))[0]?.role;
  await db.unsafe("reset role");
  await db.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [authUserId, authUserId]);
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated", session_id: authUserId }),
  ]);
  if (["authenticated", "anon", "service_role"].includes(priorRole)) {
    await db.unsafe("set role " + priorRole);
  }
}

function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function idempotencyKey() {
  return uuid().replaceAll("-", "");
}

async function expectFailure(label, action, pattern) {
  await db.unsafe("SAVEPOINT inventory_reconciliation_expected_failure");
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  if (!caught) {
    await db.unsafe("RELEASE SAVEPOINT inventory_reconciliation_expected_failure");
    assert.fail(label + " should fail");
  }
  await db.unsafe("ROLLBACK TO SAVEPOINT inventory_reconciliation_expected_failure");
  await db.unsafe("RELEASE SAVEPOINT inventory_reconciliation_expected_failure");
  assert.ok(!pattern || pattern.test(String(caught.message)), label + " returned the wrong error: " + caught.message);
}

async function previewInventory(snapshotId, idem, reason = "P1 finalized-import reconciliation acceptance") {
  const rows = await db.unsafe(
    "select public.preview_onyx_inventory_reconciliation($1::uuid,$2::uuid,$3::text,$4::text) as result",
    [snapshotId, warehouseId, idem, reason],
  );
  return asJson(rows[0].result);
}

async function applyInventory(commandId, idem) {
  const rows = await db.unsafe(
    "select public.apply_onyx_inventory_reconciliation($1::uuid,$2::text) as result",
    [commandId, idem],
  );
  return asJson(rows[0].result);
}

async function persistProcessingFingerprint(jobId) {
  const rows = await db.unsafe(
    `update public.import_jobs
        set error_summary=coalesce(error_summary,'{}'::jsonb) || jsonb_build_object(
          'processing_config_fingerprint', repeat('a',64),
          'source_file_hash', file_hash,
          'period_key', period_key,
          'source_system', source_system,
          'external_source_reference', external_source_reference,
          'is_full_dataset', false,
          'no_raw_file_retained', true
        )
      where id=$1::uuid
      returning id`,
    [jobId],
  );
  assert.equal(rows.length, 1, "the authenticated tenant must persist its import processing fingerprint");
}

async function rollbackInventory(commandId, idem, reason = "P1 compensating rollback acceptance") {
  const rows = await db.unsafe(
    "select public.rollback_onyx_inventory_reconciliation($1::uuid,$2::text,$3::text) as result",
    [commandId, idem, reason],
  );
  return asJson(rows[0].result);
}

function quantityFor(snapshot, productId) {
  return snapshot.balances.find((row) => row.product_id === productId);
}

function movementsFor(snapshot, productId) {
  return snapshot.movements.find((row) => row.product_id === productId)?.count ?? 0;
}

async function readAsOwner(query, params = []) {
  const current = await db.unsafe("select current_user::text as role");
  const restoreAuthenticated = current[0]?.role === "authenticated";
  if (restoreAuthenticated) await db.unsafe("reset role");
  try {
    return await db.unsafe(query, params);
  } finally {
    if (restoreAuthenticated) await db.unsafe("set role authenticated");
  }
}

async function snapshotStock() {
  const balances = await readAsOwner(
    "select product_id::text,quantity_on_hand::text,quantity_reserved::text,updated_at::text " +
      "from public.inventory_balances where product_id=any($1::uuid[]) and warehouse_id=$2::uuid order by product_id",
    [[productChangedId, productMatchedId], warehouseId],
  );
  const movements = await readAsOwner(
    "select product_id::text,count(*)::integer as count from public.inventory_movements " +
      "where product_id=any($1::uuid[]) and warehouse_id=$2::uuid group by product_id order by product_id",
    [[productChangedId, productMatchedId], warehouseId],
  );
  return { balances, movements };
}

async function main() {
  await db.unsafe("begin");
  const expectedQueryIndexes = [
    "import_job_rows_job_item_code_idx",
    "orders_customer_history_idx",
    "orders_staff_queue_idx",
  ];
  const queryIndexes = await db.unsafe(
    "select indexname,indexdef from pg_indexes where schemaname='public' and indexname=any($1::text[]) order by indexname",
    [expectedQueryIndexes],
  );
  assert.deepEqual(queryIndexes.map((row) => row.indexname), expectedQueryIndexes,
    "target-native import and order history/queue query indexes must be installed");
  const importRowsIndex = queryIndexes.find((row) => row.indexname === "import_job_rows_job_item_code_idx");
  assert.match(importRowsIndex.indexdef, /import_job_id/i);
  assert.match(importRowsIndex.indexdef, /data.*item_code/i);
  const customerHistoryIndex = queryIndexes.find((row) => row.indexname === "orders_customer_history_idx");
  assert.match(customerHistoryIndex.indexdef, /organization_id.*customer_id.*created_at.*id/i);
  const staffQueueIndex = queryIndexes.find((row) => row.indexname === "orders_staff_queue_idx");
  assert.match(staffQueueIndex.indexdef, /organization_id.*status.*created_at.*id/i);
  try {
    await db.unsafe(
      "insert into public.organizations(id,name,currency,is_active) values($1,$2,'YER',true)",
      [organizationId, "CI import inventory " + suffix],
    );
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
        "values($1,$2,$3,'CI Import Inventory Manager',$4,true)",
      [managerProfileId, managerAuthId, organizationId, managerEmail],
    );
    await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'manager')", [managerProfileId]);
    const staffProfileId = uuid();
    const staffAuthId = uuid();
    const staffEmail = "ci-import-stock-staff-" + suffix + "@example.test";
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
        "values($1,$2,$3,'CI Import Inventory Staff',$4,true)",
      [staffProfileId, staffAuthId, organizationId, staffEmail],
    );
    await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'staff')", [staffProfileId]);
    await db.unsafe(
      "insert into public.warehouses(id,organization_id,name,code,is_active) values($1,$2,$3,$4,true)",
      [warehouseId, organizationId, warehouseName, warehouseCode],
    );
    await db.unsafe(
      "insert into public.products(id,organization_id,name,item_code,unit,base_price,cost_price,min_stock,status) " +
        "values($1,$2,'CI Stock Change',$3,'piece',1,0,0,'active')," +
        "($4,$2,'CI Stock Match',$5,'piece',1,0,0,'active')",
      [productChangedId, organizationId, itemChanged, productMatchedId, itemMatched],
    );
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
        "values($1,$2,10,2,0),($3,$2,4,0,0)",
      [productChangedId, warehouseId, productMatchedId],
    );

    const profileResult = await db.unsafe(
      "insert into public.import_profiles(" +
        "organization_id,profile_name,report_type,source,version,required_columns,optional_columns," +
        "matching_key,merge_strategy,is_full_dataset,status,created_by,published_at" +
      ") values($1,$2,'inventory_stock','ci',1," +
        "'[\"item_code\",\"quantity\"]'::jsonb," +
        "'[\"product_name\",\"warehouse_id\",\"warehouse_code\",\"warehouse_name\",\"date\",\"revenue\"]'::jsonb," +
        "'item_code','manual_review',false,'active',$3,now()) returning id",
      [organizationId, "CI Inventory Stock " + suffix, managerProfileId],
    );
    const profileId = profileResult[0].id;

    await setIdentity();
    await db.unsafe("set role authenticated");

    await expectFailure(
      "legacy import creation RPC is not directly callable after idempotency hardening",
      () => db.unsafe(
        "select public.create_import_job($1,$2,$3,$4,$5::uuid,$6,$7)",
        ["CI direct import create denial " + suffix + ".csv", fileHash, 2048, "inventory_stock", profileId, "2026-10", "manual"],
      ),
      /permission denied for function create_import_job/i,
    );
    const created = await db.unsafe(
      "select public.create_import_job_idempotent($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::uuid,$8::text,$9::text,$10::text) as result",
      [uuid(), "CI inventory snapshot " + suffix + ".csv", fileHash, 2048, "inventory_stock", null, profileId, "2026-10", "manual", "new_version"],
    );
    const job = created[0].result;
    assert.equal(job.organization_id, organizationId, "import job must be bound to the authenticated organization");
    assert.equal(job.profile_id, profileId, "the explicit inventory profile must be retained by the import job");
    assert.equal(job.raw_file_retained, false, "the raw source file must not be retained");

    const sourceRows = [
      {
        item_code: itemChanged,
        product_name: "CI Stock Change",
        quantity: "15",
        warehouse_id: warehouseId,
        warehouse_code: warehouseCode,
        warehouse_name: warehouseName,
        date: "2026-10-01",
        revenue: "150",
      },
      {
        item_code: itemMatched,
        product_name: "CI Stock Match",
        quantity: "4",
        warehouse_id: warehouseId,
        warehouse_code: warehouseCode,
        warehouse_name: warehouseName,
        date: "2026-10-02",
        revenue: "40",
      },
    ];
    await db.unsafe(
      "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) " +
        "values($1,1,'valid',$2::jsonb,'[]'::jsonb),($1,2,'valid',$3::jsonb,'[]'::jsonb)",
      [job.id, db.json(sourceRows[0]), db.json(sourceRows[1])],
    );

    const upload = await db.unsafe("select public.create_import_upload_session($1::uuid) as result", [job.id]);
    const session = upload[0].result;
    assert.equal(session.total_chunks, 1, "the fixture file must be represented by exactly one upload chunk");
    const recorded = await db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
      [session.id, 0, 0, 2048, chunkHash],
    );
    assert.equal(recorded[0].result.complete, true, "only a complete contiguous upload manifest may be finalized");
    await persistProcessingFingerprint(job.id);

    const beforeFinalize = await snapshotStock();
    const finalizedRows = await db.unsafe(
      "select public.finalize_import_job($1::uuid,$2) as result",
      [job.id, "new_version"],
    );
    const finalized = finalizedRows[0].result;
    assert.equal(finalized.status, "completed", "valid inventory rows should finalize successfully");
    assert.ok(Number(finalized.data_quality_score) >= 75, "accepted stock imports must meet the server quality threshold");
    assert.ok(finalized.snapshot_id, "an accepted import must create an immutable Onyx snapshot");

    const snapshots = await readAsOwner(
      "select organization_id::text,report_type,status,row_count,source_file_hash " +
        "from public.onyx_snapshots where id=$1::uuid",
      [finalized.snapshot_id],
    );
    assert.equal(snapshots.length, 1, "finalization must create one snapshot");
    assert.equal(snapshots[0].organization_id, organizationId, "snapshot must preserve tenant identity");
    assert.equal(snapshots[0].report_type, "inventory_stock", "snapshot must retain the inventory profile's report type");
    assert.equal(snapshots[0].status, "ready", "snapshot must become ready only after all rows are persisted");
    assert.equal(Number(snapshots[0].row_count), sourceRows.length, "snapshot manifest row count must match staged rows");
    assert.equal(snapshots[0].source_file_hash, fileHash, "snapshot must preserve the source file hash");

    const persistedRows = await readAsOwner(
      "select row_number,canonical_key,row_hash,status,data,md5(data::text) as computed_row_hash from public.onyx_snapshot_rows " +
        "where snapshot_id=$1::uuid and organization_id=$2::uuid order by row_number",
      [finalized.snapshot_id, organizationId],
    );
    assert.equal(persistedRows.length, 2, "all accepted import rows must be present in the snapshot");
    for (let index = 0; index < sourceRows.length; index += 1) {
      const persisted = persistedRows[index];
      const expected = sourceRows[index];
      assert.equal(persisted.status, "valid", "snapshot must preserve the source validation status");
      assert.equal(persisted.canonical_key, expected.item_code, "snapshot key must use the profile's canonical item_code");
      assert.equal(persisted.data.item_code, expected.item_code, "snapshot must preserve the canonical product code");
      assert.equal(persisted.data.quantity, expected.quantity, "snapshot must preserve the source quantity string");
      assert.equal(persisted.data.warehouse_id, expected.warehouse_id, "snapshot must preserve warehouse ID scope");
      assert.equal(persisted.data.warehouse_code, expected.warehouse_code, "snapshot must preserve warehouse code scope");
      assert.equal(persisted.data.warehouse_name, expected.warehouse_name, "snapshot must preserve warehouse name scope");
      assert.match(persisted.row_hash, /^[0-9a-f]{32}$/, "snapshot row hash must be persisted");
      assert.equal(
        persisted.row_hash,
        persisted.computed_row_hash,
        "snapshot row hash must match the canonical Onyx apply-time check md5(data::text)",
      );
    }

    const afterFinalize = await snapshotStock();
    assert.deepEqual(afterFinalize, beforeFinalize, "generic import finalization must not mutate stock balances or movement ledger");

    // DQS-001: prove edge-case quality scores from persisted staging rows, the finalize response,
    // import_jobs.data_quality_score/quality_breakdown and the ready snapshot all agree.
    await db.unsafe("reset role");
    const unconstrainedProfileRows = await db.unsafe(
      "insert into public.import_profiles(" +
        "organization_id,profile_name,report_type,source,version,required_columns,optional_columns," +
        "matching_key,merge_strategy,is_full_dataset,status,created_by,published_at" +
      ") values($1,$2,'inventory_stock','ci',1,'[]'::jsonb,'[]'::jsonb," +
        "'item_code','manual_review',false,'active',$3,now()) returning id",
      [organizationId, "CI DQS Unconstrained " + suffix, managerProfileId],
    );
    const unconstrainedProfileId = unconstrainedProfileRows[0].id;
    await db.unsafe("set role authenticated");
    await setIdentity();

    async function assertPersistedQualityCase(input) {
      const createdRows = await db.unsafe(
        "select public.create_import_job_idempotent($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::uuid,$8::text,$9::text,$10::text) as result",
        [uuid(), input.fileName, input.fileHash, 2048, "inventory_stock", null, input.profileId, "2026-10", "manual", "new_version"],
      );
      const job = asJson(createdRows[0].result);
      await db.unsafe(
        "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) " +
          "values($1,1,'valid',$2::jsonb,'[]'::jsonb)",
        [job.id, db.json(input.data)],
      );
      const sessionRows = await db.unsafe("select public.create_import_upload_session($1::uuid) as result", [job.id]);
      const session = asJson(sessionRows[0].result);
      assert.equal(session.total_chunks, 1, "a DQS fixture must have one complete upload chunk");
      await db.unsafe(
        "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
        [session.id, 0, 0, 2048, input.chunkHash],
      );
      await persistProcessingFingerprint(job.id);

      const measuredRows = await db.unsafe(
        "select public.calculate_import_job_quality($1::uuid) as result",
        [job.id],
      );
      const measured = asJson(measuredRows[0].result);
      assert.equal(Number(measured.score), input.expectedScore, input.label + ": server score");
      for (const [component, expected] of Object.entries(input.expectedComponents)) {
        assert.equal(Number(measured.components[component]), expected, input.label + ": " + component);
      }

      const finalizedRows = await db.unsafe(
        "select public.finalize_import_job($1::uuid,$2) as result",
        [job.id, "new_version"],
      );
      const finalized = asJson(finalizedRows[0].result);
      assert.equal(finalized.status, "completed", input.label + ": accepted status");
      assert.equal(Number(finalized.data_quality_score), input.expectedScore, input.label + ": finalize score");
      assert.deepEqual(finalized.quality.components, measured.components, input.label + ": finalize breakdown must match pre-finalization score");

      const persistedRows = await readAsOwner(
        "select j.status,j.data_quality_score::integer as score,j.quality_breakdown," +
          "s.status as snapshot_status,s.data_quality_score::integer as snapshot_score,s.quality_breakdown as snapshot_breakdown " +
          "from public.import_jobs j left join public.onyx_snapshots s on s.source_import_job_id=j.id " +
          "where j.id=$1::uuid",
        [job.id],
      );
      assert.equal(persistedRows.length, 1, input.label + ": persisted job row");
      assert.equal(persistedRows[0].status, "completed", input.label + ": persisted job status");
      assert.equal(Number(persistedRows[0].score), input.expectedScore, input.label + ": persisted job score");
      assert.deepEqual(asJson(persistedRows[0].quality_breakdown), measured.components, input.label + ": persisted job breakdown");
      assert.equal(persistedRows[0].snapshot_status, "ready", input.label + ": snapshot ready status");
      assert.equal(Number(persistedRows[0].snapshot_score), input.expectedScore, input.label + ": snapshot score");
      assert.deepEqual(asJson(persistedRows[0].snapshot_breakdown), measured.components, input.label + ": snapshot breakdown");
    }

    await assertPersistedQualityCase({
      label: "empty required columns with missing key/date, numeric/null scalars, and an unscored cost field",
      profileId: unconstrainedProfileId,
      fileName: "CI DQS unconstrained " + suffix + ".csv",
      fileHash: "e".repeat(64),
      chunkHash: "f".repeat(64),
      data: { quantity: 2, revenue: null, price: 4, cost: "not-a-scored-number" },
      expectedScore: 80,
      expectedComponents: {
        completeness: 100, validity: 100, uniqueness: 0, consistency: 100, temporal_referential_integrity: 100,
      },
    });
    await assertPersistedQualityCase({
      label: "space-separated date, numeric/null scalars and unscored cost field",
      profileId,
      fileName: "CI DQS date-format " + suffix + ".csv",
      fileHash: "1".repeat(64),
      chunkHash: "2".repeat(64),
      data: { item_code: itemChanged, quantity: 2, revenue: null, price: 4, cost: "not-a-scored-number", date: "12 31 2025" },
      expectedScore: 80,
      expectedComponents: {
        completeness: 100, validity: 100, uniqueness: 100, consistency: 100, temporal_referential_integrity: 0,
      },
    });

    process.stdout.write(
      "PASS persisted DQS parity: PostgreSQL score/components match finalize response, import-job persistence and ready Onyx snapshot for both edge cases.\\n",
    );



    const comparisonRows = await db.unsafe(
      "select public.run_inventory_reconciliation($1::uuid) as result",
      [finalized.snapshot_id],
    );
    const comparison = comparisonRows[0].result;
    assert.equal(comparison.snapshot_id, finalized.snapshot_id, "read-only comparison must reference the exact finalized snapshot");
    assert.equal(comparison.source_row_count, 2);
    assert.equal(comparison.changed_count, 1, "the 15-unit source row must compare as changed against 10 live units");
    assert.equal(comparison.matched_count, 1, "the 4-unit source row must compare as matched against 4 live units");
    assert.equal(comparison.new_count, 0);
    assert.equal(comparison.invalid_count, 0);

    const afterComparison = await snapshotStock();
    assert.deepEqual(afterComparison, beforeFinalize, "read-only reconciliation must not mutate stock balances or movement ledger");

    // Exercise the actual importer-finalized snapshot through the guarded server RPC contract.
    const previewKey = idempotencyKey();
    const reason = "Actual finalized import snapshot acceptance";
    const previewed = await previewInventory(finalized.snapshot_id, previewKey, reason);
    assert.equal(previewed.status, "previewed");
    assert.equal(previewed.source_row_count, 2);
    assert.equal(previewed.adjusted_lines, 0);
    assert.deepEqual(await snapshotStock(), beforeFinalize, "saved preview must not mutate stock");
    const previewReplay = await previewInventory(finalized.snapshot_id, previewKey, reason);
    assert.equal(previewReplay.command_id, previewed.command_id);
    assert.equal(previewReplay.idempotent_replay, true, "preview replay returns the same command");

    await setIdentity(staffAuthId, staffEmail);
    await expectFailure(
      "ordinary staff cannot preview stock-changing reconciliation",
      () => previewInventory(finalized.snapshot_id, idempotencyKey(), "staff denied"),
      /administrator or manager permission required/i,
    );
    await setIdentity();
    await expectFailure(
      "foreign or unavailable snapshot is denied without disclosing tenant data",
      () => previewInventory(uuid(), idempotencyKey(), "foreign snapshot denial"),
      /ready Onyx snapshot is unavailable in the current organization/i,
    );
    await expectFailure(
      "authenticated callers cannot bypass the server-owned reconciliation command",
      () => db.unsafe("insert into public.onyx_inventory_reconciliation_commands default values"),
      /permission denied|insufficient privilege/i,
    );

    const applyKey = idempotencyKey();
    const applied = await applyInventory(previewed.command_id, applyKey);
    assert.equal(applied.status, "applied");
    assert.equal(applied.source_row_count, 2);
    assert.equal(applied.adjusted_lines, 1, "only the changed stock row should create a movement");
    const afterApply = await snapshotStock();
    assert.equal(quantityFor(afterApply, productChangedId).quantity_on_hand, "15.000");
    assert.equal(quantityFor(afterApply, productChangedId).quantity_reserved, "2.000", "apply must preserve reserved quantity");
    assert.equal(quantityFor(afterApply, productMatchedId).quantity_on_hand, "4.000");
    assert.equal(movementsFor(afterApply, productChangedId), 1);
    assert.equal(movementsFor(afterApply, productMatchedId), 0);
    const applyReplay = await applyInventory(previewed.command_id, applyKey);
    assert.equal(applyReplay.idempotent_replay, true, "apply replay must not duplicate stock movements");
    assert.equal(movementsFor(await snapshotStock(), productChangedId), 1);

    const rollbackKey = idempotencyKey();
    const rolledBack = await rollbackInventory(previewed.command_id, rollbackKey);
    assert.equal(rolledBack.status, "rolled_back");
    const afterRollback = await snapshotStock();
    assert.equal(quantityFor(afterRollback, productChangedId).quantity_on_hand, "10.000");
    assert.equal(quantityFor(afterRollback, productChangedId).quantity_reserved, "2.000");
    assert.equal(quantityFor(afterRollback, productMatchedId).quantity_on_hand, "4.000");
    assert.equal(movementsFor(afterRollback, productChangedId), 2, "rollback must append a compensating movement");
    assert.equal(movementsFor(afterRollback, productMatchedId), 0);
    const rollbackReplay = await rollbackInventory(previewed.command_id, rollbackKey);
    assert.equal(rollbackReplay.idempotent_replay, true, "rollback replay must not append another movement");

    // Force a stale second line and assert that no first-line write survives the apply.
    const stalePreview = await previewInventory(finalized.snapshot_id, idempotencyKey(), "stale baseline atomicity");
    const sortedProducts = [productChangedId, productMatchedId].sort();
    const firstProductId = sortedProducts[0];
    const laterProductId = sortedProducts[1];
    const firstBeforeStale = quantityFor(await snapshotStock(), firstProductId).quantity_on_hand;
    await db.unsafe("reset role");
    const laterBalance = await db.unsafe(
      "select quantity_on_hand::numeric as quantity from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
      [laterProductId, warehouseId],
    );
    const laterNextQuantity = Number(laterBalance[0].quantity) + 1;
    await db.unsafe(
      "update public.inventory_balances set quantity_on_hand=$3::numeric,last_movement_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp() where product_id=$1::uuid and warehouse_id=$2::uuid",
      [laterProductId, warehouseId, laterNextQuantity],
    );
    await db.unsafe(
      "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,created_at) " +
        "values($1,$2,'ci_concurrent_adjustment',1,$3,'ci_import_onyx_test',$4,'Deliberate stale integration fixture',$5,pg_catalog.clock_timestamp())",
      [laterProductId, warehouseId, laterNextQuantity, stalePreview.command_id, managerProfileId],
    );
    await db.unsafe("set role authenticated");
    await setIdentity();
    await expectFailure(
      "stale importer-snapshot apply is denied atomically",
      () => applyInventory(stalePreview.command_id, idempotencyKey()),
      /stock balance or reservation changed after preview/i,
    );
    const afterStaleReject = await snapshotStock();
    assert.equal(quantityFor(afterStaleReject, firstProductId).quantity_on_hand, firstBeforeStale, "no earlier product update may survive a stale later-line failure");
    assert.equal(quantityFor(afterStaleReject, laterProductId).quantity_on_hand, laterNextQuantity.toFixed(3), "concurrent stock change is preserved");
    assert.equal(movementsFor(afterStaleReject, firstProductId), movementsFor(afterRollback, firstProductId));
    const staleStatus = await readAsOwner(
      "select status from public.onyx_inventory_reconciliation_commands where id=$1::uuid",
      [stalePreview.command_id],
    );
    assert.equal(staleStatus[0].status, "previewed", "failed apply must leave the command previewed");

    const freshPreview = await previewInventory(finalized.snapshot_id, idempotencyKey(), "rollback-later-movement guard");
    const freshApply = await applyInventory(freshPreview.command_id, idempotencyKey());
    assert.equal(freshApply.status, "applied");
    assert.equal(freshApply.adjusted_lines, laterProductId === productChangedId ? 1 : 2, "adjusted line count follows the actually changed baseline rows");
    const appliedFreshState = await snapshotStock();
    const guardProductId = productChangedId;
    const guardBefore = Number(quantityFor(appliedFreshState, guardProductId).quantity_on_hand);
    await db.unsafe("reset role");
    const guardNext = guardBefore + 1;
    await db.unsafe(
      "update public.inventory_balances set quantity_on_hand=$3::numeric,last_movement_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp() where product_id=$1::uuid and warehouse_id=$2::uuid",
      [guardProductId, warehouseId, guardNext],
    );
    await db.unsafe(
      "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,created_at) " +
        "values($1,$2,'ci_later_adjustment',1,$3,'ci_import_onyx_test',$4,'Deliberate post-apply stock movement',$5,pg_catalog.clock_timestamp())",
      [guardProductId, warehouseId, guardNext, freshPreview.command_id, managerProfileId],
    );
    await db.unsafe("set role authenticated");
    await setIdentity();
    await expectFailure(
      "rollback refuses to overwrite post-apply stock movement",
      () => rollbackInventory(freshPreview.command_id, idempotencyKey(), "unsafe rollback denied"),
      /stock or reservations changed after Onyx apply|newer or altered stock movement history exists/i,
    );
    const afterUnsafeRollback = await snapshotStock();
    assert.equal(quantityFor(afterUnsafeRollback, guardProductId).quantity_on_hand, String(guardNext.toFixed(3)), "later stock quantity must remain untouched");
    const freshStatus = await readAsOwner(
      "select status from public.onyx_inventory_reconciliation_commands where id=$1::uuid",
      [freshPreview.command_id],
    );
    assert.equal(freshStatus[0].status, "applied", "failed rollback must not change command state");

    const auditRows = await readAsOwner(
      "select organization_id::text,actor_id::text,action,entity_id::text from public.audit_logs " +
        "where organization_id=$1::uuid and entity_type='onyx_inventory_reconciliation' and entity_id=$2::uuid order by created_at",
      [organizationId, previewed.command_id],
    );
    assert.ok(auditRows.some((row) => row.organization_id === organizationId && row.actor_id === managerProfileId && row.action === "inventory.onyx_reconciliation.applied"));
    assert.ok(auditRows.some((row) => row.organization_id === organizationId && row.actor_id === managerProfileId && row.action === "inventory.onyx_reconciliation.rolled_back"));

    await db.unsafe("rollback");
    process.stdout.write(
      "PASS inventory->Onyx reconciliation: real finalized snapshot hash/tenant/warehouse scope; preview no-write + replay; staff/tenant/direct-DML denial; apply/replay; compensating rollback/replay; atomic stale-apply denial; later-movement rollback refusal; audit actor/tenant.\\n",
    );
  } catch (error) {
    await db.unsafe("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("IMPORT_INVENTORY_SNAPSHOT_CONTRACT_FAILED:", error);
  process.exitCode = 1;
});
