import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated price-grid acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) { return typeof value === "string" ? JSON.parse(value) : value; }
function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 999999999999) throw new Error("Non-finite or out-of-range test price.");
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function prices(row) {
  return {
    base_price: money(row.base_price),
    price_wholesale_of_wholesale: money(row.price_wholesale_of_wholesale),
    price_wholesale: money(row.price_wholesale),
    price_retail: money(row.price_retail),
  };
}
function shift(row, delta) {
  return {
    base_price: money(row.base_price + delta),
    price_wholesale_of_wholesale: money(row.price_wholesale_of_wholesale + delta),
    price_wholesale: money(row.price_wholesale + delta),
    price_retail: money(row.price_retail + delta),
  };
}
function payload(id, expected, next) {
  return {
    id,
    expected_base_price: expected.base_price,
    expected_price_wholesale_of_wholesale: expected.price_wholesale_of_wholesale,
    expected_price_wholesale: expected.price_wholesale,
    expected_price_retail: expected.price_retail,
    base_price: next.base_price,
    price_wholesale_of_wholesale: next.price_wholesale_of_wholesale,
    price_wholesale: next.price_wholesale,
    price_retail: next.price_retail,
  };
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function obtainLiveAuthClaims(supabaseUrl, publishableKey, email, password, expectedUserId) {
  const endpoint = new URL("/auth/v1/token?grant_type=password", supabaseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error("Local Supabase Auth could not issue a password-authenticated session for a P2 fixture user (HTTP " + response.status + ").");
  }

  const tokenParts = body.access_token.split(".");
  if (tokenParts.length !== 3 || !tokenParts[1]) {
    throw new Error("Local Supabase Auth returned an invalid access-token shape for a P2 fixture user.");
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(tokenParts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Local Supabase Auth returned unreadable access-token claims for a P2 fixture user.");
  }

  const expiresAt = Number(claims?.exp);
  if (
    claims?.sub !== expectedUserId ||
    claims?.role !== "authenticated" ||
    !UUID_PATTERN.test(String(claims?.session_id ?? "")) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Local Supabase Auth did not issue a current session-bound authenticated token for the expected P2 fixture user.");
  }
  return claims;
}

async function setClaims(client, claims) {
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [claims.sub]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
}
async function assume(client, claims) {
  await setClaims(client, claims);
  await client.unsafe("set role authenticated");
}
async function readGrid(client, id) {
  const rows = await client.unsafe(
    "select id,base_price,price_wholesale_of_wholesale,price_wholesale,price_retail " +
    "from public.get_admin_product_price_grid() where id=$1::uuid", [id],
  );
  assert.equal(rows.length, 1, "authorized grid read must return exactly one test product");
  return { id, ...prices(rows[0]) };
}
async function save(client, changes) {
  return asJson((await client.unsafe(
    "select public.save_product_price_grid($1::jsonb) as result", [client.json(changes)],
  ))[0].result);
}
async function auditCount(db, orgId, id) {
  const rows = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
    "where organization_id=$1::uuid and entity_type='product' and entity_id=$2::uuid " +
    "and action='product.price_grid_updated'", [orgId,id],
  );
  return rows[0].count;
}
async function expectFailure(label, operation, pattern) {
  let error;
  try { await operation(); } catch (caught) { error = caught; }
  assert.ok(error, label + " must fail");
  assert.match(String(error.message), pattern, label + " must fail for the expected reason");
  return error;
}
async function main() {
  const connectionString=requiredEnv("TEST_DATABASE_URL");
  validateCashExpenseEndpoints(requiredEnv("E2E_SUPABASE_URL"), connectionString);
  const orgId="a0000000-0000-0000-0000-000000000001";
  const supabaseUrl=requiredEnv("E2E_SUPABASE_URL");
  const publishableKey=requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
  const managerEmail=requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
  const managerPassword=requiredEnv("E2E_MANAGER_PASSWORD");
  const customerEmail=requiredEnv("E2E_EMAIL").toLowerCase();
  const customerPassword=requiredEnv("E2E_PASSWORD");
  const db=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const privilegedProbe=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const manager=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const clientA=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const clientB=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const customer=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const ids=[randomUUID(),randomUUID()];
  const original=new Map();

  try {
    const managerRows=await db.unsafe(
      "select id,auth_user_id,email,organization_id,is_active from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true",
      [orgId,managerEmail],
    );
    assert.equal(managerRows.length,1,"the local fixture must provide one same-tenant manager");
    const mgr=managerRows[0];
    const customerRows=await db.unsafe(
      "select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true",
      [orgId,customerEmail],
    );
    assert.equal(customerRows.length,1,"the local fixture must provide one same-tenant customer");
    const cust=customerRows[0];

    for (let i=0;i<ids.length;i++) {
      const id=ids[i], suffix=id.replaceAll("-","").slice(-12).toUpperCase();
      const base=i===0?100:50, vip=i===0?90:45, wholesale=i===0?95:48, retail=i===0?110:60;
      await db.unsafe(
        "insert into public.products(id,organization_id,name,item_code,unit,base_price,wholesale_price,retail_price,status) " +
        "values($1::uuid,$2::uuid,$3,$4,'piece',$5,$6,$7,'inactive')",
        [id,orgId,"P2 Price Grid Acceptance "+suffix,"P2-PRICE-"+suffix,base,wholesale,retail],
      );
      await db.unsafe(
        "insert into public.product_prices(product_id,tier,price,min_quantity,is_active) values " +
        "($1::uuid,'vip',$2,1,true),($1::uuid,'wholesale',$3,1,true),($1::uuid,'retail',$4,1,true)",
        [id,vip,wholesale,retail],
      );
    }

    // Use genuine tokens minted by local Supabase Auth. The tenant helper requires
    // session_id to match an active auth.sessions row; a synthetic sub-only claim
    // is intentionally invalid and must not be used by this acceptance.
    const [managerClaims, customerClaims] = await Promise.all([
      obtainLiveAuthClaims(supabaseUrl,publishableKey,managerEmail,managerPassword,mgr.auth_user_id),
      obtainLiveAuthClaims(supabaseUrl,publishableKey,customerEmail,customerPassword,cust.auth_user_id),
    ]);
    for (const [label,claims,expectedUserId] of [
      ["manager",managerClaims,mgr.auth_user_id],
      ["customer",customerClaims,cust.auth_user_id],
    ]) {
      const activeSessions = await db.unsafe(
        "select id::text,user_id::text from auth.sessions " +
        "where id=$1::uuid and user_id=$2::uuid and (not_after is null or not_after > pg_catalog.now())",
        [claims.session_id,expectedUserId],
      );
      assert.equal(activeSessions.length,1,"the " + label + " token must map to one live Supabase Auth session row");
    }

    // Compare helper results before and after SET ROLE using the same live token.
    await setClaims(privilegedProbe,managerClaims);
    const privilegedContext = (await privilegedProbe.unsafe(
      "select auth.uid()::text as auth_user_id, public.current_profile_id()::text as profile_id, " +
      "public.current_organization_id()::text as organization_id, " +
      "public.current_auth_session_id()::text as session_id, current_user as database_role, " +
      "current_setting('role',true) as active_role, " +
      "(select p.id::text from public.profiles p where p.auth_user_id=auth.uid() order by p.id limit 1) as visible_profile_id, " +
      "(select count(*)::integer from public.profiles p where p.auth_user_id=auth.uid()) as visible_profile_count, " +
      "(select p.organization_id::text from public.profiles p where p.auth_user_id=auth.uid() order by p.id limit 1) as visible_profile_organization_id, " +
      "(select pg_catalog.pg_get_userbyid(pr.proowner) from pg_catalog.pg_proc pr where pr.oid='public.current_profile_id()'::regprocedure) as current_profile_function_owner, " +
      "(select pr.prosecdef from pg_catalog.pg_proc pr where pr.oid='public.current_profile_id()'::regprocedure) as current_profile_security_definer, " +
      "(select pr.proconfig::text from pg_catalog.pg_proc pr where pr.oid='public.current_profile_id()'::regprocedure) as current_profile_function_config, " +
      "(select pg_catalog.pg_get_functiondef(pr.oid) from pg_catalog.pg_proc pr where pr.oid='public.current_profile_id()'::regprocedure) as current_profile_function_definition, " +
      "(select pg_catalog.pg_get_userbyid(pr.proowner) from pg_catalog.pg_proc pr where pr.oid='public.current_organization_id()'::regprocedure) as current_org_function_owner, " +
      "(select pr.prosecdef from pg_catalog.pg_proc pr where pr.oid='public.current_organization_id()'::regprocedure) as current_org_security_definer, " +
      "(select pr.proconfig::text from pg_catalog.pg_proc pr where pr.oid='public.current_organization_id()'::regprocedure) as current_org_function_config, " +
      "(select pg_catalog.pg_get_functiondef(pr.oid) from pg_catalog.pg_proc pr where pr.oid='public.current_organization_id()'::regprocedure) as current_org_function_definition, " +
      "(select r.rolbypassrls from pg_catalog.pg_roles r where r.rolname=" +
      "(select pg_catalog.pg_get_userbyid(pr.proowner) from pg_catalog.pg_proc pr where pr.oid='public.current_profile_id()'::regprocedure)) as current_profile_owner_bypasses_rls, " +
      "(select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.profiles'::regclass) as profiles_rls_enabled, " +
      "(select c.relforcerowsecurity from pg_catalog.pg_class c where c.oid='public.profiles'::regclass) as profiles_force_rls",
    ))[0];

    await setClaims(manager,managerClaims);
    const managerPreRole = (await manager.unsafe(
      "select auth.uid()::text as auth_user_id, public.current_profile_id()::text as profile_id, " +
      "public.current_organization_id()::text as organization_id, " +
      "public.current_auth_session_id()::text as session_id, current_user as database_role, " +
      "current_setting('role',true) as active_role",
    ))[0];
    await manager.unsafe("set role authenticated");
    await Promise.all([
      assume(clientA,managerClaims),
      assume(clientB,managerClaims),
      assume(customer,customerClaims),
    ]);
    const managerContextRows = await manager.unsafe(
      "select auth.uid()::text as auth_user_id, " +
      "public.current_profile_id()::text as profile_id, " +
      "public.current_organization_id()::text as organization_id, " +
      "public.current_auth_session_id()::text as session_id, " +
      "current_user as database_role, session_user as session_role, " +
      "current_setting('role',true) as active_role, " +
      "current_setting('request.jwt.claim.sub',true) as jwt_subject, " +
      "(select p.id::text from public.profiles p where p.auth_user_id=auth.uid() order by p.id limit 1) as visible_profile_id, " +
      "(select count(*)::integer from public.profiles p where p.auth_user_id=auth.uid()) as visible_profile_count, " +
      "(select p.organization_id::text from public.profiles p where p.auth_user_id=auth.uid() order by p.id limit 1) as visible_profile_organization_id, " +
      "(select pg_catalog.pg_get_userbyid(pr.proowner) from pg_catalog.pg_proc pr where pr.oid='public.current_profile_id()'::regprocedure) as current_profile_function_owner, " +
      "(select pr.prosecdef from pg_catalog.pg_proc pr where pr.oid='public.current_profile_id()'::regprocedure) as current_profile_security_definer, " +
      "(select pr.proconfig::text from pg_catalog.pg_proc pr where pr.oid='public.current_profile_id()'::regprocedure) as current_profile_function_config, " +
      "(select pg_catalog.pg_get_userbyid(pr.proowner) from pg_catalog.pg_proc pr where pr.oid='public.current_organization_id()'::regprocedure) as current_org_function_owner, " +
      "(select pr.prosecdef from pg_catalog.pg_proc pr where pr.oid='public.current_organization_id()'::regprocedure) as current_org_security_definer, " +
      "(select pr.proconfig::text from pg_catalog.pg_proc pr where pr.oid='public.current_organization_id()'::regprocedure) as current_org_function_config, " +
      "(select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.profiles'::regclass) as profiles_rls_enabled, " +
      "(select c.relforcerowsecurity from pg_catalog.pg_class c where c.oid='public.profiles'::regclass) as profiles_force_rls, " +
      "(select string_agg(p.policyname || ':' || p.permissive || ':' || p.cmd, ';' order by p.policyname) " +
      "from pg_catalog.pg_policies p where p.schemaname='public' and p.tablename='profiles') as profiles_policies, " +
      "exists (select 1 from public.profiles p join public.user_roles r on r.profile_id=p.id " +
      "where p.auth_user_id=auth.uid() and p.is_active=true and p.organization_id=$1::uuid " +
      "and r.role in ('admin','manager')) as has_admin_manager_role",
      [orgId],
    );
    const managerContext = {
      ...managerContextRows[0],
      fixture_profile_id: mgr.id,
      fixture_auth_user_id: mgr.auth_user_id,
      fixture_organization_id: mgr.organization_id,
      fixture_is_active: mgr.is_active,
      fixture_auth_user_matches_privileged_probe: mgr.auth_user_id === privilegedContext.auth_user_id,
      fixture_profile_matches_privileged_helper: mgr.id === privilegedContext.profile_id,
      privileged_context: privilegedContext,
      pre_role_context: managerPreRole,
    };
    if (
      managerContext?.auth_user_id !== mgr.auth_user_id ||
      managerContext?.profile_id !== mgr.id ||
      managerContext?.organization_id !== orgId ||
      managerContext?.session_id !== managerClaims.session_id ||
      managerContext?.pre_role_context?.profile_id !== mgr.id ||
      managerContext?.pre_role_context?.organization_id !== orgId ||
      managerContext?.pre_role_context?.session_id !== managerClaims.session_id ||
      managerContext?.privileged_context?.profile_id !== mgr.id ||
      managerContext?.privileged_context?.organization_id !== orgId ||
      managerContext?.privileged_context?.session_id !== managerClaims.session_id ||
      managerContext?.database_role !== "authenticated" ||
      managerContext?.jwt_subject !== mgr.auth_user_id ||
      managerContext?.has_admin_manager_role !== true
    ) {
      throw new Error("P2 price-grid manager identity/role context is invalid: " + JSON.stringify(managerContext));
    }
    for (const id of ids) original.set(id,await readGrid(manager,id));
    const auditBefore=new Map();
    for (const id of ids) auditBefore.set(id,await auditCount(db,orgId,id));

    const first=original.get(ids[0]), second=original.get(ids[1]);
    const successful=await save(manager,[payload(ids[0],first,shift(first,1)),payload(ids[1],second,shift(second,2))]);
    assert.equal(Number(successful.updated_count),2,"success result must give the exact committed row count");
    assert.deepEqual(new Set(successful.product_ids),new Set(ids),"success result must name exactly the committed rows");
    for (const [index,id] of ids.entries()) {
      const expected=shift(original.get(id),index===0?1:2);
      assert.deepEqual(prices(await readGrid(manager,id)),expected,"all four prices must persist for row "+id);
      assert.equal(await auditCount(db,orgId,id),auditBefore.get(id)+1,"each committed changed row needs one audit event");
      const actor=await db.unsafe(
        "select actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='product' and entity_id=$2::uuid " +
        "and action='product.price_grid_updated' order by created_at desc limit 1",[orgId,id],
      );
      assert.equal(actor[0]?.actor_id,mgr.id,"price audit must record the current manager profile");
    }

    // Validate the all-or-nothing transaction boundary when a later row is invalid.
    const beforeFailure=new Map(), auditBeforeFailure=new Map();
    for (const id of ids) {
      beforeFailure.set(id,await readGrid(manager,id));
      auditBeforeFailure.set(id,await auditCount(db,orgId,id));
    }
    const failureA=beforeFailure.get(ids[0]), failureB=beforeFailure.get(ids[1]);
    await expectFailure("invalid later row must abort the entire price batch",()=>save(manager,[
      payload(ids[0],failureA,shift(failureA,3)),
      payload(ids[1],failureB,{...shift(failureB,3),price_retail:-1}),
    ]),/Prices must be non-negative/i);
    for (const id of ids) {
      assert.deepEqual(prices(await readGrid(manager,id)),prices(beforeFailure.get(id)),"failed batch must roll back every earlier price row");
      assert.equal(await auditCount(db,orgId,id),auditBeforeFailure.get(id),"failed batch must not leave partial audit rows");
    }

    await expectFailure("duplicate row identifiers must be rejected",()=>save(manager,[
      payload(ids[0],failureA,shift(failureA,4)),
      payload(ids[0],failureA,shift(failureA,5)),
    ]),/duplicate product ids/i);
    for (const id of ids) assert.deepEqual(prices(await readGrid(manager,id)),prices(beforeFailure.get(id)));

    // Two writers submit the same expected snapshot. Exactly one may win.
    const concurrentBase=await readGrid(manager,ids[0]);
    const concurrentAudit=await auditCount(db,orgId,ids[0]);
    const race=await Promise.allSettled([
      save(clientA,[payload(ids[0],concurrentBase,shift(concurrentBase,3))]),
      save(clientB,[payload(ids[0],concurrentBase,shift(concurrentBase,4))]),
    ]);
    const ok=race.filter(x=>x.status==="fulfilled");
    const rejected=race.filter(x=>x.status==="rejected");
    assert.equal(ok.length,1,"one and only one concurrent price update may commit");
    assert.equal(rejected.length,1,"the stale concurrent price update must be rejected");
    assert.match(String(rejected[0].reason?.message??""),/changed after the grid was loaded/i);
    assert.equal(await auditCount(db,orgId,ids[0]),concurrentAudit+1,"the losing stale writer must not add an audit event");

    const customerTarget=await readGrid(manager,ids[0]);
    await expectFailure("ordinary customer must not write administrative prices",()=>save(customer,[
      payload(ids[0],customerTarget,shift(customerTarget,1)),
    ]),/active admin or manager/i);

    // Restore the test-only products to their starting values before the ephemeral DB is destroyed.
    const restore=[];
    for (const id of ids) {
      const before=original.get(id), now=await readGrid(manager,id);
      if (JSON.stringify(prices(now))!==JSON.stringify(prices(before))) restore.push(payload(id,now,prices(before)));
    }
    if (restore.length) await save(manager,restore);
    process.stdout.write("PASS price-grid acceptance: atomic two-row commit, committed row identifiers, actor audit, all-or-nothing rollback, duplicate-row rejection, stale-writer concurrency and customer-role denial\n");
  } finally {
    await customer.end({timeout:5}).catch(()=>{});
    await clientB.end({timeout:5}).catch(()=>{});
    await clientA.end({timeout:5}).catch(()=>{});
    await manager.end({timeout:5}).catch(()=>{});
    await privilegedProbe.end({timeout:5}).catch(()=>{});
    await db.end({timeout:5}).catch(()=>{});
  }
}
main().catch(error=>{
  process.stderr.write("FAIL price-grid acceptance: "+String(error?.stack??error)+"\n");
  process.exitCode=1;
});
