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

async function setIdentity(authUserId, identityEmail) {
  await commandDb.unsafe("reset role").catch(() => {});
  roleEstablished = false;
  await commandDb.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [authUserId, authUserId]);
  await commandDb.unsafe(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [authUserId],
  );
  await commandDb.unsafe(
    "select set_config('request.jwt.claims', $1, false)",
    [JSON.stringify({
      sub: authUserId,
      email: identityEmail,
      email_confirmed_at: new Date().toISOString(),
      role: "authenticated",
      session_id: authUserId,
    })],
  );
  await commandDb.unsafe("set role authenticated");
  roleEstablished = true;
}

async function setAdminIdentity() {
  await setIdentity(adminAuthUserId, email);
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

async function assertCancellationUnchanged(targetSessionId, label) {
  await commandDb.unsafe("reset role").catch(() => {});
  roleEstablished = false;
  const rows = await commandDb.unsafe(
    "select status,cancelled_by::text as cancelled_by,cancelled_at::text as cancelled_at,cancellation_reason " +
      "from public.stock_count_sessions where id=$1::uuid and organization_id=$2::uuid",
    [targetSessionId, organizationId],
  );
  assert.equal(rows.length, 1, label + ": target session remains visible to the owning tenant");
  assert.deepEqual(rows[0], {
    status: "open",
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: null,
  }, label + ": a denied cancellation must not change the session");
  const auditRows = await commandDb.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
      "where organization_id=$1::uuid and action='inventory.stock_count.cancelled' and entity_id=$2::uuid",
    [organizationId, targetSessionId],
  );
  assert.equal(Number(auditRows[0]?.count ?? 0), 0, label + ": denied cancellation must not create an audit event");
  const movementRows = await commandDb.unsafe(
    "select count(*)::integer as count from public.inventory_movements " +
      "where reference_type='stock_count_session' and reference_id=$1::uuid",
    [targetSessionId],
  );
  assert.equal(Number(movementRows[0]?.count ?? 0), 0, label + ": denied cancellation must not create stock movements");
}

