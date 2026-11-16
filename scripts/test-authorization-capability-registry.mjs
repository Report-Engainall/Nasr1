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
   assert.match(fn.definition,/PERFORM public\.assert_inventory_transfer_scope_v2\(/,
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

  // P2 acceptance: approval-gated pricing proposals and the guarded manager edit path.
  const staff=actors.get("staff");
  const accountant=actors.get("accountant");
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
  await assert.rejects(
    ()=>withActor(db,staff,tx=>tx.unsafe(
      "update public.pricing_rules set adjustment_value=124 where id=$1::uuid",[staffProposal.id]
    )),
    error=>error&&String(error.code)==="42501",
    "staff with proposal-only capability must not edit a submitted pricing rule"
  );
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
  await assert.rejects(
    ()=>withActor(db,manager,tx=>tx.unsafe(
      "update public.pricing_rules set adjustment_value=125 where id=$1::uuid",
      [managerProposal.id]
    )),
    error=>error&&String(error.code)==="42501",
    "explicit pricing.edit_draft denial must reject manager direct edits"
  );
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
