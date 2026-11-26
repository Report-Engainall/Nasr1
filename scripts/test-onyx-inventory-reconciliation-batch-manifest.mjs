import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required");
  return value.replace(/^"(.*)"$/s, "$1");
}

const databaseUrl = env("TEST_DATABASE_URL");
validateCashExpenseEndpoints(env("E2E_SUPABASE_URL"), databaseUrl);

const organizationId = "a0000000-0000-0000-0000-000000000001";
const templateProductId = "a1000000-0000-0000-0000-000000000001";
const warehouseId = "d0000000-0000-0000-0000-000000000001";
const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });

function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function rpc(query, args) {
  const rows = await db.unsafe(query, args);
  return parseJson(rows[0]?.result);
}

async function actor(email) {
  const rows = await db.unsafe(
    "select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active limit 1",
    [organizationId, email.toLowerCase()],
  );
  assert.equal(rows.length, 1, "The isolated local manager profile must exist.");
  return rows[0];
}

async function as(profile) {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1::uuid,$1::uuid,now(),now(),now(),null,'CI Onyx FEFO batch-manifest acceptance','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [profile.auth_user_id],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [profile.auth_user_id]);
  await db.unsafe(
    "select set_config('request.jwt.claims',$1,false)",
    [JSON.stringify({
      sub: profile.auth_user_id,
      email: profile.email,
      role: "authenticated",
      session_id: profile.auth_user_id,
    })],
  );
  await db.unsafe("set role authenticated");
}

