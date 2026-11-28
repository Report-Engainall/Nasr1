import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";
function env(n){const v=process.env[n]?.trim();if(!v)throw Error(n+" is required");return v.replace(/^"(.*)"$/s,"$1");}
const conn=env("TEST_DATABASE_URL");validateCashExpenseEndpoints(env("E2E_SUPABASE_URL"),conn);
const org="a0000000-0000-0000-0000-000000000001",product="a1000000-0000-0000-0000-000000000001",supplier="a2000000-0000-0000-0000-000000000001",warehouse="d0000000-0000-0000-0000-000000000001";
const db=postgres(conn,{max:1,prepare:false,idle_timeout:5});
function json(v){return typeof v==="string"?JSON.parse(v):v;}
async function rpc(q,a){return json((await db.unsafe(q,a))[0].result);}
async function actor(email){const r=await db.unsafe("select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active limit 1",[org,email.toLowerCase()]);assert.equal(r.length,1);return r[0];}
async function as(a){
 await db.unsafe("reset role");
 await db.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1::uuid,$1::uuid,now(),now(),now(),null,'CI FEFO acceptance','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",[a.auth_user_id]);
 await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[a.auth_user_id]);
 await db.unsafe("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:a.auth_user_id,email:a.email,role:"authenticated",session_id:a.auth_user_id})]);
 await db.unsafe("set role authenticated");
}
async function receipt(manager,batch,expiry){
 await as(manager);
 const po=(await rpc("select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) result",
 [supplier,warehouse,db.json([{product_id:product,quantity:1,unit_cost:125.5}]),"FEFO "+batch,randomUUID().replaceAll("-","")])).purchase_order.id;
 assert.ok(po);await rpc("select public.submit_purchase_order($1::uuid) result",[po]);
 const visibleOrders=await rpc("select public.fetch_purchase_orders() result");
 assert.ok(Array.isArray(visibleOrders),"authorized purchase-order reader must return an array");
 const visibleOrder=visibleOrders.find(value=>value.id===po);
 assert.ok(visibleOrder,"manager must read the submitted purchase order through the tenant-authorized RPC");
 assert.equal(visibleOrder.organization_id,org,"purchase-order detail must remain inside the active organization");
 const item=visibleOrder.items?.find(value=>value.product_id===product && Number(value.remaining_quantity)===1);
 assert.ok(item,"purchase-order RPC must return the submitted line with its remaining quantity");
 const line={id:item.id};
 const input={item_id:line.id,quantity:1,batch_number:batch,expiry_date:expiry},key="fefo-"+randomUUID().replaceAll("-","");
 const first=await rpc("select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) result",[po,db.json([input]),"Physical FEFO acceptance",key]);
 const replay=await rpc("select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) result",[po,db.json([input]),"Physical FEFO acceptance",key]);
 assert.ok(first.receipt.id);assert.equal(replay.idempotent_replay,true);
 await db.unsafe("reset role");return {receiptId:first.receipt.id,batch,expiry};
}
// FEFO acceptance exercises the order transition triggers, not table-write authorization.
 // Keep the authenticated manager JWT claims for the trigger's staff/tenant checks,
 // but run this isolated fixture UPDATE as the local database owner because direct
 // orders-table DML is deliberately unavailable to authenticated clients. This
 // does not grant table privileges or claim browser status-transition acceptance.
 async function status(manager,id,s){
  await as(manager);
  await db.unsafe("reset role");
  try {
   await db.unsafe("update public.orders set status=$2::text,updated_at=now() where id=$1::uuid",[id,s]);
  } finally {
   await db.unsafe("reset role");
  }
 }
