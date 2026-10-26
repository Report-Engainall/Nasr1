import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for the isolated PostgreSQL 17 finance race test.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function setIdentity(client, authUserId, email, applicationName) {
  await client.unsafe("reset role").catch(() => undefined);
  const sessionId = randomUUID();
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI payment-credit race','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, role: "authenticated", session_id: sessionId }),
  ]);
  if (applicationName) await client.unsafe("select set_config('application_name',$1,false)", [applicationName]);
  await client.unsafe("set role authenticated");
}

async function createAccount({ suffix, code, name, type, accountantAuthUserId }) {
  await setIdentity(db, accountantAuthUserId, "ci-accountant@example.test");
  const rows = await db.unsafe(
    "select public.create_accounting_account($1::text,$2::text,$3::text,null,$4::text) as result",
    ["CI-RACE-" + code + "-" + suffix, "CI payment-credit race " + name + " " + suffix, type, "Isolated PostgreSQL race acceptance fixture"],
  );
  const result = asJson(rows[0].result);
  assert.match(String(result.id), /^[0-9a-f-]{36}$/i, code + " account must be created through the finance RPC");
  return result.id;
}

async function waitForLockContenders(applicationPrefix, expectedCount) {
  const priorRole = (await db.unsafe("select current_setting('role',true) as role"))[0]?.role;
  await db.unsafe("reset role");
  try {
    for (let attempt = 0; attempt < 160; attempt += 1) {
      const waiting = await db.unsafe(
        "select count(*)::integer as count from pg_catalog.pg_stat_activity " +
          "where application_name like $1 and state='active' and wait_event_type='Lock'",
        [applicationPrefix + "%"],
      );
      if (Number(waiting[0]?.count ?? 0) === expectedCount) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const snapshot = await db.unsafe(
      "select application_name,state,wait_event_type,wait_event from pg_catalog.pg_stat_activity " +
        "where application_name like $1 order by application_name",
      [applicationPrefix + "%"],
    );
    assert.fail("both finance RPC sessions must be observed waiting on PostgreSQL locks before release; observed=" + JSON.stringify(snapshot));
  } finally {
    if (["authenticated", "anon", "service_role"].includes(priorRole)) {
      await db.unsafe("set role " + priorRole);
    }
  }
}

async function main() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  const organizationId = "a0000000-0000-0000-0000-000000000001";
  const productId = "a1000000-0000-0000-0000-000000000001";
  const customerAuthUserId = "11111111-1111-4111-8111-111111111111";
  const customerProfileId = "f1111111-1111-4111-8111-111111111111";
  const staffAuthUserId = "33333333-3333-4333-8333-333333333333";
  const accountantAuthUserId = "55555555-5555-4555-8555-555555555555";

  const customerRows = await db.unsafe(
    "select c.id as customer_id,p.id as profile_id,p.auth_user_id " +
      "from public.customers c join public.profiles p on p.id=c.profile_id and p.organization_id=c.organization_id " +
      "where c.organization_id=$1::uuid and p.id=$2::uuid and p.auth_user_id=$3::uuid and c.status='approved'",
    [organizationId, customerProfileId, customerAuthUserId],
  );
  assert.equal(customerRows.length, 1, "migration acceptance must have its deterministic customer fixture");
  const customerId = customerRows[0].customer_id;

  const addressRows = await db.unsafe(
    "select id from public.customer_addresses where organization_id=$1::uuid and customer_id=$2::uuid " +
      "and label='CI Main Depot' order by id limit 1",
    [organizationId, customerId],
  );
  assert.equal(addressRows.length, 1, "the customer fixture must retain its delivery address");

  const productRows = await db.unsafe(
    "select p.id from public.products p where p.id=$1::uuid and p.organization_id=$2::uuid " +
      "and p.status='active' and exists (" +
      "select 1 from public.inventory_balances ib join public.warehouses w on w.id=ib.warehouse_id " +
      "where ib.product_id=p.id and w.organization_id=p.organization_id and w.is_active " +
      "and ib.quantity_on_hand-ib.quantity_reserved>=1) ",
    [productId, organizationId],
  );
  assert.equal(productRows.length, 1, "race fixture needs one active product with available stock");

  // Create a fresh one-line invoice so this race cannot mutate fixtures used by prior acceptance tests.
  await setIdentity(db, customerAuthUserId, "ci-customer-one@example.test");
  const orderKey = "ci-pay-credit-race-" + randomUUID().replaceAll("-", "");
  const orderRows = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid) as result",
    [
      db.json([{ product_id: productId, quantity: 1 }]),
      "CI payment-credit posting race",
      "CI Company One",
      "CI Customer One",
      "7771111111",
      "cash_on_delivery",
      orderKey,
      addressRows[0].id,
    ],
  );
  const order = asJson(orderRows[0].result);
  assert.match(String(order.id ?? order.order_id ?? ""), /^[0-9a-f-]{36}$/i, "checkout must persist the race order");
  assert.equal(order.idempotent_replay, false);

  await db.unsafe("reset role");
  const confirmed = await db.unsafe(
    "update public.orders set status='confirmed' where id=$1::uuid and organization_id=$2::uuid returning id",
    [order.id ?? order.order_id, organizationId],
  );
  assert.equal(confirmed.length, 1, "the isolated order must transition to confirmed");
  const invoiceRows = await db.unsafe(
    "select id,customer_id,subtotal::numeric(15,2)::text as subtotal,tax_amount::numeric(15,2)::text as tax_amount," +
      "total_amount::numeric(15,2)::text as total_amount,currency,status " +
      "from public.customer_invoices where organization_id=$1::uuid and order_id=$2::uuid order by created_at desc,id desc",
    [organizationId, order.id ?? order.order_id],
  );
  assert.equal(invoiceRows.length, 1, "confirmation must issue exactly one invoice");
  const invoice = invoiceRows[0];
  assert.equal(invoice.status, "issued");
  assert.equal(invoice.currency, "YER");
  assert.ok(Number(invoice.total_amount) > 0);

  const invoiceItems = await db.unsafe(
    "select id,order_item_id,product_id,item_code,description,unit,quantity::numeric::text as quantity,unit_price::numeric(15,2)::text as unit_price " +
      "from public.customer_invoice_items where organization_id=$1::uuid and invoice_id=$2::uuid order by created_at,id",
    [organizationId, invoice.id],
  );
  assert.equal(invoiceItems.length, 1, "one-product, one-unit checkout must yield one invoice line");
  const sourceLine = invoiceItems[0];
  assert.equal(Number(sourceLine.quantity), 1);

  const receivableAccountId = await createAccount({
    suffix, code: "AR", name: "race receivable", type: "asset", accountantAuthUserId,
  });
  const salesAccountId = await createAccount({
    suffix, code: "SALES", name: "race sales", type: "revenue", accountantAuthUserId,
  });
  const returnsAccountId = await createAccount({
    suffix, code: "RETURNS", name: "race sales returns", type: "revenue", accountantAuthUserId,
  });
  const taxAccountId = Number(invoice.tax_amount) > 0
    ? await createAccount({ suffix, code: "TAX", name: "race tax liability", type: "liability", accountantAuthUserId })
    : null;

  await setIdentity(db, accountantAuthUserId, "ci-accountant@example.test");
  const invoiceDraft = asJson((await db.unsafe(
    "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [invoice.id, receivableAccountId, salesAccountId, taxAccountId, randomUUID()],
  ))[0].result);
  assert.equal(invoiceDraft.status, "draft");
  const invoicePosted = asJson((await db.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result",
    [invoiceDraft.journal_entry_id],
  ))[0].result);
  assert.equal(invoicePosted.status, "posted", "the invoice's source journal must be posted before the receipt-credit race");

  // Build a fully received source-linked return against the whole invoice line.
  await db.unsafe("reset role");
  const requestId = (await db.unsafe(
    "insert into public.customer_return_requests(" +
      "organization_id,customer_id,order_id,request_number,status,reason,notes,requested_by,reviewed_by,reviewed_at,idempotency_key,payload_fingerprint" +
      ") values($1::uuid,$2::uuid,$3::uuid,$4::text,'approved','other','PG17 payment/credit race',$5::uuid,$6::uuid,statement_timestamp(),$7::text,$8::text) returning id",
    [organizationId, invoice.customer_id, order.id ?? order.order_id, "CI-PAY-CREDIT-" + suffix, customerProfileId,
      (await db.unsafe("select id from public.profiles where auth_user_id=$1::uuid and organization_id=$2::uuid", [staffAuthUserId, organizationId]))[0].id,
      "ci-pay-credit-" + suffix, randomUUID().replaceAll("-", "")],
  ))[0].id;
  const requestItemId = (await db.unsafe(
    "insert into public.customer_return_request_items(" +
      "organization_id,return_request_id,order_item_id,product_id,item_code_snapshot,product_name_snapshot,unit_snapshot,requested_quantity" +
      ") values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::numeric) returning id",
    [organizationId, requestId, sourceLine.order_item_id, sourceLine.product_id, sourceLine.item_code,
      sourceLine.description, sourceLine.unit, sourceLine.quantity],
  ))[0].id;

  const warehouseRows = await db.unsafe(
    "select id from public.warehouses where organization_id=$1::uuid and is_active order by id limit 1",
    [organizationId],
  );
  assert.equal(warehouseRows.length, 1);
  await setIdentity(db, staffAuthUserId, "admin@aghbari.ye");
  const receipt = asJson((await db.unsafe(
    "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [requestId, warehouseRows[0].id,
      db.json([{ request_item_id: requestItemId, received_quantity: Number(sourceLine.quantity), restockable_quantity: 0 }]),
      "CI payment-credit posting contention", "ci-return-receipt-" + suffix],
  ))[0].result);
  assert.equal(receipt.request_status, "received");

  await setIdentity(db, accountantAuthUserId, "ci-accountant@example.test");
  const prepared = asJson((await db.unsafe(
    "select public.prepare_customer_return_credit_memo($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [requestId, receivableAccountId, returnsAccountId, taxAccountId, randomUUID()],
  ))[0].result);
  assert.equal(prepared.status, "draft");
  assert.equal(prepared.journal_status, "draft");
  assert.ok(prepared.credit_memo_id && prepared.journal_entry_id);
  assert.equal(Number(prepared.total_amount), Number(invoice.total_amount),
    "the source-linked return credit must consume the full one-line invoice receivable for a deterministic race");

  const initialPayments = await db.unsafe(
    "select count(*)::integer as count from public.customer_payments where organization_id=$1::uuid and invoice_id=$2::uuid",
    [organizationId, invoice.id],
  );
  const initialPostedCredits = await db.unsafe(
    "select count(*)::integer as count from public.customer_return_credit_memos " +
      "where organization_id=$1::uuid and invoice_id=$2::uuid and status='posted'",
    [organizationId, invoice.id],
  );
  assert.equal(initialPayments[0].count, 0);
  assert.equal(initialPostedCredits[0].count, 0);

  const paymentClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const creditClient = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const gate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const prefix = "ci-pay-credit-" + suffix + "-";
  let gateOpen = false;
  let paymentPromise;
  let creditPromise;
  try {
    await gate.unsafe("begin");
    gateOpen = true;
    await gate.unsafe(
      "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text||':customer-invoice-settlement:'||$2::text,0))",
      [organizationId, invoice.id],
    );
    await setIdentity(paymentClient, accountantAuthUserId, "ci-accountant@example.test", prefix + "payment");
    await setIdentity(creditClient, accountantAuthUserId, "ci-accountant@example.test", prefix + "credit");

    paymentPromise = paymentClient.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text) as id",
      [invoice.id, "0.01", "cash", randomUUID(), "CI race payment", "Payment-vs-credit concurrency acceptance"],
    ).then(rows => ({ kind: "payment", ok: true, paymentId: rows[0].id }))
      .catch(error => ({ kind: "payment", ok: false, error }));
    creditPromise = creditClient.unsafe(
      "select public.post_general_journal_entry($1::uuid) as result",
      [prepared.journal_entry_id],
    ).then(rows => ({ kind: "credit", ok: true, result: asJson(rows[0].result) }))
      .catch(error => ({ kind: "credit", ok: false, error }));

    await waitForLockContenders(prefix, 2);
    await gate.unsafe("commit");
    gateOpen = false;
    const outcomes = await Promise.all([paymentPromise, creditPromise]);
    const paymentOutcome = outcomes.find(outcome => outcome.kind === "payment");
    const creditOutcome = outcomes.find(outcome => outcome.kind === "credit");
    assert.notEqual(paymentOutcome.ok, creditOutcome.ok,
      "exactly one competing financial mutation must win; outcomes=" + JSON.stringify(outcomes.map(o => ({
        kind:o.kind, ok:o.ok, error:o.error?.message, result:o.result?.status,
      }))));
    const loser = paymentOutcome.ok ? creditOutcome : paymentOutcome;
    assert.match(String(loser.error?.message ?? ""), /payment exceeds invoice balance after posted credit memos|credit memo exceeds the remaining invoice receivable after payments and posted credits/i,
      "the losing RPC must reject specifically at the serialized invoice-balance guard");

    await db.unsafe("reset role");
    const finalPayments = await db.unsafe(
      "select id,amount::numeric(15,2)::text as amount from public.customer_payments " +
        "where organization_id=$1::uuid and invoice_id=$2::uuid",
      [organizationId, invoice.id],
    );
    const finalCredits = await db.unsafe(
      "select id,total_amount::numeric(15,2)::text as amount,status from public.customer_return_credit_memos " +
        "where organization_id=$1::uuid and invoice_id=$2::uuid",
      [organizationId, invoice.id],
    );
    const paymentAudit = await db.unsafe(
      "select entity_id from public.audit_logs where organization_id=$1::uuid and action='customer_payment.recorded' " +
        "and new_value->>'invoice_id'=$2::text",
      [organizationId, invoice.id],
    );
    const creditAudit = await db.unsafe(
      "select entity_id from public.audit_logs where organization_id=$1::uuid " +
        "and action='accounting.customer_return_credit_memo_posted' and entity_id=$2::uuid",
      [organizationId, prepared.credit_memo_id],
    );
    const paidAmount = finalPayments.reduce((sum,row) => sum + Number(row.amount), 0);
    const postedCreditAmount = finalCredits.filter(row => row.status === "posted")
      .reduce((sum,row) => sum + Number(row.amount), 0);
    assert.ok(paidAmount + postedCreditAmount <= Number(invoice.total_amount),
      "posted payments and credits must never exceed the invoice receivable");
    assert.equal(finalPayments.length, paymentOutcome.ok ? 1 : 0,
      "failed payment must leave no partial payment row");
    assert.equal(finalCredits.filter(row => row.status === "posted").length, creditOutcome.ok ? 1 : 0,
      "credit posting state must match the winning RPC");
    assert.equal(paymentAudit.length, paymentOutcome.ok ? 1 : 0,
      "payment audit is emitted exactly once and never for the rejected RPC");
    assert.equal(creditAudit.length, creditOutcome.ok ? 1 : 0,
      "credit-posting audit is emitted exactly once and never for the rejected RPC");
    assert.equal(finalCredits.find(row => row.id === prepared.credit_memo_id)?.status,
      creditOutcome.ok ? "posted" : "draft", "a rejected credit posting must leave the memo draft");

    process.stdout.write(
      "PASS PostgreSQL 17 payment-vs-credit posting race: both authenticated RPC sessions were observed waiting on the same invoice settlement lock; exactly one won; the loser left no payment/credit/audit side effects; invoice receivable stayed within its total.\n",
    );
  } finally {
    if (gateOpen) await gate.unsafe("rollback").catch(() => undefined);
    if (paymentPromise || creditPromise) await Promise.allSettled([paymentPromise, creditPromise].filter(Boolean));
    await Promise.all([
      gate.end({ timeout: 5 }).catch(() => undefined),
      paymentClient.end({ timeout: 5 }).catch(() => undefined),
      creditClient.end({ timeout: 5 }).catch(() => undefined),
    ]);
  }
}

main().catch(cause => {
  const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
  const diagnostic = Object.fromEntries(
    ["name","message","code","severity","detail","hint","position","where","schema","table","column","constraint","routine","stack"]
      .filter(key => key in error).map(key => [key,error[key]]),
  );
  process.stderr.write("CUSTOMER_PAYMENT_CREDIT_RACE_FAILED " + JSON.stringify(diagnostic) + "\n");
  process.exitCode = 1;
}).finally(async () => {
  await db.end({ timeout: 5 });
});
