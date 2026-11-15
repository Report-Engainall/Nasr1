import assert from "node:assert/strict";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated runtime-error acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function assertLoopback(apiValue, databaseValue) {
  const api = new URL(apiValue);
  const database = new URL(databaseValue);
  if (
    api.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(api.hostname) ||
    api.port !== "54321" ||
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost", "[::1]", "::1"].includes(database.hostname) ||
    !/^\d{1,5}$/.test(database.port) ||
    ["5432", "6543"].includes(database.port)
  ) {
    throw new Error("Runtime error acceptance must target only isolated local Supabase and PostgreSQL endpoints.");
  }
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
async function signIn(apiUrl, key, email, password, expectedUserId, db) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", apiUrl), {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error("Local Supabase Auth could not issue a runtime-error acceptance session (HTTP " + response.status + ").");
  }
  const parts = body.access_token.split(".");
  if (parts.length !== 3 || !parts[1]) throw new Error("Local Auth returned an invalid access token.");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (
    claims.sub !== expectedUserId ||
    claims.role !== "authenticated" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(claims.session_id ?? "")) ||
    !Number.isFinite(Number(claims.exp)) ||
    Number(claims.exp) <= Math.floor(Date.now() / 1000)
  ) throw new Error("Local Auth did not issue a current session-bound token for the expected user.");
  const session = await db.unsafe(
    "select id::text from auth.sessions where id=$1::uuid and user_id=$2::uuid and (not_after is null or not_after>pg_catalog.now())",
    [claims.session_id, expectedUserId],
  );
  assert.equal(session.length, 1, "runtime error acceptance token must map to an active Auth session row");
  return claims;
}
async function profile(db, organizationId, email) {
  const rows = await db.unsafe(
    "select id::text,auth_user_id::text from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true",
    [organizationId, email],
  );
  assert.equal(rows.length, 1, "expected exactly one active seeded local profile for " + email);
  return rows[0];
}
async function identityClient(connectionString, claims) {
  const client = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [claims.sub]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
  await client.unsafe("set role authenticated");
  return client;
}
async function callJson(client, statement, args) {
  const rows = await client.unsafe(statement, args);
  assert.equal(rows.length, 1);
  return asJson(rows[0].result);
}
async function expectSqlState(label, operation, code) {
  let caught;
  try { await operation(); } catch (error) { caught = error; }
  assert.ok(caught, label + " must be denied");
  assert.equal(caught.code, code, label + " must fail with SQLSTATE " + code);
  return caught;
}

async function main() {
  const apiUrl = requiredEnv("E2E_SUPABASE_URL");
  const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
  const connectionString = requiredEnv("TEST_DATABASE_URL");
  assertLoopback(apiUrl, connectionString);

  const organizationId = "a0000000-0000-0000-0000-000000000001";
  const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
  const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL").toLowerCase();
  const accountantPassword = requiredEnv("E2E_ACCOUNTANT_PASSWORD");
  const foreignCustomerEmail = requiredEnv("E2E_EMAIL_B").toLowerCase();
  const foreignCustomerPassword = requiredEnv("E2E_PASSWORD_B");
  const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const clients = [];
  const createdIds = new Set();

  try {
    for (const value of [apiUrl, publishableKey, connectionString, managerEmail, managerPassword, accountantEmail, accountantPassword, foreignCustomerEmail, foreignCustomerPassword]) {
      process.stdout.write("::add-mask::" + value + String.fromCharCode(10));
    }

    const [manager, accountant, foreignCustomer] = await Promise.all([
      profile(db, organizationId, managerEmail),
      profile(db, organizationId, accountantEmail),
      profile(db, foreignOrganizationId, foreignCustomerEmail),
    ]);
    const [managerClaims, accountantClaims, foreignCustomerClaims] = await Promise.all([
      signIn(apiUrl, publishableKey, managerEmail, managerPassword, manager.auth_user_id, db),
      signIn(apiUrl, publishableKey, accountantEmail, accountantPassword, accountant.auth_user_id, db),
      signIn(apiUrl, publishableKey, foreignCustomerEmail, foreignCustomerPassword, foreignCustomer.auth_user_id, db),
    ]);

    const managerDb = await identityClient(connectionString, managerClaims);
    const accountantDb = await identityClient(connectionString, accountantClaims);
    const foreignDb = await identityClient(connectionString, foreignCustomerClaims);
    clients.push(managerDb, accountantDb, foreignDb);

    // Normal authenticated browser reporting, dedupe and tenant-derived visibility.
    const mainEvent = await callJson(managerDb,
      "select public.record_runtime_error_event($1,$2,$3) as result",
      ["type_error", 503, "tanstack_root_error_component"]);
    assert.equal(mainEvent.recorded, true);
    assert.equal(mainEvent.deduplicated, false);
    assert.match(mainEvent.event_id, /^[0-9a-f-]{36}$/i);
    createdIds.add(mainEvent.event_id);

    const deduplicated = await callJson(managerDb,
      "select public.record_runtime_error_event($1,$2,$3) as result",
      ["type_error", 503, "tanstack_root_error_component"]);
    assert.equal(deduplicated.recorded, true);
    assert.equal(deduplicated.deduplicated, true);
    assert.equal(deduplicated.event_id, mainEvent.event_id);

    const foreignEvent = await callJson(foreignDb,
      "select public.record_runtime_error_event($1,$2,$3) as result",
      ["reference_error", null, "window_error"]);
    assert.equal(foreignEvent.recorded, true);
    createdIds.add(foreignEvent.event_id);

    const managerPage = await callJson(managerDb,
      "select public.list_runtime_error_events($1,$2,$3) as result",
      [null, 100, 0]);
    assert.ok(Array.isArray(managerPage.items));
    assert.ok(managerPage.items.some((item) => item.id === mainEvent.event_id));
    assert.ok(!managerPage.items.some((item) => item.id === foreignEvent.event_id),
      "manager list must not disclose another organization's runtime error");

    // Accountant and customer cannot read or triage the manager-only operational log.
    await expectSqlState("accountant runtime-error list", () =>
      accountantDb.unsafe("select public.list_runtime_error_events(null,50,0)"), "42501");
    await expectSqlState("foreign customer runtime-error list", () =>
      foreignDb.unsafe("select public.list_runtime_error_events(null,50,0)"), "42501");
    await expectSqlState("authenticated direct table read", () =>
      managerDb.unsafe("select id from public.runtime_error_events limit 1"), "42501");

    // Invalid metadata, invalid filters and unbounded pagination fail closed.
    await expectSqlState("unsupported error kind", () =>
      managerDb.unsafe("select public.record_runtime_error_event('database_dump',null,'unknown')"), "22023");
    await expectSqlState("invalid HTTP status", () =>
      managerDb.unsafe("select public.record_runtime_error_event('error',200,'unknown')"), "22023");
    await expectSqlState("invalid runtime boundary", () =>
      managerDb.unsafe("select public.record_runtime_error_event('error',null,'customer_payload')"), "22023");
    await expectSqlState("invalid status filter", () =>
      managerDb.unsafe("select public.list_runtime_error_events('deleted',50,0)"), "22023");
    await expectSqlState("out-of-bound page size", () =>
      managerDb.unsafe("select public.list_runtime_error_events(null,101,0)"), "22023");

    // A second event proves the strict open -> acknowledged -> resolved lifecycle.
    const secondEvent = await callJson(managerDb,
      "select public.record_runtime_error_event($1,$2,$3) as result",
      ["unknown_error", null, "unhandled_rejection"]);
    assert.equal(secondEvent.recorded, true);
    createdIds.add(secondEvent.event_id);
    await expectSqlState("resolve before acknowledgement", () =>
      managerDb.unsafe("select public.transition_runtime_error_event($1::uuid,'resolved')", [secondEvent.event_id]), "22023");

    const acknowledged = await callJson(managerDb,
      "select public.transition_runtime_error_event($1::uuid,$2) as result",
      [mainEvent.event_id, "acknowledged"]);
    assert.equal(acknowledged.changed, true);
    assert.equal(acknowledged.status, "acknowledged");
    const acknowledgedAgain = await callJson(managerDb,
      "select public.transition_runtime_error_event($1::uuid,$2) as result",
      [mainEvent.event_id, "acknowledged"]);
    assert.equal(acknowledgedAgain.changed, false);

    const resolved = await callJson(managerDb,
      "select public.transition_runtime_error_event($1::uuid,$2) as result",
      [mainEvent.event_id, "resolved"]);
    assert.equal(resolved.changed, true);
    assert.equal(resolved.status, "resolved");
    await expectSqlState("resolved event cannot be reopened", () =>
      managerDb.unsafe("select public.transition_runtime_error_event($1::uuid,'open')", [mainEvent.event_id]), "22023");

    const transitions = await db.unsafe(
      "select from_status,to_status from public.runtime_error_event_transitions where event_id=$1::uuid order by created_at,id",
      [mainEvent.event_id],
    );
    assert.deepEqual(transitions.map((row) => [row.from_status, row.to_status]), [
      ["open", "acknowledged"], ["acknowledged", "resolved"],
    ]);

    const columns = await db.unsafe(
      "select column_name from information_schema.columns where table_schema='public' and table_name='runtime_error_events'",
    );
    const columnNames = new Set(columns.map((row) => row.column_name));
    for (const forbidden of ["message", "error_message", "stack", "stack_trace", "url", "request_payload", "headers", "token", "secret"]) {
      assert.ok(!columnNames.has(forbidden), "privacy boundary must exclude column " + forbidden);
    }

    // Verify a strict per-actor creation quota without depending on external services.
    const kinds = ["error", "type_error", "reference_error", "syntax_error", "range_error", "response_error", "unknown_error"];
    const boundaries = ["tanstack_root_error_component", "window_error", "unhandled_rejection", "unknown"];
    const httpStatuses = [null, 500, 501, 502, 503, 504, 505];
    let newRecords = 0;
    outer: for (const kind of kinds) {
      for (const boundary of boundaries) {
        for (const httpStatus of httpStatuses) {
          if (kind === "type_error" && boundary === "tanstack_root_error_component" && httpStatus === 503) continue;
          if (kind === "unknown_error" && boundary === "unhandled_rejection" && httpStatus === null) continue;
          const outcome = await callJson(accountantDb,
            "select public.record_runtime_error_event($1,$2,$3) as result",
            [kind, httpStatus, boundary]);
          if (outcome.recorded && !outcome.deduplicated) {
            createdIds.add(outcome.event_id);
            newRecords += 1;
          }
          if (newRecords === 30) break outer;
        }
      }
    }
    assert.equal(newRecords, 30, "the isolated accountant actor must be able to create exactly 30 unique records");
    const limited = await callJson(accountantDb,
      "select public.record_runtime_error_event($1,$2,$3) as result",
      ["error", 599, "unknown"]);
    assert.equal(limited.recorded, false);
    assert.equal(limited.reason, "rate_limited");

    process.stdout.write("PASS runtime error log: live local sessions; dedupe/rate limit; tenant isolation; admin/manager read; accountant/customer denial; metadata allowlists; direct table denial; append-only triage lifecycle; privacy projection.\n");
  } finally {
    const ids = [...createdIds];
    if (ids.length) {
      await db.unsafe("delete from public.runtime_error_event_transitions where event_id = any($1::uuid[])", [ids]);
      await db.unsafe("delete from public.runtime_error_events where id = any($1::uuid[])", [ids]);
    }
    await Promise.all(clients.map((client) => client.end({ timeout: 2 })));
    await db.end({ timeout: 2 });
  }
}

main().catch((error) => {
  process.stderr.write("Runtime error log acceptance failed: " + (error instanceof Error ? error.message : "unknown failure") + "\n");
  process.exitCode = 1;
});
