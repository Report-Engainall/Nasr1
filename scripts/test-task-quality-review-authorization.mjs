import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for task-quality review PostgreSQL acceptance.");
  return value.replace(/^\"(.*)\"$/s, "$1");
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

const databaseUrl = requiredEnv("TEST_DATABASE_URL");
const supabaseUrl = requiredEnv("E2E_SUPABASE_URL");
const organizationId = "a0000000-0000-0000-0000-000000000001";
const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
validateCashExpenseEndpoints(supabaseUrl, databaseUrl);

const db = postgres(databaseUrl, { max: 4, prepare: false, idle_timeout: 5, connect_timeout: 5 });
const runKey = "p2-quality-" + randomUUID().replaceAll("-", "");

async function lookupProfile(email, role, tenantId) {
  const rows = await db.unsafe(
    "select p.id,p.auth_user_id,p.email,p.organization_id " +
    "from public.profiles p join public.user_roles r on r.profile_id=p.id " +
    "where p.organization_id=$1::uuid and lower(p.email)=lower($2) " +
    "and p.is_active=true and p.auth_user_id is not null and r.role=$3 " +
    "order by p.id limit 2",
    [tenantId, email, role],
  );
  assert.equal(rows.length, 1, "the seeded local profile must resolve uniquely for role " + role);
  return rows[0];
}

async function withActor(client, profile, action) {
  return client.begin(async (tx) => {
    const sessionId = randomUUID();
    await tx.unsafe(
      "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1::uuid,$2::uuid,now(),now(),now(),null,'CI task-quality acceptance','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
      [sessionId, profile.auth_user_id],
    );
    await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [profile.auth_user_id]);
    await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: profile.auth_user_id,
        email: profile.email,
        email_confirmed_at: new Date().toISOString(),
        role: "authenticated",
        session_id: sessionId,
      }),
    ]);
    await tx.unsafe("set local role authenticated");
    return action(tx);
  });
}

async function expectCode(label, action, expectedCode) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " must be rejected");
  assert.equal(String(caught.code), expectedCode, label + " SQLSTATE");
}

async function createTask(profile, title) {
  return withActor(db, profile, async (tx) => {
    const rows = await tx.unsafe(
      "select public.create_operational_task($1::text,$2::text,'management','high',NULL::timestamptz,NULL::uuid) as id",
      [title, "Disposable local PostgreSQL 17 task-quality acceptance fixture."],
    );
    assert.ok(rows[0]?.id, "manager/admin RPC must create the isolated task fixture");
    return String(rows[0].id);
  });
}

async function readTask(taskId) {
  const rows = await db.unsafe(
    "select id::text,organization_id::text,status,task_role,task_type,updated_at::text as updated_at " +
    "from public.ai_tasks where id=$1::uuid",
    [taskId],
  );
  assert.equal(rows.length, 1, "fixture task must persist");
  assert.ok(typeof rows[0].updated_at === "string" && Number.isFinite(Date.parse(rows[0].updated_at)),
    "fixture task must expose its exact server timestamp as text, preserving PostgreSQL microseconds");
  return rows[0];
}

async function callReview(client, profile, task, review, eventId, idempotencyKey, reviewType = "ACTIONABILITY", expectedTimestamp = null) {
  return withActor(client, profile, async (tx) => {
    const payload = db.json(review);
    let rows;
    if (expectedTimestamp === null) {
      // Keep the current task version typed as timestamptz inside PostgreSQL.
      // This avoids a JS text round-trip that can lose timestamp precision.
      const snapshot = await tx.unsafe(
        "select updated_at from public.ai_tasks where id=$1::uuid for update",
        [task.id],
      );
      assert.equal(snapshot.length, 1, "task snapshot must still exist before review");
      rows = await tx.unsafe(
        "select public.record_operational_task_quality_review(" +
        "$1::uuid,(select updated_at from public.ai_tasks where id=$1::uuid)," +
        "$2::text,$3::jsonb,$4::text,$5::text) as result",
        [task.id, reviewType, payload, eventId, idempotencyKey],
      );
    } else {
      // The explicit timestamp path is reserved for the stale-snapshot denial case.
      rows = await tx.unsafe(
        "select public.record_operational_task_quality_review(" +
        "$1::uuid,$2::timestamptz,$3::text,$4::jsonb,$5::text,$6::text) as result",
        [task.id, expectedTimestamp, reviewType, payload, eventId, idempotencyKey],
      );
    }
    return asJson(rows[0]?.result);
  });
}

