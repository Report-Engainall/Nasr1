import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for journal-reversal PostgreSQL 17 acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
async function expectFailure(label, action, pattern, code = "22023") {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must be rejected");
  assert.equal(caught.code, code, label + " must use SQLSTATE " + code);
  if (pattern) assert.match(String(caught.message), pattern, label + " must return the intended rejection");
  return caught;
}
async function setIdentity(client, identity, applicationName, sessionIds) {
  await client.unsafe("reset role").catch(() => {});
  const sessionId = randomUUID();
  sessionIds.push(sessionId);
  await client.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) " +
      "on conflict(id) do update set email=excluded.email,email_confirmed_at=coalesce(auth.users.email_confirmed_at,excluded.email_confirmed_at)",
    [identity.auth_user_id, identity.email],
  );
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI generic journal reversal acceptance','127.0.0.1'::inet)",
    [sessionId, identity.auth_user_id],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [identity.auth_user_id]);
  await client.unsafe(
    "select set_config('request.jwt.claims',$1,false)",
    [JSON.stringify({
      sub: identity.auth_user_id,
      email: identity.email,
      email_confirmed_at: new Date().toISOString(),
      role: "authenticated",
      session_id: sessionId,
    })],
  );
  await client.unsafe("select set_config('application_name',$1,false)", [applicationName]);
  await client.unsafe("set role authenticated");
}
async function waitForBothConnectionsToBlock(monitor, applicationNames, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await monitor.unsafe(
      "select application_name,state,wait_event_type,wait_event " +
        "from pg_catalog.pg_stat_activity where application_name = any($1::text[])",
      [applicationNames],
    );
    const byName = new Map(rows.map((row) => [row.application_name, row]));
    if (applicationNames.every((name) => {
      const row = byName.get(name);
      return row && row.state === "active" && row.wait_event_type === "Lock";
    })) {
      return { observed: true, rows };
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  const rows = await monitor.unsafe(
    "select application_name,state,wait_event_type,wait_event,query " +
      "from pg_catalog.pg_stat_activity where application_name = any($1::text[])",
    [applicationNames],
  );
  return { observed: false, rows };
}

const connectionString = requiredEnv("TEST_DATABASE_URL");
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
const organizationId = "a0000000-0000-0000-0000-000000000001";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const admin = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const monitor = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const lockClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const sameKeyClients = [
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
];
const distinctKeyClients = [
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
];
const customerClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const sessionIds = [];
const accountIds = [];
const entryIds = [];
let reversalLinkIds = [];

async function createPostedManualJournal(client, debitAccountId, creditAccountId, label) {
  const key = randomUUID();
  const description = "CI generic reversal " + label + " " + suffix;
  const lines = [
    { account_id: debitAccountId, debit: "125.00", credit: "0", memo: "CI debit " + label },
    { account_id: creditAccountId, debit: "0", credit: "125.00", memo: "CI credit " + label },
  ];
  const rows = await client.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    [key, new Date().toISOString().slice(0, 10), description, client.json(lines), "ci-generic-reversal-" + suffix + "-" + label],
  );
  const draft = asJson(rows[0].result);
  assert.equal(draft.status, "draft", label + ": original journal must start as draft");
  assert.equal(draft.replayed, false, label + ": original journal fixture must be newly created");
  entryIds.push(draft.id);
  const postedRows = await client.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result",
    [draft.id],
  );
  const posted = asJson(postedRows[0].result);
  assert.equal(posted.status, "posted", label + ": original journal must be posted before reversal");
  const persisted = await admin.unsafe(
    "select status,source_type from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid",
    [draft.id, organizationId],
  );
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].status, "posted");
  assert.equal(persisted[0].source_type, "manual");
  return draft.id;
}

async function runLockedRace({ label, originalId, clients, keys, reasons, applicationNames }) {
  let transactionOpen = false;
  let outcomesPromise = null;
  try {
    await lockClient.unsafe("begin");
    transactionOpen = true;
    const locked = await lockClient.unsafe(
      "select id from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid for update",
      [originalId, organizationId],
    );
    assert.equal(locked.length, 1, label + ": lock the exact posted source journal before issuing both calls");
    outcomesPromise = Promise.allSettled(clients.map((client, index) => client.unsafe(
      "select public.reverse_general_journal_entry($1::uuid,$2::text,$3::uuid) as result",
      [originalId, reasons[index], keys[index]],
    )));
    const barrier = await waitForBothConnectionsToBlock(monitor, applicationNames);
    await lockClient.unsafe("commit");
    transactionOpen = false;
    const outcomes = await outcomesPromise;
    assert.equal(
      barrier.observed,
      true,
      label + ": both independent PostgreSQL sessions must be blocked on a lock before release; observed " +
        JSON.stringify(barrier.rows),
    );
    return outcomes;
  } catch (error) {
    if (transactionOpen) await lockClient.unsafe("rollback").catch(() => {});
    if (outcomesPromise) await outcomesPromise.catch(() => {});
    throw error;
  }
}

