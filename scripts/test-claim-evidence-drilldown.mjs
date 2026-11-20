import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for claim evidence drill-down acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

const databaseUrl = requiredEnv("TEST_DATABASE_URL");
const supabaseUrl = requiredEnv("E2E_SUPABASE_URL");
validateCashExpenseEndpoints(supabaseUrl, databaseUrl);

const organizationId = "a0000000-0000-0000-0000-000000000001";
const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
const productId = "a1000000-0000-0000-0000-000000000001";
const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(client, authUserId, email) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$2,now(),now(),now(),null,'CI claim evidence read acceptance','127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [authUserId, authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: authUserId,
      email,
      email_confirmed_at: new Date().toISOString(),
      role: "authenticated",
      session_id: authUserId,
    }),
  ]);
  await client.unsafe("set role authenticated");
}

async function lookup(email, role) {
  const rows = await db.unsafe(
    "select p.id,p.auth_user_id,p.email from public.profiles p " +
    (role ? "join public.user_roles r on r.profile_id=p.id " : "") +
    "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true " +
    (role ? "and r.role=$3 " : "") +
    "order by p.id limit 2",
    role ? [organizationId,email,role] : [organizationId,email],
  );
  assert.equal(rows.length, 1, "exactly one active seeded profile must exist for role " + (role ?? "customer"));
  return rows[0];
}

async function expectCode(label, action, expected) {
  let failure;
  try { await action(); } catch (error) { failure = error; }
  assert.ok(failure, label + " must be rejected");
  assert.equal(String(failure.code), expected, label + " SQLSTATE");
}

async function drilldown(client, recordId) {
  const asOf = new Date().toISOString();
  const rows = await client.unsafe(
    "select public.fetch_claim_evidence_drilldown($1::text,$2::uuid,null::date,null::date,$3::timestamptz,0) as result",
    ["inventory.current_balances", recordId, asOf],
  );
  return asJson(rows[0].result);
}

