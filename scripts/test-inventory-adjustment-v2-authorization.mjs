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
      "and not exists (select 1 from public.stock_count_sessions c " +
      "where c.organization_id=p.organization_id and c.warehouse_id=w.id and c.status='open') " +
      "and not exists (select 1 from public.authorization_profile_scopes s " +
      "where s.organization_id=p.organization_id and s.profile_id=$2::uuid and s.scope_kind='warehouse' " +
      "and s.warehouse_id=w.id and s.is_active=true and s.valid_from<=statement_timestamp() " +
      "and (s.expires_at is null or s.expires_at>statement_timestamp())) " +
      "order by w.id,p.item_code,p.id limit 1",
      [organizationId, actors.manager.profile_id],
    );
    assert.ok(fixture, "local fixture must have an existing active stock balance");
    let otherWarehouse;
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
        // Create a dedicated second warehouse inside the rollback-only transaction.
        // The fixture is deterministic in purpose, but its identity/code are unique
        // per run and cannot collide with a parallel P2 acceptance worker.
        const testWarehouseCode = "P2-RBAC-CANCEL-" + process.pid + "-" + Date.now();
        const [testWarehouse] = await tx.unsafe(
          "insert into public.warehouses(organization_id,branch_id,name,code,is_active) " +
          "values($1::uuid,NULL,'P2 RBAC cancellation isolation fixture',$2::text,true) " +
          "returning id::text as warehouse_id",
          [organizationId, testWarehouseCode],
        );
        assert.ok(testWarehouse?.warehouse_id, "the rollback-only cancellation fixture warehouse must be created");
        otherWarehouse = testWarehouse;
        await tx.unsafe(
          "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
          "values($1::uuid,$2::uuid,100,0,0)",
          [fixture.product_id, otherWarehouse.warehouse_id],
        );

        // The broader P2 storefront fixture intentionally places a manager-level
        // explicit denial on this capability. Revoke it only inside this rollback-
        // only acceptance transaction so this test can separately prove both
        // unassigned-scope denial and the explicit-denial override path below.
        await applyActor(tx, actors.admin);
        await tx.unsafe(
          "select public.set_authorization_profile_denial($1::uuid,'inventory.balance.adjust',NULL,NULL::timestamptz,false)",
          [actors.manager.profile_id],
        );

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

        // Direct table reads must be denied by RLS until a warehouse is assigned.
        const unassignedDirectRows = await tx.unsafe(
          "select warehouse_id::text,product_id::text from public.inventory_balances where warehouse_id=$1::uuid",
          [fixture.warehouse_id],
        );
        assert.equal(unassignedDirectRows.length, 0, "RLS must hide balances for an unassigned warehouse");

        await expectSqlState(tx, "42501", () => tx.unsafe(
          "update public.inventory_balances set quantity_on_hand=quantity_on_hand+1 where product_id=$1::uuid and warehouse_id=$2::uuid",
          [fixture.product_id, fixture.warehouse_id],
        ), "authenticated users cannot mutate inventory balances directly");

        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.get_inventory_adjustment_balances($1::uuid)",
          [fixture.warehouse_id],
        ), "manager without an assigned warehouse must be denied");

        // The simulator evaluates the selected member without impersonating them.
        await applyActor(tx, actors.admin);
        const noScopeSimulation = decodeJson((await tx.unsafe(
          "select public.evaluate_authorization_profile_decision_v2($1::uuid,'inventory.balance.adjust',$2::uuid) as decision",
          [actors.manager.profile_id, fixture.warehouse_id],
        ))[0].decision);
        assert.equal(noScopeSimulation.decision, "DENY");
        assert.equal(noScopeSimulation.source, "resource_assignment");
        const organizationSimulation = decodeJson((await tx.unsafe(
          "select public.evaluate_authorization_profile_decision_v2($1::uuid,'identity.roles.assign',NULL::uuid) as decision",
          [actors.admin.profile_id],
        ))[0].decision);
        // Role assignment has a maker-checker approval contract; a grant is not final execution authority.
        assert.equal(organizationSimulation.decision, "REQUIRES_APPROVAL");
        assert.equal(organizationSimulation.scope_kind, "organization");
        assert.equal(organizationSimulation.approval_mode, "maker_checker");
        assert.equal(organizationSimulation.separation_of_duties, true);
        const managerCannotSimulate = async (sp) => {
          await applyActor(sp, actors.manager);
          return sp.unsafe(
            "select public.evaluate_authorization_profile_decision_v2($1::uuid,'identity.roles.assign',NULL::uuid)",
            [actors.admin.profile_id],
          );
        };
        await expectSqlState(tx, "42501", managerCannotSimulate, "only role administrators may use the authorization simulator");

        // Admin assigns only this warehouse with the exact current optimistic revision.
        // An inactive historical row is still versioned; absence of an active
        // assignment does not imply revision zero.
        await tx.unsafe("reset role");
        const [existingManagerScope] = await tx.unsafe(
          "select id::text,revision,is_active from public.authorization_profile_scopes " +
          "where organization_id=$1::uuid and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
          [organizationId, actors.manager.profile_id, fixture.warehouse_id],
        );
        const managerScopeRevision = existingManagerScope ? Number(existingManagerScope.revision) : 0;
        const [managerScopeAuditBefore] = await tx.unsafe(
          "select count(*)::integer as count from public.audit_logs " +
          "where entity_type='authorization_profile_scope' and entity_id=$1::uuid " +
          "and action='authorization.scope.assignment.changed'",
          [existingManagerScope?.id ?? "00000000-0000-0000-0000-000000000000"],
        );
        await applyActor(tx, actors.admin);
        const assignmentRows = await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 assigned warehouse scope acceptance", managerScopeRevision],
        );
        const warehouseScope = decodeJson(assignmentRows[0].result);
        assert.equal(warehouseScope.changed, true);
        assert.equal(warehouseScope.revision, managerScopeRevision + 1);
        assert.equal(warehouseScope.is_active, true);

        const scopeList = decodeJson((await tx.unsafe(
          "select public.list_authorization_profile_scopes($1::uuid) as scopes",
          [actors.manager.profile_id],
        ))[0].scopes);
        assert.ok(Array.isArray(scopeList));
        assert.ok(scopeList.some((scope) => scope.scope_id === warehouseScope.scope_id && scope.scope_kind === "warehouse"));

        // Resource picker is tenant-derived and returns a deliberately minimal projection.
        const resourceCatalog = decodeJson((await tx.unsafe(
          "select public.list_authorization_scope_resources() as resources",
        ))[0].resources);
        assert.ok(Array.isArray(resourceCatalog.warehouses));
        assert.ok(Array.isArray(resourceCatalog.customers));
        assert.ok(resourceCatalog.warehouses.some((warehouse) => warehouse.id === fixture.warehouse_id));
        for (const customer of resourceCatalog.customers) {
          assert.deepEqual(Object.keys(customer).sort(), ["code", "id", "name"]);
        }
        await expectSqlState(tx, "42501", async (sp) => {
          await applyActor(sp, actors.manager);
          return sp.unsafe("select public.list_authorization_scope_resources()");
        }, "non-administrator cannot enumerate organization resources for scope assignment");

        const assignedSimulation = decodeJson((await tx.unsafe(
          "select public.evaluate_authorization_profile_decision_v2($1::uuid,'inventory.balance.adjust',$2::uuid) as decision",
          [actors.manager.profile_id, fixture.warehouse_id],
        ))[0].decision);
        assert.equal(assignedSimulation.decision, "PERMIT");
        assert.ok(assignedSimulation.scope_assignment_id);
        assert.equal(assignedSimulation.scope_resource_id, fixture.warehouse_id);

        if (resourceCatalog.customers.length > 0) {
          const assignedCustomerId = resourceCatalog.customers[0].id;
          await tx.unsafe("reset role");
          const [existingCustomerScope] = await tx.unsafe(
            "select revision from public.authorization_profile_scopes where organization_id=$1::uuid " +
            "and profile_id=$2::uuid and scope_kind='assigned_customer' and customer_id=$3::uuid",
            [organizationId, actors.manager.profile_id, assignedCustomerId],
          );
          await applyActor(tx, actors.admin);
          const customerScopeRevision = existingCustomerScope ? Number(existingCustomerScope.revision) : 0;
          const customerScope = decodeJson((await tx.unsafe(
            "select public.set_authorization_profile_scope($1::uuid,'assigned_customer',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer) as result",
            [actors.manager.profile_id, assignedCustomerId, "P2 assigned customer scope acceptance", customerScopeRevision],
          ))[0].result);
          assert.equal(customerScope.changed, true);
          assert.equal(customerScope.scope_kind, "assigned_customer");
          const customerScopedDecision = decodeJson((await tx.unsafe(
            "select public.current_authorization_decision('customers.read_basic',$1::uuid) as decision",
            [assignedCustomerId],
          ))[0].decision);
          assert.equal(customerScopedDecision.decision, "DENY",
            "an assigned customer relationship must not manufacture an absent capability grant");
          const customerScopeRevoked = decodeJson((await tx.unsafe(
            "select public.set_authorization_profile_scope($1::uuid,'assigned_customer',$2::uuid,$3::text,NULL::timestamptz,false,$4::integer) as result",
            [actors.manager.profile_id, assignedCustomerId, "P2 customer scope rollback proof", Number(customerScope.revision)],
          ))[0].result);
          assert.equal(customerScopeRevoked.revision, Number(customerScope.revision) + 1);
        }

        await expectSqlState(tx, "40001", () => tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer)",
          [actors.manager.profile_id, fixture.warehouse_id, "Stale warehouse scope write", managerScopeRevision],
        ), "scope writer with stale expected revision must be rejected");

        const scopeReplay = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 assigned warehouse scope acceptance", Number(warehouseScope.revision)],
        ))[0].result);
        assert.equal(scopeReplay.changed, false);
        assert.equal(scopeReplay.revision, Number(warehouseScope.revision));

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

        const scopedDirectRows = await tx.unsafe(
          "select warehouse_id::text,product_id::text from public.inventory_balances where warehouse_id=$1::uuid",
          [fixture.warehouse_id],
        );
        assert.ok(scopedDirectRows.length > 0, "RLS must reveal the assigned warehouse balance");
        assert.ok(scopedDirectRows.every((row) => row.warehouse_id === fixture.warehouse_id));

        if (otherWarehouse) {
          const unassignedDecision = decodeJson((await tx.unsafe(
            "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision",
            [otherWarehouse.warehouse_id],
          ))[0].decision);
          assert.equal(unassignedDecision.decision, "DENY", "same-tenant but unassigned warehouse must be denied");
          const otherDirectRows = await tx.unsafe(
            "select warehouse_id::text from public.inventory_balances where warehouse_id=$1::uuid",
            [otherWarehouse.warehouse_id],
          );
          assert.equal(otherDirectRows.length, 0, "RLS must hide a second unassigned warehouse");
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

        // Stock-count entry is a distinct capability: the manager remains denied
        // inventory.balance.adjust but may record a count in the explicitly assigned
        // warehouse when inventory.count.enter is permitted.
        const countEnterDecision=decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.enter',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(countEnterDecision.decision,"PERMIT",
          "the assigned manager must retain the independent stock-count entry capability");
        const countStartDiagnostics = (await tx.unsafe(
          "select auth.uid()::text as auth_user_id, public.current_profile_id()::text as profile_id, " +
          "public.current_organization_id()::text as organization_id, " +
          "public.current_authorization_decision('inventory.count.start',$1::uuid) as decision, " +
          "public.current_actor_has_capability('inventory.count.start',$1::uuid) as allowed",
          [fixture.warehouse_id],
        ))[0];
        assert.equal(countStartDiagnostics.profile_id, actors.manager.profile_id);
        assert.equal(countStartDiagnostics.allowed, true,
          "manager must have an active inventory.count.start grant and assigned warehouse: " +
          JSON.stringify(countStartDiagnostics));
        const unassignedCountDecision=decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.enter',$1::uuid) as decision",
          [otherWarehouse.warehouse_id],
        ))[0].decision);
        assert.equal(unassignedCountDecision.decision,"DENY",
          "the count-entry capability must be denied for a same-tenant but unassigned warehouse");
        const unassignedCountKey="rbac-v2-count-unassigned-"+process.pid+"-"+Date.now();
        await expectSqlState(tx,"42501",()=>tx.unsafe(
          "select public.start_stock_count($1::uuid,$2::text,$3::text)",
          [otherWarehouse.warehouse_id,unassignedCountKey,"unassigned warehouse must be rejected"],
        ),"a manager cannot start a stock count in an unassigned warehouse");
        const unassignedCountSessions=await tx.unsafe(
          "select id from public.stock_count_sessions where organization_id=$1::uuid and idempotency_key=$2::text",
          [organizationId,unassignedCountKey],
        );
        assert.equal(unassignedCountSessions.length,0,"a denied unassigned count must not persist a session");
        const countKey="rbac-v2-count-"+process.pid+"-"+Date.now();
        const countSessionRows=await tx.unsafe(
          "select public.start_stock_count($1::uuid,$2::text,$3::text) as result",
          [fixture.warehouse_id,countKey,"RBAC V2 count-entry permission separation"],
        );
        const countSession=decodeJson(countSessionRows[0]?.result);
        assert.equal(countSession.status,"open","the assigned manager must be able to create the source-backed count snapshot");
        const countLineRows=await tx.unsafe(
          "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric) as result",
          [countSession.id,fixture.product_id,oldQuantity],
        );
        const countedLine=decodeJson(countLineRows[0]?.result);
        assert.equal(countedLine.product_id,fixture.product_id);
        assert.equal(Number(countedLine.counted_quantity),oldQuantity);
        assert.equal(countedLine.counted_by,actors.manager.profile_id,
          "the database trigger must attribute the physical count to the authenticated manager");
        const countSessionState=await tx.unsafe(
          "select counted_lines from public.stock_count_sessions where id=$1::uuid",
          [countSession.id],
        );
        assert.equal(countSessionState[0].counted_lines,1,
          "saving a counted line must update the persisted session counter");
        const [balanceAfterCountEntry]=await tx.unsafe(
          "select quantity_on_hand from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
          [fixture.product_id,fixture.warehouse_id],
        );
        assert.equal(Number(balanceAfterCountEntry.quantity_on_hand),oldQuantity,
          "draft count entry must not mutate the canonical inventory balance");
        const separateAdjustmentDenial=await tx.unsafe(
          "select public.current_actor_has_capability('inventory.balance.adjust',$1::uuid) as allowed",
          [fixture.warehouse_id],
        );
        assert.equal(separateAdjustmentDenial[0].allowed,false,
          "stock-count entry must not restore or manufacture the separately denied balance-adjustment capability");

        // The converse is also required: an explicit denial of count entry
        // blocks both creating a session and saving a previously opened line.
        await applyActor(tx, actors.admin);
        const countEntryDenial = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_denial($1::uuid,'inventory.count.enter',$2::text,NULL::timestamptz,true) as result",
          [actors.manager.profile_id, "P2 explicit stock-count entry denial proof"],
        ))[0].result);
        assert.equal(countEntryDenial.changed, true);
        await applyActor(tx, actors.manager);
        const deniedCountEntry = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.enter',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(deniedCountEntry.decision, "DENY");

        const deniedCountKey = "rbac-v2-count-denied-" + process.pid + "-" + Date.now();
        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.start_stock_count($1::uuid,$2::text,$3::text)",
          [fixture.warehouse_id, deniedCountKey, "must be denied before session creation"],
        ), "an explicit count-entry denial must block creating a stock-count session");

        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",
          [countSession.id, fixture.product_id, oldQuantity + 0.5],
        ), "an explicit count-entry denial must block saving a line in an existing session");

        const deniedStartRows = await tx.unsafe(
          "select count(*)::integer as count from public.stock_count_sessions where organization_id=$1::uuid and idempotency_key=$2",
          [organizationId, deniedCountKey],
        );
        assert.equal(deniedStartRows[0].count, 0,
          "denied count-session creation must leave no persisted session");

        const [unchangedCountLine] = await tx.unsafe(
          "select counted_quantity from public.stock_count_lines where session_id=$1::uuid and product_id=$2::uuid",
          [countSession.id, fixture.product_id],
        );
        assert.equal(Number(unchangedCountLine.counted_quantity), oldQuantity,
          "denied count-line update must leave the previously saved count unchanged");
        const [unchangedCountBalance] = await tx.unsafe(
          "select quantity_on_hand from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
          [fixture.product_id, fixture.warehouse_id],
        );
        assert.equal(Number(unchangedCountBalance.quantity_on_hand), oldQuantity,
          "denied count entry must not mutate canonical stock");

        await applyActor(tx, actors.admin);
        const restoredCountEntryDenial = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_denial($1::uuid,'inventory.count.enter',NULL,NULL::timestamptz,false) as result",
          [actors.manager.profile_id],
        ))[0].result);
        assert.equal(restoredCountEntryDenial.changed, true);
        await applyActor(tx, actors.manager);
        const restoredCountEntryPermission = await tx.unsafe(
          "select public.current_actor_has_capability('inventory.count.enter',$1::uuid) as allowed",
          [fixture.warehouse_id],
        );
        assert.equal(restoredCountEntryPermission[0].allowed, true,
          "the authenticated manager must regain count-entry for the exact assigned warehouse");

        // Registry tables deliberately revoke direct SELECT from authenticated.
        // Capture internal diagnostic fields only after RESET ROLE; the actual
        // permission assertion above remains under the real manager JWT/session.
        await tx.unsafe("reset role");
        const restoredCountEntryDiagnostics = await tx.unsafe(
          "select auth.uid()::text as auth_user_id, public.current_profile_id()::text as current_profile_id, " +
          "(select d.is_active from public.authorization_profile_denials d where d.organization_id=$1::uuid and d.profile_id=$2::uuid and d.capability_key='inventory.count.enter') as denial_is_active, " +
          "(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',ur.role,'grant_source',rc.grant_source,'valid_from',rc.valid_from,'expires_at',rc.expires_at)) " +
          " from public.authorization_role_capabilities rc join public.user_roles ur on ur.role=rc.role and ur.profile_id=$2::uuid " +
          " where rc.capability_key='inventory.count.enter' and rc.valid_from<=statement_timestamp() and (rc.expires_at is null or rc.expires_at>statement_timestamp())) as active_role_grants, " +
          "(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('is_active',s.is_active,'valid_from',s.valid_from,'expires_at',s.expires_at)) " +
          " from public.authorization_profile_scopes s where s.organization_id=$1::uuid and s.profile_id=$2::uuid and s.scope_kind='warehouse' and s.warehouse_id=$3::uuid) as warehouse_scopes, " +
          "(select pg_catalog.jsonb_build_object('scope_kind',c.scope_kind,'approval_mode',c.approval_mode,'is_active',c.is_active) " +
          " from public.authorization_capabilities c where c.capability_key='inventory.count.enter') as capability, " +
          "public.current_authorization_decision('inventory.count.enter',$3::uuid) as decision, " +
          "public.current_actor_has_capability('inventory.count.enter',$3::uuid) as allowed",
          [organizationId, actors.manager.profile_id, fixture.warehouse_id],
        );
        const restoredCountEntry = restoredCountEntryDiagnostics[0];
        assert.equal(
          restoredCountEntry.allowed,
          true,
          "privileged diagnostics must still resolve the same manager authorization decision: " +
            JSON.stringify(restoredCountEntry),
        );
        await applyActor(tx, actors.manager);

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

        const managerCancelDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.cancel',$1::uuid) as decision, " +
          "public.current_actor_has_capability('inventory.count.cancel',$1::uuid) as allowed",
          [fixture.warehouse_id],
        ))[0]);
        assert.equal(managerCancelDecision.decision.decision, "PERMIT",
          "an active manager with an assignment must receive the warehouse-scoped cancellation capability");
        assert.equal(managerCancelDecision.allowed, true);

        // Warehouse entry permission must never imply administrative cancellation.
        await applyActor(tx, actors.staff);
        const [staffCancelDecision] = await tx.unsafe(
          "select public.current_actor_has_capability('inventory.count.cancel',$1::uuid) as allowed",
          [fixture.warehouse_id],
        );
        assert.equal(staffCancelDecision.allowed, false,
          "a warehouse staff member must not receive the independent stock-count cancellation capability");
        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.cancel_stock_count($1::uuid,$2::text)",
          [countSession.id, "Staff is not authorized to cancel a stock count"],
        ), "warehouse staff cannot cancel an open stock count");
        const [staffCancelState] = await tx.unsafe(
          "select status,cancelled_by::text from public.stock_count_sessions where id=$1::uuid",
          [countSession.id],
        );
        assert.deepEqual(staffCancelState, { status: "open", cancelled_by: null },
          "unauthorized cancellation must not change the draft session");
        const [staffCancelAudit] = await tx.unsafe(
          "select count(*)::integer as count from public.audit_logs " +
          "where organization_id=$1::uuid and action='inventory.stock_count.cancelled' " +
          "and entity_type='stock_count_session' and entity_id=$2::uuid",
          [organizationId, countSession.id],
        );
        assert.equal(staffCancelAudit.count, 0,
          "unauthorized cancellation must not create an audit event");

        // Cancellation is independent from maker-checker finalization and
        // requires the manager's explicit assignment to this exact warehouse.
        await applyActor(tx, actors.manager);
        const cancelCapability = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.cancel',$1::uuid) as decision," +
          "public.current_actor_has_capability('inventory.count.cancel',$1::uuid) as allowed",
          [fixture.warehouse_id],
        ))[0]);
        assert.equal(cancelCapability.decision.decision, "PERMIT",
          "the assigned manager must receive the distinct warehouse-scoped cancellation capability");
        assert.equal(cancelCapability.allowed, true);
        const unassignedCancelCapability = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.cancel',$1::uuid) as decision",
          [otherWarehouse.warehouse_id],
        ))[0].decision);
        assert.equal(unassignedCancelCapability.decision, "DENY",
          "the same manager must not cancel a count in an unassigned warehouse");

        // Create an authentic open session through the authorized staff RPC on
        // warehouse B, then switch to the manager who has no B assignment.
        // This keeps the session trigger enabled and exercises the real path.
        await tx.unsafe("reset role");
        const [existingStaffOtherWarehouseScope] = await tx.unsafe(
          "select revision from public.authorization_profile_scopes where organization_id=$1::uuid " +
          "and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
          [organizationId, actors.staff.profile_id, otherWarehouse.warehouse_id],
        );
        const staffOtherWarehouseRevision = existingStaffOtherWarehouseScope
          ? Number(existingStaffOtherWarehouseScope.revision) : 0;
        await applyActor(tx, actors.admin);
        const staffOtherWarehouseAssignment = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer) as result",
          [actors.staff.profile_id, otherWarehouse.warehouse_id,
            "Temporary isolated count creator scope for cross-warehouse cancellation denial",
            staffOtherWarehouseRevision],
        ))[0].result);
        assert.equal(staffOtherWarehouseAssignment.revision, staffOtherWarehouseRevision + 1);
        assert.equal(staffOtherWarehouseAssignment.is_active, true);
        await applyActor(tx, actors.staff);
        const staffOtherWarehouseStart = decodeJson((await tx.unsafe(
          "select public.start_stock_count($1::uuid,$2::text,$3::text) as result",
          [otherWarehouse.warehouse_id,
            "rbac-cancel-unassigned-" + process.pid + "-" + Date.now(),
            "Authorization acceptance: staff-created open count in warehouse B"],
        ))[0].result);
        assert.equal(staffOtherWarehouseStart.status, "open");
        assert.equal(staffOtherWarehouseStart.started_by, actors.staff.profile_id);
        const unassignedSession = { id: staffOtherWarehouseStart.id };
        assert.ok(unassignedSession.id);
        await applyActor(tx, actors.manager);
        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.cancel_stock_count($1::uuid,$2::text)",
          [unassignedSession.id, "Unassigned warehouse cancellation must be denied"],
        ), "manager role grant must not authorize cancellation in an unassigned warehouse");
        const [unassignedSessionAfter] = await tx.unsafe(
          "select status,cancelled_by::text from public.stock_count_sessions where id=$1::uuid",
          [unassignedSession.id],
        );
        assert.deepEqual(unassignedSessionAfter, { status: "open", cancelled_by: null },
          "unassigned cancellation must not change the stock-count session");
        const [unassignedCancellationAudit] = await tx.unsafe(
          "select count(*)::integer as count from public.audit_logs " +
          "where organization_id=$1::uuid and action='inventory.stock_count.cancelled' " +
          "and entity_type='stock_count_session' and entity_id=$2::uuid",
          [organizationId, unassignedSession.id],
        );
        assert.equal(unassignedCancellationAudit.count, 0,
          "unassigned cancellation must not produce an audit event");
        // Close this test session as an authorized, temporarily assigned manager.
        // Stock-count snapshots are immutable: never DELETE the session or its lines.
        await tx.unsafe("reset role");
        const [existingManagerOtherWarehouseScope] = await tx.unsafe(
          "select revision from public.authorization_profile_scopes where organization_id=$1::uuid " +
          "and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
          [organizationId, actors.manager.profile_id, otherWarehouse.warehouse_id],
        );
        const managerOtherWarehouseRevision = existingManagerOtherWarehouseScope
          ? Number(existingManagerOtherWarehouseScope.revision) : 0;
        await applyActor(tx, actors.admin);
        const managerOtherWarehouseAssignment = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer) as result",
          [actors.manager.profile_id, otherWarehouse.warehouse_id,
            "Temporary P2 cleanup scope after cross-warehouse denial proof",
            managerOtherWarehouseRevision],
        ))[0].result);
        assert.equal(managerOtherWarehouseAssignment.is_active, true);
        await applyActor(tx, actors.manager);
        const cancelledUnassignedFixture = decodeJson((await tx.unsafe(
          "select public.cancel_stock_count($1::uuid,$2::text) as result",
          [unassignedSession.id, "Close cross-warehouse denial fixture through authorized audited cancellation"],
        ))[0].result);
        assert.equal(cancelledUnassignedFixture.status, "cancelled");
        const [cancelledUnassignedState] = await tx.unsafe(
          "select status,cancelled_by::text from public.stock_count_sessions where id=$1::uuid",
          [unassignedSession.id],
        );
        assert.deepEqual(cancelledUnassignedState, {
          status: "cancelled", cancelled_by: actors.manager.profile_id,
        });
        const [retainedUnassignedLines] = await tx.unsafe(
          "select count(*)::integer as count from public.stock_count_lines where session_id=$1::uuid",
          [unassignedSession.id],
        );
        assert.ok(retainedUnassignedLines.count > 0,
          "authorized cancellation must retain the immutable stock-count snapshot lines");
        const [unassignedCancellationMovements] = await tx.unsafe(
          "select count(*)::integer as count from public.inventory_movements " +
          "where reference_type='stock_count_session' and reference_id=$1::uuid",
          [unassignedSession.id],
        );
        assert.equal(unassignedCancellationMovements.count, 0);
        await tx.unsafe("reset role");
        await applyActor(tx, actors.admin);
        await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,false,$4::integer)",
          [actors.staff.profile_id, otherWarehouse.warehouse_id,
            "Revoke temporary isolated cancellation fixture scope",
            Number(staffOtherWarehouseAssignment.revision)],
        );
        await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,false,$4::integer)",
          [actors.manager.profile_id, otherWarehouse.warehouse_id,
            "Revoke temporary manager cancellation cleanup scope",
            Number(managerOtherWarehouseAssignment.revision)],
        );
        await applyActor(tx, actors.manager);

        // An explicit profile denial overrides both the manager role grant
        // and an otherwise valid warehouse assignment, without writes.
        await applyActor(tx, actors.admin);
        const cancellationDenial = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_denial($1::uuid,'inventory.count.cancel',$2::text,NULL::timestamptz,true) as result",
          [actors.manager.profile_id, "Temporary stock-count cancellation denial acceptance"],
        ))[0].result);
        assert.equal(cancellationDenial.changed, true);
        await applyActor(tx, actors.manager);
        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.cancel_stock_count($1::uuid,$2::text)",
          [countSession.id, "An explicit cancellation denial must override the role grant"],
        ), "an active explicit denial must block cancellation even for an assigned manager");
        const [explicitDeniedSession] = await tx.unsafe(
          "select status,cancelled_by::text from public.stock_count_sessions where id=$1::uuid",
          [countSession.id],
        );
        assert.deepEqual(explicitDeniedSession, { status: "open", cancelled_by: null },
          "explicitly denied cancellation must preserve the open stock-count session");
        const [explicitDenialAudit] = await tx.unsafe(
          "select count(*)::integer as count from public.audit_logs " +
          "where organization_id=$1::uuid and action='inventory.stock_count.cancelled' " +
          "and entity_type='stock_count_session' and entity_id=$2::uuid",
          [organizationId, countSession.id],
        );
        assert.equal(explicitDenialAudit.count, 0,
          "explicitly denied cancellation must not create a cancellation audit");
        const [explicitDenialMovements] = await tx.unsafe(
          "select count(*)::integer as count from public.inventory_movements " +
          "where reference_type='stock_count_session' and reference_id=$1::uuid",
          [countSession.id],
        );
        assert.equal(explicitDenialMovements.count, 0,
          "explicitly denied cancellation must not create stock movements");
        await applyActor(tx, actors.admin);
        const cancellationDenialRevoked = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_denial($1::uuid,'inventory.count.cancel',NULL,NULL::timestamptz,false) as result",
          [actors.manager.profile_id],
        ))[0].result);
        assert.equal(cancellationDenialRevoked.changed, true,
          "the stock-count cancellation fixture must restore the original role grant");
        await applyActor(tx, actors.manager);

        const cancellationReason = "Finish count-entry authorization fixture before independent adjustment acceptance";
        const cancelledCount = decodeJson((await tx.unsafe(
          "select public.cancel_stock_count($1::uuid,$2::text) as result",
          [countSession.id,cancellationReason],
        ))[0].result);
        assert.equal(cancelledCount.status,"cancelled");
        const [cancelledCountState] = await tx.unsafe(
          "select status,cancelled_by,cancellation_reason from public.stock_count_sessions where id=$1::uuid",
          [countSession.id],
        );
        assert.equal(cancelledCountState.status,"cancelled");
        assert.equal(cancelledCountState.cancelled_by,actors.manager.profile_id);
        assert.equal(cancelledCountState.cancellation_reason,cancellationReason);
        const [cancelledCountMovements] = await tx.unsafe(
          "select count(*)::integer as count from public.inventory_movements where reference_type='stock_count_session' and reference_id=$1::uuid",
          [countSession.id],
        );
        assert.equal(cancelledCountMovements.count,0,
          "warehouse-scoped cancellation of an unfinalized count must not create inventory movements");
        const cancellationAudits = await tx.unsafe(
          "select count(*)::integer as count from public.audit_logs " +
          "where organization_id=$1::uuid and action='inventory.stock_count.cancelled' " +
          "and entity_type='stock_count_session' and entity_id=$2::uuid",
          [organizationId,countSession.id],
        );
        assert.equal(cancellationAudits[0].count,1,
          "cancelling the draft count must append exactly one audit event");

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
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,false,$4::integer) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 warehouse scope revocation", Number(warehouseScope.revision)],
        ))[0].result);
        assert.equal(revokedScope.changed, true);
        assert.equal(revokedScope.revision, Number(warehouseScope.revision) + 1);

        await applyActor(tx, actors.manager);
        const revokedDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.balance.adjust',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(revokedDecision.decision, "DENY");
        await applyActor(tx, actors.admin);
        const revokedSimulation = decodeJson((await tx.unsafe(
          "select public.evaluate_authorization_profile_decision_v2($1::uuid,'inventory.balance.adjust',$2::uuid) as decision",
          [actors.manager.profile_id, fixture.warehouse_id],
        ))[0].decision);
        assert.equal(revokedSimulation.decision, "DENY");
        assert.equal(revokedSimulation.source, "resource_assignment");
        await applyActor(tx, actors.manager);
        await expectSqlState(tx, "42501", () => invoke(tx), "revoked warehouse assignment must deny the next inventory write");

        await applyActor(tx, actors.admin);
        await expectSqlState(tx, "40001", () => tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer)",
          [actors.manager.profile_id, fixture.warehouse_id, "Stale scope reactivation", Number(warehouseScope.revision)],
        ), "revoked scope must reject a stale revision");
        const reactivatedScope = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 warehouse scope reactivation", Number(revokedScope.revision)],
        ))[0].result);
        assert.equal(reactivatedScope.changed, true);
        assert.equal(reactivatedScope.revision, Number(revokedScope.revision) + 1);

        const expiresAt = new Date(Date.now() + 1500).toISOString();
        const expiringScope = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,$4::timestamptz,true,$5::integer) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 temporary warehouse assignment expiry", expiresAt,
            Number(reactivatedScope.revision)],
        ))[0].result);
        assert.equal(expiringScope.changed, true);
        assert.equal(expiringScope.revision, Number(reactivatedScope.revision) + 1);

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
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer) as result",
          [actors.manager.profile_id, fixture.warehouse_id, "P2 permanent warehouse scope renewal", Number(expiringScope.revision)],
        ))[0].result);
        assert.equal(renewedScope.changed, true);
        assert.equal(renewedScope.revision, Number(expiringScope.revision) + 1);
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
        assert.equal(scopeAudit.count, managerScopeAuditBefore.count + 5,
          "initial assignment, revocation, reactivation, expiry change and renewal must each add one audit event");
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

        // Prove the complete stock-count command, not only the draft-entry RPC.
        // The manager who opens the first count has both entry and finalization
        // capability, but Maker/Checker must still reject self-approval.
        await applyActor(tx, actors.manager);
        const makerKey = "inventory-count-maker-checker-" + process.pid + "-" + Date.now();
        const makerSession = decodeJson((await tx.unsafe(
          "select public.start_stock_count($1::uuid,$2::text,$3::text) as result",
          [fixture.warehouse_id, makerKey, "P2 maker-checker self-approval acceptance"],
        ))[0].result);
        assert.equal(makerSession.status, "open");
        const makerLines = await tx.unsafe(
          "select product_id::text,expected_quantity from public.stock_count_lines where session_id=$1::uuid order by product_id",
          [makerSession.id],
        );
        assert.ok(makerLines.length > 0, "maker-checker fixture must snapshot real warehouse balances");
        for (const line of makerLines) {
          await tx.unsafe(
            "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",
            [makerSession.id, line.product_id, line.expected_quantity],
          );
        }
        const selfReviewDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.finalize',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(selfReviewDecision.decision, "REQUIRES_APPROVAL",
          "the manager must have the review capability before the separate maker identity is evaluated");
        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.complete_stock_count($1::uuid)",
          [makerSession.id],
        ), "the stock-count maker cannot finalize their own session");
        const makerDeniedState = await tx.unsafe(
          "select status,completed_by::text from public.stock_count_sessions where id=$1::uuid",
          [makerSession.id],
        );
        assert.deepEqual(makerDeniedState[0], { status: "open", completed_by: null },
          "self-approval denial must leave the count session open and uncompleted");
        const makerDeniedMovement = await tx.unsafe(
          "select count(*)::integer as count from public.inventory_movements where reference_type='stock_count_session' and reference_id=$1::uuid",
          [makerSession.id],
        );
        assert.equal(makerDeniedMovement[0].count, 0,
          "self-approval denial must not write an inventory movement");

        // An administrator grant without this warehouse assignment must also fail.
        // Disable only the test actor's matching assignment inside this rollback-only
        // transaction, so the assertion is deterministic even with seeded local scopes.
        await applyActor(tx, actors.admin);
        await tx.unsafe("reset role");
        await tx.unsafe(
          "update public.authorization_profile_scopes set is_active=false,updated_at=statement_timestamp() " +
          "where organization_id=$1::uuid and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
          [organizationId, actors.admin.profile_id, fixture.warehouse_id],
        );
        await applyActor(tx, actors.admin);
        const unassignedReviewDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.finalize',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(unassignedReviewDecision.decision, "DENY",
          "an administrator with no active warehouse assignment cannot review this count");
        await expectSqlState(tx, "42501", () => tx.unsafe(
          "select public.complete_stock_count($1::uuid)",
          [makerSession.id],
        ), "an unassigned administrator cannot finalize a warehouse count");

        // The administrator's exact warehouse scope is intentionally revoked above.
        // Prove that cancellation also denies the unassigned administrator, then let
        // the already-assigned manager close the temporary maker fixture via the
        // same audited resource-scoped RPC used by the product.
        await applyActor(tx, actors.admin);
        const adminMakerCancelDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.cancel',$1::uuid) as decision, " +
          "public.current_actor_has_capability('inventory.count.cancel',$1::uuid) as allowed",
          [fixture.warehouse_id],
        ))[0]);
        assert.equal(adminMakerCancelDecision.decision.decision, "DENY",
          "an administrator without this exact warehouse assignment cannot cancel the maker fixture");
        assert.equal(adminMakerCancelDecision.allowed, false);
        await applyActor(tx, actors.manager);
        const managerMakerCancelDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.cancel',$1::uuid) as decision, " +
          "public.current_actor_has_capability('inventory.count.cancel',$1::uuid) as allowed",
          [fixture.warehouse_id],
        ))[0]);
        assert.equal(managerMakerCancelDecision.decision.decision, "PERMIT",
          "the already-assigned manager must hold the independent warehouse-scoped cancellation capability");
        assert.equal(managerMakerCancelDecision.allowed, true);
        const cancelledMaker = decodeJson((await tx.unsafe(
          "select public.cancel_stock_count($1::uuid,$2::text) as result",
          [makerSession.id, "Assigned manager closes self-approval fixture without broadening admin scope"],
        ))[0].result);
        assert.equal(cancelledMaker.status, "cancelled");
        const [cancelledMakerState] = await tx.unsafe(
          "select status,cancelled_by::text,cancelled_at from public.stock_count_sessions where id=$1::uuid",
          [makerSession.id],
        );
        assert.equal(cancelledMakerState.status, "cancelled");
        assert.equal(cancelledMakerState.cancelled_by, actors.manager.profile_id);
        assert.ok(cancelledMakerState.cancelled_at);
        const [cancelledMakerMovements] = await tx.unsafe(
          "select count(*)::integer as count from public.inventory_movements where reference_type='stock_count_session' and reference_id=$1::uuid",
          [makerSession.id],
        );
        assert.equal(cancelledMakerMovements.count, 0,
          "cancelling a rejected self-approval draft must not create inventory movements");
        const [cancelledMakerAudit] = await tx.unsafe(
          "select count(*)::integer as count from public.audit_logs where action='inventory.stock_count.cancelled' and entity_type='stock_count_session' and entity_id=$1::uuid",
          [makerSession.id],
        );
        assert.equal(cancelledMakerAudit.count, 1,
          "the maker-checker draft must close through exactly one audited cancellation");
        await tx.unsafe("reset role");
        const revokedAdminMakerScope = decodeJson((await (async () => {
          await applyActor(tx, actors.admin);
          return tx.unsafe(
            "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,false,$4::integer) as result",
            [actors.admin.profile_id, fixture.warehouse_id,
              "Revoke temporary exact warehouse scope after maker fixture cancellation",
              Number(adminMakerTemporaryScope.revision)],
          );
        })())[0].result);
        assert.equal(revokedAdminMakerScope.is_active, false,
          "temporary exact warehouse cancellation scope must be revoked after fixture cleanup");

        // Staff has the distinct count-entry capability. Assign the staff member
        // to this warehouse, let them make a full physical count, and have the
        // previously assigned manager approve it as the independent checker.
        await tx.unsafe("reset role");
        const staffScopeRows = await tx.unsafe(
          "select revision from public.authorization_profile_scopes where organization_id=$1::uuid " +
          "and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
          [organizationId, actors.staff.profile_id, fixture.warehouse_id],
        );
        const staffExpectedRevision = staffScopeRows.length ? Number(staffScopeRows[0].revision) : 0;
        await applyActor(tx, actors.admin);
        const staffAssignment = decodeJson((await tx.unsafe(
          "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,$4::integer) as result",
          [actors.staff.profile_id, fixture.warehouse_id, "P2 independent stock-count maker assignment", staffExpectedRevision],
        ))[0].result);
        assert.equal(staffAssignment.is_active, true,
          "the administrator must establish an active warehouse assignment for the count maker");

        await applyActor(tx, actors.staff);
        const staffEntryDecision = decodeJson((await tx.unsafe(
          "select public.current_authorization_decision('inventory.count.enter',$1::uuid) as decision",
          [fixture.warehouse_id],
        ))[0].decision);
        assert.equal(staffEntryDecision.decision, "PERMIT",
          "an assigned staff member may enter physical counts without receiving balance-adjustment or finalization authority");
        const staffKey = "inventory-count-independent-maker-" + process.pid + "-" + Date.now();
        const staffSession = decodeJson((await tx.unsafe(
          "select public.start_stock_count($1::uuid,$2::text,$3::text) as result",
          [fixture.warehouse_id, staffKey, "P2 independent stock-count maker acceptance"],
        ))[0].result);
        assert.equal(staffSession.status, "open");
        const staffLines = await tx.unsafe(
          "select product_id::text,expected_quantity from public.stock_count_lines where session_id=$1::uuid order by product_id",
          [staffSession.id],
        );
        assert.ok(staffLines.length > 0, "independent maker session must snapshot the active warehouse balance set");
        const reviewedQuantity = Number((currentQuantity + 1).toFixed(3));
        let reviewedProductFound = false;
        for (const line of staffLines) {
          const countedQuantity = line.product_id === fixture.product_id
            ? reviewedQuantity
            : Number(line.expected_quantity);
          if (line.product_id === fixture.product_id) reviewedProductFound = true;
          await tx.unsafe(
            "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",
            [staffSession.id, line.product_id, countedQuantity],
          );
        }
        assert.equal(reviewedProductFound, true,
          "the active balance used by this test must be part of the staff's count snapshot");
        const completeDecision = decodeJson((await (async () => {
          await applyActor(tx, actors.manager);
          return tx.unsafe(
            "select public.current_authorization_decision('inventory.count.finalize',$1::uuid) as decision",
            [fixture.warehouse_id],
          );
        })())[0].decision);
        assert.equal(completeDecision.decision, "REQUIRES_APPROVAL",
          "the assigned manager has the separate warehouse-scoped maker-checker review capability");
        const completion = decodeJson((await tx.unsafe(
          "select public.complete_stock_count($1::uuid) as result",
          [staffSession.id],
        ))[0].result);
        assert.equal(completion.status, "completed");
        assert.equal(completion.adjusted_lines, 1,
          "the independent reviewer must apply the one real counted variance atomically");

        const finalState = await tx.unsafe(
          "select s.status,s.started_by::text,s.completed_by::text,l.counted_quantity,l.completed_quantity,l.variance " +
          "from public.stock_count_sessions s join public.stock_count_lines l on l.session_id=s.id " +
          "where s.id=$1::uuid and l.product_id=$2::uuid",
          [staffSession.id, fixture.product_id],
        );
        assert.equal(finalState.length, 1);
        assert.equal(finalState[0].status, "completed");
        assert.equal(finalState[0].started_by, actors.staff.profile_id);
        assert.equal(finalState[0].completed_by, actors.manager.profile_id);
        assert.equal(Number(finalState[0].counted_quantity), reviewedQuantity);
        assert.equal(Number(finalState[0].completed_quantity), reviewedQuantity);
        assert.equal(Number(finalState[0].variance), 1);
        const [balanceAfterReview] = await tx.unsafe(
          "select quantity_on_hand from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
          [fixture.product_id, fixture.warehouse_id],
        );
        assert.equal(Number(balanceAfterReview.quantity_on_hand), reviewedQuantity,
          "an independently approved count must reconcile the canonical stock balance");
        const [movementProof] = await tx.unsafe(
          "select count(*)::integer as count from public.inventory_movements where reference_type='stock_count_session' " +
          "and reference_id=$1::uuid and movement_type='stock_count_adjustment'",
          [staffSession.id],
        );
        assert.equal(movementProof.count, 1,
          "the approved physical variance must write exactly one stock-count movement");
        const [auditProof] = await tx.unsafe(
          "select count(*)::integer as count from public.audit_logs where action='inventory.stock_count.completed' " +
          "and entity_type='stock_count_session' and entity_id=$1::uuid",
          [staffSession.id],
        );
        assert.equal(auditProof.count, 1,
          "the independent finalization must append exactly one completion audit event");

        throw rollbackSentinel;
      });
    } catch (cause) {
      if (cause !== rollbackSentinel) throw cause;
    }

    process.stdout.write(
      "PASS local PostgreSQL 17 RBAC V2 inventory adjustment: manager permit, explicit-deny precedence, " +
      "staff command/read denial, restricted projection, idempotent replay, stale/negative/reserved guards, " +
      "one movement and audit row, append-only history, real sessions, independent stock-count Maker/Checker finalization, " +
      "self-approval and unassigned-review denial, and rollback-only test data.\n",
    );
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
}
main().catch((error) => {
  process.stderr.write("FAIL RBAC V2 inventory adjustment acceptance: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
});
