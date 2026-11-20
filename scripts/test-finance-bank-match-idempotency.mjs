import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for bank reconciliation acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
function installUndefinedBindGuard(client, label) {
  const originalUnsafe = client.unsafe.bind(client);
  client.unsafe = (query, values, ...options) => {
    const sql = String(query).replace(/\s+/g, " ").slice(0, 700);
    if (Array.isArray(values)) {
      const index = values.findIndex((value) => value === undefined);
      if (index >= 0) {
        throw new Error(
          "Undefined PostgreSQL bind detected before query execution: " + label +
          " parameter $" + (index + 1) + " of " + values.length + "; SQL: " + sql,
        );
      }
    }
    return Promise.resolve(originalUnsafe(query, values, ...options)).catch((error) => {
      if (String(error?.code) === "42601") {
        throw new Error(
          "PostgreSQL syntax error in " + label + " SQLSTATE 42601; SQL: " + sql,
          { cause: error },
        );
      }
      throw error;
    });
  };
}
async function setIdentity(client, authUserId, email) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$2,now(),now(),now(),null,'CI bank reconciliation acceptance','127.0.0.1'::inet) " +
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
async function signIn(email, password, supabaseUrl, publishableKey) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", supabaseUrl), {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error("Local Auth sign-in failed for the seeded finance manager (HTTP " + response.status + ").");
  }
  return payload.access_token;
}
async function expectCode(label, action, code) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should be rejected");
  assert.equal(String(caught.code), code, label + " SQLSTATE");
  return caught;
}
async function createAccount(db, organizationId, suffix, code, name, type) {
  const rows = await db.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,is_active) " +
    "values($1::uuid,$2,$3,$4,true) returning id",
    [organizationId, code + suffix, name + " " + suffix, type],
  );
  assert.equal(rows.length, 1);
  return rows[0].id;
}
async function createManualJournal(client, entryDate, description, debitAccountId, creditAccountId, amount) {
  const lines = [
    { account_id: debitAccountId, debit: amount, credit: 0, memo: "إثبات رصيد افتتاحي للاختبار" },
    { account_id: creditAccountId, debit: 0, credit: amount, memo: "مقابل رصيد افتتاحي للاختبار" },
  ];
  const jsonShape = await client.unsafe(
    "select jsonb_typeof($1::jsonb) as value_type,jsonb_array_length($1::jsonb) as line_count",
    [client.json(lines)],
  );
  assert.equal(jsonShape[0]?.value_type, "array");
  assert.equal(Number(jsonShape[0]?.line_count), 2);
  const result = asJson((await client.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,NULL::text) as result",
    [randomUUID(), entryDate, description, client.json(lines)],
  ))[0].result);
  // create_general_journal_draft returns { id, entry_number, status, replayed };
  // expose the canonical id explicitly for the posting/matching fixture helpers.
  const journalEntryId = result?.journal_entry_id ?? result?.id;
  assert.equal(typeof journalEntryId, "string", "manual journal RPC must return its persisted entry id");
  return { ...result, journal_entry_id: journalEntryId };
}
async function recordCashExpense(client, expenseDate, amount, description, reference) {
  return asJson((await client.unsafe(
    "select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date) as result",
    [randomUUID(), "Bank reconciliation acceptance", description, amount, "YER", "transfer", reference, expenseDate],
  ))[0].result);
}
async function createCashExpenseJournal(client, expenseId, expenseAccountId, bankAccountId) {
  return asJson((await client.unsafe(
    "select public.create_cash_expense_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid) as result",
    [expenseId, expenseAccountId, bankAccountId, randomUUID()],
  ))[0].result);
}
async function postJournal(client, journalId) {
  return asJson((await client.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result", [journalId],
  ))[0].result);
}
async function bankLine(db, organizationId, journalId, bankAccountId) {
  const rows = await db.unsafe(
    "select l.line_number,l.debit::text,l.credit::text,e.entry_date::text,e.status " +
    "from public.accounting_journal_lines l " +
    "join public.accounting_journal_entries e on e.id=l.journal_entry_id and e.organization_id=l.organization_id " +
    "where l.organization_id=$1::uuid and l.journal_entry_id=$2::uuid and l.account_id=$3::uuid",
    [organizationId, journalId, bankAccountId],
  );
  assert.equal(rows.length, 1, "source journal must contain exactly one bank-account line");
  assert.equal(rows[0].status, "posted", "bank match candidates must be posted");
  assert.equal(rows[0].debit, "0.00", "cash expense journal must credit the mapped bank account");
  assert.equal(rows[0].credit, "100.00");
  return { journalEntryId: journalId, journalLineNumber: Number(rows[0].line_number) };
}
async function uploadAndRegisterEvidence(input) {
  const path = input.mappingId + "/" + randomUUID() + ".pdf";
  const body = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const response = await fetch(new URL(
    "/storage/v1/object/finance-cash-account-evidence/" + path, input.supabaseUrl,
  ), {
    method: "POST",
    headers: {
      apikey: input.publishableKey,
      Authorization: "Bearer " + input.accessToken,
      "Content-Type": "application/pdf",
      "x-upsert": "false",
    },
    body,
  });
  const payload = await response.json().catch(() => null);
  assert.ok(response.ok,
    "real local Storage evidence upload must succeed: HTTP " + response.status + " " + JSON.stringify(payload));
  const sha = createHash("sha256").update(body).digest("hex");
  const fileName = path.split("/").at(-1);
  const rows = await input.managerDb.unsafe(
    "select public.record_finance_cash_account_evidence($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::bigint,$7::text) as result",
    [input.mappingId, input.evidenceKind, path, fileName, "application/pdf", body.length, sha],
  );
  const result = asJson(rows[0].result);
  assert.equal(typeof result.id, "string");
  assert.equal(result.replayed, false);
  return result;
}
async function createStatement(managerDb, mappingId, evidenceId, reference, periodDate, opening, closing) {
  const rows = await managerDb.unsafe(
    "select public.create_finance_bank_statement($1::uuid,$2::uuid,$3::text,$4::date,$5::date,$6::numeric,$7::numeric) as result",
    [mappingId, evidenceId, reference, periodDate, periodDate, opening, closing],
  );
  const result = asJson(rows[0].result);
  assert.equal(typeof result.statement_id, "string");
  assert.equal(result.replayed, false);
  return result.statement_id;
}
async function recordStatementLine(managerDb, statementId, lineNumber, transactionDate, reference, description, amount, idempotencyKey = randomUUID()) {
  const rows = await managerDb.unsafe(
    "select public.record_finance_bank_statement_line($1::uuid,$2::integer,$3::date,$4::text,$5::text,$6::numeric,$7::uuid) as result",
    [statementId, lineNumber, transactionDate, reference, description, amount, idempotencyKey],
  );
  const result = asJson(rows[0].result);
  assert.equal(typeof result.line_id, "string");
  assert.equal(result.replayed, false);
  return result.line_id;
}
async function matchBankLine(client, statementId, statementLineId, target) {
  const rows = await client.unsafe(
    "select public.match_finance_bank_statement_line($1::uuid,$2::uuid,$3::uuid,$4::integer) as result",
    [statementId, statementLineId, target.journalEntryId, target.journalLineNumber],
  );
  return asJson(rows[0].result);
}
async function statementSnapshot(db, organizationId, statementId) {
  const rows = await db.unsafe(
    "select jsonb_build_object(" +
    "'statement', (select to_jsonb(s) from public.finance_bank_statements s where s.organization_id=$1::uuid and s.id=$2::uuid)," +
    "'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.line_number) from public.finance_bank_statement_lines l where l.organization_id=$1::uuid and l.statement_id=$2::uuid),'[]'::jsonb)," +
    "'matches', coalesce((select jsonb_agg(to_jsonb(m) order by m.id::text) from public.finance_bank_statement_line_matches m join public.finance_bank_statement_lines l on l.organization_id=m.organization_id and l.id=m.statement_line_id where m.organization_id=$1::uuid and l.statement_id=$2::uuid),'[]'::jsonb)," +
    "'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.run_number) from public.finance_bank_statement_reconciliation_runs r where r.organization_id=$1::uuid and r.statement_id=$2::uuid),'[]'::jsonb)," +
    "'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.id::text) from public.audit_logs a where a.organization_id=$1::uuid and ((a.entity_type='finance_bank_statement_line' and a.action='finance.bank_statement_line_recorded' and a.entity_id in (select l.id from public.finance_bank_statement_lines l where l.organization_id=$1::uuid and l.statement_id=$2::uuid)) or (a.entity_type='finance_bank_statement_line_match' and a.entity_id in (select m.id from public.finance_bank_statement_line_matches m join public.finance_bank_statement_lines l on l.organization_id=m.organization_id and l.id=m.statement_line_id where m.organization_id=$1::uuid and l.statement_id=$2::uuid)) or (a.entity_type='finance_bank_statement_reconciliation_run' and a.entity_id in (select r.id from public.finance_bank_statement_reconciliation_runs r where r.organization_id=$1::uuid and r.statement_id=$2::uuid))),'[]'::jsonb)" +
    ")::text as snapshot",
    [organizationId, statementId],
  );
  assert.equal(rows.length, 1);
  return rows[0].snapshot;
}
async function main() {
  const databaseUrl = requiredEnv("TEST_DATABASE_URL");
  const supabaseUrl = requiredEnv("E2E_SUPABASE_URL");
  const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
  validateCashExpenseEndpoints(supabaseUrl, databaseUrl);

  const organizationId = "a0000000-0000-0000-0000-000000000001";
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
  const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL").toLowerCase();
  const serviceDb = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  let managerA;
  let managerB;
  let adminDb;
  try {
    const managers = await serviceDb.unsafe(
      "select p.id,p.auth_user_id,p.email from public.profiles p join public.user_roles r on r.profile_id=p.id " +
      "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true and r.role='manager' order by p.id limit 2",
      [organizationId, managerEmail],
    );
    assert.equal(managers.length, 1, "local fixture must contain one active finance manager");
    const admins = await serviceDb.unsafe(
      "select p.id,p.auth_user_id,p.email from public.profiles p join public.user_roles r on r.profile_id=p.id " +
      "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true and r.role='admin' order by p.id limit 2",
      [organizationId, adminEmail],
    );
    assert.equal(admins.length, 1, "local fixture must contain one active administrator for maker/checker");
    managerA = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
    managerB = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
    adminDb = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
    installUndefinedBindGuard(serviceDb, "serviceDb");
    installUndefinedBindGuard(managerA, "managerA");
    installUndefinedBindGuard(managerB, "managerB");
    installUndefinedBindGuard(adminDb, "adminDb");
    await Promise.all([
      setIdentity(managerA, managers[0].auth_user_id, managers[0].email),
      setIdentity(managerB, managers[0].auth_user_id, managers[0].email),
      setIdentity(adminDb, admins[0].auth_user_id, admins[0].email),
    ]);
    const managerToken = await signIn(
      managerEmail, requiredEnv("E2E_MANAGER_PASSWORD"), supabaseUrl, publishableKey,
    );
    const dates = await serviceDb.unsafe(
      "select current_date::text as today,(current_date-2)::text as opening_date,(current_date-1)::text as first_statement_date",
    );
    const today = dates[0].today;
    const openingDate = dates[0].opening_date;
    const firstStatementDate = dates[0].first_statement_date;
    const suffix = randomUUID().replaceAll("-", "").slice(-10).toUpperCase();

    const bankAccountId = await createAccount(serviceDb, organizationId, suffix, "P2-BANK-", "P2 Bank Asset", "asset");
    const openingEquityId = await createAccount(serviceDb, organizationId, suffix, "P2-BANK-EQ-", "P2 Opening Equity", "equity");
    const expenseAccountId = await createAccount(serviceDb, organizationId, suffix, "P2-BANK-EXP-", "P2 Bank Expense", "expense");
    const mappingRows = await serviceDb.unsafe(
      "insert into public.purchase_supplier_payment_settlement_accounts(" +
      "organization_id,accounting_account_id,settlement_kind,currency,display_name,created_by_profile_id" +
      ") values($1::uuid,$2::uuid,'bank','YER',$3,$4::uuid) returning id",
      [organizationId, bankAccountId, "P2 Bank Reconciliation " + suffix, managers[0].id],
    );
    const mappingId = mappingRows[0].id;

    const openingJournal = await createManualJournal(
      managerA, openingDate, "P2 verified bank opening balance " + suffix,
      bankAccountId, openingEquityId, 1000,
    );
    assert.equal(openingJournal.status, "draft");
    const openingPosted = await postJournal(adminDb, openingJournal.id);
    assert.equal(openingPosted.status, "posted");
    const openingEvidence = await uploadAndRegisterEvidence({
      managerDb: managerA, mappingId, evidenceKind: "opening_balance",
      supabaseUrl, publishableKey, accessToken: managerToken,
    });
    const proposalRows = await managerA.unsafe(
      "select public.submit_finance_cash_opening_balance($1::uuid,$2::uuid,$3::date,$4::numeric,$5::uuid) as result",
      [mappingId, openingEvidence.id, openingDate, "1000.00", randomUUID()],
    );
    const proposal = asJson(proposalRows[0].result);
    assert.equal(proposal.replayed, false);
    const reviewRows = await adminDb.unsafe(
      "select public.review_finance_cash_opening_balance($1::uuid,'approved',$2::text) as result",
      [proposal.proposal_id, "مطابقة الرصيد الافتتاحي مع قيد الأستاذ المرحّل"],
    );
    assert.equal(asJson(reviewRows[0].result).decision, "approved");

    const expenseDayOne = await recordCashExpense(
      managerA, firstStatementDate, "100.00", "P2 bank outflow day one", "P2-BANK-" + suffix + "-01",
    );
    assert.equal(expenseDayOne.replayed, false);
    const expenseJournalDayOne = await createCashExpenseJournal(managerA, expenseDayOne.expense_id, expenseAccountId, bankAccountId);
    assert.equal(expenseJournalDayOne.status, "draft");
    assert.equal((await postJournal(adminDb, expenseJournalDayOne.journal_entry_id)).status, "posted");
    const targetDayOne = await bankLine(serviceDb, organizationId, expenseJournalDayOne.journal_entry_id, bankAccountId);

    const statementEvidenceA = await uploadAndRegisterEvidence({
      managerDb: managerA, mappingId, evidenceKind: "bank_statement",
      supabaseUrl, publishableKey, accessToken: managerToken,
    });
    const statementA = await createStatement(
      managerA, mappingId, statementEvidenceA.id, "P2-STATEMENT-A-" + suffix,
      firstStatementDate, "1000.00", "900.00",
    );
    const statementALineIdempotencyKey = randomUUID();
    const statementALine = await recordStatementLine(
      managerA, statementA, 1, firstStatementDate, "P2-A-001", "Bank expense day one", "-100.00",
      statementALineIdempotencyKey,
    );

    const exactRetry = await Promise.all([
      matchBankLine(managerA, statementA, statementALine, targetDayOne),
      matchBankLine(managerB, statementA, statementALine, targetDayOne),
    ]);
    assert.equal(exactRetry[0].match_id, exactRetry[1].match_id,
      "concurrent exact matches must return one persisted match id");
    assert.deepEqual(exactRetry.map(x => x.replayed).sort(), [false, true],
      "one concurrent exact match inserts and the other replays");
    const matchedA = await serviceDb.unsafe(
      "select count(*)::integer as matches from public.finance_bank_statement_line_matches where organization_id=$1::uuid and statement_line_id=$2::uuid",
      [organizationId, statementALine],
    );
    assert.equal(matchedA[0].matches, 1);
    const runA = asJson((await managerA.unsafe(
      "select public.finalize_finance_bank_statement_reconciliation($1::uuid,$2::text) as result",
      [statementA, "مطابقة كشف البنك الأول بالقيد المرحّل"],
    ))[0].result);
    assert.equal(runA.outcome, "VERIFIED");
    const replayAfterClose = await matchBankLine(managerB, statementA, statementALine, targetDayOne);
    assert.equal(replayAfterClose.match_id, exactRetry[0].match_id);
    assert.equal(replayAfterClose.replayed, true,
      "retry after the server committed and the statement was verified returns the original match");

    const recordedLineReplay = asJson((await managerB.unsafe(
      "select public.record_finance_bank_statement_line($1::uuid,1,$2::date,'P2-A-001','Bank expense day one',-100.00::numeric,$3::uuid) as result",
      [statementA, firstStatementDate, statementALineIdempotencyKey],
    ))[0].result);
    assert.deepEqual(recordedLineReplay,{line_id:statementALine,replayed:true},
      "a committed statement-line retry after VERIFIED must return the original line id");
    await expectCode(
      "a changed statement-line payload cannot reuse its key after VERIFIED",
      () => managerB.unsafe(
        "select public.record_finance_bank_statement_line($1::uuid,1,$2::date,'P2-A-001','Bank expense day one',-101.00::numeric,$3::uuid)",
        [statementA, firstStatementDate, statementALineIdempotencyKey],
      ),
      "23505",
    );
    const stateAfterReplay = await statementSnapshot(serviceDb, organizationId, statementA);

    const expenseDayTwoA = await recordCashExpense(
      managerA, today, "100.00", "P2 bank outflow day two A", "P2-BANK-" + suffix + "-02A",
    );
    const expenseDayTwoB = await recordCashExpense(
      managerA, today, "100.00", "P2 bank outflow day two B", "P2-BANK-" + suffix + "-02B",
    );
    const journalDayTwoA = await createCashExpenseJournal(managerA, expenseDayTwoA.expense_id, expenseAccountId, bankAccountId);
    const journalDayTwoB = await createCashExpenseJournal(managerA, expenseDayTwoB.expense_id, expenseAccountId, bankAccountId);
    assert.equal((await postJournal(adminDb, journalDayTwoA.journal_entry_id)).status, "posted");
    assert.equal((await postJournal(adminDb, journalDayTwoB.journal_entry_id)).status, "posted");
    const targetDayTwoA = await bankLine(serviceDb, organizationId, journalDayTwoA.journal_entry_id, bankAccountId);
    const targetDayTwoB = await bankLine(serviceDb, organizationId, journalDayTwoB.journal_entry_id, bankAccountId);

    const statementEvidenceB = await uploadAndRegisterEvidence({
      managerDb: managerA, mappingId, evidenceKind: "bank_statement",
      supabaseUrl, publishableKey, accessToken: managerToken,
    });
    const statementB = await createStatement(
      managerA, mappingId, statementEvidenceB.id, "P2-STATEMENT-B-" + suffix,
      today, "900.00", "700.00",
    );
    const statementBLineOne = await recordStatementLine(
      managerA, statementB, 1, today, "P2-B-001", "Bank expense day two A", "-100.00",
    );
    const statementBLineTwo = await recordStatementLine(
      managerA, statementB, 2, today, "P2-B-002", "Bank expense day two B", "-100.00",
    );
    const racing = await Promise.allSettled([
      matchBankLine(managerA, statementB, statementBLineOne, targetDayTwoA),
      matchBankLine(managerB, statementB, statementBLineTwo, targetDayTwoA),
    ]);
    const winners = racing.filter(x => x.status === "fulfilled");
    const losers = racing.filter(x => x.status === "rejected");
    assert.equal(winners.length, 1, "only one of two statement lines can consume a posted GL line");
    assert.equal(losers.length, 1, "the competing statement line must be rejected");
    assert.equal(String(losers[0].reason?.code), "23505",
      "competing GL-line consumption must fail with unique-conflict SQLSTATE");
    const winnerLine = racing[0].status === "fulfilled" ? statementBLineOne : statementBLineTwo;
    const loserLine = racing[0].status === "rejected" ? statementBLineOne : statementBLineTwo;
    const winnerMatch = winners[0].value;
    assert.equal(winnerMatch.replayed, false);
    const winnerRows = await serviceDb.unsafe(
      "select statement_line_id::text from public.finance_bank_statement_line_matches where organization_id=$1::uuid and id=$2::uuid",
      [organizationId, winnerMatch.match_id],
    );
    assert.equal(winnerRows[0].statement_line_id, winnerLine);
    await expectCode(
      "a matched statement line cannot be reassigned to a different posted GL line",
      () => matchBankLine(managerA, statementB, winnerLine, targetDayTwoB),
      "23505",
    );
    const loserResolved = await matchBankLine(managerB, statementB, loserLine, targetDayTwoB);
    assert.equal(loserResolved.replayed, false);

    const runB = asJson((await managerA.unsafe(
      "select public.finalize_finance_bank_statement_reconciliation($1::uuid,$2::text) as result",
      [statementB, "مطابقة حركتي البنك مع قيدي الأستاذ المستقلين"],
    ))[0].result);
    assert.equal(runB.outcome, "VERIFIED");
    assert.equal(runB.unmatched_ledger_lines, 0);
    assert.equal(runB.unmatched_statement_lines, 0);
    assert.equal(Number(runB.statement_net_movement), -200);
    assert.equal(Number(runB.ledger_net_movement), -200);
    const verifiedRunRows = await serviceDb.unsafe(
      "select outcome,statement_line_count,matched_line_count,unmatched_statement_lines,unmatched_ledger_lines," +
      "statement_net_movement::text,ledger_net_movement::text " +
      "from public.finance_bank_statement_reconciliation_runs where organization_id=$1::uuid and statement_id=$2::uuid",
      [organizationId, statementB],
    );
    assert.deepEqual([...verifiedRunRows], [{
      outcome: "VERIFIED", statement_line_count: 2, matched_line_count: 2,
      unmatched_statement_lines: 0, unmatched_ledger_lines: 0,
      statement_net_movement: "-200.00", ledger_net_movement: "-200.00",
    }], "persisted reconciliation run retains exact counters and equal signed movements");

    await expectCode(
      "exact match replay after VERIFIED must not allow a different ledger target",
      () => matchBankLine(managerB, statementA, statementALine, targetDayTwoA),
      "23505",
    );
    assert.equal(await statementSnapshot(serviceDb, organizationId, statementA), stateAfterReplay,
      "replay and conflicting retry after VERIFIED must not alter matches, runs or audit rows");

    const counts = await serviceDb.unsafe(
      "select " +
      "(select count(*)::integer from public.finance_bank_statement_line_matches m join public.finance_bank_statement_lines l on l.organization_id=m.organization_id and l.id=m.statement_line_id where m.organization_id=$1::uuid and l.statement_id=$2::uuid) as statement_b_matches," +
      "(select count(*)::integer from public.audit_logs a where a.organization_id=$1::uuid and a.action='finance.bank_statement_line_matched' and a.entity_type='finance_bank_statement_line_match' and a.entity_id in (select m.id from public.finance_bank_statement_line_matches m join public.finance_bank_statement_lines l on l.organization_id=m.organization_id and l.id=m.statement_line_id where m.organization_id=$1::uuid and l.statement_id=$2::uuid)) as statement_b_match_audits," +
      "(select count(*)::integer from public.finance_bank_statement_reconciliation_runs r where r.organization_id=$1::uuid and r.statement_id=$2::uuid and r.outcome='VERIFIED') as verified_runs",
      [organizationId, statementB],
    );
    assert.equal(counts[0].statement_b_matches, 2, "both bank lines are matched exactly once");
    assert.equal(counts[0].statement_b_match_audits, 2, "each persisted match emits exactly one audit record");
    assert.equal(counts[0].verified_runs, 1, "reconciliation finalization is appended exactly once");
    const candidates = asJson((await managerA.unsafe(
      "select public.fetch_finance_bank_statement_match_candidates($1::uuid,$2::uuid) as result",
      [statementB, statementBLineOne],
    ))[0].result);
    assert.ok(Array.isArray(candidates));
    assert.equal(candidates.some(x => x.journal_entry_id === targetDayTwoA.journalEntryId), false,
      "a consumed ledger line is excluded from subsequent candidate lookup");

    process.stdout.write(
      "PASS PostgreSQL 17 bank reconciliation: same-key concurrent match replay; lost-response retry after VERIFIED; " +
      "changed-target rejection with no writes; one GL line cannot be consumed by two statement lines; " +
      "balanced two-line reconciliation; immutable match/audit counts; actual local Storage evidence and approved opening-balance chain.\n",
    );
  } finally {
    if (adminDb) await adminDb.end({ timeout: 5 }).catch(() => {});
    if (managerB) await managerB.end({ timeout: 5 }).catch(() => {});
    if (managerA) await managerA.end({ timeout: 5 }).catch(() => {});
    await serviceDb.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  const diagnostic = error && typeof error === "object" ? {
    code: error.code, detail: error.detail, hint: error.hint, constraint: error.constraint_name,
  } : undefined;
  process.stderr.write(
    "FAIL PostgreSQL 17 bank reconciliation acceptance: " + String(error?.stack ?? error) +
    (diagnostic ? "\nDatabase diagnostic: " + JSON.stringify(diagnostic) : "") + "\n",
  );
  process.exitCode = 1;
});
