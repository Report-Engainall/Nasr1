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

async function snapshotJournalBoundary(journalId) {
  const entryRows = await db.unsafe(
    "select to_jsonb(e)::text as row_json from public.accounting_journal_entries e " +
      "where e.organization_id=$1::uuid and e.id=$2::uuid",
    [organizationId, journalId],
  );
  assert.equal(entryRows.length, 1, "journal boundary snapshot must resolve one tenant-owned entry");
  const lineRows = await db.unsafe(
    "select to_jsonb(l)::text as row_json from public.accounting_journal_lines l " +
      "where l.organization_id=$1::uuid and l.journal_entry_id=$2::uuid order by l.line_number",
    [organizationId, journalId],
  );
  const reversalRows = await db.unsafe(
    "select to_jsonb(r)::text as row_json,r.id::text as reversal_id " +
      "from public.accounting_journal_reversals r where r.organization_id=$1::uuid " +
      "and (r.original_journal_entry_id=$2::uuid or r.reversal_journal_entry_id=$2::uuid) order by r.id::text",
    [organizationId, journalId],
  );
  const reversalIds = reversalRows.map(({ reversal_id }) => reversal_id);
  const auditRows = await db.unsafe(
    "select to_jsonb(a)::text as row_json from public.audit_logs a " +
      "where a.organization_id=$1::uuid and (" +
      "(a.entity_type='accounting_journal_entry' and a.entity_id=$2::uuid) or " +
      "(a.entity_type='accounting_journal_reversal' and a.entity_id=any($3::uuid[]))) order by a.id::text",
    [organizationId, journalId, reversalIds],
  );
  return JSON.stringify({
    entry:entryRows.map(({row_json})=>row_json),
    lines:lineRows.map(({row_json})=>row_json),
    reversals:reversalRows.map(({row_json})=>row_json),
    audit:auditRows.map(({row_json})=>row_json),
  });
}

async function createManualJournal(client,key,description,debitAccountId,creditAccountId,amount) {
  const lines=[
    {account_id:debitAccountId,debit:amount,credit:0,memo:"اختبار قيد يدوي مستقل"},
    {account_id:creditAccountId,debit:0,credit:amount,memo:"اختبار قيد يدوي مستقل"},
  ];
  // Use Postgres.js's JSON parameter encoder. A JSON-looking text argument can otherwise
  // be treated as plain text by the wire serializer rather than the JSON value this RPC expects.
  const jsonShape = await client.unsafe(
    "select jsonb_typeof($1::jsonb) as value_type,jsonb_array_length($1::jsonb) as line_count",
    [client.json(lines)],
  );
  assert.equal(jsonShape[0]?.value_type, "array", "manual journal payload reaches PostgreSQL as a JSON array");
  assert.equal(Number(jsonShape[0]?.line_count), 2, "manual journal payload reaches PostgreSQL with both balanced lines");
  return asJson((await client.unsafe(
    "select public.create_general_journal_draft($1::uuid,current_date,$2::text,$3::jsonb,NULL::text) as result",
    [key,description,client.json(lines)],
  ))[0].result);
}

async function snapshotExpenseRecordBoundary(idempotencyKey) {
  const rows = await db.unsafe(
    "select jsonb_build_object(" +
      "'expenses',coalesce((select jsonb_agg(to_jsonb(e) order by e.id::text) from public.cash_expenses e where e.organization_id=$1::uuid and e.idempotency_key=$2::uuid),'[]'::jsonb)," +
      "'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.id::text) from public.audit_logs a where a.organization_id=$1::uuid and a.action='cash_expense.recorded' and a.entity_type='cash_expense' and a.entity_id in (select e.id from public.cash_expenses e where e.organization_id=$1::uuid and e.idempotency_key=$2::uuid)),'[]'::jsonb)," +
      "'source_postings',coalesce((select jsonb_agg(to_jsonb(p) order by p.id::text) from public.accounting_source_postings p where p.organization_id=$1::uuid and p.source_type='cash_expense' and p.source_id in (select e.id from public.cash_expenses e where e.organization_id=$1::uuid and e.idempotency_key=$2::uuid)),'[]'::jsonb)" +
    ")::text as snapshot",
    [organizationId, idempotencyKey],
  );
  assert.equal(rows.length, 1, "privileged expense-record oracle must return a full source and audit snapshot");
  return rows[0].snapshot;
}

