import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required for inventory snapshot contract acceptance.");

const db = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });
const uuid = () => randomUUID();
const suffix = uuid().replaceAll("-", "").slice(0, 10);
const organizationId = uuid();
const managerProfileId = uuid();
const managerAuthId = uuid();
const warehouseId = uuid();
const productChangedId = uuid();
const productMatchedId = uuid();
const itemChanged = "CI-STOCK-A-" + suffix;
const itemMatched = "CI-STOCK-B-" + suffix;
const warehouseCode = "CI-WH-" + suffix;
const warehouseName = "CI inventory snapshot " + suffix;
const managerEmail = "ci-import-stock-" + suffix + "@example.test";
const fileHash = "a".repeat(64);
const chunkHash = "c".repeat(64);

async function setIdentity() {
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [managerAuthId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: managerAuthId, email: managerEmail, email_confirmed_at: new Date().toISOString(), role: "authenticated" }),
  ]);
}

async function readAsOwner(query, params = []) {
  const current = await db.unsafe("select current_user::text as role");
  const restoreAuthenticated = current[0]?.role === "authenticated";
  if (restoreAuthenticated) await db.unsafe("reset role");
  try {
    return await db.unsafe(query, params);
  } finally {
    if (restoreAuthenticated) await db.unsafe("set role authenticated");
  }
}

async function snapshotStock() {
  const balances = await readAsOwner(
    "select product_id::text,quantity_on_hand::text,quantity_reserved::text,updated_at::text " +
      "from public.inventory_balances where product_id=any($1::uuid[]) and warehouse_id=$2::uuid order by product_id",
    [[productChangedId, productMatchedId], warehouseId],
  );
  const movements = await readAsOwner(
    "select product_id::text,count(*)::integer as count from public.inventory_movements " +
      "where product_id=any($1::uuid[]) and warehouse_id=$2::uuid group by product_id order by product_id",
    [[productChangedId, productMatchedId], warehouseId],
  );
  return { balances, movements };
}

