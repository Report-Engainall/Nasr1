import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function localDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) throw new Error("TEST_DATABASE_URL is required for finance opening-balance acceptance.");
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const port = url.port ? Number(url.port) : 5432;
  if (!["127.0.0.1", "localhost", "::1"].includes(host) ||
      !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("Finance opening-balance acceptance refuses non-loopback PostgreSQL endpoints.");
  }
  return value;
}

async function expectSqlState(promise, code, message) {
  await assert.rejects(promise, (error) => {
    assert.equal(String(error?.code), code,
      message + ": actual SQLSTATE " + String(error?.code) + " (" + String(error?.message) + ")");
    return true;
  });
}

async function actorSubmit(client, actor, input) {
  return client.begin(async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [actor.authUserId]);
    await tx.unsafe("select set_config('test.finance_profile_id',$1,true)", [actor.profileId]);
    await tx.unsafe("select set_config('test.can_manage_finance','true',true)");
    await tx.unsafe("set local role authenticated");
    const rows = await tx.unsafe(
      "select public.submit_finance_cash_opening_balance($1::uuid,$2::uuid,$3::date,$4::numeric,$5::uuid) as result",
      [input.mappingId,input.evidenceId,input.asOfDate,input.amount,input.idempotencyKey],
    );
    const result = typeof rows[0]?.result === "string" ? JSON.parse(rows[0].result) : rows[0]?.result;
    assert.ok(result && typeof result === "object", "the server must return an opening-balance acknowledgement");
    return result;
  });
}