async function main() {
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
  const staffEmail = requiredEnv("E2E_STAFF_EMAIL");
  const manager = await lookup(managerEmail, "manager");
  const staff = await lookup(staffEmail, "staff");

  const managerDb = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  const staffDb = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  const foreignProductId = randomUUID();
  const foreignWarehouseId = randomUUID();

  try {
    await Promise.all([
      setIdentity(managerDb, manager.auth_user_id, manager.email),
      setIdentity(staffDb, staff.auth_user_id, staff.email),
    ]);

    // Create an actual balance in a second tenant. A manager from tenant A must
    // receive NOT_FOUND rather than that tenant's quantity, unit, or warehouse count.
    const foreignOrg = await db.unsafe(
      "select id from public.organizations where id=$1::uuid and is_active=true",
      [foreignOrganizationId],
    );
    assert.equal(foreignOrg.length, 1, "the isolated second organization fixture must exist");

    await db.unsafe(
      "insert into public.products(id,organization_id,category_id,name,item_code,barcode,description,unit,base_price,cost_price,min_stock,status) " +
      "values($1::uuid,$2::uuid,null,'P2 Foreign Evidence Product',$3,null,'second-tenant isolation fixture','piece',120,30,0,'active')",
      [foreignProductId, foreignOrganizationId, "P2-FE-" + foreignProductId.slice(0,8).toUpperCase()],
    );
    await db.unsafe(
      "insert into public.warehouses(id,organization_id,branch_id,name,code,is_active) " +
      "values($1::uuid,$2::uuid,null,'P2 Foreign Evidence Warehouse',$3,true)",
      [foreignWarehouseId, foreignOrganizationId, "P2-FE-" + foreignWarehouseId.slice(0,8).toUpperCase()],
    );
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
      "values($1::uuid,$2::uuid,77,7,9)",
      [foreignProductId, foreignWarehouseId],
    );

    const before = await db.unsafe(
      "select count(*)::integer as rows,coalesce(sum(quantity_on_hand),0)::text as on_hand " +
      "from public.inventory_balances where product_id=$1::uuid",
      [productId],
    );
    assert.ok(Number(before[0].rows) >= 3, "seeded product must have real multi-warehouse balances");

    const response = await drilldown(managerDb, productId);
    assert.equal(response.status, "OK");
    assert.equal(response.sourceName, "inventory.current_balances");
    assert.equal(response.sideEffects, "NONE");
    assert.equal(response.authorization?.tenantScope, "SERVER_RESOLVED_AUTHENTICATED_TENANT");
    assert.equal(response.authorization?.effectiveRole, "manager");
    assert.equal(Array.isArray(response.rows), true);
    assert.equal(response.rows.length, 1);
    const row = response.rows[0];
    assert.equal(Number(row.quantityAvailable), Number(before[0].on_hand));
    assert.equal(Number(row.reorderPoint), 0);
    assert.equal(row.unit, "carton");
    assert.equal(row.warehouseCount, Number(before[0].rows));
    assert.deepEqual(
      Object.keys(row).sort(),
      ["quantityAvailable","reorderPoint","unit","warehouseCount","lastUpdatedAt"].sort(),
      "the raw source DTO must contain only the five explicitly allowlisted fields",
    );
    for (const forbidden of ["base_price","cost_price","costPrice","margin","customerEmail","organizationId","warehouseId","storagePath"]) {
      assert.equal(Object.hasOwn(row, forbidden), false, "forbidden field " + forbidden + " must never escape the RPC");
    }

    const foreignResponse = await drilldown(managerDb, foreignProductId);
    assert.equal(foreignResponse.status, "NOT_FOUND");
    assert.deepEqual(foreignResponse.rows, [], "a same-shaped row in another tenant must remain invisible");

    await expectCode(
      "staff cannot use the administrator evidence source reader",
      () => drilldown(staffDb, productId),
      "42501",
    );

    const unsupportedRows = await managerDb.unsafe(
      "select public.fetch_claim_evidence_drilldown($1::text,$2::uuid,null::date,null::date,$3::timestamptz,0) as result",
      ["public.profiles", productId, new Date().toISOString()],
    );
    const unsupported = asJson(unsupportedRows[0].result);
    assert.equal(unsupported.status, "UNSUPPORTED");
    assert.deepEqual(unsupported.rows, []);
    assert.equal(unsupported.sideEffects, "NONE");

    const after = await db.unsafe(
      "select count(*)::integer as rows,coalesce(sum(quantity_on_hand),0)::text as on_hand " +
      "from public.inventory_balances where product_id=$1::uuid",
      [productId],
    );
    assert.deepEqual(after[0], before[0], "read-only drill-down must not modify any stock balance");

    process.stdout.write(
      "PASS PostgreSQL 17 claim evidence drill-down: manager reads the real three-warehouse inventory aggregate; " +
      "staff is denied with 42501; an existing foreign-tenant stock row returns NOT_FOUND; " +
      "source allowlist rejects public.profiles; response DTO contains only safe fields; stock balances are unchanged.\\n",
    );
  } finally {
    await Promise.all([managerDb.end(),staffDb.end()]);
    // This script only removes its own independent foreign-tenant fixtures.
    await db.unsafe("delete from public.inventory_balances where product_id=$1::uuid",[foreignProductId]).catch(()=>{});
    await db.unsafe("delete from public.products where id=$1::uuid and organization_id=$2::uuid",[foreignProductId,foreignOrganizationId]).catch(()=>{});
    await db.unsafe("delete from public.warehouses where id=$1::uuid and organization_id=$2::uuid",[foreignWarehouseId,foreignOrganizationId]).catch(()=>{});
  }
}

main().catch((error) => {
  process.stderr.write("FAIL PostgreSQL 17 claim evidence drill-down acceptance: " + String(error?.stack ?? error) + "\\n");
  process.exitCode = 1;
}).finally(() => db.end({ timeout: 5 }).catch(() => {}));
