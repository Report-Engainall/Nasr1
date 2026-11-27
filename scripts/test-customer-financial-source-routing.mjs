import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = requiredEnv("TEST_DATABASE_URL");
const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
const foreignCustomerEmail = requiredEnv("E2E_EMAIL_B").toLowerCase();
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL").toLowerCase();

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
async function recordReconciliation(requestId, result, asOf, evidenceHash, reference) {
  return rpc(
    serviceDb,
    "select public.record_customer_financial_source_reconciliation_evidence(" +
      "$1::uuid,$2::timestamptz,$3::text,$4::text,$5::text[],$6::jsonb,$7::text) as result",
    [requestId, asOf, evidenceHash, result, ["YER", "USD"], JSON.stringify({ invoices: 2, payments: 1, credits: 0 }), reference],
  );
}
async function requestSource(client, customerId, mode, externalRef, reason, key, revision) {
  return rpc(
    client,
    "select public.request_customer_financial_source_change(" +
      "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer) as result",
    [customerId, mode, externalRef, reason, key, revision],
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
    db.unsafe("select id::text,organization_id::text from public.customers where profile_id=$1::uuid and status='approved'", [customerProfile.id]),
    db.unsafe("select id::text,organization_id::text from public.customers where profile_id=$1::uuid and status='approved'", [foreignProfile.id]),
  ]);
  assert.equal(customers.length, 1, "primary E2E profile must own exactly one approved customer account");
  assert.equal(foreignCustomers.length, 1, "foreign E2E profile must own exactly one approved customer account");
  const customerId = customers[0].id;
  const foreignCustomerId = foreignCustomers[0].id;
  const orgId = customerProfile.organization_id;

  await Promise.all([
    setIdentity(customerDb, customerProfile.auth_user_id, customerProfile.email),
    setIdentity(foreignCustomerDb, foreignProfile.auth_user_id, foreignProfile.email),
    setIdentity(managerDb, manager.auth_user_id, manager.email),
    setIdentity(managerRetryDb, manager.auth_user_id, manager.email),
    setIdentity(accountantDb, accountant.auth_user_id, accountant.email),
    setServiceRole(serviceDb),
  ]);

  const initialBinding = await db.unsafe(
    "select source_mode,source_status,revision,external_account_ref from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  assert.equal(initialBinding.length, 1, "all existing customers must be backfilled to one source binding");
  assert.equal(initialBinding[0].source_mode, "APP_ONLY", "legacy customers stay APP_ONLY until approved cutover");
  assert.equal(initialBinding[0].source_status, "active");
  assert.equal(initialBinding[0].external_account_ref, null);
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
  const initialSummary = JSON.stringify(initialStatement.summary);


  // Seed a real order, invoice and invoice line so the APP_ONLY/ONYX RLS checks
  // cannot pass vacuously when the customer has no invoice rows.
  const sourceTestOrderId = randomUUID();
  const sourceTestInvoiceId = randomUUID();
  const sourceTestInvoiceItemId = randomUUID();
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
      "has_function_privilege('authenticated','public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamp with time zone,text,integer,text[],text)','EXECUTE') as sync_execute," +
      "has_function_privilege('authenticated','public.record_customer_financial_source_reconciliation_evidence(uuid,timestamp with time zone,text,text,text[],jsonb,text)','EXECUTE') as evidence_execute," +
      "has_function_privilege('service_role','public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamp with time zone,text,integer,text[],text)','EXECUTE') as service_sync_execute",
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

  const idempotencyKey = randomUUID() + randomUUID();
  const requestArgs = [customerId, "ONYX", "ONYX-CUST-0001", "Verified migration to Onyx customer ledger", idempotencyKey, 1];
  const concurrentRequests = await Promise.all([
    requestSource(managerDb, ...requestArgs),
    requestSource(managerRetryDb, ...requestArgs),
  ]);
  const requestIds = [...new Set(concurrentRequests.map(item => item.request_id))];
  assert.equal(requestIds.length, 1, "concurrent exact retries must resolve to one source-change request");
  assert.ok(concurrentRequests.some(item => item.replayed === true), "one concurrent duplicate must replay the request");
  const requestId = requestIds[0];
  assert.ok(concurrentRequests.every(item => item.status === "pending_reconciliation"));

  await expectFailure(
    "same idempotency key with a different request payload",
    requestSource(managerDb, customerId, "ONYX", "ONYX-CUST-0001", "Different reason must not reuse key", idempotencyKey, 1),
    "22023",
    "idempotency key",
  );
  await expectFailure(
    "finance request against a foreign-tenant customer",
    requestSource(managerDb, foreignCustomerId, "ONYX", "FOREIGN-CUST-0001", "cross tenant attempt", randomUUID() + randomUUID(), 1),
    "42501",
    "outside the active finance organization",
  );
  await expectFailure(
    "customer attempting to change the source",
    requestSource(customerDb, customerId, "MUTAKAMEL", "MUT-CUST-0001", "customer cannot control ledger source", randomUUID() + randomUUID(), 1),
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
  const mismatch = await recordReconciliation(requestId, "mismatch", mismatchTime[0].as_of, hash("mismatch"), "ONYX-REF-001");
  assert.equal(mismatch.status, "pending_reconciliation");
  await expectFailure(
    "mismatch reconciliation cannot be approved",
    reviewSource(accountantDb, requestId, "approve", "provider balances do not match"),
    "55000",
    "matched reconciliation",
  );

  const matchedTime = await serviceDb.unsafe("select statement_timestamp()-interval '2 minutes' as as_of");
  const matchedHash = hash("matched-onyx");
  const matchedEvidence = await recordReconciliation(requestId, "matched", matchedTime[0].as_of, matchedHash, "ONYX-REF-001");
  assert.equal(matchedEvidence.status, "pending_approval");
  const approved = await reviewSource(accountantDb, requestId, "approve", "verified opening ledger and currency totals match");
  assert.equal(approved.status, "approved");
  assert.equal(approved.source_mode, "ONYX");
  assert.equal(approved.revision, 2);
  const approvalReplay = await reviewSource(accountantDb, requestId, "approve", "verified opening ledger and currency totals match");
  assert.equal(approvalReplay.replayed, true);

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
  const staffSource = await rpc(accountantDb, "select public.get_customer_financial_source_for_staff($1::uuid) as result", [customerId]);
  assert.equal(staffSource.source_mode, "ONYX");
  assert.equal(staffSource.external_account_ref, "ONYX-CUST-0001");
  await expectFailure(
    "external statement must fail closed instead of using APP_ONLY ledger",
    rpc(customerDb, "select public.get_customer_account_statement() as result"),
    "55000",
    "app ledger fallback is prohibited",
  );

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
  await expectFailure(
    "external customer cannot read a real APP_ONLY invoice PDF",
    rpc(customerDb, "select public.get_customer_invoice_pdf($1::uuid) as result", [sourceTestInvoiceId]),
    "55000",
    "APP_ONLY invoice PDF",
  );

  const deniedHash = hash("auth-denied");
  await expectFailure(
    "authenticated customer cannot execute the service-role sync writer",
    rpc(customerDb,
      "select public.record_customer_financial_source_sync($1::uuid,$2::uuid,'ONYX','ONYX-CUST-0001',now(),$3::text,1,ARRAY['YER'],'AUTH-REF') as result",
      [orgId, customerId, deniedHash]),
    "42501",
    "service-role",
  );
  const syncTime = await serviceDb.unsafe("select statement_timestamp()-interval '1 minute' as as_of");
  const syncHash = hash("sync-onyx");
  const syncArgs = [orgId, customerId, "ONYX", "ONYX-CUST-0001", syncTime[0].as_of, syncHash, 3, ["YER", "USD"], "ONYX-SNAPSHOT-0001"];
  const syncSql = "select public.record_customer_financial_source_sync($1::uuid,$2::uuid,$3::text,$4::text,$5::timestamptz,$6::text,$7::integer,$8::text[],$9::text) as result";
  const syncResult = await rpc(serviceDb, syncSql, syncArgs);
  assert.equal(syncResult.replayed, false);
  const syncReplay = await rpc(serviceDb, syncSql, syncArgs);
  assert.equal(syncReplay.replayed, true, "same evidence hash replays without duplicate sync row");
  await expectFailure(
    "same provider evidence hash with changed metadata",
    rpc(serviceDb, syncSql, [...syncArgs.slice(0, 6), 4, syncArgs[7], syncArgs[8]]),
    "22023",
    "replayed with different metadata",
  );
  const staleTime = await serviceDb.unsafe("select statement_timestamp()-interval '10 minutes' as as_of");
  await expectFailure(
    "source watermark cannot move backwards",
    rpc(serviceDb, syncSql, [orgId, customerId, "ONYX", "ONYX-CUST-0001", staleTime[0].as_of, hash("old-snapshot"), 1, ["YER"], "OLD-SNAPSHOT"]),
    "40001",
    "move the customer statement watermark backwards",
  );
  await expectFailure(
    "sync cannot write another external customer account reference",
    rpc(serviceDb, syncSql, [orgId, customerId, "ONYX", "ONYX-CUST-OTHER", syncTime[0].as_of, hash("wrong-account"), 1, ["YER"], "WRONG-ACCOUNT"]),
    "42501",
    "does not match the active customer financial source binding",
  );

  const mutakamelRequest = await requestSource(
    accountantDb, customerId, "MUTAKAMEL", "MUT-CUST-0001",
    "cutover from Onyx to Mutakamel after full reconciliation", randomUUID() + randomUUID(), 2,
  );
  assert.equal(mutakamelRequest.status, "pending_reconciliation");
  const mutakamelTime = await serviceDb.unsafe("select statement_timestamp()-interval '2 minutes' as as_of");
  await recordReconciliation(mutakamelRequest.request_id, "matched", mutakamelTime[0].as_of, hash("matched-mutakamel"), "MUT-REF-001");
  const mutakamelApproved = await reviewSource(managerDb, mutakamelRequest.request_id, "approve", "Mutakamel opening balances and currencies reconciled");
  assert.equal(mutakamelApproved.source_mode, "MUTAKAMEL");
  assert.equal(mutakamelApproved.revision, 3);

  const appOnlyRequest = await requestSource(
    managerDb, customerId, "APP_ONLY", null,
    "return to app-only after closing and matching external balances", randomUUID() + randomUUID(), 3,
  );
  assert.equal(appOnlyRequest.status, "pending_reconciliation");
  const appOnlyTime = await serviceDb.unsafe("select statement_timestamp()-interval '2 minutes' as as_of");
  await recordReconciliation(appOnlyRequest.request_id, "matched", appOnlyTime[0].as_of, hash("matched-app-only"), "APP-LEDGER-CUTOVER-001");
  const appOnlyApproved = await reviewSource(accountantDb, appOnlyRequest.request_id, "approve", "all external balances reconciled to the app ledger before cutover");
  assert.equal(appOnlyApproved.source_mode, "APP_ONLY");
  assert.equal(appOnlyApproved.revision, 4);

  const finalResolver = await rpc(customerDb, "select public.get_my_customer_financial_source() as result");
  assert.equal(finalResolver.source_mode, "APP_ONLY");
  assert.equal(finalResolver.can_read_app_ledger, true);
  const finalStatement = await rpc(customerDb, "select public.get_customer_account_statement() as result");
  assert.equal(JSON.stringify(finalStatement.summary), initialSummary, "source cutover must not synthesize or alter the app ledger");

  await expectFailure(
    "staff cannot resolve a foreign tenant customer's financial source",
    rpc(managerDb, "select public.get_customer_financial_source_for_staff($1::uuid) as result", [foreignCustomerId]),
    "42501",
    "outside the active organization",
  );
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
    "select source_mode,source_status,external_account_ref,revision from public.customer_financial_source_bindings where organization_id=$1::uuid and customer_id=$2::uuid",
    [orgId, customerId],
  );
  assert.equal(finalBinding[0].source_mode, "APP_ONLY");
  assert.equal(finalBinding[0].external_account_ref, null);
  assert.equal(finalBinding[0].revision, 4);
  process.stdout.write(
    "Customer financial source routing PostgreSQL 17 acceptance: PASS " +
      JSON.stringify({
        transitions: ["APP_ONLY -> ONYX", "ONYX -> MUTAKAMEL", "MUTAKAMEL -> APP_ONLY"],
        concurrentIdempotency: true,
        sourceEvidenceAndFreshness: true,
        syncReplayAndMonotonicWatermark: true,
        makerChecker: true,
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
