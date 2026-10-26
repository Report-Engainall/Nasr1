import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for invitation concurrency acceptance.");
}
const organizationId = "a0000000-0000-0000-0000-000000000001";
const staffAuthUserId = "33333333-3333-4333-8333-333333333333";
const staffEmail = "admin@aghbari.ye";

const admin = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const lockClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const monitor = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const staffClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const ownerClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const activationClients = [
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
];
const companyClients = [
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setIdentity(client, authUserId, email, applicationName) {
  const sessionId = randomUUID();
  await client.unsafe("reset role");
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI invitation concurrency','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: authUserId,
      email,
      role: "authenticated",
      session_id: sessionId,
    }),
  ]);
  await client.unsafe("select set_config('application_name',$1,false)", [applicationName]);
  await client.unsafe("set role authenticated");
}

async function seedIdentity({ profileId, authUserId, email, fullName }) {
  await admin.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) " +
      "on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [authUserId, email],
  );
  await admin.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1,$2,$3,$4,$5,true) on conflict(id) do update set " +
      "auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id," +
      "full_name=excluded.full_name,email=excluded.email,is_active=true",
    [profileId, authUserId, organizationId, fullName, email],
  );
  await admin.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'customer') on conflict(profile_id,role) do nothing",
    [profileId],
  );
}

async function seedCustomer({ profileId = null, codePrefix, businessName, email, contactName }) {
  const customerCode = "CI-RACE-" + codePrefix + "-" + randomUUID().replace(/-/g, "").slice(0, 12);
  const phone = "777" + randomUUID().replace(/-/g, "").slice(0, 7);
  const rows = await admin.unsafe(
    "insert into public.customers(" +
      "organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier," +
      "credit_limit,current_balance,status,approved_at" +
    ") values($1,$2,$3,$4,$5,$6,$7,'retail',0,0,'approved',now()) returning id",
    [organizationId, profileId, customerCode, businessName, contactName, phone, email],
  );
  assert.equal(rows.length, 1, "CI customer fixture must be created exactly once");
  return rows[0].id;
}

async function waitForBothConnectionsToBlock(applicationNames, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await monitor.unsafe(
      "select application_name,state,wait_event_type,wait_event " +
        "from pg_catalog.pg_stat_activity where application_name = any($1::text[])",
      [applicationNames],
    );
    const byName = new Map(rows.map((row) => [row.application_name, row]));
    if (
      applicationNames.every((name) => {
        const row = byName.get(name);
        return row && row.state === "active" && row.wait_event_type === "Lock";
      })
    ) {
      return { observed: true, rows };
    }
    await delay(40);
  }
  const rows = await monitor.unsafe(
    "select application_name,state,wait_event_type,wait_event,query " +
      "from pg_catalog.pg_stat_activity where application_name = any($1::text[])",
    [applicationNames],
  );
  return { observed: false, rows };
}

async function raceAcceptRpc({ label, table, lockRowId, rpcName, token, clients, applicationNames }) {
  assert.ok(
    ["profiles", "customer_activation_invitations", "customer_company_invitations"].includes(table),
    "race lock table must be allowlisted",
  );
  assert.ok(
    ["accept_customer_activation_invitation", "accept_customer_company_invitation"].includes(rpcName),
    "accept RPC must be allowlisted",
  );

  let transactionOpen = false;
  let settledPromise = null;
  try {
    await lockClient.unsafe("begin");
    transactionOpen = true;
    const lockedRows = await lockClient.unsafe(
      "select id from public." + table + " where id=$1::uuid for update",
      [lockRowId],
    );
    assert.equal(lockedRows.length, 1, label + ": the intended row must be locked before starting both requests");

    settledPromise = Promise.allSettled(
      clients.map((client) =>
        client.unsafe("select public." + rpcName + "($1::text) as result", [token]),
      ),
    );
    const barrier = await waitForBothConnectionsToBlock(applicationNames);
    await lockClient.unsafe("commit");
    transactionOpen = false;
    const outcomes = await settledPromise;

    assert.equal(
      barrier.observed,
      true,
      label + ": both independent PostgreSQL sessions must reach the row-lock barrier before it is released. Observed: " +
        JSON.stringify(barrier.rows),
    );
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1, label + ": exactly one concurrent acceptance must commit");
    assert.equal(rejected.length, 1, label + ": the competing acceptance must reject after observing the consumed invitation");
    return { outcomes, winner: fulfilled[0].value[0]?.result, rejected: String(rejected[0].reason?.message ?? rejected[0].reason) };
  } catch (error) {
    if (transactionOpen) {
      await lockClient.unsafe("rollback").catch(() => {});
    }
    if (settledPromise) await settledPromise.catch(() => {});
    throw error;
  }
}

