import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for decision policy learning acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function localEndpoint(value, label, expectedPort = null) {
  const url = new URL(value);
  if (url.protocol !== "http:" && label === "Local Supabase Auth") {
    throw new Error(label + " requires HTTP loopback.");
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname) ||
      (expectedPort !== null && url.port !== expectedPort)) {
    throw new Error(label + " refuses non-loopback endpoints.");
  }
  return url;
}
async function signIn(apiUrl, publishableKey, email, password) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", apiUrl), {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error("Local Supabase test identity sign-in failed (HTTP " + response.status + ").");
  }
  const parts = payload.access_token.split(".");
  if (parts.length !== 3) throw new Error("Local Supabase issued a malformed JWT.");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!claims.sub || typeof claims.session_id !== "string") {
    throw new Error("Local Supabase JWT has no live session identity.");
  }
  return claims;
}
function decode(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
async function expectSqlState(tx, expectedCode, action, label) {
  const savepoint = "policy_learning_expected_failure";
  await tx.unsafe("SAVEPOINT " + savepoint);
  try {
    await action();
  } catch (error) {
    await tx.unsafe("ROLLBACK TO SAVEPOINT " + savepoint);
    await tx.unsafe("RELEASE SAVEPOINT " + savepoint);
    assert.equal(String(error?.code), expectedCode, label + " SQLSTATE");
    return;
  }
  await tx.unsafe("RELEASE SAVEPOINT " + savepoint);
  assert.fail(label + " unexpectedly succeeded.");
}
async function setActor(tx, claims) {
  await tx.unsafe("reset role");
  await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [claims.sub]);
  await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ ...claims, role: "authenticated" }),
  ]);
  await tx.unsafe("set local role authenticated");
}
function dayOffset(day, offset) {
  const value = new Date(day + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

async function main() {
  const databaseUrl = requiredEnv("TEST_DATABASE_URL");
  const apiUrl = localEndpoint(requiredEnv("SUPABASE_URL"), "Local Supabase Auth", "54321");
  const database = localEndpoint(databaseUrl, "Decision policy learning database");
  if (!/^\d+$/.test(database.port) || Number(database.port) < 1 || Number(database.port) > 65535) {
    throw new Error("Decision policy learning acceptance requires an explicit loopback PostgreSQL port.");
  }
  const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  const managerClaims = await signIn(
    apiUrl, publishableKey, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"),
  );
  const adminClaims = await signIn(
    apiUrl, publishableKey, requiredEnv("E2E_DEVICE_ADMIN_EMAIL"), requiredEnv("E2E_DEVICE_ADMIN_PASSWORD"),
  );
  const staffClaims = await signIn(
    apiUrl, publishableKey, requiredEnv("E2E_STAFF_EMAIL"), requiredEnv("E2E_STAFF_PASSWORD"),
  );
  const productId = requiredEnv("E2E_PRODUCT_ID");
  const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  class RollbackAcceptance extends Error {}
  try {
    const actors = await db.unsafe(
      "select p.id::text as profile_id,p.organization_id::text as organization_id,r.role " +
      "from public.profiles p join public.user_roles r on r.profile_id=p.id " +
      "where p.auth_user_id=any($1::uuid[]) and p.is_active and r.role in ('manager','admin') " +
      "order by p.auth_user_id,r.role",
      [[managerClaims.sub, adminClaims.sub]],
    );
    const manager = actors.find(row => row.role === "manager" && row.organization_id);
    const admin = actors.find(row => row.role === "admin" && row.organization_id === manager?.organization_id);
    assert.ok(manager, "an active same-tenant manager fixture is required");
    assert.ok(admin, "a separate same-tenant administrator is required for Maker/Checker approval");

    await db.begin(async (tx) => {
      const start = await tx.unsafe(
        "select transaction_timestamp() as as_of, " +
        "((transaction_timestamp() at time zone 'UTC')::date)::text as as_of_day",
      );
      const asOf = new Date(start[0].as_of).toISOString();
      const periodFrom = dayOffset(start[0].as_of_day, 60);
      const periodTo = dayOffset(start[0].as_of_day, 61);
      const outsidePeriod = dayOffset(start[0].as_of_day, 80);
      const customerRows = await tx.unsafe(
        "select id::text from public.customers where organization_id=$1::uuid and status='approved' order by created_at,id limit 1",
        [manager.organization_id],
      );
      assert.equal(customerRows.length, 1, "the local P2 seed must provide one approved customer");
      const customerId = customerRows[0].id;
      const orderId = randomUUID();
      const orderNumber = "P2-LEARN-" + randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
      const invoiceNumber = "INV-" + orderNumber;
      const amount = 250;
      const itemRows = await tx.unsafe(
        "insert into public.orders(id,organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) " +
        "values($1::uuid,$2::uuid,$3::uuid,$4,'delivered',$5,1,'Rollback-only outcome learning source',$6::uuid) returning id",
        [orderId, manager.organization_id, customerId, orderNumber, amount, manager.profile_id],
      );
      assert.equal(itemRows.length, 1);
      const orderItems = await tx.unsafe(
        "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity,unit_price_snapshot,discount_snapshot,line_total) " +
        "values($1::uuid,$2::uuid,'P2-LEARN-001','P2 rollback learning item','piece',1,1,1,$3,0,$3) returning id",
        [orderId, productId, amount],
      );
      assert.equal(orderItems.length, 1);

      // Move existing open invoices outside this narrow period and give them explicit due dates.
      // The entire transaction, including these fixture-only changes, is rolled back below.
      await tx.unsafe(
        "update public.customer_invoices set due_at=$2::date " +
        "where organization_id=$1::uuid and status in ('issued','partially_paid') and currency='YER'",
        [manager.organization_id, outsidePeriod],
      );

      const invoiceRows = await tx.unsafe(
        "insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,subtotal,tax_amount,total_amount,due_at) " +
        "values($1::uuid,$2::uuid,$3::uuid,$4,'issued',transaction_timestamp()-interval '1 second','YER',$5,0,$5,$6::date) returning id",
        [manager.organization_id, customerId, orderId, invoiceNumber, amount, periodFrom],
      );
      assert.equal(invoiceRows.length, 1, "the rollback-only invoice source must be created");
      const invoiceId = invoiceRows[0].id;
      const invoiceItems = await tx.unsafe(
        "insert into public.customer_invoice_items(organization_id,invoice_id,order_item_id,product_id,item_code,description,unit,quantity,unit_price," +
        "discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total) " +
        "select $1::uuid,$2::uuid,oi.id,oi.product_id,oi.item_code,oi.product_name_snapshot,oi.unit_snapshot,oi.quantity,oi.unit_price_snapshot," +
        "oi.discount_snapshot,oi.promotion_discount_per_unit_snapshot,oi.promotion_id_snapshot,oi.promotion_title_snapshot," +
        "oi.promotion_discount_type_snapshot,oi.promotion_discount_value_snapshot,oi.line_total " +
        "from public.order_items oi where oi.id=$3::uuid returning invoice_id",
        [manager.organization_id, invoiceId, orderItems[0].id],
      );
      assert.equal(invoiceItems.length, 1, "the source invoice must retain its order item");

      const suffix = randomUUID();
      const candidateId = "p2.outcome-learning:" + suffix;
      const ruleId = "p2.outcome-learning.acceptance";
      const ruleVersion = "1.0.0";
      const expectedOutcome = "إثبات إنشاء مرشح تعلم من قياس حقيقي داخل PostgreSQL المحلي.";
      const candidateSnapshot = {
        schemaVersion: "1.0.0",
        candidateId,
        ruleId,
        ruleVersion,
        priority: "P3",
        priorityScore: 100,
        what: "اختبار مسار تعلّم النتائج المحلي",
        why: "تم إنشاء الفاتورة والقياس ولقطة الذاكرة داخل معاملة اختبار معزولة.",
        risk: "بيانات اختبار مؤقتة لا تمثل قراراً تجارياً.",
        soWhat: "التحقق من اشتقاق المرشح من مصدر مالي موثّق.",
        whatNext: "لا توجد خطوة تشغيلية أو مالية ناتجة من هذا الاختبار.",
        owner: "P2 local PostgreSQL acceptance",
        expectedOutcome,
        impact: null,
        impactStatus: "WITHHELD",
        impactReason: "TEST_ONLY_NO_BUSINESS_ACTIVATION",
        proof: {
          evidenceIds: ["acceptance-evidence:" + suffix],
          metricKeys: ["cashflow.expected_collections"],
          asOf,
          formulaVersions: ["nasr1.receivables-outstanding@1"],
        },
        createdAt: asOf,
        expiresAt: null,
      };

      await setActor(tx, managerClaims);
      const proposalRows = await tx.unsafe(
        "select public.create_decision_outcome_proposal_with_snapshot(" +
        "$1::text,$2::text,$3::text,$4::uuid,$5::text,$6::text,$7::jsonb,$8::text) as result",
        [candidateId, ruleId, ruleVersion, manager.profile_id, expectedOutcome,
          "إنشاء قرار اختبار قبل القياس.", candidateSnapshot, randomUUID()],
      );
      const proposal = decode(proposalRows[0].result);
      assert.equal(proposal?.ok, true, "the manager must create the snapshot-backed decision");
      const outcomeId = proposal.outcome.id;

      async function transition(eventType, expectedVersion, measuredOutcome = null, ownerProfileId = null) {
        const rows = await tx.unsafe(
          "select public.command_decision_outcome(" +
          "$1::uuid,$2::text,$3::text,$4::integer,$5::text,$6::text,$7::uuid,$8::jsonb) as result",
          [outcomeId, randomUUID(), randomUUID(), expectedVersion, eventType,
            "اختبار دورة قرار معزولة.", ownerProfileId, measuredOutcome],
        );
        return decode(rows[0].result);
      }
      assert.equal((await transition("SUBMIT_FOR_REVIEW", 1)).outcome.state, "IN_REVIEW");
      assert.equal((await transition("APPROVE", 2)).outcome.state, "APPROVED");
      assert.equal((await transition("ASSIGN", 3, null, manager.profile_id)).outcome.state, "ASSIGNED");
      assert.equal((await transition("START_EXECUTION", 4)).outcome.state, "EXECUTING");
      assert.equal((await transition("COMPLETE_EXECUTION", 5)).outcome.state, "EXECUTED");
      const measuredOutcome = {
        metricKey: "cashflow.expected_collections",
        value: amount,
        unit: "CURRENCY",
        currency: "YER",
        status: "VERIFIED",
        completeness: "COMPLETE",
        quality: "ACCEPTABLE",
        period: { from: periodFrom, to: periodTo },
        asOf,
        formulaId: "nasr1.receivables-outstanding",
        formulaVersion: "1",
        measuredAt: new Date().toISOString(),
        evidenceIds: ["invoice:" + invoiceId],
      };
      assert.equal((await transition("MEASURE", 6, measuredOutcome)).outcome.state, "MEASURED");

      const memorySnapshot = {
        asOf,
        period: { from: periodFrom, to: periodTo },
        problem: "تأخر تحصيل مستحقات ضمن فترة الاختبار.",
        factsReviewed: true,
        facts: [],
        opinions: [],
        hypotheses: [],
        assumptions: [],
        alternatives: [{ id: "follow-up", label: "متابعة موثقة", rationale: null }],
        chosenOptionId: "follow-up",
        assumptionsReviewed: true,
        actionTaken: "تم توثيق إجراء المتابعة في سجل الاختبار.",
        reviewDisposition: "NOT_SCHEDULED",
        reviewAt: null,
        lessonsReviewed: true,
        lessons: ["تُراجع نتيجة المتابعة وفق قياس موثق."],
        expectedMetric: { key: "cashflow.expected_collections", currency: "YER" },
      };
      const memoryRows = await tx.unsafe(
        "select public.save_decision_memory_snapshot($1::uuid,0,$2::jsonb,NULL,$3::text) as result",
        [outcomeId, memorySnapshot, randomUUID()],
      );
      const memoryResult = decode(memoryRows[0].result);
      assert.equal(memoryResult?.ok, true, "the actual source-derived decision-memory snapshot must be saved");

      // Diagnose the source-backed projection with the local database owner,
      // without weakening authenticated behavior or exposing any non-test data.
      await tx.unsafe("reset role");
      const sourceDiagnostics = await tx.unsafe(
        "select " +
          "o.measured_outcome is not null as has_measured_outcome, " +
          "o.measured_outcome as measured_payload, " +
          "pg_catalog.jsonb_typeof(o.measured_outcome) as measured_payload_type, " +
          "o.measured_outcome->>'metricKey' as measured_metric_key, " +
          "o.measured_outcome->>'unit' as measured_unit, " +
          "o.measured_outcome->>'status' as measured_status, " +
          "o.measured_outcome->>'completeness' as measured_completeness, " +
          "o.measured_outcome->>'quality' as measured_quality, " +
          "pg_catalog.jsonb_typeof(o.measured_outcome->'period') as measured_period_type, " +
          "pg_catalog.jsonb_typeof(o.measured_outcome->'evidenceIds') as measured_evidence_type, " +
          "o.measured_outcome->>'asOf' as measured_as_of, " +
          "o.measured_outcome->'evidenceIds' as measured_evidence_ids, " +
          "(select count(*)::integer from public.customer_invoices i where i.id=$2::uuid and i.organization_id=$3::uuid) as matching_invoice_count, " +
          "(select i.issued_at <= (o.measured_outcome->>'asOf')::timestamptz from public.customer_invoices i where i.id=$2::uuid and i.organization_id=$3::uuid) as invoice_is_before_as_of, " +
          "(select p.provolatile from pg_catalog.pg_proc p where p.oid='public._decision_memory_snapshot(uuid,uuid)'::regprocedure) as snapshot_helper_volatility, " +
          "public._decision_memory_resolve_evidence($3::uuid,ARRAY['invoice:'||$2::text],'decision-learning-acceptance-debug', " +
          "jsonb_build_object('from',$4::date,'to',$5::date),(o.measured_outcome->>'asOf')::timestamptz) as resolved_evidence, " +
          "public._decision_memory_snapshot($3::uuid,$1::uuid) as reloaded_memory_snapshot, " +
          "public._decision_memory_snapshot($3::uuid,$1::uuid)->'actualMetric' as reloaded_actual_metric, " +
          "(select count(*)::integer from public.decision_memory_snapshots s where s.organization_id=$3::uuid and s.decision_outcome_id=$1::uuid) as memory_snapshot_row_count " +
        "from public.decision_outcomes o where o.id=$1::uuid and o.organization_id=$3::uuid",
        [outcomeId, invoiceId, manager.organization_id, periodFrom, periodTo],
      );
      assert.equal(sourceDiagnostics.length, 1, "the measured decision must retain its same-tenant source row");
      assert.equal(sourceDiagnostics[0].has_measured_outcome, true,
        "the terminal MEASURE event must persist a structured outcome");
      assert.equal(Number(sourceDiagnostics[0].matching_invoice_count), 1,
        "the evidence ID must resolve to exactly one invoice in the active organization");
      assert.equal(sourceDiagnostics[0].invoice_is_before_as_of, true,
        "the measured invoice must exist at or before the source as-of timestamp");
      assert.equal(sourceDiagnostics[0].snapshot_helper_volatility,"v",
        "the snapshot helper must use a fresh command snapshot for same-statement read-after-write");
      const resolvedActualEvidence = decode(sourceDiagnostics[0].resolved_evidence);
      assert.equal(resolvedActualEvidence?.ids?.length, 1,
        "the evidence resolver must return every requested same-tenant invoice ID");
      assert.ok(sourceDiagnostics[0].reloaded_actual_metric,
        "a subsequent SQL statement must reload the source-backed actual metric; measured payload="+
        JSON.stringify({
          payload: sourceDiagnostics[0].measured_payload,
          payloadType: sourceDiagnostics[0].measured_payload_type,
          metricKey: sourceDiagnostics[0].measured_metric_key,
          unit: sourceDiagnostics[0].measured_unit,
          status: sourceDiagnostics[0].measured_status,
          completeness: sourceDiagnostics[0].measured_completeness,
          quality: sourceDiagnostics[0].measured_quality,
          periodType: sourceDiagnostics[0].measured_period_type,
          evidenceType: sourceDiagnostics[0].measured_evidence_type,
          evidenceIds: sourceDiagnostics[0].measured_evidence_ids,
          resolved: resolvedActualEvidence,
          helperVolatility: sourceDiagnostics[0].snapshot_helper_volatility,
          snapshotRows: sourceDiagnostics[0].memory_snapshot_row_count,
          reloadedSnapshot: sourceDiagnostics[0].reloaded_memory_snapshot
        }));
      assert.equal(Number(sourceDiagnostics[0].reloaded_actual_metric.value), amount,
        "the reloaded actual metric must retain the server-measured amount");
      assert.equal(sourceDiagnostics[0].reloaded_actual_metric.status, "VERIFIED");
      await setActor(tx, managerClaims);

      assert.ok(memoryResult?.snapshot && typeof memoryResult.snapshot.id === "string",
        "save_decision_memory_snapshot must return the row it just inserted");
      assert.equal(memoryResult.snapshot.actualMetric?.value, amount,
        "the immediate response must project the verified measurement after resolving its invoice evidence");
      assert.equal(memoryResult.snapshot.expectedMetric.value, amount);
      assert.deepEqual(memoryResult.snapshot.actualMetric.lineage.evidenceIds,
        ["dmactual:" + memoryResult.snapshot.id + ":invoice:" + invoiceId],
        "the actual metric must retain the namespaced source invoice lineage");
      assert.ok(memoryResult.snapshot.evidenceRecords.some((record) =>
        record.id === "dmactual:" + memoryResult.snapshot.id + ":invoice:" + invoiceId
      ), "the immutable memory snapshot must preserve its resolved source evidence record");

      const createRows = await tx.unsafe(
        "select public.create_decision_policy_learning_candidate($1::uuid[],$2::text) as result",
        [[outcomeId], randomUUID()],
      );
      const created = decode(createRows[0].result);
      assert.equal(created?.ok, true, "a verified measured decision must produce a learning candidate");
      assert.equal(created.duplicate, false);
      const candidate = created.candidate;
      assert.equal(candidate.candidateVersion, 2, "first learning candidate must be Candidate v2");
      assert.equal(candidate.baseProfileVersion, ruleVersion, "the base profile version must remain pinned");
      assert.equal(candidate.state, "DRAFT");
      assert.equal(candidate.candidateSnapshot.activeProfileChanged, false);
      assert.equal(candidate.candidateSnapshot.observations.length, 1);
      assert.equal(candidate.candidateSnapshot.observations[0].difference, 0);
      assert.deepEqual(candidate.candidateSnapshot.sourceDecisionIds, [outcomeId]);
      assert.equal(candidate.candidateSnapshot.sourceMemorySnapshots.length, 1);
      assert.equal(candidate.candidateSnapshot.sourceMemorySnapshots[0].version, 1);
      assert.equal(candidate.eventCount, 1);

      const replayRows = await tx.unsafe(
        "select public.create_decision_policy_learning_candidate($1::uuid[],$2::text) as result",
        [[outcomeId], randomUUID()],
      );
      const replay = decode(replayRows[0].result);
      assert.equal(replay?.ok, true);
      assert.equal(replay.duplicate, true, "same source set must not create a second candidate version");
      assert.equal(replay.candidate.id, candidate.id);

      const submitRows = await tx.unsafe(
        "select public.command_decision_policy_learning_candidate($1::uuid,$2::text,$3::text,1,'SUBMIT_FOR_REVIEW',$4::text) as result",
        [candidate.id, randomUUID(), randomUUID(), "إرسال المرشح للمراجعة المستقلة."],
      );
      const submitted = decode(submitRows[0].result);
      assert.equal(submitted?.candidate.state, "IN_REVIEW");
      assert.equal(submitted.candidate.version, 2);
      assert.equal(submitted.candidate.eventCount, 2);

      await expectSqlState(tx, "42501", () => tx.unsafe(
        "select public.command_decision_policy_learning_candidate($1::uuid,$2::text,$3::text,2,'APPROVE',$4::text)",
        [candidate.id, randomUUID(), randomUUID(), "محاولة اعتماد من منشئ المرشح."],
      ), "maker cannot approve its own learning candidate");

      // Bypass grants as the local database owner so these negative assertions
      // exercise the append-only triggers themselves, not merely missing table ACLs.
      await tx.unsafe("reset role");
      await expectSqlState(tx, "42501", () => tx.unsafe(
        "update public.decision_policy_learning_candidates set candidate_snapshot=candidate_snapshot||'{\"tampered\":true}'::jsonb where id=$1::uuid",
        [candidate.id],
      ), "candidate source snapshot mutation trigger");

      await expectSqlState(tx, "42501", () => tx.unsafe(
        "update public.decision_policy_learning_events set event_type='REJECT' where candidate_id=$1::uuid",
        [candidate.id],
      ), "candidate event append-only trigger");

      await setActor(tx, managerClaims);
      const privileges = await tx.unsafe(
        "select has_table_privilege('authenticated','public.decision_policy_learning_candidates','SELECT') as candidate_read, " +
        "has_table_privilege('authenticated','public.decision_policy_learning_candidates','UPDATE') as candidate_update, " +
        "has_table_privilege('authenticated','public.decision_policy_learning_events','DELETE') as event_delete, " +
        "has_function_privilege('authenticated','public.create_decision_policy_learning_candidate(uuid[],text)'::regprocedure,'EXECUTE') as create_rpc, " +
        "has_function_privilege('anon','public.create_decision_policy_learning_candidate(uuid[],text)'::regprocedure,'EXECUTE') as anon_create"
      );
      assert.equal(privileges[0].candidate_read, false);
      assert.equal(privileges[0].candidate_update, false);
      assert.equal(privileges[0].event_delete, false);
      assert.equal(privileges[0].create_rpc, true);
      assert.equal(privileges[0].anon_create, false);

      await setActor(tx, staffClaims);
      await expectSqlState(tx, "42501", () => tx.unsafe(
        "select public.fetch_decision_policy_learning_candidates(20,0)",
      ), "staff read denial for learning candidates");

      await setActor(tx, adminClaims);
      const approveRows = await tx.unsafe(
        "select public.command_decision_policy_learning_candidate($1::uuid,$2::text,$3::text,2,'APPROVE',$4::text) as result",
        [candidate.id, randomUUID(), randomUUID(), "اعتماد المرشح للمراجعة دون تفعيل القاعدة."],
      );
      const approved = decode(approveRows[0].result);
      assert.equal(approved?.candidate.state, "APPROVED");
      assert.equal(approved.candidate.version, 3);
      assert.equal(approved.candidate.reviewedByProfileId, admin.profile_id);
      assert.equal(approved.candidate.eventCount, 3);
      assert.equal(approved.candidate.candidateSnapshot.activeProfileChanged, false);

      // A corrected memory with a different measurement as-of timestamp must not
      // produce a candidate; the expected and actual snapshots are not comparable.
      await setActor(tx, managerClaims);
      const mismatchAsOf = new Date(Date.parse(asOf) - 30_000).toISOString();
      const mismatchedMemory = {
        ...memorySnapshot,
        asOf: mismatchAsOf,
        lessons: ["تم فحص اختلاف توقيت القياس قبل السماح بالتعلم."],
      };
      const mismatchRows = await tx.unsafe(
        "select public.save_decision_memory_snapshot($1::uuid,1,$2::jsonb,$3::text,$4::text) as result",
        [outcomeId, mismatchedMemory, "اختبار اختلاف وقت خط الأساس عن النتيجة.", randomUUID()],
      );
      const mismatchedSnapshot = decode(mismatchRows[0].result);
      assert.equal(mismatchedSnapshot?.ok, true);
      assert.equal(mismatchedSnapshot.snapshot.version, 2);
      assert.notEqual(
        mismatchedSnapshot.snapshot.expectedMetric.asOf,
        mismatchedSnapshot.snapshot.actualMetric.asOf,
      );
      await expectSqlState(tx, "22023", () => tx.unsafe(
        "select public.create_decision_policy_learning_candidate($1::uuid[],$2::text)",
        [[outcomeId], randomUUID()],
      ), "expected and actual metric as-of mismatch");

      // A later aligned immutable memory snapshot generates Candidate v3.
      const correctedMemory = {
        ...memorySnapshot,
        lessons: ["تُراجع نتيجة المتابعة وفق قياس موثق.", "تصحيح توقيت المراجعة استناداً إلى القياس الجديد."],
      };
      const correctionRows = await tx.unsafe(
        "select public.save_decision_memory_snapshot($1::uuid,2,$2::jsonb,$3::text,$4::text) as result",
        [outcomeId, correctedMemory, "تصحيح الدروس بعد مراجعة القياس.", randomUUID()],
      );
      const correction = decode(correctionRows[0].result);
      assert.equal(correction?.ok, true);
      assert.equal(correction.snapshot.version, 3);

      const nextCandidateRows = await tx.unsafe(
        "select public.create_decision_policy_learning_candidate($1::uuid[],$2::text) as result",
        [[outcomeId], randomUUID()],
      );
      const nextCandidate = decode(nextCandidateRows[0].result);
      assert.equal(nextCandidate?.ok, true);
      assert.equal(nextCandidate.duplicate, false);
      assert.equal(nextCandidate.candidate.candidateVersion, 3);
      assert.equal(nextCandidate.candidate.state, "DRAFT");
      assert.equal(nextCandidate.candidate.candidateSnapshot.sourceMemorySnapshots[0].version, 3);
      assert.notEqual(
        nextCandidate.candidate.candidateSnapshot.sourceMemorySnapshots[0].snapshotId,
        candidate.candidateSnapshot.sourceMemorySnapshots[0].snapshotId,
      );

      const listRows = await tx.unsafe(
        "select public.fetch_decision_policy_learning_candidates(20,0) as result",
      );
      const list = decode(listRows[0].result);
      assert.equal(list.total, 2);
      assert.equal(list.items.length, 2);
      assert.equal(list.items.find(item => item.id === candidate.id).state, "APPROVED");
      assert.equal(list.items.find(item => item.id === nextCandidate.candidate.id).state, "DRAFT");

      await tx.unsafe("reset role");
      const preserved = await tx.unsafe(
        "select o.rule_version, (select count(*)::integer from public.decision_memory_snapshots s " +
        "where s.organization_id=o.organization_id and s.decision_outcome_id=o.id) as memory_versions, " +
        "(select pg_catalog.jsonb_agg(s.payload->'lessons' order by s.version) from public.decision_memory_snapshots s " +
        "where s.organization_id=o.organization_id and s.decision_outcome_id=o.id) as memory_lesson_versions, " +
        "(select pg_catalog.jsonb_agg(s.payload->>'asOf' order by s.version) from public.decision_memory_snapshots s " +
        "where s.organization_id=o.organization_id and s.decision_outcome_id=o.id) as memory_as_of_versions, " +
        "(select c.candidate_snapshot from public.decision_policy_learning_candidates c where c.id=$2::uuid) as original_candidate_snapshot, " +
        "(select count(*)::integer from public.decision_policy_learning_events e " +
        "where e.organization_id=o.organization_id and e.candidate_id=$2::uuid) as learning_events " +
        "from public.decision_outcomes o where o.organization_id=$1::uuid and o.id=$3::uuid",
        [manager.organization_id, candidate.id, outcomeId],
      );
      assert.equal(preserved.length, 1);
      assert.equal(preserved[0].rule_version, ruleVersion, "Profile v1 / source rule version must not be rewritten");
      assert.equal(preserved[0].memory_versions, 3, "mismatched and corrected memory snapshots append without overwriting v1");
      assert.deepEqual(preserved[0].memory_lesson_versions, [
        ["تُراجع نتيجة المتابعة وفق قياس موثق."],
        ["تم فحص اختلاف توقيت القياس قبل السماح بالتعلم."],
        ["تُراجع نتيجة المتابعة وفق قياس موثق.", "تصحيح توقيت المراجعة استناداً إلى القياس الجديد."],
      ], "all immutable decision-memory versions remain preserved");
      assert.equal(Date.parse(preserved[0].memory_as_of_versions[1]), Date.parse(mismatchAsOf));
      assert.equal(preserved[0].original_candidate_snapshot.sourceMemorySnapshots[0].version, 1,
        "approved Candidate v2 remains pinned to original memory v1");
      assert.equal(preserved[0].learning_events, 3, "CREATE, SUBMIT and APPROVE must be append-only events");

      throw new RollbackAcceptance("roll back every temporary invoice, decision, memory snapshot and candidate");
    }).catch((error) => {
      if (!(error instanceof RollbackAcceptance)) throw error;
    });

    process.stdout.write(
      "PASS PostgreSQL 17 outcome learning acceptance: source-derived expected/actual metrics, complete evidence and lessons, Candidate v2, duplicate-source protection, immutable snapshots, append-only events, maker-checker approval, tenant-scoped RPC access, and preserved base rule/profile version. All fixture writes rolled back.\n",
    );
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch(error => {
  process.stderr.write("FAIL PostgreSQL 17 outcome learning acceptance: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
});
