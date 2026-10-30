import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function setIdentityOn(client, authUserId, email) {
  await client.unsafe("reset role").catch(() => {});
  const sessionId = randomUUID();
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI journal-reversal session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, role: "authenticated", session_id: sessionId }),
  ]);
  await client.unsafe("set role authenticated");
}

export async function runGeneralLedgerReversalAcceptance({
  db,
  setIdentity,
  expectFailure,
  connectionString,
  organizationId,
  otherOrganizationId,
  staffAuthUserId,
  operationsStaffAuthUserId,
  customerAuthUserId,
  foreignAuthUserId,
  foreignProfileId,
}) {
  assert.ok(connectionString, "local PostgreSQL connection string is required");
  async function inspectReversalMappings(query, params) {
    const priorRole = (await db.unsafe("select current_setting('role', true) as role"))[0]?.role;
    await db.unsafe("reset role");
    try {
      return await db.unsafe(query, params);
    } finally {
      if (["authenticated", "anon", "service_role"].includes(priorRole)) {
        await db.unsafe("set role " + priorRole);
      }
    }
  }
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");

  const suffix = randomUUID().replaceAll("-", "").slice(-10).toUpperCase();
  async function createAccount(code, name, type) {
    const rows = await db.unsafe(
      "select public.create_accounting_account($1::text,$2::text,$3::text,null,null) as result",
      [code + suffix, name + " " + suffix, type],
    );
    const result = asJson(rows[0].result);
    assert.match(result.id, /^[0-9a-f-]{36}$/i, "account must be created through the authorized RPC");
    return result.id;
  }
  async function createDraft(client, expenseAccountId, cashAccountId, key, description = "P2 manual journal reversal acceptance") {
    return asJson((await client.unsafe(
      "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
      [key, "2026-10-23", description, client.json([
        { account_id: expenseAccountId, debit: "125.50", credit: "0", memo: "Original debit evidence" },
        { account_id: cashAccountId, debit: "0", credit: "125.50", memo: "Original credit evidence" },
      ]), null],
    ))[0].result);
  }
  async function postJournal(client, id) {
    return asJson((await client.unsafe(
      "select public.post_general_journal_entry($1::uuid) as result", [id],
    ))[0].result);
  }
  async function reverse(client, id, reason, key) {
    return asJson((await client.unsafe(
      "select public.reverse_general_journal_entry($1::uuid,$2::text,$3::uuid) as result",
      [id, reason, key],
    ))[0].result);
  }

  async function captureJournalReversalDenialState(originalId, reversalId) {
    await db.unsafe("reset role");
    try {
      const rows = await db.unsafe(
        "select jsonb_build_object(" +
          "'original_entry',(select to_jsonb(e) from public.accounting_journal_entries e where e.organization_id=$1::uuid and e.id=$2::uuid)," +
          "'reversal_entry',(select to_jsonb(e) from public.accounting_journal_entries e where e.organization_id=$1::uuid and e.id=$3::uuid)," +
          "'original_lines',coalesce((select jsonb_agg(to_jsonb(l) order by to_jsonb(l)::text) from public.accounting_journal_lines l where l.organization_id=$1::uuid and l.journal_entry_id=$2::uuid),'[]'::jsonb)," +
          "'reversal_lines',coalesce((select jsonb_agg(to_jsonb(l) order by to_jsonb(l)::text) from public.accounting_journal_lines l where l.organization_id=$1::uuid and l.journal_entry_id=$3::uuid),'[]'::jsonb)," +
          "'reversal_mapping',coalesce((select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.accounting_journal_reversals r where r.organization_id=$1::uuid and r.original_journal_entry_id=$2::uuid),'[]'::jsonb)," +
          "'audit',coalesce((select jsonb_agg(to_jsonb(a) order by to_jsonb(a)::text) from public.audit_logs a where a.organization_id=$1::uuid and ((a.entity_type='accounting_journal_entry' and a.entity_id in ($2::uuid,$3::uuid)) or (a.entity_type='accounting_journal_reversal' and a.entity_id in (select r.id from public.accounting_journal_reversals r where r.organization_id=$1::uuid and r.original_journal_entry_id=$2::uuid)))),'[]'::jsonb)" +
        ")::text as snapshot",
        [organizationId, originalId, reversalId],
      );
      assert.equal(rows.length, 1, "privileged ledger reversal oracle must return one full-state snapshot");
      return rows[0].snapshot;
    } finally {
      await db.unsafe("set role authenticated");
    }
  }
  async function waitForReversalLockContenders(applicationPrefix, expectedCount, description) {
    await db.unsafe("reset role");
    try {
      let observed = false;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const waiting = await db.unsafe(
          "select count(*)::integer as count from pg_catalog.pg_stat_activity " +
          "where application_name like $1 and state='active' and wait_event_type='Lock'",
          [applicationPrefix + "%"],
        );
        if (Number(waiting[0]?.count ?? 0) === expectedCount) {
          observed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(observed, true, description);
    } finally {
      await db.unsafe("set role authenticated");
    }
  }
  async function runObservedJournalRace({ targetId, applicationPrefix, clients, invoke }) {
    const gate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
    let gateOpen = false;
    let attemptsPromise;
    try {
      await gate.unsafe("begin");
      gateOpen = true;
      await gate.unsafe(
        "select id from public.accounting_journal_entries where organization_id=$1::uuid and id=$2::uuid for update",
        [organizationId, targetId],
      );
      await Promise.all(clients.map(async (client, index) => {
        await setIdentityOn(client, staffAuthUserId, "admin@aghbari.ye");
        await client.unsafe("select set_config('application_name',$1,false)", [
          applicationPrefix + (index === 0 ? "a" : "b"),
        ]);
      }));
      attemptsPromise = invoke(clients);
      await waitForReversalLockContenders(
        applicationPrefix,
        clients.length,
        "both concurrent reversal calls must be observed waiting on PostgreSQL locks before the source row is released",
      );
      await gate.unsafe("commit");
      gateOpen = false;
      return await attemptsPromise;
    } finally {
      if (gateOpen) await gate.unsafe("rollback").catch(() => {});
      if (attemptsPromise) await Promise.allSettled([attemptsPromise]);
      await gate.end({ timeout: 5 }).catch(() => {});
    }
  }

  const expenseAccountId = await createAccount("CI-REV-EXP-", "CI reversal expense", "expense");
  const cashAccountId = await createAccount("CI-REV-CASH-", "CI reversal cash", "asset");
  const originalDraft = await createDraft(db, expenseAccountId, cashAccountId, randomUUID());
  assert.equal(originalDraft.status, "draft");
  assert.equal((await postJournal(db, originalDraft.id)).status, "posted");

  const reversalKey = randomUUID();
  const reversalReason = "Documented correction for CI journal reversal";
  const reversal = await reverse(db, originalDraft.id, reversalReason, reversalKey);
  assert.equal(reversal.original_journal_entry_id, originalDraft.id);
  assert.match(reversal.reversal_journal_entry_id, /^[0-9a-f-]{36}$/i);
  assert.equal(reversal.status, "draft", "reversal must remain a draft until the authorized explicit post action");
  assert.equal(reversal.replayed, false);

  const linked = await inspectReversalMappings(
    "select r.id,r.reason,r.payload_fingerprint,original.status as original_status,original.source_type as original_source_type,reversal.status as reversal_status,reversal.source_type as reversal_source_type,reversal.source_reference,reversal.idempotency_key::text from public.accounting_journal_reversals r join public.accounting_journal_entries original on original.id=r.original_journal_entry_id and original.organization_id=r.organization_id join public.accounting_journal_entries reversal on reversal.id=r.reversal_journal_entry_id and reversal.organization_id=r.organization_id where r.organization_id=$1::uuid and r.original_journal_entry_id=$2::uuid",
    [organizationId, originalDraft.id],
  );
  assert.equal(linked.length, 1, "only one tenant-scoped reversal record must map the original journal");
  assert.equal(linked[0].reason, reversalReason);
  assert.equal(linked[0].original_status, "posted");
  assert.equal(linked[0].original_source_type, "manual");
  assert.equal(linked[0].reversal_status, "draft");
  assert.equal(linked[0].reversal_source_type, "adjustment");
  assert.equal(linked[0].source_reference, originalDraft.id);

  const originalLines = await db.unsafe(
    "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number",
    [organizationId, originalDraft.id],
  );
  const reversalLines = await db.unsafe(
    "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number",
    [organizationId, reversal.reversal_journal_entry_id],
  );
  assert.equal(originalLines.length, 2);
  assert.equal(reversalLines.length, originalLines.length);
  for (let i = 0; i < originalLines.length; i += 1) {
    assert.equal(reversalLines[i].line_number, originalLines[i].line_number);
    assert.equal(reversalLines[i].account_id, originalLines[i].account_id);
    assert.equal(reversalLines[i].debit, originalLines[i].credit);
    assert.equal(reversalLines[i].credit, originalLines[i].debit);
  }

  const replay = await reverse(db, originalDraft.id, reversalReason, reversalKey);
  assert.equal(replay.reversal_journal_entry_id, reversal.reversal_journal_entry_id);
  assert.equal(replay.replayed, true, "an exact retry must return the single existing reversal");
  await expectFailure(
    "same reversal idempotency key rejects a changed reason",
    () => reverse(db, originalDraft.id, "Different reason for the same key", reversalKey),
    /idempotency key payload conflict/i,
  );
  await expectFailure(
    "a posted journal cannot receive a second reversal under another key",
    () => reverse(db, originalDraft.id, reversalReason, randomUUID()),
    /already has a reversal/i,
  );

  const unpostedDraft = await createDraft(db, expenseAccountId, cashAccountId, randomUUID(), "P2 unposted reversal must be denied");
  await expectFailure(
    "unposted manual journal cannot be reversed",
    () => reverse(db, unpostedDraft.id, "Should not reverse a draft", randomUUID()),
    /only posted journal entries can be reversed/i,
  );

  const sourceLinkedRows = await db.unsafe(
    "select id,source_type from public.accounting_journal_entries where organization_id=$1::uuid and status='posted' and source_type not in ('manual','adjustment') order by entry_number desc limit 1",
    [organizationId],
  );
  assert.equal(sourceLinkedRows.length, 1, "the finance acceptance fixture must include a real posted source-linked journal");
  await expectFailure(
    "invoice/payment/cash-expense source journals must use their source-specific reversal workflow",
    () => reverse(db, sourceLinkedRows[0].id, "Do not bypass source-specific reversal", randomUUID()),
    /source-linked entries must use their source-specific reversal workflow/i,
  );

  // A finance-capable administrator in another organization must not discover or reverse the original entry.
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'admin') on conflict(profile_id,role) do nothing",
    [foreignProfileId],
  );
  await setIdentity(foreignAuthUserId, "foreign-ci-profile@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "foreign-organization administrator cannot reverse another tenant journal",
    () => reverse(db, originalDraft.id, "Foreign tenant reversal attempt", randomUUID()),
    /journal entry not found in this organization/i,
  );
  const hiddenReversalLink = await db.unsafe(
    "select * from public.fetch_general_journal_reversal_links($1::uuid[])",
    [[originalDraft.id, reversal.reversal_journal_entry_id]],
  );
  assert.equal(hiddenReversalLink.length, 0, "the scoped RPC hides another tenant's reversal mapping");
  await expectFailure(
    "authenticated clients cannot read reversal mapping storage directly",
    () => db.unsafe("select id from public.accounting_journal_reversals where organization_id=$1::uuid", [organizationId]),
    /permission denied/i,
  );

  await db.unsafe("reset role");
  await setIdentity(customerAuthUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary customer cannot reverse a posted journal",
    () => reverse(db, originalDraft.id, "Unauthorized customer reversal attempt", randomUUID()),
    /administrator or manager permission required/i,
    "42501",
  );

  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  const journalStateBeforeDeniedStaffReversal = await captureJournalReversalDenialState(
    originalDraft.id,
    reversal.reversal_journal_entry_id,
  );
  await expectFailure(
    "same-tenant ordinary staff cannot reverse a posted general journal",
    () => reverse(db, originalDraft.id, "Unauthorized staff reversal attempt", randomUUID()),
    /administrator or manager permission required/i,
    "42501",
  );
  const journalStateAfterDeniedStaffReversal = await captureJournalReversalDenialState(
    originalDraft.id,
    reversal.reversal_journal_entry_id,
  );
  assert.equal(
    journalStateAfterDeniedStaffReversal,
    journalStateBeforeDeniedStaffReversal,
    "ordinary-staff denial must preserve the original/reversal journal entries, lines, mapping and audit rows byte-for-byte",
  );

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "a linked reversal draft cannot be voided before explicit posting",
    () => db.unsafe(
      "select public.void_general_journal_draft($1::uuid,$2::text)",
      [reversal.reversal_journal_entry_id, "Keep linked reversal draft available"],
    ),
    /reversal draft cannot be voided/i,
  );
  const stillDraft = await inspectReversalMappings(
    "select reversal.status as reversal_status from public.accounting_journal_reversals r join public.accounting_journal_entries reversal on reversal.id=r.reversal_journal_entry_id and reversal.organization_id=r.organization_id where r.organization_id=$1::uuid and r.original_journal_entry_id=$2::uuid",
    [organizationId, originalDraft.id],
  );
  assert.deepEqual(stillDraft.map((row) => row.reversal_status), ["draft"]);
  const replayAfterDeniedVoid = await reverse(db, originalDraft.id, reversalReason, reversalKey);
  assert.equal(replayAfterDeniedVoid.reversal_journal_entry_id, reversal.reversal_journal_entry_id);
  assert.equal(replayAfterDeniedVoid.status, "draft");
  assert.equal(replayAfterDeniedVoid.replayed, true, "a rejected void must leave the same reversal safely retryable");

  const postedReversal = await postJournal(db, reversal.reversal_journal_entry_id);
  assert.equal(postedReversal.status, "posted", "reversal becomes financial only after explicit posting");
  assert.equal(postedReversal.replayed, false);
  const postedReplay = await postJournal(db, reversal.reversal_journal_entry_id);
  assert.equal(postedReplay.replayed, true, "posting the reversal remains idempotent");
  await expectFailure(
    "a reversal entry cannot itself be reversed through the generic reversal endpoint",
    () => reverse(db, reversal.reversal_journal_entry_id, "Attempt to reverse a reversal", randomUUID()),
    /a reversal journal cannot itself be reversed/i,
  );

  const finalStatus = await inspectReversalMappings(
    "select original.status as original_status,reversal.status as reversal_status from public.accounting_journal_reversals r join public.accounting_journal_entries original on original.id=r.original_journal_entry_id and original.organization_id=r.organization_id join public.accounting_journal_entries reversal on reversal.id=r.reversal_journal_entry_id and reversal.organization_id=r.organization_id where r.organization_id=$1::uuid and r.original_journal_entry_id=$2::uuid",
    [organizationId, originalDraft.id],
  );
  assert.deepEqual(finalStatus.map((row) => [row.original_status, row.reversal_status]), [["posted", "posted"]]);
  const auditRows = await db.unsafe(
    "select action,actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='accounting_journal_reversal' and entity_id=$2::uuid order by action",
    [organizationId, linked[0].id],
  );
  assert.ok(auditRows.some((row) => row.action === "accounting.journal_reversal_draft_created"));
  const journalAuditRows = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1::uuid and entity_type='accounting_journal_entry' and entity_id=$2::uuid",
    [organizationId, reversal.reversal_journal_entry_id],
  );
  assert.ok(journalAuditRows.some((row) => row.action === "accounting.journal_posted"));

  // Deterministically hold the original row so both same-key RPC sessions are
  // observed waiting before release; Promise.all alone does not prove overlap.
  const concurrentOriginal = await createDraft(db, expenseAccountId, cashAccountId, randomUUID(), "P2 concurrent reversal source");
  assert.equal((await postJournal(db, concurrentOriginal.id)).status, "posted");
  const concurrentKey = randomUUID();
  const concurrentReason = "One reversal despite concurrent exact requests";
  const a = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const b = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    const attempts = await runObservedJournalRace({
      targetId: concurrentOriginal.id,
      applicationPrefix: "ci-gl-reversal-same-",
      clients: [a, b],
      invoke: ([clientA, clientB]) => Promise.all([
        reverse(clientA, concurrentOriginal.id, concurrentReason, concurrentKey),
        reverse(clientB, concurrentOriginal.id, concurrentReason, concurrentKey),
      ]),
    });
    assert.equal(attempts[0].reversal_journal_entry_id, attempts[1].reversal_journal_entry_id);
    assert.equal(attempts.filter((item) => item.replayed === false).length, 1);
    assert.equal(attempts.filter((item) => item.replayed === true).length, 1);
  } finally {
    await Promise.all([a.end({ timeout: 5 }).catch(() => {}), b.end({ timeout: 5 }).catch(() => {})]);
  }
  const concurrentLinks = await inspectReversalMappings(
    "select count(*)::integer as count from public.accounting_journal_reversals where organization_id=$1::uuid and original_journal_entry_id=$2::uuid",
    [organizationId, concurrentOriginal.id],
  );
  assert.equal(concurrentLinks[0].count, 1, "race must not create duplicate reversal mapping rows");

  // Different keys must also overlap on the same posted source: exactly one
  // reversal may win, with no partial second mapping or draft.
  const competingOriginal = await createDraft(db, expenseAccountId, cashAccountId, randomUUID(), "P2 competing reversal source");
  assert.equal((await postJournal(db, competingOriginal.id)).status, "posted");
  const c = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const d = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let competing;
  try {
    competing = await runObservedJournalRace({
      targetId: competingOriginal.id,
      applicationPrefix: "ci-gl-reversal-diff-",
      clients: [c, d],
      invoke: ([clientC, clientD]) => Promise.allSettled([
        reverse(clientC, competingOriginal.id, "First authorized competing reversal request", randomUUID()),
        reverse(clientD, competingOriginal.id, "Second authorized competing reversal request", randomUUID()),
      ]),
    });
    assert.equal(competing.filter((item) => item.status === "fulfilled").length, 1,
      "different idempotency keys racing on one original must create at most one reversal");
    assert.equal(competing.filter((item) => item.status === "rejected").length, 1,
      "the losing different-key request must be rejected");
    const rejected = competing.find((item) => item.status === "rejected");
    assert.match(String(rejected?.status === "rejected" ? (rejected.reason?.message ?? rejected.reason) : ""),
      /original journal entry already has a reversal/i);
  } finally {
    await Promise.all([c.end({ timeout: 5 }).catch(() => {}), d.end({ timeout: 5 }).catch(() => {})]);
  }
  const competingLinks = await inspectReversalMappings(
    "select count(*)::integer as count from public.accounting_journal_reversals where organization_id=$1::uuid and original_journal_entry_id=$2::uuid",
    [organizationId, competingOriginal.id],
  );
  assert.equal(competingLinks[0].count, 1, "different-key race must persist exactly one reversal mapping row");


  await db.unsafe("reset role");
  process.stdout.write("PASS FIN-LEDGER-001 reversal: manual/adjustment scope, exact mirrored lines, explicit post, audit, tenant/RLS denial, source-linked path restriction, idempotency conflict/replay, and observed PostgreSQL lock contention for both same-key and competing-key races\n");
}
