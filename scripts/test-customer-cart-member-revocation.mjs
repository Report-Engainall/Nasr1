import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

async function setAuthenticatedIdentity(client, input) {
  await client.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
    "values($1,$2,now(),now(),now(),null,$3,'127.0.0.1'::inet) " +
    "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [input.sessionId,input.authUserId,input.applicationName],
  );
  await client.unsafe("select set_config('application_name',$1,false)",[input.applicationName]);
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[input.authUserId]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)",[
    JSON.stringify({sub:input.authUserId,email:input.email,role:"authenticated",session_id:input.sessionId}),
  ]);
  await client.unsafe("set role authenticated");
}

async function readCartSnapshot(admin, organizationId, profileId) {
  const headers = await admin.unsafe(
    "select id::text as id,status,updated_at::text as updated_at " +
    "from public.customer_carts where organization_id=$1::uuid and profile_id=$2::uuid and status='active' order by created_at,id",
    [organizationId,profileId],
  );
  const cartIds = headers.map(row=>row.id);
  const items = cartIds.length
    ? await admin.unsafe(
      "select cart_id::text as cart_id,product_id::text as product_id,quantity " +
      "from public.customer_cart_items where organization_id=$1::uuid and cart_id=any($2::uuid[]) order by cart_id,product_id",
      [organizationId,cartIds],
    )
    : [];
  const audits = cartIds.length
    ? await admin.unsafe(
      "select id::text as id,action,entity_type,entity_id::text as entity_id,actor_id::text as actor_id,old_value,new_value " +
      "from public.audit_logs where organization_id=$1::uuid and entity_type='customer_cart' " +
      "and entity_id=any($2::uuid[]) order by created_at,id",
      [organizationId,cartIds],
    )
    : [];
  return {headers,items,audits};
}

