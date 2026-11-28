import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated PostgreSQL 17 amendment replay acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}

const apiUrl = requiredEnv("SUPABASE_URL");
const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const databaseUrl = requiredEnv("TEST_DATABASE_URL");
const email = requiredEnv("E2E_EMAIL");
const password = requiredEnv("E2E_PASSWORD");
const orderId = requiredEnv("E2E_AMENDMENT_ORDER_ID");
const itemId = requiredEnv("E2E_AMENDMENT_ITEM_ID");
const api = new URL(apiUrl);
const database = new URL(databaseUrl);
if (api.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(api.hostname) ||
    api.port !== "54321" || !["localhost", "127.0.0.1"].includes(database.hostname)) {
  throw new Error("Customer amendment replay acceptance is restricted to the isolated local Supabase/PostgreSQL stack.");
}

const authResponse = await fetch(new URL("/auth/v1/token?grant_type=password", api), {
  method: "POST",
  headers: { apikey: publishableKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const authBody = await authResponse.json().catch(() => null);
if (!authResponse.ok || typeof authBody?.access_token !== "string") {
  throw new Error("Local Supabase Auth could not issue a customer session for amendment replay acceptance (HTTP " + authResponse.status + ").");
}
const accessToken = authBody.access_token;
const requestKey = randomUUID().replaceAll("-", "");
const note = "P2 exact customer amendment replay " + requestKey.slice(0, 8);
const originalLines = [{ item_id: itemId, quantity: 3 }];

async function submit(lines) {
  const response = await fetch(new URL("/rest/v1/rpc/submit_customer_order_amendment", api), {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      p_order_id: orderId,
      p_lines: lines,
      p_note: note,
      p_idempotency_key: requestKey,
    }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}

const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
try {
  const functionRows = await db.unsafe(
    "select pg_catalog.pg_get_functiondef(" +
    "'public.submit_customer_order_amendment(uuid,jsonb,text,text)'::pg_catalog.regprocedure) as definition",
  );
  const definition = functionRows[0]?.definition;
  assert.equal(typeof definition, "string", "active customer amendment RPC must exist");
  assert.doesNotMatch(definition, /(?:pg_catalog\.)?jsonb_object_length\s*\(/i,
    "active RPC must not call unavailable PostgreSQL jsonb_object_length");
  assert.match(definition, /jsonb_object_keys\s*\(\s*submitted\.line\s*\)/i,
    "replay guard must count exact submitted object keys");

  const keyCounts = await db.unsafe(
    "select " +
    "(select pg_catalog.count(*) from pg_catalog.jsonb_object_keys('{\"item_id\":\"00000000-0000-4000-8000-000000000001\",\"quantity\":3}'::jsonb))::int as exact_keys, " +
    "(select pg_catalog.count(*) from pg_catalog.jsonb_object_keys('{\"item_id\":\"00000000-0000-4000-8000-000000000001\",\"quantity\":3,\"price\":1}'::jsonb))::int as extra_keys",
  );
  assert.equal(Number(keyCounts[0]?.exact_keys), 2);
  assert.equal(Number(keyCounts[0]?.extra_keys), 3);

  const first = await submit(originalLines);
  assert.equal(first.ok, true, "first amendment submission must succeed: " + JSON.stringify(first.body));
  assert.equal(first.body.replayed, false);
  assert.equal(first.body.status, "pending_review");
  assert.equal(Number(first.body.line_count), 1);
  assert.ok(typeof first.body.amendment_id === "string");

  const replay = await submit(originalLines);
  assert.equal(replay.ok, true, "exact retry must succeed: " + JSON.stringify(replay.body));
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.amendment_id, first.body.amendment_id);
  assert.equal(replay.body.order_id, orderId);
  assert.equal(Number(replay.body.line_count), 1);

  const changed = await submit([{ item_id: itemId, quantity: 4 }]);
  assert.equal(changed.ok, false, "same key with changed quantity must be rejected");
  assert.equal(changed.body?.code, "22023");
  assert.match(String(changed.body?.message ?? ""), /مفتاح إعادة الإرسال مرتبط بمحتوى مختلف/);

  const extraFinancialKey = await submit([{ item_id: itemId, quantity: 3, price: 1 }]);
  assert.equal(extraFinancialKey.ok, false, "replay must reject extra financial keys");
  assert.equal(extraFinancialKey.body?.code, "22023");
  assert.match(String(extraFinancialKey.body?.message ?? ""), /مفتاح إعادة الإرسال مرتبط بمحتوى مختلف/);

  const state = await db.unsafe(
    "select " +
    "(select count(*)::int from public.customer_order_amendments where idempotency_key=$1 and order_id=$2::uuid) as amendment_count, " +
    "(select count(*)::int from public.customer_order_amendment_line_snapshots where amendment_id=$3::uuid) as snapshot_count, " +
    "(select proposed_quantity::numeric::text from public.order_items where id=$4::uuid and order_id=$2::uuid) as proposed_quantity, " +
    "(select quantity_review_required from public.orders where id=$2::uuid) as review_required",
    [requestKey, orderId, first.body.amendment_id, itemId],
  );
  assert.equal(Number(state[0]?.amendment_count), 1, "retries must not create duplicate amendment versions");
  assert.equal(Number(state[0]?.snapshot_count), 1, "the immutable line snapshot must remain singular");
  assert.equal(Number(state[0]?.proposed_quantity), 3, "rejected payloads must not mutate the original proposal");
  assert.equal(state[0]?.review_required, true, "the customer review gate must remain active");

  process.stdout.write(
    "CUSTOMER_AMENDMENT_REPLAY_PG17_PASS firstSubmission=true exactReplay=true " +
    "originalVersionReturned=true changedPayloadRejected=true financialKeyRejected=true noDuplicateVersion=true\n",
  );
} finally {
  await db.end({ timeout: 5 });
}
