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
let passed = false;

async function setAdminIdentity() {
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
    })],
  );
  await commandDb.unsafe("set role authenticated");
  roleEstablished = true;
}

async function readStartAudit() {
  return auditDb.unsafe(
    "select organization_id, actor_id, action, entity_type, entity_id, new_value " +
      "from public.audit_logs " +
      "where action = 'inventory.stock_count.started' and entity_id = $1::uuid",
    [sessionId],
  );
}

async function main() {
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
}

try {
  await main();
  passed = true;
} catch (error) {
  console.error("STOCK_COUNT_START_AUDIT_FAILED", error);
  process.exitCode = 1;
} finally {
  if (sessionId && roleEstablished) {
    try {
      await commandDb.unsafe(
        "select public.cancel_stock_count($1::uuid, $2::text)",
        [sessionId, "CI cleanup after stock-count start audit acceptance"],
      );
    } catch (error) {
      console.error("stock-count acceptance cleanup failed", error);
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
    "PASS stock-count start audit: one tenant/profile-bound metadata event; idempotent replay adds no duplicate",
  );
}