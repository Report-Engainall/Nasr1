import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
async function withServiceRole(db,callback) {
  return db.begin(async(tx)=>{
   await tx.unsafe("select set_config('request.jwt.claim.role','service_role',true)");
   await tx.unsafe("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:"service_role"})]);
   await tx.unsafe("set local role service_role");
   return callback(tx);
  });
}

async function withActorAsServiceRole(db,actor,callback) {
 if(!actor.jwtClaims?.session_id) throw new Error("A live Auth session is required for the role-bound trigger check.");
 return db.begin(async(tx)=>{
  await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)",[actor.auth_user_id]);
  await tx.unsafe("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({...actor.jwtClaims,role:"authenticated"})]);
  await tx.unsafe("set local role service_role");
  return callback(tx);
 });
}
async function resourceDecision(db,actor,key,resourceId) {
 return withActor(db,actor,async(tx)=>{
  const rows=await tx.unsafe("select public.current_authorization_decision($1::text,$2::uuid) as decision,public.current_actor_has_capability($1::text,$2::uuid) as allowed",[key,resourceId]);
  const value=typeof rows[0].decision==="string"?JSON.parse(rows[0].decision):rows[0].decision;
  return {...value,allowed:rows[0].allowed};
 });
}
async function assertAuthorizationPrerequisiteUpgradeSafety(db) {
 const migrationUrl=new URL("../supabase/migrations/20261116111500_authorization_capability_registry_prerequisites.sql",import.meta.url);
 const migrationSource=await readFile(migrationUrl,"utf8");
 const migrationSql=migrationSource.replace(/^\s*BEGIN;\s*$/im,"").replace(/^\s*COMMIT;\s*$/im,"");
 if(/^\s*BEGIN;\s*$/im.test(migrationSql)||/^\s*COMMIT;\s*$/im.test(migrationSql)) throw new Error("Could not strip standalone migration transaction wrappers for the rollback-only upgrade fixture.");
 if(migrationSql===migrationSource) throw new Error("Could not isolate authorization prerequisite migration body for rollback-only upgrade fixture.");
 const canonicalUrl=new URL("../supabase/migrations/20261117050202_authorization_capability_registry_v2.sql",import.meta.url);
 const canonicalSource=await readFile(canonicalUrl,"utf8");
 const canonicalSeed=canonicalSource.match(/INSERT INTO public\.authorization_capabilities[\s\S]*?ON CONFLICT\(capability_key\) DO NOTHING;/);
 if(!canonicalSeed) throw new Error("The canonical capability migration must preserve existing catalog rows with ON CONFLICT DO NOTHING.");
 assert.doesNotMatch(canonicalSource,/INSERT INTO public\.authorization_role_capabilities/i,
  "the canonical function migration must not reseed role grants after initial registry creation");
 const rollbackMarker="ROLLBACK_AUTHORIZATION_PREREQUISITE_UPGRADE_FIXTURE";
 const preFixtureCapabilities=await db.unsafe(
  "select capability_key,domain,resource,action,sensitivity,scope_kind,approval_mode,separation_of_duties,state_requirements,legacy_operation_id,is_active "+
  "from public.authorization_capabilities where capability_key in ('inventory.balance.adjust','inventory.reorder_point.write') order by capability_key"
 );
 const preFixtureGrant=await db.unsafe(
  "select role,capability_key,grant_source,valid_from,expires_at from public.authorization_role_capabilities "+
  "where role='manager' and capability_key='inventory.reorder_point.write'"
 );
 let rollbackFailure;
 let rollbackPhase="starting rollback-only upgrade fixture";
 try {
  await db.begin(async(tx)=>{
   rollbackPhase="checking pre-existing capability rows";
   const initial=await tx.unsafe("select capability_key from public.authorization_capabilities where capability_key in ('inventory.balance.adjust','inventory.reorder_point.write') order by capability_key");
   assert.equal(initial.length,2,"upgrade fixture requires both existing capability rows");
   const grant=await tx.unsafe("select role from public.authorization_role_capabilities where role='manager' and capability_key='inventory.reorder_point.write'");
   assert.equal(grant.length,1,"upgrade fixture requires a manager grant to remove");
   await tx.unsafe("update public.authorization_capabilities set scope_kind='warehouse',is_active=true where capability_key='inventory.balance.adjust'");
   // Use an existing, catalog-valid policy key while making its value deliberately
   // different from the canonical seed. This tests upgrade preservation without
   // manufacturing metadata that the production registry constraint rejects.
   const preservedPolicy={requires_reason:false};
   await tx.unsafe(
    "update public.authorization_capabilities set scope_kind='warehouse',approval_mode='maker_checker',"+
    "separation_of_duties=true,state_requirements=pg_catalog.jsonb_build_object('requires_reason',false),is_active=false "+
    "where capability_key='inventory.reorder_point.write'"
   );
   rollbackPhase="removing a deliberately revoked manager grant";
   await tx.unsafe("delete from public.authorization_role_capabilities where role='manager' and capability_key='inventory.reorder_point.write'");
   rollbackPhase="replaying the authorization prerequisites migration";
   await tx.unsafe(migrationSql);
   rollbackPhase="replaying the canonical capability catalog seed";
   await tx.unsafe(canonicalSeed[0]);
   rollbackPhase="asserting existing warehouse capability preservation";
   const scope=await tx.unsafe("select scope_kind,is_active from public.authorization_capabilities where capability_key='inventory.balance.adjust'");
   assert.deepEqual(scope[0],{scope_kind:'warehouse',is_active:true},"prerequisite backfill must not widen or alter an existing warehouse capability");
   rollbackPhase="asserting disabled capability policy preservation";
   const disabled=await tx.unsafe(
    "select scope_kind,approval_mode,separation_of_duties,state_requirements,is_active "+
    "from public.authorization_capabilities where capability_key='inventory.reorder_point.write'"
   );
   assert.deepEqual(disabled[0],{
    scope_kind:'warehouse',approval_mode:'maker_checker',separation_of_duties:true,
    state_requirements:preservedPolicy,is_active:false
   },"both prerequisite and canonical capability seeds must preserve existing scope, approval policy, metadata and disabled state");
   rollbackPhase="asserting removed role grant stays removed";
   const restored=await tx.unsafe("select count(*)::integer as count from public.authorization_role_capabilities where role='manager' and capability_key='inventory.reorder_point.write'");
   assert.equal(restored[0].count,0,"prerequisite backfill must not recreate a deliberately removed role grant");
   rollbackPhase="asserting the pre-existing role-table upgrade branch";
   const flag=await tx.unsafe("select current_setting('nasr.authorization_role_capabilities_preexisting',true) as existed");
   assert.equal(flag[0].existed,"true","fixture must prove the pre-existing-role-table upgrade branch");
   rollbackPhase="triggering the expected full rollback";
   throw new Error(rollbackMarker);
  });
 } catch(cause) {
  rollbackFailure=cause;
 }
 if(rollbackFailure?.message!==rollbackMarker) {
  throw new Error(
   "upgrade-safety fixture failed during \""+rollbackPhase+"\" before the planned rollback: "+
   String(rollbackFailure?.message??rollbackFailure??"transaction unexpectedly committed")+
   (rollbackFailure?.code?" [SQLSTATE "+rollbackFailure.code+"]":"")+
   (rollbackFailure?.detail?" — "+rollbackFailure.detail:""),
   {cause:rollbackFailure}
  );
 }
 const postFixtureCapabilities=await db.unsafe(
  "select capability_key,domain,resource,action,sensitivity,scope_kind,approval_mode,separation_of_duties,state_requirements,legacy_operation_id,is_active "+
  "from public.authorization_capabilities where capability_key in ('inventory.balance.adjust','inventory.reorder_point.write') order by capability_key"
 );
 const postFixtureGrant=await db.unsafe(
  "select role,capability_key,grant_source,valid_from,expires_at from public.authorization_role_capabilities "+
  "where role='manager' and capability_key='inventory.reorder_point.write'"
 );
 assert.deepEqual(postFixtureCapabilities,preFixtureCapabilities,
  "rollback-only upgrade fixture must restore every original capability field after the transaction aborts");
 assert.deepEqual(postFixtureGrant,preFixtureGrant,
  "rollback-only upgrade fixture must restore the original role grant after the transaction aborts");
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
  await assertAuthorizationPrerequisiteUpgradeSafety(db);
  const profiles=await db.unsafe(
   "select p.id::text as profile_id,p.auth_user_id::text as auth_user_id,p.organization_id::text as organization_id,"+
   "p.email,array_agg(r.role order by r.role) as roles from public.profiles p "+
   "join public.user_roles r on r.profile_id=p.id where p.is_active=true and p.auth_user_id is not null "+
   "and p.organization_id is not null group by p.id,p.auth_user_id,p.organization_id,p.email order by p.created_at,p.id");
  const loginEnv={
    admin:["E2E_DEVICE_ADMIN_EMAIL","E2E_DEVICE_ADMIN_PASSWORD"],
    manager:["E2E_MANAGER_EMAIL","E2E_MANAGER_PASSWORD"],
    staff:["E2E_STAFF_EMAIL","E2E_STAFF_PASSWORD"],
    accountant:["E2E_ACCOUNTANT_EMAIL","E2E_ACCOUNTANT_PASSWORD"],
    customer_manager:["E2E_CUSTOMER_MANAGER_EMAIL","E2E_CUSTOMER_MANAGER_PASSWORD"],
    customer:["E2E_EMAIL","E2E_PASSWORD"]
  };
  const managerLoginEmail=requiredEnv(loginEnv.manager[0]).trim().toLowerCase();
  const managerActor=profiles.find(p=>
    p.email?.trim().toLowerCase()===managerLoginEmail&&p.roles.includes("manager"));
  assert.ok(managerActor,"P2 local manager login must map to its own active manager profile");
  const org=managerActor.organization_id;
  const actors=new Map();
  for(const role of ["admin","manager","staff","accountant","customer_manager","customer"]) {
    const [emailName,passwordName]=loginEnv[role];
    const email=requiredEnv(emailName).trim();
    const actor=profiles.find(p=>
      p.organization_id===org&&
      p.email?.trim().toLowerCase()===email.toLowerCase()&&
      p.roles.includes(role));
    assert.ok(actor,"P2 local "+role+" credentials must map to that exact role profile in the manager tenant");
    actors.set(role,actor);
    try {
      actor.jwtClaims=await signInLocal(apiUrl,publishableKey,email,requiredEnv(passwordName),actor.auth_user_id);
    } catch(cause) {
      throw new Error("P2 local "+role+" credentials did not authenticate the selected profile: "+String(cause?.message??cause));
    }
    const liveSession=await db.unsafe(
      "select id::text from auth.sessions where id=$1::uuid and user_id=$2::uuid and (not_after is null or not_after>now())",
      [actor.jwtClaims.session_id,actor.auth_user_id]
    );
    assert.equal(liveSession.length,1,role+" must have a real live session in auth.sessions");
  }

  const ownerAdmin=actors.get("admin");
  const ownerManager=actors.get("manager");
  const targetWarehouse=(await db.unsafe(
    "select id::text from public.warehouses where organization_id=$1::uuid and is_active=true and code=$2::text order by created_at,id limit 1",
    [org,"P2-LOCAL-E2E"]
  ))[0]?.id;
  assert.ok(targetWarehouse,"owner-boundary acceptance requires an active local test warehouse");

  const ownerPrivileges=await db.unsafe(
    "select has_table_privilege('authenticated','public.organization_owner_bindings','SELECT') as authenticated_read,"+
    "has_table_privilege('service_role','public.organization_owner_bindings','SELECT') as service_role_direct_read,"+
    "has_function_privilege('authenticated','public.bind_organization_owner(uuid,uuid,text)','EXECUTE') as authenticated_bind,"+
    "has_function_privilege('service_role','public.bind_organization_owner(uuid,uuid,text)','EXECUTE') as service_role_bind,"+
    "has_function_privilege('authenticated','public.current_actor_is_organization_owner()','EXECUTE') as authenticated_owner_check"
  );
  assert.deepEqual(ownerPrivileges[0],{
    authenticated_read:false,
    service_role_direct_read:false,
    authenticated_bind:false,
    service_role_bind:true,
    authenticated_owner_check:true
  },"owner records must be hidden; only service-role RPC can bind while authenticated users can read only their boolean identity result");

  const baselineAdminDecision=await decision(db,ownerAdmin,"inventory.opening_balance.approve");
  assert.equal(baselineAdminDecision.decision,"PERMIT",
    "the existing baseline capability must remain explicit and distinct from owner identity");
  const ownerBefore=await withActor(db,ownerAdmin,tx=>
    tx.unsafe("select public.current_actor_is_organization_owner() as is_owner"));
  assert.equal(ownerBefore[0].is_owner,false,
    "an admin role alone must never imply organization ownership");

  await assert.rejects(
    ()=>withActor(db,ownerAdmin,tx=>tx.unsafe(
      "select public.bind_organization_owner($1::uuid,$2::uuid,$3::text)",
      [org,ownerAdmin.profile_id,"P2 authenticated self-claim attempt"]
    )),
    error=>error&&String(error.code)==="42501",
    "authenticated administrators cannot self-assign owner identity"
  );
  await assert.rejects(
    ()=>withServiceRole(db,tx=>tx.unsafe(
      "select public.bind_organization_owner($1::uuid,$2::uuid,$3::text)",
      [org,ownerManager.profile_id,"P2 manager must not become the legal owner"]
    )),
    error=>error&&String(error.code)==="42501",
    "service provisioning must reject non-admin owner candidates"
  );
  await assert.rejects(
    ()=>withActor(db,ownerAdmin,tx=>tx.unsafe(
      "select public.get_opening_inventory_baseline_preview($1::uuid)",
      [targetWarehouse]
    )),
    error=>error&&String(error.code)==="42501",
    "an administrator without a verified owner binding cannot preview owner-only approval"
  );
  await assert.rejects(
    ()=>withActor(db,ownerAdmin,tx=>tx.unsafe(
      "select public.approve_opening_inventory_baseline($1::uuid)",
      [targetWarehouse]
    )),
    error=>error&&String(error.code)==="42501",
    "an administrator without a verified owner binding cannot approve the opening baseline"
  );

  const bound=await withServiceRole(db,tx=>tx.unsafe(
    "select public.bind_organization_owner($1::uuid,$2::uuid,$3::text) as result",
    [org,ownerAdmin.profile_id,"P2 isolated local authorization acceptance owner binding"]
  ));
  const boundResult=typeof bound[0].result==="string"?JSON.parse(bound[0].result):bound[0].result;
  assert.equal(boundResult.idempotent_replay,false);
  const replay=await withServiceRole(db,tx=>tx.unsafe(
    "select public.bind_organization_owner($1::uuid,$2::uuid,$3::text) as result",
    [org,ownerAdmin.profile_id,"P2 isolated local authorization acceptance owner binding"]
  ));
  const replayResult=typeof replay[0].result==="string"?JSON.parse(replay[0].result):replay[0].result;
  assert.equal(replayResult.idempotent_replay,true,
    "repeating the same owner binding must be idempotent");

  const ownerAfter=await withActor(db,ownerAdmin,tx=>
    tx.unsafe("select public.current_actor_is_organization_owner() as is_owner"));
  assert.equal(ownerAfter[0].is_owner,true,
    "only the exact service-bound profile is the active organization owner");
  const managerOwner=await withActor(db,ownerManager,tx=>
    tx.unsafe("select public.current_actor_is_organization_owner() as is_owner"));
  assert.equal(managerOwner[0].is_owner,false,
    "other organization members remain non-owners");
  const previewAfterBinding=await withActor(db,ownerAdmin,tx=>
    tx.unsafe("select public.get_opening_inventory_baseline_preview($1::uuid) as preview",[targetWarehouse]));
  const previewPayload=typeof previewAfterBinding[0].preview==="string"
    ? JSON.parse(previewAfterBinding[0].preview) : previewAfterBinding[0].preview;
  assert.equal(previewPayload.warehouse_id,targetWarehouse,
    "the provisioned owner can read the exact tenant-scoped baseline preview");

  const revoked=await withServiceRole(db,tx=>tx.unsafe(
    "select public.revoke_organization_owner_binding($1::uuid,$2::text) as result",
    [org,"P2 local owner binding revocation acceptance"]
  ));
  const revokePayload=typeof revoked[0].result==="string"?JSON.parse(revoked[0].result):revoked[0].result;
  assert.equal(revokePayload.revoked,true);
  const ownerAfterRevoke=await withActor(db,ownerAdmin,tx=>
    tx.unsafe("select public.current_actor_is_organization_owner() as is_owner"));
  assert.equal(ownerAfterRevoke[0].is_owner,false,
    "revocation immediately removes owner authority");
  await assert.rejects(
    ()=>withActor(db,ownerAdmin,tx=>tx.unsafe(
      "select public.get_opening_inventory_baseline_preview($1::uuid)",[targetWarehouse]
    )),
    error=>error&&String(error.code)==="42501",
    "a revoked owner cannot preview or approve the baseline"
  );
  await assert.rejects(
    ()=>withActor(db,ownerAdmin,tx=>tx.unsafe(
      "select public.approve_opening_inventory_baseline($1::uuid)",[targetWarehouse]
    )),
    error=>error&&String(error.code)==="42501",
    "a revoked owner cannot execute the baseline approval command"
  );
  const rebound=await withServiceRole(db,tx=>tx.unsafe(
    "select public.bind_organization_owner($1::uuid,$2::uuid,$3::text) as result",
    [org,ownerAdmin.profile_id,"P2 isolated local owner re-provisioning after revocation"]
  ));
  const reboundResult=typeof rebound[0].result==="string"?JSON.parse(rebound[0].result):rebound[0].result;
  assert.equal(reboundResult.idempotent_replay,false,
    "a revoked ownership history is retained and a new binding receives a new identity");

  const ownerHistory=await db.unsafe(
    "select count(*)::integer as total,count(*) filter(where revoked_at is null)::integer as active "+
    "from public.organization_owner_bindings where organization_id=$1::uuid",[org]
  );
  assert.deepEqual(ownerHistory[0],{total:2,active:1},
    "owner changes must preserve a single active binding and immutable historical rows");
  const ownerAudit=await db.unsafe(
    "select action,count(*)::integer as count from public.audit_logs "+
    "where organization_id=$1::uuid and entity_type='organization_owner_binding' "+
    "and action in ('organization.owner.bound','organization.owner.revoked') group by action order by action",
    [org]
  );
  assert.deepEqual(ownerAudit.map(row=>[row.action,row.count]),[
    ["organization.owner.bound",2],
    ["organization.owner.revoked",1]
  ],"service-role owner binding and revocation must be independently audited");

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

  const expectedFinanceCommandPairs=[
   ["admin","finance.journal.create_draft"],["manager","finance.journal.create_draft"],["accountant","finance.journal.create_draft"],
   ["admin","finance.journal.post"],["manager","finance.journal.post"],["accountant","finance.journal.post"],
   ["admin","finance.journal.reverse"],["manager","finance.journal.reverse"]
  ].map(([role,key])=>role+"|"+key).sort();
  const actualFinanceCommandPairs=await db.unsafe(
   "select role,capability_key from public.authorization_role_capabilities "+
   "where grant_source='command-parity:finance.workspace.manage' and capability_key like 'finance.journal.%'"
  );
  assert.deepEqual(actualFinanceCommandPairs.map(row=>row.role+"|"+row.capability_key).sort(),
   expectedFinanceCommandPairs,
   "journal command capabilities preserve current finance roles and keep reversal admin/manager-only");

  const managerJournalPost=await decision(db,actors.get("manager"),"finance.journal.post");
  assert.equal(managerJournalPost.approval_mode,"maker_checker");
  assert.equal(managerJournalPost.separation_of_duties,true);

  const checks=[
   ["admin","identity.roles.assign",true],["manager","identity.roles.assign",false],
   ["manager","pricing.edit_draft",true],["staff","pricing.propose",true],
   ["staff","pricing.approve",false],["staff","inventory.transfer.create",true],
   ["accountant","finance.workspace.manage",true],["accountant","catalog.internal_prices.read",false],
   ["customer_manager","customers.lifecycle.write",true],["customer_manager","customers.read_financial",false],
   ["customer","orders.create_draft",false],["staff","orders.approve",false],
   ["admin","finance.journal.create_draft",true],["manager","finance.journal.create_draft",true],["accountant","finance.journal.create_draft",true],
   ["admin","finance.journal.post",true],["manager","finance.journal.post",true],["accountant","finance.journal.post",true],
   ["staff","finance.journal.post",false],
   ["admin","finance.journal.reverse",true],["manager","finance.journal.reverse",true],["accountant","finance.journal.reverse",false]
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

  const cancelCapability=await db.unsafe(
   "select domain,resource,action,sensitivity,scope_kind,approval_mode,separation_of_duties,state_requirements,legacy_operation_id,is_active from public.authorization_capabilities where capability_key='inventory.count.cancel'"
  );
  assert.equal(cancelCapability.length,1,"stock-count cancellation must have a real V2 capability definition");
  assert.deepEqual(cancelCapability[0],{
   domain:"inventory",
   resource:"stock_count",
   action:"cancel",
   sensitivity:"inventory",
   scope_kind:"warehouse",
   approval_mode:"none",
   separation_of_duties:false,
   state_requirements:{requires_reason:true,required_status:"open"},
   legacy_operation_id:null,
   is_active:true
  });
  const cancelGrantRows=await db.unsafe(
   "select role from public.authorization_role_capabilities where capability_key='inventory.count.cancel' order by role"
  );
  assert.deepEqual(cancelGrantRows.map(row=>row.role),["admin","manager"],
   "only the existing admin/manager stock-count finalization parity may cancel a count");

  const guardedTransferFunctions=await db.unsafe(
   "select p.proname,pg_catalog.pg_get_functiondef(p.oid) as definition from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('transfer_inventory','transfer_inventory_batch') order by p.proname"
  );
  assert.equal(guardedTransferFunctions.length,2,
   "single and batch transfer RPCs must both exist after V2 scope migration");
  for(const fn of guardedTransferFunctions) {
   const guardPosition=fn.definition.indexOf("PERFORM public.assert_inventory_transfer_scope_v2(");
   const replayLockPosition=fn.definition.indexOf("pg_advisory_xact_lock");
   assert.ok(guardPosition>=0 && replayLockPosition>guardPosition,
    fn.proname+" must check both assigned warehouses before any idempotency replay");
  }

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
  const staff=actors.get("staff");
  const accountant=actors.get("accountant");
  const customer=actors.get("customer");

  // Same-tenant warehouse A/B authorization, real stock-count RPC writes, and row-trigger denial.
  const unassignedWarehouseRows=await db.unsafe(
    "select id::text from public.warehouses where organization_id=$1::uuid and is_active=true and code='P2-LOCAL-RLS-A'",
    [org]
  );
  assert.equal(unassignedWarehouseRows.length,1,"the same-tenant unassigned warehouse B fixture must exist");
  const unassignedWarehouse=unassignedWarehouseRows[0].id;
  const managerScopeRows=await db.unsafe(
    "select id::text from public.authorization_profile_scopes where organization_id=$1::uuid and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid and is_active=true",
    [org,manager.profile_id,targetWarehouse]
  );
  assert.equal(managerScopeRows.length,1,"the manager must be assigned to warehouse A");
  assert.equal((await resourceDecision(db,manager,"inventory.count.enter",unassignedWarehouse)).decision,"DENY",
    "a manager assigned to A must be denied the same-tenant unassigned warehouse B");
  assert.equal((await resourceDecision(db,manager,"inventory.count.start",unassignedWarehouse)).decision,"DENY",
    "stock-count session start must also deny the manager on unassigned warehouse B");

  async function ensureWarehouseAssignment(actor,warehouseId,reason) {
    const existing=await db.unsafe(
      "select id::text,is_active from public.authorization_profile_scopes where organization_id=$1::uuid and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
      [org,actor.profile_id,warehouseId]
    );
    if(existing.length===0) {
      const saved=await withActor(db,admin,tx=>tx.unsafe(
        "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,0) as result",
        [actor.profile_id,warehouseId,reason]
      ));
      const value=typeof saved[0].result==="string"?JSON.parse(saved[0].result):saved[0].result;
      assert.equal(value.changed,true,"test-only warehouse assignment must be persisted by the authorized scope command");
      assert.equal(value.is_active,true);
    } else {
      assert.equal(existing[0].is_active,true,"isolated fixture must not contain stale inactive warehouse assignments");
    }
  }
  await ensureWarehouseAssignment(staff,targetWarehouse,"P2 stock-count role-grant proof for staff on warehouse A");
  await ensureWarehouseAssignment(staff,unassignedWarehouse,"P2 stock-count trigger proof for staff on warehouse B");
  await ensureWarehouseAssignment(accountant,targetWarehouse,"P2 stock-count non-granted accountant proof");
  const customerWarehouseScopeBefore=await db.unsafe(
    "select id::text,is_active from public.authorization_profile_scopes where organization_id=$1::uuid and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
    [org,customer.profile_id,targetWarehouse]
  );
  assert.equal(customerWarehouseScopeBefore.length,0,
    "customer identity must not begin with an internal warehouse assignment");
  await assert.rejects(
    withActor(db,admin,tx=>tx.unsafe(
      "select public.set_authorization_profile_scope($1::uuid,'warehouse',$2::uuid,$3::text,NULL::timestamptz,true,0) as result",
      [customer.profile_id,targetWarehouse,"P2 customer must be denied internal warehouse scope"]
    )),
    (error)=>{
      assert.equal(String(error?.code),"42501",
        "the database scope boundary must reject warehouse assignment to a customer identity");
      assert.match(String(error?.message??error),/customer accounts cannot receive internal warehouse or assigned-customer staff scopes/,
        "the independent customer/staff account boundary must be the rejection source");
      return true;
    }
  );
  const customerWarehouseScopeAfter=await db.unsafe(
    "select id::text,is_active from public.authorization_profile_scopes where organization_id=$1::uuid and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
    [org,customer.profile_id,targetWarehouse]
  );
  assert.deepEqual(customerWarehouseScopeAfter,customerWarehouseScopeBefore,
    "a rejected customer assignment must not create or alter any internal warehouse scope");
  for(const actor of [accountant,customer]) {
    assert.equal(actor.roles.some(role=>["admin","manager","staff"].includes(role)),false,
      "accountant/customer test identity must not contain an operational stock-count role");
  }

  const countEntryGrants=await db.unsafe(
    "select role from public.authorization_role_capabilities where capability_key='inventory.count.enter' and valid_from<=statement_timestamp() and (expires_at is null or expires_at>statement_timestamp()) order by role"
  );
  assert.deepEqual(countEntryGrants.map(row=>row.role),["admin","manager","staff"],
    "count entry grants must remain limited to the explicit admin/manager/staff parity");
  for(const [actor,expected] of [[manager,"PERMIT"],[staff,"PERMIT"],[accountant,"DENY"],[customer,"DENY"]]) {
    const result=await resourceDecision(db,actor,"inventory.count.enter",targetWarehouse);
    assert.equal(result.decision,expected,"warehouse A count.enter decision for roles "+actor.roles.join(","));
    assert.equal(result.allowed,expected==="PERMIT");
  }
  for(const actor of [manager,staff]) {
    assert.equal((await resourceDecision(db,actor,"inventory.count.start",targetWarehouse)).decision,"PERMIT",
      "assigned admin/manager/staff role must start a count only on an assigned warehouse");
  }

  const scopedDenial=await withActor(db,admin,tx=>tx.unsafe(
    "select public.set_authorization_profile_denial($1::uuid,'inventory.count.enter',$2::text,NULL::timestamptz,true) as result",
    [manager.profile_id,"P2 explicit count-entry denial overrides the warehouse grant"]
  ));
  assert.equal(scopedDenial[0].result.changed,true);
  assert.equal((await resourceDecision(db,manager,"inventory.count.enter",targetWarehouse)).decision,"DENY",
    "explicit profile denial must override the manager's active role and warehouse assignment");
  await withActor(db,admin,tx=>tx.unsafe(
    "select public.set_authorization_profile_denial($1::uuid,'inventory.count.enter',NULL,NULL::timestamptz,false)",
    [manager.profile_id]
  ));
  assert.equal((await resourceDecision(db,manager,"inventory.count.enter",targetWarehouse)).decision,"PERMIT",
    "revoking the explicit denial restores the manager's original warehouse-scoped grant");

  const countEntryPolicy=await db.unsafe(
    "select scope_kind,approval_mode,separation_of_duties,state_requirements from public.authorization_capabilities where capability_key='inventory.count.enter'"
  );
  assert.equal(countEntryPolicy[0]?.scope_kind,"warehouse");
  assert.equal(countEntryPolicy[0]?.approval_mode,"none");
  assert.equal(countEntryPolicy[0]?.separation_of_duties,false);
  assert.equal(countEntryPolicy[0]?.state_requirements?.writes_draft_only,true);
  assert.equal(countEntryPolicy[0]?.state_requirements?.requires_active_warehouse_assignment,true);
  const finalizePolicy=await db.unsafe(
    "select scope_kind,approval_mode,separation_of_duties,state_requirements from public.authorization_capabilities where capability_key='inventory.count.finalize'"
  );
  assert.equal(finalizePolicy[0]?.scope_kind,"warehouse");
  assert.equal(finalizePolicy[0]?.approval_mode,"maker_checker");
  assert.equal(finalizePolicy[0]?.separation_of_duties,true);
  assert.equal(finalizePolicy[0]?.state_requirements?.reviewer_must_differ_from_counter,true);
  assert.equal(finalizePolicy[0]?.state_requirements?.requires_active_warehouse_assignment,true);
  const finalizeDecision=await resourceDecision(db,manager,"inventory.count.finalize",targetWarehouse);
  assert.equal(finalizeDecision.decision,"REQUIRES_APPROVAL");
  assert.equal(finalizeDecision.separation_of_duties,true);

  const managerCountKey="AUTHZ-MANAGER-A-"+randomUUID().replace(/-/g,"");
  const managerStart=await withActor(db,manager,tx=>tx.unsafe(
    "select public.start_stock_count($1::uuid,$2::text,'P2 assigned warehouse A acceptance') as result",
    [targetWarehouse,managerCountKey]
  ));
  const managerSession=typeof managerStart[0].result==="string"?JSON.parse(managerStart[0].result):managerStart[0].result;
  assert.equal(managerSession.warehouse_id,targetWarehouse,"the manager session must bind to assigned warehouse A");
  const managerLines=await db.unsafe(
    "select id::text,product_id::text,counted_quantity::text,expected_quantity::text from public.stock_count_lines where session_id=$1::uuid order by id",
    [managerSession.id]
  );
  assert.ok(managerLines.length>0,"manager start must create real snapshot rows on warehouse A");
  assert.equal(managerLines[0].counted_quantity,null);
  const entered=await withActor(db,manager,tx=>tx.unsafe(
    "select public.set_stock_count_line($1::uuid,$2::uuid,77.125::numeric) as result",
    [managerSession.id,managerLines[0].product_id]
  ));
  const enteredLine=typeof entered[0].result==="string"?JSON.parse(entered[0].result):entered[0].result;
  assert.equal(enteredLine.counted_by,manager.profile_id,
    "authorized draft quantity entry must attribute the line to the authenticated manager");
  const persistedManagerLine=await db.unsafe(
    "select counted_quantity::text as counted_quantity,counted_by::text as counted_by from public.stock_count_lines where id=$1::uuid",
    [managerLines[0].id]
  );
  assert.deepEqual(persistedManagerLine[0],{counted_quantity:"77.125",counted_by:manager.profile_id},
    "the authorized stock-count line UPDATE must persist the draft quantity and maker identity");

  // A disabled assignment must revoke both the decision and real write paths.
  const activeManagerAssignment = await db.unsafe(
    "select id::text from public.authorization_profile_scopes where organization_id=$1::uuid and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid and is_active=true",
    [org,manager.profile_id,targetWarehouse]
  );
  assert.equal(activeManagerAssignment.length,1,"manager must have exactly one active warehouse A assignment before the revocation proof");
  const managerAssignmentId=activeManagerAssignment[0].id;
  const managerCountsBeforeDisabledWrite=await db.unsafe(
    "select (select count(*)::integer from public.stock_count_sessions where organization_id=$1::uuid) as sessions,"+
    "(select count(*)::integer from public.stock_count_lines where organization_id=$1::uuid) as lines",
    [org]
  );
  await db.unsafe("update public.authorization_profile_scopes set is_active=false where id=$1::uuid",[managerAssignmentId]);
  try {
    assert.equal((await resourceDecision(db,manager,"inventory.count.enter",targetWarehouse)).decision,"DENY",
      "disabled warehouse assignment must deny count entry immediately");
    await assert.rejects(
      ()=>withActor(db,manager,tx=>tx.unsafe(
        "select public.set_stock_count_line($1::uuid,$2::uuid,79.5::numeric)",
        [managerSession.id,managerLines[0].product_id]
      )),
      error=>error&&String(error.code)==="42501",
      "set_stock_count_line RPC must reject a disabled warehouse assignment"
    );
    await assert.rejects(
      ()=>withActorAsServiceRole(db,manager,tx=>tx.unsafe(
        "update public.stock_count_lines set counted_quantity=79.5::numeric where id=$1::uuid returning id",
        [managerLines[0].id]
      )),
      error=>error&&String(error.code)==="42501",
      "the independent stock-count row trigger must reject a disabled warehouse assignment"
    );
    const managerCountsAfterDisabledWrite=await db.unsafe(
      "select (select count(*)::integer from public.stock_count_sessions where organization_id=$1::uuid) as sessions,"+
      "(select count(*)::integer from public.stock_count_lines where organization_id=$1::uuid) as lines",
      [org]
    );
    assert.deepEqual(managerCountsAfterDisabledWrite[0],managerCountsBeforeDisabledWrite[0],
      "disabled-assignment denials must leave stock-count session and line row counts unchanged");
    const managerLineAfterDisabledWrite=await db.unsafe(
      "select counted_quantity::text as counted_quantity,counted_by::text as counted_by from public.stock_count_lines where id=$1::uuid",
      [managerLines[0].id]
    );
    assert.deepEqual(managerLineAfterDisabledWrite[0],{counted_quantity:"77.125",counted_by:manager.profile_id},
      "disabled-assignment denial must preserve the previously written warehouse A line");
  } finally {
    const restoredAssignment=await db.unsafe(
      "update public.authorization_profile_scopes set is_active=true where id=$1::uuid returning id::text",
      [managerAssignmentId]
    );
    assert.equal(restoredAssignment.length,1,"isolated acceptance must restore the exact manager warehouse A assignment");
  }

  // Create a real B-session through a staff profile assigned to B, then attack its line as manager A.
  const staffCountKey="AUTHZ-STAFF-B-"+randomUUID().replace(/-/g,"");
  const staffStart=await withActor(db,staff,tx=>tx.unsafe(
    "select public.start_stock_count($1::uuid,$2::text,'P2 warehouse B trigger acceptance') as result",
    [unassignedWarehouse,staffCountKey]
  ));
  const staffSession=typeof staffStart[0].result==="string"?JSON.parse(staffStart[0].result):staffStart[0].result;
  assert.equal(staffSession.warehouse_id,unassignedWarehouse);
  const staffLines=await db.unsafe(
    "select id::text,product_id::text,counted_quantity::text from public.stock_count_lines where session_id=$1::uuid order by id",
    [staffSession.id]
  );
  assert.ok(staffLines.length>0,"warehouse B must contain real stock-count snapshot lines");
  assert.equal(staffLines[0].counted_quantity,null);
  const warehouseBCountsBeforeDeniedWrites=await db.unsafe(
    "select (select count(*)::integer from public.stock_count_sessions where organization_id=$1::uuid) as sessions,"+
    "(select count(*)::integer from public.stock_count_lines where organization_id=$1::uuid) as lines",
    [org]
  );

  await assert.rejects(
    ()=>withActor(db,manager,tx=>tx.unsafe(
      "select public.set_stock_count_line($1::uuid,$2::uuid,88::numeric)",
      [staffSession.id,staffLines[0].product_id]
    )),
    error=>error&&String(error.code)==="42501",
    "the manager RPC must reject a same-tenant stock-count session on unassigned warehouse B"
  );
  await assert.rejects(
    ()=>withActorAsServiceRole(db,manager,tx=>tx.unsafe(
      "update public.stock_count_lines set counted_quantity=88::numeric where id=$1::uuid returning id",
      [staffLines[0].id]
    )),
    error=>error&&String(error.code)==="42501",
    "guard_stock_count_line_authorization_v2 must itself reject the manager's direct row UPDATE on warehouse B"
  );
  const unchangedBLine=await db.unsafe(
    "select counted_quantity::text as counted_quantity,counted_by::text as counted_by from public.stock_count_lines where id=$1::uuid",
    [staffLines[0].id]
  );
  assert.deepEqual(unchangedBLine[0],{counted_quantity:null,counted_by:null},
    "the denied warehouse B row write must leave the snapshot line unchanged");
  const warehouseBCountsAfterDeniedWrites=await db.unsafe(
    "select (select count(*)::integer from public.stock_count_sessions where organization_id=$1::uuid) as sessions,"+
    "(select count(*)::integer from public.stock_count_lines where organization_id=$1::uuid) as lines",
    [org]
  );
  assert.deepEqual(warehouseBCountsAfterDeniedWrites[0],warehouseBCountsBeforeDeniedWrites[0],
    "denied warehouse B RPC/trigger writes must leave count-session and count-line row counts unchanged");
  // A manager assigned to warehouse A must not review/finalize a B-session.
  const warehouseBFinalizeBefore=await db.unsafe(
    "select status,completed_by::text from public.stock_count_sessions where id=$1::uuid",
    [staffSession.id]
  );
  const warehouseBMovementsBefore=await db.unsafe(
    "select count(*)::integer as count from public.inventory_movements "+
    "where reference_type='stock_count_session' and reference_id=$1::uuid",
    [staffSession.id]
  );
  const warehouseBAuditBefore=await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where entity_type='stock_count_session' "+
    "and entity_id=$1::uuid and action='inventory.stock_count.completed'",
    [staffSession.id]
  );
  await assert.rejects(
    ()=>withActor(db,manager,tx=>tx.unsafe(
      "select public.complete_stock_count($1::uuid)",[staffSession.id]
    )),
    error=>error&&String(error.code)==="42501",
    "the actual stock-count completion RPC must deny a reviewer assigned only to warehouse A from warehouse B"
  );
  const warehouseBFinalizeAfter=await db.unsafe(
    "select status,completed_by::text from public.stock_count_sessions where id=$1::uuid",
    [staffSession.id]
  );
  assert.deepEqual(warehouseBFinalizeAfter[0],warehouseBFinalizeBefore[0],
    "cross-warehouse completion denial must preserve the B session state");
  const warehouseBMovementsAfter=await db.unsafe(
    "select count(*)::integer as count from public.inventory_movements "+
    "where reference_type='stock_count_session' and reference_id=$1::uuid",
    [staffSession.id]
  );
  const warehouseBAuditAfter=await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where entity_type='stock_count_session' "+
    "and entity_id=$1::uuid and action='inventory.stock_count.completed'",
    [staffSession.id]
  );
  assert.deepEqual(warehouseBMovementsAfter[0],warehouseBMovementsBefore[0],
    "cross-warehouse completion denial must not post inventory movements");
  assert.deepEqual(warehouseBAuditAfter[0],warehouseBAuditBefore[0],
    "cross-warehouse completion denial must not add a completion audit");

  await assert.rejects(
    ()=>withActorAsServiceRole(db,manager,tx=>tx.unsafe(
      "update public.stock_count_sessions set status='completed' where id=$1::uuid returning id",
      [managerSession.id]
    )),
    error=>error&&String(error.code)==="42501",
    "the maker must not finalize their own stock-count session"
  );
  const unchangedSession=await db.unsafe(
    "select status from public.stock_count_sessions where id=$1::uuid",
    [managerSession.id]
  );
  assert.equal(unchangedSession[0]?.status,"open",
    "a rejected maker finalization must leave the stock-count session open");

  // Fill every count line as the maker, then prove the actual completion RPC
  // rejects that maker before inventory or audit writes.
  for(const line of managerLines.slice(1)) {
    const lineWrite=await withActor(db,manager,tx=>tx.unsafe(
      "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric) as result",
      [managerSession.id,line.product_id,line.expected_quantity]
    ));
    const lineResult=typeof lineWrite[0].result==="string"?JSON.parse(lineWrite[0].result):lineWrite[0].result;
    assert.equal(lineResult.counted_by,manager.profile_id,
      "every stock-count quantity must be attributed to its maker");
  }
  const completedDraftLines=await db.unsafe(
    "select count(*)::integer as total,count(*) filter(where counted_quantity is not null)::integer as counted,"+
    "count(*) filter(where counted_by=$2::uuid)::integer as maker_lines "+
    "from public.stock_count_lines where session_id=$1::uuid",
    [managerSession.id,manager.profile_id]
  );
  assert.equal(completedDraftLines[0].counted,completedDraftLines[0].total);
  assert.equal(completedDraftLines[0].maker_lines,completedDraftLines[0].total,
    "all snapshot quantities must be entered by the same maker before review");

  const makerMovementBefore=await db.unsafe(
    "select count(*)::integer as count from public.inventory_movements "+
    "where reference_type='stock_count_session' and reference_id=$1::uuid",
    [managerSession.id]
  );
  const makerAuditBefore=await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where entity_type='stock_count_session' "+
    "and entity_id=$1::uuid and action='inventory.stock_count.completed'",
    [managerSession.id]
  );
  await assert.rejects(
    ()=>withActor(db,manager,tx=>tx.unsafe(
      "select public.complete_stock_count($1::uuid)",[managerSession.id]
    )),
    error=>error&&String(error.code)==="42501",
    "complete_stock_count must deny the maker even when every line is counted"
  );
  const afterMakerRpcDenied=await db.unsafe(
    "select status,completed_by::text from public.stock_count_sessions where id=$1::uuid",
    [managerSession.id]
  );
  assert.deepEqual(afterMakerRpcDenied[0],{status:"open",completed_by:null},
    "maker RPC denial must keep the session open and without a completing actor");
  const makerMovementAfter=await db.unsafe(
    "select count(*)::integer as count from public.inventory_movements "+
    "where reference_type='stock_count_session' and reference_id=$1::uuid",
    [managerSession.id]
  );
  const makerAuditAfter=await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where entity_type='stock_count_session' "+
    "and entity_id=$1::uuid and action='inventory.stock_count.completed'",
    [managerSession.id]
  );
  assert.deepEqual(makerMovementAfter[0],makerMovementBefore[0],
    "denied maker completion must not write inventory movements");
  assert.deepEqual(makerAuditAfter[0],makerAuditBefore[0],
    "denied maker completion must not write a completion audit");

  // Provision the independent reviewer scope only inside this disposable local
  // PostgreSQL acceptance database; record the fixture's authority change.
  const reviewerScopeRows=await db.unsafe(
    "select id::text,is_active from public.authorization_profile_scopes "+
    "where organization_id=$1::uuid and profile_id=$2::uuid and scope_kind='warehouse' and warehouse_id=$3::uuid",
    [org,admin.profile_id,targetWarehouse]
  );
  assert.ok(reviewerScopeRows.length<=1,"admin reviewer must have at most one warehouse A scope");
  if(reviewerScopeRows.length===1) {
    assert.equal(reviewerScopeRows[0].is_active,true,
      "any existing admin warehouse reviewer assignment must be active in the isolated fixture");
  } else {
    const reviewerScopeId=randomUUID();
    await withActorAsServiceRole(db,admin,tx=>tx.unsafe(
      "insert into public.authorization_profile_scopes("+
      "id,organization_id,profile_id,scope_kind,warehouse_id,customer_id,reason,is_active,"+
      "valid_from,expires_at,revision,created_by,updated_by) "+
      "values($1::uuid,$2::uuid,$3::uuid,'warehouse',$4::uuid,NULL,$5::text,true,"+
      "statement_timestamp(),NULL,1,$3::uuid,$3::uuid) returning id",
      [reviewerScopeId,org,admin.profile_id,targetWarehouse,
       "P2 isolated independent reviewer assignment for stock-count acceptance"]
    ));
    await withActorAsServiceRole(db,admin,tx=>tx.unsafe(
      "insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value) "+
      "values($1::uuid,$2::uuid,'authorization.scope.assignment.fixture','authorization_profile_scope',$3::uuid,"+
      "'{}'::jsonb,jsonb_build_object('warehouse_id',$4::uuid,'is_active',true))",
      [org,admin.profile_id,reviewerScopeId,targetWarehouse]
    ));
  }
  const adminFinalizeDecision=await resourceDecision(db,admin,"inventory.count.finalize",targetWarehouse);
  assert.equal(adminFinalizeDecision.decision,"REQUIRES_APPROVAL",
    "the independent admin must hold an active warehouse-scoped maker-checker grant");
  assert.equal(adminFinalizeDecision.separation_of_duties,true);

  const inventoryBeforeReview=await db.unsafe(
    "select ib.product_id::text,ib.quantity_on_hand::text,ib.quantity_reserved::text "+
    "from public.inventory_balances ib where ib.warehouse_id=$1::uuid "+
    "and ib.product_id in (select product_id from public.stock_count_lines where session_id=$2::uuid) "+
    "order by ib.product_id",
    [targetWarehouse,managerSession.id]
  );
  const reviewRows=await withActor(db,admin,tx=>tx.unsafe(
    "select public.complete_stock_count($1::uuid) as result",[managerSession.id]
  ));
  const reviewResult=typeof reviewRows[0].result==="string"?JSON.parse(reviewRows[0].result):reviewRows[0].result;
  assert.equal(reviewResult.status,"completed",
    "an independent assigned admin must complete the manager's count through the real RPC");
  assert.equal(reviewResult.session_id,managerSession.id);
  const completedSession=await db.unsafe(
    "select status,completed_by::text,started_by::text,counted_lines,total_lines "+
    "from public.stock_count_sessions where id=$1::uuid",[managerSession.id]
  );
  assert.deepEqual(completedSession[0],{
    status:"completed",completed_by:admin.profile_id,started_by:manager.profile_id,
    counted_lines:completedDraftLines[0].total,total_lines:completedDraftLines[0].total
  },"the independent reviewer must finalize the fully counted snapshot");

  const stockCountMovements=await db.unsafe(
    "select id::text,product_id::text,quantity::text,balance_after::text from public.inventory_movements "+
    "where reference_type='stock_count_session' and reference_id=$1::uuid and movement_type='stock_count_adjustment' order by product_id",
    [managerSession.id]
  );
  assert.equal(stockCountMovements.length,reviewResult.adjusted_lines,
    "accepted completion must equal the number of persisted stock-adjustment movements");
  assert.ok(stockCountMovements.length>0,
    "the counted variance must produce a real append-only stock-adjustment movement");
  const inventoryAfterReview=await db.unsafe(
    "select ib.product_id::text,ib.quantity_on_hand::text,ib.quantity_reserved::text "+
    "from public.inventory_balances ib where ib.warehouse_id=$1::uuid "+
    "and ib.product_id in (select product_id from public.stock_count_lines where session_id=$2::uuid) "+
    "order by ib.product_id",
    [targetWarehouse,managerSession.id]
  );
  assert.notDeepEqual(inventoryAfterReview,inventoryBeforeReview,
    "independent finalization must update the source inventory balances");
  const completionAudit=await db.unsafe(
    "select actor_id::text,action from public.audit_logs where organization_id=$1::uuid "+
    "and entity_type='stock_count_session' and entity_id=$2::uuid "+
    "and action='inventory.stock_count.completed'",
    [org,managerSession.id]
  );
  assert.deepEqual([...completionAudit],[{actor_id:admin.profile_id,action:"inventory.stock_count.completed"}],
    "one completion audit must identify the independent reviewer");

  // P2 acceptance: approval-gated pricing proposals and guarded manager edit path.
 
  // P2 acceptance: database-side product pagination and field-level price projection.
  const adminPageIds=Array.from({length:4},()=>randomUUID());
  const adminPagePrefix="P2-ADMIN-PAGE-"+process.pid+"-"+Date.now();
  const pageFixtures=[
    ["P2 Admin Page Fixture 001",adminPagePrefix+"-001","active"],
    ["P2 Admin Page Fixture 002",adminPagePrefix+"-002","active"],
    ["P2 Admin Page Fixture 003",adminPagePrefix+"-003","active"],
    ["P2 Admin Page Fixture 004",adminPagePrefix+"-004","inactive"],
  ];
  try {
    for(let index=0;index<pageFixtures.length;index+=1) {
      const fixture=pageFixtures[index];
      await db.unsafe(
        "insert into public.products(id,organization_id,category_id,name,item_code,barcode,description,unit,base_price,cost_price,min_stock,status) "+
        "values($1::uuid,$2::uuid,NULL,$3::text,$4::text,NULL,$5::text,'carton',38500,19000,0,$6::text)",
        [adminPageIds[index],org,fixture[0],fixture[1],"P2 isolated SQL pagination fixture",fixture[2]]
      );
    }
    const readAdminProductPage=async(actor,page,activeOnly=false)=> {
      const rows=await withActor(db,actor,tx=>tx.unsafe(
        "select public.get_admin_products_page($1::integer,$2::integer,$3::text,$4::boolean,NULL::uuid) as page",
        [page,2,adminPagePrefix,activeOnly]
      ));
      const payload=typeof rows[0]?.page==="string"?JSON.parse(rows[0].page):rows[0]?.page;
      assert.ok(payload&&typeof payload==="object"&&!Array.isArray(payload),"admin product page RPC must return a JSON page envelope");
      assert.equal(payload.page,page);
      assert.equal(payload.page_size,2);
      assert.ok(Array.isArray(payload.items));
      assert.ok(payload.items.length<=2,"PostgreSQL must return no more than the requested page size");
      assert.equal(typeof payload.has_next_page,"boolean");
      return payload;
    };
    const managerPageOne=await readAdminProductPage(manager,1,false);
    const managerPageTwo=await readAdminProductPage(manager,2,false);
    assert.equal(managerPageOne.items.length,2);
    assert.equal(managerPageOne.has_next_page,true,"four matching rows must expose a second page");
    assert.equal(managerPageTwo.items.length,2);
    assert.equal(managerPageTwo.has_next_page,false);
    const managerActivePage=await readAdminProductPage(manager,1,true);
    assert.equal(managerActivePage.items.length,2);
    assert.equal(managerActivePage.has_next_page,true,"active filtering must run before pagination");
    for(const row of [...managerPageOne.items,...managerPageTwo.items]) {
      assert.equal(Object.hasOwn(row,"base_price"),true,"authorized manager JSON must include permitted base_price");
      assert.equal(Object.hasOwn(row,"cost_price"),false,"page RPC must not include product cost");
      assert.equal(Object.hasOwn(row,"margin"),false,"page RPC must not include margins");
    }
    const staffPage=await readAdminProductPage(staff,1,false);
    assert.equal(staffPage.items.length,2);
    for(const row of staffPage.items) {
      assert.equal(Object.hasOwn(row,"base_price"),false,"staff JSON must omit the base-price key completely");
      assert.equal(Object.hasOwn(row,"cost_price"),false);
      assert.equal(Object.hasOwn(row,"margin"),false);
    }
    await assert.rejects(
      ()=>withActor(db,accountant,tx=>tx.unsafe(
        "select public.get_admin_products_page(1,2,$1::text,false,NULL::uuid)",[adminPagePrefix]
      )),
      error=>error&&String(error.code)==="42501",
      "accountant without storefront-staff role must not read product administration pages"
    );
  } finally {
    await db.unsafe(
      "delete from public.products where id=any($1::uuid[]) and organization_id=$2::uuid",
      [adminPageIds,org]
    );
  }
  const pricingInsertSql =
    "insert into public.pricing_rules("+
    "organization_id,name,scope_type,scope_value,base_type,base_source,adjustment_type,"+
    "calculation_method,adjustment_value,target_tier,min_quantity,priority,is_active,effective_from,effective_until"+
    ") values($1::uuid,$2::text,'default',NULL,'base_price','base_price','fixed','fixed_price',"+
    "$3::numeric,'retail',1,$4::integer,false,NULL,NULL) "+
    "returning id::text as id,submitted_by::text as submitted_by,requires_approval,approved_at,approved_by::text as approved_by,version";
  const auditCountForPricingRule=async(ruleId)=>{
    const rows=await db.unsafe(
      "select count(*)::integer as count from public.audit_logs "+
      "where entity_type='pricing_rule' and entity_id=$1::uuid",
      [ruleId]
    );
    return rows[0].count;
  };
  const readPricingRule=async(ruleId)=>{
    const rows=await db.unsafe(
      "select to_jsonb(r) as row from public.pricing_rules r where r.id=$1::uuid",
      [ruleId]
    );
    assert.equal(rows.length,1,"pricing rule fixture must remain in the local tenant");
    return rows[0].row;
  };

  // Ordinary staff may submit a proposal, but cannot edit it or approve it.
  const staffProposalRows=await withActor(db,staff,tx=>tx.unsafe(
    pricingInsertSql,[org,"P2 staff pricing proposal",123,99001]
  ));
  const staffProposal=staffProposalRows[0];
  assert.ok(staffProposal.id,"staff proposal must be persisted");
  assert.equal(staffProposal.submitted_by,staff.profile_id);
  assert.equal(staffProposal.requires_approval,true,"staff proposal must be routed to approval");
  assert.equal(staffProposal.approved_at,null);
  const staffProposalBefore=await readPricingRule(staffProposal.id);
  const staffProposalAuditBefore=await auditCountForPricingRule(staffProposal.id);
  const deniedStaffUpdate=await withActor(db,staff,tx=>tx.unsafe(
    "update public.pricing_rules set adjustment_value=124 where id=$1::uuid returning id",
    [staffProposal.id]
  ));
  assert.equal(deniedStaffUpdate.length,0,
    "RLS must expose no editable row to staff with proposal-only capability");
  await assert.rejects(
    ()=>withActor(db,staff,tx=>tx.unsafe(
      "select public.approve_pricing_rule($1::uuid,'self approval attempt')",[staffProposal.id]
    )),
    error=>error&&String(error.code)==="42501",
    "staff without pricing.approve must not approve a pricing proposal"
  );
  await assert.rejects(
    ()=>withActor(db,accountant,tx=>tx.unsafe(
      "select public.approve_pricing_rule($1::uuid,'unauthorized approval attempt')",[staffProposal.id]
    )),
    error=>error&&String(error.code)==="42501",
    "accountant must not approve pricing proposals"
  );
  assert.deepEqual(await readPricingRule(staffProposal.id),staffProposalBefore,
    "denied staff edit/approval attempts must preserve every pricing rule field");
  assert.equal(await auditCountForPricingRule(staffProposal.id),staffProposalAuditBefore,
    "denied staff edit/approval attempts must not create a pricing audit event");
  const managerApproval=await withActor(db,manager,tx=>tx.unsafe(
    "select public.approve_pricing_rule($1::uuid,'Reviewed independent price proposal') as result",
    [staffProposal.id]
  ));
  assert.equal(managerApproval[0].result.approved,true,"a different authorized manager must approve a staff proposal");
  const staffProposalApproved=await readPricingRule(staffProposal.id);
  assert.equal(staffProposalApproved.approved_by,manager.profile_id);
  assert.ok(staffProposalApproved.approved_at);
  assert.equal(staffProposalApproved.approval_note,"Reviewed independent price proposal");
  assert.equal(await auditCountForPricingRule(staffProposal.id),staffProposalAuditBefore+1,
    "successful independent approval must add exactly one pricing audit event");

  // Explicit edit denial must override the manager's legacy role while preserving proposal/approval separation.
  const managerEditDenial=await withActor(db,admin,tx=>tx.unsafe(
    "select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',$2::text,NULL::timestamptz,true) as result",
    [manager.profile_id,"Pricing edits temporarily require independent approval"]
  ));
  assert.equal(managerEditDenial[0].result.changed,true);
  assert.equal((await decision(db,manager,"pricing.edit_draft")).decision,"DENY");
  assert.equal((await decision(db,manager,"pricing.propose")).decision,"PERMIT",
    "a scoped edit denial must not silently remove the separate proposal capability");
  assert.equal((await decision(db,manager,"pricing.approve")).decision,"PERMIT",
    "a scoped edit denial must not silently remove the independent approval capability");
  const managerProposalRows=await withActor(db,manager,tx=>tx.unsafe(
    pricingInsertSql,[org,"P2 manager proposal under edit denial",124,99002]
  ));
  const managerProposal=managerProposalRows[0];
  assert.ok(managerProposal.id);
  assert.equal(managerProposal.submitted_by,manager.profile_id);
  assert.equal(managerProposal.requires_approval,true,
    "a manager whose edit capability is explicitly denied must fall back to the approval-gated proposal path");
  const managerProposalBefore=await readPricingRule(managerProposal.id);
  const managerProposalAuditBefore=await auditCountForPricingRule(managerProposal.id);
  const deniedManagerUpdate=await withActor(db,manager,tx=>tx.unsafe(
    "update public.pricing_rules set adjustment_value=125 where id=$1::uuid returning id",
    [managerProposal.id]
  ));
  assert.equal(deniedManagerUpdate.length,0,
    "RLS must expose no editable row while the manager has an explicit pricing.edit_draft denial");
  await assert.rejects(
    ()=>withActor(db,manager,tx=>tx.unsafe(
      "select public.approve_pricing_rule($1::uuid,'same actor must not approve')",
      [managerProposal.id]
    )),
    error=>error&&String(error.code)==="42501",
    "pricing.approve capability must still enforce maker-checker against the same submitter"
  );
  assert.deepEqual(await readPricingRule(managerProposal.id),managerProposalBefore,
    "denied manager direct edit and self-approval must leave the submitted rule unchanged");
  assert.equal(await auditCountForPricingRule(managerProposal.id),managerProposalAuditBefore,
    "denied manager direct edit and self-approval must not create audit records");
  const independentApproval=await withActor(db,admin,tx=>tx.unsafe(
    "select public.approve_pricing_rule($1::uuid,'Independent administrator approval') as result",
    [managerProposal.id]
  ));
  assert.equal(independentApproval[0].result.approved,true,
    "an independent administrator must be able to approve the manager proposal");
  const managerProposalApproved=await readPricingRule(managerProposal.id);
  assert.equal(managerProposalApproved.approved_by,admin.profile_id);
  assert.ok(managerProposalApproved.approved_at);
  assert.equal(await auditCountForPricingRule(managerProposal.id),managerProposalAuditBefore+1);
  await withActor(db,admin,tx=>tx.unsafe(
    "select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',NULL,NULL::timestamptz,false)",
    [manager.profile_id]
  ));
  assert.equal((await decision(db,manager,"pricing.edit_draft")).decision,"PERMIT",
    "revoking the explicit denial must restore the manager's original edit grant");

  // Authorized manager draft creation and update continue to work through the same audited table contract.
  const managerDraftRows=await withActor(db,manager,tx=>tx.unsafe(
    pricingInsertSql,[org,"P2 manager editable pricing draft",125,99003]
  ));
  const managerDraft=managerDraftRows[0];
  assert.ok(managerDraft.id);
  assert.equal(managerDraft.submitted_by,manager.profile_id);
  assert.equal(managerDraft.requires_approval,false,
    "a manager with pricing.edit_draft must retain the direct draft workflow");
  const managerDraftBefore=await readPricingRule(managerDraft.id);
  const managerDraftAuditBefore=await auditCountForPricingRule(managerDraft.id);
  const managerDraftUpdate=await withActor(db,manager,tx=>tx.unsafe(
    "update public.pricing_rules set adjustment_value=126 where id=$1::uuid "+
    "returning id::text as id,adjustment_value,version",
    [managerDraft.id]
  ));
  assert.equal(managerDraftUpdate.length,1,"authorized manager edit must persist the draft");
  assert.equal(Number(managerDraftUpdate[0].adjustment_value),126);
  assert.ok(managerDraftUpdate[0].version>managerDraftBefore.version,
    "authorized manager update must advance the optimistic version");
  assert.equal(await auditCountForPricingRule(managerDraft.id),managerDraftAuditBefore+1,
    "authorized manager update must append one pricing audit event");


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
  assert.equal(
    new Set(listedDenials.map((entry)=>entry.denial_id)).size,
    listedDenials.length,
    "the denial-history RPC must return each persisted denial exactly once"
  );
  const listedTargetDenials=listedDenials.filter((entry)=>entry.denial_id===deny[0].result.denial_id);
  assert.equal(listedTargetDenials.length,1,"the newly activated pricing denial must appear exactly once in the full history");
  const listedTargetDenial=listedTargetDenials[0];
  assert.equal(listedTargetDenial.capability_key,"pricing.edit_draft");
  assert.equal(listedTargetDenial.is_active,true);
  assert.equal(listedTargetDenial.reason,"Temporary authorization acceptance denial");
  assert.ok(
    listedDenials.some((entry)=>entry.capability_key==="inventory.balance.adjust"&&entry.is_active===true),
    "the manager's independent stock-adjustment denial from the local count fixture must remain visible and active"
  );
  await assert.rejects(
   ()=>withActor(db,manager,tx=>tx.unsafe(
    "select public.list_authorization_profile_denials($1::uuid)",
    [manager.profile_id])),
   error=>error&&String(error.code)==="42501",
   "non-admin members cannot inspect private explicit denial history"
  );
  const before=await db.unsafe("select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='authorization.capability.explicit_deny.changed' and entity_id=$2::uuid",[org,deny[0].result.denial_id]);
  const denialReplay =await withActor(db,admin,tx=>tx.unsafe(
   "select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',$2::text,NULL::timestamptz,true) as result",
   [manager.profile_id,"Temporary authorization acceptance denial"]));
  assert.equal(denialReplay[0].result.changed,false,"same deny replay must be idempotent");
  const after=await db.unsafe("select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='authorization.capability.explicit_deny.changed' and entity_id=$2::uuid",[org,deny[0].result.denial_id]);
  assert.equal(after[0].count,before[0].count,"idempotent replay must not duplicate audit");
  await withActor(db,admin,tx=>tx.unsafe("select public.set_authorization_profile_denial($1::uuid,'pricing.edit_draft',NULL,NULL::timestamptz,false)",[manager.profile_id]));
  assert.equal((await decision(db,manager,"pricing.edit_draft")).decision,"PERMIT");
  const revokedList=await withActor(db,admin,tx=>tx.unsafe(
   "select public.list_authorization_profile_denials($1::uuid) as denials",
   [manager.profile_id]));
  const revokedDenials=typeof revokedList[0].denials==="string"?JSON.parse(revokedList[0].denials):revokedList[0].denials;
  const revokedTargetDenials=revokedDenials.filter((entry)=>entry.denial_id===deny[0].result.denial_id);
  assert.equal(revokedTargetDenials.length,1,"revoked pricing denial must remain exactly once in denial history");
  assert.equal(revokedTargetDenials[0].is_active,false,"revocation must remain visible in denial history");
  assert.ok(
    revokedDenials.some((entry)=>entry.capability_key==="inventory.balance.adjust"&&entry.is_active===true),
    "revoking pricing edits must not revoke the independent stock-adjustment denial"
  );

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
