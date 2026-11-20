import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local product-question acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) { return typeof value === "string" ? JSON.parse(value) : value; }
const connectionString = requiredEnv("TEST_DATABASE_URL");
validateCashExpenseEndpoints(requiredEnv("E2E_SUPABASE_URL"), connectionString);
const organizationId = "a0000000-0000-0000-0000-000000000001";
const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
const productId = "a1000000-0000-0000-0000-000000000001";
const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
const foreignCustomerEmail = requiredEnv("E2E_EMAIL_B").toLowerCase();
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function rpcJson(sql, args = []) { return asJson((await db.unsafe(sql, args))[0].result); }
async function expectFailure(label, action, pattern) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should fail");
  if (pattern) assert.match(String(caught.message), pattern, label + " should fail for the expected reason");
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
    "values($1::uuid,$1::uuid,now(),now(),now(),null,'CI isolated product-question acceptance','127.0.0.1'::inet) " +
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
async function publicQuestions() {
  return rpcJson("select public.get_storefront_product_questions($1::uuid,8,0) as result", [productId]);
}
async function ownQuestions(profile) {
  await setIdentity(profile);
  return rpcJson("select public.get_customer_product_questions_context($1::uuid) as result", [productId]);
}
async function submit(profile, question) {
  await setIdentity(profile);
  return rpcJson("select public.submit_storefront_product_question($1::uuid,$2::text) as result", [productId, question]);
}
async function queue(profile) {
  await setIdentity(profile);
  return rpcJson("select public.list_pending_storefront_product_questions(50) as result");
}
async function moderate(profile, id, decision, answer = "", note = "") {
  await setIdentity(profile);
  return rpcJson(
    "select public.moderate_storefront_product_question($1::uuid,$2::text,$3::text,$4::text) as result",
    [id, decision, answer, note],
  );
}

