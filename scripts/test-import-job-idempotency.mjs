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
    "select public.create_import_job_idempotent($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::uuid,$7::text,$8::text,$9::text) as result",
    [
      input.requestKey,
      input.fileName,
      input.fileHash,
      input.fileSize,
      input.jobType,
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

  // A retry key is bound to the complete payload, not only the file hash.
  await assert.rejects(
    () => createJob(firstClient, { ...base, fileName: "different-payload.csv" }),
    /مفتاح محاولة الاستيراد مستخدم لعملية أو حمولة مختلفة/,
    "same key with a changed payload must be rejected",
  );

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