async function reversalRows(originalId) {
  return await admin.unsafe(
    "select r.id::text as reversal_link_id,r.reversal_journal_entry_id::text as reversal_journal_entry_id," +
      "e.status,e.source_type,e.source_reference " +
      "from public.accounting_journal_reversals r " +
      "join public.accounting_journal_entries e on e.organization_id=r.organization_id and e.id=r.reversal_journal_entry_id " +
      "where r.organization_id=$1::uuid and r.original_journal_entry_id=$2::uuid",
    [organizationId, originalId],
  );
}
async function reversalAuditCount(linkId) {
  const rows = await admin.unsafe(
    "select count(*)::integer as n from public.audit_logs " +
      "where organization_id=$1::uuid and entity_type='accounting_journal_reversal' " +
      "and entity_id=$2::uuid and action='accounting.journal_reversal_draft_created'",
    [organizationId, linkId],
  );
  return rows[0].n;
}
async function assertExactMirror(originalId, reversalId, label) {
  const original = await admin.unsafe(
    "select line_number,account_id::text as account_id,debit::text as debit,credit::text as credit " +
      "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number",
    [organizationId, originalId],
  );
  const reversal = await admin.unsafe(
    "select line_number,account_id::text as account_id,debit::text as debit,credit::text as credit " +
      "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number",
    [organizationId, reversalId],
  );
  assert.equal(original.length, 2, label + ": source journal line count");
  assert.equal(reversal.length, original.length, label + ": reversal line count matches original");
  for (let i = 0; i < original.length; i += 1) {
    assert.equal(reversal[i].line_number, original[i].line_number, label + ": line ordering remains stable");
    assert.equal(reversal[i].account_id, original[i].account_id, label + ": account identity remains stable");
    assert.equal(reversal[i].debit, original[i].credit, label + ": debit mirrors source credit");
    assert.equal(reversal[i].credit, original[i].debit, label + ": credit mirrors source debit");
  }
}

