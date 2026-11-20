import assert from "node:assert/strict";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local authorization bootstrap acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}

function localDatabaseOnly(value) {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) ||
      !/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535) {
    throw new Error("Authorization bootstrap acceptance refuses non-loopback PostgreSQL endpoints.");
  }
}

function localSupabaseOnly(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") {
    throw new Error("Authorization bootstrap acceptance requires loopback local Supabase Auth.");
  }
  return url;
}

async function signIn(apiUrl, publishableKey, email, password, expectedUserId) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", apiUrl), {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error("Local Supabase sign-in failed for a seeded authorization role (HTTP " + response.status + ").");
  }
  const tokenParts = payload.access_token.split(".");
  if (tokenParts.length !== 3) throw new Error("Local Supabase returned a malformed access token.");
  const claims = JSON.parse(Buffer.from(tokenParts[1], "base64url").toString("utf8"));
  if (claims.sub !== expectedUserId || typeof claims.session_id !== "string") {
    throw new Error("Seeded account JWT does not match the selected active profile and live session.");
  }
  return claims;
}

async function withActor(db, actor, callback) {
  return db.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [actor.auth_user_id]);
    await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ ...actor.jwtClaims, role: "authenticated" }),
    ]);
    await tx.unsafe("set local role authenticated");
    return callback(tx);
  });
}

function decodeJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function capabilityDecision(db, actor, capabilityKey, warehouseId) {
  return withActor(db, actor, async (tx) => {
    const rows = await tx.unsafe(
      "select public.current_authorization_decision($1::text,$2::uuid) as decision," +
      "public.current_actor_has_capability($1::text,$2::uuid) as allowed",
      [capabilityKey, warehouseId],
    );
    const decision = decodeJson(rows[0]?.decision);
    return { decision: decision?.decision, allowed: rows[0]?.allowed };
  });
}

async function selectActor(db, organizationId, email, role, password, apiUrl, publishableKey) {
  const rows = await db.unsafe(
    "select p.id::text as profile_id,p.auth_user_id::text as auth_user_id,p.organization_id::text as organization_id,p.email " +
    "from public.profiles p join public.user_roles r on r.profile_id=p.id " +
    "where p.organization_id=$1::uuid and lower(trim(p.email))=lower(trim($2)) " +
    "and r.role=$3 and p.is_active=true and p.auth_user_id is not null",
    [organizationId, email, role],
  );
  assert.equal(rows.length, 1, "the seeded " + role + " email must map to exactly one active profile in the manager tenant");
  const actor = rows[0];
  actor.jwtClaims = await signIn(apiUrl, publishableKey, email, password, actor.auth_user_id);
  const session = await db.unsafe(
    "select id::text from auth.sessions where id=$1::uuid and user_id=$2::uuid and (not_after is null or not_after>now())",
    [actor.jwtClaims.session_id, actor.auth_user_id],
  );
  assert.equal(session.length, 1, role + " must have a real live Supabase session");
  return actor;
}

