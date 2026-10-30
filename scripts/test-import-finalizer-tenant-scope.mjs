import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required; run this after npm run test:db on PostgreSQL 17.");

const organizationId = "a0000000-0000-0000-0000-000000000001";
const staffProfileId = "f0000000-0000-0000-0000-000000000001";
const staffAuthUserId = "33333333-3333-4333-8333-333333333333";
const staffEmail = "admin@aghbari.ye";
const foreignOrganizationId = randomUUID();
const foreignProfileId = randomUUID();
const foreignAuthUserId = randomUUID();
const foreignEmail = "ci-finalizer-foreign-" + foreignProfileId + "@example.test";
const sameTenantCustomerProfileId = randomUUID();
const sameTenantCustomerAuthUserId = randomUUID();
const sameTenantCustomerEmail = "ci-finalizer-same-tenant-customer-" + sameTenantCustomerProfileId + "@example.test";
const staffSessionId = randomUUID();
const foreignSessionId = randomUUID();
const sameTenantCustomerSessionId = randomUUID();
const requestKey = randomUUID();
const fileName = "ci-finalizer-" + randomUUID() + ".csv";
const fileHash = createHash("sha256").update(randomUUID()).digest("hex");
const admin = postgres(connectionString, { max: 1, prepare: false });
const staff = postgres(connectionString, { max: 1, prepare: false });
const foreign = postgres(connectionString, { max: 1, prepare: false });
const sameTenantCustomer = postgres(connectionString, { max: 1, prepare: false });
let jobId = null;

async function setIdentity(db, authUserId, email, sessionId, assumeAuthenticatedRole = true) {
  await db.unsafe("reset role").catch(() => {});
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1::uuid,$2::uuid,now(),now(),now(),null,'CI import finalizer scope','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, authUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, role: "authenticated", session_id: sessionId }),
  ]);
  if (assumeAuthenticatedRole) await db.unsafe("set role authenticated");
}

async function cleanup() {
  if (jobId) {
    await admin.unsafe(
      "delete from public.onyx_snapshot_rows where snapshot_id in " +
        "(select id from public.onyx_snapshots where source_import_job_id=$1::uuid)",
      [jobId],
    ).catch(() => {});
    await admin.unsafe("delete from public.onyx_snapshots where source_import_job_id=$1::uuid", [jobId]).catch(() => {});
    await admin.unsafe("delete from public.import_job_rows where import_job_id=$1::uuid", [jobId]).catch(() => {});
    await admin.unsafe("delete from public.import_job_request_keys where import_job_id=$1::uuid or request_key=$2::uuid", [jobId, requestKey]).catch(() => {});
    await admin.unsafe("delete from public.audit_logs where entity_id=$1::uuid", [jobId]).catch(() => {});
    await admin.unsafe("delete from public.import_jobs where id=$1::uuid", [jobId]).catch(() => {});
  }
  await admin.unsafe("delete from auth.sessions where id=any($1::uuid[])", [[staffSessionId, foreignSessionId, sameTenantCustomerSessionId]]).catch(() => {});
  await admin.unsafe("delete from public.user_roles where profile_id=any($1::uuid[])", [[foreignProfileId, sameTenantCustomerProfileId]]).catch(() => {});
  await admin.unsafe("delete from public.profiles where id=any($1::uuid[])", [[foreignProfileId, sameTenantCustomerProfileId]]).catch(() => {});
  await admin.unsafe("delete from public.organizations where id=$1::uuid and name='CI Import Finalizer Foreign Tenant'", [foreignOrganizationId]).catch(() => {});
}

