import assert from "node:assert/strict";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required; run after npm run test:db against the isolated PostgreSQL 17 database.");
}

const organizationId = "a0000000-0000-0000-0000-000000000001";
const customerOneProfileId = "f1111111-1111-4111-8111-111111111111";
const customerOneAuthId = "11111111-1111-4111-8111-111111111111";
const customerTwoProfileId = "f2222222-2222-4222-8222-222222222222";
const customerTwoAuthId = "22222222-2222-4222-8222-222222222222";
const staffProfileId = "f0000000-0000-0000-0000-000000000001";
const staffAuthId = "33333333-3333-4333-8333-333333333333";
const productId = "a1000000-0000-0000-0000-000000000001";
const otherTenantProductId = "a1111111-1111-4111-8111-111111111112";

const admin = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const first = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const firstConcurrent = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const second = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const staff = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(client, authUserId, email) {
  await client.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated" }),
  ]);
  await client.unsafe("set role authenticated");
}

async function getCart(client) {
  const rows = await client.unsafe("select public.get_customer_cart() as result");
  const result = rows[0]?.result;
  assert.ok(result && Array.isArray(result.items), "customer cart read RPC must return a JSON array of items");
  return result;
}

async function syncCart(client, items) {
  const rows = await client.unsafe("select public.sync_customer_cart($1::jsonb) as result", [client.json(items)]);
  const result = rows[0]?.result;
  assert.ok(result && Array.isArray(result.items), "customer cart sync RPC must return normalized persisted items");
  return result;
}

async function expectDenied(label, action) {
  await assert.rejects(action, /permission denied/i, label + " must be denied for authenticated direct table access");
}

