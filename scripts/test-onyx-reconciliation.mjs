import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { logError } from "./diagnostic-logger.mjs";
import { runCriticalCleanup } from "./critical-cleanup.mjs";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for Onyx reconciliation database acceptance.");
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const id = (prefix) => prefix + "-0000-4000-8000-" + suffix;
const organizationId = randomUUID();
const foreignOrganizationId = randomUUID();
const managerProfileId = randomUUID();
const managerAuthId = randomUUID();
const staffProfileId = randomUUID();
const staffAuthId = randomUUID();
const warehouseId = randomUUID();
const foreignWarehouseId = randomUUID();
const productOneId = id("10000000");
const productTwoId = id("20000000");
const itemOne = "ONYX-A-" + suffix;
const itemTwo = "ONYX-B-" + suffix;
const warehouseCode = "WH-" + suffix;
const warehouseName = "Onyx acceptance " + suffix;
const foreignWarehouseCode = "WH-F-" + suffix;
const importJobId = randomUUID();
const snapshotId = randomUUID();
const unscopedImportJobId = randomUUID();
const unscopedSnapshotId = randomUUID();
const foreignImportJobId = randomUUID();
const foreignSnapshotId = randomUUID();
const key = () => randomUUID().replaceAll("-", "");

function asJson(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}
async function setIdentity(authUserId, email) {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI Onyx source reconciliation session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [authUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, role: "authenticated", session_id: authUserId }),
  ]);
}
async function expectFailure(label, action, pattern) {
  await db.unsafe("SAVEPOINT onyx_expected_failure");
  let caught;
  try { await action(); } catch (error) { caught = error; }
  if (caught) {
    await db.unsafe("ROLLBACK TO SAVEPOINT onyx_expected_failure");
    await db.unsafe("RELEASE SAVEPOINT onyx_expected_failure");
    assert.ok(!pattern || pattern.test(String(caught.message)), label + " returned the wrong error: " + caught.message);
    return caught;
  } else {
    await db.unsafe("RELEASE SAVEPOINT onyx_expected_failure");
    assert.fail(label + " should fail");
  }
}
async function preview(snapshot, warehouse, idem, reason="CI Onyx reconciliation acceptance") {
  const rows = await db.unsafe(
    "select public.preview_onyx_inventory_reconciliation($1::uuid,$2::uuid,$3::text,$4::text) as payload",
    [snapshot, warehouse, idem, reason],
  );
  return asJson(rows[0].payload);
}
async function apply(commandId, idem) {
  const rows = await db.unsafe(
    "select public.apply_onyx_inventory_reconciliation($1::uuid,$2::text) as payload",
    [commandId, idem],
  );
  return asJson(rows[0].payload);
}
async function rollback(commandId, idem, reason="CI compensating rollback acceptance") {
  const rows = await db.unsafe(
    "select public.rollback_onyx_inventory_reconciliation($1::uuid,$2::text,$3::text) as payload",
    [commandId, idem, reason],
  );
  return asJson(rows[0].payload);
}
async function readAsTestOwner(query, params = []) {
  const identity = await db.unsafe("select current_user::text as role");
  const restoreAuthenticated = identity[0]?.role === "authenticated";
  if (restoreAuthenticated) await db.unsafe("reset role");
  try {
    return await db.unsafe(query, params);
  } finally {
    if (restoreAuthenticated) await db.unsafe("set role authenticated");
  }
}
async function balance(productId) {
  const rows = await readAsTestOwner(
    "select quantity_on_hand::text as on_hand,quantity_reserved::text as reserved,last_movement_at,updated_at from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
    [productId, warehouseId],
  );
  return rows[0] ?? null;
}
async function movementCount(productId) {
  const rows = await readAsTestOwner(
    "select count(*)::int as count from public.inventory_movements where product_id=$1::uuid and warehouse_id=$2::uuid",
    [productId, warehouseId],
  );
  return rows[0].count;
}

