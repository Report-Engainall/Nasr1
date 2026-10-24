import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for isolated DQS status-scoring acceptance.");
}
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function main() {
  await db.unsafe("reset role");
  const fixtures = await db.unsafe(
    "select p.id::text as profile_id, p.auth_user_id::text as auth_user_id, p.email, " +
      "p.organization_id::text as organization_id, j.id::text as job_id " +
      "from public.profiles p join public.user_roles r on r.profile_id=p.id and r.role in ('admin','manager','staff') " +
      "join public.import_jobs j on j.organization_id=p.organization_id " +
      "where lower(p.email)='admin@aghbari.ye' and p.is_active=true " +
      "and j.source_file_name='CI DQS impossible-date semantics.csv' " +
      "order by j.id limit 1",
  );
  assert.equal(fixtures.length, 1, "isolated migration fixtures must contain the scoped DQS quality job and active staff profile");
  const fixture = fixtures[0];

  const existing = await db.unsafe(
    "select row_number, status from public.import_job_rows where import_job_id=$1::uuid order by row_number",
    [fixture.job_id],
  );
  assert.equal(existing.length, 2, "the baseline DQS fixture must start with exactly two staged rows");
  assert.deepEqual(existing.map((r) => Number(r.row_number)), [1, 2]);

  const validData = {
    item_code: "DQS-STATUS-VALID",
    product_name: "Status scoring valid row",
    quantity: "1",
    revenue: "10",
    price: "10",
    date: "2024-02-29",
  };
  const invalidData = {
    item_code: "DQS-STATUS-INVALID",
    product_name: "Status scoring invalid row",
    quantity: "1",
    revenue: "10",
    price: "10",
    date: "2024-02-29",
  };
  const pendingData = {
    item_code: "DQS-STATUS-PENDING",
    product_name: "Status scoring pending row",
    quantity: "1",
    revenue: "10",
    price: "10",
    date: "2024-02-29",
  };
  const rejectedData = {
    item_code: "DQS-STATUS-REJECTED",
    product_name: "Status scoring rejected row",
    quantity: "1",
    revenue: "10",
    price: "10",
    date: "2024-02-29",
  };

  await db.unsafe(
    "update public.import_job_rows set status='valid', data=$2::jsonb, errors='[]'::jsonb " +
      "where import_job_id=$1::uuid and row_number=1",
    [fixture.job_id, db.json(validData)],
  );
  await db.unsafe(
    "update public.import_job_rows set status='invalid', data=$2::jsonb, errors='[]'::jsonb " +
      "where import_job_id=$1::uuid and row_number=2",
    [fixture.job_id, db.json(invalidData)],
  );
  await db.unsafe(
    "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) " +
      "values($1::uuid,3,'pending',$2::jsonb,'[]'::jsonb),($1::uuid,4,'rejected',$3::jsonb,'[]'::jsonb)",
    [fixture.job_id, db.json(pendingData), db.json(rejectedData)],
  );

  const sessionId = randomUUID();
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI DQS status scoring','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, fixture.auth_user_id],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [fixture.auth_user_id]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: fixture.auth_user_id,
      email: fixture.email,
      role: "authenticated",
      session_id: sessionId,
    }),
  ]);
  await db.unsafe("set role authenticated");
  let result;
  try {
    const rows = await db.unsafe(
      "select public.calculate_import_job_quality($1::uuid) as result",
      [fixture.job_id],
    );
    result = rows[0]?.result;
  } finally {
    await db.unsafe("reset role");
  }

  assert.equal(Number(result?.total_rows), 4, "quality must evaluate all four explicit row states");
  assert.equal(Number(result?.components?.validity), 25, "only the explicitly valid row may earn validity points");
  assert.ok(Number(result?.score) < 100, "invalid, pending, and rejected rows must prevent a perfect data-quality score");
  assert.notEqual(result?.label, "excellent", "a mixed-status import must not be labelled excellent solely because rows are not rejected");
  process.stdout.write("PASS DQS status scoring PG17: valid=100; invalid/pending/rejected=0 validity points; mixed-status imports cannot receive a perfect score\n");
}

main()
  .catch((error) => {
    const details = {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      hint: error?.hint,
      stack: error?.stack,
    };
    process.stderr.write("DQS_STATUS_SCORING_ACCEPTANCE_FAILED " + JSON.stringify(details) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 });
  });
