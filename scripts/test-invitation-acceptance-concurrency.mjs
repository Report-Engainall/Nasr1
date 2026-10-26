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

async function expectAuthorizationDenied(label, action) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must be denied");
  assert.equal(caught.code, "42501", label + " must fail with authorization SQLSTATE 42501");
  return caught;
}

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

async function seedIdentity({ profileId, authUserId, email, fullName, organizationId: identityOrganizationId = organizationId }) {
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
    [profileId, authUserId, identityOrganizationId, fullName, email],
  );
  await admin.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'customer') on conflict(profile_id,role) do nothing",
    [profileId],
  );
}

async function seedCustomer({ profileId = null, organizationId: customerOrganizationId = organizationId, codePrefix, businessName, email, contactName }) {
  const customerCode = "CI-RACE-" + codePrefix + "-" + randomUUID().replace(/-/g, "").slice(0, 12);
  const phone = "777" + randomUUID().replace(/-/g, "").slice(0, 7);
  const rows = await admin.unsafe(
    "insert into public.customers(" +
      "organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier," +
      "credit_limit,current_balance,status,approved_at" +
    ") values($1,$2,$3,$4,$5,$6,$7,'retail',0,0,'approved',now()) returning id",
    [customerOrganizationId, profileId, customerCode, businessName, contactName, phone, email],
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


async function raceAcceptVsRevoke({
  label,
  table,
  invitationId,
  token,
  acceptRpc,
  revokeRpc,
  acceptClient,
  revokeClient,
  applicationNames,
}) {
  assert.ok(
    ["customer_activation_invitations", "customer_company_invitations"].includes(table),
    "accept/revoke race table must be allowlisted",
  );
  assert.ok(
    ["accept_customer_activation_invitation", "accept_customer_company_invitation"].includes(acceptRpc),
    "accept RPC must be allowlisted",
  );
  assert.ok(
    ["revoke_customer_activation_invitation", "revoke_customer_company_invitation"].includes(revokeRpc),
    "revoke RPC must be allowlisted",
  );

  let transactionOpen = false;
  let outcomesPromise = null;
  try {
    await lockClient.unsafe("begin");
    transactionOpen = true;
    const lockedRows = await lockClient.unsafe(
      "select id from public." + table + " where id=$1::uuid for update",
      [invitationId],
    );
    assert.equal(lockedRows.length, 1, label + ": lock the target invitation before starting either operation");

    outcomesPromise = Promise.allSettled([
      acceptClient.unsafe(
        "select public." + acceptRpc + "($1::text) as result",
        [token],
      ),
      revokeClient.unsafe(
        "select public." + revokeRpc + "($1::uuid) as result",
        [invitationId],
      ),
    ]);
    const barrier = await waitForBothConnectionsToBlock(applicationNames);
    await lockClient.unsafe("commit");
    transactionOpen = false;
    const outcomes = await outcomesPromise;

    assert.equal(
      barrier.observed,
      true,
      label + ": accept and revoke must both wait on the same row-lock barrier before release. Observed: " +
        JSON.stringify(barrier.rows),
    );
    const accepted = outcomes[0];
    const revoked = outcomes[1];
    assert.equal(
      Number(accepted.status === "fulfilled") + Number(revoked.status === "fulfilled"),
      1,
      label + ": exactly one of accept/revoke must commit",
    );
    assert.equal(
      Number(accepted.status === "rejected") + Number(revoked.status === "rejected"),
      1,
      label + ": the losing operation must observe the consumed invitation state and reject",
    );

    return {
      outcomes,
      acceptedWon: accepted.status === "fulfilled",
      acceptResult: accepted.status === "fulfilled" ? accepted.value[0]?.result : null,
      revokeResult: revoked.status === "fulfilled" ? revoked.value[0]?.result : null,
      rejected: String(
        (accepted.status === "rejected" ? accepted.reason : revoked.reason)?.message ??
        (accepted.status === "rejected" ? accepted.reason : revoked.reason),
      ),
    };
  } catch (error) {
    if (transactionOpen) await lockClient.unsafe("rollback").catch(() => {});
    if (outcomesPromise) await outcomesPromise.catch(() => {});
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

  // Accept-vs-revoke race for customer activation. The invitee and the staff
  // revoker use independent Auth-backed PostgreSQL sessions; the invitation row
  // is locked until both requests are observed waiting at the same lock barrier.
  const activationRevokeAuthId = randomUUID();
  const activationRevokeProfileId = randomUUID();
  const activationRevokeEmail = "ci-activation-revoke-" + randomUUID().slice(0, 8) + "@example.test";
  await seedIdentity({
    profileId: activationRevokeProfileId,
    authUserId: activationRevokeAuthId,
    email: activationRevokeEmail,
    fullName: "CI Activation Accept Revoke",
  });
  const activationRevokeCustomerId = await seedCustomer({
    codePrefix: "ACTREV",
    businessName: "CI Activation Accept Revoke",
    email: activationRevokeEmail,
    contactName: "CI Activation Accept Revoke",
  });
  await setIdentity(staffClient, staffAuthUserId, staffEmail, "ci-act-revoke-staff-" + randomUUID().slice(0, 8));
  const activationRevokeInvite = (
    await staffClient.unsafe(
      "select public.create_customer_activation_invitation($1::uuid,$2::text,$3::integer) as result",
      [activationRevokeCustomerId, activationRevokeEmail, 72],
    )
  )[0].result;
  await setIdentity(
    activationClients[0],
    activationRevokeAuthId,
    activationRevokeEmail,
    "ci-act-revoke-accept-" + randomUUID().slice(0, 8),
  );
  const activationAcceptRevokeApps = [
    "ci-act-race-accept-" + randomUUID().slice(0, 8),
    "ci-act-race-revoke-" + randomUUID().slice(0, 8),
  ];
  await setIdentity(
    activationClients[0],
    activationRevokeAuthId,
    activationRevokeEmail,
    activationAcceptRevokeApps[0],
  );
  await setIdentity(staffClient, staffAuthUserId, staffEmail, activationAcceptRevokeApps[1]);
  const activationAcceptRevokeRace = await raceAcceptVsRevoke({
    label: "customer activation accept-vs-revoke",
    table: "customer_activation_invitations",
    invitationId: activationRevokeInvite.invitation_id,
    token: activationRevokeInvite.token,
    acceptRpc: "accept_customer_activation_invitation",
    revokeRpc: "revoke_customer_activation_invitation",
    acceptClient: activationClients[0],
    revokeClient: staffClient,
    applicationNames: activationAcceptRevokeApps,
  });
  const activationRevokeState = (await admin.unsafe(
    "select i.status, i.accepted_by_profile_id::text as accepted_by, c.profile_id::text as customer_profile_id " +
      "from public.customer_activation_invitations i join public.customers c " +
      "on c.id=i.customer_id and c.organization_id=i.organization_id where i.id=$1::uuid",
    [activationRevokeInvite.invitation_id],
  ))[0];
  assert.ok(activationRevokeState, "activation invite and source customer must remain present");
  const activationAcceptedAudit = (await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and entity_type='customer_activation_invitation' and entity_id=$2::uuid " +
      "and action='customer_activation_invitation.accepted'",
    [organizationId, activationRevokeInvite.invitation_id],
  ))[0].count;
  const activationRevokedAudit = (await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and entity_type='customer_activation_invitation' and entity_id=$2::uuid " +
      "and action='customer_activation_invitation.revoked'",
    [organizationId, activationRevokeInvite.invitation_id],
  ))[0].count;
  if (activationAcceptRevokeRace.acceptedWon) {
    assert.equal(activationAcceptRevokeRace.acceptResult.status, "active");
    assert.equal(activationRevokeState.status, "accepted");
    assert.equal(activationRevokeState.accepted_by, activationRevokeProfileId);
    assert.equal(activationRevokeState.customer_profile_id, activationRevokeProfileId);
    assert.equal(activationAcceptedAudit, 1);
    assert.equal(activationRevokedAudit, 0);
    assert.match(activationAcceptRevokeRace.rejected, /غير معلقة أو منتهية أو لا تتبع المؤسسة الحالية/i);
  } else {
    assert.equal(activationAcceptRevokeRace.revokeResult, true);
    assert.equal(activationRevokeState.status, "revoked");
    assert.equal(activationRevokeState.accepted_by, null);
    assert.equal(activationRevokeState.customer_profile_id, null);
    assert.equal(activationAcceptedAudit, 0);
    assert.equal(activationRevokedAudit, 1);
    assert.match(activationAcceptRevokeRace.rejected, /رابط التفعيل غير موجود أو منتهي أو مستخدم أو ملغى/i);
  }

  // Accept-vs-revoke race for company membership invitations. Only the winning
  // transition may persist a membership/acceptance audit or a revocation audit.
  const companyRevokeMemberAuthId = randomUUID();
  const companyRevokeMemberProfileId = randomUUID();
  const companyRevokeMemberEmail = "ci-company-revoke-" + randomUUID().slice(0, 8) + "@example.test";
  await seedIdentity({
    profileId: companyRevokeMemberProfileId,
    authUserId: companyRevokeMemberAuthId,
    email: companyRevokeMemberEmail,
    fullName: "CI Company Accept Revoke",
  });
  await setIdentity(ownerClient, ownerAuthId, ownerEmail, "ci-company-revoke-owner-" + randomUUID().slice(0, 8));
  const companyRevokeInvite = (
    await ownerClient.unsafe(
      "select public.create_customer_company_invitation($1::text,$2::text) as result",
      [companyRevokeMemberEmail, "buyer"],
    )
  )[0].result;
  const companyAcceptRevokeApps = [
    "ci-company-race-accept-" + randomUUID().slice(0, 8),
    "ci-company-race-revoke-" + randomUUID().slice(0, 8),
  ];
  await setIdentity(
    companyClients[0],
    companyRevokeMemberAuthId,
    companyRevokeMemberEmail,
    companyAcceptRevokeApps[0],
  );
  await setIdentity(ownerClient, ownerAuthId, ownerEmail, companyAcceptRevokeApps[1]);
  const companyAcceptRevokeRace = await raceAcceptVsRevoke({
    label: "customer company invitation accept-vs-revoke",
    table: "customer_company_invitations",
    invitationId: companyRevokeInvite.invitation_id,
    token: companyRevokeInvite.invitation_token,
    acceptRpc: "accept_customer_company_invitation",
    revokeRpc: "revoke_customer_company_invitation",
    acceptClient: companyClients[0],
    revokeClient: ownerClient,
    applicationNames: companyAcceptRevokeApps,
  });
  const companyRevokeState = (await admin.unsafe(
    "select status, accepted_by::text as accepted_by from public.customer_company_invitations where id=$1::uuid",
    [companyRevokeInvite.invitation_id],
  ))[0];
  assert.ok(companyRevokeState, "company invitation must remain present after the race");
  const activeRevokeMemberships = await admin.unsafe(
    "select id::text as id from public.customer_company_memberships where organization_id=$1::uuid " +
      "and customer_id=$2::uuid and profile_id=$3::uuid and status='active'",
    [organizationId, companyCustomerId, companyRevokeMemberProfileId],
  );
  const companyRevokeAudit = (await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and entity_type='customer_company_invitation' and entity_id=$2::uuid " +
      "and action='customer_company_invitation.revoked'",
    [organizationId, companyRevokeInvite.invitation_id],
  ))[0].count;
  if (companyAcceptRevokeRace.acceptedWon) {
    assert.equal(companyAcceptRevokeRace.acceptResult.status, "active");
    assert.equal(companyRevokeState.status, "accepted");
    assert.equal(companyRevokeState.accepted_by, companyRevokeMemberProfileId);
    assert.equal(activeRevokeMemberships.length, 1, "accepted company invitation creates exactly one active membership");
    const acceptanceAudit = (await admin.unsafe(
      "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
        "and entity_type='customer_company_membership' and entity_id=$2::uuid " +
        "and action='customer_company_invitation.accepted'",
      [organizationId, activeRevokeMemberships[0].id],
    ))[0].count;
    assert.equal(acceptanceAudit, 1);
    assert.equal(companyRevokeAudit, 0);
    assert.match(companyAcceptRevokeRace.rejected, /الدعوة غير معلقة أو لا تتبع هذه الشركة/i);
  } else {
    assert.equal(companyAcceptRevokeRace.revokeResult, true);
    assert.equal(companyRevokeState.status, "revoked");
    assert.equal(companyRevokeState.accepted_by, null);
    assert.equal(activeRevokeMemberships.length, 0, "revoked company invitation must not create a membership");
    const acceptanceAudits = (await admin.unsafe(
      "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
        "and entity_type='customer_company_membership' and action='customer_company_invitation.accepted' " +
        "and entity_id in (select id from public.customer_company_memberships where customer_id=$2::uuid " +
        "and profile_id=$3::uuid)",
      [organizationId, companyCustomerId, companyRevokeMemberProfileId],
    ))[0].count;
    assert.equal(acceptanceAudits, 0);
    assert.equal(companyRevokeAudit, 1);
    assert.match(companyAcceptRevokeRace.rejected, /الدعوة غير موجودة أو استُخدمت أو أُلغيت/i);
  }


  // Cross-tenant A/B acceptance: valid same-email invitations from tenant A must not be
  // accepted or revoked by tenant B. Denials must preserve pending state and have no
  // accepted/revoked audit, customer-profile linkage, or company membership side effects.
  const tenantBOrganizationId = randomUUID();
  await admin.unsafe(
    "insert into public.organizations(id,name,is_active) values($1::uuid,$2,true)",
    [tenantBOrganizationId, "CI Cross-Tenant Organization " + randomUUID().slice(0, 8)],
  );

  // Customer activation: a confirmed customer identity in B presents a valid A token.
  const crossActivationEmail = "ci-cross-activation-" + randomUUID().slice(0, 8) + "@example.test";
  const crossActivationCustomerId = await seedCustomer({
    codePrefix: "CROSS-ACT",
    businessName: "CI Cross-Tenant Activation Target",
    email: crossActivationEmail,
    contactName: "CI Cross-Tenant Activation",
  });
  await setIdentity(staffClient, staffAuthUserId, staffEmail, "ci-cross-activation-create-" + randomUUID().slice(0, 8));
  const crossActivationInvite = (
    await staffClient.unsafe(
      "select public.create_customer_activation_invitation($1::uuid,$2::text,$3::integer) as result",
      [crossActivationCustomerId, crossActivationEmail, 72],
    )
  )[0].result;
  const crossActivationAuthId = randomUUID();
  const crossActivationProfileId = randomUUID();
  await seedIdentity({
    profileId: crossActivationProfileId,
    authUserId: crossActivationAuthId,
    email: crossActivationEmail,
    fullName: "CI Cross-Tenant Activation B",
    organizationId: tenantBOrganizationId,
  });
  await setIdentity(
    activationClients[0],
    crossActivationAuthId,
    crossActivationEmail,
    "ci-cross-activation-accept-" + randomUUID().slice(0, 8),
  );
  await expectAuthorizationDenied(
    "tenant B customer accepting tenant A activation invitation",
    () => activationClients[0].unsafe(
      "select public.accept_customer_activation_invitation($1::text) as result",
      [crossActivationInvite.token],
    ),
  );
  let crossActivationState = (await admin.unsafe(
    "select i.status,i.accepted_by::text as accepted_by,c.profile_id::text as customer_profile_id " +
      "from public.customer_activation_invitations i join public.customers c " +
      "on c.id=i.customer_id and c.organization_id=i.organization_id where i.id=$1::uuid",
    [crossActivationInvite.invitation_id],
  ))[0];
  assert.ok(crossActivationState, "tenant A activation invitation and customer must remain present");
  assert.equal(crossActivationState.status, "pending", "foreign tenant acceptance must preserve pending activation");
  assert.equal(crossActivationState.accepted_by, null, "foreign tenant acceptance must not bind accepted_by");
  assert.equal(crossActivationState.customer_profile_id, null, "foreign tenant acceptance must not link the A customer");
  let crossActivationAudit = (await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and entity_type='customer_activation_invitation' and entity_id=$2::uuid " +
      "and action in ('customer_activation_invitation.accepted','customer_activation_invitation.revoked')",
    [organizationId, crossActivationInvite.invitation_id],
  ))[0].count;
  assert.equal(crossActivationAudit, 0, "foreign tenant activation acceptance must not write accept/revoke audit");

  // A staff identity in B also cannot revoke an A activation invitation by guessing its UUID.
  const tenantBStaffAuthId = randomUUID();
  const tenantBStaffProfileId = randomUUID();
  const tenantBStaffEmail = "ci-cross-staff-" + randomUUID().slice(0, 8) + "@example.test";
  await seedIdentity({
    profileId: tenantBStaffProfileId,
    authUserId: tenantBStaffAuthId,
    email: tenantBStaffEmail,
    fullName: "CI Cross-Tenant Staff B",
    organizationId: tenantBOrganizationId,
  });
  await admin.unsafe("delete from public.user_roles where profile_id=$1::uuid", [tenantBStaffProfileId]);
  await admin.unsafe(
    "insert into public.user_roles(profile_id,role) values($1::uuid,'staff')",
    [tenantBStaffProfileId],
  );
  await setIdentity(
    staffClient,
    tenantBStaffAuthId,
    tenantBStaffEmail,
    "ci-cross-activation-revoke-" + randomUUID().slice(0, 8),
  );
  await expectAuthorizationDenied(
    "tenant B staff revoking tenant A activation invitation",
    () => staffClient.unsafe(
      "select public.revoke_customer_activation_invitation($1::uuid) as result",
      [crossActivationInvite.invitation_id],
    ),
  );
  crossActivationState = (await admin.unsafe(
    "select i.status,i.accepted_by::text as accepted_by,c.profile_id::text as customer_profile_id " +
      "from public.customer_activation_invitations i join public.customers c " +
      "on c.id=i.customer_id and c.organization_id=i.organization_id where i.id=$1::uuid",
    [crossActivationInvite.invitation_id],
  ))[0];
  assert.equal(crossActivationState.status, "pending", "foreign tenant revocation must preserve pending activation");
  assert.equal(crossActivationState.accepted_by, null);
  assert.equal(crossActivationState.customer_profile_id, null);
  crossActivationAudit = (await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and entity_type='customer_activation_invitation' and entity_id=$2::uuid " +
      "and action in ('customer_activation_invitation.accepted','customer_activation_invitation.revoked')",
    [organizationId, crossActivationInvite.invitation_id],
  ))[0].count;
  assert.equal(crossActivationAudit, 0, "foreign tenant activation revoke must not write accept/revoke audit");

  // Company invitation: B's confirmed customer profile uses the exact invited email,
  // so the organization check—not an email mismatch—must deny the acceptance.
  const crossCompanyEmail = "ci-cross-company-" + randomUUID().slice(0, 8) + "@example.test";
  await setIdentity(ownerClient, ownerAuthId, ownerEmail, "ci-cross-company-create-" + randomUUID().slice(0, 8));
  const crossCompanyInvite = (
    await ownerClient.unsafe(
      "select public.create_customer_company_invitation($1::text,$2::text) as result",
      [crossCompanyEmail, "buyer"],
    )
  )[0].result;
  const crossCompanyInviteeAuthId = randomUUID();
  const crossCompanyInviteeProfileId = randomUUID();
  await seedIdentity({
    profileId: crossCompanyInviteeProfileId,
    authUserId: crossCompanyInviteeAuthId,
    email: crossCompanyEmail,
    fullName: "CI Cross-Tenant Company Invitee B",
    organizationId: tenantBOrganizationId,
  });
  await setIdentity(
    companyClients[0],
    crossCompanyInviteeAuthId,
    crossCompanyEmail,
    "ci-cross-company-accept-" + randomUUID().slice(0, 8),
  );
  await expectAuthorizationDenied(
    "tenant B customer accepting tenant A company invitation",
    () => companyClients[0].unsafe(
      "select public.accept_customer_company_invitation($1::text) as result",
      [crossCompanyInvite.invitation_token],
    ),
  );
  let crossCompanyState = (await admin.unsafe(
    "select status,accepted_by::text as accepted_by from public.customer_company_invitations where id=$1::uuid",
    [crossCompanyInvite.invitation_id],
  ))[0];
  assert.ok(crossCompanyState, "tenant A company invitation must remain present");
  assert.equal(crossCompanyState.status, "pending", "foreign tenant company acceptance must preserve pending invitation");
  assert.equal(crossCompanyState.accepted_by, null, "foreign tenant acceptance must not bind accepted_by");
  let crossCompanyMemberships = await admin.unsafe(
    "select id::text as id from public.customer_company_memberships " +
      "where organization_id=$1::uuid and customer_id=$2::uuid and profile_id=$3::uuid and status='active'",
    [organizationId, companyCustomerId, crossCompanyInviteeProfileId],
  );
  assert.equal(crossCompanyMemberships.length, 0, "foreign tenant acceptance must not create an active membership");
  let crossCompanyAudit = (await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and actor_id=$2::uuid and entity_type='customer_company_membership' " +
      "and action='customer_company_invitation.accepted'",
    [organizationId, crossCompanyInviteeProfileId],
  ))[0].count;
  assert.equal(crossCompanyAudit, 0, "foreign tenant company acceptance must not write acceptance audit");

  // Even an authenticated owner in B may not revoke the pending invitation belonging to A.
  const tenantBOwnerAuthId = randomUUID();
  const tenantBOwnerProfileId = randomUUID();
  const tenantBOwnerEmail = "ci-cross-owner-" + randomUUID().slice(0, 8) + "@example.test";
  await seedIdentity({
    profileId: tenantBOwnerProfileId,
    authUserId: tenantBOwnerAuthId,
    email: tenantBOwnerEmail,
    fullName: "CI Cross-Tenant Company Owner B",
    organizationId: tenantBOrganizationId,
  });
  const tenantBOwnerCustomerId = await seedCustomer({
    organizationId: tenantBOrganizationId,
    profileId: tenantBOwnerProfileId,
    codePrefix: "CROSS-OWNER",
    businessName: "CI Tenant B Customer Owner",
    email: tenantBOwnerEmail,
    contactName: "CI Tenant B Owner",
  });
  assert.ok(tenantBOwnerCustomerId, "tenant B owner fixture must be linked to its own customer");
  await setIdentity(
    ownerClient,
    tenantBOwnerAuthId,
    tenantBOwnerEmail,
    "ci-cross-company-revoke-" + randomUUID().slice(0, 8),
  );
  await expectAuthorizationDenied(
    "tenant B company owner revoking tenant A company invitation",
    () => ownerClient.unsafe(
      "select public.revoke_customer_company_invitation($1::uuid) as result",
      [crossCompanyInvite.invitation_id],
    ),
  );
  crossCompanyState = (await admin.unsafe(
    "select status,accepted_by::text as accepted_by from public.customer_company_invitations where id=$1::uuid",
    [crossCompanyInvite.invitation_id],
  ))[0];
  assert.equal(crossCompanyState.status, "pending", "foreign tenant revocation must preserve pending company invitation");
  assert.equal(crossCompanyState.accepted_by, null);
  crossCompanyAudit = (await admin.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and entity_id=$2::uuid and action='customer_company_invitation.revoked'",
    [organizationId, crossCompanyInvite.invitation_id],
  ))[0].count;
  assert.equal(crossCompanyAudit, 0, "foreign tenant company revoke must not write revoke audit");

  process.stdout.write(
    "PASS invitation concurrency and tenant isolation: accept/accept, accept/revoke, and cross-tenant accept/revoke denials preserve ownership and exactly-once audit\\n",
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
