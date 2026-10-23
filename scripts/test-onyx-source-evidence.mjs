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
        [organizationId, matchedSnapshotId, rowNumber, canonicalKey, db.json(data)],
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

    // Exercise export provenance and idempotency against persisted order rows in this rollback-only DB fixture.
    await db.unsafe("reset role");
    const exportCustomer = uuid(), exportOrder = uuid(), productExact = uuid(), productDuplicate = uuid(), productMiss = uuid();
    const codeExact = "CI-SKU-" + suffix + "-3", codeDuplicate = "CI-SKU-" + suffix + "-4", codeMiss = "CI-NOT-FOUND-" + suffix;
    await db.unsafe(
      "insert into public.onyx_snapshot_rows(organization_id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors) " +
      "values($1::uuid,$2::uuid,22,$3::text,pg_catalog.md5($4::jsonb::text),'valid',$4::jsonb,'[]'::jsonb)",
      [organizationId,matchedSnapshotId,codeDuplicate,db.json({item_code:codeDuplicate,external_id:"DUPLICATE-EXT"})],
    );
    await db.unsafe(
      "insert into public.customers(id,organization_id,customer_code,business_name,tier,status) values($1::uuid,$2::uuid,$3::text,$4::text,'retail','approved')",
      [exportCustomer,organizationId,"CI-EXP-"+suffix,"CI export customer"],
    );
    await db.unsafe(
      "insert into public.products(id,organization_id,name,item_code,unit,base_price,cost_price,status) " +
      "values($1::uuid,$4::uuid,'Exact',$5::text,'piece',10,5,'active'),($2::uuid,$4::uuid,'Duplicate',$6::text,'piece',10,5,'active'),($3::uuid,$4::uuid,'Missing',$7::text,'piece',10,5,'active')",
      [productExact,productDuplicate,productMiss,organizationId,codeExact,codeDuplicate,codeMiss],
    );
    await db.unsafe(
      "insert into public.orders(id,organization_id,customer_id,order_number,status,total_amount,total_items,created_by) " +
      "values($1::uuid,$2::uuid,$3::uuid,$4::text,'confirmed',30,3,$5::uuid)",
      [exportOrder,organizationId,exportCustomer,"CI-ONYX-"+suffix,managerProfileId],
    );
    await db.unsafe(
      "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total) " +
      "values($1::uuid,$2::uuid,$3::text,'Exact','piece',1,10,10),($1::uuid,$4::uuid,$5::text,'Duplicate','piece',1,10,10),($1::uuid,$6::uuid,$7::text,'Missing','piece',1,10,10)",
      [exportOrder,productExact,codeExact,productDuplicate,codeDuplicate,productMiss,codeMiss],
    );

    await setIdentity(managerAuthId, "onyx-evidence-manager-" + suffix + "@example.test");
    const exportRequestKey = uuid();
    const exportRows = await db.unsafe(
      "select public.record_onyx_order_export($1::uuid,3,$2::uuid,$3::uuid) as audit_id",
      [exportOrder,matchedSnapshotId,exportRequestKey],
    );
    const exportAuditId = exportRows[0].audit_id;
    const auditRows = await db.unsafe("select organization_id,new_value from public.audit_logs where id=$1::uuid", [exportAuditId]);
    assert.equal(auditRows[0].organization_id,organizationId);
    const trace = asJson(auditRows[0].new_value).source_trace;
    assert.equal(trace.organization_id,organizationId);
    assert.equal(trace.snapshot.id,matchedSnapshotId);
    assert.equal(trace.snapshot.source_import_job_id,matchedJobId);
    assert.equal(trace.import_job.file_hash_matches_snapshot,true);
    assert.equal(trace.item_counts.matched,1);
    assert.equal(trace.item_counts.ambiguous,1);
    assert.equal(trace.item_counts.unmatched,1);
    assert.equal(trace.item_mappings.find((row)=>row.item_code===codeExact).external_ids.external_id,"EXT-CI-"+suffix+"-3");
    assert.equal(trace.item_mappings.find((row)=>row.item_code===codeDuplicate).source_mapping_status,"ambiguous");
    assert.deepEqual(trace.item_mappings.find((row)=>row.item_code===codeDuplicate).external_ids,{});
    assert.equal(trace.item_mappings.find((row)=>row.item_code===codeMiss).source_mapping_status,"unmatched");
    assert.equal(trace.live_sync_evidence.live_connection_proven,false);
    const replay = await db.unsafe(
      "select public.record_onyx_order_export($1::uuid,3,$2::uuid,$3::uuid) as audit_id",
      [exportOrder,matchedSnapshotId,exportRequestKey],
    );
    assert.equal(replay[0].audit_id,exportAuditId,"identical export retry returns the original audit row");
    await expectFailure("export request key cannot bind another source snapshot",()=>db.unsafe(
      "select public.record_onyx_order_export($1::uuid,3,null::uuid,$2::uuid)",[exportOrder,exportRequestKey]
    ),/already bound to a different order or source snapshot/i);
    const noSource = await db.unsafe(
      "select public.record_onyx_order_export($1::uuid,3,null::uuid,$2::uuid) as audit_id",[exportOrder,uuid()]
    );
    const noSourceRows = await db.unsafe("select new_value from public.audit_logs where id=$1::uuid",[noSource[0].audit_id]);
    const noSourceTrace = asJson(noSourceRows[0].new_value).source_trace;
    assert.equal(noSourceTrace.source_trace_status,"snapshot_not_selected");
    assert.equal(noSourceTrace.item_counts.snapshot_not_selected,3);
    assert.equal(asJson(noSourceRows[0].new_value).live_sync_triggered,false);

    // Successful provider evidence must be generated through the service-only attempt state machine.
    const access = await db.unsafe(
      "select has_function_privilege('authenticated','public.record_onyx_live_sync_attempt(text,text,uuid,uuid,uuid,uuid,text,integer,text,text,text,text)','EXECUTE') as user_exec,"+
      "has_function_privilege('service_role','public.record_onyx_live_sync_attempt(text,text,uuid,uuid,uuid,uuid,text,integer,text,text,text,text)','EXECUTE') as service_exec"
    );
    assert.equal(access[0].user_exec,false); assert.equal(access[0].service_exec,true);
    await db.unsafe("reset role");
    await db.unsafe("select set_config('request.jwt.claim.role','service_role',false)");
    await db.unsafe("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:"service_role"})]);
    await db.unsafe("set role service_role");
    const requestHash = "1".repeat(64);
    const responseHash = "2".repeat(64);
    const externalRequestId = "CI-ONYX-" + suffix;
    const start = await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,null::uuid,$5::text,null::integer,null::text,null::text,null::text,null::text) as id",
      ["inventory_pull","started",organizationId,matchedSnapshotId,requestHash]
    );
    const successfulId = start[0].id;

    await expectFailure(
      "Onyx finalization rejects a request fingerprint different from the stored attempt",
      () => db.unsafe(
        "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,$8::text,$9::text,null::text,null::text)",
        ["inventory_pull","succeeded",organizationId,matchedSnapshotId,successfulId,"f".repeat(64),200,externalRequestId,responseHash]
      ),
      /request fingerprint does not match the persisted attempt/i,
    );
    await expectFailure(
      "Onyx finalization rejects rebinding a snapshot that was already selected",
      () => db.unsafe(
        "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,$8::text,$9::text,null::text,null::text)",
        ["inventory_pull","succeeded",organizationId,mismatchSnapshotId,successfulId,requestHash,200,externalRequestId,responseHash]
      ),
      /snapshot is already bound to a different snapshot/i,
    );
    // Inspect the unchanged attempt through the authorized tenant-scoped evidence RPC.
    // The attempt table intentionally grants no direct SELECT privilege to service_role.
    await setIdentity(managerAuthId, "onyx-evidence-manager-" + suffix + "@example.test");
    const rejectedStateRows = await db.unsafe(
      "select public.get_onyx_live_sync_attempt_evidence($1::uuid) as payload",
      [matchedSnapshotId],
    );
    const rejectedAttemptState = asJson(rejectedStateRows[0].payload).last_sync_attempt;
    assert.equal(rejectedAttemptState.id,successfulId,"evidence RPC returns the same attempted sync record");
    assert.equal(rejectedAttemptState.status,"started","rejected finalization must leave the attempt started");
    assert.equal(rejectedAttemptState.request_sha256,requestHash,"a rejected request fingerprint must not replace stored provenance");
    assert.equal(rejectedAttemptState.snapshot_id,matchedSnapshotId,"a rejected snapshot reassignment must leave the selected snapshot unchanged");
    assert.equal(rejectedAttemptState.http_status,null,"a rejected finalization must not persist a provider status");
    assert.equal(rejectedAttemptState.response_sha256,null,"a rejected finalization must not persist a response fingerprint");
    await db.unsafe("reset role");
    await db.unsafe("select set_config('request.jwt.claim.role','service_role',false)");
    await db.unsafe("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:"service_role"})]);
    await db.unsafe("set role service_role");

    const finalized = await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,$8::text,$9::text,null::text,null::text) as id",
      ["inventory_pull","succeeded",organizationId,matchedSnapshotId,successfulId,requestHash,200,externalRequestId,responseHash]
    );
    assert.equal(finalized[0].id,successfulId,"the matching persisted request fingerprint must finalize the same attempt");
    const exactRetry = await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,$8::text,$9::text,null::text,null::text) as id",
      ["inventory_pull","succeeded",organizationId,matchedSnapshotId,successfulId,requestHash,200,externalRequestId,responseHash]
    );
    assert.equal(exactRetry[0].id,successfulId,"an identical finalization retry returns the original attempt");
    const retryWithoutOptionalExternalId = await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,null::text,$8::text,null::text,null::text) as id",
      ["inventory_pull","succeeded",organizationId,matchedSnapshotId,successfulId,requestHash,200,responseHash]
    );
    assert.equal(retryWithoutOptionalExternalId[0].id,successfulId,"omitting an optional provider request ID retains the recorded ID on retry");
    await expectFailure(
      "Onyx finalization rejects a changed result after the attempt was already finalized",
      () => db.unsafe(
        "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,$8::text,$9::text,null::text,null::text)",
        ["inventory_pull","succeeded",organizationId,matchedSnapshotId,successfulId,requestHash,200,externalRequestId,"9".repeat(64)]
      ),
      /already finalized with a different result/i,
    );
    await expectFailure(
      "Onyx finalization cannot reassign a snapshot after success",
      () => db.unsafe(
        "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,$8::text,$9::text,null::text,null::text)",
        ["inventory_pull","succeeded",organizationId,mismatchSnapshotId,successfulId,requestHash,200,externalRequestId,responseHash]
      ),
      /snapshot is already bound to a different snapshot/i,
    );

    // Inventory pulls may bind a produced snapshot once when no snapshot was selected at start.
    const lateBoundStart = await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,null::uuid,null::uuid,null::uuid,$4::text,null::integer,null::text,null::text,null::text,null::text) as id",
      ["inventory_pull","started",organizationId,"5".repeat(64)]
    );
    const lateBoundId = lateBoundStart[0].id;
    await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,$8::text,$9::text,null::text,null::text)",
      ["inventory_pull","succeeded",organizationId,matchedSnapshotId,lateBoundId,"5".repeat(64),200,"CI-ONYX-LATE-"+suffix,"6".repeat(64)]
    );
    const lateBoundRow = await db.unsafe(
      "select status,snapshot_id from public.onyx_live_sync_attempts where id=$1::uuid",
      [lateBoundId],
    );
    assert.equal(lateBoundRow[0].status,"succeeded");
    assert.equal(lateBoundRow[0].snapshot_id,matchedSnapshotId,"an inventory-pull result may bind the produced snapshot exactly once");
    const failStart = await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,null::uuid,$5::text,null::integer,null::text,null::text,null::text,null::text) as id",
      ["inventory_pull","started",organizationId,matchedSnapshotId,"3".repeat(64)]
    );
    await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,$4::uuid,null::uuid,$5::uuid,$6::text,$7::integer,$8::text,null::text,$9::text,$10::text)",
      ["inventory_pull","failed",organizationId,matchedSnapshotId,failStart[0].id,"3".repeat(64),504,"CI-FAILED-"+suffix,"REMOTE_TIMEOUT","Provider timeout"]
    );
    // A later attempt with no selected snapshot must not appear as if it belonged to the saved snapshot.
    const unlinkedStart = await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,null::uuid,null::uuid,null::uuid,$4::text,null::integer,null::text,null::text,null::text,null::text) as id",
      ["inventory_pull","started",organizationId,"4".repeat(64)]
    );
    await db.unsafe(
      "select public.record_onyx_live_sync_attempt($1::text,$2::text,$3::uuid,null::uuid,null::uuid,$4::uuid,$5::text,$6::integer,$7::text,null::text,$8::text,$9::text)",
      ["inventory_pull","failed",organizationId,unlinkedStart[0].id,"4".repeat(64),504,"CI-UNLINKED-"+suffix,"UNLINKED_TIMEOUT","No snapshot selected"]
    );
    await setIdentity(managerAuthId, "onyx-evidence-manager-" + suffix + "@example.test");
    const syncRows = await db.unsafe("select public.get_onyx_live_sync_attempt_evidence($1::uuid) as payload",[matchedSnapshotId]);
    const sync = asJson(syncRows[0].payload);
    assert.equal(sync.last_sync_attempt.status,"failed");
    assert.equal(sync.last_sync_attempt.error_code,"REMOTE_TIMEOUT");
    assert.equal(sync.last_sync_attempt.snapshot_id,matchedSnapshotId,"the last attempt shown for a snapshot must actually be linked to that snapshot");
    assert.equal(sync.live_connection_proven,true,"the latest failure cannot erase a previous successful response");
    assert.equal(sync.latest_successful_connection.id,successfulId);
    assert.equal(sync.snapshot_sync_proven,true);
    assert.equal(sync.snapshot_sync_success.id,successfulId);

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
