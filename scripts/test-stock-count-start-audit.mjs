import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for stock-count audit acceptance.");
}

const organizationId = "a0000000-0000-0000-0000-000000000001";
const adminAuthUserId = "33333333-3333-4333-8333-333333333333";
const adminProfileId = "f0000000-0000-0000-0000-000000000001";
const warehouseId = "d0000000-0000-0000-0000-000000000001";
const email = "admin@aghbari.ye";
const notes = "CI stock-count start audit acceptance";
const idempotencyKey = "ci-stock-count-audit-" + randomUUID();

const commandDb = postgres(connectionString, { max: 1, prepare: false });
const auditDb = postgres(connectionString, { max: 1, prepare: false });
let sessionId = null;
let roleEstablished = false;
let transactionOpen = false;
let passed = false;

async function setAdminIdentity() {
  await commandDb.unsafe("reset role").catch(() => {});
  roleEstablished = false;
  await commandDb.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [adminAuthUserId, adminAuthUserId]);
  await commandDb.unsafe(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [adminAuthUserId],
  );
  await commandDb.unsafe(
    "select set_config('request.jwt.claims', $1, false)",
    [JSON.stringify({
      sub: adminAuthUserId,
      email,
      email_confirmed_at: new Date().toISOString(),
      role: "authenticated",
      session_id: adminAuthUserId,
    })],
  );
  await commandDb.unsafe("set role authenticated");
  roleEstablished = true;
}

async function readStartAudit() {
  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const rows = await commandDb.unsafe(
    "select organization_id, actor_id, action, entity_type, entity_id, new_value " +
      "from public.audit_logs " +
      "where action = 'inventory.stock_count.started' and entity_id = $1::uuid",
    [sessionId],
  );
  await setAdminIdentity();
  return rows;
}

