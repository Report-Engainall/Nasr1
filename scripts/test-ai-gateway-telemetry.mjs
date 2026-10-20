import assert from "node:assert/strict";
import postgres from "postgres";
const connectionString=process.env.TEST_DATABASE_URL;if(!connectionString)throw new Error("TEST_DATABASE_URL is required for AI gateway telemetry acceptance.");
const db=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
async function expectFailure(label,action,pattern){
 await db.unsafe("SAVEPOINT expect_failure");let caught;try{await action();}catch(e){caught=e;}
 try{await db.unsafe("ROLLBACK TO SAVEPOINT expect_failure");await db.unsafe("RELEASE SAVEPOINT expect_failure");}catch{}
 assert.ok(caught,label+" should fail");if(pattern)assert.match(String(caught.message),pattern);
}
async function main(){
 await db.unsafe("BEGIN");const org=crypto.randomUUID(),profile=crypto.randomUUID(),user=crypto.randomUUID(),email="ai-telemetry-"+user+"@example.test";
 try{
  await db.unsafe("insert into public.organizations(id,name,currency) values($1,$2,'YER')",[org,"AI telemetry CI"]);
  await db.unsafe("insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'AI telemetry actor',$4,true)",[profile,user,org,email]);
  await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'admin')",[profile]);
  await db.unsafe("insert into public.ai_usage_budgets(organization_id,primary_provider,primary_model,primary_base_url,fallback_provider,fallback_model,fallback_base_url,daily_cost_limit,monthly_cost_limit,daily_token_limit,monthly_token_limit,per_request_cost_limit,ai_enabled,fallback_enabled) values($1,'openai_compatible','ci-primary','https://api.openai.com/v1','gemini','ci-fallback','https://generativelanguage.googleapis.com/v1beta',0.12,0.50,3000,10000,0.05,true,true)",[org]);
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.unsafe("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,email,role:"authenticated",email_confirmed_at:new Date().toISOString()})]);
  const reserve=async(id,i,o,c)=>{const r=await db.unsafe("select public.reserve_ai_gateway_usage($1::uuid,$2::text,$3::bigint,$4::bigint,$5::numeric) result",[user,id,i,o,c]);return r[0].result;};
  const complete=async(id,p)=>{const r=await db.unsafe("select public.complete_ai_gateway_usage_v2($1::uuid,$2::bigint,$3::bigint,$4::numeric,$5::bigint,$6::text,$7::text,$8::text,$9::boolean,$10::bigint,$11::bigint,$12::text,$13::jsonb) result",
   [id,p.i,p.o,p.c,p.ms,p.provider,p.model,p.result,p.fallback,p.observedI,p.observedO,p.status,db.json(p.attempts)]);return r[0].result;};
  const ledger=async(id)=>{const r=await db.unsafe("select actor_profile_id,request_id,input_tokens,output_tokens,estimated_cost,result_status,usage_measurement_status,observed_input_tokens,observed_output_tokens,provider_attempt_count,provider_attempts,outcome_reason from public.ai_usage_ledger where organization_id=$1 and request_id=$2",[org,id]);assert.equal(r.length,1);assert.equal(r[0].actor_profile_id,profile);return r[0];};
  const first=await reserve("ci-ai-measured-001",10,20,0.02);assert.equal(first.status,"reserved");
  const good=[{provider:"openai_compatible",model:"ci-primary",fallback:false,status:"succeeded",elapsed_ms:85,observed_input_tokens:10,observed_output_tokens:20,estimated_cost:0.02,error_code:null}];
  const measured={i:10,o:20,c:0.02,ms:85,provider:"openai_compatible",model:"ci-primary",result:"completed",fallback:false,observedI:10,observedO:20,status:"measured",attempts:good};
  assert.equal((await complete(first.reservation_id,measured)).status,"completed");let row=await ledger("ci-ai-measured-001");
  assert.equal(row.usage_measurement_status,"measured");assert.equal(Number(row.observed_input_tokens),10);assert.equal(row.provider_attempt_count,1);
  assert.equal((await complete(first.reservation_id,measured)).status,"already_completed");

  const second=await reserve("ci-ai-partial-002",100,384,0.04);assert.equal(second.status,"reserved");
  const partial=[
   {provider:"openai_compatible",model:"ci-primary",fallback:false,status:"failed",elapsed_ms:15000,observed_input_tokens:null,observed_output_tokens:null,estimated_cost:null,error_code:"provider_timeout"},
   {provider:"gemini",model:"ci-fallback",fallback:true,status:"succeeded",elapsed_ms:240,observed_input_tokens:80,observed_output_tokens:21,estimated_cost:0.01,error_code:null}
  ];
  assert.equal((await complete(second.reservation_id,{i:100,o:384,c:0.04,ms:15240,provider:"gemini",model:"ci-fallback",result:"fallback",fallback:true,observedI:80,observedO:21,status:"partial",attempts:partial})).status,"completed");
  row=await ledger("ci-ai-partial-002");assert.equal(row.usage_measurement_status,"partial");assert.equal(Number(row.observed_input_tokens),80);
  assert.equal(Number(row.input_tokens),100);assert.equal(Number(row.output_tokens),384);assert.equal(row.provider_attempts[0].observed_input_tokens,null);assert.equal(row.provider_attempts[0].estimated_cost,null);

  const third=await reserve("ci-ai-unknown-003",100,768,0.04);assert.equal(third.status,"reserved");
  const failed=[
   {provider:"openai_compatible",model:"ci-primary",fallback:false,status:"failed",elapsed_ms:700,observed_input_tokens:null,observed_output_tokens:null,estimated_cost:null,error_code:"provider_http_503"},
   {provider:"gemini",model:"ci-fallback",fallback:true,status:"failed",elapsed_ms:900,observed_input_tokens:null,observed_output_tokens:null,estimated_cost:null,error_code:"provider_unavailable"}
  ];
  assert.equal((await complete(third.reservation_id,{i:100,o:768,c:0.04,ms:1600,provider:"gemini",model:"ci-fallback",result:"failed",fallback:true,observedI:null,observedO:null,status:"unknown",attempts:failed})).status,"completed");
  row=await ledger("ci-ai-unknown-003");assert.equal(row.usage_measurement_status,"unknown");assert.equal(row.observed_input_tokens,null);assert.equal(Number(row.estimated_cost),0.04);

  let outcome=await db.unsafe("select public.record_ai_gateway_no_provider_attempt($1::uuid,$2::text,$3::text) result",[user,"ci-ai-no-provider-004","provider_not_configured"]);
  assert.equal(outcome[0].result.status,"recorded");row=await ledger("ci-ai-no-provider-004");assert.equal(row.usage_measurement_status,"not_attempted");
  assert.equal(row.provider_attempt_count,0);assert.equal(Number(row.estimated_cost),0);assert.equal(row.outcome_reason,"provider_not_configured");
  outcome=await db.unsafe("select public.record_ai_gateway_no_provider_attempt($1::uuid,$2::text,$3::text) result",[user,"ci-ai-no-provider-004","provider_not_configured"]);
  assert.equal(outcome[0].result.status,"already_recorded");
  await expectFailure("no-provider replay with different outcome rejected",()=>db.unsafe("select public.record_ai_gateway_no_provider_attempt($1::uuid,$2::text,$3::text)",[user,"ci-ai-no-provider-004","ai_disabled"]),/different payload/i);

  const deniedResult=await reserve("ci-ai-quota-denied-005",100,384,0.03);assert.equal(deniedResult.status,"quota_exceeded");
  row=await ledger("ci-ai-quota-denied-005");assert.equal(row.result_status,"rejected_quota");assert.equal(row.usage_measurement_status,"not_attempted");
  assert.equal(row.outcome_reason,"quota_exceeded");assert.equal(row.provider_attempt_count,0);

  await expectFailure("authenticated cannot call privileged completion",async()=>{
   await db.unsafe("set role authenticated");
   await db.unsafe("select public.complete_ai_gateway_usage_v2($1::uuid,$2::bigint,$3::bigint,$4::numeric,$5::bigint,$6::text,$7::text,$8::text,$9::boolean,$10::bigint,$11::bigint,$12::text,$13::jsonb)",
    [first.reservation_id,10,20,0.02,85,"openai_compatible","ci-primary","completed",false,10,20,"measured",db.json(good)]);
  },/permission denied/i);
  process.stdout.write("PASS AI usage telemetry: measured/partial/unknown, no-provider, idempotency, quota denial, and service-only RPCs\\n");
 }finally{try{await db.unsafe("RESET ROLE");}catch{}try{await db.unsafe("ROLLBACK");}catch{}try{await db.unsafe("select set_config('request.jwt.claim.sub','',false)");}catch{}try{await db.unsafe("select set_config('request.jwt.claims','',false)");}catch{}}
}
try{await main();}catch(cause){const e=cause&&typeof cause==="object"?cause:{message:String(cause)};process.stderr.write("AI_GATEWAY_USAGE_TELEMETRY_ACCEPTANCE_FAILED "+JSON.stringify({name:e.name,message:e.message,code:e.code,detail:e.detail,hint:e.hint,where:e.where,constraint:e.constraint})+"\\n");throw cause;}finally{await db.end({timeout:5});}
