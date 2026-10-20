import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for customer return database acceptance.");
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(authUserId, email) {
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated" }),
  ]);
}

async function expectFailure(label, action, pattern) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should fail");
  if (pattern) assert.match(String(caught.message), pattern, label + " should fail for the expected reason");
}

function asJson(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

async function main() {
  const organizationId = "a0000000-0000-0000-0000-000000000001";
  const customerOneProfileId = "f1111111-1111-4111-8111-111111111111";
  const customerOneAuthId = "11111111-1111-4111-8111-111111111111";
  const customerTwoProfileId = "f2222222-2222-4222-8222-222222222222";
  const customerTwoAuthId = "22222222-2222-4222-8222-222222222222";
  const managerProfileId = "f7777777-7777-4777-8777-777777777777";
  const managerAuthId = "77777777-7777-4777-8777-777777777777";
  const accountantProfileId = "f5555555-5555-4555-8555-555555555555";
  const accountantAuthId = "55555555-5555-4555-8555-555555555555";
  const productId = "a1000000-0000-0000-0000-000000000001";
  const suffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8);

  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Return Manager','ci-return-manager@example.test',true) on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,is_active=true",
    [managerProfileId,managerAuthId,organizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'manager') on conflict(profile_id,role) do nothing",
    [managerProfileId],
  );

  const customerRows = await db.unsafe(
    "select id,profile_id from public.customers where organization_id=$1 and profile_id in ($2::uuid,$3::uuid) and status='approved'",
    [organizationId,customerOneProfileId,customerTwoProfileId],
  );
  const customerOne = customerRows.find((row) => row.profile_id === customerOneProfileId);
  const customerTwo = customerRows.find((row) => row.profile_id === customerTwoProfileId);
  assert.ok(customerOne, "first approved customer fixture must exist from migration acceptance");
  assert.ok(customerTwo, "second approved customer fixture must exist from migration acceptance");

  const orderOneRows = await db.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) values($1,$2,$3,'delivered',500,5,'CI return request', $4) returning id",
    [organizationId,customerOne.id,"CI-RET-A-"+suffix,customerOneProfileId],
  );
  const orderTwoRows = await db.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) values($1,$2,$3,'delivered',200,2,'CI return rejection', $4) returning id",
    [organizationId,customerOne.id,"CI-RET-B-"+suffix,customerOneProfileId],
  );
  const otherOrderRows = await db.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) values($1,$2,$3,'delivered',400,4,'CI different customer', $4) returning id",
    [organizationId,customerTwo.id,"CI-RET-C-"+suffix,customerTwoProfileId],
  );
  const orderOneId = orderOneRows[0].id;
  const orderTwoId = orderTwoRows[0].id;
  const otherOrderId = otherOrderRows[0].id;

  const lineOneRows = await db.unsafe(
    "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity,unit_price_snapshot,discount_snapshot,line_total) values($1,$2,'000125','CI Return Item One','carton',5,5,5,100,0,500) returning id",
    [orderOneId,productId],
  );
  const lineTwoRows = await db.unsafe(
    "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity,unit_price_snapshot,discount_snapshot,line_total) values($1,$2,'000126','CI Return Item Two','piece',2,2,2,100,0,200) returning id",
    [orderTwoId,productId],
  );
  const otherLineRows = await db.unsafe(
    "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity,unit_price_snapshot,discount_snapshot,line_total) values($1,$2,'000127','CI Private Item','piece',4,4,4,100,0,400) returning id",
    [otherOrderId,productId],
  );
  const lineOneId = lineOneRows[0].id;
  const lineTwoId = lineTwoRows[0].id;
  const otherLineId = otherLineRows[0].id;

  // Source invoice fixture for the fully received return: the credit must derive from this immutable YER invoice line.
  const invoiceFixtureRows = await db.unsafe(
    "insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,subtotal,tax_amount,total_amount) " +
    "values($1,$2,$3,$4,'issued',pg_catalog.now(),'YER',500,0,500) returning id",
    [organizationId,customerOne.id,orderOneId,"INV-CI-RET-"+suffix],
  );
  const sourceInvoiceId = invoiceFixtureRows[0].id;
  await db.unsafe(
    "insert into public.customer_invoice_items(organization_id,invoice_id,order_item_id,product_id,item_code,description,unit,quantity,unit_price," +
    "discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total) " +
    "select $1,$2,oi.id,oi.product_id,oi.item_code,oi.product_name_snapshot,oi.unit_snapshot,oi.quantity,oi.unit_price_snapshot," +
    "oi.discount_snapshot,oi.promotion_discount_per_unit_snapshot,oi.promotion_id_snapshot,oi.promotion_title_snapshot," +
    "oi.promotion_discount_type_snapshot,oi.promotion_discount_value_snapshot,oi.line_total from public.order_items oi where oi.id=$3::uuid",
    [organizationId,sourceInvoiceId,lineOneId],
  );
  const receivableAccountRows = await db.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,is_active) values($1,$2,'CI Test Receivables','asset',true) returning id",
    [organizationId,"CI-AR-"+suffix.toUpperCase()],
  );
  const revenueAccountRows = await db.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,is_active) values($1,$2,'CI Test Sales Returns','revenue',true) returning id",
    [organizationId,"CI-RET-REV-"+suffix.toUpperCase()],
  );
  const receivableAccountId = receivableAccountRows[0].id;
  const revenueAccountId = revenueAccountRows[0].id;

  await db.unsafe("reset role");
  await setIdentity(customerOneAuthId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");

  const firstRequestRaw = await db.unsafe(
    "select public.request_customer_return($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) as result",
    [orderOneId,db.json([{order_item_id:lineOneId,quantity:1.25}]),"damaged","Visible damage","ci-return-key-"+suffix],
  );
  const firstRequest = asJson(firstRequestRaw[0].result);
  assert.equal(firstRequest.status,"submitted");
  assert.equal(firstRequest.idempotent_replay,false);
  assert.match(firstRequest.request_number,/^RET-/);

  const replayRaw = await db.unsafe(
    "select public.request_customer_return($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) as result",
    [orderOneId,db.json([{order_item_id:lineOneId,quantity:1.25}]),"damaged","Visible damage","ci-return-key-"+suffix],
  );
  const replay = asJson(replayRaw[0].result);
  assert.equal(replay.request_id,firstRequest.request_id,"same payload and key returns the original request");
  assert.equal(replay.idempotent_replay,true,"same payload and key is marked as a replay");

  await expectFailure(
    "same idempotency key with changed payload is rejected",
    () => db.unsafe(
      "select public.request_customer_return($1::uuid,$2::jsonb,$3::text,$4::text,$5::text)",
      [orderOneId,db.json([{order_item_id:lineOneId,quantity:1.5}]),"damaged","Visible damage","ci-return-key-"+suffix],
    ),
    /idempotency key payload conflict/i,
  );
  await expectFailure(
    "request exceeding remaining returnable quantity is rejected",
    () => db.unsafe(
      "select public.request_customer_return($1::uuid,$2::jsonb,$3::text,$4::text,$5::text)",
      [orderOneId,db.json([{order_item_id:lineOneId,quantity:4}]),"damaged","Excess quantity","ci-return-over-"+suffix],
    ),
    /exceeds the remaining returnable quantity/i,
  );
  await expectFailure(
    "another customer's order cannot be targeted",
    () => db.unsafe(
      "select public.request_customer_return($1::uuid,$2::jsonb,$3::text,$4::text,$5::text)",
      [otherOrderId,db.json([{order_item_id:otherLineId,quantity:1}]),"other","Other customer order","ci-return-other-"+suffix],
    ),
    /not found for the authenticated customer and organization/i,
  );

  const ownSummaryRaw = await db.unsafe(
    "select public.list_my_customer_return_requests($1::uuid) as result",
    [orderOneId],
  );
  const ownSummary = asJson(ownSummaryRaw[0].result);
  assert.equal(ownSummary.requests.length,1);
  assert.equal(ownSummary.returnable_items[0].remaining_quantity,3.75);
  assert.equal(ownSummary.requests[0].items[0].item_code,"000125","business codes preserve leading zeroes");

  await expectFailure(
    "authenticated customers cannot directly insert return requests",
    () => db.unsafe(
      "insert into public.customer_return_requests(organization_id,customer_id,order_id,request_number,reason,requested_by,idempotency_key,payload_fingerprint) values($1,$2,$3,'FORGED','other',$4,'ci-direct-write-key','00000000000000000000000000000000')",
      [organizationId,customerOne.id,orderOneId,customerOneProfileId],
    ),
    /permission denied/i,
  );

  const otherRows = await db.unsafe(
    "select id from public.customer_return_requests where id=$1",
    [firstRequest.request_id],
  );
  assert.equal(otherRows.length,1,"the request owner can read its own request");
  await db.unsafe("reset role");

  await setIdentity(managerAuthId,"ci-return-manager@example.test");
  await db.unsafe("set role authenticated");
  const queueRaw = await db.unsafe("select public.list_customer_return_review_queue(50) as result");
  const queue = asJson(queueRaw[0].result);
  assert.ok(queue.some((row) => row.id === firstRequest.request_id),"manager review queue returns this tenant's pending request");

  const approvedRaw = await db.unsafe(
    "select public.review_customer_return_request($1::uuid,'approved',$2::text) as result",
    [firstRequest.request_id,"Approved after inspection review"],
  );
  const approved = asJson(approvedRaw[0].result);
  assert.equal(approved.status,"approved");
  assert.equal(approved.idempotent_replay,false);
  await db.unsafe("reset role");

  const receiptTask = await db.unsafe(
    "select id,task_role,status from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId,"customer-return-receipt:"+firstRequest.request_id],
  );
  assert.equal(receiptTask.length,1,"approval creates one warehouse inspection task");
  assert.equal(receiptTask[0].task_role,"warehouse");
  const reviewAudit = await db.unsafe(
    "select action,new_value->>'status' as new_status from public.audit_logs where organization_id=$1 and entity_id=$2::uuid and action='customer_return.reviewed'",
    [organizationId,firstRequest.request_id],
  );
  assert.equal(reviewAudit.length,1,"decision audit event is persisted");
  assert.equal(reviewAudit[0].new_status,"approved");

  // The approved request moves through a real, idempotent receiving event. Only saleable units affect stock.
  await setIdentity(managerAuthId,"ci-return-manager@example.test");
  await db.unsafe("set role authenticated");
  const warehouseRows = await db.unsafe(
    "select id from public.warehouses where organization_id=$1 and is_active order by (id='d0000000-0000-0000-0000-000000000001'::uuid) desc,id limit 1",
    [organizationId],
  );
  assert.equal(warehouseRows.length,1,"return receipt acceptance requires an active same-tenant warehouse");
  const receiptWarehouseId = warehouseRows[0].id;
  const requestItemRows = await db.unsafe(
    "select id,product_id from public.customer_return_request_items where organization_id=$1 and return_request_id=$2::uuid and order_item_id=$3::uuid",
    [organizationId,firstRequest.request_id,lineOneId],
  );
  assert.equal(requestItemRows.length,1,"approved return request must have its immutable request-line snapshot");
  const requestItemId = requestItemRows[0].id;
  const receiptQueueRaw = await db.unsafe("select public.list_customer_return_receipt_queue(50) as result");
  const receiptQueue = asJson(receiptQueueRaw[0].result);
  assert.ok(receiptQueue.warehouses.some((row) => row.id === receiptWarehouseId),"receipt queue only returns same-tenant active warehouses");
  assert.ok(receiptQueue.requests.some((row) => row.id === firstRequest.request_id),"approved return appears in physical receipt queue");

  await db.unsafe("reset role");
  const foreignWarehouseRows = await db.unsafe(
    "select id from public.warehouses where organization_id<>$1 and is_active order by id limit 1",
    [organizationId],
  );
  assert.equal(foreignWarehouseRows.length,1,"receipt acceptance requires a foreign-tenant warehouse fixture");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "return receipt cannot target another tenant's warehouse",
    () => db.unsafe(
      "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text)",
      [firstRequest.request_id,foreignWarehouseRows[0].id,db.json([{request_item_id:requestItemId,received_quantity:0.25,restockable_quantity:0.25}]),"foreign warehouse denial","ci-return-foreign-warehouse-"+suffix],
    ),
    /warehouse.*current organization/i,
  );

  const firstReceiptLines = [{request_item_id:requestItemId,received_quantity:0.75,restockable_quantity:0.50}];
  const firstReceiptRaw = await db.unsafe(
    "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [firstRequest.request_id,receiptWarehouseId,db.json(firstReceiptLines),"first physical inspection","ci-return-receipt-one-"+suffix],
  );
  const firstReceipt = asJson(firstReceiptRaw[0].result);
  assert.equal(firstReceipt.request_status,"approved","partial receipt keeps the return open");
  assert.equal(firstReceipt.idempotent_replay,false);
  assert.equal(Number(firstReceipt.received_quantity),0.75);
  assert.equal(Number(firstReceipt.restockable_quantity),0.50);
  assert.equal(Number(firstReceipt.defective_quantity),0.25);

  const replayReceiptRaw = await db.unsafe(
    "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [firstRequest.request_id,receiptWarehouseId,db.json(firstReceiptLines),"first physical inspection","ci-return-receipt-one-"+suffix],
  );
  const replayReceipt = asJson(replayReceiptRaw[0].result);
  assert.equal(replayReceipt.receipt_id,firstReceipt.receipt_id,"idempotent replay returns the original receipt");
  assert.equal(replayReceipt.idempotent_replay,true,"retry is explicitly marked replay");

  const secondReceiptRaw = await db.unsafe(
    "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [firstRequest.request_id,receiptWarehouseId,db.json([{request_item_id:requestItemId,received_quantity:0.50,restockable_quantity:0.25}]),"final physical inspection","ci-return-receipt-two-"+suffix],
  );
  const secondReceipt = asJson(secondReceiptRaw[0].result);
  assert.equal(secondReceipt.request_status,"received","request closes only after all approved quantity is received");
  assert.equal(Number(secondReceipt.received_quantity),0.50);
  assert.equal(Number(secondReceipt.restockable_quantity),0.25);
  assert.equal(Number(secondReceipt.defective_quantity),0.25);

  // Inspect persisted tables as the privileged test runner; authenticated callers intentionally have no direct table SELECT.
  await db.unsafe("reset role");
  const finalReturnRows = await db.unsafe(
    "select status from public.customer_return_requests where id=$1::uuid and organization_id=$2",
    [firstRequest.request_id,organizationId],
  );
  assert.equal(finalReturnRows[0].status,"received");
  const receiptStockRows = await db.unsafe(
    "select count(*)::integer as movement_count,coalesce(sum(m.quantity),0)::numeric(15,3)::text as restocked " +
    "from public.inventory_movements m join public.customer_return_receipts h on h.id=m.reference_id and h.organization_id=$2 " +
    "where h.return_request_id=$1::uuid and m.reference_type='customer_return_receipt'",
    [firstRequest.request_id,organizationId],
  );
  assert.equal(receiptStockRows[0].movement_count,2,"receipt replay must not create duplicate stock movement");
  assert.equal(Number(receiptStockRows[0].restocked),0.75,"only saleable quantities enter stock");
  const defectRows = await db.unsafe(
    "select coalesce(sum(i.defective_quantity),0)::numeric(15,3)::text as defective " +
    "from public.customer_return_receipt_items i join public.customer_return_receipts h on h.id=i.receipt_id and h.organization_id=$2 " +
    "where h.return_request_id=$1::uuid",
    [firstRequest.request_id,organizationId],
  );
  assert.equal(Number(defectRows[0].defective),0.50,"defective quantity is recorded but excluded from stock movements");
  const completedReceiptTask = await db.unsafe(
    "select status from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId,"customer-return-receipt:"+firstRequest.request_id],
  );
  assert.equal(completedReceiptTask[0]?.status,"completed","full receipt closes the linked warehouse task");
  const queueAfterReceiptRaw = await db.unsafe("select public.list_customer_return_receipt_queue(50) as result");
  const queueAfterReceipt = asJson(queueAfterReceiptRaw[0].result);
  assert.ok(!queueAfterReceipt.requests.some((row) => row.id === firstRequest.request_id),"fully received return leaves pending queue");
  await db.unsafe("reset role");

  // Finance authorization, source-derived credit calculation, replay, balanced journal posting and statement balance.
  await setIdentity(customerTwoAuthId,"ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customers cannot access the finance return-credit queue",
    () => db.unsafe("select public.fetch_customer_return_credit_memo_queue(50)"),
    /finance permission required/i,
  );
  await db.unsafe("reset role");

  await setIdentity(managerAuthId,"ci-return-manager@example.test");
  await db.unsafe("set role authenticated");
  const creditQueueRaw = await db.unsafe("select public.fetch_customer_return_credit_memo_queue(50) as result");
  const creditQueue = asJson(creditQueueRaw[0].result);
  const creditRequest = creditQueue.requests.find((row) => row.request_id === firstRequest.request_id);
  assert.ok(creditRequest,"fully received return should appear in finance credit queue");
  assert.equal(creditRequest.invoice_id,sourceInvoiceId,"credit memo binds the original invoice");
  assert.equal(creditRequest.mapping_ready,true,"credit memo requires an unambiguous source invoice line");
  assert.ok(creditQueue.accounts.some((row) => row.id === receivableAccountId && row.account_type === "asset"));
  assert.ok(creditQueue.accounts.some((row) => row.id === revenueAccountId && row.account_type === "revenue"));

  const creditIdempotencyKey = randomUUID();
  const preparedCreditRaw = await db.unsafe(
    "select public.prepare_customer_return_credit_memo($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [firstRequest.request_id,receivableAccountId,revenueAccountId,null,creditIdempotencyKey],
  );
  const preparedCredit = asJson(preparedCreditRaw[0].result);
  assert.equal(preparedCredit.status,"draft","credit memo starts as a draft");
  assert.equal(preparedCredit.journal_status,"draft","linked ledger entry starts as a draft");
  assert.equal(Number(preparedCredit.subtotal_amount),125,"returned 1.25 of 5 invoice units credits 125.00 of a 500.00 line");
  assert.equal(Number(preparedCredit.tax_amount),0);
  assert.equal(Number(preparedCredit.total_amount),125);
  assert.equal(preparedCredit.replayed,false);

  const replayCreditRaw = await db.unsafe(
    "select public.prepare_customer_return_credit_memo($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [firstRequest.request_id,receivableAccountId,revenueAccountId,null,creditIdempotencyKey],
  );
  const replayCredit = asJson(replayCreditRaw[0].result);
  assert.equal(replayCredit.credit_memo_id,preparedCredit.credit_memo_id,"retry returns the original credit memo");
  assert.equal(replayCredit.journal_entry_id,preparedCredit.journal_entry_id,"retry returns the original journal");
  assert.equal(replayCredit.replayed,true,"credit memo retry is marked as replay");

  const postCreditRaw = await db.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result",
    [preparedCredit.journal_entry_id],
  );
  const postedCreditJournal = asJson(postCreditRaw[0].result);
  assert.equal(postedCreditJournal.status,"posted","source guard permits the balanced credit memo posting");
  await db.unsafe("reset role");

  const creditRows = await db.unsafe(
    "select m.status as memo_status,je.status as journal_status,m.subtotal_amount::text as subtotal," +
    "m.tax_amount::text as tax,m.total_amount::text as total,sp.source_amount::text as linked_amount " +
    "from public.customer_return_credit_memos m " +
    "join public.accounting_return_credit_memo_postings sp on sp.organization_id=m.organization_id and sp.credit_memo_id=m.id " +
    "join public.accounting_journal_entries je on je.organization_id=sp.organization_id and je.id=sp.journal_entry_id " +
    "where m.id=$1::uuid and m.organization_id=$2",
    [preparedCredit.credit_memo_id,organizationId],
  );
  assert.equal(creditRows.length,1);
  assert.equal(creditRows[0].memo_status,"posted");
  assert.equal(creditRows[0].journal_status,"posted");
  assert.equal(Number(creditRows[0].linked_amount),125);
  const journalTotals = await db.unsafe(
    "select coalesce(sum(debit),0)::numeric(15,2)::text as debit,coalesce(sum(credit),0)::numeric(15,2)::text as credit " +
    "from public.accounting_journal_lines where organization_id=$1 and journal_entry_id=$2::uuid",
    [organizationId,preparedCredit.journal_entry_id],
  );
  assert.equal(Number(journalTotals[0].debit),125);
  assert.equal(Number(journalTotals[0].credit),125,"the posted credit memo journal must balance exactly");

  await setIdentity(customerOneAuthId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const statementRaw = await db.unsafe("select public.get_customer_account_statement() as result");
  const customerStatement = asJson(statementRaw[0].result);
  const creditedInvoice = customerStatement.invoices.find((row) => row.id === sourceInvoiceId);
  assert.ok(creditedInvoice,"customer statement contains the source invoice");
  assert.equal(Number(creditedInvoice.credit_memo_amount),125,"customer statement includes posted credit memo");
  assert.equal(Number(creditedInvoice.outstanding_amount),375,"source invoice receivable is reduced by the posted credit");
  await db.unsafe("reset role");

  await setIdentity(customerTwoAuthId,"ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const secondRequestRaw = await db.unsafe(
    "select public.request_customer_return($1::uuid,$2::jsonb,$3::text,$4::text,$5::text) as result",
    [otherOrderId,db.json([{order_item_id:otherLineId,quantity:1}]),"quality","Quality concern","ci-return-second-customer-"+suffix],
  );
  const secondRequest = asJson(secondRequestRaw[0].result);
  await db.unsafe("reset role");

  await setIdentity(customerOneAuthId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const hiddenForeignRows = await db.unsafe(
    "select id from public.customer_return_requests where id=$1",
    [secondRequest.request_id],
  );
  assert.equal(hiddenForeignRows.length,0,"customer cannot read another customer's return request");
  await db.unsafe("reset role");

  await setIdentity(managerAuthId,"ci-return-manager@example.test");
  await db.unsafe("set role authenticated");
  const rejectedRaw = await db.unsafe(
    "select public.review_customer_return_request($1::uuid,'rejected',$2::text) as result",
    [secondRequest.request_id,"Rejected after detailed review"],
  );
  const rejected = asJson(rejectedRaw[0].result);
  assert.equal(rejected.status,"rejected");
  await db.unsafe("reset role");

  await setIdentity(accountantAuthId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "accountants without manager/admin role cannot list returns for review",
    () => db.unsafe("select public.list_customer_return_review_queue(50)"),
    /administrator or manager permission required/i,
  );
  await expectFailure(
    "accountants without manager/admin role cannot decide customer returns",
    () => db.unsafe(
      "select public.review_customer_return_request($1::uuid,'approved',$2::text)",
      [secondRequest.request_id,"Attempted unauthorized decision"],
    ),
    /administrator or manager permission required/i,
  );
  await db.unsafe("reset role");

  const forbiddenStockMutation = await db.unsafe(
    "select count(*)::int as count from public.inventory_movements where reference_type='customer_return_request' and reference_id in ($1::uuid,$2::uuid)",
    [firstRequest.request_id,secondRequest.request_id],
  );
  assert.equal(forbiddenStockMutation[0].count,0,"request/approval records no stock movement before receipt");
  process.stdout.write("PASS customer returns: tenant ownership, delivered-order gate, line quantities, idempotent replay/conflict, direct-write denial, customer privacy, manager decisions/audit, warehouse inspection task, accountant denial, and no automatic stock movement.\n");
}

try {
  await main();
} catch (cause) {
  const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
  process.stderr.write("CUSTOMER_RETURN_ACCEPTANCE_FAILED " + JSON.stringify({
    name:error.name,message:error.message,code:error.code,detail:error.detail,hint:error.hint,where:error.where,table:error.table,constraint:error.constraint,stack:error.stack,
  }) + "\n");
  throw cause;
} finally {
  await db.end({ timeout: 5 });
}