async function expectCancellationDenied(
  targetSessionId,
  authUserId,
  identityEmail,
  label,
  expectedSqlState,
  expectedMessage,
) {
  await setIdentity(authUserId, identityEmail);
  await commandDb.unsafe("savepoint stock_count_cancel_denial");
  const caught = await commandDb
    .unsafe("select public.cancel_stock_count($1::uuid,$2::text)", [
      targetSessionId,
      "CI denied cancellation must have no side effects",
    ])
    .then(() => null, (error) => error);
  await commandDb.unsafe("rollback to savepoint stock_count_cancel_denial");
  await commandDb.unsafe("release savepoint stock_count_cancel_denial");
  assert.ok(caught, label + ": cancellation should be denied");
  assert.equal(caught.code, expectedSqlState, label + ": denial SQLSTATE");
  assert.match(String(caught.message), expectedMessage, label + ": denial reason");
  await assertCancellationUnchanged(targetSessionId, label);
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
  // Each physical line entry records the authenticated actor and a before/after audit event.
  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const lineAuditRows = await commandDb.unsafe(
    "select actor_id::text as actor_id,entity_id::text as entity_id,old_value,new_value " +
    "from public.audit_logs where organization_id=$1::uuid " +
    "and action='inventory.stock_count.line_counted' and new_value->>'session_id'=$2::text " +
    "order by created_at,entity_id",
    [organizationId, sessionId],
  );
  assert.equal(lineAuditRows.length, lines.length, "each count-line write is audited exactly once");
  assert.ok(lineAuditRows.every(row => row.actor_id === adminProfileId), "every count-line audit stores the active profile, not auth user ID");
  assert.ok(lineAuditRows.every(row => row.new_value?.counted_by === adminProfileId), "audit payload attributes each current quantity to the active profile");
  assert.ok(lineAuditRows.every(row => row.new_value?.session_id === sessionId), "count-line audit payload is bound to the same snapshot");
  assert.ok(lineAuditRows.every(row => row.new_value?.product_id && row.new_value?.counted_quantity !== undefined), "audit payload records product and counted quantity");
  const countedByRows = await commandDb.unsafe(
    "select count(*)::integer as count from public.stock_count_lines " +
    "where organization_id=$1::uuid and session_id=$2::uuid and counted_by=$3::uuid",
    [organizationId, sessionId, adminProfileId],
  );
  assert.equal(countedByRows[0]?.count, lines.length, "stored counted_by matches the signed-in active profile on every line");
  await setAdminIdentity();

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

  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const lateSnapshotProductIds = lateLines.map((line) => line.product_id);
  const lateSnapshotBalancesBefore = await commandDb.unsafe(
    "select product_id::text as product_id, quantity_on_hand::text as quantity_on_hand, " +
      "quantity_reserved::text as quantity_reserved from public.inventory_balances " +
      "where warehouse_id=$1::uuid and product_id=any($2::uuid[]) order by product_id",
    [warehouseId, lateSnapshotProductIds],
  );
  assert.equal(
    lateSnapshotBalancesBefore.length,
    lateSnapshotProductIds.length,
    "every pre-existing snapshot product must have a balance before failed finalization",
  );
  await setAdminIdentity();

  await commandDb.unsafe("savepoint stock_count_late_balance_guard");
  const lateFinalizeError = await commandDb
    .unsafe("select public.complete_stock_count($1::uuid)", [lateSession.id])
    .then(() => null, (error) => error);
  assert.ok(
    lateFinalizeError,
    "a newly created active warehouse balance must invalidate the count snapshot",
  );
  assert.equal(
    lateFinalizeError.code,
    "40001",
    "a changed stock-count balance set must fail with serialization SQLSTATE 40001",
  );
  assert.match(
    lateFinalizeError.message,
    /inventory balance set changed after the count snapshot/i,
  );
  await commandDb.unsafe("rollback to savepoint stock_count_late_balance_guard");
  await commandDb.unsafe("release savepoint stock_count_late_balance_guard");

  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const lateSnapshotBalancesAfter = await commandDb.unsafe(
    "select product_id::text as product_id, quantity_on_hand::text as quantity_on_hand, " +
      "quantity_reserved::text as quantity_reserved from public.inventory_balances " +
      "where warehouse_id=$1::uuid and product_id=any($2::uuid[]) order by product_id",
    [warehouseId, lateSnapshotProductIds],
  );
  assert.deepEqual(
    lateSnapshotBalancesAfter,
    lateSnapshotBalancesBefore,
    "failed snapshot finalization must not alter any pre-existing on-hand or reserved balances",
  );
  const staleSessionRows = await commandDb.unsafe(
    "select status,completed_at,completed_by from public.stock_count_sessions " +
      "where organization_id=$1::uuid and id=$2::uuid",
    [organizationId, lateSession.id],
  );
  assert.equal(staleSessionRows.length, 1);
  assert.equal(
    staleSessionRows[0].status,
    "open",
    "failed stock-count finalization must leave the session open for explicit cancellation",
  );
  assert.equal(staleSessionRows[0].completed_at, null);
  assert.equal(staleSessionRows[0].completed_by, null);

  const partialMovementRows = await commandDb.unsafe(
    "select count(*)::integer as count from public.inventory_movements " +
      "where reference_type='stock_count_session' and reference_id=$1::uuid",
    [lateSession.id],
  );
  assert.equal(
    Number(partialMovementRows[0]?.count ?? 0),
    0,
    "failed stock-count finalization must not leave partial inventory movements",
  );
  const partialCompletionAuditRows = await commandDb.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
      "where organization_id=$1::uuid and action='inventory.stock_count.completed' and entity_id=$2::uuid",
    [organizationId, lateSession.id],
  );
  assert.equal(
    Number(partialCompletionAuditRows[0]?.count ?? 0),
    0,
    "failed stock-count finalization must not leave a completion audit event",
  );

  // Regression: a SECURITY DEFINER cancellation RPC must reject both a
  // same-tenant non-manager and a foreign-tenant manager without side effects.
  await commandDb.unsafe("reset role");
  roleEstablished = false;
  const foreignOrganizationId = randomUUID();
  const foreignManagerProfileId = randomUUID();
  const foreignManagerAuthId = randomUUID();
  const localStaffProfileId = randomUUID();
  const localStaffAuthId = randomUUID();
  const foreignEmail = "ci-stock-foreign-manager-" + foreignManagerAuthId + "@example.test";
  const localStaffEmail = "ci-stock-local-staff-" + localStaffAuthId + "@example.test";
  await commandDb.unsafe(
    "insert into public.organizations(id,name,currency,is_active) values($1,'CI Stock Count Foreign Tenant','YER',true)",
    [foreignOrganizationId],
  );
  await commandDb.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()) " +
      "on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [foreignManagerAuthId, foreignEmail, localStaffAuthId, localStaffEmail],
  );
  await commandDb.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1,$2,$3,'CI Foreign Stock Manager',$4,true),($5,$6,$7,'CI Local Stock Staff',$8,true)",
    [
      foreignManagerProfileId, foreignManagerAuthId, foreignOrganizationId, foreignEmail,
      localStaffProfileId, localStaffAuthId, organizationId, localStaffEmail,
    ],
  );
  await commandDb.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'manager'),($2,'staff') " +
      "on conflict(profile_id,role) do nothing",
    [foreignManagerProfileId, localStaffProfileId],
  );

  await expectCancellationDenied(
    lateSession.id,
    localStaffAuthId,
    localStaffEmail,
    "same-tenant ordinary staff cannot cancel a stock count",
    "42501",
    /administrator or manager permission required/i,
  );
  await expectCancellationDenied(
    lateSession.id,
    foreignManagerAuthId,
    foreignEmail,
    "foreign-tenant manager cannot cancel or learn whether a stock count exists",
    "22023",
    /stock count is not open/i,
  );

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
    "PASS stock-count audit and cancellation boundaries: tenant/profile-bound idempotent start; same-tenant staff and foreign-tenant manager cancellation denials leave session, audit, and movement state unchanged; stale snapshot rejects with SQLSTATE 40001 and leaves inventory unchanged; non-zero variance creates one task, zero variance creates none; transaction rollback leaves no fixture changes",
  );
}