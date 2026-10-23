import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL?.trim();
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for company invitation expiry acceptance.");
const parsed = new URL(connectionString);
if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
  throw new Error("Company invitation expiry acceptance may only run against a local PostgreSQL test database.");
}
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(authUserId, email, includeConfirmationClaim = true) {
  await db.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [authUserId, authUserId]);
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  const claims = { sub: authUserId, email, role: "authenticated", session_id: authUserId };
  if (includeConfirmationClaim) claims.email_confirmed_at = new Date().toISOString();
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
}
async function expectFailure(label, action, pattern) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should be rejected");
  if (pattern) assert.match(String(caught.message), pattern, label + " returned the wrong rejection");
}

async function main() {
  const ownerProfileId = "f1111111-1111-4111-8111-111111111111";
  const ownerAuthId = "11111111-1111-4111-8111-111111111111";
  const organizationId = "a0000000-0000-0000-0000-000000000001";
  const ownerEmail = "ci-customer-one@example.test";
  const owner = await db.unsafe(
    "select c.id as customer_id from public.customers c join public.profiles p on p.id=c.profile_id " +
    "where c.organization_id=$1::uuid and p.id=$2::uuid and p.auth_user_id=$3::uuid and p.email=$4 and c.status='approved'",
    [organizationId, ownerProfileId, ownerAuthId, ownerEmail],
  );
  assert.equal(owner.length, 1, "expected the isolated migration acceptance's approved company owner fixture");

  const invitedAuthId = randomUUID();
  const invitedProfileId = randomUUID();
  const invitedEmail = "ci-expiring-company-member-" + randomUUID().slice(0, 12) + "@example.test";
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1::uuid,$2::text,pg_catalog.now())",
    [invitedAuthId, invitedEmail],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
    "values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,true)",
    [invitedProfileId, invitedAuthId, organizationId, "CI Expiring Company Member", invitedEmail],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1::uuid,'customer') on conflict(profile_id,role) do nothing",
    [invitedProfileId],
  );

  await db.unsafe("reset role");
  await setIdentity(ownerAuthId, ownerEmail);
  await db.unsafe("set role authenticated");
  const created = await db.unsafe(
    "select public.create_customer_company_invitation($1::text,$2::text) as result",
    [invitedEmail, "viewer"],
  );
  const invite = created[0]?.result;
  assert.equal(invite?.invited_email, invitedEmail);
  assert.equal(invite?.member_role, "viewer");
  assert.match(invite?.invitation_token ?? "", /^[0-9a-f]{64}$/i, "the owner receives a one-time token");
  await db.unsafe("reset role");
  await db.unsafe(
    "update public.customer_company_invitations set expires_at=pg_catalog.now()-interval '1 second' where id=$1::uuid",
    [invite.invitation_id],
  );

  await setIdentity(invitedAuthId, invitedEmail);
  await db.unsafe("set role authenticated");
  const expiredResult = await db.unsafe(
    "select public.accept_customer_company_invitation($1::text) as result",
    [invite.invitation_token],
  );
  assert.deepEqual(expiredResult[0].result, {
    status: "expired",
    error: "انتهت صلاحية الدعوة؛ اطلب رابطًا جديدًا",
  }, "acceptance returns an explicit expired result instead of raising and rolling back expiry");
  const deniedScope = await db.unsafe(
    "select public.current_customer_id() as customer_id,public.current_customer_can('orders.read') as can_read",
  );
  assert.equal(deniedScope[0].customer_id, null, "an expired invitation creates no company scope");
  assert.equal(deniedScope[0].can_read, false);

  await expectFailure(
    "an expired token cannot be replayed",
    () => db.unsafe("select public.accept_customer_company_invitation($1::text)", [invite.invitation_token]),
    /الدعوة غير موجودة أو استُخدمت أو أُلغيت/,
  );
  await db.unsafe("reset role");
  const persisted = await db.unsafe(
    "select status from public.customer_company_invitations where id=$1::uuid",
    [invite.invitation_id],
  );
  assert.equal(persisted[0]?.status, "expired", "the expiry state persists after the RPC completes");
  const acceptanceAudit = await db.unsafe(
    "select action,actor_id,new_value from public.audit_logs where organization_id=$1::uuid " +
    "and entity_type='customer_company_invitation' and entity_id=$2::uuid and action='customer_company_invitation.expired'",
    [organizationId, invite.invitation_id],
  );
  assert.equal(acceptanceAudit.length, 1, "the expiry transition is audited exactly once");
  assert.equal(acceptanceAudit[0].actor_id, invitedProfileId, "audit records the accepting identity");
  assert.equal(acceptanceAudit[0].new_value.status, "expired");

  // The owner's lazy cleanup path must produce the same persistent status and audit event.
  const listEmail = "ci-expiring-via-list-" + randomUUID().slice(0, 12) + "@example.test";
  await setIdentity(ownerAuthId, ownerEmail);
  await db.unsafe("set role authenticated");
  const secondCreated = await db.unsafe(
    "select public.create_customer_company_invitation($1::text,$2::text) as result",
    [listEmail, "buyer"],
  );
  const secondInvite = secondCreated[0].result;
  await db.unsafe("reset role");
  await db.unsafe(
    "update public.customer_company_invitations set expires_at=pg_catalog.now()-interval '1 second' where id=$1::uuid",
    [secondInvite.invitation_id],
  );
  await setIdentity(ownerAuthId, ownerEmail);
  await db.unsafe("set role authenticated");
  const ownerWorkspace = await db.unsafe("select public.list_customer_company_members() as result");
  const listed = ownerWorkspace[0].result.invitations.find((row) => row.invitation_id === secondInvite.invitation_id);
  assert.equal(listed?.status, "expired", "owner workspace reports the expired state");
  await db.unsafe("reset role");
  const listAudit = await db.unsafe(
    "select action,actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='customer_company_invitation' " +
    "and entity_id=$2::uuid and action='customer_company_invitation.expired'",
    [organizationId, secondInvite.invitation_id],
  );
  assert.equal(listAudit.length, 1, "owner-list expiry cleanup is also audited exactly once");
  assert.equal(listAudit[0].actor_id, ownerProfileId);

  // Exercise both token formats in the final migration sequence. SHA-256 is used by new invitations;
  // MD5 remains valid only for pending invitations created before the token-storage migration.
  async function createInvitee(email, confirmed) {
    const authUserId = randomUUID();
    const profileId = randomUUID();
    await db.unsafe(
      "insert into auth.users(id,email,email_confirmed_at) values($1::uuid,$2::text,$3::timestamptz)",
      [authUserId, email, confirmed ? new Date() : null],
    );
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,true)",
      [profileId, authUserId, organizationId, "CI Invitation Token Member", email],
    );
    await db.unsafe(
      "insert into public.user_roles(profile_id,role) values($1::uuid,'customer') on conflict(profile_id,role) do nothing",
      [profileId],
    );
    return { authUserId, profileId, email };
  }

  async function seedTokenInvitation(invitee, algorithm, label) {
    const token = (randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "")).toLowerCase();
    const tokenHash = createHash(algorithm).update(token).digest("hex");
    const rows = await db.unsafe(
      "insert into public.customer_company_invitations(" +
      "organization_id,customer_id,invited_email,member_role,token_hash,status,invited_by,expires_at" +
      ") values($1::uuid,$2::uuid,$3::text,'viewer',$4::text,'pending',$5::uuid,pg_catalog.now()+interval '1 day') " +
      "returning id,status",
      [organizationId, owner[0].customer_id, invitee.email, tokenHash, ownerProfileId],
    );
    assert.equal(rows[0]?.status, "pending", label + " token fixture should be pending");
    return { token, invitationId: rows[0].id };
  }

  for (const algorithm of ["sha256", "md5"]) {
    const email = "ci-" + algorithm + "-invitation-" + randomUUID().slice(0, 12) + "@example.test";
    const invitee = await createInvitee(email, true);
    const seeded = await seedTokenInvitation(invitee, algorithm, algorithm);
    // Missing JWT confirmation claim is acceptable only because auth.users confirms the email.
    await setIdentity(invitee.authUserId, email, algorithm !== "sha256");
    await db.unsafe("set role authenticated");
    const accepted = await db.unsafe(
      "select public.accept_customer_company_invitation($1::text) as result",
      [seeded.token],
    );
    assert.equal(accepted[0]?.result?.status, "active", algorithm + " invitation token should be accepted");
    assert.equal(accepted[0]?.result?.customer_id, owner[0].customer_id);
    await expectFailure(
      algorithm + " token replay must be denied",
      () => db.unsafe("select public.accept_customer_company_invitation($1::text)", [seeded.token]),
      /الدعوة غير موجودة أو استُخدمت أو أُلغيت/,
    );
    await db.unsafe("reset role");
    const acceptedRow = await db.unsafe(
      "select status,accepted_by from public.customer_company_invitations where id=$1::uuid",
      [seeded.invitationId],
    );
    assert.equal(acceptedRow[0]?.status, "accepted");
    assert.equal(acceptedRow[0]?.accepted_by, invitee.profileId);
  }

  // A forged/frozen JWT claim must not override an unconfirmed authoritative Auth record.
  const unconfirmedEmail = "ci-unconfirmed-invitation-" + randomUUID().slice(0, 12) + "@example.test";
  const unconfirmed = await createInvitee(unconfirmedEmail, false);
  const unconfirmedToken = await seedTokenInvitation(unconfirmed, "sha256", "unconfirmed");
  await setIdentity(unconfirmed.authUserId, unconfirmedEmail, true);
  await db.unsafe("set role authenticated");
  await expectFailure(
    "unconfirmed Auth record must be rejected even when JWT claims confirmation",
    () => db.unsafe("select public.accept_customer_company_invitation($1::text)", [unconfirmedToken.token]),
    /أكّد بريدك الإلكتروني قبل قبول الدعوة/,
  );
  await db.unsafe("reset role");
  const unconfirmedState = await db.unsafe(
    "select i.status, count(m.id)::int as memberships from public.customer_company_invitations i " +
    "left join public.customer_company_memberships m on m.profile_id=$2::uuid and m.customer_id=i.customer_id " +
    "where i.id=$1::uuid group by i.status",
    [unconfirmedToken.invitationId, unconfirmed.profileId],
  );
  assert.equal(unconfirmedState[0]?.status, "pending", "denied invitation must remain pending");
  assert.equal(unconfirmedState[0]?.memberships, 0, "denied invitation must grant no membership");

  process.stdout.write(
    "PASS company invitation expiry and token compatibility: persistent audited expiry, SHA-256 plus legacy MD5 acceptance, " +
    "replay denial, and authoritative Auth email confirmation\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("COMPANY_INVITATION_EXPIRY_FAILED: " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });
