import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for customer payment allocation acceptance.");
}
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function expectSqlState(label, action, sqlState) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must fail");
  assert.equal(caught.code, sqlState, label + " must raise SQLSTATE " + sqlState);
  return caught;
}

function amountToCents(value) {
  const text = String(value).trim();
  assert.match(text, /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/);
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

async function setIdentity(connection, actor, sessionId, applicationName) {
  if (applicationName) {
    await connection.unsafe("select set_config('application_name',$1,false)", [applicationName]);
  }
  await connection.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [actor.auth_user_id]);
  await connection.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: actor.auth_user_id,
      email: actor.email,
      role: "authenticated",
      session_id: sessionId,
    }),
  ]);
  await connection.unsafe("set role authenticated");
}

async function receiptRpc(connection, allocations, paymentMethod, idempotencyKey, reference, notes) {
  // Send JSON as UTF-8 bytea so postgres.js cannot reinterpret the payload as a JSON scalar.
  // PostgreSQL decodes and validates the actual JSON array before invoking the RPC.
  const payload = Buffer.from(JSON.stringify(allocations), "utf8");
  const jsonValue = "pg_catalog.convert_from($1::bytea,'UTF8')::jsonb";
  const shape = await connection.unsafe(
    "select pg_catalog.jsonb_typeof(" + jsonValue + ") as kind, " +
    "case when pg_catalog.jsonb_typeof(" + jsonValue + ")='array' " +
    "then pg_catalog.jsonb_array_length(" + jsonValue + ") else -1 end as item_count",
    [payload],
  );
  const kind = shape[0]?.kind;
  const itemCount = Number(shape[0]?.item_count);
  process.stdout.write("CUSTOMER_PAYMENT_RECEIPT_RPC_INPUT " + JSON.stringify({
    kind, itemCount, method: paymentMethod, idempotencyKeyPresent: Boolean(idempotencyKey),
  }) + String.fromCharCode(10));
  assert.equal(kind, "array", "receipt RPC must receive a JSON array");
  assert.ok(itemCount >= 2 && itemCount <= 50, "receipt RPC must receive 2..50 allocation rows");
  const rows = await connection.unsafe(
    "select public.record_customer_payment_allocation(" + jsonValue + ",$2::text,$3::uuid,$4::text,$5::text) as result",
    [payload, paymentMethod, idempotencyKey, reference, notes],
  );
  return rows[0]?.result;
}