async function main() {
  const db = postgres(localDatabaseUrl(), { max: 6, prepare: false, idle_timeout: 5 });
  try {
    await db.unsafe(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE OR REPLACE FUNCTION public.current_profile_id()
      RETURNS uuid LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT nullif(current_setting('test.finance_profile_id',true),'')::uuid $$;
      CREATE OR REPLACE FUNCTION public.can_manage_finance()
      RETURNS boolean LANGUAGE sql STABLE SET search_path=''
      AS $$ SELECT coalesce(nullif(current_setting('test.can_manage_finance',true),'')::boolean,false) $$;

      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        auth_user_id uuid NOT NULL,
        is_active boolean NOT NULL
      );
      CREATE TABLE public.purchase_supplier_payment_settlement_accounts (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        accounting_account_id uuid NOT NULL,
        is_active boolean NOT NULL,
        currency text NOT NULL
      );
      CREATE TABLE public.finance_cash_account_evidence (
        id uuid PRIMARY KEY,
        organization_id uuid NOT NULL,
        settlement_account_mapping_id uuid NOT NULL,
        evidence_kind text NOT NULL
      );
      CREATE TABLE public.finance_cash_opening_balance_proposals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        settlement_account_mapping_id uuid NOT NULL,
        evidence_id uuid NOT NULL,
        as_of_date date NOT NULL,
        opening_balance numeric(18,2) NOT NULL,
        currency text NOT NULL,
        idempotency_key uuid NOT NULL,
        payload_fingerprint text NOT NULL,
        created_by_profile_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id,idempotency_key)
      );
      CREATE TABLE public.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        old_value jsonb NOT NULL,
        new_value jsonb NOT NULL
      );
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
      GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated;
    `);

    const migration = await import("node:fs/promises").then(({readFile}) =>
      readFile(new URL("../supabase/migrations/20261120131000_finance_opening_balance_exact_retry.sql", import.meta.url), "utf8"));
    const migrationSql = migration
      .replace(/^\s*BEGIN;\s*$/im, "")
      .replace(/^\s*COMMIT;\s*$/im, "");
    if (/^\s*BEGIN;\s*$/im.test(migrationSql) || /^\s*COMMIT;\s*$/im.test(migrationSql)) {
      throw new Error("Could not remove standalone transaction wrappers from the opening-balance migration.");
    }
    await db.begin(async (tx) => tx.unsafe(migrationSql));
    await db.begin(async (tx) => tx.unsafe(migrationSql));

    const grant = await db.unsafe(
      "select has_function_privilege('anon','public.submit_finance_cash_opening_balance(uuid,uuid,date,numeric,uuid)','EXECUTE') as anon_exec,"+
      "has_function_privilege('authenticated','public.submit_finance_cash_opening_balance(uuid,uuid,date,numeric,uuid)','EXECUTE') as authenticated_exec"
    );
    assert.deepEqual(grant[0],{anon_exec:false,authenticated_exec:true},
      "only authenticated finance callers may execute the opening-balance command");

    const orgA=randomUUID(), actorA={profileId:randomUUID(),authUserId:randomUUID()};
    const mappingA=randomUUID(), evidenceA=randomUUID(), accountA=randomUUID(), key=randomUUID();
    await db.unsafe(
      "insert into public.profiles(id,organization_id,auth_user_id,is_active) values($1::uuid,$2::uuid,$3::uuid,true)",
      [actorA.profileId,orgA,actorA.authUserId]
    );
    await db.unsafe(
      "insert into public.purchase_supplier_payment_settlement_accounts(id,organization_id,accounting_account_id,is_active,currency) values($1::uuid,$2::uuid,$3::uuid,true,'YER')",
      [mappingA,orgA,accountA]
    );
    await db.unsafe(
      "insert into public.finance_cash_account_evidence(id,organization_id,settlement_account_mapping_id,evidence_kind) values($1::uuid,$2::uuid,$3::uuid,'opening_balance')",
      [evidenceA,orgA,mappingA]
    );
    const input={mappingId:mappingA,evidenceId:evidenceA,asOfDate:new Date().toISOString().slice(0,10),amount:"1250.00",idempotencyKey:key};
    const first=await actorSubmit(db,actorA,input);
    assert.equal(first.replayed,false,"first opening-balance request must create a proposal");
    assert.ok(first.proposal_id,"first opening-balance request must return the persisted proposal ID");

    const auditCount=async (organizationId,proposalId)=>{
      const rows=await db.unsafe(
        "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and action='finance.cash_opening_balance_submitted' and entity_type='finance_cash_opening_balance_proposal' and entity_id=$2::uuid",
        [organizationId,proposalId]
      );
      return rows[0].count;
    };
    assert.equal(await auditCount(orgA,first.proposal_id),1,
      "initial opening-balance submission must append exactly one audit record");

    // A mapping may be disabled after the first write; this must not make an
    // ambiguous browser retry create a second proposal or become unrecoverable.
    await db.unsafe(
      "update public.purchase_supplier_payment_settlement_accounts set is_active=false where id=$1::uuid and organization_id=$2::uuid",
      [mappingA,orgA]
    );
    const replay=await actorSubmit(db,actorA,input);
    assert.equal(replay.proposal_id,first.proposal_id,
      "an exact retry after mapping deactivation must return the original proposal");
    assert.equal(replay.replayed,true,
      "an exact retry after mapping deactivation must be acknowledged as replay");
    assert.equal(await auditCount(orgA,first.proposal_id),1,
      "an exact replay must not append a second audit record");

    await expectSqlState(
      actorSubmit(db,actorA,{...input,amount:"1251.00"}),
      "23505",
      "reusing an opening-balance key with a changed amount must remain a conflict"
    );
    await expectSqlState(
      actorSubmit(db,actorA,{...input,idempotencyKey:randomUUID()}),
      "42501",
      "a new opening-balance write must remain denied when the account mapping is inactive"
    );

    const orgB=randomUUID(), actorB={profileId:randomUUID(),authUserId:randomUUID()};
    const mappingB=randomUUID(), evidenceB=randomUUID();
    await db.unsafe(
      "insert into public.profiles(id,organization_id,auth_user_id,is_active) values($1::uuid,$2::uuid,$3::uuid,true)",
      [actorB.profileId,orgB,actorB.authUserId]
    );
    await db.unsafe(
      "insert into public.purchase_supplier_payment_settlement_accounts(id,organization_id,accounting_account_id,is_active,currency) values($1::uuid,$2::uuid,$3::uuid,true,'YER')",
      [mappingB,orgB,randomUUID()]
    );
    await db.unsafe(
      "insert into public.finance_cash_account_evidence(id,organization_id,settlement_account_mapping_id,evidence_kind) values($1::uuid,$2::uuid,$3::uuid,'opening_balance')",
      [evidenceB,orgB,mappingB]
    );
    const tenantB=await actorSubmit(db,actorB,{...input,mappingId:mappingB,evidenceId:evidenceB});
    assert.equal(tenantB.replayed,false,
      "the same UUID idempotency key may be used independently in a different tenant");
    assert.notEqual(tenantB.proposal_id,first.proposal_id,
      "opening-balance idempotency must remain organization-scoped");
    assert.equal(await auditCount(orgB,tenantB.proposal_id),1);

    const totals=await db.unsafe(
      "select (select count(*)::integer from public.finance_cash_opening_balance_proposals where organization_id=$1::uuid) as tenant_a_proposals,"+
      "(select count(*)::integer from public.finance_cash_opening_balance_proposals where organization_id=$2::uuid) as tenant_b_proposals",
      [orgA,orgB]
    );
    assert.deepEqual(totals[0],{tenant_a_proposals:1,tenant_b_proposals:1},
      "replayed/denied requests must preserve one proposal per tenant and source request");

    console.log("PASS PostgreSQL 17 opening-balance retry: exact replay survives mapping deactivation, changed payload conflicts, new inactive writes denied, one audit only, and tenant-scoped keys remain independent.");
  } finally {
    await db.end({timeout:5});
  }
}

main().catch((error)=>{
  console.error("FAIL finance opening-balance retry acceptance:",error);
  process.exitCode=1;
});
