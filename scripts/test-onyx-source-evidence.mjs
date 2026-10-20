import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for Onyx source-evidence database acceptance.");
}
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const uuid = () => randomUUID();
const suffix = uuid().replaceAll("-", "").slice(0, 12);

function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function setIdentity(userId, email) {
  await db.unsafe("reset role");
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: userId,
      email,
      role: "authenticated",
      email_confirmed_at: new Date().toISOString(),
    }),
  ]);
  await db.unsafe("set role authenticated");
}

async function readEvidence(snapshotId) {
  const rows = await db.unsafe(
    "select public.get_onyx_snapshot_source_evidence($1::uuid) as payload",
    [snapshotId],
  );
  return asJson(rows[0].payload);
}

async function expectFailure(label, action, pattern) {
  const savepoint = "onyx_evidence_failure_" + suffix;
  await db.unsafe("savepoint " + savepoint);
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  if (!caught) {
    await db.unsafe("release savepoint " + savepoint);
    assert.fail(label + " should fail");
  }
  await db.unsafe("rollback to savepoint " + savepoint);
  await db.unsafe("release savepoint " + savepoint);
  if (pattern) {
    assert.match(String(caught.message), pattern, label + " failed with an unexpected reason");
  }
}

async function insertSnapshot({
  id,
  organizationId,
  importJobId = null,
  fileHash,
  fileName,
  rowCount = 0,
  createdBy,
}) {
  await db.unsafe(
    "insert into public.onyx_snapshots " +
      "(id,organization_id,source_import_job_id,source_file_hash,source_file_name,report_type,row_count," +
      "data_quality_score,metrics,status,created_by) " +
      "values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,'inventory_stock',$6::integer,100,'{}'::jsonb,'ready',$7::uuid)",
    [id, organizationId, importJobId, fileHash, fileName, rowCount, createdBy],
  );
}

async function insertImportJob({ id, organizationId, fileHash, createdBy, name }) {
  await db.unsafe(
    "insert into public.import_jobs " +
      "(id,organization_id,job_type,source_system,file_name,file_hash,status,total_rows,created_by) " +
      "values($1::uuid,$2::uuid,'inventory','manual',$3::text,$4::text,'completed',0,$5::uuid)",
    [id, organizationId, name, fileHash, createdBy],
  );
}