async function snapshotExpenseVoidBoundary(expenseId, tenantId = organizationId) {
  const source = await db.unsafe(
    "select status,voided_by_profile_id::text as voided_by,voided_at::text as voided_at,void_reason,updated_at::text as updated_at " +
      "from public.cash_expenses where organization_id=$1::uuid and id=$2::uuid",
    [tenantId, expenseId],
  );
  assert.equal(source.length, 1, "void-boundary fixture remains in the owner tenant");
  const audits = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and action='cash_expense.voided' and entity_type='cash_expense' and entity_id=$2::uuid",
    [tenantId, expenseId],
  );
  const links = await db.unsafe(
    "select count(*)::integer as count from public.accounting_source_postings " +
      "where organization_id=$1::uuid and source_type='cash_expense' and source_id=$2::uuid",
    [tenantId, expenseId],
  );

  // Keep each linked table snapshot separate so SQL remains reviewable and deterministic.
  const expenseRows = await db.unsafe(
    "select to_jsonb(e)::text as row_json from public.cash_expenses e " +
      "where e.organization_id=$1::uuid and e.id=$2::uuid",
    [tenantId, expenseId],
  );
  const postingRows = await db.unsafe(
    "select to_jsonb(p)::text as row_json,p.journal_entry_id::text as journal_id " +
      "from public.accounting_source_postings p " +
      "where p.organization_id=$1::uuid and p.source_type='cash_expense' and p.source_id=$2::uuid " +
      "order by p.id::text",
    [tenantId, expenseId],
  );
  const journalIds = postingRows.map(({ journal_id }) => journal_id).filter(Boolean);
  const journals = journalIds.length ? await db.unsafe(
    "select to_jsonb(j)::text as row_json from public.accounting_journal_entries j " +
      "where j.organization_id=$1::uuid and j.id=any($2::uuid[]) order by j.id::text",
    [tenantId, journalIds],
  ) : [];
  const journalLines = journalIds.length ? await db.unsafe(
    "select to_jsonb(l)::text as row_json from public.accounting_journal_lines l " +
      "where l.organization_id=$1::uuid and l.journal_entry_id=any($2::uuid[]) " +
      "order by l.journal_entry_id::text,l.line_number",
    [tenantId, journalIds],
  ) : [];
  const reversals = journalIds.length ? await db.unsafe(
    "select to_jsonb(r)::text as row_json,r.id::text as reversal_id " +
      "from public.accounting_journal_reversals r where r.organization_id=$1::uuid " +
      "and (r.original_journal_entry_id=any($2::uuid[]) or r.reversal_journal_entry_id=any($2::uuid[])) " +
      "order by r.id::text",
    [tenantId, journalIds],
  ) : [];
  const reversalIds = reversals.map(({ reversal_id }) => reversal_id);
  const auditRows = await db.unsafe(
    "select to_jsonb(a)::text as row_json from public.audit_logs a " +
      "where a.organization_id=$1::uuid and (" +
      "(a.entity_type='cash_expense' and a.entity_id=$2::uuid) or " +
      "(a.entity_type='accounting_journal_entry' and a.entity_id=any($3::uuid[])) or " +
      "(a.entity_type='accounting_journal_reversal' and a.entity_id=any($4::uuid[]))" +
      ") order by a.id::text",
    [tenantId, expenseId, journalIds, reversalIds],
  );
  const completeState = JSON.stringify({
    expense: expenseRows.map(({ row_json }) => row_json),
    sourcePostings: postingRows.map(({ row_json }) => row_json),
    journals: journals.map(({ row_json }) => row_json),
    journalLines: journalLines.map(({ row_json }) => row_json),
    reversals: reversals.map(({ row_json }) => row_json),
    audit: auditRows.map(({ row_json }) => row_json),
  });

  return {
    source: source[0],
    voidAuditCount: Number(audits[0]?.count ?? 0),
    sourcePostingCount: Number(links[0]?.count ?? 0),
    completeState,
  };
}

