import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for customer return database acceptance.");
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(authUserId, email) {
  await db.unsafe("reset role").catch(() => {});
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI customer return session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [authUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated", session_id: authUserId }),
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
  const otherOrganizationId = "a1111111-1111-4111-8111-111111111111";
  const suffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8);
  // The return acceptance suite must not depend on profile fixtures from an earlier script.
  const foreignCustomerProfileId = randomUUID();
  const foreignCustomerAuthId = randomUUID();
  const foreignCustomerEmail = "ci-foreign-finance-print-" + suffix + "@example.test";
  const customerOneProfileId = "f1111111-1111-4111-8111-111111111111";
  const customerOneAuthId = "11111111-1111-4111-8111-111111111111";
  const customerTwoProfileId = "f2222222-2222-4222-8222-222222222222";
  const customerTwoAuthId = "22222222-2222-4222-8222-222222222222";
  const managerProfileId = "f7777777-7777-4777-8777-777777777777";
  const managerAuthId = "77777777-7777-4777-8777-777777777777";
  const accountantProfileId = "f5555555-5555-4555-8555-555555555555";
  const accountantAuthId = "55555555-5555-4555-8555-555555555555";
  const productId = "a1000000-0000-0000-0000-000000000001";

  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Return Manager','ci-return-manager@example.test',true) on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,is_active=true",
    [managerProfileId,managerAuthId,organizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'manager') on conflict(profile_id,role) do nothing",
    [managerProfileId],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Return Accountant','ci-accountant@example.test',true) on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,is_active=true",
    [accountantProfileId,accountantAuthId,organizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'accountant') on conflict(profile_id,role) do nothing",
    [accountantProfileId],
  );
  // Seed the foreign-tenant print fixture explicitly; do not rely on another acceptance script's rows.
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,pg_catalog.now()) on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [foreignCustomerAuthId, foreignCustomerEmail],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Foreign Finance Print',$4,true) on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,full_name=excluded.full_name,email=excluded.email,is_active=true",
    [foreignCustomerProfileId, foreignCustomerAuthId, otherOrganizationId, foreignCustomerEmail],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'customer') on conflict(profile_id,role) do nothing",
    [foreignCustomerProfileId],
  );

  const customerRows = await db.unsafe(
    "select id,profile_id from public.customers where organization_id=$1 and profile_id in ($2::uuid,$3::uuid) and status='approved' order by created_at,id",
    [organizationId,customerOneProfileId,customerTwoProfileId],
  );
  const customerOne = customerRows.find((row) => row.profile_id === customerOneProfileId);
  const customerTwo = customerRows.find((row) => row.profile_id === customerTwoProfileId);
  assert.ok(customerOne, "first approved customer fixture must exist from migration acceptance");
  assert.ok(customerTwo, "second approved customer fixture must exist from migration acceptance");

  const foreignProductRows = await db.unsafe(
    "select id from public.products where organization_id=$1 order by id limit 1",
    [otherOrganizationId],
  );
  assert.equal(foreignProductRows.length, 1, "foreign-organization product fixture must exist from migration acceptance");
  const foreignProductId = foreignProductRows[0].id;
  const foreignCustomerRows = await db.unsafe(
    "insert into public.customers(organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at) " +
    "values($1,$2,'CI-FINANCE-PRINT-FOREIGN','Foreign print fixture','Foreign contact','7779999999',$3,'retail',0,0,'approved',pg_catalog.now()) " +
    "on conflict(organization_id,customer_code) do update set profile_id=excluded.profile_id,status='approved',approved_at=pg_catalog.now() returning id",
    [otherOrganizationId, foreignCustomerProfileId, foreignCustomerEmail],
  );
  assert.equal(foreignCustomerRows.length, 1, "foreign-organization customer print fixture must exist");
  const foreignCustomerId = foreignCustomerRows[0].id;
  const foreignOrderRows = await db.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) " +
    "values($1,$2,$3,'delivered',100,1,'CI foreign finance print',$4) returning id",
    [otherOrganizationId,foreignCustomerId,"CI-FIN-PRINT-"+suffix,foreignCustomerProfileId],
  );
  const foreignOrderItemRows = await db.unsafe(
    "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity,unit_price_snapshot,discount_snapshot,line_total) " +
    "values($1,$2,'CI-FIN-FOREIGN-01','Foreign print item','piece',1,1,1,100,0,100) returning id",
    [foreignOrderRows[0].id,foreignProductId],
  );
  const foreignInvoiceRows = await db.unsafe(
    "insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,subtotal,tax_amount,total_amount) " +
    "values($1,$2,$3,$4,'issued',pg_catalog.now(),'YER',100,0,100) returning id",
    [otherOrganizationId,foreignCustomerId,foreignOrderRows[0].id,"INV-CI-FIN-FOREIGN-"+suffix],
  );
  const foreignInvoiceId = foreignInvoiceRows[0].id;
  await db.unsafe(
    "insert into public.customer_invoice_items(organization_id,invoice_id,order_item_id,product_id,item_code,description,unit,quantity,unit_price," +
    "discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total) " +
    "select $1,$2,oi.id,oi.product_id,oi.item_code,oi.product_name_snapshot,oi.unit_snapshot,oi.quantity,oi.unit_price_snapshot," +
    "oi.discount_snapshot,oi.promotion_discount_per_unit_snapshot,oi.promotion_id_snapshot,oi.promotion_title_snapshot," +
    "oi.promotion_discount_type_snapshot,oi.promotion_discount_value_snapshot,oi.line_total from public.order_items oi where oi.id=$3::uuid",
    [otherOrganizationId,foreignInvoiceId,foreignOrderItemRows[0].id],
  );

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

  // Second own-organization invoice proves that offset pagination returns a real next row,
  // without changing the customerOne ledger used for the return-credit balance assertions.
  const secondaryInvoiceRows = await db.unsafe(
    "insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,subtotal,tax_amount,total_amount) " +
    "values($1,$2,$3,$4,'issued',pg_catalog.now(),'YER',400,0,400) returning id",
    [organizationId,customerTwo.id,otherOrderId,"INV-CI-RET-SECOND-"+suffix],
  );
  const secondaryInvoiceId = secondaryInvoiceRows[0].id;
  await db.unsafe(
    "insert into public.customer_invoice_items(organization_id,invoice_id,order_item_id,product_id,item_code,description,unit,quantity,unit_price," +
    "discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total) " +
    "select $1,$2,oi.id,oi.product_id,oi.item_code,oi.product_name_snapshot,oi.unit_snapshot,oi.quantity,oi.unit_price_snapshot," +
    "oi.discount_snapshot,oi.promotion_discount_per_unit_snapshot,oi.promotion_id_snapshot,oi.promotion_title_snapshot," +
    "oi.promotion_discount_type_snapshot,oi.promotion_discount_value_snapshot,oi.line_total from public.order_items oi where oi.id=$3::uuid",
    [organizationId,secondaryInvoiceId,otherLineId],
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

  await expectFailure(
    "same receipt idempotency key cannot be reused with changed payload",
    () => db.unsafe(
      "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text)",
      [firstRequest.request_id,receiptWarehouseId,db.json(firstReceiptLines),"changed notes under the same receipt key","ci-return-receipt-one-"+suffix],
    ),
    /customer return receipt idempotency key payload conflict/i,
  );

  // Race two independent authenticated PostgreSQL sessions with the same key/payload.
  // The database idempotency lock must let one call create the receipt and force the other to replay it.
  const secondReceiptLines = [{request_item_id:requestItemId,received_quantity:0.50,restockable_quantity:0.25}];
  const secondReceiptKey = "ci-return-receipt-two-"+suffix;
  const concurrentDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let secondReceiptA;
  let secondReceiptB;
  try {
    await concurrentDb.unsafe("reset role").catch(() => {});
    await concurrentDb.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI return race session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [managerAuthId]);
    await concurrentDb.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [managerAuthId]);
    await concurrentDb.unsafe("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        sub: managerAuthId,
        email: "ci-return-manager@example.test",
        email_confirmed_at: new Date().toISOString(),
        role: "authenticated",
        session_id: managerAuthId,
      }),
    ]);
    await concurrentDb.unsafe("set role authenticated");
    const [secondReceiptRawA, secondReceiptRawB] = await Promise.all([
      db.unsafe(
        "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
        [firstRequest.request_id,receiptWarehouseId,db.json(secondReceiptLines),"final physical inspection",secondReceiptKey],
      ),
      concurrentDb.unsafe(
        "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
        [firstRequest.request_id,receiptWarehouseId,concurrentDb.json(secondReceiptLines),"final physical inspection",secondReceiptKey],
      ),
    ]);
    secondReceiptA = asJson(secondReceiptRawA[0].result);
    secondReceiptB = asJson(secondReceiptRawB[0].result);
  } finally {
    await concurrentDb.end({ timeout: 5 });
  }
  assert.equal(
    secondReceiptA.receipt_id,
    secondReceiptB.receipt_id,
    "concurrent identical receipt requests must converge on one persisted receipt",
  );
  assert.notEqual(
    secondReceiptA.idempotent_replay,
    secondReceiptB.idempotent_replay,
    "exactly one concurrent call creates the receipt and the other is an idempotent replay",
  );
  const secondReceipt = secondReceiptA.idempotent_replay ? secondReceiptB : secondReceiptA;
  const concurrentReceiptReplay = secondReceiptA.idempotent_replay ? secondReceiptA : secondReceiptB;
  assert.equal(concurrentReceiptReplay.idempotent_replay,true);
  assert.equal(secondReceipt.idempotent_replay,false);
  assert.equal(secondReceipt.request_status,"received","request closes only after all approved quantity is received");
  assert.equal(Number(secondReceipt.received_quantity),0.50);
  assert.equal(Number(secondReceipt.restockable_quantity),0.25);
  assert.equal(Number(secondReceipt.defective_quantity),0.25);

  await expectFailure(
    "a fully received return cannot be received again with a fresh idempotency key",
    () => db.unsafe(
      "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text)",
      [firstRequest.request_id,receiptWarehouseId,db.json([{request_item_id:requestItemId,received_quantity:0.1,restockable_quantity:0.1}]),"post-close duplicate receipt attempt","ci-return-receipt-after-close-"+suffix],
    ),
    /only an approved return request in the current organization can be received/i,
  );

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

  const receiptIds = [firstReceipt.receipt_id, secondReceipt.receipt_id];
  const receiptHeaders = await db.unsafe(
    "select h.id::text as id,h.organization_id::text as organization_id," +
    "h.return_request_id::text as return_request_id,h.receipt_number," +
    "h.warehouse_id::text as warehouse_id,p.auth_user_id::text as received_by_auth_user_id " +
    "from public.customer_return_receipts h join public.profiles p on p.id=h.received_by " +
    "where h.organization_id=$1::uuid and h.id=any($2::uuid[]) order by h.id",
    [organizationId,receiptIds],
  );
  assert.equal(receiptHeaders.length,2,"a replay must not persist a duplicate receipt header");
  assert.equal(new Set(receiptHeaders.map((row) => row.receipt_number)).size,2,"each accepted physical receipt has its own document number");
  for (const row of receiptHeaders) {
    assert.ok(receiptIds.includes(row.id));
    assert.equal(row.organization_id,organizationId,"receipt retains the source organization");
    assert.equal(row.return_request_id,firstRequest.request_id,"receipt retains the approved return reference");
    assert.equal(row.received_by_auth_user_id,managerAuthId,"receipt issuer resolves to the authenticated manager");
    assert.equal(row.warehouse_id,receiptWarehouseId,"receipt stays bound to the inspected warehouse");
    assert.match(row.receipt_number,/^RETREC-/,"receipt has a persistent document number");
  }
  const receiptAuditRows = await db.unsafe(
    "select a.organization_id::text as organization_id,a.entity_type,a.entity_id::text as entity_id,a.action," +
    "a.new_value->>'receipt_number' as receipt_number,a.new_value->>'request_number' as request_number," +
    "a.new_value->>'warehouse_id' as warehouse_id,p.auth_user_id::text as actor_auth_user_id " +
    "from public.audit_logs a left join public.profiles p on p.id=a.actor_id " +
    "where a.organization_id=$1::uuid and a.action='customer_return.received' and a.entity_id=any($2::uuid[]) order by a.entity_id",
    [organizationId,receiptIds],
  );
  assert.equal(receiptAuditRows.length,2,"idempotent retry must not duplicate receipt audit events");
  assert.deepEqual(
    receiptAuditRows.map((row) => row.entity_id).sort(),
    receiptIds.slice().sort(),
    "each receipt audit event references its persisted receipt document",
  );
  for (const row of receiptAuditRows) {
    const header = receiptHeaders.find((candidate) => candidate.id === row.entity_id);
    assert.equal(row.organization_id,organizationId,"receipt audit stays in the same organization");
    assert.equal(row.actor_auth_user_id,managerAuthId,"receipt audit records the actual issuing user");
    assert.equal(row.entity_type,"customer_return_receipt");
    assert.equal(row.request_number,firstRequest.request_number);
    assert.equal(row.warehouse_id,receiptWarehouseId);
    assert.equal(row.receipt_number,header?.receipt_number,"audit receipt number matches persisted document");
  }
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
    "ordinary customers cannot execute the administrative physical-receipt RPC",
    () => db.unsafe(
      "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text)",
      [firstRequest.request_id,receiptWarehouseId,db.json([{request_item_id:requestItemId,received_quantity:0.1,restockable_quantity:0.1}]),"customer attempted physical receipt","ci-return-customer-receipt-denial-"+suffix],
    ),
    /administrator or manager permission required to receive customer returns/i,
  );
  await expectFailure(
    "customers cannot access the finance return-credit queue",
    () => db.unsafe("select public.fetch_customer_return_credit_memo_queue(50)"),
    /finance permission required/i,
  );
  await expectFailure(
    "customers cannot enumerate staff financial print sources",
    () => db.unsafe("select public.get_finance_document_print_options(500)"),
    /finance permission required/i,
  );
  await expectFailure(
    "customers cannot print staff-scoped invoices",
    () => db.unsafe("select public.get_staff_customer_invoice_print_data($1::uuid)",[sourceInvoiceId]),
    /finance permission required/i,
  );
  await expectFailure(
    "customers cannot print staff-scoped account statements",
    () => db.unsafe("select public.get_staff_customer_account_statement($1::uuid)",[customerOne.id]),
    /finance permission required/i,
  );
  await expectFailure(
    "customers cannot print a complete staff-scoped account statement",
    () => db.unsafe("select public.get_staff_customer_account_statement_full($1::uuid)",[customerOne.id]),
    /finance permission required to print a customer account statement/i,
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

  const draftPostingTasks = await db.unsafe(
    "select task_role,status,source_entity_type,source_entity_id,task_payload,completed_at " +
    "from public.ai_tasks where organization_id=$1::uuid and source_event_key=$2",
    [organizationId,"return-credit-memo-posting:"+preparedCredit.credit_memo_id],
  );
  assert.equal(draftPostingTasks.length,1,"source-linked credit memo draft creates exactly one accountant task");
  assert.equal(draftPostingTasks[0].task_role,"accountant");
  assert.equal(draftPostingTasks[0].status,"pending","credit-memo posting task stays open while journal is a draft");
  assert.equal(draftPostingTasks[0].source_entity_type,"customer_return_credit_memos");
  assert.equal(draftPostingTasks[0].source_entity_id,preparedCredit.credit_memo_id);
  const draftPostingPayload = typeof draftPostingTasks[0].task_payload==="string"
    ? JSON.parse(draftPostingTasks[0].task_payload) : draftPostingTasks[0].task_payload;
  assert.equal(draftPostingPayload.journal_entry_id,preparedCredit.journal_entry_id);
  assert.equal(Number(draftPostingPayload.source_amount),125);
  assert.equal(draftPostingPayload.source_currency,"YER");

  await db.unsafe("select public.refresh_operational_tasks() as result");
  const refreshedDraftTasks = await db.unsafe(
    "select count(*)::integer as count,min(status) as status from public.ai_tasks " +
    "where organization_id=$1::uuid and source_event_key=$2",
    [organizationId,"return-credit-memo-posting:"+preparedCredit.credit_memo_id],
  );
  assert.equal(refreshedDraftTasks[0].count,1,"refresh must not duplicate the source-linked credit memo task");
  assert.equal(refreshedDraftTasks[0].status,"pending","refresh must preserve the real open accounting action");

  const draftPrintRows = await db.unsafe(
    "select public.get_customer_return_credit_memo_pdf($1::uuid) as result",[preparedCredit.credit_memo_id],
  );
  const draftPrint = asJson(draftPrintRows[0].result);
  assert.equal(draftPrint.memo.status,"draft");
  assert.equal(draftPrint.invoice.invoice_number,"INV-CI-RET-"+suffix);
  assert.equal(draftPrint.lines.length,1);
  assert.equal(draftPrint.lines[0].item_code,"000125");

  const replayCreditRaw = await db.unsafe(
    "select public.prepare_customer_return_credit_memo($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [firstRequest.request_id,receivableAccountId,revenueAccountId,null,creditIdempotencyKey],
  );
  const replayCredit = asJson(replayCreditRaw[0].result);
  assert.equal(replayCredit.credit_memo_id,preparedCredit.credit_memo_id,"retry returns the original credit memo");
  assert.equal(replayCredit.journal_entry_id,preparedCredit.journal_entry_id,"retry returns the original journal");
  assert.equal(replayCredit.replayed,true,"credit memo retry is marked as replay");

  await db.unsafe("reset role");
  await setIdentity(customerTwoAuthId,"ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("non-finance user cannot retrieve a credit memo print source",
    () => db.unsafe("select public.get_customer_return_credit_memo_pdf($1::uuid)",[preparedCredit.credit_memo_id]),
    /finance permission required/i);
  await expectFailure("non-finance user cannot list paginated finance print sources",
    () => db.unsafe("select public.get_finance_document_print_options($1::integer,$2::integer)",[500,1]),
    /finance permission required to list printable customer documents/i);
  await db.unsafe("reset role");
  await setIdentity(managerAuthId,"ci-return-manager@example.test");
  await db.unsafe("set role authenticated");

  const beforeStatementRaw = await db.unsafe(
    "select public.get_staff_customer_account_statement($1::uuid) as result",[customerOne.id],
  );
  const beforeStatement = asJson(beforeStatementRaw[0].result);
  const beforeYER = beforeStatement.summary.find((row) => row.currency === "YER");
  assert.ok(beforeYER,"YER customer ledger baseline exists before credit posting");

  // Acceptance: payment and source-credit posting serialize on the same invoice settlement lock.
  // Both operations fit inside the 500.00 invoice balance; neither may observe an incomplete ledger state.
  const settlementRacer = postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  let settlementResults;
  try {
    await settlementRacer.unsafe("reset role").catch(()=>{});
    await settlementRacer.unsafe(
      "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI invoice settlement race session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
      [managerAuthId],
    );
    await settlementRacer.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[managerAuthId]);
    await settlementRacer.unsafe("select set_config('request.jwt.claims',$1,false)",[
      JSON.stringify({sub:managerAuthId,email:"ci-return-manager@example.test",email_confirmed_at:new Date().toISOString(),role:"authenticated",session_id:managerAuthId}),
    ]);
    await settlementRacer.unsafe("set role authenticated");
    settlementResults = await Promise.all([
      db.unsafe(
        "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text) as id",
        [sourceInvoiceId,100,"cash",randomUUID(),"CI-RET-CONCURRENT-PAY-001","payment concurrent with source-credit posting"],
      ),
      settlementRacer.unsafe(
        "select public.post_general_journal_entry($1::uuid) as result",
        [preparedCredit.journal_entry_id],
      ),
    ]);
  } finally {
    await settlementRacer.end({timeout:5}).catch(()=>{});
  }
  const concurrentPaymentId = settlementResults[0][0].id;
  assert.ok(concurrentPaymentId,"concurrent payment request commits one payment ID");
  const postedCreditJournal = asJson(settlementResults[1][0].result);
  assert.equal(postedCreditJournal.status,"posted","source guard permits the balanced credit memo posting");

  const settlementRows = await db.unsafe(
    "select i.total_amount::text as invoice_total,coalesce(sum(cp.amount),0)::text as paid, " +
    "(select coalesce(sum(cm.total_amount),0) from public.customer_return_credit_memos cm " +
    " where cm.organization_id=i.organization_id and cm.invoice_id=i.id and cm.customer_id=i.customer_id and cm.status='posted')::text as credited " +
    "from public.customer_invoices i left join public.customer_payments cp " +
    " on cp.organization_id=i.organization_id and cp.invoice_id=i.id and cp.customer_id=i.customer_id " +
    "where i.organization_id=$1::uuid and i.id=$2::uuid group by i.organization_id,i.id,i.customer_id",
    [organizationId,sourceInvoiceId],
  );
  assert.equal(settlementRows.length,1);
  assert.equal(Number(settlementRows[0].invoice_total),500);
  assert.equal(Number(settlementRows[0].paid),100,"the first concurrent payment commits exactly once");
  assert.equal(Number(settlementRows[0].credited),125,"the posted credit is visible before the next payment race");
  // Two distinct payments racing for the remaining balance must not both win.
  // After the earlier payment (100) and credit memo (125), only 275 remains on this 500 invoice.
  const balanceRaceRacer = postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  let balanceRaceResults;
  try {
    await balanceRaceRacer.unsafe("reset role").catch(()=>{});
    await balanceRaceRacer.unsafe(
      "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI invoice balance race session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
      [managerAuthId],
    );
    await balanceRaceRacer.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[managerAuthId]);
    await balanceRaceRacer.unsafe("select set_config('request.jwt.claims',$1,false)",[
      JSON.stringify({sub:managerAuthId,email:"ci-return-manager@example.test",email_confirmed_at:new Date().toISOString(),role:"authenticated",session_id:managerAuthId}),
    ]);
    await balanceRaceRacer.unsafe("set role authenticated");
    balanceRaceResults = await Promise.allSettled([
      db.unsafe(
        "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text) as id",
        [sourceInvoiceId,200,"cash",randomUUID(),"CI-RET-BALANCE-RACE-A","competing payment A"],
      ),
      balanceRaceRacer.unsafe(
        "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text) as id",
        [sourceInvoiceId,200,"cash",randomUUID(),"CI-RET-BALANCE-RACE-B","competing payment B"],
      ),
    ]);
  } finally {
    await balanceRaceRacer.end({timeout:5}).catch(()=>{});
  }
  const balanceRaceWinners = balanceRaceResults.filter(result=>result.status==="fulfilled");
  const balanceRaceLosers = balanceRaceResults.filter(result=>result.status==="rejected");
  assert.equal(balanceRaceWinners.length,1,"exactly one concurrent payment may consume the remaining invoice balance");
  assert.equal(balanceRaceLosers.length,1,"the overpayment competitor must be rejected after the settlement lock");
  assert.match(String(balanceRaceLosers[0].reason?.message),/payment exceeds invoice balance after posted credit memos/i);
  const balanceRacePaymentId = balanceRaceWinners[0].value[0].id;
  assert.ok(balanceRacePaymentId,"the successful competing payment returns its persisted payment ID");

  await db.unsafe("reset role");
  const paymentAuditCount = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='customer_payment.recorded' and entity_id in ($2::uuid,$3::uuid)",
    [organizationId,concurrentPaymentId,balanceRacePaymentId],
  );
  assert.equal(paymentAuditCount[0].count,2,"only the two committed payment sources emit audit rows");
  await db.unsafe("set role authenticated");
  const reconciledSettlementRows = await db.unsafe(
    "select coalesce(sum(cp.amount),0)::text as paid,"+
    "(select coalesce(sum(cm.total_amount),0) from public.customer_return_credit_memos cm " +
    " where cm.organization_id=i.organization_id and cm.invoice_id=i.id and cm.customer_id=i.customer_id and cm.status='posted')::text as credited " +
    "from public.customer_invoices i left join public.customer_payments cp " +
    " on cp.organization_id=i.organization_id and cp.invoice_id=i.id and cp.customer_id=i.customer_id " +
    "where i.organization_id=$1::uuid and i.id=$2::uuid group by i.organization_id,i.id,i.customer_id",
    [organizationId,sourceInvoiceId],
  );
  assert.equal(Number(reconciledSettlementRows[0].paid),300,"the accepted payments total 300.00");
  assert.equal(Number(reconciledSettlementRows[0].credited),125,"the posted credit remains source-linked at 125.00");
  assert.ok(Number(reconciledSettlementRows[0].paid)+Number(reconciledSettlementRows[0].credited)<=500,
    "competing payments and credit postings never exceed the invoice total");
  await db.unsafe("reset role");
  const paymentAuditRows = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
    "where organization_id=$1::uuid and action='customer_payment.recorded' and entity_id=$2::uuid",
    [organizationId,concurrentPaymentId],
  );
  assert.equal(paymentAuditRows[0].count,1,"concurrent payment creates one source-linked audit event");
  await db.unsafe("set role authenticated");

  const postedPostingTasks = await db.unsafe(
    "select task_role,status,completed_at,resolution_note from public.ai_tasks " +
    "where organization_id=$1::uuid and source_event_key=$2",
    [organizationId,"return-credit-memo-posting:"+preparedCredit.credit_memo_id],
  );
  assert.equal(postedPostingTasks.length,1,"posting must retain one auditable accountant task");
  assert.equal(postedPostingTasks[0].task_role,"accountant");
  assert.equal(postedPostingTasks[0].status,"completed","successful journal posting closes its corresponding task");
  assert.ok(postedPostingTasks[0].completed_at,"task completion records a timestamp");
  assert.match(postedPostingTasks[0].resolution_note??"",/ترحيل|posted/i,"task resolution records the source-ledger outcome");
  await db.unsafe("select public.refresh_operational_tasks() as result");
  const refreshedPostedTasks = await db.unsafe(
    "select count(*)::integer as count,min(status) as status from public.ai_tasks " +
    "where organization_id=$1::uuid and source_event_key=$2",
    [organizationId,"return-credit-memo-posting:"+preparedCredit.credit_memo_id],
  );
  assert.equal(refreshedPostedTasks[0].count,1,"refresh cannot duplicate completed credit-memo tasks");
  assert.equal(refreshedPostedTasks[0].status,"completed","refresh must not reopen a posted source-ledger task");

  const postedPrintRows = await db.unsafe(
    "select public.get_customer_return_credit_memo_pdf($1::uuid) as result",[preparedCredit.credit_memo_id],
  );
  const postedPrint = asJson(postedPrintRows[0].result);
  assert.equal(postedPrint.memo.status,"posted");
  assert.equal(postedPrint.journal.status,"posted");

  const fullStatementRaw = await db.unsafe(
    "select public.get_staff_customer_account_statement_full($1::uuid) as result",[customerOne.id],
  );
  const fullStatement = asJson(fullStatementRaw[0].result);
  assert.equal(fullStatement.customer.id,customerOne.id,"full statement is tied to the requested customer");
  assert.ok(fullStatement.invoices.some((row) => row.id === sourceInvoiceId),"full statement includes the source invoice");
  assert.ok(fullStatement.credits.some((row) => row.id === preparedCredit.credit_memo_id),"full statement includes the posted return credit");
  assert.deepEqual(fullStatement.truncated,{ invoices:false,payments:false,credits:false },
    "full endpoint never labels partial detail as a complete statement");
  assert.equal(fullStatement.record_counts.invoices,fullStatement.invoices.length,"statement invoice count matches returned details");
  assert.equal(fullStatement.record_counts.payments,fullStatement.payments.length,"statement payment count matches returned details");
  assert.equal(fullStatement.record_counts.credits,fullStatement.credits.length,"statement credit count matches returned details");
  assert.ok(fullStatement.record_counts.total <= 10000,"statement is within the safe print limit");

  const printOptionsRaw = await db.unsafe("select public.get_finance_document_print_options(500) as result");
  const printOptions = asJson(printOptionsRaw[0].result);
  assert.ok(printOptions.customers.some((row) => row.id === customerOne.id),"finance print options include an own-organization customer");
  assert.ok(printOptions.invoices.some((row) => row.id === sourceInvoiceId),"finance print options include the source invoice");
  assert.ok(printOptions.credit_memos.some((row) => row.id === preparedCredit.credit_memo_id),"finance print options include the posted credit memo");
  assert.ok(!printOptions.customers.some((row) => row.id === foreignCustomerId),"finance print options exclude foreign-organization customers");
  assert.ok(!printOptions.invoices.some((row) => row.id === foreignInvoiceId),"finance print options exclude foreign-organization invoices");

  const printOptionsOffsetRaw = await db.unsafe(
    "select public.get_finance_document_print_options($1::integer,$2::integer) as result",[500,1],
  );
  const printOptionsOffset = asJson(printOptionsOffsetRaw[0].result);
  assert.ok(printOptions.customers.length >= 2,"pagination fixture has at least two same-organization customer rows");
  assert.equal(printOptionsOffset.customers[0]?.id,printOptions.customers[1]?.id,
    "customer page offset one starts at the second server-ordered customer");
  assert.ok(printOptions.invoices.length >= 2,"pagination fixture has at least two same-organization invoices");
  assert.equal(printOptionsOffset.invoices[0]?.id,printOptions.invoices[1]?.id,
    "invoice page offset one starts at the second server-ordered invoice");
  assert.ok(!printOptionsOffset.customers.some((row) => row.id === foreignCustomerId),
    "offset pagination remains scoped to the active organization");
  await expectFailure("finance print pagination rejects a negative offset",
    () => db.unsafe("select public.get_finance_document_print_options($1::integer,$2::integer)",[500,-1]),
    /finance print option offset must be between 0 and 10000000/i);

  const staffInvoiceRaw = await db.unsafe(
    "select public.get_staff_customer_invoice_print_data($1::uuid) as result",[sourceInvoiceId],
  );
  const staffInvoice = asJson(staffInvoiceRaw[0].result);
  assert.equal(staffInvoice.invoice.id,sourceInvoiceId);
  assert.equal(staffInvoice.customer.id,customerOne.id);
  assert.equal(staffInvoice.lines[0].item_code,"000125","invoice print keeps leading-zero item codes");
  assert.equal(Number(staffInvoice.invoice.total_amount),500,"invoice print reconciles the immutable financial source");
  await expectFailure("staff cannot print an invoice from another organization",
    () => db.unsafe("select public.get_staff_customer_invoice_print_data($1::uuid)",[foreignInvoiceId]),
    /invoice was not found in the active organization/i);
  await expectFailure("staff cannot print a statement from another organization",
    () => db.unsafe("select public.get_staff_customer_account_statement($1::uuid)",[foreignCustomerId]),
    /customer was not found in the active organization/i);

  const staffStatementRaw = await db.unsafe(
    "select public.get_staff_customer_account_statement($1::uuid) as result",[customerOne.id],
  );
  const staffStatement = asJson(staffStatementRaw[0].result);
  assert.equal(staffStatement.customer.id,customerOne.id);
  assert.ok(staffStatement.credits.some((row) => row.id === preparedCredit.credit_memo_id),"staff statement includes posted source credit memos");
  const staffYER = staffStatement.summary.find((row) => row.currency === "YER");
  assert.ok(staffYER,"staff statement summarizes YER receivables");
  const postedSourceCredit = staffStatement.credits.find((row) => row.id === preparedCredit.credit_memo_id);
  assert.ok(postedSourceCredit,"staff statement includes the posted source credit memo");
  assert.equal(postedSourceCredit.invoice_id,sourceInvoiceId,"credit memo remains bound to its source invoice");
  assert.equal(Number(postedSourceCredit.total_amount),125,"printed source credit amount matches the authorized memo");
  assert.equal(Number(staffYER.credited) - Number(beforeYER.credited),125,
    "posting the source credit increases the full-ledger credited total by exactly the source amount");
  assert.equal(Number(beforeYER.outstanding) - Number(staffYER.outstanding),425,
    "concurrent payment plus source credit reduce the full-ledger outstanding total by their combined source amounts");

  await db.unsafe("reset role");
  await setIdentity(accountantAuthId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const accountantOptionsRaw = await db.unsafe("select public.get_finance_document_print_options(500) as result");
  const accountantOptions = asJson(accountantOptionsRaw[0].result);
  assert.ok(accountantOptions.invoices.some((row) => row.id === sourceInvoiceId),
    "an active accountant role on the current profile can use staff financial print options");
  const accountantStatementRaw = await db.unsafe(
    "select public.get_staff_customer_account_statement($1::uuid) as result",[customerOne.id],
  );
  const accountantStatement = asJson(accountantStatementRaw[0].result);
  const accountantYER = accountantStatement.summary.find((row) => row.currency === "YER");
  assert.ok(accountantYER,"accountant can print own-organization statement totals");
  assert.equal(Number(accountantYER.outstanding),Number(staffYER.outstanding),
    "accountant read access returns the same authorized full-ledger total");
  assert.equal(Number(accountantYER.credited),Number(staffYER.credited),
    "accountant read access retains posted-credit balance accuracy");
  await expectFailure("accountant cannot print another organization's statement",
    () => db.unsafe("select public.get_staff_customer_account_statement($1::uuid)",[foreignCustomerId]),
    /customer was not found in the active organization/i);
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
  assert.ok(
    customerStatement.credits.some((row) => row.id === preparedCredit.credit_memo_id),
    "customer statement must list the newly posted credit memo even when its invoice is outside the 200-invoice display window",
  );
  const statementYER = customerStatement.summary.find((row) => row.currency === "YER");
  assert.ok(statementYER,"customer statement summarizes YER receivables");
  assert.ok(Number(statementYER.credited) >= 125,"customer statement summary includes the posted credit amount");
  await db.unsafe("reset role");

  await setIdentity(managerAuthId,"ci-return-manager@example.test");
  await db.unsafe("set role authenticated");
  const agingRaw = await db.unsafe("select public.fetch_staff_receivables_aging(500,0) as result");
  const aging = asJson(agingRaw[0].result);
  const agedSourceInvoice = aging.items.find((row) => row.id === sourceInvoiceId);
  assert.ok(agedSourceInvoice,"staff aging page includes the source invoice at limit 500");
  assert.equal(Number(agedSourceInvoice.credit_memo_amount),125,"staff aging applies the posted source credit");
  assert.equal(Number(agedSourceInvoice.outstanding_amount),75,"receivable aging reflects 300.00 payments and the posted 125.00 credit on the 500.00 invoice");
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

  // Acceptance: reverse a posted source credit once, with audit, balanced mirror lines, restored receivables and no stock/cash side effects.
  await db.unsafe("reset role");
  const balanceBeforeRow=(await db.unsafe(
    "select current_balance::text as balance from public.customers where organization_id=$1::uuid and id=$2::uuid",
    [organizationId,customerOne.id],
  ))[0];
  assert.ok(balanceBeforeRow);
  const balanceBefore=Number(balanceBeforeRow.balance);
  const stockBefore=(await db.unsafe(
    "select count(*)::integer as count from public.inventory_movements where reference_type='customer_return_request' and reference_id=$1::uuid",
    [firstRequest.request_id],
  ))[0].count;

  await setIdentity(customerOneAuthId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("customer cannot reverse a finance credit memo",
    () => db.unsafe("select public.reverse_customer_return_credit_memo($1::uuid,$2::text,$3::uuid)",
      [preparedCredit.credit_memo_id,"Customer attempts reversal",randomUUID()]),
    /finance permission required to reverse/i);
  await db.unsafe("reset role");
  await setIdentity(managerAuthId,"ci-return-manager@example.test");
  await db.unsafe("set role authenticated");
  const reason="Approved correction of the source-linked return credit.";
  const key=randomUUID();
  const racer=postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  let results;
  try {
    await racer.unsafe("reset role").catch(() => {});
    await racer.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI return reversal race session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [managerAuthId]);
    await racer.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[managerAuthId]);
    await racer.unsafe("select set_config('request.jwt.claims',$1,false)",[
      JSON.stringify({sub:managerAuthId,email:"ci-return-manager@example.test",email_confirmed_at:new Date().toISOString(),role:"authenticated",session_id:managerAuthId}),
    ]);
    await racer.unsafe("set role authenticated");
    results=await Promise.all([
      db.unsafe("select public.reverse_customer_return_credit_memo($1::uuid,$2::text,$3::uuid) as result",[preparedCredit.credit_memo_id,reason,key]),
      racer.unsafe("select public.reverse_customer_return_credit_memo($1::uuid,$2::text,$3::uuid) as result",[preparedCredit.credit_memo_id,reason,key]),
    ]);
  } finally { await racer.end({timeout:5}).catch(()=>{}); }
  const r1=asJson(results[0][0].result), r2=asJson(results[1][0].result);
  assert.equal(r1.status,"reversed");
  assert.equal(r1.reversal_status,"posted");
  assert.equal(r1.reversal_journal_entry_id,r2.reversal_journal_entry_id);
  assert.equal([r1,r2].filter(x=>x.replayed===false).length,1);
  assert.equal([r1,r2].filter(x=>x.replayed===true).length,1);
  const reversalId=r1.reversal_journal_entry_id;
  await expectFailure("second reversal cannot create a second counter-entry",
    () => db.unsafe("select public.reverse_customer_return_credit_memo($1::uuid,$2::text,$3::uuid)",[preparedCredit.credit_memo_id,reason,randomUUID()]),
    /already reversed|original reversal is immutable/i);
  await expectFailure("clients cannot delete immutable reversal links",
    () => db.unsafe("delete from public.accounting_return_credit_memo_reversals where organization_id=$1::uuid and credit_memo_id=$2::uuid",[organizationId,preparedCredit.credit_memo_id]),
    /permission denied/i);

  const memoRows=await db.unsafe(
    "select m.status,m.reversal_journal_entry_id,m.reversal_reason,je.status as original_status,rj.status as reversal_status "+
    "from public.customer_return_credit_memos m "+
    "join public.accounting_return_credit_memo_postings sp on sp.organization_id=m.organization_id and sp.credit_memo_id=m.id "+
    "join public.accounting_journal_entries je on je.organization_id=sp.organization_id and je.id=sp.journal_entry_id "+
    "join public.accounting_return_credit_memo_reversals r on r.organization_id=m.organization_id and r.credit_memo_id=m.id "+
    "join public.accounting_journal_entries rj on rj.organization_id=r.organization_id and rj.id=r.reversal_journal_entry_id "+
    "where m.organization_id=$1::uuid and m.id=$2::uuid",[organizationId,preparedCredit.credit_memo_id]);
  assert.equal(memoRows.length,1);
  assert.equal(memoRows[0].status,"reversed");
  assert.equal(memoRows[0].original_status,"posted");
  assert.equal(memoRows[0].reversal_status,"posted");
  assert.equal(memoRows[0].reversal_journal_entry_id,reversalId);
  assert.equal(memoRows[0].reversal_reason,reason);

  const reversedOptions=asJson((await db.unsafe(
    "select public.get_finance_document_print_options($1::integer,$2::integer) as result",[500,0]
  ))[0].result);
  const reversedOption=reversedOptions.credit_memos.find((row)=>row.id===preparedCredit.credit_memo_id);
  assert.ok(reversedOption,"finance print options retain the reversed credit memo as an audit-print source");
  assert.equal(reversedOption.status,"reversed","print source exposes the persisted reversed status");
  assert.equal(reversedOption.invoice_number,"INV-CI-RET-"+suffix,"reversed print source remains tied to its source invoice");
  const reversedPrint=asJson((await db.unsafe(
    "select public.get_customer_return_credit_memo_pdf($1::uuid) as result",[preparedCredit.credit_memo_id]
  ))[0].result);
  assert.equal(reversedPrint.memo.status,"reversed");
  assert.equal(reversedPrint.journal.status,"posted","the original journal remains immutable and posted");
  assert.equal(reversedPrint.memo.reversed_at!=null,true);
  assert.equal(reversedPrint.memo.reversal_reason,reason);
  assert.equal(reversedPrint.memo.reversal_journal_entry_number,r1.reversal_journal_entry_number);
  assert.equal(reversedPrint.memo.reversal_journal_status,"posted","the print source verifies the posted counter-entry");

  const mirrors=await db.unsafe(
    "select o.line_number,o.account_id::text as account_id,o.debit::text as od,o.credit::text as oc,"+
    "r.account_id::text as reversal_account_id,r.debit::text as rd,r.credit::text as rc "+
    "from public.accounting_journal_lines o join public.accounting_journal_lines r "+
    "on r.organization_id=o.organization_id and r.line_number=o.line_number "+
    "where o.organization_id=$1::uuid and o.journal_entry_id=$2::uuid and r.journal_entry_id=$3::uuid order by o.line_number",
    [organizationId,preparedCredit.journal_entry_id,reversalId]);
  assert.ok(mirrors.length>=2);
  for(const line of mirrors){
    assert.equal(line.account_id,line.reversal_account_id);
    assert.equal(Number(line.rd),Number(line.oc));
    assert.equal(Number(line.rc),Number(line.od));
  }
  const totals=(await db.unsafe(
    "select sum(debit)::numeric(15,2)::text as debit,sum(credit)::numeric(15,2)::text as credit "+
    "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id in ($2::uuid,$3::uuid)",
    [organizationId,preparedCredit.journal_entry_id,reversalId]))[0];
  assert.equal(Number(totals.debit),250);
  assert.equal(Number(totals.credit),250);

  const balanceAfter=Number((await db.unsafe(
    "select current_balance::text as balance from public.customers where organization_id=$1::uuid and id=$2::uuid",
    [organizationId,customerOne.id]))[0].balance);
  assert.equal(balanceAfter,balanceBefore+125);
  const statementAfter=asJson((await db.unsafe(
    "select public.get_staff_customer_account_statement_full($1::uuid) as result",[customerOne.id]))[0].result);
  const invoiceAfter=statementAfter.invoices.find(x=>x.id===sourceInvoiceId);
  assert.ok(invoiceAfter);
  assert.equal(Number(invoiceAfter.credit_memo_amount),0);
  assert.equal(Number(invoiceAfter.outstanding_amount),200,"reversal restores the 125.00 credit while preserving the 300.00 received payments");
  assert.equal(statementAfter.credits.some(x=>x.id===preparedCredit.credit_memo_id),false);
  const queueAfter=asJson((await db.unsafe("select public.fetch_customer_return_credit_memo_queue(50) as result"))[0].result);
  const returnAfter=queueAfter.requests.find(x=>x.request_id===firstRequest.request_id);
  assert.equal(returnAfter.credit_memo.status,"reversed");
  assert.equal(returnAfter.credit_memo.reversal_journal_entry_number,r1.reversal_journal_entry_number);
  assert.equal(Number(returnAfter.items[0].already_credited_quantity),1.25);
  assert.equal(Number(returnAfter.items[0].remaining_invoice_quantity),3.75);
  await expectFailure("reversed return cannot be credited again",
    () => db.unsafe("select public.prepare_customer_return_credit_memo($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)",
      [firstRequest.request_id,receivableAccountId,revenueAccountId,null,randomUUID()]),
    /physical return already has a reversed credit memo/i);
  const audit=await db.unsafe(
    "select actor_id from public.audit_logs where organization_id=$1::uuid and entity_type='customer_return_credit_memo' and entity_id=$2::uuid and action='accounting.customer_return_credit_memo_reversed'",
    [organizationId,preparedCredit.credit_memo_id]);
  assert.equal(audit.length,1);
  assert.equal(audit[0].actor_id,managerProfileId);
  const stockAfter=(await db.unsafe(
    "select count(*)::integer as count from public.inventory_movements where reference_type='customer_return_request' and reference_id=$1::uuid",
    [firstRequest.request_id]))[0].count;
  assert.equal(stockAfter,stockBefore,"financial reversal creates no stock movement or cash refund");

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
