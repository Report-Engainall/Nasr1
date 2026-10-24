import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required; use only isolated PostgreSQL 17.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const adminAuthUserId = "33333333-3333-4333-8333-333333333333";
const adminEmail = "admin@aghbari.ye";
const sessionId = randomUUID();

async function expectSqlState(label, action, expectedCode) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " must fail");
  assert.equal(caught.code, expectedCode, label + " must raise SQLSTATE " + expectedCode);
}

async function setAdminIdentity() {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI AI fallback-decision acceptance','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, adminAuthUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [adminAuthUserId]);
  await db.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: adminAuthUserId, email: adminEmail, role: "authenticated", session_id: sessionId }),
  ]);
  await db.unsafe("set role authenticated");
}

async function setTrustedGateway() {
  await db.unsafe("reset role");
  await db.unsafe("select set_config('request.jwt.claim.role','service_role',false)");
  await db.unsafe("set role service_role");
}

async function configureBudget() {
  await setAdminIdentity();
  const settings = {
    primary_provider: "openai_compatible",
    primary_model: "ci-model",
    primary_base_url: "https://api.example.test/v1",
    fallback_provider: "gemini",
    fallback_model: "",
    fallback_base_url: "",
    ai_enabled: true,
    fallback_enabled: false,
    daily_cost_limit: 100,
    monthly_cost_limit: 1000,
    daily_token_limit: 1000000,
    monthly_token_limit: 10000000,
    per_request_cost_limit: 10,
  };
  await db.unsafe("select public.configure_ai_usage_budget($1::jsonb)", [db.json(settings)]);
  await db.unsafe("reset role");
}

async function reserve(requestId) {
  await setTrustedGateway();
  const rows = await db.unsafe(
    "select public.reserve_ai_gateway_usage($1::uuid,$2::text,100::bigint,100::bigint,1::numeric) as result",
    [adminAuthUserId, requestId],
  );
  const result = rows[0]?.result;
  assert.equal(result?.status, "reserved", "test must reserve AI usage budget");
  assert.match(String(result?.reservation_id), /^[0-9a-f-]{36}$/i);
  return result.reservation_id;
}

async function main() {
  await configureBudget();

  const v1RequestId = "ci-ai-v1-" + randomUUID();
  const v1ReservationId = await reserve(v1RequestId);
  await expectSqlState(
    "v1 completion with NULL fallback flag",
    () => db.unsafe(
      "select public.complete_ai_gateway_usage($1::uuid,0::bigint,0::bigint,0::numeric,5::bigint,'openai_compatible','ci-model','failed',null::boolean)",
      [v1ReservationId],
    ),
    "22023",
  );
  await db.unsafe("reset role");
  let reservation = await db.unsafe("select status from public.ai_usage_reservations where id=$1", [v1ReservationId]);
  assert.equal(reservation[0]?.status, "reserved", "invalid v1 telemetry must leave the reservation open");
  let ledger = await db.unsafe("select count(*)::int as count from public.ai_usage_ledger where request_id=$1", [v1RequestId]);
  assert.equal(ledger[0].count, 0, "invalid v1 telemetry must not create a ledger row");

  await setTrustedGateway();
  await db.unsafe(
    "select public.complete_ai_gateway_usage($1::uuid,0::bigint,0::bigint,0::numeric,5::bigint,'openai_compatible','ci-model','failed',false)",
    [v1ReservationId],
  );
  await db.unsafe("reset role");
  reservation = await db.unsafe("select status from public.ai_usage_reservations where id=$1", [v1ReservationId]);
  assert.equal(reservation[0]?.status, "completed", "explicit false must complete v1 telemetry");
  ledger = await db.unsafe("select fallback_used,result_status from public.ai_usage_ledger where request_id=$1", [v1RequestId]);
  assert.equal(ledger[0]?.fallback_used, false);
  assert.equal(ledger[0]?.result_status, "failed");

  const v2RequestId = "ci-ai-v2-" + randomUUID();
  const v2ReservationId = await reserve(v2RequestId);
  const attempts = db.json([{
    provider: "openai_compatible",
    model: "ci-model",
    fallback: false,
    status: "failed",
    elapsed_ms: 5,
    error_code: "provider_error",
  }]);
  await setTrustedGateway();
  await expectSqlState(
    "v2 unknown-measurement completion with NULL fallback flag",
    () => db.unsafe(
      "select public.complete_ai_gateway_usage_v2($1::uuid,0::bigint,0::bigint,1::numeric,5::bigint,'openai_compatible','ci-model','failed',null::boolean,null::bigint,null::bigint,'unknown',$2::jsonb)",
      [v2ReservationId, attempts],
    ),
    "22023",
  );
  await db.unsafe("reset role");
  reservation = await db.unsafe("select status from public.ai_usage_reservations where id=$1", [v2ReservationId]);
  assert.equal(reservation[0]?.status, "reserved", "invalid v2 telemetry must leave the reservation open");
  ledger = await db.unsafe("select count(*)::int as count from public.ai_usage_ledger where request_id=$1", [v2RequestId]);
  assert.equal(ledger[0].count, 0, "invalid v2 telemetry must not create a ledger row");

  await setTrustedGateway();
  await db.unsafe(
    "select public.complete_ai_gateway_usage_v2($1::uuid,0::bigint,0::bigint,1::numeric,5::bigint,'openai_compatible','ci-model','failed',false,null::bigint,null::bigint,'unknown',$2::jsonb)",
    [v2ReservationId, attempts],
  );
  await db.unsafe("reset role");
  reservation = await db.unsafe("select status from public.ai_usage_reservations where id=$1", [v2ReservationId]);
  assert.equal(reservation[0]?.status, "completed", "explicit fallback flag must complete v2 telemetry");
  ledger = await db.unsafe("select fallback_used,usage_measurement_status from public.ai_usage_ledger where request_id=$1", [v2RequestId]);
  assert.equal(ledger[0]?.fallback_used, false);
  assert.equal(ledger[0]?.usage_measurement_status, "unknown");

  process.stdout.write(
    "PASS AI fallback decision PG17 runtime: NULL fallback rejected before mutation in v1/v2; explicit false completes with exact ledger flags.\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("AI_FALLBACK_DECISION_ACCEPTANCE_FAILED " + JSON.stringify({
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      detail: error?.detail ?? null,
      stack: error?.stack ?? null,
    }) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => { await db.end({ timeout: 5 }); });
