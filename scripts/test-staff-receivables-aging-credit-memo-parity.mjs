import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for receivables aging credit-memo acceptance.");
const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

const organizationId = "a0000000-0000-0000-0000-000000000001";
const customerProfileId = "f1111111-1111-4111-8111-111111111111";
const customerAuthId = "11111111-1111-4111-8111-111111111111";
const managerProfileId = "f7777777-7777-4777-8777-777777777777";
const managerAuthId = "77777777-7777-4777-8777-777777777777";
const suffix = randomUUID().replaceAll("-", "");

function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function setManagerIdentity(sessionId) {
  const hasSessionTable = (await db.unsafe("select pg_catalog.to_regclass('auth.sessions') is not null as present"))[0].present;
  const claims = { sub: managerAuthId, email: "ci-return-manager@example.test", role: "authenticated" };
  if (hasSessionTable) {
    await db.unsafe(
      "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
      "values($1::uuid,$2::uuid,pg_catalog.now(),pg_catalog.now(),pg_catalog.now(),null,'CI receivables aging acceptance','192.0.2.44'::inet) " +
      "on conflict(id) do update set user_id=excluded.user_id,updated_at=excluded.updated_at,refreshed_at=excluded.refreshed_at,not_after=null",
      [sessionId, managerAuthId],
    );
    claims.session_id = sessionId;
  }
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [managerAuthId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
  await db.unsafe("set role authenticated");
}

async function receivablesItem(invoiceId) {
  const limit = 500;
  const firstRaw = await db.unsafe(
    "select public.fetch_staff_receivables_aging($1::integer,$2::integer) as result",
    [limit, 0],
  );
  const first = asJson(firstRaw[0].result);
  const match = (first.items || []).find((row) => row.id === invoiceId);
  if (match) return { page: first, item: match };
  const total = Number(first.total_open_invoices || 0);
  for (let offset = limit; offset < total; offset += limit) {
    const raw = await db.unsafe(
      "select public.fetch_staff_receivables_aging($1::integer,$2::integer) as result",
      [limit, offset],
    );
    const page = asJson(raw[0].result);
    const item = (page.items || []).find((row) => row.id === invoiceId);
    if (item) return { page, item };
  }
  throw new Error("Expected source invoice was not found in the complete paginated receivables aging result.");
}

async function main() {
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1::uuid,'ci-return-manager@example.test',pg_catalog.now()) " +
    "on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [managerAuthId],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
    "values($1::uuid,$2::uuid,$3::uuid,'CI Return Manager','ci-return-manager@example.test',true) " +
    "on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,is_active=true",
    [managerProfileId, managerAuthId, organizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1::uuid,'manager') on conflict(profile_id,role) do nothing",
    [managerProfileId],
  );

  // Choose a real issued invoice line with enough receivable balance and no prior return request for that order line.
  const sourceRows = await db.unsafe(
    "select ci.id::text as invoice_id,ci.customer_id::text as customer_id,ci.order_id::text as order_id," +
    "ci.currency,ci.total_amount::text as total_amount,cii.id::text as invoice_item_id," +
    "cii.order_item_id::text as order_item_id,cii.product_id::text as product_id,cii.item_code,cii.description,cii.unit," +
    "cii.quantity::text as quantity,cii.line_total::text as line_total " +
    "from public.customer_invoices ci " +
    "join public.customers c on c.id=ci.customer_id and c.organization_id=ci.organization_id and c.profile_id=$2::uuid " +
    "join public.customer_invoice_items cii on cii.organization_id=ci.organization_id and cii.invoice_id=ci.id " +
    "where ci.organization_id=$1::uuid and ci.status<>'void' and ci.currency='YER' " +
    "and cii.order_item_id is not null and cii.quantity>=0.500 " +
    "and NOT EXISTS (select 1 from public.customer_return_request_items prior_item " +
    " join public.customer_return_requests prior_request on prior_request.id=prior_item.return_request_id " +
    " and prior_request.organization_id=prior_item.organization_id " +
    " where prior_item.organization_id=ci.organization_id and prior_item.order_item_id=cii.order_item_id) " +
    "and ci.total_amount=ci.subtotal+ci.tax_amount " +
    "and greatest(ci.total_amount-coalesce((select pg_catalog.sum(cp.amount) from public.customer_payments cp " +
    " where cp.organization_id=ci.organization_id and cp.invoice_id=ci.id),0)-coalesce((select pg_catalog.sum(cm.total_amount) " +
    " from public.customer_return_credit_memos cm where cm.organization_id=ci.organization_id and cm.invoice_id=ci.id " +
    " and cm.status='posted' and cm.currency=ci.currency),0),0) > (cii.line_total/nullif(cii.quantity,0))*0.500 " +
    "and coalesce((select pg_catalog.sum(mi.returned_quantity) from public.customer_return_credit_memo_items mi " +
    " join public.customer_return_credit_memos cm on cm.id=mi.credit_memo_id and cm.organization_id=mi.organization_id " +
    " where mi.organization_id=ci.organization_id and mi.invoice_item_id=cii.id and cm.status in ('draft','posted')),0)+0.500 <= cii.quantity " +
    "order by ci.issued_at desc,ci.id,cii.id limit 1",
    [organizationId, customerProfileId],
  );
  assert.equal(sourceRows.length, 1, "an eligible source-linked invoice line is required for receivables aging acceptance");
  const source = sourceRows[0];
  const warehouseRows = await db.unsafe(
    "select id::text as id from public.warehouses where organization_id=$1::uuid and is_active order by created_at,id limit 1",
    [organizationId],
  );
  assert.equal(warehouseRows.length, 1, "an active warehouse is required for the isolated return receipt");

  const requestId = randomUUID();
  const requestItemId = randomUUID();
  const receiptKey = "ci-aging-receipt-" + suffix;
  const requestKey = "ci-aging-request-" + suffix;
  const requestNumber = "CI-AGE-" + suffix.slice(0, 16).toUpperCase();
  const sessionId = randomUUID();
  const quantity = 0.500;

  await db.unsafe(
    "insert into public.customer_return_requests(" +
    "id,organization_id,customer_id,order_id,request_number,status,reason,notes,requested_by,reviewed_by,reviewed_at,review_note,idempotency_key,payload_fingerprint) " +
    "values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'approved','other','CI source-linked credit for aging acceptance',$6::uuid,$7::uuid," +
    "pg_catalog.now(),'approved in isolated database acceptance',$8,pg_catalog.md5($8))",
    [requestId,organizationId,source.customer_id,source.order_id,requestNumber,customerProfileId,managerProfileId,requestKey],
  );
  await db.unsafe(
    "insert into public.customer_return_request_items(" +
    "id,organization_id,return_request_id,order_item_id,product_id,item_code_snapshot,product_name_snapshot,unit_snapshot,requested_quantity) " +
    "values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9::numeric)",
    [requestItemId,organizationId,requestId,source.order_item_id,source.product_id,source.item_code,source.description,source.unit,quantity],
  );

  await setManagerIdentity(sessionId);
  const before = await receivablesItem(source.invoice_id);
  await db.unsafe("reset role");
  const accountRows = await db.unsafe(
    "select " +
    "(select id::text from public.accounting_accounts where organization_id=$1::uuid and is_active and account_type='asset' order by code,id limit 1) as receivable_id," +
    "(select id::text from public.accounting_accounts where organization_id=$1::uuid and is_active and account_type='revenue' order by code,id limit 1) as revenue_id",
    [organizationId],
  );
  assert.ok(accountRows[0].receivable_id, "an active same-tenant receivable account is required");
  assert.ok(accountRows[0].revenue_id, "an active same-tenant revenue account is required");
  await setManagerIdentity(sessionId);

  const receiptRaw = await db.unsafe(
    "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [requestId,warehouseRows[0].id,db.json([{request_item_id:requestItemId,received_quantity:quantity,restockable_quantity:quantity}]),
      "CI source-linked return for aging acceptance",receiptKey],
  );
  const receipt = asJson(receiptRaw[0].result);
  assert.equal(receipt.request_status,"received", "the return must reach a fully received state before crediting");

  const afterReceipt = await receivablesItem(source.invoice_id);
  assert.equal(Number(afterReceipt.item.credit_memo_amount),Number(before.item.credit_memo_amount),
    "physical receipt alone must not reduce accounting receivables");
  assert.equal(Number(afterReceipt.item.outstanding_amount),Number(before.item.outstanding_amount),
    "physical receipt alone must not change the invoice ledger balance");

  const draftRaw = await db.unsafe(
    "select public.prepare_customer_return_credit_memo($1::uuid,$2::uuid,$3::uuid,null,$4::uuid) as result",
    [requestId,accountRows[0].receivable_id,accountRows[0].revenue_id,randomUUID()],
  );
  const draft = asJson(draftRaw[0].result);
  assert.equal(draft.status,"draft", "credit memo must start as an unposted draft");
  assert.ok(Number(draft.total_amount)>0,"credit memo amount must be computed from the recorded source line");
  const withDraft = await receivablesItem(source.invoice_id);
  assert.equal(Number(withDraft.item.credit_memo_amount),Number(before.item.credit_memo_amount),
    "draft credit memos have no financial effect on receivables aging");
  assert.equal(Number(withDraft.item.outstanding_amount),Number(before.item.outstanding_amount),
    "draft credit memos do not reduce outstanding invoices");

  const postedRaw = await db.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result",
    [draft.journal_entry_id],
  );
  const posted = asJson(postedRaw[0].result);
  assert.equal(posted.status,"posted","the source-linked balanced journal must post before the credit affects aging");
  const after = await receivablesItem(source.invoice_id);
  assert.equal(Number(after.item.credit_memo_amount)-Number(before.item.credit_memo_amount),Number(draft.total_amount),
    "the posted credit increases the invoice credit-memo aggregate by its source amount");
  assert.equal(Number(before.item.outstanding_amount)-Number(after.item.outstanding_amount),Number(draft.total_amount),
    "posting the credit reduces outstanding receivables by exactly the posted source amount");

  await db.unsafe("reset role");
  const expectedRows = await db.unsafe(
    "select ci.total_amount::numeric(15,2)::text as total_amount," +
    "coalesce((select pg_catalog.sum(cp.amount) from public.customer_payments cp where cp.organization_id=ci.organization_id and cp.invoice_id=ci.id),0)::numeric(15,2)::text as paid_amount," +
    "coalesce((select pg_catalog.sum(cm.total_amount) from public.customer_return_credit_memos cm " +
    " where cm.organization_id=ci.organization_id and cm.invoice_id=ci.id and cm.status='posted' and cm.currency=ci.currency),0)::numeric(15,2)::text as credit_memo_amount," +
    "greatest(ci.total_amount-coalesce((select pg_catalog.sum(cp.amount) from public.customer_payments cp where cp.organization_id=ci.organization_id and cp.invoice_id=ci.id),0)-" +
    "coalesce((select pg_catalog.sum(cm.total_amount) from public.customer_return_credit_memos cm where cm.organization_id=ci.organization_id and cm.invoice_id=ci.id and cm.status='posted' and cm.currency=ci.currency),0),0)::numeric(15,2)::text as outstanding_amount " +
    "from public.customer_invoices ci where ci.organization_id=$1::uuid and ci.id=$2::uuid",
    [organizationId,source.invoice_id],
  );
  assert.equal(expectedRows.length,1);
  assert.equal(Number(after.item.credit_memo_amount),Number(expectedRows[0].credit_memo_amount),
    "reported posted-credit total must match all saved, same-currency posted credit memos");
  assert.equal(Number(after.item.outstanding_amount),Number(expectedRows[0].outstanding_amount),
    "aging outstanding must reconcile to saved invoice total less payments less posted credits");
  assert.ok(after.page.summary.some((s)=>s.currency==="YER"),"currency-separated aging summary remains present");
  assert.ok(Number(after.item.outstanding_amount)>=0,"the aging balance cannot become negative");
  process.stdout.write("PASS staff receivables aging: source-linked posted credits reduce outstanding exactly once; drafts and physical receipts do not; balances reconcile to the stored invoice, payment and posted-credit ledgers.\n");
}

main().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
}).finally(async () => {
  await db.end({ timeout: 5 }).catch(() => {});
});
