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
function localSupabaseOnly(value) {
 const api=new URL(value);
 if(api.protocol!=="http:"||!["127.0.0.1","localhost"].includes(api.hostname)||api.port!=="54321") throw new Error("Authorization acceptance requires loopback local Supabase Auth.");
 return api;
}
async function signInLocal(apiUrl,publishableKey,email,password,expectedUserId) {
 const response=await fetch(new URL("/auth/v1/token?grant_type=password",apiUrl),{
  method:"POST",headers:{apikey:publishableKey,"Content-Type":"application/json"},body:JSON.stringify({email,password})
 });
 const payload=await response.json().catch(()=>null);
 if(!response.ok||typeof payload?.access_token!=="string") throw new Error("Local Supabase Auth sign-in failed (HTTP "+response.status+").");
 const parts=payload.access_token.split(".");
 if(parts.length!==3) throw new Error("Local Supabase issued a malformed JWT.");
 const claims=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
 if(claims.sub!==expectedUserId||typeof claims.session_id!=="string") throw new Error("JWT is missing expected user/session identity.");
 return claims;
}
async function withActor(db,actor,callback) {
 if(!actor.jwtClaims?.session_id) throw new Error("A live Auth session is required for this role.");
 return db.begin(async(tx)=>{
  await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)",[actor.auth_user_id]);
  await tx.unsafe("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({...actor.jwtClaims,role:"authenticated"})]);
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
 const apiUrl=localSupabaseOnly(requiredEnv("SUPABASE_URL"));
 const publishableKey=requiredEnv("SUPABASE_PUBLISHABLE_KEY");
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

  const loginEnv={
   admin:["E2E_DEVICE_ADMIN_EMAIL","E2E_DEVICE_ADMIN_PASSWORD"],
   manager:["E2E_MANAGER_EMAIL","E2E_MANAGER_PASSWORD"],
   staff:["E2E_STAFF_EMAIL","E2E_STAFF_PASSWORD"],
   accountant:["E2E_ACCOUNTANT_EMAIL","E2E_ACCOUNTANT_PASSWORD"],
   customer_manager:["E2E_CUSTOMER_MANAGER_EMAIL","E2E_CUSTOMER_MANAGER_PASSWORD"],
   customer:["E2E_EMAIL","E2E_PASSWORD"]
  };
  for(const [role,actor] of actors) {
   const [emailName,passwordName]=loginEnv[role];
   actor.jwtClaims=await signInLocal(apiUrl,publishableKey,requiredEnv(emailName),requiredEnv(passwordName),actor.auth_user_id);
   const liveSession=await db.unsafe(
    "select id::text from auth.sessions where id=$1::uuid and user_id=$2::uuid and (not_after is null or not_after>now())",
    [actor.jwtClaims.session_id,actor.auth_user_id]
   );
   assert.equal(liveSession.length,1,role+" must have a real live session in auth.sessions");
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

  const commandFlags=await Promise.all([
   withActor(db,manager,tx=>tx.unsafe("select public.purchase_orders_can_manage() as purchasing,public.can_manage_finance() as finance")),
   withActor(db,actors.get("accountant"),tx=>tx.unsafe("select public.purchase_orders_can_manage() as purchasing,public.can_manage_finance() as finance")),
   withActor(db,actors.get("staff"),tx=>tx.unsafe("select public.purchase_orders_can_manage() as purchasing,public.can_manage_finance() as finance"))
  ]);
  assert.equal(commandFlags[0][0].purchasing,true);
  assert.equal(commandFlags[0][0].finance,true);
  assert.equal(commandFlags[1][0].purchasing,false);
  assert.equal(commandFlags[1][0].finance,true);
  assert.equal(commandFlags[2][0].purchasing,false);
  assert.equal(commandFlags[2][0].finance,false);

  const deniedCommands=[
   [actors.get("accountant"),"select public.transfer_inventory(NULL::uuid,NULL::uuid,NULL::uuid,1::numeric,'denied','authz-test-key-0001')"],
   [actors.get("accountant"),"select public.start_stock_count(NULL::uuid,'authz-test-count-key-0001',NULL)"],
   [actors.get("accountant"),"select public.set_stock_count_line(NULL::uuid,NULL::uuid,1::numeric)"],
   [actors.get("staff"),"select public.complete_stock_count(NULL::uuid)"],
   [actors.get("staff"),"select public.cancel_stock_count(NULL::uuid,'denied')"],
   [actors.get("staff"),"select public.save_product_price_grid('[]'::jsonb)"],
   [actors.get("staff"),"select public.fetch_purchase_orders()"],
   [actors.get("staff"),"select public.record_cash_expense(gen_random_uuid(),'test','denied',1::numeric)"]
  ];
  for(const [actor,sql] of deniedCommands) {
   await assert.rejects(
    ()=>withActor(db,actor,tx=>tx.unsafe(sql)),
    error=>error&&String(error.code)==="42501",
    "the V2 command capability must reject unauthorized RPC execution before validating payload or writing"
   );
  }

  const deny=await withActor(db,admin,tx=>tx.unsafe(
   "select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',$2::text,NULL::timestamptz,true) as result",
   [manager.profile_id,"Temporary authorization acceptance denial"]));
  assert.equal(deny[0].result.changed,true);
  assert.equal((await decision(db,manager,"pricing.edit_draft")).decision,"DENY");
  const denialList=await withActor(db,admin,tx=>tx.unsafe(
   "select public.list_authorization_profile_denials($1::uuid) as denials",
   [manager.profile_id]));
  const listedDenials=typeof denialList[0].denials==="string"?JSON.parse(denialList[0].denials):denialList[0].denials;
  assert.ok(Array.isArray(listedDenials));
  assert.equal(listedDenials.length,1);
  assert.equal(listedDenials[0].denial_id,deny[0].result.denial_id);
  assert.equal(listedDenials[0].capability_key,"pricing.edit_draft");
  assert.equal(listedDenials[0].is_active,true);
  assert.equal(listedDenials[0].reason,"Temporary authorization acceptance denial");
  await assert.rejects(
   ()=>withActor(db,manager,tx=>tx.unsafe(
    "select public.list_authorization_profile_denials($1::uuid)",
    [manager.profile_id])),
   error=>error&&String(error.code)==="42501",
   "non-admin members cannot inspect private explicit denial history"
  );
  const before=await db.unsafe("select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='authorization.capability.explicit_deny.changed' and entity_id=$2::uuid",[org,deny[0].result.denial_id]);
  const replay=await withActor(db,admin,tx=>tx.unsafe(
   "select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',$2::text,NULL::timestamptz,true) as result",
   [manager.profile_id,"Temporary authorization acceptance denial"]));
  assert.equal(replay[0].result.changed,false,"same deny replay must be idempotent");
  const after=await db.unsafe("select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='authorization.capability.explicit_deny.changed' and entity_id=$2::uuid",[org,deny[0].result.denial_id]);
  assert.equal(after[0].count,before[0].count,"idempotent replay must not duplicate audit");
  await withActor(db,admin,tx=>tx.unsafe("select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',NULL,NULL::timestamptz,false)",[manager.profile_id]));
  assert.equal((await decision(db,manager,"pricing.edit_draft")).decision,"PERMIT");
  const revokedList=await withActor(db,admin,tx=>tx.unsafe(
   "select public.list_authorization_profile_denials($1::uuid) as denials",
   [manager.profile_id]));
  const revokedDenials=typeof revokedList[0].denials==="string"?JSON.parse(revokedList[0].denials):revokedList[0].denials;
  assert.equal(revokedDenials[0].is_active,false,"revocation must remain visible in denial history");

  await assert.rejects(
   ()=>withActor(db,admin,tx=>tx.unsafe(
    "select public.set_authorization_profile_denial($1::uuid,'identity.roles.assign',$2::text,NULL::timestamptz,true)",
    [admin.profile_id,"Cannot lock out the last administrator"])),
   error=>error&&String(error.code)==="42501",
   "last active administrator must retain authorization administration"
  );

  const roleTarget=actors.get("staff");
  const originalRoles=[...roleTarget.roles].sort();
  assert.ok(originalRoles.includes("staff"),"role revision fixture must be an operational staff profile");
  const updatedRoles=originalRoles.includes("customer_manager")
   ?originalRoles.filter(role=>role!=="customer_manager")
   :[...originalRoles,"customer_manager"].sort();
  const auditBefore=await db.unsafe(
   "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='user.roles.changed' and entity_id=$2::uuid",
   [org,roleTarget.profile_id]);
  const roleChange=await withActor(db,admin,tx=>tx.unsafe(
   "select public.set_organization_user_roles_v2($1::uuid,$2::text[],$3::text[]) as result",
   [roleTarget.profile_id,originalRoles,updatedRoles]));
  assert.equal(roleChange[0].result.changed,true,"a fresh expected role snapshot must allow the intended role update");
  assert.deepEqual(roleChange[0].result.previous_roles,originalRoles);
  assert.deepEqual(roleChange[0].result.roles,updatedRoles);

  await assert.rejects(
   ()=>withActor(db,admin,tx=>tx.unsafe(
    "select public.set_organization_user_roles_v2($1::uuid,$2::text[],$3::text[])",
    [roleTarget.profile_id,originalRoles,originalRoles])),
   error=>error&&String(error.code)==="40001",
   "a stale role snapshot must not overwrite a newer administrator decision"
  );
  const afterStale=await db.unsafe(
   "select coalesce(array_agg(role order by role),ARRAY[]::text[]) as roles from public.user_roles where profile_id=$1::uuid",
   [roleTarget.profile_id]);
  assert.deepEqual(afterStale[0].roles,updatedRoles,"a rejected stale request must preserve the newer role assignment");

  const noOp=await withActor(db,admin,tx=>tx.unsafe(
   "select public.set_organization_user_roles_v2($1::uuid,$2::text[],$3::text[]) as result",
   [roleTarget.profile_id,updatedRoles,updatedRoles]));
  assert.equal(noOp[0].result.changed,false,"an exact role replay must be a no-op");
  const auditAfterNoOp=await db.unsafe(
   "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='user.roles.changed' and entity_id=$2::uuid",
   [org,roleTarget.profile_id]);
  assert.equal(auditAfterNoOp[0].count,auditBefore[0].count+1,"stale and no-op requests must not create audit records");

  await assert.rejects(
   ()=>withActor(db,admin,tx=>tx.unsafe(
    "select public.set_organization_user_roles($1::uuid,$2::text[])",
    [roleTarget.profile_id,originalRoles])),
   error=>error&&String(error.code)==="42501",
   "authenticated clients must not bypass the revision guard through the legacy role RPC"
  );
  await assert.rejects(
   ()=>withActor(db,manager,tx=>tx.unsafe(
    "select public.set_organization_user_roles_v2($1::uuid,$2::text[],$3::text[])",
    [roleTarget.profile_id,updatedRoles,originalRoles])),
   error=>error&&String(error.code)==="42501",
   "managers without identity.roles.assign must not use the guarded role command"
  );

  const restored=await withActor(db,admin,tx=>tx.unsafe(
   "select public.set_organization_user_roles_v2($1::uuid,$2::text[],$3::text[]) as result",
   [roleTarget.profile_id,updatedRoles,originalRoles]));
  assert.equal(restored[0].result.changed,true);
  assert.deepEqual(restored[0].result.roles,originalRoles);
  const auditAfterRestore=await db.unsafe(
   "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='user.roles.changed' and entity_id=$2::uuid",
   [org,roleTarget.profile_id]);
  assert.equal(auditAfterRestore[0].count,auditBefore[0].count+2,"only the two confirmed role changes may be audited");

  for(const sql of ["select * from public.authorization_capabilities","select * from public.authorization_role_capabilities","select * from public.authorization_profile_denials"]) {
   await assert.rejects(
    ()=>withActor(db,manager,tx=>tx.unsafe(sql)),
    error=>error&&String(error.code)==="42501",
    "authenticated clients must not query the internal authorization tables"
   );
  }
  await db.unsafe("delete from auth.sessions where id=$1::uuid and user_id=$2::uuid",[manager.jwtClaims.session_id,manager.auth_user_id]);
  assert.equal((await decision(db,manager,"pricing.edit_draft")).decision,"DENY",
   "revoking auth.sessions must deny the next decision even when the same signed JWT is presented");
  process.stdout.write("PASS authorization capability registry: exact six-role parity, real JWT sessions, stale role-revision rejection, legacy role RPC denial, idempotent role replay, audited role changes, immediate session revocation, deny-by-default, scope fail-closed, explicit-deny precedence, private denial history, last-admin protection, and product financial RPC boundaries\n");
 } finally { await db.end({timeout:5}).catch(()=>{}); }
}
main().catch(error=>{process.stderr.write("FAIL authorization capability registry acceptance: "+String(error?.stack??error)+"\n");process.exitCode=1;});
