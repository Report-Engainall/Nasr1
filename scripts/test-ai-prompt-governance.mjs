import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated AI prompt governance acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function assertLoopback(urlValue, label, expectedProtocol) {
  const url = new URL(urlValue);
  const protocolOk = expectedProtocol === "postgres"
    ? ["postgres:", "postgresql:"].includes(url.protocol)
    : url.protocol === expectedProtocol;
  if (
    !protocolOk ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    (expectedProtocol === "http:" && url.port !== "54321") ||
    (expectedProtocol === "postgres") && !/^\d{1,5}$/.test(url.port)
  ) {
    throw new Error(label + " must target the isolated local P2 Supabase/PostgreSQL stack.");
  }
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
async function createConfirmedUser(apiUrl, serviceRoleKey, email, password, fullName) {
  const response = await fetch(new URL("/auth/v1/admin/users", apiUrl), {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.id !== "string") {
    throw new Error("Local Supabase Auth could not create an ephemeral prompt-governance test user (HTTP " + response.status + ").");
  }
  return body.id;
}
async function upsertTestProfile(db, authUserId, organizationId, email, fullName) {
  const existing = await db.unsafe(
    "select id from public.profiles where auth_user_id=$1::uuid order by id limit 1",
    [authUserId],
  );
  if (existing.length) {
    await db.unsafe(
      "update public.profiles set organization_id=$2::uuid,email=$3,full_name=$4,is_active=true where id=$1::uuid",
      [existing[0].id, organizationId, email, fullName],
    );
    return existing[0].id;
  }
  const id = randomUUID();
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,email,full_name,is_active) values($1::uuid,$2::uuid,$3::uuid,$4,$5,true)",
    [id, authUserId, organizationId, email, fullName],
  );
  return id;
}
async function signIn(apiUrl, publishableKey, email, password, expectedUserId, db) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", apiUrl), {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error("Local Supabase Auth could not issue a password-authenticated prompt test session (HTTP " + response.status + ").");
  }
  const parts = body.access_token.split(".");
  if (parts.length !== 3 || !parts[1]) throw new Error("Local Auth returned an invalid JWT shape.");
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Local Auth JWT claims could not be decoded.");
  }
  const expiresAt = Number(claims?.exp);
  if (
    claims?.sub !== expectedUserId ||
    claims?.role !== "authenticated" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(claims?.session_id ?? "")) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Local Auth did not issue a live session-bound token for the expected prompt test user.");
  }
  const session = await db.unsafe(
    "select id::text,user_id::text from auth.sessions where id=$1::uuid and user_id=$2::uuid and (not_after is null or not_after>pg_catalog.now())",
    [claims.session_id, expectedUserId],
  );
  assert.equal(session.length, 1, "each prompt governance JWT must have one active Auth session row");
  return claims;
}
async function setIdentity(client, claims) {
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [claims.sub]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
  await client.unsafe("set role authenticated");
}
async function expectSqlState(label, operation, expectedCode) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must be denied");
  assert.equal(caught.code, expectedCode, label + " must fail with SQLSTATE " + expectedCode);
  return caught;
}
async function oneRow(client, sql, parameters = []) {
  const rows = await client.unsafe(sql, parameters);
  assert.equal(rows.length, 1, "expected exactly one result row");
  return rows[0];
}
async function main() {
  let currentPhase = "read local test configuration";
  const setPhase = (value) => { currentPhase = value; process.stdout.write("AI_PROMPT_GOVERNANCE_PHASE " + value + String.fromCharCode(10)); };
  const apiUrl = requiredEnv("E2E_SUPABASE_URL");
  const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const connectionString = requiredEnv("TEST_DATABASE_URL");
  assertLoopback(apiUrl, "E2E_SUPABASE_URL", "http:");
  assertLoopback(connectionString, "TEST_DATABASE_URL", "postgres");

  const organizationId = "a0000000-0000-0000-0000-000000000001";
  const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
  const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL").toLowerCase();
  const adminPassword = requiredEnv("E2E_DEVICE_ADMIN_PASSWORD");
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
  const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL").toLowerCase();
  const accountantPassword = requiredEnv("E2E_ACCOUNTANT_PASSWORD");
  const foreignCustomerEmail = requiredEnv("E2E_EMAIL_B").toLowerCase();
  const foreignCustomerPassword = requiredEnv("E2E_PASSWORD_B");

  const db = postgres(connectionString, { max: 2, prepare: false, idle_timeout: 5 });
  const clients = [];
  const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
  const checkerEmail = "p2.prompt.checker." + suffix + "@example.test";
  const operatorEmail = "p2.prompt.operator." + suffix + "@example.test";
  const foreignAdminEmail = "p2.prompt.foreign-admin." + suffix + "@example.test";
  const checkerPassword = randomUUID().replaceAll("-", "") + "Ch7!";
  const operatorPassword = randomUUID().replaceAll("-", "") + "Op7!";
  const foreignAdminPassword = randomUUID().replaceAll("-", "") + "Fa7!";

  try {
    for (const value of [
      apiUrl, publishableKey, serviceRoleKey, connectionString,
      adminEmail, adminPassword, managerEmail, managerPassword,
      accountantEmail, accountantPassword, foreignCustomerEmail, foreignCustomerPassword,
      checkerEmail, checkerPassword, operatorEmail, operatorPassword, foreignAdminEmail, foreignAdminPassword,
    ]) {
      process.stdout.write("::add-mask::" + value + String.fromCharCode(10));
    }

    const fixture = async (email) => {
      const rows = await db.unsafe(
        "select p.id,p.auth_user_id,p.organization_id " +
        "from public.profiles p where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true",
        [organizationId, email],
      );
      assert.equal(rows.length, 1, "expected one active same-organization P2 profile for " + email);
      return rows[0];
    };
    const admin = await fixture(adminEmail);
    const manager = await fixture(managerEmail);
    const accountant = await fixture(accountantEmail);
    const foreignCustomerRows = await db.unsafe(
      "select p.id,p.auth_user_id,p.organization_id from public.profiles p " +
      "where p.organization_id=$1::uuid and lower(p.email)=lower($2) and p.is_active=true",
      [foreignOrganizationId, foreignCustomerEmail],
    );
    assert.equal(foreignCustomerRows.length, 1, "expected the seeded foreign-tenant identity");
    const foreignCustomer = foreignCustomerRows[0];

    const checkerUserId = await createConfirmedUser(apiUrl, serviceRoleKey, checkerEmail, checkerPassword, "P2 Prompt Governance Checker");
    const operatorUserId = await createConfirmedUser(apiUrl, serviceRoleKey, operatorEmail, operatorPassword, "P2 Prompt Governance Operator");
    const foreignAdminUserId = await createConfirmedUser(apiUrl, serviceRoleKey, foreignAdminEmail, foreignAdminPassword, "P2 Prompt Governance Foreign Admin");
    const checkerProfileId = await upsertTestProfile(db, checkerUserId, organizationId, checkerEmail, "P2 Prompt Governance Checker");
    const operatorProfileId = await upsertTestProfile(db, operatorUserId, organizationId, operatorEmail, "P2 Prompt Governance Operator");
    const foreignAdminProfileId = await upsertTestProfile(db, foreignAdminUserId, foreignOrganizationId, foreignAdminEmail, "P2 Prompt Governance Foreign Admin");
    await db.unsafe(
      "insert into public.user_roles(profile_id,role) values($1::uuid,'admin'),($2::uuid,'admin'),($3::uuid,'admin') on conflict(profile_id,role) do nothing",
      [checkerProfileId, operatorProfileId, foreignAdminProfileId],
    );

    const authClaims = await Promise.all([
      signIn(apiUrl, publishableKey, adminEmail, adminPassword, admin.auth_user_id, db),
      signIn(apiUrl, publishableKey, managerEmail, managerPassword, manager.auth_user_id, db),
      signIn(apiUrl, publishableKey, accountantEmail, accountantPassword, accountant.auth_user_id, db),
      signIn(apiUrl, publishableKey, foreignAdminEmail, foreignAdminPassword, foreignAdminUserId, db),
      signIn(apiUrl, publishableKey, foreignCustomerEmail, foreignCustomerPassword, foreignCustomer.auth_user_id, db),
      signIn(apiUrl, publishableKey, checkerEmail, checkerPassword, checkerUserId, db),
      signIn(apiUrl, publishableKey, operatorEmail, operatorPassword, operatorUserId, db),
    ]);
    const [adminClaims, managerClaims, accountantClaims, foreignAdminClaims, foreignCustomerClaims, checkerClaims, operatorClaims] = authClaims;

    const connectIdentity = async (claims) => {
      const client = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
      clients.push(client);
      await setIdentity(client, claims);
      return client;
    };
    const adminDb = await connectIdentity(adminClaims);
    const managerDb = await connectIdentity(managerClaims);
    const accountantDb = await connectIdentity(accountantClaims);
    const foreignAdminDb = await connectIdentity(foreignAdminClaims);
    const foreignCustomerDb = await connectIdentity(foreignCustomerClaims);
    const checkerDb = await connectIdentity(checkerClaims);
    const operatorDb = await connectIdentity(operatorClaims);

    setPhase("insert source-backed local AI audit fixture");
    const aiAuditRequestId = "p2-ai-audit-" + suffix;
    // postgres.js 3.4.9's db.json() assigns JSONB OID 3802 and serializes the
    // JavaScript value exactly once. Passing JSON.stringify(value) to an inferred
    // jsonb parameter causes JSON.stringify(string) and turns an array into a scalar.
    const providerAttemptFixture = [{
      provider: "openai_compatible",
      model: "example-model",
      fallback: false,
      status: "succeeded",
      elapsed_ms: 840,
      observed_input_tokens: 120,
      observed_output_tokens: 48,
      estimated_cost: "0.0042",
    }];
    const providerAttemptShape = await oneRow(
      db,
      "select jsonb_typeof($1::jsonb) as value_type, jsonb_array_length($1::jsonb)::integer as value_count",
      [db.json(providerAttemptFixture)],
    );
    assert.equal(providerAttemptShape.value_type, "array", "postgres.js must bind the provider telemetry as a JSONB array");
    assert.equal(Number(providerAttemptShape.value_count), 1, "the provider telemetry fixture must contain exactly one attempt");
    await db.unsafe(
      "insert into public.ai_usage_ledger(" +
      "organization_id,actor_profile_id,request_id,model_name,input_tokens,output_tokens,estimated_cost," +
      "execution_time_ms,fallback_used,result_status,usage_measurement_status,observed_input_tokens," +
      "observed_output_tokens,provider_attempt_count,provider_attempts,outcome_reason" +
      ") values($1::uuid,$2::uuid,$3::text,$4::text,120,48,0.0042,840,false,'completed','measured',120,48,1,$5::jsonb,null) " +
      "on conflict(organization_id,request_id) do nothing",
      [
        organizationId,
        admin.id,
        aiAuditRequestId,
        "openai_compatible/example-model",
        db.json(providerAttemptFixture),
      ],
    );


    setPhase("verify malformed legacy JSONB in a rollback-only local transaction");
    const malformedAiAuditRequestId = "p2-ai-audit-malformed-" + suffix;
    const rollbackLegacyFixture = new Error("ROLLBACK_ONLY_LEGACY_AI_AUDIT_FIXTURE");
    let legacyFixtureRolledBack = false;
    try {
      await db.begin(async (tx) => {
        // The production table correctly rejects scalar JSONB. Drop only its two
        // array-shape CHECK constraints inside this disposable transaction so
        // that the RPC can be tested against a pre-constraint legacy row.
        // Throwing the private marker below rolls back both DDL and fixture row.
        await tx.unsafe(
          "alter table public.ai_usage_ledger drop constraint ai_usage_ledger_attempts_array_check",
        );
        await tx.unsafe(
          "alter table public.ai_usage_ledger drop constraint ai_usage_ledger_attempt_count_matches_check",
        );
        setPhase("insert legacy scalar JSONB fixture inside rollback-only transaction");
        const legacyScalarPayload = "legacy_scalar_payload";
        const legacyScalarType = await oneRow(
          tx,
          "select jsonb_typeof($1::jsonb) as value_type",
          [tx.json(legacyScalarPayload)],
        );
        assert.equal(legacyScalarType.value_type, "string", "the legacy fixture must deliberately encode a scalar JSONB value");
        await tx.unsafe(
          "insert into public.ai_usage_ledger(" +
          "organization_id,actor_profile_id,request_id,model_name,input_tokens,output_tokens,estimated_cost," +
          "execution_time_ms,fallback_used,result_status,usage_measurement_status,observed_input_tokens," +
          "observed_output_tokens,provider_attempt_count,provider_attempts,outcome_reason" +
          ") values($1::uuid,$2::uuid,$3::text,$4::text,0,0,0,320,false,'completed','unknown',null,null,1,$5::jsonb,null)",
          [organizationId, admin.id, malformedAiAuditRequestId, "legacy/unknown-attempts", tx.json(legacyScalarPayload)],
        );
        await setIdentity(tx, adminClaims);
        setPhase("read legacy scalar JSONB through the tenant-scoped AI audit RPC");
        const legacyAudit = asJson((await tx.unsafe(
          "select public.list_ai_gateway_audit(null,50,0) as result",
        ))[0].result);
        const legacyRow = legacyAudit.items.find((item) => item.request_id === malformedAiAuditRequestId);
        assert.ok(legacyRow, "AI audit RPC must not abort when an isolated legacy scalar provider_attempts row exists");
        assert.equal(legacyRow.provider_attempts_integrity, false);
        assert.deepEqual(legacyRow.provider_attempts, []);
        assert.equal(
          legacyRow.provider_attempt_count,
          1,
          "the original attempt count must remain visible without claiming the malformed details are valid",
        );
        await tx.unsafe("reset role");
        throw rollbackLegacyFixture;
      });
    } catch (error) {
      if (error !== rollbackLegacyFixture) throw error;
      legacyFixtureRolledBack = true;
    }
    assert.equal(legacyFixtureRolledBack, true, "the malformed legacy fixture must always roll back");
    const restoredAttemptConstraints = await db.unsafe(
      "select conname from pg_catalog.pg_constraint " +
      "where conrelid='public.ai_usage_ledger'::regclass " +
      "and conname = any($1::text[])",
      [["ai_usage_ledger_attempts_array_check", "ai_usage_ledger_attempt_count_matches_check"]],
    );
    assert.deepEqual(
      restoredAttemptConstraints.map((row) => row.conname).sort(),
      ["ai_usage_ledger_attempt_count_matches_check", "ai_usage_ledger_attempts_array_check"].sort(),
      "both production JSONB shape constraints must be restored after the rollback-only fixture",
    );
    const persistedLegacyFixture = await db.unsafe(
      "select count(*)::integer as count from public.ai_usage_ledger " +
      "where organization_id=$1::uuid and request_id=$2::text",
      [organizationId, malformedAiAuditRequestId],
    );
    assert.equal(Number(persistedLegacyFixture[0].count), 0, "rollback-only legacy fixture must not persist");

    setPhase("read AI audit as organization admin");
    const aiAudit = asJson((await adminDb.unsafe(
      "select public.list_ai_gateway_audit(null,50,0) as result",
    ))[0].result);
    assert.ok(Array.isArray(aiAudit.items), "admin AI audit must return bounded ledger items");
    assert.ok(Number.isSafeInteger(Number(aiAudit.total)) && Number(aiAudit.total) >= aiAudit.items.length);
    assert.ok(aiAudit.items.some((item) => item.request_id === aiAuditRequestId), "audit RPC must return the source-backed local fixture");
    const malformedAttemptRecord = aiAudit.items.find((item) => item.request_id === malformedAiAuditRequestId);
    assert.ok(malformedAttemptRecord, "audit RPC must tolerate an isolated legacy scalar provider_attempts fixture");
    assert.equal(malformedAttemptRecord.provider_attempts_integrity, false);
    assert.deepEqual(malformedAttemptRecord.provider_attempts, []);
    assert.equal(malformedAttemptRecord.provider_attempt_count, 1, "the original attempt count remains visible without claiming valid details");
    for (const item of aiAudit.items) {
      assert.ok(!("prompt" in item) && !("response" in item) && !("raw_payload" in item));
      assert.equal(typeof item.provider_attempts_integrity, "boolean");
      assert.ok(Array.isArray(item.provider_attempts) && item.provider_attempts.length <= 2);
      if (item.provider_attempts_integrity === false) assert.deepEqual(item.provider_attempts, []);
      for (const attempt of item.provider_attempts) {
        assert.deepEqual(
          Object.keys(attempt).sort(),
          ["provider","model","fallback","status","elapsed_ms","observed_input_tokens","observed_output_tokens","estimated_cost","error_code"].sort(),
          "AI audit must expose only the approved provider-attempt allowlist",
        );
      }
    }
    setPhase("read AI audit as same-tenant manager");
    const managerAiAudit = asJson((await managerDb.unsafe(
      "select public.list_ai_gateway_audit(null,10,0) as result",
    ))[0].result);
    assert.ok(Array.isArray(managerAiAudit.items), "manager must read same-tenant AI audit metadata");
    assert.ok(managerAiAudit.items.some((item) => item.request_id === aiAuditRequestId), "manager must see the same-tenant source-backed audit fixture");
    await expectSqlState(
      "accountant cannot read per-attempt AI audit",
      () => accountantDb.unsafe("select public.list_ai_gateway_audit(null,10,0)"),
      "42501",
    );
    setPhase("prove foreign-tenant AI audit isolation");
    const foreignAiAudit = asJson((await foreignAdminDb.unsafe(
      "select public.list_ai_gateway_audit(null,10,0) as result",
    ))[0].result);
    assert.equal(foreignAiAudit.total, 0, "foreign administrator may only read their own tenant's AI audit");
    await expectSqlState(
      "AI audit rejects an unsupported result status",
      () => adminDb.unsafe("select public.list_ai_gateway_audit('unknown',10,0)"),
      "22023",
    );
    await expectSqlState(
      "AI audit rejects an excessive page size",
      () => adminDb.unsafe("select public.list_ai_gateway_audit(null,101,0)"),
      "22023",
    );

    setPhase("verify AI audit tenant and field allowlist");
    setPhase("begin prompt maker-checker lifecycle");
    const promptKey = "assistant.system";
    const content1 = "أجب بالعربية، ولا تخمّن بيانات الأعمال. استخدم الأدلة الموثقة فقط.";
    const createCommand = randomUUID();
    const draft1Result = asJson((await adminDb.unsafe(
      "select public.create_ai_prompt_draft($1::text,$2::text,$3::uuid) as result",
      [promptKey, content1, createCommand],
    ))[0].result);
    assert.equal(draft1Result.version.status, "DRAFT");
    assert.equal(Number(draft1Result.version.version), 1);
    assert.equal(
      draft1Result.version.content_sha256,
      createHash("sha256").update(content1, "utf8").digest("hex"),
      "database SHA-256 must match the exact immutable prompt content",
    );
    assert.equal(draft1Result.event.action, "CREATED");
    assert.equal(draft1Result.replayed, false);

    const draft1Replay = asJson((await adminDb.unsafe(
      "select public.create_ai_prompt_draft($1::text,$2::text,$3::uuid) as result",
      [promptKey, content1, createCommand],
    ))[0].result);
    assert.equal(draft1Replay.replayed, true, "same create command must replay idempotently");
    assert.equal(draft1Replay.version.id, draft1Result.version.id);
    const createdEventCount = await db.unsafe(
      "select count(*)::integer as count from public.ai_prompt_audit_events " +
      "where organization_id=$1::uuid and command_id=$2::uuid and action='CREATED'",
      [organizationId, createCommand],
    );
    assert.equal(createdEventCount[0].count, 1, "create replay must not duplicate its audit event");

    const listed = asJson((await adminDb.unsafe("select public.list_ai_prompt_versions() as result"))[0].result);
    assert.ok(listed.total >= 1);
    assert.ok(listed.items.some((row) => row.id === draft1Result.version.id));

    await expectSqlState(
      "ordinary manager cannot create an AI prompt",
      () => managerDb.unsafe("select public.create_ai_prompt_draft($1,$2,$3::uuid)", [promptKey, content1, randomUUID()]),
      "42501",
    );
    await expectSqlState(
      "accountant cannot create an AI prompt",
      () => accountantDb.unsafe("select public.create_ai_prompt_draft($1,$2,$3::uuid)", [promptKey, content1, randomUUID()]),
      "42501",
    );
    await expectSqlState(
      "ordinary foreign customer cannot create an AI prompt",
      () => foreignCustomerDb.unsafe("select public.create_ai_prompt_draft($1,$2,$3::uuid)", [promptKey, content1, randomUUID()]),
      "42501",
    );
    const foreignAdminList = asJson((await foreignAdminDb.unsafe("select public.list_ai_prompt_versions() as result"))[0].result);
    assert.equal(foreignAdminList.total, 0, "foreign administrator may only list prompts in their own tenant");
    const foreignDirectRows = await foreignAdminDb.unsafe("select count(*)::integer as count from public.ai_prompt_versions");
    assert.equal(foreignDirectRows[0].count, 0, "foreign administrator RLS must hide the other organization's prompt versions");
    const managerVisible = await managerDb.unsafe("select count(*)::integer as count from public.ai_prompt_versions");
    const accountantVisible = await accountantDb.unsafe("select count(*)::integer as count from public.ai_prompt_audit_events");
    assert.equal(managerVisible[0].count, 0, "manager RLS must not expose admin prompt versions");
    assert.equal(accountantVisible[0].count, 0, "accountant RLS must not expose prompt audit");

    const submitCommand = randomUUID();
    const submitted = asJson((await adminDb.unsafe(
      "select public.submit_ai_prompt_version($1::uuid,$2::uuid) as result",
      [draft1Result.version.id, submitCommand],
    ))[0].result);
    assert.equal(submitted.version.status, "PENDING_APPROVAL");
    const submitReplay = asJson((await adminDb.unsafe(
      "select public.submit_ai_prompt_version($1::uuid,$2::uuid) as result",
      [draft1Result.version.id, submitCommand],
    ))[0].result);
    assert.equal(submitReplay.replayed, true);
    await expectSqlState(
      "another administrator cannot replay the maker's submit command",
      () => checkerDb.unsafe(
        "select public.submit_ai_prompt_version($1::uuid,$2::uuid)",
        [draft1Result.version.id, submitCommand],
      ),
      "42501",
    );

    await expectSqlState(
      "prompt maker cannot approve their own submission",
      () => adminDb.unsafe(
        "select public.approve_ai_prompt_version($1::uuid,$2::uuid,$3::text)",
        [draft1Result.version.id, randomUUID(), "مراجعة الاعتماد"],
      ),
      "42501",
    );
    await expectSqlState(
      "prompt maker cannot reject their own submission",
      () => adminDb.unsafe(
        "select public.reject_ai_prompt_version($1::uuid,$2::uuid,$3::text)",
        [draft1Result.version.id, randomUUID(), "مراجعة الرفض"],
      ),
      "42501",
    );

    const approveCommand = randomUUID();
    const approved = asJson((await checkerDb.unsafe(
      "select public.approve_ai_prompt_version($1::uuid,$2::uuid,$3::text) as result",
      [draft1Result.version.id, approveCommand, "مراجعة الخصوصية والأمان"],
    ))[0].result);
    assert.equal(approved.version.status, "APPROVED");
    assert.equal(approved.version.approved_by_profile_id, checkerProfileId);
    const approveReplay = asJson((await checkerDb.unsafe(
      "select public.approve_ai_prompt_version($1::uuid,$2::uuid,$3::text) as result",
      [draft1Result.version.id, approveCommand, "مراجعة الخصوصية والأمان"],
    ))[0].result);
    assert.equal(approveReplay.replayed, true);
    await expectSqlState(
      "approver cannot also activate the same prompt",
      () => checkerDb.unsafe(
        "select public.activate_ai_prompt_version($1::uuid,$2::uuid,$3::text)",
        [draft1Result.version.id, randomUUID(), "تفعيل النسخة"],
      ),
      "42501",
    );
    await expectSqlState(
      "creator cannot activate the prompt",
      () => adminDb.unsafe(
        "select public.activate_ai_prompt_version($1::uuid,$2::uuid,$3::text)",
        [draft1Result.version.id, randomUUID(), "تفعيل النسخة"],
      ),
      "42501",
    );

    const activateCommand1 = randomUUID();
    const activated1 = asJson((await operatorDb.unsafe(
      "select public.activate_ai_prompt_version($1::uuid,$2::uuid,$3::text) as result",
      [draft1Result.version.id, activateCommand1, "تشغيل النسخة المعتمدة"],
    ))[0].result);
    assert.equal(activated1.version.status, "ACTIVE");
    assert.equal(activated1.version.id, draft1Result.version.id);
    assert.equal(activated1.events.length, 1, "first activation must record one event");
    const activationReplay = asJson((await operatorDb.unsafe(
      "select public.activate_ai_prompt_version($1::uuid,$2::uuid,$3::text) as result",
      [draft1Result.version.id, activateCommand1, "تشغيل النسخة المعتمدة"],
    ))[0].result);
    assert.equal(activationReplay.replayed, true);

    const serviceDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
    clients.push(serviceDb);
    await serviceDb.unsafe("select set_config('request.jwt.claim.role','service_role',false)");
    await serviceDb.unsafe("set role service_role");
    const activePrompt = asJson((await serviceDb.unsafe(
      "select public.get_active_ai_prompt($1::uuid,$2::uuid,$3::text) as result",
      [operatorClaims.sub, operatorClaims.session_id, promptKey],
    ))[0].result);
    assert.equal(activePrompt.content, content1);
    assert.equal(activePrompt.content_sha256, createHash("sha256").update(content1, "utf8").digest("hex"));

    await expectSqlState(
      "authenticated admin cannot call the service-only active prompt function",
      () => adminDb.unsafe(
        "select public.get_active_ai_prompt($1::uuid,$2::uuid,$3::text)",
        [adminClaims.sub, adminClaims.session_id, promptKey],
      ),
      "42501",
    );
    await expectSqlState(
      "service gateway cannot retrieve a prompt using a revoked/nonexistent session id",
      () => serviceDb.unsafe(
        "select public.get_active_ai_prompt($1::uuid,$2::uuid,$3::text)",
        [operatorClaims.sub, randomUUID(), promptKey],
      ),
      "42501",
    );

    const content2 = "أجب بدقة وبالعربية، ولا تعرض إلا معلومات موثقة من مصادر المتجر.";
    const draft2 = asJson((await operatorDb.unsafe(
      "select public.create_ai_prompt_draft($1::text,$2::text,$3::uuid) as result",
      [promptKey, content2, randomUUID()],
    ))[0].result);
    assert.equal(Number(draft2.version.version), 2);
    await operatorDb.unsafe(
      "select public.submit_ai_prompt_version($1::uuid,$2::uuid)",
      [draft2.version.id, randomUUID()],
    );
    await checkerDb.unsafe(
      "select public.approve_ai_prompt_version($1::uuid,$2::uuid,$3::text)",
      [draft2.version.id, randomUUID(), "اعتماد النسخة الثانية"],
    );
    const activateCommand2 = randomUUID();
    const activated2 = asJson((await adminDb.unsafe(
      "select public.activate_ai_prompt_version($1::uuid,$2::uuid,$3::text) as result",
      [draft2.version.id, activateCommand2, "استبدال النسخة النشطة بعد المراجعة"],
    ))[0].result);
    assert.equal(activated2.version.status, "ACTIVE");
    assert.equal(activated2.events.length, 2, "replacement activation must audit old deactivation and new activation");
    const versionStates = await db.unsafe(
      "select id::text,status,deactivated_at is not null as was_deactivated " +
      "from public.ai_prompt_versions where organization_id=$1::uuid and prompt_key=$2 order by version",
      [organizationId, promptKey],
    );
    assert.equal(versionStates.length, 2);
    assert.equal(versionStates[0].status, "APPROVED");
    assert.equal(versionStates[0].was_deactivated, true);
    assert.equal(versionStates[1].status, "ACTIVE");
    const activeCount = await db.unsafe(
      "select count(*)::integer as count from public.ai_prompt_versions where organization_id=$1::uuid and prompt_key=$2 and status='ACTIVE'",
      [organizationId, promptKey],
    );
    assert.equal(activeCount[0].count, 1, "exactly one active prompt version is allowed per organization/key");

    const rejectedDraft = asJson((await adminDb.unsafe(
      "select public.create_ai_prompt_draft($1::text,$2::text,$3::uuid) as result",
      ["assistant.rejected", "هذا توجيه صالح لاختبار مسار الرفض ومنع اعتماده.", randomUUID()],
    ))[0].result);
    await adminDb.unsafe(
      "select public.submit_ai_prompt_version($1::uuid,$2::uuid)",
      [rejectedDraft.version.id, randomUUID()],
    );
    const rejected = asJson((await checkerDb.unsafe(
      "select public.reject_ai_prompt_version($1::uuid,$2::uuid,$3::text) as result",
      [rejectedDraft.version.id, randomUUID(), "لا يطابق معيار الدليل المطلوب"],
    ))[0].result);
    assert.equal(rejected.version.status, "REJECTED");

    const retireDraft = asJson((await adminDb.unsafe(
      "select public.create_ai_prompt_draft($1::text,$2::text,$3::uuid) as result",
      ["assistant.retire", "هذه نسخة مسودة مخصصة لاختبار الأرشفة الآمنة.", randomUUID()],
    ))[0].result);
    const retired = asJson((await adminDb.unsafe(
      "select public.retire_ai_prompt_version($1::uuid,$2::uuid,$3::text) as result",
      [retireDraft.version.id, randomUUID(), "لم تعد مطلوبة ضمن سياسة التشغيل"],
    ))[0].result);
    assert.equal(retired.version.status, "RETIRED");
    assert.equal(retired.event.previous_status, "DRAFT");

    const pendingDraft = asJson((await adminDb.unsafe(
      "select public.create_ai_prompt_draft($1::text,$2::text,$3::uuid) as result",
      ["assistant.pending", "مسودة ستظل في انتظار قرار المراجع المستقل.", randomUUID()],
    ))[0].result);
    await adminDb.unsafe(
      "select public.submit_ai_prompt_version($1::uuid,$2::uuid)",
      [pendingDraft.version.id, randomUUID()],
    );
    await expectSqlState(
      "pending prompt cannot be retired before review",
      () => adminDb.unsafe(
        "select public.retire_ai_prompt_version($1::uuid,$2::uuid,$3::text)",
        [pendingDraft.version.id, randomUUID(), "محاولة تقاعد غير صالحة"],
      ),
      "22023",
    );

    await expectSqlState(
      "prompt contents reject embedded API secrets",
      () => adminDb.unsafe(
        "select public.create_ai_prompt_draft($1::text,$2::text,$3::uuid)",
        ["assistant.secret", "توجيه تجريبي يتضمن api_key=abcdef1234567890 وهذا يجب رفضه.", randomUUID()],
      ),
      "22023",
    );

    await expectSqlState(
      "authenticated admin cannot update immutable prompt content directly",
      () => adminDb.unsafe("update public.ai_prompt_versions set content='تغيير مباشر غير مسموح به' where id=$1::uuid", [draft1Result.version.id]),
      "42501",
    );
    await expectSqlState(
      "authenticated admin cannot delete append-only prompt audit events",
      () => adminDb.unsafe("delete from public.ai_prompt_audit_events where prompt_version_id=$1::uuid", [draft1Result.version.id]),
      "42501",
    );
    await expectSqlState(
      "authenticated admin cannot insert forged prompt audit events",
      () => adminDb.unsafe(
        "insert into public.ai_prompt_audit_events(organization_id,prompt_version_id,prompt_key,version,command_id,action,actor_profile_id,next_status) " +
        "values($1::uuid,$2::uuid,$3::text,1,$4::uuid,'APPROVED',$5::uuid,'APPROVED')",
        [organizationId, draft1Result.version.id, promptKey, randomUUID(), admin.id],
      ),
      "42501",
    );
    await expectSqlState(
      "foreign administrator cannot approve a prompt from another tenant",
      () => foreignAdminDb.unsafe(
        "select public.approve_ai_prompt_version($1::uuid,$2::uuid,$3::text)",
        [draft1Result.version.id, randomUUID(), "محاولة موافقة عبر مؤسسة أخرى"],
      ),
      "42501",
    );

    const managerAuditVisible = await managerDb.unsafe("select count(*)::integer as count from public.ai_prompt_audit_events");
    assert.equal(managerAuditVisible[0].count, 0, "manager must not read prompt audit events");
    const finalCounts = await db.unsafe(
      "select count(*)::integer as versions, " +
      "(select count(*)::integer from public.ai_prompt_audit_events e where e.organization_id=$1::uuid) as events " +
      "from public.ai_prompt_versions v where v.organization_id=$1::uuid",
      [organizationId],
    );
    assert.ok(finalCounts[0].versions >= 5);
    assert.ok(finalCounts[0].events >= finalCounts[0].versions);
    process.stdout.write(
      "AI_PROMPT_GOVERNANCE_ACCEPTANCE_PASS " +
      JSON.stringify({
        source: "isolated-local-supabase-postgresql-17",
        makerChecker: "proved",
        thirdPartyActivation: "proved",
        appendOnlyAudit: "proved",
        immutableContent: "proved",
        tenantIsolation: "proved",
        idempotency: "proved",
        runtimeSessionGuard: "proved",
        activeVersionsPerKey: 1,
        versions: finalCounts[0].versions,
        auditEvents: finalCounts[0].events,
      }) + String.fromCharCode(10),
    );
  } finally {
    for (const client of clients) {
      await client.end({ timeout: 2 }).catch(() => undefined);
    }
    await db.end({ timeout: 2 }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("AI prompt governance local acceptance failed at phase:", error?.message ?? error, "phase:", error?.phase ?? "see preceding phase marker", "sqlstate:", error?.code ?? "n/a", "detail:", error?.detail ?? "n/a");
  process.exitCode = 1;
});
