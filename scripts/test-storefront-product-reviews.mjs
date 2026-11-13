import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

const connectionString = requiredEnv("TEST_DATABASE_URL");
validateCashExpenseEndpoints(requiredEnv("E2E_SUPABASE_URL"), connectionString);

const organizationId = "a0000000-0000-0000-0000-000000000001";
const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
const productId = "a1000000-0000-0000-0000-000000000001";
const deliveredOrderId = requiredEnv("E2E_RETURN_ORDER_ID");
const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
const foreignCustomerEmail = requiredEnv("E2E_EMAIL_B").toLowerCase();
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local product-review acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) { return typeof value === "string" ? JSON.parse(value) : value; }
async function rpcJson(sql, args = []) { return asJson((await db.unsafe(sql, args))[0].result); }
async function expectFailure(label, action, pattern) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should fail");
  if (pattern) assert.match(String(caught.message), pattern, label + " should fail for the expected reason");
  return caught;
}
async function findProfile(email, tenantId) {
  const rows = await db.unsafe(
    "select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true limit 1",
    [tenantId, email],
  );
  assert.equal(rows.length, 1, "expected one active local profile for " + email);
  return rows[0];
}
async function setIdentity(profile) {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1::uuid,$1::uuid,now(),now(),now(),null,'CI isolated product-review acceptance','127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [profile.auth_user_id],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [profile.auth_user_id]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: profile.auth_user_id, email: profile.email, role: "authenticated", session_id: profile.auth_user_id }),
  ]);
  await db.unsafe("set role authenticated");
}
async function setAnonymous() {
  await db.unsafe("reset role");
  await db.unsafe("select set_config('request.jwt.claim.sub','',false)");
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "anon" })]);
  await db.unsafe("set role anon");
}
async function publicSummary() {
  return rpcJson(
    "select public.get_storefront_product_reviews($1::uuid,$2::integer,$3::integer) as result",
    [productId, 8, 0],
  );
}
async function moderationQueue(limit = 50) {
  return rpcJson("select public.list_pending_storefront_product_reviews($1::integer) as result", [limit]);
}
async function submit(profile, orderItemId, rating, body) {
  await setIdentity(profile);
  return rpcJson(
    "select public.submit_storefront_product_review($1::uuid,$2::uuid,$3::smallint,$4::text,$5::text) as result",
    [productId, orderItemId, rating, "P2 review acceptance", body],
  );
}
async function moderate(profile, reviewId, decision, note = "") {
  await setIdentity(profile);
  return rpcJson(
    "select public.moderate_storefront_product_review($1::uuid,$2::text,$3::text) as result",
    [reviewId, decision, note],
  );
}

