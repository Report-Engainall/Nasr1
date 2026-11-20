import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = requiredEnv("TEST_DATABASE_URL");
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL").toLowerCase();
const companyMemberEmail = requiredEnv("E2E_COMPANY_MEMBER_EMAIL").toLowerCase();
const organizationId = "a0000000-0000-0000-0000-000000000001";
const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
const ids = { customers:[randomUUID(),randomUUID()], foreignCustomer:randomUUID(), orders:[randomUUID(),randomUUID(),randomUUID()], invoices:[randomUUID(),randomUUID(),randomUUID()], returnRequests:Array.from({length:5},()=>randomUUID()), creditMemos:Array.from({length:5},()=>randomUUID()), reversalJournal:randomUUID(), payments:[] };
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
 const companyMembers=await db.unsafe("select p.id::text,p.auth_user_id::text,p.email from public.profiles p join public.user_roles r on r.profile_id=p.id and r.role='customer' where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true",[organizationId,companyMemberEmail]);
 assert.equal(companyMembers.length,1,"P2 fixture must expose exactly one active non-finance company member");
 const companyMember=companyMembers[0];
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

 // Source-linked fixtures: one posted credit, one draft, one reversed.
 const requestFixtures=[
  [0,ids.customers[0],ids.orders[0],"POSTED"],
  [1,ids.customers[1],ids.orders[1],"DRAFT"],
  [2,ids.customers[1],ids.orders[1],"REVERSED"],
  [3,ids.customers[1],ids.orders[1],"CUSTOMER-MISMATCH"],
  [4,ids.customers[0],ids.orders[0],"CURRENCY-MISMATCH"]
 ];
 for(const [index,customerId,orderId,label] of requestFixtures){
  await db.unsafe(
   "insert into public.customer_return_requests(id,organization_id,customer_id,order_id,request_number,status,reason,requested_by,idempotency_key,payload_fingerprint) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'received','other',$6,$7,$8)",
   [ids.returnRequests[index],organizationId,customerId,orderId,"P2-AGING-RETURN-"+label+"-"+suffix,manager.id,randomUUID(),"a".repeat(32)]
  );
 }
 await db.unsafe(
  "insert into public.accounting_journal_entries(id,organization_id,entry_date,description,source_type,status,idempotency_key,payload_fingerprint,created_by_profile_id) values($1::uuid,$2::uuid,current_date,'P2 reversed memo test fixture','adjustment','draft',$3::uuid,$4,$5::uuid)",
  [ids.reversalJournal,organizationId,randomUUID(),"b".repeat(32),manager.id]
 );
 const memoFixtures=[
  {i:0,invoice:ids.invoices[0],customer:ids.customers[0],status:"posted",currency:"YER",amount:"21.11"},
  {i:1,invoice:ids.invoices[1],customer:ids.customers[1],status:"draft",currency:"YER",amount:"5.00"},
  {i:2,invoice:ids.invoices[1],customer:ids.customers[1],status:"reversed",currency:"YER",amount:"7.00"}
 ];
 for(const memo of memoFixtures){
  const reversed=memo.status==="reversed", posted=memo.status==="posted"||reversed;
  await db.unsafe(
   "insert into public.customer_return_credit_memos(id,organization_id,return_request_id,invoice_id,customer_id,memo_number,status,currency,subtotal_amount,tax_amount,total_amount,idempotency_key,payload_fingerprint,created_by_profile_id,posted_by_profile_id,posted_at,reversed_by_profile_id,reversed_at,reversal_reason,reversal_journal_entry_id) "+
   "values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9::numeric,0,$9::numeric,$10::uuid,$11,$12::uuid,$13::uuid,$14,$15::uuid,$16,$17,$18::uuid)",
   [ids.creditMemos[memo.i],organizationId,ids.returnRequests[memo.i],memo.invoice,memo.customer,"P2-AGING-CREDIT-"+memo.i+"-"+suffix,memo.status,memo.currency,memo.amount,randomUUID(),"c".repeat(32),manager.id,posted?manager.id:null,posted?new Date().toISOString():null,reversed?manager.id:null,reversed?new Date().toISOString():null,reversed?"test reversal fixture":null,reversed?ids.reversalJournal:null]
  );
 }
 await setIdentity(managerDb,manager.auth_user_id,manager.email);
 const payment=await managerDb.unsafe("select public.record_customer_payment($1::uuid,$2::numeric,'cash',$3::uuid)::text as id",[ids.invoices[0],"10.00",randomUUID()]);
 ids.payments.push(payment[0].id);

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
  const expectedOutstanding=index===0?80:Number(amounts[index]);
  assert.equal(Number(row.totalOutstanding),expectedOutstanding,"posted credits and payments must reduce the matching invoice balance");
  assert.equal(Number(row.overdueAmount),expectedOutstanding);
  assert.equal(row.invoiceCount,1,"one customer's invoice must not be included in the other's total");
  const evidence=row.agingBuckets.flatMap(bucket=>bucket.evidenceIds);
  assert.ok(evidence.includes("customer-invoice:"+ids.invoices[index]));
  assert.ok(!evidence.includes("customer-invoice:"+ids.invoices[1-index]));
  if(index===0){
   assert.ok(evidence.includes("customer-payment:"+ids.payments[0]),"payment evidence must remain visible");
   assert.ok(evidence.includes("customer-return-credit-memo:"+ids.creditMemos[0]),"posted credit memo evidence must be visible");
  }else{
   assert.ok(!evidence.includes("customer-return-credit-memo:"+ids.creditMemos[1]),"draft memo must not appear as posted evidence");
   assert.ok(!evidence.includes("customer-return-credit-memo:"+ids.creditMemos[2]),"reversed memo must not appear as posted evidence");
  }
 }
 assert.ok(!result.items.some(item=>item.customerId===ids.foreignCustomer),"foreign customer UUID must never appear in results");
 await setIdentity(managerDb,accountant.auth_user_id,accountant.email);
 const accountantResponse=await managerDb.unsafe("select public.fetch_executive_receivable_customer_aging() as result");
 assert.equal(accountantResponse.length,1,"finance-capable accountant must read executive receivable aging");
 const accountantResult=asJson(accountantResponse[0].result);
 assert.ok(accountantResult&&Array.isArray(accountantResult.items),"accountant response must preserve the validated finance payload");

 await setIdentity(managerDb,manager.auth_user_id,manager.email);
 await db.unsafe(
  "insert into public.customer_return_credit_memos(id,organization_id,return_request_id,invoice_id,customer_id,memo_number,status,currency,subtotal_amount,tax_amount,total_amount,idempotency_key,payload_fingerprint,created_by_profile_id,posted_by_profile_id,posted_at) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'posted','YER',3,0,3,$7::uuid,$8,$9::uuid,$9::uuid,now())",
  [ids.creditMemos[3],organizationId,ids.returnRequests[3],ids.invoices[0],ids.customers[1],"P2-CUSTOMER-MISMATCH-"+suffix,randomUUID(),"d".repeat(32),manager.id]
 );
 let customerMismatchError=null;
 try{await managerDb.unsafe("select public.fetch_executive_receivable_customer_aging() as result");}catch(error){customerMismatchError=error;}
 assert.ok(customerMismatchError,"posted credit with mismatched invoice customer must fail closed");
 assert.equal(customerMismatchError.code,"22023");
 await db.unsafe("delete from public.customer_return_credit_memos where id=$1::uuid",[ids.creditMemos[3]]);
 await db.unsafe(
  "insert into public.customer_return_credit_memos(id,organization_id,return_request_id,invoice_id,customer_id,memo_number,status,currency,subtotal_amount,tax_amount,total_amount,idempotency_key,payload_fingerprint,created_by_profile_id,posted_by_profile_id,posted_at) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'posted','USD',4,0,4,$7::uuid,$8,$9::uuid,$9::uuid,now())",
  [ids.creditMemos[4],organizationId,ids.returnRequests[4],ids.invoices[0],ids.customers[0],"P2-CURRENCY-MISMATCH-"+suffix,randomUUID(),"e".repeat(32),manager.id]
 );
 let currencyMismatchError=null;
 try{await managerDb.unsafe("select public.fetch_executive_receivable_customer_aging() as result");}catch(error){currencyMismatchError=error;}
 assert.ok(currencyMismatchError,"posted credit with mismatched currency must fail closed");
 assert.equal(currencyMismatchError.code,"22023");
 await db.unsafe("delete from public.customer_return_credit_memos where id=$1::uuid",[ids.creditMemos[4]]);

 await setIdentity(managerDb,companyMember.auth_user_id,companyMember.email);
 let customerDenied=null;
 try {
  await managerDb.unsafe("select public.fetch_executive_receivable_customer_aging() as result");
 } catch(error) {
  customerDenied=error;
 }
 assert.ok(customerDenied,"non-finance company member must not read executive customer receivable aging");
 assert.equal(customerDenied.code,"42501","customer role must be rejected by the server authorization boundary");
 process.stdout.write("P2 customer receivable identity PASS: UUID separation, posted credit net balance, draft/reversed exclusion, evidence linkage, fail-closed source mismatch, tenant FK and role access.\\n");
}
try{
 try{await main();}
 finally{
  if(fixturesStarted){
   await db.unsafe("delete from public.customer_return_credit_memos where id=any($1::uuid[])",[ids.creditMemos]).catch(()=>{});
   await db.unsafe("delete from public.accounting_journal_entries where id=$1::uuid",[ids.reversalJournal]).catch(()=>{});
   await db.unsafe("delete from public.customer_return_requests where id=any($1::uuid[])",[ids.returnRequests]).catch(()=>{});
   await db.unsafe("delete from public.customer_payments where id=any($1::uuid[])",[ids.payments]).catch(()=>{});
   await db.unsafe("delete from public.customer_invoices where id=any($1::uuid[])",[ids.invoices]).catch(()=>{});
   await db.unsafe("delete from public.orders where id=any($1::uuid[])",[ids.orders]).catch(()=>{});
   await db.unsafe("delete from public.customers where id=any($1::uuid[])",[[...ids.customers,ids.foreignCustomer]]).catch(()=>{});
  }
 }
}finally{
 await managerDb.end({timeout:5}).catch(()=>{});
 await db.end({timeout:5}).catch(()=>{});
}
