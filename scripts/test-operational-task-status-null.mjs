import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required; only run against an isolated PostgreSQL 17 test database.");
}

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const adminAuthUserId = "33333333-3333-4333-8333-333333333333";
const adminEmail = "admin@aghbari.ye";
const sessionId = randomUUID();

async function setAdminIdentity() {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI operational task status acceptance','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, adminAuthUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [adminAuthUserId]);
  await db.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: adminAuthUserId, email: adminEmail, role: "authenticated", session_id: sessionId }),
  ]);
  await db.unsafe("set role authenticated");
}

async function expectSqlState(label, action, expectedCode) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must fail");
  assert.equal(caught.code, expectedCode, label + " must raise SQLSTATE " + expectedCode);
}

async function main() {
  await setAdminIdentity();
  const taskTitle = "CI explicit status acceptance " + randomUUID();
  const inserted = await db.unsafe(
    "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,null::timestamptz,null::uuid) as id",
    [taskTitle, "Isolated PG17 acceptance fixture", "operations", "medium"],
  );
  const taskId = inserted[0]?.id;
  assert.match(String(taskId), /^[0-9a-f-]{36}$/i, "manager must create an isolated task fixture");

  await db.unsafe("reset role");
  let task = await db.unsafe("select status,organization_id from public.ai_tasks where id=$1", [taskId]);
  assert.equal(task.length, 1);
  assert.equal(task[0].status, "pending");
  const organizationId = task[0].organization_id;
  const initialAudit = await db.unsafe(
    "select count(*)::int as count from public.audit_logs where organization_id=$1 and entity_type='ai_task' and entity_id=$2 and action='operational_task.status_changed'",
    [organizationId, taskId],
  );
  assert.equal(initialAudit[0].count, 0, "task creation must not fabricate a status-change audit row");

  await setAdminIdentity();
  await expectSqlState(
    "NULL task status",
    () => db.unsafe(
      "select public.update_operational_task_status($1::uuid,$2::text,$3::text)",
      [taskId, null, null],
    ),
    "22023",
  );
  await expectSqlState(
    "unsupported task status",
    () => db.unsafe(
      "select public.update_operational_task_status($1::uuid,$2::text,$3::text)",
      [taskId, "not-a-valid-status", null],
    ),
    "22023",
  );

  await db.unsafe("reset role");
  task = await db.unsafe("select status,assigned_to from public.ai_tasks where id=$1", [taskId]);
  assert.equal(task[0].status, "pending", "invalid statuses must not mutate the task");
  assert.equal(task[0].assigned_to, null, "invalid statuses must not assign the task");
  const afterInvalidAudit = await db.unsafe(
    "select count(*)::int as count from public.audit_logs where organization_id=$1 and entity_type='ai_task' and entity_id=$2 and action='operational_task.status_changed'",
    [organizationId, taskId],
  );
  assert.equal(afterInvalidAudit[0].count, 0, "invalid statuses must not create status-change audit events");

  await setAdminIdentity();
  await db.unsafe(
    "select public.update_operational_task_status($1::uuid,'in_progress',null)",
    [taskId],
  );
  await db.unsafe("reset role");
  task = await db.unsafe("select status,assigned_to from public.ai_tasks where id=$1", [taskId]);
  assert.equal(task[0].status, "in_progress", "a valid transition must still succeed");
  assert.ok(task[0].assigned_to, "starting work assigns the task to the active actor");
  const afterValidAudit = await db.unsafe(
    "select count(*)::int as count from public.audit_logs where organization_id=$1 and entity_type='ai_task' and entity_id=$2 and action='operational_task.status_changed'",
    [organizationId, taskId],
  );
  assert.equal(afterValidAudit[0].count, 1, "exactly one status-change audit is written for the valid transition");

  process.stdout.write(
    "PASS operational task status PG17 runtime: NULL/unsupported status raise 22023 before mutation; valid transition and single audit remain intact.\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("OPERATIONAL_TASK_STATUS_ACCEPTANCE_FAILED " + JSON.stringify({
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      detail: error?.detail ?? null,
      stack: error?.stack ?? null,
    }) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 });
  });