async function main() {
  const customer = await findProfile(customerEmail, organizationId);
  const foreignCustomer = await findProfile(foreignCustomerEmail, foreignOrganizationId);
  const manager = await findProfile(managerEmail, organizationId);

  const deliveredOrderRows = await db.unsafe(
    "select id,customer_id,status,organization_id,order_number from public.orders " +
    "where id=$1::uuid and organization_id=$2::uuid and status='delivered'",
    [deliveredOrderId, organizationId],
  );
  assert.equal(deliveredOrderRows.length, 1, "seeded review source must be a delivered order in tenant A");

  const deliveredLines = await db.unsafe(
    "select id,product_id from public.order_items where order_id=$1::uuid and product_id=$2::uuid order by id limit 1",
    [deliveredOrderId, productId],
  );
  assert.equal(deliveredLines.length, 1, "seeded delivered order contains the target product");
  const deliveredOrderItemId = deliveredLines[0].id;

  // Create an undelivered line for the same customer/product. The RPC must reject
  // it even though the product and line exist and belong to the correct tenant.
  const pendingOrderId = randomUUID();
  const pendingOrderNumber = "P2-REVIEW-" + randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const pendingLine = await db.unsafe(
    "insert into public.orders(id,organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) " +
    "values($1::uuid,$2::uuid,$3::uuid,$4,'pending',10,1,'Local-only product review eligibility fixture',$5::uuid) returning id",
    [pendingOrderId, organizationId, deliveredOrderRows[0].customer_id, pendingOrderNumber, customer.id],
  );
  const pendingOrderItemRows = await db.unsafe(
    "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity,unit_price_snapshot,discount_snapshot,line_total) " +
    "values($1::uuid,$2::uuid,'P2-REVIEW-001','P2 verified review fixture','piece',1,1,1,10,0,10) returning id",
    [pendingOrderId, productId],
  );
  assert.equal(pendingLine.length, 1);
  assert.equal(pendingOrderItemRows.length, 1);
  const pendingOrderItemId = pendingOrderItemRows[0].id;

  // No old test review may be present because each P2 run uses a fresh local database.
  const existing = await db.unsafe(
    "select id from public.storefront_product_reviews where organization_id=$1::uuid and customer_id=(select id from public.customers where organization_id=$1::uuid and profile_id=$2::uuid and status='approved' limit 1) and product_id=$3::uuid",
    [organizationId, customer.id, productId],
  );
  assert.equal(existing.length, 0, "fresh local database starts without product reviews");

  await setIdentity(customer);
  const context = await rpcJson(
    "select public.get_customer_product_review_context($1::uuid) as result",
    [productId],
  );
  assert.equal(context.eligible, true, "customer with a delivered matching order is eligible");
  assert.match(context.order_item_id ?? "", /^[0-9a-f-]{36}$/i, "server returns one eligible delivered order line");
  const eligibleLineRows = await db.unsafe(
    "select oi.id,o.id as order_id from public.order_items oi join public.orders o on o.id=oi.order_id " +
    "where oi.id=$1::uuid and oi.product_id=$2::uuid and o.customer_id=$3::uuid " +
    "and o.organization_id=$4::uuid and o.status='delivered'",
    [context.order_item_id, productId, deliveredOrderRows[0].customer_id, organizationId],
  );
  assert.equal(eligibleLineRows.length, 1, "server-selected eligibility line belongs to this customer, product, tenant and a delivered order");
  const eligibleOrderItemId = context.order_item_id;
  assert.equal(context.review, null);

  await expectFailure(
    "authenticated customer cannot read review table directly",
    () => db.unsafe("select id from public.storefront_product_reviews limit 1"),
    /permission denied|does not have permission/i,
  );
  await expectFailure(
    "pending order line is not proof of a delivered purchase",
    () => rpcJson(
      "select public.submit_storefront_product_review($1::uuid,$2::uuid,$3::smallint,$4::text,$5::text) as result",
      [productId, pendingOrderItemId, 5, "P2 review acceptance", "هذه مراجعة اختبار للطلب غير المسلّم"],
    ),
    /delivered order/i,
  );

  const submitted = await rpcJson(
    "select public.submit_storefront_product_review($1::uuid,$2::uuid,$3::smallint,$4::text,$5::text) as result",
    [productId, eligibleOrderItemId, 5, "P2 review acceptance", "تجربة شراء موثقة من بيئة الاختبار المحلية"],
  );
  assert.match(submitted.id, /^[0-9a-f-]{36}$/i);
  assert.equal(submitted.moderation_status, "pending");
  const reviewId = submitted.id;

  await setAnonymous();
  let summary = await publicSummary();
  assert.equal(summary.review_count, 0, "anonymous storefront cannot see a pending review");
  assert.deepEqual(summary.items, [], "pending review is excluded from the public list");
  await expectFailure(
    "anonymous visitor cannot read review table directly",
    () => db.unsafe("select id from public.storefront_product_reviews limit 1"),
    /permission denied|does not have permission/i,
  );

  await setIdentity(foreignCustomer);
  await expectFailure(
    "customer from another tenant cannot use tenant A purchase evidence",
    () => rpcJson(
      "select public.submit_storefront_product_review($1::uuid,$2::uuid,$3::smallint,$4::text,$5::text) as result",
      [productId, eligibleOrderItemId, 4, "Cross-tenant attempt", "محاولة من حساب عميل في منشأة أخرى"],
    ),
    /not available|organization/i,
  );
  await expectFailure(
    "foreign customer cannot fetch a product-review context for another tenant product",
    () => rpcJson("select public.get_customer_product_review_context($1::uuid) as result", [productId]),
    /not available|organization/i,
  );

  await setIdentity(manager);
  const pending = await moderationQueue();
  assert.equal(pending.length, 1, "manager sees the one pending review in the active tenant");
  assert.equal(pending[0].id, reviewId);
  assert.equal(pending[0].order_number, deliveredOrderRows[0].order_number);
  for (const privateField of ["organization_id", "customer_id", "profile_id", "email", "phone", "order_id", "order_item_id", "moderator_profile_id"]) {
    assert.equal(privateField in pending[0], false, "moderation queue omits private field " + privateField);
  }

  await setIdentity(customer);
  await expectFailure(
    "ordinary customer cannot read the moderation queue",
    () => moderationQueue(),
    /Administrator or manager permission/i,
  );
  await expectFailure(
    "rejecting a review requires a reason",
    () => moderate(manager, reviewId, "reject", ""),
    /reason|required/i,
  );

  const rejected = await moderate(manager, reviewId, "reject", "العبارة لا تتعلق بالمنتج");
  assert.equal(rejected.moderation_status, "rejected");
  await setIdentity(customer);
  const rejectedContext = await rpcJson(
    "select public.get_customer_product_review_context($1::uuid) as result",
    [productId],
  );
  assert.equal(rejectedContext.review.moderation_status, "rejected");
  assert.equal(rejectedContext.review.moderation_note, "العبارة لا تتعلق بالمنتج");

  const resubmitted = await rpcJson(
    "select public.submit_storefront_product_review($1::uuid,$2::uuid,$3::smallint,$4::text,$5::text) as result",
    [productId, eligibleOrderItemId, 4, "P2 review acceptance revised", "بعد مراجعة الملاحظات أرسل تجربة الشراء مرة أخرى"],
  );
  assert.equal(resubmitted.id, reviewId, "resubmission updates one customer/product row instead of creating a duplicate");
  assert.equal(resubmitted.moderation_status, "pending");

  await setIdentity(manager);
  const managerQueue = await moderationQueue();
  assert.equal(managerQueue.length, 1, "resubmitted review returns to the pending queue");
  assert.equal(managerQueue[0].rating, 4);
  const approved = await moderate(manager, reviewId, "approve");
  assert.equal(approved.moderation_status, "approved");

  await setAnonymous();
  summary = await publicSummary();
  assert.equal(summary.review_count, 1, "only approved reviews contribute to the public count");
  assert.equal(Number(summary.average_rating), 4, "public average is calculated from approved source rows only");
  assert.equal(summary.items.length, 1);
  assert.equal(summary.items[0].id, reviewId);
  assert.equal(summary.items[0].verified_purchase, true);
  for (const privateField of ["organization_id", "customer_id", "profile_id", "email", "phone", "order_id", "order_item_id", "moderator_profile_id"]) {
    assert.equal(privateField in summary.items[0], false, "public review omits private field " + privateField);
  }

  await submit(customer, eligibleOrderItemId, 3, "تعديل لاحق للتقييم يعيد المراجعة قبل النشر");
  await setAnonymous();
  summary = await publicSummary();
  assert.equal(summary.review_count, 0, "editing an approved review removes it from the public aggregate until re-approved");

  // Return the single pooled connection to its owner role before privileged fixture/audit inspection.
  // Public anon/authenticated denial was already asserted above and remains unchanged.
  await db.unsafe("reset role");
  await db.unsafe("reset role");
  const reviewRows = await db.unsafe(
    "select id,moderation_status,rating,moderator_profile_id,moderated_at from public.storefront_product_reviews " +
    "where organization_id=$1::uuid and product_id=$2::uuid and customer_id=(select id from public.customers where organization_id=$1::uuid and profile_id=$3::uuid and status='approved' limit 1)",
    [organizationId, productId, customer.id],
  );
  assert.equal(reviewRows.length, 1, "unique customer/product constraint prevents duplicate reviews");
  assert.equal(reviewRows[0].moderation_status, "pending");

  const auditRows = await db.unsafe(
    "select action,actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='storefront_product_review' and entity_id=$2::uuid order by created_at",
    [organizationId, reviewId],
  );
  assert.equal(auditRows.length, 4, "submit, reject, resubmit, and edit-after-approval are all audited");
  assert.deepEqual(auditRows.map((row) => row.action), [
    "storefront.product_review.submitted",
    "storefront.product_review.moderated",
    "storefront.product_review.resubmitted",
    "storefront.product_review.resubmitted",
  ]);
  assert.ok(auditRows.every((row) => row.actor_id), "every review action is attributed to an organization profile");

  await db.unsafe("reset role");
  await db.unsafe("delete from public.orders where id=$1::uuid", [pendingOrderId]);
  process.stdout.write(
    "STOREFRONT_PRODUCT_REVIEWS_ACCEPTED: delivered-purchase gate, non-delivered denial, cross-tenant denial, " +
    "direct-table denial, pending-publication isolation, manager-only moderation, reject/resubmit/re-approval, " +
    "one-review-per-customer-product, public aggregate privacy, and immutable actor-attributed audit verified locally.\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("STOREFRONT_PRODUCT_REVIEW_ACCEPTANCE_FAILED: " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });
