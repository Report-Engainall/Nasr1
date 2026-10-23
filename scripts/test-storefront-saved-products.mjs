import assert from "node:assert/strict";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required; run after npm run test:db against the isolated PostgreSQL 17 database.");
}

const organizationId = "a0000000-0000-0000-0000-000000000001";
const staffProfileId = "f0000000-0000-0000-0000-000000000001";
const staffAuthUserId = "33333333-3333-4333-8333-333333333333";
const secondProfileId = "f2222222-2222-4222-8222-222222222222";
const secondAuthUserId = "22222222-2222-4222-8222-222222222222";
const productId = "a1000000-0000-0000-0000-000000000001";
const otherTenantProductId = "a1111111-1111-4111-8111-111111111112";

const admin = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const firstClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const secondClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(client, authUserId, email) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [authUserId, authUserId]);
  await client.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated", session_id: authUserId }),
  ]);
  await client.unsafe("set role authenticated");
}

async function expectDenied(label, action) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " must be denied");
  assert.match(String(caught.message), /permission denied/i, label + " must fail for table privileges");
}

async function savedState(client, productIdToSave, saved) {
  const rows = await client.unsafe(
    "select public.set_storefront_saved_product($1::uuid,$2::boolean) as result",
    [productIdToSave, saved],
  );
  const result = rows[0]?.result;
  assert.ok(result && result.product_id === productIdToSave, "RPC must return the requested product identity");
  assert.equal(result.saved, saved, "RPC must confirm the desired state");
  assert.equal(typeof result.changed, "boolean", "RPC must report whether state changed");
  return result;
}

async function listSaved(client) {
  const rows = await client.unsafe("select public.list_storefront_saved_products() as ids");
  assert.ok(Array.isArray(rows[0]?.ids), "list RPC must return a UUID array");
  return rows[0].ids;
}

async function main() {
  const fixture = await admin.unsafe(
    "select (select organization_id from public.products where id=$1) as product_org, (select organization_id from public.profiles where id=$2 and is_active=true) as staff_org, (select organization_id from public.profiles where id=$3 and is_active=true) as second_org, (select organization_id from public.products where id=$4) as other_product_org",
    [productId, staffProfileId, secondProfileId, otherTenantProductId],
  );
  assert.equal(fixture[0].product_org, organizationId, "primary fixture product must belong to the target tenant");
  assert.equal(fixture[0].staff_org, organizationId, "first actor must have an active tenant profile");
  assert.equal(fixture[0].second_org, organizationId, "second actor must have an active profile in the same tenant");
  assert.notEqual(fixture[0].other_product_org, organizationId, "cross-tenant fixture product must belong to another tenant");

  await setIdentity(firstClient, staffAuthUserId, "admin@aghbari.ye");
  await setIdentity(secondClient, secondAuthUserId, "ci-customer-two@example.test");

  // RPC desired-state commands are idempotent under duplicate requests.
  const added = await savedState(firstClient, productId, true);
  assert.equal(added.changed, true, "first save must create the row");
  const duplicateAdd = await savedState(firstClient, productId, true);
  assert.equal(duplicateAdd.changed, false, "duplicate add must not create another row or duplicate audit event");
  assert.ok((await listSaved(firstClient)).includes(productId), "first actor must read their saved product through the RPC");

  const firstCount = await admin.unsafe(
    "select count(*)::int as count from public.storefront_saved_products where organization_id=$1 and profile_id=$2 and product_id=$3",
    [organizationId, staffProfileId, productId],
  );
  assert.equal(firstCount[0].count, 1, "concurrent/repeated adds must retain exactly one profile/product row");

  // A different customer in the same tenant cannot enumerate the first customer's list.
  assert.ok(!(await listSaved(secondClient)).includes(productId), "saved products must be isolated per profile");
  const secondAdd = await savedState(secondClient, productId, true);
  assert.equal(secondAdd.changed, true, "a second profile may save the same catalog product independently");
  assert.ok((await listSaved(secondClient)).includes(productId), "second actor must read their own save");
  assert.ok((await listSaved(firstClient)).includes(productId), "second actor's save must not alter the first actor's list");

  // Product IDs are never enough to cross a tenant boundary.
  await assert.rejects(
    () => savedState(firstClient, otherTenantProductId, true),
    /Product is not available in this storefront tenant/,
    "save RPC must reject a product from another organization",
  );

  await expectDenied(
    "authenticated direct SELECT on storefront_saved_products",
    () => firstClient.unsafe("select product_id from public.storefront_saved_products"),
  );
  await expectDenied(
    "authenticated direct INSERT on storefront_saved_products",
    () => firstClient.unsafe(
      "insert into public.storefront_saved_products(organization_id,profile_id,product_id) values($1,$2,$3)",
      [organizationId, staffProfileId, otherTenantProductId],
    ),
  );
  await expectDenied(
    "authenticated direct UPDATE on storefront_saved_products",
    () => firstClient.unsafe(
      "update public.storefront_saved_products set product_id=$1 where organization_id=$2 and profile_id=$3",
      [otherTenantProductId, organizationId, staffProfileId],
    ),
  );
  await expectDenied(
    "authenticated direct DELETE on storefront_saved_products",
    () => firstClient.unsafe("delete from public.storefront_saved_products where profile_id=$1", [staffProfileId]),
  );

  const removed = await savedState(firstClient, productId, false);
  assert.equal(removed.changed, true, "first removal must delete the row");
  const duplicateRemove = await savedState(firstClient, productId, false);
  assert.equal(duplicateRemove.changed, false, "repeated removal must be idempotent");
  assert.ok(!(await listSaved(firstClient)).includes(productId), "removed product must disappear from the list RPC");
  assert.ok((await listSaved(secondClient)).includes(productId), "removing the first actor's item must not affect the second actor");

  const audit = await admin.unsafe(
    "select action from public.audit_logs where organization_id=$1 and actor_id=$2 and entity_type='storefront_saved_product' and entity_id=$3 and action in ('storefront.saved_product.added','storefront.saved_product.removed')",
    [organizationId, staffProfileId, productId],
  );
  assert.equal(audit.filter((row) => row.action === "storefront.saved_product.added").length, 1, "only a genuine add is audited");
  assert.equal(audit.filter((row) => row.action === "storefront.saved_product.removed").length, 1, "only a genuine removal is audited");

  process.stdout.write(
    "PASS storefront saved products: profile isolation, tenant isolation, idempotent save/remove, audit trail and direct-table denial\n",
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write("STOREFRONT_SAVED_PRODUCTS_FAILED " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
} finally {
  for (const client of [firstClient, secondClient]) {
    try { await client.unsafe("reset role"); } catch { /* connection may already be aborted */ }
  }
  try {
    await admin.unsafe(
      "delete from public.storefront_saved_products where organization_id=$1 and profile_id=any($2::uuid[]) and product_id=$3",
      [organizationId, [staffProfileId, secondProfileId], productId],
    );
    await admin.unsafe(
      "delete from public.audit_logs where organization_id=$1 and entity_type='storefront_saved_product' and entity_id=$2 and actor_id=any($3::uuid[])",
      [organizationId, productId, [staffProfileId, secondProfileId]],
    );
  } catch (error) {
    process.stderr.write("STOREFRONT_SAVED_PRODUCTS_CLEANUP_FAILED " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  }
  await Promise.all([admin.end(), firstClient.end(), secondClient.end()]);
}
