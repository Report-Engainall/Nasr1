import { logError, logInfo } from "./diagnostic-logger.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for Onyx reconciliation concurrency acceptance.");
}

const admin = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const coordinator = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const runnerA = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const runnerB = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const uuid = () => randomUUID();
const suffix = uuid().replaceAll("-", "").slice(0, 12);
const organizationId = uuid();
const profileId = uuid();
const authUserId = uuid();
const warehouseId = uuid();
const productId = uuid();
const importJobId = uuid();
const snapshotId = uuid();
const itemCode = "ONYX-RACE-" + suffix;
const warehouseCode = "WH-RACE-" + suffix;
const warehouseName = "Concurrency acceptance " + suffix;
const email = "onyx-race-" + suffix + "@example.test";
const previewKey = "onyx-race-preview-" + suffix;
const applyKey = "onyx-race-apply-" + suffix;
const sourceHash = "a".repeat(64);
let commandId = null;
let setupCommitted = false;
let coordinatorOpen = false;

function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function setManagerIdentity(client) {
  await client.unsafe("reset role");
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI Onyx reconciliation session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: authUserId,
      email,
      role: "authenticated",
      email_confirmed_at: new Date().toISOString(),
      session_id: authUserId,
    }),
  ]);
  await client.unsafe("set role authenticated");
}

async function apply(client) {
  const rows = await client.unsafe(
    "select public.apply_onyx_inventory_reconciliation($1::uuid,$2::text) as payload",
    [commandId, applyKey],
  );
  return asJson(rows[0].payload);
}