async function main() {
  await db.unsafe("BEGIN");
  try {
    await db.unsafe("insert into public.organizations(id,name,currency,is_active) values($1,'CI Onyx '||$2,'YER',true)", [organizationId,suffix]);
    await db.unsafe("insert into public.organizations(id,name,currency,is_active) values($1,'CI Onyx foreign '||$2,'YER',true)", [foreignOrganizationId,suffix]);
    const foreignManagerProfileId = randomUUID();
    const foreignManagerAuthId = randomUUID();
    const foreignManagerEmail = "onyx-foreign-manager-" + suffix + "@example.test";
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Onyx Foreign Manager',$4,true)",
      [foreignManagerProfileId,foreignManagerAuthId,foreignOrganizationId,foreignManagerEmail],
    );
    await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'manager')", [foreignManagerProfileId]);
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Onyx Manager',$4,true)",
      [managerProfileId,managerAuthId,organizationId,"onyx-manager-"+suffix+"@example.test"],
    );
    await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'manager')", [managerProfileId]);
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Onyx Staff',$4,true)",
      [staffProfileId,staffAuthId,organizationId,"onyx-staff-"+suffix+"@example.test"],
    );
    await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'staff')", [staffProfileId]);
    await db.unsafe(
      "insert into public.warehouses(id,organization_id,name,code,is_active) values($1,$2,$3,$4,true)",
      [warehouseId,organizationId,warehouseName,warehouseCode],
    );
    await db.unsafe(
      "insert into public.warehouses(id,organization_id,name,code,is_active) values($1,$2,'Foreign Onyx warehouse',$3,true)",
      [foreignWarehouseId,foreignOrganizationId,foreignWarehouseCode],
    );
    await db.unsafe(
      "insert into public.products(id,organization_id,name,item_code,unit,base_price,cost_price,min_stock,status) values($1,$2,'CI Onyx item A',$3,'piece',1,0,0,'active'),($4,$2,'CI Onyx item B',$5,'piece',1,0,0,'active')",
      [productOneId,organizationId,itemOne,productTwoId,itemTwo],
    );
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1,$2,10,2,0)",
      [productOneId,warehouseId],
    );
    const onyxFileHash = "a".repeat(64);
    await db.unsafe(
      "insert into public.import_jobs(id,organization_id,job_type,source_system,file_name,file_hash,status,total_rows,created_by) values($1,$2,'inventory','manual','onyx-ci.csv',$3,'completed',2,$4)",
      [importJobId,organizationId,onyxFileHash,managerProfileId],
    );
    await db.unsafe(
      "insert into public.onyx_snapshots(id,organization_id,source_import_job_id,source_file_hash,source_file_name,report_type,row_count,data_quality_score,metrics,status,created_by) values($1,$2,$3,$4,'onyx-ci.csv','inventory_stock',2,100,'{}'::jsonb,'ready',$5)",
      [snapshotId,organizationId,importJobId,onyxFileHash,managerProfileId],
    );
    await db.unsafe(
      "insert into public.onyx_snapshot_rows(organization_id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors) values" +
      "($1::uuid,$2::uuid,1,$3::text,md5(jsonb_build_object('item_code',$3::text,'quantity',15,'warehouse_code',$5::text,'warehouse_name',$6::text,'external_id','ONYX-'||$3::text)::text),'valid',jsonb_build_object('item_code',$3::text,'quantity',15,'warehouse_code',$5::text,'warehouse_name',$6::text,'external_id','ONYX-'||$3::text),'[]'::jsonb)," +
      "($1::uuid,$2::uuid,2,$4::text,md5(jsonb_build_object('item_code',$4::text,'quantity',4,'warehouse_code',$5::text,'warehouse_name',$6::text,'onyx_code','REMOTE-'||$4::text)::text),'valid',jsonb_build_object('item_code',$4::text,'quantity',4,'warehouse_code',$5::text,'warehouse_name',$6::text,'onyx_code','REMOTE-'||$4::text),'[]'::jsonb)",
      [organizationId,snapshotId,itemOne,itemTwo,warehouseCode,warehouseName],
    );
    await db.unsafe(
      "insert into public.import_jobs(id,organization_id,job_type,file_name,file_hash,status,total_rows,created_by) values($1,$2,'inventory','unscoped-ci.csv',$3,'completed',1,$4)",
      [unscopedImportJobId,organizationId,"b".repeat(64),managerProfileId],
    );
    await db.unsafe(
      "insert into public.onyx_snapshots(id,organization_id,source_import_job_id,source_file_hash,source_file_name,report_type,row_count,data_quality_score,metrics,status,created_by) values($1,$2,$3,$4,'unscoped-ci.csv','inventory_stock',1,100,'{}'::jsonb,'ready',$5)",
      [unscopedSnapshotId,organizationId,unscopedImportJobId,"sha-unscoped-"+suffix,managerProfileId],
    );
    await db.unsafe(
      "insert into public.onyx_snapshot_rows(organization_id,snapshot_id,row_number,canonical_key,row_hash,status,data,errors) values($1,$2,1,$3,md5($4::jsonb::text),'valid',$4::jsonb,'[]'::jsonb)",
      [organizationId,unscopedSnapshotId,itemOne,JSON.stringify({ item_code: itemOne, quantity: 15 })],
    );
    await db.unsafe(
      "insert into public.import_jobs(id,organization_id,job_type,file_name,file_hash,status,total_rows) values($1,$2,'inventory','foreign-ci.csv',$3,'completed',1)",
      [foreignImportJobId,foreignOrganizationId,"c".repeat(64)],
    );
    await db.unsafe(
      "insert into public.onyx_snapshots(id,organization_id,source_import_job_id,source_file_hash,source_file_name,report_type,row_count,data_quality_score,metrics,status) values($1,$2,$3,$4,'foreign-ci.csv','inventory_stock',1,100,$5::jsonb,'ready')",
      [foreignSnapshotId,foreignOrganizationId,foreignImportJobId,"sha-foreign-"+suffix,JSON.stringify({ warehouse_code: foreignWarehouseCode })],
    );

    await setIdentity(staffAuthId,"onyx-staff-"+suffix+"@example.test");
    await db.unsafe("set role authenticated");
    await expectFailure("non-manager staff cannot preview a stock-changing reconciliation",
      () => preview(snapshotId,warehouseId,key()),/administrator or manager permission required/i);
    await db.unsafe("reset role");

    await setIdentity(managerAuthId,"onyx-manager-"+suffix+"@example.test");
    await db.unsafe("set role authenticated");
    const financeOptions = asJson((await db.unsafe(
      "select public.get_finance_document_print_options($1::integer) as payload", [1],
    ))[0].payload);
    assert.equal(financeOptions.organization_name, "CI Onyx " + suffix,
      "finance print issuer identity is derived from the active organization in the database");

    const warehouseOptions = asJson((await db.unsafe("select public.get_onyx_reconciliation_warehouses() as payload"))[0].payload);
    assert.ok(warehouseOptions.some((item) => item.id === warehouseId), "manager sees active warehouses only in their organization");

    const provenance = asJson((await db.unsafe(
      "select public.get_onyx_snapshot_source_evidence($1::uuid) as payload",
      [snapshotId],
    ))[0].payload);
    assert.equal(provenance.organization.id, organizationId, "organization identity is derived from the active authenticated profile");
    assert.ok(provenance.organization.name.startsWith("CI Onyx "), "organization display name comes from the database");
    assert.equal(provenance.organization.id, organizationId, "source evidence uses the active organization from the database");
    assert.equal(provenance.organization.name, "CI Onyx " + suffix, "source evidence displays the persisted organization identity");
    assert.equal(provenance.snapshot.id, snapshotId, "source evidence identifies the selected saved snapshot");
    assert.equal(provenance.import_job.id, importJobId, "source evidence links to the real import job in this tenant");
    assert.equal(provenance.import_job.updated_at, null, "the schema does not persist import-job updated_at; no timestamp is fabricated");
    assert.equal(provenance.import_job.file_hash_matches_snapshot, true, "snapshot and import hashes must match exactly");
    assert.equal(provenance.source_identity.provenance_status, "linked_import_job_hash_match");
    assert.equal(provenance.source_identity.source_record_id, null, "an import-job ID must not be represented as an external source-record ID");
    assert.deepEqual(provenance.source_identity.external_id_fields_found.sort(), ["external_id", "onyx_code"]);
    assert.equal(provenance.source_identity.external_id_examples.length, 2, "row-level external ID evidence is returned from the persisted source snapshot");
    assert.equal(provenance.source_identity.external_id_examples[0].external_ids.external_id, "ONYX-" + itemOne, "row one retains its own external record ID");
    assert.equal(provenance.source_identity.external_id_examples[1].external_ids.onyx_code, "REMOTE-" + itemTwo, "row two retains its own alternate external code");
    assert.equal(provenance.source_identity.external_id_examples_truncated, false, "small source samples are not falsely marked as truncated");
    assert.equal(provenance.source_identity.rows_with_external_id, 2);
    assert.equal(provenance.live_sync_evidence.live_connection_proven, false, "saved snapshot provenance never implies a live Onyx connection");
    assert.equal(provenance.live_sync_evidence.status, "not_proven");
    await expectFailure("Onyx source evidence cannot expose another organization's snapshot",
      () => db.unsafe("select public.get_onyx_snapshot_source_evidence($1::uuid)", [foreignSnapshotId]),
      /ready Onyx snapshot is unavailable/i);
    await expectFailure("unscoped/aggregate Onyx inventory is denied",
      () => preview(unscopedSnapshotId,warehouseId,key()),/not warehouse-scoped/i);
    await expectFailure("cross-organization Onyx snapshot is denied",
      () => preview(foreignSnapshotId,warehouseId,key()),/ready Onyx snapshot is unavailable/i);
    await db.unsafe("reset role");

    const sourceEvidence = await db.unsafe(
      "select r.data->>'warehouse_code' as row_warehouse_code from public.onyx_snapshots s join public.onyx_snapshot_rows r on r.snapshot_id=s.id where s.id=$1 order by r.row_number limit 1",
      [snapshotId],
    );
    assert.equal(sourceEvidence[0].row_warehouse_code,warehouseCode,"source row warehouse scope must be persisted");
    await db.unsafe("update public.inventory_balances set quantity_reserved=20 where product_id=$1 and warehouse_id=$2",[productOneId,warehouseId]);
    await db.unsafe("set role authenticated");
    await expectFailure("source quantity cannot fall below reserved stock",
      () => preview(snapshotId,warehouseId,key()),/Onyx target stock is below currently reserved quantity/i);
    await db.unsafe("reset role");
    await db.unsafe("update public.inventory_balances set quantity_reserved=2 where product_id=$1 and warehouse_id=$2",[productOneId,warehouseId]);
    await db.unsafe("set role authenticated");

    const previewKey = key();
    const command = await preview(snapshotId,warehouseId,previewKey);
    assert.equal(command.status,"previewed");
    assert.equal(command.source_row_count,2);
    assert.equal((await balance(productOneId)).on_hand,"10.000","preview must not mutate existing on-hand stock");
    assert.equal(await balance(productTwoId),null,"preview must not create a stock balance");
    const replayPreview = await preview(snapshotId,warehouseId,previewKey);
    assert.equal(replayPreview.command_id,command.command_id,"preview idempotent replay returns the same command");
    assert.equal(replayPreview.idempotent_replay,true);
    await expectFailure("preview idempotency key cannot be reused for a different reason",
      () => preview(snapshotId,warehouseId,previewKey,"different payload"),/different Onyx reconciliation payload/i);

    const applyKey = key();
    const applied = await apply(command.command_id,applyKey);
    assert.equal(applied.status,"applied");
    assert.equal(applied.source_row_count,2);
    assert.equal((await balance(productOneId)).on_hand,"15.000");
    assert.equal((await balance(productOneId)).reserved,"2.000","apply preserves existing reserved quantities");
    assert.equal((await balance(productTwoId)).on_hand,"4.000","apply creates missing zero-baseline balances only inside the atomic command");
    assert.equal(await movementCount(productOneId),1);
    assert.equal(await movementCount(productTwoId),1);
    const appliedReplay = await apply(command.command_id,applyKey);
    assert.equal(appliedReplay.idempotent_replay,true);
    assert.equal(await movementCount(productOneId),1,"idempotent replay does not duplicate movement rows");

    // A command that changes inventory must be protected at both apply and compensating
    // rollback boundaries. A preview/read denial alone does not prove command isolation.
    const readAppliedCommandBoundary = async () => {
      const commandRows = await readAsTestOwner(
        "select to_jsonb(c) as payload from public.onyx_inventory_reconciliation_commands c where c.id=$1::uuid",
        [command.command_id],
      );
      const itemRows = await readAsTestOwner(
        "select COALESCE(jsonb_agg(to_jsonb(i) order by i.product_id),'[]'::jsonb) as payload " +
          "from public.onyx_inventory_reconciliation_items i where i.command_id=$1::uuid",
        [command.command_id],
      );
      const balanceRows = await readAsTestOwner(
        "select COALESCE(jsonb_agg(jsonb_build_object('product_id',ib.product_id,'quantity_on_hand',ib.quantity_on_hand::text," +
          "'quantity_reserved',ib.quantity_reserved::text,'quantity_available',ib.quantity_available::text," +
          "'last_movement_at',ib.last_movement_at::text,'updated_at',ib.updated_at::text) order by ib.product_id),'[]'::jsonb) as payload " +
          "from public.inventory_balances ib where ib.warehouse_id=$1::uuid and ib.product_id=any($2::uuid[])",
        [warehouseId,[productOneId,productTwoId]],
      );
      const movementRows = await readAsTestOwner(
        "select COALESCE(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb) as payload " +
          "from public.inventory_movements m where m.warehouse_id=$1::uuid and m.product_id=any($2::uuid[]) " +
          "and m.reference_id=$3::uuid and m.reference_type in ('onyx_inventory_reconciliation','onyx_inventory_reconciliation_rollback')",
        [warehouseId,[productOneId,productTwoId],command.command_id],
      );
      const auditRows = await readAsTestOwner(
        "select COALESCE(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]'::jsonb) as payload " +
          "from public.audit_logs a where a.organization_id=$1::uuid and a.entity_id=$2::uuid",
        [organizationId,command.command_id],
      );
      assert.equal(commandRows.length,1,"applied command remains visible to its owning tenant");
      return {
        command:commandRows[0].payload,
        items:itemRows[0].payload,
        balances:balanceRows[0].payload,
        movements:movementRows[0].payload,
        audit:auditRows[0].payload,
      };
    };
    const appliedBoundaryBeforeDenials = await readAppliedCommandBoundary();
    const expectOnyxCommandDenied = async (authId,email,label,operation,pattern) => {
      await setIdentity(authId,email);
      await db.unsafe("set role authenticated");
      const caught = await expectFailure(label,operation,pattern);
      assert.equal(caught.code,"42501",label + " must use the authorization SQLSTATE");
      await db.unsafe("reset role");
      assert.deepEqual(
        await readAppliedCommandBoundary(),
        appliedBoundaryBeforeDenials,
        label + ": a denied command must preserve its record, lines, balances, movements and audits",
      );
    };
    const staffEmail = "onyx-staff-" + suffix + "@example.test";
    await expectOnyxCommandDenied(
      staffAuthId,staffEmail,"ordinary staff cannot apply an Onyx reconciliation command",
      () => apply(command.command_id,key()),/administrator or manager permission required to apply Onyx stock reconciliation/i,
    );
    await expectOnyxCommandDenied(
      foreignManagerAuthId,foreignManagerEmail,"foreign-tenant manager cannot apply another tenant's Onyx command",
      () => apply(command.command_id,key()),/Onyx reconciliation command is unavailable in the current organization/i,
    );
    await expectOnyxCommandDenied(
      staffAuthId,staffEmail,"ordinary staff cannot roll back an Onyx reconciliation command",
      () => rollback(command.command_id,key(),"Unauthorized staff rollback attempt"),
      /administrator or manager permission required to roll back Onyx stock reconciliation/i,
    );
    await expectOnyxCommandDenied(
      foreignManagerAuthId,foreignManagerEmail,"foreign-tenant manager cannot roll back another tenant's Onyx command",
      () => rollback(command.command_id,key(),"Foreign tenant rollback attempt"),
      /Onyx reconciliation command is unavailable in the current organization/i,
    );
    await setIdentity(managerAuthId,"onyx-manager-"+suffix+"@example.test");
    await db.unsafe("set role authenticated");

    const rolledBack = await rollback(command.command_id,key());
    assert.equal((await balance(productOneId)).on_hand,"10.000","compensating rollback restores the starting quantity");
    assert.equal((await balance(productTwoId)).on_hand,"0.000","rollback leaves a zero balance rather than deleting audit context");
    assert.equal(await movementCount(productOneId),2,"rollback appends a compensating movement instead of deleting the apply movement");

    // Deliberately stale the second (lexically later) product after preview. No first-line update
    // may survive a multi-line failure, even though the first line sorts before the stale line.
    const staleCommand = await preview(snapshotId,warehouseId,key(),"Stale atomicity check");
    await db.unsafe("reset role");
    const firstBefore = await balance(productOneId);
    await db.unsafe(
      "update public.inventory_balances set quantity_on_hand=1,last_movement_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp() where product_id=$1 and warehouse_id=$2",
      [productTwoId,warehouseId],
    );
    await db.unsafe(
      "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,created_at) values($1,$2,'ci_concurrent_adjustment',1,1,'ci_onyx_test',$3,'Deliberate stale test',$4,pg_catalog.clock_timestamp())",
      [productTwoId,warehouseId,staleCommand.command_id,managerProfileId],
    );
    await db.unsafe("set role authenticated");
    await expectFailure("stale apply is rejected and transactionally atomic",
      () => apply(staleCommand.command_id,key()),/changed after preview/i);
    await db.unsafe("reset role");
    assert.equal((await balance(productOneId)).on_hand,firstBefore.on_hand,"no stock write survives a stale multi-row apply failure");
    assert.equal((await balance(productTwoId)).on_hand,"1.000","concurrent source change is preserved");
    assert.equal((await db.unsafe("select status from public.onyx_inventory_reconciliation_commands where id=$1",[staleCommand.command_id]))[0].status,"previewed");

    // Apply a fresh preview, then create a later movement; rollback must refuse to overwrite it.
    await db.unsafe("set role authenticated");
    const finalCommand = await preview(snapshotId,warehouseId,key(),"Later-movement rollback guard");
    const finalApplied = await apply(finalCommand.command_id,key());
    assert.equal(finalApplied.status,"applied");
    await db.unsafe("reset role");
    await db.unsafe(
      "update public.inventory_balances set quantity_on_hand=16,last_movement_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp() where product_id=$1 and warehouse_id=$2",
      [productOneId,warehouseId],
    );
    await db.unsafe(
      "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,created_at) values($1,$2,'ci_later_adjustment',1,16,'ci_onyx_test',$3,'Deliberate post-apply movement',$4,pg_catalog.clock_timestamp())",
      [productOneId,warehouseId,finalCommand.command_id,managerProfileId],
    );
    await db.unsafe("set role authenticated");
    await expectFailure("rollback refuses to overwrite later stock movement",
      () => rollback(finalCommand.command_id,key(),"Unsafe reversal should be denied"),/changed after Onyx apply|newer or altered stock movement history/i);
    await db.unsafe("reset role");
    assert.equal((await balance(productOneId)).on_hand,"16.000","later stock movement is not overwritten");
    assert.equal((await balance(productTwoId)).on_hand,"4.000","rollback validation is atomic across all command lines");
    assert.equal((await db.unsafe("select status from public.onyx_inventory_reconciliation_commands where id=$1",[finalCommand.command_id]))[0].status,"applied");

    await db.unsafe("set role authenticated");
    const history = asJson((await db.unsafe("select public.list_onyx_inventory_reconciliation_commands($1::uuid) as payload",[snapshotId]))[0].payload);
    assert.ok(history.some((item) => item.command_id === command.command_id && item.status === "rolled_back"));
    assert.ok(history.some((item) => item.command_id === finalCommand.command_id && item.status === "applied"));
    await db.unsafe("reset role");
    process.stdout.write("PASS Onyx inventory reconciliation: warehouse-scope gate, tenant isolation, manager boundary, preview no-write, preview/apply/rollback idempotency, reservation guard, atomic stale apply, audit movements, successful compensating rollback, and later-movement rollback refusal.\n");
  } finally {
    await runCriticalCleanup("onyx-reconciliation", [
      { name: "RESET ROLE", run: () => db.unsafe("RESET ROLE") },
      { name: "ROLLBACK", run: () => db.unsafe("ROLLBACK") },
    ], (message, error) => logError(message, error));
  }
}

try {
  await main();
} catch (cause) {
  const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
  process.stderr.write("ONYX_RECONCILIATION_ACCEPTANCE_FAILED " + JSON.stringify({
    name:error.name,message:error.message,code:error.code,detail:error.detail,hint:error.hint,where:error.where,table:error.table,constraint:error.constraint,stack:error.stack,
  }) + "\n");
  throw cause;
} finally {
  await db.end({ timeout: 5 });
}