async function counts(taskId) {
  const rows = await db.unsafe(
    "select " +
    "(select count(*)::integer from public.operational_task_quality_events where organization_id=$1::uuid and task_id=$2::uuid) as event_count," +
    "(select count(*)::integer from public.audit_logs where organization_id=$1::uuid and entity_type='ai_task' and entity_id::text=$2::text and action='operational_task.quality_reviewed') as audit_count",
    [organizationId, taskId],
  );
  return { events: Number(rows[0].event_count), audits: Number(rows[0].audit_count) };
}

async function readMetrics(profile) {
  return withActor(db, profile, async (tx) => {
    const rows = await tx.unsafe("select public.fetch_operational_task_quality_metrics() as result");
    return asJson(rows[0]?.result);
  });
}

async function main() {
  const version = await db.unsafe(
    "select current_setting('server_version_num')::integer as version_num,current_setting('server_version') as server_version",
  );
  assert.equal(Math.floor(Number(version[0].version_num) / 10000), 17,
    "task-quality acceptance must run against the disposable PostgreSQL 17 service");

  const manager = await lookupProfile(requiredEnv("E2E_MANAGER_EMAIL"), "manager", organizationId);
  const staff = await lookupProfile(requiredEnv("E2E_STAFF_EMAIL"), "staff", organizationId);
  const admin = await lookupProfile(requiredEnv("E2E_DEVICE_ADMIN_EMAIL"), "admin", organizationId);
  const customer = await lookupProfile(requiredEnv("E2E_EMAIL"), "customer", organizationId);
  const foreignCustomer = await lookupProfile(requiredEnv("E2E_EMAIL_B"), "customer", foreignOrganizationId);

  const privilegeRows = await db.unsafe(
    "select has_table_privilege('authenticated','public.operational_task_quality_events','SELECT') as auth_select," +
    "has_table_privilege('authenticated','public.operational_task_quality_events','INSERT') as auth_insert," +
    "has_table_privilege('authenticated','public.operational_task_quality_events','UPDATE') as auth_update," +
    "has_table_privilege('authenticated','public.operational_task_quality_events','DELETE') as auth_delete," +
    "has_table_privilege('service_role','public.operational_task_quality_events','SELECT') as service_select," +
    "has_table_privilege('service_role','public.operational_task_quality_events','INSERT') as service_insert",
  );
  assert.deepEqual(
    Object.values(privilegeRows[0]).map(Boolean),
    [false, false, false, false, false, false],
    "raw quality event access must remain revoked from authenticated and service_role",
  );

  const taskId = await createTask(manager, "P2 quality review manager fixture " + runKey);
  const task = await readTask(taskId);
  assert.equal(task.organization_id, organizationId);
  assert.equal(task.task_role, "management");

  const initialCounts = await counts(taskId);
  assert.deepEqual(initialCounts, { events: 0, audits: 0 });

  const eventId = runKey + "-manager";
  const idempotencyKey = runKey + "-manager-key";
  const actionable = { actionability: "ACTIONABLE" };
  const first = await callReview(db, manager, task, actionable, eventId, idempotencyKey);
  assert.equal(first?.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.event?.taskId, taskId);
  assert.equal(first.event?.eventId, eventId);
  assert.equal(first.event?.reviewType, "ACTIONABILITY");
  assert.equal(first.event?.actionability, "ACTIONABLE");
  const firstCounts = await counts(taskId);
  assert.deepEqual(firstCounts, { events: 1, audits: 1 },
    "one accepted review must append exactly one review event and one audit event");

  const replay = await callReview(db, manager, task, actionable, eventId, idempotencyKey);
  assert.equal(replay?.ok, true);
  assert.equal(replay.duplicate, true, "exact retry must return duplicate=true");
  assert.equal(replay.event?.id, first.event.id, "exact retry must return the original immutable event id");
  assert.deepEqual(await counts(taskId), firstCounts,
    "exact retry must not duplicate the review row or audit row");

  await expectCode("same idempotency key with changed review payload", () =>
    callReview(
      db, manager, task,
      { actionability: "NOT_ACTIONABLE", reasonCode: "LOW_EXPECTED_IMPACT" },
      eventId, idempotencyKey,
    ), "23505");
  await expectCode("same idempotency key used by another manager identity", () =>
    callReview(db, admin, task, actionable, eventId, idempotencyKey), "23505");
  assert.deepEqual(await counts(taskId), firstCounts,
    "changed payload and changed actor conflicts must have no data or audit side effects");

  await expectCode("duplicate event id with a new idempotency key", () =>
    callReview(db, manager, task, actionable, eventId, runKey + "-other-key"), "23505");
  await expectCode("unsupported command payload field", () =>
    callReview(
      db, manager, task,
      { actionability: "ACTIONABLE", internalCost: "must-not-be-accepted" },
      runKey + "-bad-envelope", runKey + "-bad-envelope-key",
    ), "22023");
  assert.deepEqual(await counts(taskId), firstCounts,
    "invalid and duplicate command envelopes must not append events or audit rows");

  const concurrencyEventId = runKey + "-concurrent";
  const concurrencyKey = runKey + "-concurrent-key";
  const clients = [
    postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5 }),
    postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5 }),
  ];
  let concurrentResults;
  try {
    concurrentResults = await Promise.all(clients.map(client =>
      callReview(client, manager, task, actionable, concurrencyEventId, concurrencyKey),
    ));
  } finally {
    await Promise.all(clients.map(client => client.end({ timeout: 2 })));
  }
  assert.equal(concurrentResults.length, 2);
  assert.ok(concurrentResults.every(result => result?.ok === true));
  assert.equal(new Set(concurrentResults.map(result => result.event?.id)).size, 1,
    "concurrent exact requests must resolve to one immutable event id");
  assert.deepEqual(new Set(concurrentResults.map(result => result.duplicate)), new Set([true, false]),
    "one concurrent caller inserts and the other receives the replay result");
  assert.deepEqual(await counts(taskId), { events: 2, audits: 2 },
    "concurrent retries must append one event and one audit total");

  const managerMetrics = await readMetrics(manager);
  assert.equal(managerMetrics?.status, "READY");
  assert.equal(managerMetrics?.actionability?.reviewedCount >= 1, true);
  assert.equal(managerMetrics?.actionability?.actionableCount >= 1, true);
  assert.equal(managerMetrics?.actionability?.actionableRatePercent, 100);
  assert.equal(managerMetrics?.scope?.reviewedTaskCount >= 1, true);
  assert.equal(JSON.stringify(managerMetrics).includes(manager.email), false,
    "quality aggregate must not expose reviewer email or customer identity");

  for (const profile of [staff, customer, foreignCustomer]) {
    const metrics = await readMetrics(profile);
    assert.equal(metrics?.status, "RESTRICTED",
      "non-manager and cross-tenant customer quality metrics must stay restricted");
    assert.equal(metrics?.reasonCode, "QUALITY_REVIEW_MANAGER_ONLY");
    await expectCode("non-manager review RPC (" + profile.email + ")", () =>
      callReview(db, profile, task, actionable, runKey + "-deny-" + profile.id, runKey + "-deny-key-" + profile.id),
    "42501");
  }
  assert.deepEqual(await counts(taskId), { events: 2, audits: 2 },
    "unauthorized actors must produce no review or audit rows");

  await expectCode("manager references a foreign-tenant task", () =>
    withActor(db, manager, async (tx) => {
      const foreignRows = await db.unsafe(
        "select public.upsert_operational_task($1::uuid,$2::text,$3::text,'management','high','manual_test',$4::text,'manual',NULL::uuid,NULL::timestamptz,'{}'::jsonb,false) as id",
        [foreignOrganizationId, "P2 foreign task fixture " + runKey, "Cross-tenant denial fixture.", "p2-quality-foreign-" + runKey],
      );
      const foreignTaskId = String(foreignRows[0].id);
      const foreignTask = await db.unsafe(
        "select updated_at::text as updated_at from public.ai_tasks where id=$1::uuid",
        [foreignTaskId],
      );
      const rows = await tx.unsafe(
        "select public.record_operational_task_quality_review($1::uuid,$2::timestamptz,'ACTIONABILITY',$3::jsonb,$4::text,$5::text)",
        [foreignTaskId, foreignTask[0].updated_at, db.json(actionable), runKey + "-foreign", runKey + "-foreign-key"],
      );
      return rows;
    }), "42501");

  await expectCode("authenticated direct table SELECT", () =>
    withActor(db, manager, tx => tx.unsafe("select id from public.operational_task_quality_events limit 1")), "42501");
  await expectCode("authenticated direct table INSERT", () =>
    withActor(db, manager, tx => tx.unsafe("insert into public.operational_task_quality_events default values")), "42501");
  await expectCode("authenticated direct table UPDATE", () =>
    withActor(db, manager, tx => tx.unsafe("update public.operational_task_quality_events set event_id=event_id")), "42501");
  await expectCode("authenticated direct table DELETE", () =>
    withActor(db, manager, tx => tx.unsafe("delete from public.operational_task_quality_events")), "42501");

  await expectCode("append-only event UPDATE trigger", () =>
    db.unsafe(
      "update public.operational_task_quality_events set result_snapshot=result_snapshot " +
      "where organization_id=$1::uuid and task_id=$2::uuid",
      [organizationId, taskId],
    ), "55000");
  await expectCode("append-only event DELETE trigger", () =>
    db.unsafe(
      "delete from public.operational_task_quality_events where organization_id=$1::uuid and task_id=$2::uuid",
      [organizationId, taskId],
    ), "55000");
  assert.deepEqual(await counts(taskId), { events: 2, audits: 2 },
    "append-only trigger denials must preserve the complete event/audit history");

  const adminTaskId = await createTask(admin, "P2 quality review admin fixture " + runKey);
  const adminTask = await readTask(adminTaskId);
  const adminResult = await callReview(
    db, admin, adminTask, { disposition: "APPROVED" },
    runKey + "-admin", runKey + "-admin-key", "RECOMMENDATION_DISPOSITION",
  );
  assert.equal(adminResult?.ok, true);
  assert.equal(adminResult?.duplicate, false);
  const adminEvent = await db.unsafe(
    "select actor_role,task_status_snapshot,task_role_snapshot,task_type_snapshot,command_payload,result_snapshot " +
    "from public.operational_task_quality_events where organization_id=$1::uuid and task_id=$2::uuid",
    [organizationId, adminTaskId],
  );
  assert.equal(adminEvent.length, 1);
  assert.equal(adminEvent[0].actor_role, "admin");
  assert.equal(adminEvent[0].task_status_snapshot, "pending");
  assert.equal(adminEvent[0].task_role_snapshot, "management");
  assert.equal(adminEvent[0].task_type_snapshot, "manual_operational_task");
  assert.equal(asJson(adminEvent[0].command_payload).review.disposition, "APPROVED");
  assert.ok(asJson(adminEvent[0].result_snapshot).event.id);

  const taskBeforeStaleAttempt = await readTask(taskId);
  await db.unsafe(
    "update public.ai_tasks set updated_at=updated_at+interval '1 day' where id=$1::uuid",
    [taskId],
  );
  await expectCode("stale task snapshot", () =>
    callReview(
      db, manager, taskBeforeStaleAttempt,
      { disposition: "DEFERRED", reasonCode: "TIMING_NOT_APPROPRIATE" },
      runKey + "-stale", runKey + "-stale-key", "RECOMMENDATION_DISPOSITION",
    ), "40001");
  assert.deepEqual(await counts(taskId), { events: 2, audits: 2 },
    "stale task version must not append any review or audit evidence");

  const auditRows = await db.unsafe(
    "select new_value from public.audit_logs where organization_id=$1::uuid and entity_type='ai_task' " +
    "and entity_id::text=$2::text and action='operational_task.quality_reviewed' order by created_at,id",
    [organizationId, taskId],
  );
  assert.equal(auditRows.length, 2);
  for (const row of auditRows) {
    const value = asJson(row.new_value);
    assert.ok(value.eventId);
    assert.equal(value.reviewType, "ACTIONABILITY");
    assert.equal("reasonNote" in value, false,
      "audit stores reason codes, not free-text reviewer notes or private task payloads");
  }

  console.log(
    "P2_TASK_QUALITY_REVIEW_PG17_PASS " + runKey +
    " | PostgreSQL 17 | manager+admin allowed | staff+customers denied | tenant isolation | exact and concurrent replay | payload/actor conflict | stale snapshot | raw-table denial | append-only | immutable audit",
  );
}

main()
  .catch((error) => {
    console.error("P2 task-quality review PostgreSQL acceptance failed:", error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 });
  });
