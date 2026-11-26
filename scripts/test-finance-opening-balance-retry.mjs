import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function localDatabaseUrl() {
  const value=process.env.TEST_DATABASE_URL?.trim();
  if(!value) throw new Error("TEST_DATABASE_URL is required for finance opening-balance acceptance.");
  const url=new URL(value);
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  const port=url.port?Number(url.port):5432;
  if(!["127.0.0.1","localhost","::1"].includes(host)||!Number.isSafeInteger(port)||port<1||port>65535) {
    throw new Error("Finance opening-balance acceptance refuses non-loopback PostgreSQL endpoints.");
  }
  return value;
}

async function expectSqlState(promise,code,message) {
  await assert.rejects(promise,(error)=>{
    assert.equal(String(error?.code),code,
      message+": actual SQLSTATE "+String(error?.code)+" ("+String(error?.message)+")");
    return true;
  });
}

async function actorSubmit(client,actor,input) {
  return client.begin(async(tx)=>{
    await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)",[actor.authUserId]);
    await tx.unsafe("select set_config('test.finance_profile_id',$1,true)",[actor.profileId]);
    await tx.unsafe("select set_config('test.can_manage_finance','true',true)");
    await tx.unsafe("set local role authenticated");
    const rows=await tx.unsafe(
      "select public.submit_finance_cash_opening_balance($1::uuid,$2::uuid,$3::date,$4::numeric,$5::uuid) as result",
      [input.mappingId,input.evidenceId,input.asOfDate,input.amount,input.idempotencyKey]
    );
    const result=typeof rows[0]?.result==="string"?JSON.parse(rows[0].result):rows[0]?.result;
    assert.ok(result&&typeof result==="object","the server must return an opening-balance acknowledgement");
    return result;
  });
}

async function main() {
  const db=postgres(localDatabaseUrl(),{max:5,prepare:false,idle_timeout:5});
  try {
    const schema=await db.unsafe(
      "select to_regclass('public.profiles') is not null as profiles,"+
      "to_regclass('public.purchase_supplier_payment_settlement_accounts') is not null as accounts,"+
      "to_regclass('public.finance_cash_account_evidence') is not null as evidence,"+
      "to_regclass('public.finance_cash_opening_balance_proposals') is not null as proposals,"+
      "to_regclass('public.audit_logs') is not null as audit"
    );
    assert.deepEqual(schema[0],{profiles:true,accounts:true,evidence:true,proposals:true,audit:true},
      "run the bank retry fixture bootstrap before opening-balance acceptance");

    const actorA={profileId:randomUUID(),authUserId:randomUUID()};
    const orgA=randomUUID(),mappingA=randomUUID(),accountA=randomUUID(),evidenceA=randomUUID(),key=randomUUID();
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

    const input={
      mappingId:mappingA,
      evidenceId:evidenceA,
      asOfDate:new Date().toISOString().slice(0,10),
      amount:"1250.00",
      idempotencyKey:key
    };
    const first=await actorSubmit(db,actorA,input);
    assert.equal(first.replayed,false,"the first opening-balance request must create a proposal");
    assert.ok(first.proposal_id,"the first request must return the persisted proposal ID");

    const auditCount=async(org,proposalId)=>{
      const rows=await db.unsafe(
        "select count(*)::integer as count from public.audit_logs "+
        "where organization_id=$1::uuid and action='finance.cash_opening_balance_submitted' "+
        "and entity_type='finance_cash_opening_balance_proposal' and entity_id=$2::uuid",
        [org,proposalId]
      );
      return rows[0].count;
    };
    assert.equal(await auditCount(orgA,first.proposal_id),1,
      "the initial opening-balance write must append exactly one audit event");

    // A saved proposal remains replayable even if its current source mapping is
    // later disabled; the retry must recover the already-committed result.
    await db.unsafe(
      "update public.purchase_supplier_payment_settlement_accounts set is_active=false "+
      "where id=$1::uuid and organization_id=$2::uuid",
      [mappingA,orgA]
    );
    const replay=await actorSubmit(db,actorA,input);
    assert.equal(replay.proposal_id,first.proposal_id,
      "an exact retry after mapping deactivation must recover the original proposal");
    assert.equal(replay.replayed,true,
      "an exact retry after mapping deactivation must be acknowledged as replay");
    assert.equal(await auditCount(orgA,first.proposal_id),1,
      "an exact replay must not append a duplicate audit event");

    await expectSqlState(
      actorSubmit(db,actorA,{...input,amount:"1251.00"}),
      "23505",
      "the same key with a changed amount must remain an idempotency conflict"
    );
    await expectSqlState(
      actorSubmit(db,actorA,{...input,amount:"1250.001",idempotencyKey:randomUUID()}),
      "22023",
      "opening-balance submissions must reject more than two decimals instead of silently rounding numeric(18,2)"
    );
    await expectSqlState(
      actorSubmit(db,actorA,{...input,idempotencyKey:randomUUID()}),
      "42501",
      "a new proposal must still be denied after the account mapping is disabled"
    );

    // The idempotency key is unique within the tenant, not globally.
    const actorB={profileId:randomUUID(),authUserId:randomUUID()};
    const orgB=randomUUID(),mappingB=randomUUID(),evidenceB=randomUUID();
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
    const otherTenant=await actorSubmit(db,actorB,{...input,mappingId:mappingB,evidenceId:evidenceB});
    assert.equal(otherTenant.replayed,false,
      "another tenant may independently use the same idempotency UUID");
    assert.notEqual(otherTenant.proposal_id,first.proposal_id,
      "idempotency replay must never cross tenant boundaries");
    assert.equal(await auditCount(orgB,otherTenant.proposal_id),1);

    const counts=await db.unsafe(
      "select (select count(*)::integer from public.finance_cash_opening_balance_proposals where organization_id=$1::uuid) as tenant_a,"+
      "(select count(*)::integer from public.finance_cash_opening_balance_proposals where organization_id=$2::uuid) as tenant_b",
      [orgA,orgB]
    );
    assert.deepEqual(counts[0],{tenant_a:1,tenant_b:1},
      "retry/conflict paths must preserve exactly one proposal per tenant request");

    console.log("PASS PostgreSQL 17 opening-balance retry: exact replay survives account deactivation, changed payload conflicts, new inactive-account writes denied, single audit, and tenant-scoped key isolation.");
  } finally {
    await db.end({timeout:5});
  }
}

main().catch((error)=>{
  console.error("FAIL finance opening-balance retry acceptance:",error);
  process.exitCode=1;
});