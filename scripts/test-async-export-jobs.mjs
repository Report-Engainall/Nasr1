import assert from "node:assert/strict";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required; run after npm run test:db against PostgreSQL 17.");

const org = "a0000000-0000-0000-0000-000000000001";
const actor = "f0000000-0000-0000-0000-000000000001";
const actorAuth = "33333333-3333-4333-8333-333333333333";
const foreignOrg = "e9888888-8888-4888-8888-888888888888";
const foreignProfile = "f9888888-8888-4888-8888-888888888888";
const foreignAuth = "99888888-8888-4888-8888-888888888888";
const customerProfile = "f9899999-9999-4999-8999-999999999999";
const customerAuth = "99899999-9999-4999-8999-999999999999";
const prefix = "CI-ASYNC-EXPORT-P1-";
const filters = { date_from: "2026-10-01", date_to: "2026-10-20" };
const admin = postgres(url, { max: 1, prepare: false });
const first = postgres(url, { max: 1, prepare: false });
const foreign = postgres(url, { max: 1, prepare: false });
const customer = postgres(url, { max: 1, prepare: false });

async function identity(db, authUser, email) {
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUser]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUser, email, email_confirmed_at: new Date().toISOString(), role: "authenticated" }),
  ]);
  await db.unsafe("set role authenticated");
}
async function rpc(db, query, args = []) {
  return (await db.unsafe(query, args))[0]?.result;
}
async function denied(label, action) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  assert.ok(error, label + " must be denied");
  assert.match(String(error.message), /permission denied/i, label + " must fail by table privilege");
}
async function createJob(db, key, f = filters) {
  return rpc(db, "select public.request_async_export_job('orders_csv',$1::jsonb,$2::text) as result", [JSON.stringify(f), key]);
}
async function cleanup() {
  await admin.unsafe("delete from public.async_export_jobs where idempotency_key like $1 or idempotency_key like $2", [prefix + "%", prefix + "FOREIGN-%"]).catch(() => {});
  await admin.unsafe("delete from public.audit_logs where action like 'async_export.%' and (actor_id in ($1,$2,$3) or entity_id in (select id from public.async_export_jobs where idempotency_key like $4))", [actor, foreignProfile, customerProfile, prefix + "%"]).catch(() => {});
  await admin.unsafe("delete from public.user_roles where profile_id in ($1,$2)", [foreignProfile, customerProfile]).catch(() => {});
  await admin.unsafe("delete from public.profiles where id in ($1,$2)", [foreignProfile, customerProfile]).catch(() => {});
  await admin.unsafe("delete from public.organizations where id=$1 and name='CI Async Export Foreign Tenant'", [foreignOrg]).catch(() => {});
}
async function main() {
  await cleanup();
  const base = await admin.unsafe(
    "select p.organization_id,p.is_active,exists(select 1 from public.user_roles r where r.profile_id=p.id and r.role='admin') as is_admin from public.profiles p where p.id=$1 and p.auth_user_id=$2",
    [actor, actorAuth],
  );
  assert.equal(base[0]?.organization_id, org, "fixture admin must belong to the target organization");
  assert.equal(base[0]?.is_active, true, "fixture admin must be active");
  assert.equal(base[0]?.is_admin, true, "fixture actor must have an admin role");

  await admin.unsafe(
    "insert into public.organizations(id,name) values($1,'CI Async Export Foreign Tenant') on conflict(id) do update set name=excluded.name",
    [foreignOrg],
  );
  await admin.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Async Export Foreign','ci-async-export-foreign@example.test',true) on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,is_active=true",
    [foreignProfile, foreignAuth, foreignOrg],
  );
  await admin.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'admin') on conflict(profile_id,role) do nothing",
    [foreignProfile],
  );
  await admin.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Async Export Customer','ci-async-export-customer@example.test',$3 is not null) on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,is_active=true",
    [customerProfile, customerAuth, org],
  );
  await admin.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'customer') on conflict(profile_id,role) do nothing",
    [customerProfile],
  );

  await identity(first, actorAuth, "ci-async-export-admin@aghbari.ye");
  await identity(foreign, foreignAuth, "ci-async-export-foreign@example.test");
  await identity(customer, customerAuth, "ci-async-export-customer@example.test");

  const created = await createJob(first, prefix + "PRIMARY");
  assert.ok(created?.job_id, "request RPC must return a job ID");
  assert.equal(created.status, "queued");
  assert.equal(created.already_requested, false);

  const duplicate = await createJob(first, prefix + "PRIMARY");
  assert.equal(duplicate.job_id, created.job_id, "repeated idempotency key returns the original job");
  assert.equal(duplicate.already_requested, true, "duplicate request is explicit");
  await assert.rejects(
    () => createJob(first, prefix + "PRIMARY", { date_from: "2026-09-01", date_to: "2026-09-20" }),
    /idempotency key reused with different export filters/,
  );
  await assert.rejects(
    () => createJob(first, prefix + "BAD-FILTER", { date_from: "2026-10-01", date_to: "2026-10-20", organization_id: foreignOrg }),
    /order export requires exactly date_from and date_to/,
  );
  await assert.rejects(
    () => createJob(customer, prefix + "CUSTOMER"),
    /admin, manager or accountant role required/,
  );

  const foreignCreated = await createJob(foreign, prefix + "FOREIGN-PRIMARY");
  assert.ok(foreignCreated?.job_id, "second tenant admin can create its own job");
  const firstList = await rpc(first, "select public.list_my_async_export_jobs(50) as result");
  assert.ok(firstList.some((row) => row.job_id === created.job_id), "actor can enumerate own job");
  assert.ok(!firstList.some((row) => row.job_id === foreignCreated.job_id), "tenant owner cannot enumerate foreign job");
  const foreignDownload = await rpc(first, "select public.get_my_async_export_download($1::uuid) as result", [foreignCreated.job_id]);
  assert.equal(foreignDownload, null, "download RPC must not disclose a foreign job");

  await denied("authenticated direct SELECT on async_export_jobs", () => first.unsafe("select id from public.async_export_jobs"));
  await denied("authenticated direct INSERT on async_export_jobs", () => first.unsafe(
    "insert into public.async_export_jobs(organization_id,requested_by,export_type,filters,idempotency_key,request_hash) values($1,$2,'orders_csv',$3::jsonb,$4,md5('x'))",
    [org, actor, JSON.stringify(filters), prefix + "DIRECT"],
  ));
  await denied("authenticated direct UPDATE on async_export_jobs", () => first.unsafe(
    "update public.async_export_jobs set status='ready' where id=$1", [created.job_id],
  ));

  const claimed = await admin.unsafe(
    "select id,organization_id,lease_owner,attempt_count from public.claim_async_export_jobs($1,1,300,$2::uuid)",
    ["ci-async-export-worker-primary", created.job_id],
  );
  assert.equal(claimed.length, 1, "trusted worker can atomically claim the requested job");
  assert.equal(claimed[0].attempt_count, 1);
  await assert.rejects(
    () => admin.unsafe(
      "select public.complete_async_export_job($1,$2,$3,'orders.csv','text/csv',100,$4,1)",
      [created.job_id, "wrong-worker", org + "/" + created.job_id + "/orders.csv", "a".repeat(64)],
    ),
    /async export worker lease mismatch/,
  );
  const complete = await rpc(admin,
    "select public.complete_async_export_job($1::uuid,$2::text,$3::text,'orders.csv','text/csv',100,$4::text,1) as result",
    [created.job_id, "ci-async-export-worker-primary", org + "/" + created.job_id + "/orders.csv", "a".repeat(64)],
  );
  assert.equal(complete.status, "ready");
  assert.equal(complete.row_count, 1);
  const ownDownload = await rpc(first, "select public.get_my_async_export_download($1::uuid) as result", [created.job_id]);
  assert.equal(ownDownload.artifact_path, org + "/" + created.job_id + "/orders.csv");

  await admin.unsafe("update public.async_export_jobs set expires_at=now()-interval '1 second' where id=$1", [created.job_id]);
  const expired = await admin.unsafe(
    "select job_id,object_path from public.sweep_expired_async_export_jobs(25) where job_id=$1",
    [created.job_id],
  );
  assert.equal(expired[0]?.object_path, org + "/" + created.job_id + "/orders.csv");
  const cleared = await rpc(admin,
    "select public.clear_expired_async_export_artifact($1::uuid,$2::text) as result",
    [created.job_id, expired[0].object_path],
  );
  assert.equal(cleared, true, "expiry cleanup clears storage path only after the trusted worker removes it");
  const afterExpiry = await rpc(first, "select public.get_my_async_export_download($1::uuid) as result", [created.job_id]);
  assert.equal(afterExpiry, null, "expired artifact is no longer downloadable");

  const cancelJob = await createJob(first, prefix + "CANCEL");
  const cancel = await rpc(first, "select public.cancel_my_async_export_job($1::uuid) as result", [cancelJob.job_id]);
  assert.equal(cancel.cancelled, true);
  assert.equal(cancel.status, "cancelled");

  const retryJob = await createJob(first, prefix + "RETRY");
  let worker = "ci-async-export-retry";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (attempt > 1) {
      await admin.unsafe("update public.async_export_jobs set next_attempt_at=now()-interval '1 second' where id=$1 and status='retry'", [retryJob.job_id]);
    }
    const lease = await admin.unsafe(
      "select id,attempt_count from public.claim_async_export_jobs($1,1,300,$2::uuid)",
      [worker, retryJob.job_id],
    );
    assert.equal(lease.length, 1, "retry worker can reclaim due export job at attempt " + attempt);
    assert.equal(lease[0].attempt_count, attempt);
    const failure = await rpc(admin,
      "select public.fail_async_export_job($1::uuid,$2::text,'SOURCE_READ_FAILED') as result",
      [retryJob.job_id, worker],
    );
    assert.equal(failure.status, attempt === 5 ? "failed" : "retry");
  }
  const finalRetry = await admin.unsafe("select status,attempt_count from public.async_export_jobs where id=$1", [retryJob.job_id]);
  assert.equal(finalRetry[0].status, "failed");
  assert.equal(finalRetry[0].attempt_count, 5);

  const auditRows = await admin.unsafe(
    "select action from public.audit_logs where organization_id=$1 and actor_id=$2 and entity_id=$3 and action in ('async_export.queued','async_export.ready') order by action",
    [org, actor, created.job_id],
  );
  assert.deepEqual(auditRows.map((r) => r.action).sort(), ["async_export.queued", "async_export.ready"]);
  console.log("PASS async export jobs: idempotency, filter allowlist, role/tenant isolation, RPC-only writes, worker lease ownership, retry cap, artifact expiry, one-time download authorization and audit");
}
main().finally(async () => {
  await cleanup();
  await Promise.all([admin.end(), first.end(), foreign.end(), customer.end()]);
}).catch((error) => {
  console.error("ASYNC_EXPORT_JOBS_FAILED:", error?.message ?? error);
  process.exitCode = 1;
});
