import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

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

async function runMembershipRevocationRace() {
  const lockClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const responseClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const observerClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const revokerClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const memberAuthUserId = randomUUID();
  const memberProfileId = randomUUID();
  const memberSessionId = randomUUID();
  const memberEmail = "ci-quote-revoke-race-" + randomUUID().slice(0, 12) + "@example.test";
  let customerId = null;
  let organizationId = null;
  let quoteId = null;
  let lockOpen = false;
  let responsePromise = null;

  async function setIdentityOn(client, authUserId, email, sessionId) {
    await client.unsafe("reset role");
    await client.unsafe(
      "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
        "values($1,$2,now(),now(),now(),null,'CI quote membership-revocation race','127.0.0.1'::inet) " +
        "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
      [sessionId, authUserId],
    );
    await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
    await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: authUserId, email, role: "authenticated", session_id: sessionId }),
    ]);
    await client.unsafe("set role authenticated");
  }

  try {
    await db.unsafe("reset role");
    const ownerRows = await db.unsafe(
      "select p.organization_id::text as organization_id,c.id::text as customer_id " +
        "from public.profiles p join public.customers c " +
        "on c.profile_id=p.id and c.organization_id=p.organization_id " +
        "where p.auth_user_id=$1::uuid and p.is_active and c.status='approved' " +
        "order by c.created_at,c.id limit 1",
      [customerAuthUserId],
    );
    assert.equal(ownerRows.length, 1, "the quote race must bind to the existing approved customer fixture");
    organizationId = ownerRows[0].organization_id;
    customerId = ownerRows[0].customer_id;

    await db.unsafe(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [memberAuthUserId, memberEmail],
    );
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
        "values($1,$2,$3,'CI quote race member',$4,true)",
      [memberProfileId, memberAuthUserId, organizationId, memberEmail],
    );
    await db.unsafe(
      "insert into public.user_roles(profile_id,role) values($1,'customer')",
      [memberProfileId],
    );
    await db.unsafe(
      "insert into public.customer_company_memberships(organization_id,customer_id,profile_id,member_role,status) " +
        "values($1,$2,$3,'buyer','active')",
      [organizationId, customerId, memberProfileId],
    );

    await setIdentity(memberAuthUserId, memberEmail, memberSessionId);
    const requested = await db.unsafe(
      "select public.request_sales_quote($1::jsonb,$2::text) as id",
      [db.json([{ product_id: productId, quantity: 1 }]), "CI membership revoke while quote response waits"],
    );
    quoteId = requested[0].id;
    assert.ok(quoteId, "the active buyer membership must be able to request a quote");

    const itemRows = await db.unsafe(
      "select id from public.sales_quote_items where quote_id=$1::uuid order by id",
      [quoteId],
    );
    assert.equal(itemRows.length, 1, "the race quote must retain its persisted line");

    await setIdentity(staffAuthUserId, staffEmail);
    await db.unsafe(
      "select public.respond_to_sales_quote($1::uuid,$2::jsonb,$3::text,$4::timestamptz)",
      [
        quoteId,
        db.json([{ item_id: itemRows[0].id, unit_price: 12345 }]),
        "CI race quote pricing",
        new Date(Date.now() + 86400000).toISOString(),
      ],
    );

    const baselineRows = await db.unsafe(
      "select q.status,q.responded_by::text as responded_by,q.updated_at::text as updated_at," +
        "(select count(*)::integer from public.audit_logs a where a.entity_id=q.id) as audit_count " +
        "from public.sales_quotes q where q.id=$1::uuid",
      [quoteId],
    );
    assert.equal(baselineRows.length, 1);
    assert.equal(baselineRows[0].status, "quoted");
    assert.notEqual(baselineRows[0].responded_by, memberProfileId, "staff pricing actor must not be mistaken for the buyer response");
    const baseline = baselineRows[0];

    await lockClient.unsafe("begin");
    lockOpen = true;
    const lockedQuote = await lockClient.unsafe(
      "select id from public.sales_quotes where id=$1::uuid for update",
      [quoteId],
    );
    assert.equal(lockedQuote.length, 1, "the lock-holder must own the target quote row");

    await setIdentityOn(responseClient, memberAuthUserId, memberEmail, memberSessionId);
    await responseClient.unsafe(
      "select set_config('application_name',$1,false)",
      ["ci-customer-quote-response-revocation"],
    );
    const responseBackend = Number((await responseClient.unsafe(
      "select pg_catalog.pg_backend_pid() as pid",
    ))[0].pid);
    responsePromise = responseClient.unsafe(
      "select public.customer_respond_to_quote($1::uuid,true)",
      [quoteId],
    ).then(
      (rows) => ({ ok: true, rows }),
      (error) => ({ ok: false, error }),
    );

    let waiting = false;
    let activity = [];
    for (let attempt = 0; attempt < 400; attempt += 1) {
      activity = await observerClient.unsafe(
        "select state,wait_event_type,wait_event,left(query,240) as query " +
          "from pg_catalog.pg_stat_activity where pid=$1::integer",
        [responseBackend],
      );
      waiting = activity.some((row) =>
        row.state === "active" &&
        row.wait_event_type === "Lock" &&
        /customer_respond_to_quote/i.test(String(row.query)),
      );
      if (waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!waiting) {
      await lockClient.unsafe("rollback");
      lockOpen = false;
      const outcome = await responsePromise;
      assert.fail("quote response did not reach the expected quote-row lock wait: " +
        JSON.stringify({ activity, responseOk: outcome.ok, error: outcome.error?.message ?? null }));
    }

    const revokedRows = await revokerClient.unsafe(
      "update public.customer_company_memberships set status='revoked',updated_at=now() " +
        "where organization_id=$1::uuid and customer_id=$2::uuid and profile_id=$3::uuid and status='active' " +
        "returning status",
      [organizationId, customerId, memberProfileId],
    );
    assert.equal(revokedRows.length, 1, "membership revocation must commit while the customer response is blocked");
    assert.equal(revokedRows[0].status, "revoked");

    await lockClient.unsafe("commit");
    lockOpen = false;
    const responseOutcome = await responsePromise;
    assert.equal(responseOutcome.ok, false,
      "a quote response must not commit after the buyer membership was revoked during its row-lock wait");
    assert.equal(responseOutcome.error?.code, "42501",
      "the post-wait membership guard must reject the response with SQLSTATE 42501");
    assert.match(
      String(responseOutcome.error?.message),
      /company membership is no longer active or lacks quote capability/i,
      "the rejection must come from the quote-response membership guard",
    );

    const afterRows = await observerClient.unsafe(
      "select q.status,q.responded_by::text as responded_by,q.updated_at::text as updated_at," +
        "(select count(*)::integer from public.audit_logs a where a.entity_id=q.id) as audit_count " +
        "from public.sales_quotes q where q.id=$1::uuid",
      [quoteId],
    );
    assert.deepEqual(afterRows[0], baseline,
      "the rejected post-revocation response must preserve status, actor, timestamp and audit history");

    process.stdout.write(
      "PASS customer quote membership-revocation race: response blocked on quote-row lock, revocation committed, response rejected with 42501 and quote/audit remained unchanged.\n",
    );
  } finally {
    if (lockOpen) await lockClient.unsafe("rollback").catch(() => {});
    if (responsePromise) await responsePromise;
    await db.unsafe("reset role").catch(() => {});
    if (quoteId) {
      await db.unsafe("delete from public.audit_logs where entity_id=$1::uuid", [quoteId]).catch(() => {});
      await db.unsafe("delete from public.sales_quote_items where quote_id=$1::uuid", [quoteId]).catch(() => {});
      await db.unsafe("delete from public.sales_quotes where id=$1::uuid", [quoteId]).catch(() => {});
    }
    await db.unsafe(
      "delete from public.customer_company_memberships where profile_id=$1::uuid",
      [memberProfileId],
    ).catch(() => {});
    await db.unsafe("delete from public.user_roles where profile_id=$1::uuid", [memberProfileId]).catch(() => {});
    await db.unsafe("delete from public.profiles where id=$1::uuid", [memberProfileId]).catch(() => {});
    await db.unsafe("delete from auth.sessions where id=$1::uuid", [memberSessionId]).catch(() => {});
    await db.unsafe("delete from auth.users where id=$1::uuid", [memberAuthUserId]).catch(() => {});
    await Promise.all([
      lockClient.end({ timeout: 5 }).catch(() => {}),
      responseClient.end({ timeout: 5 }).catch(() => {}),
      observerClient.end({ timeout: 5 }).catch(() => {}),
      revokerClient.end({ timeout: 5 }).catch(() => {}),
    ]);
  }
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

  await runMembershipRevocationRace();

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
