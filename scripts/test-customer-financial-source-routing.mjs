import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = requiredEnv("TEST_DATABASE_URL");
const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
const foreignCustomerEmail = requiredEnv("E2E_EMAIL_B").toLowerCase();
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL").toLowerCase();
const returnReceivableAccountId = requiredEnv("E2E_RETURN_RECEIVABLE_ACCOUNT_ID");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const customerDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const foreignCustomerDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const managerDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const managerRetryDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const accountantDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const serviceDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for financial-source acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
function hash(label) {
  return createHash("sha256").update(label + ":" + randomUUID()).digest("hex");
}
async function setIdentity(client, authUserId, email) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1::uuid,$1::uuid,now(),now(),now(),null,'P2 financial-source acceptance','127.0.0.1'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claim.role','authenticated',false)");
  await client.unsafe(
    "select set_config('request.jwt.claims',$1,false)",
    [JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated", session_id: authUserId })],
  );
  await client.unsafe("set role authenticated");
}
async function setServiceRole(client) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe("select set_config('request.jwt.claim.sub','',false)");
  await client.unsafe("select set_config('request.jwt.claim.role','service_role',false)");
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "service_role" })]);
  await client.unsafe("set role service_role");
}
async function expectFailure(label, promise, code, messagePart) {
  let error = null;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, label + " must be rejected");
  assert.equal(String(error.code), code, label + " SQLSTATE");
  if (messagePart) assert.ok(String(error.message).includes(messagePart), label + " must explain the rejected condition");
  return error;
}
async function rpc(client, sql, params = []) {
  const rows = await client.unsafe(sql, params);
  assert.equal(rows.length, 1, "RPC must return exactly one row");
  return asJson(rows[0].result);
}
const matchingCurrencyBalances = {
  YER: { current_source_balance: "100.00", target_source_balance: "100.0000" },
  USD: { current_source_balance: "25.50", target_source_balance: "25.50" },
};
const mismatchingCurrencyBalances = {
  YER: { current_source_balance: "100.00", target_source_balance: "99.99" },
  USD: { current_source_balance: "25.50", target_source_balance: "25.50" },
};