async function main() {
  await db.unsafe("begin");
  try {
    await db.unsafe(
      "insert into public.organizations(id,name,currency,is_active) values($1,$2,'YER',true)",
      [organizationId, "CI import inventory " + suffix],
    );
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
        "values($1,$2,$3,'CI Import Inventory Manager',$4,true)",
      [managerProfileId, managerAuthId, organizationId, managerEmail],
    );
    await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'manager')", [managerProfileId]);
    await db.unsafe(
      "insert into public.warehouses(id,organization_id,name,code,is_active) values($1,$2,$3,$4,true)",
      [warehouseId, organizationId, warehouseName, warehouseCode],
    );
    await db.unsafe(
      "insert into public.products(id,organization_id,name,item_code,unit,base_price,cost_price,min_stock,status) " +
        "values($1,$2,'CI Stock Change',$3,'piece',1,0,0,'active')," +
        "($4,$2,'CI Stock Match',$5,'piece',1,0,0,'active')",
      [productChangedId, organizationId, itemChanged, productMatchedId, itemMatched],
    );
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
        "values($1,$2,10,2,0),($3,$2,4,0,0)",
      [productChangedId, warehouseId, productMatchedId],
    );

    const profileResult = await db.unsafe(
      "insert into public.import_profiles(" +
        "organization_id,profile_name,report_type,source,version,required_columns,optional_columns," +
        "matching_key,merge_strategy,is_full_dataset,status,created_by,published_at" +
      ") values($1,$2,'inventory_stock','ci',1," +
        "'[\"item_code\",\"quantity\"]'::jsonb," +
        "'[\"product_name\",\"warehouse_id\",\"warehouse_code\",\"warehouse_name\",\"date\",\"revenue\"]'::jsonb," +
        "'item_code','manual_review',false,'active',$3,now()) returning id",
      [organizationId, "CI Inventory Stock " + suffix, managerProfileId],
    );
    const profileId = profileResult[0].id;

    await setIdentity();
    await db.unsafe("set role authenticated");

    const created = await db.unsafe(
      "select public.create_import_job($1,$2,$3,$4,$5::uuid,$6,$7) as result",
      ["CI inventory snapshot " + suffix + ".csv", fileHash, 2048, "inventory_stock", profileId, "2026-10", "ci"],
    );
    const job = created[0].result;
    assert.equal(job.organization_id, organizationId, "import job must be bound to the authenticated organization");
    assert.equal(job.profile_id, profileId, "the explicit inventory profile must be retained by the import job");
    assert.equal(job.raw_file_retained, false, "the raw source file must not be retained");

    const sourceRows = [
      {
        item_code: itemChanged,
        product_name: "CI Stock Change",
        quantity: "15",
        warehouse_id: warehouseId,
        warehouse_code: warehouseCode,
        warehouse_name: warehouseName,
        date: "2026-10-01",
        revenue: "150",
      },
      {
        item_code: itemMatched,
        product_name: "CI Stock Match",
        quantity: "4",
        warehouse_id: warehouseId,
        warehouse_code: warehouseCode,
        warehouse_name: warehouseName,
        date: "2026-10-02",
        revenue: "40",
      },
    ];
    await db.unsafe(
      "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) " +
        "values($1,1,'valid',$2::jsonb,'[]'::jsonb),($1,2,'valid',$3::jsonb,'[]'::jsonb)",
      [job.id, db.json(sourceRows[0]), db.json(sourceRows[1])],
    );

    const upload = await db.unsafe("select public.create_import_upload_session($1::uuid) as result", [job.id]);
    const session = upload[0].result;
    assert.equal(session.total_chunks, 1, "the fixture file must be represented by exactly one upload chunk");
    const recorded = await db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
      [session.id, 0, 0, 2048, chunkHash],
    );
    assert.equal(recorded[0].result.complete, true, "only a complete contiguous upload manifest may be finalized");

    const beforeFinalize = await snapshotStock();
    const finalizedRows = await db.unsafe(
      "select public.finalize_import_job($1::uuid,$2) as result",
      [job.id, "new_version"],
    );
    const finalized = finalizedRows[0].result;
    assert.equal(finalized.status, "completed", "valid inventory rows should finalize successfully");
    assert.ok(Number(finalized.data_quality_score) >= 75, "accepted stock imports must meet the server quality threshold");
    assert.ok(finalized.snapshot_id, "an accepted import must create an immutable Onyx snapshot");

    const snapshots = await readAsOwner(
      "select organization_id::text,report_type,status,row_count,source_file_hash " +
        "from public.onyx_snapshots where id=$1::uuid",
      [finalized.snapshot_id],
    );
    assert.equal(snapshots.length, 1, "finalization must create one snapshot");
    assert.equal(snapshots[0].organization_id, organizationId, "snapshot must preserve tenant identity");
    assert.equal(snapshots[0].report_type, "inventory_stock", "snapshot must retain the inventory profile's report type");
    assert.equal(snapshots[0].status, "ready", "snapshot must become ready only after all rows are persisted");
    assert.equal(Number(snapshots[0].row_count), sourceRows.length, "snapshot manifest row count must match staged rows");
    assert.equal(snapshots[0].source_file_hash, fileHash, "snapshot must preserve the source file hash");

    const persistedRows = await readAsOwner(
      "select row_number,canonical_key,row_hash,status,data from public.onyx_snapshot_rows " +
        "where snapshot_id=$1::uuid and organization_id=$2::uuid order by row_number",
      [finalized.snapshot_id, organizationId],
    );
    assert.equal(persistedRows.length, 2, "all accepted import rows must be present in the snapshot");
    for (let index = 0; index < sourceRows.length; index += 1) {
      const persisted = persistedRows[index];
      const expected = sourceRows[index];
      assert.equal(persisted.status, "valid", "snapshot must preserve the source validation status");
      assert.equal(persisted.canonical_key, expected.item_code, "snapshot key must use the profile's canonical item_code");
      assert.equal(persisted.data.item_code, expected.item_code, "snapshot must preserve the canonical product code");
      assert.equal(persisted.data.quantity, expected.quantity, "snapshot must preserve the source quantity string");
      assert.equal(persisted.data.warehouse_id, expected.warehouse_id, "snapshot must preserve warehouse ID scope");
      assert.equal(persisted.data.warehouse_code, expected.warehouse_code, "snapshot must preserve warehouse code scope");
      assert.equal(persisted.data.warehouse_name, expected.warehouse_name, "snapshot must preserve warehouse name scope");
      assert.match(persisted.row_hash, /^[0-9a-f]{32}$/, "snapshot row hash must be persisted");
    }

    const afterFinalize = await snapshotStock();
    assert.deepEqual(afterFinalize, beforeFinalize, "generic import finalization must not mutate stock balances or movement ledger");

    const comparisonRows = await db.unsafe(
      "select public.run_inventory_reconciliation($1::uuid) as result",
      [finalized.snapshot_id],
    );
    const comparison = comparisonRows[0].result;
    assert.equal(comparison.snapshot_id, finalized.snapshot_id, "read-only comparison must reference the exact finalized snapshot");
    assert.equal(comparison.source_row_count, 2);
    assert.equal(comparison.changed_count, 1, "the 15-unit source row must compare as changed against 10 live units");
    assert.equal(comparison.matched_count, 1, "the 4-unit source row must compare as matched against 4 live units");
    assert.equal(comparison.new_count, 0);
    assert.equal(comparison.invalid_count, 0);

    const afterComparison = await snapshotStock();
    assert.deepEqual(afterComparison, beforeFinalize, "read-only reconciliation must not mutate stock balances or movement ledger");

    await db.unsafe("rollback");
    process.stdout.write(
      "PASS inventory snapshot contract: real import finalization preserves tenant/profile/hash/row identity, item_code, quantity and warehouse scope; comparison is accurate and stock remains unchanged until an explicit guarded stock-write command.\\n",
    );
  } catch (error) {
    await db.unsafe("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("IMPORT_INVENTORY_SNAPSHOT_CONTRACT_FAILED:", error);
  process.exitCode = 1;
});