async function main() {
  const effectiveFunction = await admin.unsafe(
    "select pg_catalog.pg_get_functiondef('public.finalize_import_job(uuid)'::regprocedure) as definition",
  );
  const definition = effectiveFunction[0]?.definition ?? "";
  assert.match(
    definition,
    /SELECT\s+public\.finalize_import_job\s*\(\s*p_job_id\s*,\s*'new_version'(?:\s*::\s*text)?\s*\)/i,
    "the one-argument overload must delegate to the strict tenant-scoped overload with explicit intent",
  );
  assert.doesNotMatch(definition, /FOR\s+UPDATE/i,
    "the compatibility overload must not lock an arbitrary import job by ID before the tenant guard");

  await admin.unsafe(
    "insert into public.organizations(id,name) values($1::uuid,'CI Import Finalizer Foreign Tenant') " +
      "on conflict(id) do update set name=excluded.name",
    [foreignOrganizationId],
  );
  await admin.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1::uuid,$2::uuid,$3::uuid,'CI Import Finalizer Foreign Admin',$4,true) " +
      "on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,is_active=true,email=excluded.email",
    [foreignProfileId, foreignAuthUserId, foreignOrganizationId, foreignEmail],
  );
  await admin.unsafe(
    "insert into public.user_roles(profile_id,role) values($1::uuid,'admin') on conflict(profile_id,role) do nothing",
    [foreignProfileId],
  );
  await admin.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1::uuid,$2::uuid,$3::uuid,'CI Import Finalizer Same-Tenant Customer',$4,true) " +
      "on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,is_active=true,email=excluded.email",
    [sameTenantCustomerProfileId, sameTenantCustomerAuthUserId, organizationId, sameTenantCustomerEmail],
  );
  const sameTenantCustomerRoles = await admin.unsafe(
    "select role from public.user_roles where profile_id=$1::uuid order by role",
    [sameTenantCustomerProfileId],
  );
  assert.equal(sameTenantCustomerRoles.length, 0,
    "same-tenant customer fixture must have no staff/finance role assignments");

  const owner = await admin.unsafe(
    "select p.id,p.organization_id,p.is_active,exists(select 1 from public.user_roles r where r.profile_id=p.id and r.role='admin') as is_admin " +
      "from public.profiles p where p.id=$1::uuid and p.auth_user_id=$2::uuid",
    [staffProfileId, staffAuthUserId],
  );
  assert.equal(owner.length, 1, "CI must provide the active source-tenant admin fixture");
  assert.equal(owner[0].organization_id, organizationId);
  assert.equal(owner[0].is_active, true);
  assert.equal(owner[0].is_admin, true);

  // Keep the foreign caller on the authenticated role for the security assertion.
  await setIdentity(foreign, foreignAuthUserId, foreignEmail, foreignSessionId);
  // Fixture creation uses the privileged test connection with the source tenant's JWT/profile.
  // The legacy nine-argument create_import_job_idempotent grant is intentionally revoked by the
  // source-aware import migration; this test must remain valid after #179 is integrated.
  await setIdentity(admin, staffAuthUserId, staffEmail, staffSessionId, false);
  const createdRows = await admin.unsafe(
    "select public.create_import_job_idempotent($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::uuid,$7::text,$8::text,$9::text) as result",
    [requestKey, fileName, fileHash, 512, "unified_import", null, "ci-finalizer-2026-10", "ci-finalizer-scope", "new_version"],
  );
  const created = createdRows[0]?.result;
  assert.ok(created?.id, "source tenant must create a persisted import job");
  jobId = created.id;
  assert.equal(created.organization_id, organizationId);

  // Seed server-owned processing metadata, then attempt to overwrite it through the
  // authenticated failure RPC. The RPC may save diagnostic code/message only.
  const preservedSummary = {
    processing_config_fingerprint: "a".repeat(64),
    source_file_hash: fileHash,
    period_key: "ci-finalizer-2026-10",
    source_system: "ci-finalizer-scope",
    external_source_reference: null,
    is_full_dataset: false,
    profile_id: null,
    profile_version: null,
    parser: "ci-finalizer-test",
    processing_chunk_rows: 1000,
    upload_chunk_bytes: 4194304,
  };
  await admin.unsafe(
    "update public.import_jobs set error_summary=$2::jsonb where id=$1::uuid and organization_id=$3::uuid",
    [jobId, admin.json(preservedSummary), organizationId],
  );

  await setIdentity(staff, staffAuthUserId, staffEmail, staffSessionId);
  const failureRows = await staff.unsafe(
    "select public.fail_import_job_safely($1::uuid,$2::jsonb) as result",
    [jobId, staff.json({
      code: "IMPORT_PROCESSING_FAILED",
      message: "CI malicious failure-summary metadata test",
      resumable: false,
      no_raw_file_retained: false,
      processing_config_fingerprint: "b".repeat(64),
      source_file_hash: "f".repeat(64),
      period_key: "forged-period",
      source_system: "forged-source",
      external_source_reference: "forged-external-reference",
      is_full_dataset: true,
      profile_id: foreignProfileId,
      profile_version: 999,
      parser: "forged-parser",
      processing_chunk_rows: 1,
      upload_chunk_bytes: 1,
    })],
  );
  await staff.unsafe("reset role");
  const failureResult = failureRows[0]?.result;
  assert.equal(failureResult?.status, "failed", "failure reconciliation must still mark a nonterminal job failed");
  assert.equal(failureResult?.terminal, false);

  const preservedRows = await admin.unsafe(
    "select status,error_summary from public.import_jobs where id=$1::uuid and organization_id=$2::uuid",
    [jobId, organizationId],
  );
  assert.equal(preservedRows.length, 1);
  assert.equal(preservedRows[0].status, "failed");
  const savedSummary = preservedRows[0].error_summary;
  assert.equal(savedSummary.processing_config_fingerprint, preservedSummary.processing_config_fingerprint,
    "client failure payload cannot overwrite the verified processing fingerprint");
  assert.equal(savedSummary.source_file_hash, fileHash,
    "client failure payload cannot overwrite the source file identity");
  assert.equal(savedSummary.period_key, preservedSummary.period_key,
    "client failure payload cannot change the import period");
  assert.equal(savedSummary.source_system, preservedSummary.source_system,
    "client failure payload cannot change the source system");
  assert.equal(savedSummary.external_source_reference, null,
    "client failure payload cannot inject an external source identity");
  assert.equal(savedSummary.is_full_dataset, false,
    "client failure payload cannot claim an incremental file is a complete dataset");
  assert.equal(savedSummary.profile_id, null);
  assert.equal(savedSummary.profile_version, null);
  assert.equal(savedSummary.parser, "ci-finalizer-test");
  assert.equal(savedSummary.processing_chunk_rows, 1000);
  assert.equal(savedSummary.upload_chunk_bytes, 4194304);
  assert.equal(savedSummary.code, "IMPORT_PROCESSING_FAILED");
  assert.equal(savedSummary.message, "CI malicious failure-summary metadata test",
    "bounded failure diagnostics are still persisted");
  assert.equal(savedSummary.resumable, true, "server controls resumability");
  assert.equal(savedSummary.no_raw_file_retained, true, "server controls raw-file retention disclosure");
  process.stdout.write("PASS import failure metadata integrity: client failure payload cannot overwrite server-owned processing fingerprint, source identity, profile, period, or full-dataset metadata\\n");

  const initial = await admin.unsafe(
    "select id,organization_id,created_by,status from public.import_jobs where id=$1::uuid",
    [jobId],
  );
  assert.equal(initial.length, 1);
  assert.equal(initial[0].organization_id, organizationId);
  const initialSnapshotCount = await admin.unsafe(
    "select count(*)::integer as count from public.onyx_snapshots where source_import_job_id=$1::uuid",
    [jobId],
  );

  const initialImportRowCount = await admin.unsafe(
    "select count(*)::integer as count from public.import_job_rows where import_job_id=$1::uuid",
    [jobId],
  );
  const initialAuditCount = await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where entity_id=$1::uuid",
    [jobId],
  );

  // Compare complete server-owned state, not only row counts. This oracle covers the job,
  // staging rows, idempotency claim, upload session/chunks, snapshots/snapshot rows, and audit.
  const captureFinalizerState = async () => {
    const rows = await admin.unsafe(
      "select jsonb_build_object(" +
        "'job',(select to_jsonb(j) from public.import_jobs j where j.id=$1::uuid and j.organization_id=$2::uuid)," +
        "'rows',coalesce((select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.import_job_rows r where r.import_job_id=$1::uuid),'[]'::jsonb)," +
        "'request_keys',coalesce((select jsonb_agg(to_jsonb(k) order by to_jsonb(k)::text) from public.import_job_request_keys k where k.organization_id=$2::uuid and (k.import_job_id=$1::uuid or k.request_key=$3::uuid)),'[]'::jsonb)," +
        "'upload_sessions',coalesce((select jsonb_agg(to_jsonb(u) order by to_jsonb(u)::text) from public.import_upload_sessions u where u.organization_id=$2::uuid and u.import_job_id=$1::uuid),'[]'::jsonb)," +
        "'upload_chunks',coalesce((select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.import_upload_chunks c where c.organization_id=$2::uuid and c.session_id in (select u.id from public.import_upload_sessions u where u.organization_id=$2::uuid and u.import_job_id=$1::uuid)),'[]'::jsonb)," +
        "'snapshots',coalesce((select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.onyx_snapshots x where x.organization_id=$2::uuid and x.source_import_job_id=$1::uuid),'[]'::jsonb)," +
        "'snapshot_rows',coalesce((select jsonb_agg(to_jsonb(sr) order by to_jsonb(sr)::text) from public.onyx_snapshot_rows sr where sr.snapshot_id in (select x.id from public.onyx_snapshots x where x.organization_id=$2::uuid and x.source_import_job_id=$1::uuid)),'[]'::jsonb)," +
        "'audit',coalesce((select jsonb_agg(to_jsonb(a) order by to_jsonb(a)::text) from public.audit_logs a where a.organization_id=$2::uuid and (a.entity_id=$1::uuid or a.entity_id in (select x.id from public.onyx_snapshots x where x.organization_id=$2::uuid and x.source_import_job_id=$1::uuid))),'[]'::jsonb)" +
      ")::text as snapshot",
      [jobId, organizationId, requestKey],
    );
    assert.equal(rows.length, 1, "privileged import state oracle must return exactly one snapshot");
    return rows[0].snapshot;
  };

  const foreignTenantSnapshotBefore = await captureFinalizerState();
  await assert.rejects(
    () => foreign.unsafe("select public.finalize_import_job($1::uuid) as result", [jobId]),
    (error) =>
      error?.code === "P0002" &&
      /دفعة الاستيراد غير موجودة/.test(String(error.message)),
    "foreign-tenant finalization must return the scoped not-found contract rather than expose or mutate the job",
  );

  const after = await admin.unsafe(
    "select id,organization_id,created_by,status from public.import_jobs where id=$1::uuid",
    [jobId],
  );
  assert.equal(after.length, 1);
  assert.equal(after[0].organization_id, initial[0].organization_id);
  assert.equal(after[0].created_by, initial[0].created_by);
  assert.equal(after[0].status, initial[0].status,
    "a rejected foreign-tenant request cannot change the import job state");
  const afterSnapshotCount = await admin.unsafe(
    "select count(*)::integer as count from public.onyx_snapshots where source_import_job_id=$1::uuid",
    [jobId],
  );
  assert.equal(afterSnapshotCount[0].count, initialSnapshotCount[0].count,
    "a rejected foreign-tenant request cannot create an Onyx snapshot");

  const afterImportRowCount = await admin.unsafe(
    "select count(*)::integer as count from public.import_job_rows where import_job_id=$1::uuid",
    [jobId],
  );
  assert.equal(afterImportRowCount[0].count, initialImportRowCount[0].count,
    "a rejected foreign-tenant request cannot insert, change or remove staged import rows");
  const afterAuditCount = await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where entity_id=$1::uuid",
    [jobId],
  );
  assert.equal(afterAuditCount[0].count, initialAuditCount[0].count,
    "a rejected foreign-tenant request cannot create or remove audit records for the job");
  const foreignTenantSnapshotAfter = await captureFinalizerState();
  assert.equal(
    foreignTenantSnapshotAfter,
    foreignTenantSnapshotBefore,
    "foreign-tenant denial must preserve the complete import/upload/staging/snapshot/audit state byte-for-byte",
  );

  // Same-tenant customers must not gain importer privileges merely from organization membership.
  await setIdentity(sameTenantCustomer, sameTenantCustomerAuthUserId, sameTenantCustomerEmail, sameTenantCustomerSessionId);
  const sameTenantIdentity = await sameTenantCustomer.unsafe(
    "select public.current_profile_id()::text as profile_id",
  );
  assert.equal(sameTenantIdentity.length, 1);
  assert.equal(sameTenantIdentity[0].profile_id, sameTenantCustomerProfileId,
    "same-tenant non-staff JWT must resolve to its own active profile");
  const sameTenantSnapshotBefore = await captureFinalizerState();
  await assert.rejects(
    () => sameTenantCustomer.unsafe("select public.finalize_import_job($1::uuid) as result", [jobId]),
    (error) =>
      error?.code === "42501" &&
      /غير مصرح بإنهاء الاستيراد/.test(String(error.message)),
    "same-tenant customer must receive SQLSTATE 42501 before finalizer data lookup or mutation",
  );
  const sameTenantSnapshotAfter = await captureFinalizerState();
  assert.equal(
    sameTenantSnapshotAfter,
    sameTenantSnapshotBefore,
    "same-tenant non-staff denial must preserve the complete import/upload/staging/snapshot/audit state byte-for-byte",
  );

  console.log("PASS import finalizer semantic authorization: foreign tenant gets opaque not-found; same-tenant customer gets 42501; complete import/upload/staging/snapshot/audit snapshots remain byte-for-byte unchanged");
}

main().catch((error) => {
  console.error("IMPORT_FINALIZER_TENANT_SCOPE_FAILED:", error?.message ?? error);
  process.exitCode = 1;
}).finally(async () => {
  await cleanup();
  await Promise.all([admin.end(), staff.end(), foreign.end(), sameTenantCustomer.end()]);
});
