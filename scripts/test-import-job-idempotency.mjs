import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required; run this only after the target migration harness.");
}

const organizationId = "a0000000-0000-0000-0000-000000000001";
const staffProfileId = "f0000000-0000-0000-0000-000000000001";
const staffAuthUserId = "33333333-3333-4333-8333-333333333333";
const staffEmail = "admin@aghbari.ye";
const directDmlKey = randomUUID();
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const firstClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const secondClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const createdJobIds = new Set();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function setStaffIdentity(client) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [staffAuthUserId, staffAuthUserId]);
  await client.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [staffAuthUserId]);
  await client.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({
      sub: staffAuthUserId,
      email: staffEmail,
      email_confirmed_at: new Date().toISOString(),
      role: "authenticated",
      session_id: staffAuthUserId,
    }),
  ]);
  await client.unsafe("set role authenticated");
}

async function createJob(client, input) {
  const rows = await client.unsafe(
    "select public.create_import_job_idempotent($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::uuid,$8::text,$9::text,$10::text) as result",
    [
      input.requestKey,
      input.fileName,
      input.fileHash,
      input.fileSize,
      input.jobType,
      input.externalSourceReference ?? null,
      input.profileId,
      input.periodKey,
      input.sourceSystem,
      input.intent,
    ],
  );
  const job = rows[0]?.result;
  assert.ok(job && typeof job.id === "string", "idempotent RPC must return the canonical import job");
  createdJobIds.add(job.id);
  return job;
}

async function expectPermissionDenied(label, action) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must be denied");
  assert.match(String(caught.message), /permission denied/i, label + " must fail due to table privileges");
}

