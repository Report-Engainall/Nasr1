import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for replenishment PostgreSQL 17 acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) { return typeof value === "string" ? JSON.parse(value) : value; }
function expectSqlState(label, error, expected) {
  assert.ok(error, label + " must be rejected");
  assert.equal(String(error.code), expected, label + " SQLSTATE");
}

const databaseUrl = requiredEnv("TEST_DATABASE_URL");
const supabaseUrl = requiredEnv("E2E_SUPABASE_URL");
validateCashExpenseEndpoints(supabaseUrl, databaseUrl);

const organizationId = "a0000000-0000-0000-0000-000000000001";
const baseProductId = requiredEnv("E2E_PURCHASE_PRODUCT_ID");
const supplierId = requiredEnv("E2E_PURCHASE_SUPPLIER_ID");
const warehouseId = requiredEnv("E2E_PURCHASE_WAREHOUSE_ID");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const committedProductId = randomUUID();
const mismatchProductId = randomUUID();
const convertedProductId = randomUUID();
const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(profile) {
  await db.unsafe("reset role").catch(() => {});
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1::uuid,$1::uuid,now(),now(),now(),null,'CI replenishment commitment acceptance','127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [profile.auth_user_id],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [profile.auth_user_id]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: profile.auth_user_id,
      email: profile.email,
      role: "authenticated",
      session_id: profile.auth_user_id,
    }),
  ]);
  await db.unsafe("set role authenticated");
}

async function findProfile(email, role) {
  const rows = await db.unsafe(
    "select p.id,p.auth_user_id,p.email from public.profiles p " +
    "join public.user_roles r on r.profile_id=p.id " +
    "where p.organization_id=$1::uuid and lower(p.email)=lower($2) " +
    "and p.is_active=true and r.role=$3 order by p.id limit 2",
    [organizationId, email.toLowerCase(), role],
  );
  assert.equal(rows.length, 1, "expected exactly one active local " + role + " profile");
  return rows[0];
}

async function rpc(sql, parameters = []) {
  const rows = await db.unsafe(sql, parameters);
  return asJson(rows[0]?.result);
}

async function createProduct(id, itemCode, name) {
  await db.unsafe("reset role");
  const rows = await db.unsafe(
    "insert into public.products(" +
    "id,organization_id,category_id,name,item_code,barcode,description,unit,base_price,cost_price,min_stock,status" +
    ") select $1::uuid,p.organization_id,p.category_id,$2::text,$3::text,null," +
    "coalesce(p.description,'') || ' · isolated replenishment acceptance','carton'," +
    "p.base_price,p.cost_price,0,'active' " +
    "from public.products p where p.organization_id=$4::uuid and p.id=$5::uuid " +
    "returning id::text as id,unit,item_code",
    [id, name, itemCode, organizationId, baseProductId],
  );
  assert.equal(rows.length, 1, "test product must be cloned from the existing tenant product");
  assert.equal(rows[0].unit, "carton");
}

async function createOrder(manager, productId, quantity, label) {
  await setIdentity(manager);
  const created = await rpc(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [
      supplierId,
      warehouseId,
      db.json([{ product_id: productId, quantity, unit_cost: 100 }]),
      "P2 replenishment source acceptance " + label + " " + suffix,
      "p2-replenishment-" + label + "-" + suffix,
    ],
  );
  const purchaseOrderId = created?.purchase_order?.id;
  assert.ok(purchaseOrderId, label + " purchase order must be persisted by the existing RPC");
  await db.unsafe("reset role");
  const items = await db.unsafe(
    "select id::text as id,quantity_ordered::text as quantity_ordered," +
    "quantity_received::text as quantity_received,unit_snapshot " +
    "from public.purchase_order_items where organization_id=$1::uuid and purchase_order_id=$2::uuid",
    [organizationId, purchaseOrderId],
  );
  assert.equal(items.length, 1, label + " purchase order must contain one source line");
  return { id: purchaseOrderId, item: items[0] };
}

async function submitOrder(manager, order) {
  await setIdentity(manager);
  const result = await rpc("select public.submit_purchase_order($1::uuid) as result", [order.id]);
  assert.ok(result, "existing submit RPC must accept " + order.id);
}

