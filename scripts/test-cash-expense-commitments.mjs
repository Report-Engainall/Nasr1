import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { validateCashExpenseEndpoints } from "./lib/local-endpoint-guard.mjs";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for operating expense commitment acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) { return typeof value === "string" ? JSON.parse(value) : value; }
let lastSqlContext = "no SQL statement has started";
function findUndefinedParameter(value, path = "parameter") {
  if (value === undefined) return path;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUndefinedParameter(value[index], path + "[" + index + "]");
      if (found) return found;
    }
  } else if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    for (const [key, child] of Object.entries(value)) {
      const found = findUndefinedParameter(child, path + "." + key);
      if (found) return found;
    }
  }
  return null;
}
function guardUndefinedSqlParameters(client, label) {
  return new Proxy(client, {
    get(target, property) {
      if (property === "unsafe") {
        return (query, parameters, ...options) => {
          const statement = String(query).replace(/\s+/g, " ").slice(0, 220);
          lastSqlContext = label + ": " + statement;
          const missing = findUndefinedParameter(parameters);
          if (missing) {
            throw new Error("UNDEFINED_SQL_PARAMETER: " + label + " " + missing + " for " + statement);
          }
          try {
            return target.unsafe(query, parameters, ...options);
          } catch (error) {
            const message = String(error?.message ?? error);
            if (message.includes("UNDEFINED_VALUE")) {
              throw new Error(message + " while executing " + label + " SQL: " + statement);
            }
            throw error;
          }
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const databaseUrl = requiredEnv("TEST_DATABASE_URL");
const supabaseUrl = requiredEnv("E2E_SUPABASE_URL");
const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
validateCashExpenseEndpoints(supabaseUrl, databaseUrl);
const organizationId = "a0000000-0000-0000-0000-000000000001";
const db = guardUndefinedSqlParameters(postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 }), "fixture");

async function signIn(email, password) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", supabaseUrl), {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error("Local Auth sign-in failed for a seeded test account (HTTP " + response.status + ").");
  }
  return payload.access_token;
}
async function setIdentity(client, authUserId, email) {
  await client.unsafe("reset role").catch(() => {});
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$2,now(),now(),now(),null,'CI operating commitment acceptance','127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [authUserId, authUserId],
  );
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(),
      role: "authenticated", session_id: authUserId }),
  ]);
  await client.unsafe("set role authenticated");
}
async function expectCode(label, action, code) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, label + " should be rejected");
  assert.equal(String(caught.code), code, label + " SQLSTATE");
  return caught;
}
async function createAccount(code, name, type) {
  const rows = await db.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,is_active) " +
    "values($1::uuid,$2,$3,$4,true) returning id",
    [organizationId, code, name, type],
  );
  assert.equal(rows.length, 1);
  return rows[0].id;
}
async function uploadEvidence(accessToken, commitmentId, mimeType="application/pdf") {
  const ext = mimeType === "application/pdf" ? "pdf" : mimeType === "image/png" ? "png" : "jpg";
  const body = mimeType === "application/pdf"
    ? Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
    : Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  const path = commitmentId + "/" + randomUUID() + "." + ext;
  const response = await fetch(new URL("/storage/v1/object/cash-expense-commitment-evidence/" + path, supabaseUrl), {
    method: "POST",
    headers: {
      apikey: publishableKey, Authorization: "Bearer " + accessToken,
      "Content-Type": mimeType, "x-upsert": "false",
    },
    body,
  });
  const payload = await response.json().catch(() => null);
  assert.ok(response.ok, "real local Storage upload must succeed: HTTP " + response.status + " " + JSON.stringify(payload));
  return { path, body, sha: createHash("sha256").update(body).digest("hex"), mimeType };
}
async function registerEvidence(client, commitmentId, uploaded) {
  const name = uploaded.path.split("/").at(-1) ?? "evidence.pdf";
  const rows = await client.unsafe(
    "select public.record_cash_expense_commitment_evidence($1::uuid,$2::text,$3::text,$4::text,$5::bigint,$6::text) as result",
    [commitmentId, uploaded.path, name, uploaded.mimeType, uploaded.body.length, uploaded.sha],
  );
  const result = asJson(rows[0].result);
  assert.equal(typeof result?.id, "string");
  assert.equal(result.replayed, false);
  return result;
}
async function createCommitment(client, payload, key) {
  const rows = await client.unsafe(
    "select public.record_cash_expense_commitment($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date) as result",
    [key,payload.category,payload.description,payload.amount,payload.currency,payload.payment_method,payload.reference,payload.due_date],
  );
  return asJson(rows[0].result);
}
async function reviewEvidence(client,commitmentId,evidenceId,contentSha256,key) {
  const rows=await client.unsafe(
    "select public.review_cash_expense_commitment_evidence($1::uuid,$2::uuid,$3::text,$4::uuid) as result",
    [commitmentId,evidenceId,contentSha256,key],
  );
  return asJson(rows[0].result);
}
async function approve(client, id, reason, key) {
  const rows = await client.unsafe(
    "select public.approve_cash_expense_commitment($1::uuid,$2::text,$3::uuid) as result",
    [id,reason,key],
  );
  return asJson(rows[0].result);
}
async function cancel(client, id, reason, key) {
  const rows = await client.unsafe(
    "select public.cancel_cash_expense_commitment($1::uuid,$2::text,$3::uuid) as result",
    [id,reason,key],
  );
  return asJson(rows[0].result);
}
async function reject(client, id, reason, key) {
  const rows = await client.unsafe(
    "select public.reject_cash_expense_commitment($1::uuid,$2::text,$3::uuid) as result",
    [id,reason,key],
  );
  return asJson(rows[0].result);
}
async function recordPayment(client, id, paymentDate, key) {
  const rows = await client.unsafe(
    "select public.record_cash_expense_commitment_payment($1::uuid,$2::date,$3::uuid) as result",
    [id,paymentDate,key],
  );
  return asJson(rows[0].result);
}
async function schedule(client, from, to, currency, asOf = new Date().toISOString()) {
  const rows = await client.unsafe(
    "select public.fetch_cash_expense_commitment_cashflow_schedule($1::date,$2::date,$3::timestamptz,$4::text) as result",
    [from,to,asOf,currency],
  );
  return asJson(rows[0].result);
}
async function main() {
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
  const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL").toLowerCase();
  const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL").toLowerCase();
  const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
  const lookUp = async (email, role) => {
    const rows = await db.unsafe(
      "select p.id,p.auth_user_id,p.email from public.profiles p " +
      (role ? "join public.user_roles r on r.profile_id=p.id " : "") +
      "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true " +
      (role ? "and r.role=$3 " : "") + "order by p.id limit 2",
      role ? [organizationId,email,role] : [organizationId,email],
    );
    assert.equal(rows.length,1,"seeded local account must resolve to one active tenant profile: "+role);
    return rows[0];
  };
  const manager=await lookUp(managerEmail,"manager");
  const admin=await lookUp(adminEmail,"admin");
  const accountant=await lookUp(accountantEmail,"accountant");
  const customer=await lookUp(customerEmail,null);

  const managerDb=guardUndefinedSqlParameters(postgres(databaseUrl,{max:1,prepare:false,idle_timeout:5}),"manager");
  const adminDb=guardUndefinedSqlParameters(postgres(databaseUrl,{max:1,prepare:false,idle_timeout:5}),"admin");
  const accountantDb=guardUndefinedSqlParameters(postgres(databaseUrl,{max:1,prepare:false,idle_timeout:5}),"accountant");
  const customerDb=guardUndefinedSqlParameters(postgres(databaseUrl,{max:1,prepare:false,idle_timeout:5}),"customer");
  try {
    await Promise.all([
      setIdentity(managerDb,manager.auth_user_id,manager.email),
      setIdentity(adminDb,admin.auth_user_id,admin.email),
      setIdentity(accountantDb,accountant.auth_user_id,accountant.email),
      setIdentity(customerDb,customer.auth_user_id,customer.email),
    ]);

    const invalidDueDate=new Date();
    invalidDueDate.setUTCFullYear(invalidDueDate.getUTCFullYear()+11);
    await expectCode("PostgreSQL due-date trigger rejects a commitment more than ten years ahead",
      ()=>db.unsafe(
        "insert into public.cash_expense_commitments(organization_id,category,description,amount,currency,payment_method,due_date,idempotency_key,payload_fingerprint,created_by_profile_id) " +
        "values($1::uuid,'Date guard','Out-of-horizon operating expense',1.00,'YER','cash',$2::date,$3::uuid,md5('due-date-guard'),$4::uuid)",
        [organizationId,invalidDueDate.toISOString().slice(0,10),randomUUID(),manager.id],
      ),"22023");
    const [managerToken, adminToken] = await Promise.all([
      signIn(managerEmail,requiredEnv("E2E_MANAGER_PASSWORD")),
      signIn(adminEmail,requiredEnv("E2E_DEVICE_ADMIN_PASSWORD")),
    ]);
    const today = new Date().toISOString().slice(0,10);
    const dueDate = new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    const suffix=randomUUID().replaceAll("-","").slice(-10).toUpperCase();
    const expenseAccount=await createAccount("P2-COMMIT-EXP-"+suffix,"P2 Commitment Expense "+suffix,"expense");
    const cashAccount=await createAccount("P2-COMMIT-CASH-"+suffix,"P2 Commitment Cash "+suffix,"asset");

    await expectCode("same-tenant customer cannot read finance commitments",
      ()=>customerDb.unsafe("select public.fetch_cash_expense_commitments(10,0)"),"42501");
    await expectCode("authenticated finance user cannot insert commitments around the audited RPC",
      ()=>managerDb.unsafe(
        "insert into public.cash_expense_commitments(organization_id,category,description,amount,currency,payment_method,due_date,idempotency_key,payload_fingerprint,created_by_profile_id) " +
        "values($1::uuid,'bypass','direct insert',1,'YER','cash',$2::date,$3::uuid,md5('bypass'),$4::uuid)",
        [organizationId,dueDate,randomUUID(),manager.id]),"42501");

    const yerPayload={category:"Rent",description:"Office rent for next period",amount:"250.75",currency:"YER",
      payment_method:"transfer",reference:"P2-COMMIT-YER-"+suffix,due_date:dueDate};
    const yerKey=randomUUID();
    const yer=await createCommitment(managerDb,yerPayload,yerKey);
    assert.equal(yer.status,"pending_approval");
    assert.equal(yer.replayed,false);
    const replay=await createCommitment(managerDb,yerPayload,yerKey);
    assert.equal(replay.id,yer.id);
    assert.equal(replay.replayed,true,"exact creation retry must return the saved commitment");
    await expectCode("creation idempotency rejects changed commitment amount",
      ()=>createCommitment(managerDb,{...yerPayload,amount:"251.00"},yerKey),"23505");

    const yerEvidence=await uploadEvidence(managerToken,yer.id);
    const registered=await registerEvidence(managerDb,yer.id,yerEvidence);
    const yerEvidence2=await uploadEvidence(managerToken,yer.id,"image/png");
    const registered2=await registerEvidence(managerDb,yer.id,yerEvidence2);
    assert.equal(typeof registered.id,"string");
    assert.equal(typeof registered2.id,"string");
    await expectCode("creator cannot approve own commitment",
      ()=>approve(managerDb,yer.id,"self approval must be denied",randomUUID()),"42501");

    const approvalKey=randomUUID();
    const approvalReason="مستند إيجار موثق وفاتورة مستحقة";
    await expectCode("direct approval RPC rejects a request with unreviewed source documents",
      ()=>approve(adminDb,yer.id,approvalReason,approvalKey),"22023");
    await expectCode("creator cannot attest to their own source evidence",
      ()=>reviewEvidence(managerDb,yer.id,registered.id,yerEvidence.sha,randomUUID()),"42501");
    await expectCode("accountant cannot review operating expense source evidence",
      ()=>reviewEvidence(accountantDb,yer.id,registered.id,yerEvidence.sha,randomUUID()),"42501");
    const reviewKey=randomUUID();
    const firstReview=await reviewEvidence(adminDb,yer.id,registered.id,yerEvidence.sha,reviewKey);
    assert.equal(firstReview.evidence_id,registered.id);
    assert.equal(firstReview.reviewed_by_profile_id,admin.id);
    assert.equal(firstReview.content_sha256,yerEvidence.sha);
    assert.equal(firstReview.replayed,false);
    assert.equal((await reviewEvidence(adminDb,yer.id,registered.id,yerEvidence.sha,reviewKey)).replayed,true);
    await expectCode("review idempotency rejects a changed digest",
      ()=>reviewEvidence(adminDb,yer.id,registered.id,"f".repeat(64),reviewKey),"23505");
    await expectCode("one reviewed document is insufficient while a second source remains unreviewed",
      ()=>approve(adminDb,yer.id,approvalReason,approvalKey),"22023");
    const secondReview=await reviewEvidence(adminDb,yer.id,registered2.id,yerEvidence2.sha,randomUUID());
    assert.equal(secondReview.evidence_id,registered2.id);
    assert.equal(secondReview.reviewed_by_profile_id,admin.id);
    assert.equal(secondReview.replayed,false);
    await expectCode("review RPC rejects a digest different from the registered source",
      ()=>reviewEvidence(adminDb,yer.id,registered2.id,"e".repeat(64),randomUUID()),"22023");
    const approved=await approve(adminDb,yer.id,approvalReason,approvalKey);
    assert.equal(approved.status,"approved");
    assert.equal(approved.replayed,false);
    assert.equal((await approve(adminDb,yer.id,"مستند إيجار موثق وفاتورة مستحقة",approvalKey)).replayed,true);
    await expectCode("approval idem key rejects changed reason",
      ()=>approve(adminDb,yer.id,"سبب مختلف للطلب نفسه",approvalKey),"23505");

    const cancelledPayload={...yerPayload,category:"Cancelled facility",description:"Facility lease option cancelled before approval",
      amount:"17.25",reference:"P2-COMMIT-CANCEL-"+suffix};
    const cancelled=await createCommitment(managerDb,cancelledPayload,randomUUID());
    assert.equal(cancelled.status,"pending_approval");
    await expectCode("accountant cannot cancel a finance commitment",
      ()=>cancel(accountantDb,cancelled.id,"إلغاء محاسبي غير مخول",randomUUID()),"42501");
    const cancellationKey=randomUUID(),cancellationReason="تم إلغاء الاتفاق قبل بدء الخدمة";
    const cancelledResult=await cancel(adminDb,cancelled.id,cancellationReason,cancellationKey);
    assert.equal(cancelledResult.status,"cancelled");
    assert.equal(cancelledResult.replayed,false);
    assert.equal((await cancel(adminDb,cancelled.id,cancellationReason,cancellationKey)).replayed,true);
    await expectCode("cancellation idempotency rejects a changed reason",
      ()=>cancel(adminDb,cancelled.id,"سبب إلغاء مختلف للطلب نفسه",cancellationKey),"23505");
    const cancelledRow=await db.unsafe(
      "select status,cancelled_by_profile_id::text as cancelled_by,cancellation_reason " +
      "from public.cash_expense_commitments where organization_id=$1::uuid and id=$2::uuid",
      [organizationId,cancelled.id],
    );
    assert.equal(cancelledRow[0].status,"cancelled");
    assert.equal(cancelledRow[0].cancelled_by,admin.id);
    assert.equal(cancelledRow[0].cancellation_reason,cancellationReason);
    const cancelledEvents=await db.unsafe(
      "select event_type from public.cash_expense_commitment_events " +
      "where organization_id=$1::uuid and commitment_id=$2::uuid order by created_at,id",
      [organizationId,cancelled.id],
    );
    assert.deepEqual(cancelledEvents.map(x=>x.event_type).sort(),["CANCELLED","CREATED"]);
    const cancelledAudit=await db.unsafe(
      "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and action='finance.cash_expense_commitment.cancelled' and entity_type='cash_expense_commitment' and entity_id=$2::uuid",
      [organizationId,cancelled.id],
    );
    assert.equal(cancelledAudit[0].count,1,"cancellation appends one immutable audit record");
    const cancelledSchedule=await schedule(adminDb,today,dueDate,"YER");
    assert.ok(!cancelledSchedule.entries.some((entry)=>entry.id==="cash-expense-commitment-outflow:"+cancelled.id),
      "a cancelled commitment must never become a forecast cash outflow");

    // Rejection is an independent maker/checker transition; it requires evidence, reason,
    // tenant-scoped reviewer authority and an idempotency key, and never enters cashflow.
    const rejectedPayload={...yerPayload,category:"Rejected facility",description:"Facility option rejected after document review",
      amount:"19.50",reference:"P2-COMMIT-REJECT-"+suffix};
    const rejected=await createCommitment(managerDb,rejectedPayload,randomUUID());
    assert.equal(rejected.status,"pending_approval");
    const rejectionReason="المستند لا يثبت الالتزام المالي المطلوب";
    await expectCode("a commitment cannot be rejected before source evidence is registered",
      ()=>reject(adminDb,rejected.id,rejectionReason,randomUUID()),"22023");
    const rejectedEvidence=await uploadEvidence(managerToken,rejected.id);
    await registerEvidence(managerDb,rejected.id,rejectedEvidence);
    await expectCode("commitment creator cannot reject their own request",
      ()=>reject(managerDb,rejected.id,rejectionReason,randomUUID()),"42501");
    await expectCode("accountant cannot reject an expense commitment",
      ()=>reject(accountantDb,rejected.id,rejectionReason,randomUUID()),"42501");
    const rejectionKey=randomUUID();
    await expectCode("direct rejection RPC rejects an unreviewed source document",
      ()=>reject(adminDb,rejected.id,rejectionReason,rejectionKey),"22023");
    const rejectionReview=await reviewEvidence(adminDb,rejected.id,rejectedEvidence.id,rejectedEvidence.sha,randomUUID());
    assert.equal(rejectionReview.reviewed_by_profile_id,admin.id);
    const rejectedResult=await reject(adminDb,rejected.id,rejectionReason,rejectionKey);
    assert.equal(rejectedResult.status,"rejected");
    assert.equal(rejectedResult.replayed,false);
    assert.equal((await reject(adminDb,rejected.id,rejectionReason,rejectionKey)).replayed,true,
      "an exact rejection retry must return the original audited decision");
    await expectCode("rejection idempotency rejects a changed reason",
      ()=>reject(adminDb,rejected.id,"سبب رفض مختلف للطلب نفسه",rejectionKey),"23505");
    const rejectedRow=await db.unsafe(
      "select status,rejected_by_profile_id::text as rejected_by,rejected_at,rejection_reason " +
      "from public.cash_expense_commitments where organization_id=$1::uuid and id=$2::uuid",
      [organizationId,rejected.id],
    );
    assert.equal(rejectedRow[0].status,"rejected");
    assert.equal(rejectedRow[0].rejected_by,admin.id);
    assert.ok(rejectedRow[0].rejected_at);
    assert.equal(rejectedRow[0].rejection_reason,rejectionReason);
    const rejectedEvents=await db.unsafe(
      "select event_type from public.cash_expense_commitment_events " +
      "where organization_id=$1::uuid and commitment_id=$2::uuid order by created_at,id",
      [organizationId,rejected.id],
    );
    assert.deepEqual(rejectedEvents.map(x=>x.event_type).sort(),["CREATED","EVIDENCE_ATTACHED","EVIDENCE_REVIEWED","REJECTED"]);
    const rejectedAudit=await db.unsafe(
      "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and action='finance.cash_expense_commitment.rejected' and entity_type='cash_expense_commitment' and entity_id=$2::uuid",
      [organizationId,rejected.id],
    );
    assert.equal(rejectedAudit[0].count,1,"rejection appends one immutable audit record");
    const rejectionReviewAudit=await db.unsafe(
      "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid " +
      "and action='finance.cash_expense_commitment.evidence_reviewed' and entity_type='cash_expense_commitment' and entity_id=$2::uuid",
      [organizationId,rejected.id],
    );
    assert.equal(rejectionReviewAudit[0].count,1,"rejection is preceded by a persisted document-review audit");
    const rejectedSchedule=await schedule(adminDb,today,dueDate,"YER");
    assert.ok(!rejectedSchedule.entries.some((entry)=>entry.id==="cash-expense-commitment-outflow:"+rejected.id),
      "a rejected commitment must never become a forecast cash outflow");

    // A second-currency commitment is separately filtered. No rate conversion is performed.
    const usdPayload={...yerPayload,category:"Equipment",description:"Imported equipment service fee",amount:"40.25",
      currency:"USD",reference:"P2-COMMIT-USD-"+suffix};
    const usd=await createCommitment(managerDb,usdPayload,randomUUID());
    const usdEvidence=await uploadEvidence(managerToken,usd.id);
    const usdRegistered=await registerEvidence(managerDb,usd.id,usdEvidence);
    await reviewEvidence(adminDb,usd.id,usdRegistered.id,usdEvidence.sha,randomUUID());
    assert.equal((await approve(adminDb,usd.id,"مستند التزام بالدولار",randomUUID())).status,"approved");
    await expectCode("foreign-currency payment remains disabled until the FX policy exists",
      ()=>recordPayment(accountantDb,usd.id,today,randomUUID()),"0A000");

    const from=today,to=new Date(Date.now()+90*86400000).toISOString().slice(0,10);
    const yerSchedule=await schedule(adminDb,from,to,"YER");
    assert.equal(yerSchedule.status,"OK");
    assert.equal(yerSchedule.currency,"YER");
    assert.equal(yerSchedule.entries.length,1);
    assert.equal(yerSchedule.entries[0].direction,"OUTFLOW");
    assert.equal(yerSchedule.entries[0].amount.value,"250.75");
    assert.equal(yerSchedule.entries[0].amount.currency,"YER");
    assert.ok(yerSchedule.entries[0].amount.lineage.evidenceIds.length>=2);
    assert.equal(yerSchedule.pendingApprovalCount,0);

    const usdSchedule=await schedule(adminDb,from,to,"USD");
    assert.equal(usdSchedule.status,"OK");
    assert.equal(usdSchedule.entries.length,1);
    assert.equal(usdSchedule.entries[0].amount.value,"40.25");
    assert.equal(usdSchedule.entries[0].amount.currency,"USD");

    // A commitment and its source evidence created after asOf must invalidate a historical snapshot
    // without modifying the already approved commitment or rewriting its evidence history.
    const evidenceSnapshotAsOf=new Date(Date.now()-1500).toISOString();
    const snapshotCommitment=await createCommitment(managerDb,{
      ...yerPayload,category:"Post-snapshot request",description:"New maintenance request created after snapshot",
      amount:"12.00",reference:"P2-COMMIT-ASOF-"+suffix,
    },randomUUID());
    const lateEvidence=await uploadEvidence(managerToken,snapshotCommitment.id,"image/png");
    await registerEvidence(managerDb,snapshotCommitment.id,lateEvidence);
    const staleSnapshot=await schedule(adminDb,from,to,"YER",evidenceSnapshotAsOf);
    assert.equal(staleSnapshot.status,"PARTIAL","a new post-as-of commitment must invalidate the snapshot");
    assert.equal(staleSnapshot.completeness,"PARTIAL");
    assert.ok(staleSnapshot.changedAfterAsOfCount>=1);
    assert.equal(staleSnapshot.entries.length,1,"the previously approved source remains visible but the snapshot is not complete");
    assert.equal(staleSnapshot.evidenceRecords.filter((e)=>e.id.startsWith("cash-expense-commitment-evidence:")).length,1,
      "the evidence passport contains only the pre-as-of approved source evidence");

    const paymentKey=randomUUID();
    const paid=await recordPayment(accountantDb,yer.id,today,paymentKey);
    assert.equal(paid.status,"payment_recorded");
    assert.equal(paid.replayed,false);
    assert.equal((await recordPayment(accountantDb,yer.id,today,paymentKey)).replayed,true);
    await expectCode("payment idempotency rejects changed date",
      ()=>recordPayment(accountantDb,yer.id,new Date(Date.now()-86400000).toISOString().slice(0,10),paymentKey),"23505");

    const partialSchedule=await schedule(adminDb,from,to,"YER");
    assert.equal(partialSchedule.status,"PARTIAL");
    assert.equal(partialSchedule.completeness,"PARTIAL");
    assert.equal(partialSchedule.paymentAwaitingJournalCount,1);
    assert.equal(partialSchedule.entries.length,0,"payment awaiting its posted journal is not falsely included as a future payable");

    const draftRows=await accountantDb.unsafe(
      "select public.create_cash_expense_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid) as result",
      [paid.cash_expense_id,expenseAccount,cashAccount,randomUUID()],
    );
    const draft=asJson(draftRows[0].result);
    assert.equal(draft.status,"draft");
    const journalLines=await db.unsafe(
      "select debit::text,credit::text from public.accounting_journal_lines " +
      "where organization_id=$1::uuid and journal_entry_id=$2::uuid order by line_number",
      [organizationId,draft.journal_entry_id],
    );
    assert.equal(journalLines.length,2);
    assert.deepEqual(journalLines.map(x=>[x.debit,x.credit]),[["250.75","0.00"],["0.00","250.75"]]);

    const postedRows=await adminDb.unsafe(
      "select public.post_general_journal_entry($1::uuid) as result",[draft.journal_entry_id],
    );
    const posted=asJson(postedRows[0].result);
    assert.equal(posted.status,"posted");
    const settled=await db.unsafe(
      "select status,payment_cash_expense_id::text,settled_by_profile_id::text from public.cash_expense_commitments " +
      "where organization_id=$1::uuid and id=$2::uuid",[organizationId,yer.id],
    );
    assert.equal(settled.length,1);
    assert.equal(settled[0].status,"settled","posting the exact original cash-expense journal settles the commitment");
    assert.equal(settled[0].payment_cash_expense_id,paid.cash_expense_id);
    assert.equal(settled[0].settled_by_profile_id,admin.id);

    const finalSchedule=await schedule(adminDb,from,to,"YER");
    assert.equal(finalSchedule.status,"OK");
    assert.equal(finalSchedule.completeness,"COMPLETE");
    assert.equal(finalSchedule.entries.length,0,"settled paid commitment is excluded from future outflows");
    const events=await db.unsafe(
      "select event_type from public.cash_expense_commitment_events where organization_id=$1::uuid and commitment_id=$2::uuid order by created_at,id",
      [organizationId,yer.id],
    );
    assert.deepEqual(events.map(x=>x.event_type),[
      "CREATED","EVIDENCE_ATTACHED","EVIDENCE_ATTACHED","EVIDENCE_REVIEWED","EVIDENCE_REVIEWED",
      "APPROVED","PAYMENT_RECORDED","SETTLED"
    ]);
    const audit=await db.unsafe(
      "select action,actor_id::text from public.audit_logs where organization_id=$1::uuid and entity_type='cash_expense_commitment' and entity_id=$2::uuid order by id",
      [organizationId,yer.id],
    );
    assert.ok(audit.some(x=>x.action==="finance.cash_expense_commitment.created"&&x.actor_id===manager.id));
    assert.ok(audit.some(x=>x.action==="finance.cash_expense_commitment.approved"&&x.actor_id===admin.id));
    assert.equal(audit.filter(x=>x.action==="finance.cash_expense_commitment.evidence_reviewed"&&x.actor_id===admin.id).length,2,
      "one immutable review audit is required per source document");
    assert.ok(audit.some(x=>x.action==="finance.cash_expense_commitment.payment_recorded"&&x.actor_id===accountant.id));
    assert.ok(audit.some(x=>x.action==="finance.cash_expense_commitment.settled"&&x.actor_id===admin.id));

    // Storage policy must reject an orphan path with no same-tenant pending commitment.
    const deniedPath=randomUUID()+"/"+randomUUID()+".pdf";
    const denied=await fetch(new URL("/storage/v1/object/cash-expense-commitment-evidence/"+deniedPath,supabaseUrl),{
      method:"POST",headers:{apikey:publishableKey,Authorization:"Bearer "+managerToken,"Content-Type":"application/pdf","x-upsert":"false"},
      body:Buffer.from("%PDF-1.4\n%%EOF"),
    });
    assert.ok(!denied.ok,"Storage upload to a path without a same-tenant pending commitment must be denied");
    process.stdout.write(
      "PASS PostgreSQL 17 operating expense commitment acceptance: real local Storage upload and tenant path denial; " +
      "persisted reviewer attestations, direct RPC approval/rejection bypass denial, multi-document completeness and digest-bound audit; " +
      "evidence-gated maker/checker with independently authorized rejection, missing-evidence denial, rejection replay/conflict and append-only audit; database due-date horizon; exact-cent and immutable append-only lifecycle; idempotency/replay/conflict; " +
      "same-currency YER/USD separation and blocked FX payment; verified 90-day outflow lineage; payment-awaiting-journal PARTIAL; " +
      "balanced cash-expense source journal; independent posting-triggered settlement; source audit/event trail.\n",
    );
  } finally {
    await Promise.all([managerDb.end(),adminDb.end(),accountantDb.end(),customerDb.end()]);
  }
}
main().catch((error)=>{
  process.stderr.write("FAIL PostgreSQL 17 operating expense commitment acceptance: "+String(error?.stack??error)+"\nLAST_SQL_CONTEXT: "+lastSqlContext+"\n");
  process.exitCode=1;
}).finally(()=>db.end({timeout:5}).catch(()=>{}));
