import assert from "node:assert/strict";

/**
 * PostgreSQL acceptance for central tenant-scoped Auth session inventory and revocation.
 * The harness supplies a privileged database connection plus identity and failure helpers.
 */
export async function runSessionManagementAcceptance({ db, setIdentity, expectFailure }) {
  const org = "a9000000-0000-4000-8000-000000000001";
  const foreignOrg = "a9000000-0000-4000-8000-000000000002";
  const adminAuth = "a9000000-0000-4000-8000-000000000011";
  const staffAuth = "a9000000-0000-4000-8000-000000000012";
  const targetAuth = "a9000000-0000-4000-8000-000000000013";
  const foreignAdminAuth = "a9000000-0000-4000-8000-000000000014";
  const adminProfile = "a9000000-0000-4000-8000-000000000021";
  const staffProfile = "a9000000-0000-4000-8000-000000000022";
  const targetProfile = "a9000000-0000-4000-8000-000000000023";
  const foreignAdminProfile = "a9000000-0000-4000-8000-000000000024";
  const adminSession = "a9000000-0000-4000-8000-000000000031";
  const staffSession = "a9000000-0000-4000-8000-000000000032";
  const targetSession = "a9000000-0000-4000-8000-000000000033";
  const foreignSession = "a9000000-0000-4000-8000-000000000034";
  const expiredSession = "a9000000-0000-4000-8000-000000000035";

  await db.unsafe(
    "insert into public.organizations(id,name,currency) values($1,'CI Session Organization','YER'),($2,'CI Foreign Session Organization','YER') on conflict(id) do nothing",
    [org, foreignOrg],
  );
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,now()),($7,$8,now()) on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [adminAuth,"session-admin@example.test",staffAuth,"session-staff@example.test",targetAuth,"session-target@example.test",foreignAdminAuth,"session-foreign-admin@example.test"],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Session Admin','session-admin@example.test',true),($4,$5,$3,'CI Session Staff','session-staff@example.test',true),($6,$7,$3,'CI Session Target','session-target@example.test',true),($8,$9,$10,'CI Foreign Admin','session-foreign-admin@example.test',true) on conflict(id) do nothing",
    [adminProfile,adminAuth,org,staffProfile,staffAuth,targetProfile,targetAuth,foreignAdminProfile,foreignAdminAuth,foreignOrg],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'admin'),($2,'staff'),($3,'staff'),($4,'admin') on conflict(profile_id,role) do nothing",
    [adminProfile,staffProfile,targetProfile,foreignAdminProfile],
  );
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now()-interval '2 days',now()-interval '1 minute',now()-interval '30 seconds',null,'Admin test browser','192.0.2.10'::inet),($3,$4,now()-interval '1 day',now()-interval '2 minutes',now()-interval '1 minute',null,'Staff test browser','192.0.2.11'::inet),($5,$6,now()-interval '3 days',now()-interval '4 minutes',now()-interval '3 minutes',null,'Target test browser','192.0.2.12'::inet),($7,$8,now()-interval '4 days',now()-interval '5 minutes',now()-interval '4 minutes',null,'Foreign tenant browser','192.0.2.13'::inet),($9,$6,now()-interval '9 days',now()-interval '9 days',now()-interval '9 days',now()-interval '1 day','Expired test browser','192.0.2.14'::inet) on conflict(id) do nothing",
    [adminSession,adminAuth,staffSession,staffAuth,targetSession,targetAuth,foreignSession,foreignAdminAuth,expiredSession,targetAuth],
  );

  await setIdentity(adminAuth, "session-admin@example.test", adminSession, true);
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select public.current_profile_id() as id"))[0].id, adminProfile,
    "a valid server-backed Auth session is accepted by the canonical profile helper");

  const listed = (await db.unsafe("select public.list_organization_sessions(100) as sessions"))[0].sessions;
  assert.ok(Array.isArray(listed), "session inventory returns an array");
  assert.ok(listed.some((s) => s.session_id === adminSession && s.is_current_session === true),
    "the caller's actual server session is identified as current");
  assert.ok(listed.some((s) => s.session_id === staffSession), "same-tenant staff sessions are listed");
  assert.ok(listed.some((s) => s.session_id === targetSession), "other active same-tenant sessions are listed");
  assert.ok(!listed.some((s) => s.session_id === foreignSession), "foreign-tenant sessions are not disclosed");
  assert.ok(!listed.some((s) => s.session_id === expiredSession), "sessions past not_after are not shown as active");
  assert.equal(Object.keys(listed.find((s) => s.session_id === targetSession) ?? {}).some((k) => /token|secret|password/i.test(k)), false,
    "session results never expose access/refresh tokens or secrets");
  await expectFailure("session inventory has a bounded page size",
    () => db.unsafe("select public.list_organization_sessions(201)"), /limit|between/i);

  await db.unsafe("reset role");
  const listAudit = await db.unsafe(
    "select action,new_value from public.audit_logs where organization_id=$1 and actor_id=$2 and action='auth.sessions.viewed'",
    [org,adminProfile],
  );
  assert.ok(listAudit.length >= 1, "viewing the session inventory is audited without token material");

  await setIdentity(staffAuth, "session-staff@example.test", staffSession, true);
  await db.unsafe("set role authenticated");
  await expectFailure("ordinary staff cannot list organization sessions",
    () => db.unsafe("select public.list_organization_sessions(100)"),
    /administrator|required|42501/i);
  await expectFailure("ordinary staff cannot revoke another user's session",
    () => db.unsafe("select public.revoke_organization_session($1::uuid)", [targetSession]),
    /administrator|required|42501/i);

  await db.unsafe("reset role");
  await setIdentity(foreignAdminAuth, "session-foreign-admin@example.test", foreignSession, true);
  await db.unsafe("set role authenticated");
  await expectFailure("a different tenant cannot revoke this organization's session",
    () => db.unsafe("select public.revoke_organization_session($1::uuid)", [targetSession]),
    /not found in the active organization|42501/i);

  await db.unsafe("reset role");
  await setIdentity(adminAuth, "session-admin@example.test", adminSession, true);
  await db.unsafe("set role authenticated");
  await expectFailure("the caller cannot revoke its own current session through the device endpoint",
    () => db.unsafe("select public.revoke_organization_session($1::uuid)", [adminSession]),
    /current administrator session/i);

  const revoked = (await db.unsafe(
    "select public.revoke_organization_session($1::uuid) as result", [targetSession],
  ))[0].result;
  assert.equal(revoked.session_id, targetSession);
  assert.equal(revoked.revoked, true, "success is returned only after deletion of the Auth session row");
  const removed = await db.unsafe("select id from auth.sessions where id=$1", [targetSession]);
  assert.equal(removed.length, 0, "single-session revocation deletes exactly the selected server session");

  await db.unsafe("reset role");
  const revokeAudit = await db.unsafe(
    "select action,new_value from public.audit_logs where organization_id=$1 and entity_id=$2 and action='auth.session.revoked'",
    [org,targetSession],
  );
  assert.equal(revokeAudit.length, 1, "single session revocation is audited once");

  // Reuse the revoked JWT session_id without recreating its deleted auth.sessions row.
  await setIdentity(targetAuth, "session-target@example.test", targetSession, false);
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select public.current_profile_id() as id"))[0].id, null,
    "the revoked, not-yet-expired JWT loses its canonical application identity immediately");
  assert.equal((await db.unsafe("select public.current_organization_id() as id"))[0].id, null,
    "the revoked JWT cannot acquire tenant scope");
  await expectFailure("the revoked JWT is rejected by tenant-context reads",
    () => db.unsafe("select public.get_current_tenant_context()"),
    /non-revoked session|active profile|42501/i);
  await expectFailure("the revoked JWT cannot enumerate or change session state",
    () => db.unsafe("select public.list_organization_sessions(100)"),
    /administrator|required|42501/i);
  await db.unsafe("reset role");

  process.stdout.write("PASS central session management: live-session acceptance, tenant-bounded listing, expiry filtering, audit view/revoke, admin-only revocation, cross-tenant denial, current-session protection, and immediate canonical tenant-context rejection after revocation\n");
}