async function main(){
 const manager=await actor(env("E2E_MANAGER_EMAIL")),customer=await actor(env("E2E_EMAIL"));
 const cust=(await db.unsafe("select id::text from public.customers where organization_id=$1::uuid and status='approved' order by created_at limit 1",[org]))[0];assert.ok(cust);
 const ds=(await db.unsafe("select to_char((now() at time zone 'UTC')::date+10,'YYYY-MM-DD') e,to_char((now() at time zone 'UTC')::date+30,'YYYY-MM-DD') l"))[0];
 const suffix=randomUUID().replaceAll("-","").slice(0,10).toUpperCase();
 const early=await receipt(manager,"FEFO-EARLY-"+suffix,ds.e),late=await receipt(manager,"FEFO-LATE-"+suffix,ds.l);
 const expiredBatchId=randomUUID(),expiredBatch="FEFO-EXPIRED-"+suffix;
 const expiredDate=(await db.unsafe("select to_char((now() at time zone 'UTC')::date-1,'YYYY-MM-DD') d"))[0].d;
 await db.unsafe("insert into public.inventory_batches(id,organization_id,product_id,warehouse_id,batch_number,expiry_date,received_at,quantity_on_hand,quantity_reserved,source_type,source_reference_type) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::date,now(),1,0,'unattributed_balance_increase','fefo_acceptance_expired_fixture')",[expiredBatchId,org,product,warehouse,expiredBatch,expiredDate]);
 const expiredBalance=(await db.unsafe("update public.inventory_balances set quantity_on_hand=quantity_on_hand+1,last_movement_at=now(),updated_at=now() where product_id=$1::uuid and warehouse_id=$2::uuid returning quantity_available",[product,warehouse]))[0];
 assert.ok(expiredBalance);
 await db.unsafe("insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id) values($1::uuid,$2::uuid,'inventory_adjustment',1,$3,'inventory_adjustment',$5::uuid,'Temporary expired-lot fixture for PostgreSQL 17 acceptance',$4::uuid,$5::uuid)",[product,warehouse,expiredBalance.quantity_available,manager.id,expiredBatchId]);
 const lotRows=await db.unsafe("select batch_number,expiry_date::text from public.inventory_batches where receipt_id in ($1::uuid,$2::uuid) order by expiry_date,id",[early.receiptId,late.receiptId]);
 assert.equal(lotRows.length,2);assert.equal(lotRows[0].batch_number,early.batch);assert.equal(lotRows[1].batch_number,late.batch);
 await as(manager);const print=await rpc("select public.get_purchase_receipt_print_data($1::uuid) result",[early.receiptId]);
 assert.equal(print.items[0].batch_number,early.batch);assert.equal(print.items[0].expiry_date,ds.e);
 const order=(await rpc("select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
 [cust.id,db.json([{product_id:product,quantity:1}]),"FEFO sale lot",randomUUID().replaceAll("-",""),"cash_on_delivery"])).id;
 assert.ok(order);await status(manager,order,"confirmed");
 const res=(await db.unsafe("select im.inventory_batch_id::text id,b.batch_number,b.expiry_date::text from public.inventory_movements im join public.inventory_batches b on b.id=im.inventory_batch_id where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='reserve'",[order]));
 assert.equal(res.length,1);assert.equal(res[0].batch_number,early.batch);assert.equal(res[0].expiry_date,ds.e);
 await status(manager,order,"processing");await status(manager,order,"shipped");
 const sale=(await db.unsafe("select im.inventory_batch_id::text id,im.quantity::text q from public.inventory_movements im where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='sale'",[order]));
 assert.equal(sale.length,1);assert.equal(sale[0].id,res[0].id);assert.equal(Number(sale[0].q),-1);
 const consumed=(await db.unsafe("select quantity_on_hand::text h,quantity_reserved::text r from public.inventory_batches where id=$1::uuid",[res[0].id]))[0];
 assert.equal(Number(consumed.h),0);assert.equal(Number(consumed.r),0);
 const parity=(await db.unsafe("select ib.quantity_on_hand::text h,ib.quantity_reserved::text r,coalesce(sum(b.quantity_on_hand),0)::text bh,coalesce(sum(b.quantity_reserved),0)::text br from public.inventory_balances ib left join public.inventory_batches b on b.product_id=ib.product_id and b.warehouse_id=ib.warehouse_id where ib.product_id=$1::uuid and ib.warehouse_id=$2::uuid group by ib.id",[product,warehouse]))[0];
 assert.equal(Number(parity.h),Number(parity.bh));assert.equal(Number(parity.r),Number(parity.br));
 await as(manager);const order2=(await rpc("select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
 [cust.id,db.json([{product_id:product,quantity:1}]),"FEFO release",randomUUID().replaceAll("-",""),"cash_on_delivery"])).id;
 await status(manager,order2,"confirmed");
 const res2=(await db.unsafe("select inventory_batch_id::text id from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type='reserve'",[order2]))[0];
 const batch2=(await db.unsafe("select batch_number from public.inventory_batches where id=$1::uuid",[res2.id]))[0];
 assert.equal(batch2.batch_number,late.batch);await status(manager,order2,"cancelled");
 const rel=(await db.unsafe("select inventory_batch_id::text id from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type='release_reservation'",[order2]));
 assert.equal(rel.length,1);assert.equal(rel[0].id,res2.id);
 const restored=(await db.unsafe("select quantity_on_hand::text h,quantity_reserved::text r from public.inventory_batches where id=$1::uuid",[res2.id]))[0];
 assert.equal(Number(restored.h),1);assert.equal(Number(restored.r),0);
 // Compare the previous-day test lot with today, not with its own expiry date.
 const expiredState=(await db.unsafe("select quantity_on_hand::text h,quantity_reserved::text r,expiry_date<(pg_catalog.now() at time zone 'UTC')::date expired from public.inventory_batches where id=$1::uuid",[expiredBatchId]))[0];
 assert.equal(expiredState.expired,true);assert.equal(Number(expiredState.h),1);assert.equal(Number(expiredState.r),0);
 await as(manager);const trace=await rpc("select public.list_inventory_batch_stock($1::uuid,$2::uuid) result",[product,warehouse]);assert.equal(trace.product_id,product);assert.ok(trace.lots.some(x=>x.batch_number===late.batch));assert.ok(trace.lots.some(x=>x.batch_number===expiredBatch&&x.expired===true));
 await as(customer);
 await assert.rejects(()=>db.unsafe("select * from public.inventory_batches limit 1"),/permission denied/i);
 await assert.rejects(()=>rpc("select public.list_inventory_batch_stock($1::uuid,$2::uuid) result",[product,warehouse]),/inventory\.read_balance capability|warehouse assignment/i);
 await db.unsafe("reset role");
 process.stdout.write("PASS FEFO batches: receipt lot creation/replay, receipt print, earliest-expiry reservation, exact-lot sale, reservation release, lot reader, access denial and balance parity\n");
}
main().catch(e=>{process.stderr.write("FAIL inventory batch FEFO: "+String(e?.stack??e)+"\n");process.exitCode=1;}).finally(async()=>{await db.end({timeout:5}).catch(()=>{});});
