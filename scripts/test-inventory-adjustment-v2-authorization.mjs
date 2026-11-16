import assert from "node:assert/strict";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local inventory authorization acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function localOnly(connectionString) {
  const database = new URL(connectionString);
  if (!["127.0.0.1", "localhost"].includes(database.hostname) ||
      !/^\d+$/.test(database.port) || Number(database.port) < 1 || Number(database.port) > 65535) {
    throw new Error("Inventory authorization acceptance refuses non-loopback PostgreSQL endpoints.");
  }
}
function localSupabaseOnly(value) {
  const api = new URL(value);
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "54321") {
    throw new Error("Inventory authorization acceptance requires local Supabase Auth.");
  }
  return api;
}
async function signInLocal(apiUrl, key, email, password, expectedUserId) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", apiUrl), {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error("Local Supabase sign-in failed (HTTP " + response.status + ").");
  }
  const parts = payload.access_token.split(".");
  if (parts.length !== 3) throw new Error("Local Supabase issued a malformed JWT.");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (claims.sub !== expectedUserId || typeof claims.session_id !== "string") {
    throw new Error("Local Supabase JWT is missing the expected session identity.");
  }
  return claims;
}
async function applyActor(tx, actor) {
  await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [actor.auth_user_id]);
  await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ ...actor.jwtClaims, role: "authenticated" }),
  ]);
  await tx.unsafe("set local role authenticated");
}
async function expectSqlState(tx, code, callback, message) {
  await assert.rejects(
    () => tx.savepoint(callback),
    (error) => error && String(error.code) === code,
    message,
  );
}
function decodeJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function main() {
  const connectionString = requiredEnv("TEST_DATABASE_URL");
  localOnly(connectionString);
  const apiUrl = localSupabaseOnly(requiredEnv("SUPABASE_URL"));
  const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const rollbackSentinel = new Error("ROLLBACK_INVENTORY_AUTHZ_V2_ACCEPTANCE");
  try {
    const profiles = await db.unsafe(
      "select p.id::text as profile_id,p.auth_user_id::text as auth_user_id,p.organization_id::text as organization_id," +
      "p.email,array_agg(r.role order by r.role) as roles from public.profiles p " +
      "join public.user_roles r on r.profile_id=p.id where p.is_active=true and p.auth_user_id is not null " +
      "and p.organization_id is not null group by p.id,p.auth_user_id,p.organization_id,p.email order by p.created_at,p.id",
    );
    const organizationId = profiles.find((row) => row.roles.includes("manager"))?.organization_id;
    assert.ok(organizationId, "local P2 fixtures must contain a manager organization");
    const actors = {
      admin: profiles.find((row) => row.organization_id === organizationId && row.roles.includes("admin")),
      manager: profiles.find((row) => row.organization_id === organizationId && row.roles.includes("manager")),
      staff: profiles.find((row) => row.organization_id === organizationId && row.roles.includes("staff")),
    };
    for (const [role, actor] of Object.entries(actors)) assert.ok(actor, "local P2 fixtures must contain " + role);
    const credentials = {
      admin: ["E2E_DEVICE_ADMIN_EMAIL", "E2E_DEVICE_ADMIN_PASSWORD"],
      manager: ["E2E_MANAGER_EMAIL", "E2E_MANAGER_PASSWORD"],
      staff: ["E2E_STAFF_EMAIL", "E2E_STAFF_PASSWORD"],
    };
    for (const [role, actor] of Object.entries(actors)) {
      const [emailName, passwordName] = credentials[role];
      actor.jwtClaims = await signInLocal(
        apiUrl, publishableKey, requiredEnv(emailName), requiredEnv(passwordName), actor.auth_user_id,
      );
      const sessions = await db.unsafe(
        "select id::text from auth.sessions where id=$1::uuid and user_id=$2::uuid and (not_after is null or not_after>now())",
        [actor.jwtClaims.session_id, actor.auth_user_id],
      );
      assert.equal(sessions.length, 1, role + " must have a real active Supabase session");
    }

    const [fixture] = await db.unsafe(
      "select p.id::text as product_id,w.id::text as warehouse_id,ib.quantity_on_hand,ib.quantity_reserved " +
      "from public.products p join public.inventory_balances ib on ib.product_id=p.id " +
      "join public.warehouses w on w.id=ib.warehouse_id and w.is_active=true " +
      "where p.organization_id=$1::uuid and p.status='active' and ib.quantity_on_hand<999999999999.999 " +
      "order by p.item_code,p.id limit 1",
      [organizationId],
    );
    assert.ok(fixture, "local fixture must have an existing active stock balance");
    const [otherWarehouse] = await db.unsafe(
      "select id::text as warehouse_id from public.warehouses " +
      "where organization_id=$1::uuid and is_active=true and id<>$2::uuid order by created_at,id limit 1",
      [organizationId, fixture.warehouse_id],
    );
    const oldQuantity = Number(fixture.quantity_on_hand);
    const newQuantity = Number((oldQuantity + 1).toFixed(3));
    const key = "inventory-authz-v2-" + process.pid + "-" + Date.now();
    const args = [
      fixture.product_id, fixture.warehouse_id, oldQuantity, newQuantity,
      "RBAC V2 local stock adjustment acceptance", "V2-ADJUST-TEST", "transaction rolls back after proof", key,
    ];
    const invoke = (tx, values = args) => tx.unsafe(
      "select public.adjust_inventory_balance($1::uuid,$2::uuid,$3::numeric,$4::numeric,$5::text,$6::text,$7::text,$8::text) as result",
      values,
    );

    try {
      await db.begin(async (tx) => {
        // A legacy role grant alone cannot authorize an unassigned warehouse.
        await applyActor(tx, actors.manager);
        const noScopeRows = await tx.unsafe(
          "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision," +
          "public.current_actor_has_capability('inventory.balance.adjust',$1::uuid) as allowed",
          [fixture.warehouse_id],
        );
        const noScopeDecision = decodeJson(noScopeRows[0].decision);
        assert.equal(noScopeDecision.decision, "DENY");
        assert.equal(noScopeRows[0].allowed, false);
        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.get_inventory_adjustment_balances($1::uuid)",
          [fixture.warehouse_id],
        ), "manager without an assigned warehouse must be denied");

        // Admin assigns only this warehouse with an optimistic revision.
        await applyActor(tx, actors.admin);
        const assignmentRows = await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,0) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 assigned warehouse scope acceptance"],
        );
        const warehouseScope = decodeJson(assignmentRows[0].result);
        assert.equal(warehouseScope.changed, true);
        assert.equal(warehouseScope.revision, 1);
        assert.equal(warehouseScope.is_active, true);

        const scopeList = decodeJson((await tx.unsafe(
          "select public.list_authorization_profile_scopes($1::uuid) as scopes",
          [actors.manager.profile_id],
        ))[0].scopes);
        assert.ok(Array.isArray(scopeList));
        assert.ok(scopeList.some((scope) => scope.scope_id === warehouseScope.scope_id && scope.scope_kind === "warehouse"));

        await expectSqlState(tx, "40001", () => tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,0)",
          [actors.manager.profile_id, fixture.warehouse_id, "Stale warehouse scope write"],
        ), "scope writer with stale expected revision must be rejected");

        const scopeReplay = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,1) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 assigned warehouse scope acceptance"],
        ))[0].result);
        assert.equal(scopeReplay.changed, false);
        assert.equal(scopeReplay.revision, 1);

        await expectSqlState(tx, "42501", async (sp) => {
          await applyActor(sp, actors.manager);
          return sp.unsafe("select public.list_authorization_profile_scopes($1::uuid)", [actors.manager.profile_id]);
        }, "ordinary manager cannot inspect private authorization assignments");

        await applyActor(tx, actors.manager);
        const assignedDecisionRows = await tx.unsafe(
          "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision," +
          "public.current_actor_has_capability('inventory.balance.adjust',$1::uuid) as allowed",
          [fixture.warehouse_id],
        );
        const assignedDecision = decodeJson(assignedDecisionRows[0].decision);
        assert.equal(assignedDecision.decision, "PERMIT");
        assert.equal(assignedDecisionRows[0].allowed, true);

        if (otherWarehouse) {
          const unassignedDecision = decodeJson((await tx.unsafe(
            "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision",
            [otherWarehouse.warehouse_id],
          ))[0].decision);
          assert.equal(unassignedDecision.decision, "DENY", "same-tenant but unassigned warehouse must be denied");
        }

        // An explicit V2 denial must override the scoped manager grant.
        await applyActor(tx, actors.admin);
        const denialRows = await tx.unsafe(
          "select public.set_authorization_profile_denial($1::uuid,'inventory.balance.adjust',$2::text,NULL::timestamptz,true) as result",
          [actors.manager.profile_id, "P2 RBAC V2 inventory adjustment denial proof"],
        );
        assert.equal(denialRows[0].result.changed, true);

        await applyActor(tx, actors.manager);
        const deniedDecisionRows = await tx.unsafe(
          "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision," +
          "public.current_actor_has_capability('inventory.balance.adjust',$1::uuid) as allowed",
          [fixture.warehouse_id],
        );
        const deniedDecision = decodeJson(deniedDecisionRows[0].decision);
        assert.equal(deniedDecision.decision, "DENY");
        assert.equal(deniedDecisionRows[0].allowed, false);

        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.get_inventory_adjustment_balances($1::uuid)",
          [fixture.warehouse_id],
        ), "V2 explicit denial must block the adjustment-only stock projection");
        await expectSqlState(tx, "42501", () => invoke(tx), 
          "V2 explicit denial must roll back an adjustment even though the legacy role guard permits manager");

        const [unchanged] = await tx.unsafe(
          "select quantity_on_hand from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
          [fixture.product_id, fixture.warehouse_id],
        );
        assert.equal(Number(unchanged.quantity_on_hand), oldQuantity, "denied V2 adjustment must leave the canonical balance unchanged");

        // Restore the manager's capability in this same transaction before the allowed path.
        await applyActor(tx, actors.admin);
        await tx.unsafe(
          "select public.set_authorization_profile_denial($1::uuid,'inventory.balance.adjust',NULL,NULL::timestamptz,false)",
          [actors.manager.profile_id],
        );
        await applyActor(tx, actors.manager);

        const permittedDecisionRows = await tx.unsafe(
          "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision," +
          "public.current_actor_has_capability('inventory.balance.adjust',$1::uuid) as allowed",
          [fixture.warehouse_id],
        );
        const permittedDecision = decodeJson(permittedDecisionRows[0].decision);
        assert.equal(permittedDecision.decision, "PERMIT");
        assert.equal(permittedDecisionRows[0].allowed, true);

        const projectionRows = await tx.unsafe(
          "select public.get_inventory_adjustment_balances($1::uuid) as projection",
          [fixture.warehouse_id],
        );
        const projection = decodeJson(projectionRows[0].projection);
        assert.equal(projection.warehouse_id, fixture.warehouse_id);
        assert.ok(Array.isArray(projection.items));
        assert.ok(projection.items.some((item) => item.product_id === fixture.product_id));
        for (const item of projection.items) {
          assert.equal(Object.hasOwn(item, "base_price"), false);
          assert.equal(Object.hasOwn(item, "cost_price"), false);
          assert.equal(Object.hasOwn(item, "margin"), false);
        }

        const first = (await invoke(tx))[0].result;
        assert.equal(first.idempotent_replay, false);
        assert.equal(Number(first.previous_quantity_on_hand), oldQuantity);
        assert.equal(Number(first.new_quantity_on_hand), newQuantity);
        assert.equal(Number(first.quantity_delta), 1);

        const replay = (await invoke(tx))[0].result;
        assert.equal(replay.idempotent_replay, true);
        assert.equal(replay.adjustment_id, first.adjustment_id);

        await expectSqlState(tx, "22023", () => invoke(tx, [
          ...args.slice(0, 3), newQuantity + 1, ...args.slice(4),
        ]), "idempotency key reuse with a changed payload must be rejected");
        await expectSqlState(tx, "40001", () => invoke(tx, [
          ...args.slice(0, 3), newQuantity + 2, args[4], args[5], args[6], key + "-stale",
        ]), "stale stock quantity must be rejected");

        const [current] = await tx.unsafe(
          "select quantity_on_hand,quantity_reserved from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
          [fixture.product_id, fixture.warehouse_id],
        );
        const currentQuantity = Number(current.quantity_on_hand);
        const currentReserved = Number(current.quantity_reserved);
        if (currentReserved > 0) {
          await expectSqlState(tx, "22023", () => invoke(tx, [
            fixture.product_id, fixture.warehouse_id, currentQuantity,
            Number((currentReserved - 0.001).toFixed(3)), "below reserved test", null, null, key + "-reserved",
          ]), "the command must refuse to lower on-hand below reserved");
        } else {
          await expectSqlState(tx, "22023", () => invoke(tx, [
            fixture.product_id, fixture.warehouse_id, currentQuantity, -1,
            "negative balance test", null, null, key + "-negative",
          ]), "the command must reject negative stock");
        }

        // Revoke and restore the scope; the following request must observe revocation.
        await applyActor(tx, actors.admin);
        const revokedScope = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,false,1) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 warehouse scope revocation"],
        ))[0].result);
        assert.equal(revokedScope.changed, true);
        assert.equal(revokedScope.revision, 2);

        await applyActor(tx, actors.manager);
        const revokedDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(revokedDecision.decision, "DENY");
        await expectSqlState(tx, "42501", () => invoke(tx), "revoked warehouse assignment must deny the next inventory write");

        await applyActor(tx, actors.admin);
        await expectSqlState(tx, "40001", () => tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,1)",
          [actors.manager.profile_id, fixture.warehouse_id, "Stale scope reactivation"],
        ), "revoked scope must reject a stale revision");
        const reactivatedScope = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,2) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 warehouse scope reactivation"],
        ))[0].result);
        assert.equal(reactivatedScope.changed, true);
        assert.equal(reactivatedScope.revision, 3);

        const expiresAt = new Date(Date.now() + 1500).toISOString();
        const expiringScope = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,$4::timestamptz,true,3) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 temporary warehouse assignment expiry", expiresAt],
        ))[0].result);
        assert.equal(expiringScope.changed, true);
        assert.equal(expiringScope.revision, 4);

        await new Promise((resolve) => setTimeout(resolve, 1800));
        await applyActor(tx, actors.manager);
        const expiredDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(expiredDecision.decision, "DENY", "expired warehouse scope must be denied on the next request");
        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.get_inventory_adjustment_balances($1::uuid)",
          [fixture.warehouse_id],
        ), "expired warehouse assignment must deny the next balance read");

        await applyActor(tx, actors.admin);
        const renewedScope = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,4) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 permanent warehouse scope renewal"],
        ))[0].result);
        assert.equal(renewedScope.changed, true);
        assert.equal(renewedScope.revision, 5);
        await applyActor(tx, actors.manager);
        const renewedDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(renewedDecision.decision, "PERMIT");

        await tx.unsafe("reset role");
        const [scopeAudit] = await tx.unsafe(
          "select count(*)::integer as count from public.audit_logs where entity_type='authorization_profile_scope' and entity_id=$1::uuid and action='authorization.scope.assignment.changed'",
          [warehouseScope.scope_id],
        );
        assert.equal(scopeAudit.count, 5, "creation, revocation, reactivation, expiry change and renewal must each be audited once");
        await applyActor(tx, actors.manager);

        await expectSqlState(tx, "42501", async (sp) => {
          await applyActor(sp, actors.staff);
          return invoke(sp, [
            fixture.product_id, fixture.warehouse_id, currentQuantity, currentQuantity + 1,
            "staff denial", null, null, key + "-staff",
          ]);
        }, "ordinary staff must be denied by the command");

        await expectSqlState(tx, "42501", async (sp) => {
          await applyActor(sp, actors.staff);
          return sp.unsafe("select public.get_inventory_adjustment_balances($1::uuid)", [fixture.warehouse_id]);
        }, "ordinary staff must be denied from the balance projection");

        await tx.unsafe("reset role");
        const [counts] = await tx.unsafe(
          "select (select count(*)::integer from public.inventory_adjustments where id=$1::uuid) as adjustments," +
          "(select count(*)::integer from public.inventory_movements where reference_type='inventory_adjustment' and reference_id=$1::uuid) as movements," +
          "(select count(*)::integer from public.audit_logs where entity_type='inventory_adjustment' and entity_id=$1::uuid and action='inventory.balance.adjusted') as audits",
          [first.adjustment_id],
        );
        assert.deepEqual(
          { adjustments: counts.adjustments, movements: counts.movements, audits: counts.audits },
          { adjustments: 1, movements: 1, audits: 1 },
          "an adjustment replay must not create duplicate ledger, movement or audit evidence",
        );
        await expectSqlState(tx, "55000", () => tx.unsafe(
          "update public.inventory_adjustments set reason=reason where id=$1::uuid",
          [first.adjustment_id],
        ), "inventory adjustment history must be append-only");
        throw rollbackSentinel;
      });
    } catch (cause) {
      if (cause !== rollbackSentinel) throw cause;
    }

    process.stdout.write(
      "PASS local PostgreSQL 17 RBAC V2 inventory adjustment: manager permit, explicit-deny precedence, " +
      "staff command/read denial, restricted projection, idempotent replay, stale/negative/reserved guards, " +
      "one movement and audit row, append-only history, real sessions, and rollback-only test data.\n",
    );
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
}
main().catch((error) => {
  process.stderr.write("FAIL RBAC V2 inventory adjustment acceptance: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
});