async function main() {
  await setStaffIdentity(firstClient);
  await setStaffIdentity(secondClient);

  const base = {
    requestKey: randomUUID(),
    fileName: `ci-import-${randomUUID()}.csv`,
    fileHash: sha256(randomUUID()),
    fileSize: 256,
    jobType: "unified_import",
    profileId: null,
    periodKey: "ci-idempotency-2026-10",
    sourceSystem: "ci-request-idempotency",
    externalSourceReference: `ci-source-${randomUUID()}`,
    intent: "new_version",
  };

  // Separate PostgreSQL sessions issue the exact same logical attempt concurrently.
  const [firstResult, replayResult] = await Promise.allSettled([
    createJob(firstClient, base),
    createJob(secondClient, base),
  ]);
  if (firstResult.status === "rejected") throw firstResult.reason;
  if (replayResult.status === "rejected") throw replayResult.reason;
  const first = firstResult.value;
  const replay = replayResult.value;
  assert.equal(first.id, replay.id, "concurrent same-key calls must return the same job");
  const claimRows = await db.unsafe(
    "select count(*)::int as count, min(import_job_id::text) as job_id from public.import_job_request_keys where organization_id=$1 and actor_profile_id=$2 and request_key=$3",
    [organizationId, staffProfileId, base.requestKey],
  );
  assert.equal(claimRows[0].count, 1, "one request key must create exactly one claim");
  assert.equal(claimRows[0].job_id, first.id, "the private claim must point at the replayed job");
  assert.equal(first.external_source_reference, base.externalSourceReference,
    "the canonical import job must persist its external source identity");

  // A retry key is bound to the complete payload, not only the file hash.
  await assert.rejects(
    () => createJob(firstClient, { ...base, fileName: "different-payload.csv" }),
    /مفتاح محاولة الاستيراد مستخدم لعملية أو حمولة مختلفة/,
    "same key with a changed payload must be rejected",
  );

  // The external source reference is part of the server-side idempotency payload.
  await assert.rejects(
    () => createJob(firstClient, { ...base, externalSourceReference: "ci-source-different" }),
    /مفتاح محاولة الاستيراد مستخدم لعملية أو حمولة مختلفة/,
    "same key with a changed external source reference must be rejected",
  );

  // Race a matching request key with two distinct payloads. Both callers are
  // forced to enter PostgreSQL and wait on the private request-claim table lock
  // before release, after which exactly one payload may claim the key.
  const conflictingRaceBase = {
    ...base,
    requestKey: randomUUID(),
    fileName: "ci-import-conflict-" + randomUUID() + ".csv",
    fileHash: sha256(randomUUID()),
    periodKey: "ci-conflict-" + randomUUID(),
    externalSourceReference: "ci-source-conflict-" + randomUUID(),
  };
  const conflictingRacePayload = {
    ...conflictingRaceBase,
    fileName: "ci-import-conflict-other-" + randomUUID() + ".csv",
    externalSourceReference: "ci-source-conflict-other-" + randomUUID(),
  };
  await Promise.all([
    firstClient.unsafe("select set_config('application_name',$1,false)", ["ci-import-payload-conflict-a"]),
    secondClient.unsafe("select set_config('application_name',$1,false)", ["ci-import-payload-conflict-b"]),
  ]);
  const importConflictGate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let importConflictGateOpen = false;
  let importConflictAttempts;
  let importConflictResults;
  let importConflictActivity = [];
  try {
    await importConflictGate.unsafe("begin");
    importConflictGateOpen = true;
    await importConflictGate.unsafe("lock table public.import_job_request_keys in share mode");
    importConflictAttempts = Promise.allSettled([
      createJob(firstClient, conflictingRaceBase),
      createJob(secondClient, conflictingRacePayload),
    ]);
    let bothImportWritersWaiting = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      importConflictActivity = await db.unsafe(
        "select application_name,state,wait_event_type,wait_event,left(query,180) as query " +
          "from pg_catalog.pg_stat_activity " +
          "where application_name in ('ci-import-payload-conflict-a','ci-import-payload-conflict-b')",
      );
      bothImportWritersWaiting = [
        "ci-import-payload-conflict-a",
        "ci-import-payload-conflict-b",
      ].every((applicationName) => importConflictActivity.some((row) =>
        row.application_name === applicationName &&
        row.state === "active" &&
        row.wait_event_type === "Lock"
      ));
      if (bothImportWritersWaiting) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!bothImportWritersWaiting) {
      await importConflictGate.unsafe("rollback");
      importConflictGateOpen = false;
      importConflictResults = await importConflictAttempts;
      assert.fail("both changed-payload import requests must be observed waiting on PostgreSQL locks before release: " +
        JSON.stringify({
          activity: importConflictActivity,
          outcomes: importConflictResults.map((result) => result.status === "fulfilled"
            ? { status: result.status, id: result.value.id }
            : { status: result.status, error: String(result.reason?.message ?? result.reason) }),
        }));
    }
    await importConflictGate.unsafe("commit");
    importConflictGateOpen = false;
    importConflictResults = await importConflictAttempts;
  } finally {
    if (importConflictGateOpen) await importConflictGate.unsafe("rollback").catch(() => {});
    if (importConflictAttempts) await Promise.allSettled([importConflictAttempts]);
    await importConflictGate.end({ timeout: 5 }).catch(() => {});
  }
  const importConflictSuccesses = importConflictResults.filter((result) => result.status === "fulfilled");
  const importConflictFailures = importConflictResults.filter((result) => result.status === "rejected");
  assert.equal(importConflictSuccesses.length, 1,
    "different payloads racing for one request key must yield exactly one canonical job");
  assert.equal(importConflictFailures.length, 1,
    "the competing changed payload must be rejected rather than creating a second job");
  assert.match(
    String(importConflictFailures[0].reason?.message ?? importConflictFailures[0].reason),
    /مفتاح محاولة الاستيراد مستخدم لعملية أو حمولة مختلفة/,
    "the losing request must fail at the request-payload conflict guard",
  );
  const winningImportJob = importConflictSuccesses[0].value;
  const conflictClaimRows = await db.unsafe(
    "select count(*)::integer as count,min(import_job_id::text) as job_id,min(request_payload->>'file_name') as file_name " +
      "from public.import_job_request_keys where organization_id=$1::uuid and actor_profile_id=$2::uuid and request_key=$3::uuid",
    [organizationId, staffProfileId, conflictingRaceBase.requestKey],
  );
  assert.equal(conflictClaimRows[0].count, 1, "concurrent conflict must leave exactly one private request claim");
  assert.equal(conflictClaimRows[0].job_id, winningImportJob.id,
    "the surviving request claim must point at the single returned job");
  assert.equal(conflictClaimRows[0].file_name, winningImportJob.file_name,
    "the request payload stored with the claim must match the winning job identity");
  const conflictJobRows = await db.unsafe(
    "select count(*)::integer as count from public.import_jobs " +
      "where organization_id=$1::uuid and created_by=$2::uuid and file_hash=$3 and period_key=$4",
    [organizationId, staffProfileId, conflictingRaceBase.fileHash, conflictingRaceBase.periodKey],
  );
  assert.equal(conflictJobRows[0].count, 1,
    "competing request payloads must not create a second import job for the same request identity");

  // The same file may be deliberately imported again only with a fresh key and explicit intent.
  const mergeAttempt = { ...base, requestKey: randomUUID(), intent: "merge" };
  const replaceAttempt = { ...base, requestKey: randomUUID(), intent: "replace" };
  const merged = await createJob(firstClient, mergeAttempt);
  const replaced = await createJob(firstClient, replaceAttempt);
  assert.notEqual(merged.id, first.id, "a deliberate merge has its own import job");
  assert.notEqual(replaced.id, merged.id, "a deliberate replace has its own import job");
  assert.equal(merged.file_hash, first.file_hash, "file hash remains independent of request idempotency");
  assert.equal(replaced.file_hash, first.file_hash, "same file identity may be used for an explicit new intent");

  // Request-claim rows are private implementation details, not browser-readable/writeable tables.
  await expectPermissionDenied(
    "authenticated direct SELECT on import_job_request_keys",
    () => firstClient.unsafe("select request_key from public.import_job_request_keys where request_key=$1", [base.requestKey]),
  );
  await expectPermissionDenied(
    "authenticated direct INSERT on import_job_request_keys",
    () => firstClient.unsafe(
      "insert into public.import_job_request_keys(organization_id,actor_profile_id,request_key,request_payload) values($1,$2,$3,'{}'::jsonb)",
      [organizationId, staffProfileId, directDmlKey],
    ),
  );
  await expectPermissionDenied(
    "authenticated direct UPDATE on import_job_request_keys",
    () => firstClient.unsafe("update public.import_job_request_keys set request_payload='{}'::jsonb where request_key=$1", [base.requestKey]),
  );
  await expectPermissionDenied(
    "authenticated direct DELETE on import_job_request_keys",
    () => firstClient.unsafe("delete from public.import_job_request_keys where request_key=$1", [base.requestKey]),
  );

  process.stdout.write(
    "PASS import request idempotency: concurrent same-key replay, one canonical job/claim, changed-payload rejection, distinct explicit intents, and direct-table privilege denial\n",
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write("IMPORT_REQUEST_IDEMPOTENCY_FAILED " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
} finally {
  for (const client of [firstClient, secondClient]) {
    try { await client.unsafe("reset role"); } catch { /* connection may already be aborted */ }
  }
  try {
    const ids = [...createdJobIds];
    // This suite runs against an isolated PostgreSQL 17 database; clean only the
    // exact random jobs created here and their ON DELETE CASCADE request claims.
    if (ids.length) await db.unsafe("delete from public.import_jobs where id = any($1::uuid[])", [ids]);
  } catch (error) {
    process.stderr.write("IMPORT_REQUEST_IDEMPOTENCY_CLEANUP_FAILED " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  }
  await Promise.all([db.end(), firstClient.end(), secondClient.end()]);
}
