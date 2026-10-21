import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

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
async function assume(client, userId, email) {
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: userId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated" }),
  ]);
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
    "select public.save_product_price_grid($1::jsonb) as result", [JSON.stringify(changes)],
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
  const apiUrl=new URL(requiredEnv("E2E_SUPABASE_URL"));
  if (apiUrl.protocol!=="http:" || !["localhost","127.0.0.1"].includes(apiUrl.hostname) || apiUrl.port!=="54321") {
    throw new Error("Price-grid acceptance is restricted to local Supabase only.");
  }
  const orgId="a0000000-0000-0000-0000-000000000001";
  const managerEmail=requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
  const customerEmail=requiredEnv("E2E_EMAIL").toLowerCase();
  const db=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const manager=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const clientA=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const clientB=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const customer=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const ids=[randomUUID(),randomUUID()];
  const original=new Map();

  try {
    const managerRows=await db.unsafe(
      "select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true",
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

    await Promise.all([
      assume(manager,mgr.auth_user_id,mgr.email),
      assume(clientA,mgr.auth_user_id,mgr.email),
      assume(clientB,mgr.auth_user_id,mgr.email),
      assume(customer,cust.auth_user_id,cust.email),
    ]);
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
    await db.end({timeout:5}).catch(()=>{});
  }
}
main().catch(error=>{
  process.stderr.write("FAIL price-grid acceptance: "+String(error?.stack??error)+"\n");
  process.exitCode=1;
});
