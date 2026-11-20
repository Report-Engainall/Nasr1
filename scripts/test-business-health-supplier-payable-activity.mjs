import assert from "node:assert/strict";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for business-health supplier-payable acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) { return typeof value === "string" ? JSON.parse(value) : value; }
function minorUnits(value) {
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  assert.ok(match, "currency amount must be an exact decimal with at most two places");
  const absolute = BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  return match[1] === "-" ? -absolute : absolute;
}
const databaseUrl = requiredEnv("TEST_DATABASE_URL");
const supabaseUrl = requiredEnv("E2E_SUPABASE_URL");
const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
const expectedJournalId = requiredEnv("E2E_BUSINESS_HEALTH_POSTED_RECEIPT_JOURNAL_ID");
const expectedReceiptAmount = requiredEnv("E2E_BUSINESS_HEALTH_POSTED_RECEIPT_AMOUNT");
const expectedReceiptCurrency = requiredEnv("E2E_BUSINESS_HEALTH_POSTED_RECEIPT_CURRENCY");
validateCashExpenseEndpoints(supabaseUrl, databaseUrl);
const organizationId = "a0000000-0000-0000-0000-000000000001";
const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(client, authUserId, email) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$2,now(),now(),now(),null,'CI business-health read acceptance','127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [authUserId, authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(),
      role: "authenticated", session_id: authUserId }),
  ]);
  await client.unsafe("set role authenticated");
}

async function lookupProfile(email, requiredRole) {
  const rows = await db.unsafe(
    "select p.id,p.auth_user_id,p.email from public.profiles p " +
    (requiredRole ? "join public.user_roles r on r.profile_id=p.id " : "") +
    "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true " +
    (requiredRole ? "and r.role=$3 " : "") + "order by p.id limit 2",
    requiredRole ? [organizationId,email,requiredRole] : [organizationId,email],
  );
  assert.equal(rows.length, 1, "the seeded local profile must resolve uniquely: " + requiredRole);
  return rows[0];
}

async function expectCode(label, action, expectedCode) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should be rejected");
  assert.equal(String(caught.code), expectedCode, label + " SQLSTATE");
}

async function readActivity(client, from, to, asOf) {
  const rows = await client.unsafe(
    "select public.fetch_business_health_supplier_posted_payable_activity($1::date,$2::date,$3::timestamptz) as result",
    [from,to,asOf],
  );
  return asJson(rows[0].result);
}

async function sideEffectCounts() {
  const rows = await db.unsafe(
    "select " +
    "(select count(*)::bigint from public.audit_logs where organization_id=$1::uuid) as audit_count," +
    "(select count(*)::bigint from public.accounting_journal_entries where organization_id=$1::uuid) as journal_count," +
    "(select count(*)::bigint from public.purchase_receipt_accounting_postings where organization_id=$1::uuid) as receipt_posting_count," +
    "(select count(*)::bigint from public.purchase_supplier_credit_note_accounting_drafts where organization_id=$1::uuid) as supplier_credit_note_count",
    [organizationId],
  );
  return Object.fromEntries(Object.entries(rows[0]).map(([key,value])=>[key,String(value)]));
}

async function validatePayload(payload, expected) {
  assert.equal(payload.asOf, expected.asOf, "the SQL result must preserve the exact captured as-of instant");
  assert.deepEqual(payload.period, { from: expected.from, to: expected.to });
  assert.equal(payload.completeSourceAggregation, true);
  assert.equal(payload.settlementIncluded, false);
  assert.equal(payload.sideEffects, "NONE");
  assert.equal(payload.activityScope, "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS");
  assert.equal(payload.formulaId, "nasr1.posted-supplier-payable-credit-concentration");
  assert.equal(payload.formulaVersion, "1");
  assert.equal(typeof payload.formulaDescription, "string");
  assert.ok(payload.formulaDescription.length > 20 && payload.formulaDescription.length <= 1200);
  assert.ok(Number.isSafeInteger(payload.sourceEntryCount) && payload.sourceEntryCount >= 0);
  assert.ok(Number.isSafeInteger(payload.currencyCount) && payload.currencyCount === payload.currencies.length);
  assert.ok(["VERIFIED","NEEDS_REVIEW","EMPTY"].includes(payload.status));
  const allowedKeys = [
    "currency","status","supplierCount","sourceEntryCount","grossPayableCreditAmount",
    "postedSupplierCreditNoteDebitAmount","netPayableMovementAmount",
    "top5GrossPayableCreditAmount","top5GrossPayableCreditPercent",
  ].sort();
  const currencies = new Set();
  let entries = 0;
  for (const row of payload.currencies) {
    assert.deepEqual(Object.keys(row).sort(), allowedKeys, "the response must not expose supplier identities or financial account IDs");
    assert.match(row.currency, /^[A-Z]{3}$/);
    assert.ok(!currencies.has(row.currency), "currency rows must be unique");
    currencies.add(row.currency);
    assert.ok(["VERIFIED","NEEDS_REVIEW"].includes(row.status));
    assert.ok(Number.isSafeInteger(row.supplierCount) && row.supplierCount > 0);
    assert.ok(Number.isSafeInteger(row.sourceEntryCount) && row.sourceEntryCount >= row.supplierCount);
    entries += row.sourceEntryCount;
    const gross = minorUnits(row.grossPayableCreditAmount);
    const debit = minorUnits(row.postedSupplierCreditNoteDebitAmount);
    const net = minorUnits(row.netPayableMovementAmount);
    const top5 = minorUnits(row.top5GrossPayableCreditAmount);
    assert.equal(net, gross - debit, "gross posted payable credits minus separately posted credit-note debits must equal net movement");
    if (row.status === "VERIFIED") {
      assert.ok(gross > 0n);
      assert.ok(top5 >= 0n && top5 <= gross);
      assert.ok(Number.isFinite(row.top5GrossPayableCreditPercent));
      const expectedPercentHundredths = (top5 * 20000n + gross) / (2n * gross);
      assert.equal(minorUnits(row.top5GrossPayableCreditPercent), expectedPercentHundredths,
        "top-five percentage must match PostgreSQL half-up rounding to two decimal places without float arithmetic");
    } else {
      assert.equal(gross, 0n);
      assert.equal(top5, 0n);
      assert.equal(row.top5GrossPayableCreditPercent, null);
    }
  }
  assert.equal(entries, payload.sourceEntryCount);
  const expectedStatus = payload.sourceEntryCount === 0 ? "EMPTY" :
    payload.currencies.every(row => row.status === "VERIFIED") ? "VERIFIED" : "NEEDS_REVIEW";
  assert.equal(payload.status, expectedStatus);
  if (payload.status === "EMPTY") assert.equal(payload.currencyCount, 0);
}

async function main() {
  const version = await db.unsafe("select current_setting('server_version_num')::integer as version_num");
  assert.equal(Math.floor(Number(version[0].version_num) / 10000), 17, "acceptance must use isolated PostgreSQL 17");
  const manager = await lookupProfile(managerEmail, "manager");
  const customer = await lookupProfile(customerEmail, null);
  const managerDb = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  const customerDb = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    await Promise.all([
      setIdentity(managerDb, manager.auth_user_id, manager.email),
      setIdentity(customerDb, customer.auth_user_id, customer.email),
    ]);
    const privilege = await db.unsafe(
      "select has_function_privilege('anon','public.fetch_business_health_supplier_posted_payable_activity(date,date,timestamptz)','EXECUTE') as anon_can_execute," +
      "has_function_privilege('authenticated','public.fetch_business_health_supplier_posted_payable_activity(date,date,timestamptz)','EXECUTE') as authenticated_can_execute",
    );
    assert.equal(privilege[0].anon_can_execute, false);
    assert.equal(privilege[0].authenticated_can_execute, true);

    const to = new Date().toISOString().slice(0,10);
    const fromDate = new Date(to + "T00:00:00.000Z");
    fromDate.setUTCDate(fromDate.getUTCDate() - 91);
    const from = fromDate.toISOString().slice(0,10);
    const asOf = new Date().toISOString();
    const before = await sideEffectCounts();
    const linkedPostedJournal = await db.unsafe(
      "select e.status,e.source_type,posting.source_amount::text as source_amount,posting.source_currency " +
      "from public.accounting_journal_entries e join public.purchase_receipt_accounting_postings posting " +
      "on posting.organization_id=e.organization_id and posting.journal_entry_id=e.id " +
      "where e.organization_id=$1::uuid and e.id=$2::uuid",
      [organizationId,expectedJournalId],
    );
    assert.equal(linkedPostedJournal.length,1,"the source fixture must be linked to one journal");
    assert.equal(linkedPostedJournal[0].status,"posted");
    assert.equal(linkedPostedJournal[0].source_type,"purchase_receipt");
    assert.equal(linkedPostedJournal[0].source_amount,expectedReceiptAmount);
    assert.equal(linkedPostedJournal[0].source_currency,expectedReceiptCurrency);

    const payload = await readActivity(managerDb, from, to, asOf);
    await validatePayload(payload, { from, to, asOf });
    const observedCurrency = payload.currencies.find(row=>row.currency===expectedReceiptCurrency);
    assert.ok(observedCurrency,"the newly posted source-linked receipt must appear in its currency rollup");
    assert.equal(observedCurrency.status,"VERIFIED");
    assert.ok(minorUnits(observedCurrency.grossPayableCreditAmount)>=minorUnits(expectedReceiptAmount),
      "the source-linked payable credit must be present in the read-only aggregate");
    assert.ok(observedCurrency.sourceEntryCount>=1);

    await expectCode("same-tenant non-finance customer cannot read supplier payable activity",
      () => readActivity(customerDb, from, to, asOf), "42501");
    await expectCode("invalid supplier activity date range is rejected",
      () => readActivity(managerDb, to, from, asOf), "22023");
    const futureAsOf = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await expectCode("future supplier activity as-of is rejected",
      () => readActivity(managerDb, from, to, futureAsOf), "22023");

    const after = await sideEffectCounts();
    assert.deepEqual(after, before, "read RPC, denied calls and invalid inputs must not write audit, journal or source rows");
    process.stdout.write(
      "PASS PostgreSQL 17 business-health supplier payable acceptance: finance authorization, customer denial, " +
      "date/as-of guards, exact as-of and period, currency separation, exact-cent reconciliation, concentration ratio, " +
      "aggregate completeness, privacy allowlist, and no audit/journal/source writes.\n",
    );
  } finally {
    await Promise.all([managerDb.end(),customerDb.end()]);
  }
}
main().catch(error=>{
  process.stderr.write("FAIL PostgreSQL 17 business-health supplier payable acceptance: "+String(error?.stack??error)+"\n");
  process.exitCode=1;
}).finally(()=>db.end({timeout:5}).catch(()=>{}));
