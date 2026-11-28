import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local customer-asset replacement acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}

const apiUrl = requiredEnv("SUPABASE_URL");
const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const databaseUrl = requiredEnv("TEST_DATABASE_URL");
const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL");
const adminPassword = requiredEnv("E2E_DEVICE_ADMIN_PASSWORD");
const customerEmail = requiredEnv("E2E_EMAIL");
const customerPassword = requiredEnv("E2E_PASSWORD");
const organizationId = requiredEnv("E2E_PURCHASE_ORGANIZATION_ID");
const api = new URL(apiUrl);
const database = new URL(databaseUrl);
if (api.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(api.hostname) ||
    api.port !== "54321" || !["localhost", "127.0.0.1"].includes(database.hostname)) {
  throw new Error("Customer-asset replacement acceptance refuses non-loopback Supabase/PostgreSQL endpoints.");
}

async function login(email, password) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", api), {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error("Local Supabase Auth could not issue an acceptance session (HTTP " + response.status + ").");
  }
  return body.access_token;
}

async function rpc(accessToken, name, args) {
  const response = await fetch(new URL("/rest/v1/rpc/" + name, api), {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}

const adminToken = await login(adminEmail, adminPassword);
const customerToken = await login(customerEmail, customerPassword);
const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
const runKey = randomUUID().replaceAll("-", "");
const oldSerial = "P2-OLD-" + runKey.slice(0, 16);
const newSerial = "P2-NEW-" + runKey.slice(0, 16);
const changedSerial = "P2-CHANGE-" + runKey.slice(0, 14);
const requestKey = "asset_replace_" + runKey;

try {
  const functionRows = await db.unsafe(
    "select pg_catalog.pg_get_functiondef(" +
    "'public.replace_customer_asset(uuid,text,text,text,uuid,uuid,uuid,text,text,text,date,text,text,text,text,date,date,text,date,date,text,jsonb)'::pg_catalog.regprocedure) as definition",
  );
  const definition = functionRows[0]?.definition;
  assert.equal(typeof definition, "string", "atomic customer-asset replacement RPC must exist");
  assert.match(definition, /customer_activation_invitation_sha256/, "replacement fingerprint must use SHA-256");

  const guardRows = await db.unsafe(
    "select pg_catalog.pg_get_functiondef('public.guard_customer_asset_replacement_event()'::pg_catalog.regprocedure) as definition, " +
    "exists(select 1 from pg_catalog.pg_trigger where tgname='customer_asset_replacement_event_guard' and not tgisinternal) as trigger_exists",
  );
  assert.equal(typeof guardRows[0]?.definition, "string", "replacement event guard function must exist");
  assert.equal(guardRows[0]?.trigger_exists, true, "replacement event guard trigger must be installed");
  assert.match(guardRows[0]?.definition ?? "", /<> 64/, "replacement event guard must require a 64-character SHA-256 fingerprint");

  const customers = await db.unsafe(
    "select c.id::text as customer_id, c.organization_id::text as organization_id, p.id::text as profile_id " +
    "from public.customers c join public.profiles p on p.id=c.profile_id " +
    "where c.organization_id=$1::uuid and c.business_name=$2 and c.status='approved' " +
    "order by c.created_at desc, c.id desc limit 1",
    [organizationId, "P2 Local E2E Customer A"],
  );
  assert.equal(customers.length, 1, "canonical local customer A must resolve inside the seeded organization");
  const customerId = customers[0].customer_id;
  const profileId = customers[0].profile_id;

  const foreignCustomers = await db.unsafe(
    "select c.id::text as customer_id, c.organization_id::text as organization_id, p.id::text as profile_id " +
    "from public.customers c join public.profiles p on p.id=c.profile_id " +
    "where c.business_name=$1 and c.status='approved' and c.organization_id<>$2::uuid " +
    "order by c.created_at desc, c.id desc limit 1",
    ["P2 Local E2E Customer B", organizationId],
  );
  assert.equal(foreignCustomers.length, 1, "foreign-tenant fixture customer B must resolve");

  const created = await rpc(adminToken, "create_customer_asset", {
    p_customer_id: customerId,
    p_asset_name: "P2 Local Device " + runKey.slice(0, 8),
    p_reason: "إنشاء أصل اختبار محلي لمسار الاستبدال",
    p_serial_number: oldSerial,
  });
  assert.equal(created.ok, true, "initial customer asset must be created: " + JSON.stringify(created.body));
  const oldAssetId = created.body?.asset_id;
  assert.match(String(oldAssetId ?? ""), /^[0-9a-f-]{36}$/i, "initial asset id must be a UUID");

  const request = {
    p_old_asset_id: oldAssetId,
    p_request_key: requestKey,
    p_asset_name: "P2 Local Replacement Device " + runKey.slice(0, 8),
    p_reason: "استبدال الجهاز السابق بسبب عطل موثق",
    p_manufacturer: "P2 Acceptance",
    p_model: "Replacement Model",
    p_serial_number: newSerial,
    p_metadata: { acceptance: "local-postgresql-17" },
  };
  const sameKeyConcurrent = await Promise.all([
    rpc(adminToken, "replace_customer_asset", request),
    rpc(adminToken, "replace_customer_asset", request),
  ]);
  assert.equal(sameKeyConcurrent.every(result => result.ok), true,
    "concurrent identical replacement calls must both resolve: " + JSON.stringify(sameKeyConcurrent));
  assert.equal(sameKeyConcurrent.filter(result => result.body?.replayed === false).length, 1,
    "exactly one concurrent identical call must perform the replacement");
  assert.equal(sameKeyConcurrent.filter(result => result.body?.replayed === true).length, 1,
    "the other concurrent identical call must be an exact replay");
  const first = sameKeyConcurrent.find(result => result.body?.replayed === false);
  const replay = sameKeyConcurrent.find(result => result.body?.replayed === true);
  assert.ok(first && replay, "concurrent identical calls must yield one commit and one replay");
  assert.equal(first.body?.old_asset_id, oldAssetId);
  assert.equal(first.body?.status, "replaced");
  const newAssetId = first.body?.new_asset_id;
  assert.match(String(newAssetId ?? ""), /^[0-9a-f-]{36}$/i, "replacement asset id must be a UUID");
  assert.notEqual(newAssetId, oldAssetId);
  assert.equal(replay.body?.old_asset_id, oldAssetId);
  assert.equal(replay.body?.new_asset_id, newAssetId);

  const changedPayload = await rpc(adminToken, "replace_customer_asset", {
    ...request,
    p_serial_number: changedSerial,
  });

  assert.equal(changedPayload.ok, false, "same request key with changed payload must fail");
  assert.equal(changedPayload.body?.code, "22023");

  const raceAssetCreated = await rpc(adminToken, "create_customer_asset", {
    p_customer_id: customerId,
    p_asset_name: "P2 Local Concurrent Conflict Asset " + runKey.slice(0, 8),
    p_reason: "إنشاء أصل لاختبار تعارض الإرسال المتزامن",
    p_serial_number: "P2-RACE-OLD-" + runKey.slice(0, 12),
  });
  assert.equal(raceAssetCreated.ok, true, "concurrent-conflict source asset must be created");
  const raceOldAssetId = raceAssetCreated.body?.asset_id;
  const raceRequestKey = "asset_replace_race_" + runKey;
  const raceBase = {
    ...request,
    p_old_asset_id: raceOldAssetId,
    p_request_key: raceRequestKey,
    p_asset_name: "P2 Local Concurrent Replacement " + runKey.slice(0, 8),
  };
  const conflictingConcurrent = await Promise.all([
    rpc(adminToken, "replace_customer_asset", {
      ...raceBase, p_serial_number: "P2-RACE-A-" + runKey.slice(0, 12),
    }),
    rpc(adminToken, "replace_customer_asset", {
      ...raceBase, p_serial_number: "P2-RACE-B-" + runKey.slice(0, 12),
    }),
  ]);
  assert.equal(conflictingConcurrent.filter(result => result.ok).length, 1,
    "one payload must win for a concurrent key conflict");
  assert.equal(conflictingConcurrent.filter(result => !result.ok && result.body?.code === "22023").length, 1,
    "the competing different payload must be rejected with SQLSTATE 22023");
  const racePersisted = await db.unsafe(
    "select old_asset.status as old_status, " +
    "(select count(*)::int from public.customer_asset_events e where e.organization_id=old_asset.organization_id " +
    " and e.asset_id=old_asset.id and e.event_type='replacement' and e.metadata->>'request_key'=$2) as event_count, " +
    "(select count(*)::int from public.customer_assets replacement where replacement.organization_id=old_asset.organization_id " +
    " and replacement.customer_id=old_asset.customer_id and replacement.metadata->>'replacement_of_asset_id'=$1::text) as replacement_asset_count " +
    "from public.customer_assets old_asset where old_asset.id=$1::uuid",
    [raceOldAssetId, raceRequestKey],
  );
  assert.equal(racePersisted.length, 1);
  assert.equal(racePersisted[0].old_status, "replaced");
  assert.equal(Number(racePersisted[0].event_count), 1, "concurrent conflict must create one immutable event");
  assert.equal(Number(racePersisted[0].replacement_asset_count), 1,
    "concurrent conflict must not leave an orphan or duplicate replacement asset");

  // Exercise the migration's duplicate-history preflight with fixtures fully rolled back.
  const duplicateHistoryKey = "asset_preflight_" + runKey;
  await db.unsafe("begin");
  try {
    await db.unsafe("drop index public.customer_asset_replacement_request_key_unique");
    await db.unsafe("alter table public.customer_asset_events disable trigger user");
    await db.unsafe(
      "insert into public.customer_asset_events(" +
      "organization_id,asset_id,event_type,old_status,new_status,summary,reason,metadata,actor_profile_id" +
      ") values " +
      "($1::uuid,$2::uuid,'replacement','active','replaced',$3,$4," +
      "jsonb_build_object('request_key',$5::text,'request_fingerprint',repeat('a',64),'new_asset_id',$6::text),$7::uuid)," +
      "($1::uuid,$2::uuid,'replacement','active','replaced',$3,$4," +
      "jsonb_build_object('request_key',$5::text,'request_fingerprint',repeat('b',64),'new_asset_id',$6::text),$7::uuid)",
      [organizationId, oldAssetId, "Preflight fixture", "Temporary duplicate history fixture",
        duplicateHistoryKey, newAssetId, profileId],
    );
    await db.unsafe(
      "do $preflight_test$ declare v_blocked boolean := false; begin " +
      "begin perform public.assert_customer_asset_replacement_request_keys_unique(); " +
      "exception when unique_violation then v_blocked := true; end; " +
      "if not v_blocked then raise exception 'duplicate historical replacement keys were not blocked'; end if; " +
      "end $preflight_test$;",
    );
  } finally {
    await db.unsafe("rollback");
  }
  const restoredIndex = await db.unsafe(
    "select exists(select 1 from pg_catalog.pg_indexes where schemaname='public' " +
    "and indexname='customer_asset_replacement_request_key_unique') as present",
  );
  assert.equal(restoredIndex[0]?.present, true, "preflight fixture rollback must restore the unique index");


  const directCustomerRetry = await rpc(customerToken, "replace_customer_asset", {
    ...request,
    p_request_key: "asset_replace_customer_" + runKey,
  });
  assert.equal(directCustomerRetry.ok, false, "customer-only accounts must not replace customer assets");
  assert.equal(directCustomerRetry.body?.code, "42501");

  const foreignRows = await db.unsafe(
    "insert into public.customer_assets(" +
    "organization_id,customer_id,asset_name,serial_number,status,created_by,updated_by" +
    ") values($1::uuid,$2::uuid,$3,$4,'active',$5::uuid,$5::uuid) returning id::text",
    [
      foreignCustomers[0].organization_id,
      foreignCustomers[0].customer_id,
      "P2 Foreign Asset " + runKey.slice(0, 8),
      "P2-FOR-" + runKey.slice(0, 16),
      foreignCustomers[0].profile_id,
    ],
  );
  const foreignAssetId = foreignRows[0]?.id;
  assert.match(String(foreignAssetId ?? ""), /^[0-9a-f-]{36}$/i);

  const crossTenant = await rpc(adminToken, "replace_customer_asset", {
    ...request,
    p_old_asset_id: foreignAssetId,
    p_request_key: "asset_replace_foreign_" + runKey,
  });
  assert.equal(crossTenant.ok, false, "organization A must not replace organization B assets");
  assert.equal(crossTenant.body?.code, "42501");

  const secondCreated = await rpc(adminToken, "create_customer_asset", {
    p_customer_id: customerId,
    p_asset_name: "P2 Local Generic Event Guard " + runKey.slice(0, 8),
    p_reason: "إنشاء أصل لاختبار رفض الاستبدال العام",
    p_serial_number: "P2-GUARD-" + runKey.slice(0, 16),
  });
  assert.equal(secondCreated.ok, true, "second test asset must be created");
  const genericEventAttempt = await rpc(adminToken, "record_customer_asset_event", {
    p_asset_id: secondCreated.body.asset_id,
    p_event_type: "replacement",
    p_reason: "محاولة إنشاء حدث استبدال عام دون أصل بديل مرتبط",
  });
  assert.equal(genericEventAttempt.ok, false, "generic event RPC must not bypass atomic replacement");
  assert.equal(genericEventAttempt.body?.code, "42501");

  const persisted = await db.unsafe(
    "select old_asset.status as old_status, new_asset.status as new_status, " +
    "old_asset.organization_id::text as organization_id, old_asset.customer_id::text as customer_id, " +
    "(select count(*)::int from public.customer_asset_events e where e.organization_id=old_asset.organization_id " +
    " and e.asset_id=old_asset.id and e.event_type='replacement' and e.metadata->>'request_key'=$3) as replacement_events, " +
    "(select count(*)::int from public.customer_asset_events e where e.organization_id=guard_asset.organization_id " +
    " and e.asset_id=guard_asset.id and e.event_type='replacement') as generic_replacement_events, " +
    "guard_asset.status as generic_guard_status, " +
    "foreign_asset.status as foreign_status " +
    "from public.customer_assets old_asset " +
    "join public.customer_assets new_asset on new_asset.id=$2::uuid and new_asset.organization_id=old_asset.organization_id " +
    "join public.customer_assets guard_asset on guard_asset.id=$4::uuid " +
    "join public.customer_assets foreign_asset on foreign_asset.id=$5::uuid " +
    "where old_asset.id=$1::uuid",
    [oldAssetId, newAssetId, requestKey, secondCreated.body.asset_id, foreignAssetId],
  );
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].old_status, "replaced");
  assert.equal(persisted[0].new_status, "active");
  assert.equal(persisted[0].organization_id, organizationId);
  assert.equal(persisted[0].customer_id, customerId);
  assert.equal(Number(persisted[0].replacement_events), 1, "exact retry must create one immutable replacement event");
  assert.equal(persisted[0].generic_guard_status, "active", "rejected generic event must roll back its status change");
  assert.equal(Number(persisted[0].generic_replacement_events), 0, "rejected generic event must not persist");
  assert.equal(persisted[0].foreign_status, "active", "cross-tenant replacement must not mutate foreign asset");

  process.stdout.write(
    "CUSTOMER_ASSET_REPLACEMENT_PG17_PASS atomicPair=true concurrentExactReplay=true concurrentConflictRejected=true " +
    "sha256Fingerprint=true duplicateHistoryPreflight=true changedPayloadRejected=true " +
    "customerDenied=true crossTenantDenied=true genericReplacementDenied=true immutableEventSingular=true\n",
  );
} finally {
  await db.end({ timeout: 5 });
}
