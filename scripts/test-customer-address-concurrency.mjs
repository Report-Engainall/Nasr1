import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for customer/member revocation concurrency acceptance.");
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
const orderClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const reorderClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const quoteClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const quoteLockClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
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

async function saveCompanyContact(client, contactId, fullName, phone, email, isPrimary = false) {
  const rows = await client.unsafe(
    "select public.save_customer_company_contact(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean" +
    ") as id",
    [contactId, fullName, "CI Revocation Test", "Operations", phone, email, isPrimary],
  );
  assert.equal(rows.length, 1, "company contact RPC must return one result");
  return rows[0].id;
}

async function attemptMemberOrderInsert(client, organizationId, customerId, profileId) {
  const rows = await client.unsafe(
    "select public.ci_insert_customer_order_for_revocation_test($1::uuid,$2::uuid,$3::uuid) as id",
    [organizationId, customerId, profileId],
  );
  assert.equal(rows.length, 1, "test order command must return one row when the guard allows it");
  return rows[0].id;
}

async function attemptMemberReorderTemplateInsert(client, organizationId, customerId) {
  const rows = await client.unsafe(
    "select public.ci_insert_customer_reorder_template_for_revocation_test($1::uuid,$2::uuid) as id",
    [organizationId, customerId],
  );
  assert.equal(rows.length, 1, "test reorder-template command must return one row when the guard allows it");
  return rows[0].id;
}

