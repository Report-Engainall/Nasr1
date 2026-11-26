import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for product gross margin acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function json(value) { return typeof value === "string" ? JSON.parse(value) : value; }
function cents(value) {
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  assert.ok(match, "expected an exact two-decimal source amount");
  const magnitude = BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  return match[1] === "-" ? -magnitude : magnitude;
}
function date(value) {
  const result = new Date(value);
  assert.ok(Number.isFinite(result.getTime()));
  return result.toISOString().slice(0, 10);
}
function expectSqlState(label, error, code) {
  assert.ok(error, label + " must fail");
  assert.equal(String(error.code), code, label + " SQLSTATE");
}

const databaseUrl = requiredEnv("TEST_DATABASE_URL");
const supabaseUrl = requiredEnv("E2E_SUPABASE_URL");
validateCashExpenseEndpoints(supabaseUrl, databaseUrl);

const organizationId = "a0000000-0000-0000-0000-000000000001";
const seedProductId = "a1000000-0000-0000-0000-000000000001";
const supplierId = "a2000000-0000-0000-0000-000000000001";
const warehouseId = "d0000000-0000-0000-0000-000000000001";
const unitCost = "125.50";
const testSuffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const testProductId = randomUUID();
const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(profile) {
  await db.unsafe("reset role").catch(() => {});
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1::uuid,$1::uuid,now(),now(),now(),null,'CI product gross margin acceptance','127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [profile.auth_user_id],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [profile.auth_user_id]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: profile.auth_user_id, email: profile.email, role: "authenticated", session_id: profile.auth_user_id }),
  ]);
  await db.unsafe("set role authenticated");
}

async function findProfile(email, role) {
  const rows = await db.unsafe(
    "select p.id,p.auth_user_id,p.email from public.profiles p " +
    "join public.user_roles r on r.profile_id=p.id " +
    "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true and r.role=$3 " +
    "order by p.id limit 2",
    [organizationId, email.toLowerCase(), role],
  );
  assert.equal(rows.length, 1, "expected one active test profile for role " + role);
  return rows[0];
}

async function callJson(sql, parameters = []) {
  const rows = await db.unsafe(sql, parameters);
  return json(rows[0].result);
}

async function createReceipt(manager, productId) {
  await setIdentity(manager);
  const poResult = await callJson(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [
      supplierId,
      warehouseId,
      db.json([{ product_id: productId, quantity: 1, unit_cost: unitCost }]),
      "P3 gross margin source-cost fixture " + testSuffix,
      "gm-po-" + testSuffix,
    ],
  );
  const purchaseOrderId = poResult.purchase_order?.id;
  assert.ok(purchaseOrderId, "purchase order must be created from a real product and supplier");

  await callJson("select public.submit_purchase_order($1::uuid) as result", [purchaseOrderId]);
  const visibleOrders = await callJson("select public.fetch_purchase_orders() as result");
  const visibleOrder = visibleOrders.find(item => item.id === purchaseOrderId);
  assert.ok(visibleOrder, "manager must read the purchase order through the tenant-scoped RPC");
  assert.equal(visibleOrder.organization_id, organizationId);

  const purchaseItem = visibleOrder.items?.find(item =>
    item.product_id === productId && Number(item.remaining_quantity) === 1
  );
  assert.ok(purchaseItem, "purchase-order item must preserve the exact product and remaining quantity");

  const receivedAt = await callJson(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [
      purchaseOrderId,
      db.json([{
        item_id: purchaseItem.id,
        quantity: 1,
        batch_number: "GM-" + testSuffix,
        expiry_date: date(Date.now() + 180 * 86_400_000),
      }]),
      "P3 verified source-cost fixture",
      "gm-receipt-" + testSuffix,
    ],
  );
  assert.ok(receivedAt.receipt?.id, "physical purchase receipt must be created");
  await db.unsafe("reset role");

  const receiptRows = await db.unsafe(
    "select pr.id::text as receipt_id,pr.received_cost::text as received_cost," +
    "pri.id::text as receipt_item_id,pri.unit_cost::text as unit_cost,pri.line_total::text as line_total," +
    "poi.unit_snapshot,poi.unit_cost::text as order_unit_cost " +
    "from public.purchase_receipts pr " +
    "join public.purchase_receipt_items pri on pri.organization_id=pr.organization_id and pri.receipt_id=pr.id " +
    "join public.purchase_order_items poi on poi.organization_id=pri.organization_id and poi.id=pri.purchase_order_item_id " +
    "where pr.organization_id=$1::uuid and pr.id=$2::uuid",
    [organizationId, receivedAt.receipt.id],
  );
  assert.equal(receiptRows.length, 1);
  assert.equal(receiptRows[0].unit_cost, unitCost);
  assert.equal(receiptRows[0].order_unit_cost, unitCost);
  assert.equal(cents(receiptRows[0].line_total), cents(unitCost));
  assert.equal(cents(receiptRows[0].received_cost), cents(unitCost));
  assert.ok(receiptRows[0].unit_snapshot?.trim());

  return {
    receiptId: receivedAt.receipt.id,
    receiptItemId: receiptRows[0].receipt_item_id,
    quantityUnit: receiptRows[0].unit_snapshot,
  };
}

