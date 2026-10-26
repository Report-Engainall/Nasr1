import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for dashboard credit-memo parity acceptance.");
}

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const organizationId = randomUUID();
const authUserId = randomUUID();
const profileId = randomUUID();
const sessionId = randomUUID();
const customerId = randomUUID();
const primaryOrderId = randomUUID();
const primaryInvoiceId = randomUUID();
const mixedCurrencyOrderId = randomUUID();
const mixedCurrencyInvoiceId = randomUUID();
const email = "ci-dashboard-credit-parity-" + randomUUID() + "@example.test";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();

function jsonValue(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function setAdminIdentity() {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1::uuid,$2::uuid,now(),now(),now(),null,'CI dashboard credit parity','127.0.0.1'::inet)",
    [sessionId, authUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [authUserId]);
  await db.unsafe(
    "select set_config('request.jwt.claims',$1,true)",
    [JSON.stringify({ sub: authUserId, email, role: "authenticated", session_id: sessionId })],
  );
  await db.unsafe("set local role authenticated");
}

async function dashboard() {
  const row = (await db.unsafe("select * from public.get_staff_dashboard_metrics()"))[0];
  assert.ok(row, "dashboard RPC must return one metrics row");
  return row;
}

async function insertReturnRequest(returnRequestId, orderId, requestSuffix) {
  await db.unsafe(
    "insert into public.customer_return_requests(" +
      "id,organization_id,customer_id,order_id,request_number,status,reason,notes,requested_by,idempotency_key,payload_fingerprint" +
      ") values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'received','damaged','isolated dashboard reporting fixture',$6::uuid,$7,$8)",
    [
      returnRequestId,
      organizationId,
      customerId,
      orderId,
      "CI-DASH-RET-" + requestSuffix,
      profileId,
      "idem-" + requestSuffix,
      "0123456789abcdef0123456789abcdef",
    ],
  );
}

async function insertCreditMemo({ returnRequestId, memoId, memoSuffix, status, amount, currency, mismatch = false }) {
  const posted = status === "posted";
  await db.unsafe(
    "insert into public.customer_return_credit_memos(" +
      "id,organization_id,return_request_id,invoice_id,customer_id,memo_number,status,currency," +
      "subtotal_amount,tax_amount,total_amount,idempotency_key,payload_fingerprint,created_by_profile_id," +
      "posted_by_profile_id,posted_at" +
      ") values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9::numeric,0,$10::numeric,$11::uuid,$12,$13::uuid,$14::uuid,$15)",
    [
      memoId,
      organizationId,
      returnRequestId,
      primaryInvoiceId,
      customerId,
      "CI-DASH-CM-" + memoSuffix,
      status,
      currency,
      amount,
      amount,
      randomUUID(),
      "abcdef0123456789abcdef0123456789",
      profileId,
      posted ? profileId : null,
      posted ? new Date().toISOString() : null,
    ],
  );
  if (mismatch) {
    process.stdout.write("MISMATCH_FIXTURE_SEEDED currency=" + currency + " invoiceCurrency=YER\n");
  }
}