async function main() {
  const organizationId = uuid();
  const foreignOrganizationId = uuid();
  const managerProfileId = uuid();
  const managerAuthId = uuid();
  const foreignManagerProfileId = uuid();
  const foreignManagerAuthId = uuid();
  const customerProfileId = uuid();
  const customerAuthId = uuid();
  const inactiveProfileId = uuid();
  const inactiveAuthId = uuid();

  const matchedJobId = uuid();
  const matchedSnapshotId = uuid();
  const mismatchJobId = uuid();
  const mismatchSnapshotId = uuid();
  const snapshotWithoutJobId = uuid();
  const missingSnapshotId = uuid();
  const validHash = "a".repeat(64);
  const changedJobHash = "b".repeat(64);
  const mismatchSnapshotHash = "c".repeat(64);
  const orgName = "CI Onyx evidence " + suffix;

  await db.unsafe("begin");
  try {
    await db.unsafe(
      "insert into public.organizations(id,name,currency,is_active) values($1::uuid,$2::text,'YER',true)",
      [organizationId, orgName],
    );
    await db.unsafe(
      "insert into public.organizations(id,name,currency,is_active) values($1::uuid,$2::text,'YER',true)",
      [foreignOrganizationId, orgName + " foreign"],
    );

    const profiles = [
      [managerProfileId, managerAuthId, organizationId, "CI Onyx evidence manager", "onyx-evidence-manager-" + suffix + "@example.test", true],
      [foreignManagerProfileId, foreignManagerAuthId, foreignOrganizationId, "CI foreign Onyx manager", "onyx-evidence-foreign-" + suffix + "@example.test", true],
      [customerProfileId, customerAuthId, organizationId, "CI non-staff account", "onyx-evidence-customer-" + suffix + "@example.test", true],
      [inactiveProfileId, inactiveAuthId, organizationId, "CI inactive Onyx manager", "onyx-evidence-inactive-" + suffix + "@example.test", false],
    ];
    for (const [profileId, authId, orgId, fullName, email, active] of profiles) {
      await db.unsafe(
        "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
          "values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::boolean)",
        [profileId, authId, orgId, fullName, email, active],
      );
    }
    await db.unsafe(
      "insert into public.user_roles(profile_id,role) values($1::uuid,'manager'),($2::uuid,'manager'),($3::uuid,'manager')",
      [managerProfileId, foreignManagerProfileId, inactiveProfileId],
    );

    await insertImportJob({
      id: matchedJobId,
      organizationId,
      fileHash: validHash,
      createdBy: managerProfileId,
      name: "onyx-evidence-matched-" + suffix + ".csv",
    });
    await insertSnapshot({
      id: matchedSnapshotId,
      organizationId,
      importJobId: matchedJobId,
      fileHash: validHash,
      fileName: "onyx-evidence-matched-" + suffix + ".csv",
      rowCount: 21,
      createdBy: managerProfileId,
    });

    for (let rowNumber = 1; rowNumber <= 21; rowNumber += 1) {
      const canonicalKey = rowNumber === 1
        ? "CI-KEY-" + "K".repeat(300)
        : "CI-SKU-" + suffix + "-" + rowNumber;
      let data;
      if (rowNumber === 1) {
        data = { item_code: canonicalKey, external_id: "E".repeat(300) };
      } else if (rowNumber === 2) {
        data = { item_code: canonicalKey, onyx_code: "ONYX-CI-" + suffix };
      } else {
        data = { item_code: canonicalKey, external_id: "EXT-CI-" + suffix + "-" + rowNumber };
      }
      await db.unsafe(
        "insert into public.onyx_snapshot_rows " +
          "(organization_id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors) " +
          "values($1::uuid,$2::uuid,$3::integer,$4::text,pg_catalog.md5($5::jsonb::text)," +
          "'valid',$5::jsonb,'[]'::jsonb)",
        [organizationId, matchedSnapshotId, rowNumber, canonicalKey, JSON.stringify(data)],
      );
    }

    await insertImportJob({
      id: mismatchJobId,
      organizationId,
      fileHash: changedJobHash,
      createdBy: managerProfileId,
      name: "onyx-evidence-mismatch-" + suffix + ".csv",
    });
    await insertSnapshot({
      id: mismatchSnapshotId,
      organizationId,
      importJobId: mismatchJobId,
      fileHash: mismatchSnapshotHash,
      fileName: "onyx-evidence-mismatch-" + suffix + ".csv",
      createdBy: managerProfileId,
    });

    await expectFailure(
      "schema rejects a snapshot without its required import-job link",
      () => insertSnapshot({
        id: snapshotWithoutJobId,
        organizationId,
        fileHash: validHash,
        fileName: "onyx-evidence-unlinked-" + suffix + ".csv",
        createdBy: managerProfileId,
      }),
      /null value in column "source_import_job_id"/i,
    );

    const privileges = await db.unsafe(
      "select " +
        "has_function_privilege('authenticated','public.get_onyx_snapshot_source_evidence(uuid)','EXECUTE') as authenticated_execute, " +
        "has_function_privilege('anon','public.get_onyx_snapshot_source_evidence(uuid)','EXECUTE') as anonymous_execute",
    );
    assert.equal(privileges[0].authenticated_execute, true, "authenticated staff must be able to call the server evidence RPC");
    assert.equal(privileges[0].anonymous_execute, false, "anonymous users must not be able to call the server evidence RPC");

    const ownerRows = await db.unsafe(
      "select count(*)::integer as count from public.onyx_snapshot_rows where snapshot_id=$1::uuid and organization_id=$2::uuid",
      [matchedSnapshotId, organizationId],
    );
    assert.equal(ownerRows[0].count, 21, "CI fixture must persist all 21 source rows before calling the evidence RPC");
    const ownerExternalIdRows = await db.unsafe(
      "select count(*)::integer as count from public.onyx_snapshot_rows r " +
        "where r.snapshot_id=$1::uuid and r.organization_id=$2::uuid and (" +
        "nullif(pg_catalog.btrim(coalesce(r.data->>'external_id','')),'') is not null or " +
        "nullif(pg_catalog.btrim(coalesce(r.data->>'externalId','')),'') is not null or " +
        "nullif(pg_catalog.btrim(coalesce(r.data->>'source_id','')),'') is not null or " +
        "nullif(pg_catalog.btrim(coalesce(r.data->>'sourceId','')),'') is not null or " +
        "nullif(pg_catalog.btrim(coalesce(r.data->>'onyx_id','')),'') is not null or " +
        "nullif(pg_catalog.btrim(coalesce(r.data->>'onyx_code','')),'') is not null or " +
        "nullif(pg_catalog.btrim(coalesce(r.data->>'external_code','')),'') is not null)",
      [matchedSnapshotId, organizationId],
    );
    const ownerExternalIdSample = await db.unsafe(
      "select row_number,data from public.onyx_snapshot_rows where snapshot_id=$1::uuid and organization_id=$2::uuid order by row_number limit 3",
      [matchedSnapshotId, organizationId],
    );
    assert.equal(
      ownerExternalIdRows[0].count,
      21,
      "CI fixture must persist top-level external-ID JSONB fields; sample=" + JSON.stringify(ownerExternalIdSample),
    );

    await setIdentity(managerAuthId, "onyx-evidence-manager-" + suffix + "@example.test");
    const visibleRows = await db.unsafe(
      "select count(*)::integer as count from public.onyx_snapshot_rows where snapshot_id=$1::uuid and organization_id=$2::uuid",
      [matchedSnapshotId, organizationId],
    );
    assert.equal(visibleRows[0].count, 21, "authorized staff RLS must expose same-tenant snapshot rows");
    const matched = await readEvidence(matchedSnapshotId);
    assert.deepEqual(matched.organization, { id: organizationId, name: orgName });
    assert.equal(matched.snapshot.id, matchedSnapshotId);
    assert.equal(matched.snapshot.row_count, 21);
    assert.equal(matched.import_job.id, matchedJobId);
    assert.equal(matched.import_job.file_hash, validHash);
    assert.equal(matched.import_job.file_hash_matches_snapshot, true);
    assert.equal(matched.import_job.updated_at, null, "no updated_at timestamp may be invented for import_jobs");
    assert.equal(matched.source_identity.provenance_status, "linked_import_job_hash_match");
    assert.equal(matched.source_identity.source_record_id, null, "an import job UUID is not an external source-record ID");
    assert.equal(matched.source_identity.source_row_count, 21);
    assert.equal(matched.source_identity.rows_with_external_id, 21);
    assert.deepEqual(matched.source_identity.external_id_fields_found, ["external_id", "onyx_code"]);
    assert.equal(matched.source_identity.external_id_examples.length, 20, "source ID samples must remain bounded");
    assert.equal(matched.source_identity.external_id_examples_truncated, true, "the response must disclose omitted samples");
    assert.equal(matched.source_identity.external_id_examples[0].canonical_key_truncated, true);
    assert.equal(matched.source_identity.external_id_examples[0].value_truncated, true);
    assert.equal(matched.source_identity.external_id_examples[0].external_ids.external_id.length, 256);
    assert.deepEqual(matched.live_sync_evidence.status, "not_proven");
    assert.equal(matched.live_sync_evidence.live_connection_proven, false);
    assert.match(matched.live_sync_evidence.message, /not evidence of a live Onyx API connection/i);

    const mismatch = await readEvidence(mismatchSnapshotId);
    assert.equal(mismatch.import_job.file_hash_matches_snapshot, false);
    assert.equal(mismatch.source_identity.provenance_status, "linked_hash_mismatch");

    await expectFailure(
      "manager cannot read a snapshot from another organization",
      () => readEvidence(missingSnapshotId),
      /ready Onyx snapshot is unavailable in the current organization/i,
    );

    await setIdentity(foreignManagerAuthId, "onyx-evidence-foreign-" + suffix + "@example.test");
    await expectFailure(
      "foreign-organization staff cannot read another organization's snapshot",
      () => readEvidence(matchedSnapshotId),
      /ready Onyx snapshot is unavailable in the current organization/i,
    );

    await setIdentity(customerAuthId, "onyx-evidence-customer-" + suffix + "@example.test");
    await expectFailure(
      "non-staff customer account cannot read source-evidence RPC",
      () => readEvidence(matchedSnapshotId),
      /active staff organization required to read Onyx source evidence/i,
    );

    await setIdentity(inactiveAuthId, "onyx-evidence-inactive-" + suffix + "@example.test");
    await expectFailure(
      "inactive staff cannot read source-evidence RPC",
      () => readEvidence(matchedSnapshotId),
      /active staff organization required to read Onyx source evidence/i,
    );

    process.stdout.write(
      "PASS Onyx source evidence: tenant-scoped RPC/grants, source hash match and mismatch, unlinked snapshots, bounded external IDs, truncation flags, no invented sync proof, staff/customer/inactive/foreign-tenant denial.\n",
    );
  } finally {
    try { await db.unsafe("reset role"); } catch {}
    try { await db.unsafe("rollback"); } catch {}
    try { await db.unsafe("select set_config('request.jwt.claim.sub','',false)"); } catch {}
    try { await db.unsafe("select set_config('request.jwt.claims','',false)"); } catch {}
  }
}

try {
  await main();
} catch (cause) {
  const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
  process.stderr.write(
    "ONYX_SOURCE_EVIDENCE_ACCEPTANCE_FAILED " +
      JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        where: error.where,
        constraint: error.constraint,
      }) +
      "\n",
  );
  throw cause;
} finally {
  await db.end({ timeout: 5 });
}