async function waitForConnectionsToBlock(applicationNames, timeoutMs = 10000) {
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
    const barrier = await waitForConnectionsToBlock(appNames);
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

  // A member RPC can pass its early capability check, wait for the customer's
  // row lock, and then resume after the owner commits a membership revocation.
  // Exercise both address and company-contact writes in separate sessions so the
  // PostgreSQL 17 lock barrier proves this is a real in-flight race, not sequential
  // authorization after the membership has already been revoked.
  const memberProfileId = randomUUID();
  const memberAuthUserId = randomUUID();
  const memberEmail = "ci-address-revoked-member-" + randomUUID().slice(0, 8) + "@example.test";
  await admin.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) " +
      "on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [memberAuthUserId, memberEmail],
  );
  await admin.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1,$2,$3,$4,$5,true) on conflict(id) do update set " +
      "auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id," +
      "full_name=excluded.full_name,email=excluded.email,is_active=true",
    [memberProfileId, memberAuthUserId, organizationId, "CI Revoked Member", memberEmail],
  );
  await admin.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'customer') " +
      "on conflict(profile_id,role) do nothing",
    [memberProfileId],
  );

  await setIdentity(addressClients[0], customerAuthId, customerEmail,
    "ci-revoke-owner-" + randomUUID().slice(0, 8));
  const memberInvite = (await addressClients[0].unsafe(
    "select public.create_customer_company_invitation($1::text,$2::text) as result",
    [memberEmail, "buyer"],
  ))[0].result;
  assert.match(memberInvite.invitation_token, /^[0-9a-f]{64}$/i,
    "the owner-issued membership token must be well formed");

  const memberAddressApp = "ci-revoke-address-" + randomUUID().slice(0, 8);
  const memberContactApp = "ci-revoke-contact-" + randomUUID().slice(0, 8);
  const memberOrderApp = "ci-revoke-order-" + randomUUID().slice(0, 8);
  const memberReorderApp = "ci-revoke-reorder-" + randomUUID().slice(0, 8);
  const memberQuoteApp = "ci-revoke-quote-" + randomUUID().slice(0, 8);
  const memberQuoteLockApp = "ci-revoke-quote-lock-" + randomUUID().slice(0, 8);
  await Promise.all([
    setIdentity(addressClients[1], memberAuthUserId, memberEmail, memberAddressApp),
    setIdentity(foreignClient, memberAuthUserId, memberEmail, memberContactApp),
    setIdentity(orderClient, memberAuthUserId, memberEmail, memberOrderApp),
    setIdentity(reorderClient, memberAuthUserId, memberEmail, memberReorderApp),
    setIdentity(quoteClient, memberAuthUserId, memberEmail, memberQuoteApp),
    quoteLockClient.unsafe("select set_config($1,$2,false)", ["application_name", memberQuoteLockApp]),
  ]);
  const acceptedMembership = (await addressClients[1].unsafe(
    "select public.accept_customer_company_invitation($1::text) as result",
    [memberInvite.invitation_token],
  ))[0].result;
  assert.equal(acceptedMembership.customer_id, customerId,
    "member acceptance must be scoped to the owning customer");
  assert.equal(acceptedMembership.member_role, "buyer");
  const preRevocationCapabilities = (await addressClients[1].unsafe(
    "select public.current_customer_can('addresses.manage') as can_address, " +
      "public.current_customer_can('contacts.manage') as can_contact, " +
      "public.current_customer_can('reorder.manage') as can_reorder",
  ))[0];
  assert.equal(preRevocationCapabilities.can_address, true,
    "buyer membership may create addresses before revocation");
  assert.equal(preRevocationCapabilities.can_contact, true,
    "buyer membership may create company contacts before revocation");
  assert.equal(preRevocationCapabilities.can_reorder, true,
    "buyer membership may create reorder templates before revocation");

  const quoteId = (await admin.unsafe(
    "insert into public.sales_quotes(organization_id,customer_id,quote_number,status,notes,created_by,quoted_at,valid_until) " +
      "values($1::uuid,$2::uuid,$3,'quoted','CI member revocation race',$4::uuid,now(),now()+interval '7 days') returning id",
    [organizationId, customerId, "CI-Q-" + randomUUID().slice(0, 8), customerProfileId],
  ))[0].id;

  const beforeRevocationMutations = (await admin.unsafe(
    "select " +
      "(select count(*)::integer from public.customer_addresses where organization_id=$1::uuid and customer_id=$2::uuid) as addresses, " +
      "(select count(*)::integer from public.customer_company_contacts where organization_id=$1::uuid and customer_id=$2::uuid) as contacts, " +
      "(select count(*)::integer from public.orders where organization_id=$1::uuid and customer_id=$2::uuid and created_by=$3::uuid) as orders, " +
      "(select count(*)::integer from public.reorder_templates where organization_id=$1::uuid and customer_id=$2::uuid) as reorder_templates, " +
      "(select count(*)::integer from public.reorder_template_items i join public.reorder_templates r on r.id=i.template_id and r.organization_id=i.organization_id where r.organization_id=$1::uuid and r.customer_id=$2::uuid) as reorder_template_items, " +
      "(select status from public.sales_quotes where id=$4::uuid) as quote_status, " +
      "(select count(*)::integer from public.audit_logs where organization_id=$1::uuid and actor_id=$3::uuid " +
        "and entity_type in ('customer_address','customer_company_contact','order','reorder_template')) as member_mutation_audits, " +
      "(select count(*)::integer from public.audit_logs where organization_id=$1::uuid and entity_id=$4::uuid) as quote_audits",
    [organizationId, customerId, memberProfileId, quoteId],
  ))[0];

  // Test-only SECURITY DEFINER command models the order INSERT boundary without a product fixture.
  // It preserves authenticated JWT claims; the production AFTER INSERT trigger must still reject it.
  await admin.unsafe(String.raw`
    CREATE OR REPLACE FUNCTION public.ci_insert_customer_order_for_revocation_test(
      p_organization_id uuid, p_customer_id uuid, p_profile_id uuid
    ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
    DECLARE v_id uuid;
    BEGIN
      INSERT INTO public.orders(
        organization_id, customer_id, order_number, status, notes, created_by,
        payment_terms, business_name_snapshot, contact_name_snapshot, phone_snapshot,
        idempotency_key, idempotency_payload_hash
      ) VALUES (
        p_organization_id, p_customer_id,
        'ORD-CI-' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,16),
        'pending', 'test-only revocation race', p_profile_id, 'cash_on_delivery',
        'CI company member', 'CI revoked member', '7777654321',
        'ci-revoke-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),
        pg_catalog.md5(pg_catalog.gen_random_uuid()::text)
      ) RETURNING id INTO v_id;
      RETURN v_id;
    END;
    $function$;
    GRANT EXECUTE ON FUNCTION public.ci_insert_customer_order_for_revocation_test(uuid,uuid,uuid) TO authenticated;

    CREATE OR REPLACE FUNCTION public.ci_insert_customer_reorder_template_for_revocation_test(
      p_organization_id uuid, p_customer_id uuid
    ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
    DECLARE v_id uuid;
    BEGIN
      INSERT INTO public.reorder_templates(organization_id,customer_id,name,source_order_id)
      VALUES (
        p_organization_id,
        p_customer_id,
        'CI revoked member template ' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,12),
        NULL
      ) RETURNING id INTO v_id;
      RETURN v_id;
    END;
    $function$;
    GRANT EXECUTE ON FUNCTION public.ci_insert_customer_reorder_template_for_revocation_test(uuid,uuid) TO authenticated;
  `);

  let quoteLockOpen = false;
  let revocationTxOpen = false;
  let pendingMemberWrites;
  try {
    await quoteLockClient.unsafe("begin");
    quoteLockOpen = true;
    await quoteLockClient.unsafe("select id from public.sales_quotes where id=$1::uuid for update", [quoteId]);
    await addressClients[0].unsafe("begin");
    revocationTxOpen = true;
    const revoked = await addressClients[0].unsafe(
      "select public.revoke_customer_company_member($1::uuid) as result",
      [memberProfileId],
    );
    assert.equal(revoked[0].result, true,
      "the owner revocation should be pending but uncommitted while the member requests wait");

    pendingMemberWrites = Promise.allSettled([
      saveAddress(addressClients[1], null, "CI Revoked In-flight Address",
        "Denied after revocation", false),
      saveCompanyContact(foreignClient, null, "CI Revoked In-flight Contact",
        "7777654321", memberEmail, false),
      attemptMemberOrderInsert(orderClient, organizationId, customerId, memberProfileId),
      attemptMemberReorderTemplateInsert(reorderClient, organizationId, customerId),
      quoteClient.unsafe("select public.customer_respond_to_quote($1::uuid,true)", [quoteId]),
    ]);
    const barrier = await waitForConnectionsToBlock([memberAddressApp, memberContactApp, memberOrderApp, memberReorderApp, memberQuoteApp]);
    await addressClients[0].unsafe("commit");
    revocationTxOpen = false;
    await quoteLockClient.unsafe("commit");
    quoteLockOpen = false;
    const outcomes = await pendingMemberWrites;

    assert.equal(
      barrier.observed,
      true,
      "address, contact, order and quote requests must all be blocked at their row-lock barriers before revocation commits; observed=" +
        JSON.stringify(barrier.rows),
    );
    for (const [index, outcome] of outcomes.entries()) {
      const label = ["address mutation", "company-contact mutation", "order insertion", "reorder-template insertion", "quote response"][index];
      assert.equal(outcome.status, "rejected",
        label + " must be denied when membership revocation commits while it is waiting");
      assert.equal(outcome.reason.code, "42501", label + " must fail with authorization SQLSTATE 42501");
      assert.match(String(outcome.reason.message),
        index === 2
          ? /company membership is no longer active or lacks order capability/i
          : index === 3
            ? /company membership is no longer active or lacks reorder capability/i
            : index === 4
              ? /company membership is no longer active or lacks quote capability/i
              : /company membership is no longer active or lacks mutation capability/i,
        label + " must be denied by the write-boundary membership guard");
    }
  } catch (error) {
    if (revocationTxOpen) await addressClients[0].unsafe("rollback").catch(() => {});
    if (quoteLockOpen) await quoteLockClient.unsafe("rollback").catch(() => {});
    if (pendingMemberWrites) await pendingMemberWrites.catch(() => {});
    throw error;
  }

  const afterRevocationMutations = (await admin.unsafe(
    "select " +
      "(select count(*)::integer from public.customer_addresses where organization_id=$1::uuid and customer_id=$2::uuid) as addresses, " +
      "(select count(*)::integer from public.customer_company_contacts where organization_id=$1::uuid and customer_id=$2::uuid) as contacts, " +
      "(select count(*)::integer from public.orders where organization_id=$1::uuid and customer_id=$2::uuid and created_by=$3::uuid) as orders, " +
      "(select count(*)::integer from public.reorder_templates where organization_id=$1::uuid and customer_id=$2::uuid) as reorder_templates, " +
      "(select count(*)::integer from public.reorder_template_items i join public.reorder_templates r on r.id=i.template_id and r.organization_id=i.organization_id where r.organization_id=$1::uuid and r.customer_id=$2::uuid) as reorder_template_items, " +
      "(select status from public.sales_quotes where id=$4::uuid) as quote_status, " +
      "(select count(*)::integer from public.audit_logs where organization_id=$1::uuid and actor_id=$3::uuid " +
        "and entity_type in ('customer_address','customer_company_contact','order','reorder_template')) as member_mutation_audits, " +
      "(select count(*)::integer from public.audit_logs where organization_id=$1::uuid and entity_id=$4::uuid) as quote_audits",
    [organizationId, customerId, memberProfileId, quoteId],
  ))[0];
  assert.deepEqual(afterRevocationMutations, beforeRevocationMutations,
    "revoked in-flight address/contact/order/reorder/quote writes must leave rows and member mutation audit unchanged");

  const membershipState = (await admin.unsafe(
    "select m.status, count(a.id)::integer as revoke_audit_count " +
      "from public.customer_company_memberships m " +
      "left join public.audit_logs a on a.organization_id=m.organization_id " +
        "and a.entity_type='customer_company_membership' and a.entity_id=m.id " +
        "and a.action='customer_company_member.revoked' and a.actor_id=$3::uuid " +
      "where m.organization_id=$1::uuid and m.customer_id=$2::uuid and m.profile_id=$4::uuid " +
      "group by m.status",
    [organizationId, customerId, customerProfileId, memberProfileId],
  ))[0];
  assert.equal(membershipState.status, "revoked", "owner revocation must commit after the wait barrier");
  assert.equal(membershipState.revoke_audit_count, 1, "owner revocation must have exactly one audit record");

  const revokedScope = (await addressClients[1].unsafe(
    "select public.current_customer_id() as customer_id, " +
      "public.current_customer_can('addresses.manage') as can_address, " +
      "public.current_customer_can('contacts.manage') as can_contact, " +
      "public.current_customer_can('reorder.manage') as can_reorder",
  ))[0];
  assert.equal(revokedScope.customer_id, null);
  assert.equal(revokedScope.can_address, false);
  assert.equal(revokedScope.can_contact, false);
  assert.equal(revokedScope.can_reorder, false);

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
    "PASS customer/company-member revocation acceptance: address, contact, order, reorder-template and quote writes are denied after the forced PostgreSQL 17 revocation lock barrier; no rows or mutation audits change; cross-tenant address read/update/delete is denied\n",
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
    orderClient.end({ timeout: 1 }),
    reorderClient.end({ timeout: 1 }),
    quoteClient.end({ timeout: 1 }),
    quoteLockClient.end({ timeout: 1 }),
  ].map((close) => close.catch(() => {})));
}