async function transitionAsOwner(manager, orderId, status) {
  await setIdentity(manager);
  await db.unsafe("reset role");
  try {
    await db.unsafe(
      "update public.orders set status=$2::text,updated_at=now() where id=$1::uuid and organization_id=$3::uuid",
      [orderId, status, organizationId],
    );
  } finally {
    await db.unsafe("reset role");
  }
}

async function sideEffectCounts() {
  const rows = await db.unsafe(
    "select " +
    "(select count(*)::bigint from public.audit_logs where organization_id=$1::uuid) as audit_count," +
    "(select count(*)::bigint from public.inventory_movements im join public.products p on p.id=im.product_id where p.organization_id=$1::uuid) as movement_count," +
    "(select count(*)::bigint from public.customer_invoices where organization_id=$1::uuid) as invoice_count," +
    "(select count(*)::bigint from public.customer_return_credit_memos where organization_id=$1::uuid) as credit_memo_count," +
    "(select count(*)::bigint from public.accounting_journal_entries where organization_id=$1::uuid) as journal_count",
    [organizationId],
  );
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, String(value)]));
}

async function main() {
  const manager = await findProfile(requiredEnv("E2E_MANAGER_EMAIL"), "manager");
  const customer = await findProfile(requiredEnv("E2E_EMAIL"), "customer");

  const customerRows = await db.unsafe(
    "select id::text as id from public.customers where organization_id=$1::uuid and status='approved' order by created_at,id limit 1",
    [organizationId],
  );
  assert.equal(customerRows.length, 1, "one approved tenant customer is required for the isolated order fixture");
  const customerId = customerRows[0].id;

  const productRows = await db.unsafe(
    "insert into public.products(id,organization_id,category_id,name,item_code,barcode,description,unit,base_price,cost_price,min_stock,status) " +
    "select $1::uuid,p.organization_id,p.category_id,$2::text,$3::text,null," +
    "coalesce(p.description,'') || ' · isolated gross margin acceptance',$4::text,38500,0,0,'active' " +
    "from public.products p where p.organization_id=$5::uuid and p.id=$6::uuid returning id::text as id",
    [testProductId,"Gross margin acceptance "+testSuffix,"GM-"+testSuffix,"كرتون",organizationId,seedProductId],
  );
  assert.equal(productRows.length, 1, "isolated product fixture must be created in the test tenant");

  const receipt = await createReceipt(manager, testProductId);
  await setIdentity(manager);
  const createdOrder = await callJson(
    "select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) as result",
    [
      customerId,
      db.json([{ product_id: testProductId, quantity: 1 }]),
      "P3 gross margin source-cost acceptance " + testSuffix,
      "gm-order-" + testSuffix,
      "cash_on_delivery",
    ],
  );
  const orderId = createdOrder.id;
  assert.ok(orderId, "real staff order must be created for the isolated test product");

  await transitionAsOwner(manager, orderId, "confirmed");
  await transitionAsOwner(manager, orderId, "processing");
  await transitionAsOwner(manager, orderId, "shipped");

  const invoiceRows = await db.unsafe(
    "select i.id::text as invoice_id,i.currency,i.status,i.subtotal::text as subtotal," +
    "i.tax_amount::text as tax_amount,i.total_amount::text as total_amount," +
    "ii.id::text as invoice_item_id,ii.order_item_id::text as order_item_id," +
    "ii.product_id::text as product_id,ii.quantity::text as quantity,ii.unit as unit_of_measure,ii.line_total::text as line_total " +
    "from public.customer_invoices i " +
    "join public.customer_invoice_items ii on ii.organization_id=i.organization_id and ii.invoice_id=i.id " +
    "where i.organization_id=$1::uuid and i.order_id=$2::uuid",
    [organizationId, orderId],
  );
  assert.equal(invoiceRows.length, 1, "confirmed order must issue one source-linked invoice line");
  const invoice = invoiceRows[0];
  assert.equal(invoice.currency, "YER");
  assert.equal(invoice.status, "issued");
  assert.equal(invoice.order_item_id !== null, true);
  assert.equal(invoice.product_id, testProductId);
  assert.equal(invoice.unit_of_measure, receipt.quantityUnit);
  assert.equal(cents(invoice.tax_amount), 0n);
  assert.equal(cents(invoice.subtotal), cents(invoice.line_total));

  const saleRows = await db.unsafe(
    "select im.id::text as movement_id,im.quantity::text as quantity,im.inventory_batch_id::text as batch_id," +
    "b.unit_cost::text as unit_cost,b.source_type,b.receipt_id::text as receipt_id,b.receipt_item_id::text as receipt_item_id " +
    "from public.inventory_movements im " +
    "join public.inventory_batches b on b.id=im.inventory_batch_id and b.organization_id=$1::uuid " +
    "where im.organization_id=$1::uuid and im.reference_type='order' and im.reference_id=$2::uuid and im.movement_type='sale'",
    [organizationId, orderId],
  );
  assert.equal(saleRows.length, 1, "shipping must create one batch-linked sale movement");
  assert.equal(Number(saleRows[0].quantity), -1);
  assert.equal(saleRows[0].source_type, "purchase_receipt");
  assert.equal(saleRows[0].receipt_id, receipt.receiptId);
  assert.equal(saleRows[0].receipt_item_id, receipt.receiptItemId);
  assert.equal(cents(saleRows[0].unit_cost), cents(unitCost));

  const periodTo = date(new Date());
  const periodFrom = date(Date.now() - 89 * 86_400_000);
  const asOf = new Date().toISOString();
  const before = await sideEffectCounts();

  const managerDb = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  const customerDb = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    await setIdentity(manager);
    const grossMargin = await callJson(
      "select public.fetch_product_gross_margin_by_invoice_source($1::date,$2::date,$3::timestamptz) as result",
      [periodFrom, periodTo, asOf],
    );
    assert.equal(grossMargin.status, "VERIFIED");
    assert.equal(grossMargin.completePopulation, true);
    assert.equal(grossMargin.invoiceCount, 1);
    assert.equal(grossMargin.invoiceLineCount, 1);
    assert.equal(grossMargin.productCount, 1);
    assert.equal(grossMargin.verifiedProductCount, 1);
    assert.equal(grossMargin.currency, "YER");
    assert.equal(grossMargin.formulaId, "nasr1.product-gross-margin.invoice-line-net-batch-cogs");
    assert.equal(grossMargin.formulaVersion, "1");
    assert.equal(grossMargin.sideEffects, "NONE");

    const row = grossMargin.products?.[0];
    assert.ok(row, "one product gross margin row must be present");
    assert.equal(row.status, "VERIFIED");
    assert.equal(row.productRef, testProductId);
    assert.equal(row.currency, "YER");
    assert.equal(cents(row.grossInvoiceLineAmount), cents(invoice.line_total));
    assert.equal(cents(row.postedCreditAmount), 0n);
    assert.equal(cents(row.netRevenue), cents(invoice.line_total));
    assert.equal(cents(row.expectedShippedQuantity), 1000n);
    assert.equal(cents(row.actualShippedQuantity), 1000n);
    assert.equal(row.saleMovementCount, 1);
    assert.equal(row.uncostedMovementCount, 0);
    assert.equal(cents(row.costOfGoodsSold), cents(unitCost));
    assert.equal(cents(row.grossProfit), cents(invoice.line_total) - cents(unitCost));

    const expectedMarginNumerator = (cents(invoice.line_total) - cents(unitCost)) * 10_000n;
    const expectedMargin = Number(expectedMarginNumerator / cents(invoice.line_total)) / 100;
    assert.ok(Math.abs(Number(row.grossMarginPercent) - expectedMargin) <= 0.01);

    const evidenceIds = new Set(grossMargin.evidenceRecords.map(item => item.id));
    for (const id of row.evidenceIds) assert.ok(evidenceIds.has(id), "each product lineage ID must resolve to one evidence record");
    assert.equal(grossMargin.evidenceRecords.length, 3);
    assert.ok(grossMargin.evidenceRecords.every(item => item.status === "VERIFIED" && item.completeness === "COMPLETE"));

    await setIdentity(customer);
    let denied;
    try {
      await callJson(
        "select public.fetch_product_gross_margin_by_invoice_source($1::date,$2::date,$3::timestamptz) as result",
        [periodFrom, periodTo, asOf],
      );
    } catch (error) { denied = error; }
    assert.ok(denied, "customer must not read finance-only product gross margin");
    expectSqlState("non-finance customer gross margin read", denied, "42501");

    await setIdentity(manager);
    let invalidRange;
    try {
      await callJson(
        "select public.fetch_product_gross_margin_by_invoice_source($1::date,$2::date,$3::timestamptz) as result",
        [periodTo, periodFrom, asOf],
      );
    } catch (error) { invalidRange = error; }
    expectSqlState("reversed gross margin period", invalidRange, "22023");

    const futureAsOf = new Date(Date.now() + 10 * 60_000).toISOString();
    let future;
    try {
      await callJson(
        "select public.fetch_product_gross_margin_by_invoice_source($1::date,$2::date,$3::timestamptz) as result",
        [periodFrom, periodTo, futureAsOf],
      );
    } catch (error) { future = error; }
    expectSqlState("future gross margin snapshot", future, "22023");

    const after = await sideEffectCounts();
    assert.deepEqual(after, before, "gross margin RPC, denied request and invalid ranges must not write audit, inventory, invoice, memo or journal rows");

    process.stdout.write(
      "PASS PostgreSQL 17 product gross margin: receipt-rooted batch COGS, shipped quantity reconciliation, " +
      "invoice/order-line provenance, exact revenue minus source cost arithmetic, finance authorization, " +
      "customer denial, time guards, evidence lineage and read-only behavior.\n",
    );
  } finally {
    await Promise.all([managerDb.end(), customerDb.end()]);
  }
}

let transactionStarted = false;
main().catch(error => {
  process.stderr.write("FAIL PostgreSQL 17 product gross margin acceptance: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
}).finally(async () => {
  await db.unsafe("reset role").catch(() => {});
  if (transactionStarted) await db.unsafe("rollback").catch(() => {});
  await db.end({ timeout: 5 }).catch(() => {});
});
process.once("beforeExit", () => {});
db.unsafe("begin").then(() => { transactionStarted = true; return main(); }).then(() => {
  process.stdout.write("Local fixture transaction is ready for rollback.\n");
}).catch(error => {
  process.stderr.write("FAIL PostgreSQL 17 product gross margin transaction: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
}).finally(async () => {
  await db.unsafe("reset role").catch(() => {});
  if (transactionStarted) await db.unsafe("rollback").catch(() => {});
  await db.end({ timeout: 5 }).catch(() => {});
});
