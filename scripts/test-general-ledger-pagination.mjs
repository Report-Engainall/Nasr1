import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

// Run immediately after test-database-migrations.mjs against the same isolated
// PostgreSQL 17 database. All fixtures are rolled back in a single transaction.
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for general-ledger pagination acceptance.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const organizationId = "a0000000-0000-0000-0000-000000000001";
const adminProfileId = "f0000000-0000-0000-0000-000000000001";
const adminAuthUserId = "33333333-3333-4333-8333-333333333333";
const testDate = "2099-11-19";

function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function assumeAdmin() {
  await db.unsafe("reset role").catch(() => {});
  const sessionId = randomUUID();
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI GL pagination session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, adminAuthUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [adminAuthUserId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: adminAuthUserId,
      email: "admin@aghbari.ye",
      role: "authenticated",
      session_id: sessionId,
    }),
  ]);
  await db.unsafe("set local role authenticated");
}

async function createAccount(code, name, type) {
  const result = (await db.unsafe(
    "select public.create_accounting_account($1::text,$2::text,$3::text,null,$4::text) as result",
    [code, name, type, "Isolated FIN-INVOICE-001 pagination acceptance fixture"],
  ))[0].result;
  const account = asJson(result);
  assert.match(account.id, /^[0-9a-f-]{36}$/i, "account is created through the finance-authorized RPC");
  return account.id;
}

async function createAndPostJournal({ debitAccountId, creditAccountId, amount, description, idempotencyKey, status = "posted" }) {
  const lines = db.json([
    { account_id: debitAccountId, debit: amount.toFixed(2), credit: "0.00", memo: "Pagination debit fixture" },
    { account_id: creditAccountId, debit: "0.00", credit: amount.toFixed(2), memo: "Pagination credit fixture" },
  ]);
  const created = asJson((await db.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    [idempotencyKey, testDate, description, lines, null],
  ))[0].result);
  assert.equal(created.status, "draft");
  if (status === "posted") {
    const posted = asJson((await db.unsafe(
      "select public.post_general_journal_entry($1::uuid) as result",
      [created.id],
    ))[0].result);
    assert.equal(posted.status, "posted", "fixture entries are explicitly posted before summary assertions");
  }
  return created.id;
}

async function fetchLedger(limit, offset = 0) {
  return asJson((await db.unsafe(
    "select public.fetch_general_ledger($1::date,$2::date,null,$3::integer,$4::integer) as result",
    [testDate, testDate, limit, offset],
  ))[0].result);
}

async function main() {
  let transactionOpen = false;
  try {
    await db.unsafe("begin");
    transactionOpen = true;
    await assumeAdmin();

    const profile = await db.unsafe(
      "select p.id from public.profiles p where p.id=$1::uuid and p.auth_user_id=$2::uuid and p.organization_id=$3::uuid and p.is_active=true and exists(select 1 from public.user_roles r where r.profile_id=p.id and r.role in ('admin','manager'))",
      [adminProfileId, adminAuthUserId, organizationId],
    );
    assert.equal(profile.length, 1, "the isolated DB migration suite must provide an active same-tenant admin fixture");

    const existing = await db.unsafe(
      "select count(*)::integer as count from public.accounting_journal_entries where organization_id=$1::uuid and entry_date=$2::date",
      [organizationId, testDate],
    );
    assert.equal(existing[0].count, 0, "the distant fixture date must be unused before this isolated acceptance");

    const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    const debitAccountId = await createAccount("CI-PAGE-D-" + suffix, "CI pagination debit " + suffix, "expense");
    const creditAccountId = await createAccount("CI-PAGE-C-" + suffix, "CI pagination credit " + suffix, "asset");

    const amounts = [10, 20, 30, 40];
    const postedIds = [];
    for (const [index, amount] of amounts.entries()) {
      postedIds.push(await createAndPostJournal({
        debitAccountId,
        creditAccountId,
        amount,
        description: "FIN-INVOICE-001 pagination posted fixture " + (index + 1),
        idempotencyKey: randomUUID(),
      }));
    }
    const draftId = await createAndPostJournal({
      debitAccountId,
      creditAccountId,
      amount: 50,
      description: "FIN-INVOICE-001 pagination draft fixture",
      idempotencyKey: randomUUID(),
      status: "draft",
    });

    const firstPage = await fetchLedger(1, 0);
    const secondPage = await fetchLedger(1, 1);
    const full = await fetchLedger(50, 0);

    // LIMIT/OFFSET only bound entries; entry_count, summary and trial-balance
    // account aggregates must remain identical and complete across pages.
    assert.equal(firstPage.entries.length, 1, "limit=1 returns one detail entry");
    assert.equal(secondPage.entries.length, 1, "offset=1 returns the next detail entry");
    assert.equal(full.entries.length, 5, "unpaged response includes four posted entries plus one draft");
    assert.equal(firstPage.entry_count, 5, "entry_count is the complete matching set, not the current page size");
    assert.equal(secondPage.entry_count, 5, "entry_count remains stable on later pages");
    assert.equal(full.entry_count, 5);
    assert.equal(firstPage.has_more, true);
    assert.equal(secondPage.has_more, true);
    assert.equal(full.has_more, false);
    assert.equal(new Set(full.entries.map((entry) => entry.id)).size, 5, "one entry detail row is returned per journal, with no line-join multiplication");
    assert.deepEqual(
      full.entries.map((entry) => entry.id).sort(),
      [...postedIds, draftId].sort(),
      "detail set includes exactly the isolated synthetic entries",
    );

    for (const page of [firstPage, secondPage, full]) {
      assert.deepEqual(page.summary, {
        posted_entry_count: 4,
        debit_total: "100.00",
        credit_total: "100.00",
      }, "summary aggregates every posted entry irrespective of pagination; draft totals are excluded");
      const debit = page.accounts.find((account) => account.id === debitAccountId);
      const credit = page.accounts.find((account) => account.id === creditAccountId);
      assert.ok(debit && credit, "both synthetic accounts remain present in the account aggregates");
      assert.equal(debit.debit_total, "100.00");
      assert.equal(debit.credit_total, "0.00");
      assert.equal(credit.debit_total, "0.00");
      assert.equal(credit.credit_total, "100.00");
    }

    const detailDraft = full.entries.find((entry) => entry.id === draftId);
    assert.equal(detailDraft.status, "draft");
    assert.equal(detailDraft.debit_total, "50.00");
    assert.equal(detailDraft.credit_total, "50.00");
    assert.equal(full.entries.filter((entry) => entry.status === "posted").length, 4);

    process.stdout.write("PASS FIN-INVOICE-001 ledger pagination: complete count, has_more, no detail duplication, untruncated posted summary and per-account aggregates, draft excluded from totals\n");
  } finally {
    if (transactionOpen) await db.unsafe("rollback").catch(() => undefined);
    await db.end({ timeout: 5 });
  }
}

try {
  await main();
} catch (cause) {
  const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
  process.stderr.write("GENERAL_LEDGER_PAGINATION_ACCEPTANCE_FAILED " + JSON.stringify({
    name: error.name,
    message: error.message,
    code: error.code,
    detail: error.detail,
    hint: error.hint,
  }) + "\n");
  throw cause;
}