async function main() {
  const health = await admin.unsafe(
    "select o.id::text as id from public.organizations o where o.id=$1::uuid and o.is_active=true",
    [organizationId],
  );
  assert.equal(health.length, 1, "migration acceptance fixtures must provide the active CI organization");

  // Customer activation: force both Auth sessions to wait on the same profile row,
  // matching the lock that serializes attempts to link one profile to multiple customer records.
  const activationAuthId = randomUUID();
  const activationProfileId = randomUUID();
  const activationEmail = "ci-activation-race-" + randomUUID().slice(0, 8) + "@example.test";
  await seedIdentity({
    profileId: activationProfileId,
    authUserId: activationAuthId,
    email: activationEmail,
    fullName: "CI Activation Race",
  });
  const activationCustomerId = await seedCustomer({
    codePrefix: "ACT",
    businessName: "CI Activation Race Customer",
    email: activationEmail,
    contactName: "CI Activation Race",
  });
  await setIdentity(staffClient, staffAuthUserId, staffEmail, "ci-act-staff-" + randomUUID().slice(0, 8));
  const activationInvite = (
    await staffClient.unsafe(
      "select public.create_customer_activation_invitation($1::uuid,$2::text,$3::integer) as result",
      [activationCustomerId, activationEmail, 72],
    )
  )[0].result;
  assert.equal(activationInvite.customer_id, activationCustomerId);
  assert.match(activationInvite.token, /^[0-9a-f]{64}$/i);

  const activationAppNames = [
    "ci-act-a-" + randomUUID().slice(0, 8),
    "ci-act-b-" + randomUUID().slice(0, 8),
  ];
  await Promise.all(
    activationClients.map((client, index) =>
      setIdentity(client, activationAuthId, activationEmail, activationAppNames[index]),
    ),
  );
  const activationRace = await raceAcceptRpc({
    label: "customer activation",
    table: "profiles",
    lockRowId: activationProfileId,
    rpcName: "accept_customer_activation_invitation",
    token: activationInvite.token,
    clients: activationClients,
    applicationNames: activationAppNames,
  });
  assert.equal(activationRace.winner?.status, "active", "the winning activation RPC must return the active customer outcome");
  assert.match(
    activationRace.rejected,
    /رابط التفعيل غير موجود أو منتهي أو مستخدم أو ملغى|مرتبط بسجل عميل أو بشركة بالفعل|مرتبط بحساب آخر بالفعل/i,
    "the losing activation RPC must fail because the invitation/account was consumed",
  );

  const activationLink = await admin.unsafe(
    "select c.profile_id::text as profile_id,i.status,i.accepted_by_profile_id::text as accepted_by_profile_id " +
      "from public.customers c join public.customer_activation_invitations i " +
      "on i.customer_id=c.id and i.organization_id=c.organization_id where i.id=$1::uuid",
    [activationInvite.invitation_id],
  );
  assert.equal(activationLink.length, 1);
  assert.equal(activationLink[0].profile_id, activationProfileId, "the customer must link to the invited profile exactly once");
  assert.equal(activationLink[0].accepted_by_profile_id, activationProfileId);
  assert.equal(activationLink[0].status, "accepted");
  const activationAudit = await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
      "where organization_id=$1::uuid and entity_type='customer_activation_invitation' " +
      "and entity_id=$2::uuid and action='customer_activation_invitation.accepted'",
    [organizationId, activationInvite.invitation_id],
  );
  assert.equal(activationAudit[0].count, 1, "only one activation acceptance audit event may persist");

  // Company membership: block both callers on the invitation row, then release them
  // together. Only one active membership and one acceptance audit may be committed.
  const ownerAuthId = randomUUID();
  const ownerProfileId = randomUUID();
  const ownerEmail = "ci-company-owner-race-" + randomUUID().slice(0, 8) + "@example.test";
  const memberAuthId = randomUUID();
  const memberProfileId = randomUUID();
  const memberEmail = "ci-company-member-race-" + randomUUID().slice(0, 8) + "@example.test";
  await seedIdentity({
    profileId: ownerProfileId,
    authUserId: ownerAuthId,
    email: ownerEmail,
    fullName: "CI Company Owner Race",
  });
  await seedIdentity({
    profileId: memberProfileId,
    authUserId: memberAuthId,
    email: memberEmail,
    fullName: "CI Company Member Race",
  });
  const companyCustomerId = await seedCustomer({
    profileId: ownerProfileId,
    codePrefix: "CO",
    businessName: "CI Company Race",
    email: ownerEmail,
    contactName: "CI Company Owner Race",
  });
  await setIdentity(ownerClient, ownerAuthId, ownerEmail, "ci-comp-owner-" + randomUUID().slice(0, 8));
  const companyInvite = (
    await ownerClient.unsafe(
      "select public.create_customer_company_invitation($1::text,$2::text) as result",
      [memberEmail, "buyer"],
    )
  )[0].result;
  assert.equal(companyInvite.invited_email, memberEmail);
  assert.match(companyInvite.invitation_token, /^[0-9a-f]{64}$/i);

  const companyAppNames = [
    "ci-com-a-" + randomUUID().slice(0, 8),
    "ci-com-b-" + randomUUID().slice(0, 8),
  ];
  await Promise.all(
    companyClients.map((client, index) =>
      setIdentity(client, memberAuthId, memberEmail, companyAppNames[index]),
    ),
  );
  const companyRace = await raceAcceptRpc({
    label: "customer company membership",
    table: "customer_company_invitations",
    lockRowId: companyInvite.invitation_id,
    rpcName: "accept_customer_company_invitation",
    token: companyInvite.invitation_token,
    clients: companyClients,
    applicationNames: companyAppNames,
  });
  assert.equal(companyRace.winner?.company_name, "CI Company Race");
  assert.equal(companyRace.winner?.member_role, "buyer");
  assert.match(
    companyRace.rejected,
    /الدعوة غير موجودة أو استُخدمت أو أُلغيت|مرتبط بالفعل بشركة أخرى|تعذر تفعيل عضوية الشركة/i,
    "the losing company acceptance must fail after the invite or membership was consumed",
  );

  const membershipRows = await admin.unsafe(
    "select id::text as id,status from public.customer_company_memberships " +
      "where organization_id=$1::uuid and customer_id=$2::uuid and profile_id=$3::uuid " +
      "and status='active'",
    [organizationId, companyCustomerId, memberProfileId],
  );
  assert.equal(membershipRows.length, 1, "exactly one active customer-company membership must persist");
  const companyInviteRows = await admin.unsafe(
    "select status,accepted_by::text as accepted_by from public.customer_company_invitations where id=$1::uuid",
    [companyInvite.invitation_id],
  );
  assert.equal(companyInviteRows.length, 1);
  assert.equal(companyInviteRows[0].status, "accepted");
  assert.equal(companyInviteRows[0].accepted_by, memberProfileId);
  const companyAudit = await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
      "where organization_id=$1::uuid and entity_type='customer_company_membership' " +
      "and entity_id=$2::uuid and action='customer_company_invitation.accepted'",
    [organizationId, membershipRows[0].id],
  );
  assert.equal(companyAudit[0].count, 1, "only one company-membership acceptance audit event may persist");

  process.stdout.write(
    "PASS invitation concurrency: customer activation and company membership serialize competing accepts; one winner, one rejection, one link/membership and one audit each\\n",
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    "INVITATION_CONCURRENCY_ACCEPTANCE_FAILED " +
      JSON.stringify({ message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }) +
      "\\n",
  );
  process.exitCode = 1;
} finally {
  await Promise.all(
    [admin, lockClient, monitor, staffClient, ownerClient, ...activationClients, ...companyClients].map((client) =>
      client.end({ timeout: 2 }).catch(() => {}),
    ),
  );
}