function quoteIdentifier(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

async function insertFromRecord(table, record, options = {}) {
  const hashJsonColumn = options.hashJsonColumn ?? null;
  const metadata = await db.unsafe(
    "select column_name,is_nullable,column_default,is_generated,is_identity,data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
    [table],
  );
  assert.ok(metadata.length > 0, "public." + table + " must exist in the fully migrated local schema.");
  const writable = metadata.filter(
    (column) => column.is_generated === "NEVER" && column.is_identity !== "ALWAYS",
  );
  const missing = writable.filter((column) =>
    column.is_nullable === "NO"
    && column.column_default === null
    && !(column.column_name in record)
    && !(column.column_name === "row_hash" && hashJsonColumn),
  );
  assert.deepEqual(
    missing.map((column) => column.column_name),
    [],
    "Required public." + table + " columns need explicit fixture values.",
  );

  const selected = writable.filter((column) =>
    column.column_name in record || (column.column_name === "row_hash" && hashJsonColumn),
  );
  const values = [];
  const expressions = selected.map((column) => {
    if (column.column_name === "row_hash" && hashJsonColumn) {
      values.push(db.json(record[hashJsonColumn]));
      return "md5($" + values.length + "::jsonb::text)";
    }
    const value = record[column.column_name];
    values.push(
      ["jsonb", "json"].includes(column.data_type) && value !== null
        ? db.json(value)
        : value,
    );
    return "$" + values.length;
  });
  await db.unsafe(
    "insert into public." + quoteIdentifier(table)
      + " (" + selected.map((c) => quoteIdentifier(c.column_name)).join(",") + ")"
      + " values (" + expressions.join(",") + ")",
    values,
  );
}

async function cloneProduct(templateId, manager, suffix) {
  const id = randomUUID();
  const itemCode = "P2-ONYX-FEFO-" + suffix;
  const name = "P2 Onyx FEFO batch manifest " + suffix;
  const metadata = await db.unsafe(
    "select column_name,is_generated,is_identity from information_schema.columns where table_schema='public' and table_name='products' order by ordinal_position",
  );
  const writable = metadata.filter(
    (column) => column.is_generated === "NEVER" && column.is_identity !== "ALWAYS",
  );
  const values = [];
  const add = (value, cast = "") => {
    values.push(value);
    return "$" + values.length + cast;
  };
  const expressions = writable.map((column) => {
    switch (column.column_name) {
      case "id": return add(id, "::uuid");
      case "item_code": return add(itemCode, "::text");
      case "name": return add(name, "::text");
      case "status": return "'active'";
      case "sku": return add("SKU-" + suffix, "::text");
      case "barcode": return add("BAR-" + suffix, "::text");
      case "upc": return add("UPC-" + suffix, "::text");
      case "gtin": return add("GTIN-" + suffix, "::text");
      case "ean": return add("EAN-" + suffix, "::text");
      case "slug": return add("p2-onyx-fefo-" + suffix.toLowerCase(), "::text");
      case "external_id": return add("EXT-" + suffix, "::text");
      case "created_by": return add(manager.id, "::uuid");
      case "updated_by": return add(manager.id, "::uuid");
      default: return "p." + quoteIdentifier(column.column_name);
    }
  });
  const templateParam = add(templateId, "::uuid");
  const orgParam = add(organizationId, "::uuid");
  await db.unsafe(
    "insert into public.products (" + writable.map((c) => quoteIdentifier(c.column_name)).join(",") + ")"
      + " select " + expressions.join(",")
      + " from public.products p where p.id=" + templateParam + " and p.organization_id=" + orgParam,
    values,
  );
  const rows = await db.unsafe(
    "select id::text,item_code,name,status from public.products where id=$1::uuid and organization_id=$2::uuid",
    [id, organizationId],
  );
  assert.equal(rows.length, 1, "The dedicated source product must be persisted.");
  assert.equal(rows[0].item_code, itemCode);
  assert.equal(rows[0].status, "active");
  return rows[0];
}

async function lotManifest(productId) {
  await db.unsafe("reset role");
  return db.unsafe(
    "select id::text,batch_number,expiry_date::text,received_at::text,quantity_on_hand::text,quantity_reserved::text,unit_cost::text,source_type,source_reference_type,source_reference_id::text,parent_batch_id::text from public.inventory_batches where organization_id=$1::uuid and product_id=$2::uuid and warehouse_id=$3::uuid and (quantity_on_hand>0 or quantity_reserved>0) order by id",
    [organizationId, productId, warehouseId],
  );
}

async function balance(productId) {
  await db.unsafe("reset role");
  const rows = await db.unsafe(
    "select quantity_on_hand::text,quantity_reserved::text,quantity_available::text from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
    [productId, warehouseId],
  );
  assert.equal(rows.length, 1, "The dedicated product balance must exist.");
  return rows[0];
}

async function createSnapshot(product, manager, targetQuantity, suffix) {
  const snapshotId = randomUUID();
  const rowId = randomUUID();
  const dateRows = await db.unsafe(
    "select to_char((pg_catalog.now() at time zone 'UTC')::date,'YYYY-MM-DD') as as_of_date",
  );
  const asOfDate = dateRows[0].as_of_date;
  const sourceData = {
    item_code: product.item_code,
    warehouse_id: warehouseId,
    quantity: String(targetQuantity),
    as_of_date: asOfDate,
  };
  const sourceFileName = "P2-Onyx-FEFO-" + suffix + ".csv";
  const sourceCsv = [
    "item_code,warehouse_id,quantity,as_of_date",
    [product.item_code, warehouseId, String(targetQuantity), asOfDate].join(","),
    "",
  ].join("\n");
  const sourceHash = createHash("sha256").update(sourceCsv).digest("hex");

  // onyx_snapshots.source_import_job_id is NOT NULL. Create a real, tenant-scoped
  // import job through the canonical idempotent RPC instead of writing a null
  // provenance pointer into the test snapshot.
  await as(manager);
  // The ensure function returns a PostgreSQL UUID scalar, not JSONB.
  // Read its text representation directly instead of passing it through rpc()/JSON.parse().
  const profileRows = await db.unsafe(
    "select public.ensure_onyx_stock_balance_import_profile()::text as profile_id",
  );
  const profileId = profileRows[0]?.profile_id;
  assert.match(profileId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const sourceImportJob = await rpc(
    "select public.create_import_job_idempotent($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::uuid,$8::text,$9::text,$10::text) as result",
    [
      randomUUID(),
      sourceFileName,
      sourceHash,
      Buffer.byteLength(sourceCsv, "utf8"),
      "inventory_stock",
      "P2-Onyx-FEFO-" + suffix,
      profileId,
      asOfDate,
      "onyx_pro",
      "new_version",
    ],
  );
  assert.match(sourceImportJob.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(sourceImportJob.profile_id, profileId);
  assert.equal(sourceImportJob.file_hash, sourceHash);

  const snapshotRecord = {
    id: snapshotId,
    organization_id: organizationId,
    status: "ready",
    source_file_hash: sourceHash,
    report_type: "inventory_stock",
    metrics: {},
    row_count: 1,
    source_file_name: sourceFileName,
    source_import_job_id: sourceImportJob.id,
    profile_id: sourceImportJob.profile_id,
    profile_version: sourceImportJob.profile_version,
    period_key: asOfDate,
    snapshot_version: 1,
    data_quality_score: 100,
    quality_score: 100,
    created_by: manager.id,
    uploaded_by: manager.id,
    created_at: new Date().toISOString(),
  };
  // Seed snapshot evidence as the trusted test-database owner: ordinary authenticated
  // managers intentionally have no INSERT policy on protected Onyx snapshot tables.
  // Re-enter the manager JWT role before calling any product RPC under test.
  await db.unsafe("reset role");
  await insertFromRecord("onyx_snapshots", snapshotRecord);

  const rowRecord = {
    id: rowId,
    snapshot_id: snapshotId,
    organization_id: organizationId,
    row_number: 1,
    canonical_key: product.item_code,
    status: "valid",
    data: sourceData,
    created_by: manager.id,
    created_at: new Date().toISOString(),
  };
  await insertFromRecord("onyx_snapshot_rows", rowRecord, { hashJsonColumn: "data" });
  await as(manager);
  return snapshotId;
}

async function reconcileAndRestoreLots({
  manager,
  product,
  baselineBalance,
  baselineLots,
  delta,
  suffix,
}) {
  const targetQuantity = Number(baselineBalance.quantity_on_hand) + delta;
  assert.ok(
    targetQuantity >= Number(baselineBalance.quantity_reserved),
    "The test target must never undercut reserved quantity.",
  );
  const snapshotId = await createSnapshot(product, manager, targetQuantity, suffix);
  const previewKey = "p2-onyx-preview-" + randomUUID().replaceAll("-", "");
  const applyKey = "p2-onyx-apply-" + randomUUID().replaceAll("-", "");
  const rollbackKey = "p2-onyx-rollback-" + randomUUID().replaceAll("-", "");

  await as(manager);
  const preview = await rpc(
    "select public.preview_onyx_inventory_reconciliation($1::uuid,$2::uuid,$3::text,$4::text) as result",
    [snapshotId, warehouseId, previewKey, "P2 FEFO manifest rollback acceptance"],
  );
  assert.equal(preview.status, "previewed");
  assert.equal(preview.source_row_count, 1);

  const applied = await rpc(
    "select public.apply_onyx_inventory_reconciliation($1::uuid,$2::text) as result",
    [preview.command_id, applyKey],
  );
  assert.equal(applied.status, "applied");
  assert.equal(applied.adjusted_lines, 1);

  const applyReplay = await rpc(
    "select public.apply_onyx_inventory_reconciliation($1::uuid,$2::text) as result",
    [preview.command_id, applyKey],
  );
  assert.equal(applyReplay.idempotent_replay, true);

  const afterApply = await lotManifest(product.id);
  assert.equal(
    afterApply.reduce((sum, lot) => sum + Number(lot.quantity_on_hand), 0),
    targetQuantity,
    "FEFO subledger on-hand must match the reconciled aggregate after apply.",
  );

  const rolledBack = await rpc(
    "select public.rollback_onyx_inventory_reconciliation($1::uuid,$2::text,$3::text) as result",
    [preview.command_id, rollbackKey, "Restore the exact original FEFO lot distribution"],
  );
  assert.equal(rolledBack.status, "rolled_back");

  const rollbackReplay = await rpc(
    "select public.rollback_onyx_inventory_reconciliation($1::uuid,$2::text,$3::text) as result",
    [preview.command_id, rollbackKey, "Restore the exact original FEFO lot distribution"],
  );
  assert.equal(rollbackReplay.idempotent_replay, true);

  const restoredBalance = await balance(product.id);
  assert.equal(Number(restoredBalance.quantity_on_hand), Number(baselineBalance.quantity_on_hand));
  assert.equal(Number(restoredBalance.quantity_reserved), Number(baselineBalance.quantity_reserved));

  const restoredLots = await lotManifest(product.id);
  assert.deepEqual(
    restoredLots,
    baselineLots,
    "Onyx delta " + delta + " must restore every pre-existing FEFO lot ID, expiry, source and quantity exactly.",
  );
}

async function main() {
  const manager = await actor(env("E2E_MANAGER_EMAIL"));
  const template = await db.unsafe(
    "select id::text,item_code from public.products where id=$1::uuid and organization_id=$2::uuid and status='active'",
    [templateProductId, organizationId],
  );
  assert.equal(template.length, 1, "The established active local FEFO template product must exist.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const product = await cloneProduct(templateProductId, manager, suffix);

  const baselineLots = [
    {
      id: randomUUID(),
      batch_number: "P2-ONYX-EARLY-" + suffix,
      expiry_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      received_at: new Date(Date.now() - 86400000).toISOString(),
      quantity_on_hand: 3,
      quantity_reserved: 0,
      unit_cost: 1.25,
      source_type: "purchase_receipt",
      source_reference_type: "p2_onyx_fefo_acceptance",
      source_reference_id: randomUUID(),
    },
    {
      id: randomUUID(),
      batch_number: "P2-ONYX-LATE-" + suffix,
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      received_at: new Date().toISOString(),
      quantity_on_hand: 3,
      quantity_reserved: 0,
      unit_cost: 2.5,
      source_type: "purchase_receipt",
      source_reference_type: "p2_onyx_fefo_acceptance",
      source_reference_id: randomUUID(),
    },
  ];

  await db.unsafe("reset role");
  for (const lot of baselineLots) {
    await db.unsafe(
      "insert into public.inventory_batches(id,organization_id,product_id,warehouse_id,batch_number,expiry_date,received_at,quantity_on_hand,quantity_reserved,unit_cost,source_type,source_reference_type,source_reference_id) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::date,$7::timestamptz,$8::numeric,$9::numeric,$10::numeric,$11,$12,$13::uuid)",
      [
        lot.id,
        organizationId,
        product.id,
        warehouseId,
        lot.batch_number,
        lot.expiry_date,
        lot.received_at,
        lot.quantity_on_hand,
        lot.quantity_reserved,
        lot.unit_cost,
        lot.source_type,
        lot.source_reference_type,
        lot.source_reference_id,
      ],
    );
  }

  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point,last_movement_at,updated_at) values($1::uuid,$2::uuid,6,0,0,now(),now())",
    [product.id, warehouseId],
  );
  for (let index = 0; index < baselineLots.length; index += 1) {
    const lot = baselineLots[index];
    const after = (index + 1) * 3;
    await db.unsafe(
      "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id) values($1::uuid,$2::uuid,'purchase_receipt',3,$3::numeric,'purchase_receipt',$4::uuid,'P2 Onyx FEFO baseline lot receipt',$5::uuid,$6::uuid)",
      [product.id, warehouseId, after, lot.source_reference_id, manager.id, lot.id],
    );
  }

  const savedBalance = await balance(product.id);
  const savedLots = await lotManifest(product.id);
  assert.equal(Number(savedBalance.quantity_on_hand), 6);
  assert.equal(Number(savedBalance.quantity_reserved), 0);
  assert.deepEqual(
    savedLots.map((lot) => lot.id),
    baselineLots.map((lot) => lot.id).sort(),
    "The disposable product must start with exactly the two known dated FEFO lots.",
  );

  await reconcileAndRestoreLots({
    manager,
    product,
    baselineBalance: savedBalance,
    baselineLots: savedLots,
    delta: 2,
    suffix: suffix + "-POS",
  });

  const secondBaselineBalance = await balance(product.id);
  const secondBaselineLots = await lotManifest(product.id);
  await reconcileAndRestoreLots({
    manager,
    product,
    baselineBalance: secondBaselineBalance,
    baselineLots: secondBaselineLots,
    delta: -1,
    suffix: suffix + "-NEG",
  });

  process.stdout.write(
    "PASS Onyx FEFO batch manifest: positive and negative apply/rollback restore original lot IDs, quantities, expiry dates and source lineage exactly\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("FAIL Onyx FEFO batch manifest: " + String(error?.stack ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });
