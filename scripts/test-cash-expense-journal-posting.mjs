import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

const connectionString = requiredEnv("TEST_DATABASE_URL");
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
// Validate BOTH targets before opening the database connection. Dynamic ports are expected;
// remote hosts and protocols remain rejected by the shared, unit-tested guard.
validateCashExpenseEndpoints(requiredEnv("E2E_SUPABASE_URL"), connectionString);
const organizationId = "a0000000-0000-0000-0000-000000000001";
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for cash-expense accounting acceptance.");
  return value.replace(/^\"(.*)\"$/s, "$1");
}
function asJson(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}
async function expectFailure(label, action, pattern) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should fail");
  if (pattern) assert.match(String(caught.message), pattern, label + " should fail for the expected reason");
  return caught;
}
async function setIdentity(client, authUserId, email) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [authUserId, authUserId]);
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated", session_id: authUserId })]);
  await client.unsafe("set role authenticated");
}
async function createAccount(code, name, type) {
  const rows = await db.unsafe("insert into public.accounting_accounts(organization_id,code,name,account_type,is_active) values($1::uuid,$2,$3,$4,true) returning id", [organizationId, code, name, type]);
  assert.equal(rows.length, 1);
  return rows[0].id;
}
async function recordExpense(client, key, description, amount) {
  return asJson((await client.unsafe("select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date) as result", [key, "Local E2E Accounting", description, amount, "YER", "cash", "P2 accounting acceptance", "2026-10-21"]))[0].result);
}
async function createDraft(client, expenseId, expenseAccountId, settlementAccountId, key) {
  return asJson((await client.unsafe("select public.create_cash_expense_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid) as result", [expenseId, expenseAccountId, settlementAccountId, key]))[0].result);
}
async function postJournal(client, journalId) {
  return asJson((await client.unsafe("select public.post_general_journal_entry($1::uuid) as result", [journalId]))[0].result);
}
async function voidExpense(client, expenseId, reason) {
  return asJson((await client.unsafe("select public.void_cash_expense($1::uuid,$2::text) as result", [expenseId, reason]))[0].result);
}

async function main() {
  const managerRows = await db.unsafe("select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true", [organizationId, managerEmail]);
  assert.equal(managerRows.length, 1, "local fixture must contain exactly one active organization-scoped manager");
  const manager = managerRows[0];
  const customerEmail = process.env.E2E_EMAIL?.trim().toLowerCase();
  const customerRows = customerEmail ? await db.unsafe("select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true", [organizationId, customerEmail]) : [];
  assert.equal(customerRows.length, 1, "local fixture must contain the paired customer for role-denial acceptance");
  const customer = customerRows[0];
  const suffix = randomUUID().replaceAll("-", "").slice(-12).toUpperCase();
  const expenseAccount = await createAccount("P2-E2E-EXP-" + suffix, "P2 E2E Operating Expense " + suffix, "expense");
  const settlementAccount = await createAccount("P2-E2E-CASH-" + suffix, "P2 E2E Cash " + suffix, "asset");
  const alternateExpenseAccount = await createAccount("P2-E2E-EXP2-" + suffix, "P2 E2E Alternate Expense " + suffix, "expense");
  const managerDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const concurrentA = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const concurrentB = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const customerDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    await setIdentity(managerDb, manager.auth_user_id, manager.email);
    await setIdentity(concurrentA, manager.auth_user_id, manager.email);
    await setIdentity(concurrentB, manager.auth_user_id, manager.email);
    const expenseKey = randomUUID();
    const expense = await recordExpense(managerDb, expenseKey, "P2 expense journal acceptance", "125.50");
    assert.equal(expense.status, "posted");
    assert.equal(expense.replayed, false);
    const expenseReplay = await recordExpense(managerDb, expenseKey, "P2 expense journal acceptance", "125.50");
    assert.equal(expenseReplay.expense_id, expense.expense_id);
    assert.equal(expenseReplay.replayed, true);
    await expectFailure("expense idempotency rejects a changed amount", () => recordExpense(managerDb, expenseKey, "P2 expense journal acceptance", "126.00"), /idempotency key payload conflict/i);
    const draftKey = randomUUID();
    const [draftA, draftB] = await Promise.all([
      createDraft(concurrentA, expense.expense_id, expenseAccount, settlementAccount, draftKey),
      createDraft(concurrentB, expense.expense_id, expenseAccount, settlementAccount, draftKey),
    ]);
    assert.equal(draftA.journal_entry_id, draftB.journal_entry_id, "concurrent draft calls must return one journal id");
    assert.equal([draftA, draftB].filter((x) => x.replayed === false).length, 1, "exactly one call creates the journal");
    assert.equal([draftA, draftB].filter((x) => x.replayed === true).length, 1, "the racing call replays the journal");
    const journalId = draftA.journal_entry_id;
    assert.equal(draftA.status, "draft");
    await expectFailure("an active journal cannot be remapped to a different expense account", () => createDraft(managerDb, expense.expense_id, alternateExpenseAccount, settlementAccount, randomUUID()), /different account mapping/i);
    const links = await db.unsafe("select sp.id,sp.posting_kind,sp.source_amount::text,sp.source_currency,sp.expense_account_id,sp.settlement_account_id,je.status,je.source_type,je.source_reference from public.accounting_source_postings sp join public.accounting_journal_entries je on je.id=sp.journal_entry_id and je.organization_id=sp.organization_id where sp.organization_id=$1::uuid and sp.source_type='cash_expense' and sp.source_id=$2::uuid and sp.posting_kind='original'", [organizationId, expense.expense_id]);
    assert.equal(links.length, 1, "one immutable original source-posting link must exist");
    assert.equal(links[0].source_amount, "125.50");
    assert.equal(links[0].source_currency, "YER");
    assert.equal(links[0].status, "draft");
    assert.equal(links[0].source_type, "cash_expense");
    assert.equal(links[0].source_reference, expense.expense_id);
    const lines = await db.unsafe("select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number", [organizationId, journalId]);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((x) => x.account_id), [expenseAccount, settlementAccount]);
    assert.equal(lines[0].debit, "125.50");
    assert.equal(lines[0].credit, "0.00");
    assert.equal(lines[1].debit, "0.00");
    assert.equal(lines[1].credit, "125.50");
    await expectFailure("authenticated finance user cannot write directly to immutable source-posting links", () => managerDb.unsafe("insert into public.accounting_source_postings(organization_id,source_type,source_id,posting_kind,journal_entry_id,source_amount,source_currency,expense_account_id,settlement_account_id,idempotency_key,payload_fingerprint,created_by_profile_id) values($1::uuid,'cash_expense',$2::uuid,'original',$3::uuid,125.50,'YER',$4::uuid,$5::uuid,$6::uuid,repeat('a',32),$7::uuid)", [organizationId, expense.expense_id, journalId, expenseAccount, settlementAccount, randomUUID(), manager.id]), /permission denied/i);
    const posted = await postJournal(managerDb, journalId);
    assert.equal(posted.status, "posted");
    assert.equal(posted.replayed, false);
    const postedReplay = await postJournal(managerDb, journalId);
    assert.equal(postedReplay.status, "posted");
    assert.equal(postedReplay.replayed, true, "journal posting replay is a no-op");
    const ledger = asJson((await managerDb.unsafe("select public.fetch_general_ledger(null,null,null,100,0) as result"))[0].result);
    const sourceLedgerRow = ledger.entries.find((entry) => entry.id === journalId);
    assert.ok(sourceLedgerRow, "posted source journal must appear in the actual general-ledger RPC");
    assert.equal(sourceLedgerRow.status, "posted");
    assert.equal(sourceLedgerRow.source_type, "cash_expense");
    assert.equal(sourceLedgerRow.source_reference, expense.expense_id);
    assert.equal(ledger.summary.debit_total, ledger.summary.credit_total, "general ledger summary remains balanced");
    const expectedAudit = await db.unsafe("select action,actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='cash_expense' and entity_id=$2::uuid order by action", [organizationId, expense.expense_id]);
    assert.ok(expectedAudit.some((row) => row.action === "cash_expense.recorded" && row.actor_id === manager.id));
    assert.ok(expectedAudit.some((row) => row.action === "accounting.cash_expense_journal_draft_created" && row.actor_id === manager.id));
    const journalAudit = await db.unsafe("select action from public.audit_logs where organization_id=$1::uuid and entity_type='accounting_journal_entry' and entity_id=$2::uuid", [organizationId, journalId]);
    assert.ok(journalAudit.some((row) => row.action === "accounting.journal_posted"));
    const inbox = asJson((await managerDb.unsafe("select public.fetch_cash_expense_accounting_inbox(50,0,'posted') as result"))[0].result);
    assert.ok(inbox.items.some((item) => item.id === expense.expense_id && item.journal_entry_id === journalId && item.journal_status === "posted"), "cash-expense accounting inbox must show the linked posted journal");
    const raceExpense = await recordExpense(managerDb, randomUUID(), "P2 expense post/void race", "50.00");
    const raceDraft = await createDraft(managerDb, raceExpense.expense_id, expenseAccount, settlementAccount, randomUUID());
    assert.equal(raceDraft.status, "draft");
    const racePostClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
    const raceVoidClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
    try {
      await Promise.all([setIdentity(racePostClient, manager.auth_user_id, manager.email), setIdentity(raceVoidClient, manager.auth_user_id, manager.email)]);
      const [postOutcome, voidOutcome] = await Promise.allSettled([postJournal(racePostClient, raceDraft.journal_entry_id), voidExpense(raceVoidClient, raceExpense.expense_id, "P2 concurrent source cancellation")]);
      assert.equal(voidOutcome.status, "fulfilled", "source void must complete under a concurrent journal post");
      assert.equal(voidOutcome.value.status, "void");
      const source = (await db.unsafe("select status,amount::text,currency from public.cash_expenses where organization_id=$1::uuid and id=$2::uuid", [organizationId, raceExpense.expense_id]))[0];
      assert.equal(source.status, "void");
      const original = await db.unsafe("select je.id,je.status,sp.source_amount::text from public.accounting_source_postings sp join public.accounting_journal_entries je on je.id=sp.journal_entry_id and je.organization_id=sp.organization_id where sp.organization_id=$1::uuid and sp.source_id=$2::uuid and sp.posting_kind='original'", [organizationId, raceExpense.expense_id]);
      assert.equal(original.length, 1);
      if (original[0].status === "posted") {
        assert.equal(postOutcome.status, "fulfilled", "a journal that posted first must report success");
        const reversals = await db.unsafe("select sp.journal_entry_id,je.status,sp.source_amount::text,sp.reversal_reason from public.accounting_source_postings sp join public.accounting_journal_entries je on je.id=sp.journal_entry_id and je.organization_id=sp.organization_id where sp.organization_id=$1::uuid and sp.source_id=$2::uuid and sp.posting_kind='reversal'", [organizationId, raceExpense.expense_id]);
        assert.equal(reversals.length, 1, "void after journal posting must create exactly one counter-entry");
        assert.equal(reversals[0].status, "posted");
        assert.equal(reversals[0].source_amount, source.amount);
        assert.equal(reversals[0].reversal_reason, "P2 concurrent source cancellation");
        const reversalLines = await db.unsafe("select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number", [organizationId, reversals[0].journal_entry_id]);
        assert.equal(reversalLines.length, 2);
        assert.equal(reversalLines[0].account_id, settlementAccount);
        assert.equal(reversalLines[0].debit, source.amount);
        assert.equal(reversalLines[1].account_id, expenseAccount);
        assert.equal(reversalLines[1].credit, source.amount);
      } else {
        assert.equal(original[0].status, "void", "cancellation-first race must preserve a void original draft");
        assert.equal(postOutcome.status, "rejected", "posting must not win over a completed source cancellation");
        const reversals = await db.unsafe("select id from public.accounting_source_postings where organization_id=$1::uuid and source_id=$2::uuid and posting_kind='reversal'", [organizationId, raceExpense.expense_id]);
        assert.equal(reversals.length, 0, "a void draft has no posted journal to reverse");
        assert.match(String(postOutcome.reason?.message ?? ""), /cash expense changed or was voided|journal cannot be posted|check constraint/i);
      }
      const voidReplay = await voidExpense(raceVoidClient, raceExpense.expense_id, "P2 concurrent source cancellation");
      assert.equal(voidReplay.replayed, true, "repeating source void must not generate another reversal");
      const reversalCount = await db.unsafe("select count(*)::integer as count from public.accounting_source_postings where organization_id=$1::uuid and source_id=$2::uuid and posting_kind='reversal'", [organizationId, raceExpense.expense_id]);
      assert.equal(reversalCount[0].count, original[0].status === "posted" ? 1 : 0);
    } finally {
      await raceVoidClient.end({ timeout: 5 }).catch(() => {});
      await racePostClient.end({ timeout: 5 }).catch(() => {});
    }
    await setIdentity(customerDb, customer.auth_user_id, customer.email);
    await expectFailure("customer cannot prepare a cash-expense journal", () => createDraft(customerDb, expense.expense_id, expenseAccount, settlementAccount, randomUUID()), /finance permission required/i);
    process.stdout.write("PASS cash-expense source posting: PostgreSQL journal draft, immutable source link, balanced exact amounts, source/account mapping guard, concurrent draft idempotency, posted-ledger visibility, audit attribution, customer denial and post/void compensation race\n");
  } finally {
    await customerDb.end({ timeout: 5 }).catch(() => {});
    await concurrentB.end({ timeout: 5 }).catch(() => {});
    await concurrentA.end({ timeout: 5 }).catch(() => {});
    await managerDb.end({ timeout: 5 }).catch(() => {});
    await db.end({ timeout: 5 }).catch(() => {});
  }
}
main().catch((error) => { process.stderr.write("FAIL cash-expense source posting acceptance: " + String(error?.stack ?? error) + "\n"); process.exitCode = 1; });