async function main() {
  const customer = await findProfile(customerEmail, organizationId);
  const foreignCustomer = await findProfile(foreignCustomerEmail, foreignOrganizationId);
  const manager = await findProfile(managerEmail, organizationId);
  await setAnonymous();
  const initial = await publicQuestions();
  assert.equal(initial.question_count, 0);
  assert.deepEqual(initial.items, []);

  await setAnonymous();
  await expectFailure("anonymous direct table read", () => db.unsafe(
    "select id from public.storefront_product_questions limit 1",
  ), /permission denied/i);

  await setIdentity(customer);
  const context = await rpcJson("select public.get_customer_product_questions_context($1::uuid) as result", [productId]);
  assert.deepEqual(context.items, []);

  const firstQuestion = "هل يناسب الاستخدام اليومي وفق تعليمات الشركة؟";
  const submitted = await submit(customer, firstQuestion);
  assert.match(submitted.id, /^[0-9a-f-]{36}$/i);
  assert.equal(submitted.moderation_status, "pending");

  const privatePending = await ownQuestions(customer);
  assert.equal(privatePending.items.length, 1);
  assert.equal(privatePending.items[0].moderation_status, "pending");
  assert.equal(privatePending.items[0].verified_purchase, true, "a delivered matching purchase is marked verified");

  await setAnonymous();
  const pendingPublic = await publicQuestions();
  assert.equal(pendingPublic.question_count, 0, "pending questions never appear in public Q&A");
  assert.deepEqual(pendingPublic.items, []);

  await setIdentity(customer);
  await expectFailure("customer cannot list manager queue", () =>
    rpcJson("select public.list_pending_storefront_product_questions(50) as result"), /permission|administrator|manager/i);
  await expectFailure("customer cannot answer a question", () =>
    rpcJson("select public.moderate_storefront_product_question($1::uuid,'answer','جواب صالح وواضح','') as result", [submitted.id]),
  /permission|administrator|manager/i);
  await setIdentity(foreignCustomer);
  await expectFailure("foreign customer cannot read tenant A product", () =>
    rpcJson("select public.get_customer_product_questions_context($1::uuid) as result", [productId]),
  /available in this customer organization|permission/i);

  const managerQueue = await queue(manager);
  assert.equal(managerQueue.length, 1);
  assert.equal(managerQueue[0].id, submitted.id);
  assert.equal(managerQueue[0].question_text, firstQuestion);
  for (const privateField of ["organization_id", "customer_id", "profile_id", "email", "phone", "order_id", "order_item_id"]) {
    assert.equal(privateField in managerQueue[0], false, "moderation queue omits customer identity field " + privateField);
  }

  const answered = await moderate(manager, submitted.id, "answer", "نعم، المنتج مناسب للاستخدام اليومي وفق تعليمات العبوة.", "");
  assert.equal(answered.moderation_status, "answered");
  await setAnonymous();
  const publicAnswered = await publicQuestions();
  assert.equal(publicAnswered.question_count, 1);
  assert.equal(publicAnswered.items.length, 1);
  assert.equal(publicAnswered.items[0].question_text, firstQuestion);
  assert.equal(publicAnswered.items[0].verified_purchase, true);
  assert.ok(publicAnswered.items[0].answered_at);
  assert.equal("customer_id" in publicAnswered.items[0], false);
  assert.equal("organization_id" in publicAnswered.items[0], false);

  const second = await submit(customer, "هل توجد تعليمات خاصة لتخزين المنتج؟");
  assert.equal(second.moderation_status, "pending");
  await expectFailure("rejection requires a reason", () =>
    moderate(manager, second.id, "reject", "", ""), /decision requires|valid public answer|rejection reason/i);
  const rejected = await moderate(manager, second.id, "reject", "", "السؤال لا يخص خصائص هذا المنتج");
  assert.equal(rejected.moderation_status, "rejected");
  await setAnonymous();
  const afterReject = await publicQuestions();
  assert.equal(afterReject.question_count, 1, "rejected questions remain private");
  assert.equal(afterReject.items.some((item) => item.id === second.id), false);

  const customerHistory = await ownQuestions(customer);
  const rejectedRow = customerHistory.items.find((item) => item.id === second.id);
  assert.ok(rejectedRow);
  assert.equal(rejectedRow.moderation_status, "rejected");
  assert.equal(rejectedRow.moderation_note, "السؤال لا يخص خصائص هذا المنتج");

  await setIdentity(foreignCustomer);
  await expectFailure("foreign customer cannot create question for tenant A product", () =>
    rpcJson("select public.submit_storefront_product_question($1::uuid,$2::text) as result", [
      productId, "هل يناسب الاستخدام اليومي؟",
    ]), /not available in this customer organization|permission/i);

  await setIdentity(customer);
  await expectFailure("authenticated browser cannot read the table directly", () =>
    db.unsafe("select id from public.storefront_product_questions limit 1"), /permission denied/i);

  await db.unsafe("reset role");
  const audit = await db.unsafe(
    "select action,actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='storefront_product_question' and entity_id = any($2::uuid[]) order by created_at,id",
    [organizationId, [submitted.id, second.id]],
  );
  assert.equal(audit.length, 4, "both submissions and manager answer/rejection are audited");
  assert.deepEqual(audit.map((row) => row.action).sort(), [
    "storefront.product_question.submitted",
    "storefront.product_question.answered",
    "storefront.product_question.submitted",
    "storefront.product_question.rejected",
  ].sort());
  assert.ok(audit.every((row) => row.actor_id), "each submission and answer/rejection records its actor profile");

  process.stdout.write(
    "STOREFRONT_PRODUCT_QUESTIONS_ACCEPTED: customer submission, verified-purchase marker, pending privacy, manager queue, answer publication, rejection reason, customer history, tenant denial, direct-table denial, and actor-attributed audit verified locally.\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("STOREFRONT_PRODUCT_QUESTIONS_ACCEPTANCE_FAILED: " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });
