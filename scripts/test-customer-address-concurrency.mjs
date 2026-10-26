import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for customer address concurrency acceptance.");
}

const organizationId = "a0000000-0000-0000-0000-000000000001";
const admin = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const lockClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const monitor = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const addressClients = [
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
  postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
];
const foreignClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setIdentity(client, authUserId, email, applicationName) {
  const sessionId = randomUUID();
  await client.unsafe("reset role");
  await client.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) " +
      "on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [authUserId, email],
  );
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI customer address acceptance','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe(
    "select set_config('request.jwt.claims',$1,false)",
    [JSON.stringify({
      sub: authUserId,
      email,
      email_confirmed_at: new Date().toISOString(),
      role: "authenticated",
      session_id: sessionId,
    })],
  );
  await client.unsafe("select set_config('application_name',$1,false)", [applicationName]);
  await client.unsafe("set role authenticated");
}

async function expectDenied(label, action, messagePattern) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must be rejected");
  assert.equal(caught.code, "42501", label + " must use SQLSTATE 42501");
  assert.match(String(caught.message), messagePattern, label + " must reject at the ownership guard");
}

async function seedCustomer({
  organizationId: customerOrganizationId,
  profileId,
  authUserId,
  email,
  codePrefix,
  businessName,
}) {
  await admin.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) " +
      "on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [authUserId, email],
  );
  await admin.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1,$2,$3,$4,$5,true) on conflict(id) do update set " +
      "auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id," +
      "full_name=excluded.full_name,email=excluded.email,is_active=true",
    [profileId, authUserId, customerOrganizationId, businessName, email],
  );
  await admin.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'customer') " +
      "on conflict(profile_id,role) do nothing",
    [profileId],
  );
  const customerCode = codePrefix + "-" + randomUUID().replace(/-/g, "").slice(0, 14);
  const phone = "777" + randomUUID().replace(/-/g, "").slice(0, 7);
  const rows = await admin.unsafe(
    "insert into public.customers(" +
      "organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier," +
      "credit_limit,current_balance,status,approved_at" +
    ") values($1,$2,$3,$4,$5,$6,$7,'retail',100000,0,'approved',now()) returning id",
    [customerOrganizationId, profileId, customerCode, businessName, businessName, phone, email],
  );
  assert.equal(rows.length, 1, "isolated customer fixture must be created once");
  return rows[0].id;
}

async function saveAddress(client, addressId, label, street, isDefault = true) {
  const rows = await client.unsafe(
    "select public.save_customer_address(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::boolean" +
    ") as id",
    [
      addressId,
      label,
      "CI Race Recipient",
      "7771234567",
      street,
      null,
      "Sanaa",
      null,
      null,
      "YE",
      "CI concurrency and tenant isolation",
      isDefault,
    ],
  );
  assert.equal(rows.length, 1, "address RPC must return one result");
  return rows[0].id;
}

async function waitForBothConnectionsToBlock(applicationNames, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await monitor.unsafe(
      "select application_name,state,wait_event_type,wait_event " +
        "from pg_catalog.pg_stat_activity where application_name = any($1::text[])",
      [applicationNames],
    );
    const byName = new Map(rows.map((row) => [row.application_name, row]));
    if (
      applicationNames.every((name) => {
        const row = byName.get(name);
        return row && row.state === "active" && row.wait_event_type === "Lock";
      })
    ) {
      return { observed: true, rows };
    }
    await delay(40);
  }
  const rows = await monitor.unsafe(
    "select application_name,state,wait_event_type,wait_event,query " +
      "from pg_catalog.pg_stat_activity where application_name = any($1::text[])",
    [applicationNames],
  );
  return { observed: false, rows };
}

async function addressSnapshot(addressId) {
  const rows = await admin.unsafe(
    "select id::text as id,organization_id::text as organization_id,customer_id::text as customer_id," +
      "label,recipient_name,phone,address_line1,address_line2,city,region,postal_code,country," +
      "delivery_instructions,is_default,created_at,updated_at " +
      "from public.customer_addresses where id=$1::uuid",
    [addressId],
  );
  return rows;
}

async function addressAuditSnapshot(addressId) {
  const rows = await admin.unsafe(
    "select coalesce(jsonb_agg(jsonb_build_object(" +
      "'action',action,'actor_id',actor_id::text,'old_value',old_value,'new_value',new_value,'created_at',created_at) " +
      "order by created_at,action),'[]'::jsonb) as events " +
      "from public.audit_logs where entity_type='customer_address' and entity_id=$1::uuid",
    [addressId],
  );
  return rows[0].events;
}

async function main() {
  const customerProfileId = randomUUID();
  const customerAuthId = randomUUID();
  const customerEmail = "ci-address-owner-" + randomUUID().slice(0, 8) + "@example.test";
  const customerId = await seedCustomer({
    organizationId,
    profileId: customerProfileId,
    authUserId: customerAuthId,
    email: customerEmail,
    codePrefix: "CI-ADDR-RACE",
    businessName: "CI Customer Address Race",
  });

  const appNames = [
    "ci-address-default-race-a-" + randomUUID().slice(0, 8),
    "ci-address-default-race-b-" + randomUUID().slice(0, 8),
  ];
  await Promise.all(addressClients.map((client, index) =>
    setIdentity(client, customerAuthId, customerEmail, appNames[index]),
  ));

  // Hold the customer's row lock until both independent sessions are blocked
  // inside save_customer_address(). This proves that the race is real rather
  // than two sequential calls that happen to end with one default.
  let lockHeld = false;
  let outcomesPromise;
  try {
    await lockClient.unsafe("begin");
    lockHeld = true;
    const locked = await lockClient.unsafe(
      "select id from public.customers where id=$1::uuid for update",
      [customerId],
    );
    assert.equal(locked.length, 1, "the race fixture's customer row must be locked");

    outcomesPromise = Promise.allSettled(addressClients.map((client, index) =>
      saveAddress(
        client,
        null,
        index === 0 ? "CI Concurrent Default A" : "CI Concurrent Default B",
        index === 0 ? "Race Street A" : "Race Street B",
        true,
      ),
    ));
    const barrier = await waitForBothConnectionsToBlock(appNames);
    await lockClient.unsafe("commit");
    lockHeld = false;
    const outcomes = await outcomesPromise;

    assert.equal(
      barrier.observed,
      true,
      "both independent sessions must be blocked by the customer row lock before release; observed=" +
        JSON.stringify(barrier.rows),
    );
    const succeeded = outcomes.filter((item) => item.status === "fulfilled");
    const rejected = outcomes.filter((item) => item.status === "rejected");
    assert.equal(succeeded.length, 2, "both legitimate default-address saves should succeed");
    assert.equal(rejected.length, 0, "concurrent valid address saves must not fail");
  } catch (error) {
    if (lockHeld) await lockClient.unsafe("rollback").catch(() => {});
    if (outcomesPromise) await outcomesPromise.catch(() => {});
    throw error;
  }

  const addresses = await admin.unsafe(
    "select id::text as id,label,is_default from public.customer_addresses " +
      "where customer_id=$1::uuid and organization_id=$2::uuid order by label,id",
    [customerId, organizationId],
  );
  assert.equal(addresses.length, 2, "the two concurrent address saves must persist exactly two addresses");
  assert.equal(
    addresses.filter((row) => row.is_default).length,
    1,
    "concurrent is_default=true saves must leave exactly one default address",
  );
  const addressIds = addresses.map((row) => row.id);
  const createAudits = await admin.unsafe(
    "select entity_id::text as entity_id,actor_id::text as actor_id,action " +
      "from public.audit_logs where organization_id=$1::uuid and entity_type='customer_address' " +
      "and entity_id=any($2::uuid[]) and action='customer_address.created'",
    [organizationId, addressIds],
  );
  assert.equal(createAudits.length, 2, "each accepted address save must produce exactly one creation audit");
  assert.ok(
    createAudits.every((row) => row.actor_id === customerProfileId),
    "each address audit must be attributed to the authenticated owner profile",
  );

  // Create a separate active customer in tenant B and try to mutate tenant A's
  // default address by UUID. Exact ownership-guard failures and stable snapshots
  // prove the RPC does not leak data or persist unauthorized writes/audit events.
  const otherOrganizationId = randomUUID();
  await admin.unsafe(
    "insert into public.organizations(id,name,is_active) values($1,$2,true)",
    [otherOrganizationId, "CI Address Tenant B " + randomUUID().slice(0, 8)],
  );
  const foreignProfileId = randomUUID();
  const foreignAuthId = randomUUID();
  const foreignEmail = "ci-address-foreign-" + randomUUID().slice(0, 8) + "@example.test";
  await seedCustomer({
    organizationId: otherOrganizationId,
    profileId: foreignProfileId,
    authUserId: foreignAuthId,
    email: foreignEmail,
    codePrefix: "CI-ADDR-FOREIGN",
    businessName: "CI Foreign Address Customer",
  });
  await setIdentity(
    foreignClient,
    foreignAuthId,
    foreignEmail,
    "ci-address-foreign-tenant-" + randomUUID().slice(0, 8),
  );

  const targetAddressId = addresses.find((row) => row.is_default).id;
  assert.equal(
    (await foreignClient.unsafe("select id from public.customer_addresses where id=$1::uuid", [targetAddressId])).length,
    0,
    "tenant B must not read tenant A's customer address",
  );

  const beforeUpdateState = await addressSnapshot(targetAddressId);
  const beforeUpdateAudit = await addressAuditSnapshot(targetAddressId);
  await expectDenied(
    "tenant B cannot update tenant A's address",
    () => saveAddress(foreignClient, targetAddressId, "Foreign overwrite", "Injected cross-tenant street", true),
    /customer address not found or not owned by this account/i,
  );
  assert.deepEqual(await addressSnapshot(targetAddressId), beforeUpdateState,
    "denied cross-tenant address update must preserve every address field");
  assert.deepEqual(await addressAuditSnapshot(targetAddressId), beforeUpdateAudit,
    "denied cross-tenant address update must not add or alter audit events");

  const beforeDeleteState = await addressSnapshot(targetAddressId);
  const beforeDeleteAudit = await addressAuditSnapshot(targetAddressId);
  await expectDenied(
    "tenant B cannot delete tenant A's address",
    () => foreignClient.unsafe("select public.delete_customer_address($1::uuid) as deleted", [targetAddressId]),
    /customer address not found or not owned by this account/i,
  );
  assert.deepEqual(await addressSnapshot(targetAddressId), beforeDeleteState,
    "denied cross-tenant address delete must preserve the target address");
  assert.deepEqual(await addressAuditSnapshot(targetAddressId), beforeDeleteAudit,
    "denied cross-tenant address delete must not add or alter audit events");

  process.stdout.write(
    "PASS customer address acceptance: forced PostgreSQL 17 default-address race leaves exactly one default; cross-tenant read/update/delete is denied with no data or audit side effects\n",
  );
}

try {
  await main();
} catch (error) {
  console.error("CUSTOMER_ADDRESS_CONCURRENCY_ACCEPTANCE_FAILED", error);
  process.exitCode = 1;
} finally {
  await Promise.all([
    admin.end({ timeout: 1 }),
    lockClient.end({ timeout: 1 }),
    monitor.end({ timeout: 1 }),
    ...addressClients.map((client) => client.end({ timeout: 1 })),
    foreignClient.end({ timeout: 1 }),
  ].map((close) => close.catch(() => {})));
}