async function waitForBothCallersBlocked(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let latestCount = 0;
  while (Date.now() < deadline) {
    const rows = await admin.unsafe(
      "select pg_catalog.count(*)::integer as count " +
        "from pg_catalog.pg_stat_activity " +
        "where datname = pg_catalog.current_database() " +
        "and pid <> pg_backend_pid() " +
        "and state = 'active' and wait_event_type = 'Lock' " +
        "and query ilike '%apply_onyx_inventory_reconciliation%'",
    );
    latestCount = rows[0].count;
    if (latestCount >= 2) return latestCount;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return latestCount;
}

async function removeFixture() {
  if (!setupCommitted) return;
  await admin.unsafe("begin");
  try {
    await admin.unsafe("delete from public.audit_logs where organization_id=$1::uuid", [organizationId]);
    await admin.unsafe(
      "delete from public.inventory_movements where product_id=$1::uuid and warehouse_id=$2::uuid",
      [productId, warehouseId],
    );
    await admin.unsafe(
      "delete from public.onyx_inventory_reconciliation_items where organization_id=$1::uuid",
      [organizationId],
    );
    await admin.unsafe(
      "delete from public.onyx_inventory_reconciliation_commands where organization_id=$1::uuid",
      [organizationId],
    );
    await admin.unsafe(
      "delete from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
      [productId, warehouseId],
    );
    await admin.unsafe("delete from public.onyx_snapshot_rows where snapshot_id=$1::uuid", [snapshotId]);
    await admin.unsafe("delete from public.onyx_snapshots where id=$1::uuid", [snapshotId]);
    await admin.unsafe("delete from public.import_jobs where id=$1::uuid", [importJobId]);
    await admin.unsafe("delete from public.products where id=$1::uuid", [productId]);
    await admin.unsafe("delete from public.warehouses where id=$1::uuid", [warehouseId]);
    await admin.unsafe("delete from public.user_roles where profile_id=$1::uuid", [profileId]);
    await admin.unsafe("delete from public.profiles where id=$1::uuid", [profileId]);
    await admin.unsafe("delete from auth.users where id=$1::uuid", [authUserId]);
    await admin.unsafe("delete from public.organizations where id=$1::uuid", [organizationId]);
    await admin.unsafe("commit");
  } catch (error) {
    await admin.unsafe("rollback").catch(() => undefined);
    throw error;
  }
}

async function main() {
  await admin.unsafe("begin");
  try {
    await admin.unsafe(
      "insert into public.organizations(id,name,currency,is_active) values($1::uuid,$2::text,'YER',true)",
      [organizationId, "CI Onyx race " + suffix],
    );
    await admin.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
        "values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,true)",
      [profileId, authUserId, organizationId, "CI Onyx Race Manager", email],
    );
    await admin.unsafe("insert into public.user_roles(profile_id,role) values($1::uuid,'manager')", [profileId]);
    await admin.unsafe(
      "insert into public.warehouses(id,organization_id,name,code,is_active) " +
        "values($1::uuid,$2::uuid,$3::text,$4::text,true)",
      [warehouseId, organizationId, warehouseName, warehouseCode],
    );
    await admin.unsafe(
      "insert into public.products(id,organization_id,name,item_code,unit,base_price,cost_price,min_stock,status) " +
        "values($1::uuid,$2::uuid,'CI Onyx concurrent item',$3::text,'piece',1,0,0,'active')",
      [productId, organizationId, itemCode],
    );
    await admin.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
        "values($1::uuid,$2::uuid,10,2,0)",
      [productId, warehouseId],
    );
    await admin.unsafe(
      "insert into public.import_jobs(id,organization_id,job_type,source_system,file_name,file_hash,status,total_rows,created_by) " +
        "values($1::uuid,$2::uuid,'inventory','manual',$3::text,$4::text,'completed',1,$5::uuid)",
      [importJobId, organizationId, "onyx-race-" + suffix + ".csv", sourceHash, profileId],
    );
    await admin.unsafe(
      "insert into public.onyx_snapshots(" +
        "id,organization_id,source_import_job_id,source_file_hash,source_file_name,report_type,row_count," +
        "data_quality_score,metrics,status,created_by) " +
        "values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,'inventory_stock',1,100," +
        "pg_catalog.jsonb_build_object('warehouse_id',$6::text,'warehouse_code',$7::text,'warehouse_name',$8::text)," +
        "'ready',$9::uuid)",
      [
        snapshotId,
        organizationId,
        importJobId,
        sourceHash,
        "onyx-race-" + suffix + ".csv",
        warehouseId,
        warehouseCode,
        warehouseName,
        profileId,
      ],
    );
    // Build fixture JSON inside PostgreSQL, matching the known-good reconciliation acceptance path.
    // This avoids relying on JavaScript JSON-string binding for jsonb fixture columns.
    await admin.unsafe(
      "insert into public.onyx_snapshot_rows(" +
        "organization_id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors) " +
        "values($1::uuid,$2::uuid,1,$3::text," +
        "pg_catalog.md5(pg_catalog.jsonb_build_object(" +
        "'item_code',$3::text,'quantity','15','warehouse_id',$4::text," +
        "'warehouse_code',$5::text,'warehouse_name',$6::text,'external_id',$7::text)::text)," +
        "'valid',pg_catalog.jsonb_build_object(" +
        "'item_code',$3::text,'quantity','15','warehouse_id',$4::text," +
        "'warehouse_code',$5::text,'warehouse_name',$6::text,'external_id',$7::text)," +
        "'[]'::jsonb)",
      [organizationId, snapshotId, itemCode, warehouseId, warehouseCode, warehouseName, "ONYX-" + suffix],
    );
    // Prove the test fixture's scope survived PostgreSQL persistence before invoking the guarded RPC.
    // This distinguishes bad fixture data from a database function/migration regression.
    const persistedScope = await admin.unsafe(
      "select s.metrics->>'warehouse_id' as snapshot_warehouse_id, " +
        "s.metrics->>'warehouse_code' as snapshot_warehouse_code, " +
        "r.data->>'warehouse_id' as row_warehouse_id, " +
        "r.data->>'warehouse_code' as row_warehouse_code, " +
        "r.data->>'warehouse_name' as row_warehouse_name " +
        "from public.onyx_snapshots s join public.onyx_snapshot_rows r " +
        "on r.snapshot_id=s.id and r.organization_id=s.organization_id " +
        "where s.id=$1::uuid and s.organization_id=$2::uuid",
      [snapshotId, organizationId],
    );
    assert.equal(persistedScope.length, 1, "scoped Onyx fixture must persist exactly one source row");
    assert.equal(persistedScope[0].snapshot_warehouse_id, warehouseId, "snapshot warehouse_id must persist");
    assert.equal(persistedScope[0].snapshot_warehouse_code, warehouseCode, "snapshot warehouse_code must persist");
    assert.equal(persistedScope[0].row_warehouse_id, warehouseId, "source row warehouse_id must persist");
    assert.equal(persistedScope[0].row_warehouse_code, warehouseCode, "source row warehouse_code must persist");
    assert.equal(persistedScope[0].row_warehouse_name, warehouseName, "source row warehouse_name must persist");
    await admin.unsafe("commit");
    setupCommitted = true;
  } catch (error) {
    await admin.unsafe("rollback").catch(() => undefined);
    throw error;
  }

  await setManagerIdentity(runnerA);
  await setManagerIdentity(runnerB);
  const previewRows = await runnerA.unsafe(
    "select public.preview_onyx_inventory_reconciliation($1::uuid,$2::uuid,$3::text,$4::text) as payload",
    [snapshotId, warehouseId, previewKey, "Two-session apply concurrency acceptance"],
  );
  const preview = asJson(previewRows[0].payload);
  assert.equal(preview.status, "previewed");
  assert.equal(preview.source_row_count, 1);
  commandId = preview.command_id;

  // Hold the command's row lock from a third session so both authenticated callers
  // are proven waiting on the same row before the lock is released.
  await coordinator.unsafe("begin");
  coordinatorOpen = true;
  await coordinator.unsafe(
    "select id from public.onyx_inventory_reconciliation_commands where id=$1::uuid for update",
    [commandId],
  );
  const pending = Promise.allSettled([apply(runnerA), apply(runnerB)]);
  let blockedCallers = 0;
  try {
    blockedCallers = await waitForBothCallersBlocked();
  } finally {
    await coordinator.unsafe("commit");
    coordinatorOpen = false;
  }
  const outcomes = await pending;
  assert.equal(
    blockedCallers,
    2,
    "both independent database sessions must be blocked on the command row concurrently before release",
  );
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") throw outcome.reason;
  }
  const resultA = outcomes[0].value;
  const resultB = outcomes[1].value;
  assert.equal(resultA.status, "applied");
  assert.equal(resultB.status, "applied");
  assert.deepEqual(
    [resultA.idempotent_replay, resultB.idempotent_replay].sort(),
    [false, true],
    "the lock winner must apply once and the second caller must receive an idempotent replay",
  );

  const commandRows = await admin.unsafe(
    "select status,apply_idempotency_key,adjusted_lines from public.onyx_inventory_reconciliation_commands " +
      "where id=$1::uuid and organization_id=$2::uuid",
    [commandId, organizationId],
  );
  assert.equal(commandRows.length, 1);
  assert.equal(commandRows[0].status, "applied");
  assert.equal(commandRows[0].apply_idempotency_key, applyKey);
  assert.equal(commandRows[0].adjusted_lines, 1);

  const stockRows = await admin.unsafe(
    "select quantity_on_hand::text as on_hand,quantity_reserved::text as reserved " +
      "from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
    [productId, warehouseId],
  );
  assert.equal(stockRows.length, 1);
  assert.equal(stockRows[0].on_hand, "15.000");
  assert.equal(stockRows[0].reserved, "2.000", "concurrent apply must preserve reserved stock");

  const movementRows = await admin.unsafe(
    "select count(*)::integer as count from public.inventory_movements " +
      "where product_id=$1::uuid and warehouse_id=$2::uuid " +
      "and reference_type='onyx_inventory_reconciliation' and reference_id=$3::uuid " +
      "and movement_type='onyx_reconciliation_adjustment'",
    [productId, warehouseId, commandId],
  );
  assert.equal(movementRows[0].count, 1, "concurrent calls must write a single stock movement");

  const auditRows = await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
      "where organization_id=$1::uuid and action='inventory.onyx_reconciliation.applied' " +
      "and entity_id=$2::uuid",
    [organizationId, commandId],
  );
  assert.equal(auditRows[0].count, 1, "one committed apply must produce one audit record");

  logInfo(
    "PASS Onyx reconciliation two-session concurrency: both callers observed waiting; one apply, one idempotent replay, one movement, one audit, reservations preserved",
  );
}

main()
  .catch((error) => {
    logError("DATABASE_ACCEPTANCE_FAILED onyx reconciliation concurrency:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (coordinatorOpen) await coordinator.unsafe("rollback").catch(() => undefined);
    try {
      await removeFixture();
    } catch (error) {
      logError("DATABASE_ACCEPTANCE_CLEANUP_FAILED onyx reconciliation concurrency:", error);
      process.exitCode = 1;
    }
    await Promise.all([
      admin.end({ timeout: 5 }),
      coordinator.end({ timeout: 5 }),
      runnerA.end({ timeout: 5 }),
      runnerB.end({ timeout: 5 }),
    ]);
  });
