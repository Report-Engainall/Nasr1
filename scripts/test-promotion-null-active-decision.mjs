import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required; use only isolated PostgreSQL 17.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const adminAuthUserId = "33333333-3333-4333-8333-333333333333";
const adminEmail = "admin@aghbari.ye";
const productId = "a1000000-0000-0000-0000-000000000001";
const sessionId = randomUUID();

async function setAdminIdentity() {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI promotion active decision acceptance','127.0.0.1'::inet) " +
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

async function main() {
  const nullCreateTitle = "CI NULL promotion create " + randomUUID();
  await setAdminIdentity();
  await expectSqlState(
    "save_promotion with NULL active decision",
    () => db.unsafe(
      "select public.save_promotion(null::uuid,$1::text,null::text,'percentage',10,ARRAY[$2::uuid],ARRAY[]::uuid[],current_date,current_date+7,null::boolean)",
      [nullCreateTitle, productId],
    ),
    "22023",
  );
  await db.unsafe("reset role");
  const nullCreateRows = await db.unsafe(
    "select count(*)::int as count from public.promotions where title=$1",
    [nullCreateTitle],
  );
  assert.equal(nullCreateRows[0].count, 0, "NULL create decision must not create a promotion");

  const activeTitle = "CI NULL promotion toggle " + randomUUID();
  await setAdminIdentity();
  const created = await db.unsafe(
    "select public.save_promotion(null::uuid,$1::text,null::text,'percentage',10,ARRAY[$2::uuid],ARRAY[]::uuid[],current_date,current_date+7,true) as id",
    [activeTitle, productId],
  );
  const promotionId = created[0]?.id;
  assert.match(String(promotionId), /^[0-9a-f-]{36}$/i, "valid active promotion fixture must persist");

  await expectSqlState(
    "set_promotion_active with NULL decision",
    () => db.unsafe(
      "select public.set_promotion_active($1::uuid,null::boolean)",
      [promotionId],
    ),
    "22023",
  );
  await db.unsafe("reset role");
  let state = await db.unsafe("select is_active from public.promotions where id=$1", [promotionId]);
  assert.equal(state[0]?.is_active, true, "NULL toggle must leave promotion active");
  let audit = await db.unsafe(
    "select count(*)::int as count from public.audit_logs where entity_type='promotion' and entity_id=$1 and action='promotion.deactivated'",
    [promotionId],
  );
  assert.equal(audit[0].count, 0, "NULL toggle must not write a deactivation audit event");

  await setAdminIdentity();
  await db.unsafe("select public.set_promotion_active($1::uuid,false)", [promotionId]);
  await db.unsafe("reset role");
  state = await db.unsafe("select is_active from public.promotions where id=$1", [promotionId]);
  assert.equal(state[0]?.is_active, false, "explicit false must still deactivate the promotion");
  audit = await db.unsafe(
    "select count(*)::int as count from public.audit_logs where entity_type='promotion' and entity_id=$1 and action='promotion.deactivated'",
    [promotionId],
  );
  assert.equal(audit[0].count, 1, "explicit false must retain one status audit event");

  process.stdout.write(
    "PASS promotion active decision PG17 runtime: NULL create/toggle rejected with 22023 and no mutation/audit; explicit true/false decisions persist.\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("PROMOTION_ACTIVE_DECISION_ACCEPTANCE_FAILED " + JSON.stringify({
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      detail: error?.detail ?? null,
      stack: error?.stack ?? null,
    }) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => { await db.end({ timeout: 5 }); });
