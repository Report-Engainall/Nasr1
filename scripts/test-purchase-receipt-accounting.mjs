import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const apiUrl = new URL(requiredEnv("E2E_SUPABASE_URL"));
const connectionString = requiredEnv("TEST_DATABASE_URL");
if (apiUrl.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(apiUrl.hostname) || apiUrl.port !== "54321") {
  throw new Error("Purchase receipt accounting acceptance is restricted to the local Supabase API.");
}
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1"].includes(databaseUrl.hostname) || databaseUrl.port !== "54322") {
  throw new Error("Purchase receipt accounting acceptance is restricted to local PostgreSQL 17.");
}
const organizationId = "a0000000-0000-0000-0000-000000000001";
const productId = "a1000000-0000-0000-0000-000000000001";
const supplierId = "a2000000-0000-0000-0000-000000000001";
const warehouseId = "d0000000-0000-0000-0000-000000000001";
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for purchase receipt accounting acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) { return typeof value === "string" ? JSON.parse(value) : value; }
async function expectFailure(label, action, pattern) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should fail");
  if (pattern) assert.match(String(caught.message), pattern, label + " should fail for the expected reason");
  return caught;
}
async function findProfile(email) {
  const rows = await db.unsafe(
    "select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true limit 1",
    [organizationId, email],
  );
  assert.equal(rows.length, 1, "expected seeded isolated active profile for " + email);
  return rows[0];
}
async function setIdentity(authUserId, email) {
  await db.unsafe("reset role");
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: authUserId, email, role: "authenticated" })]);
  await db.unsafe("set role authenticated");
}
async function rpcJson(sql, args) { return asJson((await db.unsafe(sql, args))[0].result); }
async function makeReceipt(manager, cost) {
  await setIdentity(manager.auth_user_id, manager.email);
  const created = await rpcJson(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [supplierId, warehouseId, db.json([{ product_id: productId, quantity: 1, unit_cost: cost }]),
      "Isolated CI purchase-receipt accounting acceptance", randomUUID().replaceAll("-", "")],
  );
  const po = created.purchase_order;
  assert.ok(po?.id, "purchase order creation returns a source order");
  await rpcJson("select public.submit_purchase_order($1::uuid) as result", [po.id]);
  await db.unsafe("reset role");
  const itemRows = await db.unsafe(
    "select id from public.purchase_order_items where organization_id=$1::uuid and purchase_order_id=$2::uuid", [organizationId, po.id],
  );
  assert.equal(itemRows.length, 1, "test purchase order has one source line");
  await setIdentity(manager.auth_user_id, manager.email);
  const received = await rpcJson(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [po.id, db.json([{ item_id: itemRows[0].id, quantity: 1 }]), "CI physical receipt", "pr-" + randomUUID().replaceAll("-", "")],
  );
  assert.ok(received.receipt?.id, "receipt RPC returns a persisted receipt identifier");
  return { purchaseOrderId: po.id, receiptId: received.receipt.id, receiptNumber: received.receipt.receipt_number };
}
async function callPrepare(receiptId, inventoryAccountId, payableAccountId, key = randomUUID()) {
  return rpcJson(
    "select public.prepare_purchase_receipt_accounting_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid) as result",
    [receiptId, inventoryAccountId, payableAccountId, key],
  );
}

