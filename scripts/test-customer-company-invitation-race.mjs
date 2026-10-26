import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * PostgreSQL 17 integration acceptance for the single-active-company-membership invariant.
 *
 * The test deliberately widens the race window after the RPC's pre-insert membership check.
 * Two independent authenticated sessions accept invitations to different customers with the
 * same profile. The partial unique index on active memberships must serialize the writes so
 * there is exactly one active membership and one accepted invitation, with no partial audit
 * or accepted status left behind by the losing transaction.
 */
export async function runCustomerCompanyInvitationRaceAcceptance({
  db,
  connectionString,
  organizationId,
}) {
  const profileId = randomUUID();
  const authUserId = randomUUID();
  const email = `ci-company-invitation-race-${randomUUID().slice(0, 12)}@example.test`;
  const customerCodeA = `CI-RACE-A-${randomUUID().slice(0, 12)}`;
  const customerCodeB = `CI-RACE-B-${randomUUID().slice(0, 12)}`;
  const tokenA = randomBytes(32).toString("hex");
  const tokenB = randomBytes(32).toString("hex");
  const sessionA = randomUUID();
  const sessionB = randomUUID();
  const first = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const second = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let customerA;
  let customerB;
  let hashA;
  let hashB;

  async function setCustomerSession(client, sessionId) {
    await client.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [authUserId]);
    await client.unsafe("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: authUserId,
        email,
        role: "authenticated",
        session_id: sessionId,
      }),
    ]);
    await client.unsafe("set role authenticated");
  }

  try {
    await db.unsafe("reset role");
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
        "values($1,$2,$3,'CI invitation race customer',$4,true)",
      [profileId, authUserId, organizationId, email],
    );
    await db.unsafe(
      "insert into public.user_roles(profile_id,role) values($1,'customer')",
      [profileId],
    );
    await db.unsafe(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [authUserId, email],
    );

    const insertedA = await db.unsafe(
      "insert into public.customers(organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at) " +
        "values($1,null,$2,'CI Race Company A','CI Race Recipient A','7778800101',$3,'retail',0,0,'approved',now()) returning id",
      [organizationId, customerCodeA, email],
    );
    customerA = insertedA[0].id;
    const insertedB = await db.unsafe(
      "insert into public.customers(organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at) " +
        "values($1,null,$2,'CI Race Company B','CI Race Recipient B','7778800102',$3,'retail',0,0,'approved',now()) returning id",
      [organizationId, customerCodeB, email],
    );
    customerB = insertedB[0].id;

    const inviteA = await db.unsafe(
      "insert into public.customer_company_invitations(organization_id,customer_id,invited_email,member_role,token_hash,status,expires_at) " +
        "values($1,$2,$3,'buyer',public.customer_company_invitation_sha256($4),'pending',now()+interval '1 hour') returning id,token_hash",
      [organizationId, customerA, email, tokenA],
    );
    hashA = inviteA[0].token_hash;
    const inviteB = await db.unsafe(
      "insert into public.customer_company_invitations(organization_id,customer_id,invited_email,member_role,token_hash,status,expires_at) " +
        "values($1,$2,$3,'finance',public.customer_company_invitation_sha256($4),'pending',now()+interval '1 hour') returning id,token_hash",
      [organizationId, customerB, email, tokenB],
    );
    hashB = inviteB[0].token_hash;

    for (const sessionId of [sessionA, sessionB]) {
      await db.unsafe(
        "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
          "values($1,$2,now(),now(),now(),null,'CI concurrent company invitation acceptance','127.0.0.1'::inet)",
        [sessionId, authUserId],
      );
    }

    // A test-only trigger forces both sessions past the RPC's active-membership pre-check
    // before either INSERT proceeds. Cleanup in finally prevents a fixture trigger persisting.
    await db.unsafe("drop trigger if exists ci_company_membership_race_pause on public.customer_company_memberships");
    await db.unsafe("drop function if exists public.ci_company_membership_race_pause()");
    await db.unsafe(`create function public.ci_company_membership_race_pause()
      returns trigger language plpgsql set search_path=''
      as $race$
      begin
        if NEW.profile_id = '${profileId}'::uuid then
          perform pg_catalog.pg_sleep(0.5);
        end if;
        return NEW;
      end;
      $race$`);
    await db.unsafe(
      "create trigger ci_company_membership_race_pause before insert on public.customer_company_memberships " +
        "for each row execute function public.ci_company_membership_race_pause()",
    );

    await Promise.all([
      setCustomerSession(first, sessionA),
      setCustomerSession(second, sessionB),
    ]);

    const outcomes = await Promise.allSettled([
      first.unsafe(
        "select public.accept_customer_company_invitation($1::text) as result",
        [tokenA],
      ),
      second.unsafe(
        "select public.accept_customer_company_invitation($1::text) as result",
        [tokenB],
      ),
    ]);
    const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const failed = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(succeeded.length, 1, "exactly one competing company invitation may be accepted");
    assert.equal(failed.length, 1, "the competing invitation must be rejected by the active-membership constraint");
    if (failed[0].status === "rejected") {
      assert.equal(failed[0].reason?.code, "23505", "the database unique constraint must reject the competing active membership");
    }

    await db.unsafe("reset role");
    const activeMemberships = await db.unsafe(
      "select id,customer_id,member_role from public.customer_company_memberships where profile_id=$1 and status='active'",
      [profileId],
    );
    assert.equal(activeMemberships.length, 1, "the profile must have exactly one active company membership");
    const invitations = await db.unsafe(
      "select status,count(*)::int as count from public.customer_company_invitations where token_hash in ($1,$2) group by status",
      [hashA, hashB],
    );
    const counts = Object.fromEntries(invitations.map((row) => [row.status, row.count]));
    assert.equal(counts.accepted, 1, "one invitation must be accepted");
    assert.equal(counts.pending, 1, "the failed competing invitation must remain pending rather than partially accepted");
    const acceptanceAudits = await db.unsafe(
      "select count(*)::int as count from public.audit_logs where organization_id=$1 and actor_id=$2 and action='customer_company_invitation.accepted' and entity_type='customer_company_membership'",
      [organizationId, profileId],
    );
    assert.equal(acceptanceAudits[0].count, 1, "only the committed membership may have an acceptance audit");

    process.stdout.write(
      "PASS customer company invitation race PG17: competing invitations for one profile yield one active membership, one accepted invitation, one pending invitation, and one acceptance audit.\n",
    );
  } finally {
    await Promise.all([
      first.end({ timeout: 5 }).catch(() => undefined),
      second.end({ timeout: 5 }).catch(() => undefined),
    ]);
    await db.unsafe("reset role").catch(() => undefined);
    await db.unsafe("drop trigger if exists ci_company_membership_race_pause on public.customer_company_memberships").catch(() => undefined);
    await db.unsafe("drop function if exists public.ci_company_membership_race_pause()").catch(() => undefined);
    if (hashA || hashB) {
      await db.unsafe(
        "delete from public.customer_company_invitations where token_hash in ($1,$2)",
        [hashA ?? "missing-token-hash-a", hashB ?? "missing-token-hash-b"],
      ).catch(() => undefined);
    }
    if (customerA || customerB) {
      await db.unsafe(
        "delete from public.customer_company_memberships where profile_id=$1",
        [profileId],
      ).catch(() => undefined);
      if (customerA) await db.unsafe("delete from public.customers where id=$1", [customerA]).catch(() => undefined);
      if (customerB) await db.unsafe("delete from public.customers where id=$1", [customerB]).catch(() => undefined);
    }
    await db.unsafe(
      "delete from public.audit_logs where organization_id=$1 and actor_id=$2 and action='customer_company_invitation.accepted'",
      [organizationId, profileId],
    ).catch(() => undefined);
    await db.unsafe("delete from public.user_roles where profile_id=$1", [profileId]).catch(() => undefined);
    await db.unsafe("delete from public.profiles where id=$1", [profileId]).catch(() => undefined);
    await db.unsafe("delete from auth.sessions where id in ($1,$2)", [sessionA, sessionB]).catch(() => undefined);
    await db.unsafe("delete from auth.users where id=$1", [authUserId]).catch(() => undefined);
  }
}