async function main() {
  await db.unsafe("reset role");

  const actorRows = await db.unsafe(
    "select p.auth_user_id::text as auth_user_id,p.email,p.id::text as profile_id,p.organization_id::text as organization_id " +
    "from public.profiles p join public.user_roles r on r.profile_id=p.id and r.role='accountant' " +
    "where lower(p.email)='ci-accountant@example.test' and p.is_active=true limit 1",
  );
  assert.equal(actorRows.length, 1, "isolated fixtures must include an active accountant");
  const actor = actorRows[0];

  // The Core database acceptance suite seeds 205 invoices for one customer.
  // Select three open invoices from that same-customer, same-currency fixture.
  const invoiceRows = await db.unsafe(
    "with balances as (" +
      "select i.id::text as invoice_id,i.organization_id::text as organization_id," +
      "i.customer_id::text as customer_id,i.invoice_number,i.currency," +
      "(i.total_amount-coalesce(p.paid,0)-coalesce(c.credited,0))::numeric(15,2)::text as remaining " +
      "from public.customer_invoices i " +
      "left join lateral (select coalesce(sum(cp.amount),0)::numeric(15,2) as paid " +
        "from public.customer_payments cp where cp.organization_id=i.organization_id and cp.customer_id=i.customer_id and cp.invoice_id=i.id) p on true " +
      "left join lateral (select coalesce(sum(cm.total_amount),0)::numeric(15,2) as credited " +
        "from public.customer_return_credit_memos cm where cm.organization_id=i.organization_id and cm.customer_id=i.customer_id and cm.invoice_id=i.id and cm.status='posted' and cm.currency=i.currency) c on true " +
      "where i.organization_id=$1::uuid and i.invoice_number like 'CI-CAP-INVOICE-%' and i.status<>'void'" +
    ") select * from balances where remaining::numeric>=1.00 order by invoice_number limit 3",
    [actor.organization_id],
  );
  assert.equal(invoiceRows.length, 3, "three open CI-CAP invoices must be available in the test tenant");
  const [invoiceA, invoiceB, invoiceC] = invoiceRows;
  assert.equal(invoiceA.customer_id, invoiceB.customer_id);
  assert.equal(invoiceA.customer_id, invoiceC.customer_id);
  assert.equal(invoiceA.currency, invoiceB.currency);
  assert.equal(invoiceA.currency, invoiceC.currency);

  const sessionId = randomUUID();
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$2,now(),now(),now(),null,'CI multi-invoice payment receipt','127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, actor.auth_user_id],
  );

  const allocations = [
    { invoice_id: invoiceA.invoice_id, amount: "0.25" },
    { invoice_id: invoiceB.invoice_id, amount: "0.35" },
  ];
  const idempotencyKey = randomUUID();
  const reference = "CI-MULTI-INVOICE-RECEIPT-" + randomUUID();

  await setIdentity(db, actor, sessionId);
  const firstReceipt = await receiptRpc(db, allocations, "transfer", idempotencyKey, reference, "private receipt note");
  assert.equal(firstReceipt.replayed, false);
  assert.equal(firstReceipt.allocation_count, 2);
  assert.equal(firstReceipt.currency, invoiceA.currency);
  assert.equal(firstReceipt.total_amount, "0.60");
  assert.match(firstReceipt.receipt_id, /^[0-9a-f-]{36}$/i);

  const replay = await receiptRpc(db, [...allocations].reverse(), "transfer", idempotencyKey, reference, "private receipt note");
  assert.equal(replay.receipt_id, firstReceipt.receipt_id, "reordered same-key lines must replay the same receipt");
  assert.equal(replay.replayed, true);
  assert.equal(replay.total_amount, "0.60");

  await expectSqlState(
    "same receipt key with changed amount",
    () => receiptRpc(db, [
      { invoice_id: invoiceA.invoice_id, amount: "0.26" },
      { invoice_id: invoiceB.invoice_id, amount: "0.35" },
    ], "transfer", idempotencyKey, reference, "private receipt note"),
    "22023",
  );
  await expectSqlState(
    "same receipt key with changed method",
    () => receiptRpc(db, allocations, "cash", idempotencyKey, reference, "private receipt note"),
    "22023",
  );
  await expectSqlState(
    "duplicate invoice within one receipt",
    () => receiptRpc(db, [
      { invoice_id: invoiceA.invoice_id, amount: "0.20" },
      { invoice_id: invoiceA.invoice_id, amount: "0.20" },
    ], "transfer", randomUUID(), reference, null),
    "22023",
  );
  await expectSqlState(
    "receipt with an extra allocation property",
    () => receiptRpc(db, [
      { invoice_id: invoiceA.invoice_id, amount: "0.20", organization_id: actor.organization_id },
      { invoice_id: invoiceB.invoice_id, amount: "0.20" },
    ], "transfer", randomUUID(), reference, null),
    "22023",
  );

  await db.unsafe("reset role");
  const receiptRows = await db.unsafe(
    "select id::text as id,organization_id::text as organization_id,customer_id::text as customer_id," +
    "currency,total_amount::text as total_amount,allocation_count,receipt_number::text as receipt_number,created_by::text as created_by " +
    "from public.customer_payment_receipts where organization_id=$1::uuid and id=$2::uuid",
    [actor.organization_id, firstReceipt.receipt_id],
  );
  assert.equal(receiptRows.length, 1);
  assert.equal(receiptRows[0].customer_id, invoiceA.customer_id);
  assert.equal(receiptRows[0].total_amount, "0.60");
  assert.equal(receiptRows[0].allocation_count, 2);
  assert.ok(Number(receiptRows[0].receipt_number) > 0, "saved receipt must receive a human-readable serial number");
  assert.equal(receiptRows[0].created_by, actor.profile_id);

  const childRows = await db.unsafe(
    "select id::text as id,invoice_id::text as invoice_id,receipt_id::text as receipt_id," +
    "amount::text as amount,idempotency_key::text as idempotency_key " +
    "from public.customer_payments where organization_id=$1::uuid and receipt_id=$2::uuid order by invoice_id",
    [actor.organization_id, firstReceipt.receipt_id],
  );
  assert.equal(childRows.length, 2, "the receipt must create one existing-ledger payment row per invoice");
  assert.deepEqual(childRows.map(row=>row.invoice_id), [invoiceA.invoice_id,invoiceB.invoice_id].sort());
  const childAmountsByInvoice = new Map(childRows.map(row => [row.invoice_id, row.amount]));
  assert.equal(childAmountsByInvoice.get(invoiceA.invoice_id), "0.25",
    "invoice A receives its exact requested allocation irrespective of UUID sort order");
  assert.equal(childAmountsByInvoice.get(invoiceB.invoice_id), "0.35",
    "invoice B receives its exact requested allocation irrespective of UUID sort order");
  assert.ok(childRows.every(row=>row.idempotency_key), "child rows must retain the existing idempotency metadata");
  assert.equal(childRows.reduce((sum,row)=>sum+amountToCents(row.amount),0n), amountToCents(receiptRows[0].total_amount));

  const childAudit = await db.unsafe(
    "select entity_id::text as entity_id from public.audit_logs " +
    "where organization_id=$1::uuid and action='customer_payment.recorded' and entity_type='customer_payment' " +
    "and entity_id in (select id from public.customer_payments where receipt_id=$2::uuid)",
    [actor.organization_id, firstReceipt.receipt_id],
  );
  assert.equal(childAudit.length, 2, "each invoice allocation must retain the existing payment audit");
  const receiptAudit = await db.unsafe(
    "select actor_id::text as actor_id,new_value from public.audit_logs " +
    "where organization_id=$1::uuid and action='customer_payment_receipt.recorded' " +
    "and entity_type='customer_payment_receipt' and entity_id=$2::uuid",
    [actor.organization_id, firstReceipt.receipt_id],
  );
  assert.equal(receiptAudit.length, 1, "one receipt-level audit must be persisted");
  assert.equal(receiptAudit[0].actor_id, actor.profile_id);
  assert.equal(receiptAudit[0].new_value.total_amount, "0.60");
  assert.equal(receiptAudit[0].new_value.allocation_count, 2);
  assert.equal(JSON.stringify(receiptAudit[0].new_value).includes(idempotencyKey), false);
  assert.equal(JSON.stringify(receiptAudit[0].new_value).includes("private receipt note"), false);


  // Finance-only print selectors and snapshots re-read the persisted receipt instead of trusting the submit response.
  await setIdentity(db, actor, sessionId);
  const printOptions = (await db.unsafe(
    "select public.get_customer_payment_receipt_print_options($1::integer,$2::integer) as result",
    [100, 0],
  ))[0].result;
  assert.equal(printOptions.organization_name.length > 0, true);
  const printOption = printOptions.receipts.find(row => row.id === firstReceipt.receipt_id);
  assert.ok(printOption, "saved receipt must be discoverable from the finance receipt register");
  assert.equal(printOption.receipt_number, String(receiptRows[0].receipt_number));
  assert.equal(printOption.allocation_count, 2);
  assert.equal(printOption.total_amount, "0.60");
  assert.equal("notes" in printOption, false);
  assert.equal("organization_id" in printOption, false);

  const printSnapshot = (await db.unsafe(
    "select public.get_staff_customer_payment_receipt_print_data($1::uuid) as result",
    [firstReceipt.receipt_id],
  ))[0].result;
  assert.equal(printSnapshot.receipt.receipt_number, String(receiptRows[0].receipt_number));
  assert.equal(printSnapshot.receipt.total_amount, "0.60");
  assert.equal(printSnapshot.receipt.allocation_count, 2);
  assert.equal(printSnapshot.allocations.length, 2);
  assert.deepEqual(
    printSnapshot.allocations.map(row => row.invoice_number).sort(),
    [invoiceA.invoice_number, invoiceB.invoice_number].sort(),
  );
  assert.equal(
    printSnapshot.allocations.reduce((sum, row) => sum + amountToCents(row.amount), 0n),
    amountToCents(printSnapshot.receipt.total_amount),
  );
  const printableSnapshotText = JSON.stringify(printSnapshot);
  for (const forbidden of [
    "private receipt note",
    idempotencyKey,
    "organization_id",
    "notes",
    "receipt_id",
  ]) assert.equal(printableSnapshotText.includes(forbidden), false, "print snapshot must omit " + forbidden);
  await db.unsafe("reset role");

  // Customers receive only the approved account-statement projection, never the
  // receipt header's internal notes, references or raw receipt metadata.
  await db.unsafe("reset role");
  const customerActorRows = await db.unsafe(
    "select p.auth_user_id::text as auth_user_id,p.email,p.id::text as profile_id,p.organization_id::text as organization_id " +
    "from public.customers c join public.profiles p on p.id=c.profile_id and p.organization_id=c.organization_id " +
    "where c.id=$1::uuid and c.organization_id=$2::uuid and p.is_active=true limit 1",
    [invoiceA.customer_id, actor.organization_id],
  );
  assert.equal(customerActorRows.length, 1, "receipt owner must have an active customer profile");
  const customerActor = customerActorRows[0];
  const customerSessionId = randomUUID();
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$2,now(),now(),now(),null,'CI customer receipt privacy','127.0.0.1'::inet)",
    [customerSessionId, customerActor.auth_user_id],
  );
  await setIdentity(db, customerActor, customerSessionId);
  const customerStatement = (await db.unsafe(
    "select public.get_customer_account_statement() as result",
  ))[0].result;
  const statementPaymentIds = new Set(customerStatement.payments.map((row) => row.id));
  assert.ok(childRows.every((row) => statementPaymentIds.has(row.id)),
    "customer statement must include each saved invoice allocation");
  assert.ok(customerStatement.payments.every((row) => !("receipt_id" in row) && !("notes" in row)),
    "customer statement returns the bounded payment projection, not receipt internals");
  assert.equal((await db.unsafe(
    "select id from public.customer_payment_receipts where id=$1::uuid",
    [firstReceipt.receipt_id],
  )).length, 0, "customers cannot query receipt headers or internal notes directly");
  await expectSqlState(
    "customer cannot list finance-only saved receipt print options",
    () => db.unsafe("select public.get_customer_payment_receipt_print_options(100,0) as result"),
    "42501",
  );
  await expectSqlState(
    "customer cannot read finance-only receipt print snapshots",
    () => db.unsafe("select public.get_staff_customer_payment_receipt_print_data($1::uuid) as result", [firstReceipt.receipt_id]),
    "42501",
  );
  await expectSqlState(
    "customer cannot call the finance-only multi-invoice receipt RPC",
    () => receiptRpc(db, allocations, "transfer", randomUUID(), reference, null),
    "42501",
  );
  await db.unsafe("reset role");

  // RLS exposes receipt headers only to finance users; direct writes stay denied.
  const privileges = (await db.unsafe(
    "select has_table_privilege('authenticated','public.customer_payment_receipts','SELECT') as can_select," +
    "has_table_privilege('authenticated','public.customer_payment_receipts','INSERT') as can_insert",
  ))[0];
  assert.equal(privileges.can_select, true);
  assert.equal(privileges.can_insert, false);
  await setIdentity(db, actor, sessionId);
  assert.equal((await db.unsafe(
    "select id::text as id from public.customer_payment_receipts where id=$1::uuid",
    [firstReceipt.receipt_id],
  )).length, 1);
  const foreignVisible = await db.unsafe(
    "select count(*)::integer as count from public.customer_payment_receipts where organization_id<>$1::uuid",
    [actor.organization_id],
  );
  assert.equal(foreignVisible[0].count, 0, "RLS must not expose receipt headers from other tenants");
  await expectSqlState(
    "authenticated finance user cannot insert receipt header directly",
    () => db.unsafe(
      "insert into public.customer_payment_receipts(" +
      "organization_id,customer_id,currency,total_amount,allocation_count,payment_method,paid_at,created_by,idempotency_key,request_fingerprint" +
      ") values($1::uuid,$2::uuid,$3,1.00,2,'transfer',now(),$4::uuid,$5::uuid,repeat('a',64))",
      [actor.organization_id, invoiceA.customer_id, invoiceA.currency, actor.profile_id, randomUUID()],
    ),
    "42501",
  );
  await db.unsafe("reset role");

  // Cross-tenant invoice IDs fail closed before any receipt or child row is written.
  const foreignInvoiceRows = await db.unsafe(
    "select id::text as invoice_id from public.customer_invoices where organization_id<>$1::uuid and status<>'void' limit 1",
    [actor.organization_id],
  );
  assert.ok(foreignInvoiceRows.length > 0, "isolated fixtures must contain a foreign-tenant invoice");
  const foreignInvoiceId = foreignInvoiceRows[0].invoice_id;
  const rejectedKey = randomUUID();
  await setIdentity(db, actor, sessionId);
  await expectSqlState(
    "receipt containing a foreign-tenant invoice",
    () => receiptRpc(db, [
      { invoice_id: invoiceA.invoice_id, amount: "0.10" },
      { invoice_id: foreignInvoiceId, amount: "0.10" },
    ], "transfer", rejectedKey, reference, null),
    "P0002",
  );
  await db.unsafe("reset role");
  assert.equal((await db.unsafe(
    "select count(*)::integer as count from public.customer_payment_receipts where organization_id=$1::uuid and idempotency_key=$2::uuid",
    [actor.organization_id, rejectedKey],
  ))[0].count, 0);
  assert.equal((await db.unsafe(
    "select count(*)::integer as count from public.customer_payments where organization_id=$1::uuid and idempotency_key=$2::uuid",
    [actor.organization_id, rejectedKey],
  ))[0].count, 0);

  // Mixed currency must roll back without changing the source invoice's currency.
  await db.unsafe("begin");
  await db.unsafe("savepoint currency_mismatch");
  try {
    await db.unsafe("update public.customer_invoices set currency='USD' where id=$1::uuid", [invoiceC.invoice_id]);
    await setIdentity(db, actor, sessionId);
    await expectSqlState(
      "receipt combining different invoice currencies",
      () => receiptRpc(db, [
        { invoice_id: invoiceA.invoice_id, amount: "0.10" },
        { invoice_id: invoiceC.invoice_id, amount: "0.10" },
      ], "transfer", randomUUID(), reference, null),
      "22023",
    );
    await db.unsafe("rollback to savepoint currency_mismatch");
    await db.unsafe("reset role");
    await db.unsafe("rollback");
  } catch (error) {
    await db.unsafe("rollback").catch(()=>{});
    throw error;
  }

  // A second customer in the same tenant cannot be included in this customer receipt.
  await db.unsafe("reset role");
  const secondCustomerRows = await db.unsafe(
    "select id::text as id from public.customers where organization_id=$1::uuid and customer_code='CI-CUST-02' limit 1",
    [actor.organization_id],
  );
  assert.equal(secondCustomerRows.length, 1, "isolated fixture must include a second customer in the same tenant");
  const otherCustomerOrderId = (await db.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,created_by) " +
    "values($1::uuid,$2::uuid,$3,'approved',100.00,1,$4::uuid) returning id::text as id",
    [actor.organization_id, secondCustomerRows[0].id, "CI-MULTI-ALLOC-CUSTOMER-" + randomUUID(), actor.profile_id],
  ))[0].id;
  const otherCustomerInvoiceId = (await db.unsafe(
    "insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount) " +
    "values($1::uuid,$2::uuid,$3::uuid,$4,'issued',now(),now()+interval '30 days',$5,100.00,0.00,100.00) returning id::text as id",
    [actor.organization_id, secondCustomerRows[0].id, otherCustomerOrderId, "CI-MULTI-ALLOC-CUSTOMER-INVOICE-" + randomUUID(), invoiceA.currency],
  ))[0].id;
  const customerMismatchKey = randomUUID();
  await setIdentity(db, actor, sessionId);
  await expectSqlState(
    "receipt mixing two different customers within one tenant",
    () => receiptRpc(db, [
      { invoice_id: invoiceA.invoice_id, amount: "0.10" },
      { invoice_id: otherCustomerInvoiceId, amount: "0.10" },
    ], "transfer", customerMismatchKey, reference, null),
    "22023",
  );
  await db.unsafe("reset role");
  assert.equal((await db.unsafe(
    "select count(*)::integer as count from public.customer_payment_receipts where organization_id=$1::uuid and idempotency_key=$2::uuid",
    [actor.organization_id, customerMismatchKey],
  ))[0].count, 0);
  assert.equal((await db.unsafe(
    "select count(*)::integer as count from public.customer_payments where organization_id=$1::uuid and idempotency_key=$2::uuid",
    [actor.organization_id, customerMismatchKey],
  ))[0].count, 0);

  // An over-limit line denies the entire receipt, not just the single offending line.
  const balanceRows = await db.unsafe(
    "select (i.total_amount-coalesce(p.paid,0)-coalesce(c.credited,0))::numeric(15,2)::text as remaining " +
    "from public.customer_invoices i " +
    "left join lateral (select coalesce(sum(amount),0)::numeric(15,2) as paid from public.customer_payments cp where cp.organization_id=i.organization_id and cp.invoice_id=i.id) p on true " +
    "left join lateral (select coalesce(sum(total_amount),0)::numeric(15,2) as credited from public.customer_return_credit_memos cm where cm.organization_id=i.organization_id and cm.invoice_id=i.id and cm.status='posted' and cm.currency=i.currency) c on true " +
    "where i.id=$1::uuid",
    [invoiceA.invoice_id],
  );
  const overpayCents = amountToCents(balanceRows[0].remaining) + 1n;
  const overpayAmount = (overpayCents/100n).toString() + "." + (overpayCents%100n).toString().padStart(2,"0");
  const overpayKey = randomUUID();
  await setIdentity(db, actor, sessionId);
  await expectSqlState(
    "receipt allocation exceeding invoice balance",
    () => receiptRpc(db, [
      { invoice_id: invoiceA.invoice_id, amount: overpayAmount },
      { invoice_id: invoiceB.invoice_id, amount: "0.01" },
    ], "transfer", overpayKey, reference, null),
    "22023",
  );
  await db.unsafe("reset role");
  assert.equal((await db.unsafe(
    "select count(*)::integer as count from public.customer_payment_receipts where organization_id=$1::uuid and idempotency_key=$2::uuid",
    [actor.organization_id, overpayKey],
  ))[0].count, 0);
  assert.equal((await db.unsafe(
    "select count(*)::integer as count from public.customer_payments where organization_id=$1::uuid and idempotency_key=$2::uuid",
    [actor.organization_id, overpayKey],
  ))[0].count, 0);

  // Distinct authenticated sessions must overlap behind the same invoice lock;
  // one creates the receipt and the other replays the same request key.
  const concurrentKey = randomUUID();
  const secondSessionId = randomUUID();
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$2,now(),now(),now(),null,'CI second multi-invoice receipt session','127.0.0.1'::inet)",
    [secondSessionId, actor.auth_user_id],
  );
  const gate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const first = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const second = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let gateOpen = false;
  let firstAttempt;
  let secondAttempt;
  try {
    await Promise.all([
      setIdentity(first, actor, sessionId, "ci-receipt-allocation-a"),
      setIdentity(second, actor, secondSessionId, "ci-receipt-allocation-b"),
    ]);
    await gate.unsafe("begin");
    gateOpen = true;
    for (const invoiceId of [invoiceA.invoice_id,invoiceB.invoice_id].sort()) {
      await gate.unsafe(
        "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text||':customer-invoice-settlement:'||$2::text,0))",
        [actor.organization_id, invoiceId],
      );
    }
    const concurrentAllocations = [
      { invoice_id: invoiceA.invoice_id, amount: "0.10" },
      { invoice_id: invoiceB.invoice_id, amount: "0.10" },
    ];
    const submit = connection => receiptRpc(
      connection, concurrentAllocations, "cash", concurrentKey, "CI concurrent receipt", null,
    ).then(result=>({ok:true,result})).catch(error=>({ok:false,error}));
    firstAttempt = submit(first);
    secondAttempt = submit(second);

    let bothWaiting = false;
    for (let attempt=0;attempt<120;attempt+=1) {
      const waiting = await db.unsafe(
        "select count(*)::integer as count from pg_catalog.pg_stat_activity " +
        "where application_name in ('ci-receipt-allocation-a','ci-receipt-allocation-b') " +
        "and state='active' and wait_event_type='Lock'",
      );
      if (waiting[0].count===2) { bothWaiting=true; break; }
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(bothWaiting,true,"same-key receipt calls must overlap while invoice settlement locks are held");
    await gate.unsafe("commit");
    gateOpen = false;

    const [firstResult,secondResult]=await Promise.all([firstAttempt,secondAttempt]);
    assert.equal(firstResult.ok,true,"first concurrent request must create a receipt");
    assert.equal(secondResult.ok,true,"same-key concurrent request must replay");
    assert.equal(firstResult.result.receipt_id,secondResult.result.receipt_id);
    assert.notEqual(firstResult.result.replayed,secondResult.result.replayed,
      "exactly one concurrent caller must create the receipt and the other must replay it");
    assert.deepEqual(
      [firstResult.result.replayed,secondResult.result.replayed].sort(),
      [false,true],
      "concurrent same-key receipt calls must produce one created result and one replay result",
    );

    const concurrentHeaders=await db.unsafe(
      "select id::text as id from public.customer_payment_receipts where organization_id=$1::uuid and idempotency_key=$2::uuid",
      [actor.organization_id,concurrentKey],
    );
    assert.equal(concurrentHeaders.length,1);
    const concurrentChildren=await db.unsafe(
      "select count(*)::integer as count from public.customer_payments where organization_id=$1::uuid and receipt_id=$2::uuid",
      [actor.organization_id,firstResult.result.receipt_id],
    );
    assert.equal(concurrentChildren[0].count,2);
    const concurrentAudits=await db.unsafe(
      "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and action='customer_payment_receipt.recorded' and entity_id=$2::uuid",
      [actor.organization_id,firstResult.result.receipt_id],
    );
    assert.equal(concurrentAudits[0].count,1);
    process.stdout.write(
      "PASS DLV-008 multi-invoice receipt: atomic same-currency allocations, tenant/customer boundaries, exact cents, overpayment denial, idempotent replay and concurrency\n",
    );
  } finally {
    if (gateOpen) await gate.unsafe("rollback").catch(()=>{});
    if (firstAttempt || secondAttempt) {
      await Promise.allSettled([firstAttempt,secondAttempt].filter(Boolean));
    }
    await Promise.all([
      gate.end({timeout:5}),
      first.end({timeout:5}),
      second.end({timeout:5}),
    ]);
  }
}

main()
  .catch(error=>{
    const details={name:error?.name,message:error?.message,code:error?.code,detail:error?.detail,hint:error?.hint,stack:error?.stack};
    process.stderr.write("CUSTOMER_PAYMENT_ALLOCATION_ACCEPTANCE_FAILED "+JSON.stringify(details)+"\n");
    process.exitCode=1;
  })
  .finally(async()=>{
    await db.end({timeout:5});
  });
