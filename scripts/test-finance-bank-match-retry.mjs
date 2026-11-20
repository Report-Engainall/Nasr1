import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

function requiredLocalDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) throw new Error("TEST_DATABASE_URL is required for finance bank-match acceptance.");
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\\[|\\]$/g, "");
  const port = url.port || "5432";
  const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  if (!isLoopback || !/^\\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("Finance bank-match acceptance refuses non-loopback PostgreSQL endpoints (host=" + hostname + ", port=" + port + ").");
  }
  return value;
}

function expectSqlState(promise, code, message) {
  return promise.then(
    () => assert.fail(message + ": operation unexpectedly succeeded"),
    (error) => {
      assert.equal(String(error?.code), code, message + ": unexpected SQLSTATE " + String(error?.code) + " (" + String(error?.message) + ")");
      return error;
    },
  );
}

async function actorCall(client, actor, canManageFinance, input) {
  return client.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [actor.authUserId]);
    await tx.unsafe("select set_config('test.finance_profile_id',$1,true)", [actor.profileId]);
    await tx.unsafe("select set_config('test.can_manage_finance',$1,true)", [String(canManageFinance)]);
    await tx.unsafe("set local role authenticated");
    const rows = await tx.unsafe(
      "select public.match_finance_bank_statement_line($1::uuid,$2::uuid,$3::uuid,$4::integer) as result",
      [input.statementId, input.statementLineId, input.journalEntryId, input.journalLineNumber],
    );
    const value = typeof rows[0]?.result === "string" ? JSON.parse(rows[0].result) : rows[0]?.result;
    assert.ok(value && typeof value === "object", "the server must return a match acknowledgement");
    return value;
  });
}