export async function runCustomerCartMemberRevocationAcceptance(input) {
  const admin = postgres(input.connectionString,{max:1,prepare:false,idle_timeout:5});
  const owner = postgres(input.connectionString,{max:1,prepare:false,idle_timeout:5});
  const reader = postgres(input.connectionString,{max:1,prepare:false,idle_timeout:5});
  const writer = postgres(input.connectionString,{max:1,prepare:false,idle_timeout:5});
  const ownerSessionId = randomUUID();
  const readerSessionId = randomUUID();
  const writerSessionId = randomUUID();
  let gateOpen = false;
  let readAttempt;
  let syncAttempt;

  try {
    await Promise.all([
      setAuthenticatedIdentity(owner,{
        authUserId:input.ownerAuthUserId,email:input.ownerEmail,
        sessionId:ownerSessionId,applicationName:"ci-cart-owner-revocation",
      }),
      setAuthenticatedIdentity(reader,{
        authUserId:input.memberAuthUserId,email:input.memberEmail,
        sessionId:readerSessionId,applicationName:"ci-cart-member-read",
      }),
      setAuthenticatedIdentity(writer,{
        authUserId:input.memberAuthUserId,email:input.memberEmail,
        sessionId:writerSessionId,applicationName:"ci-cart-member-sync",
      }),
    ]);
    assert.notEqual(readerSessionId,writerSessionId,"cart read and sync must use independent Auth session IDs");

    const seeded = await writer.unsafe(
      "select public.sync_customer_cart($1::jsonb) as result",
      [writer.json([{product_id:input.productId,quantity:2}])],
    );
    const seededCart = seeded[0]?.result;
    assert.ok(seededCart && Array.isArray(seededCart.items),"active company member must be able to persist a cart before revocation");
    assert.deepEqual(seededCart.items,[{product_id:input.productId,quantity:2}]);
    assert.deepEqual(Object.keys(seededCart).sort(),["items","updated_at"],"cart DTO exposes only line identities and timestamp");
    assert.deepEqual(Object.keys(seededCart.items[0]).sort(),["product_id","quantity"],"cart line DTO has no price or total fields");
    assert.doesNotMatch(JSON.stringify(seededCart),/unit_price|display_price|line_total|total_amount|cost|margin/i);

    const memberRead = await reader.unsafe("select public.get_customer_cart() as result");
    assert.deepEqual(memberRead[0]?.result?.items,[{product_id:input.productId,quantity:2}],
      "get_customer_cart returns the saved member cart before revocation");
    const before = await readCartSnapshot(admin,input.organizationId,input.memberProfileId);
    assert.equal(before.headers.length,1,"the race starts with exactly one active member cart");
    assert.equal(before.items.length,1,"the race starts with exactly one persisted cart line");

    await owner.unsafe("reset role");
    await owner.unsafe("begin");
    gateOpen = true;
    const locked = await owner.unsafe(
      "select id from public.customers where id=$1::uuid and organization_id=$2::uuid for update",
      [input.customerId,input.organizationId],
    );
    assert.equal(locked.length,1,"owner holds the same customer-row lock used by membership revocation");
    await owner.unsafe("set role authenticated");

    readAttempt = reader.unsafe("select public.get_customer_cart() as result")
      .then(rows=>({ok:true,result:rows[0]?.result}))
      .catch(error=>({ok:false,error}));
    syncAttempt = writer.unsafe(
      "select public.sync_customer_cart($1::jsonb) as result",
      [writer.json([{product_id:input.productId,quantity:9}])],
    ).then(rows=>({ok:true,result:rows[0]?.result}))
      .catch(error=>({ok:false,error}));

    let bothBlocked = false;
    for (let attempt=0;attempt<160;attempt+=1) {
      const waiting = await admin.unsafe(
        "select count(*)::integer as count from pg_catalog.pg_stat_activity " +
        "where application_name in ('ci-cart-member-read','ci-cart-member-sync') " +
        "and state='active' and wait_event_type='Lock'",
      );
      if (waiting[0]?.count===2) { bothBlocked=true; break; }
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(bothBlocked,true,
      "both independent member sessions must reach and wait on the owner-held customer-row lock");

    const revoked = await owner.unsafe(
      "select public.revoke_customer_company_member($1::uuid) as result",
      [input.memberProfileId],
    );
    assert.equal(revoked[0]?.result,true,"owner revocation commits while holding the customer-row lock");
    await owner.unsafe("commit");
    gateOpen = false;

    const [readResult,syncResult] = await Promise.all([readAttempt,syncAttempt]);
    assert.equal(readResult.ok,false,"cart read that waited behind completed revocation must be denied");
    assert.equal(readResult.error.code,"42501","revoked cart read uses SQLSTATE 42501");
    assert.equal(syncResult.ok,false,"cart sync that waited behind completed revocation must be denied");
    assert.equal(syncResult.error.code,"42501","revoked cart sync uses SQLSTATE 42501");

    const membership = await admin.unsafe(
      "select status from public.customer_company_memberships where organization_id=$1::uuid and customer_id=$2::uuid and profile_id=$3::uuid",
      [input.organizationId,input.customerId,input.memberProfileId],
    );
    assert.equal(membership[0]?.status,"revoked","the membership revocation must persist");
    const after = await readCartSnapshot(admin,input.organizationId,input.memberProfileId);
    assert.deepEqual(after,before,
      "denied post-revocation read/sync must preserve cart rows, quantities, updated_at and cart audit rows byte-for-byte");

    process.stdout.write(
      "PASS AUTHZ-MEMBER-CART-001: separate read/sync sessions block behind owner revocation, both reject with 42501, and cart/audit snapshots remain unchanged\n",
    );
  } finally {
    if (gateOpen) await owner.unsafe("rollback").catch(()=>{});
    if (readAttempt || syncAttempt) {
      await Promise.allSettled([readAttempt,syncAttempt].filter(Boolean));
    }
    for (const client of [owner,reader,writer]) {
      await client.unsafe("reset role").catch(()=>{});
    }
    await Promise.all([admin.end({timeout:5}),owner.end({timeout:5}),reader.end({timeout:5}),writer.end({timeout:5})]);
  }
}