async function main() {
  const managerRows = await db.unsafe("select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true", [organizationId, managerEmail]);
  assert.equal(managerRows.length, 1, "local fixture must contain exactly one active organization-scoped manager");
  const manager = managerRows[0];
  const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL").toLowerCase();
  const adminRows = await db.unsafe(
    "select p.id,p.auth_user_id,p.email from public.profiles p join public.user_roles r on r.profile_id=p.id " +
      "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true and r.role='admin'",
    [organizationId,adminEmail],
  );
  assert.equal(adminRows.length,1,"local tenant must contain one active administrator for journal maker/checker");
  const admin = adminRows[0];
  const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL").toLowerCase();
  const accountantRows = await db.unsafe(
    "select p.id,p.auth_user_id,p.email from public.profiles p join public.user_roles r on r.profile_id=p.id " +
      "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true and r.role='accountant'",
    [organizationId,accountantEmail],
  );
  assert.equal(accountantRows.length,1,"local tenant must contain one active accountant for journal maker/checker");
  const accountant = accountantRows[0];
  const customerEmail = process.env.E2E_EMAIL?.trim().toLowerCase();
  const customerRows = customerEmail ? await db.unsafe("select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true", [organizationId, customerEmail]) : [];
  assert.equal(customerRows.length, 1, "local fixture must contain the paired customer for role-denial acceptance");
  const customer = customerRows[0];
  const staffAuthId = randomUUID();
  const staffProfileId = randomUUID();
  const staffEmail = "ci-cash-expense-staff-" + staffAuthId + "@example.test";
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [staffAuthId, staffEmail],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Cash Expense Ordinary Staff',$4,true)",
    [staffProfileId, staffAuthId, organizationId, staffEmail],
  );
  await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'staff')", [staffProfileId]);
  const staffRoles = await db.unsafe("select role from public.user_roles where profile_id=$1::uuid order by role", [staffProfileId]);
  assert.deepEqual(staffRoles.map((row) => row.role), ["staff"], "void-denial fixture must have only ordinary staff role");
  const suffix = randomUUID().replaceAll("-", "").slice(-12).toUpperCase();
  const expenseAccount = await createAccount("P2-E2E-EXP-" + suffix, "P2 E2E Operating Expense " + suffix, "expense");
  const settlementAccount = await createAccount("P2-E2E-CASH-" + suffix, "P2 E2E Cash " + suffix, "asset");
  const alternateExpenseAccount = await createAccount("P2-E2E-EXP2-" + suffix, "P2 E2E Alternate Expense " + suffix, "expense");
  const managerDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const adminDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const accountantDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const concurrentA = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const concurrentB = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const customerDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const foreignManagerDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const staffDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    await setIdentity(managerDb, manager.auth_user_id, manager.email);
    await setIdentity(adminDb, admin.auth_user_id, admin.email);
    await setIdentity(accountantDb, accountant.auth_user_id, accountant.email);
    await setIdentity(concurrentA, manager.auth_user_id, manager.email);
    await setIdentity(concurrentB, manager.auth_user_id, manager.email);
    const expenseKey = randomUUID();

    // AUTHZ-GL-CASH-EXPENSE-RECORD-STAFF-DENIAL-001:
    // a same-tenant ordinary staff denial must not create source, audit or posting rows,
    // and must not consume the payload-bound idempotency key.
    const expenseDescription = "P2 expense journal acceptance";
    await setIdentity(staffDb, staffAuthId, staffEmail);
    const expenseRecordBeforeDenial = await snapshotExpenseRecordBoundary(expenseKey);
    const staffRecordError = await expectFailure(
      "same-tenant ordinary staff cannot record a cash expense",
      () => recordExpense(staffDb, expenseKey, expenseDescription, "125.50"),
      /finance permission required to record cash expense/i,
    );
    assert.equal(staffRecordError.code, "42501", "ordinary-staff cash-expense record denial uses SQLSTATE 42501");
    assert.equal(
      await snapshotExpenseRecordBoundary(expenseKey),
      expenseRecordBeforeDenial,
      "ordinary-staff record denial preserves expense, source-posting and audit rows byte-for-byte",
    );

    await setIdentity(managerDb, manager.auth_user_id, manager.email);
    const expense = await recordExpense(managerDb, expenseKey, expenseDescription, "125.50");
    assert.equal(expense.status, "posted");
    assert.equal(expense.replayed, false, "manager can use the same idempotency key after staff denial");
    const expenseReplay = await recordExpense(managerDb, expenseKey, expenseDescription, "125.50");
    assert.equal(expenseReplay.expense_id, expense.expense_id);
    assert.equal(expenseReplay.replayed, true);
    const recordedAudit = await db.unsafe(
      "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='cash_expense.recorded' and entity_type='cash_expense' and entity_id=$2::uuid",
      [organizationId, expense.expense_id],
    );
    assert.equal(recordedAudit[0].count, 1, "manager create and replay emit one source audit record");
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
    const preSelfPost = await snapshotExpenseVoidBoundary(expense.expense_id);
    const selfPostError = await expectFailure(
      "journal creator cannot post their own source-linked draft",
      () => postJournal(managerDb, journalId),
      /independent checker different from the journal creator/i,
    );
    assert.equal(selfPostError.code, "42501");
    assert.deepEqual(await snapshotExpenseVoidBoundary(expense.expense_id), preSelfPost,
      "maker self-post denial preserves source, posting link, journal, lines and audit byte-for-byte");
    const posted = await postJournal(adminDb, journalId);
    assert.equal(posted.status, "posted");
    assert.equal(posted.replayed, false);
    const postedReplay = await postJournal(adminDb, journalId);
    assert.equal(postedReplay.status, "posted");
    assert.equal(postedReplay.replayed, true, "independent checker posting replay is a no-op");
    const postedIdentity = await db.unsafe(
      "select created_by_profile_id::text as creator,posted_by_profile_id::text as poster " +
        "from public.accounting_journal_entries where organization_id=$1::uuid and id=$2::uuid",
      [organizationId,journalId],
    );
    assert.equal(postedIdentity[0].creator,manager.id);
    assert.equal(postedIdentity[0].poster,admin.id);
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
    const journalAudit = await db.unsafe("select action,actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='accounting_journal_entry' and entity_id=$2::uuid", [organizationId, journalId]);
    assert.ok(journalAudit.some((row) => row.action === "accounting.journal_posted" && row.actor_id === admin.id),
      "journal posting audit identifies the independent reviewer");
    const inbox = asJson((await managerDb.unsafe("select public.fetch_cash_expense_accounting_inbox(50,0,'posted') as result"))[0].result);
    assert.ok(inbox.items.some((item) => item.id === expense.expense_id && item.journal_entry_id === journalId && item.journal_status === "posted"), "cash-expense accounting inbox must show the linked posted journal");

    // Manual journal maker/checker: accountant creates; manager posts; administrator reverses;
    // manager then posts the independent reversal. Denied actions must produce no row/audit delta.
    const manualDraft = await createManualJournal(
      accountantDb,randomUUID(),"P2 independent maker checker journal",expenseAccount,settlementAccount,"77.25",
    );
    assert.equal(manualDraft.status,"draft");
    assert.equal(manualDraft.replayed,false);
    const beforeAccountantSelfPost = await snapshotJournalBoundary(manualDraft.id);
    const accountantSelfPost = await expectFailure(
      "accountant cannot post their own manual journal draft",
      () => postJournal(accountantDb,manualDraft.id),
      /independent checker different from the journal creator/i,
    );
    assert.equal(accountantSelfPost.code,"42501");
    assert.equal(await snapshotJournalBoundary(manualDraft.id),beforeAccountantSelfPost,
      "self-post denial preserves the journal, lines, reversal links and audit");
    const manualPosted = await postJournal(managerDb,manualDraft.id);
    assert.equal(manualPosted.status,"posted");
    assert.equal(manualPosted.replayed,false);
    const manualPostedIdentity = await db.unsafe(
      "select created_by_profile_id::text as creator,posted_by_profile_id::text as poster " +
        "from public.accounting_journal_entries where organization_id=$1::uuid and id=$2::uuid",
      [organizationId,manualDraft.id],
    );
    assert.equal(manualPostedIdentity[0].creator,accountant.id);
    assert.equal(manualPostedIdentity[0].poster,manager.id);

    const beforeManagerSelfReverse = await snapshotJournalBoundary(manualDraft.id);
    const managerSelfReverse = await expectFailure(
      "original poster cannot reverse the same journal",
      () => managerDb.unsafe(
        "select public.reverse_general_journal_entry($1::uuid,$2::text,$3::uuid)",
        [manualDraft.id,"Original poster reversal denial",randomUUID()],
      ),
      /independent reviewer different from the original creator and poster/i,
    );
    assert.equal(managerSelfReverse.code,"42501");
    assert.equal(await snapshotJournalBoundary(manualDraft.id),beforeManagerSelfReverse,
      "denied same-poster reversal preserves journal, lines, reversal links and audit");

    const reverseKey=randomUUID();
    const reverseResult=asJson((await adminDb.unsafe(
      "select public.reverse_general_journal_entry($1::uuid,$2::text,$3::uuid) as result",
      [manualDraft.id,"Independent administrator reversal",reverseKey],
    ))[0].result);
    assert.equal(reverseResult.status,"draft");
    assert.equal(reverseResult.replayed,false);
    const reverseReplay=asJson((await adminDb.unsafe(
      "select public.reverse_general_journal_entry($1::uuid,$2::text,$3::uuid) as result",
      [manualDraft.id,"Independent administrator reversal",reverseKey],
    ))[0].result);
    assert.equal(reverseReplay.reversal_journal_entry_id,reverseResult.reversal_journal_entry_id);
    assert.equal(reverseReplay.replayed,true);
    const reverseId=reverseResult.reversal_journal_entry_id;
    const reverseIdentity=await db.unsafe(
      "select created_by_profile_id::text as creator,posted_by_profile_id::text as poster,status " +
        "from public.accounting_journal_entries where organization_id=$1::uuid and id=$2::uuid",
      [organizationId,reverseId],
    );
    assert.equal(reverseIdentity[0].creator,admin.id);
    assert.equal(reverseIdentity[0].poster,null);
    assert.equal(reverseIdentity[0].status,"draft");
    const beforeReverseSelfPost=await snapshotJournalBoundary(reverseId);
    const reverseSelfPost=await expectFailure(
      "reversal maker cannot post their own reversal draft",
      () => postJournal(adminDb,reverseId),
      /independent checker different from the journal creator/i,
    );
    assert.equal(reverseSelfPost.code,"42501");
    assert.equal(await snapshotJournalBoundary(reverseId),beforeReverseSelfPost,
      "reversal maker self-post denial preserves reversal, mirrored lines and audit");
    const reversePosted=await postJournal(managerDb,reverseId);
    assert.equal(reversePosted.status,"posted");
    assert.equal(reversePosted.replayed,false);
    const originalLines=await db.unsafe(
      "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines " +
        "where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number",
      [organizationId,manualDraft.id],
    );
    const reversalLines=await db.unsafe(
      "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines " +
        "where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number",
      [organizationId,reverseId],
    );
    assert.equal(reversalLines.length,originalLines.length);
    for(let index=0;index<originalLines.length;index++){
      assert.equal(reversalLines[index].line_number,originalLines[index].line_number);
      assert.equal(reversalLines[index].account_id,originalLines[index].account_id);
      assert.equal(reversalLines[index].debit,originalLines[index].credit);
      assert.equal(reversalLines[index].credit,originalLines[index].debit);
    }
    const reversalAudit=await db.unsafe(
      "select action,actor_id from public.audit_logs where organization_id=$1::uuid " +
        "and entity_type='accounting_journal_entry' and entity_id=$2::uuid",
      [organizationId,reverseId],
    );
    assert.ok(reversalAudit.some(row=>row.action==="accounting.journal_posted" && row.actor_id===manager.id),
      "reversal post audit identifies the independent checker");
    assert.equal((await db.unsafe(
      "select count(*)::integer as count from public.accounting_journal_reversals " +
        "where organization_id=$1::uuid and original_journal_entry_id=$2::uuid",
      [organizationId,manualDraft.id],
    ))[0].count,1,"one unique reversal link must exist for the posted manual journal");

    const raceExpense = await recordExpense(managerDb, randomUUID(), "P2 expense post/void race", "50.00");
    const raceDraft = await createDraft(managerDb, raceExpense.expense_id, expenseAccount, settlementAccount, randomUUID());
    assert.equal(raceDraft.status, "draft");
    const racePostClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
    const raceVoidClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
    try {
      await Promise.all([setIdentity(racePostClient, admin.auth_user_id, admin.email), setIdentity(raceVoidClient, manager.auth_user_id, manager.email)]);
      const [postOutcome, voidOutcome] = await Promise.allSettled([postJournal(racePostClient, raceDraft.journal_entry_id), voidExpense(raceVoidClient, raceExpense.expense_id, "P2 concurrent source cancellation")]);
      assert.equal(voidOutcome.status, "fulfilled", "source void must complete under a concurrent journal post");
      assert.equal(voidOutcome.value.status, "void");
      const source = (await db.unsafe("select status,amount::text,currency from public.cash_expenses where organization_id=$1::uuid and id=$2::uuid", [organizationId, raceExpense.expense_id]))[0];
      assert.equal(source.status, "void");
      const original = await db.unsafe("select je.id,je.status,sp.source_amount::text from public.accounting_source_postings sp join public.accounting_journal_entries je on je.id=sp.journal_entry_id and je.organization_id=sp.organization_id where sp.organization_id=$1::uuid and sp.source_id=$2::uuid and sp.posting_kind='original'", [organizationId, raceExpense.expense_id]);
      assert.equal(original.length, 1);
      if (original[0].status === "posted") {
        assert.equal(postOutcome.status, "fulfilled", "a journal that posted first must report success");
        const reversals = await db.unsafe(
          "select sp.journal_entry_id,je.status,sp.source_amount::text,sp.reversal_reason,je.created_by_profile_id::text as reversal_creator,je.posted_by_profile_id::text as reversal_poster "+
            "from public.accounting_source_postings sp join public.accounting_journal_entries je on je.id=sp.journal_entry_id and je.organization_id=sp.organization_id "+
            "where sp.organization_id=$1::uuid and sp.source_id=$2::uuid and sp.posting_kind='reversal'",
          [organizationId,raceExpense.expense_id],
        );
        assert.equal(reversals.length, 1, "source void after posting creates one reversal draft");
        assert.equal(reversals[0].status, "draft");
        assert.equal(reversals[0].source_amount, source.amount);
        assert.equal(reversals[0].reversal_reason, "P2 concurrent source cancellation");
        assert.equal(reversals[0].reversal_creator,manager.id);
        assert.equal(reversals[0].reversal_poster,null);
        const preMakerPost=await snapshotExpenseVoidBoundary(raceExpense.expense_id);
        const makerPost=await expectFailure(
          "cash expense reversal maker cannot post their own counter-entry",
          ()=>postJournal(managerDb,reversals[0].journal_entry_id),
          /(?:independent checker different from the journal creator|reviewer different from the reversal creator, original creator and original poster)/i,
        );
        assert.equal(makerPost.code,"42501");
        assert.equal((await snapshotExpenseVoidBoundary(raceExpense.expense_id)).completeState,preMakerPost.completeState);
        const originalPosterPost=await expectFailure(
          "original journal poster cannot post the source reversal",
          ()=>postJournal(adminDb,reversals[0].journal_entry_id),
          /reviewer different from the reversal creator, original creator and original poster/i,
        );
        assert.equal(originalPosterPost.code,"42501");
        assert.equal((await snapshotExpenseVoidBoundary(raceExpense.expense_id)).completeState,preMakerPost.completeState);
        const independentPost=await postJournal(accountantDb,reversals[0].journal_entry_id);
        assert.equal(independentPost.status,"posted");
        assert.equal(independentPost.replayed,false);
        const postedReversal=await db.unsafe(
          "select status,created_by_profile_id::text as creator,posted_by_profile_id::text as poster from public.accounting_journal_entries "+
            "where organization_id=$1::uuid and id=$2::uuid",
          [organizationId,reversals[0].journal_entry_id],
        );
        assert.equal(postedReversal[0].status,"posted");
        assert.equal(postedReversal[0].creator,manager.id);
        assert.equal(postedReversal[0].poster,accountant.id);
        const reversalLines = await db.unsafe("select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number", [organizationId, reversals[0].journal_entry_id]);
        assert.equal(reversalLines.length, 2);
        assert.equal(reversalLines[0].account_id, settlementAccount);
        assert.equal(reversalLines[0].debit, source.amount);
        assert.equal(reversalLines[1].account_id, expenseAccount);
        assert.equal(reversalLines[1].credit, source.amount);
        const sourceReversalAudit=await db.unsafe(
          "select action,actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='cash_expense' and entity_id=$2::uuid",
          [organizationId,raceExpense.expense_id],
        );
        assert.ok(sourceReversalAudit.some(row=>row.action==="accounting.cash_expense_journal_reversal_draft_created" && row.actor_id===manager.id));
        assert.ok(sourceReversalAudit.some(row=>row.action==="accounting.cash_expense_journal_reversal_posted" && row.actor_id===accountant.id));
      } else {
        assert.equal(original[0].status, "void", "cancellation-first race must preserve a void original draft");
        assert.equal(postOutcome.status, "rejected", "posting must not win over a completed source cancellation");
        const reversals = await db.unsafe("select id from public.accounting_source_postings where organization_id=$1::uuid and source_id=$2::uuid and posting_kind='reversal'", [organizationId, raceExpense.expense_id]);
        assert.equal(reversals.length, 0, "a void draft has no posted journal to reverse");
        assert.match(String(postOutcome.reason?.message ?? ""), /cash expense changed or was voided|only draft journal entries can be posted|journal cannot be posted|check constraint/i);
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

    // AGH-CASH-EXPENSE-VOID-SECURITY-001: role and tenant denials must have no side effects.
    const deniedVoidExpense = await recordExpense(
      managerDb, randomUUID(), "P2 cash-expense void authorization boundary", "41.25",
    );
    const foreignOrganizationId = randomUUID();
    const foreignManagerAuthId = randomUUID();
    const foreignManagerProfileId = randomUUID();
    const foreignManagerEmail = "ci-foreign-cash-manager-" + foreignManagerAuthId + "@example.test";
    await db.unsafe(
      "insert into public.organizations(id,name,currency) values($1,$2,'YER')",
      [foreignOrganizationId, "CI Foreign Cash Expense Tenant " + foreignManagerAuthId],
    );
    await db.unsafe(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) " +
        "on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
      [foreignManagerAuthId, foreignManagerEmail],
    );
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Foreign Cash Manager',$4,true)",
      [foreignManagerProfileId, foreignManagerAuthId, foreignOrganizationId, foreignManagerEmail],
    );
    await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'manager')", [foreignManagerProfileId]);

    const deniedVoidBaseline = await snapshotExpenseVoidBoundary(deniedVoidExpense.expense_id);
    assert.deepEqual(deniedVoidBaseline.source, {
      status: "posted", voided_by: null, voided_at: null, void_reason: null,
      updated_at: deniedVoidBaseline.source.updated_at,
    }, "fresh void-boundary source starts posted and unvoided");

    await setIdentity(staffDb, staffAuthId, staffEmail);
    const staffVoidError = await expectFailure(
      "same-tenant ordinary staff cannot void a cash expense",
      () => voidExpense(staffDb, deniedVoidExpense.expense_id, "ordinary staff unauthorized void"),
      /administrator or manager permission required to void cash expense/i,
    );
    assert.equal(staffVoidError.code, "42501", "ordinary-staff cash-expense void denial uses SQLSTATE 42501");
    assert.deepEqual(
      await snapshotExpenseVoidBoundary(deniedVoidExpense.expense_id),
      deniedVoidBaseline,
      "ordinary-staff denial preserves complete expense/source-posting/journal/lines/reversal/audit state byte-for-byte",
    );

    const customerVoidError = await expectFailure(
      "customer cannot void a cash expense",
      () => voidExpense(customerDb, deniedVoidExpense.expense_id, "customer unauthorized void"),
      /administrator or manager permission required to void cash expense/i,
    );
    assert.equal(customerVoidError.code, "42501", "customer void denial uses SQLSTATE 42501");
    assert.deepEqual(await snapshotExpenseVoidBoundary(deniedVoidExpense.expense_id), deniedVoidBaseline,
      "customer denial leaves expense state, timestamps, audit and source postings unchanged");

    await setIdentity(foreignManagerDb, foreignManagerAuthId, foreignManagerEmail);
    const foreignVoidError = await expectFailure(
      "foreign-tenant manager cannot void a cash expense or learn whether it exists",
      () => voidExpense(foreignManagerDb, deniedVoidExpense.expense_id, "foreign manager unauthorized void"),
      /expense not found in this organization/i,
    );
    assert.equal(foreignVoidError.code, "P0002", "cross-tenant void denial uses opaque P0002");
    assert.deepEqual(await snapshotExpenseVoidBoundary(deniedVoidExpense.expense_id), deniedVoidBaseline,
      "cross-tenant denial leaves expense state, timestamps, audit and source postings unchanged");

    // AUTHZ-DLV-015-CASH-EXPENSE-READ-TENANT-001: finance-list read is role-gated,
    // tenant-scoped, and side-effect free for both the caller and the other tenant.
    const foreignListedExpense = await recordExpense(
      foreignManagerDb,
      randomUUID(),
      "P2 foreign-tenant expense read isolation",
      "19.50",
    );
    const localReadSnapshot = await snapshotExpenseVoidBoundary(expense.expense_id);
    const foreignReadSnapshot = await snapshotExpenseVoidBoundary(foreignListedExpense.expense_id, foreignOrganizationId);

    await setIdentity(staffDb, staffAuthId, staffEmail);
    const staffListError = await expectFailure(
      "same-tenant ordinary staff cannot read the cash-expense finance list",
      () => staffDb.unsafe("select public.fetch_staff_cash_expenses(100,0,null,null,null,'all') as result"),
      /finance permission required to read cash expenses/i,
    );
    assert.equal(staffListError.code, "42501", "ordinary-staff cash-expense list denial uses SQLSTATE 42501");

    await setIdentity(customerDb, customer.auth_user_id, customer.email);
    const customerListError = await expectFailure(
      "customer cannot read the cash-expense finance list",
      () => customerDb.unsafe("select public.fetch_staff_cash_expenses(100,0,null,null,null,'all') as result"),
      /finance permission required to read cash expenses/i,
    );
    assert.equal(customerListError.code, "42501", "customer cash-expense list denial uses SQLSTATE 42501");

    await setIdentity(managerDb, manager.auth_user_id, manager.email);
    const localExpenseList = asJson((await managerDb.unsafe(
      "select public.fetch_staff_cash_expenses(100,0,null,null,null,'all') as result",
    ))[0].result);
    assert.ok(localExpenseList.items.some((item) => item.id === expense.expense_id),
      "authorized finance manager sees the local tenant expense");
    assert.equal(localExpenseList.items.some((item) => item.id === foreignListedExpense.expense_id), false,
      "local finance list never exposes a foreign-tenant expense");

    await setIdentity(foreignManagerDb, foreignManagerAuthId, foreignManagerEmail);
    const foreignExpenseList = asJson((await foreignManagerDb.unsafe(
      "select public.fetch_staff_cash_expenses(100,0,null,null,null,'all') as result",
    ))[0].result);
    assert.equal(foreignExpenseList.total_count, 1,
      "fresh foreign tenant contains only its own finance fixture expense");
    assert.deepEqual(foreignExpenseList.items.map((item) => item.id), [foreignListedExpense.expense_id],
      "foreign finance manager sees its own expense and no local-tenant records");
    assert.equal(foreignExpenseList.items.some((item) => item.id === expense.expense_id), false,
      "foreign finance list never exposes a local-tenant expense");

    assert.deepEqual(await snapshotExpenseVoidBoundary(expense.expense_id), localReadSnapshot,
      "staff/customer denials and finance-list reads leave local expense, postings, journals and audit byte-for-byte unchanged");
    assert.deepEqual(
      await snapshotExpenseVoidBoundary(foreignListedExpense.expense_id, foreignOrganizationId),
      foreignReadSnapshot,
      "tenant-scoped finance-list reads leave foreign expense, postings, journals and audit byte-for-byte unchanged",
    );

    process.stdout.write("PASS cash-expense source posting: PostgreSQL journal draft, immutable source link, balanced exact amounts, source/account mapping guard, concurrent draft idempotency, posted-ledger visibility, audit attribution, customer denial and post/void compensation race\n");
  } finally {
    await staffDb.end({ timeout: 5 }).catch(() => {});
    await accountantDb.end({ timeout: 5 }).catch(() => {});
    await adminDb.end({ timeout: 5 }).catch(() => {});
    await foreignManagerDb.end({ timeout: 5 }).catch(() => {});
    await customerDb.end({ timeout: 5 }).catch(() => {});
    await concurrentB.end({ timeout: 5 }).catch(() => {});
    await concurrentA.end({ timeout: 5 }).catch(() => {});
    await managerDb.end({ timeout: 5 }).catch(() => {});
    await db.end({ timeout: 5 }).catch(() => {});
  }
}
main().catch((error) => {
  const diagnostic = error && typeof error === "object" ? {
    code: error.code,
    routine: error.routine,
    line: error.line,
    where: error.where,
    constraint: error.constraint_name,
  } : undefined;
  process.stderr.write(
    "FAIL cash-expense source posting acceptance: " + String(error?.stack ?? error) +
    (diagnostic ? "\nDatabase diagnostic: " + JSON.stringify(diagnostic) : "") + "\n",
  );
  process.exitCode = 1;
});
