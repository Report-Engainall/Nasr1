import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = requiredEnv("TEST_DATABASE_URL");
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const organizationId = "a0000000-0000-0000-0000-000000000001";
const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
const ids = { customers:[randomUUID(),randomUUID()], foreignCustomer:randomUUID(), orders:[randomUUID(),randomUUID(),randomUUID()], invoices:[randomUUID(),randomUUID(),randomUUID()] };
const db = postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
const managerDb = postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
const suffix = randomUUID().replaceAll("-","").slice(-12).toUpperCase();
const sameName = "P2 Same-name customer identity "+suffix;
const amounts = ["111.11","222.22"];
let fixturesStarted=false;

function requiredEnv(name){const value=process.env[name]?.trim();if(!value)throw new Error(name+" is required for receivable identity acceptance.");return value.replace(/^"(.*)"$/s,"$1");}
function asJson(value){return typeof value==="string"?JSON.parse(value):value;}
async function setIdentity(client,authUserId,email){
 await client.unsafe("reset role").catch(()=>{});
 await client.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1::uuid,$1::uuid,now(),now(),now(),null,'P2 receivable identity acceptance','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",[authUserId]);
 await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[authUserId]);
 await client.unsafe("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:authUserId,email,email_confirmed_at:new Date().toISOString(),role:"authenticated",session_id:authUserId})]);
 await client.unsafe("set role authenticated");
}
async function main(){
 const managers=await db.unsafe("select id::text,auth_user_id::text,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true",[organizationId,managerEmail]);
 assert.equal(managers.length,1,"P2 fixture must expose exactly one active manager in the target organization");
 const manager=managers[0];
 await db.unsafe(
  "insert into public.customers(id,organization_id,customer_code,business_name,contact_name,tier,credit_limit,current_balance,status,approved_at) values"+
  "($1::uuid,$3::uuid,$4,$5,$5,'retail',0,0,'approved',now()),"+
  "($2::uuid,$3::uuid,$6,$5,$5,'retail',0,0,'approved',now()),"+
  "($7::uuid,$8::uuid,$9,$10,$10,'retail',0,0,'approved',now())",
  [ids.customers[0],ids.customers[1],organizationId,"P2-AGING-A-"+suffix,sameName,"P2-AGING-B-"+suffix,ids.foreignCustomer,foreignOrganizationId,"P2-AGING-X-"+suffix,"P2 Foreign tenant customer "+suffix]
 );
 fixturesStarted=true;
 await db.unsafe(
  "insert into public.orders(id,organization_id,customer_id,order_number,status,total_amount,total_items) values"+
  "($1::uuid,$2::uuid,$3::uuid,$4,'draft',$5::numeric,1),"+
  "($6::uuid,$2::uuid,$7::uuid,$8,'draft',$9::numeric,1),"+
  "($10::uuid,$2::uuid,$3::uuid,$11,'draft',$12::numeric,1)",
  [ids.orders[0],organizationId,ids.customers[0],"P2-AGING-ORDER-A-"+suffix,amounts[0],ids.orders[1],ids.customers[1],"P2-AGING-ORDER-B-"+suffix,amounts[1],ids.orders[2],"P2-AGING-ORDER-X-"+suffix,"333.33"]
 );
 const meta=await db.unsafe("select is_generated from information_schema.columns where table_schema='public' and table_name='customer_invoices' and column_name='customer_name'");
 assert.equal(meta.length,1,"customer invoice schema must expose the finance display-name snapshot");
 const columns="id,organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount";
 let invoiceSql,invoiceParams;
 if(meta[0].is_generated==="NEVER"){
  invoiceSql="insert into public.customer_invoices("+columns+",customer_name) values"+
   "($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'issued',now()-interval '60 days',now()-interval '45 days','YER',$6::numeric,0,$6::numeric,$7),"+
   "($8::uuid,$2::uuid,$9::uuid,$10::uuid,$11,'issued',now()-interval '60 days',now()-interval '45 days','YER',$12::numeric,0,$12::numeric,$13),"+
   "($14::uuid,$2::uuid,$15::uuid,$16::uuid,$17,'issued',now()-interval '60 days',now()-interval '45 days','YER',333.33,0,333.33,$18)";
  invoiceParams=[ids.invoices[0],organizationId,ids.customers[0],ids.orders[0],"P2-AGING-INVOICE-A-"+suffix,amounts[0],sameName,ids.invoices[1],ids.customers[1],ids.orders[1],"P2-AGING-INVOICE-B-"+suffix,amounts[1],sameName,ids.invoices[2],ids.foreignCustomer,ids.orders[2],"P2-AGING-INVOICE-X-"+suffix,"Foreign tenant reference"];
 }else{
  invoiceSql="insert into public.customer_invoices("+columns+") values"+
   "($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'issued',now()-interval '60 days',now()-interval '45 days','YER',$6::numeric,0,$6::numeric),"+
   "($7::uuid,$2::uuid,$8::uuid,$9::uuid,$10,'issued',now()-interval '60 days',now()-interval '45 days','YER',$11::numeric,0,$11::numeric),"+
   "($12::uuid,$2::uuid,$13::uuid,$14::uuid,$15,'issued',now()-interval '60 days',now()-interval '45 days','YER',333.33,0,333.33)";
  invoiceParams=[ids.invoices[0],organizationId,ids.customers[0],ids.orders[0],"P2-AGING-INVOICE-A-"+suffix,amounts[0],ids.invoices[1],ids.customers[1],ids.orders[1],"P2-AGING-INVOICE-B-"+suffix,amounts[1],ids.invoices[2],ids.foreignCustomer,ids.orders[2],"P2-AGING-INVOICE-X-"+suffix];
 }
 await db.unsafe(invoiceSql,invoiceParams);
 await setIdentity(managerDb,manager.auth_user_id,manager.email);
 const response=await managerDb.unsafe("select public.fetch_executive_receivable_customer_aging() as result");
 assert.equal(response.length,1);
 const result=asJson(response[0].result);
 assert.ok(result&&Array.isArray(result.items),"finance aging RPC must return item rows");
 const rows=result.items.filter(item=>item.customerName===sameName&&item.currency==="YER");
 assert.equal(rows.length,2,"different customer IDs with one display name must remain separate");
 assert.deepEqual(new Set(rows.map(item=>item.customerId)),new Set(ids.customers),"response must preserve both customer UUIDs");
 const byCustomer=new Map(rows.map(item=>[item.customerId,item]));
 for(let index=0;index<2;index++){
  const row=byCustomer.get(ids.customers[index]);
  assert.ok(row,"invoice owner must have a separate aging row");
  assert.equal(Number(row.totalOutstanding),Number(amounts[index]));
  assert.equal(Number(row.overdueAmount),Number(amounts[index]));
  assert.equal(row.invoiceCount,1,"one customer's invoice must not be included in the other's total");
  const evidence=row.agingBuckets.flatMap(bucket=>bucket.evidenceIds);
  assert.ok(evidence.includes("customer-invoice:"+ids.invoices[index]));
  assert.ok(!evidence.includes("customer-invoice:"+ids.invoices[1-index]));
 }
 assert.equal(result.complete,false,"cross-tenant invoice/customer references must make coverage partial");
 assert.ok(result.unresolvedRows>=1,"cross-tenant references must be counted as unresolved");
 assert.ok(!result.items.some(item=>item.customerId===ids.foreignCustomer),"foreign customer UUID must never appear in results");
 process.stdout.write("P2 customer receivable identity PASS: duplicate names separated; cross-tenant invoice reference withheld.\n");
}
try{
 try{await main();}
 finally{
  if(fixturesStarted){
   await db.unsafe("delete from public.customer_invoices where id=any($1::uuid[])",[ids.invoices]).catch(()=>{});
   await db.unsafe("delete from public.orders where id=any($1::uuid[])",[ids.orders]).catch(()=>{});
   await db.unsafe("delete from public.customers where id=any($1::uuid[])",[[...ids.customers,ids.foreignCustomer]]).catch(()=>{});
  }
 }
}finally{
 await managerDb.end({timeout:5}).catch(()=>{});
 await db.end({timeout:5}).catch(()=>{});
}
