import assert from "node:assert/strict";
import postgres from "postgres";

function requiredEnv(name) {
 const value=process.env[name]?.trim();
 if(!value) throw new Error(name+" is required for authorization capability acceptance.");
 return value.replace(/^"(.*)"$/s,"$1");
}
function localOnly(connectionString) {
 const database=new URL(connectionString);
 if(!["127.0.0.1","localhost"].includes(database.hostname)||!/^\d+$/.test(database.port)||
    Number(database.port)<1||Number(database.port)>65535) {
  throw new Error("Authorization capability acceptance refuses non-loopback PostgreSQL endpoints.");
 }
}
async function withActor(db,actor,callback) {
 return db.begin(async(tx)=>{
  await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)",[actor.auth_user_id]);
  await tx.unsafe("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor.auth_user_id,role:"authenticated"})]);
  await tx.unsafe("set local role authenticated");
  return callback(tx);
 });
}
async function decision(db,actor,key) {
 return withActor(db,actor,async(tx)=>{
  const rows=await tx.unsafe("select public.current_authorization_decision($1::text) as decision,public.current_actor_has_capability($1::text) as allowed",[key]);
  const value=typeof rows[0].decision==="string"?JSON.parse(rows[0].decision):rows[0].decision;
  return {...value,allowed:rows[0].allowed};
 });
}
async function main() {
 const connectionString=requiredEnv("TEST_DATABASE_URL");
 localOnly(connectionString);
 const db=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
 try {
  const profiles=await db.unsafe(
   "select p.id::text as profile_id,p.auth_user_id::text as auth_user_id,p.organization_id::text as organization_id,"+
   "p.email,array_agg(r.role order by r.role) as roles from public.profiles p "+
   "join public.user_roles r on r.profile_id=p.id where p.is_active=true and p.auth_user_id is not null "+
   "and p.organization_id is not null group by p.id,p.auth_user_id,p.organization_id,p.email order by p.created_at,p.id");
  const org=profiles.find(p=>p.roles.includes("manager"))?.organization_id;
  assert.ok(org,"P2 local seed must provide a manager organization");
  const actors=new Map();
  for(const role of ["admin","manager","staff","accountant","customer_manager","customer"]) {
   const actor=profiles.find(p=>p.organization_id===org&&p.roles.includes(role));
   assert.ok(actor,"P2 local seed must provide "+role+" within the manager organization");
   actors.set(role,actor);
  }

  const expectedPairs=[
   ["admin","pricing.edit_draft"],["manager","pricing.edit_draft"],
   ["admin","pricing.propose"],["manager","pricing.propose"],["staff","pricing.propose"],
   ["admin","pricing.approve"],["manager","pricing.approve"],
   ["admin","catalog.product.lifecycle"],["manager","catalog.product.lifecycle"],
   ["admin","inventory.reorder_point.write"],["manager","inventory.reorder_point.write"],
   ["admin","inventory.transfer.create"],["manager","inventory.transfer.create"],["staff","inventory.transfer.create"],
   ["admin","inventory.count.enter"],["manager","inventory.count.enter"],["staff","inventory.count.enter"],
   ["admin","inventory.count.finalize"],["manager","inventory.count.finalize"],
   ["admin","customers.lifecycle.write"],["manager","customers.lifecycle.write"],["customer_manager","customers.lifecycle.write"],
   ["admin","customers.account.activate"],["manager","customers.account.activate"],["staff","customers.account.activate"],["customer_manager","customers.account.activate"],
   ["admin","customers.read_financial"],["manager","customers.read_financial"],["accountant","customers.read_financial"],
   ["admin","imports.batch.stage"],["manager","imports.batch.stage"],["staff","imports.batch.stage"],
   ["admin","imports.batch.publish"],["manager","imports.batch.publish"],
   ["admin","purchasing.orders.manage"],["manager","purchasing.orders.manage"],
   ["admin","operations.task.status.write"],["manager","operations.task.status.write"],["staff","operations.task.status.write"],["accountant","operations.task.status.write"],
   ["admin","finance.workspace.manage"],["manager","finance.workspace.manage"],["accountant","finance.workspace.manage"],
   ["admin","identity.roles.assign"],["admin","audit.intelligence.read"],["manager","audit.intelligence.read"]
  ].map(([r,k])=>r+"|"+k).sort();
  const actual=await db.unsafe("select role,capability_key from public.authorization_role_capabilities where grant_source='legacy-role-parity:ADMIN_OPERATION_RULES'");
  assert.deepEqual(actual.map(r=>r.role+"|"+r.capability_key).sort(),expectedPairs,"server grants must exactly preserve the old ADMIN_OPERATION_RULES matrix");

  const checks=[
   ["admin","identity.roles.assign",true],["manager","identity.roles.assign",false],
   ["manager","pricing.edit_draft",true],["staff","pricing.propose",true],
   ["staff","pricing.approve",false],["staff","inventory.transfer.create",true],
   ["accountant","finance.workspace.manage",true],["accountant","catalog.internal_prices.read",false],
   ["customer_manager","customers.lifecycle.write",true],["customer_manager","customers.read_financial",false],
   ["customer","orders.create_draft",false],["staff","orders.approve",false],["admin","finance.journal.post",false]
  ];
  for(const [role,key,allowed] of checks) {
   const result=await decision(db,actors.get(role),key);
   assert.equal(result.decision,allowed?"PERMIT":"DENY",role+" "+key);
   assert.equal(result.allowed,allowed,role+" boolean "+key);
  }

  const noIdentity=await db.unsafe("select public.current_authorization_decision('finance.workspace.manage') as decision");
  const noIdentityValue=typeof noIdentity[0].decision==="string"?JSON.parse(noIdentity[0].decision):noIdentity[0].decision;
  assert.equal(noIdentityValue.decision,"DENY");
  assert.equal((await decision(db,actors.get("manager"),"system.root")).decision,"DENY");
  assert.equal((await decision(db,actors.get("manager"),"orders.read")).decision,"DENY");

  const managerContext=await withActor(db,actors.get("manager"),tx=>tx.unsafe("select public.get_current_tenant_context() as context"));
  const staffContext=await withActor(db,actors.get("staff"),tx=>tx.unsafe("select public.get_current_tenant_context() as context"));
  assert.equal(managerContext[0].context.can_view_internal_product_prices,true);
  assert.equal(staffContext[0].context.can_view_internal_product_prices,false);

  for(const sql of [
   "select * from public.fetch_staff_products(NULL::uuid)",
   "select * from public.get_storefront_product_prices(ARRAY[gen_random_uuid()]::uuid[],1)"
  ]) await assert.rejects(
   ()=>withActor(db,actors.get("staff"),tx=>tx.unsafe(sql)),
   error=>error&&String(error.code)==="42501",
   "ordinary staff must be denied the full financial product row and internal price RPC"
  );

  const manager=actors.get("manager"),admin=actors.get("admin");
  const deny=await withActor(db,admin,tx=>tx.unsafe(
   "select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',$2::text,NULL::timestamptz,true) as result",
   [manager.profile_id,"Temporary authorization acceptance denial"]));
  assert.equal(deny[0].result.changed,true);
  assert.equal((await decision(db,manager,"pricing.edit_draft")).decision,"DENY");
  const before=await db.unsafe("select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='authorization.capability.explicit_deny.changed' and entity_id=$2::uuid",[org,deny[0].result.denial_id]);
  const replay=await withActor(db,admin,tx=>tx.unsafe(
   "select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',$2::text,NULL::timestamptz,true) as result",
   [manager.profile_id,"Temporary authorization acceptance denial"]));
  assert.equal(replay[0].result.changed,false,"same deny replay must be idempotent");
  const after=await db.unsafe("select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='authorization.capability.explicit_deny.changed' and entity_id=$2::uuid",[org,deny[0].result.denial_id]);
  assert.equal(after[0].count,before[0].count,"idempotent replay must not duplicate audit");
  await withActor(db,admin,tx=>tx.unsafe("select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',NULL,NULL::timestamptz,false)",[manager.profile_id]));
  assert.equal((await decision(db,manager,"pricing.edit_draft")).decision,"PERMIT");

  await assert.rejects(
   ()=>withActor(db,admin,tx=>tx.unsafe(
    "select public.set_authorization_profile_denial($1::uuid,'identity.roles.assign',$2::text,NULL::timestamptz,true)",
    [admin.profile_id,"Cannot lock out the last administrator"])),
   error=>error&&String(error.code)==="42501",
   "last active administrator must retain authorization administration"
  );

  for(const sql of ["select * from public.authorization_capabilities","select * from public.authorization_role_capabilities","select * from public.authorization_profile_denials"]) {
   await assert.rejects(
    ()=>withActor(db,manager,tx=>tx.unsafe(sql)),
    error=>error&&String(error.code)==="42501",
    "authenticated clients must not query the internal authorization tables"
   );
  }
  process.stdout.write("PASS authorization capability registry: exact six-role parity, server identity, deny-by-default, scope fail-closed, explicit-deny precedence, idempotent audit, last-admin protection, and product financial RPC boundaries\n");
 } finally { await db.end({timeout:5}).catch(()=>{}); }
}
main().catch(error=>{process.stderr.write("FAIL authorization capability registry acceptance: "+String(error?.stack??error)+"\n");process.exitCode=1;});
