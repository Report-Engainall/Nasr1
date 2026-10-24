import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required; use only isolated PostgreSQL 17.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const adminAuthUserId = "33333333-3333-4333-8333-333333333333";
const adminEmail = "admin@aghbari.ye";
const sessionId = randomUUID();

async function setAdminIdentity() {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI announcement active decision acceptance','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, adminAuthUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [adminAuthUserId]);
  await db.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: adminAuthUserId, email: adminEmail, role: "authenticated", session_id: sessionId }),
  ]);
  await db.unsafe("set role authenticated");
}

async function expectSqlState(label, action, expectedCode) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " must fail");
  assert.equal(caught.code, expectedCode, label + " must raise SQLSTATE " + expectedCode);
}

async function saveAnnouncement(id, title, isActive) {
  return await db.unsafe(
    "select public.save_storefront_announcement($1::uuid,$2::text,'CI announcement body',null::text,'#112233',10,$3::boolean,null::timestamptz,null::timestamptz,'all') as id",
    [id, title, isActive],
  );
}

async function main() {
  const nullCreateTitle = "CI NULL announcement create " + randomUUID();
  await setAdminIdentity();
  await expectSqlState(
    "save_storefront_announcement with NULL active decision on create",
    () => saveAnnouncement(null, nullCreateTitle, null),
    "22023",
  );
  await db.unsafe("reset role");
  let rows = await db.unsafe("select count(*)::int as count from public.storefront_announcements where title=$1", [nullCreateTitle]);
  assert.equal(rows[0].count, 0, "NULL create decision must not create an announcement");

  const activeTitle = "CI NULL announcement update " + randomUUID();
  await setAdminIdentity();
  const created = await saveAnnouncement(null, activeTitle, true);
  const announcementId = created[0]?.id;
  assert.match(String(announcementId), /^[0-9a-f-]{36}$/i, "valid active announcement fixture must persist");
  await db.unsafe("reset role");
  let state = await db.unsafe("select is_active,organization_id from public.storefront_announcements where id=$1", [announcementId]);
  assert.equal(state[0]?.is_active, true);
  const organizationId = state[0].organization_id;

  await setAdminIdentity();
  await expectSqlState(
    "save_storefront_announcement with NULL active decision on update",
    () => saveAnnouncement(announcementId, activeTitle, null),
    "22023",
  );
  await db.unsafe("reset role");
  state = await db.unsafe("select is_active from public.storefront_announcements where id=$1", [announcementId]);
  assert.equal(state[0]?.is_active, true, "NULL update must not deactivate the announcement");
  let audit = await db.unsafe(
    "select count(*)::int as count from public.audit_logs where organization_id=$1 and entity_type='storefront_announcement' and entity_id=$2 and action='storefront_announcement.updated'",
    [organizationId, announcementId],
  );
  assert.equal(audit[0].count, 0, "NULL update must not write an update audit event");

  await setAdminIdentity();
  await saveAnnouncement(announcementId, activeTitle, false);
  await db.unsafe("reset role");
  state = await db.unsafe("select is_active from public.storefront_announcements where id=$1", [announcementId]);
  assert.equal(state[0]?.is_active, false, "explicit false must still deactivate the announcement");
  audit = await db.unsafe(
    "select count(*)::int as count from public.audit_logs where organization_id=$1 and entity_type='storefront_announcement' and entity_id=$2 and action='storefront_announcement.updated'",
    [organizationId, announcementId],
  );
  assert.equal(audit[0].count, 1, "valid update must write exactly one audit event");

  process.stdout.write(
    "PASS announcement active decision PG17 runtime: NULL create/update rejected with 22023 and no mutation/audit; explicit false deactivates once.\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("ANNOUNCEMENT_ACTIVE_DECISION_ACCEPTANCE_FAILED " + JSON.stringify({
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      detail: error?.detail ?? null,
      stack: error?.stack ?? null,
    }) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => { await db.end({ timeout: 5 }); });