async function receiveOrder(manager, order, quantity, label) {
  await setIdentity(manager);
  const result = await rpc(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [
      order.id,
      db.json([{
        item_id: order.item.id,
        quantity,
        batch_number: "P2-REP-" + label + "-" + suffix,
        expiry_date: "2027-12-31",
      }]),
      "P2 isolated physical receipt " + label,
      "p2-replenishment-receipt-" + label + "-" + suffix,
    ],
  );
  assert.ok(result?.receipt?.id, label + " must create an actual purchase receipt");
}

async function cancelOrder(manager, order) {
  await setIdentity(manager);
  const result = await rpc(
    "select public.cancel_purchase_order($1::uuid,$2::text) as result",
    [order.id, "P2 isolated acceptance cancellation " + suffix],
  );
  assert.ok(result, "existing cancellation RPC must accept the disposable submitted PO");
}

async function tableCounts() {
  await db.unsafe("reset role");
  const rows = await db.unsafe(
    "select " +
    "(select count(*)::bigint from public.purchase_orders where organization_id=$1::uuid) as orders," +
    "(select count(*)::bigint from public.purchase_order_items where organization_id=$1::uuid) as order_items," +
    "(select count(*)::bigint from public.purchase_receipts where organization_id=$1::uuid) as receipts," +
    "(select count(*)::bigint from public.purchase_receipt_items where organization_id=$1::uuid) as receipt_items," +
    "(select count(*)::bigint from public.inventory_balances ib join public.warehouses w on w.id=ib.warehouse_id where w.organization_id=$1::uuid) as balances," +
    "(select count(*)::bigint from public.inventory_movements im join public.warehouses w on w.id=im.warehouse_id where w.organization_id=$1::uuid) as movements," +
    "( select count(*)::bigint from public.product_unit_conversions where organization_id=$1::uuid) as unit_conversions," +
    "(select count(*)::bigint from public.audit_logs where organization_id=$1::uuid) as audit_rows",
    [organizationId],
  );
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, String(value)]));
}

async function expectSqlStateInSavepoint(label, sql, parameters, code, savepoint) {
  await db.unsafe("savepoint " + savepoint);
  let caught;
  try {
    await db.unsafe(sql, parameters);
  } catch (error) {
    caught = error;
  }
  await db.unsafe("rollback to savepoint " + savepoint);
  await db.unsafe("release savepoint " + savepoint);
  expectSqlState(label, caught, code);
}

async function main() {
  const manager = await findProfile(requiredEnv("E2E_MANAGER_EMAIL"), "manager");
  const customer = await findProfile(requiredEnv("E2E_EMAIL"), "customer");

  await createProduct(committedProductId, "P2-REP-COMMIT-" + suffix, "P2 replenishment committed quantity " + suffix);
  await createProduct(mismatchProductId, "P2-REP-UOM-" + suffix, "P2 replenishment UOM mismatch " + suffix);
  await createProduct(convertedProductId, "P2-REP-CONV-" + suffix, "P2 replenishment converted UOM " + suffix);

  // Confirmed but not yet physically received: 100 units remain.
  const submitted = await createOrder(manager, committedProductId, 100, "submitted");
  await submitOrder(manager, submitted);

  // Partial receiving: 40 ordered - 15 physically received = 25 still committed.
  const partial = await createOrder(manager, committedProductId, 40, "partial");
  await submitOrder(manager, partial);
  await receiveOrder(manager, partial, 15, "partial");

  // These three states must not inflate the incoming commitment: draft, cancelled, fully received.
  const draft = await createOrder(manager, committedProductId, 50, "draft");
  const cancelled = await createOrder(manager, committedProductId, 70, "cancelled");
  await submitOrder(manager, cancelled);
  await cancelOrder(manager, cancelled);
  const fullyReceived = await createOrder(manager, committedProductId, 30, "fully-received");
  await submitOrder(manager, fullyReceived);
  await receiveOrder(manager, fullyReceived, 30, "fully-received");

  // This order was submitted, but its last source update is after the requested snapshot.
  const afterSnapshot = await createOrder(manager, committedProductId, 200, "after-snapshot");
  await submitOrder(manager, afterSnapshot);

  // A changed product base unit with no saved factor must withhold the open PO commitment.
  const mismatch = await createOrder(manager, mismatchProductId, 9, "uom-mismatch");
  await submitOrder(manager, mismatch);
  await db.unsafe("reset role");
  await db.unsafe("update public.products set unit='piece' where id=$1::uuid and organization_id=$2::uuid", [
    mismatchProductId, organizationId,
  ]);

  // A second source order proves the current v2 contract converts the saved purchase-unit
  // remainder to base units using the tenant/product-scoped integer multiplier.
  const converted = await createOrder(manager, convertedProductId, 9, "uom-conversion");
  await submitOrder(manager, converted);
  await db.unsafe("reset role");
  await db.unsafe("update public.products set unit='piece' where id=$1::uuid and organization_id=$2::uuid", [
    convertedProductId, organizationId,
  ]);
  await db.unsafe(
    "insert into public.product_unit_conversions(organization_id,product_id,unit_name,base_units_per_unit) " +
    "values($1::uuid,$2::uuid,'carton',12)",
    [organizationId, convertedProductId],
  );

  const asOf = new Date(Date.now() + 20000).toISOString();
  const periodTo = asOf.slice(0, 10);
  const periodFromDate = new Date(Date.parse(periodTo + "T00:00:00.000Z") - 89 * 86400000);
  const periodFrom = periodFromDate.toISOString().slice(0, 10);

  // Bypass only update triggers for this disposable future-timestamp fixture. The transaction
  // is rolled back at the end; production and persistent test data are never touched.
  await db.unsafe("set local session_replication_role='replica'");
  await db.unsafe(
    "update public.purchase_orders set updated_at=$2::timestamptz where id=$1::uuid",
    [afterSnapshot.id, new Date(Date.parse(asOf) + 10000).toISOString()],
  );
  await db.unsafe("set local session_replication_role='origin'");

  const before = await tableCounts();
  await setIdentity(manager);
  const aggregate = await rpc(
    "select public.get_inventory_intelligence_aggregate($1::date,$2::date,$3::timestamptz) as result",
    [periodFrom, periodTo, asOf],
  );

  assert.equal(aggregate.status, "OK", "manager must receive the complete tenant inventory-intelligence aggregate");
  assert.equal(aggregate.sideEffects, "NONE", "aggregate is read-only");
  assert.equal(aggregate.period?.from, periodFrom);
  assert.equal(aggregate.period?.to, periodTo);

  const committedProduct = aggregate.replenishmentProducts.find(
    row => row.productRef === "P2-REP-COMMIT-" + suffix,
  );
  assert.ok(committedProduct, "committed test product must be in the aggregate");
  const incoming = committedProduct.incomingPurchaseQuantity;
  assert.equal(incoming.key, "inventory.incoming_purchase_order_quantity");
  assert.equal(incoming.unit, "QUANTITY");
  assert.equal(incoming.unitOfMeasure, "carton");
  assert.equal(incoming.status, "VERIFIED");
  assert.equal(incoming.completeness, "COMPLETE");
  assert.equal(incoming.quality, "ACCEPTABLE");
  assert.equal(Number(incoming.value), 125, "expected 100 submitted + (40 ordered - 15 received), excluding all non-open states");
  assert.equal(incoming.lineage.formulaId, "inventory.open-purchase-order-commitments");
  assert.equal(incoming.lineage.formulaVersion, "2");
  assert.equal(incoming.lineage.transformations[0].includes("convert the remainder to product base units"), true);
  const incomingEvidenceId = "purchase-order-commitments:" + committedProductId;
  assert.deepEqual(incoming.lineage.evidenceIds, [incomingEvidenceId]);
  const incomingEvidence = aggregate.evidenceRecords.find(item => item.id === incomingEvidenceId);
  assert.ok(incomingEvidence, "open-PO metric lineage must resolve to source evidence");
  assert.equal(incomingEvidence.status, "VERIFIED");
  assert.equal(incomingEvidence.completeness, "COMPLETE");

  const salesWindow = committedProduct.soldQuantityWindow;
  assert.equal(salesWindow.period?.from, periodFrom, "sales metric evidence must retain the exact requested start date");
  assert.equal(salesWindow.period?.to, periodTo, "sales metric evidence must retain the exact requested end date");
  assert.equal(salesWindow.asOf, asOf, "sales metric must share the aggregate snapshot clock");
  assert.equal(salesWindow.lineage.calculatedAt, asOf, "sales metric lineage must use the aggregate calculation clock");

  const mismatchProduct = aggregate.replenishmentProducts.find(
    row => row.productRef === "P2-REP-UOM-" + suffix,
  );
  assert.ok(mismatchProduct, "UOM mismatch product must be in the aggregate");
  const mismatchMetric = mismatchProduct.incomingPurchaseQuantity;
  assert.equal(mismatchMetric.value, null, "mismatched unit snapshot must never be summed or converted");
  assert.equal(mismatchMetric.status, "NEEDS_REVIEW");
  assert.equal(mismatchMetric.completeness, "PARTIAL");
  assert.equal(mismatchMetric.quality, "WARNINGS");
  assert.ok(mismatchMetric.warnings.includes("OPEN_PURCHASE_ORDER_UNIT_CONVERSION_UNRESOLVED"));
  const mismatchEvidenceId = "purchase-order-commitments:" + mismatchProductId;
  const mismatchEvidence = aggregate.evidenceRecords.find(item => item.id === mismatchEvidenceId);
  assert.ok(mismatchEvidence);
  assert.equal(mismatchEvidence.status, "NEEDS_REVIEW");

  const convertedProduct = aggregate.replenishmentProducts.find(
    row => row.productRef === "P2-REP-CONV-" + suffix,
  );
  assert.ok(convertedProduct, "converted-UOM product must be in the aggregate");
  const convertedMetric = convertedProduct.incomingPurchaseQuantity;
  assert.equal(convertedMetric.unitOfMeasure, "piece");
  assert.equal(convertedMetric.value, 108, "9 cartons must normalize to 108 base pieces using the saved factor 12");
  assert.equal(convertedMetric.status, "VERIFIED");
  assert.equal(convertedMetric.completeness, "COMPLETE");
  assert.equal(convertedMetric.quality, "ACCEPTABLE");
  assert.equal(convertedMetric.lineage.formulaId, "inventory.open-purchase-order-commitments");
  assert.equal(convertedMetric.lineage.formulaVersion, "2");
  const convertedEvidence = aggregate.evidenceRecords.find(
    item => item.id === "purchase-order-commitments:" + convertedProductId,
  );
  assert.ok(convertedEvidence, "converted incoming metric must resolve its evidence");
  assert.equal(convertedEvidence.status, "VERIFIED");
  assert.equal(convertedEvidence.source.version, "v2");

  await expectSqlStateInSavepoint(
    "ordinary customer inventory intelligence read",
    "select public.get_inventory_intelligence_aggregate($1::date,$2::date,$3::timestamptz)",
    [periodFrom, periodTo, asOf],
    "42501",
    "rep_customer_denied",
  );

  await setIdentity(manager);
  await expectSqlStateInSavepoint(
    "reversed inventory evidence period",
    "select public.get_inventory_intelligence_aggregate($1::date,$2::date,$3::timestamptz)",
    [periodTo, periodFrom, asOf],
    "22023",
    "rep_bad_period",
  );

  const after = await tableCounts();
  assert.deepEqual(after, before, "inventory intelligence read and denied/invalid requests must not mutate PO, receipt, inventory or audit records");

  process.stdout.write(
    "PASS PostgreSQL 17 replenishment commitments: submitted remaining quantities, partial receipt netting, " +
    "draft/cancelled/fully-received and post-snapshot exclusions, exact period/as-of lineage, UOM conversion and fail-closed, " +
    "manager authorization, customer denial, invalid-period denial and read-only behavior.\n",
  );
}

async function run() {
  let transactionStarted = false;
  try {
    await db.unsafe("begin");
    transactionStarted = true;
    await main();
  } catch (error) {
    process.stderr.write("FAIL PostgreSQL 17 replenishment commitment acceptance: " + String(error?.stack ?? error) + "\n");
    process.exitCode = 1;
  } finally {
    await db.unsafe("reset role").catch(() => {});
    if (transactionStarted) await db.unsafe("rollback").catch(() => {});
    await db.end({ timeout: 5 }).catch(() => {});
  }
}
void run();
