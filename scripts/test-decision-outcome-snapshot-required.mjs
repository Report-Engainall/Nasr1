import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for decision snapshot PostgreSQL acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function requireLoopback(value, label, allowedPorts) {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || (allowedPorts && !allowedPorts.includes(url.port))) {
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
    throw new Error("Local Supabase manager sign-in failed (HTTP " + response.status + ").");
  }
  const parts = payload.access_token.split(".");
  if (parts.length !== 3) throw new Error("Local Supabase issued a malformed JWT.");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!claims.sub || typeof claims.session_id !== "string") throw new Error("Manager JWT has no live session identity.");
  return claims;
}
async function expectSqlState(tx, expectedCode, action, label) {
  const savepoint = "decision_snapshot_expected_failure";
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
async function main() {
  const databaseUrl = requiredEnv("TEST_DATABASE_URL");
  const apiUrl = requireLoopback(requiredEnv("SUPABASE_URL"), "Local Supabase Auth", ["54321"]);
  const database = requireLoopback(databaseUrl, "Decision snapshot database");
  if (!/^\d+$/.test(database.port) || Number(database.port) < 1 || Number(database.port) > 65535) {
    throw new Error("Decision snapshot acceptance requires an explicit loopback PostgreSQL port.");
  }
  const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  const claims = await signIn(apiUrl, publishableKey, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"));
  const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  class RollbackAcceptance extends Error {}
  try {
    const profiles = await db.unsafe(
      "select p.id::text as profile_id,p.auth_user_id::text as auth_user_id,p.organization_id::text as organization_id " +
      "from public.profiles p join public.user_roles r on r.profile_id=p.id " +
      "where p.auth_user_id=$1::uuid and p.is_active=true and r.role='manager' order by p.created_at,p.id limit 1",
      [claims.sub],
    );
    assert.equal(profiles.length, 1, "the authenticated local manager must map to one active tenant-scoped profile");
    const actor = profiles[0];

    await db.begin(async (tx) => {
      await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [claims.sub]);
      await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ ...claims, role: "authenticated" })]);
      await tx.unsafe("set local role authenticated");

      const suffix = randomUUID();
      const candidateId = "p2-decision-snapshot:" + suffix;
      const idempotencyKey = "p2-decision-snapshot-" + suffix;
      const asOf = new Date().toISOString();
      const snapshot = {
        schemaVersion: "1.0.0", candidateId, ruleId: "p2.snapshot.acceptance", ruleVersion: "1.0.0",
        priority: "P3", priorityScore: 100,
        what: "قبول محلي لسلامة لقطة القرار",
        why: "تم إنشاء اللقطة من أدلة اختبار معزولة.",
        risk: "لا يمثل هذا السجل قراراً تجارياً أو مالياً حقيقياً.",
        soWhat: "يثبت الاختبار الحفظ الذري ومنع تجاوز اللقطة فقط.",
        whatNext: "لا ينفذ الاختبار أي حركة مخزون أو قيد محاسبي.",
        owner: "P2 isolated PostgreSQL acceptance",
        expectedOutcome: "التحقق من اللقطة والحدث ومفتاح منع التكرار.",
        impact: null, impactStatus: "WITHHELD", impactReason: "TEST_EVIDENCE_NOT_FINANCIAL",
        proof: { evidenceIds: ["acceptance-evidence:" + suffix], metricKeys: ["acceptance.decision_snapshot"],
          asOf, formulaVersions: ["acceptance.decision_snapshot@1.0.0"] },
        createdAt: asOf, expiresAt: null,
      };
      const command = [candidateId, snapshot.ruleId, snapshot.ruleVersion, actor.profile_id,
        snapshot.expectedOutcome, "قبول قاعدة بيانات محلي داخل معاملة ستُلغى بالكامل.",
        JSON.stringify(snapshot), idempotencyKey];
      // Diagnose the common snapshot rejection before exercising the authenticated RPC.
      await tx.unsafe("reset role");
      const snapshotDiagnostic = await tx.unsafe(
        "select public._is_valid_decision_candidate_snapshot($1::jsonb,$2::text,$3::text,$4::text,$5::text) as snapshot_valid, " +
        "exists(select 1 from public.profiles p join public.user_roles r on r.profile_id=p.id where p.id=$6::uuid and p.organization_id=$7::uuid and p.is_active=true and r.role in ('admin','manager','staff','accountant','warehouse','purchasing','sales')) as owner_valid, " +
        "pg_catalog.char_length($8::text) as idempotency_key_length, " +
        "jsonb_typeof($1::jsonb->'proof') as proof_type, " +
        "jsonb_typeof($1::jsonb->'impact') as impact_type, " +
        "jsonb_typeof($1::jsonb->'proof'->'evidenceIds') as evidence_ids_type, " +
        "jsonb_typeof($1::jsonb->'proof'->'metricKeys') as metric_keys_type, " +
        "jsonb_typeof($1::jsonb->'proof'->'formulaVersions') as formula_versions_type",
        [JSON.stringify(snapshot), snapshot.candidateId, snapshot.ruleId, snapshot.ruleVersion,
          snapshot.expectedOutcome, actor.profile_id, actor.organization_id, idempotencyKey],
      );
      if (!snapshotDiagnostic[0].snapshot_valid || !snapshotDiagnostic[0].owner_valid ||
          snapshotDiagnostic[0].idempotency_key_length < 1 || snapshotDiagnostic[0].idempotency_key_length > 100) {
        throw new Error("Decision snapshot acceptance fixture rejected: " + JSON.stringify(snapshotDiagnostic[0]));
      }
      await tx.unsafe("set local role authenticated");

      const create = async (payload) => {
        const rows = await tx.unsafe(
          "select public.create_decision_outcome_proposal_with_snapshot(" +
          "$1::text,$2::text,$3::text,$4::uuid,$5::text,$6::text,$7::jsonb,$8::text) as result", payload);
        return typeof rows[0].result === "string" ? JSON.parse(rows[0].result) : rows[0].result;
      };

      const first = await create(command);
      assert.equal(first?.ok, true, "the manager must create the snapshot-backed proposal");
      assert.equal(first?.duplicate, false);
      assert.equal(first?.outcome?.candidateId, candidateId);
      assert.deepEqual(first?.outcome?.candidateSnapshot, snapshot);
      const outcomeId = first?.outcome?.id;
      assert.match(outcomeId, /^[0-9a-f-]{36}$/i);

      const replay = await create(command);
      assert.equal(replay?.ok, true);
      assert.equal(replay?.duplicate, true, "exact replay must return the saved immutable proposal");
      assert.equal(replay?.outcome?.id, outcomeId);
      assert.deepEqual(replay?.outcome?.candidateSnapshot, snapshot);

      const changedSnapshot = { ...snapshot, what: snapshot.what + " changed" };
      await expectSqlState(tx, "23505", () => create([
        ...command.slice(0, 6), JSON.stringify(changedSnapshot), idempotencyKey,
      ]), "same candidate with a changed immutable snapshot");

      await expectSqlState(tx, "42501", () => tx.unsafe(
        "select public.create_decision_outcome_proposal($1::text,$2::text,$3::text,$4::uuid,$5::text,$6::text,$7::text)",
        [candidateId + ":legacy-bypass", snapshot.ruleId, snapshot.ruleVersion, actor.profile_id,
          snapshot.expectedOutcome, "legacy direct call must fail", idempotencyKey + "-legacy"],
      ), "authenticated direct call to the legacy proposal RPC");

      await tx.unsafe("reset role");
      const stored = await tx.unsafe(
        "select o.candidate_snapshot, " +
        "(select count(*)::integer from public.decision_outcome_events e where e.organization_id=o.organization_id and e.outcome_id=o.id and e.event_type='CREATE') as create_events, " +
        "(select count(*)::integer from public.audit_logs a where a.organization_id=o.organization_id and a.entity_type='decision_outcome' and a.entity_id=o.id and a.action='decision_outcome.proposed') as proposal_audits " +
        "from public.decision_outcomes o where o.organization_id=$1::uuid and o.id=$2::uuid",
        [actor.organization_id, outcomeId],
      );
      assert.equal(stored.length, 1);
      assert.deepEqual(stored[0].candidate_snapshot, snapshot);
      assert.equal(stored[0].create_events, 1, "one append-only CREATE event must be persisted");
      assert.equal(stored[0].proposal_audits, 1, "one audit must accompany the CREATE event");
      await expectSqlState(tx, "42501", () => tx.unsafe(
        "update public.decision_outcomes set candidate_snapshot=$2::jsonb where organization_id=$1::uuid and id=$3::uuid",
        [actor.organization_id, JSON.stringify(changedSnapshot), outcomeId],
      ), "mutation of a non-null immutable snapshot");

      const privileges = await tx.unsafe(
        "select " +
        "has_function_privilege('authenticated','public.create_decision_outcome_proposal(text,text,text,uuid,text,text,text)'::regprocedure,'EXECUTE') as legacy_authenticated, " +
        "has_function_privilege('anon','public.create_decision_outcome_proposal(text,text,text,uuid,text,text,text)'::regprocedure,'EXECUTE') as legacy_anon, " +
        "has_function_privilege('authenticated','public.create_decision_outcome_proposal_with_snapshot(text,text,text,uuid,text,text,jsonb,text)'::regprocedure,'EXECUTE') as snapshot_authenticated",
      );
      assert.equal(privileges[0].legacy_authenticated, false);
      assert.equal(privileges[0].legacy_anon, false);
      assert.equal(privileges[0].snapshot_authenticated, true);

      throw new RollbackAcceptance("rollback all local decision test effects");
    }).catch((error) => { if (!(error instanceof RollbackAcceptance)) throw error; });

    process.stdout.write(
      "PASS PostgreSQL 17 decision snapshot acceptance: authenticated manager, immutable evidence snapshot, one CREATE event/audit, exact idempotent replay, changed-snapshot conflict, legacy RPC denial, snapshot mutation denial, and complete transaction rollback.\n",
    );
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
}
main().catch((error) => {
  process.stderr.write("FAIL PostgreSQL 17 decision snapshot acceptance: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
});