async function main() {
  const databaseUrl = requiredEnv("TEST_DATABASE_URL");
  localDatabaseOnly(databaseUrl);
  const apiUrl = localSupabaseOnly(requiredEnv("SUPABASE_URL"));
  const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });

  try {
    const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
    const managerRows = await db.unsafe(
      "select p.organization_id::text as organization_id from public.profiles p " +
      "join public.user_roles r on r.profile_id=p.id where lower(trim(p.email))=lower(trim($1)) " +
      "and r.role='manager' and p.is_active=true and p.auth_user_id is not null",
      [managerEmail],
    );
    assert.equal(managerRows.length, 1, "local manager fixture must resolve one active organization");
    const organizationId = managerRows[0].organization_id;

    const actors = new Map();
    const roleInputs = [
      ["admin", "E2E_DEVICE_ADMIN_EMAIL", "E2E_DEVICE_ADMIN_PASSWORD"],
      ["manager", "E2E_MANAGER_EMAIL", "E2E_MANAGER_PASSWORD"],
      ["staff", "E2E_STAFF_EMAIL", "E2E_STAFF_PASSWORD"],
      ["accountant", "E2E_ACCOUNTANT_EMAIL", "E2E_ACCOUNTANT_PASSWORD"],
      ["customer_manager", "E2E_CUSTOMER_MANAGER_EMAIL", "E2E_CUSTOMER_MANAGER_PASSWORD"],
      ["customer", "E2E_EMAIL", "E2E_PASSWORD"],
    ];
    for (const [role, emailName, passwordName] of roleInputs) {
      actors.set(
        role,
        await selectActor(
          db, organizationId, requiredEnv(emailName), role, requiredEnv(passwordName), apiUrl, publishableKey,
        ),
      );
    }

    const catalogRows = await db.unsafe(
      "select capability_key,scope_kind,approval_mode,separation_of_duties,state_requirements,is_active " +
      "from public.authorization_capabilities " +
      "where capability_key in ('inventory.balance.adjust','inventory.count.enter','inventory.count.finalize') " +
      "order by capability_key",
    );
    assert.equal(catalogRows.length, 3, "all three inventory capabilities must exist after clean migration replay");
    const byKey = new Map(catalogRows.map((row) => [row.capability_key, row]));

    const adjust = byKey.get("inventory.balance.adjust");
    assert.equal(adjust.scope_kind, "warehouse");
    assert.equal(adjust.approval_mode, "none");
    assert.equal(adjust.separation_of_duties, false);
    assert.equal(adjust.is_active, true);
    assert.equal(adjust.state_requirements.requires_reason, true);
    assert.equal(adjust.state_requirements.server_command_only, true);
    assert.equal(adjust.state_requirements.prevents_negative, true);
    assert.equal(adjust.state_requirements.respects_reserved, true);
    assert.equal(adjust.state_requirements.stale_writer_guard, true);

    const adjustGrantRows = await db.unsafe(
      "select role from public.authorization_role_capabilities " +
      "where capability_key='inventory.balance.adjust' and valid_from<=statement_timestamp() " +
      "and (expires_at is null or expires_at>statement_timestamp()) order by role",
    );
    assert.deepEqual(adjustGrantRows.map((row) => row.role), ["admin", "manager"],
      "balance adjustment must remain restricted to explicit admin and manager grants");

    const countEnter = byKey.get("inventory.count.enter");
    assert.equal(countEnter.scope_kind, "warehouse");
    assert.equal(countEnter.approval_mode, "none");
    assert.equal(countEnter.separation_of_duties, false);
    assert.equal(countEnter.is_active, true);
    assert.equal(countEnter.state_requirements.writes_draft_only, true);
    assert.equal(countEnter.state_requirements.requires_active_warehouse_assignment, true);

    const countEnterGrantRows = await db.unsafe(
      "select role from public.authorization_role_capabilities " +
      "where capability_key='inventory.count.enter' and valid_from<=statement_timestamp() " +
      "and (expires_at is null or expires_at>statement_timestamp()) order by role",
    );
    assert.deepEqual(countEnterGrantRows.map((row) => row.role), ["admin", "manager", "staff"],
      "count entry must retain only the explicit admin/manager/staff parity");

    const countFinalize = byKey.get("inventory.count.finalize");
    assert.equal(countFinalize.scope_kind, "warehouse");
    assert.equal(countFinalize.approval_mode, "maker_checker");
    assert.equal(countFinalize.separation_of_duties, true);
    assert.equal(countFinalize.is_active, true);
    assert.equal(countFinalize.state_requirements.requires_active_warehouse_assignment, true);
    assert.equal(countFinalize.state_requirements.reviewer_must_differ_from_counter, true);

    const warehouseId = requiredEnv("E2E_PURCHASE_WAREHOUSE_ID");
    const warehouseRows = await db.unsafe(
      "select id::text from public.warehouses where id=$1::uuid and organization_id=$2::uuid and is_active=true",
      [warehouseId, organizationId],
    );
    assert.equal(warehouseRows.length, 1,
      "the seeded local purchase warehouse must be active inside the manager tenant");

    const managerDenial = await db.unsafe(
      "select is_active,reason from public.authorization_profile_denials " +
      "where organization_id=$1::uuid and profile_id=$2::uuid and capability_key='inventory.balance.adjust'",
      [organizationId, actors.get("manager").profile_id],
    );
    assert.equal(managerDenial.length, 1, "the isolated P2 fixture must retain its explicit manager denial");
    assert.equal(managerDenial[0].is_active, true,
      "the isolated manager denial must remain active during acceptance");
    const managerDecision = await capabilityDecision(
      db, actors.get("manager"), "inventory.balance.adjust", warehouseId,
    );
    assert.deepEqual(managerDecision, { decision: "DENY", allowed: false },
      "an explicit manager denial must override the persisted legacy role grant");

    for (const role of ["staff", "accountant", "customer_manager", "customer"]) {
      const decision = await capabilityDecision(db, actors.get(role), "inventory.balance.adjust", warehouseId);
      assert.deepEqual(decision, { decision: "DENY", allowed: false },
        role + " must be denied inventory.balance.adjust without an explicit grant");
    }

    const tablePrivileges = await db.unsafe(
      "select has_table_privilege('authenticated','public.authorization_capabilities','SELECT') as capability_read," +
      "has_table_privilege('authenticated','public.authorization_role_capabilities','SELECT') as grant_read," +
      "has_table_privilege('authenticated','public.authorization_profile_denials','SELECT') as denial_read",
    );
    assert.deepEqual(tablePrivileges[0], {
      capability_read: false,
      grant_read: false,
      denial_read: false,
    }, "authenticated clients must not read the internal authorization registry tables");

    await assert.rejects(
      () => withActor(db, actors.get("staff"), (tx) =>
        tx.unsafe("select capability_key from public.authorization_capabilities limit 1")),
      (error) => error && String(error.code) === "42501",
      "a non-privileged staff session must be denied direct registry reads",
    );

    process.stdout.write(
      "PASS Authorization V2 bootstrap: clean migration order, warehouse-scoped admin/manager inventory-adjustment grants, " +
      "staff/accountant/customer-manager/customer denial, private registry tables, warehouse draft-only count entry, " +
      "and independent warehouse maker-checker finalization.\n",
    );
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write("FAIL Authorization V2 bootstrap acceptance: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
});
