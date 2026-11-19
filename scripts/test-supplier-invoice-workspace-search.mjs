import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";
const dbUrl=requiredEnv("TEST_DATABASE_URL");validateCashExpenseEndpoints(requiredEnv("E2E_SUPABASE_URL"),dbUrl);
const org=requiredEnv("E2E_PURCHASE_ORGANIZATION_ID"),warehouse=requiredEnv("E2E_PURCHASE_WAREHOUSE_ID"),product=requiredEnv("E2E_PURCHASE_PRODUCT_ID");
const managerProfile=requiredEnv("E2E_PURCHASE_MANAGER_PROFILE_ID"),managerEmail=requiredEnv("E2E_MANAGER_EMAIL").toLowerCase(),customerEmail=requiredEnv("E2E_EMAIL").toLowerCase();
const db=postgres(dbUrl,{max:1,prepare:false,idle_timeout:5});
function requiredEnv(k){const v=process.env[k]?.trim();if(!v)throw new Error(k+" required for local-only supplier invoice acceptance");return v.replace(/^"(.*)"$/s,"$1");}
function json(v){return typeof v==="string"?JSON.parse(v):v;}
async function identity(id,email){await db.unsafe("reset role");await db.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1::uuid,$1::uuid,now(),now(),now(),null,'P2 invoice search','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",[id]);await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.unsafe("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,email,role:"authenticated",session_id:id})]);await db.unsafe("set role authenticated");}
async function profile(email,role){const r=await db.unsafe("select p.id,p.auth_user_id,p.email from public.profiles p join public.user_roles ur on ur.profile_id=p.id where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active and ur.role=$3 limit 1",[org,email,role]);assert.equal(r.length,1,"seeded "+role+" identity must resolve");return r[0];}
async function rpc(sql,args){return json((await db.unsafe(sql,args))[0]?.result);}
async function record(po,number,receiptItem,cost){const amount=cost.toFixed(2);const r=await rpc("select public.record_purchase_supplier_invoice($1::uuid,$2::text,$3::date,$4::numeric,$5::numeric,$6::numeric,$7::jsonb,$8::uuid) as result",[po,number,new Date().toISOString().slice(0,10),amount,"0.00",amount,db.json([{receipt_item_id:receiptItem,quantity:"1",unit_cost:amount,line_total:amount}]),randomUUID()]);assert.ok(r?.invoice_id);return r;}
async function main(){
 const manager=await profile(managerEmail,"manager"),customer=await profile(customerEmail,"customer");assert.equal(manager.id,managerProfile);
 const supplier=randomUUID(),code="P2-FILTER-"+randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
 await db.unsafe("reset role");await db.unsafe("insert into public.suppliers(id,organization_id,supplier_code,name,status) values($1::uuid,$2::uuid,$3,$4,'active')",[supplier,org,code,"مَتْجَرُ الأَغْبَرِي لاختبار البحث"]);
 await identity(manager.auth_user_id,manager.email);
 const made=await rpc("select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",[supplier,warehouse,db.json([{product_id:product,quantity:3,unit_cost:"100.00"}]),"P2 full-register supplier invoice filter acceptance",randomUUID().replaceAll("-","")]);
 const po=made?.purchase_order;assert.ok(po?.id);await rpc("select public.submit_purchase_order($1::uuid) as result",[po.id]);
 await db.unsafe("reset role");
 const poRows=await db.unsafe("select purchase_order_number from public.purchase_orders where organization_id=$1::uuid and id=$2::uuid",[org,po.id]);
 const items=await db.unsafe("select id from public.purchase_order_items where organization_id=$1::uuid and purchase_order_id=$2::uuid",[org,po.id]);assert.equal(poRows.length,1);assert.equal(items.length,1);
 await identity(manager.auth_user_id,manager.email);
 const receipt=await rpc("select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",[po.id,db.json([{item_id:items[0].id,quantity:3}]),"P2 invoice search receipt","p2-filter-"+randomUUID().replaceAll("-","")]);assert.ok(receipt?.receipt?.id);
 await db.unsafe("reset role");const receiptItems=await db.unsafe("select id from public.purchase_receipt_items where organization_id=$1::uuid and receipt_id=$2::uuid",[org,receipt.receipt.id]);assert.equal(receiptItems.length,1);
 await identity(manager.auth_user_id,manager.email);
 const suffix=randomUUID().replaceAll("-","").slice(0,10).toUpperCase(),targetNo="P2-TARGET-"+suffix+"-026",fillNo="P2-FILLER-"+suffix+"-025",varianceNo="P2-VARIANCE-"+suffix+"-027";
 const a=await record(po.id,targetNo,receiptItems[0].id,100),b=await record(po.id,fillNo,receiptItems[0].id,100),c=await record(po.id,varianceNo,receiptItems[0].id,101);
 assert.equal(a.match_status,"matched");assert.equal(b.match_status,"matched");assert.equal(c.match_status,"variance_pending");
 const first=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,1,0,NULL::text,'all'::text) as result",[po.id]);
 assert.equal(first.invoice_count,3);assert.notEqual(first.invoices[0].supplier_invoice_number,targetNo,"target stays outside the first unfiltered one-row page");
 const target=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,1,0,$2::text,'all'::text) as result",[po.id,targetNo]);
 assert.equal(target.invoice_count,1,"filter count must cover all rows before LIMIT/OFFSET");assert.equal(target.invoices[0].supplier_invoice_number,targetNo);assert.equal(target.has_more,false);
 const supplierResult=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,25,0,$2::text,'all'::text) as result",[po.id,"الاغبري"]);
 assert.equal(supplierResult.invoice_count,3,"Arabic hamza/tashkeel normalization searches complete supplier names");
 const digitResult=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,25,0,$2::text,'all'::text) as result",[po.id,targetNo.replace("026","٠٢٦")]);
 assert.equal(digitResult.invoice_count,1,"Arabic-Indic digits map to stored ASCII digits");
 const poResult=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,25,0,$2::text,'all'::text) as result",[po.id,poRows[0].purchase_order_number]);assert.equal(poResult.invoice_count,3);
 const dateResult=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,25,0,$2::text,'all'::text) as result",[po.id,new Date().toISOString().slice(0,10)]);assert.equal(dateResult.invoice_count,3);
 const pending=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,1,0,NULL::text,'variance_pending'::text) as result",[po.id]);
 assert.equal(pending.invoice_count,1);assert.equal(pending.invoices[0].supplier_invoice_number,varianceNo);assert.equal(pending.has_more,false);
 const matched=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,25,0,NULL::text,'matched'::text) as result",[po.id]);
 assert.equal(matched.invoice_count,2);assert.ok(matched.invoices.every(i=>i.match_status==="matched"));
 const page2=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,1,1,NULL::text,'all'::text) as result",[po.id]);
 assert.equal(page2.invoice_count,3);assert.equal(page2.offset,1);assert.equal(page2.has_more,true);assert.equal(page2.invoices.length,1);
 const none=await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered($1::uuid,25,0,$2::text,'all'::text) as result",[po.id,"P2-NOT-FOUND"]);assert.equal(none.invoice_count,0);assert.deepEqual(none.invoices,[]);
 await db.unsafe("reset role");
 const acl=await db.unsafe("select pg_catalog.has_function_privilege('anon','public.fetch_purchase_supplier_invoice_workspace_filtered(uuid,integer,integer,text,text)'::regprocedure,'EXECUTE') as anon_allowed,pg_catalog.has_function_privilege('authenticated','public.fetch_purchase_supplier_invoice_workspace_filtered(uuid,integer,integer,text,text)'::regprocedure,'EXECUTE') as auth_allowed");
 assert.equal(acl[0].anon_allowed,false);assert.equal(acl[0].auth_allowed,true);
 await identity(customer.auth_user_id,customer.email);let denied;try{await rpc("select public.fetch_purchase_supplier_invoice_workspace_filtered(NULL::uuid,25,0,NULL::text,'all'::text) as result",[]);}catch(e){denied=e;}
 assert.ok(denied);assert.match(String(denied.message),/finance permission required/i);
 process.stdout.write("PASS PostgreSQL 17: global supplier invoice search/filter precedes pagination; supplier, invoice, PO, date, Arabic normalization, status, empty results and role denial verified.\n");
}
main().catch(e=>{process.stderr.write("P2_SUPPLIER_INVOICE_SEARCH_FAILED: "+String(e?.message??e)+"\n");process.exitCode=1;}).finally(async()=>db.end({timeout:5}).catch(()=>{}));