async function main() {
  await commandDb.unsafe("begin");
  transactionOpen = true;
  await setAdminIdentity();

  const available = await auditDb.unsafe(
    "select ib.product_id from public.inventory_balances ib " +
      "join public.products p on p.id = ib.product_id " +
      "join public.warehouses w on w.id = ib.warehouse_id " +
      "where ib.warehouse_id = $1::uuid and p.organization_id = $2::uuid " +
      "and p.status = 'active' and w.organization_id = $2::uuid and w.is_active = true " +
      "limit 1",
    [warehouseId, organizationId],
  );
  assert.ok(
    available.length > 0,
    "CI stock-count warehouse must have at least one active tenant-owned inventory balance",
  );

  const firstRows = await commandDb.unsafe(
    "select public.start_stock_count($1::uuid, $2::text, $3::text) as result",
    [warehouseId, idempotencyKey, notes],
  );
  const first = firstRows[0]?.result;
  assert.ok(first?.id, "stock-count start returns the persisted session ID");
  sessionId = first.id;
  assert.equal(first.organization_id, organizationId);
  assert.equal(first.warehouse_id, warehouseId);
  assert.equal(first.started_by, adminProfileId, "session records the authenticated profile, not the auth user ID");
  assert.equal(first.status, "open");
  assert.equal(first.replayed, false, "first call creates a new session rather than replaying");

  const firstAudit = await readStartAudit();
  assert.equal(firstAudit.length, 1, "one new stock-count session creates exactly one start-audit row");
  assert.equal(firstAudit[0].organization_id, organizationId, "audit event is tenant-scoped");
  assert.equal(firstAudit[0].actor_id, adminProfileId, "audit actor matches the authenticated profile");
  assert.equal(firstAudit[0].action, "inventory.stock_count.started");
  assert.equal(firstAudit[0].entity_type, "stock_count_session");
  assert.equal(firstAudit[0].entity_id, sessionId);
  assert.deepEqual(
    Object.keys(firstAudit[0].new_value).sort(),
    ["started_at", "status", "warehouse_id"],
    "audit payload contains only the approved metadata fields",
  );
  assert.equal(firstAudit[0].new_value.warehouse_id, warehouseId);
  assert.equal(firstAudit[0].new_value.status, "open");
  assert.ok(firstAudit[0].new_value.started_at, "audit metadata records when the count started");

  const replayRows = await commandDb.unsafe(
    "select public.start_stock_count($1::uuid, $2::text, $3::text) as result",
    [warehouseId, idempotencyKey, notes],
  );
  const replay = replayRows[0]?.result;
  assert.equal(replay.id, sessionId, "same idempotency key returns the existing session");
  assert.equal(replay.replayed, true, "retry is reported as a replay");
  const replayAudit = await readStartAudit();
  assert.equal(replayAudit.length, 1, "idempotent replay does not create a duplicate start-audit row");

  // Complete the real count with exactly one source-backed variance and verify the task integration.
  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const lines = await commandDb.unsafe(
    "select product_id, expected_quantity::text as expected_quantity " +
    "from public.stock_count_lines where organization_id=$1::uuid and session_id=$2::uuid order by product_id",
    [organizationId, sessionId],
  );
  assert.ok(lines.length > 0, "started stock count captures source inventory lines");
  await setAdminIdentity();
  for (let index = 0; index < lines.length; index += 1) {
    const expected = Number(lines[index].expected_quantity);
    assert.ok(Number.isFinite(expected) && expected >= 0, "expected quantity is source-backed and finite");
    const counted = expected + (index === 0 ? 1 : 0);
    await commandDb.unsafe(
      "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",
      [sessionId, lines[index].product_id, counted],
    );
  }
  const completedRows = await commandDb.unsafe(
    "select public.complete_stock_count($1::uuid) as result",
    [sessionId],
  );
  const completed = completedRows[0]?.result;
  assert.equal(completed.status, "completed", "stock count finalization persists the completed state");
  assert.equal(Number(completed.adjusted_lines), 1, "one changed source count creates one applied variance");
  assert.equal(Number(completed.positive_adjustment), 1, "the positive variance matches the counted delta");

  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const varianceKey = "stock-count-variance:" + sessionId;
  const firstTaskRows = await commandDb.unsafe(
    "select task_role,status,source_entity_type,source_entity_id,task_payload " +
    "from public.ai_tasks where organization_id=$1::uuid and source_event_key=$2",
    [organizationId, varianceKey],
  );
  assert.equal(firstTaskRows.length, 1, "a completed count with non-zero variance creates exactly one task");
  assert.equal(firstTaskRows[0].task_role, "warehouse");
  assert.equal(firstTaskRows[0].status, "pending");
  assert.equal(firstTaskRows[0].source_entity_type, "stock_count_sessions");
  assert.equal(firstTaskRows[0].source_entity_id, sessionId);
  const taskPayload = typeof firstTaskRows[0].task_payload === "string"
    ? JSON.parse(firstTaskRows[0].task_payload) : firstTaskRows[0].task_payload;
  assert.equal(Number(taskPayload.adjusted_lines), 1);
  assert.equal(Number(taskPayload.positive_adjustment_quantity), 1);
  assert.equal(Number(taskPayload.negative_adjustment_quantity), 0);
  assert.equal(taskPayload.warehouse_id, warehouseId, "task is linked to the counted warehouse");

  await setAdminIdentity();
  await commandDb.unsafe("select public.refresh_operational_tasks() as result");
  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const refreshedTaskRows = await commandDb.unsafe(
    "select count(*)::integer as count,min(status) as status from public.ai_tasks " +
    "where organization_id=$1::uuid and source_event_key=$2",
    [organizationId, varianceKey],
  );
  assert.equal(refreshedTaskRows[0].count, 1, "task refresh does not duplicate source-linked variance tasks");
  assert.equal(refreshedTaskRows[0].status, "pending", "refresh preserves the open warehouse follow-up");

  
  // A balance created after the snapshot must invalidate finalization, even if every
  // pre-existing line still matches. Purchase receiving can create this previously absent row.
  await setAdminIdentity();
  const lateRows = await commandDb.unsafe(
    "select public.start_stock_count($1::uuid,$2::text,$3::text) as result",
    [warehouseId, "ci-stock-count-late-balance-" + randomUUID(), "CI late-balance snapshot guard"],
  );
  const lateSession = lateRows[0]?.result;
  assert.ok(lateSession?.id, "late-balance scenario starts a fresh count snapshot");

  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const lateProductId = randomUUID();
  const lateItemCode = "CI-STOCK-SNAPSHOT-" + randomUUID().replace(/-/g, "").slice(0, 20);
  await commandDb.unsafe(
    "insert into public.products(id,organization_id,name,item_code,unit,status) values($1::uuid,$2::uuid,$3,$4,$5,'active')",
    [lateProductId, organizationId, "CI stock-count late-balance fixture", lateItemCode, "unit"],
  );
  const lateBalance = await commandDb.unsafe(
    "select id from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
    [lateProductId, warehouseId],
  );
  if (lateBalance.length === 0) {
    await commandDb.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1::uuid,$2::uuid,3,0,0)",
      [lateProductId, warehouseId],
    );
  } else {
    await commandDb.unsafe(
      "update public.inventory_balances set quantity_on_hand=3,quantity_reserved=0,last_movement_at=now(),updated_at=now() where product_id=$1::uuid and warehouse_id=$2::uuid",
      [lateProductId, warehouseId],
    );
  }

  await setAdminIdentity();
  const lateLines = await commandDb.unsafe(
    "select product_id,expected_quantity::text as expected_quantity from public.stock_count_lines " +
    "where organization_id=$1::uuid and session_id=$2::uuid order by product_id",
    [organizationId, lateSession.id],
  );
  assert.ok(lateLines.length > 0);
  for (const line of lateLines) {
    await commandDb.unsafe(
      "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",
      [lateSession.id, line.product_id, Number(line.expected_quantity)],
    );
  }
  await commandDb.unsafe("savepoint stock_count_late_balance_guard");
  await assert.rejects(
    commandDb.unsafe("select public.complete_stock_count($1::uuid)", [lateSession.id]),
    /inventory balance set changed after the count snapshot/i,
    "a newly created active warehouse balance must invalidate the count snapshot",
  );
  await commandDb.unsafe("rollback to savepoint stock_count_late_balance_guard");
  await commandDb.unsafe("release savepoint stock_count_late_balance_guard");
  await setAdminIdentity();
  const cancelledLate = await commandDb.unsafe(
    "select public.cancel_stock_count($1::uuid,$2::text) as result",
    [lateSession.id, "Post-snapshot balance change; take a new count"],
  );
  assert.equal(cancelledLate[0]?.result.status, "cancelled", "stale count is explicitly cancelled after the failed finalization");
  await commandDb.unsafe("reset role");
  roleEstablished = false;