async function main() {
  const db = postgres(requiredLocalDatabaseUrl(), { max: 8, prepare: false, idle_timeout: 5 });
  const peer = postgres(requiredLocalDatabaseUrl(), { max: 4, prepare: false, idle_timeout: 5 });
  try {
    await db.unsafe(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

      CREATE OR REPLACE FUNCTION public.current_profile_id()
      RETURNS uuid LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT nullif(current_setting('test.finance_profile_id',true),'')::uuid $$;

      CREATE OR REPLACE FUNCTION public.can_manage_finance()
      RETURNS boolean LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT coalesce(nullif(current_setting('test.can_manage_finance',true),'')::boolean,false) $$;

      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        auth_user_id uuid NOT NULL,
        is_active boolean NOT NULL
      );
      CREATE TABLE public.purchase_supplier_payment_settlement_accounts (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        accounting_account_id uuid NOT NULL,
        is_active boolean NOT NULL
      );
      CREATE TABLE public.finance_bank_statements (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        settlement_account_mapping_id uuid NOT NULL,
        period_from date NOT NULL,
        period_to date NOT NULL
      );
      CREATE TABLE public.finance_bank_statement_lines (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        statement_id uuid NOT NULL,
        line_number integer NOT NULL,
        transaction_date date NOT NULL,
        external_reference text,
        description text,
        signed_amount numeric(18,2) NOT NULL,
        UNIQUE (organization_id, statement_id, line_number)
      );
      CREATE TABLE public.finance_bank_statement_line_matches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        statement_line_id uuid NOT NULL,
        journal_entry_id uuid NOT NULL,
        journal_line_number integer NOT NULL,
        matched_by_profile_id uuid NOT NULL,
        UNIQUE (organization_id, statement_line_id)
      );
      CREATE TABLE public.finance_bank_statement_voids (
        organization_id uuid NOT NULL,
        statement_id uuid NOT NULL,
        PRIMARY KEY (organization_id, statement_id)
      );
      CREATE TABLE public.finance_bank_statement_reconciliation_runs (
        organization_id uuid NOT NULL,
        statement_id uuid NOT NULL,
        outcome text NOT NULL
      );
      CREATE TABLE public.accounting_journal_entries (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        entry_date date NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE public.accounting_journal_lines (
        organization_id uuid NOT NULL,
        journal_entry_id uuid NOT NULL,
        line_number integer NOT NULL,
        account_id uuid NOT NULL,
        debit numeric(18,2) NOT NULL DEFAULT 0,
        credit numeric(18,2) NOT NULL DEFAULT 0,
        PRIMARY KEY (organization_id, journal_entry_id, line_number)
      );
      CREATE TABLE public.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        old_value jsonb NOT NULL,
        new_value jsonb NOT NULL
      );
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
      GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated;
    `);

    const migrationPath = fileURLToPath(new URL("../supabase/migrations/20261117250000_finance_bank_match_exact_retry.sql", import.meta.url));
    const migrationSql = await readFile(migrationPath, "utf8");
    await db.unsafe(migrationSql);
    // Reapplying the function definition must be safe; this also guards against
    // accidental one-shot migration behavior in the retry contract.
    await db.unsafe(migrationSql);

    const privilege = await db.unsafe(
      "select has_function_privilege('anon','public.match_finance_bank_statement_line(uuid,uuid,uuid,integer)','EXECUTE') as anon_exec," +
      "has_function_privilege('authenticated','public.match_finance_bank_statement_line(uuid,uuid,uuid,integer)','EXECUTE') as authenticated_exec",
    );
    assert.deepEqual(privilege[0], { anon_exec: false, authenticated_exec: true },
      "only authenticated users may execute the tenant-authorized match command");

    const actor = { profileId: randomUUID(), authUserId: randomUUID() };
    const otherOrg = randomUUID();
    const organizationId = randomUUID();
    const bankAccountId = randomUUID();
    const offsetAccountId = randomUUID();
    const mappingId = randomUUID();
    await db.unsafe(
      "insert into public.profiles(id,organization_id,auth_user_id,is_active) values($1::uuid,$2::uuid,$3::uuid,true)",
      [actor.profileId, organizationId, actor.authUserId],
    );
    await db.unsafe(
      "insert into public.purchase_supplier_payment_settlement_accounts(id,organization_id,accounting_account_id,is_active) values($1::uuid,$2::uuid,$3::uuid,true)",
      [mappingId, organizationId, bankAccountId],
    );

    async function createStatementLine(statementId, lineId, lineNumber, amount = "1250.00", orgId = organizationId) {
      await db.unsafe(
        "insert into public.finance_bank_statements(id,organization_id,settlement_account_mapping_id,period_from,period_to) values($1::uuid,$2::uuid,$3::uuid,'2026-01-01','2026-12-31')",
        [statementId, orgId, mappingId],
      );
      await db.unsafe(
        "insert into public.finance_bank_statement_lines(id,organization_id,statement_id,line_number,transaction_date,external_reference,description,signed_amount) values($1::uuid,$2::uuid,$3::uuid,$4::integer,'2026-11-20',$5::text,$6::text,$7::numeric)",
        [lineId, orgId, statementId, lineNumber, "REF-" + lineNumber, "finance retry fixture " + lineNumber, amount],
      );
      return { statementId, statementLineId: lineId };
    }

    async function createBalancedJournal(entryId, amount = "1250.00") {
      await db.unsafe(
        "insert into public.accounting_journal_entries(id,organization_id,entry_date,status) values($1::uuid,$2::uuid,'2026-11-20','posted')",
        [entryId, organizationId],
      );
      await db.unsafe(
        "insert into public.accounting_journal_lines(organization_id,journal_entry_id,line_number,account_id,debit,credit) values" +
        "($1::uuid,$2::uuid,1,$3::uuid,$4::numeric,0),($1::uuid,$2::uuid,2,$5::uuid,0,$4::numeric)",
        [organizationId, entryId, bankAccountId, amount, offsetAccountId],
      );
    }

    const statement1 = randomUUID(), line1 = randomUUID(), journal1 = randomUUID();
    const request1 = { ...(await createStatementLine(statement1, line1, 1)), journalEntryId: journal1, journalLineNumber: 1 };
    await createBalancedJournal(journal1);

    await expectSqlState(
      actorCall(db, actor, false, request1),
      "42501",
      "finance permission must be checked before a bank line can be matched",
    );
    const deniedMatches = await db.unsafe("select count(*)::integer as count from public.finance_bank_statement_line_matches");
    assert.equal(deniedMatches[0].count, 0, "a denied caller must not create a match row");

    const first = await actorCall(db, actor, true, request1);
    assert.equal(first.matched, true);
    assert.equal(first.replayed, false);
    assert.ok(first.match_id);

    const auditCount = async (entityId) => {
      const rows = await db.unsafe(
        "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='finance.bank_statement_line_matched' and entity_type='finance_bank_statement_line_match' and entity_id=$2::uuid",
        [organizationId, entityId],
      );
      return rows[0].count;
    };
    assert.equal(await auditCount(first.match_id), 1, "the initial match must append exactly one audit event");

    await db.unsafe(
      "insert into public.finance_bank_statement_reconciliation_runs(organization_id,statement_id,outcome) values($1::uuid,$2::uuid,'VERIFIED')",
      [organizationId, statement1],
    );
    const exactReplayAfterVerified = await actorCall(db, actor, true, request1);
    assert.equal(exactReplayAfterVerified.match_id, first.match_id);
    assert.equal(exactReplayAfterVerified.replayed, true,
      "an exact retry must acknowledge the original match even after the statement is verified and closed");
    assert.equal(await auditCount(first.match_id), 1, "an exact retry must not duplicate the audit event");

    const journal2 = randomUUID();
    await createBalancedJournal(journal2);
    await expectSqlState(
      actorCall(db, actor, true, { ...request1, journalEntryId: journal2 }),
      "23505",
      "a bank statement line already matched cannot be reassigned to a different ledger line",
    );

    const statement2 = randomUUID(), line2 = randomUUID();
    const request2 = { ...(await createStatementLine(statement2, line2, 1)), journalEntryId: journal1, journalLineNumber: 1 };
    await expectSqlState(
      actorCall(db, actor, true, request2),
      "23505",
      "one posted ledger line cannot be consumed by a second active statement",
    );

    // The row lock on the same statement line and the GL advisory lock must make
    // simultaneous exact commands converge on one committed match and one audit.
    const statement3 = randomUUID(), line3 = randomUUID(), journal3 = randomUUID();
    const request3 = { ...(await createStatementLine(statement3, line3, 1)), journalEntryId: journal3, journalLineNumber: 1 };
    await createBalancedJournal(journal3);
    await db.unsafe(`
      CREATE OR REPLACE FUNCTION public.finance_retry_test_delay_match_insert()
      RETURNS trigger LANGUAGE plpgsql SET search_path=''
      AS $$ BEGIN PERFORM pg_catalog.pg_sleep(0.20); RETURN NEW; END $$;
      CREATE TRIGGER finance_retry_test_delay_match_insert
      BEFORE INSERT ON public.finance_bank_statement_line_matches
      FOR EACH ROW EXECUTE FUNCTION public.finance_retry_test_delay_match_insert();
    `);
    const concurrentExact = await Promise.all([
      actorCall(db, actor, true, request3),
      actorCall(peer, actor, true, request3),
    ]);
    assert.deepEqual(concurrentExact.map((item) => item.replayed).sort(), [false, true],
      "two concurrent exact commands must produce one insert and one replay acknowledgement");
    assert.equal(concurrentExact[0].match_id, concurrentExact[1].match_id,
      "concurrent exact retries must return the same committed match identity");
    assert.equal(await auditCount(concurrentExact[0].match_id), 1,
      "concurrent exact retries must append only one audit event");

    // Two separate bank lines race for the same posted GL line. The transaction-
    // scoped advisory lock must allow one winner and reject the other atomically.
    const statement4 = randomUUID(), line4 = randomUUID();
    const statement5 = randomUUID(), line5 = randomUUID();
    const journal4 = randomUUID();
    const request4 = { ...(await createStatementLine(statement4, line4, 1)), journalEntryId: journal4, journalLineNumber: 1 };
    const request5 = { ...(await createStatementLine(statement5, line5, 1)), journalEntryId: journal4, journalLineNumber: 1 };
    await createBalancedJournal(journal4);
    const competing = await Promise.allSettled([
      actorCall(db, actor, true, request4),
      actorCall(peer, actor, true, request5),
    ]);
    assert.equal(competing.filter((item) => item.status === "fulfilled").length, 1,
      "exactly one concurrent statement line may consume a posted GL line");
    assert.equal(competing.filter((item) => item.status === "rejected").length, 1,
      "the competing statement must be rejected instead of double-consuming the GL line");
    const rejected = competing.find((item) => item.status === "rejected");
    assert.equal(String(rejected.reason?.code), "23505",
      "the losing concurrent match must be rejected as a uniqueness conflict");
    const raceMatches = await db.unsafe(
      "select count(*)::integer as count from public.finance_bank_statement_line_matches where organization_id=$1::uuid and journal_entry_id=$2::uuid and journal_line_number=1",
      [organizationId, journal4],
    );
    assert.equal(raceMatches[0].count, 1, "concurrent GL consumption must persist exactly one match row");
    const raceAudit = await db.unsafe(
      "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='finance.bank_statement_line_matched' and entity_id in (select id from public.finance_bank_statement_line_matches where journal_entry_id=$2::uuid)",
      [organizationId, journal4],
    );
    assert.equal(raceAudit[0].count, 1, "concurrent GL consumption must persist exactly one audit event");

    // Tenant boundaries are enforced before exposing or modifying foreign data.
    const foreignStatement = randomUUID(), foreignLine = randomUUID();
    const foreignRequest = { ...(await createStatementLine(foreignStatement, foreignLine, 1, "1250.00", otherOrg)), journalEntryId: journal1, journalLineNumber: 1 };
    await expectSqlState(
      actorCall(db, actor, true, foreignRequest),
      "42501",
      "a caller cannot match a statement line outside their organization",
    );

    process.stdout.write(
      "PASS finance bank match PostgreSQL 17: tenant/finance authorization, exact closed-statement replay, alternate-match rejection, single-use GL enforcement, concurrent exact replay, concurrent double-consumption prevention, and one audit event per committed match.\\n",
    );
  } finally {
    await Promise.all([
      db.end({ timeout: 5 }).catch(() => {}),
      peer.end({ timeout: 5 }).catch(() => {}),
    ]);
  }
}

main().catch((error) => {
  process.stderr.write("FAIL finance bank match PostgreSQL 17: " + String(error?.stack ?? error) + "\\n");
  process.exitCode = 1;
});
