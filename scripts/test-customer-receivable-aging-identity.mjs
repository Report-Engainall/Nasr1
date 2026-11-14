import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = requiredEnv("TEST_DATABASE_URL");
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL").toLowerCase();
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
 const accountants=await db.unsafe("select p.id::text,p.auth_user_id::text,p.email from public.profiles p join public.user_roles r on r.profile_id=p.id and r.role='accountant' where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true",[organizationId,accountantEmail]);
 assert.equal(accountants.length,1,"P2 fixture must expose exactly one active accountant in the target organization");
 const accountant=accountants[0];
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
 const invoiceSql="insert into public.customer_invoices("+
  "id,organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount) values"+
  "($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'issued',now()-interval '60 days',now()-interval '45 days','YER',$6::numeric,0,$6::numeric),"+
  "($7::uuid,$2::uuid,$8::uuid,$9::uuid,$10,'issued',now()-interval '60 days',now()-interval '45 days','YER',$11::numeric,0,$11::numeric)";
 const invoiceParams=[
  ids.invoices[0],organizationId,ids.customers[0],ids.orders[0],"P2-AGING-INVOICE-A-"+suffix,amounts[0],
  ids.invoices[1],ids.customers[1],ids.orders[1],"P2-AGING-INVOICE-B-"+suffix,amounts[1]
 ];
 await db.unsafe(invoiceSql,invoiceParams);

 // The canonical composite tenant FK must reject an invoice whose customer belongs
 // to another organization. This proves the boundary at write time; the bad row
 // must never be persisted and therefore cannot pollute the finance RPC.
 let crossTenantInsertError=null;
 try{
  await db.unsafe(
   "insert into public.customer_invoices(id,organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount) "+
   "values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'issued',now()-interval '60 days',now()-interval '45 days','YER',333.33,0,333.33)",
   [ids.invoices[2],organizationId,ids.foreignCustomer,ids.orders[2],"P2-AGING-INVOICE-X-"+suffix]
  );
 }catch(error){crossTenantInsertError=error;}
 assert.ok(crossTenantInsertError,"cross-tenant invoice/customer ownership must be rejected by PostgreSQL");
 assert.equal(crossTenantInsertError.code,"23503","cross-tenant invoice/customer reference must fail as a foreign-key violation");
 assert.equal(crossTenantInsertError.constraint_name,"tenant_integrity_invoices_customer_org_fk","the tenant composite FK must be the rejecting boundary");
 const rejectedInvoice=await db.unsafe("select count(*)::integer as count from public.customer_invoices where id=$1::uuid",[ids.invoices[2]]);
 assert.equal(rejectedInvoice[0].count,0,"rejected cross-tenant invoice must not persist");
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
 assert.ok(!result.items.some(item=>item.customerId===ids.foreignCustomer),"foreign customer UUID must never appear in results");
 await setIdentity(managerDb,accountant.auth_user_id,accountant.email);
 let accountantDenied=null;
 try {
  await managerDb.unsafe("select public.fetch_executive_receivable_customer_aging() as result");
 } catch(error) {
  accountantDenied=error;
 }
 assert.ok(accountantDenied,"accountant role must not read executive customer receivable aging");
 assert.equal(accountantDenied.code,"42501","non-finance role must be rejected by the server authorization boundary");
 process.stdout.write("P2 customer receivable identity PASS: same-name UUID separation, cross-tenant FK rejection, and accountant read denial.\n");
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