async function main() {
  await db.unsafe("begin");
  try {
    await db.unsafe(
      "insert into public.organizations(id,name,currency) values($1::uuid,$2,'YER')",
      [organizationId, "CI Dashboard Credit Parity " + suffix],
    );
    await db.unsafe(
      "insert into auth.users(id,email,email_confirmed_at) values($1::uuid,$2,now())",
      [authUserId, email],
    );
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
        "values($1::uuid,$2::uuid,$3::uuid,'CI Dashboard Credit Parity',$4,true)",
      [profileId, authUserId, organizationId, email],
    );
    await db.unsafe(
      "insert into public.user_roles(profile_id,role) values($1::uuid,'admin')",
      [profileId],
    );
    await db.unsafe(
      "insert into public.customers(id,organization_id,customer_code,business_name,status) " +
        "values($1::uuid,$2::uuid,$3,'CI Dashboard Credit Parity Customer','approved')",
      [customerId, organizationId, "CI-DASH-CUST-" + suffix],
    );
    await db.unsafe(
      "insert into public.orders(id,organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) " +
        "values($1::uuid,$2::uuid,$3::uuid,$4,'delivered',500,1,'credit parity invoice',$5::uuid)",
      [primaryOrderId, organizationId, customerId, "CI-DASH-ORD-" + suffix, profileId],
    );
    await db.unsafe(
      "insert into public.customer_invoices(id,organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,subtotal,tax_amount,total_amount) " +
        "values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'issued',now(),'YER',500,0,500)",
      [primaryInvoiceId, organizationId, customerId, primaryOrderId, "CI-DASH-INV-" + suffix],
    );

    await setAdminIdentity();
    const original = await dashboard();
    assert.equal(Number(original.receivables_issued), 500, "initial receivables must equal the persisted invoice balance");

    await db.unsafe("reset role");
    const postedRequestId = randomUUID();
    await insertReturnRequest(postedRequestId, primaryOrderId, suffix + "-P");
    await insertCreditMemo({
      returnRequestId: postedRequestId,
      memoId: randomUUID(),
      memoSuffix: suffix + "-P",
      status: "posted",
      amount: 125,
      currency: "YER",
    });

    const draftRequestId = randomUUID();
    await insertReturnRequest(draftRequestId, primaryOrderId, suffix + "-D");
    await insertCreditMemo({
      returnRequestId: draftRequestId,
      memoId: randomUUID(),
      memoSuffix: suffix + "-D",
      status: "draft",
      amount: 50,
      currency: "YER",
    });

    await setAdminIdentity();
    const afterPostedAndDraft = await dashboard();
    assert.equal(
      Number(afterPostedAndDraft.receivables_issued),
      375,
      "only the posted 125.00 credit memo reduces the 500.00 YER invoice; the 50.00 draft is excluded",
    );

    await db.unsafe("reset role");
    await db.unsafe(
      "insert into public.orders(id,organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) " +
        "values($1::uuid,$2::uuid,$3::uuid,$4,'delivered',40,1,'mixed-currency dashboard fixture',$5::uuid)",
      [mixedCurrencyOrderId, organizationId, customerId, "CI-DASH-ORD-USD-" + suffix, profileId],
    );
    await db.unsafe(
      "insert into public.customer_invoices(id,organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,subtotal,tax_amount,total_amount) " +
        "values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'issued',now(),'USD',40,0,40)",
      [mixedCurrencyInvoiceId, organizationId, customerId, mixedCurrencyOrderId, "CI-DASH-INV-USD-" + suffix],
    );
    await setAdminIdentity();
    const mixedCurrency = await dashboard();
    assert.equal(
      mixedCurrency.receivables_issued,
      null,
      "dashboard must not add positive YER and USD outstanding balances together",
    );

    await db.unsafe("reset role");
    const mismatchRequestId = randomUUID();
    await insertReturnRequest(mismatchRequestId, primaryOrderId, suffix + "-X");
    await insertCreditMemo({
      returnRequestId: mismatchRequestId,
      memoId: randomUUID(),
      memoSuffix: suffix + "-X",
      status: "posted",
      amount: 10,
      currency: "USD",
      mismatch: true,
    });
    await setAdminIdentity();
    await assert.rejects(
      () => db.unsafe("select * from public.get_staff_dashboard_metrics()"),
      /posted credit memo source or currency does not reconcile to the dashboard receivables invoice/i,
      "an inconsistent posted credit must fail closed instead of producing a misleading KPI",
    );

    await db.unsafe("rollback");
    process.stdout.write(
      "PASS dashboard credit-memo parity: posted credit reduces receivables; draft excluded; mixed YER/USD not summed; posted source/currency mismatch fails closed; fixtures rolled back\n",
    );
  } catch (error) {
    await db.unsafe("rollback").catch(() => {});
    throw error;
  }
}

main()
  .catch((error) => {
    process.stderr.write(
      "DASHBOARD_CREDIT_MEMO_PARITY_FAILED " +
        JSON.stringify({ name: error?.name, message: error?.message, code: error?.code }) +
        "\n",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 });
  });