async function main() {
  const managers = await admin.unsafe(
    "select p.id::text as id,p.auth_user_id::text as auth_user_id,p.email " +
      "from public.profiles p where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true",
    [organizationId, managerEmail],
  );
  assert.equal(managers.length, 1, "CI fixture must contain exactly one active organization-scoped manager/admin");
  const manager = managers[0];
  const managerRoles = await admin.unsafe(
    "select role from public.user_roles where profile_id=$1::uuid",
    [manager.id],
  );
  assert.ok(managerRoles.some((row) => ["admin", "manager"].includes(row.role)),
    "generic reversal RPC requires an authorized admin/manager, not merely finance visibility");

  const customers = await admin.unsafe(
    "select p.id::text as id,p.auth_user_id::text as auth_user_id,p.email " +
      "from public.profiles p join public.user_roles ur on ur.profile_id=p.id and ur.role='customer' " +
      "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true",
    [organizationId, customerEmail],
  );
  assert.equal(customers.length, 1, "CI fixture must contain one active tenant-scoped customer for role-denial acceptance");
  const customer = customers[0];

  const debitCode = "CI-JR-DR-" + suffix;
  const creditCode = "CI-JR-CR-" + suffix;
  const debitAccount = await admin.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,is_active) " +
      "values($1::uuid,$2,$3,'asset',true) returning id::text as id",
    [organizationId, debitCode, "CI reversal debit " + suffix],
  );
  const creditAccount = await admin.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,is_active) " +
      "values($1::uuid,$2,$3,'liability',true) returning id::text as id",
    [organizationId, creditCode, "CI reversal credit " + suffix],
  );
  accountIds.push(debitAccount[0].id, creditAccount[0].id);

  const managerNamesSame = [
    "ci-jrev-same-a-" + suffix.slice(0, 5),
    "ci-jrev-same-b-" + suffix.slice(0, 5),
  ];
  const managerNamesDistinct = [
    "ci-jrev-dist-a-" + suffix.slice(0, 5),
    "ci-jrev-dist-b-" + suffix.slice(0, 5),
  ];
  await Promise.all(sameKeyClients.map((client, index) =>
    setIdentity(client, manager, managerNamesSame[index], sessionIds)));
  await Promise.all(distinctKeyClients.map((client, index) =>
    setIdentity(client, manager, managerNamesDistinct[index], sessionIds)));
  await setIdentity(customerClient, customer, "ci-jrev-customer-" + suffix.slice(0, 5), sessionIds);

  const sameOriginal = await createPostedManualJournal(
    sameKeyClients[0], debitAccount[0].id, creditAccount[0].id, "same-key",
  );
  const sameKey = randomUUID();
  const sameReason = "CI concurrent same-key journal reversal";
  const sameOutcomes = await runLockedRace({
    label: "same-key same-payload race",
    originalId: sameOriginal,
    clients: sameKeyClients,
    keys: [sameKey, sameKey],
    reasons: [sameReason, sameReason],
    applicationNames: managerNamesSame,
  });
  const sameFulfilled = sameOutcomes.filter((x) => x.status === "fulfilled")
    .map((x) => asJson(x.value[0].result));
  assert.equal(sameFulfilled.length, 2, "same-key race: both callers must receive a canonical result");
  assert.equal(new Set(sameFulfilled.map((x) => x.reversal_journal_entry_id)).size, 1,
    "same-key race: both callers return the same reversal journal");
  assert.equal(sameFulfilled.filter((x) => x.replayed === false).length, 1,
    "same-key race: exactly one caller creates the reversal draft");
  assert.equal(sameFulfilled.filter((x) => x.replayed === true).length, 1,
    "same-key race: exactly one caller receives an idempotent replay");
  assert.ok(sameFulfilled.every((x) => x.status === "draft"), "same-key race does not post the reversal implicitly");
  const sameRows = await reversalRows(sameOriginal);
  assert.equal(sameRows.length, 1, "same-key race persists exactly one original-to-reversal link");
  assert.equal(sameRows[0].status, "draft");
  assert.equal(sameRows[0].source_type, "adjustment");
  assert.equal(sameRows[0].source_reference, sameOriginal);
  reversalLinkIds.push(sameRows[0].reversal_link_id);
  entryIds.push(sameRows[0].reversal_journal_entry_id);
  await assertExactMirror(sameOriginal, sameRows[0].reversal_journal_entry_id, "same-key reversal");
  assert.equal(await reversalAuditCount(sameRows[0].reversal_link_id), 1,
    "same-key race writes exactly one reversal-draft audit event");

  await expectFailure(
    "same idempotency key with a changed reversal reason",
    () => sameKeyClients[0].unsafe(
      "select public.reverse_general_journal_entry($1::uuid,$2::text,$3::uuid)",
      [sameOriginal, "Different reason with same key", sameKey],
    ),
    /idempotency key payload conflict/i,
  );
  const deniedBefore = await reversalRows(sameOriginal);
  await expectFailure(
    "customer cannot reverse a posted manual journal",
    () => customerClient.unsafe(
      "select public.reverse_general_journal_entry($1::uuid,$2::text,$3::uuid)",
      [sameOriginal, "Customer must not reverse finance journal", randomUUID()],
    ),
    /administrator or manager permission required/i,
    "42501",
  );
  const deniedAfter = await reversalRows(sameOriginal);
  assert.deepEqual(deniedAfter, deniedBefore, "customer denial must not mutate reversal links");
  assert.equal(await reversalAuditCount(sameRows[0].reversal_link_id), 1,
    "customer denial must not create another audit event");

  const distinctOriginal = await createPostedManualJournal(
    distinctKeyClients[0], debitAccount[0].id, creditAccount[0].id, "distinct-key",
  );
  const distinctKeys = [randomUUID(), randomUUID()];
  const distinctReason = "CI concurrent distinct-key reversal uniqueness";
  const distinctOutcomes = await runLockedRace({
    label: "distinct-key one-original uniqueness race",
    originalId: distinctOriginal,
    clients: distinctKeyClients,
    keys: distinctKeys,
    reasons: [distinctReason, distinctReason],
    applicationNames: managerNamesDistinct,
  });
  const distinctSuccesses = distinctOutcomes.filter((x) => x.status === "fulfilled")
    .map((x) => asJson(x.value[0].result));
  const distinctFailures = distinctOutcomes.filter((x) => x.status === "rejected");
  assert.equal(distinctSuccesses.length, 1, "distinct-key race: exactly one request can create a reversal");
  assert.equal(distinctFailures.length, 1, "distinct-key race: the competing request must reject");
  assert.equal(distinctFailures[0].reason.code, "22023");
  assert.match(String(distinctFailures[0].reason.message), /original journal entry already has a reversal/i);
  assert.equal(distinctSuccesses[0].status, "draft", "distinct-key winner must create a draft only");
  const distinctRows = await reversalRows(distinctOriginal);
  assert.equal(distinctRows.length, 1, "different idempotency keys still yield one reversal link per original journal");
  assert.equal(distinctRows[0].reversal_journal_entry_id, distinctSuccesses[0].reversal_journal_entry_id);
  reversalLinkIds.push(distinctRows[0].reversal_link_id);
  entryIds.push(distinctRows[0].reversal_journal_entry_id);
  await assertExactMirror(distinctOriginal, distinctRows[0].reversal_journal_entry_id, "distinct-key reversal");
  assert.equal(await reversalAuditCount(distinctRows[0].reversal_link_id), 1,
    "distinct-key race emits one reversal-draft audit event");

  const originals = await admin.unsafe(
    "select id::text as id,status,source_type from public.accounting_journal_entries " +
      "where organization_id=$1::uuid and id=any($2::uuid[]) order by id",
    [organizationId, [sameOriginal, distinctOriginal]],
  );
  assert.equal(originals.length, 2);
  assert.ok(originals.every((row) => row.status === "posted" && row.source_type === "manual"),
    "creating a reversal draft preserves the original posted journals");
  process.stdout.write(
    "PASS PostgreSQL 17 generic journal reversal: same-key concurrent idempotency, distinct-key original uniqueness, " +
    "blocked-session barrier, exact mirrored lines, draft-only status, customer denial and single audit per reversal\n",
  );
}