async function main() {
  const fixtures = await admin.unsafe(
    "select (select organization_id from public.profiles where id=$1 and is_active=true) as customer_one_org, (select organization_id from public.profiles where id=$2 and is_active=true) as customer_two_org, (select organization_id from public.profiles where id=$3 and is_active=true) as staff_org, (select organization_id from public.products where id=$4 and status='active') as product_org, (select organization_id from public.products where id=$5 and status='active') as other_product_org",
    [customerOneProfileId, customerTwoProfileId, staffProfileId, productId, otherTenantProductId],
  );
  assert.equal(fixtures[0].customer_one_org, organizationId, "first customer fixture must be active in the target tenant");
  assert.equal(fixtures[0].customer_two_org, organizationId, "second customer fixture must be active in the same tenant");
  assert.equal(fixtures[0].product_org, organizationId, "cart product must belong to the target tenant");
  assert.notEqual(fixtures[0].other_product_org, organizationId, "cross-tenant product fixture must be outside the target tenant");

  await admin.unsafe("delete from public.customer_cart_items where organization_id=$1 and cart_id in (select id from public.customer_carts where profile_id=any($2::uuid[]))", [
    organizationId, [customerOneProfileId, customerTwoProfileId],
  ]);
  await admin.unsafe("delete from public.customer_carts where organization_id=$1 and profile_id=any($2::uuid[])", [
    organizationId, [customerOneProfileId, customerTwoProfileId],
  ]);

  await setIdentity(first, customerOneAuthId, "ci-customer-one@example.test");
  await setIdentity(firstConcurrent, customerOneAuthId, "ci-customer-one@example.test");
  await setIdentity(second, customerTwoAuthId, "ci-customer-two@example.test");
  await setIdentity(staff, staffAuthId, "admin@aghbari.ye");

  const firstSnapshot = await syncCart(first, [{ product_id: productId, quantity: 2 }]);
  assert.deepEqual(firstSnapshot.items, [{ product_id: productId, quantity: 2 }], "first sync persists the requested customer line");
  await syncCart(first, [{ product_id: productId, quantity: 2 }]);
  assert.equal((await admin.unsafe(
    "select count(*)::int as count from public.customer_cart_items i join public.customer_carts c on c.id=i.cart_id where c.organization_id=$1 and c.profile_id=$2 and i.product_id=$3",
    [organizationId, customerOneProfileId, productId],
  ))[0].count, 1, "replaying the same cart state must not duplicate lines");

  assert.deepEqual((await getCart(second)).items, [], "another customer in the same organization must not see this profile's cart");
  await syncCart(second, [{ product_id: productId, quantity: 1 }]);
  assert.deepEqual((await getCart(second)).items, [{ product_id: productId, quantity: 1 }], "second customer can maintain an independent cart");
  assert.deepEqual((await getCart(first)).items, [{ product_id: productId, quantity: 2 }], "the second customer's cart must not mutate the first");

  await assert.rejects(
    () => syncCart(first, [{ product_id: otherTenantProductId, quantity: 1 }]),
    /Product is not available in this storefront tenant/,
    "cross-tenant products must be rejected",
  );
  assert.deepEqual((await getCart(first)).items, [{ product_id: productId, quantity: 2 }], "failed sync must roll back without deleting previous cart state");

  await assert.rejects(
    () => syncCart(first, [{ product_id: productId, quantity: 1 }, { product_id: productId, quantity: 2 }]),
    /duplicate product lines/i,
    "duplicate products must be rejected before modifying the stored cart",
  );
  assert.deepEqual((await getCart(first)).items, [{ product_id: productId, quantity: 2 }], "invalid cart payload must preserve the previously committed cart");

  await Promise.all([
    syncCart(first, [{ product_id: productId, quantity: 3 }]),
    syncCart(firstConcurrent, [{ product_id: productId, quantity: 4 }]),
  ]);
  const concurrent = await getCart(first);
  assert.equal(concurrent.items.length, 1, "parallel same-profile syncs must not create duplicate cart rows");
  assert.ok([3, 4].includes(concurrent.items[0].quantity), "one complete submitted line set must win; mixed state is forbidden");

  await assert.rejects(
    () => syncCart(staff, [{ product_id: productId, quantity: 1 }]),
    /active customer profile required/i,
    "staff must not write a customer cart using a staff session",
  );

  await expectDenied("authenticated direct SELECT on customer_carts", () => first.unsafe("select id from public.customer_carts"));
  await expectDenied("authenticated direct SELECT on customer_cart_items", () => first.unsafe("select product_id from public.customer_cart_items"));
  await expectDenied("authenticated direct INSERT on customer_cart_items", () => first.unsafe(
    "insert into public.customer_cart_items(organization_id,cart_id,product_id,quantity) select $1,c.id,$2,1 from public.customer_carts c where c.profile_id=$3",
    [organizationId, productId, customerOneProfileId],
  ));
  await expectDenied("authenticated direct UPDATE on customer_cart_items", () => first.unsafe(
    "update public.customer_cart_items set quantity=7 where product_id=$1",
    [productId],
  ));
  await expectDenied("authenticated direct DELETE on customer_cart_items", () => first.unsafe(
    "delete from public.customer_cart_items where product_id=$1",
    [productId],
  ));

  await syncCart(first, []);
  assert.deepEqual((await getCart(first)).items, [], "empty sync must clear the cart");
  process.stdout.write("PASS persistent customer cart: profile/tenant isolation, replay idempotency, concurrency serialization, atomic validation rollback, RPC-only privileges and clear\n");
}

try {
  await main();
} catch (error) {
  process.stderr.write("CUSTOMER_CART_PERSISTENCE_FAILED " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
} finally {
  for (const client of [first, firstConcurrent, second, staff]) {
    try { await client.unsafe("reset role"); } catch { /* connection may already be aborted */ }
  }
  try {
    await admin.unsafe(
      "delete from public.customer_cart_items where organization_id=$1 and cart_id in (select id from public.customer_carts where profile_id=any($2::uuid[]))",
      [organizationId, [customerOneProfileId, customerTwoProfileId]],
    );
    await admin.unsafe(
      "delete from public.customer_carts where organization_id=$1 and profile_id=any($2::uuid[])",
      [organizationId, [customerOneProfileId, customerTwoProfileId]],
    );
  } catch (error) {
    process.stderr.write("CUSTOMER_CART_PERSISTENCE_CLEANUP_FAILED " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  }
  await Promise.all([admin.end(), first.end(), firstConcurrent.end(), second.end(), staff.end()]);
}