async function recordReconciliation(requestId, result, asOf, evidenceHash, reference, balancesByCurrency, recordCounts = { invoices: 2, payments: 1, credits: 0 }) {
  return rpc(
    serviceDb,
    "select public.record_customer_financial_source_reconciliation_evidence(" +
      "$1::uuid,$2::timestamptz,$3::text,$4::text,$5::text[],$6::jsonb,$7::jsonb,$8::text) as result",
    [requestId, asOf, evidenceHash, result, ["YER", "USD"],
      JSON.stringify(recordCounts),
      JSON.stringify(balancesByCurrency), reference],
  );
}
async function requestSource(client, customerId, mode, externalRef, reason, key, revision, companyRef = null, branchRef = null) {
  return rpc(
    client,
    "select public.request_customer_financial_source_change(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::text,$8::text) as result",
    [customerId, mode, externalRef, reason, key, revision, companyRef, branchRef],
  );
}
async function reviewSource(client, requestId, decision, reason) {
  return rpc(client, "select public.review_customer_financial_source_change($1::uuid,$2::text,$3::text) as result", [requestId, decision, reason]);
}
async function main() {
  const [customerProfiles, foreignProfiles, managers, accountants] = await Promise.all([
    db.unsafe("select id::text,auth_user_id::text,email,organization_id::text from public.profiles where lower(email)=lower($1) and is_active=true", [customerEmail]),
    db.unsafe("select id::text,auth_user_id::text,email,organization_id::text from public.profiles where lower(email)=lower($1) and is_active=true", [foreignCustomerEmail]),
    db.unsafe("select p.id::text,p.auth_user_id::text,p.email,p.organization_id::text from public.profiles p join public.user_roles r on r.profile_id=p.id and r.role='manager' where lower(p.email)=lower($1) and p.is_active=true", [managerEmail]),
    db.unsafe("select p.id::text,p.auth_user_id::text,p.email,p.organization_id::text from public.profiles p join public.user_roles r on r.profile_id=p.id and r.role='accountant' where lower(p.email)=lower($1) and p.is_active=true", [accountantEmail]),
  ]);
  assert.equal(customerProfiles.length, 1, "primary customer fixture must resolve to one active profile");
  assert.equal(foreignProfiles.length, 1, "foreign customer fixture must resolve to one active profile");
  assert.equal(managers.length, 1, "manager fixture must resolve to one active profile");
  assert.equal(accountants.length, 1, "accountant fixture must resolve to one active profile");
  const customerProfile = customerProfiles[0];
  const foreignProfile = foreignProfiles[0];
  const manager = managers[0];
  const accountant = accountants[0];
  assert.equal(manager.organization_id, accountant.organization_id, "manager and accountant must share the target tenant");
  assert.notEqual(customerProfile.organization_id, foreignProfile.organization_id, "foreign fixture must belong to another tenant");
  assert.equal(manager.organization_id, customerProfile.organization_id, "customer and finance operators must share the target tenant");

  const [customers, foreignCustomers] = await Promise.all([
    db.unsafe("select id::text,organization_id::text,customer_code from public.customers where profile_id=$1::uuid and status='approved'", [customerProfile.id]),
    db.unsafe("select id::text,organization_id::text,customer_code from public.customers where profile_id=$1::uuid and status='approved'", [foreignProfile.id]),
  ]);
  assert.equal(customers.length, 1, "primary E2E profile must own exactly one approved customer account");
  assert.equal(foreignCustomers.length, 1, "foreign E2E profile must own exactly one approved customer account");
  const customerId = customers[0].id;
  const foreignCustomerId = foreignCustomers[0].id;
  const orgId = customerProfile.organization_id;

  // New customers must receive exactly one server-created APP_ONLY binding in the
  // same transaction as the customer row. Keep this fixture in a rollback so the
  // acceptance run leaves no customer or finance-source residue.
  const newCustomerFixtureCode = "FSN-" + randomUUID().slice(0, 12).toUpperCase();
  const newCustomerFixtureIdempotencyMarker = "ROLLBACK_FINANCIAL_SOURCE_NEW_CUSTOMER_FIXTURE";
  let newCustomerFixtureRolledBack = false;
  try {
    await db.begin(async tx => {
      const insertedCustomer = await tx.unsafe(
        "insert into public.customers(" +
          "organization_id,profile_id,customer_code,business_name,contact_name,phone,email," +
          "tier,credit_limit,current_balance,status,approved_at" +
        ") values($1::uuid,NULL,$2::text,$3::text,$4::text,$5::text,$6::text," +
          "'retail',0,0,'approved',statement_timestamp()) returning id::text",
        [
          orgId,
          newCustomerFixtureCode,
          "Financial Source Trigger Acceptance",
          "Financial Source Trigger Acceptance",
          "77" + randomUUID().replace(/-/g, "").slice(0, 7),
          "financial-source-trigger-" + randomUUID() + "@example.invalid",
        ],
      );
      assert.equal(insertedCustomer.length, 1,
        "a newly inserted approved customer fixture must persist inside the transaction");
      const insertedId = insertedCustomer[0].id;
      const bindings = await tx.unsafe(
        "select source_mode,source_status,revision,external_account_ref,source_as_of," +
          "last_synced_at,source_evidence_sha256,verified_at " +
        "from public.customer_financial_source_bindings " +
        "where organization_id=$1::uuid and customer_id=$2::uuid",
        [orgId, insertedId],
      );
      assert.equal(bindings.length, 1,
        "customer AFTER INSERT trigger must create exactly one financial-source binding");
      assert.equal(bindings[0].source_mode, "APP_ONLY");
      assert.equal(bindings[0].source_status, "active");
      assert.equal(bindings[0].revision, 1);
      assert.equal(bindings[0].external_account_ref, null);
      assert.equal(bindings[0].source_as_of, null);
      assert.equal(bindings[0].last_synced_at, null);
      assert.equal(bindings[0].source_evidence_sha256, null);
      assert.equal(bindings[0].verified_at, null);
      const invoiceCount = await tx.unsafe(
        "select count(*)::integer as count from public.customer_invoices " +
        "where organization_id=$1::uuid and customer_id=$2::uuid",
        [orgId, insertedId],
      );
      const receiptCount = await tx.unsafe(
        "select count(*)::integer as count from public.customer_payment_receipts " +
        "where organization_id=$1::uuid and customer_id=$2::uuid",
        [orgId, insertedId],
      );
      assert.equal(invoiceCount[0].count, 0,
        "new-customer source trigger must not synthesize an opening invoice");
      assert.equal(receiptCount[0].count, 0,
        "new-customer source trigger must not synthesize a payment receipt");
      throw new Error(newCustomerFixtureIdempotencyMarker);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== newCustomerFixtureIdempotencyMarker) throw error;
    newCustomerFixtureRolledBack = true;
  }
  assert.equal(newCustomerFixtureRolledBack, true,
    "new-customer financial-source trigger fixture must roll back after assertions");
  const [rolledBackCustomer, rolledBackBinding] = await Promise.all([
    db.unsafe(
      "select count(*)::integer as count from public.customers " +
      "where organization_id=$1::uuid and customer_code=$2::text",
      [orgId, newCustomerFixtureCode],
    ),
    db.unsafe(
      "select count(*)::integer as count from public.customer_financial_source_bindings b " +
      "join public.customers c on c.id=b.customer_id and c.organization_id=b.organization_id " +
      "where c.organization_id=$1::uuid and c.customer_code=$2::text",
      [orgId, newCustomerFixtureCode],
    ),
  ]);
  assert.equal(rolledBackCustomer[0].count, 0,
    "rolled-back new customer must leave no customer row");
  assert.equal(rolledBackBinding[0].count, 0,
    "rolled-back new customer must leave no source binding");

  await Promise.all([
    setIdentity(customerDb, customerProfile.auth_user_id, customerProfile.email),
    setIdentity(foreignCustomerDb, foreignProfile.auth_user_id, foreignProfile.email),
    setIdentity(managerDb, manager.auth_user_id, manager.email),
    setIdentity(managerRetryDb, manager.auth_user_id, manager.email),
    setIdentity(accountantDb, accountant.auth_user_id, accountant.email),
    setServiceRole(serviceDb),
  ]);

  const initialBinding = await db.unsafe(
    "select source_mode,source_status,revision,external_account_ref,company_external_ref,branch_external_ref from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  assert.equal(initialBinding.length, 1, "all existing customers must be backfilled to one source binding");
  assert.equal(initialBinding[0].source_mode, "APP_ONLY", "legacy customers stay APP_ONLY until approved cutover");
  assert.equal(initialBinding[0].source_status, "active");
  assert.equal(initialBinding[0].external_account_ref, null);
  assert.equal(initialBinding[0].company_external_ref, null);
  assert.equal(initialBinding[0].branch_external_ref, null);

  // A provider-backed binding cannot be represented as valid until the source
  // reconciliation has a recorded sync timestamp. A failed cutover-shaped write
  // must leave the existing APP_ONLY binding byte-for-byte unchanged.
  let missingExternalSyncTimeRejected = false;
  try {
    await db.unsafe(
      "update public.customer_financial_source_bindings " +
        "set source_mode='ONYX',source_status='active',external_account_ref='ONYX-UNVERIFIED-ACCOUNT'," +
        "source_as_of=statement_timestamp(),last_synced_at=null," +
        "source_evidence_sha256=$3::text,verified_at=statement_timestamp() " +
      "where organization_id=$1::uuid and customer_id=$2::uuid",
      [orgId, customerId, "a".repeat(64)],
    );
  } catch (error) {
    assert.equal(String(error.code), "23514",
      "external source activation without last_synced_at must fail its database CHECK");
    missingExternalSyncTimeRejected = true;
  }
  assert.equal(missingExternalSyncTimeRejected, true,
    "the database must reject an ERP binding with a missing last-sync timestamp");
  const bindingAfterRejectedExternalWrite = await db.unsafe(
    "select source_mode,source_status,revision,external_account_ref,source_as_of,last_synced_at," +
      "source_evidence_sha256,verified_at " +
    "from public.customer_financial_source_bindings " +
    "where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  assert.equal(bindingAfterRejectedExternalWrite.length, 1);
  assert.equal(bindingAfterRejectedExternalWrite[0].source_mode, "APP_ONLY");
  assert.equal(bindingAfterRejectedExternalWrite[0].source_status, "active");
  assert.equal(bindingAfterRejectedExternalWrite[0].revision, 1);
  assert.equal(bindingAfterRejectedExternalWrite[0].external_account_ref, null);
  assert.equal(bindingAfterRejectedExternalWrite[0].source_as_of, null);
  assert.equal(bindingAfterRejectedExternalWrite[0].last_synced_at, null);
  assert.equal(bindingAfterRejectedExternalWrite[0].source_evidence_sha256, null);
  assert.equal(bindingAfterRejectedExternalWrite[0].verified_at, null);

  const foreignBinding = await db.unsafe(
    "select source_mode from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid",
    [foreignProfile.organization_id, foreignCustomerId],
  );
  assert.equal(foreignBinding[0]?.source_mode, "APP_ONLY");

  const resolverBefore = await rpc(customerDb, "select public.get_my_customer_financial_source() as result");
  assert.equal(resolverBefore.source_mode, "APP_ONLY");
  assert.equal(resolverBefore.can_read_app_ledger, true);
  const appOnlyInvoiceRead = await rpc(customerDb,
    "select public.customer_app_only_invoice_read_allowed($1::uuid,$2::uuid) as result",
    [customerId, orgId],
  );
  assert.equal(appOnlyInvoiceRead, true, "APP_ONLY customer may read their own invoice metadata");
  const initialStatement = await rpc(customerDb, "select public.get_customer_account_statement() as result");
  assert.ok(Array.isArray(initialStatement.summary), "APP_ONLY statement retains the existing ledger contract");
  let initialSummary = JSON.stringify(initialStatement.summary);


  // Seed a real order, invoice and invoice line so the APP_ONLY/ONYX RLS checks
  // cannot pass vacuously when the customer has no invoice rows.
  const sourceTestOrderId = randomUUID();
  const sourceTestInvoiceId = randomUUID();
  const sourceTestInvoiceItemId = randomUUID();
  const sourceTestSecondOrderId = randomUUID();
  const sourceTestSecondInvoiceId = randomUUID();
  const sourceTestSecondInvoiceNumber = "FIN-SOURCE-SECOND-" + randomUUID().slice(0, 8).toUpperCase();
  const sourceTestInvoiceNumber = "FIN-SOURCE-" + randomUUID().slice(0, 8).toUpperCase();
  await db.unsafe(
    "insert into public.orders (id,organization_id,customer_id,order_number,status,notes,created_by,idempotency_key,idempotency_payload_hash) " +
      "values ($1::uuid,$2::uuid,$3::uuid,$4::text,'pending','financial source RLS test fixture',$5::uuid,$6::text,$7::text)",
    [sourceTestOrderId, orgId, customerId, "ORD-" + sourceTestInvoiceNumber, customerProfile.id, randomUUID(), "0".repeat(64)],
  );
  await db.unsafe(
    "insert into public.customer_invoices (id,organization_id,customer_id,order_id,invoice_number,status,currency,subtotal,tax_amount,total_amount) " +
      "values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,'issued','YER',125,0,125)",
    [sourceTestInvoiceId, orgId, customerId, sourceTestOrderId, sourceTestInvoiceNumber],
  );
  await db.unsafe(
    "insert into public.customer_invoice_items (id,organization_id,invoice_id,item_code,description,unit,quantity,unit_price,line_total) " +
      "values ($1::uuid,$2::uuid,$3::uuid,'FIN-SOURCE-ITEM','Financial source isolation fixture','box',1,125,125)",
    [sourceTestInvoiceItemId, orgId, sourceTestInvoiceId],
  );


  await db.unsafe(
    "insert into public.orders (id,organization_id,customer_id,order_number,status,notes,created_by,idempotency_key,idempotency_payload_hash) " +
      "values ($1::uuid,$2::uuid,$3::uuid,$4::text,'pending','financial source receipt fixture',$5::uuid,$6::text,$7::text)",
    [sourceTestSecondOrderId, orgId, customerId, "ORD-" + sourceTestSecondInvoiceNumber, customerProfile.id, randomUUID(), "0".repeat(64)],
  );
  await db.unsafe(
    "insert into public.customer_invoices (id,organization_id,customer_id,order_id,invoice_number,status,currency,subtotal,tax_amount,total_amount) " +
      "values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,'issued','YER',85,0,85)",
    [sourceTestSecondInvoiceId, orgId, customerId, sourceTestSecondOrderId, sourceTestSecondInvoiceNumber],
  );

  const sourceTestReceiptIdempotencyKey = randomUUID();
  const seededReceipt = await rpc(accountantDb,
    "select public.record_customer_payment_allocation(" +
      "jsonb_build_array(" +
        "jsonb_build_object('invoice_id',$1::uuid,'amount','5.00')," +
        "jsonb_build_object('invoice_id',$2::uuid,'amount','7.00')" +
      "),'cash',$3::uuid,'FIN-SOURCE-RECEIPT','source routing acceptance fixture') as result",
    [sourceTestInvoiceId, sourceTestSecondInvoiceId, sourceTestReceiptIdempotencyKey],
  );
  const sourceTestReceiptId = seededReceipt.receipt_id;
  assert.ok(sourceTestReceiptId, "a real two-invoice customer receipt is atomically saved");

  const sourceTestSinglePaymentIdempotencyKey = randomUUID();
  const sourceTestSinglePaymentId = await rpc(accountantDb,
    "select public.record_customer_payment($1::uuid,1.00::numeric,'cash',$2::uuid," +
      "'FIN-SOURCE-SINGLE','source routing single-payment acceptance fixture') as result",
    [sourceTestInvoiceId, sourceTestSinglePaymentIdempotencyKey],
  );
  assert.ok(sourceTestSinglePaymentId,
    "APP_ONLY finance accepts a real idempotent single-invoice payment");

  // Existing invoice/payment journal writers use generic source_type values and
  // can outlive their source records. Prove those journal headers/lines are bound
  // to the same customer source even when a writer is bypassed or a draft is replayed.
  const sourceTestInvoiceJournalId = randomUUID();
  const sourceTestPaymentJournalId = randomUUID();
  const invoicePaymentJournalFixtures = [
    { id: sourceTestInvoiceJournalId, sourceType: "invoice", sourceId: sourceTestInvoiceId, description: "Financial-source customer invoice journal fixture" },
    { id: sourceTestPaymentJournalId, sourceType: "payment", sourceId: sourceTestSinglePaymentId, description: "Financial-source customer payment journal fixture" },
  ];
  for (const fixture of invoicePaymentJournalFixtures) {
    await db.unsafe(
      "insert into public.accounting_journal_entries(" +
        "id,organization_id,entry_date,description,source_type,source_reference,status," +
        "idempotency_key,payload_fingerprint,created_by_profile_id" +
      ") values($1::uuid,$2::uuid,(statement_timestamp() at time zone 'UTC')::date,$3::text," +
        "$4::text,$5::text,'draft',$6::uuid,$7::text,$8::uuid)",
      [fixture.id,orgId,fixture.description,fixture.sourceType,fixture.sourceId,randomUUID(),"6".repeat(32),manager.id],
    );
    await db.unsafe(
      "insert into public.accounting_journal_lines(" +
        "organization_id,journal_entry_id,line_number,account_id,debit,credit,memo" +
      ") values($1::uuid,$2::uuid,1,$3::uuid,1.00,0.00,'Financial-source invoice/payment journal line fixture')",
      [orgId,fixture.id,returnReceivableAccountId],
    );
  }

  // Mirror the real customer accounting source-posting links for these two
  // source-bound journals. The relation itself is protected and append-only.
  const customerSourcePostingFixtures = [
    { sourceType:"customer_invoice",sourceId:sourceTestInvoiceId,journalId:sourceTestInvoiceJournalId,amount:"125.00",revenueAccountId:returnReceivableAccountId,settlementAccountId:null },
    { sourceType:"customer_payment",sourceId:sourceTestSinglePaymentId,journalId:sourceTestPaymentJournalId,amount:"1.00",revenueAccountId:null,settlementAccountId:returnReceivableAccountId },
  ];
  for (const fixture of customerSourcePostingFixtures) {
    await db.unsafe(
      "insert into public.accounting_customer_source_postings(" +
        "organization_id,source_type,source_id,posting_kind,journal_entry_id,source_amount,source_currency," +
        "receivable_account_id,revenue_account_id,settlement_account_id,idempotency_key,payload_fingerprint,created_by_profile_id" +
      ") values($1::uuid,$2::text,$3::uuid,'original',$4::uuid,$5::numeric,'YER',$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10::text,$11::uuid)",
      [orgId,fixture.sourceType,fixture.sourceId,fixture.journalId,fixture.amount,returnReceivableAccountId,
        fixture.revenueAccountId,fixture.settlementAccountId,randomUUID(),"8".repeat(32),manager.id],
    );
  }
  async function assertInvoicePaymentJournalsDenied(sourceLabel) {
    for (const fixture of invoicePaymentJournalFixtures) {
      const headerBefore = await db.unsafe(
        "select organization_id::text as organization_id,source_type,source_reference,status,description " +
        "from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid",
        [fixture.id,orgId],
      );
      assert.equal(headerBefore.length,1,sourceLabel+" "+fixture.sourceType+" journal fixture exists");
      await expectFailure(
        sourceLabel+" cannot mutate APP_ONLY "+fixture.sourceType+" journal header",
        db.unsafe(
          "update public.accounting_journal_entries set description=description " +
          "where id=$1::uuid and organization_id=$2::uuid",
          [fixture.id,orgId],
        ),
        "55000",
        "active APP_ONLY financial source",
      );
      const headerAfter = await db.unsafe(
        "select organization_id::text as organization_id,source_type,source_reference,status,description " +
        "from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid",
        [fixture.id,orgId],
      );
      assert.deepEqual(headerAfter,headerBefore,
        sourceLabel+" denied "+fixture.sourceType+" header update leaves the stored journal unchanged");

      const lineBefore = await db.unsafe(
        "select organization_id::text as organization_id,journal_entry_id::text as journal_entry_id," +
          "line_number,account_id::text as account_id,debit::text as debit,credit::text as credit,memo " +
        "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
        [orgId,fixture.id],
      );
      assert.equal(lineBefore.length,1,sourceLabel+" "+fixture.sourceType+" journal line fixture exists");
      await expectFailure(
        sourceLabel+" cannot mutate APP_ONLY "+fixture.sourceType+" journal line",
        db.unsafe(
          "update public.accounting_journal_lines set memo=memo " +
          "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
          [orgId,fixture.id],
        ),
        "55000",
        "active APP_ONLY financial source",
      );
      const lineAfter = await db.unsafe(
        "select organization_id::text as organization_id,journal_entry_id::text as journal_entry_id," +
          "line_number,account_id::text as account_id,debit::text as debit,credit::text as credit,memo " +
        "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
        [orgId,fixture.id],
      );
      assert.deepEqual(lineAfter,lineBefore,
        sourceLabel+" denied "+fixture.sourceType+" line update preserves debit, credit and account");

      await expectFailure(
        sourceLabel+" cannot insert a second APP_ONLY "+fixture.sourceType+" journal header",
        db.unsafe(
          "insert into public.accounting_journal_entries(" +
            "id,organization_id,entry_date,description,source_type,source_reference,status," +
            "idempotency_key,payload_fingerprint,created_by_profile_id" +
          ") values($1::uuid,$2::uuid,(statement_timestamp() at time zone 'UTC')::date,$3::text," +
            "$4::text,$5::text,'draft',$6::uuid,$7::text,$8::uuid)",
          [randomUUID(),orgId,"Blocked duplicate "+fixture.sourceType+" journal",fixture.sourceType,fixture.sourceId,randomUUID(),"7".repeat(32),manager.id],
        ),
        "55000",
        "active APP_ONLY financial source",
      );
      await expectFailure(
        sourceLabel+" cannot insert an additional APP_ONLY "+fixture.sourceType+" journal line",
        db.unsafe(
          "insert into public.accounting_journal_lines(" +
            "organization_id,journal_entry_id,line_number,account_id,debit,credit,memo" +
          ") values($1::uuid,$2::uuid,2,$3::uuid,1.00,0.00,'Blocked external-source journal line')",
          [orgId,fixture.id,returnReceivableAccountId],
        ),
        "55000",
        "active APP_ONLY financial source",
      );
      await expectFailure(
        sourceLabel+" cannot delete APP_ONLY "+fixture.sourceType+" journal line",
        db.unsafe(
          "delete from public.accounting_journal_lines " +
          "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
          [orgId,fixture.id],
        ),
        "55000",
        "active APP_ONLY financial source",
      );
      await expectFailure(
        sourceLabel+" cannot delete APP_ONLY "+fixture.sourceType+" journal header",
        db.unsafe(
          "delete from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid",
          [fixture.id,orgId],
        ),
        "55000",
        "active APP_ONLY financial source",
      );

      const postingFixture = customerSourcePostingFixtures.find(row => row.journalId===fixture.id);
      assert.ok(postingFixture,sourceLabel+" source posting fixture maps to "+fixture.sourceType+" journal");
      const postingBefore = await db.unsafe(
        "select id::text as id,organization_id::text as organization_id,source_type,source_id::text as source_id," +
          "posting_kind,journal_entry_id::text as journal_entry_id,source_amount::text as source_amount,source_currency," +
          "receivable_account_id::text as receivable_account_id,revenue_account_id::text as revenue_account_id," +
          "tax_account_id::text as tax_account_id,settlement_account_id::text as settlement_account_id," +
          "idempotency_key::text as idempotency_key,payload_fingerprint,reversal_reason,created_by_profile_id::text as created_by_profile_id " +
        "from public.accounting_customer_source_postings where organization_id=$1::uuid and journal_entry_id=$2::uuid",
        [orgId,fixture.id],
      );
      assert.equal(postingBefore.length,1,sourceLabel+" "+fixture.sourceType+" posting evidence exists");
      await expectFailure(
        sourceLabel+" cannot mutate APP_ONLY "+fixture.sourceType+" accounting source-posting evidence",
        db.unsafe(
          "update public.accounting_customer_source_postings set payload_fingerprint=payload_fingerprint " +
          "where organization_id=$1::uuid and journal_entry_id=$2::uuid",
          [orgId,fixture.id],
        ),
        "55000",
        "active APP_ONLY financial source",
      );
      await expectFailure(
        sourceLabel+" cannot delete APP_ONLY "+fixture.sourceType+" accounting source-posting evidence",
        db.unsafe(
          "delete from public.accounting_customer_source_postings " +
          "where organization_id=$1::uuid and journal_entry_id=$2::uuid",
          [orgId,fixture.id],
        ),
        "55000",
        "active APP_ONLY financial source",
      );
      const postingAfter = await db.unsafe(
        "select id::text as id,organization_id::text as organization_id,source_type,source_id::text as source_id," +
          "posting_kind,journal_entry_id::text as journal_entry_id,source_amount::text as source_amount,source_currency," +
          "receivable_account_id::text as receivable_account_id,revenue_account_id::text as revenue_account_id," +
          "tax_account_id::text as tax_account_id,settlement_account_id::text as settlement_account_id," +
          "idempotency_key::text as idempotency_key,payload_fingerprint,reversal_reason,created_by_profile_id::text as created_by_profile_id " +
        "from public.accounting_customer_source_postings where organization_id=$1::uuid and journal_entry_id=$2::uuid",
        [orgId,fixture.id],
      );
      assert.deepEqual(postingAfter,postingBefore,
        sourceLabel+" denied source-posting CRUD preserves the exact evidence row");
    }
  }

  const appOnlyCustomer360 = await rpc(managerDb,
    "select public.get_staff_customer_360($1::uuid) as result",
    [customerId]);
  assert.equal(appOnlyCustomer360.customer.id, customerId,
    "APP_ONLY Customer 360 returns the scoped customer");
  assert.ok(Array.isArray(appOnlyCustomer360.finance_by_currency),
    "APP_ONLY Customer 360 returns its currency-separated finance projection");

  const appOnlyStaffInvoiceRows = await managerDb.unsafe(
    "select id from public.customer_invoices where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
    [sourceTestInvoiceId, orgId, customerId],
  );
  const appOnlyStaffInvoiceItemRows = await managerDb.unsafe(
    "select id from public.customer_invoice_items where id=$1::uuid and invoice_id=$2::uuid",
    [sourceTestInvoiceItemId, sourceTestInvoiceId],
  );
  assert.equal(appOnlyStaffInvoiceRows.length, 1,
    "finance staff can read APP_ONLY invoice metadata inside their active tenant");
  assert.equal(appOnlyStaffInvoiceItemRows.length, 1,
    "finance staff can read APP_ONLY invoice line metadata inside their active tenant");

  const appOnlyReceiptOptions = await rpc(accountantDb,
    "select public.get_customer_payment_receipt_print_options(100,0) as result");
  assert.ok(appOnlyReceiptOptions.receipts.some(row => row.id === sourceTestReceiptId),
    "APP_ONLY receipt selector includes the saved receipt");

  // The SECURITY DEFINER staff receipt-page RPC bypasses RLS, so it must lock
  // every eligible source binding itself before composing the cross-customer page.
  await accountantDb.begin(async tx => {
    await setIdentity(tx, accountant.auth_user_id, accountant.email);
    const lockedReceiptPage = await rpc(tx,
      "select public.get_customer_payment_receipt_print_options(100,0) as result");
    assert.ok(lockedReceiptPage.receipts.some(row => row.id === sourceTestReceiptId),
      "staff receipt page returns APP_ONLY receipt while holding eligible source bindings");
    await expectFailure(
      "staff receipt page source snapshot blocks concurrent cutover",
      serviceDb.unsafe(
        "select 1 from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid for update nowait",
        [orgId, customerId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });

  // Direct finance staff receipt-history reads must hold the source binding just
  // like invoice RLS, receipt print and statement RPCs do.
  await accountantDb.begin(async tx => {
    await setIdentity(tx, accountant.auth_user_id, accountant.email);
    const lockedReceipts = await tx.unsafe(
      "select id from public.customer_payment_receipts " +
      "where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
      [sourceTestReceiptId, orgId, customerId],
    );
    assert.equal(lockedReceipts.length, 1,
      "finance staff RLS receipt read returns the APP_ONLY receipt");
    await expectFailure(
      "direct finance receipt RLS read blocks an exclusive source cutover until its transaction ends",
      serviceDb.unsafe(
        "select 1 from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid for update nowait",
        [orgId, customerId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });
  const appOnlyReceiptPrint = await rpc(accountantDb,
    "select public.get_staff_customer_payment_receipt_print_data($1::uuid) as result",
    [sourceTestReceiptId],
  );
  assert.equal(appOnlyReceiptPrint.receipt.id, sourceTestReceiptId,
    "APP_ONLY receipt print returns the saved receipt");
  assert.equal(appOnlyReceiptPrint.allocations.length, 2,
    "APP_ONLY receipt print reconciles both saved invoice allocations");
  const staffPrintedAllocationTotal = appOnlyReceiptPrint.allocations.reduce(
    (sum, allocation) => sum + Number(allocation.amount), 0,
  );
  assert.equal(staffPrintedAllocationTotal, Number(appOnlyReceiptPrint.receipt.total_amount),
    "staff print DTO amounts must reconcile exactly to the saved receipt header");

  const customerReceiptOptions = await rpc(customerDb,
    "select public.get_my_customer_payment_receipt_print_options(50,0) as result");
  assert.equal(customerReceiptOptions.limit, 50);
  assert.equal(customerReceiptOptions.offset, 0);
  assert.ok(customerReceiptOptions.receipts.some(row => row.id === sourceTestReceiptId),
    "APP_ONLY customer can list the saved receipt belonging to its own account");
  assert.ok(customerReceiptOptions.receipts.every(row => row.customer_code === customers[0].customer_code),
    "customer receipt selector is scoped to the authenticated customer");
  const customerReceiptPrint = await rpc(customerDb,
    "select public.get_my_customer_payment_receipt_print_data($1::uuid) as result",
    [sourceTestReceiptId]);
  assert.equal(customerReceiptPrint.receipt.id, sourceTestReceiptId);
  assert.equal(customerReceiptPrint.receipt.allocation_count, 2);
  assert.equal(customerReceiptPrint.customer.id, customerId);
  assert.equal(customerReceiptPrint.customer.customer_code, customers[0].customer_code,
    "customer print DTO is bound to the resolved customer account code");

  assert.equal(customerReceiptPrint.allocations.length, 2,
    "customer print returns both verified saved invoice allocations");
  const printedAllocationTotal = customerReceiptPrint.allocations.reduce(
    (sum, allocation) => sum + Number(allocation.amount), 0,
  );
  assert.equal(printedAllocationTotal, Number(customerReceiptPrint.receipt.total_amount),
    "the exact printed allocation DTO must sum to the saved receipt total");
  assert.deepEqual(Object.keys(customerReceiptPrint.customer).sort(),
    ["business_name","contact_name","customer_code","id"].sort(),
    "customer print DTO excludes profile, tenant and internal identity fields");
  assert.equal(customerReceiptPrint.receipt.reference, "FIN-SOURCE-RECEIPT");

  const customerReceiptRpcPrivileges = await db.unsafe(
    "select " +
      "has_function_privilege('authenticated','public.get_my_customer_payment_receipt_print_options(integer,integer)','EXECUTE') as auth_options," +
      "has_function_privilege('anon','public.get_my_customer_payment_receipt_print_options(integer,integer)','EXECUTE') as anon_options," +
      "has_function_privilege('authenticated','public.get_my_customer_payment_receipt_print_data(uuid)','EXECUTE') as auth_print," +
      "has_function_privilege('anon','public.get_my_customer_payment_receipt_print_data(uuid)','EXECUTE') as anon_print," +
      "(select prosecdef from pg_catalog.pg_proc where oid='public.get_my_customer_payment_receipt_print_options(integer,integer)'::regprocedure) as options_security_definer," +
      "(select prosecdef from pg_catalog.pg_proc where oid='public.get_my_customer_payment_receipt_print_data(uuid)'::regprocedure) as print_security_definer",
  );
  assert.equal(customerReceiptRpcPrivileges[0].auth_options, true);
  assert.equal(customerReceiptRpcPrivileges[0].auth_print, true);
  assert.equal(customerReceiptRpcPrivileges[0].anon_options, false);
  assert.equal(customerReceiptRpcPrivileges[0].anon_print, false);
  assert.equal(customerReceiptRpcPrivileges[0].options_security_definer, true);
  assert.equal(customerReceiptRpcPrivileges[0].print_security_definer, true);

  const receiptPrintFunctionDefinitions = await db.unsafe(
    "select " +
      "pg_catalog.pg_get_functiondef('public.get_my_customer_payment_receipt_print_data(uuid)'::regprocedure) as customer_print," +
      "pg_catalog.pg_get_functiondef('public.get_staff_customer_payment_receipt_print_data(uuid)'::regprocedure) as staff_print," +
      "pg_catalog.pg_get_functiondef('public.get_customer_payment_receipt_print_options(integer,integer)'::regprocedure) as staff_options",
  );
  const customerPrintDefinition = receiptPrintFunctionDefinitions[0].customer_print.toLowerCase();
  const staffPrintDefinition = receiptPrintFunctionDefinitions[0].staff_print.toLowerCase();
  assert.ok(customerPrintDefinition.includes("for update"),
    "customer receipt print must take the parent receipt row lock");
  assert.ok(customerPrintDefinition.includes("receipt_allocations as materialized"),
    "customer print must validate and render one materialized allocation snapshot");
  assert.ok(staffPrintDefinition.includes("for update"),
    "staff receipt print must take the parent receipt row lock");
  assert.ok(staffPrintDefinition.includes("staff_receipt_allocations as materialized"),
    "staff print must validate and render one materialized allocation snapshot");
  const staffOptionsDefinition = receiptPrintFunctionDefinitions[0].staff_options.toLowerCase();
  assert.ok(staffOptionsDefinition.includes("scoped_receipts as materialized"),
    "staff receipt pagination must compute total and rows from one materialized snapshot");
  assert.ok(staffOptionsDefinition.includes("page_receipts as materialized"),
    "staff receipt pagination must materialize a stable ordered page from the scoped snapshot");

  await expectFailure(
    "customer receipt history rejects an out-of-range page limit",
    rpc(customerDb, "select public.get_my_customer_payment_receipt_print_options(101,0) as result"),
    "22023",
    "limit of 1..100",
  );
  assert.ok(!(await rpc(foreignCustomerDb,
    "select public.get_my_customer_payment_receipt_print_options(50,0) as result"))
    .receipts.some(row => row.id === sourceTestReceiptId),
    "another tenant's customer receipt never appears in the foreign customer's selector");
  await expectFailure(
    "another tenant's customer cannot print this customer's receipt",
    rpc(foreignCustomerDb,
      "select public.get_my_customer_payment_receipt_print_data($1::uuid) as result",
      [sourceTestReceiptId]),
    "P0002",
    "not found for this account",
  );

  // Prove the print RPC keeps the APP_ONLY binding locked until its transaction ends.
  await customerDb.begin(async tx => {
    await setIdentity(tx, customerProfile.auth_user_id, customerProfile.email);
    const lockedPrint = await rpc(tx,
      "select public.get_my_customer_payment_receipt_print_data($1::uuid) as result",
      [sourceTestReceiptId]);
    assert.equal(lockedPrint.receipt.id, sourceTestReceiptId);
    await expectFailure(
      "source cutover cannot take an exclusive binding lock during customer receipt printing",
      serviceDb.unsafe(
        "select 1 from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid for update nowait",
        [orgId, customerId],
      ),
      "55P03",
    );
    await expectFailure(
      "customer receipt print holds the saved receipt header against concurrent mutation",
      serviceDb.unsafe(
        "select id from public.customer_payment_receipts where id=$1::uuid for update nowait",
        [sourceTestReceiptId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
    // A new customer_payments row must validate its receipt foreign key using KEY SHARE.
    // The print transaction's FOR UPDATE receipt lock must reject that reference,
    // or a phantom allocation could appear after the reconciled DTO was assembled.
    await expectFailure(
      "customer receipt print rejects a concurrent FK KEY SHARE reference that could append a phantom allocation",
      serviceDb.unsafe(
        "select id from public.customer_payment_receipts where id=$1::uuid for key share nowait",
        [sourceTestReceiptId],
      ),
      "55P03",
      "could not obtain lock on row",
    );

    await expectFailure(
      "customer receipt print holds all existing allocation rows against concurrent mutation",
      serviceDb.unsafe(
        "select id from public.customer_payments where receipt_id=$1::uuid for update nowait",
        [sourceTestReceiptId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });

  // Staff print uses the same binding -> receipt -> allocations lock order.
  await managerDb.begin(async tx => {
    await setIdentity(tx, manager.auth_user_id, manager.email);
    const staffLockedPrint = await rpc(tx,
      "select public.get_staff_customer_payment_receipt_print_data($1::uuid) as result",
      [sourceTestReceiptId]);
    assert.equal(staffLockedPrint.receipt.id, sourceTestReceiptId);
    await expectFailure(
      "staff receipt printer blocks a concurrent FK KEY SHARE reference that could append a phantom allocation",
      serviceDb.unsafe(
        "select id from public.customer_payment_receipts where id=$1::uuid for key share nowait",
        [sourceTestReceiptId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
    await expectFailure(
      "staff receipt printer blocks concurrent allocation-row mutation",
      serviceDb.unsafe(
        "select id from public.customer_payments where receipt_id=$1::uuid for update nowait",
        [sourceTestReceiptId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });

  // A corrupt/missing allocation must not print. The fixture deletion rolls back.
  const rollbackMarker = "ROLLBACK_CUSTOMER_RECEIPT_ALLOCATION_FIXTURE";
  let allocationFixtureRolledBack = false;
  try {
    await db.begin(async tx => {
      const removed = await tx.unsafe(
        "delete from public.customer_payments where receipt_id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid and invoice_id=$4::uuid returning id",
        [sourceTestReceiptId, orgId, customerId, sourceTestSecondInvoiceId],
      );
      assert.equal(removed.length, 1, "one disposable receipt allocation is removed for the corruption test");
      await setIdentity(tx, customerProfile.auth_user_id, customerProfile.email);
      await expectFailure(
        "customer receipt printer rejects a missing invoice allocation",
        rpc(tx, "select public.get_my_customer_payment_receipt_print_data($1::uuid) as result", [sourceTestReceiptId]),
        "22023",
        "receipt allocations do not reconcile",
      );
      throw new Error(rollbackMarker);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
    allocationFixtureRolledBack = true;
  }
  assert.equal(allocationFixtureRolledBack, true, "receipt allocation corruption fixture is rolled back");
  const restoredReceiptAllocations = await db.unsafe(
    "select count(*)::integer as count from public.customer_payments where receipt_id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
    [sourceTestReceiptId, orgId, customerId],
  );
  assert.equal(restoredReceiptAllocations[0].count, 2, "the persisted receipt remains unchanged after the rejected print fixture");


  const appPaymentSourceDecision = await rpc(managerDb,
    "select public.staff_customer_app_only_financial_rows_read_allowed($1::uuid,$2::uuid) as result",
    [customerId, orgId]);
  assert.equal(appPaymentSourceDecision, true,
    "manager source guard permits APP_ONLY allocations inside the active organization");
  const paymentSourcePolicy = await db.unsafe(
    "select c.relrowsecurity,p.polpermissive,pg_catalog.pg_get_expr(p.polqual,p.polrelid) as predicate " +
      "from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid " +
      "join pg_catalog.pg_namespace n on n.oid=c.relnamespace " +
      "where n.nspname='public' and c.relname='customer_payments' and p.polname='customer_payment_financial_source_read_guard'",
  );
  assert.equal(paymentSourcePolicy.length, 1, "payment source restrictive policy must be installed");
  assert.equal(paymentSourcePolicy[0].relrowsecurity, true, "customer_payments RLS must be enabled");
  assert.equal(paymentSourcePolicy[0].polpermissive, false, "payment source policy must be restrictive");
  assert.ok(paymentSourcePolicy[0].predicate.includes("staff_customer_app_only_financial_rows_read_allowed"),
    "payment source policy must invoke the server-owned boolean guard");
  const statementAfterReceipt = await rpc(customerDb,
    "select public.get_customer_account_statement() as result");
  initialSummary = JSON.stringify(statementAfterReceipt.summary);

  const appOnlyInvoiceRows = await customerDb.unsafe(
    "select id from public.customer_invoices where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
    [sourceTestInvoiceId, orgId, customerId],
  );
  const appOnlyInvoiceItemRows = await customerDb.unsafe(
    "select id from public.customer_invoice_items where id=$1::uuid and organization_id=$2::uuid and invoice_id=$3::uuid",
    [sourceTestInvoiceItemId, orgId, sourceTestInvoiceId],
  );
  assert.equal(appOnlyInvoiceRows.length, 1, "APP_ONLY customer can read a real own invoice row");
  assert.equal(appOnlyInvoiceItemRows.length, 1, "APP_ONLY customer can read a real own invoice line");

  // Direct invoice and invoice-line RLS reads must hold the active source binding
  // FOR SHARE until the transaction ends. This serializes them with the exclusive
  // binding lock taken by Maker/Checker source cutover.
  await customerDb.begin(async tx => {
    await setIdentity(tx, customerProfile.auth_user_id, customerProfile.email);
    const lockedCustomerInvoices = await tx.unsafe(
      "select id from public.customer_invoices where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
      [sourceTestInvoiceId, orgId, customerId],
    );
    assert.equal(lockedCustomerInvoices.length, 1,
      "customer RLS invoice read returns the APP_ONLY invoice while holding its source binding");
    const lockedCustomerInvoiceItems = await tx.unsafe(
      "select id from public.customer_invoice_items where id=$1::uuid and organization_id=$2::uuid and invoice_id=$3::uuid",
      [sourceTestInvoiceItemId, orgId, sourceTestInvoiceId],
    );
    assert.equal(lockedCustomerInvoiceItems.length, 1,
      "customer RLS invoice-line read returns the APP_ONLY line while holding its source binding");
    await expectFailure(
      "customer direct invoice RLS read blocks an exclusive source cutover until its transaction ends",
      serviceDb.unsafe(
        "select 1 from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid for update nowait",
        [orgId, customerId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });

  await managerDb.begin(async tx => {
    await setIdentity(tx, manager.auth_user_id, manager.email);
    const lockedStaffInvoices = await tx.unsafe(
      "select id from public.customer_invoices where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
      [sourceTestInvoiceId, orgId, customerId],
    );
    assert.equal(lockedStaffInvoices.length, 1,
      "finance staff RLS invoice read returns the APP_ONLY invoice");
    const lockedStaffInvoiceItems = await tx.unsafe(
      "select id from public.customer_invoice_items where id=$1::uuid and organization_id=$2::uuid and invoice_id=$3::uuid",
      [sourceTestInvoiceItemId, orgId, sourceTestInvoiceId],
    );
    assert.equal(lockedStaffInvoiceItems.length, 1,
      "finance staff RLS invoice-line read returns the APP_ONLY line");
    await expectFailure(
      "staff direct invoice RLS read blocks an exclusive source cutover until its transaction ends",
      serviceDb.unsafe(
        "select 1 from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid for update nowait",
        [orgId, customerId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });

  const appOnlyInvoicePdf = await rpc(customerDb,
    "select public.get_customer_invoice_pdf($1::uuid) as result",
    [sourceTestInvoiceId],
  );
  assert.equal(appOnlyInvoicePdf.invoice.id, sourceTestInvoiceId, "APP_ONLY customer can print the own invoice document");
  const foreignResolver = await rpc(foreignCustomerDb, "select public.get_my_customer_financial_source() as result");
  assert.equal(foreignResolver.source_mode, "APP_ONLY");
  await rpc(foreignCustomerDb, "select public.get_customer_account_statement() as result");

  const directPrivileges = await managerDb.unsafe(
    "select has_table_privilege('authenticated','public.customer_financial_source_bindings','SELECT') as binding_read," +
      "has_table_privilege('authenticated','public.customer_financial_source_change_requests','SELECT') as request_read," +
      "has_table_privilege('authenticated','public.customer_financial_source_sync_evidence','SELECT') as sync_read," +
      "has_table_privilege('service_role','public.customer_financial_source_bindings','UPDATE') as service_binding_update," +
      "has_table_privilege('service_role','public.customer_financial_source_change_requests','UPDATE') as service_request_update," +
      "has_table_privilege('service_role','public.customer_financial_source_reconciliation_evidence','INSERT') as service_evidence_insert," +
      "has_table_privilege('service_role','public.customer_financial_source_sync_evidence','INSERT') as service_sync_insert," +
      "has_function_privilege('authenticated','public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamp with time zone,text,integer,text[],text,text,text)','EXECUTE') as sync_execute," +
      "has_function_privilege('authenticated','public.record_customer_financial_source_reconciliation_evidence(uuid,timestamp with time zone,text,text,text[],jsonb,text)','EXECUTE') as evidence_execute," +
      "has_function_privilege('service_role','public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamp with time zone,text,integer,text[],text,text,text)','EXECUTE') as service_sync_execute",
  );
  assert.equal(directPrivileges[0].binding_read, false, "authenticated roles cannot read source bindings directly");
  assert.equal(directPrivileges[0].request_read, false, "authenticated roles cannot read source requests directly");
  assert.equal(directPrivileges[0].sync_read, false, "authenticated roles cannot read provider sync evidence directly");
  assert.equal(directPrivileges[0].service_binding_update, false, "service role cannot directly mutate customer source bindings");
  assert.equal(directPrivileges[0].service_request_update, false, "service role cannot directly mutate source change requests");
  assert.equal(directPrivileges[0].service_evidence_insert, false, "service role cannot directly insert reconciliation evidence");
  assert.equal(directPrivileges[0].service_sync_insert, false, "service role cannot directly insert sync evidence");
  assert.equal(directPrivileges[0].sync_execute, false, "authenticated roles cannot call provider sync writer");
  assert.equal(directPrivileges[0].evidence_execute, false, "authenticated roles cannot call provider evidence writer");
  assert.equal(directPrivileges[0].service_sync_execute, true, "service role can use the scoped sync RPC");
  const oldSyncSignature = await managerDb.unsafe("select to_regprocedure('public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamp with time zone,text,integer,text[],text)') is null as absent");
  assert.equal(oldSyncSignature[0].absent, true, "legacy unscoped sync signature is absent");
  const invoiceGuardPrivileges = await managerDb.unsafe(
    "select has_function_privilege('authenticated','public.customer_app_only_invoice_read_allowed(uuid,uuid)','EXECUTE') as helper_execute",
  );
  assert.equal(invoiceGuardPrivileges[0].helper_execute, true, "authenticated users can only call the boolean-only invoice source guard");


  const invoiceSourcePolicies = await db.unsafe(
    "select p.polname,p.polpermissive,pg_catalog.pg_get_expr(p.polqual,p.polrelid) as predicate " +
      "from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid " +
      "join pg_catalog.pg_namespace n on n.oid=c.relnamespace " +
      "where n.nspname='public' and p.polname in ('customer_invoice_financial_source_read_guard','customer_invoice_item_financial_source_read_guard')",
  );
  assert.equal(invoiceSourcePolicies.length, 2, "both direct invoice and line reads require source guards");
  assert.ok(invoiceSourcePolicies.every(policy => policy.polpermissive === false), "invoice source guards must be RESTRICTIVE");
  assert.ok(invoiceSourcePolicies.every(policy => policy.predicate.includes("customer_app_only_invoice_read_allowed")), "invoice source policies must use the scoped source predicate");
  assert.ok(invoiceSourcePolicies.every(policy => policy.predicate.includes("staff_customer_app_only_financial_rows_read_allowed")), "invoice source policies must restrict staff reads to the active APP_ONLY source");
  assert.ok(invoiceSourcePolicies.every(policy => policy.predicate.includes("current_organization_id()")), "staff invoice read exception must remain scoped to the active organization");


  // Persist one real APP_ONLY return-credit memo and its general-ledger journal
  // before source cutover. The journal header and lines are separate mutation
  // surfaces and must be guarded independently from the memo/posting link.
  const sourceTestCreditMemoRequestId = randomUUID();
  const sourceTestCreditMemoId = randomUUID();
  const sourceTestCreditMemoJournalId = randomUUID();
  const sourceTestCreditMemoReversalJournalId = randomUUID();
  await db.unsafe(
    "insert into public.customer_return_requests(" +
      "id,organization_id,customer_id,order_id,request_number,status,reason,requested_by,idempotency_key,payload_fingerprint" +
    ") values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,'submitted','other',$6::uuid,$7::text,$8::text)",
    [
      sourceTestCreditMemoRequestId,orgId,customerId,sourceTestSecondOrderId,
      "FIN-SOURCE-RETURN-"+randomUUID().slice(0,8).toUpperCase(),
      customerProfile.id,randomUUID(),"1".repeat(32),
    ],
  );
  await db.unsafe(
    "insert into public.customer_return_credit_memos(" +
      "id,organization_id,return_request_id,invoice_id,customer_id,memo_number,status,currency," +
      "subtotal_amount,tax_amount,total_amount,idempotency_key,payload_fingerprint,created_by_profile_id" +
    ") values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,'draft','YER',1.00,0,1.00,$7::uuid,$8::text,$9::uuid)",
    [
      sourceTestCreditMemoId,orgId,sourceTestCreditMemoRequestId,sourceTestInvoiceId,customerId,
      "FIN-SOURCE-CM-"+randomUUID().slice(0,8).toUpperCase(),
      randomUUID(),"2".repeat(32),accountant.id,
    ],
  );
  await db.unsafe(
    "insert into public.accounting_journal_entries(" +
      "id,organization_id,entry_date,description,source_type,source_reference,status," +
      "idempotency_key,payload_fingerprint,created_by_profile_id" +
    ") values($1::uuid,$2::uuid,(statement_timestamp() at time zone 'UTC')::date,$3::text," +
      "'customer_return_credit_memo',$4::text,'draft',$5::uuid,$6::text,$7::uuid)",
    [
      sourceTestCreditMemoJournalId,orgId,"Financial-source journal acceptance fixture",
      sourceTestCreditMemoId,randomUUID(),"3".repeat(32),manager.id,
    ],
  );
  await db.unsafe(
    "insert into public.accounting_journal_lines(" +
      "organization_id,journal_entry_id,line_number,account_id,debit,credit,memo" +
    ") values($1::uuid,$2::uuid,1,$3::uuid,1.00,0.00,'Financial-source source-bound journal line fixture')",
    [orgId,sourceTestCreditMemoJournalId,returnReceivableAccountId],
  );

  await db.unsafe(
    "insert into public.accounting_journal_entries(" +
      "id,organization_id,entry_date,description,source_type,source_reference,status," +
      "idempotency_key,payload_fingerprint,created_by_profile_id" +
    ") values($1::uuid,$2::uuid,(statement_timestamp() at time zone 'UTC')::date,$3::text," +
      "'adjustment',$4::text,'draft',$5::uuid,$6::text,$7::uuid)",
    [
      sourceTestCreditMemoReversalJournalId,orgId,"Financial-source credit memo reversal journal fixture",
      "customer-return-credit-memo-reversal:"+sourceTestCreditMemoId,
      randomUUID(),"5".repeat(32),manager.id,
    ],
  );
  await db.unsafe(
    "insert into public.accounting_journal_lines(" +
      "organization_id,journal_entry_id,line_number,account_id,debit,credit,memo" +
    ") values($1::uuid,$2::uuid,1,$3::uuid,1.00,0.00,'Financial-source source-bound reversal line fixture')",
    [orgId,sourceTestCreditMemoReversalJournalId,returnReceivableAccountId],
  );

  const sourceBoundCustomerJournalIds = [
    sourceTestInvoiceJournalId,
    sourceTestPaymentJournalId,
    sourceTestCreditMemoJournalId,
    sourceTestCreditMemoReversalJournalId,
  ];
  const appOnlyJournalHeaders = await managerDb.unsafe(
    "select id::text as id from public.accounting_journal_entries " +
    "where organization_id=$1::uuid and id=any($2::uuid[]) order by id",
    [orgId,sourceBoundCustomerJournalIds],
  );
  assert.deepEqual(appOnlyJournalHeaders.map(row=>row.id).sort(),[...sourceBoundCustomerJournalIds].sort(),
    "finance staff can read all four APP_ONLY customer journal source types");
  const appOnlyJournalLines = await managerDb.unsafe(
    "select journal_entry_id::text as journal_entry_id from public.accounting_journal_lines " +
    "where organization_id=$1::uuid and journal_entry_id=any($2::uuid[]) order by journal_entry_id",
    [orgId,sourceBoundCustomerJournalIds],
  );
  assert.equal(appOnlyJournalLines.length,4,
    "finance staff can read source-bound journal lines while APP_ONLY");
  const appOnlyCustomerPostingRows = await managerDb.unsafe(
    "select id::text as id,source_type from public.accounting_customer_source_postings " +
    "where organization_id=$1::uuid and source_id=any($2::uuid[]) order by source_type",
    [orgId,[sourceTestInvoiceId,sourceTestSinglePaymentId]],
  );
  assert.equal(appOnlyCustomerPostingRows.length,2,
    "finance staff can read both APP_ONLY customer invoice/payment posting-evidence rows");
  const appOnlyReturnCreditRows = await managerDb.unsafe(
    "select id::text as id from public.customer_return_credit_memos " +
    "where organization_id=$1::uuid and id=$2::uuid",
    [orgId,sourceTestCreditMemoId],
  );
  assert.equal(appOnlyReturnCreditRows.length,1,
    "finance staff can read the APP_ONLY return-credit memo header");

  const sourceReadPolicies = await db.unsafe(
    "select p.polname,p.polpermissive from pg_catalog.pg_policy p " +
    "join pg_catalog.pg_class c on c.oid=p.polrelid " +
    "join pg_catalog.pg_namespace n on n.oid=c.relnamespace " +
    "where n.nspname='public' and p.polname in (" +
      "'accounting_journal_entries_customer_source_read_guard'," +
      "'accounting_journal_lines_customer_source_read_guard'," +
      "'accounting_customer_source_postings_customer_source_read_guard'," +
      "'customer_return_credit_memos_customer_source_read_guard'," +
      "'customer_return_credit_memo_items_customer_source_read_guard'," +
      "'accounting_return_credit_memo_postings_customer_source_read_guard'," +
      "'accounting_return_credit_memo_reversals_customer_source_read_guard')",
  );
  assert.equal(sourceReadPolicies.length,7,
    "all seven customer-ledger journal, posting and credit-memo tables have source read guards");
  assert.ok(sourceReadPolicies.every(policy=>policy.polpermissive===false),
    "all customer source read guards are RESTRICTIVE and cannot be ORed away by existing permissive finance policies");
  async function assertCreditMemoJournalWritesDenied(sourceLabel) {
    const headerBefore = await db.unsafe(
      "select organization_id::text as organization_id,source_type,source_reference,status,description " +
      "from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid",
      [sourceTestCreditMemoJournalId,orgId],
    );
    assert.equal(headerBefore.length,1,sourceLabel+" source-bound journal header fixture exists");
    await expectFailure(
      sourceLabel+" source cannot mutate an APP_ONLY return-credit journal header",
      db.unsafe(
        "update public.accounting_journal_entries set description=description " +
        "where id=$1::uuid and organization_id=$2::uuid",
        [sourceTestCreditMemoJournalId,orgId],
      ),
      "55000",
      "active APP_ONLY financial source",
    );
    const headerAfter = await db.unsafe(
      "select organization_id::text as organization_id,source_type,source_reference,status,description " +
      "from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid",
      [sourceTestCreditMemoJournalId,orgId],
    );
    assert.deepEqual(headerAfter,headerBefore,
      sourceLabel+" rejected journal-header mutation leaves source, status and description unchanged");

    const lineBefore = await db.unsafe(
      "select organization_id::text as organization_id,journal_entry_id::text as journal_entry_id," +
        "line_number,account_id::text as account_id,debit::text as debit,credit::text as credit,memo " +
      "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
      [orgId,sourceTestCreditMemoJournalId],
    );
    assert.equal(lineBefore.length,1,sourceLabel+" source-bound journal line fixture exists");
    await expectFailure(
      sourceLabel+" source cannot mutate an APP_ONLY return-credit journal line",
      db.unsafe(
        "update public.accounting_journal_lines set memo=memo " +
        "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
        [orgId,sourceTestCreditMemoJournalId],
      ),
      "55000",
      "active APP_ONLY financial source",
    );
    const lineAfter = await db.unsafe(
      "select organization_id::text as organization_id,journal_entry_id::text as journal_entry_id," +
        "line_number,account_id::text as account_id,debit::text as debit,credit::text as credit,memo " +
      "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
      [orgId,sourceTestCreditMemoJournalId],
    );

    await expectFailure(
      sourceLabel+" source cannot insert a second APP_ONLY return-credit journal header",
      db.unsafe(
        "insert into public.accounting_journal_entries(" +
          "id,organization_id,entry_date,description,source_type,source_reference,status," +
          "idempotency_key,payload_fingerprint,created_by_profile_id" +
        ") values($1::uuid,$2::uuid,(statement_timestamp() at time zone 'UTC')::date,$3::text," +
          "'customer_return_credit_memo',$4::text,'draft',$5::uuid,$6::text,$7::uuid)",
        [randomUUID(),orgId,"Blocked external-source duplicate journal header",sourceTestCreditMemoId,randomUUID(),"4".repeat(32),manager.id],
      ),
      "55000",
      "active APP_ONLY financial source",
    );
    await expectFailure(
      sourceLabel+" source cannot insert another APP_ONLY return-credit journal line",
      db.unsafe(
        "insert into public.accounting_journal_lines(" +
          "organization_id,journal_entry_id,line_number,account_id,debit,credit,memo" +
        ") values($1::uuid,$2::uuid,2,$3::uuid,1.00,0.00,'Blocked external-source journal line')",
        [orgId,sourceTestCreditMemoJournalId,returnReceivableAccountId],
      ),
      "55000",
      "active APP_ONLY financial source",
    );
    await expectFailure(
      sourceLabel+" source cannot delete an APP_ONLY return-credit journal line",
      db.unsafe(
        "delete from public.accounting_journal_lines " +
        "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
        [orgId,sourceTestCreditMemoJournalId],
      ),
      "55000",
      "active APP_ONLY financial source",
    );
    await expectFailure(
      sourceLabel+" source cannot delete an APP_ONLY return-credit journal header",
      db.unsafe(
        "delete from public.accounting_journal_entries " +
        "where id=$1::uuid and organization_id=$2::uuid",
        [sourceTestCreditMemoJournalId,orgId],
      ),
      "55000",
      "active APP_ONLY financial source",
    );
    const journalCountsAfterDeniedCrud = await db.unsafe(
      "select (select count(*)::integer from public.accounting_journal_entries " +
        "where id=$1::uuid and organization_id=$2::uuid) as header_count," +
      "(select count(*)::integer from public.accounting_journal_lines " +
        "where organization_id=$2::uuid and journal_entry_id=$1::uuid) as line_count",
      [sourceTestCreditMemoJournalId,orgId],
    );
    assert.equal(journalCountsAfterDeniedCrud[0].header_count,1,
      sourceLabel+" denied CRUD leaves exactly one source-bound journal header");
    assert.equal(journalCountsAfterDeniedCrud[0].line_count,1,
      sourceLabel+" denied CRUD leaves exactly one source-bound journal line");
    assert.deepEqual(lineAfter,lineBefore,
      sourceLabel+" rejected journal-line mutation preserves account and debit/credit values");

    const reversalHeaderBefore = await db.unsafe(
      "select organization_id::text as organization_id,source_type,source_reference,status,description " +
      "from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid",
      [sourceTestCreditMemoReversalJournalId,orgId],
    );
    assert.equal(reversalHeaderBefore.length,1,
      sourceLabel+" source-bound reversal journal header fixture exists");
    await expectFailure(
      sourceLabel+" source cannot mutate an APP_ONLY return-credit reversal journal header",
      db.unsafe(
        "update public.accounting_journal_entries set description=description " +
        "where id=$1::uuid and organization_id=$2::uuid",
        [sourceTestCreditMemoReversalJournalId,orgId],
      ),
      "55000",
      "active APP_ONLY financial source",
    );
    const reversalHeaderAfter = await db.unsafe(
      "select organization_id::text as organization_id,source_type,source_reference,status,description " +
      "from public.accounting_journal_entries where id=$1::uuid and organization_id=$2::uuid",
      [sourceTestCreditMemoReversalJournalId,orgId],
    );
    assert.deepEqual(reversalHeaderAfter,reversalHeaderBefore,
      sourceLabel+" denied reversal-header mutation preserves source identity and status");

    const reversalLineBefore = await db.unsafe(
      "select organization_id::text as organization_id,journal_entry_id::text as journal_entry_id," +
        "line_number,account_id::text as account_id,debit::text as debit,credit::text as credit,memo " +
      "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
      [orgId,sourceTestCreditMemoReversalJournalId],
    );
    assert.equal(reversalLineBefore.length,1,sourceLabel+" source-bound reversal line fixture exists");
    await expectFailure(
      sourceLabel+" source cannot mutate an APP_ONLY return-credit reversal journal line",
      db.unsafe(
        "update public.accounting_journal_lines set memo=memo " +
        "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
        [orgId,sourceTestCreditMemoReversalJournalId],
      ),
      "55000",
      "active APP_ONLY financial source",
    );
    const reversalLineAfter = await db.unsafe(
      "select organization_id::text as organization_id,journal_entry_id::text as journal_entry_id," +
        "line_number,account_id::text as account_id,debit::text as debit,credit::text as credit,memo " +
      "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
      [orgId,sourceTestCreditMemoReversalJournalId],
    );
    assert.deepEqual(reversalLineAfter,reversalLineBefore,
      sourceLabel+" denied reversal-line mutation preserves account and debit/credit values");
  }



  await db.begin(async tx => {
    await tx.unsafe(
      "update public.accounting_journal_lines set memo=memo " +
      "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
      [orgId,sourceTestInvoiceJournalId],
    );
    await expectFailure(
      "invoice journal-line mutation holds the customer binding against concurrent cutover",
      serviceDb.unsafe(
        "select 1 from public.customer_financial_source_bindings " +
        "where organization_id=$1::uuid and customer_id=$2::uuid for update nowait",
        [orgId,customerId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });
  await db.begin(async tx => {
    await tx.unsafe(
      "update public.accounting_journal_lines set memo=memo " +
      "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
      [orgId,sourceTestPaymentJournalId],
    );
    await expectFailure(
      "payment journal-line mutation holds the customer binding against concurrent cutover",
      serviceDb.unsafe(
        "select 1 from public.customer_financial_source_bindings " +
        "where organization_id=$1::uuid and customer_id=$2::uuid for update nowait",
        [orgId,customerId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });

  await db.begin(async tx => {
    await tx.unsafe(
      "update public.accounting_journal_lines set memo=memo " +
      "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1",
      [orgId,sourceTestCreditMemoJournalId],
    );
    await expectFailure(
      "source-bound credit-memo journal-line write holds the customer binding against concurrent cutover",
      serviceDb.unsafe(
        "select 1 from public.customer_financial_source_bindings " +
        "where organization_id=$1::uuid and customer_id=$2::uuid for update nowait",
        [orgId,customerId],
      ),
      "55P03",
      "could not obtain lock on row",
    );
  });

  const idempotencyKey = randomUUID() + randomUUID();
  const requestArgs = [customerId, "ONYX", "ONYX-CUST-0001", "Verified migration to Onyx customer ledger", idempotencyKey, 1, "ONYX-COMPANY-01", "ONYX-BRANCH-01"];
  const concurrentRequests = await Promise.all([
    requestSource(managerDb, ...requestArgs),
    requestSource(managerRetryDb, ...requestArgs),
  ]);
  const requestIds = [...new Set(concurrentRequests.map(item => item.request_id))];
  assert.equal(requestIds.length, 1, "concurrent exact retries must resolve to one source-change request");
  assert.ok(concurrentRequests.some(item => item.replayed === true), "one concurrent duplicate must replay the request");
  const requestId = requestIds[0];
  assert.ok(concurrentRequests.every(item => item.status === "pending_reconciliation"));
  const pendingRequestHistory = await rpc(managerDb,
    "select public.get_customer_financial_source_change_history($1::uuid,10) as result",
    [customerId]);
  assert.ok(Array.isArray(pendingRequestHistory.records));
  const pendingRequestRecord = pendingRequestHistory.records.find(item => item.request_id === requestId);
  assert.ok(pendingRequestRecord, "maker can retrieve the newly created source-change request after refresh");
  assert.equal(pendingRequestRecord.status, "pending_reconciliation");
  assert.equal(pendingRequestRecord.target_source_mode, "ONYX");
  assert.equal(pendingRequestRecord.reason, "Verified migration to Onyx customer ledger");
  assert.equal(pendingRequestRecord.reconciliation_result, null);
  await expectFailure(
    "finance source history cannot cross tenant boundaries",
    rpc(managerDb,
      "select public.get_customer_financial_source_change_history($1::uuid,10) as result",
      [foreignCustomerId]),
    "42501",
    "outside the active finance organization",
  );
  await expectFailure(
    "customer cannot read internal source-change approval history",
    rpc(customerDb,
      "select public.get_customer_financial_source_change_history($1::uuid,10) as result",
      [customerId]),
    "42501",
    "finance capability required",
  );
  await expectFailure(
    "source-change history limit must remain bounded",
    rpc(managerDb,
      "select public.get_customer_financial_source_change_history($1::uuid,100) as result",
      [customerId]),
    "22023",
    "between 1 and 20",
  );

  await expectFailure(
    "same idempotency key with a different request payload",
    requestSource(managerDb, customerId, "ONYX", "ONYX-CUST-0001", "Different reason must not reuse key", idempotencyKey, 1, "ONYX-COMPANY-01", "ONYX-BRANCH-01"),
    "22023",
    "idempotency key",
  );
  await expectFailure(
    "finance request against a foreign-tenant customer",
    requestSource(managerDb, foreignCustomerId, "ONYX", "FOREIGN-CUST-0001", "cross tenant attempt", randomUUID() + randomUUID(), 1, "ONYX-COMPANY-01", "ONYX-BRANCH-01"),
    "42501",
    "outside the active finance organization",
  );
  await expectFailure(
    "customer attempting to change the source",
    requestSource(customerDb, customerId, "MUTAKAMEL", "MUT-CUST-0001", "customer cannot control ledger source", randomUUID() + randomUUID(), 1, "MUT-COMPANY-01", "MUT-BRANCH-01"),
    "42501",
    "capability required",
  );
  await expectFailure(
    "maker cannot approve their own change",
    reviewSource(managerDb, requestId, "approve", "self approval must be rejected"),
    "42501",
    "different from the requester",
  );
  await expectFailure(
    "authenticated finance user cannot record provider evidence",
    rpc(accountantDb,
      "select public.record_customer_financial_source_reconciliation_evidence($1::uuid,now()-interval '1 minute',$2::text,'matched',ARRAY['YER'],'{}'::jsonb,'ERP-REF') as result",
      [requestId, hash("authenticated-evidence")]),
    "42501",
    "service-role",
  );

  const mismatchTime = await serviceDb.unsafe("select statement_timestamp()-interval '2 minutes' as as_of");
  await expectFailure(
    "matched evidence cannot omit per-currency balance totals",
    recordReconciliation(requestId, "matched", mismatchTime[0].as_of, hash("missing-balances"), "ONYX-REF-001", null),
    "22023",
    "valid provider reconciliation evidence metadata",
  );
  await expectFailure(
    "matched evidence cannot claim equality when any currency balance differs",
    recordReconciliation(requestId, "matched", mismatchTime[0].as_of, hash("false-match"), "ONYX-REF-001", mismatchingCurrencyBalances),
    "22023",
    "matched reconciliation requires equal source and target balances",
  );
  await expectFailure(
    "matched evidence must cover every declared currency",
    recordReconciliation(requestId, "matched", mismatchTime[0].as_of, hash("missing-usd"), "ONYX-REF-001", {
      YER: matchingCurrencyBalances.YER,
    }),
    "22023",
    "reconciliation balances must cover every declared currency exactly once",
  );
  await expectFailure(
    "matched evidence rejects non-canonical currency decimal strings",
    recordReconciliation(requestId, "matched", mismatchTime[0].as_of, hash("invalid-decimal"), "ONYX-REF-001", {
      YER: { current_source_balance: "01.00", target_source_balance: "1.00" },
      USD: matchingCurrencyBalances.USD,
    }),
    "22023",
    "currency balances must be canonical decimal strings",
  );
  await expectFailure(
    "matched evidence rejects additional balance fields",
    recordReconciliation(requestId, "matched", mismatchTime[0].as_of, hash("extra-balance-field"), "ONYX-REF-001", {
      YER: { ...matchingCurrencyBalances.YER, note: "must not be ignored" },
      USD: matchingCurrencyBalances.USD,
    }),
    "22023",
    "each currency balance must contain exactly the source and target amounts",
  );
  await expectFailure(
    "reconciliation record counts reject negative and non-integer values",
    recordReconciliation(requestId, "matched", mismatchTime[0].as_of, hash("invalid-record-count"), "ONYX-REF-001", matchingCurrencyBalances, {
      invoices: -1,
      payments: 1.5,
    }),
    "22023",
    "reconciliation record counts must be non-negative integers",
  );
  const mismatch = await recordReconciliation(
    requestId, "mismatch", mismatchTime[0].as_of, hash("mismatch"), "ONYX-REF-001", mismatchingCurrencyBalances,
  );
  assert.equal(mismatch.status, "pending_reconciliation");
  await expectFailure(
    "mismatch reconciliation cannot be approved",
    reviewSource(accountantDb, requestId, "approve", "provider balances do not match"),
    "55000",
    "matched reconciliation",
  );

  const matchedTime = await serviceDb.unsafe("select statement_timestamp()-interval '2 minutes' as as_of");
  const matchedHash = hash("matched-onyx");
  const matchedEvidence = await recordReconciliation(
    requestId, "matched", matchedTime[0].as_of, matchedHash, "ONYX-REF-001", matchingCurrencyBalances,
  );
  assert.equal(matchedEvidence.status, "pending_approval");
  await expectFailure(
    "same reconciliation hash cannot be replayed with changed currency balances",
    recordReconciliation(requestId, "matched", matchedTime[0].as_of, matchedHash, "ONYX-REF-001", {
      YER: { current_source_balance: "100.01", target_source_balance: "100.01" },
      USD: matchingCurrencyBalances.USD,
    }),
    "22023",
    "replayed with different metadata",
  );
  const approved = await reviewSource(accountantDb, requestId, "approve", "verified opening ledger and currency totals match");
  assert.equal(approved.status, "approved");
  assert.equal(approved.source_mode, "ONYX");
  const completedRequestHistory = await rpc(accountantDb,
    "select public.get_customer_financial_source_change_history($1::uuid,10) as result",
    [customerId]);
  const completedRequestRecord = completedRequestHistory.records.find(item => item.request_id === requestId);
  assert.ok(completedRequestRecord, "approver can retrieve the completed source-change audit row");
  assert.equal(completedRequestRecord.status, "approved");
  assert.equal(completedRequestRecord.reconciliation_result, "matched");
  assert.deepEqual(completedRequestRecord.reconciliation_currency_codes, ["YER", "USD"]);
  assert.equal(completedRequestRecord.review_reason, "verified opening ledger and currency totals match");
  assert.equal(Object.hasOwn(completedRequestRecord, "target_external_account_ref"), false,
    "request history must not duplicate raw external identifiers in its staff-safe DTO");

  const paymentLedgerBeforeOnyxDenial = await db.unsafe(
    "select count(*)::integer as count,coalesce(sum(amount),0)::numeric(15,2)::text as total " +
    "from public.customer_payments where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  const receiptLedgerBeforeOnyxDenial = await db.unsafe(
    "select count(*)::integer as count,coalesce(sum(total_amount),0)::numeric(15,2)::text as total " +
    "from public.customer_payment_receipts where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  await expectFailure(
    "ONYX source rejects new legacy/idempotent single-invoice payment entry",
    rpc(accountantDb,
      "select public.record_customer_payment($1::uuid,1.00::numeric,'cash',$2::uuid,'FIN-SOURCE-SINGLE-NEW','external-source write denial') as result",
      [sourceTestInvoiceId, randomUUID()]),
    "55000",
    "active APP_ONLY financial source",
  );
  await expectFailure(
    "ONYX source rejects replay of an old APP_ONLY single-payment idempotency key",
    rpc(accountantDb,
      "select public.record_customer_payment($1::uuid,1.00::numeric,'cash',$2::uuid,'FIN-SOURCE-SINGLE','source routing single-payment acceptance fixture') as result",
      [sourceTestInvoiceId, sourceTestSinglePaymentIdempotencyKey]),
    "55000",
    "active APP_ONLY financial source",
  );
  await expectFailure(
    "ONYX source rejects replay of an old APP_ONLY multi-invoice receipt",
    rpc(accountantDb,
      "select public.record_customer_payment_allocation(" +
        "jsonb_build_array(" +
          "jsonb_build_object('invoice_id',$1::uuid,'amount','5.00')," +
          "jsonb_build_object('invoice_id',$2::uuid,'amount','7.00')" +
        "),'cash',$3::uuid,'FIN-SOURCE-RECEIPT','source routing acceptance fixture') as result",
      [sourceTestInvoiceId, sourceTestSecondInvoiceId, sourceTestReceiptIdempotencyKey]),
    "55000",
    "active APP_ONLY financial source",
  );
  await expectFailure(
    "direct owner INSERT cannot bypass APP_ONLY payment ledger source guard",
    db.unsafe(
      "insert into public.customer_payments(" +
        "organization_id,customer_id,invoice_id,amount,payment_method,reference,notes,created_by," +
        "idempotency_key,request_fingerprint" +
      ") values($1::uuid,$2::uuid,$3::uuid,1.00,'cash','DIRECT-EXTERNAL-SOURCE',NULL,$4::uuid,$5::uuid,$6::text)",
      [orgId, customerId, sourceTestInvoiceId, accountant.id, randomUUID(), "c".repeat(64)],
    ),
    "55000",
    "active APP_ONLY financial source",
  );
  await expectFailure(
    "direct owner INSERT cannot bypass APP_ONLY receipt header source guard",
    db.unsafe(
      "insert into public.customer_payment_receipts(" +
        "organization_id,customer_id,currency,total_amount,allocation_count,payment_method,created_by," +
        "idempotency_key,request_fingerprint" +
      ") values($1::uuid,$2::uuid,'YER',1.00,2,'cash',$3::uuid,$4::uuid,$5::text)",
      [orgId, customerId, accountant.id, randomUUID(), "d".repeat(64)],
    ),
    "55000",
    "active APP_ONLY financial source",
  );

  await expectFailure(
    "ONYX source cannot issue a new internal customer invoice",
    db.unsafe(
      "insert into public.customer_invoices(" +
        "organization_id,customer_id,order_id,invoice_number,status,currency,subtotal,tax_amount,total_amount" +
      ") values($1::uuid,$2::uuid,$3::uuid,$4::text,'issued','YER',1.00,0,1.00)",
      [orgId, customerId, sourceTestSecondOrderId, "FIN-SOURCE-EXTERNAL-" + randomUUID().slice(0,8)],
    ),
    "55000",
    "active APP_ONLY financial source",
  );
  await expectFailure(
    "ONYX source cannot mutate an existing APP_ONLY invoice",
    db.unsafe(
      "update public.customer_invoices set status=status " +
      "where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
      [sourceTestInvoiceId,orgId,customerId],
    ),
    "55000",
    "active APP_ONLY financial source",
  );
  const invoiceLineBeforeExternalMutation = await db.unsafe(
    "select description,quantity::text as quantity,unit_price::text as unit_price,line_total::text as line_total " +
    "from public.customer_invoice_items where id=$1::uuid and organization_id=$2::uuid",
    [sourceTestInvoiceItemId,orgId],
  );
  await expectFailure(
    "ONYX source cannot mutate an APP_ONLY invoice line",
    db.unsafe(
      "update public.customer_invoice_items set description=description " +
      "where id=$1::uuid and organization_id=$2::uuid and invoice_id=$3::uuid",
      [sourceTestInvoiceItemId,orgId,sourceTestInvoiceId],
    ),
    "55000",
    "active APP_ONLY financial source",
  );
  const invoiceLineAfterExternalMutation = await db.unsafe(
    "select description,quantity::text as quantity,unit_price::text as unit_price,line_total::text as line_total " +
    "from public.customer_invoice_items where id=$1::uuid and organization_id=$2::uuid",
    [sourceTestInvoiceItemId,orgId],
  );
  assert.deepEqual(invoiceLineAfterExternalMutation,invoiceLineBeforeExternalMutation,
    "rejected external-source invoice-line mutation must not alter the existing APP_ONLY line");
  await expectFailure(
    "ONYX source cannot create an internal return credit memo",
    db.unsafe(
      "insert into public.customer_return_credit_memos(" +
        "organization_id,return_request_id,invoice_id,customer_id,memo_number,status,currency," +
        "subtotal_amount,tax_amount,total_amount,idempotency_key,payload_fingerprint,created_by_profile_id" +
      ") values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,'draft','YER',1.00,0,1.00,$6::uuid,$7::text,$8::uuid)",
      [orgId,randomUUID(),sourceTestInvoiceId,customerId,"FIN-SOURCE-EXT-CM-"+randomUUID().slice(0,8),randomUUID(),"e".repeat(32),accountant.id],
    ),
    "55000",
    "active APP_ONLY financial source",
  );

  await assertCreditMemoJournalWritesDenied("ONYX");
  await assertInvoicePaymentJournalsDenied("ONYX");

  const onyxJournalHeadersHidden = await managerDb.unsafe(
    "select id from public.accounting_journal_entries " +
    "where organization_id=$1::uuid and id=any($2::uuid[])",
    [orgId,sourceBoundCustomerJournalIds],
  );
  assert.equal(onyxJournalHeadersHidden.length,0,
    "staff journal-header RLS hides invoice/payment/credit-memo APP_ONLY rows after ONYX cutover");
  const onyxJournalLinesHidden = await managerDb.unsafe(
    "select journal_entry_id from public.accounting_journal_lines " +
    "where organization_id=$1::uuid and journal_entry_id=any($2::uuid[])",
    [orgId,sourceBoundCustomerJournalIds],
  );
  assert.equal(onyxJournalLinesHidden.length,0,
    "staff journal-line RLS hides all APP_ONLY customer source lines after ONYX cutover");
  const onyxPostingRowsHidden = await managerDb.unsafe(
    "select id from public.accounting_customer_source_postings " +
    "where organization_id=$1::uuid and source_id=any($2::uuid[])",
    [orgId,[sourceTestInvoiceId,sourceTestSinglePaymentId]],
  );
  assert.equal(onyxPostingRowsHidden.length,0,
    "staff RLS hides customer invoice/payment posting evidence after ONYX cutover");
  const onyxCreditMemoHidden = await managerDb.unsafe(
    "select id from public.customer_return_credit_memos " +
    "where organization_id=$1::uuid and id=$2::uuid",
    [orgId,sourceTestCreditMemoId],
  );
  assert.equal(onyxCreditMemoHidden.length,0,
    "staff RLS hides APP_ONLY return-credit memo data after ONYX cutover");
  const [paymentLedgerAfterOnyxDenial,receiptLedgerAfterOnyxDenial] = await Promise.all([
    db.unsafe(
      "select count(*)::integer as count,coalesce(sum(amount),0)::numeric(15,2)::text as total " +
      "from public.customer_payments where organization_id=$1::uuid and customer_id=$2::uuid",
      [orgId, customerId],
    ),
    db.unsafe(
      "select count(*)::integer as count,coalesce(sum(total_amount),0)::numeric(15,2)::text as total " +
      "from public.customer_payment_receipts where organization_id=$1::uuid and customer_id=$2::uuid",
      [orgId, customerId],
    ),
  ]);
  assert.deepEqual(paymentLedgerAfterOnyxDenial,paymentLedgerBeforeOnyxDenial,
    "rejected external-source payment attempts must not change payment rows or amounts");
  assert.deepEqual(receiptLedgerAfterOnyxDenial,receiptLedgerBeforeOnyxDenial,
    "rejected external-source receipt attempts must not change receipt rows or totals");

  await expectFailure(
    "ONYX customer cannot list APP_ONLY receipts through the customer RPC",
    rpc(customerDb, "select public.get_my_customer_payment_receipt_print_options(50,0) as result"),
    "55000",
    "APP_ONLY customer receipt history",
  );
  await expectFailure(
    "ONYX customer cannot print an APP_ONLY receipt through the customer RPC",
    rpc(customerDb, "select public.get_my_customer_payment_receipt_print_data($1::uuid) as result", [sourceTestReceiptId]),
    "55000",
    "APP_ONLY customer receipt print",
  );

  assert.equal(approved.revision, 2);
  const approvalReplay = await reviewSource(accountantDb, requestId, "approve", "verified opening ledger and currency totals match");
  assert.equal(approvalReplay.replayed, true);
  const reconciliationIdentity = await serviceDb.unsafe("select company_external_ref,branch_external_ref from public.customer_financial_source_reconciliation_evidence where request_id=$1::uuid and reconciliation_result='matched'", [requestId]);
  assert.ok(reconciliationIdentity.length > 0);
  assert.equal(reconciliationIdentity[0].company_external_ref, "ONYX-COMPANY-01");
  assert.equal(reconciliationIdentity[0].branch_external_ref, "ONYX-BRANCH-01");

  const resolverOnyx = await rpc(customerDb, "select public.get_my_customer_financial_source() as result");
  assert.equal(resolverOnyx.source_mode, "ONYX");
  assert.equal(resolverOnyx.can_read_app_ledger, false, "external source disables app ledger reads");
  assert.equal(resolverOnyx.is_stale, false, "fresh reconciliation is not stale");
  const externalInvoiceRead = await rpc(customerDb,
    "select public.customer_app_only_invoice_read_allowed($1::uuid,$2::uuid) as result",
    [customerId, orgId],
  );
  assert.equal(externalInvoiceRead, false, "ONYX customer cannot read app-ledger invoice rows");
  assert.equal(Object.hasOwn(resolverOnyx, "external_account_ref"), false, "customer resolver does not expose ERP account references");
  assert.equal(Object.hasOwn(resolverOnyx, "company_external_ref"), false, "customer resolver does not disclose ERP company identity");
  assert.equal(Object.hasOwn(resolverOnyx, "branch_external_ref"), false, "customer resolver does not disclose ERP branch identity");
  const staffSource = await rpc(accountantDb, "select public.get_customer_financial_source_for_staff($1::uuid) as result", [customerId]);
  assert.equal(staffSource.source_mode, "ONYX");
  assert.equal(staffSource.external_account_ref, "ONYX-CUST-0001");
  assert.equal(staffSource.company_external_ref, "ONYX-COMPANY-01");
  assert.equal(staffSource.branch_external_ref, "ONYX-BRANCH-01");
  await expectFailure(
    "external statement must fail closed instead of using APP_ONLY ledger",
    rpc(customerDb, "select public.get_customer_account_statement() as result"),
    "55000",
    "app ledger fallback is prohibited",
  );

  await expectFailure(
    "staff Customer 360 cannot return an APP_ONLY finance snapshot after ONYX cutover",
    rpc(managerDb, "select public.get_staff_customer_360($1::uuid) as result", [customerId]),
    "55000",
    "APP_ONLY Customer 360 finance snapshot",
  );

  const mutakamelStaffInvoiceRows = await managerDb.unsafe(
    "select id from public.customer_invoices where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
    [sourceTestInvoiceId, orgId, customerId],
  );
  const mutakamelStaffInvoiceItemRows = await managerDb.unsafe(
    "select id from public.customer_invoice_items where id=$1::uuid and invoice_id=$2::uuid",
    [sourceTestInvoiceItemId, sourceTestInvoiceId],
  );
  assert.equal(mutakamelStaffInvoiceRows.length, 0,
    "staff invoice metadata reads remain denied after MUTAKAMEL cutover");
  assert.equal(mutakamelStaffInvoiceItemRows.length, 0,
    "staff invoice line reads remain denied after MUTAKAMEL cutover");

  const externalInvoiceRows = await customerDb.unsafe(
    "select id from public.customer_invoices where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
    [sourceTestInvoiceId, orgId, customerId],
  );
  const externalInvoiceItemRows = await customerDb.unsafe(
    "select id from public.customer_invoice_items where id=$1::uuid and organization_id=$2::uuid and invoice_id=$3::uuid",
    [sourceTestInvoiceItemId, orgId, sourceTestInvoiceId],
  );
  assert.equal(externalInvoiceRows.length, 0, "direct invoice metadata reads are denied for a real APP_ONLY invoice after ONYX cutover");
  assert.equal(externalInvoiceItemRows.length, 0, "direct invoice line reads are denied for a real APP_ONLY invoice after ONYX cutover");

  const externalStaffInvoiceRows = await managerDb.unsafe(
    "select id from public.customer_invoices where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
    [sourceTestInvoiceId, orgId, customerId],
  );
  const externalStaffInvoiceItemRows = await managerDb.unsafe(
    "select id from public.customer_invoice_items where id=$1::uuid and invoice_id=$2::uuid",
    [sourceTestInvoiceItemId, sourceTestInvoiceId],
  );
  assert.equal(externalStaffInvoiceRows.length, 0,
    "staff invoice metadata reads are denied after ONYX cutover");
  assert.equal(externalStaffInvoiceItemRows.length, 0,
    "staff invoice line reads are denied after ONYX cutover");
  await expectFailure(
    "external customer cannot read a real APP_ONLY invoice PDF",
    rpc(customerDb, "select public.get_customer_invoice_pdf($1::uuid) as result", [sourceTestInvoiceId]),
    "55000",
    "APP_ONLY invoice PDF",
  );

  const externalReceiptRows = await accountantDb.unsafe(
    "select id from public.customer_payment_receipts where id=$1::uuid and organization_id=$2::uuid",
    [sourceTestReceiptId, orgId],
  );
  assert.equal(externalReceiptRows.length, 0,
    "direct finance receipt reads are denied after ONYX cutover");

  const onyxPaymentSourceDecision = await rpc(managerDb,
    "select public.staff_customer_app_only_financial_rows_read_allowed($1::uuid,$2::uuid) as result",
    [customerId, orgId]);
  assert.equal(onyxPaymentSourceDecision, false,
    "manager APP_ONLY payment-read guard denies app allocations after ONYX cutover");
  const externalReceiptOptions = await rpc(accountantDb,
    "select public.get_customer_payment_receipt_print_options(100,0) as result");
  assert.equal(externalReceiptOptions.receipts.some(row => row.id === sourceTestReceiptId), false,
    "APP_ONLY receipts are excluded from the active-source print selector after ONYX cutover");
  await expectFailure(
    "ONYX source cannot print an APP_ONLY receipt",
    rpc(accountantDb,
      "select public.get_staff_customer_payment_receipt_print_data($1::uuid) as result",
      [sourceTestReceiptId]),
    "55000",
    "APP_ONLY receipt print",
  );

  const deniedHash = hash("auth-denied");
  await expectFailure(
    "authenticated customer cannot execute the service-role sync writer",
    rpc(customerDb,
      "select public.record_customer_financial_source_sync($1::uuid,$2::uuid,'ONYX','ONYX-CUST-0001',now(),$3::text,1,ARRAY['YER'],'ONYX-COMPANY-01','ONYX-BRANCH-01','AUTH-REF') as result",
      [orgId, customerId, deniedHash]),
    "42501",
    "service-role",
  );
  const syncTime = await serviceDb.unsafe("select statement_timestamp()-interval '1 minute' as as_of");
  const syncHash = hash("sync-onyx");
  const syncArgs = [orgId, customerId, "ONYX", "ONYX-CUST-0001", syncTime[0].as_of, syncHash, 3, ["YER", "USD"], "ONYX-COMPANY-01", "ONYX-BRANCH-01", "ONYX-SNAPSHOT-0001"];
  const syncSql = "select public.record_customer_financial_source_sync($1::uuid,$2::uuid,$3::text,$4::text,$5::timestamptz,$6::text,$7::integer,$8::text[],$9::text,$10::text,$11::text) as result";
  const syncResult = await rpc(serviceDb, syncSql, syncArgs);
  assert.equal(syncResult.replayed, false);
  const syncReplay = await rpc(serviceDb, syncSql, syncArgs);
  assert.equal(syncReplay.replayed, true, "same evidence hash replays without duplicate sync row");
  const syncIdentity = await serviceDb.unsafe("select company_external_ref,branch_external_ref from public.customer_financial_source_sync_evidence where organization_id=$1::uuid and customer_id=$2::uuid and evidence_sha256=$3::text", [orgId, customerId, syncHash]);
  assert.equal(syncIdentity.length, 1);
  assert.equal(syncIdentity[0].company_external_ref, "ONYX-COMPANY-01");
  assert.equal(syncIdentity[0].branch_external_ref, "ONYX-BRANCH-01");

  const syncStateBeforeFuture = await serviceDb.unsafe(
    "select source_as_of,last_synced_at,source_evidence_sha256 " +
    "from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  const syncCountBeforeFuture = await serviceDb.unsafe(
    "select count(*)::integer as count from public.customer_financial_source_sync_evidence " +
    "where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  const futureSyncTime = await serviceDb.unsafe("select statement_timestamp()+interval '1 minute' as as_of");
  await expectFailure(
    "provider sync rejects a future source watermark",
    rpc(serviceDb, syncSql, [
      orgId, customerId, "ONYX", "ONYX-CUST-0001", futureSyncTime[0].as_of,
      hash("future-source-watermark"), 1, ["YER"], "ONYX-COMPANY-01", "ONYX-BRANCH-01", "FUTURE-SNAPSHOT",
    ]),
    "22023",
    "valid ERP source sync evidence metadata",
  );
  const [syncStateAfterFuture,syncCountAfterFuture] = await Promise.all([
    serviceDb.unsafe(
      "select source_as_of,last_synced_at,source_evidence_sha256 " +
      "from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid",
      [orgId, customerId],
    ),
    serviceDb.unsafe(
      "select count(*)::integer as count from public.customer_financial_source_sync_evidence " +
      "where organization_id=$1::uuid and customer_id=$2::uuid",
      [orgId, customerId],
    ),
  ]);
  assert.deepEqual(syncStateAfterFuture, syncStateBeforeFuture,
    "rejected future watermark must not change the active source binding");
  assert.equal(syncCountAfterFuture[0].count, syncCountBeforeFuture[0].count,
    "rejected future watermark must not create a source sync evidence row");

  await expectFailure(
    "same provider evidence hash with changed metadata",
    rpc(serviceDb, syncSql, [...syncArgs.slice(0, 6), 4, syncArgs[7], syncArgs[8], syncArgs[9], syncArgs[10]]),
    "22023",
    "replayed with different metadata",
  );
  const staleTime = await serviceDb.unsafe("select statement_timestamp()-interval '10 minutes' as as_of");
  await expectFailure(
    "source watermark cannot move backwards",
    rpc(serviceDb, syncSql, [orgId, customerId, "ONYX", "ONYX-CUST-0001", staleTime[0].as_of, hash("old-snapshot"), 1, ["YER"], "ONYX-COMPANY-01", "ONYX-BRANCH-01", "OLD-SNAPSHOT"]),
    "40001",
    "move the customer statement watermark backwards",
  );
  await expectFailure(
    "sync cannot write another external customer account reference",
    rpc(serviceDb, syncSql, [orgId, customerId, "ONYX", "ONYX-CUST-OTHER", syncTime[0].as_of, hash("wrong-account"), 1, ["YER"], "ONYX-COMPANY-01", "ONYX-BRANCH-01", "WRONG-ACCOUNT"]),
    "42501",
    "does not match the active customer financial source binding",
  );
  await expectFailure(
    "matching customer account cannot be synced across an incorrect ERP company or branch",
    rpc(serviceDb, syncSql, [orgId, customerId, "ONYX", "ONYX-CUST-0001", syncTime[0].as_of, hash("wrong-company-branch"), 1, ["YER"], "ONYX-COMPANY-OTHER", "ONYX-BRANCH-OTHER", "WRONG-SCOPE"]),
    "42501",
    "does not match the active customer financial source binding",
  );

  const mutakamelRequest = await requestSource(
    accountantDb, customerId, "MUTAKAMEL", "MUT-CUST-0001",
    "cutover from Onyx to Mutakamel after full reconciliation", randomUUID() + randomUUID(), 2,
    "MUT-COMPANY-01", "MUT-BRANCH-01",
  );
  assert.equal(mutakamelRequest.status, "pending_reconciliation");
  const mutakamelTime = await serviceDb.unsafe("select statement_timestamp()-interval '2 minutes' as as_of");
  await recordReconciliation(
    mutakamelRequest.request_id, "matched", mutakamelTime[0].as_of,
    hash("matched-mutakamel"), "MUT-REF-001", matchingCurrencyBalances,
  );
  const mutakamelApproved = await reviewSource(managerDb, mutakamelRequest.request_id, "approve", "Mutakamel opening balances and currencies reconciled");
  assert.equal(mutakamelApproved.source_mode, "MUTAKAMEL");
  assert.equal(mutakamelApproved.revision, 3);

  await expectFailure(
    "MUTAKAMEL source rejects internal single-invoice payment writes",
    rpc(accountantDb,
      "select public.record_customer_payment($1::uuid,1.00::numeric,'cash',$2::uuid,'MUTAKAMEL-WRITE','external-source write denial') as result",
      [sourceTestInvoiceId, randomUUID()]),
    "55000",
    "active APP_ONLY financial source",
  );

  await assertCreditMemoJournalWritesDenied("MUTAKAMEL");
  await assertInvoicePaymentJournalsDenied("MUTAKAMEL");

  const mutakamelJournalHeadersHidden = await managerDb.unsafe(
    "select id from public.accounting_journal_entries " +
    "where organization_id=$1::uuid and id=any($2::uuid[])",
    [orgId,sourceBoundCustomerJournalIds],
  );
  assert.equal(mutakamelJournalHeadersHidden.length,0,
    "staff journal-header RLS hides APP_ONLY customer source rows after MUTAKAMEL cutover");
  const mutakamelJournalLinesHidden = await managerDb.unsafe(
    "select journal_entry_id from public.accounting_journal_lines " +
    "where organization_id=$1::uuid and journal_entry_id=any($2::uuid[])",
    [orgId,sourceBoundCustomerJournalIds],
  );
  assert.equal(mutakamelJournalLinesHidden.length,0,
    "staff journal-line RLS hides APP_ONLY customer lines after MUTAKAMEL cutover");
  const mutakamelPostingRowsHidden = await managerDb.unsafe(
    "select id from public.accounting_customer_source_postings " +
    "where organization_id=$1::uuid and source_id=any($2::uuid[])",
    [orgId,[sourceTestInvoiceId,sourceTestSinglePaymentId]],
  );
  assert.equal(mutakamelPostingRowsHidden.length,0,
    "staff RLS hides APP_ONLY invoice/payment posting evidence after MUTAKAMEL cutover");
  const mutakamelCreditMemoHidden = await managerDb.unsafe(
    "select id from public.customer_return_credit_memos " +
    "where organization_id=$1::uuid and id=$2::uuid",
    [orgId,sourceTestCreditMemoId],
  );
  assert.equal(mutakamelCreditMemoHidden.length,0,
    "staff RLS hides APP_ONLY return-credit memo data after MUTAKAMEL cutover");

  await expectFailure(
    "MUTAKAMEL customer cannot list APP_ONLY receipts through the customer RPC",
    rpc(customerDb, "select public.get_my_customer_payment_receipt_print_options(50,0) as result"),
    "55000",
    "APP_ONLY customer receipt history",
  );
  await expectFailure(
    "MUTAKAMEL customer cannot print an APP_ONLY receipt through the customer RPC",
    rpc(customerDb, "select public.get_my_customer_payment_receipt_print_data($1::uuid) as result", [sourceTestReceiptId]),
    "55000",
    "APP_ONLY customer receipt print",
  );


  await expectFailure(
    "staff Customer 360 cannot return an APP_ONLY finance snapshot after MUTAKAMEL cutover",
    rpc(managerDb, "select public.get_staff_customer_360($1::uuid) as result", [customerId]),
    "55000",
    "APP_ONLY Customer 360 finance snapshot",
  );

  const mutakamelReceiptOptions = await rpc(accountantDb,
    "select public.get_customer_payment_receipt_print_options(100,0) as result");
  assert.equal(mutakamelReceiptOptions.receipts.some(row => row.id === sourceTestReceiptId), false,
    "APP_ONLY receipt remains excluded after MUTAKAMEL cutover");

  const mutakamelPaymentSourceDecision = await rpc(managerDb,
    "select public.staff_customer_app_only_financial_rows_read_allowed($1::uuid,$2::uuid) as result",
    [customerId, orgId]);
  assert.equal(mutakamelPaymentSourceDecision, false,
    "manager APP_ONLY payment-read guard denies app allocations after MUTAKAMEL cutover");
  await expectFailure(
    "MUTAKAMEL source cannot print an APP_ONLY receipt",
    rpc(accountantDb,
      "select public.get_staff_customer_payment_receipt_print_data($1::uuid) as result",
      [sourceTestReceiptId]),
    "55000",
    "APP_ONLY receipt print",
  );

  const appOnlyRequest = await requestSource(
    managerDb, customerId, "APP_ONLY", null,
    "return to app-only after closing and matching external balances", randomUUID() + randomUUID(), 3,
  );
  assert.equal(appOnlyRequest.status, "pending_reconciliation");
  const appOnlyTime = await serviceDb.unsafe("select statement_timestamp()-interval '2 minutes' as as_of");
  await recordReconciliation(
    appOnlyRequest.request_id, "matched", appOnlyTime[0].as_of,
    hash("matched-app-only"), "APP-LEDGER-CUTOVER-001", matchingCurrencyBalances,
  );
  const appOnlyApproved = await reviewSource(accountantDb, appOnlyRequest.request_id, "approve", "all external balances reconciled to the app ledger before cutover");
  assert.equal(appOnlyApproved.source_mode, "APP_ONLY");
  assert.equal(appOnlyApproved.revision, 4);

  const restoredJournalHeaders = await managerDb.unsafe(
    "select id::text as id from public.accounting_journal_entries " +
    "where organization_id=$1::uuid and id=any($2::uuid[]) order by id",
    [orgId,sourceBoundCustomerJournalIds],
  );
  assert.deepEqual(restoredJournalHeaders.map(row=>row.id).sort(),[...sourceBoundCustomerJournalIds].sort(),
    "staff source-bound journal headers reappear only after approved APP_ONLY return");
  const restoredJournalLines = await managerDb.unsafe(
    "select journal_entry_id from public.accounting_journal_lines " +
    "where organization_id=$1::uuid and journal_entry_id=any($2::uuid[])",
    [orgId,sourceBoundCustomerJournalIds],
  );
  assert.equal(restoredJournalLines.length,4,
    "staff customer journal lines reappear after APP_ONLY return");
  const restoredCustomerPostingRows = await managerDb.unsafe(
    "select id from public.accounting_customer_source_postings " +
    "where organization_id=$1::uuid and source_id=any($2::uuid[])",
    [orgId,[sourceTestInvoiceId,sourceTestSinglePaymentId]],
  );
  assert.equal(restoredCustomerPostingRows.length,2,
    "staff invoice/payment posting evidence reappears after APP_ONLY return");
  const restoredCreditMemoRows = await managerDb.unsafe(
    "select id from public.customer_return_credit_memos " +
    "where organization_id=$1::uuid and id=$2::uuid",
    [orgId,sourceTestCreditMemoId],
  );
  assert.equal(restoredCreditMemoRows.length,1,
    "staff return-credit memo header reappears after APP_ONLY return");


  for (const fixture of customerSourcePostingFixtures) {
    await expectFailure(
      "APP_ONLY accounting source-posting evidence remains append-only",
      db.unsafe(
        "update public.accounting_customer_source_postings set payload_fingerprint=payload_fingerprint " +
        "where organization_id=$1::uuid and journal_entry_id=$2::uuid",
        [orgId,fixture.journalId],
      ),
      "55000",
      "append-only",
    );
    await expectFailure(
      "APP_ONLY accounting source-posting evidence cannot be deleted",
      db.unsafe(
        "delete from public.accounting_customer_source_postings " +
        "where organization_id=$1::uuid and journal_entry_id=$2::uuid",
        [orgId,fixture.journalId],
      ),
      "55000",
      "append-only",
    );
  }
  for (const fixture of invoicePaymentJournalFixtures) {
    const restoredHeader = await db.unsafe(
      "update public.accounting_journal_entries set description=description " +
      "where id=$1::uuid and organization_id=$2::uuid returning id",
      [fixture.id,orgId],
    );
    assert.equal(restoredHeader.length,1,
      "APP_ONLY restores "+fixture.sourceType+" journal header writes");
    const restoredLine = await db.unsafe(
      "update public.accounting_journal_lines set memo=memo " +
      "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1 returning line_number",
      [orgId,fixture.id],
    );
    assert.equal(restoredLine.length,1,
      "APP_ONLY restores "+fixture.sourceType+" journal line writes");
    await expectFailure(
      "APP_ONLY "+fixture.sourceType+" journal cannot be detached from its immutable source identity",
      db.unsafe(
        "update public.accounting_journal_entries set source_type='manual',source_reference=NULL " +
        "where id=$1::uuid and organization_id=$2::uuid",
        [fixture.id,orgId],
      ),
      "55000",
      "source identity",
    );
  }

  const restoredCreditMemoJournalHeader = await db.unsafe(
    "update public.accounting_journal_entries set description=description " +
    "where id=$1::uuid and organization_id=$2::uuid returning id",
    [sourceTestCreditMemoJournalId,orgId],
  );
  assert.equal(restoredCreditMemoJournalHeader.length,1,
    "APP_ONLY source restores authorized mutations of its return-credit journal header");
  const restoredCreditMemoJournalLine = await db.unsafe(
    "update public.accounting_journal_lines set memo=memo " +
    "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1 returning line_number",
    [orgId,sourceTestCreditMemoJournalId],
  );
  assert.equal(restoredCreditMemoJournalLine.length,1,
    "APP_ONLY source restores authorized mutations of its return-credit journal lines");

  const restoredCreditMemoReversalHeader = await db.unsafe(
    "update public.accounting_journal_entries set description=description " +
    "where id=$1::uuid and organization_id=$2::uuid returning id",
    [sourceTestCreditMemoReversalJournalId,orgId],
  );
  assert.equal(restoredCreditMemoReversalHeader.length,1,
    "APP_ONLY source restores authorized mutations of credit-memo reversal journal header");
  const restoredCreditMemoReversalLine = await db.unsafe(
    "update public.accounting_journal_lines set memo=memo " +
    "where organization_id=$1::uuid and journal_entry_id=$2::uuid and line_number=1 returning line_number",
    [orgId,sourceTestCreditMemoReversalJournalId],
  );
  assert.equal(restoredCreditMemoReversalLine.length,1,
    "APP_ONLY source restores authorized mutations of credit-memo reversal journal line");
  await expectFailure(
    "APP_ONLY source-bound credit memo reversal journal cannot be detached from its immutable source identity",
    db.unsafe(
      "update public.accounting_journal_entries set source_type='manual',source_reference=NULL " +
      "where id=$1::uuid and organization_id=$2::uuid",
      [sourceTestCreditMemoReversalJournalId,orgId],
    ),
    "55000",
    "source identity",
  );

  await expectFailure(
    "APP_ONLY source-bound credit memo journal cannot be detached from its immutable source identity",
    db.unsafe(
      "update public.accounting_journal_entries set source_type='manual',source_reference=NULL " +
      "where id=$1::uuid and organization_id=$2::uuid",
      [sourceTestCreditMemoJournalId,orgId],
    ),
    "55000",
    "source identity",
  );

  await serviceDb.unsafe(
    "update public.customer_financial_source_bindings set source_status='suspended' where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  try {
    await expectFailure(
      "suspended APP_ONLY customer cannot list receipts",
      rpc(customerDb, "select public.get_my_customer_payment_receipt_print_options(50,0) as result"),
      "55000",
      "APP_ONLY customer receipt history",
    );
    await expectFailure(
      "suspended APP_ONLY customer cannot print receipts",
      rpc(customerDb, "select public.get_my_customer_payment_receipt_print_data($1::uuid) as result", [sourceTestReceiptId]),
      "55000",
      "APP_ONLY customer receipt print",
    );
  } finally {
    await serviceDb.unsafe(
      "update public.customer_financial_source_bindings set source_status='active' where organization_id=$1::uuid and customer_id=$2::uuid",
      [orgId, customerId],
    );
  }


  const identityIndex = await db.unsafe("select indexdef from pg_catalog.pg_indexes where schemaname='public' and indexname='customer_financial_source_external_identity_uniq'");
  assert.equal(identityIndex.length, 1, "ERP account identity unique index is installed");
  assert.ok(identityIndex[0].indexdef.includes("organization_id") && identityIndex[0].indexdef.includes("company_external_ref") && identityIndex[0].indexdef.includes("branch_external_ref") && identityIndex[0].indexdef.includes("external_account_ref"));
  const finalResolver = await rpc(customerDb, "select public.get_my_customer_financial_source() as result");
  assert.equal(finalResolver.source_mode, "APP_ONLY");
  assert.equal(finalResolver.can_read_app_ledger, true);

  const finalCustomer360 = await rpc(managerDb,
    "select public.get_staff_customer_360($1::uuid) as result",
    [customerId]);
  assert.equal(finalCustomer360.customer.id, customerId,
    "Customer 360 finance projection is restored only after approved APP_ONLY return");

  const finalStaffInvoiceRows = await managerDb.unsafe(
    "select id from public.customer_invoices where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
    [sourceTestInvoiceId, orgId, customerId],
  );
  const finalStaffInvoiceItemRows = await managerDb.unsafe(
    "select id from public.customer_invoice_items where id=$1::uuid and invoice_id=$2::uuid",
    [sourceTestInvoiceItemId, sourceTestInvoiceId],
  );
  assert.equal(finalStaffInvoiceRows.length, 1,
    "staff invoice metadata access returns only after approved APP_ONLY cutover");
  assert.equal(finalStaffInvoiceItemRows.length, 1,
    "staff invoice line access returns only after approved APP_ONLY cutover");
  const finalStatement = await rpc(customerDb, "select public.get_customer_account_statement() as result");
  assert.equal(JSON.stringify(finalStatement.summary), initialSummary, "source cutover must not synthesize or alter the app ledger");

  const singlePaymentReplayAfterReturn = await rpc(accountantDb,
    "select public.record_customer_payment($1::uuid,1.00::numeric,'cash',$2::uuid," +
      "'FIN-SOURCE-SINGLE','source routing single-payment acceptance fixture') as result",
    [sourceTestInvoiceId, sourceTestSinglePaymentIdempotencyKey],
  );
  assert.equal(singlePaymentReplayAfterReturn, sourceTestSinglePaymentId,
    "idempotent APP_ONLY payment replay is restored after approved source return");

  const receiptReplayAfterReturn = await rpc(accountantDb,
    "select public.record_customer_payment_allocation(" +
      "jsonb_build_array(" +
        "jsonb_build_object('invoice_id',$1::uuid,'amount','5.00')," +
        "jsonb_build_object('invoice_id',$2::uuid,'amount','7.00')" +
      "),'cash',$3::uuid,'FIN-SOURCE-RECEIPT','source routing acceptance fixture') as result",
    [sourceTestInvoiceId, sourceTestSecondInvoiceId, sourceTestReceiptIdempotencyKey],
  );
  assert.equal(receiptReplayAfterReturn.receipt_id, sourceTestReceiptId);
  assert.equal(receiptReplayAfterReturn.replayed, true,
    "idempotent multi-invoice receipt replay is restored after approved source return");

  const freshPaymentAfterReturn = await rpc(accountantDb,
    "select public.record_customer_payment($1::uuid,0.50::numeric,'cash',$2::uuid,'FIN-SOURCE-POST-RETURN','APP_ONLY payment writer restored') as result",
    [sourceTestInvoiceId, randomUUID()],
  );
  assert.ok(freshPaymentAfterReturn,
    "APP_ONLY single-invoice payment write is restored after approved source return");

  const freshReceiptAfterReturn = await rpc(accountantDb,
    "select public.record_customer_payment_allocation(" +
      "jsonb_build_array(" +
        "jsonb_build_object('invoice_id',$1::uuid,'amount','0.50')," +
        "jsonb_build_object('invoice_id',$2::uuid,'amount','0.75')" +
      "),'cash',$3::uuid,'FIN-SOURCE-POST-RETURN','APP_ONLY multi-invoice receipt writer restored') as result",
    [sourceTestInvoiceId, sourceTestSecondInvoiceId, randomUUID()],
  );
  assert.ok(freshReceiptAfterReturn.receipt_id);
  assert.equal(freshReceiptAfterReturn.allocation_count, 2);
  assert.equal(freshReceiptAfterReturn.replayed, false,
    "APP_ONLY multi-invoice receipt writer persists a new two-invoice receipt after return");
  const [freshReceiptHeaderRows,freshReceiptChildren] = await Promise.all([
    db.unsafe(
      "select id,total_amount::text as total_amount,allocation_count from public.customer_payment_receipts " +
      "where id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid",
      [freshReceiptAfterReturn.receipt_id,orgId,customerId],
    ),
    db.unsafe(
      "select invoice_id,amount::text as amount from public.customer_payments " +
      "where receipt_id=$1::uuid and organization_id=$2::uuid and customer_id=$3::uuid order by invoice_id",
      [freshReceiptAfterReturn.receipt_id,orgId,customerId],
    ),
  ]);
  assert.equal(freshReceiptHeaderRows.length, 1,
    "APP_ONLY multi-invoice receipt header is persisted after source return");
  assert.equal(freshReceiptHeaderRows[0].allocation_count, 2);
  assert.equal(freshReceiptChildren.length, 2,
    "APP_ONLY receipt writer persists one customer_payment allocation per invoice");

  const appOnlyInvoiceFixtureMarker = "ROLLBACK_APP_ONLY_INVOICE_SOURCE_WRITE_FIXTURE";
  const appOnlyInvoiceFixtureOrderId = randomUUID();
  const appOnlyInvoiceFixtureNumber = "FIN-SOURCE-RETURN-" + randomUUID().slice(0,8).toUpperCase();
  let appOnlyInvoiceFixtureRolledBack = false;
  try {
    await db.begin(async tx => {
      await tx.unsafe(
        "insert into public.orders(" +
          "id,organization_id,customer_id,order_number,status,notes,created_by,idempotency_key,idempotency_payload_hash" +
        ") values($1::uuid,$2::uuid,$3::uuid,$4::text,'pending','APP_ONLY source guard rollback fixture',$5::uuid,$6::text,$7::text)",
        [appOnlyInvoiceFixtureOrderId,orgId,customerId,appOnlyInvoiceFixtureNumber,customerProfile.id,randomUUID(),"f".repeat(64)],
      );
      const issuedInvoice = await tx.unsafe(
        "insert into public.customer_invoices(" +
          "organization_id,customer_id,order_id,invoice_number,status,currency,subtotal,tax_amount,total_amount" +
        ") values($1::uuid,$2::uuid,$3::uuid,$4::text,'issued','YER',1.00,0,1.00) returning id",
        [orgId,customerId,appOnlyInvoiceFixtureOrderId,"INV-"+appOnlyInvoiceFixtureNumber],
      );
      assert.equal(issuedInvoice.length,1,
        "APP_ONLY invoice source guard allows the real internal invoice header after approved source return");
      throw new Error(appOnlyInvoiceFixtureMarker);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message!==appOnlyInvoiceFixtureMarker) throw error;
    appOnlyInvoiceFixtureRolledBack = true;
  }
  assert.equal(appOnlyInvoiceFixtureRolledBack,true,
    "APP_ONLY invoice fixture transaction is rolled back after proving the source guard allows it");
  const [rolledBackInvoice,rolledBackOrder]=await Promise.all([
    db.unsafe("select count(*)::integer as count from public.customer_invoices where organization_id=$1::uuid and order_id=$2::uuid",[orgId,appOnlyInvoiceFixtureOrderId]),
    db.unsafe("select count(*)::integer as count from public.orders where organization_id=$1::uuid and id=$2::uuid",[orgId,appOnlyInvoiceFixtureOrderId]),
  ]);
  assert.equal(rolledBackInvoice[0].count,0,"rolled-back APP_ONLY invoice leaves no financial document");
  assert.equal(rolledBackOrder[0].count,0,"rolled-back APP_ONLY invoice leaves no order fixture");

  const finalReceiptOptions = await rpc(accountantDb,
    "select public.get_customer_payment_receipt_print_options(100,0) as result");
  assert.ok(finalReceiptOptions.receipts.some(row => row.id === sourceTestReceiptId),
    "APP_ONLY receipt returns to the print selector after approved return cutover");
  const finalReceiptPrint = await rpc(accountantDb,
    "select public.get_staff_customer_payment_receipt_print_data($1::uuid) as result",
    [sourceTestReceiptId]);
  assert.equal(finalReceiptPrint.receipt.id, sourceTestReceiptId,
    "APP_ONLY receipt remains printable after source transitions");

  const finalPaymentSourceDecision = await rpc(managerDb,
    "select public.staff_customer_app_only_financial_rows_read_allowed($1::uuid,$2::uuid) as result",
    [customerId, orgId]);
  assert.equal(finalPaymentSourceDecision, true,
    "manager APP_ONLY payment-read guard is restored only after approved APP_ONLY cutover");

  await expectFailure(
    "staff cannot resolve a foreign tenant customer's financial source",
    rpc(managerDb, "select public.get_customer_financial_source_for_staff($1::uuid) as result", [foreignCustomerId]),
    "42501",
    "outside the active organization",
  );
  // Assert the complete source-history response is a strict staff-safe allowlist.
  const sourceHistory = await rpc(managerDb,
    "select public.get_customer_financial_source_change_history($1::uuid,20) as result",
    [customerId]);
  assert.ok(Array.isArray(sourceHistory.records));
  assert.ok(sourceHistory.total >= 3,
    "history retains all completed APP_ONLY / ONYX / MUTAKAMEL transitions");
  assert.ok(["APP_ONLY","ONYX","MUTAKAMEL"].every(mode =>
    sourceHistory.records.some(row => row.target_source_mode === mode)),
    "history preserves all three approved source modes");
  const safeHistoryKeys = [
    "current_source_mode","expected_binding_revision","reconciliation_currency_codes",
    "reconciliation_record_counts","reconciliation_result","reconciliation_source_as_of",
    "request_id","requested_at","review_reason","reviewed_at","reason",
    "status","target_source_mode",
  ].sort();
  for (const row of sourceHistory.records) {
    assert.deepEqual(Object.keys(row).sort(),safeHistoryKeys,
      "source history response stays within the documented DTO allowlist");
    for (const forbidden of ["external_account_ref","company_external_ref","branch_external_ref",
      "evidence_hash","current_source_balance","target_source_balance"]) {
      assert.equal(Object.hasOwn(row,forbidden),false,
        "source history must not disclose " + forbidden);
    }
  }
  const oneRowHistory = await rpc(managerDb,
    "select public.get_customer_financial_source_change_history($1::uuid,1) as result",
    [customerId]);
  assert.equal(oneRowHistory.records.length,1,
    "source history page size of one returns exactly one record");
  assert.equal(oneRowHistory.total,sourceHistory.total,
    "source history total is consistent across bounded page sizes");
  const historyPrivileges = await db.unsafe(
    "select " +
      "has_function_privilege('authenticated','public.get_customer_financial_source_change_history(uuid,integer)','EXECUTE') as authenticated_execute," +
      "has_function_privilege('anon','public.get_customer_financial_source_change_history(uuid,integer)','EXECUTE') as anon_execute," +
      "(select prosecdef from pg_catalog.pg_proc where oid='public.get_customer_financial_source_change_history(uuid,integer)'::regprocedure) as security_definer",
  );
  assert.equal(historyPrivileges[0].authenticated_execute,true);
  assert.equal(historyPrivileges[0].anon_execute,false);
  assert.equal(historyPrivileges[0].security_definer,true);

  const audit = await db.unsafe(
    "select action,count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and entity_id=$2::uuid and action like 'customer.financial_source.%' group by action order by action",
    [orgId, customerId],
  );
  const auditActions = new Set(audit.map(row => row.action));
  for (const expected of [
    "customer.financial_source.change.requested",
    "customer.financial_source.change.approved",
    "customer.financial_source.sync.recorded",
  ]) assert.ok(auditActions.has(expected), "missing financial-source audit action " + expected);

  const finalBinding = await db.unsafe(
    "select source_mode,source_status,external_account_ref,company_external_ref,branch_external_ref,revision from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  assert.equal(finalBinding[0].source_mode, "APP_ONLY");
  assert.equal(finalBinding[0].external_account_ref, null);
  assert.equal(finalBinding[0].company_external_ref, null);
  assert.equal(finalBinding[0].branch_external_ref, null);
  assert.equal(finalBinding[0].revision, 4);
  process.stdout.write(
    "Customer financial source routing PostgreSQL 17 acceptance: PASS " +
      JSON.stringify({
        transitions: ["APP_ONLY -> ONYX", "ONYX -> MUTAKAMEL", "MUTAKAMEL -> APP_ONLY"],
        concurrentIdempotency: true,
        sourceEvidenceAndFreshness: true,
        syncReplayAndMonotonicWatermark: true,
        makerChecker: true,
        financialPaymentWriteGuards: true,
        appOnlyPaymentWritesRestored: true,
        tenantIsolation: true,
        noExternalLedgerFallback: true,
        appLedgerSummaryUnchanged: true,
        auditActions: [...auditActions],
      }) +
      "\n",
  );
}

main()
  .catch(error => {
    process.stderr.write("Customer financial source routing acceptance failed: " + String(error?.stack ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([db.end(), customerDb.end(), foreignCustomerDb.end(), managerDb.end(), managerRetryDb.end(), accountantDb.end(), serviceDb.end()]);
  });