try {
  await main();
} finally {
  try {
    if (entryIds.length) {
      const linkRows = await admin.unsafe(
        "select id::text as id from public.accounting_journal_reversals " +
          "where organization_id=$1::uuid and (original_journal_entry_id=any($2::uuid[]) or reversal_journal_entry_id=any($2::uuid[]))",
        [organizationId, entryIds],
      );
      reversalLinkIds.push(...linkRows.map((row) => row.id));
      const allAuditEntityIds = [...new Set([...entryIds, ...reversalLinkIds])];
      if (allAuditEntityIds.length) {
        await admin.unsafe(
          "delete from public.audit_logs where organization_id=$1::uuid and entity_id=any($2::uuid[])",
          [organizationId, allAuditEntityIds],
        );
      }
      await admin.unsafe(
        "delete from public.accounting_journal_reversals where organization_id=$1::uuid " +
          "and (original_journal_entry_id=any($2::uuid[]) or reversal_journal_entry_id=any($2::uuid[]))",
        [organizationId, entryIds],
      );
      await admin.unsafe(
        "delete from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=any($2::uuid[])",
        [organizationId, entryIds],
      );
      await admin.unsafe(
        "delete from public.accounting_journal_entries where organization_id=$1::uuid and id=any($2::uuid[])",
        [organizationId, entryIds],
      );
    }
    if (accountIds.length) {
      await admin.unsafe(
        "delete from public.accounting_accounts where organization_id=$1::uuid and id=any($2::uuid[])",
        [organizationId, accountIds],
      );
    }
    if (sessionIds.length) {
      await admin.unsafe("delete from auth.sessions where id=any($1::uuid[])", [sessionIds]);
    }
  } catch (error) {
    console.error("CLEANUP_FAILED journal reversal acceptance fixtures:", String(error));
    process.exitCode = 1;
  }
  await Promise.all([
    admin.end({ timeout: 5 }).catch(() => {}),
    monitor.end({ timeout: 5 }).catch(() => {}),
    lockClient.end({ timeout: 5 }).catch(() => {}),
    ...sameKeyClients.map((client) => client.end({ timeout: 5 }).catch(() => {})),
    ...distinctKeyClients.map((client) => client.end({ timeout: 5 }).catch(() => {})),
    customerClient.end({ timeout: 5 }).catch(() => {}),
  ]);
}
