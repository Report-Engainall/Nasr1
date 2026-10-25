import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for isolated customer-payment audit acceptance.");
}

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

/** Assert that a database action fails with the specified SQLSTATE. */
async function expectSqlState(label, action, sqlState) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must fail");
  assert.equal(caught.code, sqlState, label + " must raise SQLSTATE " + sqlState);
}

/** Verify tenant-scoped payment auditing, idempotent replay, and rejection of changed payloads on PostgreSQL 17. */
async function main() {
  await db.unsafe("reset role");

  const actorRows = await db.unsafe(
    "select p.auth_user_id::text as auth_user_id, p.email, p.id::text as profile_id, p.organization_id::text as organization_id " +
      "from public.profiles p join public.user_roles r on r.profile_id=p.id and r.role='accountant' " +
      "where lower(p.email)='ci-accountant@example.test' and p.is_active=true limit 1",
  );
  assert.equal(
    actorRows.length,
    1,
    "migration acceptance fixtures must include an active finance accountant",
  );
  const actor = actorRows[0];

  const invoiceRows = await db.unsafe(
    "select i.id::text as invoice_id, i.organization_id::text as organization_id, " +
      "i.customer_id::text as customer_id, i.currency, " +
      "(i.total_amount - coalesce(p.paid,0) - coalesce(c.credited,0))::numeric(15,2)::text as available_balance " +
      "from public.customer_invoices i " +
      "left join lateral (select coalesce(sum(cp.amount),0)::numeric(15,2) as paid " +
      "from public.customer_payments cp where cp.organization_id=i.organization_id " +
      "and cp.customer_id=i.customer_id and cp.invoice_id=i.id) p on true " +
      "left join lateral (select coalesce(sum(cm.total_amount),0)::numeric(15,2) as credited " +
      "from public.customer_return_credit_memos cm where cm.organization_id=i.organization_id " +
      "and cm.customer_id=i.customer_id and cm.invoice_id=i.id and cm.status='posted' and cm.currency=i.currency) c on true " +
      "where i.organization_id=$1::uuid and i.status <> 'void' " +
      "and (i.total_amount - coalesce(p.paid,0) - coalesce(c.credited,0)) > 2 " +
      "order by i.created_at desc limit 1",
    [actor.organization_id],
  );
  assert.equal(
    invoiceRows.length,
    1,
    "isolated finance fixtures must contain an invoice with a positive receivable balance",
  );
  const invoice = invoiceRows[0];

  const sessionId = randomUUID();
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1,$2,now(),now(),now(),null,'CI customer payment audit','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [sessionId, actor.auth_user_id],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [actor.auth_user_id]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: actor.auth_user_id,
      email: actor.email,
      role: "authenticated",
      session_id: sessionId,
    }),
  ]);
  await db.unsafe("set role authenticated");

  const idempotencyKey = randomUUID();
  const reference = "CI-PAYMENT-AUDIT-ACCEPTANCE";
  let createdPaymentId;
  const args = [
    invoice.invoice_id,
    "1.00",
    "other",
    idempotencyKey,
    reference,
    "must not be copied into an audit payload",
  ];
  try {
    const firstRows = await db.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text)::text as id",
      args,
    );
    const replayRows = await db.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text)::text as id",
      args,
    );
    createdPaymentId = firstRows[0].id;
    assert.equal(
      createdPaymentId,
      replayRows[0].id,
      "idempotent replay must return the original payment ID",
    );

    await expectSqlState(
      "same idempotency key with a changed amount",
      () => db.unsafe(
        "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text)",
        [invoice.invoice_id, "2.00", "other", idempotencyKey, reference, "changed payload"],
      ),
      "22023",
    );
  } finally {
    await db.unsafe("reset role");
  }


  // Prove the same idempotency key serializes two genuinely concurrent authenticated RPC calls.
  // Hold the invoice row so the requests overlap inside PostgreSQL, then verify a single payment and audit event.
  const concurrentIdempotencyKey = randomUUID();
  const concurrentGate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const concurrentFirst = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const concurrentSecond = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let concurrentGateOpen = false;
  let concurrentFirstAttempt;
  let concurrentSecondAttempt;
  const setConcurrentFinanceIdentity = async (connection, applicationName) => {
    await connection.unsafe("select set_config('application_name',$1,false)", [applicationName]);
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
  };
  try {
    await Promise.all([
      setConcurrentFinanceIdentity(concurrentFirst, "ci-payment-audit-same-key-a"),
      setConcurrentFinanceIdentity(concurrentSecond, "ci-payment-audit-same-key-b"),
    ]);
    await concurrentGate.unsafe("begin");
    concurrentGateOpen = true;
    await concurrentGate.unsafe(
      "select id from public.customer_invoices where id=$1::uuid for update",
      [invoice.invoice_id],
    );

    const concurrentArgs = (connection) => [
      invoice.invoice_id,
      "0.25",
      "other",
      concurrentIdempotencyKey,
      reference,
      "must not be copied into an audit payload",
    ];
    const submitConcurrentPayment = (connection) =>
      connection.unsafe(
        "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text)::text as id",
        concurrentArgs(connection),
      ).then((rows) => ({ ok: true, id: rows[0]?.id }))
        .catch((error) => ({ ok: false, error }));
    concurrentFirstAttempt = submitConcurrentPayment(concurrentFirst);
    concurrentSecondAttempt = submitConcurrentPayment(concurrentSecond);

    let observedBothPaymentSessionsWaiting = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const waiting = await db.unsafe(
        "select count(*)::int as count from pg_catalog.pg_stat_activity " +
          "where application_name in ('ci-payment-audit-same-key-a','ci-payment-audit-same-key-b') " +
          "and state='active' and wait_event_type='Lock'",
      );
      if (Number(waiting[0]?.count ?? 0) === 2) {
        observedBothPaymentSessionsWaiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(
      observedBothPaymentSessionsWaiting,
      true,
      "same-key payment calls must overlap while blocked by the held invoice lock",
    );

    await concurrentGate.unsafe("commit");
    concurrentGateOpen = false;
    const [firstConcurrentPayment, secondConcurrentPayment] = await Promise.all([
      concurrentFirstAttempt,
      concurrentSecondAttempt,
    ]);
    assert.equal(firstConcurrentPayment.ok, true, "first concurrent payment request must succeed");
    assert.equal(secondConcurrentPayment.ok, true, "same-key payment replay must succeed");
    assert.equal(
      firstConcurrentPayment.id,
      secondConcurrentPayment.id,
      "concurrent same-key requests must return the same canonical payment ID",
    );

    await db.unsafe("reset role");
    const concurrentPayments = await db.unsafe(
      "select id::text as id, organization_id::text as organization_id " +
        "from public.customer_payments where organization_id=$1::uuid and idempotency_key=$2::uuid",
      [actor.organization_id, concurrentIdempotencyKey],
    );
    assert.equal(
      concurrentPayments.length,
      1,
      "concurrent same-key replay must persist exactly one customer payment",
    );
    assert.equal(concurrentPayments[0].id, firstConcurrentPayment.id);
    const concurrentAuditRows = await db.unsafe(
      "select id from public.audit_logs where organization_id=$1::uuid " +
        "and action='customer_payment.recorded' and entity_type='customer_payment' " +
        "and entity_id=$2::uuid",
      [actor.organization_id, firstConcurrentPayment.id],
    );
    assert.equal(
      concurrentAuditRows.length,
      1,
      "concurrent same-key replay must write exactly one payment audit event",
    );
    process.stdout.write(
      "PASS customer payment audit concurrency: overlapping same-key requests return one payment ID and persist one payment plus one audit event\\n",
    );
  } finally {
    if (concurrentGateOpen) await concurrentGate.unsafe("rollback").catch(() => {});
    if (concurrentFirstAttempt || concurrentSecondAttempt) {
      await Promise.allSettled(
        [concurrentFirstAttempt, concurrentSecondAttempt].filter(Boolean),
      );
    }
    await Promise.all([
      concurrentGate.end({ timeout: 5 }),
      concurrentFirst.end({ timeout: 5 }),
      concurrentSecond.end({ timeout: 5 }),
    ]);
  }
  const persistedPayments = await db.unsafe(
    "select id::text as id, organization_id::text as organization_id, created_by::text as created_by " +
      "from public.customer_payments where organization_id=$1::uuid and idempotency_key=$2::uuid",
    [actor.organization_id, idempotencyKey],
  );
  assert.equal(
    persistedPayments.length,
    1,
    "same-key replay must persist exactly one payment",
  );
  assert.equal(
    persistedPayments[0].id,
    createdPaymentId,
    "stored payment ID matches the RPC result",
  );

  const paymentId = persistedPayments[0].id;
  assert.equal(
    persistedPayments[0].created_by,
    actor.profile_id,
    "payment actor is derived from the active finance session",
  );

  const auditRows = await db.unsafe(
    "select id::text as id, organization_id::text as organization_id, actor_id::text as actor_id, " +
      "action, entity_type, entity_id::text as entity_id, old_value, new_value " +
      "from public.audit_logs where organization_id=$1::uuid and action='customer_payment.recorded' " +
      "and entity_type='customer_payment' and entity_id=$2::uuid",
    [actor.organization_id, paymentId],
  );
  assert.equal(
    auditRows.length,
    1,
    "payment creation and idempotent replay must produce one audit row",
  );
  const audit = auditRows[0];
  assert.equal(
    audit.actor_id,
    actor.profile_id,
    "audit actor is the authenticated finance profile",
  );
  assert.deepEqual(audit.old_value, {});
  const payload =
    typeof audit.new_value === "string" ? JSON.parse(audit.new_value) : audit.new_value;
  assert.equal(payload.invoice_id, invoice.invoice_id);
  assert.equal(payload.customer_id, invoice.customer_id);
  assert.equal(payload.amount, "1.00");
  assert.equal(payload.currency, invoice.currency);
  assert.equal(payload.payment_method, "other");
  assert.equal(payload.reference, reference);
  assert.equal(payload.idempotency_key_present, true);
  assert.equal(
    Object.hasOwn(payload, "notes"),
    false,
    "free-form payment notes must not enter the audit payload",
  );
  assert.equal(
    JSON.stringify(payload).includes(idempotencyKey),
    false,
    "raw idempotency key must not be stored in audit data",
  );
  // A privileged/direct database writer must not attribute a tenant-A payment
  // to a profile owned by tenant B; the failed statement must roll back both writes.
  const foreignActorRows = await db.unsafe(
    "select p.id::text as profile_id from public.profiles p " +
      "where p.organization_id is not null and p.organization_id <> $1::uuid limit 1",
    [actor.organization_id],
  );
  assert.equal(
    foreignActorRows.length,
    1,
    "isolated PostgreSQL fixtures must include a profile from another organization",
  );
  const crossTenantActorId = foreignActorRows[0].profile_id;
  const rejectedActorKey = randomUUID();
  const rejectedActorReference = "CI-ACTOR-TENANT-GUARD-" + randomUUID();
  await expectSqlState(
    "payment audit rejects a cross-organization actor",
    () => db.unsafe(
      "insert into public.customer_payments(" +
        "organization_id,customer_id,invoice_id,amount,payment_method,reference,notes,paid_at,created_by,idempotency_key,request_fingerprint" +
      ") values($1::uuid,$2::uuid,$3::uuid,0.25,'other',$4,null,now(),$5::uuid,$6::uuid,repeat('a',64)) returning id",
      [
        actor.organization_id,
        invoice.customer_id,
        invoice.invoice_id,
        rejectedActorReference,
        crossTenantActorId,
        rejectedActorKey,
      ],
    ),
    "23514",
  );
  const rejectedPaymentRows = await db.unsafe(
    "select id from public.customer_payments where organization_id=$1::uuid and idempotency_key=$2::uuid",
    [actor.organization_id, rejectedActorKey],
  );
  assert.equal(
    rejectedPaymentRows.length,
    0,
    "cross-organization actor rejection must leave no customer payment row",
  );
  const rejectedAuditRows = await db.unsafe(
    "select id from public.audit_logs where organization_id=$1::uuid " +
      "and action='customer_payment.recorded' and entity_type='customer_payment' " +
      "and new_value->>'reference'=$2",
    [actor.organization_id, rejectedActorReference],
  );
  assert.equal(
    rejectedAuditRows.length,
    0,
    "cross-organization actor rejection must leave no customer-payment audit event",
  );
  process.stdout.write(
    "PASS customer payment audit actor tenant guard: cross-organization actor rejected with no payment or audit side effects\\n",
  );

  process.stdout.write(
    "PASS customer payment audit: tenant/invoice/customer match, active finance actor, one event per idempotent write, payload conflict rejection, no raw key or notes\n",
  );
}

main()
  .catch((error) => {
    const details = {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      hint: error?.hint,
      stack: error?.stack,
    };
    process.stderr.write(
      "CUSTOMER_PAYMENT_AUDIT_ACCEPTANCE_FAILED " + JSON.stringify(details) + "\n",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 });
  });
