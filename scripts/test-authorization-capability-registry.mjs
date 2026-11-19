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
 const migrationSql=migrationSource.replace(/^\s*BEGIN;\s*/i,"").replace(/\s*COMMIT;\s*$/i,"");
 if(migrationSql===migrationSource) throw new Error("Could not isolate authorization prerequisite migration body for rollback-only upgrade fixture.");
 const rollbackMarker="ROLLBACK_AUTHORIZATION_PREREQUISITE_UPGRADE_FIXTURE";
 await assert.rejects(db.begin(async(tx)=>{
  const initial=await tx.unsafe("select capability_key from public.authorization_capabilities where capability_key in ('inventory.balance.adjust','inventory.reorder_point.write') order by capability_key");
  assert.equal(initial.length,2,"upgrade fixture requires both existing capability rows");
  const grant=await tx.unsafe("select role from public.authorization_role_capabilities where role='manager' and capability_key='inventory.reorder_point.write'");
  assert.equal(grant.length,1,"upgrade fixture requires a manager grant to remove");
  await tx.unsafe("update public.authorization_capabilities set scope_kind='warehouse',is_active=true where capability_key='inventory.balance.adjust'");
  await tx.unsafe("update public.authorization_capabilities set is_active=false where capability_key='inventory.reorder_point.write'");
  await tx.unsafe("delete from public.authorization_role_capabilities where role='manager' and capability_key='inventory.reorder_point.write'");
  await tx.unsafe(migrationSql);
  const scope=await tx.unsafe("select scope_kind,is_active from public.authorization_capabilities where capability_key='inventory.balance.adjust'");
  assert.deepEqual(scope[0],{scope_kind:"warehouse",is_active:true},"prerequisite backfill must not widen or alter an existing warehouse capability");
  const disabled=await tx.unsafe("select is_active from public.authorization_capabilities where capability_key='inventory.reorder_point.write'");
  assert.equal(disabled[0]?.is_active,false,"prerequisite backfill must not reactivate an existing disabled capability");
  const restored=await tx.unsafe("select count(*)::integer as count from public.authorization_role_capabilities where role='manager' and capability_key='inventory.reorder_point.write'");
  assert.equal(restored[0].count,0,"prerequisite backfill must not recreate a deliberately removed role grant");
  const flag=await tx.unsafe("select current_setting('nasr.authorization_role_capabilities_preexisting',true) as existed");
  assert.equal(flag[0].existed,"true","fixture must prove the pre-existing-role-table upgrade branch");
  throw new Error(rollbackMarker);
 }),error=>error?.message===rollbackMarker,"upgrade-safety fixture rolls back its local policy mutations after proving the migration preserves existing state");
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