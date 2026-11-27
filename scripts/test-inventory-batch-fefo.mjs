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
async function receipt(manager,batch,expiry,quantity=1,targetWarehouse=warehouse){
 await as(manager);
 const po=(await rpc("select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) result",
 [supplier,targetWarehouse,db.json([{product_id:product,quantity,unit_cost:125.5}]),"FEFO "+batch,randomUUID().replaceAll("-","")])).purchase_order.id;
 assert.ok(po);await rpc("select public.submit_purchase_order($1::uuid) result",[po]);
 const visibleOrders=await rpc("select public.fetch_purchase_orders() result");
 assert.ok(Array.isArray(visibleOrders),"authorized purchase-order reader must return an array");
 const visibleOrder=visibleOrders.find(value=>value.id===po);
 assert.ok(visibleOrder,"manager must read the submitted purchase order through the tenant-authorized RPC");
 assert.equal(visibleOrder.organization_id,org,"purchase-order detail must remain inside the active organization");
 const item=visibleOrder.items?.find(value=>value.product_id===product && Number(value.remaining_quantity)===quantity);
 assert.ok(item,"purchase-order RPC must return the submitted line with its remaining quantity");
 const line={id:item.id};
 const input={item_id:line.id,quantity,batch_number:batch,expiry_date:expiry},key="fefo-"+randomUUID().replaceAll("-","");
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

 // A lot may expire while the customer order is waiting in processing. The
 // shipment must fail closed until a manager moves that reservation to a valid
 // FEFO lot, preserving immutable reserve/release movement evidence.
 await as(manager);
 const order3=(await rpc("select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
  [cust.id,db.json([{product_id:product,quantity:1}]),"FEFO reallocate expired reservation",randomUUID().replaceAll("-",""),"cash_on_delivery"])).id;
 assert.ok(order3);
 await status(manager,order3,"confirmed");
 await status(manager,order3,"processing");
 const originalReservation=(await db.unsafe(
  "select im.inventory_batch_id::text id,b.batch_number,b.expiry_date::text " +
  "from public.inventory_movements im join public.inventory_batches b on b.id=im.inventory_batch_id " +
  "where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='reserve'",
  [order3],
 ))[0];
 assert.ok(originalReservation);
 assert.equal(originalReservation.batch_number,late.batch,
  "the still-valid next FEFO receipt lot must be reserved before it expires");
 // Move the clock condition forward deterministically by making that test-only lot
 // previous-day expired while keeping its reservation and aggregate balance intact.
 await db.unsafe(
  "update public.inventory_batches set expiry_date=$2::date where id=$1::uuid",
  [originalReservation.id,expiredDate],
 );
 await assert.rejects(
  () => status(manager,order3,"shipped"),
  error => String(error?.code)==="55000" && String(error?.message).includes("expired reserved batch"),
  "shipment must be rejected while its active reservation points to an expired batch",
 );

 const replacementDate=(await db.unsafe(
  "select to_char((pg_catalog.now() at time zone 'UTC')::date+1,'YYYY-MM-DD') d",
 ))[0].d;
 await db.unsafe("reset role");
 const alternateWarehouse=(await db.unsafe(
  "select id::text from public.warehouses where organization_id=$1::uuid and is_active=true and id<>$2::uuid order by id limit 1",
  [org,warehouse],
 ))[0];
 assert.ok(alternateWarehouse,"FEFO cross-warehouse rollback acceptance requires a second active tenant warehouse");
 const replacement=await receipt(manager,"FEFO-REPLACEMENT-"+suffix,replacementDate,1,alternateWarehouse.id);
 const replacementCandidate=(await db.unsafe(
  "select id::text batch_id from public.inventory_batches where receipt_id=$1::uuid and product_id=$2::uuid order by received_at desc,id desc limit 1",
  [replacement.receiptId,product],
 ))[0];
 assert.ok(replacementCandidate,"replacement receipt must create a traceable batch in the alternate warehouse");
 const stillProcessing=(await db.unsafe("select status from public.orders where id=$1::uuid",[order3]))[0];
 assert.equal(stillProcessing.status,"processing","failed shipment must leave order status unchanged");

 await as(manager);
 const expiredWorklist=await rpc(
  "select public.list_orders_with_expired_fefo_reservations(50,0) result",
 );
 assert.equal(expiredWorklist.limit,50);
 assert.equal(expiredWorklist.offset,0);
 assert.ok(expiredWorklist.total>=1);
 const worklistOrder=expiredWorklist.orders.find(entry=>entry.order_id===order3);
 assert.ok(worklistOrder,"the manager work queue must return the processing order with an expired reservation");
 assert.equal(worklistOrder.status,"processing");
 assert.equal(Number(worklistOrder.expired_reserved_quantity),1);
 assert.equal(worklistOrder.expired_lot_count,1);
 assert.equal(worklistOrder.expired_lots[0].batch_number,late.batch);
 assert.equal(worklistOrder.expired_lots[0].reservation_matches_batch,true);
 assert.ok(Number(worklistOrder.expired_lots[0].replacement_available_quantity)>=1,
  "work queue must expose in-date replacement quantity before the manager reallocates");
 await assert.rejects(
  () => rpc("select public.list_orders_with_expired_fefo_reservations(101,0) result"),
  error => String(error?.code)==="22023",
  "expired FEFO work queue must reject invalid pagination limits",
 );
 await assert.rejects(
  () => rpc("select public.reconcile_incomplete_order_reservations($1::uuid,$2::text,$3::text) result",
   [order3,"fefo-expiry-prerequisite-"+randomUUID().replaceAll("-",""),"Do not reconcile while a reserved lot is expired"]),
  error => String(error?.code)==="55000" && String(error?.message).includes("expired reservations require FEFO reallocation"),
  "incomplete reservation repair must refuse an order with an expired active batch reservation",
 );


 await as(manager);
 const reallocationKey="fefo-reallocate-"+randomUUID().replaceAll("-","");
 const reallocationReason="Replace a reserved lot that expired before shipment";

 // The candidate batch has one free unit, but corrupt its alternate-warehouse
 // aggregate on-hand balance to equal reserved. The order's expired source lot
 // is in the original warehouse, so releasing that reservation cannot create
 // availability in the replacement warehouse. Reallocation must reject before
 // appending any movement or changing either warehouse's reservation counters.
 await db.unsafe("reset role");
 const targetBalanceBefore=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved,quantity_available::text available " +
  "from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,alternateWarehouse.id],
 ))[0];
 assert.ok(targetBalanceBefore,"replacement warehouse must have an aggregate balance row");
 assert.ok(Number(targetBalanceBefore.on_hand)>=1,"replacement warehouse must retain the physical batch unit");
 const candidateStateBefore=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved from public.inventory_batches where id=$1::uuid",
  [replacementCandidate.batch_id],
 ))[0];
 assert.equal(Number(candidateStateBefore.on_hand)-Number(candidateStateBefore.reserved),1,
  "replacement FEFO batch must expose one free unit");
 const sourceStateBefore=(await db.unsafe(
  "select quantity_reserved::text reserved from public.inventory_batches where id=$1::uuid",
  [originalReservation.id],
 ))[0];
 const movementCountBefore=(await db.unsafe(
  "select count(*)::integer count from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type in ('reserve','release_reservation')",
  [order3],
 ))[0].count;
 await db.unsafe(
  "update public.inventory_balances set quantity_on_hand=quantity_reserved,last_movement_at=now(),updated_at=now() " +
  "where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,alternateWarehouse.id],
 );
 const blockedTarget=(await db.unsafe(
  "select quantity_available::text available from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,alternateWarehouse.id],
 ))[0];
 assert.equal(Number(blockedTarget.available),0);
 await as(manager);
 await assert.rejects(
  () => rpc(
   "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
   [order3,reallocationKey,reallocationReason],
  ),
  error => String(error?.code)==="40001" && String(error?.message).includes("aggregate available balance"),
  "reallocation must fail closed when the target batch has stock but its warehouse aggregate does not",
 );
 await db.unsafe("reset role");
 const movementCountAfter=(await db.unsafe(
  "select count(*)::integer count from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type in ('reserve','release_reservation')",
  [order3],
 ))[0].count;
 assert.equal(movementCountAfter,movementCountBefore,
  "failed cross-warehouse reallocation must roll back both source release and target reserve movement");
 const sourceStateAfter=(await db.unsafe(
  "select quantity_reserved::text reserved from public.inventory_batches where id=$1::uuid",
  [originalReservation.id],
 ))[0];
 const candidateStateAfter=(await db.unsafe(
  "select quantity_reserved::text reserved from public.inventory_batches where id=$1::uuid",
  [replacementCandidate.batch_id],
 ))[0];
 assert.equal(Number(sourceStateAfter.reserved),Number(sourceStateBefore.reserved),
  "failed reallocation must restore the expired source batch reservation");
 assert.equal(Number(candidateStateAfter.reserved),Number(candidateStateBefore.reserved),
  "failed reallocation must not reserve the mismatched target batch");
 await db.unsafe(
  "update public.inventory_balances set quantity_on_hand=$3::numeric,last_movement_at=now(),updated_at=now() " +
  "where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,alternateWarehouse.id,targetBalanceBefore.on_hand],
 );
 const targetBalanceRestored=(await db.unsafe(
  "select quantity_available::text available from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,alternateWarehouse.id],
 ))[0];
 assert.ok(Number(targetBalanceRestored.available)>=1,
  "test fixture must restore the alternate-warehouse aggregate before retry");
 await as(manager);
 const reallocated=await rpc(
  "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
  [order3,reallocationKey,reallocationReason],
 );
 assert.equal(reallocated.reallocation_status,"reallocated");
 assert.equal(Number(reallocated.reallocated_quantity),1);
 assert.equal(reallocated.released_lot_count,1);
 assert.equal(reallocated.replacement_lot_count,1);
 assert.equal(reallocated.idempotent_replay,false);
 assert.equal(reallocated.replacement_allocations.length,1);
 const replacementBatchId=reallocated.replacement_allocations[0].to_batch_id;
 const replacementBatch=(await db.unsafe(
  "select batch_number,expiry_date::text,quantity_reserved::text from public.inventory_batches where id=$1::uuid",
  [replacementBatchId],
 ))[0];
 assert.equal(replacementBatch.batch_number,replacement.batch);
 assert.equal(replacementBatch.expiry_date,replacementDate);
 assert.equal(Number(replacementBatch.quantity_reserved),1);

 const reallocationReplay=await rpc(
  "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
  [order3,reallocationKey,reallocationReason],
 );
 assert.equal(reallocationReplay.idempotent_replay,true);
 assert.equal(reallocationReplay.reallocation_id,reallocated.reallocation_id);
 assert.equal(reallocationReplay.replacement_allocations.length,1,
  "replayed reallocation returns the original saved replacement evidence without rebooking stock");
 const noExpiredRemainder=await rpc(
  "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
  [order3,"fefo-noop-"+randomUUID().replaceAll("-",""),"Verify all active reservations are valid"],
 );
 assert.equal(noExpiredRemainder.reallocation_status,"no_expired_reservations");
 assert.equal(Number(noExpiredRemainder.reallocated_quantity),0,
  "the server must report an explicit no-op when the order has no expired outstanding reservation");
 const worklistAfterReallocation=await rpc(
  "select public.list_orders_with_expired_fefo_reservations(50,0) result",
 );
 assert.equal(
  worklistAfterReallocation.orders.some(entry=>entry.order_id===order3),
  false,
  "successfully reallocated orders must leave the expired reservation work queue",
 );
 await assert.rejects(
  () => rpc(
   "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
   [order3,reallocationKey,"Changed payload must not reuse the reallocation key"],
  ),
  error => String(error?.code)==="22023" && String(error?.message).includes("payload conflict"),
  "a reused reallocation key with a changed reason must be rejected",
 );

 const reallocationMovements=await db.unsafe(
  "select im.movement_type,b.batch_number,pg_catalog.sum(im.quantity)::text quantity " +
  "from public.inventory_movements im join public.inventory_batches b on b.id=im.inventory_batch_id " +
  "where im.reference_type='order' and im.reference_id=$1::uuid " +
  "and im.movement_type in ('reserve','release_reservation') " +
  "group by im.movement_type,b.batch_number order by b.batch_number,im.movement_type",
  [order3],
 );
 assert.ok(reallocationMovements.some(row=>row.movement_type==="reserve"&&row.batch_number===late.batch&&Number(row.quantity)===1));
 assert.ok(reallocationMovements.some(row=>row.movement_type==="release_reservation"&&row.batch_number===late.batch&&Number(row.quantity)===1));
 assert.ok(reallocationMovements.some(row=>row.movement_type==="reserve"&&row.batch_number===replacement.batch&&Number(row.quantity)===1));

 await status(manager,order3,"shipped");
 const reallocatedSale=(await db.unsafe(
  "select im.inventory_batch_id::text id,im.quantity::text quantity,b.batch_number " +
  "from public.inventory_movements im join public.inventory_batches b on b.id=im.inventory_batch_id " +
  "where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='sale'",
  [order3],
 ));
 assert.equal(reallocatedSale.length,1);
 assert.equal(reallocatedSale[0].id,replacementBatchId,
  "shipment must consume the replacement batch, not the expired original reservation");
 assert.equal(reallocatedSale[0].batch_number,replacement.batch);
 assert.equal(Number(reallocatedSale[0].quantity),-1);

 // A manager may cancel an order after its expired reservation has already
 // been reallocated. Cancellation must release only the replacement lot; it
 // must not try to release the already-released expired source lot again.
 const cancelSourceDate=(await db.unsafe(
  "select to_char((pg_catalog.now() at time zone 'UTC')::date+3,'YYYY-MM-DD') d",
 ))[0].d;
 const cancelReplacementDate=(await db.unsafe(
  "select to_char((pg_catalog.now() at time zone 'UTC')::date+4,'YYYY-MM-DD') d",
 ))[0].d;
 const cancelSource=await receipt(manager,"FEFO-CANCEL-SOURCE-"+suffix,cancelSourceDate);
 const cancelReplacement=await receipt(manager,"FEFO-CANCEL-REPLACEMENT-"+suffix,cancelReplacementDate);
 await as(manager);
 const cancelOrder=(await rpc(
  "select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
  [cust.id,db.json([{product_id:product,quantity:1}]),"FEFO cancellation after reallocation",randomUUID().replaceAll("-",""),"cash_on_delivery"],
 )).id;
 assert.ok(cancelOrder);
 await status(manager,cancelOrder,"confirmed");
 await status(manager,cancelOrder,"processing");
 const cancelOriginalReservation=(await db.unsafe(
  "select im.inventory_batch_id::text id,b.batch_number " +
  "from public.inventory_movements im join public.inventory_batches b on b.id=im.inventory_batch_id " +
  "where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='reserve'",
  [cancelOrder],
 ))[0];
 assert.ok(cancelOriginalReservation);
 assert.equal(cancelOriginalReservation.batch_number,cancelSource.batch);
 await db.unsafe(
  "update public.inventory_batches set expiry_date=$2::date where id=$1::uuid",
  [cancelOriginalReservation.id,expiredDate],
 );
 await as(manager);
 const cancelReallocation=await rpc(
  "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
  [cancelOrder,"fefo-cancel-reallocate-"+randomUUID().replaceAll("-",""),"Reallocate before cancellation to validate net release"],
 );
 assert.equal(cancelReallocation.reallocation_status,"reallocated");
 assert.equal(Number(cancelReallocation.reallocated_quantity),1);
 const cancelReplacementId=cancelReallocation.replacement_allocations[0].to_batch_id;
 const cancelReplacementLot=(await db.unsafe(
  "select batch_number,quantity_reserved::text from public.inventory_batches where id=$1::uuid",
  [cancelReplacementId],
 ))[0];
 assert.equal(cancelReplacementLot.batch_number,cancelReplacement.batch);
 assert.equal(Number(cancelReplacementLot.quantity_reserved),1);
 await status(manager,cancelOrder,"cancelled");
 const cancelReleaseMovements=await db.unsafe(
  "select b.batch_number,pg_catalog.sum(im.quantity)::text released_quantity " +
  "from public.inventory_movements im join public.inventory_batches b on b.id=im.inventory_batch_id " +
  "where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='release_reservation' " +
  "group by b.batch_number order by b.batch_number",
  [cancelOrder],
 );
 assert.equal(cancelReleaseMovements.length,2,
  "reallocation and later cancellation must each release exactly their own batch reservation");
 assert.ok(cancelReleaseMovements.some(row=>row.batch_number===cancelSource.batch&&Number(row.released_quantity)===1));
 assert.ok(cancelReleaseMovements.some(row=>row.batch_number===cancelReplacement.batch&&Number(row.released_quantity)===1));
 const cancelLotBalances=await db.unsafe(
  "select batch_number,quantity_on_hand::text on_hand,quantity_reserved::text reserved " +
  "from public.inventory_batches where id=ANY($1::uuid[]) order by batch_number",
  [[cancelOriginalReservation.id,cancelReplacementId]],
 );
 assert.equal(cancelLotBalances.length,2);
 assert.ok(cancelLotBalances.every(row=>Number(row.reserved)===0),
  "cancellation after reallocation must leave no residual reservation on either source or replacement lot");
 assert.ok(cancelLotBalances.every(row=>Number(row.on_hand)===1),
  "cancellation must release reservations without consuming either lot's on-hand stock");
 const cancelledStatus=(await db.unsafe("select status from public.orders where id=$1::uuid",[cancelOrder]))[0];
 assert.equal(cancelledStatus.status,"cancelled");

 // Shipment must not finalize an order when its net lot reservations are
 // smaller than the commercial order quantities, even if every remaining
 // reserved lot is still in date.
 const shortShipmentExpiry=(await db.unsafe(
  "select to_char((pg_catalog.now() at time zone 'UTC')::date+8,'YYYY-MM-DD') d",
 ))[0].d;
 const shortShipmentReceipt=await receipt(
  manager,"FEFO-SHORT-SHIP-"+suffix,shortShipmentExpiry,2,
 );
 assert.ok(shortShipmentReceipt.receiptId);
 await as(manager);
 const shortShipmentOrder=(await rpc(
  "select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
  [cust.id,db.json([{product_id:product,quantity:2}]),"FEFO shipment completeness guard",randomUUID().replaceAll("-",""),"cash_on_delivery"],
 )).id;
 assert.ok(shortShipmentOrder);
 await status(manager,shortShipmentOrder,"confirmed");
 await status(manager,shortShipmentOrder,"processing");
 const shortShipmentReserves=await db.unsafe(
  "select im.inventory_batch_id::text batch_id,im.product_id::text product_id,im.warehouse_id::text warehouse_id,im.quantity::text quantity " +
  "from public.inventory_movements im " +
  "where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='reserve' " +
  "order by im.inventory_batch_id",
  [shortShipmentOrder],
 );
 assert.ok(shortShipmentReserves.length>=1);
 assert.equal(shortShipmentReserves.reduce((sum,row)=>sum+Number(row.quantity),0),2,
  "a new two-unit order must begin with complete lot reservation");

 const partialSource=shortShipmentReserves[0];
 const partialReleaseQuantity=Math.min(1,Number(partialSource.quantity));
 assert.ok(partialReleaseQuantity>0);
 const partialBatchAfter=await db.unsafe(
  "update public.inventory_batches set quantity_reserved=quantity_reserved-$2::numeric " +
  "where id=$1::uuid and quantity_reserved>=$2::numeric returning quantity_reserved",
  [partialSource.batch_id,partialReleaseQuantity],
 );
 assert.equal(partialBatchAfter.length,1,
  "the controlled local release fixture must change exactly the selected batch");
 const partialBalanceAfter=(await db.unsafe(
  "update public.inventory_balances set quantity_reserved=quantity_reserved-$3::numeric," +
  "last_movement_at=now(),updated_at=now() " +
  "where product_id=$1::uuid and warehouse_id=$2::uuid and quantity_reserved>=$3::numeric " +
  "returning quantity_available",
  [partialSource.product_id,partialSource.warehouse_id,partialReleaseQuantity],
 ))[0];
 assert.ok(partialBalanceAfter);
 await db.unsafe(
  "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id) " +
  "values($1::uuid,$2::uuid,'release_reservation',$3::numeric,$4,'order',$5::uuid," +
  "'Local acceptance fixture: simulate one released unit before shipment',$6::uuid,$7::uuid)",
  [partialSource.product_id,partialSource.warehouse_id,partialReleaseQuantity,
   partialBalanceAfter.quantity_available,shortShipmentOrder,manager.id,partialSource.batch_id],
 );

 const orderedAndReservedBeforeShipment=(await db.unsafe(
  "select " +
  "(select pg_catalog.sum(oi.quantity)::numeric(15,3) from public.order_items oi where oi.order_id=$1::uuid)::text ordered_quantity,"+
  "(select pg_catalog.sum(case when im.movement_type='reserve' then im.quantity else -im.quantity end)::numeric(15,3) " +
  " from public.inventory_movements im where im.reference_type='order' and im.reference_id=$1::uuid " +
  " and im.movement_type in ('reserve','release_reservation'))::text net_reserved_quantity",
  [shortShipmentOrder],
 ))[0];
 assert.equal(Number(orderedAndReservedBeforeShipment.ordered_quantity),2);
 assert.equal(Number(orderedAndReservedBeforeShipment.net_reserved_quantity),1,
  "the fixture must represent a real one-unit short reservation against a two-unit order");
 const reservedLotBeforeShipment=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved " +
  "from public.inventory_batches where id=$1::uuid",
  [partialSource.batch_id],
 ))[0];
 const aggregateBeforeShortShipment=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved " +
  "from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [partialSource.product_id,partialSource.warehouse_id],
 ))[0];
 await assert.rejects(
  () => status(manager,shortShipmentOrder,"shipped"),
  error => String(error?.code)==="55000" &&
    String(error?.message).includes("net reservation quantity does not match ordered quantity"),
  "a partially reserved order must not be marked shipped or create a partial sale movement",
 );
 const shortShipmentStatus=(await db.unsafe(
  "select status from public.orders where id=$1::uuid",
  [shortShipmentOrder],
 ))[0];
 assert.equal(shortShipmentStatus.status,"processing");
 const shortShipmentSales=await db.unsafe(
  "select count(*)::integer count from public.inventory_movements " +
  "where reference_type='order' and reference_id=$1::uuid and movement_type='sale'",
  [shortShipmentOrder],
 );
 assert.equal(shortShipmentSales[0].count,0,
  "shipment completeness rejection must not create any sale movement");
 const reservedLotAfterShipment=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved " +
  "from public.inventory_batches where id=$1::uuid",
  [partialSource.batch_id],
 ))[0];
 const aggregateAfterShortShipment=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved " +
  "from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [partialSource.product_id,partialSource.warehouse_id],
 ))[0];
 assert.deepEqual(reservedLotAfterShipment,reservedLotBeforeShipment,
  "rejected partial shipment must preserve the affected lot counters");
 assert.deepEqual(aggregateAfterShortShipment,aggregateBeforeShortShipment,
  "rejected partial shipment must preserve aggregate stock counters");

 await as(manager);
 const incompleteWorklist=await rpc("select public.list_orders_with_incomplete_inventory_reservations(50,0) result");
 const incompleteOrder=incompleteWorklist.orders.find(row=>row.order_id===shortShipmentOrder);
 assert.ok(incompleteOrder,"short-reserved order must appear in manager reconciliation worklist");
 assert.equal(incompleteOrder.status,"processing");
 assert.equal(Number(incompleteOrder.ordered_quantity),2);
 assert.equal(Number(incompleteOrder.reserved_quantity),1);
 assert.equal(Number(incompleteOrder.missing_quantity),1);
 assert.equal(incompleteOrder.requires_expired_reallocation,false);
 assert.equal(incompleteOrder.lines.length,1);
 assert.equal(Number(incompleteOrder.lines[0].missing_quantity),1);
 assert.ok(Number(incompleteOrder.lines[0].replacement_available_quantity)>=1,
  "worklist must expose enough in-date FEFO stock before repair");
 await assert.rejects(
  () => rpc("select public.list_orders_with_incomplete_inventory_reservations(101,0) result"),
  error => String(error?.code)==="22023",
  "incomplete reservation worklist must reject invalid pagination",
 );

 const reconciliationKey="fefo-complete-short-"+randomUUID().replaceAll("-","");
 const reconciliationReason="Restore the missing reservation before shipment";
 const reconciled=await rpc(
  "select public.reconcile_incomplete_order_reservations($1::uuid,$2::text,$3::text) result",
  [shortShipmentOrder,reconciliationKey,reconciliationReason],
 );
 assert.equal(reconciled.reconciliation_status,"reconciled");
 assert.equal(Number(reconciled.reconciled_quantity),1);
 assert.ok(reconciled.allocation_lot_count>=1);
 assert.ok(reconciled.allocations.length>=1);
 const reconciliationAudit=await db.unsafe(
  "select count(*)::integer count from public.audit_logs " +
  "where action='inventory.order_reservation.reconciled' " +
  "and entity_type='order_reservation_reconciliation' and entity_id=$1::uuid",
  [reconciled.reconciliation_id],
 );
 assert.equal(reconciliationAudit[0].count,1,
  "successful reservation reconciliation must write one source audit event");
 const reconciliationReplay=await rpc(
  "select public.reconcile_incomplete_order_reservations($1::uuid,$2::text,$3::text) result",
  [shortShipmentOrder,reconciliationKey,reconciliationReason],
 );
 assert.equal(reconciliationReplay.idempotent_replay,true);
 assert.equal(reconciliationReplay.reconciliation_id,reconciled.reconciliation_id);
 assert.deepEqual(reconciliationReplay.allocations,reconciled.allocations);
 await assert.rejects(
  () => rpc("select public.reconcile_incomplete_order_reservations($1::uuid,$2::text,$3::text) result",
   [shortShipmentOrder,reconciliationKey,"Changed reason must not reuse the key"]),
  error => String(error?.code)==="22023" && String(error?.message).includes("idempotency payload conflict"),
  "changed idempotency payload must be rejected",
 );
 const completeNoop=await rpc(
  "select public.reconcile_incomplete_order_reservations($1::uuid,$2::text,$3::text) result",
  [shortShipmentOrder,"fefo-complete-noop-"+randomUUID().replaceAll("-",""),"Verify reservation is complete"],
 );
 assert.equal(completeNoop.reconciliation_status,"already_complete");
 assert.equal(Number(completeNoop.reconciled_quantity),0);
 const incompleteAfter=await rpc("select public.list_orders_with_incomplete_inventory_reservations(50,0) result");
 assert.equal(incompleteAfter.orders.some(row=>row.order_id===shortShipmentOrder),false,
  "fully reserved order must leave incomplete worklist");
 const completeNet=(await db.unsafe(
  "select pg_catalog.sum(case when movement_type='reserve' then quantity else -quantity end)::text quantity " +
  "from public.inventory_movements where reference_type='order' and reference_id=$1::uuid " +
  "and movement_type in ('reserve','release_reservation')",[shortShipmentOrder],
 ))[0];
 assert.equal(Number(completeNet.quantity),2);
 const repairMovements=await db.unsafe(
  "select count(*)::integer count from public.inventory_movements where reference_type='order' and reference_id=$1::uuid " +
  "and movement_type='reserve' and reason like 'استكمال الحجز الناقص للطلب حسب FEFO:%'",
  [shortShipmentOrder],
 );
 assert.ok(repairMovements[0].count>=1,"repair must append real reserve source movements");
 await status(manager,shortShipmentOrder,"shipped");
 const completedSales=await db.unsafe(
  "select pg_catalog.sum(quantity)::text quantity,count(*)::integer count from public.inventory_movements " +
  "where reference_type='order' and reference_id=$1::uuid and movement_type='sale'",[shortShipmentOrder],
 );
 assert.equal(Number(completedSales[0].quantity),-2,
  "shipment after repair must settle the complete two-unit commercial order");
 assert.ok(completedSales[0].count>=1);

 const finalParity=(await db.unsafe(
  "select ib.quantity_on_hand::text h,ib.quantity_reserved::text r,"+
  "coalesce(pg_catalog.sum(b.quantity_on_hand),0)::text bh,"+
  "coalesce(pg_catalog.sum(b.quantity_reserved),0)::text br "+
  "from public.inventory_balances ib left join public.inventory_batches b "+
  "on b.product_id=ib.product_id and b.warehouse_id=ib.warehouse_id "+
  "where ib.product_id=$1::uuid and ib.warehouse_id=$2::uuid group by ib.id",
  [product,warehouse],
 ))[0];
 assert.equal(Number(finalParity.h),Number(finalParity.bh));
 assert.equal(Number(finalParity.r),Number(finalParity.br),
  "aggregate reserved quantities must remain in exact parity after release, replacement and shipment");

 // If no valid lot can replace an expired reservation, the release itself must
 // roll back: no partial release movement, no lower aggregate reserve, no audit.
 const failedReplacementReceipt=await receipt(manager,"FEFO-ATOMIC-FAIL-"+suffix,
  (await db.unsafe("select to_char((pg_catalog.now() at time zone 'UTC')::date+2,'YYYY-MM-DD') d"))[0].d);
 assert.ok(failedReplacementReceipt.receiptId,"a real received batch must exist before the insufficient-stock scenario");
 await as(manager);
 const order4=(await rpc(
  "select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
  [cust.id,db.json([{product_id:product,quantity:1}]),"FEFO insufficient replacement rollback",randomUUID().replaceAll("-",""),"cash_on_delivery"],
 )).id;
 assert.ok(order4);
 await status(manager,order4,"confirmed");
 await status(manager,order4,"processing");
 const failedSource=(await db.unsafe(
  "select im.inventory_batch_id::text id,b.batch_number " +
  "from public.inventory_movements im join public.inventory_batches b on b.id=im.inventory_batch_id " +
  "where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='reserve'",
  [order4],
 ))[0];
 assert.ok(failedSource,"the fourth order must hold a real FEFO lot before the rollback case");
 // Expire every physically positive lot in this disposable product so that no
 // alternate batch can satisfy the reservation. Include the reserved lot itself.
 await db.unsafe(
  "update public.inventory_batches " +
  "set batch_number=coalesce(batch_number,'FEFO-FORCED-EXPIRED-'||pg_catalog.left(id::text,8)),expiry_date=$2::date " +
  "where organization_id=$1::uuid and product_id=$3::uuid and quantity_on_hand>0",
  [org,expiredDate,product],
 );
 const noReplacementLots=await db.unsafe(
  "select count(*)::integer count from public.inventory_batches " +
  "where organization_id=$1::uuid and product_id=$2::uuid and quantity_on_hand>quantity_reserved " +
  "and (expiry_date is null or expiry_date>=(pg_catalog.now() at time zone 'UTC')::date)",
  [org,product],
 );
 assert.equal(noReplacementLots[0].count,0);
 const balanceBeforeFailedReallocation=await balance(product);
 const reservedBeforeFailedReallocation=(await db.unsafe(
  "select quantity_reserved::text from public.inventory_batches where id=$1::uuid",
  [failedSource.id],
 ))[0];
 await as(manager);
 await assert.rejects(
  () => rpc(
   "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
   [order4,"fefo-no-stock-"+randomUUID().replaceAll("-",""),"No replacement lot exists; reject partial release"],
  ),
  error => String(error?.code)==="P0001" && String(error?.message).includes("no changes were committed"),
  "reallocation must fail atomically when no non-expired replacement lot exists",
 );
 const reservedAfterFailedReallocation=(await db.unsafe(
  "select quantity_reserved::text from public.inventory_batches where id=$1::uuid",
  [failedSource.id],
 ))[0];
 assert.equal(Number(reservedAfterFailedReallocation.quantity_reserved),Number(reservedBeforeFailedReallocation.quantity_reserved),
  "failed replacement must restore the original expired-lot reservation");
 const releaseAfterFailedReallocation=await db.unsafe(
  "select count(*)::integer count from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type='release_reservation'",
  [order4],
 );
 assert.equal(releaseAfterFailedReallocation[0].count,0,
  "failed transaction must not leave a release movement behind");
 const balanceAfterFailedReallocation=await balance(product);
 assert.equal(Number(balanceAfterFailedReallocation.quantity_reserved),Number(balanceBeforeFailedReallocation.quantity_reserved),
  "failed transaction must preserve aggregate reserved stock");
 const failureParity=(await db.unsafe(
  "select ib.quantity_reserved::text r,coalesce(pg_catalog.sum(b.quantity_reserved),0)::text br " +
  "from public.inventory_balances ib left join public.inventory_batches b " +
  "on b.product_id=ib.product_id and b.warehouse_id=ib.warehouse_id " +
  "where ib.product_id=$1::uuid and ib.warehouse_id=$2::uuid group by ib.id",
  [product,warehouse],
 ))[0];
 assert.equal(Number(failureParity.r),Number(failureParity.br),
  "failed replacement must preserve aggregate-to-batch reservation parity");

 // Detect a cross-order ledger mismatch: two active orders share one expired
 // lot, while the physical lot and aggregate reserved counters under-report
 // their combined immutable reserve movements by one unit.
 const ledgerBatchId=randomUUID();
 const ledgerBatchNumber="FEFO-LEDGER-MISMATCH-"+suffix;
 const ledgerFutureDate=(await db.unsafe(
  "select to_char((pg_catalog.now() at time zone 'UTC')::date+3,'YYYY-MM-DD') d",
 ))[0].d;
 await db.unsafe(
  "insert into public.inventory_batches(id,organization_id,product_id,warehouse_id,batch_number,expiry_date,received_at,quantity_on_hand,quantity_reserved,source_type,source_reference_type) " +
  "values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::date,now(),2,0,'unattributed_balance_increase','fefo_acceptance_ledger_fixture')",
  [ledgerBatchId,org,product,warehouse,ledgerBatchNumber,ledgerFutureDate],
 );
 const ledgerBalanceAfterReceipt=(await db.unsafe(
  "update public.inventory_balances set quantity_on_hand=quantity_on_hand+2,last_movement_at=now(),updated_at=now() " +
  "where product_id=$1::uuid and warehouse_id=$2::uuid returning quantity_available",
  [product,warehouse],
 ))[0];
 assert.ok(ledgerBalanceAfterReceipt);
 await db.unsafe(
  "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id) " +
  "values($1::uuid,$2::uuid,'inventory_adjustment',2,$3,'inventory_adjustment',$5::uuid,'Temporary shared-lot ledger fixture for PostgreSQL 17 acceptance',$4::uuid,$5::uuid)",
  [product,warehouse,ledgerBalanceAfterReceipt.quantity_available,manager.id,ledgerBatchId],
 );

 async function createSharedLotOrder(label){
  await as(manager);
  const id=(await rpc(
   "select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
   [cust.id,db.json([{product_id:product,quantity:1}]),label,randomUUID().replaceAll("-",""),"cash_on_delivery"],
  )).id;
  assert.ok(id);
  await status(manager,id,"confirmed");
  await status(manager,id,"processing");
  return id;
 }
 const ledgerOrderA=await createSharedLotOrder("FEFO shared-lot ledger A");
 const ledgerOrderB=await createSharedLotOrder("FEFO shared-lot ledger B");
 const sharedLotReservations=await db.unsafe(
  "select reference_id::text order_id,inventory_batch_id::text batch_id,quantity::text " +
  "from public.inventory_movements where reference_type='order' and reference_id=ANY($1::uuid[]) " +
  "and movement_type='reserve' order by reference_id",
  [[ledgerOrderA,ledgerOrderB]],
 );
 assert.equal(sharedLotReservations.length,2);
 assert.ok(sharedLotReservations.every(row=>row.batch_id===ledgerBatchId),
  "both active orders must reserve the same dedicated acceptance lot");
 await db.unsafe(
  "update public.inventory_batches set expiry_date=$2::date,quantity_reserved=quantity_reserved-1 where id=$1::uuid",
  [ledgerBatchId,expiredDate],
 );
 await db.unsafe(
  "update public.inventory_balances set quantity_reserved=quantity_reserved-1,last_movement_at=now(),updated_at=now() " +
  "where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,warehouse],
 );

 await as(manager);
 const ledgerMismatchWorklist=await rpc(
  "select public.list_orders_with_expired_fefo_reservations(50,0) result",
 );
 for(const ledgerOrderId of [ledgerOrderA,ledgerOrderB]){
  const entry=ledgerMismatchWorklist.orders.find(value=>value.order_id===ledgerOrderId);
  assert.ok(entry,"both active shared-lot orders must remain visible in the expired FEFO worklist");
  assert.equal(entry.expired_lots[0].reservation_matches_batch,false,
   "the lot match flag must compare its reserved counter with all active orders, not only the current order");
 }
 const batchReservedBeforeLedgerGuard=(await db.unsafe(
  "select quantity_reserved::text from public.inventory_batches where id=$1::uuid",
  [ledgerBatchId],
 ))[0];
 const aggregateReservedBeforeLedgerGuard=(await db.unsafe(
  "select quantity_reserved::text from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,warehouse],
 ))[0];
 await assert.rejects(
  () => rpc(
   "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
   [ledgerOrderA,"fefo-ledger-mismatch-"+randomUUID().replaceAll("-",""),"Reject an under-reported shared batch reservation ledger"],
  ),
  error => String(error?.code)==="40001" && String(error?.message).includes("active order reservation movement ledger"),
  "reallocation must fail closed when aggregate active-order reserve movements exceed the batch subledger",
 );
 const batchReservedAfterLedgerGuard=(await db.unsafe(
  "select quantity_reserved::text from public.inventory_batches where id=$1::uuid",
  [ledgerBatchId],
 ))[0];
 const aggregateReservedAfterLedgerGuard=(await db.unsafe(
  "select quantity_reserved::text from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,warehouse],
 ))[0];
 assert.equal(batchReservedAfterLedgerGuard.quantity_reserved,batchReservedBeforeLedgerGuard.quantity_reserved,
  "ledger mismatch rejection must not change the batch reserved counter");
 assert.equal(aggregateReservedAfterLedgerGuard.quantity_reserved,aggregateReservedBeforeLedgerGuard.quantity_reserved,
  "ledger mismatch rejection must not change the aggregate reserved counter");
 const ledgerMismatchReleaseCount=await db.unsafe(
  "select count(*)::integer count from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type='release_reservation'",
  [ledgerOrderA],
 );
 assert.equal(ledgerMismatchReleaseCount[0].count,0,
  "ledger mismatch rejection must not append a partial release movement");

 // Restore the deliberately corrupted disposable fixture after asserting
 // fail-closed behavior so subsequent independent acceptance scenarios start
 // from reconciled batch and aggregate reserved ledgers.
 await db.unsafe(
  "update public.inventory_batches set quantity_reserved=quantity_reserved+1 where id=$1::uuid",
  [ledgerBatchId],
 );
 await db.unsafe(
  "update public.inventory_balances set quantity_reserved=quantity_reserved+1,last_movement_at=now(),updated_at=now() "+
  "where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,warehouse],
 );

 // Prove atomic rollback in the missing-reservation repair action when a
 // source order has one unit unreserved and no other in-date free lot remains.
 const reconcileFailureDate=(await db.unsafe(
  "select to_char((pg_catalog.now() at time zone 'UTC')::date+12,'YYYY-MM-DD') d",
 ))[0].d;
 const reconcileFailureReceipt=await receipt(
  manager,"FEFO-RECONCILE-FAIL-"+suffix,reconcileFailureDate,2,
 );
 assert.ok(reconcileFailureReceipt.receiptId);
 await as(manager);
 const reconcileFailureOrder=(await rpc(
  "select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
  [cust.id,db.json([{product_id:product,quantity:2}]),"FEFO reconcile atomic shortage",randomUUID().replaceAll("-",""),"cash_on_delivery"],
 )).id;
 assert.ok(reconcileFailureOrder);
 await status(manager,reconcileFailureOrder,"confirmed");
 await status(manager,reconcileFailureOrder,"processing");
 const reconcileFailureSource=(await db.unsafe(
  "select im.inventory_batch_id::text batch_id,im.product_id::text product_id,im.warehouse_id::text warehouse_id,"+
  "im.quantity::text quantity,b.batch_number,b.expiry_date::text expiry_date "+
  "from public.inventory_movements im join public.inventory_batches b on b.id=im.inventory_batch_id "+
  "where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='reserve'",
  [reconcileFailureOrder],
 ))[0];
 assert.ok(reconcileFailureSource);
 assert.equal(Number(reconcileFailureSource.quantity),2);
 await db.unsafe(
  "update public.inventory_batches set quantity_reserved=quantity_reserved-1 where id=$1::uuid and quantity_reserved>=1",
  [reconcileFailureSource.batch_id],
 );
 const afterPartialRelease=(await db.unsafe(
  "update public.inventory_balances set quantity_reserved=quantity_reserved-1,last_movement_at=now(),updated_at=now() "+
  "where product_id=$1::uuid and warehouse_id=$2::uuid and quantity_reserved>=1 returning quantity_available",
  [product,warehouse],
 ))[0];
 assert.ok(afterPartialRelease);
 await db.unsafe(
  "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id) "+
  "values($1::uuid,$2::uuid,'release_reservation',1,$3,'order',$4::uuid,'Local fixture release before failed missing-reservation repair',$5::uuid,$6::uuid)",
  [product,warehouse,afterPartialRelease.quantity_available,reconcileFailureOrder,manager.id,reconcileFailureSource.batch_id],
 );

 // Remove the remaining free unit as a physical-loss fixture, keeping batch
 // and aggregate ledgers aligned so the only failure is genuine stock shortage.
 const afterPhysicalLoss=(await db.unsafe(
  "update public.inventory_batches set quantity_on_hand=quantity_on_hand-1 "+
  "where id=$1::uuid and quantity_on_hand-quantity_reserved>=1 returning quantity_on_hand::text on_hand,quantity_reserved::text reserved",
  [reconcileFailureSource.batch_id],
 ))[0];
 assert.ok(afterPhysicalLoss);
 const aggregateAfterPhysicalLoss=(await db.unsafe(
  "update public.inventory_balances set quantity_on_hand=quantity_on_hand-1,last_movement_at=now(),updated_at=now() "+
  "where product_id=$1::uuid and warehouse_id=$2::uuid and quantity_available>=1 returning quantity_available",
  [product,warehouse],
 ))[0];
 assert.ok(aggregateAfterPhysicalLoss);
 await db.unsafe(
  "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id) "+
  "values($1::uuid,$2::uuid,'inventory_adjustment',-1,$3,'inventory_adjustment',$4::uuid,'Local fixture physical loss before no-stock reconciliation',$5::uuid,$6::uuid)",
  [product,warehouse,aggregateAfterPhysicalLoss.quantity_available,reconcileFailureOrder,manager.id,reconcileFailureSource.batch_id],
 );
 assert.equal(Number(afterPhysicalLoss.on_hand),1);
 assert.equal(Number(afterPhysicalLoss.reserved),1);
 assert.equal(Number(aggregateAfterPhysicalLoss.quantity_available),0);

 await as(manager);
 const noStockWorklist=await rpc("select public.list_orders_with_incomplete_inventory_reservations(50,0) result");
 const noStockEntry=noStockWorklist.orders.find(row=>row.order_id===reconcileFailureOrder);
 assert.ok(noStockEntry);
 assert.equal(Number(noStockEntry.missing_quantity),1);
 assert.equal(Number(noStockEntry.lines[0].replacement_available_quantity),0);
 const noStockBatchBefore=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved from public.inventory_batches where id=$1::uuid",
  [reconcileFailureSource.batch_id],
 ))[0];
 const noStockBalanceBefore=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,warehouse],
 ))[0];
 const noStockReserveCountBefore=(await db.unsafe(
  "select count(*)::integer count from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type='reserve'",
  [reconcileFailureOrder],
 ))[0].count;
 const noStockKey="fefo-reconcile-no-stock-"+randomUUID().replaceAll("-","");
 await assert.rejects(
  () => rpc(
   "select public.reconcile_incomplete_order_reservations($1::uuid,$2::text,$3::text) result",
   [reconcileFailureOrder,noStockKey,"No valid free lot remains; require atomic rollback"],
  ),
  error => String(error?.code)==="P0001" && String(error?.message).includes("no changes were committed"),
  "incomplete reservation repair must roll back when no valid FEFO stock can cover the deficit",
 );
 const noStockBatchAfter=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved from public.inventory_batches where id=$1::uuid",
  [reconcileFailureSource.batch_id],
 ))[0];
 const noStockBalanceAfter=(await db.unsafe(
  "select quantity_on_hand::text on_hand,quantity_reserved::text reserved from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
  [product,warehouse],
 ))[0];
 assert.deepEqual(noStockBatchAfter,noStockBatchBefore,
  "failed missing-reservation repair must preserve source batch counters");
 assert.deepEqual(noStockBalanceAfter,noStockBalanceBefore,
  "failed missing-reservation repair must preserve aggregate stock counters");
 const noStockReserveCountAfter=(await db.unsafe(
  "select count(*)::integer count from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type='reserve'",
  [reconcileFailureOrder],
 ))[0].count;
 assert.equal(noStockReserveCountAfter,noStockReserveCountBefore,
  "failed missing-reservation repair must not append a reserve movement");
 const noStockIdempotencyRow=await db.unsafe(
  "select id from public.inventory_order_reservation_reconciliations where organization_id=$1::uuid and idempotency_key=$2::text",
  [org,noStockKey],
 );
 assert.equal(noStockIdempotencyRow.length,0,
  "failed missing-reservation repair must not persist an idempotency result");

 // Exercise the opposite mismatch: an order has one extra unit reserved in a
 // valid lot. The worklist must identify the excess, and the manager RPC must
 // release only that excess while preserving the one unit actually ordered.
 const excessDates=(await db.unsafe(
  "select to_char((pg_catalog.now() at time zone 'UTC')::date+13,'YYYY-MM-DD') early_date,"+
  "to_char((pg_catalog.now() at time zone 'UTC')::date+14,'YYYY-MM-DD') late_date",
 ))[0];
 const excessEarlyReceipt=await receipt(manager,"FEFO-EXCESS-EARLY-"+suffix,excessDates.early_date,1);
 const excessLateReceipt=await receipt(manager,"FEFO-EXCESS-LATE-"+suffix,excessDates.late_date,1);
 assert.ok(excessEarlyReceipt.receiptId);
 assert.ok(excessLateReceipt.receiptId);
 const excessEarlyBatch=(await db.unsafe(
  "select id::text batch_id,batch_number from public.inventory_batches where receipt_id=$1::uuid",
  [excessEarlyReceipt.receiptId],
 ))[0];
 const excessLateBatch=(await db.unsafe(
  "select id::text batch_id,batch_number from public.inventory_batches where receipt_id=$1::uuid",
  [excessLateReceipt.receiptId],
 ))[0];
 assert.ok(excessEarlyBatch);
 assert.ok(excessLateBatch);
 await as(manager);
 const excessOrder=(await rpc(
  "select public.create_staff_order($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) result",
  [cust.id,db.json([{product_id:product,quantity:1}]),"FEFO excess reservation correction",randomUUID().replaceAll("-",""),"cash_on_delivery"],
 )).id;
 assert.ok(excessOrder);
 await status(manager,excessOrder,"confirmed");
 await status(manager,excessOrder,"processing");
 const originalExcessReserve=(await db.unsafe(
  "select im.quantity::text,b.batch_number from public.inventory_movements im "+
  "join public.inventory_batches b on b.id=im.inventory_batch_id "+
  "where im.reference_type='order' and im.reference_id=$1::uuid and im.movement_type='reserve' "+
  "and im.inventory_batch_id=$2::uuid",
  [excessOrder,excessEarlyBatch.batch_id],
 ))[0];
 assert.equal(Number(originalExcessReserve.quantity),1);
 assert.equal(originalExcessReserve.batch_number,excessEarlyBatch.batch_number,
  "initial one-unit order reservation must select the earlier-expiry FEFO lot");
 const extraReserveBalance=(await db.unsafe(
  "update public.inventory_batches set quantity_reserved=quantity_reserved+1 "+
  "where id=$1::uuid and quantity_on_hand>=quantity_reserved+1 returning quantity_reserved::text reserved",
  [excessLateBatch.batch_id],
 ))[0];
 assert.ok(extraReserveBalance);
 const extraReserveAggregate=(await db.unsafe(
  "update public.inventory_balances set quantity_reserved=quantity_reserved+1,last_movement_at=now(),updated_at=now() "+
  "where product_id=$1::uuid and warehouse_id=$2::uuid and quantity_available>=1 returning quantity_available",
  [product,warehouse],
 ))[0];
 assert.ok(extraReserveAggregate);
 await db.unsafe(
  "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id) "+
  "values($1::uuid,$2::uuid,'reserve',1,$3,'order',$4::uuid,'Local acceptance fixture: one excess reservation in the later-expiry batch',$5::uuid,$6::uuid)",
  [product,warehouse,extraReserveAggregate.quantity_available,excessOrder,manager.id,excessLateBatch.batch_id],
 );

 await as(manager);
 const excessWorklist=await rpc("select public.list_orders_with_incomplete_inventory_reservations(50,0) result");
 const excessEntry=excessWorklist.orders.find(row=>row.order_id===excessOrder);
 assert.ok(excessEntry,"over-reserved active order must appear in the inventory mismatch worklist");
 assert.equal(excessEntry.has_excess,true);
 assert.equal(excessEntry.has_shortage,false);
 assert.equal(Number(excessEntry.excess_quantity),1);
 assert.equal(Number(excessEntry.missing_quantity),0);
 assert.equal(Number(excessEntry.lines[0].excess_quantity),1);
 assert.equal(excessEntry.lines[0].reservation_status,"excess");

 const excessReleaseKey="fefo-excess-release-"+randomUUID().replaceAll("-","");
 const excessReleaseReason="Release one unit reserved beyond the commercial order quantity";
 const excessReleased=await rpc(
  "select public.release_excess_order_reservations($1::uuid,$2::text,$3::text) result",
  [excessOrder,excessReleaseKey,excessReleaseReason],
 );
 assert.equal(excessReleased.release_status,"excess_released");
 assert.equal(Number(excessReleased.released_quantity),1);
 assert.equal(excessReleased.released_lot_count,1);
 assert.equal(excessReleased.allocations.length,1);
 assert.equal(excessReleased.allocations[0].batch_id,excessLateBatch.batch_id,
  "excess release must remove the latest-expiry lot first and preserve the earlier FEFO reservation");
 const excessAudit=await db.unsafe(
  "select count(*)::integer count from public.audit_logs where action='inventory.order_reservation.excess_released' "+
  "and entity_type='order_reservation_reconciliation' and entity_id=$1::uuid",
  [excessReleased.reconciliation_id],
 );
 assert.equal(excessAudit[0].count,1,"excess release must append one audit event");

 const excessReplay=await rpc(
  "select public.release_excess_order_reservations($1::uuid,$2::text,$3::text) result",
  [excessOrder,excessReleaseKey,excessReleaseReason],
 );
 assert.equal(excessReplay.idempotent_replay,true);
 assert.equal(excessReplay.reconciliation_id,excessReleased.reconciliation_id);
 await assert.rejects(
  () => rpc(
   "select public.release_excess_order_reservations($1::uuid,$2::text,$3::text) result",
   [excessOrder,excessReleaseKey,"Changed reason must not reuse the idempotency key"],
  ),
  error => String(error?.code)==="22023" && String(error?.message).includes("idempotency payload conflict"),
  "excess release must reject changed payload reuse",
 );
 const excessWorklistAfter=await rpc("select public.list_orders_with_incomplete_inventory_reservations(50,0) result");
 assert.equal(excessWorklistAfter.orders.some(row=>row.order_id===excessOrder),false,
  "order with reconciled reservation quantity must leave the mismatch worklist");
 const excessNet=(await db.unsafe(
  "select pg_catalog.sum(case when movement_type='reserve' then quantity else -quantity end)::text quantity "+
  "from public.inventory_movements where reference_type='order' and reference_id=$1::uuid "+
  "and movement_type in ('reserve','release_reservation')",
  [excessOrder],
 ))[0];
 assert.equal(Number(excessNet.quantity),1,
  "release action must retain exactly the one unit ordered");
 const excessBatchStates=await db.unsafe(
  "select id::text batch_id,quantity_on_hand::text on_hand,quantity_reserved::text reserved "+
  "from public.inventory_batches where id=ANY($1::uuid[])",
  [[excessEarlyBatch.batch_id,excessLateBatch.batch_id]],
 );
 assert.equal(excessBatchStates.length,2);
 const retainedEarly=excessBatchStates.find(row=>row.batch_id===excessEarlyBatch.batch_id);
 const releasedLate=excessBatchStates.find(row=>row.batch_id===excessLateBatch.batch_id);
 assert.equal(Number(retainedEarly.on_hand),1);
 assert.equal(Number(retainedEarly.reserved),1,
  "the earlier-expiry FEFO batch remains reserved for the order");
 assert.equal(Number(releasedLate.on_hand),1);
 assert.equal(Number(releasedLate.reserved),0,
  "the later-expiry lot is the one released as excess");
 await status(manager,excessOrder,"shipped");
 const excessSale=(await db.unsafe(
  "select pg_catalog.sum(im.quantity)::text quantity,pg_catalog.count(*)::integer count,"+
  "pg_catalog.min(im.inventory_batch_id::text) batch_id "+
  "from public.inventory_movements im where im.reference_type='order' "+
  "and im.reference_id=$1::uuid and im.movement_type='sale'",
  [excessOrder],
 ))[0];
 assert.equal(Number(excessSale.quantity),-1);
 assert.equal(excessSale.count,1);
 assert.equal(excessSale.batch_id,excessEarlyBatch.batch_id,
  "shipment must consume the earlier-expiry FEFO lot kept after excess release");

 await as(customer);
 await assert.rejects(
  () => rpc(
   "select public.reallocate_expired_order_reservations($1::uuid,$2::text,$3::text) result",
   [order3,"customer-forbidden-"+randomUUID().replaceAll("-",""),"Customer cannot reallocate inventory"],
  ),
  error => String(error?.code)==="42501",
  "customer must not invoke the manager-only inventory reallocation RPC",
 );
 await assert.rejects(
  () => rpc("select public.list_orders_with_expired_fefo_reservations(50,0) result"),
  error => String(error?.code)==="42501",
  "customer must not read the manager-only expired reservation work queue",
 );
 await assert.rejects(
  () => rpc("select public.list_orders_with_incomplete_inventory_reservations(50,0) result"),
  error => String(error?.code)==="42501",
  "customer must not read the manager-only incomplete reservation worklist",
 );
 await assert.rejects(
  () => rpc("select public.reconcile_incomplete_order_reservations($1::uuid,$2::text,$3::text) result",
   [shortShipmentOrder,"customer-reconcile-"+randomUUID().replaceAll("-",""),"Customer cannot reconcile stock"]),
  error => String(error?.code)==="42501",
  "customer must not reconcile order reservations",
 );
 await assert.rejects(
  () => rpc("select public.release_excess_order_reservations($1::uuid,$2::text,$3::text) result",
   [shortShipmentOrder,"customer-excess-"+randomUUID().replaceAll("-",""),"Customer cannot release order reservation"]),
  error => String(error?.code)==="42501",
  "customer must not release excess order reservations",
 );

 const reallocationPrivileges=await db.unsafe(
  "select " +
   "has_function_privilege('anon','public.reallocate_expired_order_reservations(uuid,text,text)','EXECUTE') as anon_execute," +
   "has_function_privilege('authenticated','public.reallocate_expired_order_reservations(uuid,text,text)','EXECUTE') as authenticated_execute," +
   "has_function_privilege('anon','public.list_orders_with_expired_fefo_reservations(integer,integer)','EXECUTE') as anon_worklist_execute," +
   "has_function_privilege('authenticated','public.list_orders_with_expired_fefo_reservations(integer,integer)','EXECUTE') as authenticated_worklist_execute," +
   "has_function_privilege('service_role','public.list_orders_with_expired_fefo_reservations(integer,integer)','EXECUTE') as service_worklist_execute," +
   "has_function_privilege('service_role','public.reallocate_expired_order_reservations(uuid,text,text)','EXECUTE') as service_execute," +
   "has_table_privilege('authenticated','public.inventory_order_reservation_reallocations','SELECT') as authenticated_table_read," +
   "has_table_privilege('service_role','public.inventory_order_reservation_reallocations','SELECT') as service_table_read",
 );
 assert.equal(reallocationPrivileges[0].anon_execute,false);
 assert.equal(reallocationPrivileges[0].authenticated_execute,true,
  "authenticated callers can reach only the RPC; the function enforces manager/admin capability");
 assert.equal(reallocationPrivileges[0].service_execute,false,
  "service_role must not expose the SECURITY DEFINER reallocation API through the Data API");
 assert.equal(reallocationPrivileges[0].authenticated_worklist_execute,true);
 assert.equal(reallocationPrivileges[0].anon_worklist_execute,false);
 assert.equal(reallocationPrivileges[0].service_worklist_execute,false);
 assert.equal(reallocationPrivileges[0].authenticated_table_read,false);
 assert.equal(reallocationPrivileges[0].service_table_read,false,
  "the server-only idempotency ledger is not directly readable");

 const reconciliationPrivileges=await db.unsafe(
  "select "+
   "has_function_privilege('anon','public.reconcile_incomplete_order_reservations(uuid,text,text)','EXECUTE') anon_execute,"+
   "has_function_privilege('authenticated','public.reconcile_incomplete_order_reservations(uuid,text,text)','EXECUTE') authenticated_execute,"+
   "has_function_privilege('service_role','public.reconcile_incomplete_order_reservations(uuid,text,text)','EXECUTE') service_execute,"+
   "has_function_privilege('anon','public.list_orders_with_incomplete_inventory_reservations(integer,integer)','EXECUTE') anon_worklist_execute,"+
   "has_function_privilege('authenticated','public.list_orders_with_incomplete_inventory_reservations(integer,integer)','EXECUTE') authenticated_worklist_execute,"+
   "has_function_privilege('service_role','public.list_orders_with_incomplete_inventory_reservations(integer,integer)','EXECUTE') service_worklist_execute,"+
   "has_table_privilege('authenticated','public.inventory_order_reservation_reconciliations','SELECT') authenticated_table_read,"+
   "has_table_privilege('service_role','public.inventory_order_reservation_reconciliations','SELECT') service_table_read"
 );
 const excessReleasePrivileges=await db.unsafe(
  "select "+
   "has_function_privilege('anon','public.release_excess_order_reservations(uuid,text,text)','EXECUTE') anon_execute,"+
   "has_function_privilege('authenticated','public.release_excess_order_reservations(uuid,text,text)','EXECUTE') authenticated_execute,"+
   "has_function_privilege('service_role','public.release_excess_order_reservations(uuid,text,text)','EXECUTE') service_execute"
 );
 assert.equal(reconciliationPrivileges[0].anon_execute,false);
 assert.equal(reconciliationPrivileges[0].authenticated_execute,true);
 assert.equal(reconciliationPrivileges[0].service_execute,false);
 assert.equal(reconciliationPrivileges[0].anon_worklist_execute,false);
 assert.equal(reconciliationPrivileges[0].authenticated_worklist_execute,true);
 assert.equal(reconciliationPrivileges[0].service_worklist_execute,false);
 assert.equal(reconciliationPrivileges[0].authenticated_table_read,false);
 assert.equal(reconciliationPrivileges[0].service_table_read,false,
  "the reconciliation idempotency ledger must remain server-only");
 assert.equal(excessReleasePrivileges[0].anon_execute,false);
 assert.equal(excessReleasePrivileges[0].authenticated_execute,true);
 assert.equal(excessReleasePrivileges[0].service_execute,false,
  "only authenticated callers may reach excess release; the function body enforces manager/admin");

 // Compare the previous-day test lot with today, not with its own expiry date.
 const expiredState=(await db.unsafe("select quantity_on_hand::text h,quantity_reserved::text r,expiry_date<(pg_catalog.now() at time zone 'UTC')::date expired from public.inventory_batches where id=$1::uuid",[expiredBatchId]))[0];
 assert.equal(expiredState.expired,true);assert.equal(Number(expiredState.h),1);assert.equal(Number(expiredState.r),0);
 await as(manager);const trace=await rpc("select public.list_inventory_batch_stock($1::uuid,$2::uuid) result",[product,warehouse]);assert.equal(trace.product_id,product);assert.ok(trace.lots.some(x=>x.batch_number===late.batch));assert.ok(trace.lots.some(x=>x.batch_number===expiredBatch&&x.expired===true));
 await as(customer);
 await assert.rejects(()=>db.unsafe("select * from public.inventory_batches limit 1"),/permission denied/i);
 await assert.rejects(()=>rpc("select public.list_inventory_batch_stock($1::uuid,$2::uuid) result",[product,warehouse]),/inventory\.read_balance capability|warehouse assignment/i);
 await db.unsafe("reset role");
 process.stdout.write("PASS FEFO batches: receipt lot creation/replay, receipt print, FEFO reserve/sale, expired-order reallocation, incomplete-reservation recovery and shortage rollback, excess-reservation release, full shipment, post-reallocation cancellation, shared-lot ledger guard, access denial and balance parity\n");
}
main().catch(e=>{process.stderr.write("FAIL inventory batch FEFO: "+String(e?.stack??e)+"\n");process.exitCode=1;}).finally(async()=>{await db.end({timeout:5}).catch(()=>{});});