// A second source-backed count with zero variance must not create noise in the task inbox.
  await setAdminIdentity();
  const noVarianceKey = "ci-stock-count-no-variance-" + randomUUID();
  const secondRows = await commandDb.unsafe(
    "select public.start_stock_count($1::uuid,$2::text,$3::text) as result",
    [warehouseId, noVarianceKey, "CI zero-variance stock-count acceptance"],
  );
  const second = secondRows[0]?.result;
  assert.ok(second?.id, "second count starts after prior count completion");
  const zeroLines = await commandDb.unsafe(
    "select product_id,expected_quantity::text as expected_quantity from public.stock_count_lines " +
    "where organization_id=$1::uuid and session_id=$2::uuid order by product_id",
    [organizationId, second.id],
  );
  assert.ok(zeroLines.length > 0);
  for (const line of zeroLines) {
    await commandDb.unsafe(
      "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",
      [second.id, line.product_id, Number(line.expected_quantity)],
    );
  }
  const zeroCompletedRows = await commandDb.unsafe(
    "select public.complete_stock_count($1::uuid) as result",
    [second.id],
  );
  assert.equal(Number(zeroCompletedRows[0]?.result.adjusted_lines), 0);
  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const noVarianceTasks = await commandDb.unsafe(
    "select count(*)::integer as count from public.ai_tasks " +
    "where organization_id=$1::uuid and source_event_key=$2",
    [organizationId, "stock-count-variance:" + second.id],
  );
  assert.equal(noVarianceTasks[0].count, 0, "zero-variance stock counts do not create unnecessary follow-up tasks");
}

try {
  await main();
  passed = true;
} catch (error) {
  console.error("STOCK_COUNT_START_AUDIT_FAILED", error);
  process.exitCode = 1;
} finally {
  if (transactionOpen) {
    try {
      await commandDb.unsafe("rollback");
      transactionOpen = false;
    } catch (error) {
      console.error("stock-count variance acceptance rollback failed", error);
      process.exitCode = 1;
      passed = false;
    }
  }
  for (const connection of [commandDb, auditDb]) {
    try {
      await connection.end();
    } catch (error) {
      console.error("stock-count acceptance connection cleanup failed", error);
      process.exitCode = 1;
      passed = false;
    }
  }
}

if (passed && process.exitCode !== 1) {
  console.log(
    "PASS stock-count audit and variance tasks: tenant/profile-bound idempotent start; one task for non-zero variance; zero-variance suppression; refresh idempotency; transaction rollback leaves no fixture changes",
  );
}