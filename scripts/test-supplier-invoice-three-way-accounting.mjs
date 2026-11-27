import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for supplier invoice three-way acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) { return typeof value === "string" ? JSON.parse(value) : value; }

const connectionString = requiredEnv("TEST_DATABASE_URL");
validateCashExpenseEndpoints(requiredEnv("E2E_SUPABASE_URL"), connectionString);
const organizationId = "a0000000-0000-0000-0000-000000000001";
const productId = "a1000000-0000-0000-0000-000000000001";
const supplierId = "a2000000-0000-0000-0000-000000000001";
const warehouseId = "d0000000-0000-0000-0000-000000000001";
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL").toLowerCase();
const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function expectSqlState(label, action, code, messagePattern) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " must be rejected");
  assert.equal(caught.code, code, label + " must return SQLSTATE " + code + "; got " + String(caught));
  if (messagePattern) assert.match(String(caught.message), messagePattern, label + " must explain the rejection");
  return caught;
}
async function findProfile(email) {
  const rows = await db.unsafe(
    "select id,auth_user_id,email from public.profiles where organization_id=$1::uuid and lower(email)=lower($2) and is_active=true limit 1",
    [organizationId, email],
  );
  assert.equal(rows.length, 1, "an active isolated profile must exist for " + email);
  return rows[0];
}
async function setIdentity(profile) {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$1,now(),now(),now(),null,'P2 supplier invoice three-way acceptance','127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [profile.auth_user_id],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [profile.auth_user_id]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: profile.auth_user_id, email: profile.email, role: "authenticated", session_id: profile.auth_user_id }),
  ]);
  await db.unsafe("set role authenticated");
}
async function rpcJson(sql, args) {
  return asJson((await db.unsafe(sql, args))[0].result);
}
async function createAccount(suffix, label, type, creatorId) {
  const rows = await db.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,is_active,created_by_profile_id) " +
    "values($1::uuid,$2,$3,$4,true,$5::uuid) returning id,account_type",
    [organizationId, "P2.3WAY." + suffix, label, type, creatorId],
  );
  assert.equal(rows.length, 1);
  return rows[0].id;
}
async function makePostedReceipt(manager, admin, accounts, unitCost, description) {
  await setIdentity(manager);
  const poResult = await rpcJson(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [supplierId, warehouseId, db.json([{ product_id: productId, quantity: 1, unit_cost: unitCost }]),
      description, randomUUID().replaceAll("-", "")],
  );
  const po = poResult.purchase_order;
  assert.ok(po?.id, "purchase order must be persisted");
  await rpcJson("select public.submit_purchase_order($1::uuid) as result", [po.id]);

  await db.unsafe("reset role");
  const orderLines = await db.unsafe(
    "select id from public.purchase_order_items where organization_id=$1::uuid and purchase_order_id=$2::uuid",
    [organizationId, po.id],
  );
  assert.equal(orderLines.length, 1, "the test order must have exactly one source line");

  await setIdentity(manager);
  const received = await rpcJson(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [po.id, db.json([{ item_id: orderLines[0].id, quantity: 1 }]), "P2 physical receipt for supplier invoice", "p2-3way-" + randomUUID().replaceAll("-", "")],
  );
  assert.ok(received.receipt?.id, "physical receipt must be persisted");

  await setIdentity(manager);
  const receiptDraft = await rpcJson(
    "select public.prepare_purchase_receipt_accounting_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid) as result",
    [received.receipt.id, accounts.inventory, accounts.payable, randomUUID()],
  );
  assert.equal(receiptDraft.status, "draft");
  assert.ok(receiptDraft.journal_entry_id, "source receipt must create a linked payable draft");

  await setIdentity(admin);
  const posted = await rpcJson(
    "select public.post_general_journal_entry($1::uuid) as result",
    [receiptDraft.journal_entry_id],
  );
  assert.equal(posted.status, "posted", "independent admin must post the physical-receipt journal");

  await db.unsafe("reset role");
  const source = await db.unsafe(
    "select ri.id as receipt_item_id,r.receipt_number,p.source_amount::numeric(18,2)::text as source_amount," +
    "p.source_currency,j.status as journal_status,j.source_type,j.source_reference " +
    "from public.purchase_receipt_items ri " +
    "join public.purchase_receipts r on r.id=ri.receipt_id and r.organization_id=ri.organization_id " +
    "join public.purchase_receipt_accounting_postings p on p.receipt_id=r.id and p.organization_id=r.organization_id " +
    "join public.accounting_journal_entries j on j.id=p.journal_entry_id and j.organization_id=p.organization_id " +
    "where ri.organization_id=$1::uuid and r.id=$2::uuid",
    [organizationId, received.receipt.id],
  );
  assert.equal(source.length, 1, "receipt must have exactly one durable accounting source link");
  assert.equal(source[0].journal_status, "posted");
  assert.equal(source[0].source_type, "purchase_receipt");
  assert.equal(source[0].source_reference, source[0].receipt_number);
  assert.equal(source[0].source_amount, Number(unitCost).toFixed(2));
  assert.equal(source[0].source_currency, "YER");
  return { purchaseOrderId: po.id, receiptId: received.receipt.id, receiptItemId: source[0].receipt_item_id };
}
async function recordInvoice(manager, source, input) {
  await setIdentity(manager);
  const today = (await db.unsafe("select current_date::text as day"))[0].day;
  const lines = [{
    receipt_item_id: source.receiptItemId,
    quantity: input.quantity || "1",
    unit_cost: input.unitCost,
    line_total: input.lineTotal,
  }];
  return rpcJson(
    "select public.record_purchase_supplier_invoice($1::uuid,$2::text,$3::date,$4::numeric,$5::numeric,$6::numeric,$7::jsonb,$8::uuid) as result",
    [source.purchaseOrderId, input.invoiceNumber, today, input.subtotal, input.tax, input.total, db.json(lines), input.key],
  );
}
async function reviewVariance(actor, invoiceId, approve, reason) {
  await setIdentity(actor);
  return rpcJson(
    "select public.review_purchase_supplier_invoice_variance($1::uuid,$2::boolean,$3::text) as result",
    [invoiceId, approve, reason],
  );
}
async function prepareInvoice(actor, invoiceId, taxAccountId, varianceAccountId, key) {
  await setIdentity(actor);
  return rpcJson(
    "select public.prepare_purchase_supplier_invoice_accounting_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid) as result",
    [invoiceId, taxAccountId, varianceAccountId, key],
  );
}
async function invoiceSnapshot(invoiceId) {
  await db.unsafe("reset role");
  const rows = await db.unsafe(
    "select jsonb_build_object(" +
    "'invoice',(select to_jsonb(i) from public.purchase_supplier_invoices i where i.organization_id=$1::uuid and i.id=$2::uuid)," +
    "'lines',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]'::jsonb) from public.purchase_supplier_invoice_lines l where l.organization_id=$1::uuid and l.invoice_id=$2::uuid)," +
    "'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.purchase_supplier_invoice_events e where e.organization_id=$1::uuid and e.invoice_id=$2::uuid)," +
    "'handoffs',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb) from public.purchase_supplier_invoice_accounting_drafts d where d.organization_id=$1::uuid and d.invoice_id=$2::uuid)," +
    "'journals',(select coalesce(jsonb_agg(jsonb_build_object('entry',to_jsonb(j),'lines'," +
      "(select coalesce(jsonb_agg(to_jsonb(l) order by l.line_number),'[]'::jsonb) from public.accounting_journal_lines l where l.organization_id=j.organization_id and l.journal_entry_id=j.id)) order by j.id),'[]'::jsonb) " +
      "from public.accounting_journal_entries j join public.purchase_supplier_invoice_accounting_drafts d on d.journal_entry_id=j.id and d.organization_id=j.organization_id " +
      "where d.organization_id=$1::uuid and d.invoice_id=$2::uuid)," +
    "'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from public.audit_logs a where a.organization_id=$1::uuid and a.entity_type='purchase_supplier_invoice' and a.entity_id=$2::uuid)" +
    ") as snapshot",
    [organizationId, invoiceId],
  );
  return JSON.stringify(rows[0].snapshot);
}
async function auditCount(invoiceId, action) {
  const rows = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and entity_type='purchase_supplier_invoice' and entity_id=$2::uuid and action=$3",
    [organizationId, invoiceId, action],
  );
  return rows[0].count;
}
async function main() {
  const manager = await findProfile(managerEmail);
  const admin = await findProfile(adminEmail);
  const customer = await findProfile(customerEmail);
  assert.notEqual(manager.id, admin.id, "maker and checker profiles must be distinct");
  assert.notEqual(manager.id, customer.id);
  const roles = await db.unsafe(
    "select profile_id,role from public.user_roles where profile_id=any($1::uuid[]) and role in ('manager','admin')",
    [[manager.id, admin.id]],
  );
  assert.ok(roles.some(row => row.profile_id === manager.id && row.role === "manager"));
  assert.ok(roles.some(row => row.profile_id === admin.id && row.role === "admin"));

  const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  await db.unsafe("reset role");
  const accounts = {
    inventory: await createAccount(suffix + "I", "P2 three-way source inventory " + suffix, "asset", manager.id),
    payable: await createAccount(suffix + "P", "P2 three-way supplier payable " + suffix, "liability", manager.id),
    variance: await createAccount(suffix + "V", "P2 supplier invoice variance " + suffix, "expense", manager.id),
    tax: await createAccount(suffix + "T", "P2 supplier input tax " + suffix, "asset", manager.id),
  };

  // Exact three-way match, immutable line evidence and no second payable journal.
  const exactSource = await makePostedReceipt(manager, admin, accounts, 100.25, "P2 exact supplier invoice three-way match");
  const exactKey = randomUUID();
  const exactNumber = "P2-3WAY-EXACT-" + suffix;
  const exactInput = { invoiceNumber: exactNumber, subtotal: "100.25", tax: "0.00", total: "100.25", unitCost: "100.25", lineTotal: "100.25", key: exactKey };
  const exact = await recordInvoice(manager, exactSource, exactInput);
  assert.equal(exact.match_status, "matched");
  assert.equal(exact.tax_accounting_status, "not_required");
  assert.equal(exact.replayed, false);
  const exactReplay = await recordInvoice(manager, exactSource, exactInput);
  assert.equal(exactReplay.invoice_id, exact.invoice_id);
  assert.equal(exactReplay.replayed, true);

  await expectSqlState(
    "same invoice idempotency key with changed invoice payload",
    () => recordInvoice(manager, exactSource, { ...exactInput, invoiceNumber: exactNumber + "-CHANGED", subtotal: "100.26", total: "100.26", unitCost: "100.26", lineTotal: "100.26" }),
    "22023", /idempotency key payload conflict/i,
  );
  await expectSqlState(
    "duplicate supplier invoice number with a new key",
    () => recordInvoice(manager, exactSource, { ...exactInput, key: randomUUID() }),
    "23505", /invoice number has already been recorded/i,
  );
  await expectSqlState(
    "re-invoice physical quantity already consumed by a matched invoice",
    () => recordInvoice(manager, exactSource, { ...exactInput, invoiceNumber: exactNumber + "-OVER", key: randomUUID() }),
    "22023", /exceeds the not-yet-invoiced physical received quantity/i,
  );

  const exactBeforeDeny = await invoiceSnapshot(exact.invoice_id);
  await setIdentity(manager);
  await expectSqlState(
    "invoice author cannot prepare their own accounting handoff",
    () => prepareInvoice(manager, exact.invoice_id, null, null, randomUUID()),
    "42501", /different finance actor/i,
  );
  await setIdentity(customer);
  const customerRows = await db.unsafe(
    "select count(*)::integer as count from public.purchase_supplier_invoices where id=$1::uuid",
    [exact.invoice_id],
  );
  assert.equal(customerRows[0].count, 0, "customer RLS must hide the finance invoice and its amount");
  await expectSqlState(
    "customer cannot fetch supplier invoice accounting status",
    () => rpcJson("select public.fetch_purchase_supplier_invoice_accounting_status($1::uuid) as result", [exact.invoice_id]),
    "42501", /finance permission required/i,
  );
  const exactDeniedInsertBefore = await invoiceSnapshot(exact.invoice_id);
  await setIdentity(customer);
  await expectSqlState(
    "customer cannot directly mutate supplier invoice evidence",
    () => db.unsafe("update public.purchase_supplier_invoices set supplier_invoice_number=supplier_invoice_number||'-DENIED' where id=$1::uuid", [exact.invoice_id]),
    "42501",
  );
  await db.unsafe("reset role");
  assert.equal(await invoiceSnapshot(exact.invoice_id), exactBeforeDeny, "denied creator/customer actions must leave source, lines, events, handoffs, journals and audit byte-for-byte unchanged");
  assert.equal(exactDeniedInsertBefore, exactBeforeDeny);

  const exactHandoffKey = randomUUID();
  const exactHandoff = await prepareInvoice(admin, exact.invoice_id, null, null, exactHandoffKey);
  assert.equal(exactHandoff.accounting_status, "no_adjustment_required");
  assert.equal(exactHandoff.replayed, false);
  assert.equal(exactHandoff.journal_entry_id, null, "an exact receipt/invoice match must not create a second payable journal");
  const exactHandoffReplay = await prepareInvoice(admin, exact.invoice_id, null, null, exactHandoffKey);
  assert.equal(exactHandoffReplay.handoff_id, exactHandoff.handoff_id);
  assert.equal(exactHandoffReplay.replayed, true);
  await db.unsafe("reset role");
  const exactRows = await db.unsafe(
    "select count(*)::integer as handoffs,count(*) filter (where journal_entry_id is not null)::integer as journal_handoffs " +
    "from public.purchase_supplier_invoice_accounting_drafts where organization_id=$1::uuid and invoice_id=$2::uuid",
    [organizationId, exact.invoice_id],
  );
  assert.equal(exactRows[0].handoffs, 1);
  assert.equal(exactRows[0].journal_handoffs, 0);
  assert.equal(await auditCount(exact.invoice_id, "supplier_invoice.accounting_reconciled"), 1);

  // Price variance plus explicit tax: maker/checker review and exact balanced journal handoff.
  const varianceSource = await makePostedReceipt(manager, admin, accounts, 200, "P2 supplier invoice variance three-way source");
  const varianceKey = randomUUID();
  const varianceNumber = "P2-3WAY-VARIANCE-" + suffix;
  const varianceInput = { invoiceNumber: varianceNumber, subtotal: "205.00", tax: "2.00", total: "207.00", unitCost: "205.00", lineTotal: "205.00", key: varianceKey };
  const variance = await recordInvoice(manager, varianceSource, varianceInput);
  assert.equal(variance.match_status, "variance_pending");
  assert.equal(variance.tax_accounting_status, "pending");
  assert.equal(variance.merchandise_variance_amount, "5.00");
  const varianceReplay = await recordInvoice(manager, varianceSource, varianceInput);
  assert.equal(varianceReplay.invoice_id, variance.invoice_id);
  assert.equal(varianceReplay.replayed, true);

  await expectSqlState(
    "invoice maker cannot approve their own price variance",
    () => reviewVariance(manager, variance.invoice_id, true, "مراجعة مستقلة لفارق السعر"),
    "42501", /different finance actor/i,
  );
  const approvalReason = "اعتماد فرق السعر بعد مطابقة الفاتورة بإيصال الاستلام";
  const approved = await reviewVariance(admin, variance.invoice_id, true, approvalReason);
  assert.equal(approved.match_status, "variance_approved");
  assert.equal(approved.replayed, false);
  const approvalReplay = await reviewVariance(admin, variance.invoice_id, true, approvalReason);
  assert.equal(approvalReplay.replayed, true);
  await expectSqlState(
    "final variance decision cannot be silently changed",
    () => reviewVariance(admin, variance.invoice_id, false, "رفض بعد الاعتماد"),
    "55000", /already has a different final decision/i,
  );

  await expectSqlState(
    "invoice maker cannot prepare the handoff after independent approval",
    () => prepareInvoice(manager, variance.invoice_id, accounts.tax, accounts.variance, randomUUID()),
    "42501", /invoice creator cannot prepare/i,
  );
  const handoffKey = randomUUID();
  const handoff = await prepareInvoice(admin, variance.invoice_id, accounts.tax, accounts.variance, handoffKey);
  assert.equal(handoff.accounting_status, "journal_draft_created");
  assert.equal(handoff.journal_status, "draft");
  assert.ok(handoff.journal_entry_id);
  assert.equal(handoff.replayed, false);
  const handoffReplay = await prepareInvoice(admin, variance.invoice_id, accounts.tax, accounts.variance, handoffKey);
  assert.equal(handoffReplay.journal_entry_id, handoff.journal_entry_id);
  assert.equal(handoffReplay.replayed, true);

  await expectSqlState(
    "accounting handoff idempotency key cannot be reused with a changed account mapping",
    () => prepareInvoice(admin, variance.invoice_id, accounts.variance, accounts.tax, handoffKey),
    "22023", /idempotency key payload conflict/i,
  );

  await db.unsafe("reset role");
  const journal = await db.unsafe(
    "select j.id,j.status,j.source_type,j.source_reference,j.created_by_profile_id,j.posted_by_profile_id," +
    "sum(l.debit)::numeric(18,2)::text as debits,sum(l.credit)::numeric(18,2)::text as credits " +
    "from public.accounting_journal_entries j join public.accounting_journal_lines l " +
    "on l.organization_id=j.organization_id and l.journal_entry_id=j.id " +
    "where j.organization_id=$1::uuid and j.id=$2::uuid group by j.id",
    [organizationId, handoff.journal_entry_id],
  );
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, "draft");
  assert.equal(journal[0].source_type, "purchase_supplier_invoice");
  assert.equal(journal[0].source_reference, varianceNumber);
  assert.equal(journal[0].created_by_profile_id, admin.id, "independent finance checker is the handoff journal maker");
  assert.equal(journal[0].debits, "7.00");
  assert.equal(journal[0].credits, "7.00");
  const journalLines = await db.unsafe(
    "select account_id,sum(debit)::numeric(18,2)::text as debit,sum(credit)::numeric(18,2)::text as credit " +
    "from public.accounting_journal_lines where organization_id=$1::uuid and journal_entry_id=$2::uuid group by account_id",
    [organizationId, handoff.journal_entry_id],
  );
  const byAccount = new Map(journalLines.map(row => [row.account_id, row]));
  assert.equal(byAccount.get(accounts.variance)?.debit, "5.00", "merchandise variance posts to the explicitly selected expense account");
  assert.equal(byAccount.get(accounts.tax)?.debit, "2.00", "tax posts to the explicitly selected tax asset account");
  assert.equal(byAccount.get((await db.unsafe(
    "select source_payable_account_id from public.purchase_supplier_invoice_accounting_drafts where organization_id=$1::uuid and invoice_id=$2::uuid",
    [organizationId, variance.invoice_id],
  ))[0].source_payable_account_id)?.credit, "7.00", "one payable adjustment is credited for the exact invoice total above source receipt cost");
  assert.equal(await auditCount(variance.invoice_id, "supplier_invoice.accounting_draft_created"), 1);
  assert.equal(await auditCount(variance.invoice_id, "supplier_invoice.variance_reviewed"), 1);

  // The handoff maker cannot post their own journal; the independent manager posts once.
  await setIdentity(admin);
  await expectSqlState(
    "journal handoff maker cannot post their own journal",
    () => rpcJson("select public.post_general_journal_entry($1::uuid) as result", [handoff.journal_entry_id]),
    "42501", /independent checker/i,
  );
  await setIdentity(manager);
  const posted = await rpcJson(
    "select public.post_general_journal_entry($1::uuid) as result",
    [handoff.journal_entry_id],
  );
  assert.equal(posted.status, "posted");
  assert.equal(posted.replayed, false);
  const postedReplay = await rpcJson(
    "select public.post_general_journal_entry($1::uuid) as result",
    [handoff.journal_entry_id],
  );
  assert.equal(postedReplay.status, "posted");
  assert.equal(postedReplay.replayed, true, "exact posted retry is replay-safe");
  await setIdentity(admin);
  const status = await rpcJson(
    "select public.fetch_purchase_supplier_invoice_accounting_status($1::uuid) as result",
    [variance.invoice_id],
  );
  assert.equal(status.accounting_status, "journal_posted");
  await db.unsafe("reset role");
  assert.equal(await auditCount(variance.invoice_id, "supplier_invoice.accounting_draft_created"), 1);
  await db.unsafe("reset role");
  const postedJournal = await db.unsafe(
    "select status,posted_by_profile_id from public.accounting_journal_entries where organization_id=$1::uuid and id=$2::uuid",
    [organizationId, handoff.journal_entry_id],
  );
  assert.equal(postedJournal[0].status, "posted");
  assert.equal(postedJournal[0].posted_by_profile_id, manager.id, "journal checker differs from the handoff maker");

  // Rejected variance is final and can never reach a payable adjustment journal.
  const rejectedSource = await makePostedReceipt(manager, admin, accounts, 300, "P2 supplier invoice rejected variance source");
  const rejectedNumber = "P2-3WAY-REJECTED-" + suffix;
  const rejectedKey = randomUUID();
  const rejected = await recordInvoice(manager, rejectedSource, {
    invoiceNumber: rejectedNumber, subtotal: "301.00", tax: "0.00", total: "301.00",
    unitCost: "301.00", lineTotal: "301.00", key: rejectedKey,
  });
  assert.equal(rejected.match_status, "variance_pending");
  const rejectedReason = "رفض فرق السعر لعدم كفاية مستند المورد";
  const deniedDecision = await reviewVariance(admin, rejected.invoice_id, false, rejectedReason);
  assert.equal(deniedDecision.match_status, "variance_rejected");
  const deniedReplay = await reviewVariance(admin, rejected.invoice_id, false, rejectedReason);
  assert.equal(deniedReplay.replayed, true);
  const rejectedBeforeHandoff = await invoiceSnapshot(rejected.invoice_id);
  await expectSqlState(
    "rejected price variance cannot create a payable handoff",
    () => prepareInvoice(admin, rejected.invoice_id, null, accounts.variance, randomUUID()),
    "22023", /must be exactly matched or have its price variance independently approved/i,
  );
  assert.equal(await invoiceSnapshot(rejected.invoice_id), rejectedBeforeHandoff, "denied handoff must leave invoice, journal and audit snapshot unchanged");
  await db.unsafe("reset role");
  const rejectedHandoffs = await db.unsafe(
    "select count(*)::integer as count from public.purchase_supplier_invoice_accounting_drafts where organization_id=$1::uuid and invoice_id=$2::uuid",
    [organizationId, rejected.invoice_id],
  );
  const rejectedJournals = await db.unsafe(
    "select count(*)::integer as count from public.accounting_journal_entries where organization_id=$1::uuid and source_type='purchase_supplier_invoice' and source_reference=$2",
    [organizationId, rejectedNumber],
  );
  assert.equal(rejectedHandoffs[0].count, 0);
  assert.equal(rejectedJournals[0].count, 0);

  // Final source, line and event evidence is append-only; direct authenticated mutation is denied.
  await setIdentity(manager);
  const varianceBeforeDirectWrite = await invoiceSnapshot(variance.invoice_id);
  await setIdentity(manager);
  await expectSqlState(
    "finance user cannot directly update immutable supplier invoice lines",
    () => db.unsafe("update public.purchase_supplier_invoice_lines set invoiced_quantity=1.001 where organization_id=$1::uuid and invoice_id=$2::uuid", [organizationId, variance.invoice_id]),
    "42501",
  );
  await db.unsafe("reset role");
  assert.equal(await invoiceSnapshot(variance.invoice_id), varianceBeforeDirectWrite);

  const allInvoices = await db.unsafe(
    "select count(*)::integer as count from public.purchase_supplier_invoices where organization_id=$1::uuid and id in ($2::uuid,$3::uuid,$4::uuid)",
    [organizationId, exact.invoice_id, variance.invoice_id, rejected.invoice_id],
  );
  assert.equal(allInvoices[0].count, 3);
  process.stdout.write(
    "PASS PostgreSQL 17 supplier invoice three-way acceptance: receipt-linked quantities/costs, exact replay and conflicts, duplicate invoice number and quantity ceiling, independent variance review, no-adjustment/no-duplicate-payable path, explicit tax/variance posting, maker-checker journal posting, rejected-variance denial, tenant privacy, immutable evidence and audit invariants.\\n",
  );
}
main().catch(error => {
  process.stderr.write("FAIL supplier invoice three-way accounting acceptance: " + String(error?.stack ?? error) + "\\n");
  process.exitCode = 1;
}).finally(async () => { await db.end({ timeout: 5 }).catch(() => {}); });