async function main() {
  const manager = await findProfile(managerEmail);
  const customer = await findProfile(customerEmail);
  const accountSuffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  await db.unsafe("reset role");
  const accounts = await db.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,is_active,created_by_profile_id) " +
    "values($1::uuid,$2,$3,'asset',true,$4::uuid),($1::uuid,$5,$6,'liability',true,$4::uuid) returning id,code,account_type",
    [organizationId, "P2.INV." + accountSuffix, "CI مخزون شراء", manager.id, "P2.AP." + accountSuffix, "CI ذمم موردين"],
  );
  const inventoryAccount = accounts.find((row) => row.account_type === "asset");
  const payableAccount = accounts.find((row) => row.account_type === "liability");
  assert.ok(inventoryAccount && payableAccount, "isolated test asset and liability accounts are available");

  const first = await makeReceipt(manager, 100.25);
  await setIdentity(manager.auth_user_id, manager.email);
  const prepared = await callPrepare(first.receiptId, inventoryAccount.id, payableAccount.id);
  assert.equal(prepared.receipt_id, first.receiptId);
  assert.equal(prepared.receipt_number, first.receiptNumber);
  assert.equal(prepared.status, "draft", "receiving goods creates only a draft journal");
  assert.equal(Number(prepared.source_amount), 100.25);
  assert.equal(prepared.source_currency, "YER");
  assert.equal(prepared.replayed, false);
  assert.ok(prepared.journal_entry_id);

  const replay = await callPrepare(first.receiptId, inventoryAccount.id, payableAccount.id, randomUUID());
  assert.equal(replay.journal_entry_id, prepared.journal_entry_id, "a retry must reuse the one receipt-linked journal");
  assert.equal(replay.replayed, true);

  await setIdentity(customer.auth_user_id, customer.email);
  await expectFailure("ordinary customer cannot inspect finance purchase receipt queue",
    () => db.unsafe("select public.fetch_purchase_receipt_accounting_queue($1::uuid,$2::integer)", [first.purchaseOrderId, 50]),
    /finance permission required/i);

  await setIdentity(manager.auth_user_id, manager.email);
  await expectFailure("authenticated staff cannot directly insert source-posting rows",
    () => db.unsafe("insert into public.purchase_receipt_accounting_postings(organization_id,receipt_id) values($1::uuid,$2::uuid)", [organizationId, first.receiptId]),
    /permission denied/i);

  await db.unsafe("reset role");
  const journalRows = await db.unsafe(
    "select e.status,e.source_type,e.source_reference,e.entry_number::text as entry_number," +
    "sum(l.debit)::numeric(18,2)::text as debits,sum(l.credit)::numeric(18,2)::text as credits " +
    "from public.accounting_journal_entries e join public.accounting_journal_lines l " +
    "on l.organization_id=e.organization_id and l.journal_entry_id=e.id " +
    "where e.organization_id=$1::uuid and e.id=$2::uuid group by e.id",
    [organizationId, prepared.journal_entry_id],
  );
  assert.equal(journalRows.length, 1, "purchase receipt creates one journal with lines");
  assert.equal(journalRows[0].status, "draft", "posting is explicitly left to finance review");
  assert.equal(journalRows[0].source_type, "purchase_receipt");
  assert.equal(journalRows[0].source_reference, first.receiptNumber);
  assert.equal(Number(journalRows[0].debits), 100.25);
  assert.equal(Number(journalRows[0].credits), 100.25, "source journal is exactly balanced");
  const links = await db.unsafe(
    "select count(*)::integer as count from public.purchase_receipt_accounting_postings where organization_id=$1::uuid and receipt_id=$2::uuid",
    [organizationId, first.receiptId],
  );
  assert.equal(links[0].count, 1, "exactly one durable source-to-journal link exists");

  const incomplete = await makeReceipt(manager, null);
  await setIdentity(manager.auth_user_id, manager.email);
  await expectFailure("receipt with unknown source cost cannot create a journal",
    () => callPrepare(incomplete.receiptId, inventoryAccount.id, payableAccount.id),
    /no positive source-backed received cost/i);
  const orgCurrency = await db.unsafe("select currency from public.organizations where id=$1::uuid", [organizationId]);
  assert.equal(orgCurrency[0]?.currency, "YER", "the isolated test tenant uses its explicit configured YER currency");
  process.stdout.write("PASS purchase receipt accounting: source-backed cost only, YER policy, balanced inventory/AP draft, durable source link, idempotent replay, customer denial, direct-write denial, and unknown-cost rejection\n");
}
main().catch((error) => {
  process.stderr.write("FAIL purchase receipt accounting acceptance: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
}).finally(async () => { await db.end({ timeout: 5 }).catch(() => {}); });
