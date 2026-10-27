import assert from "node:assert/strict";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required; run only against isolated PostgreSQL 17.");
}

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const customerAuthUserId = "11111111-1111-4111-8111-111111111111";
const customerEmail = "ci-customer-one@example.test";
const staffAuthUserId = "33333333-3333-4333-8333-333333333333";
const staffEmail = "admin@aghbari.ye";
const productId = "a1000000-0000-0000-0000-000000000001";

async function setIdentity(authUserId, email, sessionId = authUserId) {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI quote decision test','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, authUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: authUserId, email, role: "authenticated", session_id: sessionId }),
  ]);
  await db.unsafe("set role authenticated");
}

async function expectSqlState(label, action, expectedCode) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must fail");
  assert.equal(caught.code, expectedCode, label + " must raise SQLSTATE " + expectedCode);
}

async function createQuotedQuote(suffix) {
  await setIdentity(customerAuthUserId, customerEmail);
  const quoteRows = await db.unsafe(
    "select public.request_sales_quote($1::jsonb,$2::text) as id",
    [db.json([{ product_id: productId, quantity: 1 }]), "CI explicit decision " + suffix],
  );
  const quoteId = quoteRows[0].id;
  const itemRows = await db.unsafe(
    "select id from public.sales_quote_items where quote_id=$1 order by id",
    [quoteId],
  );
  assert.equal(itemRows.length, 1, "the quote must have exactly one persisted line");

  await setIdentity(staffAuthUserId, staffEmail);
  const priced = await db.unsafe(
    "select public.respond_to_sales_quote($1::uuid,$2::jsonb,$3::text,$4::timestamptz) as result",
    [
      quoteId,
      db.json([{ item_id: itemRows[0].id, unit_price: 12345 }]),
      "CI quote priced " + suffix,
      new Date(Date.now() + 86400000).toISOString(),
    ],
  );
  assert.equal(priced.length, 1, "the staff quote-pricing RPC must execute");
  await db.unsafe("reset role");
  const status = await db.unsafe("select status from public.sales_quotes where id=$1", [quoteId]);
  assert.equal(status[0]?.status, "quoted", "the customer response contract starts from quoted state");
  return quoteId;
}

async function main() {
  const rejectedQuoteId = await createQuotedQuote("null-rejection-guard");
  const acceptedQuoteId = await createQuotedQuote("explicit-accept");
  const staffRejectedQuoteId = await createQuotedQuote("staff-direct-rejection");

  await setIdentity(customerAuthUserId, customerEmail);
  await expectSqlState(
    "NULL accept/reject decision",
    () => db.unsafe("select public.customer_respond_to_quote($1::uuid,$2::boolean)", [rejectedQuoteId, null]),
    "22023",
  );
  await db.unsafe("reset role");
  let row = await db.unsafe("select status from public.sales_quotes where id=$1", [rejectedQuoteId]);
  assert.equal(row[0]?.status, "quoted", "NULL decision must not reject or otherwise mutate a quote");

  await setIdentity(customerAuthUserId, customerEmail);
  await expectSqlState(
    "NULL quote ID",
    () => db.unsafe("select public.customer_respond_to_quote($1::uuid,$2::boolean)", [null, false]),
    "22023",
  );
  await db.unsafe("reset role");
  row = await db.unsafe("select status from public.sales_quotes where id=$1", [rejectedQuoteId]);
  assert.equal(row[0]?.status, "quoted", "NULL quote ID must not mutate another quote");

  await setIdentity(customerAuthUserId, customerEmail);
  await db.unsafe(
    "select public.customer_respond_to_quote($1::uuid,false)",
    [rejectedQuoteId],
  );
  await db.unsafe("reset role");
  row = await db.unsafe("select status from public.sales_quotes where id=$1", [rejectedQuoteId]);
  assert.equal(row[0]?.status, "rejected", "an explicit false decision must reject the quote");

  await setIdentity(customerAuthUserId, customerEmail);
  await db.unsafe(
    "select public.customer_respond_to_quote($1::uuid,true)",
    [acceptedQuoteId],
  );
  await db.unsafe("reset role");
  row = await db.unsafe("select status from public.sales_quotes where id=$1", [acceptedQuoteId]);
  assert.equal(row[0]?.status, "accepted", "an explicit true decision must accept the quote");

  await setIdentity(staffAuthUserId, staffEmail);
  const staffProfile = await db.unsafe("select public.current_profile_id() as id");
  assert.ok(staffProfile[0]?.id, "staff quote-response path must resolve the active staff profile");
  const staffRejection = await db.unsafe(
    "update public.sales_quotes set status='rejected', responded_by=$2::uuid, updated_at=now() " +
      "where id=$1::uuid and status='quoted' returning id",
    [staffRejectedQuoteId, staffProfile[0].id],
  );
  assert.equal(staffRejection.length, 1,
    "authorized staff must retain the existing direct quote-rejection path");
  await db.unsafe("reset role");
  row = await db.unsafe("select status from public.sales_quotes where id=$1", [staffRejectedQuoteId]);
  assert.equal(row[0]?.status, "rejected",
    "staff direct quote rejection must persist despite the customer membership guard");

  process.stdout.write(
    "PASS customer quote decision runtime: NULL UUID/boolean rejected with 22023 and no mutation; explicit false/true customer decisions persist; authorized staff direct rejection remains available.\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("QUOTE_DECISION_ACCEPTANCE_FAILED " + JSON.stringify({
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      detail: error?.detail ?? null,
      stack: error?.stack ?? null,
    }) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 });
  });
