import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { runOrderInputHardeningAcceptance } from "./test-order-input-hardening.mjs";
import { runSessionManagementAcceptance } from "./test-session-management.mjs";
import { runGeneralLedgerReversalAcceptance } from "./test-general-ledger-reversal.mjs";
import { runCustomerCompanyInvitationRaceAcceptance } from "./test-customer-company-invitation-race.mjs";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for isolated database migration tests.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function setIdentity(authUserId, email, sessionId = authUserId, registerSession = true) {
  // Test identities must seed Auth session rows with the elevated fixture connection role,
  // then restore the caller's PostgreSQL role so existing RLS assertions remain meaningful.
  const priorRole = (await db.unsafe("select current_setting('role', true) as role"))[0]?.role;
  if (registerSession) {
    await db.unsafe("reset role");
    await db.unsafe(
      "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
      [sessionId, authUserId],
    );
  }
  await db.unsafe("select set_config('request.jwt.claim.sub', $1, false)", [authUserId]);
  // Auth email confirmation stays sourced from auth.users; session_id models the signed JWT claim.
  await db.unsafe("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: authUserId, email, role: "authenticated", session_id: sessionId }),
  ]);
  if (["authenticated", "anon", "service_role"].includes(priorRole)) {
    await db.unsafe("set role " + priorRole);
  }
}

async function expectFailure(label, action, pattern, expectedSqlState) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " should fail");
  if (pattern) assert.match(String(caught.message), pattern, label + " should fail for the expected reason");
  if (expectedSqlState) assert.equal(caught.code, expectedSqlState, label + " should raise SQLSTATE " + expectedSqlState);
  return caught;
}

async function main() {
  await db.unsafe(`
    create extension if not exists pgcrypto;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz
    );
    create table if not exists auth.sessions (
      id uuid primary key,
      user_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      refreshed_at timestamp,
      not_after timestamptz,
      user_agent text,
      ip inet
    );
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid $$;
    create or replace function auth.jwt() returns jsonb
      language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    create schema if not exists storage;
    create table if not exists storage.buckets(
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table if not exists storage.objects(
      id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
      metadata jsonb not null default '{}'::jsonb, unique(bucket_id,name)
    );
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, delete on storage.objects to anon, authenticated;
    grant select on storage.buckets to anon, authenticated;
  `);

  const migrationDir = resolve(process.cwd(), "supabase/migrations");
  const migrations = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.ok(migrations.length >= 7, "expected the original schema and six completion migrations");
  const migrationVersions = migrations.map((name) => name.slice(0, 14));
  assert.ok(migrationVersions.every((version) =>
    version.length === 14 && [...version].every((digit) => digit >= '0' && digit <= '9')),
    "each Supabase migration filename must start with a 14-digit version");
  assert.equal(new Set(migrationVersions).size, migrationVersions.length,
    "Supabase migration version prefixes must be unique; duplicate versions break migration tracking");

  for (const name of migrations) {
    const contents = await readFile(resolve(migrationDir, name), "utf8");
    try {
      await db.unsafe(contents);
    } catch (cause) {
      const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
      const diagnostic = Object.fromEntries(
        ["name", "message", "code", "severity", "detail", "hint", "position", "where", "schema", "table", "column", "constraint", "file", "line", "routine", "stack"]
          .filter((key) => key in error)
          .map((key) => [key, error[key]]),
      );
      process.stderr.write("MIGRATION_FAILED " + name + "\\n");
      process.stderr.write("MIGRATION_DIAGNOSTIC " + JSON.stringify(diagnostic) + "\\n");
      throw cause;
    }
    process.stdout.write("APPLIED " + name + "\n");
  }

  // Product images are public catalog assets, but browser clients must never
  // write directly to Storage. Only the authenticated Edge boundary may use
  // the service-role client after it validates the active staff tenant/product.
  const productImageBucket = await db.unsafe(`
    select id, public, file_size_limit, allowed_mime_types
      from storage.buckets
     where id = 'product-images'
  `);
  assert.equal(productImageBucket.length, 1, "product-image bucket must exist after migrations");
  assert.equal(productImageBucket[0].public, true, "product images remain publicly readable catalog assets");
  assert.equal(Number(productImageBucket[0].file_size_limit), 8 * 1024 * 1024,
    "product-image bucket must enforce the 8 MiB ceiling");
  assert.deepEqual(productImageBucket[0].allowed_mime_types, ["image/webp"],
    "product-image bucket must allow only WebP assets");

  const productImageWritePrivileges = await db.unsafe(`
    select role_name,
           has_table_privilege(role_name, 'storage.objects', 'INSERT') as can_insert,
           has_table_privilege(role_name, 'storage.objects', 'UPDATE') as can_update,
           has_table_privilege(role_name, 'storage.objects', 'DELETE') as can_delete
      from (values ('anon'), ('authenticated')) as roles(role_name)
     order by role_name
  `);
  assert.equal(productImageWritePrivileges.length, 2, "check both anonymous and authenticated browser roles");
  for (const privileges of productImageWritePrivileges) {
    assert.equal(privileges.can_insert, false, privileges.role_name + " must not insert Storage objects directly");
    assert.equal(privileges.can_update, false, privileges.role_name + " must not update Storage objects directly");
    assert.equal(privileges.can_delete, false, privileges.role_name + " must not delete Storage objects directly");
  }

  const productImageWritePolicies = await db.unsafe(`
    select policyname
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname in ('product_images_tenant_insert', 'product_images_tenant_delete')
  `);
  assert.equal(productImageWritePolicies.length, 0,
    "legacy direct-write product-image policies must be removed; upload/delete uses the Edge boundary");
  process.stdout.write("PASS product-image Storage browser write boundary and bucket constraints\n");

  // Isolate quantity-break assertions from the example promotions inserted by
  // the historical baseline migration. Those rows are not the campaign fixture
  // under test and otherwise reduce the tested gross price (sometimes to cost).
  // Dedicated campaign acceptance below creates its own active promotion and
  // verifies discounts, snapshots, and order totals end to end.
  await db.unsafe("update public.promotions set is_active = false");

  const productId = "a1000000-0000-0000-0000-000000000001";
  const organizationId = "a0000000-0000-0000-0000-000000000001";
  const profileId = "f1111111-1111-4111-8111-111111111111";
  const authUserId = "11111111-1111-4111-8111-111111111111";
  const secondProfileId = "f2222222-2222-4222-8222-222222222222";
  const secondAuthUserId = "22222222-2222-4222-8222-222222222222";
  const staffProfileId = "f0000000-0000-0000-0000-000000000001";
  const staffAuthUserId = "33333333-3333-4333-8333-333333333333";
  const otherOrganizationId = "a1111111-1111-4111-8111-111111111111";
  const otherProductId = "a1111111-1111-4111-8111-111111111112";

  await db.unsafe(
    `insert into public.profiles(id,auth_user_id,organization_id,full_name,email)
      values ($1,$2,$3,$4,$5), ($6,$7,$3,$8,$9)
      on conflict (id) do nothing`,
    [profileId, authUserId, organizationId, "CI Customer One", "ci-customer-one@example.test",
      secondProfileId, secondAuthUserId, "CI Customer Two", "ci-customer-two@example.test"],
  );
  await db.unsafe(
    `insert into public.user_roles(profile_id,role)
      values ($1,'customer'),($2,'customer')
      on conflict (profile_id,role) do nothing`,
    [profileId, secondProfileId],
  );
  await db.unsafe(
    `insert into public.customers(
       organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at
     ) values
       ($1,$2,'CI-CUST-01','CI Company One','CI Customer One','7771111111','ci-customer-one@example.test','wholesale',1000000,0,'approved',now()),
       ($1,$3,'CI-CUST-02','CI Company Two','CI Customer Two','7772222222','ci-customer-two@example.test','retail',100000,0,'approved',now())
     on conflict (organization_id,customer_code) do nothing`,
    [organizationId, profileId, secondProfileId],
  );

  // AGH-CUSTOMER-360-001: address ownership, RPC-only mutations and default lifecycle.
  const customerOne = await db.unsafe(
    "select id from public.customers where organization_id=$1 and profile_id=$2",
    [organizationId, profileId],
  );
  assert.equal(customerOne.length,1);
  const customerOneId=customerOne[0].id;
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const first=await db.unsafe(
    "select public.save_customer_address($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::boolean) as id",
    [null,"CI Main Depot","CI Customer One","7771111111","Street 1",null,"Sanaa",null,null,"YE",null,false],
  );
  const firstId=first[0].id;
  const firstRows=await db.unsafe("select id,is_default from public.customer_addresses where id=$1",[firstId]);
  assert.equal(firstRows.length,1,"customer should read its own new address");
  assert.equal(firstRows[0].is_default,true,"first address becomes default even if caller flag is false");

  const second=await db.unsafe(
    "select public.save_customer_address($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::boolean) as id",
    [null,"CI Receiving Dock","CI Customer One","7771111111","Street 2","Back gate","Sanaa",null,null,"YE","Call before arrival",true],
  );
  const secondId=second[0].id;
  const defaults=await db.unsafe("select id from public.customer_addresses where customer_id=$1 and is_default=true",[customerOneId]);
  assert.deepEqual(defaults.map(r=>r.id),[secondId],"setting another default demotes the earlier one");

  await expectFailure("direct customer address INSERT is forbidden",
    ()=>db.unsafe("insert into public.customer_addresses(organization_id,customer_id,label,recipient_name,phone,address_line1,city,country) values($1,$2,'Forged','CI Customer One','7771111111','Injected street','Sanaa','YE')",[organizationId,customerOneId]),
    /permission denied/i);
  await expectFailure("direct customer address UPDATE is forbidden",
    ()=>db.unsafe("update public.customer_addresses set label='Forged' where id=$1",[secondId]),/permission denied/i);

  await db.unsafe("reset role");
  await setIdentity(secondAuthUserId,"ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const crossCustomer=await db.unsafe("select id from public.customer_addresses where id=$1",[secondId]);
  assert.equal(crossCustomer.length,0,"same-organization customers must not see each other's addresses");
  await expectFailure("customer cannot update another customer's address",
    ()=>db.unsafe("select public.save_customer_address($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::boolean)",
      [secondId,"Hijack","CI Customer Two","7772222222","Fake street",null,"Sanaa",null,null,"YE",null,true]),
    /not found|not owned|42501/i);

  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("direct customer address DELETE is forbidden",
    ()=>db.unsafe("delete from public.customer_addresses where id=$1",[secondId]),/permission denied/i);
  const deleted=await db.unsafe("select public.delete_customer_address($1::uuid) as deleted",[secondId]);
  assert.equal(deleted[0].deleted,true);
  const promoted=await db.unsafe("select id,is_default from public.customer_addresses where id=$1",[firstId]);
  assert.equal(promoted.length,1);
  assert.equal(promoted[0].is_default,true,"deleting the default promotes the remaining address");

  await db.unsafe("reset role");
  const audit=await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='customer_address' and entity_id=any($2::uuid[])",[organizationId,[firstId,secondId]]);
  assert.ok(audit.some(r=>r.action==="customer_address.created"));
  assert.ok(audit.some(r=>r.action==="customer_address.deleted"));
  process.stdout.write("PASS customer address book: RLS ownership, RPC-only writes, default promotion, audit trail, cross-customer denial\\n");

  // AGH-CUSTOMER-360-CONTACTS-001: owner-bound company contact CRUD, primary lifecycle and audited changes.
  await db.unsafe("set role authenticated");
  const firstContactResult = await db.unsafe(
    "select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean) as id",
    [null, "CI Purchasing Contact", "Buyer", "Procurement", "7771113333", "buyer@example.test", false],
  );
  const firstContactId = firstContactResult[0].id;
  const firstContact = await db.unsafe("select id,is_primary from public.customer_company_contacts where id=$1", [firstContactId]);
  assert.equal(firstContact.length, 1, "customer can read the company contact created through the RPC");
  assert.equal(firstContact[0].is_primary, true, "the first company contact becomes primary");
  const secondContactResult = await db.unsafe(
    "select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean) as id",
    [null, "CI Accounts Contact", "Accountant", "Finance", "7771114444", "accounts@example.test", false],
  );
  const secondContactId = secondContactResult[0].id;
  const secondContact = await db.unsafe("select id,is_primary from public.customer_company_contacts where id=$1", [secondContactId]);
  assert.equal(secondContact[0].is_primary, false, "a second contact does not replace the primary unless explicitly selected");
  await expectFailure("direct company-contact INSERT is forbidden",
    () => db.unsafe("insert into public.customer_company_contacts(organization_id,customer_id,full_name,phone) values($1,$2,'Forged','7771115555')", [organizationId, customerOneId]),
    /permission denied/i);
  await expectFailure("direct company-contact UPDATE is forbidden",
    () => db.unsafe("update public.customer_company_contacts set full_name='Forged' where id=$1", [secondContactId]),
    /permission denied/i);
  await expectFailure("direct company-contact DELETE is forbidden",
    () => db.unsafe("delete from public.customer_company_contacts where id=$1", [secondContactId]),
    /permission denied/i);
  await expectFailure("invalid company-contact phone is rejected",
    () => db.unsafe("select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean)",
      [null, "Bad Phone Contact", null, null, "123", null, false]),
    /invalid|phone|contact fields/i);
  await db.unsafe("reset role");
  await setIdentity(secondAuthUserId, "ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const foreignContact = await db.unsafe("select id from public.customer_company_contacts where id=$1", [firstContactId]);
  assert.equal(foreignContact.length, 0, "a second customer in the same tenant cannot read another company's contacts");
  await expectFailure("customer cannot edit another company's contact",
    () => db.unsafe("select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean)",
      [firstContactId, "Hijacked Contact", null, null, "7772229999", null, true]),
    /not found|not owned|42501/i);
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await db.unsafe(
    "select public.save_customer_company_contact($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::boolean)",
    [secondContactId, "CI Accounts Contact", "Accountant", "Finance", "7771114444", "accounts@example.test", true],
  );
  const primaryAfterTransfer = await db.unsafe("select id,is_primary from public.customer_company_contacts where customer_id=$1 order by id", [customerOneId]);
  assert.equal(primaryAfterTransfer.filter(row => row.is_primary).length, 1, "exactly one company contact is primary after reassignment");
  assert.equal(primaryAfterTransfer.find(row => row.id === secondContactId).is_primary, true);
  const deletedContact = await db.unsafe("select public.delete_customer_company_contact($1::uuid) as deleted", [secondContactId]);
  assert.equal(deletedContact[0].deleted, true);
  const promotedContact = await db.unsafe("select id,is_primary from public.customer_company_contacts where id=$1", [firstContactId]);
  assert.equal(promotedContact[0].is_primary, true, "deleting the primary promotes the most recently updated remaining contact");
  await db.unsafe("reset role");
  const contactAudit = await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='customer_company_contact' and entity_id=any($2::uuid[])", [organizationId, [firstContactId, secondContactId]]);
  assert.ok(contactAudit.some(row => row.action === "customer_company_contact.created"), "company-contact creation is audited");
  assert.ok(contactAudit.some(row => row.action === "customer_company_contact.updated"), "company-contact update is audited");
  assert.ok(contactAudit.some(row => row.action === "customer_company_contact.deleted"), "company-contact deletion is audited");
  process.stdout.write("PASS customer company contacts: owner-only reads, RPC-only writes, primary lifecycle, audit trail and cross-customer denial\\n");

  await db.unsafe(
    "update public.profiles set auth_user_id=$1 where id=$2 and auth_user_id is null",
    [staffAuthUserId, staffProfileId],
  );
  const operationsStaffProfileId = "f4444444-4444-4444-8444-444444444444";
  const operationsStaffAuthUserId = "44444444-4444-4444-8444-444444444444";
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Operations Staff','ci-operations-staff@example.test',true) on conflict(id) do nothing",
    [operationsStaffProfileId, operationsStaffAuthUserId, organizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'staff') on conflict(profile_id,role) do nothing",
    [operationsStaffProfileId],
  );
  const accountantProfileId = "f5555555-5555-4555-8555-555555555555";
  const accountantAuthUserId = "55555555-5555-4555-8555-555555555555";
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Accountant','ci-accountant@example.test',true) on conflict(id) do nothing",
    [accountantProfileId, accountantAuthUserId, organizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'accountant') on conflict(profile_id,role) do nothing",
    [accountantProfileId],
  );
  await db.unsafe(
    "insert into public.organizations(id,name,currency) values($1,'Foreign organization','YER') on conflict(id) do nothing",
    [otherOrganizationId],
  );
  const foreignProfileId = "a3480c93-5192-42c2-a43a-ccb53ef71fea";
  const foreignAuthUserId = "ff78feae-86d0-4906-aa9d-938c7fc0e6f5";
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'Foreign CI Profile','foreign-ci-profile@example.test',true) on conflict(id) do nothing",
    [foreignProfileId, foreignAuthUserId, otherOrganizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'customer') on conflict(profile_id,role) do nothing",
    [foreignProfileId],
  );
  await db.unsafe(
    `insert into public.products(id,organization_id,name,item_code,unit,base_price,status)
      values($1,$2,'Foreign product','CI-FOREIGN-01','unit',1,'active')
      on conflict(id) do nothing`,
    [otherProductId, otherOrganizationId],
  );

  // Audit history is same-tenant admin/manager read-only for browser sessions.
  const auditOwnId = "e7777777-7777-4777-8777-777777777771";
  const auditForeignId = "e7777777-7777-4777-8777-777777777772";
  await db.unsafe(
    "insert into public.audit_logs(id,organization_id,actor_id,action,entity_type,entity_id) values($1,$2,$3,'ci.audit.scope.test','product',$4),($5,$6,$7,'ci.audit.foreign.test','product',$8)",
    [auditOwnId, organizationId, staffProfileId, productId, auditForeignId, otherOrganizationId, foreignProfileId, otherProductId],
  );
  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select id from public.audit_logs where id=$1", [auditOwnId])).length, 0, "ordinary staff must not read audit events");
  assert.equal((await db.unsafe("select id from public.audit_logs where organization_id=$1", [otherOrganizationId])).length, 0, "ordinary staff must not read foreign-tenant audit events");
  await expectFailure("authenticated staff cannot insert audit events directly", () => db.unsafe("insert into public.audit_logs(organization_id,action) values($1,'forged')", [organizationId]), /permission denied/i);
  await expectFailure("authenticated staff cannot update audit events directly", () => db.unsafe("update public.audit_logs set action='forged' where id=$1", [auditOwnId]), /permission denied/i);
  await expectFailure("authenticated staff cannot delete audit events directly", () => db.unsafe("delete from public.audit_logs where id=$1", [auditOwnId]), /permission denied/i);
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "ci-audit-admin@example.test");
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select id from public.audit_logs where id=$1", [auditOwnId])).length, 1, "same-tenant admin can read audit events");
  assert.equal((await db.unsafe("select id from public.audit_logs where id=$1", [auditForeignId])).length, 0, "admin cannot read foreign-tenant audit events");
  await expectFailure("admin browser sessions cannot modify audit events", () => db.unsafe("update public.audit_logs set action='forged' where id=$1", [auditOwnId]), /permission denied/i);
  await db.unsafe("reset role");
  process.stdout.write("PASS audit log boundary: same-tenant admin read, staff/foreign-tenant denial and append-only writes\\n");

  // The original schema seeded one wholesale price break at 10; migration 600 adds a second break.
  await db.unsafe(
    `insert into public.product_prices(product_id,tier,price,min_quantity,is_active)
      values($1,'wholesale',35000,20,true)`,
    [productId],
  );

  // Public storefront visibility is bound to one configured tenant and cannot expose costs, tiers, or private settings.
  const foreignWarehouseId = "d1111111-1111-4111-8111-111111111111";
  await db.unsafe(
    "insert into public.warehouses(id,organization_id,name,code,is_active) values($1,$2,'Foreign warehouse','CI-WH-FOREIGN',true) on conflict(id) do nothing",
    [foreignWarehouseId, otherOrganizationId],
  );
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved) values($1,$2,777,100) on conflict(product_id,warehouse_id) do nothing",
    [otherProductId, foreignWarehouseId],
  );
  await db.unsafe(
    `insert into public.admin_settings(organization_id,key,value,category)
      values ($1,'hero_title',to_jsonb('CI public hero'::text),'storefront'),
             ($1,'store_name',to_jsonb('CI public store'::text),'storefront'),
             ($1,'internal_provider_secret',to_jsonb('must-not-leak'::text),'ai')
      on conflict (organization_id,key) do update set value=excluded.value`,
    [organizationId],
  );

  await db.unsafe("reset role");
  const expectedRetailPriceRows = await db.unsafe(
    "select public.customer_product_unit_price($1::uuid,$2::uuid,'retail',1) as price",
    [productId, organizationId],
  );
  await db.unsafe("set role anon");
  await expectFailure(
    "anonymous role cannot execute the private staff product-detail RPC",
    () => db.unsafe("select * from public.fetch_staff_products(null::uuid)"),
    /permission denied/i,
  );
  const publicScopeRows = await db.unsafe("select public.get_public_storefront_context() as scope");
  const publicScope = publicScopeRows[0].scope;
  assert.equal(publicScope.organization_id, organizationId, "anonymous storefront scope must come from server-side publication config");
  assert.equal(publicScope.warehouse_id, "d0000000-0000-0000-0000-000000000001", "anonymous storefront must use the configured active warehouse");

  const anonymousUnitPrices = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[productId], 1],
  );
  assert.equal(anonymousUnitPrices.length, 1, "anonymous pricing RPC must return the published active product");
  assert.equal(anonymousUnitPrices[0].product_id, productId);
  assert.equal(Number(anonymousUnitPrices[0].unit_price), Number(expectedRetailPriceRows[0].price),
    "anonymous pricing must resolve retail through the authoritative server resolver");
  assert.deepEqual(Object.keys(anonymousUnitPrices[0]).sort(), ["product_id","unit_price"],
    "public pricing exposes only product id and unit price, never tier metadata");
  const anonymousCrossTenantPrices = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[productId, otherProductId], 1],
  );
  assert.ok(anonymousCrossTenantPrices.every((row) => row.product_id !== otherProductId),
    "anonymous pricing cannot return a foreign-tenant product price");
  await expectFailure(
    "anonymous pricing RPC rejects invalid quantities",
    () => db.unsafe("select * from public.get_storefront_product_prices($1::uuid[],$2::numeric)", [[productId], 0]),
    /quantity/i,
  );

  const publicProducts = await db.unsafe("select id,organization_id,name from public.products order by id");
  assert.ok(publicProducts.some((p) => p.id === productId), "public storefront must read the canonical tenant catalog");
  assert.ok(publicProducts.every((p) => p.organization_id === organizationId), "anonymous catalog cannot read another organization's products");
  await expectFailure(
    "anonymous clients cannot read raw base prices outside the tier-aware pricing RPC",
    () => db.unsafe("select base_price from public.products limit 1"),
    /permission denied/i,
  );
  await expectFailure(
    "anonymous product reads cannot expose purchase cost",
    () => db.unsafe("select cost_price from public.products limit 1"),
    /permission denied/i,
  );
  await expectFailure(
    "anonymous users cannot enumerate customer price tiers",
    () => db.unsafe("select tier,price from public.product_prices limit 1"),
    /permission denied/i,
  );

  const publicInventory = await db.unsafe("select product_id,warehouse_id,quantity_on_hand,quantity_available from public.inventory_balances");
  assert.ok(publicInventory.every((row) => row.warehouse_id === publicScope.warehouse_id), "anonymous stock visibility must be limited to the configured storefront warehouse");
  assert.ok(publicInventory.every((row) => row.product_id !== otherProductId), "anonymous stock queries cannot expose foreign products");
  await expectFailure(
    "anonymous inventory reads cannot expose reservations and reorder thresholds",
    () => db.unsafe("select quantity_reserved,reorder_point from public.inventory_balances limit 1"),
    /permission denied/i,
  );

  const publicSettingsRows = await db.unsafe("select public.get_public_storefront_settings() as settings");
  const publicSettings = publicSettingsRows[0].settings;
  assert.equal(publicSettings.hero_title, "CI public hero", "public storefront settings must include only explicit display keys");
  assert.equal(publicSettings.store_name, "CI public store", "public storefront settings must include whitelisted public branding keys");
  assert.equal(Object.hasOwn(publicSettings, "internal_provider_secret"), false, "public storefront settings must not leak private administration settings");
  await expectFailure(
    "anonymous users cannot query private admin settings directly",
    () => db.unsafe("select value from public.admin_settings limit 1"),
    /permission denied/i,
  );
  await db.unsafe("reset role");

  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");

  await expectFailure(
    "authenticated customers cannot directly read raw product base price",
    () => db.unsafe("select base_price from public.products where id=$1", [productId]),
    /permission denied/i,
  );
  const authenticatedSafeProducts = await db.unsafe(
    "select id,name,item_code from public.products where id=$1",
    [productId],
  );
  assert.equal(authenticatedSafeProducts.length, 1, "authenticated customers retain safe catalog fields");
  await expectFailure(
    "authenticated customers cannot use the staff product-detail RPC",
    () => db.unsafe("select * from public.fetch_staff_products(null::uuid)"),
    /active staff role and organization required|active staff role required/i,
  );
  await expectFailure(
    "authenticated customers cannot use the staff customer 360 RPC",
    () => db.unsafe("select public.get_staff_customer_360($1::uuid)", [customerOneId]),
    /active staff role required|staff role required|صلاحية موظف نشط مطلوبة|صلاحية موظف مخول ماليًا|42501/i,
  );

  // Authenticated customers may submit a cart, but must not enumerate the
  // organization-wide pricing-tier table directly. A denied SELECT or an RLS
  // result with zero visible rows is safe; returning any tier rows is a leak.
  let directTierReadDenied = false;
  let directlyReadableTierRows = [];
  try {
    directlyReadableTierRows = await db.unsafe(
      "select tier,price from public.product_prices where product_id=$1",
      [productId],
    );
  } catch (error) {
    directTierReadDenied = /permission denied/i.test(String(error));
    if (!directTierReadDenied) throw error;
  }
  assert.ok(
    directTierReadDenied || directlyReadableTierRows.length === 0,
    "authenticated customers must not enumerate wholesale/retail tier prices directly",
  );
  await expectFailure(
    "authenticated customers cannot execute the internal unit-price resolver directly",
    () => db.unsafe(
      "select public.customer_product_unit_price($1::uuid,$2::uuid,'wholesale',1) as price",
      [productId, organizationId],
    ),
    /permission denied/i,
  );
  await expectFailure(
    "authenticated customers cannot call the full monetary order preview directly",
    () => db.unsafe(
      "select public.preview_order_pricing($1::jsonb)",
      [db.json([{ product_id: productId, quantity: 1 }])],
    ),
    /permission denied/i,
  );

  const previewInput10 = db.json([{ product_id: productId, quantity: 10 }]);
  const payloadCheck = await db.unsafe(
    "select jsonb_typeof($1::jsonb) as json_type, $1::jsonb as payload",
    [previewInput10],
  );
  process.stdout.write("JSONB PARAMETER CHECK " + JSON.stringify(payloadCheck[0]) + "\\n");
  const preview10 = await db.unsafe(
    "select public.validate_checkout_cart($1::jsonb) as result",
    [previewInput10],
  );
  assert.equal(Number(preview10[0].result.items[0].quantity), 10);
  assert.equal(preview10[0].result.pricing_verified, true);
  assert.ok(!("total_amount" in preview10[0].result), "customer cart validation must not return a total");
  assert.ok(!("unit_price" in preview10[0].result.items[0]), "customer cart validation must not return unit prices");

  const preview20 = await db.unsafe(
    "select public.validate_checkout_cart($1::jsonb) as result",
    [db.json([{ product_id: productId, quantity: 20 }])],
  );
  assert.equal(Number(preview20[0].result.items[0].quantity), 20);
  assert.ok(!("total_amount" in preview20[0].result));

  const wholesaleResolved10 = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[productId], 10],
  );
  const wholesaleResolved20 = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[productId], 20],
  );
  assert.equal(wholesaleResolved10.length, 1);
  assert.equal(Number(wholesaleResolved10[0].unit_price), 37000,
    "approved wholesale customer quantity-10 catalog price must use the wholesale break");
  assert.equal(Number(wholesaleResolved20[0].unit_price), 35000,
    "approved wholesale customer quantity-20 catalog price must use the higher-volume break");
  const customerCrossTenantPrices = await db.unsafe(
    "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
    [[otherProductId], 1],
  );
  assert.equal(customerCrossTenantPrices.length, 0,
    "customer cannot resolve a product price for another organization");

  await expectFailure(
    "cross-tenant cart validation",
    () => db.unsafe("select public.validate_checkout_cart($1::jsonb)", [db.json([{ product_id: otherProductId, quantity: 1 }])]),
    /unavailable|organization/i,
  );

  // Test monetary tier calculation only inside the trusted test role; the customer RPC is non-financial.
  await db.unsafe("reset role");
  const price10 = await db.unsafe("select public.customer_product_unit_price($1::uuid,$2::uuid,'wholesale',10) as price", [productId, organizationId]);
  const price20 = await db.unsafe("select public.customer_product_unit_price($1::uuid,$2::uuid,'wholesale',20) as price", [productId, organizationId]);
  assert.equal(Number(price10[0].price), 37000, "quantity 10 should use the wholesale price break of 37,000");
  assert.equal(Number(price20[0].price), 35000, "quantity 20 should use the more favorable wholesale price break of 35,000");
  await db.unsafe("set role authenticated");

  const itemPayload = [{ product_id: productId, quantity: 10 }];
  const orderArgs = [
    db.json(itemPayload), "CI smoke order", "CI Company One", "CI Customer One",
    "7771111111", "credit", "ci-idempotency-key-000001", firstId,
  ];
  const firstOrder = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid) as result",
    orderArgs,
  );
  const order = firstOrder[0].result;
  assert.equal(order.status, "pending");
  assert.ok(!("total_amount" in order), "customer order response must not disclose monetary values");
  assert.equal(order.idempotent_replay, false);
  // Verify server-computed financial storage as the trusted test owner, not through customer grants.
  await db.unsafe("reset role");
  const persistedOrderAmount = await db.unsafe("select total_amount from public.orders where id=$1", [order.id]);
  assert.equal(Number(persistedOrderAmount[0].total_amount), 370000, "server order total must match tier pricing");
  const persistedDelivery = await db.unsafe("select delivery_address_id,delivery_address_snapshot,delivery_address_fingerprint from public.orders where id=$1", [order.id]);
  assert.equal(persistedDelivery[0].delivery_address_id, firstId, "the selected own address ID must be retained for dispatch linkage");
  assert.equal(Object.hasOwn(persistedDelivery[0].delivery_address_snapshot, "source_address_id"), false, "the customer-visible snapshot must not expose the internal address record ID");
  assert.equal(persistedDelivery[0].delivery_address_snapshot.address_line1, "Street 1", "the order must snapshot the actual selected destination");
  const createdEvents = await db.unsafe("select id,event_type,payload from public.outbox_events where organization_id=$1 and event_type='OrderCreated' and aggregate_id=$2", [organizationId, order.id]);
  assert.equal(createdEvents.length, 1, "order creation and its outbox event must commit exactly once");
  assert.equal(createdEvents[0].payload.delivery_address_snapshot.city, "Sanaa", "the transactional event must include the frozen destination");

  // AGH-ASYNC-OUTBOX-001: lease, deliver and prove replay idempotency on isolated PostgreSQL.
  const eventId = createdEvents[0].id;
  const workerId = "ci-outbox-worker-order";
  const beforeOrderNotifications = await db.unsafe(
    "select count(*)::int as count from public.notifications where organization_id=$1 and title='طلب جديد' and body like $2",
    [organizationId, "%" + createdEvents[0].payload.order_number + "%"],
  );
  const claimedOrder = await db.unsafe(
    "select id,status,attempts,locked_by from public.claim_outbox_events($1::text,$2::integer,$3::integer,$4::uuid)",
    [workerId, 1, 300, eventId],
  );
  assert.equal(claimedOrder.length, 1, "outbox worker must claim the targeted committed order event");
  assert.equal(claimedOrder[0].status, "processing");
  assert.equal(claimedOrder[0].attempts, 1, "claim increments attempt count atomically");
  assert.equal(claimedOrder[0].locked_by, workerId);
  const processedOrder = await db.unsafe(
    "select public.process_outbox_event($1::uuid,$2::text) as result",
    [eventId, workerId],
  );
  assert.equal(processedOrder[0].result.status, "processed");
  assert.ok(processedOrder[0].result.notifications_created >= 1,
    "OrderCreated must emit an in-app notification to active organization staff");
  const deliveredEvent = await db.unsafe(
    "select status,processed_at,locked_by from public.outbox_events where id=$1",
    [eventId],
  );
  assert.equal(deliveredEvent[0].status, "processed");
  assert.ok(deliveredEvent[0].processed_at);
  assert.equal(deliveredEvent[0].locked_by, null);
  const deliveryRows = await db.unsafe(
    "select event_id,consumer_key,result from public.outbox_event_deliveries where event_id=$1",
    [eventId],
  );
  assert.equal(deliveryRows.length, 1, "one event can commit one delivery record per consumer");
  assert.equal(deliveryRows[0].consumer_key, "in_app_order_created");
  const replayedOrder = await db.unsafe(
    "select public.process_outbox_event($1::uuid,$2::text) as result",
    [eventId, workerId],
  );
  assert.equal(replayedOrder[0].result.status, "already_processed");
  const afterOrderNotifications = await db.unsafe(
    "select count(*)::int as count from public.notifications where organization_id=$1 and title='طلب جديد' and body like $2",
    [organizationId, "%" + createdEvents[0].payload.order_number + "%"],
  );
  assert.equal(afterOrderNotifications[0].count, beforeOrderNotifications[0].count + processedOrder[0].result.notifications_created,
    "replaying the same event cannot duplicate staff notifications");

  const retryEventRows = await db.unsafe(
    "insert into public.outbox_events(organization_id,event_type,payload,idempotency_key,status,attempts,next_attempt_at) values($1,'CIUnsupportedEvent','{}'::jsonb,'ci-outbox-reclaim-retry','pending',0,now()) returning id",
    [organizationId],
  );
  const retryEventId = retryEventRows[0].id;
  const firstLease = await db.unsafe(
    "select id,status,attempts,locked_by from public.claim_outbox_events($1::text,$2::integer,$3::integer,$4::uuid)",
    ["ci-outbox-worker-crash", 1, 300, retryEventId],
  );
  assert.equal(firstLease.length, 1);
  assert.equal(firstLease[0].attempts, 1);
  await db.unsafe("update public.outbox_events set locked_at=now()-interval '10 minutes' where id=$1", [retryEventId]);
  const reclaimedLease = await db.unsafe(
    "select id,status,attempts,locked_by from public.claim_outbox_events($1::text,$2::integer,$3::integer,$4::uuid)",
    ["ci-outbox-worker-recovery", 1, 300, retryEventId],
  );
  assert.equal(reclaimedLease.length, 1, "an expired processing lease must be reclaimable after worker crash");
  assert.equal(reclaimedLease[0].attempts, 2);
  assert.equal(reclaimedLease[0].locked_by, "ci-outbox-worker-recovery");
  await expectFailure(
    "outbox worker refuses an unregistered event consumer",
    () => db.unsafe("select public.process_outbox_event($1::uuid,$2::text)", [retryEventId, "ci-outbox-worker-recovery"]),
    /unsupported outbox event type/i,
  );
  const retryResult = await db.unsafe(
    "select public.fail_outbox_event($1::uuid,$2::text,$3::text,$4::text) as result",
    [retryEventId, "ci-outbox-worker-recovery", "unsupported_event", "No handler registered for CIUnsupportedEvent"],
  );
  assert.equal(retryResult[0].result.status, "retry");
  assert.equal(retryResult[0].result.attempts, 2);
  const retryState = await db.unsafe("select status,next_attempt_at,locked_by,last_error from public.outbox_events where id=$1", [retryEventId]);
  assert.equal(retryState[0].status, "retry");
  assert.ok(new Date(retryState[0].next_attempt_at).getTime() > Date.now(), "retry uses delayed backoff");
  assert.equal(retryState[0].locked_by, null);
  assert.equal(retryState[0].last_error.error_class, "unsupported_event");

  const poisonRows = await db.unsafe(
    "insert into public.outbox_events(organization_id,event_type,payload,idempotency_key,status,attempts,next_attempt_at) values($1,'CIUnsupportedPoisonEvent','{}'::jsonb,'ci-outbox-poison','pending',7,now()) returning id",
    [organizationId],
  );
  const poisonId = poisonRows[0].id;
  const poisonClaim = await db.unsafe(
    "select id,attempts,locked_by from public.claim_outbox_events($1::text,$2::integer,$3::integer,$4::uuid)",
    ["ci-outbox-worker-poison", 1, 300, poisonId],
  );
  assert.equal(poisonClaim.length, 1);
  assert.equal(poisonClaim[0].attempts, 8);
  const deadLetterResult = await db.unsafe(
    "select public.fail_outbox_event($1::uuid,$2::text,$3::text,$4::text) as result",
    [poisonId, "ci-outbox-worker-poison", "poison_test", "poison test reached max attempts"],
  );
  assert.equal(deadLetterResult[0].result.status, "dead_letter", "max-attempt events go to a dead-letter state");
  const deadLetterState = await db.unsafe(
    "select status,dead_letter_at,locked_by from public.outbox_events where id=$1",
    [poisonId],
  );
  assert.equal(deadLetterState[0].status, "dead_letter");
  assert.ok(deadLetterState[0].dead_letter_at);
  assert.equal(deadLetterState[0].locked_by, null);
  await db.unsafe("set role authenticated");

  await expectFailure(
    "customer cannot claim internal outbox events",
    () => db.unsafe("select * from public.claim_outbox_events('untrusted',1,300,null)"),
    /permission denied/i,
  );
  await expectFailure(
    "customer cannot read internal outbox delivery receipts",
    () => db.unsafe("select * from public.outbox_event_deliveries limit 1"),
    /permission denied/i,
  );

  const customerSafeOrder = await db.unsafe(
    "select id,order_number,status,total_items,created_at,quantity_review_required,customer_adjustment_note,customer_payment_requested_at,payment_request_status,delivery_address_snapshot from public.orders where id=$1",
    [order.id],
  );
  assert.equal(customerSafeOrder.length, 1, "customer may read safe order status fields");
  assert.equal(customerSafeOrder[0].delivery_address_snapshot.address_line1, "Street 1", "customer sees only the safe address snapshot fields through its own order row");
  await expectFailure("customer cannot read the internal address relation or idempotency fingerprint",
    () => db.unsafe("select delivery_address_id,delivery_address_fingerprint from public.orders where id=$1", [order.id]),
    /permission denied/i);
  await expectFailure(
    "customer direct order total access",
    () => db.unsafe("select total_amount from public.orders where id=$1", [order.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer SELECT * on orders",
    () => db.unsafe("select * from public.orders where id=$1", [order.id]),
    /permission denied/i,
  );

  const customerSafeItems = await db.unsafe(
    "select id,order_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity from public.order_items where order_id=$1",
    [order.id],
  );
  assert.equal(customerSafeItems.length, 1, "customer may read safe order-line fields");
  assert.equal(Number(customerSafeItems[0].quantity), 10);
  for (const column of ["unit_price_snapshot","line_total","approved_unit_price","proposed_unit_price"]) {
    await expectFailure(
      "customer direct order-line access to " + column,
      () => db.unsafe("select " + column + " from public.order_items where order_id=$1", [order.id]),
      /permission denied/i,
    );
  }
  await expectFailure(
    "customer SELECT * on order_items",
    () => db.unsafe("select * from public.order_items where order_id=$1", [order.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer cannot call staff order RPC",
    () => db.unsafe("select * from public.fetch_staff_orders()"),
    /staff role required/i,
  );
  await expectFailure(
    "customer cannot call staff order-line RPC",
    () => db.unsafe("select * from public.fetch_staff_order_items($1::uuid)", [order.id]),
    /staff role required/i,
  );

  const replay = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid) as result",
    orderArgs,
  );
  assert.equal(replay[0].result.id, order.id, "same idempotency key and payload must return the original order");
  assert.equal(replay[0].result.idempotent_replay, true);
  await expectFailure(
    "idempotency payload mismatch",
    () => db.unsafe(
      "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid)",
      [db.json([{ product_id: productId, quantity: 11 }]), ...orderArgs.slice(1)],
    ),
    /different|مختلفة/i,
  );
  await db.unsafe("reset role");
  const orderCount = await db.unsafe(
    "select count(*)::int as count from public.orders where created_by=$1 and idempotency_key=$2",
    [profileId, "ci-idempotency-key-000001"],
  );
  assert.equal(orderCount[0].count, 1, "a replay must not create a duplicate order");

  // DLV-004: quantity minimums and pack multiples are enforced on the server, and
  // rejected checkout attempts cannot create orders, outbox events or stock effects.
  const quantityPolicyBeforeRows=await db.unsafe(
    "select min_order_quantity,order_quantity_multiple from public.products where id=$1::uuid and organization_id=$2::uuid",
    [productId,organizationId],
  );
  assert.equal(quantityPolicyBeforeRows.length,1,"quantity-policy fixture must resolve inside the current organization");
  const quantityPolicyBefore=quantityPolicyBeforeRows[0];
  const quantityPolicyKeys=[randomUUID(),randomUUID()];
  const quantityPolicyStockBeforeRows=await db.unsafe(
    "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances " +
      "where product_id=$1::uuid and warehouse_id='d0000000-0000-0000-0000-000000000001'",
    [productId],
  );
  let quantityPolicyStockBefore=quantityPolicyStockBeforeRows[0];
  try {
    await db.unsafe(
      "update public.products set min_order_quantity=2,order_quantity_multiple=3 where id=$1::uuid and organization_id=$2::uuid",
      [productId,organizationId],
    );
    await setIdentity(authUserId,"ci-customer-one@example.test");
    await db.unsafe("set role authenticated");
    await expectFailure(
      "customer checkout rejects quantity below the server-owned minimum",
      ()=>db.unsafe(
        "select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid)",
        [db.json([{product_id:productId,quantity:1}]),"CI MOQ below minimum","CI Company One","CI Customer One",
          "7771111111","cash_on_delivery",quantityPolicyKeys[0],firstId],
      ),
      /الكمية لا تطابق الحد الأدنى أو مضاعف الطلب للصنف/i,
    );
    await expectFailure(
      "customer checkout rejects quantity that violates the configured pack multiple",
      ()=>db.unsafe(
        "select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid)",
        [db.json([{product_id:productId,quantity:4}]),"CI MOQ invalid multiple","CI Company One","CI Customer One",
          "7771111111","cash_on_delivery",quantityPolicyKeys[1],firstId],
      ),
      /الكمية لا تطابق الحد الأدنى أو مضاعف الطلب للصنف/i,
    );
    await db.unsafe("reset role");
    const rejectedPolicyOrders=await db.unsafe(
      "select id,idempotency_key from public.orders where created_by=$1::uuid and idempotency_key=any($2::text[])",
      [profileId,quantityPolicyKeys],
    );
    assert.equal(rejectedPolicyOrders.length,0,"invalid quantity attempts leave no persisted order/idempotency row");
    const quantityPolicyStockAfterRows=await db.unsafe(
      "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances " +
        "where product_id=$1::uuid and warehouse_id='d0000000-0000-0000-0000-000000000001'",
      [productId],
    );
    assert.equal(Number(quantityPolicyStockAfterRows[0].quantity_on_hand),Number(quantityPolicyStockBefore.quantity_on_hand),
      "rejected quantity attempts preserve on-hand inventory");
    assert.equal(Number(quantityPolicyStockAfterRows[0].quantity_reserved),Number(quantityPolicyStockBefore.quantity_reserved),
      "rejected quantity attempts preserve reservations");
    assert.equal(Number(quantityPolicyStockAfterRows[0].quantity_available),Number(quantityPolicyStockBefore.quantity_available),
      "rejected quantity attempts preserve available-to-promise stock");
  } finally {
    await db.unsafe("reset role").catch(()=>{});
    await db.unsafe(
      "update public.products set min_order_quantity=$3::integer,order_quantity_multiple=$4::integer " +
        "where id=$1::uuid and organization_id=$2::uuid",
      [productId,organizationId,quantityPolicyBefore.min_order_quantity,quantityPolicyBefore.order_quantity_multiple],
    );
  }
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS DLV-004 customer checkout enforces server-side minimum/pack multiples and rejects invalid quantities without order or stock side effects\\n");
  await db.unsafe("set role authenticated");
  await db.unsafe("reset role");
  await db.unsafe("update public.customer_addresses set address_line1='Street changed after order' where id=$1", [firstId]);
  const frozenAfterEdit = await db.unsafe("select delivery_address_snapshot from public.orders where id=$1", [order.id]);
  assert.equal(frozenAfterEdit[0].delivery_address_snapshot.address_line1, "Street 1", "later edits to the address book must not rewrite a historical order snapshot");
  const outboxAfterReplay = await db.unsafe("select count(*)::int as count from public.outbox_events where organization_id=$1 and event_type='OrderCreated' and aggregate_id=$2", [organizationId, order.id]);
  assert.equal(outboxAfterReplay[0].count, 1, "idempotent retry must not duplicate OrderCreated events");
  await db.unsafe("set role authenticated");
  await expectFailure("same idempotency key cannot silently rebind a changed delivery address",
    () => db.unsafe("select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid)", orderArgs),
    /عنوان التوصيل|delivery address|different/i);

  const firstQuote = await db.unsafe(
    "select public.request_sales_quote($1::jsonb,$2) as id",
    [db.json([{ product_id: productId, quantity: 2 }]), "CI quotation"],
  );
  const firstQuoteId = firstQuote[0].id;
  const firstQuoteItems = await db.unsafe(
    "select id from public.sales_quote_items where quote_id=$1",
    [firstQuoteId],
  );
  assert.equal(firstQuoteItems.length, 1, "RFQ should create a persisted quote line");

  await db.unsafe("reset role");
  await setIdentity(secondAuthUserId, "ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const secondIdentityQuote = await db.unsafe(
    "select public.request_sales_quote($1::jsonb,$2) as id",
    [db.json([{ product_id: productId, quantity: 1 }]), "CI second customer RFQ"],
  );
  const secondQuoteId = secondIdentityQuote[0].id;
  const secondVisible = await db.unsafe("select id from public.sales_quotes");
  assert.ok(secondVisible.some((row) => row.id === secondQuoteId), "customer two must see their own quote");
  assert.ok(!secondVisible.some((row) => row.id === firstQuoteId), "customer two must not see customer one's quote");

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");


  // AGH-CUSTOMER-LIFECYCLE-001: execute real customer tier/status RPCs against PostgreSQL.
  // These fixtures are resettable and isolated by stable CI-only customer codes.
  await db.unsafe("reset role");
  const lifecycleFixtureSpecs = [
    { key: "restoreApproved", code: "CI-LC-RESTORE-APPROVED", status: "pending" },
    { key: "pendingReject", code: "CI-LC-PENDING-REJECT", status: "pending" },
    { key: "pendingBlock", code: "CI-LC-PENDING-BLOCK", status: "pending" },
    { key: "pendingArchive", code: "CI-LC-PENDING-ARCHIVE", status: "pending" },
    { key: "approvedFreeze", code: "CI-LC-APPROVED-FREEZE", status: "approved" },
    { key: "approvedBlock", code: "CI-LC-APPROVED-BLOCK", status: "approved" },
    { key: "rejectedApprove", code: "CI-LC-REJECTED-APPROVE", status: "rejected" },
    { key: "rejectedBlock", code: "CI-LC-REJECTED-BLOCK", status: "rejected" },
    { key: "rejectedArchive", code: "CI-LC-REJECTED-ARCHIVE", status: "rejected" },
    { key: "frozenApprove", code: "CI-LC-FROZEN-APPROVE", status: "frozen" },
    { key: "frozenBlock", code: "CI-LC-FROZEN-BLOCK", status: "frozen" },
    { key: "frozenArchive", code: "CI-LC-FROZEN-ARCHIVE", status: "frozen" },
    { key: "blockedApprove", code: "CI-LC-BLOCKED-APPROVE", status: "blocked" },
    { key: "blockedArchive", code: "CI-LC-BLOCKED-ARCHIVE", status: "blocked" },
    { key: "noHistory", code: "CI-LC-NO-ARCHIVE-HISTORY", status: "archived" },
    { key: "otherCustomerArchive", code: "CI-LC-OTHER-CUSTOMER-ARCHIVE", status: "archived" },
    { key: "foreignHistory", code: "CI-LC-FOREIGN-ARCHIVE-HISTORY", status: "archived" },
    { key: "tierCommand", code: "CI-TIER-COMMAND-01", status: "approved" },
    { key: "foreignLifecycle", code: "CI-LC-FOREIGN-01", status: "pending", foreign: true },
    { key: "foreignTier", code: "CI-TIER-FOREIGN-01", status: "approved", foreign: true },
  ];
  const lifecycleIds = {};
  for (let index = 0; index < lifecycleFixtureSpecs.length; index += 1) {
    const fixture = lifecycleFixtureSpecs[index];
    const fixtureOrganizationId = fixture.foreign ? otherOrganizationId : organizationId;
    const tier = "retail";
    const approvedAt = ["approved", "frozen", "blocked"].includes(fixture.status)
      ? "2026-10-01T10:00:00Z"
      : null;
    const rows = await db.unsafe(
      "insert into public.customers(organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at) " +
      "values($1,null,$2,$3,$4,$5,$6,$7,0,0,$8,$9::timestamptz) " +
      "on conflict (organization_id,customer_code) do update set profile_id=null,business_name=excluded.business_name," +
      "contact_name=excluded.contact_name,phone=excluded.phone,email=excluded.email,tier=excluded.tier,status=excluded.status," +
      "approved_at=excluded.approved_at,updated_at=pg_catalog.now() returning id",
      [fixtureOrganizationId, fixture.code, "CI Lifecycle " + fixture.key, "CI Lifecycle Contact",
        "777" + String(9000000 + index), fixture.code.toLowerCase() + "@example.test", tier, fixture.status, approvedAt],
    );
    lifecycleIds[fixture.key] = rows[0].id;
  }

  // Snapshot both cross-tenant command targets before invoking either RPC as the tenant admin.
  // Compare the complete relevant row after both denials so a rejected request cannot silently mutate it.
  const foreignCustomerIds = [lifecycleIds.foreignLifecycle, lifecycleIds.foreignTier];
  const foreignRowsBefore = await db.unsafe(
    "select id::text as id, organization_id::text as organization_id, status, tier, " +
    "approved_at::text as approved_at, updated_at::text as updated_at " +
    "from public.customers where id = any($1::uuid[]) order by id",
    [foreignCustomerIds],
  );
  assert.equal(foreignRowsBefore.length, 2, "fixture setup must include both foreign-tenant target rows");

  await db.unsafe(
    "delete from public.audit_logs where entity_type='customer' and entity_id=any($1::uuid[]) " +
    "and action in ('customer.status_changed','customer.tier_changed')",
    [Object.values(lifecycleIds)],
  );

  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const customerLifecycleCommand = async (customerId, expectedStatus, nextStatus, reason) =>
    (await db.unsafe(
      "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) as result",
      [customerId, expectedStatus, nextStatus, reason],
    ))[0].result;
  const assertLifecycleTransition = async (fixtureKey, from, to, reason) => {
    const result = await customerLifecycleCommand(lifecycleIds[fixtureKey], from, to, reason);
    assert.equal(result.customer_id, lifecycleIds[fixtureKey], "lifecycle command must return the requested customer");
    assert.equal(result.previous_status, from, "lifecycle command must return the locked previous status");
    assert.equal(result.status, to, "lifecycle command must apply the requested legal status");
    assert.equal(result.changed, true, "legal status transition must acknowledge a mutation");
    return result;
  };

  await expectFailure(
    "customer lifecycle requires a non-empty reason",
    () => customerLifecycleCommand(lifecycleIds.restoreApproved, "pending", "approved", ""),
    /reason must contain between 3 and 500 characters/i,
  );
  await assertLifecycleTransition("restoreApproved", "pending", "approved", "CI lifecycle initial approval");
  const approvedAtFirst = (await db.unsafe(
    "select approved_at::text as approved_at from public.customers where id=$1", [lifecycleIds.restoreApproved],
  ))[0].approved_at;
  assert.ok(approvedAtFirst, "approval must stamp approved_at");

  await assertLifecycleTransition("restoreApproved", "approved", "frozen", "CI freeze timestamp preservation");
  const approvedAtAfterFreeze = (await db.unsafe(
    "select approved_at::text as approved_at from public.customers where id=$1", [lifecycleIds.restoreApproved],
  ))[0].approved_at;
  assert.equal(approvedAtAfterFreeze, approvedAtFirst, "freezing must preserve the existing approval timestamp");

  await assertLifecycleTransition("restoreApproved", "frozen", "approved", "CI new approval cycle");
  const approvedAtBeforeArchive = (await db.unsafe(
    "select approved_at::text as approved_at from public.customers where id=$1", [lifecycleIds.restoreApproved],
  ))[0].approved_at;
  await assertLifecycleTransition("restoreApproved", "approved", "archived", "CI archive previously approved customer");
  const approvedAtWhileArchived = (await db.unsafe(
    "select approved_at::text as approved_at from public.customers where id=$1", [lifecycleIds.restoreApproved],
  ))[0].approved_at;
  assert.equal(approvedAtWhileArchived, approvedAtBeforeArchive, "archiving must preserve the approval timestamp");
  const restoredApproved = await customerLifecycleCommand(
    lifecycleIds.restoreApproved, "archived", "restore", "CI restore previously approved customer",
  );
  assert.equal(restoredApproved.previous_status, "archived");
  assert.equal(restoredApproved.status, "approved", "archive restoration must recover the last valid status from this customer's audit trail");
  assert.equal(restoredApproved.changed, true);
  const approvedAtAfterRestore = (await db.unsafe(
    "select approved_at::text as approved_at from public.customers where id=$1", [lifecycleIds.restoreApproved],
  ))[0].approved_at;
  assert.equal(approvedAtAfterRestore, approvedAtBeforeArchive, "restoring an approved customer must not falsify the previous approval timestamp");

  // Exercise every non-restore transition represented in the PostgreSQL transition matrix.
  for (const [key, from, to] of [
    ["pendingReject", "pending", "rejected"],
    ["pendingBlock", "pending", "blocked"],
    ["pendingArchive", "pending", "archived"],
    ["approvedFreeze", "approved", "frozen"],
    ["approvedBlock", "approved", "blocked"],
    ["rejectedApprove", "rejected", "approved"],
    ["rejectedBlock", "rejected", "blocked"],
    ["rejectedArchive", "rejected", "archived"],
    ["frozenApprove", "frozen", "approved"],
    ["frozenBlock", "frozen", "blocked"],
    ["frozenArchive", "frozen", "archived"],
    ["blockedApprove", "blocked", "approved"],
    ["blockedArchive", "blocked", "archived"],
  ]) {
    await assertLifecycleTransition(key, from, to, "CI transition matrix " + from + " to " + to);
  }
  const restoredPending = await customerLifecycleCommand(
    lifecycleIds.pendingArchive, "archived", "restore", "CI restore pending customer",
  );
  assert.equal(restoredPending.status, "pending", "restoring an archived pending customer must preserve pending status");

  // Audit rows are seeded by the privileged test connection, then all RPC assertions run as authenticated.
  await db.unsafe("reset role");
  // Restoration must not borrow an otherwise valid archive record from another customer or tenant.
  await db.unsafe(
    "insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value) " +
    "values($1,$2,'customer.status_changed','customer',$3,$4::jsonb,$5::jsonb)",
    [organizationId, staffProfileId, lifecycleIds.otherCustomerArchive,
      db.json({ status: "frozen" }), db.json({ status: "archived", reason: "CI unrelated customer audit fixture" })],
  );
  await db.unsafe(
    "insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value) " +
    "values($1,$2,'customer.status_changed','customer',$3,$4::jsonb,$5::jsonb)",
    [otherOrganizationId, foreignProfileId, lifecycleIds.foreignHistory,
      db.json({ status: "rejected" }), db.json({ status: "archived", reason: "CI foreign tenant audit fixture" })],
  );
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "archived customer without its own valid archive audit cannot be restored",
    () => customerLifecycleCommand(lifecycleIds.noHistory, "archived", "restore", "CI missing history restore"),
    /previous customer status is unavailable; cannot restore safely/i,
  );

  await expectFailure(
    "archived customer cannot be restored from another tenant's audit history",
    () => customerLifecycleCommand(lifecycleIds.foreignHistory, "archived", "restore", "CI foreign audit must be ignored"),
    /previous customer status is unavailable; cannot restore safely/i,
  );
  await expectFailure(
    "stale customer status is rejected instead of overwriting a newer change",
    () => customerLifecycleCommand(lifecycleIds.restoreApproved, "pending", "frozen", "CI stale status"),
    /customer status changed since directory loaded/i,
  );
  await expectFailure(
    "illegal customer lifecycle transition is rejected",
    () => customerLifecycleCommand(lifecycleIds.restoreApproved, "approved", "rejected", "CI illegal transition"),
    /invalid customer status transition/i,
  );
  await expectFailure(
    "customer lifecycle RPC cannot target another organization",
    () => customerLifecycleCommand(lifecycleIds.foreignLifecycle, "pending", "approved", "CI foreign tenant"),
    /customer not found in current organization/i,
    "42501",
  );

  const tierChange = (await db.unsafe(
    "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) as result",
    [lifecycleIds.tierCommand, "retail", "wholesale", "CI governed tier change"],
  ))[0].result;
  assert.equal(tierChange.customer_id, lifecycleIds.tierCommand);
  assert.equal(tierChange.previous_tier, "retail");
  assert.equal(tierChange.tier, "wholesale");
  assert.equal(tierChange.changed, true);
  const tierState = (await db.unsafe(
    "select tier from public.customers where id=$1", [lifecycleIds.tierCommand],
  ))[0];
  assert.equal(tierState.tier, "wholesale", "tier command must persist the server-confirmed value");
  await expectFailure(
    "stale customer tier is rejected instead of overwriting a newer change",
    () => db.unsafe("select public.set_admin_customer_tier($1::uuid,'retail','vip','CI stale tier')", [lifecycleIds.tierCommand]),
    /customer tier changed since the directory loaded/i,
  );
  await expectFailure(
    "unsupported customer tier is rejected by PostgreSQL",
    () => db.unsafe("select public.set_admin_customer_tier($1::uuid,'wholesale','discount','CI invalid tier')", [lifecycleIds.tierCommand]),
    /tier must be one of retail, wholesale, or vip/i,
  );
  await expectFailure(
    "customer tier command requires a valid reason",
    () => db.unsafe("select public.set_admin_customer_tier($1::uuid,'wholesale','vip','')", [lifecycleIds.tierCommand]),
    /reason must contain between 3 and 500 characters/i,
  );
  await expectFailure(
    "customer tier RPC cannot target another organization",
    () => db.unsafe("select public.set_admin_customer_tier($1::uuid,'retail','wholesale','CI foreign tier')", [lifecycleIds.foreignTier]),
    /customer not found in current organization/i,
    "42501",
  );

  await db.unsafe("reset role");

  const foreignRowsAfter = await db.unsafe(
    "select id::text as id, organization_id::text as organization_id, status, tier, " +
    "approved_at::text as approved_at, updated_at::text as updated_at " +
    "from public.customers where id = any($1::uuid[]) order by id",
    [foreignCustomerIds],
  );
  assert.deepEqual(
    foreignRowsAfter,
    foreignRowsBefore,
    "cross-tenant tier/status denials must leave foreign customer rows unchanged, including status, tier, approved_at and updated_at",
  );
  const foreignMutationAudits = await db.unsafe(
    "select count(*)::int as count from public.audit_logs " +
    "where entity_type='customer' and entity_id=any($1::uuid[]) " +
    "and action in ('customer.status_changed','customer.tier_changed')",
    [foreignCustomerIds],
  );
  assert.equal(
    foreignMutationAudits[0].count,
    0,
    "cross-tenant tier/status denials must not write mutation audit rows for foreign customers",
  );

  const lifecycleAuditRows = await db.unsafe(
    "select organization_id,actor_id,old_value,new_value from public.audit_logs " +
    "where organization_id=$1 and entity_type='customer' and entity_id=$2 and action='customer.status_changed' " +
    "order by created_at asc",
    [organizationId, lifecycleIds.restoreApproved],
  );
  assert.equal(lifecycleAuditRows.length, 5, "each main customer lifecycle transition must produce one audit row");
  assert.ok(lifecycleAuditRows.every((row) => row.actor_id === staffProfileId), "lifecycle audit must identify the active admin");
  assert.ok(lifecycleAuditRows.every((row) => row.organization_id === organizationId), "lifecycle audit must remain in the customer's organization");
  const initialApprovalAudit = lifecycleAuditRows.find((row) =>
    row.old_value?.status === "pending" && row.new_value?.status === "approved" &&
    row.new_value?.reason === "CI lifecycle initial approval");
  assert.ok(initialApprovalAudit, "approval audit must contain the previous/new status and reason");
  const restoreAudit = lifecycleAuditRows.find((row) =>
    row.new_value?.restored_from_archive === true &&
    row.new_value?.reason === "CI restore previously approved customer");
  assert.equal(restoreAudit?.old_value?.status, "archived");
  assert.equal(restoreAudit?.new_value?.status, "approved");
  const tierAuditRows = await db.unsafe(
    "select organization_id,actor_id,old_value,new_value from public.audit_logs " +
    "where organization_id=$1 and entity_type='customer' and entity_id=$2 and action='customer.tier_changed'",
    [organizationId, lifecycleIds.tierCommand],
  );
  assert.equal(tierAuditRows.length, 1, "customer tier change must produce one audit row");
  assert.equal(tierAuditRows[0].actor_id, staffProfileId);
  assert.equal(tierAuditRows[0].old_value?.tier, "retail");
  assert.equal(tierAuditRows[0].new_value?.tier, "wholesale");
  assert.equal(tierAuditRows[0].new_value?.reason, "CI governed tier change");

  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "authenticated admin cannot bypass the lifecycle RPC with a direct status update",
    () => db.unsafe("update public.customers set status='frozen' where id=$1", [lifecycleIds.restoreApproved]),
    /permission denied/i,
  );
  await expectFailure(
    "authenticated admin cannot bypass the tier RPC with a direct tier update",
    () => db.unsafe("update public.customers set tier='vip' where id=$1", [lifecycleIds.tierCommand]),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary staff cannot change customer lifecycle",
    () => customerLifecycleCommand(lifecycleIds.pendingReject, "rejected", "blocked", "CI staff must be denied"),
    /active customer-management permission required/i,
  );
  await expectFailure(
    "ordinary staff cannot change customer tier",
    () => db.unsafe("select public.set_admin_customer_tier($1::uuid,'wholesale','vip','CI staff must be denied')", [lifecycleIds.tierCommand]),
    /active customer-management permission required/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS customer tier/lifecycle PostgreSQL commands: complete transition matrix, tenant/role/RPC-only guards, optimistic concurrency, reason validation, restore integrity, approved_at preservation and audit evidence\n");

  const scopeRows = await db.unsafe("select public.get_current_tenant_context() as scope");
  const scope = scopeRows[0].scope;
  assert.equal(scope.profile_id, staffProfileId, "tenant context must resolve the authenticated profile on the server");
  assert.equal(scope.organization_id, organizationId, "tenant context must resolve the profile's organization on the server");
  assert.equal(scope.is_staff, true, "tenant context must derive the staff role from database role assignments");
  if (scope.warehouse_id) {
    const scopedWarehouse = await db.unsafe(
      "select id from public.warehouses where id=$1 and organization_id=$2",
      [scope.warehouse_id, organizationId],
    );
    assert.equal(scopedWarehouse.length, 1, "default warehouse must belong to the authenticated organization");
  }

  const foreignProductsVisible = await db.unsafe(
    "select id from public.products where id=$1",
    [otherProductId],
  );
  assert.equal(foreignProductsVisible.length, 0, "staff must not read another organization's products even when legacy permissive policies exist");
  const foreignCustomersVisible = await db.unsafe(
    "select id from public.customers where organization_id=$1",
    [otherOrganizationId],
  );
  assert.equal(foreignCustomersVisible.length, 0, "staff must not read another organization's customers");

  const foreignOrganizationsVisible = await db.unsafe(
    "select id from public.organizations where id=$1",
    [otherOrganizationId],
  );
  assert.equal(foreignOrganizationsVisible.length, 0, "staff must not read another organization row even though its tenant key is the primary id");
  await expectFailure(
    "staff cannot create another organization's tenant row",
    () => db.unsafe(
      "insert into public.organizations(id,name,currency) values($1,'Unauthorized organization','YER')",
      ["a1111111-1111-4111-8111-111111111114"],
    ),
    /row-level security|policy/i,
  );
  await expectFailure(
    "staff cannot create a product in another organization",
    () => db.unsafe(
      "insert into public.products(id,organization_id,name,item_code,unit,base_price,status) values($1,$2,'Foreign staff insert','CI-STAFF-FOREIGN-01','unit',1,'active')",
      ["a1111111-1111-4111-8111-111111111113", otherOrganizationId],
    ),
    /row-level security|policy/i,
  );

  await db.unsafe(
    "select public.respond_to_sales_quote($1::uuid,$2::jsonb,$3,$4::timestamptz)",
    [firstQuoteId, db.json([{ item_id: firstQuoteItems[0].id, unit_price: 12345 }]), "CI quote priced", new Date(Date.now() + 86400000).toISOString()],
  );

  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const quoteAccept = await db.unsafe("select public.customer_respond_to_quote($1::uuid,true)", [firstQuoteId]);
  assert.ok(quoteAccept, "customer must be able to accept a quote for their account");

  const reorderId = await db.unsafe(
    "select public.save_reorder_template($1,$2::jsonb,null) as id",
    ["CI regular order", db.json([{ product_id: productId, quantity: 3 }])],
  );
  const reorderItems = await db.unsafe(
    "select count(*)::int as count from public.reorder_template_items where template_id=$1",
    [reorderId[0].id],
  );
  assert.equal(reorderItems[0].count, 1, "reorder template must persist its items");

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const staffCustomers = await db.unsafe(
    "select id from public.customers where profile_id=$1 and organization_id=$2 limit 1",
    [profileId, organizationId],
  );
  assert.equal(staffCustomers.length, 1, "staff test customer must belong to the staff organization");

  const staffCreatedResult = await db.unsafe(
    "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5) as result",
    [staffCustomers[0].id,
      db.json([{ product_id: productId, quantity: 2, unit_price: 0.01, item_code: "FORGED-SKU", product_name: "Forged Product", unit: "forged" }]),
      "CI atomic staff-created order", "ci-staff-order-key-000001", "cash_on_delivery"],
  );
  const staffCreatedOrder = staffCreatedResult[0].result;
  assert.equal(staffCreatedOrder.status, "pending");
  assert.equal(staffCreatedOrder.idempotent_replay, false);
  assert.equal(Number(staffCreatedOrder.total_amount), 77000,
    "staff order price must come from the shared server resolver, not the forged unit_price of 0.01");

  const staffReplay = await db.unsafe(
    "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5) as result",
    [staffCustomers[0].id,
      db.json([{ product_id: productId, quantity: 2, unit_price: 999999, item_code: "DIFFERENT-CLIENT-CODE" }]),
      "CI atomic staff-created order", "ci-staff-order-key-000001", "cash_on_delivery"],
  );
  assert.equal(staffReplay[0].result.id, staffCreatedOrder.id, "an identical normalized retry must return the original order");
  assert.equal(staffReplay[0].result.idempotent_replay, true);

  await expectFailure(
    "staff idempotency key reused with a different order",
    () => db.unsafe(
      "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5)",
      [staffCustomers[0].id, db.json([{ product_id: productId, quantity: 3 }]),
        "CI atomic staff-created order", "ci-staff-order-key-000001", "cash_on_delivery"],
    ),
    /different order payload/i,
  );

  await expectFailure(
    "direct authenticated INSERT to orders",
    () => db.unsafe(
      "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,created_by) values($1,$2,'CI-DIRECT-ORDER','pending',1,1,$3)",
      [organizationId, staffCustomers[0].id, staffProfileId],
    ),
    /permission denied/i,
  );
  await expectFailure(
    "direct authenticated INSERT to order_items",
    () => db.unsafe(
      "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total,requested_quantity,approved_quantity,approved_unit_price) values($1,$2,'FORGED','Forged','unit',1,0.01,0.01,1,1,0.01)",
      [staffCreatedOrder.id, productId],
    ),
    /permission denied/i,
  );
  await expectFailure(
    "direct authenticated update of order total",
    () => db.unsafe("update public.orders set total_amount=0 where id=$1", [staffCreatedOrder.id]),
    /permission denied/i,
  );
  await expectFailure(
    "direct authenticated update of order-line price",
    () => db.unsafe("update public.order_items set unit_price_snapshot=0.01 where order_id=$1", [staffCreatedOrder.id]),
    /permission denied/i,
  );

  const staffCreatedItems = await db.unsafe(
    "select item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total from public.fetch_staff_order_items($1::uuid)",
    [staffCreatedOrder.id],
  );
  assert.equal(staffCreatedItems.length, 1);
  assert.notEqual(staffCreatedItems[0].item_code, "FORGED-SKU", "order snapshot must use canonical server-side item code");
  assert.notEqual(staffCreatedItems[0].product_name_snapshot, "Forged Product", "order snapshot must use the persisted product name");
  assert.equal(Number(staffCreatedItems[0].unit_price_snapshot), 38500);
  assert.equal(Number(staffCreatedItems[0].line_total), 77000);
  process.stdout.write("PASS atomic tenant-bound staff order creation, server-side pricing, idempotency and direct-write denial\\n");

  const rollbackKey = "ci-staff-order-rollback-000001";
  await expectFailure(
    "staff order creation must roll back when a later item is outside the tenant",
    () => db.unsafe(
      "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5)",
      [staffCustomers[0].id,
        db.json([{ product_id: productId, quantity: 1 }, { product_id: otherProductId, quantity: 1 }]),
        "CI rollback test", rollbackKey, "cash_on_delivery"],
    ),
    /product is not active in the staff organization/i,
  );
  await db.unsafe("reset role");
  const rollbackCount = await db.unsafe(
    "select count(*)::int as count from public.orders where organization_id=$1 and created_by=$2 and idempotency_key=$3",
    [organizationId, staffProfileId, rollbackKey],
  );
  assert.equal(rollbackCount[0].count, 0, "late item validation failure must roll back the new order header and prior line inserts");
  const rollbackLineCount = await db.unsafe(
    "select count(*)::int as count from public.order_items oi join public.orders o on o.id=oi.order_id where o.organization_id=$1 and o.created_by=$2 and o.idempotency_key=$3",
    [organizationId, staffProfileId, rollbackKey],
  );
  assert.equal(rollbackLineCount[0].count, 0, "failed order creation must leave no persisted order lines");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS failed staff order creation rolled back all writes\\n");

  const staffOrderRows = await db.unsafe(
    "select id,total_amount from public.fetch_staff_orders() where id=$1",
    [order.id],
  );
  assert.equal(staffOrderRows.length, 1, "active staff can read orders through the scoped RPC");
  assert.equal(Number(staffOrderRows[0].total_amount), 370000, "staff RPC exposes the authoritative order total");
  const staffItemRows = await db.unsafe(
    "select id,unit_price_snapshot,line_total,approved_unit_price from public.fetch_staff_order_items($1::uuid)",
    [order.id],
  );
  assert.equal(staffItemRows.length, 1, "active staff can read order lines through the scoped RPC");
  assert.equal(Number(staffItemRows[0].unit_price_snapshot), 37000);
  assert.equal(Number(staffItemRows[0].line_total), 370000);
  await expectFailure(
    "staff RPC cross-tenant order denial",
    () => db.unsafe("select * from public.fetch_staff_order_items($1::uuid)", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
    /outside the active staff organization/i,
  );
  await db.unsafe("update public.orders set status='confirmed' where id=$1", [order.id]);

  const financeSnapshot = await db.unsafe("select public.fetch_staff_finance_data() as result");
  const invoice = financeSnapshot[0].result.invoices.find((row) => row.order_id === order.id);
  assert.ok(invoice, "confirming the order should issue exactly one invoice visible to authorized staff");
  assert.equal(invoice.status, "issued");
  assert.equal(Number(invoice.total_amount), 370000);
  const customerBalanceAfterInvoice = await db.unsafe(
    "select current_balance from public.customers where id=$1",
    [invoice.customer_id],
  );
  assert.equal(
    Number(customerBalanceAfterInvoice[0].current_balance),
    370000,
    "issuing a new invoice must increase customer balance by its amount exactly once",
  );
  const stockAfterConfirm = await db.unsafe(
    "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id='d0000000-0000-0000-0000-000000000001'",
    [productId],
  );
  assert.equal(Number(stockAfterConfirm[0].quantity_reserved), 10, "confirmation should reserve inventory");
  assert.equal(Number(stockAfterConfirm[0].quantity_available), 538, "reservation must reduce available stock");

  // DLV-007: cancellation of a confirmed order must release its reservation once.
  // Seed the already-persisted reservation under the isolated DB owner so this test
  // exercises the real cancellation guard/finalizer without confirming a second order
  // or perturbing the primary customer's invoice/payment assertions.
  const cancellationOrderId = randomUUID();
  const cancellationOrderNumber = "CI-CANCEL-RES-" + cancellationOrderId.slice(0, 12).toUpperCase();
  await db.unsafe("reset role");
  const cancellationCustomerRows = await db.unsafe(
    "select id from public.customers where organization_id=$1::uuid and profile_id=$2::uuid",
    [organizationId, secondProfileId],
  );
  assert.equal(cancellationCustomerRows.length, 1, "cancellation reservation fixture uses the isolated second customer");
  const cancellationBalanceBeforeRows = await db.unsafe(
    "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances " +
      "where product_id=$1::uuid and warehouse_id='d0000000-0000-0000-0000-000000000001'",
    [productId],
  );
  assert.equal(cancellationBalanceBeforeRows.length, 1, "cancellation reservation fixture has one canonical stock balance");
  const cancellationBalanceBefore = cancellationBalanceBeforeRows[0];
  await db.unsafe(
    "insert into public.orders(id,organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) " +
      "values($1::uuid,$2::uuid,$3::uuid,$4,'confirmed',77000,2,'CI confirmed-order reservation cancellation',$5::uuid)",
    [cancellationOrderId,organizationId,cancellationCustomerRows[0].id,cancellationOrderNumber,staffProfileId],
  );
  const cancellationBalanceReservedRows = await db.unsafe(
    "update public.inventory_balances set quantity_reserved=quantity_reserved+2,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now() " +
      "where product_id=$1::uuid and warehouse_id='d0000000-0000-0000-0000-000000000001' " +
      "returning quantity_on_hand,quantity_reserved,quantity_available",
    [productId],
  );
  assert.equal(Number(cancellationBalanceReservedRows[0].quantity_reserved),Number(cancellationBalanceBefore.quantity_reserved)+2,
    "fixture represents a persisted two-unit reservation before cancellation");
  await db.unsafe(
    "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by) " +
      "values($1::uuid,'d0000000-0000-0000-0000-000000000001','reserve',2,$2::numeric,'order',$3::uuid,'CI seed persisted reservation for cancellation',$4::uuid)",
    [productId,cancellationBalanceReservedRows[0].quantity_available,cancellationOrderId,staffProfileId],
  );
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const cancellationUpdate = await db.unsafe(
    "update public.orders set status='cancelled' where id=$1::uuid returning status",
    [cancellationOrderId],
  );
  assert.equal(cancellationUpdate.length,1);
  assert.equal(cancellationUpdate[0].status,"cancelled","authorized staff can cancel a confirmed order");
  await db.unsafe("reset role");
  const cancellationBalanceAfterRows = await db.unsafe(
    "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances " +
      "where product_id=$1::uuid and warehouse_id='d0000000-0000-0000-0000-000000000001'",
    [productId],
  );
  assert.equal(Number(cancellationBalanceAfterRows[0].quantity_on_hand),Number(cancellationBalanceBefore.quantity_on_hand),
    "cancellation must not consume physical on-hand stock");
  assert.equal(Number(cancellationBalanceAfterRows[0].quantity_reserved),Number(cancellationBalanceBefore.quantity_reserved),
    "cancellation must release the entire reservation back to the pre-order balance");
  assert.equal(Number(cancellationBalanceAfterRows[0].quantity_available),Number(cancellationBalanceBefore.quantity_available),
    "cancellation must restore available-to-promise quantity exactly");
  const cancellationMovements = await db.unsafe(
    "select movement_type,quantity,created_by from public.inventory_movements " +
      "where reference_type='order' and reference_id=$1::uuid order by id",
    [cancellationOrderId],
  );
  assert.equal(cancellationMovements.filter((row)=>row.movement_type==="reserve").length,1,
    "the order has one source reservation movement");
  const releaseMovements=cancellationMovements.filter((row)=>row.movement_type==="release_reservation");
  assert.equal(releaseMovements.length,1,"cancellation emits exactly one reservation-release movement");
  assert.equal(Number(releaseMovements[0].quantity),2,"release movement reverses the full reserved quantity");
  assert.equal(releaseMovements[0].created_by,staffProfileId,"reservation release is attributed to the staff actor");
  assert.equal(cancellationMovements.filter((row)=>row.movement_type==="sale").length,0,
    "cancelled order must never emit a stock-sale movement");
  const cancellationHistory=await db.unsafe(
    "select from_status,to_status,changed_by from public.order_status_history where order_id=$1::uuid and to_status='cancelled'",
    [cancellationOrderId],
  );
  assert.equal(cancellationHistory.length,1,"cancellation produces exactly one status-history entry");
  assert.equal(cancellationHistory[0].from_status,"confirmed");
  assert.equal(cancellationHistory[0].changed_by,staffProfileId,"cancellation history records the authorized same-tenant actor");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS DLV-007 confirmed-order cancellation releases ATP reservation once, preserves on-hand stock, writes one release movement and records the staff actor\\n");

  // DLV-015: customer-payment recording is a monetary write boundary. Authorization
  // and tenant denials must preserve the invoice, customer balance, payment ledger and audit.
  const readPaymentAuthorizationBoundary = async () => {
    await db.unsafe("reset role");
    const rows = await db.unsafe(
      "select i.status as invoice_status,i.total_amount::text as invoice_total," +
        "c.current_balance::text as customer_balance," +
        "(select count(*)::integer from public.customer_payments cp where cp.organization_id=i.organization_id and cp.invoice_id=i.id) as payment_count," +
        "(select coalesce(sum(cp.amount),0)::text from public.customer_payments cp where cp.organization_id=i.organization_id and cp.invoice_id=i.id) as paid_amount," +
        "(select count(*)::integer from public.audit_logs al where al.organization_id=i.organization_id " +
          "and al.action='customer_payment.recorded' and al.entity_type='customer_payment' " +
          "and al.new_value->>'invoice_id'=i.id::text) as payment_audit_count " +
        "from public.customer_invoices i join public.customers c " +
          "on c.id=i.customer_id and c.organization_id=i.organization_id " +
        "where i.id=$1::uuid and i.organization_id=$2::uuid",
      [invoice.id, organizationId],
    );
    assert.equal(rows.length, 1, "payment authorization snapshot resolves the same-tenant invoice");
    return rows[0];
  };
  const paymentAuthorizationBaseline = await readPaymentAuthorizationBoundary();
  const customerDeniedPaymentKey = randomUUID();
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot record a payment against an invoice",
    () => db.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3,$4::uuid,$5,$6)",
      [invoice.id, 1000, "cash", customerDeniedPaymentKey, "CI-CUSTOMER-DENIED", "must not be recorded"],
    ),
    /finance permission required to record customer payments/i,
    "42501",
  );
  assert.deepEqual(
    await readPaymentAuthorizationBoundary(),
    paymentAuthorizationBaseline,
    "customer payment denial leaves invoice, customer balance, payment rows and payment audit unchanged",
  );

  // This actor has manager capability, but only in a different organization. The target
  // invoice must remain opaque and no financial side effect may be written.
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'manager') on conflict(profile_id,role) do nothing",
    [foreignProfileId],
  );
  await setIdentity(foreignAuthUserId, "foreign-ci-profile@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "foreign-tenant manager cannot record a payment against another organization's invoice",
    () => db.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3,$4::uuid,$5,$6)",
      [invoice.id, 1000, "cash", randomUUID(), "CI-FOREIGN-DENIED", "must not be recorded"],
    ),
    /active invoice not found in this organization/i,
    "P0002",
  );
  assert.deepEqual(
    await readPaymentAuthorizationBoundary(),
    paymentAuthorizationBaseline,
    "foreign-tenant payment denial leaves invoice, customer balance, payment rows and payment audit unchanged",
  );
  await db.unsafe("reset role");
  await db.unsafe("delete from public.user_roles where profile_id=$1 and role='manager'", [foreignProfileId]);
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS DLV-015 customer-payment authorization and tenant denials preserve invoice, balance, payment ledger and audit\\n");

  // DLV-008-OVERPAYMENT-ATOMIC-DENIAL-001: an amount above the remaining invoice balance must not post partially.
  const readOverpaymentNoSideEffectSnapshot = async () => {
    await db.unsafe("reset role");
    const rows = await db.unsafe(
      "select jsonb_build_object(" +
        "'invoice',to_jsonb(source_invoice)," +
        "'customer',to_jsonb(source_customer)," +
        "'payments',coalesce((" +
          "select jsonb_agg(to_jsonb(source_payment) order by source_payment.id) " +
          "from public.customer_payments source_payment " +
          "where source_payment.organization_id=source_invoice.organization_id " +
            "and source_payment.invoice_id=source_invoice.id" +
        "),'[]'::jsonb)," +
        "'audits',coalesce((" +
          "select jsonb_agg(to_jsonb(source_audit) order by source_audit.created_at,source_audit.id) " +
          "from public.audit_logs source_audit " +
          "where source_audit.organization_id=source_invoice.organization_id and (" +
            "source_audit.entity_id=any(array[source_invoice.id,source_customer.id]::uuid[]) or " +
            "source_audit.new_value->>'invoice_id'=source_invoice.id::text or " +
            "source_audit.old_value->>'invoice_id'=source_invoice.id::text" +
          ")" +
        "),'[]'::jsonb)" +
      ")::text as snapshot " +
      "from public.customer_invoices source_invoice " +
      "join public.customers source_customer " +
        "on source_customer.id=source_invoice.customer_id " +
        "and source_customer.organization_id=source_invoice.organization_id " +
      "where source_invoice.organization_id=$1::uuid and source_invoice.id=$2::uuid",
      [organizationId, invoice.id],
    );
    assert.equal(rows.length, 1, "overpayment snapshot must resolve exactly one same-tenant invoice/customer pair");
    return rows[0].snapshot;
  };
  const overpaymentBefore = await readOverpaymentNoSideEffectSnapshot();
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "overpayment",
    () => db.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3,$4::uuid,$5,$6)",
      [invoice.id, 500000, "cash", randomUUID(), "CI-OVERPAY", "should reject"],
    ),
    /exceeds invoice balance/i,
  );
  const overpaymentAfter = await readOverpaymentNoSideEffectSnapshot();
  assert.equal(
    overpaymentAfter,
    overpaymentBefore,
    "rejected overpayment leaves the complete invoice/customer rows, all invoice payments and all linked audit rows byte-for-byte unchanged",
  );
  await db.unsafe("set role authenticated");
  process.stdout.write(
    "PASS DLV-008-OVERPAYMENT-ATOMIC-DENIAL-001: over-invoice payment is rejected; full invoice/customer/payment/audit snapshot remains byte-for-byte unchanged\\n",
  );
  const runtimeAuditPaymentIdempotencyKey = randomUUID();
  const runtimeAuditPaymentActorId = (await db.unsafe("select public.current_profile_id() as id"))[0].id;
  const runtimeAuditPaymentInsert = await db.unsafe(
    "select public.record_customer_payment($1::uuid,$2::numeric,$3,$4::uuid,$5,$6) as id",
    [invoice.id, 100000, "transfer", runtimeAuditPaymentIdempotencyKey, "CI-PAY-001", "partial payment"],
  );
  const runtimeAuditPaymentId = runtimeAuditPaymentInsert[0].id;
  assert.ok(runtimeAuditPaymentId, "customer payment RPC must return the committed payment ID");

  const runtimeAuditPaymentRequestReplay = await db.unsafe(
    "select public.record_customer_payment($1::uuid,$2::numeric,$3,$4::uuid,$5,$6) as id",
    [invoice.id, 100000, "transfer", runtimeAuditPaymentIdempotencyKey, "CI-PAY-001", "partial payment"],
  );
  assert.equal(runtimeAuditPaymentRequestReplay[0].id, runtimeAuditPaymentId,
    "an identical payment request must replay the original payment");

  await expectFailure(
    "payment idempotency key cannot be reused with a changed payload",
    () => db.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3,$4::uuid,$5,$6)",
      [invoice.id, 100001, "transfer", runtimeAuditPaymentIdempotencyKey, "CI-PAY-001", "partial payment"],
    ),
    /payment idempotency key reused with different payload/i,
    "22023",
  );

  await db.unsafe("reset role");
  const runtimeAuditPaymentEvents = await db.unsafe(
    "select organization_id,actor_id,action,entity_type,entity_id,new_value from public.audit_logs where organization_id=$1 and action='customer_payment.recorded' and entity_id=$2::uuid",
    [organizationId, runtimeAuditPaymentId],
  );
  assert.equal(runtimeAuditPaymentEvents.length, 1,
    "an identical retry must not produce a second customer-payment audit event");
  const runtimeAuditPaymentEvent = runtimeAuditPaymentEvents[0];
  assert.equal(runtimeAuditPaymentEvent.organization_id, organizationId);
  assert.equal(runtimeAuditPaymentEvent.actor_id, runtimeAuditPaymentActorId);
  assert.equal(runtimeAuditPaymentEvent.action, "customer_payment.recorded");
  assert.equal(runtimeAuditPaymentEvent.entity_type, "customer_payment");
  assert.equal(runtimeAuditPaymentEvent.entity_id, runtimeAuditPaymentId);
  assert.equal(runtimeAuditPaymentEvent.new_value.invoice_id, invoice.id);
  assert.equal(runtimeAuditPaymentEvent.new_value.customer_id, invoice.customer_id);
  assert.equal(Number(runtimeAuditPaymentEvent.new_value.amount), 100000);
  assert.equal(runtimeAuditPaymentEvent.new_value.currency, invoice.currency);
  assert.equal(runtimeAuditPaymentEvent.new_value.payment_method, "transfer");
  assert.equal(runtimeAuditPaymentEvent.new_value.idempotency_key_present, true);
  assert.equal(Object.hasOwn(runtimeAuditPaymentEvent.new_value, "idempotency_key"), false,
    "audit must not expose the raw idempotency key");
  assert.equal(Object.hasOwn(runtimeAuditPaymentEvent.new_value, "notes"), false,
    "audit must not copy payment notes into the event");

  await db.unsafe("set role authenticated");
  const invoiceAfterPayment = await db.unsafe("select status from public.customer_invoices where id=$1", [invoice.id]);
  assert.equal(invoiceAfterPayment[0].status, "partially_paid");
  process.stdout.write("PASS customer payment runtime audit: tenant/actor/source fields persisted, idempotent replay emits one audit, changed payload rejected, sensitive key/notes excluded\\n");

  // Receivables aging is computed from the full tenant-scoped invoice/payment ledger, not browser totals.
  const agingSnapshot = await db.unsafe(
    "select public.fetch_staff_receivables_aging($1::integer,$2::integer) as result",
    [200, 0],
  );
  const agingReport = agingSnapshot[0].result;
  assert.equal(typeof agingReport.as_of_utc, "string");
  assert.ok(Array.isArray(agingReport.summary), "aging report should return currency-separated bucket summaries");
  assert.ok(Array.isArray(agingReport.items), "aging report should return paged open invoice rows");
  const agingInvoice = agingReport.items.find((row) => row.id === invoice.id);
  assert.ok(agingInvoice, "authorized receivables aging should include the partially paid invoice");
  assert.equal(Number(agingInvoice.total_amount), 370000);
  assert.equal(Number(agingInvoice.paid_amount), 100000);
  assert.equal(Number(agingInvoice.outstanding_amount), 270000);
  assert.ok(
    ["current", "days_1_30", "days_31_60", "days_61_90", "over_90", "unknown_due_date"].includes(agingInvoice.aging_bucket),
    "aging bucket must be explicit, including missing due dates",
  );
  assert.ok(
    agingReport.summary.some((row) => row.currency === agingInvoice.currency && Number(row.total_outstanding_amount) >= 270000),
    "currency summary must reconcile with the source invoice balance",
  );
  const oneRowPage = await db.unsafe(
    "select public.fetch_staff_receivables_aging($1::integer,$2::integer) as result",
    [1, 0],
  );
  assert.ok(oneRowPage[0].result.items.length <= 1, "aging pagination must enforce the requested page size");
  await expectFailure(
    "invalid receivables aging page size",
    () => db.unsafe("select public.fetch_staff_receivables_aging($1::integer,$2::integer)", [0, 0]),
    /limit must be 1-500/i,
  );

  const customerBalance = await db.unsafe("select current_balance from public.customers where id=(select customer_id from public.orders where id=$1)", [order.id]);
  assert.equal(Number(customerBalance[0].current_balance), 270000, "customer balance must reflect invoice minus payment");

  // NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004: source-backed print authorization and tenant scope.
  await db.unsafe("reset role");
  const issuerRows = await db.unsafe("select name from public.organizations where id=$1 and is_active", [organizationId]);
  assert.equal(issuerRows.length, 1, "finance print requires an active source tenant identity");
  const managerPrintProfileId = "f8888888-8888-4888-8888-888888888881";
  const managerPrintAuthId = "88888888-8888-4888-8888-888888888881";
  const foreignFinanceProfileId = "f8888888-8888-4888-8888-888888888882";
  const foreignFinanceAuthId = "88888888-8888-4888-8888-888888888882";
  await db.unsafe(
    `insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active)
       values($1,$2,$3,'CI Finance Print Manager','ci-finance-print-manager@example.test',true),
             ($4,$5,$6,'CI Foreign Finance Accountant','ci-foreign-finance-print@example.test',true)
       on conflict(id) do nothing`,
    [managerPrintProfileId, managerPrintAuthId, organizationId,
      foreignFinanceProfileId, foreignFinanceAuthId, otherOrganizationId],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'manager'),($2,'accountant') on conflict(profile_id,role) do nothing",
    [managerPrintProfileId, foreignFinanceProfileId],
  );

  // Build a source-linked, fully received return through the real receipt and
  // accounting RPCs. This makes the positive credit-memo PDF test meaningful;
  // the receipt line is defective (restockable_quantity=0) so this fixture does
  // not change saleable stock.
  const sourceInvoiceItem = (await db.unsafe(
    `select id,order_item_id,product_id,item_code,description,unit,quantity,unit_price
       from public.customer_invoice_items
      where organization_id=$1 and invoice_id=$2
      order by created_at,id limit 1`,
    [organizationId, invoice.id],
  ))[0];
  assert.ok(sourceInvoiceItem?.id && sourceInvoiceItem.order_item_id && sourceInvoiceItem.product_id,
    "credit memo PDF fixture requires a real invoice line linked to an order item and product");
  const printWarehouseId = (await db.unsafe(
    "select id from public.warehouses where organization_id=$1 and is_active order by id limit 1",
    [organizationId],
  ))[0]?.id;
  assert.ok(printWarehouseId, "credit memo PDF fixture requires an active warehouse in the source tenant");
  const printReturnRequestId = (await db.unsafe(
    `insert into public.customer_return_requests(
       organization_id,customer_id,order_id,request_number,status,reason,notes,requested_by,
       reviewed_by,reviewed_at,idempotency_key,payload_fingerprint
     ) values($1,$2,$3,'CI-PRINT-RETURN-REQUEST','approved','other','Finance print tenant fixture',$4,
       $5,statement_timestamp(),'CI-PRINT-RETURN-REQUEST-KEY','0123456789abcdef0123456789abcdef')
     returning id`,
    [organizationId, customerOneId, order.id, profileId, staffProfileId],
  ))[0].id;
  const printReturnRequestItemId = (await db.unsafe(
    `insert into public.customer_return_request_items(
       organization_id,return_request_id,order_item_id,product_id,item_code_snapshot,
       product_name_snapshot,unit_snapshot,requested_quantity
     ) values($1,$2,$3,$4,$5,$6,$7,1) returning id`,
    [organizationId, printReturnRequestId, sourceInvoiceItem.order_item_id, sourceInvoiceItem.product_id,
      sourceInvoiceItem.item_code, sourceInvoiceItem.description, sourceInvoiceItem.unit],
  ))[0].id;

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const printReceipt = (await db.unsafe(
    "select public.receive_customer_return($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [printReturnRequestId, printWarehouseId,
      db.json([{ request_item_id: printReturnRequestItemId, received_quantity: 1, restockable_quantity: 0 }]),
      "CI source-backed finance print acceptance", "CI-PRINT-RETURN-RECEIPT-0001"],
  ))[0].result;
  assert.equal(printReceipt.request_status, "received", "source-linked return must be physically received before accounting credit");
  assert.equal(Number(printReceipt.received_quantity), 1);

  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const printReceivable = (await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-RET-AR-0100", "CI return receivable", "asset", "Source-backed return credit memo PDF fixture"],
  ))[0].result;
  const printReturnsRevenue = (await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-RET-SALES-0100", "CI sales returns", "revenue", "Source-backed return credit memo PDF fixture"],
  ))[0].result;
  assert.equal(printReceivable.replayed, false);
  assert.equal(printReturnsRevenue.replayed, false);
  const preparedPrintCreditMemo = (await db.unsafe(
    "select public.prepare_customer_return_credit_memo($1::uuid,$2::uuid,$3::uuid,null,$4::uuid) as result",
    [printReturnRequestId, printReceivable.id, printReturnsRevenue.id, "f8888888-8888-4888-8888-888888888884"],
  ))[0].result;
  const printCreditMemoId = preparedPrintCreditMemo.credit_memo_id;
  assert.ok(printCreditMemoId, "source-linked credit memo preparation must return a persisted ID");
  assert.equal(preparedPrintCreditMemo.status, "draft");
  assert.equal(preparedPrintCreditMemo.journal_status, "draft");
  const sourceBackedCreditMemoPrint = (await db.unsafe(
    "select public.get_customer_return_credit_memo_pdf($1::uuid) as result", [printCreditMemoId],
  ))[0].result;
  assert.equal(sourceBackedCreditMemoPrint.memo.id, printCreditMemoId);
  assert.equal(sourceBackedCreditMemoPrint.memo.status, "draft");
  assert.equal(sourceBackedCreditMemoPrint.return_request.id, printReturnRequestId);
  assert.equal(sourceBackedCreditMemoPrint.invoice.id, invoice.id);
  assert.equal(sourceBackedCreditMemoPrint.journal.id, preparedPrintCreditMemo.journal_entry_id);
  assert.equal(sourceBackedCreditMemoPrint.lines.length, 1);
  assert.equal(Number(sourceBackedCreditMemoPrint.lines[0].returned_quantity), 1);
  assert.equal(Number(sourceBackedCreditMemoPrint.lines[0].invoice_quantity), Number(sourceInvoiceItem.quantity));
  assert.equal(Number(sourceBackedCreditMemoPrint.lines[0].invoice_unit_price), Number(sourceInvoiceItem.unit_price));
  assert.equal(Number(sourceBackedCreditMemoPrint.lines[0].credited_subtotal), Number(preparedPrintCreditMemo.subtotal_amount));

  // Runtime-check the latest SQL migration, not only its source text:
  // blank both printable names for the source customer while keeping the linked
  // invoice/credit memo intact, then verify selectors and PDF fallback for each
  // finance role. Restore the fixture labels even if an assertion fails.
  // Post the source-linked draft only inside a transaction so the statement
  // contract sees a real posted credit row for every finance role; rollback below
  // restores the draft and all ledger/customer/audit effects for later tests.
  await db.unsafe("begin");
  let originalPrintCustomerLabels;
  try {
    await db.unsafe("reset role");
    await setIdentity(staffAuthUserId, "admin@aghbari.ye");
    await db.unsafe("set role authenticated");
    const temporaryPrintCreditPosting = (await db.unsafe(
      "select public.post_general_journal_entry($1::uuid) as result",
      [preparedPrintCreditMemo.journal_entry_id],
    ))[0].result;
    assert.equal(temporaryPrintCreditPosting.status, "posted",
      "source-backed print fixture must produce a real posted credit memo for statement output");
    assert.equal(temporaryPrintCreditPosting.replayed, false,
      "temporary statement fixture posting must be the first posting in its isolated transaction");

    await db.unsafe("reset role");
    originalPrintCustomerLabels = (await db.unsafe(
      "select business_name,contact_name from public.customers where id=$1 and organization_id=$2",
      [customerOneId, organizationId],
    ))[0];
    assert.ok(originalPrintCustomerLabels, "finance print privacy fixture customer must exist");
    await db.unsafe(
      "update public.customers set business_name='',contact_name='' where id=$1 and organization_id=$2",
      [customerOneId, organizationId],
    );
    for (const [actorId, email, roleLabel] of [
      [staffAuthUserId, "admin@aghbari.ye", "admin"],
      [accountantAuthUserId, "ci-accountant@example.test", "accountant"],
      [managerPrintAuthId, "ci-finance-print-manager@example.test", "manager"],
    ]) {
      await db.unsafe("reset role");
      await setIdentity(actorId, email);
      await db.unsafe("set role authenticated");
      const options = (await db.unsafe(
        "select public.get_finance_document_print_options($1::integer) as result", [100],
      ))[0].result;
      const assertExactJsonKeys = (value, expectedKeys, label) => {
        assert.ok(value && typeof value === "object" && !Array.isArray(value),
          roleLabel + " " + label + " must be a JSON object");
        assert.deepEqual(
          Object.keys(value).sort(),
          [...expectedKeys].sort(),
          roleLabel + " " + label + " must contain exactly the approved server fields",
        );
      };
      assertExactJsonKeys(options, [
        "organization_name", "customers", "customers_has_more",
        "invoices", "invoices_has_more", "credit_memos", "credit_memos_has_more",
        "limit", "offset",
      ], "finance selector");
      for (const row of options.customers) {
        assertExactJsonKeys(row, ["id", "customer_code", "business_name", "contact_name"],
          "finance selector customer row");
      }
      for (const row of options.invoices) {
        assertExactJsonKeys(row, [
          "id", "invoice_number", "customer_id", "customer_name", "status", "issued_at", "currency",
        ], "finance selector invoice row");
      }
      for (const row of options.credit_memos) {
        assertExactJsonKeys(row, [
          "id", "memo_number", "customer_id", "customer_name", "invoice_number",
          "status", "created_at", "currency", "total_amount",
        ], "finance selector credit-memo row");
      }
      assert.equal(options.organization_name, issuerRows[0].name, roleLabel + " must receive issuer identity from the active organization");
      assert.ok(options.customers.some((row) => row.id === customerOneId), roleLabel + " must receive current-tenant customers");
      assert.ok(options.invoices.some((row) => row.id === invoice.id), roleLabel + " must receive the current-tenant invoice");
      const unnamedInvoiceOption = options.invoices.find((row) => row.id === invoice.id);
      assert.equal(unnamedInvoiceOption.customer_name, "عميل غير مسمى",
        roleLabel + " invoice selector must use a customer-facing fallback when printable names are blank");
      assert.notEqual(unnamedInvoiceOption.customer_name, customerOneId,
        roleLabel + " invoice selector must never use the internal customer UUID as a display label");
      assert.ok(options.credit_memos.some((row) => row.id === printCreditMemoId), roleLabel + " must receive the source-linked credit memo print option");
      const unnamedCreditMemoOption = options.credit_memos.find((row) => row.id === printCreditMemoId);
      assert.equal(unnamedCreditMemoOption.customer_name, "عميل غير مسمى",
        roleLabel + " credit-memo selector must use a customer-facing fallback when printable names are blank");
      assert.notEqual(unnamedCreditMemoOption.customer_name, customerOneId,
        roleLabel + " credit-memo selector must never use the internal customer UUID as a display label");
      const creditMemoPrint = (await db.unsafe(
        "select public.get_customer_return_credit_memo_pdf($1::uuid) as result", [printCreditMemoId],
      ))[0].result;
      assertExactJsonKeys(creditMemoPrint,
        ["memo", "customer", "invoice", "return_request", "journal", "lines"],
        "credit-memo PDF");
      assertExactJsonKeys(creditMemoPrint.memo, [
        "id", "memo_number", "status", "currency", "subtotal_amount", "tax_amount",
        "total_amount", "created_at", "posted_at", "reversed_at", "reversal_reason",
        "reversal_journal_entry_number", "reversal_journal_status",
      ], "credit-memo PDF memo");
      assertExactJsonKeys(creditMemoPrint.customer, ["id", "name", "contact_name"],
        "credit-memo PDF customer");
      assertExactJsonKeys(creditMemoPrint.invoice, [
        "id", "invoice_number", "currency", "issued_at", "subtotal", "tax_amount",
        "total_amount", "order_number",
      ], "credit-memo PDF invoice");
      assertExactJsonKeys(creditMemoPrint.return_request,
        ["id", "request_number", "status", "created_at"], "credit-memo PDF return request");
      assertExactJsonKeys(creditMemoPrint.journal,
        ["id", "entry_number", "status", "entry_date"], "credit-memo PDF journal");
      for (const line of creditMemoPrint.lines) {
        assertExactJsonKeys(line, [
          "id", "item_code", "description", "unit", "returned_quantity",
          "credited_subtotal", "invoice_quantity", "invoice_unit_price", "invoice_line_total",
        ], "credit-memo PDF line");
      }
      assert.equal(creditMemoPrint.memo.id, printCreditMemoId, roleLabel + " credit memo print must retain the persisted source ID");
      assert.equal(creditMemoPrint.customer.name, "عميل غير مسمى",
        roleLabel + " credit-memo PDF customer label must use the customer-facing fallback");
      assert.notEqual(creditMemoPrint.customer.name, customerOneId,
        roleLabel + " credit-memo PDF must not render an internal customer UUID");
      assert.equal(creditMemoPrint.return_request.id, printReturnRequestId);
      assert.equal(creditMemoPrint.invoice.id, invoice.id);
      assert.equal(creditMemoPrint.journal.id, preparedPrintCreditMemo.journal_entry_id);
      assert.equal(creditMemoPrint.lines.length, 1);
      const invoicePrint = (await db.unsafe(
        "select public.get_staff_customer_invoice_print_data($1::uuid) as result", [invoice.id],
      ))[0].result;
      assertExactJsonKeys(invoicePrint, ["invoice", "customer", "lines"], "staff invoice PDF");
      assertExactJsonKeys(invoicePrint.invoice, [
        "id", "invoice_number", "status", "issued_at", "due_at", "currency",
        "subtotal", "tax_amount", "total_amount",
      ], "staff invoice PDF invoice");
      assertExactJsonKeys(invoicePrint.customer,
        ["id", "customer_code", "business_name", "contact_name"], "staff invoice PDF customer");
      for (const line of invoicePrint.lines) {
        assertExactJsonKeys(line, [
          "id", "item_code", "description", "unit", "quantity", "unit_price", "line_total",
        ], "staff invoice PDF line");
      }
      assert.equal(invoicePrint.invoice.id, invoice.id, roleLabel + " invoice print must retain the persisted source ID");
      assert.equal(Number(invoicePrint.invoice.total_amount), 370000, roleLabel + " invoice amount must match the database source");
      assert.equal(invoicePrint.lines.length, 1, roleLabel + " invoice print must contain source lines");
      assert.equal(Number(invoicePrint.lines[0].line_total), Number(invoicePrint.invoice.subtotal));
      const statementPrint = (await db.unsafe(
        "select public.get_staff_customer_account_statement($1::uuid) as result", [customerOneId],
      ))[0].result;
      assertExactJsonKeys(statementPrint, [
        "customer", "invoices", "payments", "credits", "summary_as_of_utc", "summary", "truncated",
      ], "staff account statement");
      assertExactJsonKeys(statementPrint.customer,
        ["id", "customer_code", "business_name", "contact_name"], "staff statement customer");
      for (const row of statementPrint.invoices) {
        assertExactJsonKeys(row, [
          "id", "invoice_number", "status", "issued_at", "due_at", "currency",
          "subtotal", "tax_amount", "total_amount", "paid_amount",
          "credit_memo_amount", "outstanding_amount",
        ], "staff statement invoice row");
      }
      for (const row of statementPrint.payments) {
        assertExactJsonKeys(row, [
          "id", "invoice_id", "invoice_number", "currency", "amount", "paid_at",
          "payment_method", "reference",
        ], "staff statement payment row");
      }
      for (const row of statementPrint.credits) {
        assertExactJsonKeys(row, [
          "id", "memo_number", "invoice_id", "invoice_number", "currency",
          "subtotal_amount", "tax_amount", "total_amount", "created_at", "posted_at",
        ], "staff statement credit-memo row");
      }
      for (const row of statementPrint.summary) {
        assertExactJsonKeys(row, [
          "currency", "invoiced", "paid", "credited", "outstanding",
          "overdue_invoice_count", "overdue_outstanding",
          "unknown_due_date_invoice_count", "unknown_due_date_outstanding",
        ], "staff statement currency summary");
      }
      assertExactJsonKeys(statementPrint.truncated, ["invoices", "payments", "credits"],
        "staff statement truncation metadata");
      const printedInvoice = statementPrint.invoices.find((row) => row.id === invoice.id);
      assert.ok(printedInvoice, roleLabel + " statement must include the tenant's source invoice");
      assert.equal(Number(printedInvoice.paid_amount), 100000);
      const statementCreditMemo = statementPrint.credits.find((row) => row.id === printCreditMemoId);
      assert.ok(statementCreditMemo, roleLabel + " statement must include the real posted source credit memo");
      assert.equal(Number(statementCreditMemo.total_amount), Number(preparedPrintCreditMemo.total_amount));
      assert.equal(Number(printedInvoice.credit_memo_amount), Number(preparedPrintCreditMemo.total_amount));
      assert.equal(
        Number(printedInvoice.outstanding_amount),
        Math.max(Number(printedInvoice.total_amount) - Number(printedInvoice.paid_amount) - Number(printedInvoice.credit_memo_amount), 0),
        roleLabel + " statement outstanding must reconcile invoice less saved payment and posted credit",
      );
      const statementCurrencySummary = statementPrint.summary.find((row) => row.currency === printedInvoice.currency);
      assert.ok(statementCurrencySummary, roleLabel + " statement must include the source invoice currency summary");
      assert.equal(Number(statementCurrencySummary.credited), Number(preparedPrintCreditMemo.total_amount));
      assert.equal(Number(statementCurrencySummary.outstanding), Number(printedInvoice.outstanding_amount));
      assert.equal(statementPrint.customer.id, customerOneId);
    }
  } finally {
    await db.unsafe("reset role");
    try {
      if (originalPrintCustomerLabels) {
        await db.unsafe(
          "update public.customers set business_name=$3,contact_name=$4 where id=$1 and organization_id=$2",
          [customerOneId, organizationId, originalPrintCustomerLabels.business_name, originalPrintCustomerLabels.contact_name],
        );
      }
    } finally {
      await db.unsafe("rollback");
    }
  }

  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary staff cannot list financial print options",
    () => db.unsafe("select public.get_finance_document_print_options($1::integer)", [100]),
    /finance permission required/i,
  );
  await expectFailure(
    "ordinary staff cannot print a customer invoice",
    () => db.unsafe("select public.get_staff_customer_invoice_print_data($1::uuid)", [invoice.id]),
    /finance permission required/i,
  );
  await expectFailure(
    "ordinary staff cannot print a customer statement",
    () => db.unsafe("select public.get_staff_customer_account_statement($1::uuid)", [customerOneId]),
    /finance permission required/i,
  );
  await expectFailure(
    "ordinary staff cannot print a return credit memo",
    () => db.unsafe("select public.get_customer_return_credit_memo_pdf($1::uuid)", [printCreditMemoId]),
    /finance permission required/i,
  );

  await db.unsafe("reset role");
  await setIdentity(foreignFinanceAuthId, "ci-foreign-finance-print@example.test");
  await db.unsafe("set role authenticated");
  const foreignOptions = (await db.unsafe(
    "select public.get_finance_document_print_options($1::integer) as result", [100],
  ))[0].result;
  assert.equal(foreignOptions.organization_name, "Foreign organization", "foreign accountant must receive only the active foreign organization's issuer identity");
  assert.equal(foreignOptions.customers.some((row) => row.id === customerOneId), false, "foreign finance options must not expose another tenant's customers");
  assert.equal(foreignOptions.invoices.some((row) => row.id === invoice.id), false, "foreign finance options must not expose another tenant's invoices");
  assert.equal(foreignOptions.credit_memos.some((row) => row.id === printCreditMemoId), false,
    "foreign finance options must not expose another tenant's credit memos or customer labels");
  await expectFailure(
    "foreign-tenant accountant cannot print another organization's invoice",
    () => db.unsafe("select public.get_staff_customer_invoice_print_data($1::uuid)", [invoice.id]),
    /invoice was not found in the active organization/i,
  );
  await expectFailure(
    "foreign-tenant accountant cannot print another organization's statement",
    () => db.unsafe("select public.get_staff_customer_account_statement($1::uuid)", [customerOneId]),
    /customer was not found in the active organization/i,
  );
  await expectFailure(
    "foreign-tenant accountant cannot print another organization’s persisted credit memo",
    () => db.unsafe("select public.get_customer_return_credit_memo_pdf($1::uuid)", [printCreditMemoId]),
    /credit memo was not found in the active organization/i,
  );
  process.stdout.write("PASS finance document print: admin/manager/accountant access, issuer identity, persisted invoice/statement amounts, staff/customer denial, and foreign-tenant invoice/statement isolation\\n");

  // Customers receive allowed statement amounts only through the account-statement RPC.
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot list staff financial print options",
    () => db.unsafe("select public.get_finance_document_print_options($1::integer)", [100]),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot print staff invoice documents",
    () => db.unsafe("select public.get_staff_customer_invoice_print_data($1::uuid)", [invoice.id]),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot print staff account statements",
    () => db.unsafe("select public.get_staff_customer_account_statement($1::uuid)", [customerOneId]),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot use the staff credit-memo print RPC",
    () => db.unsafe("select public.get_customer_return_credit_memo_pdf($1::uuid)", [printCreditMemoId]),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot read staff receivables aging",
    () => db.unsafe("select public.fetch_staff_receivables_aging($1::integer,$2::integer)", [200, 0]),
    /finance permission required/i,
  );
  const statementSnapshot = await db.unsafe("select public.get_customer_account_statement() as result");
  const statement = statementSnapshot[0].result;
  const statementInvoice = statement.invoices.find((row) => row.id === invoice.id);
  assert.ok(statementInvoice, "customer statement should include the customer's own invoice");
  assert.equal(Number(statementInvoice.total_amount), 370000, "statement RPC may expose invoice totals on the authorized account-statement surface");
  assert.ok(Object.hasOwn(statementInvoice, "due_at"), "statement RPC must return due_at for accurate aging labels");
  assert.match(String(statementInvoice.currency), /^[A-Za-z]{3}$/, "statement RPC must return a valid currency code");
  assert.ok(statement.invoices.length <= 200, "statement RPC invoice list must honor its 200-row cap");
  assert.equal(statement.payments.length, 1, "customer statement should include the payment ledger");
  assert.equal(statement.payments[0].invoice_id, invoice.id, "payment rows must carry the invoice ID used by PDF reconciliation");
  assert.ok(Object.hasOwn(statement.payments[0], "paid_at"), "payment rows must include paid_at for statement history");
  assert.equal(Number(statement.payments[0].amount), 100000);
  assert.ok(statement.payments.length <= 500, "statement RPC payment list must honor its 500-row cap");
  assert.equal(typeof statement.summary_as_of_utc, "string", "statement RPC must return the full-ledger summary cutoff");
  assert.ok(Number.isFinite(Date.parse(statement.summary_as_of_utc)), "statement summary cutoff must be a valid timestamp");
  assert.ok(Array.isArray(statement.summary), "statement RPC must return full-ledger currency summaries");
  const customerCurrencySummary = statement.summary.find((row) => row.currency === statementInvoice.currency);
  assert.ok(customerCurrencySummary, "summary must include the customer's invoice currency");
  assert.equal(Number(customerCurrencySummary.invoiced), 370000, "full-ledger invoiced amount must reconcile to the invoice");
  assert.equal(Number(customerCurrencySummary.paid), 100000, "full-ledger paid amount must reconcile to the payment ledger");
  assert.equal(Number(customerCurrencySummary.outstanding), 270000, "full-ledger outstanding amount must reconcile invoice minus payments");
  const statementAsOf = Date.parse(statement.summary_as_of_utc);
  const statementDueAt = statementInvoice.due_at ? Date.parse(statementInvoice.due_at) : Number.NaN;
  const overdueAtCutoff = Number.isFinite(statementDueAt) && statementDueAt < statementAsOf;
  assert.equal(Number(customerCurrencySummary.overdue_invoice_count), overdueAtCutoff ? 1 : 0);
  assert.equal(Number(customerCurrencySummary.overdue_outstanding), overdueAtCutoff ? 270000 : 0);
  assert.equal(Number(customerCurrencySummary.unknown_due_date_invoice_count), Number.isFinite(statementDueAt) ? 0 : 1);
  assert.equal(Number(customerCurrencySummary.unknown_due_date_outstanding), Number.isFinite(statementDueAt) ? 0 : 270000);
  assert.equal(Number(statementInvoice.paid_amount), 100000, "each detail invoice must include its full-ledger paid amount");
  assert.equal(Number(statementInvoice.outstanding_amount), 270000, "each detail invoice must include its full-ledger outstanding amount");

  // CAP BOUNDARY: customer statement details remain limited, but full-ledger
  // currency summary and each returned invoice balance must include capped-out entries.
  const baselineYER = statement.summary.find((row) => row.currency === "YER");
  assert.ok(baselineYER, "baseline statement must include the invoice currency");
  await db.unsafe("reset role");

  const cappedInvoiceRows = await db.unsafe(
    `WITH seeded_orders AS (
       INSERT INTO public.orders(
         organization_id,customer_id,order_number,status,total_amount,total_items,created_by,created_at,updated_at
       )
       SELECT $1,$2,
              'CI-CAP-ORDER-'||lpad(g.n::text,4,'0'),
              'draft',
              CASE WHEN g.n=205 THEN 10.00 ELSE 1.00 END,
              1,$3,
              statement_timestamp() + (g.n * interval '1 second'),
              statement_timestamp() + (g.n * interval '1 second')
         FROM generate_series(1,205) AS g(n)
       RETURNING id,order_number,total_amount,created_at
     ),
     seeded_invoices AS (
       INSERT INTO public.customer_invoices(
         organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount
       )
       SELECT $1,$2,o.id,
              'CI-CAP-INVOICE-'||right(o.order_number,4),
              'issued',o.created_at,
              CASE
                   WHEN right(o.order_number,4)::integer=205 THEN statement_timestamp()-interval '2 days'
                   WHEN right(o.order_number,4)::integer=204 THEN
                     (date_trunc('day', statement_timestamp() AT TIME ZONE 'UTC') + interval '12 hours') AT TIME ZONE 'UTC'
                   ELSE statement_timestamp()+interval '30 days'
              END,
              'YER',o.total_amount,0,o.total_amount
         FROM seeded_orders o
       RETURNING id,invoice_number,total_amount
     )
     SELECT id,invoice_number,total_amount FROM seeded_invoices ORDER BY invoice_number`,
    [organizationId, customerOneId, profileId],
  );
  assert.equal(cappedInvoiceRows.length,205,"cap fixture must create more than 200 invoices");
  const oldestCapInvoice = cappedInvoiceRows.find((row) => row.invoice_number === "CI-CAP-INVOICE-0001");
  const paidCapInvoice = cappedInvoiceRows.find((row) => row.invoice_number === "CI-CAP-INVOICE-0205");
  assert.ok(oldestCapInvoice && paidCapInvoice,"cap fixture should include oldest and fully reconciled boundary invoices");

  // FIN-INVOICE-001 / DLV-008: prove the server-side finance ledger's keyset cursor
  // returns every tenant invoice exactly once across multiple pages and fails closed
  // on malformed cursors or oversized limits.
  await db.unsafe("reset role");
  const expectedFinanceInvoiceCount = Number((await db.unsafe(
    "select count(*)::integer as count from public.customer_invoices where organization_id=$1::uuid",
    [organizationId],
  ))[0].count);
  assert.ok(expectedFinanceInvoiceCount >= 206,
    "pagination acceptance requires the original invoice plus all 205 deterministic cap-fixture invoices");

  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const readFinanceInvoicePage = async (limit, beforeIssuedAt = null, beforeId = null) => {
    const rows = await db.unsafe(
      "select public.fetch_staff_finance_invoice_page($1::integer,$2::timestamptz,$3::uuid) as result",
      [limit, beforeIssuedAt, beforeId],
    );
    return rows[0]?.result;
  };
  const financeInvoicePages = [];
  let pageCursorIssuedAt = null;
  let pageCursorId = null;
  let invoicePaginationTerminated = false;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await readFinanceInvoicePage(100, pageCursorIssuedAt, pageCursorId);
    assert.ok(page && Array.isArray(page.invoices),
      "finance invoice page " + (pageIndex + 1) + " must return a validated page object");
    assert.equal(page.limit, 100, "finance invoice page must echo the enforced page size");
    assert.equal(Number(page.total_invoices), expectedFinanceInvoiceCount,
      "every page must report the full tenant invoice count, not only the current page");
    assert.equal(typeof page.has_more, "boolean", "pagination continuation must be an explicit boolean");
    assert.ok(page.invoices.length <= 100, "the server must never return more than the requested page limit");
    for (const row of page.invoices) {
      assert.equal(row.organization_id, organizationId,
        "financial invoice pages must contain only invoices from the actor's active organization");
      assert.ok(typeof row.issued_at === "string" && row.issued_at.length > 0,
        "each cursor row must include the server-issued timestamp");
    }
    financeInvoicePages.push(page);
    if (!page.has_more) {
      invoicePaginationTerminated = true;
      break;
    }
    assert.equal(page.invoices.length, 100,
      "a page marked as having more records must fill its requested size");
    const last = page.invoices[page.invoices.length - 1];
    assert.ok(last?.id && last.issued_at, "continuation must be based on the final returned row");
    pageCursorIssuedAt = last.issued_at;
    pageCursorId = last.id;
  }
  assert.equal(invoicePaginationTerminated, true,
    "keyset pagination must terminate within the bounded number of pages");
  assert.ok(financeInvoicePages.length >= 3,
    "the deterministic fixture must exercise at least three invoice pages");
  const pagedFinanceInvoices = financeInvoicePages.flatMap((page) => page.invoices);
  const pagedFinanceInvoiceIds = pagedFinanceInvoices.map((row) => row.id);
  assert.equal(pagedFinanceInvoices.length, expectedFinanceInvoiceCount,
    "concatenating all pages must return every current-tenant invoice");
  assert.equal(new Set(pagedFinanceInvoiceIds).size, expectedFinanceInvoiceCount,
    "keyset pagination must not duplicate or skip invoices between pages");
  assert.ok(pagedFinanceInvoiceIds.includes(oldestCapInvoice.id),
    "the oldest invoice must remain reachable beyond the first finance page");
  assert.ok(pagedFinanceInvoiceIds.includes(paidCapInvoice.id),
    "the newest boundary invoice must remain reachable on the first finance page");
  for (let index = 1; index < pagedFinanceInvoices.length; index += 1) {
    const prior = pagedFinanceInvoices[index - 1];
    const current = pagedFinanceInvoices[index];
    const priorTime = Date.parse(prior.issued_at);
    const currentTime = Date.parse(current.issued_at);
    assert.ok(priorTime > currentTime || (priorTime === currentTime && prior.id.toLowerCase() < current.id.toLowerCase()),
      "finance invoice pages must preserve issued_at DESC, id ASC ordering across page boundaries");
  }

  // Read the independent source-of-truth aggregate as the privileged isolated-fixture
  // connection, not as the authenticated accountant whose RLS boundary is under test.
  await db.unsafe("reset role");
  const invoiceBalanceOracle = await db.unsafe(
    "select ci.id::text as id,ci.currency," +
      "ci.total_amount::numeric(15,2)::text as total_amount," +
      "coalesce(pay.paid_amount,0)::numeric(15,2)::text as paid_amount," +
      "coalesce(credits.credit_memo_amount,0)::numeric(15,2)::text as credit_memo_amount," +
      "case when ci.status='void' then 0 else greatest(" +
        "ci.total_amount-coalesce(pay.paid_amount,0)-coalesce(credits.credit_memo_amount,0),0) " +
      "end::numeric(15,2)::text as outstanding_amount " +
      "from public.customer_invoices ci " +
      "left join lateral (" +
        "select sum(cp.amount)::numeric(15,2) as paid_amount from public.customer_payments cp " +
        "where cp.organization_id=ci.organization_id and cp.invoice_id=ci.id and cp.customer_id=ci.customer_id" +
      ") pay on true " +
      "left join lateral (" +
        "select sum(cm.total_amount)::numeric(15,2) as credit_memo_amount " +
        "from public.customer_return_credit_memos cm " +
        "where cm.organization_id=ci.organization_id and cm.invoice_id=ci.id and cm.customer_id=ci.customer_id " +
          "and cm.status='posted' and cm.currency=ci.currency" +
      ") credits on true " +
      "where ci.organization_id=$1::uuid order by ci.issued_at desc,ci.id asc",
    [organizationId],
  );
  assert.equal(invoiceBalanceOracle.length,expectedFinanceInvoiceCount,
    "independent finance balance oracle covers every tenant invoice");
  const expectedBalanceByInvoiceId = new Map(invoiceBalanceOracle.map((row) => [row.id,row]));
  for (const row of pagedFinanceInvoices) {
    const expected = expectedBalanceByInvoiceId.get(row.id);
    assert.ok(expected,"every page row must have a matching saved invoice source");
    for (const field of ["currency","total_amount","paid_amount","credit_memo_amount","outstanding_amount"]) {
      assert.equal(row[field],expected[field],
        "invoice " + row.id + " " + field + " must match the saved invoice/payment/posted-credit source aggregate");
    }
  }

  // Restore the role-scoped accountant session before exercising malformed pagination calls.
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");

  const invalidFinanceInvoiceRequests = [
    ["null limit", null, null, null],
    ["zero limit", 0, null, null],
    ["limit above 200", 201, null, null],
    ["timestamp without ID cursor", 100, financeInvoicePages[0].invoices[0].issued_at, null],
    ["ID without timestamp cursor", 100, null, financeInvoicePages[0].invoices[0].id],
  ];
  for (const [label, limit, beforeAt, beforeId] of invalidFinanceInvoiceRequests) {
    await expectFailure(
      "finance invoice pagination rejects " + label,
      () => readFinanceInvoicePage(limit, beforeAt, beforeId),
      /invoice page limit must be 1\.\.200 and both cursor fields must be null or present/i,
      "22023",
    );
  }

  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary operational staff cannot read the finance invoice ledger page",
    () => readFinanceInvoicePage(100),
    /finance permission required to read invoice ledger pages/i,
    "42501",
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customers cannot read the staff finance invoice ledger page",
    () => readFinanceInvoicePage(100),
    /finance permission required to read invoice ledger pages/i,
    "42501",
  );

  await db.unsafe("reset role");
  const foreignFinanceScope = await db.unsafe(
    "select p.organization_id::text as organization_id from public.profiles p " +
      "where p.auth_user_id=$1::uuid and p.is_active=true",
    [foreignFinanceAuthId],
  );
  assert.equal(foreignFinanceScope.length, 1,
    "foreign finance scope fixture must resolve one active finance actor");
  assert.notEqual(foreignFinanceScope[0].organization_id, organizationId,
    "foreign finance actor must belong to a distinct organization");
  await setIdentity(foreignFinanceAuthId, "ci-foreign-finance-print@example.test");
  await db.unsafe("set role authenticated");
  const foreignFinancePage = await readFinanceInvoicePage(100);
  assert.ok(foreignFinancePage.invoices.every((row) => row.organization_id === foreignFinanceScope[0].organization_id),
    "foreign accountant sees only invoices belonging to the foreign active organization");
  assert.equal(foreignFinancePage.invoices.some((row) => row.id === invoice.id), false,
    "foreign accountant cannot discover the current tenant's invoice IDs");
  await db.unsafe("reset role");
  process.stdout.write("PASS finance invoice pagination: all rows once across keyset pages, stable ordering, limit/cursor rejection, finance-role denial and tenant isolation\\n");

  const cappedPayments = await db.unsafe(`
    INSERT INTO public.customer_payments(
       organization_id,customer_id,invoice_id,amount,payment_method,reference,paid_at
     )
     SELECT $1,$2,$3,0.01,'transfer',
            'CI-CAP-PAY-'||lpad(g.n::text,4,'0'),
            statement_timestamp()-((506-g.n)*interval '1 second')
       FROM generate_series(1,505) AS g(n)
     RETURNING id,reference,invoice_id,amount,paid_at`,
    [organizationId, customerOneId, paidCapInvoice.id],
  );
  assert.equal(cappedPayments.length,505,"cap fixture must create more than 500 payments");
  const firstCappedPayment = cappedPayments.find((row) => row.reference === "CI-CAP-PAY-0001");
  assert.ok(firstCappedPayment,"oldest capped-out payment should be identifiable");

  // A void invoice and its recorded payment must not enter the active-ledger totals.
  const voidOrderResult = await db.unsafe(
    `INSERT INTO public.orders(
       organization_id,customer_id,order_number,status,total_amount,total_items,created_by,created_at,updated_at
     ) VALUES ($1,$2,'CI-CAP-VOID-ORDER','draft',900.00,1,$3,statement_timestamp(),statement_timestamp())
     RETURNING id`,
    [organizationId, customerOneId, profileId],
  );
  const voidInvoiceResult = await db.unsafe(
    `INSERT INTO public.customer_invoices(
       organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount
     ) VALUES ($1,$2,$3,'CI-CAP-VOID-INVOICE','void',
       statement_timestamp()-interval '3 days',statement_timestamp()-interval '2 days',
       'YER',900.00,0.00,900.00)
     RETURNING id,invoice_number,total_amount`,
    [organizationId, customerOneId, voidOrderResult[0].id],
  );
  const voidPaymentResult = await db.unsafe(
    `INSERT INTO public.customer_payments(
       organization_id,customer_id,invoice_id,amount,payment_method,reference,paid_at
     ) VALUES ($1,$2,$3,500.00,'transfer','CI-CAP-VOID-PAYMENT',statement_timestamp())
     RETURNING id,amount,invoice_id`,
    [organizationId, customerOneId, voidInvoiceResult[0].id],
  );
  assert.equal(Number(voidInvoiceResult[0].total_amount),900,"void invoice fixture should carry a large amount that would be visible if incorrectly included");
  assert.equal(Number(voidPaymentResult[0].amount),500,"void invoice fixture should carry a recorded payment that must also be excluded");

  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const capStatementSnapshot = await db.unsafe("select public.get_customer_account_statement() as result");
  const capStatement = capStatementSnapshot[0].result;
  assert.equal(capStatement.invoices.length,200,"customer-facing invoice detail must remain capped at 200");
  assert.equal(capStatement.payments.length,500,"customer-facing payment detail must remain capped at 500");
  assert.equal(capStatement.invoices.some((row) => row.id === oldestCapInvoice.id),false,"oldest invoice should fall outside the bounded detail page");
  assert.equal(capStatement.payments.some((row) => row.id === firstCappedPayment.id),false,"oldest payment should fall outside the bounded detail page");

  // Avoid subtracting large floating-point totals: reconcile all money in minor-unit BigInts.
  const toMinorUnits = (value) => {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
    assert.ok(match, "currency amount should be a decimal with at most two fractional digits");
    const whole = BigInt(match[2]);
    const fractional = BigInt((match[3] ?? "").padEnd(2, "0"));
    const unsigned = whole * 100n + fractional;
    return match[1] === "-" ? -unsigned : unsigned;
  };
  const cappedSummary = capStatement.summary.find((row) => row.currency === "YER");
  assert.ok(cappedSummary,"full-ledger summary must include the YER currency");
  assert.equal(toMinorUnits(cappedSummary.invoiced)-toMinorUnits(baselineYER.invoiced),21400n,"full summary must include all 205 added invoices despite the 200-row detail cap");
  assert.equal(toMinorUnits(cappedSummary.paid)-toMinorUnits(baselineYER.paid),505n,"full summary must include all 505 payments despite the 500-row detail cap");
  assert.equal(toMinorUnits(cappedSummary.outstanding)-toMinorUnits(baselineYER.outstanding),20895n,"full summary must reconcile all capped-out invoice/payment amounts");
  assert.equal(toMinorUnits(cappedSummary.overdue_outstanding)-toMinorUnits(baselineYER.overdue_outstanding),495n,"only the past-due boundary invoice should add overdue receivables");
  assert.equal(Number(cappedSummary.overdue_invoice_count)-Number(baselineYER.overdue_invoice_count),1,"due later today is not overdue; only an invoice from an earlier UTC date increments the overdue count");
  assert.equal(toMinorUnits(cappedSummary.unknown_due_date_outstanding),toMinorUnits(baselineYER.unknown_due_date_outstanding),"explicit test due dates must not change the missing-due-date bucket");

  const paidCapInvoiceDetail = capStatement.invoices.find((row) => row.id === paidCapInvoice.id);
  assert.ok(paidCapInvoiceDetail,"newest boundary invoice should remain in bounded invoice details");
  assert.equal(toMinorUnits(paidCapInvoiceDetail.paid_amount),505n,"invoice paid total must include the 5 payments omitted from the capped detail list");
  assert.equal(toMinorUnits(paidCapInvoiceDetail.outstanding_amount),495n,"invoice balance must use the full 505-payment ledger rather than only 500 displayed rows");

  // The default invoice privacy policy removes monetary keys from the JSON itself,
  // not merely from the PDF layout. The dedicated price-visibility acceptance test
  // verifies that enabling the tenant setting restores the persisted values.
  const ownInvoicePdfResult = await db.unsafe(
    "select public.get_customer_invoice_pdf($1::uuid) as result",
    [invoice.id],
  );
  const ownInvoicePdf = ownInvoicePdfResult[0].result;
  assert.equal(ownInvoicePdf.invoice.id, invoice.id);
  assert.equal(ownInvoicePdf.financial_details_visible, false);
  assert.equal(ownInvoicePdf.invoice.subtotal, undefined);
  assert.equal(ownInvoicePdf.invoice.tax_amount, undefined);
  assert.equal(ownInvoicePdf.invoice.total_amount, undefined);
  assert.equal(ownInvoicePdf.lines.length, 1);
  assert.equal(ownInvoicePdf.lines[0].unit_price, undefined);
  assert.equal(ownInvoicePdf.lines[0].line_total, undefined);
  assert.equal(ownInvoicePdf.customer.id, undefined, "PDF customer projection should not return an internal customer primary key");

  // A second customer in the same organization must never receive the first customer's statement.
  await db.unsafe("reset role");
  await setIdentity(secondAuthUserId, "ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  const otherStatementResult = await db.unsafe("select public.get_customer_account_statement() as result");
  assert.deepEqual(otherStatementResult[0].result.invoices, [], "customer two must not see customer one's invoice");
  assert.deepEqual(otherStatementResult[0].result.payments, [], "customer two must not see customer one's payments");
  assert.deepEqual(otherStatementResult[0].result.summary, [], "customer two must not see customer one's financial summary");
  await expectFailure(
    "customer two cannot read customer one's invoice PDF",
    () => db.unsafe("select public.get_customer_invoice_pdf($1::uuid)", [invoice.id]),
    /الفاتورة غير موجودة أو غير متاحة/,
  );
  const otherVisibleInvoices = await db.unsafe(
    "select id,invoice_number from public.customer_invoices where id=$1",
    [invoice.id],
  );
  assert.equal(otherVisibleInvoices.length, 0, "invoice row policy must isolate customer-two reads");

  // Disabled profiles must lose even the explicit statement RPC path.
  await db.unsafe("reset role");
  await db.unsafe("update public.profiles set is_active=false where id=$1", [profileId]);
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "inactive customer statement access",
    () => db.unsafe("select public.get_customer_account_statement()"),
    /authenticated active customer required/i,
  );
  await expectFailure(
    "inactive customer invoice PDF access",
    () => db.unsafe("select public.get_customer_invoice_pdf($1::uuid)", [invoice.id]),
    /authenticated active customer with invoice-read permission required/i,
  );
  await db.unsafe("reset role");
  await db.unsafe("update public.profiles set is_active=true where id=$1", [profileId]);
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");

  const safeInvoiceRows = await db.unsafe(
    "select id,invoice_number,order_id,status,issued_at,currency from public.customer_invoices where id=$1",
    [invoice.id],
  );
  assert.equal(safeInvoiceRows.length, 1, "customer may read non-financial invoice headers");
  const safeInvoiceLines = await db.unsafe(
    "select id,invoice_id,item_code,description,unit,quantity from public.customer_invoice_items where invoice_id=$1",
    [invoice.id],
  );
  assert.equal(safeInvoiceLines.length, 1, "customer may read non-financial invoice line descriptions");
  await expectFailure(
    "customer direct invoice total access",
    () => db.unsafe("select total_amount from public.customer_invoices where id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer SELECT * on invoices",
    () => db.unsafe("select * from public.customer_invoices where id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer direct invoice line unit-price access",
    () => db.unsafe("select unit_price from public.customer_invoice_items where invoice_id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer direct invoice line total access",
    () => db.unsafe("select line_total from public.customer_invoice_items where invoice_id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer direct payment amount access",
    () => db.unsafe("select amount from public.customer_payments where invoice_id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "customer cannot call staff finance RPC",
    () => db.unsafe("select public.fetch_staff_finance_data()"),
    /finance permission required/i,
  );

  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary staff cannot read finance aggregates",
    () => db.unsafe("select public.fetch_staff_finance_data()"),
    /finance permission required/i,
  );
  // DLV-015-STAFF-PAYMENT-DENIAL-001: staff has no financial write capability.
  // Compare complete source rows and all linked audit records; an authorization error alone is insufficient.
  const readOrdinaryStaffPaymentDenialSnapshots = async () => {
    await db.unsafe("reset role");
    const invoiceRows = await db.unsafe(
      "select to_jsonb(source_invoice)::text as snapshot from public.customer_invoices source_invoice " +
        "where source_invoice.organization_id=$1::uuid and source_invoice.id=$2::uuid",
      [organizationId, invoice.id],
    );
    const customerRows = await db.unsafe(
      "select to_jsonb(source_customer)::text as snapshot from public.customers source_customer " +
        "where source_customer.organization_id=$1::uuid and source_customer.id=$2::uuid",
      [organizationId, invoice.customer_id],
    );
    const paymentRows = await db.unsafe(
      "select to_jsonb(source_payment)::text as snapshot from public.customer_payments source_payment " +
        "where source_payment.organization_id=$1::uuid and source_payment.invoice_id=$2::uuid " +
        "order by source_payment.id",
      [organizationId, invoice.id],
    );
    const auditRows = await db.unsafe(
      "select to_jsonb(source_audit)::text as snapshot from public.audit_logs source_audit " +
        "where source_audit.organization_id=$1::uuid and (" +
          "source_audit.entity_id=any($2::uuid[]) or " +
          "(source_audit.new_value->>'invoice_id'=$3::text or source_audit.old_value->>'invoice_id'=$3::text)" +
        ") order by source_audit.created_at,source_audit.id",
      [organizationId, [invoice.id, invoice.customer_id], invoice.id],
    );
    assert.equal(invoiceRows.length, 1, "the protected invoice must remain present in the active tenant");
    assert.equal(customerRows.length, 1, "the protected customer must remain present in the active tenant");
    return {
      invoice: invoiceRows[0].snapshot,
      customer: customerRows[0].snapshot,
      payments: paymentRows.map((row) => row.snapshot),
      audits: auditRows.map((row) => row.snapshot),
    };
  };
  const ordinaryStaffPaymentBefore = await readOrdinaryStaffPaymentDenialSnapshots();
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary staff cannot record customer payments",
    () => db.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3,$4::uuid,$5,$6)",
      [invoice.id, 1, "cash", randomUUID(), "CI-STAFF-PAY", "must be denied"],
    ),
    /finance permission required/i,
    "42501",
  );
  const ordinaryStaffPaymentAfter = await readOrdinaryStaffPaymentDenialSnapshots();
  assert.deepEqual(
    ordinaryStaffPaymentAfter,
    ordinaryStaffPaymentBefore,
    "ordinary staff payment denial leaves the full invoice/customer rows, every payment row and all linked audit records byte-for-byte unchanged",
  );
  await db.unsafe("set role authenticated");
  process.stdout.write(
    "PASS DLV-015-STAFF-PAYMENT-DENIAL-001: ordinary staff receives SQLSTATE 42501; full invoice/customer/payment/audit snapshots remain byte-for-byte unchanged\\n",
  );
  await expectFailure(
    "ordinary staff cannot update invoices directly",
    () => db.unsafe("update public.customer_invoices set status='void' where id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "ordinary staff cannot update invoice lines directly",
    () => db.unsafe("update public.customer_invoice_items set quantity=99 where invoice_id=$1", [invoice.id]),
    /permission denied/i,
  );
  await expectFailure(
    "ordinary staff cannot write payment ledger directly",
    () => db.unsafe("insert into public.customer_payments(organization_id,customer_id,invoice_id,amount,payment_method,created_by) values($1,$2,$3,1,'cash',$4)", [organizationId, invoice.customer_id, invoice.id, operationsStaffProfileId]),
    /permission denied/i,
  );
  await expectFailure(
    "ordinary staff cannot assign user roles directly",
    () => db.unsafe("insert into public.user_roles(profile_id,role) values($1,'manager')", [secondProfileId]),
    /permission denied/i,
  );
  await expectFailure(
    "ordinary staff cannot edit profile tenant/auth binding",
    () => db.unsafe("update public.profiles set organization_id=$1,auth_user_id=$2 where id=$3", [otherOrganizationId, secondAuthUserId, secondProfileId]),
    /permission denied/i,
  );
  const staffCannotReadOtherProfile = await db.unsafe("select id from public.profiles where id=$1", [secondProfileId]);
  assert.equal(staffCannotReadOtherProfile.length, 0, "ordinary staff cannot enumerate customer profiles through PostgREST");
  const staffCannotReadOtherRoles = await db.unsafe("select profile_id,role from public.user_roles where profile_id=$1", [secondProfileId]);
  assert.equal(staffCannotReadOtherRoles.length, 0, "ordinary staff can read only their own role rows");
  await expectFailure(
    "ordinary staff cannot list organization role assignments",
    () => db.unsafe("select public.list_organization_user_roles()"),
    /admin role required/i,
  );
  await expectFailure(
    "ordinary staff cannot change roles through the admin RPC",
    () => db.unsafe("select public.set_organization_user_roles($1::uuid,$2::text[])", [secondProfileId, "{accountant}"]),
    /admin role required/i,
  );

  // A finance-only accountant may read finance surfaces but must see the same
  // server-resolved retail price as a non-approved/untiered customer, never products.base_price.
  const accountantPriceProductId = "e5555555-e555-4555-8555-e55555555555";
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into public.products(id,organization_id,name,item_code,unit,base_price,status) values($1,$2,'CI Accountant Price Boundary','CI-ACCOUNTANT-PRICE-01','unit',99000,'active') on conflict(id) do update set base_price=excluded.base_price,status='active'",
    [accountantPriceProductId, organizationId],
  );
  await db.unsafe(
    "delete from public.product_prices where product_id=$1 and tier='retail'",
    [accountantPriceProductId],
  );
  await db.unsafe(
    "insert into public.product_prices(product_id,tier,price,min_quantity,is_active) values($1,'retail',1234,1,true)",
    [accountantPriceProductId],
  );
  const expectedAccountantRetailRows = await db.unsafe(
    "select public.customer_product_unit_price($1::uuid,$2::uuid,'retail',1) as price",
    [accountantPriceProductId, organizationId],
  );
  assert.equal(Number(expectedAccountantRetailRows[0].price), 1234, "accountant fixture's authoritative retail price is distinct from base_price");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const accountantRoleContext = await db.unsafe(`
    select p.id, p.auth_user_id, p.is_active, p.organization_id,
           coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), ARRAY[]::text[]) as roles
      from public.profiles p
      left join public.user_roles r on r.profile_id=p.id
     where p.auth_user_id=auth.uid()
     group by p.id,p.auth_user_id,p.is_active,p.organization_id
  `);
  assert.equal(accountantRoleContext.length, 1, "accountant JWT must resolve to exactly one profile");
  assert.equal(accountantRoleContext[0].id, accountantProfileId, "accountant JWT resolves to the intended accountant profile");
  assert.ok(accountantRoleContext[0].roles.includes("accountant"), "accountant profile must carry the accountant role");
  assert.ok(!accountantRoleContext[0].roles.some((role) => ["admin","manager","staff"].includes(role)),
    "finance-only accountant fixture must not inherit operational roles");
  await expectFailure(
    "finance-only accountant without customer membership cannot resolve storefront prices",
    () => db.unsafe(
      "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],$2::numeric)",
      [[accountantPriceProductId], 1],
    ),
    /customer membership lacks permission to resolve catalog prices/i,
  );
  const accountantFinanceResult = await db.unsafe("select public.fetch_staff_finance_data() as result");
  const accountantInvoice = accountantFinanceResult[0].result.invoices.find((row) => row.id === invoice.id);
  assert.equal(Number(accountantInvoice.total_amount), 370000, "accountant may read the authorized invoice financial snapshot");
  const accountantPayment = accountantFinanceResult[0].result.payments.find((row) => row.invoice_id === invoice.id);
  assert.equal(Number(accountantPayment.amount), 100000, "accountant may read authorized customer payments");
  await expectFailure(
    "accountant cannot access operational staff order RPC",
    () => db.unsafe("select * from public.fetch_staff_orders()"),
    /staff role required for order access/i,
  );
  await expectFailure(
    "accountant payment command still validates invoice balance",
    () => db.unsafe("select public.record_customer_payment($1::uuid,$2::numeric,$3,$4::uuid,$5,$6)", [invoice.id, 500000, "cash", randomUUID(), "CI-ACCOUNTANT-OVERPAY", "must fail balance check"]),
    /payment exceeds invoice balance/i,
  );

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const listedUsers = await db.unsafe("select public.list_organization_user_roles() as result");
  const listedRows = listedUsers[0].result;
  assert.ok(listedRows.some((row) => row.profile_id === accountantProfileId && row.roles.includes("accountant")),
    "admin may list accountant accounts within the organization");
  assert.ok(!listedRows.some((row) => row.profile_id === foreignProfileId),
    "admin user listing must not include another organization's profiles");
  const snapshotRoleAssignmentState = async (targetProfileId) => {
    await db.unsafe("reset role");
    const rows = await db.unsafe(`
      select p.id, p.organization_id, p.auth_user_id, p.is_active,
             coalesce(
               array_agg(r.role order by r.role) filter (where r.role is not null),
               ARRAY[]::text[]
             ) as roles,
             coalesce((
               select jsonb_agg(
                 jsonb_build_object(
                   'organization_id', a.organization_id,
                   'actor_id', a.actor_id,
                   'old_value', a.old_value,
                   'new_value', a.new_value,
                   'created_at', a.created_at
                 ) order by a.created_at
               )
               from public.audit_logs a
               where a.entity_type = 'profile'
                 and a.entity_id = p.id
                 and a.action = 'user.roles.changed'
             ), '[]'::jsonb) as role_change_audit
        from public.profiles p
        left join public.user_roles r on r.profile_id = p.id
       where p.id = $1
       group by p.id
    `, [targetProfileId]);
    assert.equal(rows.length, 1, "role-denial fixture profile must exist for before/after verification");
    return {
      profile: {
        id: rows[0].id,
        organization_id: rows[0].organization_id,
        auth_user_id: rows[0].auth_user_id,
        is_active: rows[0].is_active,
      },
      roles: rows[0].roles,
      role_change_audit: rows[0].role_change_audit,
    };
  };
  const assertDeniedRoleChangeHasNoMutation = async (label, targetProfileId, requestedRoles, pattern, sqlState) => {
    const before = await snapshotRoleAssignmentState(targetProfileId);
    await setIdentity(staffAuthUserId, "admin@aghbari.ye");
    await db.unsafe("set role authenticated");
    await expectFailure(
      label,
      () => db.unsafe(
        "select public.set_organization_user_roles($1::uuid,$2::text[])",
        [targetProfileId, requestedRoles],
      ),
      pattern,
      sqlState,
    );
    const after = await snapshotRoleAssignmentState(targetProfileId);
    assert.deepEqual(
      after,
      before,
      label + " must preserve target profile, role assignments, and role-change audit history",
    );
    await setIdentity(staffAuthUserId, "admin@aghbari.ye");
    await db.unsafe("set role authenticated");
  };

  await assertDeniedRoleChangeHasNoMutation(
    "administrator cannot change their own roles through role-management RPC",
    staffProfileId,
    "{staff}",
    /cannot change their own roles/i,
    "42501",
  );
  await assertDeniedRoleChangeHasNoMutation(
    "administrator cannot assign a role outside the organization",
    foreignProfileId,
    "{accountant}",
    /outside the current organization/i,
    "42501",
  );
  await assertDeniedRoleChangeHasNoMutation(
    "customer role cannot be combined with operational/accountant roles",
    secondProfileId,
    "{customer,accountant}",
    /customer role cannot be combined/i,
    "22023",
  );
  await assertDeniedRoleChangeHasNoMutation(
    "administrator cannot assign an unsupported elevated role",
    secondProfileId,
    "{superadmin}",
    /unsupported user role/i,
    "22023",
  );
  await assertDeniedRoleChangeHasNoMutation(
    "administrator cannot submit duplicate roles",
    secondProfileId,
    "{staff,staff}",
    /duplicate user roles are not allowed/i,
    "22023",
  );
  const assignedAccountant = await db.unsafe(
    "select public.set_organization_user_roles($1::uuid,$2::text[]) as result",
    [operationsStaffProfileId, "{accountant}"],
  );
  assert.deepEqual(assignedAccountant[0].result.roles.sort(), ["accountant"],
    "admin can assign the accountant finance-only role");
  const auditedRoleChange = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and actor_id=$2 and entity_type='profile' and entity_id=$3",
    [organizationId, staffProfileId, operationsStaffProfileId],
  );
  assert.ok(auditedRoleChange.some((row) => row.action === "user.roles.changed"), "role assignment must be audited");
  const restoredOperationsRole = await db.unsafe(
    "select public.set_organization_user_roles($1::uuid,$2::text[]) as result",
    [operationsStaffProfileId, "{staff}"],
  );
  assert.deepEqual(restoredOperationsRole[0].result.roles.sort(), ["staff"],
    "admin can restore the operations role after the role assignment test");
  const authorizedFinance = await db.unsafe("select public.fetch_staff_finance_data() as result");
  const staffInvoice = authorizedFinance[0].result.invoices.find((row) => row.id === invoice.id);
  const staffPayment = authorizedFinance[0].result.payments.find((row) => row.invoice_id === invoice.id);
  assert.equal(Number(staffInvoice.total_amount), 370000, "staff finance RPC retains invoice totals");
  assert.equal(Number(staffPayment.amount), 100000, "staff finance RPC retains payment amounts");

  const customer360Result = await db.unsafe("select public.get_staff_customer_360($1::uuid) as result", [invoice.customer_id]);
  const customer360 = customer360Result[0].result;
  assert.equal(customer360.customer.id, invoice.customer_id, "staff 360 returns only the selected customer within the active tenant");
  assert.ok(customer360.order_summary.order_count >= 1, "customer 360 counts all orders server-side");
  assert.ok(customer360.recent_orders.length >= 1 && customer360.recent_orders.length <= 20, "customer 360 returns a non-empty, bounded recent order history for the selected customer");
  assert.ok(customer360.finance_by_currency.some((row) => row.currency === "YER" && Number(row.invoiced_total) >= 370000),
    "customer 360 full-ledger invoice summary includes the generated invoice");
  assert.ok(Array.isArray(customer360.recent_invoices) && customer360.recent_invoices.length <= 20, "customer 360 returns a bounded recent invoice detail list while finance_by_currency preserves full-ledger totals");
  assert.ok(Array.isArray(customer360.recent_payments) && customer360.recent_payments.length <= 20, "customer 360 returns a bounded recent payment detail list while finance_by_currency preserves full-ledger payment aggregates");
  assert.ok(customer360.top_products.some((row) => row.item_code === "CI-ITEM-01" || row.quantity >= 1),
    "customer 360 derives a most-purchased product from persisted order lines");
  assert.ok(Array.isArray(customer360.recommendations), "customer 360 returns deterministic recommendation list");
  await expectFailure(
    "staff customer 360 rejects customers outside the active tenant",
    () => db.unsafe("select public.get_staff_customer_360($1::uuid)", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
    /العميل غير موجود ضمن المؤسسة الحالية|42501/i,
  );
  process.stdout.write("PASS staff customer 360: tenant-bound full ledger aggregates, bounded recent history, top products and deterministic follow-up signals\\n");

  // AGH-PURCHASE-RECEIVING-001: server-only purchase lifecycle, stock ledger atomicity and idempotent source task.
  await db.unsafe("reset role");
  const purchaseSupplier = await db.unsafe(
    "insert into public.suppliers(organization_id,supplier_code,name,status) values($1,'CI-PO-001','CI Purchase Supplier','active') on conflict(organization_id,supplier_code) do update set status='active' returning id",
    [organizationId],
  );
  assert.equal(purchaseSupplier.length,1,"CI supplier fixture must exist only inside the isolated test database");
  const receivingWarehouseId = "d0000000-0000-0000-0000-000000000001";
  const stockBeforePurchase = await db.unsafe(
    "select quantity_on_hand from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId,receivingWarehouseId],
  );
  assert.equal(stockBeforePurchase.length,1,"CI receiving fixture must use a persisted warehouse balance");
  const openingOnHand = Number(stockBeforePurchase[0].quantity_on_hand);
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const purchaseLines = db.json([{product_id:productId,quantity:2,unit_cost:12.5}]);
  const createPoResult = await db.unsafe(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [purchaseSupplier[0].id,receivingWarehouseId,purchaseLines,"CI purchase receiving lifecycle","ci-purchase-order-key-000001"],
  );
  const purchaseOrder = createPoResult[0].result.purchase_order;
  assert.equal(purchaseOrder.status,"draft");
  assert.equal(Number(purchaseOrder.total_cost),25);
  assert.equal(purchaseOrder.items.length,1);
  assert.equal(typeof purchaseOrder.items[0].item_code, "string");
  assert.ok(purchaseOrder.items[0].item_code.length > 0,
    "purchase order keeps a non-empty authoritative product-code snapshot from the canonical product row");
  const replayPo = await db.unsafe(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [purchaseSupplier[0].id,receivingWarehouseId,purchaseLines,"CI purchase receiving lifecycle","ci-purchase-order-key-000001"],
  );
  assert.equal(replayPo[0].result.idempotent_replay,true,"repeated draft submission with the same key must return the original order");
  assert.equal(replayPo[0].result.purchase_order.id,purchaseOrder.id);
  await expectFailure(
    "purchase order idempotency key cannot be reused for a changed payload",
    () => db.unsafe(
      "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text)",
      [purchaseSupplier[0].id,receivingWarehouseId,db.json([{product_id:productId,quantity:3,unit_cost:12.5}]),"CI purchase receiving lifecycle","ci-purchase-order-key-000001"],
    ),
    /purchase order idempotency key payload conflict/i,
  );
  const unknownCostPoResult = await db.unsafe(
    "select public.create_purchase_order($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::text) as result",
    [purchaseSupplier[0].id,receivingWarehouseId,db.json([{product_id:productId,quantity:1,unit_cost:null}]),"Cost not supplied by source","ci-purchase-order-key-000002"],
  );
  assert.equal(unknownCostPoResult[0].result.purchase_order.total_cost,null,"missing supplier cost must not be treated as zero");
  assert.equal(unknownCostPoResult[0].result.purchase_order.items[0].unit_cost,null);
  // AGH-PURCHASE-CANCEL-SECURITY-001: rejection is tenant-safe and has no side effects.
  const unknownCostPurchaseOrderId = unknownCostPoResult[0].result.purchase_order.id;
  const foreignPurchaseManagerAuthId = randomUUID();
  const foreignPurchaseManagerProfileId = randomUUID();
  const foreignPurchaseManagerEmail = "ci-po-foreign-manager-" + foreignPurchaseManagerAuthId + "@example.test";
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) " +
      "on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [foreignPurchaseManagerAuthId, foreignPurchaseManagerEmail],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1,$2,$3,'CI Foreign Purchase Manager',$4,true)",
    [foreignPurchaseManagerProfileId, foreignPurchaseManagerAuthId, otherOrganizationId, foreignPurchaseManagerEmail],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'manager')",
    [foreignPurchaseManagerProfileId],
  );

  async function assertPurchaseOrderCancellationUnchanged(label) {
    await db.unsafe("reset role").catch(() => {});
    const orderRows = await db.unsafe(
      "select status,cancelled_by::text as cancelled_by,cancelled_at::text as cancelled_at,cancellation_reason " +
        "from public.purchase_orders where id=$1::uuid",
      [unknownCostPurchaseOrderId],
    );
    assert.equal(orderRows.length, 1, label + ": purchase order remains present");
    assert.deepEqual(orderRows[0], {
      status: "draft",
      cancelled_by: null,
      cancelled_at: null,
      cancellation_reason: null,
    }, label + ": denied cancellation must preserve purchase-order state");
    const auditRows = await db.unsafe(
      "select count(*)::integer as count from public.audit_logs " +
        "where organization_id=$1::uuid and action='purchase_order.cancelled' " +
        "and entity_type='purchase_order' and entity_id=$2::uuid",
      [organizationId, unknownCostPurchaseOrderId],
    );
    assert.equal(Number(auditRows[0]?.count ?? 0), 0, label + ": denied cancellation must not write a cancellation audit");
    const receiptRows = await db.unsafe(
      "select count(*)::integer as count from public.purchase_receipts where purchase_order_id=$1::uuid",
      [unknownCostPurchaseOrderId],
    );
    assert.equal(Number(receiptRows[0]?.count ?? 0), 0, label + ": denied cancellation must not create a receipt");
    const movementRows = await db.unsafe(
      "select count(*)::integer as count from public.inventory_movements " +
        "where reference_type='purchase_order' and reference_id=$1::uuid",
      [unknownCostPurchaseOrderId],
    );
    assert.equal(Number(movementRows[0]?.count ?? 0), 0, label + ": denied cancellation must not create an inventory movement");
    const balanceRows = await db.unsafe(
      "select quantity_on_hand from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",
      [productId, receivingWarehouseId],
    );
    assert.equal(balanceRows.length, 1, label + ": the inventory balance fixture remains present");
    assert.equal(Number(balanceRows[0].quantity_on_hand), openingOnHand,
      label + ": denied cancellation must not change on-hand inventory");
  }

  async function expectPurchaseOrderCancellationDenied(authId, identityEmail, label, expectedState, expectedMessage) {
    await db.unsafe("reset role");
    await setIdentity(authId, identityEmail);
    await db.unsafe("set role authenticated");
    await db.unsafe("begin");
    await db.unsafe("savepoint purchase_order_cancel_denial");
    const failure = await db.unsafe(
      "select public.cancel_purchase_order($1::uuid,$2::text)",
      [unknownCostPurchaseOrderId, "CI rejected cancel must not mutate"],
    ).then(() => null, (error) => error);
    await db.unsafe("rollback to savepoint purchase_order_cancel_denial");
    await db.unsafe("release savepoint purchase_order_cancel_denial");
    await db.unsafe("commit");
    await db.unsafe("reset role");
    assert.ok(failure, label + ": cancellation should be denied");
    assert.equal(failure.code, expectedState, label + ": expected SQLSTATE");
    assert.match(String(failure.message), expectedMessage, label + ": expected denial reason");
    await assertPurchaseOrderCancellationUnchanged(label);
  }

  await expectPurchaseOrderCancellationDenied(
    operationsStaffAuthUserId,
    "ci-operations-staff@example.test",
    "same-tenant ordinary staff cannot cancel a purchase order",
    "42501",
    /admin or manager role required to cancel purchase orders/i,
  );
  await expectPurchaseOrderCancellationDenied(
    foreignPurchaseManagerAuthId,
    foreignPurchaseManagerEmail,
    "foreign-tenant manager cannot cancel or learn whether a purchase order exists",
    "42501",
    /purchase order is not available in this organization/i,
  );

  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const cancelledUnknownCost = await db.unsafe(
    "select public.cancel_purchase_order($1::uuid,$2::text) as result",
    [unknownCostPoResult[0].result.purchase_order.id,"CI cancel unused unknown-cost draft"],
  );
  assert.equal(cancelledUnknownCost[0].result.purchase_order.status,"cancelled");
  const submittedPoResult = await db.unsafe(
    "select public.submit_purchase_order($1::uuid) as result",
    [purchaseOrder.id],
  );
  assert.equal(submittedPoResult[0].result.purchase_order.status,"submitted");
  const poItemId = purchaseOrder.items[0].id;
  const overReceipt = db.json([{item_id:poItemId,quantity:2.01}]);
  await expectFailure(
    "purchase receiving must not exceed the outstanding ordered quantity",
    () => db.unsafe("select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text)",
      [purchaseOrder.id,overReceipt,"CI over-receipt must roll back","ci-purchase-receipt-over-0001"]),
    /receipt quantity exceeds outstanding ordered quantity/i,
  );
  await db.unsafe("reset role");
  const stockBeforePosting = await db.unsafe(
    "select quantity_on_hand from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId,receivingWarehouseId],
  );
  assert.equal(Number(stockBeforePosting[0].quantity_on_hand),openingOnHand,
    "purchase draft/submission and rejected over-receipt must not change on-hand inventory");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const partialLines = [{item_id:poItemId,quantity:1.25}];
  // Force two authenticated receivers to queue at the documented warehouse lock.
  // The PO row lock means one caller may wait on the PO while the first waits on
  // the warehouse key; require both sessions to be blocked before gate release.
  const receiptRaceRacer = postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const receiptRaceGate = postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  let receiptGateOpen = false;
  let receiptAttemptPromises;
  let receiptAttempts;
  let receiptRaceResults;
  try {
    await receiptRaceRacer.unsafe("reset role").catch(()=>{});
    await receiptRaceRacer.unsafe(
      "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI purchase receipt race session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
      [staffAuthUserId],
    );
    await receiptRaceRacer.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[staffAuthUserId]);
    await receiptRaceRacer.unsafe("select set_config('request.jwt.claims',$1,false)",[
      JSON.stringify({sub:staffAuthUserId,email:"admin@aghbari.ye",role:"authenticated",session_id:staffAuthUserId}),
    ]);
    await receiptRaceRacer.unsafe("set role authenticated");
    await db.unsafe("select set_config('application_name',$1,false)",["ci-po-receive-a"]);
    await receiptRaceRacer.unsafe("select set_config('application_name',$1,false)",["ci-po-receive-b"]);
    await receiptRaceGate.unsafe("begin");
    receiptGateOpen = true;
    await receiptRaceGate.unsafe(
      "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text,0))",
      [organizationId + ":purchase-receiving-warehouse:" + receivingWarehouseId],
    );
    receiptAttemptPromises = [
      db.unsafe(
        "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
        [purchaseOrder.id,db.json(partialLines),"CI partial physical receipt","ci-purchase-receipt-key-000001"],
      ),
      receiptRaceRacer.unsafe(
        "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
        [purchaseOrder.id,receiptRaceRacer.json(partialLines),"CI partial physical receipt","ci-purchase-receipt-key-000001"],
      ),
    ];
    receiptAttempts = Promise.all(receiptAttemptPromises);
    let bothReceiptWritersWaiting = false;
    let receiptActivitySnapshot = [];
    for (let attempt = 0; attempt < 400; attempt += 1) {
      receiptActivitySnapshot = await receiptRaceGate.unsafe(
        "select application_name,state,wait_event_type,wait_event,left(query,180) as query " +
        "from pg_catalog.pg_stat_activity " +
        "where application_name in ('ci-po-receive-a','ci-po-receive-b')",
      );
      bothReceiptWritersWaiting = receiptActivitySnapshot.filter((row) =>
        row.state === "active" && row.wait_event_type === "Lock"
      ).length === 2;
      if (bothReceiptWritersWaiting) break;
      await new Promise((resolve) => setTimeout(resolve,25));
    }
    if (!bothReceiptWritersWaiting) {
      await receiptRaceGate.unsafe("rollback");
      receiptGateOpen = false;
      const outcomes = await Promise.allSettled(receiptAttemptPromises);
      assert.fail("purchase receipt lock contention was not observed for both RPC calls: " + JSON.stringify({
        activity:receiptActivitySnapshot,
        outcomes:outcomes.map((outcome) => outcome.status === "fulfilled"
          ? {ok:true}
          : {ok:false,error:String(outcome.reason?.message ?? outcome.reason)}),
      }));
    }
    await receiptRaceGate.unsafe("commit");
    receiptGateOpen = false;
    receiptRaceResults = await receiptAttempts;
  } finally {
    if (receiptGateOpen) await receiptRaceGate.unsafe("rollback").catch(()=>{});
    if (receiptAttemptPromises) await Promise.allSettled(receiptAttemptPromises);
    await Promise.all([
      receiptRaceGate.end({timeout:5}).catch(()=>{}),
      receiptRaceRacer.end({timeout:5}).catch(()=>{}),
    ]);
  }
  const receiptRaceValues = receiptRaceResults.map((rows) => rows[0].result);
  assert.equal(receiptRaceValues.filter((result) => result.idempotent_replay === false).length,1,
    "one concurrent purchase-receipt request creates the receipt");
  assert.equal(receiptRaceValues.filter((result) => result.idempotent_replay === true).length,1,
    "the identical concurrent request replays the committed receipt");
  assert.equal(receiptRaceValues[0].receipt.id,receiptRaceValues[1].receipt.id,
    "concurrent identical receipt requests return one canonical receipt ID");
  const partialReceipt = receiptRaceValues.find((result) => result.idempotent_replay === false);
  assert.ok(partialReceipt,"the race must identify the one original purchase receipt");
  process.stdout.write("PASS purchase receipt concurrency: observed PostgreSQL lock contention returns one canonical receipt and a replay.\\n");
  assert.equal(partialReceipt.purchase_order.status,"partially_received");
  assert.equal(partialReceipt.idempotent_replay,false);
  assert.equal(Number(partialReceipt.purchase_order.items[0].quantity_received),1.25);
  const partialReplay = await db.unsafe(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [purchaseOrder.id,partialLines,"CI partial physical receipt","ci-purchase-receipt-key-000001"],
  );
  assert.equal(partialReplay[0].result.idempotent_replay,true);
  assert.equal(partialReplay[0].result.receipt.id,partialReceipt.receipt.id);
  await expectFailure(
    "purchase receipt idempotency key cannot be reused for a changed payload",
    () => db.unsafe("select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text)",
      [purchaseOrder.id,db.json([{item_id:poItemId,quantity:1}]),"CI changed receipt payload","ci-purchase-receipt-key-000001"]),
    /purchase receipt idempotency key payload conflict/i,
  );
  await db.unsafe("reset role");
  const stockAfterPartial = await db.unsafe(
    "select quantity_on_hand from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId,receivingWarehouseId],
  );
  assert.equal(Number(stockAfterPartial[0].quantity_on_hand),openingOnHand+1.25,
    "a repeated partial receipt must not double-post the quantity");
  const receivingTaskRows = await db.unsafe(
    "select id,status from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId,"purchase-order-receiving:"+purchaseOrder.id],
  );
  assert.equal(receivingTaskRows.length,1,"submitted purchase order must produce one idempotent warehouse task");
  assert.ok(["pending","in_progress"].includes(receivingTaskRows[0].status),"partial receipt must leave the receiving task open");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const finalReceiptResult = await db.unsafe(
    "select public.receive_purchase_order($1::uuid,$2::jsonb,$3::text,$4::text) as result",
    [purchaseOrder.id,db.json([{item_id:poItemId,quantity:0.75}]),"CI final physical receipt","ci-purchase-receipt-key-000002"],
  );
  assert.equal(finalReceiptResult[0].result.purchase_order.status,"received");
  assert.equal(Number(finalReceiptResult[0].result.purchase_order.items[0].quantity_received),2);
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary customer cannot read the purchase-order inbox",
    () => db.unsafe("select public.fetch_purchase_orders()"),
    /admin or manager role required/i,
  );
  await expectFailure(
    "ordinary customer cannot read purchase order records directly",
    () => db.unsafe("select id from public.purchase_orders"),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const finalStock = await db.unsafe(
    "select quantity_on_hand from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId,receivingWarehouseId],
  );
  assert.equal(Number(finalStock[0].quantity_on_hand),openingOnHand+2,
    "partial and final receipt quantities must each post exactly once to inventory");
  const purchaseMovements = await db.unsafe(
    "select count(*)::int as count from public.inventory_movements where reference_type='purchase_receipt' and reference_id=any($1::uuid[])",
    [[partialReceipt.receipt.id,finalReceiptResult[0].result.receipt.id]],
  );
  assert.equal(purchaseMovements[0].count,2,"each persisted receipt line must create one auditable inventory movement");
  const listedPurchases = await db.unsafe("select public.fetch_purchase_orders() as result");
  assert.ok(listedPurchases[0].result.some((row) => row.id === purchaseOrder.id && row.status === "received"),
    "manager retrieves the final purchase status through the authorized RPC, not direct table SELECT");
  await db.unsafe("reset role");
  const completedReceivingTask = await db.unsafe(
    "select id,status,resolution_note from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId,"purchase-order-receiving:"+purchaseOrder.id],
  );
  assert.equal(completedReceivingTask.length,1,"receipt lifecycle must not duplicate its task");
  assert.equal(completedReceivingTask[0].status,"completed","full receipt should close the associated warehouse task");
  const purchaseAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='purchase_order' and entity_id=$2",
    [organizationId,purchaseOrder.id],
  );
  assert.ok(purchaseAudit.some((row) => row.action==="purchase_order.created"));
  assert.ok(purchaseAudit.some((row) => row.action==="purchase_order.submitted"));
  process.stdout.write("PASS purchase orders: tenant-scoped commands, idempotent create/receipt, unknown-cost handling, partial/full stock posting, task-center integration and audit evidence\\n");


  await db.unsafe("update public.orders set status='processing' where id=$1", [order.id]);
  await db.unsafe("update public.orders set status='shipped' where id=$1", [order.id]);
  const stockAfterShipment = await db.unsafe(
    "select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id='d0000000-0000-0000-0000-000000000001'",
    [productId],
  );
  assert.equal(Number(stockAfterShipment[0].quantity_on_hand), openingOnHand + 2 - 10, "shipping consumes the original ten ordered units while preserving the two units physically received from the purchase order");
  assert.equal(Number(stockAfterShipment[0].quantity_reserved), 0, "shipping should clear the stock reservation");
  await expectFailure(
    "cancelling a shipped order",
    () => db.unsafe("update public.orders set status='cancelled' where id=$1", [order.id]),
    /shipped order cannot be cancelled|shipped.*cannot be cancelled/i,
  );
  await db.unsafe("update public.orders set status='delivered' where id=$1", [order.id]);
  const saleMovements = await db.unsafe(
    "select count(*)::int as count from public.inventory_movements where reference_type='order' and reference_id=$1 and movement_type='sale'",
    [order.id],
  );
  assert.equal(saleMovements[0].count, 1, "delivery must not consume the same stock twice");

  const orderLifecycleHistory = await db.unsafe(
    "select from_status,to_status,changed_by from public.order_status_history " +
      "where order_id=$1 and to_status = any($2::text[]) " +
      "order by case to_status when 'processing' then 1 when 'shipped' then 2 when 'delivered' then 3 else 4 end",
    [order.id, ["processing", "shipped", "delivered"]],
  );
  assert.deepEqual(
    orderLifecycleHistory.map((row) => [row.from_status, row.to_status]),
    [["confirmed", "processing"], ["processing", "shipped"], ["shipped", "delivered"]],
    "each successful order lifecycle transition must append one ordered from/to audit record",
  );
  assert.ok(
    orderLifecycleHistory.every((row) => row.changed_by === staffProfileId),
    "order status history must record the active tenant staff actor, not a null or foreign actor",
  );
  const rejectedCancelHistory = await db.unsafe(
    "select id from public.order_status_history where order_id=$1 and to_status='cancelled'",
    [order.id],
  );
  assert.equal(rejectedCancelHistory.length, 0,
    "a rejected shipped-order cancellation must not append a false status-history record");
  process.stdout.write("PASS order lifecycle audit: ordered transitions, same-tenant actor attribution and no audit row for rejected cancellation\\n");

  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const reviewOrderResult = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7) as result",
    [db.json([{ product_id: productId, quantity: 2 }]), "CI review workflow", "CI Company One", "CI Customer One",
      "7771111111", "credit", "ci-review-order-000001"],
  );
  const reviewOrder = reviewOrderResult[0].result;
  const reviewItemRows = await db.unsafe(
    "select id,quantity from public.order_items where order_id=$1",
    [reviewOrder.id],
  );
  assert.equal(reviewItemRows.length, 1, "customer may read the non-financial review line identity");
  assert.equal(Number(reviewItemRows[0].quantity), 2);

  // Switch to staff identity before reading any financial line fields.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const staffReviewItems = await db.unsafe(
    "select id,quantity,unit_price_snapshot from public.fetch_staff_order_items($1::uuid)",
    [reviewOrder.id],
  );
  assert.equal(staffReviewItems.length, 1, "staff must get review lines from the tenant-scoped RPC");
  assert.equal(Number(staffReviewItems[0].unit_price_snapshot), 38500, "the original quantity-two line snapshot must remain intact before the one-order override");
  const reviewLines = [{
    item_id: reviewItemRows[0].id,
    quantity: 1,
    unit_price: 36000,
    price_reason: "CI one-order override; not a catalog price change",
  }];
  const stagedReview = await db.unsafe(
    "select public.review_order_lines($1::uuid,$2::jsonb,$3,$4) as result",
    [reviewOrder.id, db.json(reviewLines), "stage", "CI order review"],
  );
  assert.equal(stagedReview[0].result.quantity_review_required, true, "changed quantities must be marked unapproved");
  await expectFailure(
    "Onyx export audit rejects an order with an unapproved quantity/price review",
    () => db.unsafe("select public.record_onyx_order_export($1::uuid,$2::integer)", [reviewOrder.id, 1]),
    /only approved orders/i,
  );
  await expectFailure(
    "direct confirmation with unapproved order proposals",
    () => db.unsafe("update public.orders set status='confirmed' where id=$1", [reviewOrder.id]),
    /اعتماد كل الكميات والأسعار|unapproved|approval/i,
  );
  const approvedReview = await db.unsafe(
    "select public.review_order_lines($1::uuid,$2::jsonb,$3,$4) as result",
    [reviewOrder.id, db.json(reviewLines), "approve", "CI order review"],
  );
  assert.equal(approvedReview[0].result.status, "confirmed", "approved review must confirm the order");
  assert.equal(Number(approvedReview[0].result.total_amount), 36000, "order total must be recalculated from approved price and quantity");
  const reviewedState = await db.unsafe(
    "select status,total_amount,quantity_review_required,payment_request_status,customer_payment_requested_at from public.fetch_staff_orders() where id=$1",
    [reviewOrder.id],
  );
  assert.equal(reviewedState[0].status, "confirmed");
  assert.equal(Number(reviewedState[0].total_amount), 36000);
  assert.equal(reviewedState[0].quantity_review_required, false);
  assert.equal(reviewedState[0].payment_request_status, "requested");
  assert.ok(reviewedState[0].customer_payment_requested_at, "customer payment request should be recorded at confirmation");
  const reviewedLines = await db.unsafe(
    "select quantity,requested_quantity,approved_quantity,unit_price_snapshot,approved_unit_price,price_override_reason from public.fetch_staff_order_items($1::uuid)",
    [reviewOrder.id],
  );
  assert.equal(Number(reviewedLines[0].requested_quantity), 2, "original requested quantity must remain auditable");
  assert.equal(Number(reviewedLines[0].approved_quantity), 1);
  assert.equal(Number(reviewedLines[0].quantity), 1);
  assert.equal(Number(reviewedLines[0].approved_unit_price), 36000);
  assert.match(reviewedLines[0].price_override_reason, /CI one-order override/);
  const reviewedFinance = await db.unsafe("select public.fetch_staff_finance_data() as result");
  const reviewedInvoice = reviewedFinance[0].result.invoices.filter((row) => row.order_id === reviewOrder.id);
  assert.equal(reviewedInvoice.length, 1, "approval should issue exactly one invoice");
  assert.equal(Number(reviewedInvoice[0].total_amount), 36000);

  const onyxAuditCreated = await db.unsafe(
    "select public.record_onyx_order_export($1::uuid,$2::integer) as id",
    [reviewOrder.id, reviewedLines.length],
  );
  const onyxAuditId = onyxAuditCreated[0].id;
  assert.match(onyxAuditId, /^[0-9a-f-]{36}$/i, "the server must return a persisted audit event ID");
  const onyxAudit = await db.unsafe(
    "select organization_id,actor_id,action,entity_type,entity_id,new_value from public.audit_logs where id=$1",
    [onyxAuditId],
  );
  assert.equal(onyxAudit.length, 1, "prepared export must persist one server-side audit record");
  assert.equal(onyxAudit[0].organization_id, organizationId);
  assert.equal(onyxAudit[0].actor_id, staffProfileId);
  assert.equal(onyxAudit[0].action, "onyx_export.prepared");
  assert.equal(onyxAudit[0].entity_type, "order");
  assert.equal(onyxAudit[0].entity_id, reviewOrder.id);
  assert.equal(onyxAudit[0].new_value.format, "xlsx");
  assert.equal(onyxAudit[0].new_value.profile, "onyx-order-27/v1");
  assert.equal(onyxAudit[0].new_value.column_count, 27);
  assert.equal(onyxAudit[0].new_value.item_count, 1);
  assert.equal(onyxAudit[0].new_value.compatibility_verified, false);
  assert.equal(onyxAudit[0].new_value.download_completion_verified, false,
    "the event must not claim the browser completed the download");
  await expectFailure(
    "Onyx export audit rejects a caller-supplied row count that differs from persisted order items",
    () => db.unsafe("select public.record_onyx_order_export($1::uuid,$2::integer)", [reviewOrder.id, 2]),
    /item count does not match/i,
  );

  // A staff export must not cross organizations even when the foreign order itself is eligible.
  await db.unsafe("reset role");
  const foreignAuditCustomerResult = await db.unsafe(
    `insert into public.customers(
       organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at
     ) values($1,$2,'CI-ONYX-FOREIGN','CI Onyx Foreign Customer','CI Foreign Contact','7779999999',
       'ci-onyx-foreign@example.test','wholesale',0,0,'approved',now())
     returning id`,
    [otherOrganizationId, foreignProfileId],
  );
  const foreignAuditOrderResult = await db.unsafe(
    `insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,created_by)
     values($1,$2,'CI-ONYX-FOREIGN-ORDER','confirmed',0,1,$3) returning id`,
    [otherOrganizationId, foreignAuditCustomerResult[0].id, foreignProfileId],
  );
  const foreignAuditOrderId = foreignAuditOrderResult[0].id;
  await db.unsafe(
    `insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total)
     values($1,$2,'CI-ONYX-FOREIGN-ITEM','Foreign item','unit',1,0,0)`,
    [foreignAuditOrderId, otherProductId],
  );
  await db.unsafe("set role authenticated");
  await expectFailure(
    "staff cannot create an Onyx export audit for an order in another organization",
    () => db.unsafe("select public.record_onyx_order_export($1::uuid,$2::integer)", [foreignAuditOrderId, 1]),
    /order not found in the active organization/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot prepare an Onyx order export",
    () => db.unsafe("select public.record_onyx_order_export($1::uuid,$2::integer)", [reviewOrder.id, 1]),
    /staff permission required/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "staff cannot bypass the product price boundary with a direct table read",
    () => db.unsafe("select base_price from public.products where id=$1", [productId]),
    /permission denied/i,
  );
  const staffProducts = await db.unsafe(
    "select id,organization_id,base_price from public.fetch_staff_products($1::uuid)",
    [productId],
  );
  assert.equal(staffProducts.length, 1, "authorized staff can read sensitive product fields through the protected RPC");
  assert.equal(staffProducts[0].organization_id, organizationId, "staff product RPC enforces tenant scope");
  const staffForeignProducts = await db.unsafe(
    "select id from public.fetch_staff_products(null::uuid) where organization_id<>$1",
    [organizationId],
  );
  assert.equal(staffForeignProducts.length, 0, "staff product RPC cannot return foreign tenant products");
  process.stdout.write("PASS raw product price boundary: anon/customer table reads denied and staff RPC tenant-scoped\\n");
  process.stdout.write("PASS Onyx export audit: server-derived actor/tenant, approved-order guard, row-count validation, central audit persistence and cross-tenant/customer denial\\n");
  process.stdout.write("PASS order-review approval, stale/unapproved confirmation guard, one-order price override, invoice and payment-request lifecycle\\n");

  const importRequestKey = randomUUID();
  const importRequestArgs = [
    importRequestKey,
    "CI Onyx.stock.final.csv",
    "a".repeat(64),
    500,
    "onyx_stock",
    "ONYX-BATCH-2026-01-A",
    null,
    "2026-01",
    "ci",
    "new_version",
  ];
  const importCreated = await db.unsafe(
    "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
    importRequestArgs,
  );
  const importJob = importCreated[0].result;
  assert.equal(importJob.organization_id, organizationId, "import tenant must be derived from authenticated staff");
  assert.ok(importJob.profile_id, "import should attach a versioned profile");
  assert.equal(importJob.file_name, "CI Onyx.stock.final.csv", "the original filename remains attached to the batch");
  assert.equal(importJob.source_system, "ci", "the external source system must be persisted on the batch");
  assert.equal(importJob.external_source_reference, "ONYX-BATCH-2026-01-A", "external source/batch reference must be persisted on the batch");
  assert.equal(importJob.raw_file_retained, false, "raw files must not be retained");

  const importReplay = await db.unsafe(
    "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
    importRequestArgs,
  );
  assert.equal(importReplay[0].result.id, importJob.id, "retrying the identical request key must replay the original batch");
  await expectFailure(
    "reject a non-idempotent direct RPC for import-job creation",
    () => db.unsafe(
      "select public.create_import_job($1,$2,$3,$4,$5::uuid,$6,$7) as result",
      ["CI direct job creation bypass.csv", "e".repeat(64), 100, "onyx_stock", null, "2026-01", "onyx_pro"],
    ),
    /permission denied for function create_import_job/i,
    "42501",
  );
  await expectFailure(
    "require an external source reference for non-manual import sources",
    () => db.unsafe(
      "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
      [randomUUID(), "CI missing source reference.csv", "e".repeat(64), 100, "onyx_stock", null, null, "2026-01", "onyx_pro", "new_version"],
    ),
    /مرجع المصدر الخارجي\/رقم الدفعة مطلوب/i,
    "22023",
  );
  const importJobCountAfterReplay = await db.unsafe(
    "select count(*)::integer as count from public.import_jobs where organization_id=$1 and file_hash=$2 and period_key=$3",
    [organizationId, "a".repeat(64), "2026-01"],
  );
  assert.equal(importJobCountAfterReplay[0].count, 1, "request replay must not create a second import job");
  await expectFailure(
    "reject import request-key reuse with a changed file identity",
    () => db.unsafe(
      "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
      [importRequestKey, "different.csv", "b".repeat(64), 500, "onyx_stock", "ONYX-BATCH-2026-01-A", null, "2026-01", "ci", "new_version"],
    ),
    /مفتاح محاولة الاستيراد مستخدم لعملية أو حمولة مختلفة/i,
    "22023",
  );
  await expectFailure(
    "reject reuse of the same request key when the external source batch reference changes",
    () => db.unsafe(
      "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
      [importRequestKey, "CI Onyx.stock.final.csv", "a".repeat(64), 500, "onyx_stock", "ONYX-BATCH-2026-01-B", null, "2026-01", "ci", "new_version"],
    ),
    /مفتاح محاولة الاستيراد مستخدم لعملية أو حمولة مختلفة/i,
    "22023",
  );

  // API-OPS-001: force real concurrent first-claim contention for import-job
  // idempotency. Hold INSERTs into import_jobs after the first caller has claimed
  // the request key; the second caller must be observed waiting on the same key.
  const runObservedImportRequestRace = async ({ applicationPrefix, payloads }) => {
    const gate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
    const clients = [
      postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
      postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 }),
    ];
    let gateOpen = false;
    let roleReset = false;
    let attemptsPromise;
    try {
      await gate.unsafe("begin");
      gateOpen = true;
      await gate.unsafe("lock table public.import_jobs in share mode");
      await Promise.all(clients.map(async (connection, index) => {
        const appName = applicationPrefix + (index === 0 ? "a" : "b");
        await connection.unsafe("select set_config('application_name',$1,false)", [appName]);
        await connection.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [staffAuthUserId]);
        await connection.unsafe("select set_config('request.jwt.claims',$1,false)", [
          JSON.stringify({ sub: staffAuthUserId, email: "admin@aghbari.ye", role: "authenticated", session_id: staffAuthUserId }),
        ]);
        await connection.unsafe("set role authenticated");
      }));
      attemptsPromise = Promise.allSettled(clients.map((connection, index) => connection.unsafe(
        "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
        payloads[index],
      )));
      await db.unsafe("reset role");
      roleReset = true;
      let bothWritersWaiting = false;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const waiting = await db.unsafe(
          "select count(*)::integer as count from pg_catalog.pg_stat_activity " +
          "where application_name like $1 and state='active' and wait_event_type='Lock'",
          [applicationPrefix + "%"],
        );
        if (Number(waiting[0]?.count ?? 0) === 2) {
          bothWritersWaiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(bothWritersWaiting, true,
        "both import idempotency sessions must be observed waiting on PostgreSQL locks before release");
      await gate.unsafe("commit");
      gateOpen = false;
      return await attemptsPromise;
    } finally {
      if (gateOpen) await gate.unsafe("rollback").catch(() => {});
      if (attemptsPromise) await Promise.allSettled([attemptsPromise]);
      if (roleReset) await db.unsafe("set role authenticated").catch(() => {});
      await Promise.all([
        ...clients.map((connection) => connection.end({ timeout: 5 }).catch(() => undefined)),
        gate.end({ timeout: 5 }).catch(() => undefined),
      ]);
    }
  };
  const importRaceRequestArgs = (key, fileName, fileHash, sourceReference) => [
    key, fileName, fileHash, 500, "onyx_stock", sourceReference,
    importJob.profile_id, "2026-04", "ci", "new_version",
  ];
  const inspectImportRequestState = async (requestKey) => {
    const priorRole = (await db.unsafe("select current_setting('role', true) as role"))[0]?.role;
    await db.unsafe("reset role");
    try {
      return await db.unsafe(
        "select count(*)::integer as key_count, count(j.id)::integer as job_count " +
        "from public.import_job_request_keys k left join public.import_jobs j " +
        "on j.id=k.import_job_id and j.organization_id=k.organization_id " +
        "where k.organization_id=$1::uuid and k.actor_profile_id=$2::uuid and k.request_key=$3::uuid",
        [organizationId, staffProfileId, requestKey],
      );
    } finally {
      if (["authenticated", "anon", "service_role"].includes(priorRole)) {
        await db.unsafe("set role " + priorRole);
      }
    }
  };
  const sameImportRaceKey = randomUUID();
  const sameImportRacePayload = importRaceRequestArgs(
    sameImportRaceKey, "CI concurrent idempotent import.csv", "c".repeat(64), "CI-IMPORT-RACE-SAME",
  );
  const sameImportRace = await runObservedImportRequestRace({
    applicationPrefix: "ci-import-idem-same-",
    payloads: [sameImportRacePayload, sameImportRacePayload],
  });
  assert.deepEqual(sameImportRace.map((outcome) => outcome.status), ["fulfilled", "fulfilled"],
    "two concurrent identical import-job requests must both succeed");
  const sameImportRaceResults = sameImportRace.map((outcome) => outcome.value[0].result);
  assert.equal(sameImportRaceResults[0].id, sameImportRaceResults[1].id,
    "identical concurrent requests must return one canonical import-job UUID");
  assert.equal(sameImportRaceResults[0].organization_id, organizationId);
  assert.equal(sameImportRaceResults[1].organization_id, organizationId);
  const sameImportRaceRows = await inspectImportRequestState(sameImportRaceKey);
  assert.equal(sameImportRaceRows[0].key_count, 1, "same-key race must persist one request claim");
  assert.equal(sameImportRaceRows[0].job_count, 1, "same-key race must persist one linked import job");

  const differentImportRaceKey = randomUUID();
  const differentImportRaceA = importRaceRequestArgs(
    differentImportRaceKey, "CI concurrent import payload A.csv", "d".repeat(64), "CI-IMPORT-RACE-DIFFERENT-A",
  );
  const differentImportRaceB = importRaceRequestArgs(
    differentImportRaceKey, "CI concurrent import payload B.csv", "e".repeat(64), "CI-IMPORT-RACE-DIFFERENT-B",
  );
  const differentImportRace = await runObservedImportRequestRace({
    applicationPrefix: "ci-import-idem-diff-",
    payloads: [differentImportRaceA, differentImportRaceB],
  });
  assert.equal(differentImportRace.filter((outcome) => outcome.status === "fulfilled").length, 1,
    "different concurrent payloads sharing one request key must have one winner");
  assert.equal(differentImportRace.filter((outcome) => outcome.status === "rejected").length, 1,
    "changed concurrent payload for the same key must be rejected");
  const rejectedImportRace = differentImportRace.find((outcome) => outcome.status === "rejected");
  assert.match(String(rejectedImportRace?.status === "rejected" ? (rejectedImportRace.reason?.message ?? rejectedImportRace.reason) : ""),
    /مفتاح محاولة الاستيراد مستخدم لعملية أو حمولة مختلفة/i);
  assert.equal(rejectedImportRace?.status === "rejected" ? rejectedImportRace.reason?.code : null, "22023",
    "changed-payload idempotency conflict must use SQLSTATE 22023");
  const differentImportRaceRows = await inspectImportRequestState(differentImportRaceKey);
  assert.equal(differentImportRaceRows[0].key_count, 1, "conflicting race must persist only the winning request claim");
  assert.equal(differentImportRaceRows[0].job_count, 1, "conflicting race must leave only one linked import job");
  process.stdout.write("PASS import-job request idempotency: observed same-key lock contention returns one canonical job; competing payload receives 22023 without a duplicate job.\\n");

  const importRows = [
    { item_code: "000125", product_name: "Rice", quantity: "5", revenue: "150", date: "2026-01-01" },
    { item_code: "000126", product_name: "Sugar", quantity: "10", revenue: "450", date: "2026-01-02" },
  ];
  await db.unsafe(
    "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) values($1,1,'valid',$2::jsonb,'[]'::jsonb),($1,2,'valid',$3::jsonb,'[]'::jsonb)",
    [importJob.id, db.json(importRows[0]), db.json(importRows[1])],
  );

  const importProfile = await db.unsafe(
    "select public.create_central_synonym($1,$2,$3,$4) as result",
    ["رمز الصنف CI", "item_code", importJob.profile_id, "ar"],
  );
  assert.equal(importProfile[0].result.canonical_field, "item_code", "central synonym should persist via tenant-bound RPC");

  const importSession = await db.unsafe("select public.create_import_upload_session($1::uuid) as result", [importJob.id]);
  assert.equal(importSession[0].result.total_chunks, 1, "a small source file should create one upload manifest chunk");
  assert.equal(importSession[0].result.file_type, "csv", "the upload session must use the last filename suffix, not the second dot-delimited segment");
  assert.equal(importSession[0].result.external_source_reference, "ONYX-BATCH-2026-01-A", "upload session must retain the same external source reference");
  await db.unsafe("update public.import_jobs set external_source_reference=$2 where id=$1::uuid",
    [importJob.id, "ONYX-BATCH-2026-01-OTHER"]);
  await expectFailure(
    "reject a session whose external source batch reference no longer matches its import job",
    () => db.unsafe("select public.create_import_upload_session($1::uuid)", [importJob.id]),
    /جلسة الرفع لا تطابق هوية دفعة الاستيراد/i,
    "22023",
  );
  await db.unsafe("update public.import_jobs set external_source_reference=$2 where id=$1::uuid",
    [importJob.id, "ONYX-BATCH-2026-01-A"]);
  const chunkHash = "c".repeat(64);
  const recordedChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [importSession[0].result.id, 0, 0, 500, chunkHash],
  );
  assert.equal(recordedChunk[0].result.complete, true, "all verified chunk metadata should complete the upload manifest");
  const repeatedChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [importSession[0].result.id, 0, 0, 500, chunkHash],
  );
  assert.equal(repeatedChunk[0].result.verified_chunks, 1, "identical chunk retry must not duplicate manifest rows");
  await expectFailure(
    "upload chunk with mismatching digest under same sequence number",
    () => db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5)",
      [importSession[0].result.id, 0, 0, 500, "d".repeat(64)],
    ),
    /تعارض|chunk|شريحة/i,
  );

  // The database must enforce a contiguous chunk prefix even for callers that bypass the UI.
  const uploadChunkBytes = 4 * 1024 * 1024;
  const uploadFinalChunkBytes = 7;
  const multiChunkFileSize = uploadChunkBytes * 2 + uploadFinalChunkBytes;
  const multiChunkJobResult = await db.unsafe(
    "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
    [randomUUID(), "CI import contiguous chunks.csv", "b".repeat(64), multiChunkFileSize, "unified_import", "CI-MULTI-CHUNK-BATCH", null, "2026-02", "ci", "new_version"],
  );
  const multiChunkJob = multiChunkJobResult[0].result;
  await db.unsafe(
    "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) values($1,1,'rejected',$2::jsonb,$3::jsonb)",
    [multiChunkJob.id, db.json({ item_code: "000999", quantity: "not-a-number" }), db.json(["الحقل quantity يجب أن يكون رقمًا صالحًا"])],
  );
  const multiChunkSessionResult = await db.unsafe(
    "select public.create_import_upload_session($1::uuid) as result",
    [multiChunkJob.id],
  );
  const multiChunkSession = multiChunkSessionResult[0].result;
  assert.equal(multiChunkSession.total_chunks, 3, "the fixture should require three upload chunks");

  await expectFailure(
    "reject an out-of-order chunk before the first chunk",
    () => db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5)",
      [multiChunkSession.id, 1, uploadChunkBytes, uploadChunkBytes, "1".repeat(64)],
    ),
    /التتابع|تخطي|متصل/i,
  );
  let multiChunkState = await db.unsafe(
    "select verified_chunks,status from public.import_upload_sessions where id=$1::uuid",
    [multiChunkSession.id],
  );
  assert.equal(multiChunkState[0].verified_chunks, 0, "rejected out-of-order calls must not persist chunk metadata");
  
  const firstMultiChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [multiChunkSession.id, 0, 0, uploadChunkBytes, "a".repeat(64)],
  );
  assert.equal(firstMultiChunk[0].result.verified_chunks, 1);
  assert.equal(firstMultiChunk[0].result.complete, false);
  const repeatedFirstMultiChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [multiChunkSession.id, 0, 0, uploadChunkBytes, "a".repeat(64)],
  );
  assert.equal(repeatedFirstMultiChunk[0].result.verified_chunks, 1, "a lost-response retry must remain idempotent");

  await expectFailure(
    "reject a chunk that skips the next expected sequence number",
    () => db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5)",
      [multiChunkSession.id, 2, uploadChunkBytes * 2, uploadFinalChunkBytes, "3".repeat(64)],
    ),
    /التتابع|تخطي|متصل/i,
  );

  const secondMultiChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [multiChunkSession.id, 1, uploadChunkBytes, uploadChunkBytes, "2".repeat(64)],
  );
  assert.equal(secondMultiChunk[0].result.verified_chunks, 2);
  assert.equal(secondMultiChunk[0].result.complete, false);
  await expectFailure(
    "reject snapshot finalization while an upload manifest is missing its final chunk",
    () => db.unsafe("select public.finalize_import_job($1::uuid,$2) as result", [multiChunkJob.id, "new_version"]),
    /لم يكتمل رفع الملف|شرائح الملف غير مكتمل/i,
    "22023",
  );
  const incompleteFinalizationState = await db.unsafe(
    "select status from public.import_jobs where id=$1::uuid",
    [multiChunkJob.id],
  );
  assert.equal(incompleteFinalizationState[0].status, "staging", "incomplete upload must remain an unfinalized staging job");
  const safelyFailedImport = await db.unsafe(
    "select public.fail_import_job_safely($1::uuid,$2::jsonb) as result",
    [multiChunkJob.id, db.json({ code: "CI_INTERRUPTED_IMPORT", message: "synthetic interruption" })],
  );
  assert.equal(safelyFailedImport[0].result.changed, true, "a nonterminal interrupted job must be reconciled to failed");
  assert.equal(safelyFailedImport[0].result.terminal, false);
  assert.equal(safelyFailedImport[0].result.status, "failed");
  assert.equal(safelyFailedImport[0].result.processed_rows, 1, "failure counts must derive from persisted rows, not stale client counters");
  assert.equal(safelyFailedImport[0].result.failed_rows, 1, "persisted rejected rows must be reconciled into failed_rows");
  const persistedRowError = await db.unsafe(
    "select row_number,errors from public.import_job_rows where import_job_id=$1::uuid and status='rejected' order by row_number limit 1",
    [multiChunkJob.id],
  );
  assert.equal(persistedRowError[0].row_number, 1);
  assert.equal(persistedRowError[0].errors[0], "الحقل quantity يجب أن يكون رقمًا صالحًا",
    "a rejected row must retain its actionable failure reason for the UI");

  const finalMultiChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [multiChunkSession.id, 2, uploadChunkBytes * 2, uploadFinalChunkBytes, "3".repeat(64)],
  );
  assert.equal(finalMultiChunk[0].result.verified_chunks, 3);
  assert.equal(finalMultiChunk[0].result.complete, true, "only a contiguous manifest covering every chunk is complete");
  multiChunkState = await db.unsafe(
    "select verified_chunks,status from public.import_upload_sessions where id=$1::uuid",
    [multiChunkSession.id],
  );
  assert.equal(multiChunkState[0].verified_chunks, 3);
  assert.equal(multiChunkState[0].status, "uploaded");

  // API-OPS-001: prove record_import_upload_chunk is tenant-bound and serializes
  // two authenticated writers registering the same previously absent chunk.
  const chunkRaceRequestKey = randomUUID();
  const chunkRaceFileHash = randomUUID().replaceAll("-", "").repeat(2).slice(0, 64);
  const chunkRaceSourceReference = "CI-CHUNK-RACE-" + randomUUID().slice(0, 8);
  const chunkRaceJobResult = await db.unsafe(
    "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
    [chunkRaceRequestKey, "CI chunk race.csv", chunkRaceFileHash, 500, "onyx_stock", chunkRaceSourceReference, null, "2026-03", "ci", "new_version"],
  );
  const chunkRaceJob = chunkRaceJobResult[0].result;
  const chunkRaceSessionResult = await db.unsafe(
    "select public.create_import_upload_session($1::uuid) as result",
    [chunkRaceJob.id],
  );
  const chunkRaceSession = chunkRaceSessionResult[0].result;
  assert.equal(chunkRaceSession.total_chunks, 1, "concurrency fixture must use a single missing chunk");

  const chunkForeignAuthId = randomUUID();
  const chunkForeignProfileId = randomUUID();
  const chunkForeignEmail = "ci-import-chunk-foreign-" + randomUUID().slice(0, 8) + "@example.test";
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1::uuid,$2,pg_catalog.now())",
    [chunkForeignAuthId, chunkForeignEmail],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1::uuid,$2::uuid,$3::uuid,'CI Foreign Import Manager',$4,true)",
    [chunkForeignProfileId, chunkForeignAuthId, otherOrganizationId, chunkForeignEmail],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1::uuid,'manager')",
    [chunkForeignProfileId],
  );
  const chunkSessionBeforeRows = await db.unsafe(
    "select verified_chunks,status,updated_at::text as updated_at from public.import_upload_sessions where id=$1::uuid",
    [chunkRaceSession.id],
  );
  const chunkRowsBefore = await db.unsafe(
    "select count(*)::int as count from public.import_upload_chunks where session_id=$1::uuid",
    [chunkRaceSession.id],
  );
  assert.equal(chunkRowsBefore[0].count, 0, "new upload manifest must start empty");
  await setIdentity(chunkForeignAuthId, chunkForeignEmail);
  await db.unsafe("set role authenticated");
  await expectFailure(
    "foreign-organization manager cannot register a chunk against another tenant's upload session",
    () => db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5)",
      [chunkRaceSession.id, 0, 0, 500, "f".repeat(64)],
    ),
    /جلسة الاستيراد غير متاحة/i,
    "22023",
  );
  await db.unsafe("reset role");
  const chunkSessionAfterRows = await db.unsafe(
    "select verified_chunks,status,updated_at::text as updated_at from public.import_upload_sessions where id=$1::uuid",
    [chunkRaceSession.id],
  );
  const chunkRowsAfter = await db.unsafe(
    "select count(*)::int as count from public.import_upload_chunks where session_id=$1::uuid",
    [chunkRaceSession.id],
  );
  assert.deepEqual(chunkSessionAfterRows, chunkSessionBeforeRows,
    "cross-tenant denial leaves the upload-session state and timestamps unchanged");
  assert.equal(chunkRowsAfter[0].count, 0, "cross-tenant denial must not persist chunk metadata");

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const chunkRaceGate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const chunkRaceA = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const chunkRaceB = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let chunkRaceGateOpen = false;
  let chunkRaceAttemptA;
  let chunkRaceAttemptB;
  const setChunkRaceStaffIdentity = async (connection, appName) => {
    await connection.unsafe("select set_config('application_name',$1,false)", [appName]);
    await connection.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [staffAuthUserId]);
    await connection.unsafe("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: staffAuthUserId, email: "admin@aghbari.ye", role: "authenticated", session_id: staffAuthUserId }),
    ]);
    await connection.unsafe("set role authenticated");
  };
  try {
    await Promise.all([
      setChunkRaceStaffIdentity(chunkRaceA, "ci-import-chunk-race-a"),
      setChunkRaceStaffIdentity(chunkRaceB, "ci-import-chunk-race-b"),
    ]);
    await chunkRaceGate.unsafe("begin");
    chunkRaceGateOpen = true;
    await chunkRaceGate.unsafe(
      "select id from public.import_upload_sessions where id=$1::uuid for update",
      [chunkRaceSession.id],
    );
    const registerChunk = (connection) => connection.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
      [chunkRaceSession.id, 0, 0, 500, "a".repeat(64)],
    ).then((rows) => ({ ok: true, result: rows[0].result }))
      .catch((error) => ({ ok: false, error }));
    chunkRaceAttemptA = registerChunk(chunkRaceA);
    chunkRaceAttemptB = registerChunk(chunkRaceB);
    await db.unsafe("reset role");
    let observedBothChunkWritersWaiting = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const waiting = await db.unsafe(
        "select count(*)::int as count from pg_catalog.pg_stat_activity " +
        "where application_name in ('ci-import-chunk-race-a','ci-import-chunk-race-b') " +
        "and state='active' and wait_event_type='Lock'",
      );
      if (Number(waiting[0]?.count ?? 0) === 2) {
        observedBothChunkWritersWaiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(observedBothChunkWritersWaiting, true,
      "both authenticated chunk RPC sessions must overlap while contending on the locked upload session");
    await chunkRaceGate.unsafe("commit");
    chunkRaceGateOpen = false;
    const [chunkRaceOutcomeA, chunkRaceOutcomeB] = await Promise.all([chunkRaceAttemptA, chunkRaceAttemptB]);
    assert.equal(chunkRaceOutcomeA.ok, true, "first concurrent upload-chunk registration must succeed");
    assert.equal(chunkRaceOutcomeB.ok, true, "same-chunk concurrent replay must succeed");
    for (const outcome of [chunkRaceOutcomeA, chunkRaceOutcomeB]) {
      assert.equal(outcome.result.verified_chunks, 1, "concurrent calls return the canonical verified count");
      assert.equal(outcome.result.total_chunks, 1);
      assert.equal(outcome.result.complete, true);
    }
  } finally {
    if (chunkRaceGateOpen) await chunkRaceGate.unsafe("rollback").catch(() => {});
    if (chunkRaceAttemptA || chunkRaceAttemptB) {
      await Promise.allSettled([chunkRaceAttemptA, chunkRaceAttemptB].filter(Boolean));
    }
    await Promise.all([
      chunkRaceGate.end({ timeout: 5 }).catch(() => undefined),
      chunkRaceA.end({ timeout: 5 }).catch(() => undefined),
      chunkRaceB.end({ timeout: 5 }).catch(() => undefined),
    ]);
  }
  await db.unsafe("reset role");
  const persistedChunkRaceRows = await db.unsafe(
    "select chunk_number,byte_offset,byte_size,chunk_hash from public.import_upload_chunks where session_id=$1::uuid order by chunk_number",
    [chunkRaceSession.id],
  );
  const persistedChunkRaceSession = await db.unsafe(
    "select verified_chunks,status from public.import_upload_sessions where id=$1::uuid",
    [chunkRaceSession.id],
  );
  assert.equal(persistedChunkRaceRows.length, 1, "same-chunk concurrency creates exactly one manifest row");
  assert.equal(persistedChunkRaceRows[0].chunk_number, 0);
  assert.equal(persistedChunkRaceRows[0].byte_offset, "0");
  assert.equal(persistedChunkRaceRows[0].byte_size, 500);
  assert.equal(persistedChunkRaceRows[0].chunk_hash, "a".repeat(64));
  assert.equal(persistedChunkRaceSession[0].verified_chunks, 1);
  assert.equal(persistedChunkRaceSession[0].status, "uploaded");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS import upload chunks: cross-tenant denial is side-effect free and concurrent identical registrations persist one canonical chunk.\\n");

  // A complete manifest cannot turn a cancelled job into a committed snapshot.
  await db.unsafe(
    `update public.import_jobs
        set status='cancelled',
            error_summary=jsonb_build_object(
              'processing_config_fingerprint', repeat('f',64),
              'source_file_hash', file_hash,
              'period_key', period_key
            )
      where id=$1::uuid`,
    [multiChunkJob.id],
  );
  await expectFailure(
    "reject finalization of a cancelled import with a complete upload manifest",
    () => db.unsafe("select public.finalize_import_job($1::uuid,$2) as result", [multiChunkJob.id, "new_version"]),
    /حالة الدفعة لا تسمح بالاعتماد/i,
    "22023",
  );
  const cancelledSnapshot = await db.unsafe(
    "select id from public.onyx_snapshots where source_import_job_id=$1::uuid and status='ready'",
    [multiChunkJob.id],
  );
  assert.equal(cancelledSnapshot.length, 0, "cancelled staging must never publish a ready snapshot");

  // Security regression: the quality RPC must authorize before looking up a job ID
  // and scope staff lookups to their own tenant, so foreign IDs cannot be enumerated.
  await db.unsafe("reset role");
  const foreignQualityJobResult = await db.unsafe(
    `insert into public.import_jobs(
       organization_id,job_type,file_name,file_hash,file_size,status,created_by
     ) values($1,'onyx_stock','CI foreign quality privacy probe.csv',$2,500,'pending',$3)
     returning id`,
    [otherOrganizationId, "e".repeat(64), foreignProfileId],
  );
  const foreignQualityJobId = foreignQualityJobResult[0].id;
  const unknownQualityJobId = randomUUID();

  const qualityScoreJobResult = await db.unsafe(
    `insert into public.import_jobs(
       organization_id,job_type,file_name,file_hash,file_size,status,created_by,profile_id
     ) values($1,'onyx_stock','CI DQS impossible-date semantics.csv',$2,600,'pending',$3,$4)
     returning id`,
    [organizationId, "d".repeat(64), operationsStaffProfileId, importJob.profile_id],
  );
  const qualityScoreJobId = qualityScoreJobResult[0].id;
  await db.unsafe(
    "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) values($1,1,'valid',$2::jsonb,'[]'::jsonb),($1,2,'valid',$3::jsonb,'[]'::jsonb)",
    [
      qualityScoreJobId,
      db.json({ item_code: "DQS-INVALID-DATE-1", quantity: "1", revenue: "10", price: "10", date: "2026-02-31" }),
      db.json({ item_code: "DQS-VALID-DATE-2", quantity: "1", revenue: "10", price: "10", date: "2024-02-29" }),
    ],
  );
  const qualityStatusJobResult = await db.unsafe(
    `insert into public.import_jobs(
       organization_id,job_type,file_name,file_hash,file_size,status,created_by,profile_id
     ) values($1,'onyx_stock','CI DQS row-status semantics.csv',$2,700,'pending',$3,$4)
     returning id`,
    [organizationId, "c".repeat(64), operationsStaffProfileId, importJob.profile_id],
  );
  const qualityStatusJobId = qualityStatusJobResult[0].id;
  const qualityStatusCases = ["valid", "invalid", "pending", "rejected", "unrecognized"];
  for (const [index, status] of qualityStatusCases.entries()) {
    await db.unsafe(
      "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) values($1,$2,$3,$4::jsonb,'[]'::jsonb)",
      [qualityStatusJobId, index + 1, status, db.json({
        item_code: `DQS-STATUS-${status.toUpperCase()}`,
        quantity: "1", revenue: "10", price: "10", date: "2026-01-15",
      })],
    );
  }

  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot distinguish an existing foreign import job from an unknown job",
    () => db.unsafe("select public.calculate_import_job_quality($1::uuid)", [foreignQualityJobId]),
    /not authorized to calculate import quality/i,
    "42501",
  );
  await expectFailure(
    "customer receives the same import-quality denial for an unknown job ID",
    () => db.unsafe("select public.calculate_import_job_quality($1::uuid)", [unknownQualityJobId]),
    /not authorized to calculate import quality/i,
    "42501",
  );

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "staff cannot distinguish a foreign import job from an unknown job",
    () => db.unsafe("select public.calculate_import_job_quality($1::uuid)", [foreignQualityJobId]),
    /import job not found in active organization/i,
    "P0002",
  );
  await expectFailure(
    "staff receives the same result for an unknown import job ID",
    () => db.unsafe("select public.calculate_import_job_quality($1::uuid)", [unknownQualityJobId]),
    /import job not found in active organization/i,
    "P0002",
  );
  const qualityScore = await db.unsafe("select public.calculate_import_job_quality($1::uuid) as result", [qualityScoreJobId]);
  assert.equal(qualityScore[0]?.result?.total_rows, 2, "quality score counts both rows from the scoped job");
  assert.equal(Number(qualityScore[0]?.result?.components?.temporal_referential_integrity), 50,
    "an impossible calendar date scores invalid while the real leap-day date scores valid");
  process.stdout.write("PASS import quality RPC: tenant-scoped IDs, denial parity, and impossible-date scoring\\n");
  const qualityStatusScore = await db.unsafe("select public.calculate_import_job_quality($1::uuid) as result", [qualityStatusJobId]);
  assert.equal(qualityStatusScore[0]?.result?.total_rows, 5, "DQS status semantics fixture must include valid and four non-valid states");
  assert.equal(Number(qualityStatusScore[0]?.result?.components?.validity), 20,
    "only explicit valid rows contribute validity points; invalid, pending, rejected and unrecognized states must score zero");
  process.stdout.write("PASS DQS status scoring: only explicit valid rows contribute validity points\\n");

  const duplicateProbe = await db.unsafe(
    "select public.find_import_duplicate($1,$2::uuid,$3) as result",
    ["a".repeat(64), importJob.profile_id, "2026-01"],
  );
  assert.equal(duplicateProbe[0].result.duplicate, true, "same tenant/profile/hash/period must be reported as a duplicate");

  await db.unsafe(
    `update public.import_jobs
        set error_summary=coalesce(error_summary,'{}'::jsonb) || jsonb_build_object(
          'processing_config_fingerprint', repeat('e',64),
          'source_file_hash', file_hash,
          'period_key', period_key,
          'source_system', source_system,
          'external_source_reference', external_source_reference
        )
      where id=$1::uuid`,
    [importJob.id],
  );
  const finalizedImport = await db.unsafe(
    "select public.finalize_import_job($1::uuid,$2) as result",
    [importJob.id, "new_version"],
  );
  assert.equal(finalizedImport[0].result.status, "completed", "high-quality structured import should be accepted");
  assert.equal(Number(finalizedImport[0].result.data_quality_score), 100);
  assert.ok(finalizedImport[0].result.snapshot_id, "accepted import should create an immutable Onyx snapshot");
  const onyxAnalytics = await db.unsafe(
    "select public.get_onyx_snapshot_analytics($1::uuid) as result",
    [finalizedImport[0].result.snapshot_id],
  );
  assert.equal(Number(onyxAnalytics[0].result.metrics.row_count), 2, "server analytics should read the complete snapshot");
  assert.equal(Number(onyxAnalytics[0].result.metrics.unique_keys), 2);
  assert.equal(Number(onyxAnalytics[0].result.metrics.quantity_total), 15, "quantity KPI must include every snapshot row");
  assert.equal(Number(onyxAnalytics[0].result.metrics.revenue_total), 600, "revenue KPI must include every snapshot row");
  assert.equal(onyxAnalytics[0].result.forecast_status, "Forecast Unavailable: Insufficient Historical Data");

  // The active profile explicitly remains partial; replace must fail closed on the server.
  await db.unsafe(
    "update public.import_profiles set is_full_dataset=false where id=$1::uuid and organization_id=$2::uuid",
    [importJob.profile_id, organizationId],
  );
  // Partial imports must preserve every absent key from the previous ready snapshot.
  const partialMergeJobResult = await db.unsafe(
    "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
    [randomUUID(), "CI partial Onyx.stock.csv", "b".repeat(64), 100, "onyx_stock", "CI-PARTIAL-MERGE-BATCH", importJob.profile_id, "2026-01", "ci", "new_version"],
  );
  const partialMergeJob = partialMergeJobResult[0].result;
  const partialMergeSessionResult = await db.unsafe(
    "select public.create_import_upload_session($1::uuid) as result",
    [partialMergeJob.id],
  );
  const partialMergeSession = partialMergeSessionResult[0].result;
  assert.equal(partialMergeSession.file_type, "csv", "the filename's final extension identifies the source format");
  const partialMergeChunk = await db.unsafe(
    "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
    [partialMergeSession.id, 0, 0, 100, "f".repeat(64)],
  );
  assert.equal(partialMergeChunk[0].result.complete, true);
  await db.unsafe(
    "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) values($1,1,'valid',$2::jsonb,'[]'::jsonb)",
    [partialMergeJob.id, db.json({ item_code: "000127", product_name: "Tea", quantity: "1", revenue: "5", price: "5", date: "2026-01-03" })],
  );
  await db.unsafe(
    `update public.import_jobs
        set error_summary=jsonb_build_object(
          'processing_config_fingerprint', repeat('f',64),
          'source_file_hash', file_hash,
          'period_key', period_key,
          'source_system', source_system,
          'external_source_reference', external_source_reference,
          'is_full_dataset', false,
          'no_raw_file_retained', true
        )
      where id=$1::uuid`,
    [partialMergeJob.id],
  );
  await expectFailure(
    "reject replacing a ready snapshot with a profile that is not classified as a full dataset",
    () => db.unsafe("select public.finalize_import_job($1::uuid,$2) as result", [partialMergeJob.id, "replace"]),
    /الاستبدال الكامل مرفوض/i,
    "22023",
  );
  const snapshotAfterRejectedPartialReplace = await db.unsafe(
    "select status from public.onyx_snapshots where id=$1::uuid",
    [finalizedImport[0].result.snapshot_id],
  );
  assert.equal(snapshotAfterRejectedPartialReplace[0].status, "ready",
    "rejected partial replacement must not archive or mutate the previous live snapshot");
  const keysAfterRejectedPartialReplace = await db.unsafe(
    "select canonical_key from public.onyx_snapshot_rows where snapshot_id=$1::uuid order by canonical_key",
    [finalizedImport[0].result.snapshot_id],
  );
  assert.deepEqual(keysAfterRejectedPartialReplace.map((row) => row.canonical_key), ["000125", "000126"],
    "absence from a partial file must not remove source keys from the previously live snapshot");

  const finalizedPartialMerge = await db.unsafe(
    "select public.finalize_import_job($1::uuid,$2) as result",
    [partialMergeJob.id, "merge"],
  );
  assert.equal(finalizedPartialMerge[0].result.status, "completed", "a valid partial import can publish through the established merge contract");
  assert.equal(Number(finalizedPartialMerge[0].result.row_count), 3, "the merge must retain two old keys absent from the partial file");
  const mergedCanonicalKeys = await db.unsafe(
    "select canonical_key from public.onyx_snapshot_rows where snapshot_id=$1::uuid order by canonical_key",
    [finalizedPartialMerge[0].result.snapshot_id],
  );
  assert.deepEqual(mergedCanonicalKeys.map((row) => row.canonical_key), ["000125", "000126", "000127"],
    "missing keys in a partial source are not deletion instructions");
  const priorSnapshotStillReady = await db.unsafe(
    "select status from public.onyx_snapshots where id=$1::uuid",
    [finalizedImport[0].result.snapshot_id],
  );
  assert.equal(priorSnapshotStillReady[0].status, "ready", "a merge must not alter the prior snapshot's history");

  // A staff-only operator may import data but cannot roll back a published snapshot.
  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  const captureImportRollbackDenialState = async () => {
    await db.unsafe("reset role");
    try {
      const rows = await db.unsafe(
        "select jsonb_build_object(" +
          "'job',(select to_jsonb(j) from public.import_jobs j where j.id=$1::uuid and j.organization_id=$2::uuid)," +
          "'rows',coalesce((select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.import_job_rows r where r.import_job_id=$1::uuid),'[]'::jsonb)," +
          "'request_keys',coalesce((select jsonb_agg(to_jsonb(k) order by to_jsonb(k)::text) from public.import_job_request_keys k where k.organization_id=$2::uuid and k.import_job_id=$1::uuid),'[]'::jsonb)," +
          "'upload_sessions',coalesce((select jsonb_agg(to_jsonb(u) order by to_jsonb(u)::text) from public.import_upload_sessions u where u.organization_id=$2::uuid and u.import_job_id=$1::uuid),'[]'::jsonb)," +
          "'upload_chunks',coalesce((select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.import_upload_chunks c where c.organization_id=$2::uuid and c.session_id in (select u.id from public.import_upload_sessions u where u.organization_id=$2::uuid and u.import_job_id=$1::uuid)),'[]'::jsonb)," +
          "'snapshots',coalesce((select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.onyx_snapshots x where x.organization_id=$2::uuid and x.source_import_job_id=$1::uuid),'[]'::jsonb)," +
          "'snapshot_rows',coalesce((select jsonb_agg(to_jsonb(sr) order by to_jsonb(sr)::text) from public.onyx_snapshot_rows sr where sr.snapshot_id in (select x.id from public.onyx_snapshots x where x.organization_id=$2::uuid and x.source_import_job_id=$1::uuid)),'[]'::jsonb)," +
          "'audit',coalesce((select jsonb_agg(to_jsonb(a) order by to_jsonb(a)::text) from public.audit_logs a where a.organization_id=$2::uuid and (a.entity_id=$1::uuid or a.entity_id in (select x.id from public.onyx_snapshots x where x.organization_id=$2::uuid and x.source_import_job_id=$1::uuid))),'[]'::jsonb)" +
        ")::text as snapshot",
        [partialMergeJob.id, organizationId],
      );
      assert.equal(rows.length, 1, "privileged import rollback oracle must return one full-state snapshot");
      return rows[0].snapshot;
    } finally {
      await db.unsafe("set role authenticated");
    }
  };
  const importRollbackStateBeforeDeniedStaffRequest = await captureImportRollbackDenialState();
  await expectFailure(
    "staff role cannot roll back a published import snapshot",
    () => db.unsafe("select public.rollback_import_snapshot($1::uuid,$2) as result",
      [partialMergeJob.id, "staff is not authorized to roll back a snapshot"]),
    /التراجع عن لقطة الاستيراد متاح للمدير أو مدير النظام فقط/i,
    "42501",
  );
  const importRollbackStateAfterDeniedStaffRequest = await captureImportRollbackDenialState();
  assert.equal(
    importRollbackStateAfterDeniedStaffRequest,
    importRollbackStateBeforeDeniedStaffRequest,
    "same-tenant staff rollback denial must preserve the complete import job, staged rows, request keys, upload sessions/chunks, snapshots/snapshot rows and audit entries byte-for-byte",
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");

  // Rollback archives only the latest published snapshot; it never deletes imported/snapshot rows.
  const rollbackResult = await db.unsafe(
    "select public.rollback_import_snapshot($1::uuid,$2) as result",
    [partialMergeJob.id, "CI regression: validate audited rollback without deleting snapshot rows"],
  );
  assert.equal(rollbackResult[0].result.rolled_back, true);
  assert.equal(rollbackResult[0].result.status, "rolled_back");
  assert.equal(rollbackResult[0].result.snapshot_status, "archived");
  assert.equal(rollbackResult[0].result.snapshot_rows_retained, true);
  const archivedSnapshotRows = await db.unsafe(
    "select count(*)::integer as count from public.onyx_snapshot_rows where snapshot_id=$1::uuid",
    [finalizedPartialMerge[0].result.snapshot_id],
  );
  assert.equal(archivedSnapshotRows[0].count, 3, "rollback must retain every row as auditable history");
  const snapshotRollbackAudit = await db.unsafe(
    "select organization_id,actor_id,action,entity_type,entity_id,new_value from public.audit_logs where entity_id=$1::uuid and action='import.snapshot_rolled_back'",
    [finalizedPartialMerge[0].result.snapshot_id],
  );
  assert.equal(snapshotRollbackAudit.length, 1, "rollback must emit exactly one audit record");
  assert.equal(snapshotRollbackAudit[0].organization_id, organizationId);
  assert.equal(snapshotRollbackAudit[0].action, "import.snapshot_rolled_back");
  assert.equal(snapshotRollbackAudit[0].entity_type, "onyx_snapshot");
  assert.equal(snapshotRollbackAudit[0].new_value.status, "archived");
  assert.equal(snapshotRollbackAudit[0].new_value.snapshot_rows_retained, true);
  const rollbackReplay = await db.unsafe(
    "select public.rollback_import_snapshot($1::uuid,$2) as result",
    [partialMergeJob.id, "CI retry after simulated lost rollback response"],
  );
  assert.equal(rollbackReplay[0].result.already_rolled_back, true, "lost rollback response must replay instead of archiving/auditing twice");
  const rollbackAuditCount = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where entity_id=$1::uuid and action='import.snapshot_rolled_back'",
    [finalizedPartialMerge[0].result.snapshot_id],
  );
  assert.equal(rollbackAuditCount[0].count, 1, "rollback replay must not duplicate the audit event");
  const rolledBackFailureReplay = await db.unsafe(
    "select public.fail_import_job_safely($1::uuid,$2::jsonb) as result",
    [partialMergeJob.id, db.json({ code: "CI_LOST_ROLLBACK_RESPONSE", message: "retry after rollback" })],
  );
  assert.equal(rolledBackFailureReplay[0].result.status, "rolled_back");
  assert.equal(rolledBackFailureReplay[0].result.changed, false, "failure recovery must not downgrade rolled-back status");
  const terminalFailureReplay = await db.unsafe(
    "select public.fail_import_job_safely($1::uuid,$2::jsonb) as result",
    [importJob.id, db.json({ code: "CI_LOST_FINALIZE_RESPONSE", message: "simulated response loss after committed finalization" })],
  );
  assert.equal(terminalFailureReplay[0].result.changed, false, "failure recovery must not mutate a terminal job");
  assert.equal(terminalFailureReplay[0].result.terminal, true);
  assert.equal(terminalFailureReplay[0].result.status, "completed");
  assert.equal(terminalFailureReplay[0].result.snapshot_id, finalizedImport[0].result.snapshot_id,
    "recovering from a lost finalization response must preserve the exact committed snapshot");
  const readySnapshotCountAfterFailureReplay = await db.unsafe(
    "select count(*)::integer as count from public.onyx_snapshots where source_import_job_id=$1::uuid and status='ready'",
    [importJob.id],
  );
  assert.equal(readySnapshotCountAfterFailureReplay[0].count, 1, "failure recovery must not duplicate or remove a committed snapshot");

  // Active import-profile versions are immutable. Create a dedicated full-dataset profile
  // before staging any snapshots, then prove replacement only archives a prior snapshot from
  // that same profile/period after the replacement snapshot is ready.
  await db.unsafe("reset role");
  const fullDatasetProfileCreated = await db.unsafe(
    `insert into public.import_profiles (
       organization_id,profile_name,report_type,source,version,required_columns,optional_columns,
       ignored_columns,synonyms,transformation_rules,validation_rules,matching_key,merge_strategy,
       date_rules,is_full_dataset,status,created_by,published_at
     )
     select ip.organization_id,
            ip.profile_name || ' CI full dataset ' || substr(gen_random_uuid()::text,1,8),
            ip.report_type,ip.source,1,ip.required_columns,ip.optional_columns,ip.ignored_columns,
            ip.synonyms,ip.transformation_rules,ip.validation_rules,ip.matching_key,ip.merge_strategy,
            ip.date_rules,true,'active',ip.created_by,now()
       from public.import_profiles ip
      where ip.id=$1::uuid and ip.organization_id=$2::uuid
     returning id,version,status,is_full_dataset`,
    [importJob.profile_id, organizationId],
  );
  assert.equal(fullDatasetProfileCreated.length, 1, "CI must create a separate full-dataset profile fixture");
  const fullDatasetProfile = fullDatasetProfileCreated[0];
  assert.equal(fullDatasetProfile.status, "active");
  assert.equal(fullDatasetProfile.is_full_dataset, true);
  await db.unsafe("set role authenticated");

  const createFullDatasetImport = async ({ requestKey, fileName, fileHash, externalSourceReference, chunkHash, itemCode, productName }) => {
    const created = await db.unsafe(
      "select public.create_import_job_idempotent($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10) as result",
      [requestKey, fileName, fileHash, 100, "onyx_stock", externalSourceReference,
        fullDatasetProfile.id, "2026-01", "ci", "new_version"],
    );
    const job = created[0].result;
    const sessionCreated = await db.unsafe(
      "select public.create_import_upload_session($1::uuid) as result",
      [job.id],
    );
    const session = sessionCreated[0].result;
    const chunk = await db.unsafe(
      "select public.record_import_upload_chunk($1::uuid,$2,$3,$4,$5) as result",
      [session.id, 0, 0, 100, chunkHash],
    );
    assert.equal(chunk[0].result.complete, true, "full-dataset fixture upload must have a complete manifest");
    await db.unsafe(
      "insert into public.import_job_rows(import_job_id,row_number,status,data,errors) values($1,1,'valid',$2::jsonb,'[]'::jsonb)",
      [job.id, db.json({ item_code: itemCode, product_name: productName, quantity: "4", revenue: "40", price: "10", date: "2026-01-04" })],
    );
    await db.unsafe(
      "update public.import_jobs set error_summary=jsonb_build_object('processing_config_fingerprint', repeat('a',64), 'source_file_hash', file_hash, 'period_key', period_key, 'source_system', source_system, 'external_source_reference', external_source_reference, 'is_full_dataset', true, 'no_raw_file_retained', true) where id=$1::uuid",
      [job.id],
    );
    return job.id;
  };

  const fullDatasetSeedJobId = await createFullDatasetImport({
    requestKey: randomUUID(),
    fileName: "CI complete Onyx.inventory seed.csv",
    fileHash: "c".repeat(64),
    externalSourceReference: "CI-FULL-REPLACE-SEED",
    chunkHash: "8".repeat(64),
    itemCode: "000127",
    productName: "Prior complete snapshot item",
  });
  const fullDatasetSeedResult = await db.unsafe(
    "select public.finalize_import_job($1::uuid,$2) as result",
    [fullDatasetSeedJobId, "new_version"],
  );
  assert.equal(fullDatasetSeedResult[0].result.status, "completed",
    "a complete dataset must publish a baseline snapshot before replacement is evaluated");
  const fullDatasetPriorSnapshotId = fullDatasetSeedResult[0].result.snapshot_id;
  assert.ok(fullDatasetPriorSnapshotId, "baseline full-dataset publication must return its snapshot id");
  const priorFullDatasetSnapshot = await db.unsafe(
    "select status,organization_id::text as organization_id,profile_id::text as profile_id,period_key " +
      "from public.onyx_snapshots where id=$1::uuid",
    [fullDatasetPriorSnapshotId],
  );
  assert.equal(priorFullDatasetSnapshot[0].status, "ready");
  assert.equal(priorFullDatasetSnapshot[0].organization_id, organizationId,
    "baseline snapshot must retain its source tenant identity");
  assert.equal(priorFullDatasetSnapshot[0].profile_id, fullDatasetProfile.id,
    "baseline snapshot must retain the import profile used for replacement matching");
  assert.equal(priorFullDatasetSnapshot[0].period_key, "2026-01",
    "baseline snapshot must retain the import period used for replacement matching");

  const fullReplaceJobId = await createFullDatasetImport({
    requestKey: randomUUID(),
    fileName: "CI complete Onyx.inventory.csv",
    fileHash: "d".repeat(64),
    externalSourceReference: "CI-FULL-REPLACE-BATCH",
    chunkHash: "9".repeat(64),
    itemCode: "000128",
    productName: "Replacement complete snapshot item",
  });
  const replacementJobIdentity = await db.unsafe(
    "select organization_id::text as organization_id,profile_id::text as profile_id,period_key,status " +
      "from public.import_jobs where id=$1::uuid",
    [fullReplaceJobId],
  );
  assert.equal(replacementJobIdentity.length, 1, "replacement import job must remain addressable in its tenant");
  assert.equal(replacementJobIdentity[0].organization_id, organizationId);
  assert.equal(replacementJobIdentity[0].profile_id, fullDatasetProfile.id,
    "replacement job must use the exact profile required to select prior snapshots");
  assert.equal(replacementJobIdentity[0].period_key, "2026-01",
    "replacement job must use the exact period required to select prior snapshots");

  const fullReplaceFinalized = await db.unsafe(
    "select public.finalize_import_job($1::uuid,$2) as result",
    [fullReplaceJobId, "replace"],
  );
  assert.equal(fullReplaceFinalized[0].result.status, "completed",
    "an active, version-matched full-dataset profile with persisted full-source attestation may replace");
  const replacementSnapshotId = fullReplaceFinalized[0].result.snapshot_id;
  assert.ok(replacementSnapshotId && replacementSnapshotId !== fullDatasetPriorSnapshotId,
    "replacement publishes a distinct ready snapshot");
  const oldSnapshotAfterFullReplace = await db.unsafe(
    "select status,organization_id::text as organization_id,profile_id::text as profile_id,period_key " +
      "from public.onyx_snapshots where id=$1::uuid",
    [fullDatasetPriorSnapshotId],
  );
  assert.equal(oldSnapshotAfterFullReplace[0].status, "archived",
    "successful full-dataset replacement archives prior live data only after the new snapshot is ready " +
      JSON.stringify({
        old: oldSnapshotAfterFullReplace[0],
        replacementJob: replacementJobIdentity[0],
      }));
  const oldSnapshotHistoryAfterReplace = await db.unsafe(
    "select count(*)::integer as count from public.onyx_snapshot_rows where snapshot_id=$1::uuid",
    [fullDatasetPriorSnapshotId],
  );
  assert.equal(oldSnapshotHistoryAfterReplace[0].count, 1,
    "archiving a replaced snapshot retains its rows as auditable history");
  const replacementSnapshotState = await db.unsafe(
    "select status from public.onyx_snapshots where id=$1::uuid",
    [replacementSnapshotId],
  );
  assert.equal(replacementSnapshotState[0].status, "ready");
  const readySnapshotCountAfterFullReplace = await db.unsafe(
    "select count(*)::integer as count from public.onyx_snapshots where organization_id=$1::uuid and profile_id=$2::uuid and period_key='2026-01' and status='ready'",
    [organizationId, fullDatasetProfile.id],
  );
  assert.equal(readySnapshotCountAfterFullReplace[0].count, 1,
    "only the replacement full-dataset snapshot remains ready for this tenant/profile/period");
  const replacementAudit = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where entity_id=$1::uuid and action='import.snapshot_replaced'",
    [fullDatasetPriorSnapshotId],
  );
  assert.equal(replacementAudit[0].count, 1, "retiring the prior live snapshot records an audit event");

  process.stdout.write("PASS import profile, tenant-scoped synonyms, resumable chunk manifest, duplicate detection, DQS finalization and full-snapshot Onyx analytics\n");

  // The rule UI must reuse the existing deterministic pricing engine and reset to base price
  // when its last applicable rule is deleted.
  const previouslyActiveRules = await db.unsafe(
    "select id from public.pricing_rules where organization_id=$1 and is_active=true",
    [organizationId],
  );
  await db.unsafe("update public.pricing_rules set is_active=false where organization_id=$1 and is_active=true", [organizationId]);
  const pricingBaseRow = await db.unsafe(
    "select base_price,retail_price,wholesale_price from public.fetch_staff_products($1::uuid) where organization_id=$2",
    [productId, organizationId],
  );
  assert.equal(pricingBaseRow.length, 1, "pricing acceptance product should exist in the active organization");
  const pricingBase = Number(pricingBaseRow[0].base_price);
  assert.equal(Number(pricingBaseRow[0].retail_price), pricingBase, "no active rules must reset retail price to base_price");
  assert.equal(Number(pricingBaseRow[0].wholesale_price), pricingBase, "no active rules must reset wholesale price to base_price");

  const insertedRule = await db.unsafe(
    `insert into public.pricing_rules(
       organization_id,name,scope_type,scope_value,base_type,base_source,adjustment_type,
       calculation_method,adjustment_value,target_tier,min_quantity,min_price,max_price,
       priority,is_active
     ) values($1,'CI pricing calculation rule','product',$2,'base_price','base_price','percentage',
       'add_percentage',10,'both',1,null,null,1,true)
     returning id`,
    [organizationId, productId],
  );
  const pricingRuleId = insertedRule[0].id;
  let derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  const addPercentageExpected = Math.round(pricingBase * 1.1 * 100) / 100;
  assert.equal(Number(derivedPrices[0].retail_price), addPercentageExpected, "percentage addition must recalculate retail");
  assert.equal(Number(derivedPrices[0].wholesale_price), addPercentageExpected, "percentage addition must recalculate wholesale");

  await db.unsafe("update public.pricing_rules set calculation_method='margin_percentage',adjustment_type='margin',adjustment_value=25 where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  const marginExpected = Math.round((pricingBase / 0.75) * 100) / 100;
  assert.equal(Number(derivedPrices[0].retail_price), marginExpected, "margin percentage must calculate margin on sale price");
  assert.equal(Number(derivedPrices[0].wholesale_price), marginExpected, "margin percentage must update both selected tiers");

  await db.unsafe("update public.pricing_rules set calculation_method='fixed_price',adjustment_type='fixed',adjustment_value=123.45 where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  assert.equal(Number(derivedPrices[0].retail_price), 123.45, "fixed price must update retail");
  assert.equal(Number(derivedPrices[0].wholesale_price), 123.45, "fixed price must update wholesale");

  await db.unsafe("update public.pricing_rules set calculation_method='add_subtract_amount',adjustment_type='amount',adjustment_value=-12.50 where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  assert.equal(Number(derivedPrices[0].retail_price), pricingBase - 12.5, "negative amount must deduct from retail base");
  assert.equal(Number(derivedPrices[0].wholesale_price), pricingBase - 12.5, "negative amount must deduct from wholesale base");

  await db.unsafe("update public.pricing_rules set target_tier='wholesale',calculation_method='fixed_price',adjustment_type='fixed',adjustment_value=111.10 where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  assert.equal(Number(derivedPrices[0].retail_price), pricingBase, "wholesale-only rule must leave retail at base when no other rules apply");
  assert.equal(Number(derivedPrices[0].wholesale_price), 111.1, "wholesale-only rule must update wholesale");

  await db.unsafe("delete from public.pricing_rules where id=$1", [pricingRuleId]);
  derivedPrices = await db.unsafe("select retail_price,wholesale_price from public.fetch_staff_products($1::uuid)", [productId]);
  assert.equal(Number(derivedPrices[0].retail_price), pricingBase, "deleting last applicable rule must reset retail exactly to base_price");
  assert.equal(Number(derivedPrices[0].wholesale_price), pricingBase, "deleting last applicable rule must reset wholesale exactly to base_price");
  const pricingAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='pricing_rule' and entity_id=$2",
    [organizationId, pricingRuleId],
  );
  assert.ok(pricingAudit.some((row) => row.action === 'pricing_rule.created'), "rule creation must be audited");
  assert.ok(pricingAudit.filter((row) => row.action === 'pricing_rule.updated').length >= 4, "rule updates must be audited");
  assert.ok(pricingAudit.some((row) => row.action === 'pricing_rule.deleted'), "rule deletion must be audited");

  if (previouslyActiveRules.length) {
    await db.unsafe("update public.pricing_rules set is_active=true where id=any($1::uuid[])", [previouslyActiveRules.map((row) => row.id)]);
  }
  process.stdout.write("PASS pricing rules: all four formulas, tier targeting, deletion resets both derived tier prices to base, and audited mutations\n");


  // Capture the effective tier price before submitting the product-specific rule. An existing
  // global/legacy active rule may apply; the pending rule must not change that baseline.
  const previewProductId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await db.unsafe(
    "insert into public.products(id,organization_id,name,item_code,unit,base_price,cost_price,min_stock,status) values($1,$2,'CI Pricing Preview Product','CI-PRICE-PREVIEW-01','unit',1000,500,0,'active') on conflict(id) do nothing",
    [previewProductId, organizationId],
  );
  const retailCustomerRows = await db.unsafe(
    "select id from public.customers where organization_id=$1 and profile_id=$2 order by created_at limit 1",
    [organizationId, secondProfileId],
  );
  assert.equal(retailCustomerRows.length, 1, "retail preview customer fixture should exist");
  const retailCustomerId = retailCustomerRows[0].id;

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const baselineRows = await db.unsafe(
    "select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric) as result",
    [retailCustomerId, previewProductId, 3],
  );
  const baselinePreview = baselineRows[0].result;
  const baselineUnitPrice = Number(baselinePreview.unit_price);
  assert.ok(Number.isFinite(baselineUnitPrice) && baselineUnitPrice >= 0, "baseline price must come from the shared deterministic resolver");

  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  const submittedRuleRows = await db.unsafe(
    "insert into public.pricing_rules(organization_id,name,scope_type,scope_value,base_type,base_source,adjustment_type,calculation_method,adjustment_value,target_tier,min_quantity,min_price,max_price,priority,is_active) values($1,'CI approval workflow rule','product',$2,'base_price','base_price','percentage','add_percentage',5,'both',1,null,null,1,true) returning id,requires_approval,submitted_by,approved_at",
    [organizationId, previewProductId],
  );
  const submittedRule = submittedRuleRows[0];
  assert.equal(submittedRule.requires_approval, true, "ordinary staff-created rule must require managerial approval");
  assert.equal(submittedRule.approved_at, null);
  assert.equal(submittedRule.submitted_by, operationsStaffProfileId, "submission identity must be server-derived");

  // DLV-015: approval is a destructive monetary boundary. Every denied attempt must
  // preserve the pending rule and its audit history, not merely return an authorization error.
  const readPricingApprovalBoundary = async () => {
    await db.unsafe("reset role");
    const ruleRows = await db.unsafe(
      "select organization_id::text as organization_id,submitted_by::text as submitted_by," +
        "approved_by::text as approved_by,approved_at::text as approved_at,approval_note," +
        "requires_approval,manually_locked,is_active,version,updated_at::text as updated_at " +
        "from public.pricing_rules where id=$1::uuid",
      [submittedRule.id],
    );
    const auditRows = await db.unsafe(
      "select count(*)::integer as count from public.audit_logs " +
        "where organization_id=$1::uuid and entity_type='pricing_rule' and entity_id=$2::uuid " +
        "and action='pricing_rule.updated'",
      [organizationId, submittedRule.id],
    );
    assert.equal(ruleRows.length, 1, "submitted pricing rule remains addressable in its tenant");
    return { rule: ruleRows[0], approvalAuditCount: Number(auditRows[0].count) };
  };
  const pendingApprovalBaseline = await readPricingApprovalBoundary();
  assert.equal(pendingApprovalBaseline.rule.approved_at, null);
  assert.equal(pendingApprovalBaseline.rule.requires_approval, true);

  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary staff cannot forge pricing-rule approval state",
    () => db.unsafe("update public.pricing_rules set approved_at=now(),approved_by=$1 where id=$2", [operationsStaffProfileId, submittedRule.id]),
    /permission denied|pricing approval state can only be changed through the governed approval RPC/i,
  );
  await expectFailure(
    "ordinary staff cannot switch a submitted pricing rule out of approval",
    () => db.unsafe("update public.pricing_rules set requires_approval=false where id=$1", [submittedRule.id]),
    /permission denied|requires_approval can only be changed by the governed creation path/i,
  );
  await expectFailure(
    "ordinary staff cannot edit an existing pricing rule in place",
    () => db.unsafe("update public.pricing_rules set adjustment_value=6 where id=$1", [submittedRule.id]),
    /ordinary staff must submit a new pricing rule for approval/i,
  );
  await expectFailure(
    "ordinary staff cannot approve submitted pricing rule",
    () => db.unsafe("select public.approve_pricing_rule($1::uuid,$2)", [submittedRule.id, "staff must not approve"]),
    /pricing approval requires admin or manager/i,
    "42501",
  );
  assert.deepEqual(
    await readPricingApprovalBoundary(),
    pendingApprovalBaseline,
    "ordinary staff approval and direct-write denials leave the pending rule and audit history unchanged",
  );

  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "manager cannot approve a submitted pricing rule without a meaningful rationale",
    () => db.unsafe("select public.approve_pricing_rule($1::uuid,$2)", [submittedRule.id, "x"]),
    /approval rationale is required/i,
    "22023",
  );
  assert.deepEqual(
    await readPricingApprovalBoundary(),
    pendingApprovalBaseline,
    "invalid approval rationale leaves approval metadata, active pricing and audit unchanged",
  );

  // A manager in another organization must receive an opaque not-found result and must
  // not be able to change or audit this tenant's pending pricing rule.
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'manager') on conflict(profile_id,role) do nothing",
    [foreignProfileId],
  );
  await setIdentity(foreignAuthUserId, "foreign-ci-profile@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "foreign-tenant manager cannot approve another organization's pricing rule",
    () => db.unsafe("select public.approve_pricing_rule($1::uuid,$2)", [submittedRule.id, "foreign tenant approval attempt"]),
    /pricing rule not found in active organization/i,
    "P0002",
  );
  assert.deepEqual(
    await readPricingApprovalBoundary(),
    pendingApprovalBaseline,
    "foreign-tenant manager denial preserves the pending rule and emits no approval audit",
  );
  await db.unsafe("delete from public.user_roles where profile_id=$1 and role='manager'", [foreignProfileId]);

  // Temporarily grant manager capability to the submitting identity to exercise the
  // distinct-submitter rule; remove the fixture capability before continuing.
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1,'manager') on conflict(profile_id,role) do nothing",
    [operationsStaffProfileId],
  );
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "a manager cannot approve the pricing rule submitted by the same identity",
    () => db.unsafe("select public.approve_pricing_rule($1::uuid,$2)", [submittedRule.id, "self approval attempt"]),
    /someone other than the submitter/i,
    "42501",
  );
  assert.deepEqual(
    await readPricingApprovalBoundary(),
    pendingApprovalBaseline,
    "self-approval denial leaves the submitted rule and audit history unchanged",
  );
  await db.unsafe("delete from public.user_roles where profile_id=$1 and role='manager'", [operationsStaffProfileId]);

  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");

  const previewBeforeApprovalRows = await db.unsafe(
    "select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric) as result",
    [retailCustomerId, previewProductId, 3],
  );
  const previewBeforeApproval = previewBeforeApprovalRows[0].result;
  assert.equal(Number(previewBeforeApproval.unit_price), baselineUnitPrice, "pending product-specific rule must not change the previously effective price");
  assert.equal(Number(previewBeforeApproval.line_total), Math.round(baselineUnitPrice * 3 * 100) / 100);

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const approvedRuleResult = await db.unsafe(
    "select public.approve_pricing_rule($1::uuid,$2) as result",
    [submittedRule.id, "CI: approved after reviewing scope, margin and tier impact"],
  );
  assert.equal(approvedRuleResult[0].result.approved, true);
  assert.equal(approvedRuleResult[0].result.approval_note, "CI: approved after reviewing scope, margin and tier impact");
  const previewAfterApprovalRows = await db.unsafe(
    "select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric) as result",
    [retailCustomerId, previewProductId, 3],
  );
  assert.equal(Number(previewAfterApprovalRows[0].result.unit_price), 1050, "approved product-specific 5% rule must outrank global/legacy rules via the shared resolver");
  assert.equal(Number(previewAfterApprovalRows[0].result.line_total), 3150);
  const approvalAuditCountBeforeReplay = Number((await db.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
      "where organization_id=$1::uuid and entity_type='pricing_rule' and entity_id=$2::uuid and action='pricing_rule.updated'",
    [organizationId, submittedRule.id],
  ))[0].count);
  const approvedRuleReplay = await db.unsafe(
    "select public.approve_pricing_rule($1::uuid,$2) as result",
    [submittedRule.id, "CI: approved after reviewing scope, margin and tier impact"],
  );
  assert.equal(approvedRuleReplay[0].result.already_approved, true,
    "retry after a lost approval response must return the already-approved result");
  const approvalAuditCountAfterReplay = Number((await db.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
      "where organization_id=$1::uuid and entity_type='pricing_rule' and entity_id=$2::uuid and action='pricing_rule.updated'",
    [organizationId, submittedRule.id],
  ))[0].count);
  assert.equal(approvalAuditCountAfterReplay, approvalAuditCountBeforeReplay,
    "idempotent approval replay must not duplicate the audit event");
  const approvalAuditRows = await db.unsafe(
    "select action,new_value from public.audit_logs where organization_id=$1 and entity_type='pricing_rule' and entity_id=$2",
    [organizationId, submittedRule.id],
  );
  assert.ok(approvalAuditRows.some((row) => row.action === 'pricing_rule.updated' && row.new_value?.approval_note === "CI: approved after reviewing scope, margin and tier impact"),
    "approval decision and rationale must be auditable");

  // AGH-PRODUCT-IMAGE-001: browser writes are denied; the authenticated Edge Function owns scoped storage writes.
  const imageBucketRows = await db.unsafe(
    "select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='product-images'",
  );
  assert.equal(imageBucketRows.length, 1, "product-images bucket is configured by the migration");
  assert.equal(imageBucketRows[0].public, true);
  assert.equal(Number(imageBucketRows[0].file_size_limit), 8 * 1024 * 1024);
  assert.deepEqual(imageBucketRows[0].allowed_mime_types, ["image/webp"]);

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "staff cannot bypass the authenticated product-image Edge Function with a direct Storage insert",
    () => db.unsafe("insert into storage.objects(bucket_id,name,metadata) values('product-images',$1,'{}'::jsonb)",
      [organizationId + "/" + productId + "/b1000000-0000-4000-8000-000000000001.webp"]),
    /permission denied|row-level security/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customers cannot bypass the product-image Edge Function",
    () => db.unsafe("insert into storage.objects(bucket_id,name) values('product-images',$1)",
      [organizationId + "/" + productId + "/b5000000-0000-4000-8000-000000000001.webp"]),
    /permission denied|row-level security/i,
  );
  await db.unsafe("reset role");
  await db.unsafe("set role anon");
  await expectFailure(
    "anonymous users cannot write catalog images",
    () => db.unsafe("insert into storage.objects(bucket_id,name) values('product-images',$1)",
      [organizationId + "/" + productId + "/b4000000-0000-4000-8000-000000000001.webp"]),
    /permission denied|row-level security/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  process.stdout.write("PASS product image storage boundary: public WebP catalog bucket, 8 MiB limit, direct browser writes denied; server Edge Function enforces tenant/product/role and WebP signature\\n");

  // AGH-PRICE-PRIVACY-LEGACY-RPC-001: the internal pricing implementation must never be browser-callable.
  const legacyPricingPrivileges = await db.unsafe(
    "select has_function_privilege('anon','public.preview_order_pricing(jsonb)','EXECUTE') as anon_execute," +
      "has_function_privilege('authenticated','public.preview_order_pricing(jsonb)','EXECUTE') as authenticated_execute," +
      "has_function_privilege('service_role','public.preview_order_pricing(jsonb)','EXECUTE') as service_execute",
  );
  assert.equal(legacyPricingPrivileges[0].anon_execute, false, "anonymous users cannot execute internal order pricing");
  assert.equal(legacyPricingPrivileges[0].authenticated_execute, false, "authenticated browser users cannot execute internal order pricing");
  assert.equal(legacyPricingPrivileges[0].service_execute, true, "trusted service role retains internal order pricing access");

  await db.unsafe("reset role");
  await db.unsafe("set role anon");
  await expectFailure(
    "anonymous caller cannot execute internal order pricing",
    () => db.unsafe("select public.preview_order_pricing('{}'::jsonb)"),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot execute internal order pricing",
    () => db.unsafe("select public.preview_order_pricing('{}'::jsonb)"),
    /permission denied/i,
  );

  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "accountant cannot open operational pricing preview",
    () => db.unsafe("select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric)", [retailCustomerId, previewProductId, 1]),
    /active staff role required for pricing preview/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot call staff-only pricing preview",
    () => db.unsafe("select public.preview_customer_tier_price($1::uuid,$2::uuid,$3::numeric)", [retailCustomerId, previewProductId, 1]),
    /active staff role required for pricing preview/i,
  );

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await db.unsafe("delete from public.pricing_rules where id=$1", [submittedRule.id]);
  process.stdout.write("PASS pricing approval gate, protected approval state, audit rationale, shared customer-tier preview and role denial\n");


  // AGH-CUSTOMER-360-MEMBERS-001 uses persistent auth.users confirmation, not JWT confirmation claims.
  // AGH-CUSTOMER-360-MEMBERS-001: verified invitation, explicit company scope, permission matrix and revocation.
  await db.unsafe("reset role");
  const invitedProfileId="f8888888-8888-4888-8888-888888888888";
  const invitedAuthUserId="88888888-8888-4888-8888-888888888888";
  const financeProfileId="f9999999-9999-4999-8999-999999999999";
  const financeAuthUserId="99999999-9999-4999-8999-999999999999";
  const unconfirmedMemberProfileId=(await db.unsafe("select gen_random_uuid()::text as id"))[0].id;
  const unconfirmedMemberAuthUserId=(await db.unsafe("select gen_random_uuid()::text as id"))[0].id;
  const legacyMemberProfileId=(await db.unsafe("select gen_random_uuid()::text as id"))[0].id;
  const legacyMemberAuthUserId=(await db.unsafe("select gen_random_uuid()::text as id"))[0].id;
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI Invited Buyer','ci-invited-buyer@example.test',true),($4,$5,$3,'CI Invited Finance','ci-invited-finance@example.test',true),($6,$7,$3,'CI Unconfirmed Member','ci-unconfirmed-member@example.test',true),($8,$9,$3,'CI Legacy Member','ci-legacy-member@example.test',true)",
    [invitedProfileId,invitedAuthUserId,organizationId,financeProfileId,financeAuthUserId,unconfirmedMemberProfileId,unconfirmedMemberAuthUserId,legacyMemberProfileId,legacyMemberAuthUserId],
  );
  await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'customer'),($2,'customer'),($3,'customer'),($4,'customer') on conflict(profile_id,role) do nothing",[invitedProfileId,financeProfileId,unconfirmedMemberProfileId,legacyMemberProfileId]);
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,now()),($7,$8,null),($9,$10,now()) on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [secondAuthUserId,"ci-customer-two@example.test",invitedAuthUserId,"ci-invited-buyer@example.test",financeAuthUserId,"ci-invited-finance@example.test",unconfirmedMemberAuthUserId,"ci-unconfirmed-member@example.test",legacyMemberAuthUserId,"ci-legacy-member@example.test"],
  );
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const inviteRows=await db.unsafe("select public.create_customer_company_invitation($1::text,$2::text) as result",["ci-invited-buyer@example.test","buyer"]);
  const invite=inviteRows[0].result;
  assert.match(invite.invitation_token,/^[0-9a-f]{64}$/i,"owner receives a one-time random invitation token");
  assert.equal(invite.invited_email,"ci-invited-buyer@example.test");
  await expectFailure("authenticated users cannot enumerate invitation tokens",
    ()=>db.unsafe("select id,token_hash from public.customer_company_invitations where id=$1",[invite.invitation_id]),/permission denied/i);
  await expectFailure("authenticated users cannot read membership rows directly",
    ()=>db.unsafe("select profile_id,member_role from public.customer_company_memberships"),/permission denied/i);
  const ownerList=await db.unsafe("select public.list_customer_company_members() as result");
  assert.ok(ownerList[0].result.invitations.some(row=>row.invitation_id===invite.invitation_id&&row.status==="pending"));
  await db.unsafe("reset role");
  const storedHash=await db.unsafe("select token_hash from public.customer_company_invitations where id=$1",[invite.invitation_id]);
  assert.equal(storedHash[0].token_hash.length,64,"new company invitations store a SHA-256 digest");
  const pgcryptoSchemaRows = await db.unsafe(
    "select n.nspname as schema_name from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'",
  );
  assert.equal(pgcryptoSchemaRows.length,1,"pgcrypto must be installed in a discoverable extension schema");
  const digestHelperPrivileges = await db.unsafe(
    "select has_function_privilege('authenticated','public.customer_company_invitation_sha256(text)','EXECUTE') as authenticated_execute," +
    "has_function_privilege('anon','public.customer_company_invitation_sha256(text)','EXECUTE') as anon_execute",
  );
  assert.equal(digestHelperPrivileges[0].authenticated_execute,false,"the private hash helper must not be callable by authenticated clients");
  assert.equal(digestHelperPrivileges[0].anon_execute,false,"the private hash helper must not be callable by anonymous clients");
  const expectedCompanyTokenHash=(await db.unsafe("select public.customer_company_invitation_sha256($1::text) as hash",[invite.invitation_token]))[0].hash;
  assert.equal(storedHash[0].token_hash,expectedCompanyTokenHash,"only the SHA-256 digest is persisted, never the raw bearer token; hashing resolves the installed pgcrypto schema");

  await setIdentity(secondAuthUserId,"ci-customer-two@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("a different email cannot claim an invitation",
    ()=>db.unsafe("select public.accept_customer_company_invitation($1::text)",[invite.invitation_token]),/البريد الإلكتروني الذي استلم/i);
  await db.unsafe("reset role");
  await setIdentity(invitedAuthUserId,"ci-invited-buyer@example.test");
  await db.unsafe("set role authenticated");
  const identityContext=await db.unsafe("select auth.uid() as auth_id,public.current_profile_id() as profile_id,public.current_organization_id() as current_org,(select p.organization_id from public.profiles p where p.auth_user_id=auth.uid()) as profile_org");
  assert.equal(identityContext[0].auth_id,invitedAuthUserId,"the test JWT must resolve to the invited authentication ID");
  assert.equal(identityContext[0].profile_id,invitedProfileId,"the invited identity must resolve to its intended profile");
  await db.unsafe("reset role");
  const invitationContext=await db.unsafe("select i.organization_id as invitation_org,c.organization_id as customer_org,p.organization_id as member_profile_org from public.customer_company_invitations i join public.customers c on c.id=i.customer_id cross join public.profiles p where i.id=$1 and p.id=$2",[invite.invitation_id,invitedProfileId]);
  assert.equal(invitationContext[0].invitation_org,invitationContext[0].customer_org,"invitation must retain its owning customer's organization");
  assert.equal(invitationContext[0].member_profile_org,invitationContext[0].invitation_org,"new member profile and invitation must share the same organization before acceptance");
  await db.unsafe("set role authenticated");
  const accepted=await db.unsafe("select public.accept_customer_company_invitation($1::text) as result",[invite.invitation_token]);
  assert.equal(accepted[0].result.company_name,"CI Company One");
  assert.equal(accepted[0].result.member_role,"buyer");
  const companyScope=await db.unsafe("select public.current_customer_id() as customer_id,public.current_customer_can('orders.create') as can_order,public.current_customer_can('statement.read') as can_statement");
  assert.equal(companyScope[0].customer_id,customerOneId,"member is bound to the invited customer, not a new company");
  assert.equal(companyScope[0].can_order,true,"buyer is allowed to create company orders");
  assert.equal(companyScope[0].can_statement,false,"buyer is not allowed to read finance statements");
  assert.equal((await db.unsafe("select id from public.customers where id=$1",[customerOneId])).length,1);
  assert.equal((await db.unsafe("select id from public.customers where profile_id=$1",[secondProfileId])).length,0,"member cannot read a different customer in the same organization");
  assert.equal((await db.unsafe("select id from public.customer_addresses where id=$1",[firstId])).length,1,"buyer is scoped to the invited company's addresses");
  assert.equal((await db.unsafe("select id from public.customer_company_contacts where id=$1",[firstContactId])).length,1,"buyer is scoped to the invited company's contacts");
  const memberOrderRows=await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid) as result",
    [db.json([{product_id:productId,quantity:1}]),"Member checkout test","CI Company One","Invited buyer","7771113333","cash_on_delivery","member-checkout-key-000001",null],
  );
  const memberOrderId=memberOrderRows[0].result.id;
  assert.match(String(memberOrderId), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "company-member checkout returns the persisted order identifier");
  // Verify the tenant/customer association from the isolated database owner context.
  // The authenticated customer role intentionally cannot SELECT arbitrary financial/order
  // columns or rows directly; that is a separate RLS boundary, not evidence that insertion failed.
  await db.unsafe("reset role");
  const linkedOrder=await db.unsafe("select customer_id from public.orders where id=$1",[memberOrderId]);
  assert.equal(linkedOrder.length,1,"company-member checkout persists exactly one order");
  assert.equal(linkedOrder[0].customer_id,customerOneId,"member checkout creates an order for the linked company");
  await db.unsafe("set role authenticated");
  await expectFailure("accepted invitation tokens cannot be replayed",
    ()=>db.unsafe("select public.accept_customer_company_invitation($1::text)",[invite.invitation_token]),/استُخدمت|الدعوة غير موجودة/i);

  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const companySecurityUnconfirmedRows=await db.unsafe("select public.create_customer_company_invitation($1::text,$2::text) as result",["ci-unconfirmed-member@example.test","viewer"]);
  const companySecurityUnconfirmedInvite=companySecurityUnconfirmedRows[0].result;
  await db.unsafe("reset role");
  await setIdentity(unconfirmedMemberAuthUserId,"ci-unconfirmed-member@example.test");
  // Simulate a stale/incorrect positive claim: the persistent auth.users row remains unconfirmed.
  await db.unsafe("select set_config('request.jwt.claims', $1, false)",[
    JSON.stringify({sub:unconfirmedMemberAuthUserId,email:"ci-unconfirmed-member@example.test",email_confirmed_at:new Date().toISOString(),role:"authenticated",session_id:unconfirmedMemberAuthUserId}),
  ]);
  await db.unsafe("set role authenticated");
  await expectFailure("company invitation rejects unconfirmed auth.users even if the JWT says confirmed",
    ()=>db.unsafe("select public.accept_customer_company_invitation($1::text)",[companySecurityUnconfirmedInvite.invitation_token]),
    /أكّد بريدك الإلكتروني قبل قبول الدعوة/i);
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const companySecurityRevocationResult=await db.unsafe("select public.revoke_customer_company_invitation($1::uuid) as result",[companySecurityUnconfirmedInvite.invitation_id]);
  assert.equal(companySecurityRevocationResult[0].result,true,"company owner can revoke a pending invitation within its tenant");
  await db.unsafe("reset role");
  await setIdentity(unconfirmedMemberAuthUserId,"ci-unconfirmed-member@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("revoked company invitation cannot be accepted",
    ()=>db.unsafe("select public.accept_customer_company_invitation($1::text)",[companySecurityUnconfirmedInvite.invitation_token]),
    /الدعوة غير موجودة أو استُخدمت أو أُلغيت/i);
  await db.unsafe("reset role");

  // Existing pending invitations have MD5 digests and remain usable until their original expiry.
  const companySecurityLegacyToken="c".repeat(64);
  await db.unsafe(
    "insert into public.customer_company_invitations(organization_id,customer_id,invited_email,member_role,token_hash,status,invited_by,expires_at) values($1,$2,$3,'viewer',md5($4),'pending',$5,now()+interval '7 days')",
    [organizationId,customerOneId,"ci-legacy-member@example.test",companySecurityLegacyToken,profileId],
  );
  await setIdentity(legacyMemberAuthUserId,"ci-legacy-member@example.test");
  await db.unsafe("set role authenticated");
  const companySecurityLegacyAcceptance=await db.unsafe("select public.accept_customer_company_invitation($1::text) as result",[companySecurityLegacyToken]);
  assert.equal(companySecurityLegacyAcceptance[0].result.company_name,"CI Company One","an unexpired pre-migration invitation remains redeemable");
  assert.equal(companySecurityLegacyAcceptance[0].result.member_role,"viewer");
  await db.unsafe("reset role");
  const companySecurityLegacyStatus=await db.unsafe("select status from public.customer_company_invitations where invited_email=$1 order by created_at desc limit 1",["ci-legacy-member@example.test"]);
  assert.equal(companySecurityLegacyStatus[0].status,"accepted","legacy invite acceptance transitions once and is auditable");
  const companySecurityLegacyAudit=await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='customer_company_membership' and entity_id=$2::uuid and action='customer_company_invitation.accepted'",
    [organizationId,companySecurityLegacyAcceptance[0].result.membership_id],
  );
  assert.equal(companySecurityLegacyAudit.length,1,"successful legacy invitation acceptance writes an audit event against the created membership");

  const companySecurityExpiredToken="e".repeat(64);
  await db.unsafe(
    "insert into public.customer_company_invitations(organization_id,customer_id,invited_email,member_role,token_hash,status,invited_by,expires_at) values($1,$2,$3,'viewer',md5($4),'pending',$5,now()-interval '1 minute')",
    [organizationId,customerOneId,"ci-legacy-member@example.test",companySecurityExpiredToken,profileId],
  );
  const companySecurityMembershipCountBeforeExpiry=await db.unsafe(
    "select count(*)::integer as count from public.customer_company_memberships " +
    "where profile_id=$1::uuid and customer_id=$2::uuid",
    [legacyMemberProfileId,customerOneId]);
  await setIdentity(legacyMemberAuthUserId,"ci-legacy-member@example.test");
  await db.unsafe("set role authenticated");
  const companySecurityExpiredAcceptance=await db.unsafe(
    "select public.accept_customer_company_invitation($1::text) as result",[companySecurityExpiredToken]);
  assert.deepEqual(companySecurityExpiredAcceptance[0].result,{
    status:"expired",
    error:"انتهت صلاحية الدعوة؛ اطلب رابطًا جديدًا",
  },"an expired legacy invitation returns a committed expired result rather than throwing and rolling back");
  await db.unsafe("reset role");
  const companySecurityMembershipCountAfterExpiry=await db.unsafe(
    "select count(*)::integer as count from public.customer_company_memberships " +
    "where profile_id=$1::uuid and customer_id=$2::uuid",
    [legacyMemberProfileId,customerOneId]);
  assert.equal(
    companySecurityMembershipCountAfterExpiry[0].count,
    companySecurityMembershipCountBeforeExpiry[0].count,
    "expired invitation must not add a company membership to the invitee",
  );
  const companySecurityExpiredState=await db.unsafe(
    "select status from public.customer_company_invitations where token_hash=md5($1::text)",[companySecurityExpiredToken]);
  assert.equal(companySecurityExpiredState[0]?.status,"expired","expiry status persists after acceptance RPC");
  const companySecurityExpiredAudit=await db.unsafe(
    "select actor_id,new_value from public.audit_logs where organization_id=$1::uuid " +
    "and entity_type='customer_company_invitation' and action='customer_company_invitation.expired' " +
    "and entity_id=(select id from public.customer_company_invitations where token_hash=md5($2::text))",
    [organizationId,companySecurityExpiredToken]);
  assert.equal(companySecurityExpiredAudit.length,1,"expired legacy invitation creates exactly one audit event");
  assert.equal(companySecurityExpiredAudit[0].actor_id,legacyMemberProfileId,"expiry audit attributes the invited actor");
  assert.equal(companySecurityExpiredAudit[0].new_value.status,"expired");
  await setIdentity(legacyMemberAuthUserId,"ci-legacy-member@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("expired company invitation token cannot be replayed",
    ()=>db.unsafe("select public.accept_customer_company_invitation($1::text)",[companySecurityExpiredToken]),
    /الدعوة غير موجودة أو استُخدمت أو أُلغيت/i);
  await db.unsafe("reset role");

  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const financeInviteRows=await db.unsafe("select public.create_customer_company_invitation($1::text,$2::text) as result",["ci-invited-finance@example.test","finance"]);
  const financeInvite=financeInviteRows[0].result;
  await db.unsafe("reset role");
  await setIdentity(financeAuthUserId,"ci-invited-finance@example.test");
  await db.unsafe("set role authenticated");
  await db.unsafe("select public.accept_customer_company_invitation($1::text)",[financeInvite.invitation_token]);
  const financeScope=await db.unsafe("select public.current_customer_id() as customer_id,public.current_customer_can('orders.create') as can_order,public.current_customer_can('statement.read') as can_statement");
  assert.equal(financeScope[0].customer_id,customerOneId);
  assert.equal(financeScope[0].can_order,false,"finance member cannot create orders");
  assert.equal(financeScope[0].can_statement,true,"finance member can read company statements");
  await expectFailure("finance member cannot bypass the order capability through checkout",
    ()=>db.unsafe("select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid)",
      [db.json([{product_id:productId,quantity:1}]),"Forbidden finance checkout","CI Company One","Finance member","7771114444","cash_on_delivery","finance-checkout-key-0001",null]),
    /not allowed to place orders/i);

  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const memberList=await db.unsafe("select public.list_customer_company_members() as result");
  assert.ok(memberList[0].result.members.some(row=>row.profile_id===invitedProfileId&&row.status==="active"));
  const revoked=await db.unsafe("select public.revoke_customer_company_member($1::uuid) as result",[invitedProfileId]);
  assert.equal(revoked[0].result,true,"company owner can revoke its active member");
  await db.unsafe("reset role");
  await setIdentity(invitedAuthUserId,"ci-invited-buyer@example.test");
  await db.unsafe("set role authenticated");
  const revokedScope=await db.unsafe("select public.current_customer_id() as customer_id,public.current_customer_can('orders.read') as can_read");
  assert.equal(revokedScope[0].customer_id,null,"revocation removes active company scope");
  assert.equal(revokedScope[0].can_read,false);
  assert.equal((await db.unsafe("select id from public.orders where id=$1",[memberOrderId])).length,0,"revoked member loses order visibility");
  process.stdout.write("PASS company membership: hash-only invitations, email-bound single-use acceptance, tenant isolation, buyer/finance capabilities, checkout linkage and revocation\n");

  // AGH-AI-GATEWAY-001: configuration authorization, atomic budget reservation and usage audit.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const aiSettings = {
    ai_enabled: true, fallback_enabled: true,
    primary_provider: "openai_compatible", primary_model: "gpt-4o-mini", primary_base_url: "https://api.openai.com/v1",
    fallback_provider: "gemini", fallback_model: "gemini-2.0-flash", fallback_base_url: "https://generativelanguage.googleapis.com/v1beta",
    daily_cost_limit: 0.05, monthly_cost_limit: 0.06, daily_token_limit: 1000, monthly_token_limit: 2000, per_request_cost_limit: 0.04,
  };
  const savedAiBudget = await db.unsafe("select public.configure_ai_usage_budget($1::jsonb) as result", [db.json(aiSettings)]);
  assert.equal(savedAiBudget[0].result.ai_enabled, true);
  assert.equal(savedAiBudget[0].result.keys_stored_in_database, false);
  assert.equal(savedAiBudget[0].result.organization_id, organizationId);
  await expectFailure(
    "AI gateway refuses plaintext provider endpoints",
    () => db.unsafe("select public.configure_ai_usage_budget($1::jsonb)", [db.json({ ...aiSettings, primary_base_url: "http://localhost:8000/v1" })]),
    /endpoint configuration is invalid/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("customers cannot access AI gateway administration",
    () => db.unsafe("select public.get_ai_gateway_budget()"), /administrator or manager/i);
  await expectFailure("authenticated users cannot read AI reservation rows directly",
    () => db.unsafe("select * from public.ai_usage_reservations"), /permission denied/i);

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  const runtimeConfig = await db.unsafe("select public.get_ai_gateway_runtime_config($1::uuid) as result", [staffAuthUserId]);
  assert.equal(runtimeConfig[0].result.status, "enabled");
  assert.equal(runtimeConfig[0].result.organization_id, organizationId);
  assert.equal(runtimeConfig[0].result.primary_model, "gpt-4o-mini");
  assert.ok(!("api_key" in runtimeConfig[0].result) && !("secret" in runtimeConfig[0].result));

  const firstReservation = await db.unsafe(
    "select public.reserve_ai_gateway_usage($1::uuid,$2::text,$3::bigint,$4::bigint,$5::numeric) as result",
    [staffAuthUserId,"ci-ai-request-000001",10,20,0.02],
  );
  assert.equal(firstReservation[0].result.status, "reserved");
  const reservationId = firstReservation[0].result.reservation_id;
  const completedUsage = await db.unsafe(
    "select public.complete_ai_gateway_usage($1::uuid,$2::bigint,$3::bigint,$4::numeric,$5::bigint,$6::text,$7::text,$8::text,$9::boolean) as result",
    [reservationId,10,20,0.02,45,"openai_compatible","gpt-4o-mini","completed",false],
  );
  assert.equal(completedUsage[0].result.status, "completed");
  const aiLedger = await db.unsafe(
    "select request_id,model_name,input_tokens,output_tokens,estimated_cost,result_status from public.ai_usage_ledger where organization_id=$1 and request_id=$2",
    [organizationId,"ci-ai-request-000001"],
  );
  assert.equal(aiLedger.length,1);
  assert.equal(aiLedger[0].model_name,"openai_compatible/gpt-4o-mini");
  assert.equal(Number(aiLedger[0].estimated_cost),0.02);
  assert.equal(aiLedger[0].result_status,"completed");
  const replayUsage = await db.unsafe(
    "select public.complete_ai_gateway_usage($1::uuid,$2::bigint,$3::bigint,$4::numeric,$5::bigint,$6::text,$7::text,$8::text,$9::boolean) as result",
    [reservationId,10,20,0.02,45,"openai_compatible","gpt-4o-mini","completed",false],
  );
  assert.equal(replayUsage[0].result.status,"already_completed","usage retries do not duplicate ledger rows");
  const rejectedReservation = await db.unsafe(
    "select public.reserve_ai_gateway_usage($1::uuid,$2::text,$3::bigint,$4::bigint,$5::numeric) as result",
    [staffAuthUserId,"ci-ai-request-000002",10,20,0.04],
  );
  assert.equal(rejectedReservation[0].result.status,"quota_exceeded","usage reservation respects the daily cost cap");
  const rejectedLedger = await db.unsafe(
    "select result_status,estimated_cost from public.ai_usage_ledger where organization_id=$1 and request_id=$2",
    [organizationId,"ci-ai-request-000002"],
  );
  assert.equal(rejectedLedger[0].result_status,"rejected_quota");
  assert.equal(Number(rejectedLedger[0].estimated_cost),0);

  await db.unsafe("set role authenticated");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await expectFailure("customers cannot configure AI budgets",
    () => db.unsafe("select public.configure_ai_usage_budget($1::jsonb)",[db.json(aiSettings)]),
    /administrator or manager/i);
  await expectFailure("customers cannot reserve AI usage directly",
    () => db.unsafe("select public.reserve_ai_gateway_usage($1::uuid,$2::text,$3::bigint,$4::bigint,$5::numeric)",[authUserId,"customer-spoof",1,1,0.001]),
    /permission denied/i);
  await db.unsafe("reset role");
  process.stdout.write("PASS AI gateway: admin-owned settings, HTTPS validation, atomic budget caps, usage ledger replay, service-only RPCs and customer denial\n");


  // AGH-TASK-ASSIGNEE-001: admin/manager assignment directory is active and organization-scoped.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const assignableDirectoryRows = await db.unsafe("select public.list_operational_task_assignees() as result");
  const assignableDirectory = assignableDirectoryRows[0].result;
  assert.ok(Array.isArray(assignableDirectory), "task assignment directory returns a JSON array");
  assert.ok(assignableDirectory.some((row) => row.profile_id === staffProfileId), "active administrator appears in its organization directory");
  assert.ok(!assignableDirectory.some((row) => row.profile_id === foreignProfileId), "foreign-organization user is never visible for assignment");
  assert.ok(assignableDirectory.every((row) => typeof row.full_name === "string" && Array.isArray(row.roles)), "assignment list contains validated display and role data");

  // AGH-OPS-TASK-CENTER-001: source-driven, idempotent tasks and role-isolated status transitions.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const taskRefresh = await db.unsafe("select public.refresh_operational_tasks() as result");
  assert.equal(taskRefresh[0].result.organization_id, organizationId, "task refresh derives tenant from the authenticated administrator");
  assert.ok(Number(taskRefresh[0].result.source_records_refreshed) >= 1, "task refresh scans persisted source records");

  // The refresh RPC mutates the task queue and is restricted to admins/managers.
  // A customer must be denied before any task state or audit row can change.
  await db.unsafe("reset role");
  const taskStateBeforeCustomerRefresh = (await db.unsafe(
    "select coalesce(jsonb_agg(jsonb_build_object(" +
      "'id',id::text,'status',status,'updated_at',updated_at,'completed_at',completed_at," +
      "'completed_by',completed_by::text,'source_event_key',source_event_key,'resolution_note',resolution_note) order by id),'[]'::jsonb) as state " +
      "from public.ai_tasks where organization_id=$1::uuid",
    [organizationId],
  ))[0].state;
  const taskAuditCountBeforeCustomerRefresh = (await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid",
    [organizationId],
  ))[0].count;
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot invoke the staff-only operational-task refresh RPC",
    () => db.unsafe("select public.refresh_operational_tasks() as result"),
    /administrator or manager permission required to refresh tasks/i,
    "42501",
  );
  await db.unsafe("reset role");
  const taskStateAfterCustomerRefresh = (await db.unsafe(
    "select coalesce(jsonb_agg(jsonb_build_object(" +
      "'id',id::text,'status',status,'updated_at',updated_at,'completed_at',completed_at," +
      "'completed_by',completed_by::text,'source_event_key',source_event_key,'resolution_note',resolution_note) order by id),'[]'::jsonb) as state " +
      "from public.ai_tasks where organization_id=$1::uuid",
    [organizationId],
  ))[0].state;
  const taskAuditCountAfterCustomerRefresh = (await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid",
    [organizationId],
  ))[0].count;
  assert.deepEqual(taskStateAfterCustomerRefresh, taskStateBeforeCustomerRefresh,
    "denied customer refresh must leave every task and task-state field unchanged");
  assert.equal(taskAuditCountAfterCustomerRefresh, taskAuditCountBeforeCustomerRefresh,
    "denied customer refresh must not emit audit rows");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");

  const reviewKey = "order-review:" + staffCreatedOrder.id;
  const reviewBefore = await db.unsafe(
    "select id,task_role,status from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, reviewKey],
  );
  assert.equal(reviewBefore.length, 1, "a real pending order creates one sales review task");
  assert.equal(reviewBefore[0].task_role, "sales");
  await db.unsafe("select public.refresh_operational_tasks()");
  const reviewAfter = await db.unsafe(
    "select id from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, reviewKey],
  );
  assert.equal(reviewAfter.length, 1, "reconciling the same source order cannot duplicate its task");

  const manualTaskRows = await db.unsafe(
    "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,$5::timestamptz,$6::uuid) as id",
    ["CI task-center manual task", "Database acceptance test", "sales", "high", null, null],
  );
  const manualTaskId = manualTaskRows[0].id;
  await expectFailure(
    "authenticated role cannot directly update ai_tasks",
    () => db.unsafe("update public.ai_tasks set status='completed' where id=$1", [manualTaskId]),
    /permission denied/i,
  );
  const taskComplete = await db.unsafe(
    "select public.update_operational_task_status($1::uuid,$2::text,$3::text) as result",
    [manualTaskId, "completed", "CI acceptance completion"],
  );
  assert.equal(taskComplete[0].result.status, "completed", "status changes run through the audited RPC");
  const manualTaskState = await db.unsafe(
    "select status,completed_by,resolution_note from public.ai_tasks where id=$1",
    [manualTaskId],
  );
  assert.equal(manualTaskState[0].status, "completed");
  assert.equal(manualTaskState[0].completed_by, staffProfileId, "completion records the authenticated actor");
  assert.equal(manualTaskState[0].resolution_note, "CI acceptance completion");

  // Force an actual crossing into and out of the persisted reorder threshold.
  await db.unsafe("reset role");
  const testWarehouseId = "d0000000-0000-0000-0000-000000000001";
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
    "values($1,$2,100,0,20) on conflict(product_id,warehouse_id) do update " +
    "set quantity_on_hand=100,quantity_reserved=0,reorder_point=20",
    [productId, testWarehouseId],
  );
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=10 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  const stockBalance = await db.unsafe(
    "select id from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  const stockKey = "low-stock:" + stockBalance[0].id;
  const lowStockTask = await db.unsafe(
    "select id,status,task_role from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, stockKey],
  );
  assert.equal(lowStockTask.length, 1, "crossing below the recorded reorder threshold creates a purchasing task");
  assert.equal(lowStockTask[0].task_role, "purchasing");
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=7 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  assert.equal((await db.unsafe("select id from public.ai_tasks where organization_id=$1 and source_event_key=$2", [organizationId, stockKey])).length, 1,
    "continued low stock must not duplicate the active task");
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=25 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  const restoredTask = await db.unsafe("select status from public.ai_tasks where organization_id=$1 and source_event_key=$2", [organizationId, stockKey]);
  assert.equal(restoredTask[0].status, "completed", "restocking above the threshold auto-closes the purchasing task");
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=8 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  const reenteredTask = await db.unsafe("select id,status from public.ai_tasks where organization_id=$1 and source_event_key=$2", [organizationId, stockKey]);
  assert.equal(reenteredTask.length, 1, "a new low-stock episode reuses the same unique task");
  assert.equal(reenteredTask[0].status, "pending", "only a real new threshold crossing reopens the closed task");

  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const invoiceTask = await db.unsafe(
    "select id,task_role,status from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, "invoice-collection:" + invoice.id],
  );
  assert.equal(invoiceTask.length, 1, "the persisted partially-paid invoice creates one accounting collection task");
  assert.equal(invoiceTask[0].task_role, "accountant");

  const accountantManual = await db.unsafe(
    "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,$5::timestamptz,$6::uuid) as id",
    ["CI accounting task", "Must be visible to the accountant lane only", "accountant", "medium", null, null],
  );
  const accountantTaskId = accountantManual[0].id;

  const assignedManualRows = await db.unsafe(
    "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,$5::timestamptz,$6::uuid) as id",
    ["CI explicitly assigned sales task", "Assignee persistence verification", "sales", "high", null, staffProfileId],
  );
  const assignedManualId = assignedManualRows[0].id;
  const persistedAssignee = await db.unsafe("select assigned_to from public.ai_tasks where id=$1", [assignedManualId]);
  assert.equal(persistedAssignee[0].assigned_to, staffProfileId, "valid same-organization role-compatible assignee persists");
  await expectFailure(
    "sales tasks cannot be assigned to a finance-only user",
    () => db.unsafe(
      "select public.create_operational_task($1::text,$2::text,$3::text,$4::text,$5::timestamptz,$6::uuid)",
      ["CI incompatible assignee", "Should reject", "sales", "high", null, accountantProfileId],
    ),
    /operational tasks require an active staff assignee/i,
  );

  // AGH-INVENTORY-TRANSFER-001: server-authoritative, idempotent and tenant-bound stock transfer.
  await db.unsafe("reset role");
  const transferDestinationRows = await db.unsafe(
    "select id from public.warehouses where organization_id=$1 and is_active and id<>$2 order by id limit 1",
    [organizationId, testWarehouseId],
  );
  assert.equal(transferDestinationRows.length, 1, "the test organization needs a second active warehouse");
  const transferDestinationId = transferDestinationRows[0].id;
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1,$2,40,10,20) on conflict(product_id,warehouse_id) do update set quantity_on_hand=40,quantity_reserved=10,reorder_point=20",
    [productId, testWarehouseId],
  );
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1,$2,5,2,1) on conflict(product_id,warehouse_id) do update set quantity_on_hand=5,quantity_reserved=2,reorder_point=1",
    [productId, transferDestinationId],
  );
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const transferKey = "ci-inventory-transfer-key-000001";
  const transferArguments = [
    productId, testWarehouseId, transferDestinationId, "7.000",
    "CI atomic stock transfer", transferKey,
  ];
  const stockTransfer = await db.unsafe(
    "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text) as result",
    transferArguments,
  );
  const transferResult = stockTransfer[0].result;
  assert.equal(transferResult.idempotent_replay, false, "first stock transfer executes a new movement");
  assert.equal(Number(transferResult.quantity), 7);
  assert.ok(transferResult.transfer_id);
  const transferBalances = await db.unsafe(
    "select warehouse_id,quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id in ($2::uuid,$3::uuid) order by warehouse_id",
    [productId, testWarehouseId, transferDestinationId],
  );
  const sourceAfterTransfer = transferBalances.find((row) => row.warehouse_id === testWarehouseId);
  const destinationAfterTransfer = transferBalances.find((row) => row.warehouse_id === transferDestinationId);
  assert.equal(Number(sourceAfterTransfer.quantity_on_hand), 33, "source on-hand decreases atomically");
  assert.equal(Number(sourceAfterTransfer.quantity_reserved), 10, "source reservations are not transferred");
  assert.equal(Number(sourceAfterTransfer.quantity_available), 23);
  assert.equal(Number(destinationAfterTransfer.quantity_on_hand), 12, "destination on-hand increases atomically");
  assert.equal(Number(destinationAfterTransfer.quantity_reserved), 2, "destination reservations remain unchanged");
  assert.equal(Number(destinationAfterTransfer.quantity_available), 10);
  const linkedTransferMovements = await db.unsafe(
    "select movement_type,quantity,warehouse_id from public.inventory_movements where reference_type='inventory_transfer' and reference_id=$1::uuid order by movement_type",
    [transferResult.transfer_id],
  );
  assert.equal(linkedTransferMovements.length, 2, "the transfer writes exactly two linked movement ledger rows");
  assert.deepEqual(linkedTransferMovements.map((row) => Number(row.quantity)).sort((a,b)=>a-b), [-7,7]);
  const replayedTransfer = await db.unsafe(
    "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text) as result",
    transferArguments,
  );
  assert.equal(replayedTransfer[0].result.transfer_id, transferResult.transfer_id);
  assert.equal(replayedTransfer[0].result.idempotent_replay, true, "a timeout retry with the same payload cannot move stock twice");
  await expectFailure(
    "inventory transfer key cannot be reused for a different quantity",
    () => db.unsafe(
      "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text)",
      [productId, testWarehouseId, transferDestinationId, "8.000", "CI atomic stock transfer", transferKey],
    ),
    /idempotency key payload conflict/i,
  );
  await expectFailure(
    "inventory transfer cannot use reserved stock or move more than available quantity",
    () => db.unsafe(
      "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text)",
      [productId, testWarehouseId, transferDestinationId, "24.000", "CI insufficient availability", "ci-inventory-transfer-insufficient-0001"],
    ),
    /insufficient available stock/i,
  );
  const afterRejectedTransfer = await db.unsafe(
    "select quantity_on_hand,quantity_reserved from public.inventory_balances where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  assert.equal(Number(afterRejectedTransfer[0].quantity_on_hand), 33, "a rejected transfer must roll back without changing source stock");
  await db.unsafe("reset role");
  const foreignTransferWarehouseRows = await db.unsafe(
    "select id from public.warehouses where organization_id<>$1 and is_active order by id limit 1",
    [organizationId],
  );
  assert.equal(foreignTransferWarehouseRows.length, 1, "the fixture needs an active warehouse in another organization");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "inventory transfer cannot target a foreign-tenant warehouse",
    () => db.unsafe(
      "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text)",
      [productId, testWarehouseId, foreignTransferWarehouseRows[0].id, "1.000", "CI cross-tenant denial", "ci-inventory-transfer-foreign-0001"],
    ),
    /warehouse|مستودع|organization/i,
  );
  await expectFailure(
    "authenticated staff cannot modify transfer ledger rows directly",
    () => db.unsafe("update public.inventory_transfers set reason='forged' where id=$1::uuid", [transferResult.transfer_id]),
    /permission denied/i,
  );
  await expectFailure(
    "authenticated staff cannot write inventory balances directly",
    () => db.unsafe("update public.inventory_balances set reorder_point=999 where id=$1::uuid", [stockBalance[0].id]),
    /permission denied/i,
  );
  await expectFailure(
    "authenticated staff cannot append inventory movement rows directly",
    () => db.unsafe(
      "insert into public.inventory_movements(product_id,warehouse_id,movement_type,quantity,reference_type,reason,created_by) values($1,$2,'manual',1,'test','forged movement',$3)",
      [productId, testWarehouseId, staffProfileId],
    ),
    /permission denied/i,
  );

  // ADAPTED SOURCE FEATURE: atomic multi-product transfer batch, distinct from one-product transfer_inventory.
  await db.unsafe("reset role");
  const batchProductRows = await db.unsafe(
    "select id from public.products where organization_id=$1 and status='active' and id<>$2 order by id limit 1",
    [organizationId, productId],
  );
  assert.equal(batchProductRows.length, 1, "batch transfer acceptance needs two active same-tenant products");
  const batchProductId = batchProductRows[0].id;
  const batchProductOriginalBalances = await db.unsafe(
    "select warehouse_id,quantity_on_hand,quantity_reserved,reorder_point from public.inventory_balances " +
    "where product_id=$1 and warehouse_id=any($2::uuid[])",
    [batchProductId, [testWarehouseId, transferDestinationId]],
  );
  const batchSeedRows = [
    [productId, testWarehouseId, 50, 5, 20], [productId, transferDestinationId, 2, 1, 1],
    [batchProductId, testWarehouseId, 30, 3, 10], [batchProductId, transferDestinationId, 4, 1, 1],
  ];
  for (const [batchSeedProduct, batchSeedWarehouse, onHand, reserved, reorder] of batchSeedRows) {
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
      "values($1,$2,$3,$4,$5) on conflict(product_id,warehouse_id) do update " +
      "set quantity_on_hand=excluded.quantity_on_hand,quantity_reserved=excluded.quantity_reserved,reorder_point=excluded.reorder_point",
      [batchSeedProduct, batchSeedWarehouse, onHand, reserved, reorder],
    );
  }
  const batchKey = "ci-inventory-batch-key-000001";
  const batchReason = "CI multi-product atomic transfer";
  const batchLines = [{ product_id: productId, quantity: 3.000 }, { product_id: batchProductId, quantity: 2.125 }];
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const batchReply = await db.unsafe(
    "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text) as result",
    [testWarehouseId, transferDestinationId, batchKey, db.json(batchLines), batchReason],
  );
  const batchResult = batchReply[0].result;
  assert.equal(batchResult.idempotent_replay, false, "first batch transfer commits");
  assert.equal(Number(batchResult.line_count), 2);
  assert.ok(batchResult.batch_id);
  await db.unsafe("reset role");
  const batchHeader = await db.unsafe(
    "select line_count,payload,organization_id from public.inventory_transfer_batches where id=$1::uuid",
    [batchResult.batch_id],
  );
  assert.equal(batchHeader.length, 1);
  assert.equal(Number(batchHeader[0].line_count), 2);
  assert.equal(batchHeader[0].organization_id, organizationId);
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "authenticated staff cannot directly select batch headers",
    () => db.unsafe("select id from public.inventory_transfer_batches where organization_id=$1", [organizationId]),
    /permission denied/i,
  );
  const storedBatchPayload = typeof batchHeader[0].payload === "string" ? JSON.parse(batchHeader[0].payload) : batchHeader[0].payload;
  assert.equal(storedBatchPayload.length, 2, "batch stores its canonical item/quantity payload");
  const batchTransferRows = await db.unsafe(
    "select id,product_id,quantity,batch_id from public.inventory_transfers where batch_id=$1::uuid order by product_id",
    [batchResult.batch_id],
  );
  assert.equal(batchTransferRows.length, 2, "every batch line has a normal transfer ledger row");
  assert.ok(batchTransferRows.every((row) => row.batch_id === batchResult.batch_id));
  const batchBalanceRows = await db.unsafe(
    "select product_id,warehouse_id,quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances " +
    "where product_id in ($1::uuid,$2::uuid) and warehouse_id in ($3::uuid,$4::uuid) order by product_id,warehouse_id",
    [productId, batchProductId, testWarehouseId, transferDestinationId],
  );
  const balanceFor = (pid, wid) => batchBalanceRows.find((row) => row.product_id === pid && row.warehouse_id === wid);
  assert.equal(Number(balanceFor(productId, testWarehouseId).quantity_on_hand), 47);
  assert.equal(Number(balanceFor(productId, testWarehouseId).quantity_reserved), 5);
  assert.equal(Number(balanceFor(productId, transferDestinationId).quantity_on_hand), 5);
  assert.equal(Number(balanceFor(productId, transferDestinationId).quantity_reserved), 1);
  assert.equal(Number(balanceFor(batchProductId, testWarehouseId).quantity_on_hand), 27.875);
  assert.equal(Number(balanceFor(batchProductId, testWarehouseId).quantity_reserved), 3);
  assert.equal(Number(balanceFor(batchProductId, transferDestinationId).quantity_on_hand), 6.125);
  assert.equal(Number(balanceFor(batchProductId, transferDestinationId).quantity_reserved), 1);
  const batchMovementRows = await db.unsafe(
    "select m.product_id,m.movement_type,m.quantity,m.reference_id " +
    "from public.inventory_movements m join public.inventory_transfers t on t.id=m.reference_id " +
    "where t.batch_id=$1::uuid and m.reference_type='inventory_transfer' order by m.product_id,m.movement_type",
    [batchResult.batch_id],
  );
  assert.equal(batchMovementRows.length, 4, "each product transfer writes a linked in/out movement pair");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const scopedHistory = await db.unsafe(
    "select organization_id,id from public.list_inventory_transfer_history($1)",
    [500],
  );
  assert.ok(scopedHistory.length >= 2, "tenant history RPC returns persisted batch movement rows");
  assert.ok(scopedHistory.every((row) => row.organization_id === organizationId),
    "tenant history RPC never returns transfer rows from another organization");
  await db.unsafe("reset role");

  assert.deepEqual(batchMovementRows.map((row) => Number(row.quantity)).sort((a,b)=>a-b), [-3,-2.125,2.125,3]);
  const replayBatch = await db.unsafe(
    "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text) as result",
    [testWarehouseId, transferDestinationId, batchKey, db.json([...batchLines].reverse()), batchReason],
  );
  assert.equal(replayBatch[0].result.batch_id, batchResult.batch_id);
  assert.equal(replayBatch[0].result.idempotent_replay, true, "reordered retry cannot duplicate a transfer");
  await expectFailure(
    "batch transfer idempotency key cannot be reused with changed quantity",
    () => db.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)",
      [testWarehouseId, transferDestinationId, batchKey, db.json([{ product_id: productId, quantity: 4 }, { product_id: batchProductId, quantity: 2.125 }]), batchReason],
    ),
    /payload conflict/i,
  );

  // A rejected line must leave no header, item transfer, movement or quantity mutation.
  await db.unsafe("reset role");
  for (const batchSeedProduct of [productId, batchProductId]) {
    await db.unsafe(
      "update public.inventory_balances set quantity_on_hand=10,quantity_reserved=2 where product_id=$1 and warehouse_id=$2",
      [batchSeedProduct, testWarehouseId],
    );
  }
  const sortedProducts = [productId, batchProductId].sort();
  const rollbackLines = [
    { product_id: sortedProducts[0], quantity: 1 },
    { product_id: sortedProducts[1], quantity: 9 },
  ];
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "insufficient stock in one batch line rejects the complete batch",
    () => db.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)",
      [testWarehouseId, transferDestinationId, "ci-inventory-batch-rollback-0001", db.json(rollbackLines), batchReason],
    ),
    /insufficient available stock/i,
  );
  await db.unsafe("reset role");
  const rollbackBalances = await db.unsafe(
    "select product_id,quantity_on_hand from public.inventory_balances where product_id in ($1::uuid,$2::uuid) and warehouse_id=$3::uuid",
    [productId, batchProductId, testWarehouseId],
  );
  assert.ok(rollbackBalances.every((row) => Number(row.quantity_on_hand) === 10), "rejected batch leaves all source balances unchanged");
  const rollbackTransfers = await db.unsafe(
    "select id from public.inventory_transfer_batches where organization_id=$1 and idempotency_key=$2",
    [organizationId, "ci-inventory-batch-rollback-0001"],
  );
  assert.equal(rollbackTransfers.length, 0, "rejected batch leaves no persisted header");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "authenticated staff cannot directly update a batch-transfer header",
    () => db.unsafe("update public.inventory_transfer_batches set reason='forged' where id=$1::uuid", [batchResult.batch_id]),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  const batchForeignWarehouse = await db.unsafe(
    "select id from public.warehouses where organization_id<>$1 and is_active order by id limit 1",
    [organizationId],
  );
  assert.equal(batchForeignWarehouse.length, 1, "batch transfer security test needs a foreign-organization warehouse");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "batch transfer cannot target a warehouse in another tenant",
    () => db.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)",
      [testWarehouseId, batchForeignWarehouse[0].id, "ci-inventory-batch-foreign-0001", db.json([{ product_id: productId, quantity: 1 }]), batchReason],
    ),
    /warehouse|organization/i,
  );
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customers cannot use the batch-transfer command",
    () => db.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)",
      [testWarehouseId, transferDestinationId, "ci-inventory-batch-customer-001", db.json([{ product_id: productId, quantity: 1 }]), batchReason],
    ),
    /active staff organization|required|staff/i,
  );
  await expectFailure(
    "customers cannot read inventory transfer history",
    () => db.unsafe("select * from public.list_inventory_transfer_history(100)"),
    /active staff organization|required|staff/i,
  );
  await db.unsafe("reset role");
  // INV-STOCK-001: concurrent duplicate batch submissions with one idempotency key must create one batch.
  // Hold all sorted product rows so both authenticated RPC sessions overlap: the first keeps the
  // tenant-scoped idempotency advisory lock while waiting on a product row; the second must wait
  // on that same key, then replay the first result instead of moving stock a second time.
  await db.unsafe("reset role");
  for (const [raceProduct, raceWarehouse, onHand, reserved] of [
    [productId, testWarehouseId, 10, 2],
    [productId, transferDestinationId, 0, 0],
    [batchProductId, testWarehouseId, 10, 2],
    [batchProductId, transferDestinationId, 0, 0],
  ]) {
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
      "values($1,$2,$3,$4,1) on conflict(product_id,warehouse_id) do update " +
      "set quantity_on_hand=excluded.quantity_on_hand,quantity_reserved=excluded.quantity_reserved,reorder_point=excluded.reorder_point",
      [raceProduct, raceWarehouse, onHand, reserved],
    );
  }

  const concurrentBatchKey = "ci-inventory-batch-samekey-race-0001";
  const concurrentBatchReason = "CI concurrent idempotent batch replay";
  const concurrentBatchLines = [
    { product_id: productId, quantity: 3 },
    { product_id: batchProductId, quantity: 1 },
  ];
  const sameKeyGate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const sameKeyFirst = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const sameKeySecond = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let sameKeyGateOpen = false;
  let sameKeyFirstAttempt;
  let sameKeySecondAttempt;
  const setSameKeyStaffIdentity = async (connection, appName) => {
    await connection.unsafe("select set_config('application_name',$1,false)", [appName]);
    await connection.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [staffAuthUserId]);
    await connection.unsafe("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: staffAuthUserId, email: "admin@aghbari.ye", role: "authenticated", session_id: staffAuthUserId }),
    ]);
    await connection.unsafe("set role authenticated");
  };
  try {
    await Promise.all([
      setSameKeyStaffIdentity(sameKeyFirst, "ci-inventory-batch-same-key-a"),
      setSameKeyStaffIdentity(sameKeySecond, "ci-inventory-batch-same-key-b"),
    ]);
    await sameKeyGate.unsafe("begin");
    sameKeyGateOpen = true;
    await sameKeyGate.unsafe(
      "select id from public.products where id=any($1::uuid[]) order by id for update",
      [[productId, batchProductId]],
    );

    const concurrentArgs = (connection) => [
      testWarehouseId, transferDestinationId, concurrentBatchKey,
      connection.json(concurrentBatchLines), concurrentBatchReason,
    ];
    const submitBatch = (connection) => connection.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text) as result",
      concurrentArgs(connection),
    ).then((rows) => ({ ok: true, result: rows[0].result }))
      .catch((error) => ({ ok: false, error }));
    sameKeyFirstAttempt = submitBatch(sameKeyFirst);
    sameKeySecondAttempt = submitBatch(sameKeySecond);

    let observedBothSameKeySessionsWaiting = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const waiting = await db.unsafe(
        "select count(*)::int as count from pg_catalog.pg_stat_activity " +
        "where application_name in ('ci-inventory-batch-same-key-a','ci-inventory-batch-same-key-b') " +
        "and state='active' and wait_event_type='Lock'",
      );
      if (Number(waiting[0]?.count ?? 0) === 2) {
        observedBothSameKeySessionsWaiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(observedBothSameKeySessionsWaiting, true,
      "concurrent same-key batch calls must overlap while contending on the held product lock and key lock");

    await sameKeyGate.unsafe("commit");
    sameKeyGateOpen = false;
    const [firstOutcome, secondOutcome] = await Promise.all([sameKeyFirstAttempt, sameKeySecondAttempt]);
    assert.equal(firstOutcome.ok, true, "first concurrent same-key batch call must succeed");
    assert.equal(secondOutcome.ok, true, "duplicate concurrent same-key batch call must replay successfully");
    assert.equal(firstOutcome.result.batch_id, secondOutcome.result.batch_id,
      "concurrent same-key requests must return the same canonical batch id");
    assert.deepEqual(
      [firstOutcome.result.idempotent_replay, secondOutcome.result.idempotent_replay].sort(),
      [false, true],
      "exactly one concurrent caller creates the batch and the other observes idempotent replay",
    );

    await db.unsafe("reset role");
    const concurrentHeaderRows = await db.unsafe(
      "select id,line_count from public.inventory_transfer_batches where organization_id=$1 and idempotency_key=$2",
      [organizationId, concurrentBatchKey],
    );
    assert.equal(concurrentHeaderRows.length, 1, "concurrent same-key requests create exactly one batch header");
    assert.equal(Number(concurrentHeaderRows[0].line_count), 2);
    assert.equal(concurrentHeaderRows[0].id, firstOutcome.result.batch_id);
    const concurrentTransferRows = await db.unsafe(
      "select id,product_id,quantity from public.inventory_transfers where batch_id=$1::uuid order by product_id",
      [firstOutcome.result.batch_id],
    );
    assert.equal(concurrentTransferRows.length, 2, "concurrent replay creates each product transfer exactly once");
    const concurrentMovementRows = await db.unsafe(
      "select m.movement_type,m.quantity from public.inventory_movements m " +
      "join public.inventory_transfers t on t.id=m.reference_id " +
      "where m.reference_type='inventory_transfer' and t.batch_id=$1::uuid",
      [firstOutcome.result.batch_id],
    );
    assert.equal(concurrentMovementRows.length, 4, "concurrent replay writes only one pair of movements per product");
    const concurrentAuditRows = await db.unsafe(
      "select id from public.audit_logs where organization_id=$1 and action='inventory.transfer.batch' and entity_id=$2::uuid",
      [organizationId, firstOutcome.result.batch_id],
    );
    assert.equal(concurrentAuditRows.length, 1, "idempotent replay does not duplicate the batch audit event");
    const concurrentBalances = await db.unsafe(
      "select product_id,warehouse_id,quantity_on_hand,quantity_reserved from public.inventory_balances " +
      "where product_id in ($1::uuid,$2::uuid) and warehouse_id in ($3::uuid,$4::uuid)",
      [productId, batchProductId, testWarehouseId, transferDestinationId],
    );
    const concurrentBalanceFor = (pid, wid) => concurrentBalances.find((row) => row.product_id === pid && row.warehouse_id === wid);
    assert.equal(Number(concurrentBalanceFor(productId, testWarehouseId).quantity_on_hand), 7,
      "first product is transferred exactly once under concurrent replay");
    assert.equal(Number(concurrentBalanceFor(productId, transferDestinationId).quantity_on_hand), 3);
    assert.equal(Number(concurrentBalanceFor(batchProductId, testWarehouseId).quantity_on_hand), 9);
    assert.equal(Number(concurrentBalanceFor(batchProductId, transferDestinationId).quantity_on_hand), 1);
    assert.equal(Number(concurrentBalanceFor(productId, testWarehouseId).quantity_reserved), 2,
      "batch transfer must preserve source reservations for the first product");
    assert.equal(Number(concurrentBalanceFor(productId, transferDestinationId).quantity_reserved), 0,
      "batch transfer must not manufacture destination reservations for the first product");
    assert.equal(Number(concurrentBalanceFor(batchProductId, testWarehouseId).quantity_reserved), 2,
      "idempotent replay must preserve reservations for the second product");
    assert.equal(Number(concurrentBalanceFor(batchProductId, transferDestinationId).quantity_reserved), 0,
      "idempotent replay must not manufacture destination reservations for the second product");
  } finally {
    if (sameKeyGateOpen) await sameKeyGate.unsafe("rollback").catch(() => {});
    if (sameKeyFirstAttempt || sameKeySecondAttempt) {
      await Promise.allSettled([sameKeyFirstAttempt, sameKeySecondAttempt].filter(Boolean));
    }
    await Promise.all([sameKeyGate.end({ timeout: 5 }), sameKeyFirst.end({ timeout: 5 }), sameKeySecond.end({ timeout: 5 })]);
  }

// INV-STOCK-001: prove a real lock race between single-item transfer and a multi-item batch.
  // A third PostgreSQL session holds the shared product row lock until both API calls are blocked.
  await db.unsafe("reset role");
  const raceOriginalBalances = await db.unsafe(
    "select product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point,last_movement_at,updated_at " +
    "from public.inventory_balances where product_id in ($1::uuid,$2::uuid) and warehouse_id in ($3::uuid,$4::uuid)",
    [productId,batchProductId,testWarehouseId,transferDestinationId],
  );
  for (const [raceProduct, raceWarehouse, onHand, reserved] of [
    [productId, testWarehouseId, 10, 2],
    [productId, transferDestinationId, 0, 0],
    [batchProductId, testWarehouseId, 10, 2],
    [batchProductId, transferDestinationId, 0, 0],
  ]) {
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
      "values($1,$2,$3,$4,1) on conflict(product_id,warehouse_id) do update " +
      "set quantity_on_hand=excluded.quantity_on_hand,quantity_reserved=excluded.quantity_reserved,reorder_point=excluded.reorder_point",
      [raceProduct, raceWarehouse, onHand, reserved],
    );
  }

  const raceSingleKey = "ci-inventory-race-single-0001";
  const raceBatchKey = "ci-inventory-race-batch-0001";
  const raceBatchLines = [
    { product_id: productId, quantity: 3 },
    { product_id: batchProductId, quantity: 1 },
  ];
  const raceGate = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const raceSingle = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const raceBatch = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  let gateOpen = false;
  const setRaceStaffIdentity = async (connection, appName) => {
    await connection.unsafe("select set_config('application_name',$1,false)", [appName]);
    await connection.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [staffAuthUserId]);
    await connection.unsafe("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: staffAuthUserId, email: "admin@aghbari.ye", role: "authenticated", session_id: staffAuthUserId }),
    ]);
    await connection.unsafe("set role authenticated");
  };
  try {
    await raceGate.unsafe("begin");
    await raceGate.unsafe("select id from public.products where id=$1::uuid for update", [productId]);
    gateOpen = true;
    await Promise.all([
      setRaceStaffIdentity(raceSingle, "ci-inventory-race-single"),
      setRaceStaffIdentity(raceBatch, "ci-inventory-race-batch"),
    ]);

    const singleAttempt = raceSingle.unsafe(
      "select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text) as result",
      [productId, testWarehouseId, transferDestinationId, "6.000", "CI single-vs-batch stock race", raceSingleKey],
    ).then((rows) => ({ kind: "single", ok: true, result: rows[0].result }))
      .catch((error) => ({ kind: "single", ok: false, error }));
    const batchAttempt = raceBatch.unsafe(
      "select public.transfer_inventory_batch($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text) as result",
      [testWarehouseId, transferDestinationId, raceBatchKey, raceBatch.json(raceBatchLines), "CI single-vs-batch stock race"],
    ).then((rows) => ({ kind: "batch", ok: true, result: rows[0].result }))
      .catch((error) => ({ kind: "batch", ok: false, error }));

    let observedBothWaiting = false;
    let lastWaitingCount = 0;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const waiting = await db.unsafe(
        "select count(*)::int as count from pg_catalog.pg_stat_activity " +
        "where application_name in ('ci-inventory-race-single','ci-inventory-race-batch') " +
        "and state='active' and wait_event_type='Lock'",
      );
      lastWaitingCount = Number(waiting[0]?.count ?? 0);
      if (lastWaitingCount === 2) {
        observedBothWaiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(observedBothWaiting, true,
      "both single-transfer and batch-transfer RPC sessions must be observed waiting on the held PostgreSQL row lock");
    await raceGate.unsafe("commit");
    gateOpen = false;

    const [singleOutcome, batchOutcome] = await Promise.all([singleAttempt, batchAttempt]);
    assert.equal(Number(singleOutcome.ok) + Number(batchOutcome.ok), 1,
      "exactly one competing transfer may consume the shared available stock");
    const rejectedOutcome = singleOutcome.ok ? batchOutcome : singleOutcome;
    assert.match(String(rejectedOutcome.error?.message ?? ""), /insufficient available stock/i,
      "the losing transfer must fail because the serialized source balance no longer has sufficient availability");

    await db.unsafe("reset role");
    const singleRows = await db.unsafe(
      "select id,quantity from public.inventory_transfers where organization_id=$1 and idempotency_key=$2",
      [organizationId, raceSingleKey],
    );
    const batchHeaders = await db.unsafe(
      "select id,line_count from public.inventory_transfer_batches where organization_id=$1 and idempotency_key=$2",
      [organizationId, raceBatchKey],
    );
    const batchRows = batchHeaders.length
      ? await db.unsafe("select id,product_id,quantity from public.inventory_transfers where batch_id=$1::uuid order by product_id", [batchHeaders[0].id])
      : [];
    assert.equal(singleRows.length, singleOutcome.ok ? 1 : 0,
      "single-transfer persistence must match the actual race winner");
    assert.equal(batchHeaders.length, batchOutcome.ok ? 1 : 0,
      "batch header must exist only when the batch wins");
    assert.equal(batchRows.length, batchOutcome.ok ? 2 : 0,
      "a losing batch must not leave partial transfer rows");

    const allRaceTransferIds = [
      ...singleRows.map((row) => row.id),
      ...batchRows.map((row) => row.id),
    ];
    const movementRows = allRaceTransferIds.length
      ? await db.unsafe(
          "select reference_id,movement_type,quantity from public.inventory_movements " +
          "where reference_type='inventory_transfer' and reference_id=any($1::uuid[])",
          [allRaceTransferIds],
        )
      : [];
    assert.equal(movementRows.length, allRaceTransferIds.length * 2,
      "each persisted transfer has exactly one paired in/out movement and rejected attempts have none");

    const raceBalances = await db.unsafe(
      "select product_id,warehouse_id,quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances " +
      "where product_id in ($1::uuid,$2::uuid) and warehouse_id in ($3::uuid,$4::uuid) order by product_id,warehouse_id",
      [productId, batchProductId, testWarehouseId, transferDestinationId],
    );
    const raceBalanceFor = (pid, wid) => raceBalances.find((row) => row.product_id === pid && row.warehouse_id === wid);
    for (const pid of [productId, batchProductId]) {
      const source = raceBalanceFor(pid, testWarehouseId);
      const destination = raceBalanceFor(pid, transferDestinationId);
      assert.ok(source && destination, "both warehouse balances must remain present for each race product");
      assert.ok(Number(source.quantity_on_hand) >= Number(source.quantity_reserved),
        "source on-hand stock cannot fall below its reservation after the race");
      assert.ok(Number(source.quantity_available) >= 0 && Number(destination.quantity_available) >= 0,
        "the race cannot create negative available stock");
      assert.equal(Number(source.quantity_on_hand) + Number(destination.quantity_on_hand), 10,
        "the race conserves each product's on-hand quantity");
      assert.equal(Number(source.quantity_reserved), 2, "source reservations are not transferred or consumed");
      assert.equal(Number(destination.quantity_reserved), 0, "destination reservations are unchanged");
    }

    const raceAudit = await db.unsafe(
      "select action,entity_type,entity_id from public.audit_logs where organization_id=$1 " +
      "and ((entity_type='inventory_transfer' and entity_id=any($2::uuid[])) " +
      "or (entity_type='inventory_transfer_batch' and entity_id=$3::uuid))",
      [organizationId, allRaceTransferIds, batchHeaders[0]?.id ?? "00000000-0000-0000-0000-000000000000"],
    );
    assert.equal(raceAudit.length, 1, "only the winning single transfer or winning batch is audited");
    assert.equal(raceAudit[0].action, singleOutcome.ok ? "inventory.transfer" : "inventory.transfer.batch");
    for (const [raceProduct, raceWarehouse] of [
      [productId, testWarehouseId],
      [productId, transferDestinationId],
      [batchProductId, testWarehouseId],
      [batchProductId, transferDestinationId],
    ]) {
      const before = raceOriginalBalances.find((row) =>
        row.product_id === raceProduct && row.warehouse_id === raceWarehouse);
      if (before) {
        await db.unsafe(
          "update public.inventory_balances set quantity_on_hand=$3,quantity_reserved=$4,reorder_point=$5," +
          "last_movement_at=$6,updated_at=$7 where product_id=$1 and warehouse_id=$2",
          [before.product_id,before.warehouse_id,before.quantity_on_hand,before.quantity_reserved,before.reorder_point,before.last_movement_at,before.updated_at],
        );
      } else {
        await db.unsafe(
          "delete from public.inventory_balances where product_id=$1 and warehouse_id=$2",
          [raceProduct,raceWarehouse],
        );
      }
    }
    process.stdout.write(
      "PASS inventory transfer race: both PostgreSQL RPC sessions waited on a held product lock; exactly one single/batch transfer won, stock/reservations were conserved, rejected path left no partial rows or movements, and one audit event persisted\n",
    );
  } finally {
    if (gateOpen) await raceGate.unsafe("rollback").catch(() => undefined);
    await Promise.all([
      raceGate.end({ timeout: 5 }).catch(() => undefined),
      raceSingle.end({ timeout: 5 }).catch(() => undefined),
      raceBatch.end({ timeout: 5 }).catch(() => undefined),
    ]);
  }

  // Restore the original single-transfer acceptance fixture before the reorder-point assertions below.
  await db.unsafe("reset role");
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=33,quantity_reserved=10,reorder_point=20 where product_id=$1 and warehouse_id=$2",
    [productId, testWarehouseId],
  );
  await db.unsafe(
    "update public.inventory_balances set quantity_on_hand=12,quantity_reserved=2 where product_id=$1 and warehouse_id=$2",
    [productId, transferDestinationId],
  );
  for (const batchWarehouseId of [testWarehouseId, transferDestinationId]) {
    const originalBalance = batchProductOriginalBalances.find((row) => row.warehouse_id === batchWarehouseId);
    if (originalBalance) {
      await db.unsafe(
        "update public.inventory_balances set quantity_on_hand=$3,quantity_reserved=$4,reorder_point=$5 " +
        "where product_id=$1 and warehouse_id=$2",
        [batchProductId, batchWarehouseId, originalBalance.quantity_on_hand, originalBalance.quantity_reserved, originalBalance.reorder_point],
      );
    } else {
      await db.unsafe(
        "delete from public.inventory_balances where product_id=$1 and warehouse_id=$2",
        [batchProductId, batchWarehouseId],
      );
    }
  }
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS batch inventory transfer: tenant scope, atomic quantity bounds, reserved-stock protection, linked movement ledger, canonical idempotency, rollback and write-denial\n");

  const thresholdChange = await db.unsafe(
    "select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text) as result",
    [productId, testWarehouseId, 25, "CI: increase reorder point to cross available-stock threshold"],
  );
  assert.equal(thresholdChange[0].result.previous_reorder_point, 20);
  assert.equal(thresholdChange[0].result.reorder_point, 25);
  assert.equal(thresholdChange[0].result.unchanged, false);
  assert.equal(Number(thresholdChange[0].result.quantity_available), 23);
  const raisedThresholdTask = await db.unsafe(
    "select id,status,task_role from public.ai_tasks where organization_id=$1 and source_event_key=$2",
    [organizationId, stockKey],
  );
  assert.equal(raisedThresholdTask.length, 1, "changing the reorder point must reuse the unique stock task");
  assert.equal(raisedThresholdTask[0].task_role, "purchasing");
  assert.equal(raisedThresholdTask[0].status, "pending", "crossing into low stock by threshold change reopens the purchasing task");
  const thresholdAuditOne = await db.unsafe(
    "select id,old_value,new_value from public.audit_logs where organization_id=$1 and action='inventory.reorder_point.updated' and entity_id=$2::uuid order by created_at",
    [organizationId, stockBalance[0].id],
  );
  assert.equal(thresholdAuditOne.length, 1, "threshold change writes one audit record");
  assert.equal(Number(thresholdAuditOne[0].old_value.reorder_point), 20);
  assert.equal(Number(thresholdAuditOne[0].new_value.reorder_point), 25);
  assert.equal(thresholdAuditOne[0].new_value.reason, "CI: increase reorder point to cross available-stock threshold");

  const unchangedThreshold = await db.unsafe(
    "select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text) as result",
    [productId, testWarehouseId, 25, "Same value is intentionally a no-op"],
  );
  assert.equal(unchangedThreshold[0].result.unchanged, true, "setting the same threshold is a no-op");
  const thresholdAuditAfterNoop = await db.unsafe(
    "select id from public.audit_logs where organization_id=$1 and action='inventory.reorder_point.updated' and entity_id=$2::uuid",
    [organizationId, stockBalance[0].id],
  );
  assert.equal(thresholdAuditAfterNoop.length, 1, "a no-op threshold change does not generate a misleading audit event");

  const loweredThreshold = await db.unsafe(
    "select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text) as result",
    [productId, testWarehouseId, 20, "CI: lower threshold back under the available balance"],
  );
  assert.equal(loweredThreshold[0].result.unchanged, false);
  const completedThresholdTask = await db.unsafe("select status from public.ai_tasks where organization_id=$1 and source_event_key=$2", [organizationId, stockKey]);
  assert.equal(completedThresholdTask[0].status, "completed", "moving the threshold above low-stock state closes the purchasing task through the database trigger");
  const thresholdAuditAfterLowering = await db.unsafe(
    "select id from public.audit_logs where organization_id=$1 and action='inventory.reorder_point.updated' and entity_id=$2::uuid",
    [organizationId, stockBalance[0].id],
  );
  assert.equal(thresholdAuditAfterLowering.length, 2, "each actual threshold value change gets its own audit record");
  await expectFailure(
    "negative reorder points are rejected by the server",
    () => db.unsafe("select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text)", [productId,testWarehouseId,-1,"invalid negative threshold"]),
    /reorder point|حد إعادة الطلب|حد/i,
  );
  await expectFailure(
    "threshold changes cannot target a foreign-tenant warehouse",
    () => db.unsafe("select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text)", [productId,foreignTransferWarehouseRows[0].id,25,"cross tenant threshold"]),
    /warehouse|مستودع|organization/i,
  );
  // DLV-007-REORDER-POINT-STAFF-DENIAL-001: ordinary same-tenant staff cannot alter purchasing policy.
  // Resolve the Auth identity from the privileged fixture connection; do not trust a copied profile UUID.
  await db.unsafe("reset role");
  const reorderPointStaffIdentityRows = await db.unsafe(
    "select auth_user_id::text as auth_user_id from public.profiles " +
      "where id=$1::uuid and organization_id=$2::uuid and is_active=true",
    [operationsStaffProfileId, organizationId],
  );
  assert.equal(reorderPointStaffIdentityRows.length, 1,
    "the ordinary staff profile must resolve to exactly one active same-tenant Auth identity");
  const resolvedReorderPointStaffAuthUserId = reorderPointStaffIdentityRows[0].auth_user_id;
  assert.equal(resolvedReorderPointStaffAuthUserId, operationsStaffAuthUserId,
    "the fixture profile must resolve to its expected Auth user");

  const readReorderPointDenialSnapshots = async () => {
    // The fixture connection reads every snapshot with its privileged database role.
    await db.unsafe("reset role");
    const balances = await db.unsafe(
      "select jsonb_build_object(" +
        "'reorder_point',balance.reorder_point," +
        "'on_hand',balance.quantity_on_hand," +
        "'reserved',balance.quantity_reserved," +
        "'available',balance.quantity_available," +
        "'updated_at',balance.updated_at" +
        ")::text as snapshot from public.inventory_balances balance where balance.id=$1::uuid",
      [stockBalance[0].id],
    );
    const tasks = await db.unsafe(
      "select to_jsonb(task)::text as snapshot from public.ai_tasks task " +
        "where task.organization_id=$1::uuid and task.source_event_key=$2::text order by task.id",
      [organizationId, stockKey],
    );
    const audits = await db.unsafe(
      "select to_jsonb(audit)::text as snapshot from public.audit_logs audit " +
        "where audit.organization_id=$1::uuid and audit.action='inventory.reorder_point.updated' " +
        "and audit.entity_id=$2::uuid order by audit.created_at,audit.id",
      [organizationId, stockBalance[0].id],
    );
    assert.equal(balances.length, 1, "the target inventory balance must exist for the protected snapshot");
    assert.equal(tasks.length, 1, "the stockKey must resolve to its single purchasing task");
    return {
      balance: balances[0].snapshot,
      tasks: tasks.map((row) => row.snapshot),
      audits: audits.map((row) => row.snapshot),
    };
  };

  const reorderPointStaffBefore = await readReorderPointDenialSnapshots();
  await setIdentity(resolvedReorderPointStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  try {
    await expectFailure(
      "ordinary same-tenant staff cannot change the inventory reorder point",
      () => db.unsafe(
        "select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text)",
        [productId, testWarehouseId, 30, "unauthorized staff policy change"],
      ),
      /administrator or manager permission required/i,
      "42501",
    );
  } finally {
    // Restore the manager identity even when the denial assertion itself fails.
    await db.unsafe("reset role");
    await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  }
  const reorderPointStaffAfter = await readReorderPointDenialSnapshots();
  assert.deepEqual(
    reorderPointStaffAfter,
    reorderPointStaffBefore,
    "staff reorder-point denial must leave balance policy/quantities/timestamp, purchasing task row, and every reorder-point audit entry byte-for-byte unchanged",
  );
  await db.unsafe("set role authenticated");
  process.stdout.write(
    "PASS DLV-007-REORDER-POINT-STAFF-DENIAL-001: ordinary same-tenant staff receives SQLSTATE 42501; balance, purchasing task and full reorder-point audit snapshots are byte-for-byte unchanged\\n",
  );
  process.stdout.write("PASS inventory write boundary and reorder point: direct balance/ledger DML denied, manager RPC audited, no-op idempotent, purchasing threshold task lifecycle correct, invalid/cross-tenant requests rejected\\n");
  // AGH-STOCK-COUNT-001: idempotent sessions, snapshot variance, audit and stale-balance protection.
  const countSession=(await db.unsafe("select public.start_stock_count($1::uuid,$2::text,$3::text) as result",[testWarehouseId,"ci-stock-count-key-000001","CI physical count snapshot"]))[0].result;
  assert.equal(countSession.organization_id,organizationId);assert.equal(countSession.warehouse_id,testWarehouseId);assert.equal(countSession.status,"open");assert.ok(Number(countSession.total_lines)>0);
  const countReplay=(await db.unsafe("select public.start_stock_count($1::uuid,$2::text,$3::text) as result",[testWarehouseId,"ci-stock-count-key-000001","CI physical count snapshot"]))[0].result;
  assert.equal(countReplay.id,countSession.id);assert.equal(countReplay.replayed,true);
  await expectFailure("warehouse cannot have two simultaneous open stock counts",()=>db.unsafe("select public.start_stock_count($1::uuid,$2::text,$3::text)",[testWarehouseId,"ci-stock-count-key-000002","conflicting session"]),/an open stock count already exists for this warehouse/i);
  const countLines=await db.unsafe("select product_id,expected_quantity from public.stock_count_lines where session_id=$1::uuid order by product_id",[countSession.id]);
  assert.equal(countLines.length,Number(countSession.total_lines));
  for(const line of countLines){const expected=Number(line.expected_quantity),counted=line.product_id===productId?expected+2:expected;await db.unsafe("select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",[countSession.id,line.product_id,counted.toFixed(3)]);}
  const countPersisted=(await db.unsafe("select count(*)::integer as total,count(counted_quantity)::integer as counted from public.stock_count_lines where session_id=$1::uuid",[countSession.id]))[0];
  assert.equal(countPersisted.total,countLines.length);assert.equal(countPersisted.counted,countLines.length);
  const completeResult=(await db.unsafe("select public.complete_stock_count($1::uuid) as result",[countSession.id]))[0].result;
  assert.equal(completeResult.status,"completed");assert.equal(Number(completeResult.total_lines),countLines.length);assert.equal(Number(completeResult.adjusted_lines),1);assert.equal(Number(completeResult.positive_adjustment),2);
  const countedBalance=(await db.unsafe("select quantity_on_hand,quantity_reserved,quantity_available from public.inventory_balances where product_id=$1 and warehouse_id=$2",[productId,testWarehouseId]))[0];
  assert.equal(Number(countedBalance.quantity_on_hand),35);assert.equal(Number(countedBalance.quantity_reserved),10);assert.equal(Number(countedBalance.quantity_available),25);
  const adjustments=await db.unsafe("select quantity,movement_type from public.inventory_movements where reference_type='stock_count_session' and reference_id=$1::uuid",[countSession.id]);
  assert.equal(adjustments.length,1);assert.equal(adjustments[0].movement_type,"stock_count_adjustment");assert.equal(Number(adjustments[0].quantity),2);
  const completedLine=(await db.unsafe("select completed_quantity,variance from public.stock_count_lines where session_id=$1::uuid and product_id=$2::uuid",[countSession.id,productId]))[0];
  assert.equal(Number(completedLine.completed_quantity),35);assert.equal(Number(completedLine.variance),2);
  assert.equal((await db.unsafe("select id from public.audit_logs where organization_id=$1 and action='inventory.stock_count.completed' and entity_id=$2::uuid",[organizationId,countSession.id])).length,1);
  await expectFailure("completed stock count cannot be modified",()=>db.unsafe("select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",[countSession.id,productId,"36.000"]),/stock count is not open/i);
  const staleSession=(await db.unsafe("select public.start_stock_count($1::uuid,$2::text,$3::text) as result",[testWarehouseId,"ci-stock-count-stale-key-0001","CI stale count snapshot"]))[0].result;
  const staleLines=await db.unsafe("select product_id,expected_quantity from public.stock_count_lines where session_id=$1::uuid order by product_id",[staleSession.id]);
  for(const line of staleLines)await db.unsafe("select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",[staleSession.id,line.product_id,Number(line.expected_quantity).toFixed(3)]);
  await db.unsafe("select public.transfer_inventory($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::text,$6::text)",[productId,testWarehouseId,transferDestinationId,"1.000","CI movement after stock-count snapshot","ci-stock-count-stale-movement-0001"]);
  await expectFailure("stale stock-count snapshot cannot overwrite stock moved during counting",()=>db.unsafe("select public.complete_stock_count($1::uuid)",[staleSession.id]),/stock balance changed after the count snapshot/i);
  assert.equal((await db.unsafe("select status from public.stock_count_sessions where id=$1::uuid",[staleSession.id]))[0].status,"open");
  const cancelled=(await db.unsafe("select public.cancel_stock_count($1::uuid,$2::text) as result",[staleSession.id,"CI snapshot invalidated by a later movement"]))[0].result;
  assert.equal(cancelled.status,"cancelled");assert.equal((await db.unsafe("select id from public.audit_logs where organization_id=$1 and action='inventory.stock_count.cancelled' and entity_id=$2::uuid",[organizationId,staleSession.id])).length,1);
  // BALANCE-SET-001: a balance row created after the physical-count snapshot must invalidate the whole count.
  // This is different from the stale-quantity check above: the late product had no balance at snapshot time.
  await db.unsafe("reset role");
  const lateBalanceProductId=randomUUID();
  const lateBalanceItemCode="CI-STOCK-LATE-"+randomUUID().replaceAll("-","").slice(0,12);
  await db.unsafe(
    "insert into public.products(id,organization_id,name,item_code,unit,base_price,status) values($1::uuid,$2::uuid,'CI late balance product',$3,'unit',1,'active')",
    [lateBalanceProductId,organizationId,lateBalanceItemCode],
  );
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const balanceSetSession=(await db.unsafe(
    "select public.start_stock_count($1::uuid,$2::text,$3::text) as result",
    [testWarehouseId,"ci-stock-count-balance-set-"+randomUUID(),"CI reject a balance added after snapshot"],
  ))[0].result;
  const balanceSetLines=await db.unsafe(
    "select product_id,expected_quantity from public.stock_count_lines where organization_id=$1::uuid and session_id=$2::uuid order by product_id",
    [organizationId,balanceSetSession.id],
  );
  assert.ok(balanceSetLines.length>0,"balance-set acceptance starts from a non-empty source snapshot");
  assert.equal(
    balanceSetLines.some(line=>line.product_id===lateBalanceProductId),
    false,
    "the late product without a target-warehouse balance must not be present in the snapshot",
  );
  for(const line of balanceSetLines){
    await db.unsafe(
      "select public.set_stock_count_line($1::uuid,$2::uuid,$3::numeric)",
      [balanceSetSession.id,line.product_id,Number(line.expected_quantity).toFixed(3)],
    );
  }
  await db.unsafe("reset role");
  await db.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1::uuid,$2::uuid,4,0,0)",
    [lateBalanceProductId,testWarehouseId],
  );
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "stock-count finalization must reject a new balance created after the snapshot",
    ()=>db.unsafe("select public.complete_stock_count($1::uuid)",[balanceSetSession.id]),
    /inventory balance set changed after the count snapshot/i,
  );
  const rejectedBalanceSetStatus=(await db.unsafe(
    "select status from public.stock_count_sessions where organization_id=$1::uuid and id=$2::uuid",
    [organizationId,balanceSetSession.id],
  ))[0];
  assert.equal(rejectedBalanceSetStatus.status,"open","failed finalization does not partially complete the count");
  assert.equal(
    (await db.unsafe("select id from public.audit_logs where organization_id=$1::uuid and action='inventory.stock_count.completed' and entity_id=$2::uuid",[organizationId,balanceSetSession.id])).length,
    0,
    "rejected balance-set change emits no completion audit",
  );
  assert.equal(
    (await db.unsafe("select id from public.inventory_movements where reference_type='stock_count_session' and reference_id=$1::uuid",[balanceSetSession.id])).length,
    0,
    "rejected balance-set change emits no partial adjustment movement",
  );
  const balanceSetCancelled=(await db.unsafe(
    "select public.cancel_stock_count($1::uuid,$2::text) as result",
    [balanceSetSession.id,"CI snapshot invalidated by a new warehouse balance"],
  ))[0].result;
  assert.equal(balanceSetCancelled.status,"cancelled");
  assert.equal(
    (await db.unsafe("select id from public.audit_logs where organization_id=$1::uuid and action='inventory.stock_count.cancelled' and entity_id=$2::uuid",[organizationId,balanceSetSession.id])).length,
    1,
    "explicit cancellation of the stale count is audited exactly once",
  );
  await db.unsafe("reset role");
  await db.unsafe("delete from public.inventory_balances where product_id=$1::uuid and warehouse_id=$2::uuid",[lateBalanceProductId,testWarehouseId]);
  await db.unsafe("delete from public.products where id=$1::uuid and organization_id=$2::uuid",[lateBalanceProductId,organizationId]);
  process.stdout.write("PASS stock-count balance set: a newly created post-snapshot balance rejects finalization with no movement or completion audit; explicit cancel is audited\\n");

  process.stdout.write("PASS physical stock count: idempotent session, snapshot lines, audited variance adjustment and stale-balance rejection\\n");

  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "accountants cannot finalize stock counts",
    () => db.unsafe("select public.complete_stock_count($1::uuid)", ["00000000-0000-4000-8000-000000000000"]),
    /administrator or manager permission required/i,
  );
  await expectFailure(
    "accountants cannot cancel stock counts",
    () => db.unsafe("select public.cancel_stock_count($1::uuid,$2::text)", ["00000000-0000-4000-8000-000000000000","not allowed"]),
    /administrator or manager permission required/i,
  );
  await expectFailure(
    "accountants cannot change inventory reorder points",
    () => db.unsafe("select public.set_inventory_reorder_point($1::uuid,$2::uuid,$3::integer,$4::text)", [productId,testWarehouseId,30,"accountant must not alter purchasing policy"]),
    /administrator or manager permission required/i,
  );
  await expectFailure(
    "accountants cannot enumerate the full organization task-assignment directory",
    () => db.unsafe("select public.list_operational_task_assignees()"),
    /administrator or manager permission required/i,
  );
  const accountantVisibleTasks = await db.unsafe(
    "select id,task_role from public.ai_tasks where organization_id=$1",
    [organizationId],
  );
  assert.ok(accountantVisibleTasks.length >= 1, "accountant can read relevant operational work");
  assert.ok(accountantVisibleTasks.every((row) => row.task_role === "accountant"), "accountant cannot read sales, stock, purchasing or general tasks");
  assert.ok(accountantVisibleTasks.some((row) => row.id === accountantTaskId), "accountant can see an accounting-lane task");
  await db.unsafe(
    "select public.update_operational_task_status($1::uuid,$2::text,$3::text)",
    [accountantTaskId, "in_progress", null],
  );
  const accountantClaim = await db.unsafe("select status,assigned_to from public.ai_tasks where id=$1", [accountantTaskId]);
  assert.equal(accountantClaim[0].status, "in_progress");
  assert.equal(accountantClaim[0].assigned_to, accountantProfileId, "starting an unassigned task claims it for the current profile");

  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const customerTasks = await db.unsafe("select id from public.ai_tasks where organization_id=$1", [organizationId]);
  assert.equal(customerTasks.length, 0, "customers cannot enumerate internal operational tasks");
  await expectFailure(
    "customer cannot change an operational task",
    () => db.unsafe("select public.update_operational_task_status($1::uuid,$2::text,$3::text)", [manualTaskId,"completed",null]),
    /task is unavailable|authenticated operational profile/i,
  );
  await db.unsafe("reset role");
  process.stdout.write("PASS operational task center: source-event idempotency, stock threshold lifecycle, audited RPC writes, accountant-only lane and customer isolation\n");

  // AGH-FINANCE-CASH-EXPENSES-001: role boundaries, tenant isolation, exact money, audit, replay and non-destructive void.
  const foreignExpenseFixture = (await db.unsafe(
    "insert into public.cash_expenses(organization_id,category,description,amount,currency,payment_method,idempotency_key,created_by_profile_id) values($1,'CI fixture','isolated tenant row',9.75,'YER','cash',$2::uuid,$3) returning id",
    [otherOrganizationId,"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",foreignProfileId],
  ))[0].id;
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const expenseKey="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const expenseInput=["Utilities","CI-only warehouse electricity expense","125.50","YER","cash","CI-EXP-REF-01","2026-10-18"];
  const createdExpense=(await db.unsafe(
    "select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date) as result",
    [expenseKey,...expenseInput],
  ))[0].result;
  assert.equal(createdExpense.replayed,false);
  assert.equal(createdExpense.status,"posted");
  const expenseId=createdExpense.expense_id;
  const expenseCount=(await db.unsafe("select count(*)::integer as count from public.cash_expenses where organization_id=$1 and id=$2::uuid",[organizationId,expenseId]))[0].count;
  assert.equal(expenseCount,1,"expense creation persists exactly one tenant-owned row");
  const replayedExpense=(await db.unsafe(
    "select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date) as result",
    [expenseKey,...expenseInput],
  ))[0].result;
  assert.equal(replayedExpense.expense_id,expenseId);
  assert.equal(replayedExpense.replayed,true,"same expense request is idempotent");
  await expectFailure(
    "expense idempotency keys cannot be reused for a different amount",
    () => db.unsafe("select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date)",[expenseKey,...["Utilities","CI-only warehouse electricity expense","126.50","YER","cash","CI-EXP-REF-01","2026-10-18"]]),
    /idempotency key payload conflict/i,
  );
  await expectFailure(
    "cash expense amount rejects precision beyond two decimals",
    () => db.unsafe("select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date)",["dddddddd-dddd-4ddd-8ddd-ddddddddddde","Utilities","bad precision","1.234","YER","cash",null,"2026-10-18"]),
    /at most two decimal places/i,
  );
  const expensePage=(await db.unsafe("select public.fetch_staff_cash_expenses(50,0,null,null,null,'all') as result"))[0].result;
  assert.equal(expensePage.total_count,1);
  assert.equal(expensePage.items.length,1);
  assert.equal(expensePage.items[0].id,expenseId);
  assert.equal(expensePage.items[0].amount,"125.50");
  assert.equal(expensePage.summary_by_currency[0].posted_amount,"125.50");
  const foreignRead=await db.unsafe("select id from public.cash_expenses where id=$1::uuid",[foreignExpenseFixture]);
  assert.equal(foreignRead.length,0,"finance user cannot read the same table in another organization");
  await expectFailure(
    "finance client cannot insert directly into expense ledger",
    () => db.unsafe("insert into public.cash_expenses(organization_id,category,description,amount,currency,payment_method,idempotency_key,created_by_profile_id) values($1,'fake','fake',1,'YER','cash',$2::uuid,$3)",[organizationId,"cccccccc-cccc-4ccc-8ccc-cccccccccccc",accountantProfileId]),
    /permission denied/i,
  );
  await expectFailure("accountant cannot void a posted cash expense",()=>db.unsafe("select public.void_cash_expense($1::uuid,$2::text)",[expenseId,"accountant cannot approve reversal"]),/administrator or manager permission required/i);
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const voidResult=(await db.unsafe("select public.void_cash_expense($1::uuid,$2::text) as result",[expenseId,"duplicate receipt entered in error"]))[0].result;
  assert.equal(voidResult.status,"void");
  assert.equal(voidResult.replayed,false);
  const voidReplay=(await db.unsafe("select public.void_cash_expense($1::uuid,$2::text) as result",[expenseId,"duplicate receipt entered in error"]))[0].result;
  assert.equal(voidReplay.replayed,true,"repeating the same void reason is a no-op");
  await expectFailure("voided cash expense keeps its original reversal reason",()=>db.unsafe("select public.void_cash_expense($1::uuid,$2::text)",[expenseId,"different replacement reason"]),/original reversal reason is retained/i);
  const persistedVoid=(await db.unsafe("select status,void_reason from public.cash_expenses where id=$1::uuid",[expenseId]))[0];
  assert.equal(persistedVoid.status,"void");
  assert.equal(persistedVoid.void_reason,"duplicate receipt entered in error");
  await expectFailure("authenticated finance role cannot directly mutate cash expense history",()=>db.unsafe("update public.cash_expenses set amount=1 where id=$1::uuid",[expenseId]),/permission denied/i);
  const auditRows=await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='cash_expense' and entity_id=$2::uuid order by action",[organizationId,expenseId]);
  assert.deepEqual(auditRows.map((row)=>row.action),["cash_expense.recorded","cash_expense.voided"]);
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select id from public.cash_expenses where id=$1::uuid",[expenseId])).length,0,"customer cannot read finance expenses");
  await expectFailure("customer cannot record a cash expense",()=>db.unsafe("select public.record_cash_expense($1::uuid,$2::text,$3::text,$4::numeric,$5::text,$6::text,$7::text,$8::date)",["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","Utilities","customer attempt","1.00","YER","cash",null,"2026-10-18"]),/finance permission|required/i);
  await db.unsafe("reset role");
  process.stdout.write("PASS cash expenses: exact decimal amount, idempotent command, tenant/RLS isolation, accountant/admin permission split, append-preserving void and two audit events\\n");



  // NASR1-GENERAL-LEDGER-001: target-native tenant-bound chart, balanced journals, replay-safe posting and trial balance.
  await db.unsafe("reset role");
  const foreignLedgerAccount = (await db.unsafe(
    "insert into public.accounting_accounts(organization_id,code,name,account_type,created_by_profile_id) values($1,'CI-FOR-9000','Foreign ledger account','revenue',$2) returning id",
    [otherOrganizationId, foreignProfileId],
  ))[0].id;
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const debitAccountResult=(await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-1000","CI cash ledger","asset","CI acceptance fixture only"],
  ))[0].result;
  const creditAccountResult=(await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-4000","CI adjustment revenue","revenue","CI acceptance fixture only"],
  ))[0].result;
  assert.equal(debitAccountResult.replayed,false);
  assert.equal(creditAccountResult.replayed,false);
  const debitAccountId=debitAccountResult.id;
  const creditAccountId=creditAccountResult.id;
  const duplicateAccount=(await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-1000","CI cash ledger","asset","CI acceptance fixture only"],
  ))[0].result;
  assert.equal(duplicateAccount.id,debitAccountId);
  assert.equal(duplicateAccount.replayed,true,"identical account code payload replays safely");
  await expectFailure(
    "account code cannot be reused for changed metadata",
    () => db.unsafe("select public.create_accounting_account($1,$2,$3,null,$4)",["CI-GL-1000","changed chart account","asset","different payload"]),
    /account code payload conflict/i,
  );
  const ledgerKey="abababab-abab-4bab-8bab-abababababab";
  const ledgerLines=db.json([
    {account_id:debitAccountId,debit:"125.50",credit:"0.00",memo:"CI balanced debit"},
    {account_id:creditAccountId,debit:"0.00",credit:"125.50",memo:"CI balanced credit"},
  ]);
  const draftEntry=(await db.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    [ledgerKey,"2026-10-18","CI-only balanced journal",ledgerLines,"CI-GL-REF-01"],
  ))[0].result;
  assert.equal(draftEntry.status,"draft");
  assert.equal(draftEntry.replayed,false);
  const journalId=draftEntry.id;
  const replayEntry=(await db.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    [ledgerKey,"2026-10-18","CI-only balanced journal",ledgerLines,"CI-GL-REF-01"],
  ))[0].result;
  assert.equal(replayEntry.id,journalId);
  assert.equal(replayEntry.replayed,true,"exact journal payload replay does not duplicate entry or lines");
  await expectFailure(
    "journal idempotency key rejects a changed header",
    () => db.unsafe("select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text)",[ledgerKey,"2026-10-18","altered journal description",ledgerLines,"CI-GL-REF-01"]),
    /idempotency key payload conflict/i,
  );
  await expectFailure(
    "journal rejects an unbalanced payload",
    () => db.unsafe("select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text)",["abababab-abab-4bab-8bab-abababababac","2026-10-18","CI unbalanced journal",db.json([
      {account_id:debitAccountId,debit:"125.50",credit:"0.00",memo:null},
      {account_id:creditAccountId,debit:"0.00",credit:"125.49",memo:null},
    ]),null]),
    /journal lines must balance/i,
  );
  await expectFailure(
    "journal rejects amounts with more than two decimal places",
    () => db.unsafe("select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text)",["abababab-abab-4bab-8bab-abababababad","2026-10-18","CI precision journal",db.json([
      {account_id:debitAccountId,debit:"125.501",credit:"0",memo:null},
      {account_id:creditAccountId,debit:"0",credit:"125.501",memo:null},
    ]),null]),
    /at most two decimal places/i,
  );
  assert.equal((await db.unsafe("select id from public.accounting_accounts where id=$1::uuid",[foreignLedgerAccount])).length,0,"accountant cannot read another organization's chart row");
  await expectFailure(
    "finance client cannot write chart accounts directly",
    () => db.unsafe("insert into public.accounting_accounts(organization_id,code,name,account_type) values($1,'CI-GL-9999','invalid direct insert','asset')",[organizationId]),
    /permission denied/i,
  );
  await expectFailure(
    "finance client cannot mutate journal entry state directly",
    () => db.unsafe("update public.accounting_journal_entries set status='posted' where id=$1::uuid",[journalId]),
    /permission denied/i,
  );
  const postedEntry=(await db.unsafe("select public.post_general_journal_entry($1::uuid) as result",[journalId]))[0].result;
  assert.equal(postedEntry.status,"posted");
  assert.equal(postedEntry.replayed,false);
  const postedReplay=(await db.unsafe("select public.post_general_journal_entry($1::uuid) as result",[journalId]))[0].result;
  assert.equal(postedReplay.status,"posted");
  assert.equal(postedReplay.replayed,true,"posting an already posted entry is idempotent");
  const ledgerPayload=(await db.unsafe("select public.fetch_general_ledger(null,null,null,50,0) as result"))[0].result;
  const creditMemoJournalId = preparedPrintCreditMemo.journal_entry_id;
  assert.equal(ledgerPayload.entry_count,2,"ledger entry listing should contain only the explicitly-posted GL entry and the source-linked return-credit journal draft");
  assert.equal(ledgerPayload.entries.length,2);
  const ledgerJournalRow = ledgerPayload.entries.find((row) => row.id === journalId);
  assert.ok(ledgerJournalRow,"the explicitly-posted general-journal entry must remain in the ledger view");
  assert.equal(ledgerJournalRow.status,"posted");
  assert.equal(ledgerJournalRow.debit_total,"125.50");
  assert.equal(ledgerJournalRow.credit_total,"125.50");
  const unpostedCreditMemoJournalRow = ledgerPayload.entries.find((row) => row.id === creditMemoJournalId);
  assert.ok(unpostedCreditMemoJournalRow,"the source-linked credit-memo draft journal must retain its provenance");
  assert.equal(unpostedCreditMemoJournalRow.status,"draft","preparing a printable credit memo must not post its journal");
  assert.equal(ledgerPayload.summary.posted_entry_count,1,"credit-memo draft must not increment the posted-entry count");
  assert.equal(ledgerPayload.summary.debit_total,"125.50");
  assert.equal(ledgerPayload.summary.credit_total,"125.50");
  const debitTB=ledgerPayload.accounts.find((row)=>row.id===debitAccountId);
  const creditTB=ledgerPayload.accounts.find((row)=>row.id===creditAccountId);
  assert.equal(debitTB.debit_total,"125.50");
  assert.equal(debitTB.credit_total,"0.00");
  assert.equal(creditTB.debit_total,"0.00");
  assert.equal(creditTB.credit_total,"125.50");

  const voidDraftEntry=(await db.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    ["abababab-abab-4bab-8bab-abababababac","2026-10-18","CI-only voidable journal",ledgerLines,"CI-GL-VOID-01"],
  ))[0].result;
  assert.equal(voidDraftEntry.status,"draft");
  await expectFailure(
    "accountant cannot void a draft journal",
    () => db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text)",[voidDraftEntry.id,"manager-only cancellation"]),
    /administrator or manager permission required/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const voidedDraft=(await db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text) as result",[voidDraftEntry.id,"duplicate draft created in error"]))[0].result;
  assert.equal(voidedDraft.status,"void");
  assert.equal(voidedDraft.replayed,false);
  const replayVoided=(await db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text) as result",[voidDraftEntry.id,"duplicate draft created in error"]))[0].result;
  assert.equal(replayVoided.replayed,true);

  // AGH-GL-POST-STATE-001: a void journal must be rejected before posting DML.
  const voidPostingBaseline=(await db.unsafe(
    "select e.status,e.posted_by_profile_id::text as posted_by,e.posted_at::text as posted_at," +
    "e.voided_by_profile_id::text as voided_by,e.voided_at::text as voided_at,e.void_reason,e.updated_at::text as updated_at," +
    "(select count(*)::integer from public.accounting_journal_lines l where l.organization_id=e.organization_id and l.journal_entry_id=e.id) as line_count," +
    "(select count(*)::integer from public.audit_logs a where a.organization_id=e.organization_id and a.entity_id=e.id) as audit_count " +
    "from public.accounting_journal_entries e where e.organization_id=$1::uuid and e.id=$2::uuid",
    [organizationId,voidDraftEntry.id],
  ))[0];
  assert.equal(voidPostingBaseline.status,"void");
  assert.equal(voidPostingBaseline.posted_by,null);
  assert.equal(voidPostingBaseline.posted_at,null);
  await expectFailure(
    "voided journal cannot be posted",
    () => db.unsafe("select public.post_general_journal_entry($1::uuid) as result",[voidDraftEntry.id]),
    /only draft journal entries can be posted/i,
    "22023",
  );
  const voidPostingAfter=(await db.unsafe(
    "select e.status,e.posted_by_profile_id::text as posted_by,e.posted_at::text as posted_at," +
    "e.voided_by_profile_id::text as voided_by,e.voided_at::text as voided_at,e.void_reason,e.updated_at::text as updated_at," +
    "(select count(*)::integer from public.accounting_journal_lines l where l.organization_id=e.organization_id and l.journal_entry_id=e.id) as line_count," +
    "(select count(*)::integer from public.audit_logs a where a.organization_id=e.organization_id and a.entity_id=e.id) as audit_count " +
    "from public.accounting_journal_entries e where e.organization_id=$1::uuid and e.id=$2::uuid",
    [organizationId,voidDraftEntry.id],
  ))[0];
  assert.deepEqual(voidPostingAfter,voidPostingBaseline,
    "a void journal posting denial must preserve terminal state, cancellation metadata, lines, timestamp and audit history");
  process.stdout.write("PASS general journal state guard: posted replay remains idempotent; void journals reject with 22023 and no mutations\\n");

  await expectFailure(
    "voided journal draft reason is immutable",
    () => db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text)",[voidDraftEntry.id,"changed reason"]),
    /original reason/i,
  );
  const voidAudit=await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='accounting_journal_entry' and entity_id=$2::uuid order by action",[organizationId,voidDraftEntry.id]);
  assert.deepEqual(voidAudit.map((row)=>row.action),["accounting.journal_draft_created","accounting.journal_draft_voided"]);
  await expectFailure(
    "posted journal entries cannot be voided through the draft operation",
    () => db.unsafe("select public.void_general_journal_draft($1::uuid,$2::text)",[journalId,"posted entries cannot be cancelled"]),
    /posted journal entries cannot be voided/i,
  );
  // Read audit entries while the privileged manager identity is still active.
  const ledgerAudit=await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='accounting_journal_entry' and entity_id=$2::uuid order by action",[organizationId,journalId]);
  assert.deepEqual(ledgerAudit.map((row)=>row.action),["accounting.journal_draft_created","accounting.journal_posted"]);

  // AGH-GL-POST-AUTH-ATOMIC-001: an authenticated customer must not post a balanced
  // finance draft, and denial must leave the journal header, lines and audit trail unchanged.
  const deniedPostingDraft=(await db.unsafe(
    "select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text) as result",
    [randomUUID(),"2026-10-18","CI customer-denied posting journal",ledgerLines,"CI-GL-DENIED-POST-01"],
  ))[0].result;
  assert.equal(deniedPostingDraft.status,"draft");
  assert.equal(deniedPostingDraft.replayed,false);
  const deniedPostingJournalId=deniedPostingDraft.id;
  await db.unsafe("reset role");
  const postExecutePrivileges=(await db.unsafe(
    "select has_function_privilege('anon','public.post_general_journal_entry(uuid)','EXECUTE') as anon_can_execute, " +
    "has_function_privilege('authenticated','public.post_general_journal_entry(uuid)','EXECUTE') as authenticated_can_execute",
  ))[0];
  assert.equal(postExecutePrivileges.anon_can_execute,false,"anonymous role must not execute journal posting");
  assert.equal(postExecutePrivileges.authenticated_can_execute,true,"the authenticated role reaches the RPC-level finance guard");
  const deniedPostBaseline=(await db.unsafe(
    "select e.status,e.posted_by_profile_id::text as posted_by,e.posted_at::text as posted_at,e.updated_at::text as updated_at, " +
    "(select count(*)::integer from public.accounting_journal_lines l where l.organization_id=e.organization_id and l.journal_entry_id=e.id) as line_count, " +
    "(select count(*)::integer from public.audit_logs a where a.organization_id=e.organization_id and a.entity_id=e.id and a.action='accounting.journal_posted') as posted_audit_count " +
    "from public.accounting_journal_entries e where e.organization_id=$1::uuid and e.id=$2::uuid",
    [organizationId,deniedPostingJournalId],
  ))[0];
  assert.equal(deniedPostBaseline.status,"draft");
  assert.equal(deniedPostBaseline.posted_by,null);
  assert.equal(deniedPostBaseline.posted_at,null);
  assert.equal(deniedPostBaseline.line_count,2);
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await db.unsafe("reset role");
  await setIdentity(authUserId,"ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot post a balanced general journal",
    () => db.unsafe("select public.post_general_journal_entry($1::uuid) as result",[deniedPostingJournalId]),
    /finance permission required to post a journal entry/i,
    "42501",
  );
  await db.unsafe("reset role");
  const deniedPostAfter=(await db.unsafe(
    "select e.status,e.posted_by_profile_id::text as posted_by,e.posted_at::text as posted_at,e.updated_at::text as updated_at, " +
    "(select count(*)::integer from public.accounting_journal_lines l where l.organization_id=e.organization_id and l.journal_entry_id=e.id) as line_count, " +
    "(select count(*)::integer from public.audit_logs a where a.organization_id=e.organization_id and a.entity_id=e.id and a.action='accounting.journal_posted') as posted_audit_count " +
    "from public.accounting_journal_entries e where e.organization_id=$1::uuid and e.id=$2::uuid",
    [organizationId,deniedPostingJournalId],
  ))[0];
  assert.deepEqual(deniedPostAfter,deniedPostBaseline,
    "customer posting denial must preserve draft status, posting actor/time, updated_at, all lines and posted audit count");
  assert.equal((await db.unsafe("select count(*)::integer as count from public.audit_logs where organization_id=$1::uuid and entity_id=$2::uuid and action='accounting.journal_posted'",[organizationId,deniedPostingJournalId]))[0].count,0,
    "denied customer posting must not emit a journal-posted audit event");
  assert.equal((await db.unsafe("select count(*)::integer as count from public.accounting_journal_entries where organization_id=$1::uuid and id=$2::uuid and status='draft'",[organizationId,deniedPostingJournalId]))[0].count,1,
    "denied customer posting leaves the original draft addressable and unchanged");
  await db.unsafe("set role authenticated");
  assert.equal((await db.unsafe("select id from public.accounting_accounts where id=$1::uuid",[debitAccountId])).length,0,"customer cannot read the accounting chart");
  await expectFailure(
    "customer cannot call the general-ledger RPC",
    () => db.unsafe("select public.fetch_general_ledger(null,null,null,50,0)"),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot create a journal",
    () => db.unsafe("select public.create_general_journal_draft($1::uuid,$2::date,$3::text,$4::jsonb,$5::text)",["abababab-abab-4bab-8bab-abababababaf","2026-10-18","Customer prohibited journal",ledgerLines,null]),
    /finance permission required/i,
  );
  await db.unsafe("reset role");
  process.stdout.write("PASS general ledger: chart idempotency, exact two-decimal amounts, balanced draft/post, replay safety, audited draft cancellation, trial balance and tenant/role isolation\\n");

  // NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006:
  // Verify source-driven journals, replay safety, balanced-line/source guards, tenant role boundaries and recorded tax.
  await db.unsafe("reset role");
  const invoiceSourceRows = await db.unsafe(
    "select id,organization_id,customer_id,status,currency,subtotal::text,tax_amount::text,total_amount::text,issued_at::date::text as source_date from public.customer_invoices where id=$1::uuid",
    [invoice.id],
  );
  assert.equal(invoiceSourceRows.length, 1, "confirmed-order invoice is a persisted source");
  const invoiceSource = invoiceSourceRows[0];
  assert.equal(invoiceSource.currency, "YER");
  assert.equal(Number(invoiceSource.subtotal) + Number(invoiceSource.tax_amount), Number(invoiceSource.total_amount));
  const paymentSourceRows = await db.unsafe(
    "select id,amount::text,reference from public.customer_payments where invoice_id=$1::uuid and reference='CI-PAY-001'",
    [invoice.id],
  );
  assert.equal(paymentSourceRows.length, 1, "use the persisted partial-payment source, not a client-supplied amount");
  const paymentSource = paymentSourceRows[0];

  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const altRevenueResult = (await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-4001", "CI alternate invoice revenue", "revenue", "CI acceptance fixture only"],
  ))[0].result;
  const altSettlementResult = (await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-1001", "CI alternative settlement asset", "asset", "CI acceptance fixture only"],
  ))[0].result;
  const taxLiabilityResult = (await db.unsafe(
    "select public.create_accounting_account($1,$2,$3,null,$4) as result",
    ["CI-GL-2200", "CI invoice tax payable", "liability", "CI acceptance fixture only"],
  ))[0].result;
  const altRevenueAccountId = altRevenueResult.id;
  const altSettlementAccountId = altSettlementResult.id;
  const taxLiabilityAccountId = taxLiabilityResult.id;

  await expectFailure(
    "customer payment source cannot be journaled before the invoice journal is posted",
    () => db.unsafe(
      "select public.create_customer_payment_journal_draft($1::uuid,$2::uuid,$3::uuid)",
      [paymentSource.id, altSettlementAccountId, "dddddddd-dddd-4ddd-8ddd-ddddddddddd1"],
    ),
    /customer invoice must have a posted journal before allocating a payment/i,
  );

  const invoiceJournalKey = "abababab-abab-4bab-8bab-abababababd0";
  const invoiceJournalRaceKey = "abababab-abab-4bab-8bab-abababababd3";

  // FIN-INVOICE-JOURNAL-001: force two authenticated accountants to contend
  // on the same invoice-journal advisory lock before the first source draft exists.
  // Distinct request keys with one identical source mapping must create one canonical draft.
  const invoiceJournalGate = postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const invoiceJournalPools = [
    postgres(connectionString,{max:1,prepare:false,idle_timeout:5}),
    postgres(connectionString,{max:1,prepare:false,idle_timeout:5}),
  ];
  // Reserve each physical backend for the entire race. A pooled connection can be
  // returned/recycled between pg_backend_pid() and the following RPC, invalidating PID evidence.
  const invoiceJournalClients = await Promise.all(invoiceJournalPools.map((pool)=>pool.reserve()));
  const invoiceJournalApps = ["ci-invoice-journal-a","ci-invoice-journal-b"];
  let invoiceJournalGateOpen = false;
  let invoiceJournalAttempts;
  let invoiceJournalResults;
  try {
    await invoiceJournalGate.unsafe("begin");
    invoiceJournalGateOpen = true;
    await invoiceJournalGate.unsafe(
      "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text || ':customer-invoice-journal:' || $2::text,0))",
      [organizationId,invoice.id],
    );
    await Promise.all(invoiceJournalClients.map(async (client,index) => {
      await client.unsafe("reset role").catch(()=>{});
      const sessionId=randomUUID();
      await client.unsafe(
        "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
        "values($1,$2,now(),now(),now(),null,'CI customer invoice journal race','127.0.0.1'::inet) " +
        "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
        [sessionId,accountantAuthUserId],
      );
      await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[accountantAuthUserId]);
      await client.unsafe("select set_config('request.jwt.claims',$1,false)",[
        JSON.stringify({sub:accountantAuthUserId,email:"ci-accountant@example.test",role:"authenticated",session_id:sessionId}),
      ]);
      await client.unsafe("set role authenticated");
      await client.unsafe("select set_config('application_name',$1,false)",[invoiceJournalApps[index]]);
    }));
    // Track the actual two reserved backends. application_name is diagnostic only; reserved
    // sessions guarantee each following RPC runs on the exact PID captured here.
    const invoiceJournalBackendPids=await Promise.all(invoiceJournalClients.map(async client=>
      Number((await client.unsafe("select pg_catalog.pg_backend_pid() as pid"))[0].pid),
    ));
    invoiceJournalAttempts=Promise.allSettled(invoiceJournalClients.map((client,index)=>client.unsafe(
      "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
      [invoice.id,debitAccountId,creditAccountId,null,index===0?invoiceJournalKey:invoiceJournalRaceKey],
    )));
    let bothInvoiceJournalWritersWaiting=false;
    let invoiceJournalActivity=[];
    // The local PG17 workflow can be busy during the migration suite; wait up to 10 seconds
    // while requiring both exact backend PIDs to be executing the source RPC and blocked on a lock.
    for(let attempt=0;attempt<400;attempt+=1){
      invoiceJournalActivity=await invoiceJournalGate.unsafe(
        "select pid,application_name,state,wait_event_type,wait_event,left(query,180) as query " +
        "from pg_catalog.pg_stat_activity " +
        "where pid = any($1::integer[])",
        [invoiceJournalBackendPids],
      );
      bothInvoiceJournalWritersWaiting=invoiceJournalBackendPids.every(pid=>
        invoiceJournalActivity.some(row=>
          Number(row.pid)===pid && row.state==="active" && row.wait_event_type==="Lock" &&
          String(row.query).includes("create_customer_invoice_journal_draft"),
        ),
      );
      if(bothInvoiceJournalWritersWaiting) break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    if(!bothInvoiceJournalWritersWaiting){
      await invoiceJournalGate.unsafe("rollback");
      invoiceJournalGateOpen=false;
      const outcomes=await invoiceJournalAttempts;
      assert.fail(
        "both invoice-journal callers must be observed waiting on the source lock before gate release: "+
        JSON.stringify({
          backend_pids:invoiceJournalBackendPids,
          activity:invoiceJournalActivity,
          outcomes:outcomes.map(outcome=>outcome.status==="fulfilled"
            ? {ok:true}
            : {ok:false,error:String(outcome.reason?.message ?? outcome.reason)}),
        }),
      );
    }
    await invoiceJournalGate.unsafe("commit");
    invoiceJournalGateOpen=false;
    invoiceJournalResults=await invoiceJournalAttempts;
  } finally {
    if(invoiceJournalGateOpen) await invoiceJournalGate.unsafe("rollback").catch(()=>{});
    if(invoiceJournalAttempts) await Promise.allSettled([invoiceJournalAttempts]);
    for (const client of invoiceJournalClients) {
      try { await client.release(); } catch { /* preserve the original acceptance error */ }
    }
    await Promise.all([
      invoiceJournalGate.end({timeout:5}).catch(()=>{}),
      ...invoiceJournalPools.map(pool=>pool.end({timeout:5}).catch(()=>{})),
    ]);
  }
  assert.equal(invoiceJournalResults.filter(outcome=>outcome.status==="fulfilled").length,2,
    "both same-source invoice journal requests should resolve: "+
    JSON.stringify(invoiceJournalResults.map(outcome=>outcome.status==="rejected"
      ? String(outcome.reason?.message ?? outcome.reason)
      : {ok:true})));
  const invoiceJournalValues=invoiceJournalResults.map(outcome=>outcome.status==="fulfilled"
    ? outcome.value[0].result
    : null);
  assert.equal(invoiceJournalValues.filter(value=>value?.replayed===false).length,1,
    "exactly one concurrent invoice-journal request should create the draft");
  assert.equal(invoiceJournalValues.filter(value=>value?.replayed===true).length,1,
    "the losing same-source invoice-journal request should replay the canonical draft");
  assert.equal(invoiceJournalValues[0].journal_entry_id,invoiceJournalValues[1].journal_entry_id,
    "concurrent same-source invoice requests must return one journal entry ID");
  const invoiceDraft=invoiceJournalValues.find(value=>value?.replayed===false);
  assert.ok(invoiceDraft,"the race must expose the one original invoice journal draft");
  assert.equal(invoiceDraft.status,"draft");
  assert.equal(invoiceDraft.source_id,invoice.id);
  assert.equal(Number(invoiceDraft.amount),Number(invoiceSource.total_amount));
  const invoiceJournalId=invoiceDraft.journal_entry_id;

  await db.unsafe("reset role");
  const invoiceJournalRaceAudit = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
    "where organization_id=$1::uuid and action='accounting.customer_invoice_journal_draft_created' " +
    "and entity_type='customer_invoice' and entity_id::text=$2::text",
    [organizationId,invoice.id],
  );
  assert.equal(invoiceJournalRaceAudit[0].count,1,
    "concurrent source invoice-journal requests must emit exactly one creation audit");
  await setIdentity(accountantAuthUserId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const invoiceReplay = (await db.unsafe(
    "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [invoice.id, debitAccountId, creditAccountId, null, "abababab-abab-4bab-8bab-abababababd1"],
  ))[0].result;
  assert.equal(invoiceReplay.journal_entry_id, invoiceJournalId);
  assert.equal(invoiceReplay.replayed, true, "repeating a source with the same mapping must not duplicate the journal");
  await expectFailure(
    "invoice source cannot be silently remapped while its journal draft is active",
    () => db.unsafe(
      "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)",
      [invoice.id, debitAccountId, altRevenueAccountId, null, "abababab-abab-4bab-8bab-abababababd2"],
    ),
    /invoice already has an active journal with different mapping or source values/i,
  );
  const invoicePostingRows = await db.unsafe(
    "select id,source_type,source_id,source_amount::text,source_currency from public.accounting_customer_source_postings where organization_id=$1 and source_type='customer_invoice' and source_id=$2::uuid",
    [organizationId, invoice.id],
  );
  assert.equal(invoicePostingRows.length, 1);
  assert.equal(invoicePostingRows[0].source_type, "customer_invoice");
  assert.equal(Number(invoicePostingRows[0].source_amount), Number(invoiceSource.total_amount));
  await expectFailure(
    "authenticated finance roles cannot directly mutate immutable source-posting links",
    () => db.unsafe("update public.accounting_customer_source_postings set payload_fingerprint=repeat('0',32) where journal_entry_id=$1::uuid", [invoiceJournalId]),
    /permission denied/i,
  );
  const invoiceInbox = (await db.unsafe("select public.fetch_customer_invoice_accounting_inbox(50,0,'draft') as result"))[0].result;
  assert.ok(invoiceInbox.items.some((item) => item.id === invoice.id && item.journal_status === "draft"));

  await db.unsafe("reset role");
  await expectFailure(
    "invoice amount cannot change while an accounting draft is linked",
    () => db.unsafe("update public.customer_invoices set total_amount=total_amount+1 where id=$1::uuid", [invoice.id]),
    /invoice has accounting history; source amounts and identity cannot be changed/i,
  );
  await expectFailure(
    "invoice cannot be voided while an accounting draft is linked",
    () => db.unsafe("update public.customer_invoices set status='void' where id=$1::uuid", [invoice.id]),
    /invoice has a draft accounting journal; cancel the draft before voiding the invoice/i,
  );
  await db.unsafe(
    "update public.accounting_journal_lines set debit=debit+1 where organization_id=$1 and journal_entry_id=$2::uuid and line_number=1",
    [organizationId, invoiceJournalId],
  );
  await db.unsafe(
    "update public.accounting_journal_lines set credit=credit+1 where organization_id=$1 and journal_entry_id=$2::uuid and line_number=2",
    [organizationId, invoiceJournalId],
  );
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "invoice journal post rejects balanced lines that no longer match the source",
    () => db.unsafe("select public.post_general_journal_entry($1::uuid)", [invoiceJournalId]),
    /invoice journal lines no longer match source totals and account mapping/i,
  );
  await db.unsafe("reset role");
  await db.unsafe(
    "update public.accounting_journal_lines set debit=debit-1 where organization_id=$1 and journal_entry_id=$2::uuid and line_number=1",
    [organizationId, invoiceJournalId],
  );
  await db.unsafe(
    "update public.accounting_journal_lines set credit=credit-1 where organization_id=$1 and journal_entry_id=$2::uuid and line_number=2",
    [organizationId, invoiceJournalId],
  );
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const invoicePosted = (await db.unsafe("select public.post_general_journal_entry($1::uuid) as result", [invoiceJournalId]))[0].result;
  assert.equal(invoicePosted.status, "posted");
  const postedInvoiceLines = await db.unsafe(
    "select account_id,debit::text,credit::text,line_number from public.accounting_journal_lines where journal_entry_id=$1::uuid order by line_number",
    [invoiceJournalId],
  );
  assert.equal(postedInvoiceLines.length, 2);
  assert.equal(postedInvoiceLines[0].account_id, debitAccountId);
  assert.equal(Number(postedInvoiceLines[0].debit), Number(invoiceSource.total_amount));
  assert.equal(postedInvoiceLines[1].account_id, creditAccountId);
  assert.equal(Number(postedInvoiceLines[1].credit), Number(invoiceSource.subtotal));

  await db.unsafe("reset role");
  await expectFailure(
    "posted invoice source cannot be voided without an approved reversal",
    () => db.unsafe("update public.customer_invoices set status='void' where id=$1::uuid", [invoice.id]),
    /invoice has a posted accounting journal; post its approved reversal before voiding the invoice/i,
  );

  const paymentJournalKey = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdc1";
  const paymentJournalRaceKey = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdc2";
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");

  // FIN-PAYMENT-JOURNAL-001: force two authenticated accountants to contend
  // on the same source-payment advisory lock before either can create its draft.
  // Different request keys must still resolve to one source-linked journal and one audit.
  const paymentJournalGate = postgres(connectionString,{max:1,prepare:false,idle_timeout:5});
  const paymentJournalPools = [
    postgres(connectionString,{max:1,prepare:false,idle_timeout:5}),
    postgres(connectionString,{max:1,prepare:false,idle_timeout:5}),
  ];
  // Pin the observed backend PIDs across fixture setup and RPC execution; a normal pool
  // may recycle a connection between separate autocommit statements.
  const paymentJournalClients = await Promise.all(paymentJournalPools.map((pool)=>pool.reserve()));
  let paymentJournalGateOpen = false;
  let paymentJournalAttempts;
  let paymentJournalResults;
  const paymentJournalApps = ["ci-payment-journal-a","ci-payment-journal-b"];
  try {
    await paymentJournalGate.unsafe("begin");
    paymentJournalGateOpen = true;
    await paymentJournalGate.unsafe(
      "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text || ':customer-payment-journal:' || $2::text,0))",
      [organizationId,paymentSource.id],
    );
    await Promise.all(paymentJournalClients.map(async (client,index) => {
      await client.unsafe("reset role").catch(()=>{});
      const sessionId = randomUUID();
      await client.unsafe(
        "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) " +
        "values($1,$2,now(),now(),now(),null,'CI customer payment journal race','127.0.0.1'::inet) " +
        "on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
        [sessionId,accountantAuthUserId],
      );
      await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)",[accountantAuthUserId]);
      await client.unsafe("select set_config('request.jwt.claims',$1,false)",[
        JSON.stringify({sub:accountantAuthUserId,email:"ci-accountant@example.test",role:"authenticated",session_id:sessionId}),
      ]);
      await client.unsafe("set role authenticated");
      await client.unsafe("select set_config('application_name',$1,false)",[paymentJournalApps[index]]);
    }));
    // Use exact PostgreSQL backend PIDs, not application_name alone: other sessions can
    // retain stale query text, causing this race gate to inspect the wrong activity row.
    const paymentJournalBackendPids = await Promise.all(paymentJournalClients.map(async (client) =>
      Number((await client.unsafe("select pg_catalog.pg_backend_pid() as pid"))[0].pid),
    ));
    paymentJournalAttempts = Promise.allSettled(paymentJournalClients.map((client,index) => client.unsafe(
      "select public.create_customer_payment_journal_draft($1::uuid,$2::uuid,$3::uuid) as result",
      [paymentSource.id,altSettlementAccountId,index===0?paymentJournalKey:paymentJournalRaceKey],
    )));
    let bothPaymentJournalWritersWaiting = false;
    let paymentJournalActivity = [];
    for (let attempt=0; attempt<400; attempt+=1) {
      paymentJournalActivity = await paymentJournalGate.unsafe(
        "select pid,application_name,state,wait_event_type,wait_event,left(query,180) as query " +
        "from pg_catalog.pg_stat_activity " +
        "where pid = any($1::integer[])",
        [paymentJournalBackendPids],
      );
      bothPaymentJournalWritersWaiting = paymentJournalBackendPids.every((pid) =>
        paymentJournalActivity.some((row) =>
          Number(row.pid)===pid && row.state==="active" && row.wait_event_type==="Lock" &&
          String(row.query).includes("create_customer_payment_journal_draft"),
        ),
      );
      if (bothPaymentJournalWritersWaiting) break;
      await new Promise((resolve)=>setTimeout(resolve,25));
    }
    if (!bothPaymentJournalWritersWaiting) {
      await paymentJournalGate.unsafe("rollback");
      paymentJournalGateOpen = false;
      const outcomes = await paymentJournalAttempts;
      assert.fail(
        "both payment-journal callers must be observed waiting on the source lock before gate release: " +
        JSON.stringify({
          backend_pids:paymentJournalBackendPids,
          activity:paymentJournalActivity,
          outcomes:outcomes.map((outcome)=>outcome.status==="fulfilled"
            ? {ok:true}
            : {ok:false,error:String(outcome.reason?.message ?? outcome.reason)}),
        }),
      );
    }
    await paymentJournalGate.unsafe("commit");
    paymentJournalGateOpen = false;
    paymentJournalResults = await paymentJournalAttempts;
  } finally {
    if (paymentJournalGateOpen) await paymentJournalGate.unsafe("rollback").catch(()=>{});
    if (paymentJournalAttempts) await Promise.allSettled([paymentJournalAttempts]);
    for (const client of paymentJournalClients) {
      try { await client.release(); } catch { /* preserve the original acceptance error */ }
    }
    await Promise.all([
      paymentJournalGate.end({timeout:5}).catch(()=>{}),
      ...paymentJournalPools.map(pool=>pool.end({timeout:5}).catch(()=>{})),
    ]);
  }
  assert.equal(paymentJournalResults.filter((outcome)=>outcome.status==="fulfilled").length,2,
    "both same-source payment journal requests should resolve: " +
    JSON.stringify(paymentJournalResults.map((outcome)=>outcome.status==="rejected"
      ? String(outcome.reason?.message ?? outcome.reason)
      : {ok:true})));
  const paymentJournalValues = paymentJournalResults.map((outcome)=>outcome.status==="fulfilled"
    ? outcome.value[0].result
    : null);
  assert.equal(paymentJournalValues.filter((value)=>value?.replayed===false).length,1,
    "exactly one concurrent payment-journal request should create the draft");
  assert.equal(paymentJournalValues.filter((value)=>value?.replayed===true).length,1,
    "the losing same-source request should replay the canonical draft");
  assert.equal(paymentJournalValues[0].journal_entry_id,paymentJournalValues[1].journal_entry_id,
    "concurrent same-source requests must return one journal entry ID");
  const paymentDraft = paymentJournalValues.find((value)=>value.replayed===false);
  assert.ok(paymentDraft,"the race must expose the one original payment journal draft");
  assert.equal(paymentDraft.status,"draft");
  assert.equal(Number(paymentDraft.amount),Number(paymentSource.amount));
  const paymentJournalId = paymentDraft.journal_entry_id;

  await db.unsafe("reset role");
  const paymentSourcePostingRaceRows = await db.unsafe(
    "select sp.journal_entry_id,sp.idempotency_key,je.status " +
    "from public.accounting_customer_source_postings sp " +
    "join public.accounting_journal_entries je on je.id=sp.journal_entry_id and je.organization_id=sp.organization_id " +
    "where sp.organization_id=$1::uuid and sp.source_type='customer_payment' and sp.source_id=$2::uuid and sp.posting_kind='original'",
    [organizationId,paymentSource.id],
  );
  assert.equal(paymentSourcePostingRaceRows.length,1,
    "payment journal race must persist exactly one source-link row");
  assert.equal(paymentSourcePostingRaceRows[0].journal_entry_id,paymentJournalId);
  assert.ok(
    [paymentJournalKey,paymentJournalRaceKey].includes(String(paymentSourcePostingRaceRows[0].idempotency_key)),
    "the sole source link retains the winning request's idempotency key",
  );
  assert.equal(paymentSourcePostingRaceRows[0].status,"draft");
  const paymentJournalAuditRaceRows = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
    "where organization_id=$1::uuid and action='accounting.customer_payment_journal_draft_created' " +
    "and entity_type='customer_payment' and entity_id::text=$2::text",
    [organizationId,paymentSource.id],
  );
  assert.equal(paymentJournalAuditRaceRows[0].count,1,
    "the concurrent source-link race must write exactly one creation audit");
  await setIdentity(accountantAuthUserId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const runtimeAuditPaymentReplay = (await db.unsafe(
    "select public.create_customer_payment_journal_draft($1::uuid,$2::uuid,$3::uuid) as result",
    [paymentSource.id,altSettlementAccountId,"cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdc4"],
  ))[0].result;
  assert.equal(runtimeAuditPaymentReplay.journal_entry_id,paymentJournalId);
  assert.equal(runtimeAuditPaymentReplay.replayed,true,
    "a later retry with a new request key should still replay the existing source mapping");
  await expectFailure(
    "payment source cannot be remapped to a different settlement account after draft creation",
    () => db.unsafe(
      "select public.create_customer_payment_journal_draft($1::uuid,$2::uuid,$3::uuid)",
      [paymentSource.id, debitAccountId, "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdc3"],
    ),
    /payment already has an active journal with a different mapping or source values/i,
  );
  await db.unsafe("reset role");
  await expectFailure(
    "payment amount cannot change while an accounting draft is linked",
    () => db.unsafe("update public.customer_payments set amount=amount+1 where id=$1::uuid", [paymentSource.id]),
    /payment is linked to an active accounting journal/i,
  );
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const paymentPosted = (await db.unsafe("select public.post_general_journal_entry($1::uuid) as result", [paymentJournalId]))[0].result;
  assert.equal(paymentPosted.status, "posted");
  const paymentPostedLines = await db.unsafe(
    "select account_id,debit::text,credit::text from public.accounting_journal_lines where journal_entry_id=$1::uuid order by line_number",
    [paymentJournalId],
  );
  assert.equal(paymentPostedLines.length, 2);
  assert.equal(paymentPostedLines[0].account_id, altSettlementAccountId);
  assert.equal(Number(paymentPostedLines[0].debit), Number(paymentSource.amount));
  assert.equal(paymentPostedLines[1].account_id, debitAccountId, "payment uses the same AR account as the posted invoice");
  assert.equal(Number(paymentPostedLines[1].credit), Number(paymentSource.amount));
  await expectFailure(
    "authenticated finance users cannot directly delete a payment after posting",
    () => db.unsafe("delete from public.customer_payments where id=$1::uuid", [paymentSource.id]),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  await expectFailure(
    "payment with accounting history cannot be deleted through a privileged maintenance path",
    () => db.unsafe("delete from public.customer_payments where id=$1::uuid", [paymentSource.id]),
    /payment has accounting history/i,
  );
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const paymentInbox = (await db.unsafe("select public.fetch_customer_payment_accounting_inbox(50,0,'posted') as result"))[0].result;
  assert.ok(paymentInbox.items.some((item) => item.id === paymentSource.id && item.journal_status === "posted"));

  // Reversal acceptance: manager-only, reason-required, idempotent, exact mirror and source-void safety.
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "accountant cannot create a customer-source reversal without manager authority",
    () => db.unsafe("select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid)",
      ["customer_invoice", invoice.id, "Valid reason from accountant", "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f101"]),
    /administrator or manager permission required/i,
  );
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "source reversal rejects an empty or too-short reason",
    () => db.unsafe("select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid)",
      ["customer_invoice", invoice.id, "bad", "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f102"]),
    /reason between 5 and 500 characters are required/i,
  );
  const invoiceReversal = (await db.unsafe(
    "select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["customer_invoice", invoice.id, "CI-approved invoice accounting reversal", "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f103"],
  ))[0].result;
  assert.equal(invoiceReversal.status, "draft");
  assert.equal(invoiceReversal.replayed, false);
  const invoiceReversalReplay = (await db.unsafe(
    "select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["customer_invoice", invoice.id, "CI-approved invoice accounting reversal", "f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f203"],
  ))[0].result;
  assert.equal(invoiceReversalReplay.journal_entry_id, invoiceReversal.journal_entry_id);
  assert.equal(invoiceReversalReplay.replayed, true, "same reversal reason and source snapshot must replay without another journal");
  const invoiceReversalPosted = (await db.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result", [invoiceReversal.journal_entry_id],
  ))[0].result;
  assert.equal(invoiceReversalPosted.status, "posted");
  async function assertExactMirror(originalId, reversalId, label) {
    const originalLines = await db.unsafe(
      "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1 and journal_entry_id=$2::uuid order by line_number",
      [organizationId, originalId],
    );
    const reversedLines = await db.unsafe(
      "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where organization_id=$1 and journal_entry_id=$2::uuid order by line_number",
      [organizationId, reversalId],
    );
    assert.ok(originalLines.length >= 2, label + ": original journal must have lines");
    assert.equal(reversedLines.length, originalLines.length, label + ": reversal must preserve every original line");
    for (let index = 0; index < originalLines.length; index += 1) {
      assert.equal(reversedLines[index].line_number, originalLines[index].line_number, label + ": line numbers must match");
      assert.equal(reversedLines[index].account_id, originalLines[index].account_id, label + ": reversal cannot remap accounts");
      assert.equal(Number(reversedLines[index].debit), Number(originalLines[index].credit), label + ": debit must mirror original credit");
      assert.equal(Number(reversedLines[index].credit), Number(originalLines[index].debit), label + ": credit must mirror original debit");
    }
  }
  await assertExactMirror(invoiceJournalId, invoiceReversal.journal_entry_id, "invoice reversal");
  await db.unsafe("reset role");
  await expectFailure(
    "invoice cannot be voided while a posted customer payment has not been reversed",
    () => db.unsafe("update public.customer_invoices set status='void' where id=$1::uuid", [invoice.id]),
    /invoice has posted customer payments; post each payment reversal before voiding the invoice/i,
  );
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const paymentReversal = (await db.unsafe(
    "select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["customer_payment", paymentSource.id, "CI-approved payment accounting reversal", "f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f303"],
  ))[0].result;
  assert.equal(paymentReversal.status, "draft");
  assert.equal(Number(paymentReversal.amount), Number(paymentSource.amount));
  const paymentReversalReplay = (await db.unsafe(
    "select public.create_customer_source_reversal_draft($1::text,$2::uuid,$3::text,$4::uuid) as result",
    ["customer_payment", paymentSource.id, "CI-approved payment accounting reversal", "f4f4f4f4-f4f4-44f4-84f4-f4f4f4f4f404"],
  ))[0].result;
  assert.equal(paymentReversalReplay.journal_entry_id, paymentReversal.journal_entry_id);
  assert.equal(paymentReversalReplay.replayed, true);
  const paymentReversalPosted = (await db.unsafe(
    "select public.post_general_journal_entry($1::uuid) as result", [paymentReversal.journal_entry_id],
  ))[0].result;
  assert.equal(paymentReversalPosted.status, "posted");
  await assertExactMirror(paymentJournalId, paymentReversal.journal_entry_id, "payment reversal");
  await db.unsafe("reset role");
  await db.unsafe("update public.customer_invoices set status='void' where id=$1::uuid", [invoice.id]);
  const invoiceGuardResult = await db.unsafe("select status from public.customer_invoices where id=$1::uuid", [invoice.id]);
  assert.equal(invoiceGuardResult[0].status, "void", "void is allowed only after all posted invoice and payment source journals are reversed");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  async function findSourceInAccountingInbox(functionName, sourceId) {
    let offset = 0;
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const pageResult = (await db.unsafe(
        `select public.${functionName}($1::integer,$2::integer,$3::text) as result`,
        [100, offset, "all"],
      ))[0].result;
      const found = pageResult.items.find((item) => item.id === sourceId);
      if (found) return found;
      if (!pageResult.has_more) break;
      offset += pageResult.limit;
    }
    return null;
  }
  const reversedInvoiceRow = await findSourceInAccountingInbox("fetch_customer_invoice_accounting_inbox", invoice.id);
  assert.ok(reversedInvoiceRow, "reversed invoice remains discoverable across accounting inbox pages");
  assert.equal(reversedInvoiceRow.journal_reversal_status, "posted");
  assert.equal(reversedInvoiceRow.journal_reversal_entry_id, invoiceReversal.journal_entry_id);
  const reversedPaymentRow = await findSourceInAccountingInbox("fetch_customer_payment_accounting_inbox", paymentSource.id);
  assert.ok(reversedPaymentRow, "reversed payment remains discoverable across accounting inbox pages");
  assert.equal(reversedPaymentRow.journal_reversal_status, "posted");
  assert.equal(reversedPaymentRow.journal_reversal_entry_id, paymentReversal.journal_entry_id);

  // Tax fixture: a real persisted invoice source with a reconciled subtotal + recorded tax + total.
  await db.unsafe("reset role");
  const taxOrderId = (await db.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,total_items,notes,created_by) values($1,$2,$3,'draft',115.00,1,'CI source-posting tax fixture',$4) returning id",
    [organizationId, customerOneId, "CI-SOURCE-TAX-ORDER", profileId],
  ))[0].id;
  const taxInvoiceId = (await db.unsafe(
    "insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,issued_at,due_at,currency,subtotal,tax_amount,total_amount) values($1,$2,$3,$4,'issued',statement_timestamp(),statement_timestamp()+interval '30 days','YER',100.00,15.00,115.00) returning id",
    [organizationId, customerOneId, taxOrderId, "CI-SOURCE-TAX-INVOICE"],
  ))[0].id;
  await db.unsafe(
    "insert into public.customer_invoice_items(organization_id,invoice_id,product_id,item_code,description,unit,quantity,unit_price,line_total) values($1,$2,$3,'CI-TAX-LINE','CI source tax invoice line','unit',1,100.00,100.00)",
    [organizationId, taxInvoiceId, productId],
  );
  // DLV-008-INVOICE-PAYMENT-MULTICURRENCY-SETTLEMENT-002:
  // A payment inherits currency only from its tenant-scoped invoice; no implicit FX conversion is allowed.
  // All temporary USD state is enclosed in a rollback transaction so the YER accounting fixture remains canonical.
  const usdPaymentIdempotencyKey = randomUUID();
  let usdPaymentId;
  await db.unsafe("reset role");
  await db.unsafe("begin");
  try {
    await db.unsafe("update public.customer_invoices set currency='USD' where id=$1::uuid", [taxInvoiceId]);

    const readForeignCurrencyJournalDenialSnapshot = async () => {
      await db.unsafe("reset role");
      const rows = await db.unsafe(
        "select jsonb_build_object(" +
          "'invoice',to_jsonb(source_invoice)," +
          "'customer',to_jsonb(source_customer)," +
          "'payments',coalesce((" +
            "select jsonb_agg(to_jsonb(source_payment) order by source_payment.id) " +
            "from public.customer_payments source_payment " +
            "where source_payment.organization_id=source_invoice.organization_id " +
              "and source_payment.invoice_id=source_invoice.id" +
          "),'[]'::jsonb)," +
          "'audits',coalesce((" +
            "select jsonb_agg(to_jsonb(source_audit) order by source_audit.created_at,source_audit.id) " +
            "from public.audit_logs source_audit " +
            "where source_audit.organization_id=source_invoice.organization_id and (" +
              "source_audit.entity_id=any(array[source_invoice.id,source_customer.id]::uuid[]) or " +
              "source_audit.new_value->>'invoice_id'=source_invoice.id::text or " +
              "source_audit.old_value->>'invoice_id'=source_invoice.id::text" +
            ")" +
          "),'[]'::jsonb)" +
        ")::text as snapshot " +
        "from public.customer_invoices source_invoice " +
        "join public.customers source_customer " +
          "on source_customer.id=source_invoice.customer_id " +
          "and source_customer.organization_id=source_invoice.organization_id " +
        "where source_invoice.organization_id=$1::uuid and source_invoice.id=$2::uuid",
        [organizationId, taxInvoiceId],
      );
      assert.equal(rows.length, 1, "foreign-currency denial snapshot resolves exactly one tenant invoice/customer");
      return rows[0].snapshot;
    };

    const foreignCurrencyDenialBefore = await readForeignCurrencyJournalDenialSnapshot();
    await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
    await db.unsafe("set role authenticated");
    // Expected SQL errors abort their transaction; isolate this policy denial so the outer fixture can continue.
    await db.unsafe("savepoint foreign_currency_journal_denial");
    await expectFailure(
      "foreign-currency invoice is not converted without an explicit FX policy",
      () => db.unsafe(
        "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)",
        [taxInvoiceId, debitAccountId, creditAccountId, taxLiabilityAccountId, "efefefef-efef-4fef-8fef-efefefefefe1"],
      ),
      /only active YER invoices can be journaled until a documented FX policy exists/i,
    );
    await db.unsafe("rollback to savepoint foreign_currency_journal_denial");
    await db.unsafe("release savepoint foreign_currency_journal_denial");
    const foreignCurrencyDenialAfter = await readForeignCurrencyJournalDenialSnapshot();
    assert.equal(
      foreignCurrencyDenialAfter,
      foreignCurrencyDenialBefore,
      "foreign-currency accounting denial leaves invoice/customer/payment/audit rows byte-for-byte unchanged",
    );

    await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
    await db.unsafe("set role authenticated");
    const statementBeforeUsdPayment = (await db.unsafe(
      "select public.get_staff_customer_account_statement($1::uuid) as result",
      [customerOneId],
    ))[0].result;
    const yerSummaryBeforeUsdPayment = statementBeforeUsdPayment.summary.find((row) => row.currency === "YER");
    assert.ok(yerSummaryBeforeUsdPayment, "the customer statement must retain its existing YER currency bucket");

    usdPaymentId = (await db.unsafe(
      "select public.record_customer_payment($1::uuid,$2::numeric,$3::text,$4::uuid,$5::text,$6::text)::text as id",
      [taxInvoiceId, "40.25", "transfer", usdPaymentIdempotencyKey, "CI-USD-SOURCE-CURRENCY", "exact-decimal USD settlement"],
    ))[0].id;
    assert.match(usdPaymentId, /^[0-9a-f-]{36}$/i, "source-linked USD settlement returns its canonical payment ID");

    await db.unsafe("reset role");
    const persistedUsdPayment = await db.unsafe(
      "select payment.id::text as id,payment.invoice_id::text as invoice_id," +
        "payment.organization_id::text as organization_id,payment.customer_id::text as customer_id," +
        "payment.amount::text as amount,invoice.currency " +
      "from public.customer_payments payment " +
      "join public.customer_invoices invoice " +
        "on invoice.id=payment.invoice_id and invoice.organization_id=payment.organization_id " +
        "and invoice.customer_id=payment.customer_id " +
      "where payment.id=$1::uuid",
      [usdPaymentId],
    );
    assert.equal(persistedUsdPayment.length, 1, "the USD payment must persist exactly once against its source invoice");
    assert.equal(persistedUsdPayment[0].invoice_id, taxInvoiceId);
    assert.equal(persistedUsdPayment[0].organization_id, organizationId);
    assert.equal(persistedUsdPayment[0].customer_id, customerOneId);
    assert.equal(persistedUsdPayment[0].amount, "40.25", "numeric settlement preserves exact two-decimal precision");
    assert.equal(persistedUsdPayment[0].currency, "USD", "payment currency is inherited from the source invoice");

    const usdPaymentAudit = await db.unsafe(
      "select actor_id::text as actor_id,new_value from public.audit_logs " +
        "where organization_id=$1::uuid and action='customer_payment.recorded' " +
        "and entity_type='customer_payment' and entity_id=$2::uuid",
      [organizationId, usdPaymentId],
    );
    assert.equal(usdPaymentAudit.length, 1, "the source-linked USD payment writes exactly one audit row");
    assert.equal(usdPaymentAudit[0].actor_id, accountantProfileId);
    assert.equal(usdPaymentAudit[0].new_value.invoice_id, taxInvoiceId);
    assert.equal(usdPaymentAudit[0].new_value.amount, "40.25");
    assert.equal(usdPaymentAudit[0].new_value.currency, "USD");
    assert.equal(usdPaymentAudit[0].new_value.payment_method, "transfer");
    assert.equal(usdPaymentAudit[0].new_value.idempotency_key_present, true);
    assert.equal(Object.hasOwn(usdPaymentAudit[0].new_value, "idempotency_key"), false);
    assert.equal(Object.hasOwn(usdPaymentAudit[0].new_value, "notes"), false);

    await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
    await db.unsafe("set role authenticated");
    const statementAfterUsdPayment = (await db.unsafe(
      "select public.get_staff_customer_account_statement($1::uuid) as result",
      [customerOneId],
    ))[0].result;
    // The detailed statement list is intentionally capped at 200 rows; use the existing
    // tenant-scoped keyset invoice API to locate a source invoice beyond that bounded detail window.
    let usdInvoiceStatement = null;
    let usdPageIssuedAt = null;
    let usdPageId = null;
    let usdInvoiceSearchComplete = false;
    for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
      const page = await readFinanceInvoicePage(100, usdPageIssuedAt, usdPageId);
      assert.ok(page && Array.isArray(page.invoices),
        "finance invoice page must remain available for complete currency statement lookup");
      usdInvoiceStatement = page.invoices.find((row) => row.id === taxInvoiceId) ?? null;
      if (usdInvoiceStatement) {
        usdInvoiceSearchComplete = true;
        break;
      }
      if (!page.has_more) break;
      assert.equal(page.invoices.length, 100,
        "a finance page with more records must fill its requested size");
      const last = page.invoices[page.invoices.length - 1];
      assert.ok(last?.issued_at && last?.id, "currency invoice lookup continuation requires a stable issued_at/id cursor");
      usdPageIssuedAt = last.issued_at;
      usdPageId = last.id;
    }
    assert.equal(usdInvoiceSearchComplete, true,
      "the source USD invoice must be discoverable across the bounded tenant keyset invoice pages");
    assert.equal(usdInvoiceStatement.currency, "USD");
    assert.equal(usdInvoiceStatement.total_amount, "115.00");
    assert.equal(usdInvoiceStatement.paid_amount, "40.25");
    assert.equal(usdInvoiceStatement.outstanding_amount, "74.75");
    const usdSummary = statementAfterUsdPayment.summary.find((row) => row.currency === "USD");
    assert.ok(usdSummary, "statement aggregates must retain a distinct USD bucket");
    const usdSummaryBefore = statementBeforeUsdPayment.summary.find((row) => row.currency === "USD");
    const cents = (value) => {
      const [whole, fraction = ""] = String(value).split(".");
      return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
    };
    const decimal = (value) => {
      const whole = value / 100n;
      const fraction = (value % 100n).toString().padStart(2, "0");
      return whole.toString() + "." + fraction;
    };
    assert.ok(usdSummaryBefore,
      "baseline statement must already include the temporarily USD-denominated source invoice");
    assert.equal(
      usdSummary.invoiced,
      decimal(cents(usdSummaryBefore.invoiced)),
      "recording a payment must not change the USD invoice total",
    );
    assert.equal(
      usdSummary.paid,
      decimal(cents(usdSummaryBefore.paid) + 4025n),
      "USD aggregate payment total must increase by the exact 40.25 settlement",
    );
    assert.equal(
      usdSummary.outstanding,
      decimal(cents(usdSummaryBefore.outstanding) - 4025n),
      "USD aggregate receivable must decrease by the exact 40.25 settlement",
    );
    const yerSummaryAfterUsdPayment = statementAfterUsdPayment.summary.find((row) => row.currency === "YER");
    assert.deepEqual(
      yerSummaryAfterUsdPayment,
      yerSummaryBeforeUsdPayment,
      "a USD payment must not change the customer's YER statement bucket",
    );
    process.stdout.write(
      "PASS DLV-008-INVOICE-PAYMENT-MULTICURRENCY-SETTLEMENT-002: exact-decimal payment follows the source USD invoice, audit and statement preserve USD, YER totals remain isolated, and unsupported FX journal posting fails without side effects\\n",
    );
  } finally {
    await db.unsafe("rollback");
    await db.unsafe("reset role");
    await setIdentity(staffAuthUserId, "admin@aghbari.ye");
    await db.unsafe("set role authenticated");
  }

  await db.unsafe("reset role");
  const rolledBackUsdFixture = await db.unsafe(
    "select invoice.currency,count(payment.id)::int as payment_count " +
      "from public.customer_invoices invoice " +
      "left join public.customer_payments payment " +
        "on payment.invoice_id=invoice.id and payment.organization_id=invoice.organization_id " +
      "where invoice.organization_id=$1::uuid and invoice.id=$2::uuid " +
      "group by invoice.currency",
    [organizationId, taxInvoiceId],
  );
  assert.equal(rolledBackUsdFixture.length, 1);
  assert.equal(rolledBackUsdFixture[0].currency, "YER", "the temporary USD source currency must be rolled back");
  assert.equal(rolledBackUsdFixture[0].payment_count, 0, "the temporary USD payment must not leak into later accounting fixtures");
  const rolledBackUsdAudit = await db.unsafe(
    "select id from public.audit_logs where organization_id=$1::uuid " +
      "and action='customer_payment.recorded' and entity_type='customer_payment' and entity_id=$2::uuid",
    [organizationId, usdPaymentId ?? "00000000-0000-0000-0000-000000000000"],
  );
  assert.equal(rolledBackUsdAudit.length, 0, "the temporary USD audit event must roll back with its payment");

  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  const taxDraft = (await db.unsafe(
    "select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as result",
    [taxInvoiceId, debitAccountId, creditAccountId, taxLiabilityAccountId, "efefefef-efef-4fef-8fef-efefefefefe2"],
  ))[0].result;
  const taxJournalId = taxDraft.journal_entry_id;
  const taxDraftLines = await db.unsafe(
    "select line_number,account_id,debit::text,credit::text from public.accounting_journal_lines where journal_entry_id=$1::uuid order by line_number",
    [taxJournalId],
  );
  assert.equal(taxDraftLines.length, 3);
  assert.equal(taxDraftLines[0].account_id, debitAccountId);
  assert.equal(Number(taxDraftLines[0].debit), 115);
  assert.equal(taxDraftLines[1].account_id, creditAccountId);
  assert.equal(Number(taxDraftLines[1].credit), 100);
  assert.equal(taxDraftLines[2].account_id, taxLiabilityAccountId);
  assert.equal(Number(taxDraftLines[2].credit), 15);
  const taxPosted = (await db.unsafe("select public.post_general_journal_entry($1::uuid) as result", [taxJournalId]))[0].result;
  assert.equal(taxPosted.status, "posted");
  await expectFailure(
    "authenticated finance users cannot directly delete an invoice",
    () => db.unsafe("delete from public.customer_invoices where id=$1::uuid", [taxInvoiceId]),
    /permission denied/i,
  );
  await db.unsafe("reset role");
  await expectFailure(
    "an invoice with accounting history cannot be deleted through a privileged maintenance path",
    () => db.unsafe("delete from public.customer_invoices where id=$1::uuid", [taxInvoiceId]),
    /invoice has accounting history/i,
  );

  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "customer cannot enumerate customer-invoice accounting sources",
    () => db.unsafe("select public.fetch_customer_invoice_accounting_inbox(50,0,'all')"),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot enumerate customer-payment accounting sources",
    () => db.unsafe("select public.fetch_customer_payment_accounting_inbox(50,0,'all')"),
    /finance permission required/i,
  );
  await expectFailure(
    "customer cannot create a customer invoice journal",
    () => db.unsafe("select public.create_customer_invoice_journal_draft($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)", [invoice.id,debitAccountId,creditAccountId,null,"efefefef-efef-4fef-8fef-efefefefefe3"]),
    /finance permission required/i,
  );
  await db.unsafe("reset role");
  process.stdout.write("PASS customer source accounting: invoice and payment source mapping, replay/mismatch, source/line guards, tax from source, explicit FX denial, role boundary and posted entries\n");

  // AGH-STOREFRONT-ANNOUNCEMENTS-001: date/audience filtering, tenant scope, command auth, audit and no direct table grants.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  async function addAnnouncement(title, audience, href, startsAt = null, endsAt = null) {
    const rows = await db.unsafe(
      "select public.save_storefront_announcement($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::boolean,$8::timestamptz,$9::timestamptz,$10::text) as id",
      [null, title, "CI-only content", href, "#B99347", 50, true, startsAt, endsAt, audience],
    );
    return rows[0].id;
  }
  const announcementAllId = await addAnnouncement("CI banner all", "all", "/products");
  const announcementCustomersId = await addAnnouncement("CI banner customers", "customers", "/orders");
  const announcementStaffId = await addAnnouncement("CI banner staff", "staff", "https://example.test/notice");
  const announcementFutureId = await addAnnouncement("CI banner future", "all", "/products", "2099-01-01T00:00:00Z", null);
  assert.match(announcementAllId, /^[0-9a-f-]{36}$/i);
  const adminAnnouncements = await db.unsafe("select id,title,audience from public.get_admin_storefront_announcements()");
  assert.ok(adminAnnouncements.some((row) => row.id === announcementAllId && row.title === "CI banner all"));
  assert.ok(adminAnnouncements.some((row) => row.id === announcementFutureId), "admin can manage scheduled records");
  await expectFailure("announcement mutation rejects javascript URLs",
    () => db.unsafe("select public.save_storefront_announcement($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::boolean,$8::timestamptz,$9::timestamptz,$10::text)",
      [null, "CI invalid URL", null, "javascript:alert(1)", "#B99347", 50, true, null, null, "all"]),
    /link must be an internal path or HTTPS URL/i);
  await expectFailure("authenticated users cannot read announcement storage directly",
    () => db.unsafe("select id from public.storefront_announcements"), /permission denied/i);
  assert.equal((await db.unsafe("select public.public_storefront_organization_id() as id"))[0].id, organizationId);
  const staffPublicRows = await db.unsafe("select id,audience from public.get_storefront_announcements()");
  assert.ok(staffPublicRows.some((row) => row.id === announcementAllId));
  assert.ok(staffPublicRows.some((row) => row.id === announcementStaffId));
  assert.ok(!staffPublicRows.some((row) => row.id === announcementCustomersId));
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("accountants cannot manage storefront announcements",
    () => db.unsafe("select public.get_admin_storefront_announcements()"), /active admin or manager/i);
  await expectFailure("accountants cannot save storefront announcements",
    () => db.unsafe("select public.save_storefront_announcement($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::boolean,$8::timestamptz,$9::timestamptz,$10::text)",
      [null, "CI accountant denied", null, "/products", "#B99347", 50, true, null, null, "all"]),
    /active admin or manager/i);
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const customerRows = await db.unsafe("select id,audience from public.get_storefront_announcements()");
  assert.ok(customerRows.some((row) => row.id === announcementAllId));
  assert.ok(customerRows.some((row) => row.id === announcementCustomersId));
  assert.ok(!customerRows.some((row) => row.id === announcementStaffId));
  await expectFailure("customers cannot save storefront announcements",
    () => db.unsafe("select public.save_storefront_announcement($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::integer,$7::boolean,$8::timestamptz,$9::timestamptz,$10::text)",
      [null, "CI customer denied", null, "/products", "#B99347", 50, true, null, null, "all"]),
    /active admin or manager/i);
  await db.unsafe("reset role");
  await db.unsafe("select set_config('request.jwt.claim.sub', '', false)");
  await db.unsafe("select set_config('request.jwt.claims', '', false)");
  await db.unsafe("set role anon");
  const anonymousRows = await db.unsafe("select id,audience from public.get_storefront_announcements()");
  assert.ok(anonymousRows.some((row) => row.id === announcementAllId));
  assert.ok(!anonymousRows.some((row) => row.id === announcementCustomersId));
  assert.ok(!anonymousRows.some((row) => row.id === announcementStaffId));
  await expectFailure("anonymous users cannot read announcement storage directly",
    () => db.unsafe("select id from public.storefront_announcements"), /permission denied/i);
  await db.unsafe("reset role");
  const announcementAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='storefront_announcement' and entity_id=any($2::uuid[])",
    [organizationId, [announcementAllId, announcementCustomersId, announcementStaffId, announcementFutureId]],
  );
  assert.ok(announcementAudit.filter((row) => row.action === "storefront_announcement.created").length >= 4);
  process.stdout.write("PASS storefront announcements: role authorization, public tenant scope, safe URLs, audience/date filtering, audit and no direct table grants\n");


  // NASR1-ORIGINAL-SPEC-PROMOTIONS-003: secure campaign management over real promotion records.
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  async function saveCiPromotion({ title, startDate = "2026-01-01", endDate = "2099-12-31", productIds = [productId] } = {}) {
    const rows = await db.unsafe(
      "select public.save_promotion($1::uuid,$2::text,$3::text,$4::text,$5::numeric,$6::uuid[],$7::uuid[],$8::date,$9::date,$10::boolean) as id",
      [null, title, "CI campaign only; not a production discount", "percentage", 10, productIds, [], startDate, endDate, true],
    );
    return rows[0].id;
  }
  const promotionId = await saveCiPromotion({ title: "CI active campaign" });
  const futurePromotionId = await saveCiPromotion({ title: "CI scheduled campaign", startDate: "2099-01-01" });
  assert.match(promotionId, /^[0-9a-f-]{36}$/i);
  const adminPromotions = await db.unsafe("select id,title from public.get_admin_promotions()");
  assert.ok(adminPromotions.some((row) => row.id === promotionId && row.title === "CI active campaign"));
  assert.ok(adminPromotions.some((row) => row.id === futurePromotionId), "admin sees scheduled campaigns");
  const adminPublished = await db.unsafe("select id from public.get_storefront_promotions()");
  assert.ok(adminPublished.some((row) => row.id === promotionId));
  assert.ok(!adminPublished.some((row) => row.id === futurePromotionId), "scheduled campaign stays unpublished");
  await expectFailure("admin browser role cannot select promotion storage directly",
    () => db.unsafe("select id from public.promotions"), /permission denied/i);
  await expectFailure("promotion rejects a product from another tenant",
    () => saveCiPromotion({ title: "CI invalid cross-tenant campaign", productIds: [otherProductId] }),
    /product not found in current organization/i);
  await db.unsafe("reset role");
  await setIdentity(accountantAuthUserId, "ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("accountant cannot list admin promotions",
    () => db.unsafe("select * from public.get_admin_promotions()"), /active admin or manager/i);
  await expectFailure("accountant cannot save promotions",
    () => db.unsafe("select public.save_promotion($1::uuid,$2::text,$3::text,$4::text,$5::numeric,$6::uuid[],$7::uuid[],$8::date,$9::date,$10::boolean)",
      [null,"CI accountant denied",null,"percentage",10,[productId],[],"2026-01-01","2099-12-31",true]),
    /active admin or manager/i);
  await db.unsafe("reset role");
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  const customerPublished = await db.unsafe("select id from public.get_storefront_promotions()");
  assert.ok(customerPublished.some((row) => row.id === promotionId));
  const customerPriceRows = await db.unsafe(
    "select * from public.get_storefront_product_prices($1::uuid[],1)",
    [[productId]],
  );
  assert.equal(customerPriceRows.length, 1, "storefront returns the tenant-scoped product price");
  const effectiveCustomerPrice = Number(customerPriceRows[0].unit_price ?? customerPriceRows[0].price);
  assert.ok(Number.isFinite(effectiveCustomerPrice) && effectiveCustomerPrice > 0);
  const promotionOrderKey = "ci-promotion-priced-order-" + promotionId;
  const placedRows = await db.unsafe(
    "select public.submit_customer_order($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::uuid) as result",
    [db.json([{ product_id: productId, quantity: 1 }]), "campaign pricing acceptance", "CI Company One", "CI Campaign Buyer", "771234567", "cash_on_delivery", promotionOrderKey, firstId],
  );
  const placedResponse = typeof placedRows[0].result === "string" ? JSON.parse(placedRows[0].result) : placedRows[0].result;
  const promotionOrderId = placedResponse?.id ?? placedResponse?.order_id;
  assert.match(String(promotionOrderId ?? ""), /^[0-9a-f-]{36}$/i);
  await db.unsafe("reset role");
  const campaignOrderItems = await db.unsafe(
    "select product_id,unit_price_snapshot,discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total from public.order_items where order_id=$1::uuid",
    [promotionOrderId],
  );
  assert.equal(campaignOrderItems.length, 1);
  const campaignLine = campaignOrderItems[0];
  const grossPriceRows = await db.unsafe(
    `select public.customer_product_unit_price(
       oi.product_id, o.organization_id,
       CASE WHEN c.status = 'approved' THEN coalesce(nullif(c.tier, ''), 'retail') ELSE 'retail' END,
       oi.quantity
     ) AS gross_unit_price
     from public.order_items oi
     join public.orders o ON o.id = oi.order_id
     join public.customers c ON c.id = o.customer_id
     where o.id = $1::uuid and oi.product_id = $2::uuid`,
    [promotionOrderId, productId],
  );
  assert.equal(grossPriceRows.length, 1, "the persisted campaign order must resolve its original customer-tier price");
  const grossCustomerPrice = Number(grossPriceRows[0].gross_unit_price);
  assert.ok(Number.isFinite(grossCustomerPrice) && grossCustomerPrice > 0, "the pre-campaign tier price must be a valid server-derived amount");
  assert.ok(grossCustomerPrice > effectiveCustomerPrice, "active campaign lowers the price while respecting the cost floor");
  assert.equal(campaignLine.promotion_id_snapshot, promotionId);
  assert.equal(campaignLine.promotion_title_snapshot, "CI active campaign");
  assert.equal(campaignLine.promotion_discount_type_snapshot, "percentage");
  assert.equal(Number(campaignLine.unit_price_snapshot), grossCustomerPrice);
  assert.ok(Number(campaignLine.discount_snapshot) > 0);
  assert.equal(Number(campaignLine.discount_snapshot), Number(campaignLine.promotion_discount_per_unit_snapshot));
  assert.equal(Number(campaignLine.line_total), effectiveCustomerPrice);
  const campaignOrder = await db.unsafe("select total_amount from public.orders where id=$1::uuid", [promotionOrderId]);
  assert.equal(Number(campaignOrder[0].total_amount), Number(campaignLine.line_total));
  await setIdentity(authUserId, "ci-customer-one@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("customer cannot select promotion storage directly",
    () => db.unsafe("select id from public.promotions"), /permission denied/i);
  await expectFailure("customer cannot save promotions",
    () => db.unsafe("select public.save_promotion($1::uuid,$2::text,$3::text,$4::text,$5::numeric,$6::uuid[],$7::uuid[],$8::date,$9::date,$10::boolean)",
      [null,"CI customer denied",null,"percentage",10,[productId],[],"2026-01-01","2099-12-31",true]),
    /active admin or manager/i);
  await db.unsafe("reset role");
  await db.unsafe("select set_config('request.jwt.claim.sub', '', false)");
  await db.unsafe("select set_config('request.jwt.claims', '', false)");
  await db.unsafe("set role anon");
  const anonymousPublished = await db.unsafe("select id from public.get_storefront_promotions()");
  assert.ok(anonymousPublished.some((row) => row.id === promotionId));
  assert.ok(!anonymousPublished.some((row) => row.id === futurePromotionId));
  await expectFailure("anonymous users cannot select promotion storage directly",
    () => db.unsafe("select id from public.promotions"), /permission denied/i);
  await db.unsafe("reset role");
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await db.unsafe("select public.set_promotion_active($1::uuid,$2::boolean)", [promotionId, false]);
  await db.unsafe("select public.set_promotion_active($1::uuid,$2::boolean)", [promotionId, false]);
  const hiddenAfterDisable = await db.unsafe("select id from public.get_storefront_promotions()");
  assert.ok(!hiddenAfterDisable.some((row) => row.id === promotionId));
  const promotionAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='promotion' and entity_id=$2::uuid order by action",
    [organizationId, promotionId],
  );
  assert.deepEqual(promotionAudit.map((row) => row.action), ["promotion.created", "promotion.deactivated"],
    "promotion status replay is a no-op and every state change is audited");
  await db.unsafe("reset role");
  process.stdout.write("PASS promotion management: admin-only tenant-scoped RPCs, public active/schedule filter, no direct table access, cross-tenant rejection and audit idempotency\\n");


  // AGH-PRICE-GRID-001: correct physical schema, atomic tier writes, stale guard and tenant isolation.
  await db.unsafe("reset role");
  await db.unsafe("update public.products set base_price=100,wholesale_price=95,retail_price=110 where id=$1 and organization_id=$2",[productId,organizationId]);
  const gridMissingStockProductId = "e7777777-7777-4777-8777-777777777777";
  await db.unsafe(
    "insert into public.products(id,organization_id,name,item_code,unit,base_price,wholesale_price,retail_price,status) values($1,$2,'CI Grid No Stock Balance','CI-GRID-NO-STOCK','unit',10,9,11,'active') on conflict(id) do update set organization_id=excluded.organization_id,name=excluded.name,item_code=excluded.item_code,status='active'",
    [gridMissingStockProductId, organizationId],
  );
  const activeGridWarehouses = await db.unsafe(
    "select id from public.warehouses where organization_id=$1 and is_active=true order by id limit 2",
    [organizationId],
  );
  assert.ok(activeGridWarehouses.length >= 2, "inventory-summary acceptance needs two active tenant warehouses");
  await db.unsafe(
    "update public.inventory_balances ib set quantity_on_hand=0,quantity_reserved=0,reorder_point=0 from public.warehouses w where ib.product_id=$1 and ib.warehouse_id=w.id and w.organization_id=$2 and w.is_active=true",
    [productId, organizationId],
  );
  for (const [index, warehouse] of activeGridWarehouses.entries()) {
    const onHand = index === 0 ? 20.125 : 5.5;
    const reserved = index === 0 ? 1.125 : 0.5;
    const reorderPoint = index === 0 ? 3 : 2;
    await db.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) values($1,$2,$3,$4,$5) on conflict(product_id,warehouse_id) do update set quantity_on_hand=excluded.quantity_on_hand,quantity_reserved=excluded.quantity_reserved,reorder_point=excluded.reorder_point",
      [productId, warehouse.id, onHand, reserved, reorderPoint],
    );
  }
  await db.unsafe("update public.product_prices set price=90,is_active=true where product_id=$1 and tier='vip' and min_quantity=1",[productId]);
  await db.unsafe("insert into public.product_prices(product_id,tier,price,min_quantity,is_active) select $1,'vip',90,1,true where not exists(select 1 from public.product_prices where product_id=$1 and tier='vip' and min_quantity=1)",[productId]);
  await db.unsafe("update public.product_prices set price=95,is_active=true where product_id=$1 and tier='wholesale' and min_quantity=1",[productId]);
  await db.unsafe("insert into public.product_prices(product_id,tier,price,min_quantity,is_active) select $1,'wholesale',95,1,true where not exists(select 1 from public.product_prices where product_id=$1 and tier='wholesale' and min_quantity=1)",[productId]);
  await db.unsafe("update public.product_prices set price=110,is_active=true where product_id=$1 and tier='retail' and min_quantity=1",[productId]);
  await db.unsafe("insert into public.product_prices(product_id,tier,price,min_quantity,is_active) select $1,'retail',110,1,true where not exists(select 1 from public.product_prices where product_id=$1 and tier='retail' and min_quantity=1)",[productId]);
  const priceGridPayload = [{
    id: productId, expected_base_price: 100, expected_price_wholesale_of_wholesale: 90,
    expected_price_wholesale: 95, expected_price_retail: 110,
    base_price: 101, price_wholesale_of_wholesale: 91, price_wholesale: 96, price_retail: 111,
  }];
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const gridRead=(await db.unsafe("select id,base_price,price_wholesale_of_wholesale,price_wholesale,price_retail from public.get_admin_product_price_grid() where id=$1",[productId]))[0];
  assert.deepEqual([Number(gridRead.base_price),Number(gridRead.price_wholesale_of_wholesale),Number(gridRead.price_wholesale),Number(gridRead.price_retail)],[100,90,95,110],
    "the authorized grid read model resolves the stored base and the three tier price rows");
  const inventoryGridRead = (await db.unsafe(
    "select quantity_on_hand_total,quantity_reserved_total,quantity_available_total,reorder_point_total,inventory_warehouse_count from public.get_admin_product_price_grid_with_inventory() where id=$1",
    [productId],
  ))[0];
  assert.deepEqual([
    Number(inventoryGridRead.quantity_on_hand_total),
    Number(inventoryGridRead.quantity_reserved_total),
    Number(inventoryGridRead.quantity_available_total),
    Number(inventoryGridRead.reorder_point_total),
  ], [25.625, 1.625, 24, 5], "inventory summary aggregates stock, reservations and reorder points over active tenant warehouses without losing millesimal quantities");
  assert.ok(Number(inventoryGridRead.inventory_warehouse_count) >= 2, "inventory summary reports recorded warehouse balances");
  const missingInventoryGridRead = (await db.unsafe(
    "select quantity_on_hand_total,quantity_reserved_total,quantity_available_total,reorder_point_total,inventory_warehouse_count from public.get_admin_product_price_grid_with_inventory() where id=$1",
    [gridMissingStockProductId],
  ))[0];
  assert.equal(missingInventoryGridRead.quantity_on_hand_total, null, "missing inventory records remain NULL rather than becoming fake zero stock");
  assert.equal(missingInventoryGridRead.quantity_reserved_total, null);
  assert.equal(missingInventoryGridRead.quantity_available_total, null);
  assert.equal(missingInventoryGridRead.reorder_point_total, null);
  assert.equal(Number(missingInventoryGridRead.inventory_warehouse_count), 0);
  const priceGridResult=(await db.unsafe("select public.save_product_price_grid($1::jsonb) as result",[db.json(priceGridPayload)]))[0].result;
  assert.equal(Number(priceGridResult.updated_count),1);
  assert.deepEqual(priceGridResult.product_ids,[productId]);
  await db.unsafe("reset role");
  const savedGrid=(await db.unsafe(
    "select p.base_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='vip' and pp.is_active order by pp.min_quantity asc limit 1) as vip_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='wholesale' and pp.is_active order by pp.min_quantity asc limit 1) as wholesale_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='retail' and pp.is_active order by pp.min_quantity asc limit 1) as retail_price from public.products p where p.id=$1",
    [productId],
  ))[0];
  assert.deepEqual([Number(savedGrid.base_price),Number(savedGrid.vip_price),Number(savedGrid.wholesale_price),Number(savedGrid.retail_price)],[101,91,96,111],
    "base and all three product-price tiers persist together");
  const gridAudit=await db.unsafe("select action,old_value,new_value from public.audit_logs where organization_id=$1 and entity_type='product' and entity_id=$2::uuid and action='product.price_grid_updated'",[organizationId,productId]);
  assert.equal(gridAudit.length,1,"the product tier grid change is audited");
  await setIdentity(staffAuthUserId,"admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure("price grid rejects stale expected values",()=>db.unsafe("select public.save_product_price_grid($1::jsonb)",[db.json([{...priceGridPayload[0],base_price:102}])]),/changed after the grid was loaded/i);
  const crossTenantPayload=[
    {id:productId,expected_base_price:101,expected_price_wholesale_of_wholesale:91,expected_price_wholesale:96,expected_price_retail:111,base_price:102,price_wholesale_of_wholesale:92,price_wholesale:97,price_retail:112},
    {id:otherProductId,expected_base_price:1,expected_price_wholesale_of_wholesale:0,expected_price_wholesale:0,expected_price_retail:0,base_price:2,price_wholesale_of_wholesale:2,price_wholesale:2,price_retail:2},
  ];
  await expectFailure("price grid rejects another tenant and rolls back its earlier row",()=>db.unsafe("select public.save_product_price_grid($1::jsonb)",[db.json(crossTenantPayload)]),/Product not found in current organization/i);
  await db.unsafe("reset role");
  const afterRollback=(await db.unsafe("select p.base_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='vip' and pp.is_active order by pp.min_quantity asc limit 1) as vip_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='wholesale' and pp.is_active order by pp.min_quantity asc limit 1) as wholesale_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.tier='retail' and pp.is_active order by pp.min_quantity asc limit 1) as retail_price from public.products p where p.id=$1",[productId]))[0];
  assert.deepEqual([Number(afterRollback.base_price),Number(afterRollback.vip_price),Number(afterRollback.wholesale_price),Number(afterRollback.retail_price)],[101,91,96,111],"foreign-tenant rejection rolls back the entire batch");
  await setIdentity(accountantAuthUserId,"ci-accountant@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("accountant cannot read the price grid",()=>db.unsafe("select public.get_admin_product_price_grid()"),/active admin or manager/i);
  await expectFailure("accountant cannot read price-grid inventory summaries",()=>db.unsafe("select public.get_admin_product_price_grid_with_inventory()"),/active admin or manager/i);
  await expectFailure("accountant cannot write the price grid",()=>db.unsafe("select public.save_product_price_grid($1::jsonb)",[db.json([{...priceGridPayload[0],expected_base_price:101,expected_price_wholesale_of_wholesale:91,expected_price_wholesale:96,expected_price_retail:111,base_price:103}])]),/active admin or manager/i);
  await db.unsafe("reset role");
  process.stdout.write("PASS price grid: admin/manager auth, base+three tier values, atomic writes, audit, stale-value guard, tenant rollback and accountant denial\n");

  // P2 customer activation: PostgreSQL/RLS acceptance using the real auth.users confirmation source.
  const activationProfileId = "f1212121-1212-4121-8121-121212121211";
  const activationAuthId = "12121212-1212-4121-8121-121212121211";
  const unconfirmedProfileId = "f1313131-1313-4131-8131-131313131311";
  const unconfirmedAuthId = "13131313-1313-4131-8131-131313131311";
  const mismatchProfileId = "f1414141-1414-4141-8141-141414141411";
  const mismatchAuthId = "14141414-1414-4141-8141-141414141411";
  const expiredProfileId = "f1515151-1515-4151-8151-151515151511";
  const expiredAuthId = "15151515-1515-4151-8151-151515151511";
  const activationFixtures = [
    [activationProfileId, activationAuthId, organizationId, "CI Activation Customer", "activation-client@example.test"],
    [unconfirmedProfileId, unconfirmedAuthId, organizationId, "CI Unconfirmed Customer", "unconfirmed-client@example.test"],
    [mismatchProfileId, mismatchAuthId, organizationId, "CI Mismatch Customer", "mismatch-client@example.test"],
    [expiredProfileId, expiredAuthId, organizationId, "CI Expired Customer", "expired-client@example.test"],
  ];
  for (const [id, authId, orgId, fullName, email] of activationFixtures) {
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,$4,$5,true) on conflict(id) do update set auth_user_id=excluded.auth_user_id,organization_id=excluded.organization_id,full_name=excluded.full_name,email=excluded.email,is_active=true",
      [id, authId, orgId, fullName, email],
    );
    await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'customer') on conflict(profile_id,role) do nothing", [id]);
  }
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,null),($5,$6,now()),($7,$8,now()),($9,$10,now()) on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [activationAuthId,"activation-client@example.test",unconfirmedAuthId,"unconfirmed-client@example.test",mismatchAuthId,"mismatch-client@example.test",expiredAuthId,"expired-client@example.test",staffAuthUserId,"admin@aghbari.ye"],
  );
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at",
    [foreignAuthUserId, "foreign-ci-profile@example.test"],
  );

  await db.unsafe(
    "insert into public.customers(organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at) values($1,null,'CI-ACT-FOREIGN','CI Foreign Organization Customer','CI Activation Contact','7778000101','foreign-ci-profile@example.test','retail',0,0,'approved',now()) on conflict(organization_id,customer_code) do update set profile_id=null,email=excluded.email,status='approved',approved_at=now()",
    [otherOrganizationId],
  );
  const foreignOrganizationCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-FOREIGN'", [otherOrganizationId]))[0].id;

  const activationCodes = [
    ["CI-ACT-01", "CI Activation Customer Record", "activation-client@example.test"],
    ["CI-ACT-02", "CI Unconfirmed Customer Record", "unconfirmed-client@example.test"],
    ["CI-ACT-03", "CI Foreign Scope Customer Record", "foreign-ci-profile@example.test"],
    ["CI-ACT-04", "CI Staff Rejection Customer Record", "admin@aghbari.ye"],
    ["CI-ACT-05", "CI Expired Customer Record", "expired-client@example.test"],
    ["CI-ACT-06", "CI Revoked Customer Record", "revoked-client@example.test"],
    ["CI-ACT-07", "CI Customer Manager Activation Record", "customer-manager-activation@example.test"],
    ["CI-ACT-08", "CI Activation Replacement Audit Record", "activation-replacement@example.test"],
  ];
  for (const [code, businessName, email] of activationCodes) {
    await db.unsafe(
      "insert into public.customers(organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at) values($1,null,$2,$3,'CI Activation Contact','7778000100',$4,'retail',0,0,'approved',now()) on conflict(organization_id,customer_code) do update set profile_id=null,business_name=excluded.business_name,email=excluded.email,status='approved',approved_at=now()",
      [organizationId, code, businessName, email],
    );
  }
  const activationCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-01'", [organizationId]))[0].id;
  const unconfirmedCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-02'", [organizationId]))[0].id;
  const foreignScopeCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-03'", [organizationId]))[0].id;
  const staffRejectCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-04'", [organizationId]))[0].id;
  const expiredCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-05'", [organizationId]))[0].id;
  const revokedCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-06'", [organizationId]))[0].id;
  const customerManagerActivationCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-07'", [organizationId]))[0].id;
  const activationReplacementCustomer = (await db.unsafe("select id from public.customers where organization_id=$1 and customer_code='CI-ACT-08'", [organizationId]))[0].id;

  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("reset role");
  // Exercise token generation, storage and acceptance with pgcrypto outside public, as in Supabase projects.
  const pgcryptoBeforeRow = (await db.unsafe(
    "select n.nspname as schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'",
  ))[0];
  const pgcryptoSchemaBeforeActivation = pgcryptoBeforeRow?.schema;
  assert.ok(pgcryptoSchemaBeforeActivation, "PostgreSQL 17 acceptance requires pgcrypto");
  await db.unsafe("create schema if not exists extensions");
  if (pgcryptoSchemaBeforeActivation !== "extensions") {
    await db.unsafe("alter extension pgcrypto set schema extensions");
  }
  const pgcryptoSchemaDuringActivation = (await db.unsafe(
    "select n.nspname as schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'",
  ))[0]?.schema;
  assert.equal(pgcryptoSchemaDuringActivation, "extensions", "activation flow must support pgcrypto installed outside public");
  await db.unsafe("set role authenticated");
  const createActivationInvite = async (customerId, email) => {
    const result = await db.unsafe(
      "select public.create_customer_activation_invitation($1::uuid,$2::text,$3::integer) as result",
      [customerId, email, 72],
    );
    assert.equal(typeof result[0].result.token, "string");
    return result[0].result;
  };
  const validInvitation = await createActivationInvite(activationCustomer, "activation-client@example.test");
  const unconfirmedInvitation = await createActivationInvite(unconfirmedCustomer, "unconfirmed-client@example.test");
  const foreignScopeInvitation = await createActivationInvite(foreignScopeCustomer, "foreign-ci-profile@example.test");
  const staffRejectInvitation = await createActivationInvite(staffRejectCustomer, "admin@aghbari.ye");
  const expiredInvitation = await createActivationInvite(expiredCustomer, "expired-client@example.test");
  const revokedInvitation = await createActivationInvite(revokedCustomer, "revoked-client@example.test");
  const revokedResult = await db.unsafe("select public.revoke_customer_activation_invitation($1::uuid) as revoked", [revokedInvitation.invitation_id]);
  assert.equal(revokedResult[0].revoked, true, "staff can revoke a pending tenant-scoped activation invitation");
  await db.unsafe("reset role");

  // Replacing an outstanding activation link is itself a revocation and must leave an auditable actor/reason.
  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  const supersededInvitation = await createActivationInvite(
    activationReplacementCustomer, "activation-replacement@example.test",
  );
  await db.unsafe("reset role");
  // A different authorized operator replaces the prior link; the revocation audit must identify this actor.
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  const replacementInvitation = await createActivationInvite(
    activationReplacementCustomer, "activation-replacement@example.test",
  );
  assert.notEqual(supersededInvitation.invitation_id, replacementInvitation.invitation_id,
    "replacing an activation link creates a new one-time invitation");
  await db.unsafe("reset role");

  const replacementStates = await db.unsafe(
    "select id::text as id,status,revoked_at is not null as has_revoked_at," +
      "invited_by_profile_id::text as invited_by_profile_id " +
      "from public.customer_activation_invitations where id=any($1::uuid[]) order by created_at,id",
    [[supersededInvitation.invitation_id, replacementInvitation.invitation_id]],
  );
  const supersededState = replacementStates.find(row => row.id === supersededInvitation.invitation_id);
  const replacementState = replacementStates.find(row => row.id === replacementInvitation.invitation_id);
  assert.equal(supersededState?.status, "revoked", "the previous pending link is explicitly transitioned to revoked");
  assert.equal(supersededState?.has_revoked_at, true, "the superseded link records its revocation time");
  assert.equal(replacementState?.status, "pending", "only the new link remains pending");
  const supersededAudit = await db.unsafe(
    "select actor_id::text as actor_id,old_value,new_value from public.audit_logs " +
      "where organization_id=$1::uuid and entity_type='customer_activation_invitation' " +
      "and entity_id=$2::uuid and action='customer_activation_invitation.revoked'",
    [organizationId, supersededInvitation.invitation_id],
  );
  assert.equal(supersededAudit.length, 1, "superseding a pending link writes exactly one revocation audit");
  assert.equal(supersededAudit[0].actor_id, replacementState.invited_by_profile_id,
    "replacement revocation audit identifies the operator who superseded the prior invitation");
  assert.notEqual(supersededAudit[0].actor_id, supersededState.invited_by_profile_id,
    "replacement audit actor is distinct from the prior invitation creator in this cross-operator case");
  assert.equal(supersededAudit[0].old_value.status, "pending");
  assert.equal(supersededAudit[0].new_value.status, "revoked");
  assert.equal(supersededAudit[0].new_value.reason, "superseded_by_replacement_invitation");
  const replacementCreatedAudit = await db.unsafe(
    "select actor_id::text as actor_id,new_value from public.audit_logs " +
      "where organization_id=$1::uuid and entity_type='customer_activation_invitation' " +
      "and entity_id=$2::uuid and action='customer_activation_invitation.created'",
    [organizationId, replacementInvitation.invitation_id],
  );
  assert.equal(replacementCreatedAudit.length, 1, "the replacement link creation is audited exactly once");
  const replacementAuditText = JSON.stringify([supersededAudit, replacementCreatedAudit]);
  assert.equal(replacementAuditText.includes(supersededInvitation.token), false,
    "the superseded bearer token must never appear in audit values");
  assert.equal(replacementAuditText.includes(replacementInvitation.token), false,
    "the replacement bearer token must never appear in audit values");

  const tokenHashRow = (await db.unsafe(
    "select token_hash from public.customer_activation_invitations where id=$1",
    [validInvitation.invitation_id],
  ))[0];
  assert.match(validInvitation.token, /^[0-9a-f]{64}$/i, "activation bearer token uses 256 bits represented as 64 hex characters");
  const computedTokenHash = (await db.unsafe("select pg_catalog.encode(extensions.digest($1::text,'sha256'),'hex') as hash", [validInvitation.token]))[0].hash;
  assert.equal(tokenHashRow.token_hash, computedTokenHash, "only the SHA-256 digest of the bearer token is persisted");
  assert.notEqual(tokenHashRow.token_hash, validInvitation.token, "raw bearer token is not stored in the token_hash column");
  await db.unsafe("update public.customer_activation_invitations set expires_at=now()-interval '1 minute' where id=$1", [expiredInvitation.invitation_id]);

  await setIdentity(staffAuthUserId, "admin@aghbari.ye");
  await db.unsafe("set role authenticated");
  await expectFailure("activation role cannot directly SELECT invitation storage",
    () => db.unsafe("select id from public.customer_activation_invitations"), /permission denied/i);
  await expectFailure("activation role cannot directly INSERT invitation rows",
    () => db.unsafe("insert into public.customer_activation_invitations(organization_id,customer_id,invited_email,token_hash,expires_at) values('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','x@example.test',repeat('a',64),now()+interval '1 hour')"), /permission denied/i);
  await expectFailure("activation role cannot directly UPDATE invitation rows",
    () => db.unsafe("update public.customer_activation_invitations set status='revoked'"), /permission denied/i);
  await expectFailure("activation role cannot directly DELETE invitation rows",
    () => db.unsafe("delete from public.customer_activation_invitations"), /permission denied/i);
  await expectFailure("staff cannot accept a customer activation invitation",
    () => db.unsafe("select public.accept_customer_activation_invitation($1::text)", [staffRejectInvitation.token]),
    /دعوة تفعيل العميل لا تمنح|42501|staff|customer/i);
  await expectFailure("staff cannot create an activation invitation for a different organization",
    () => db.unsafe("select public.create_customer_activation_invitation($1::uuid,$2::text,$3::integer)", [foreignOrganizationCustomer, "cross@example.test", 72]),
    /سجل العميل غير موجود ضمن المؤسسة الحالية|42501/i);

  await db.unsafe("reset role");
  // Use a customer_manager-only profile to prove this capability is independent of broad staff access.
  await db.unsafe("delete from public.user_roles where profile_id=$1", [operationsStaffProfileId]);
  await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'customer_manager')", [operationsStaffProfileId]);
  await setIdentity(operationsStaffAuthUserId, "ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  const customerManagerTenantScope = (await db.unsafe("select public.get_current_tenant_context() as result"))[0].result;
  assert.equal(customerManagerTenantScope.is_staff, false, "customer_manager must not inherit broad staff access");
  assert.equal(customerManagerTenantScope.can_manage_customers, true, "customer_manager has the narrow customer capability");

  const customerManagerDirectory = (await db.unsafe(
    "select public.fetch_customer_manager_directory($1::text,$2::integer,$3::integer) as result",
    ["CI Customer Manager Activation Record", 1, 25],
  ))[0].result;
  assert.equal(customerManagerDirectory.total_count, 1, "customer-manager directory search/count are server-scoped");
  const customerManagerRow = customerManagerDirectory.rows.find((row) => row.id === customerManagerActivationCustomer);
  assert.ok(customerManagerRow, "directory returns the authorized tenant customer");
  assert.equal(Object.hasOwn(customerManagerRow, "current_balance"), false, "directory hides current balance");
  assert.equal(Object.hasOwn(customerManagerRow, "credit_limit"), false, "directory hides credit limit");

  const customerManagerInvitation = (await db.unsafe(
    "select public.create_customer_activation_invitation($1::uuid,$2::text,$3::integer) as result",
    [customerManagerActivationCustomer, "customer-manager-activation@example.test", 72],
  ))[0].result;
  assert.equal(customerManagerInvitation.customer_id, customerManagerActivationCustomer,
    "customer_manager can create a tenant-scoped activation invitation");
  const customerManagerWorkspace = (await db.unsafe(
    "select public.list_customer_activation_invitations($1::uuid) as result",
    [customerManagerActivationCustomer],
  ))[0].result;
  assert.equal(customerManagerWorkspace.invitations[0].invitation_id, customerManagerInvitation.invitation_id,
    "customer_manager can list invitation metadata");
  await expectFailure("customer_manager cannot directly SELECT invitation storage",
    () => db.unsafe("select id from public.customer_activation_invitations"), /permission denied/i);
  const customerManagerRevoked = (await db.unsafe(
    "select public.revoke_customer_activation_invitation($1::uuid) as result",
    [customerManagerInvitation.invitation_id],
  ))[0].result;
  assert.equal(customerManagerRevoked, true, "customer_manager can revoke a pending invitation");
  const customerManagerTier = (await db.unsafe(
    "select public.set_admin_customer_tier($1::uuid,'retail','wholesale','CI customer manager tier change') as result",
    [customerManagerActivationCustomer],
  ))[0].result;
  assert.equal(customerManagerTier.tier, "wholesale", "customer_manager can change tier through the audited command");
  const customerManagerStatus = (await db.unsafe(
    "select public.set_admin_customer_status($1::uuid,'approved','frozen','CI customer manager status change') as result",
    [customerManagerActivationCustomer],
  ))[0].result;
  assert.equal(customerManagerStatus.status, "frozen", "customer_manager can change status through the audited command");

  await db.unsafe("reset role");
  await db.unsafe("delete from public.user_roles where profile_id=$1", [operationsStaffProfileId]);
  await db.unsafe("insert into public.user_roles(profile_id,role) values($1,'staff')", [operationsStaffProfileId]);
  process.stdout.write("PASS customer_manager scope: non-financial directory, audited tier/status commands, invitation create/list/revoke, and direct-table denial\\n");

  // Anonymous access is denied independently of authenticated staff, including direct DML.
  await db.unsafe("select set_config('request.jwt.claim.sub','',false)");
  await db.unsafe("select set_config('request.jwt.claims','{}',false)");
  await db.unsafe("set role anon");
  await expectFailure("anon cannot directly SELECT invitation storage",
    () => db.unsafe("select id from public.customer_activation_invitations"), /permission denied/i);
  await expectFailure("anon cannot directly INSERT invitation rows",
    () => db.unsafe("insert into public.customer_activation_invitations(organization_id,customer_id,invited_email,token_hash,expires_at) values('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','anon@example.test',repeat('b',64),now()+interval '1 hour')"), /permission denied/i);
  await expectFailure("anon cannot directly UPDATE invitation rows",
    () => db.unsafe("update public.customer_activation_invitations set status='revoked'"), /permission denied/i);
  await expectFailure("anon cannot directly DELETE invitation rows",
    () => db.unsafe("delete from public.customer_activation_invitations"), /permission denied/i);
  await db.unsafe("reset role");

  const createdAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='customer_activation_invitation' and entity_id=any($2::uuid[])",
    [organizationId, [validInvitation.invitation_id, unconfirmedInvitation.invitation_id, foreignScopeInvitation.invitation_id, staffRejectInvitation.invitation_id, expiredInvitation.invitation_id, revokedInvitation.invitation_id, supersededInvitation.invitation_id, replacementInvitation.invitation_id]],
  );
  assert.ok(createdAudit.filter(row => row.action === "customer_activation_invitation.created").length >= 5,
    "creation of each invitation is audited");

  await setIdentity(activationAuthId, "activation-client@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("activation rejects an incorrect bearer token",
    () => db.unsafe("select public.accept_customer_activation_invitation($1::text)", ["c".repeat(64)]),
    /رابط التفعيل غير موجود|42501|expired|used/i);
  const activationAccepted = await db.unsafe("select public.accept_customer_activation_invitation($1::text) as result", [validInvitation.token]);
  assert.equal(activationAccepted[0].result.status, "active");
  assert.equal(activationAccepted[0].result.customer_id, activationCustomer);
  await expectFailure("activation bearer token cannot be replayed",
    () => db.unsafe("select public.accept_customer_activation_invitation($1::text)", [validInvitation.token]),
    /رابط التفعيل غير موجود|42501|expired|used/i);
  await expectFailure("revoked activation invitation cannot be accepted",
    () => db.unsafe("select public.accept_customer_activation_invitation($1::text)", [revokedInvitation.token]),
    /رابط التفعيل غير موجود|42501|expired|used/i);
  await db.unsafe("reset role");
  const linkedAfterAcceptance = await db.unsafe("select profile_id from public.customers where id=$1", [activationCustomer]);
  assert.equal(linkedAfterAcceptance[0].profile_id, activationProfileId, "successful acceptance links the target customer once");
  const acceptedState = await db.unsafe("select status,accepted_by_profile_id from public.customer_activation_invitations where id=$1", [validInvitation.invitation_id]);
  assert.equal(acceptedState[0].status, "accepted");
  assert.equal(acceptedState[0].accepted_by_profile_id, activationProfileId);

  await setIdentity(unconfirmedAuthId, "unconfirmed-client@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("unconfirmed Auth user row cannot accept an invitation regardless of JWT email",
    () => db.unsafe("select public.accept_customer_activation_invitation($1::text)", [unconfirmedInvitation.token]),
    /أكّد البريد الإلكتروني|42501/i);
  await db.unsafe("reset role");

  await setIdentity(mismatchAuthId, "unconfirmed-client@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("verified Auth email mismatch is rejected",
    () => db.unsafe("select public.accept_customer_activation_invitation($1::text)", [unconfirmedInvitation.token]),
    /بالبريد الإلكتروني المسجل في الدعوة|بريد الجلسة|42501/i);
  await db.unsafe("reset role");

  await setIdentity(foreignAuthUserId, "foreign-ci-profile@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("customer from another organization cannot accept tenant-scoped invitation",
    () => db.unsafe("select public.accept_customer_activation_invitation($1::text)", [foreignScopeInvitation.token]),
    /لا تخص مؤسسة|42501/i);
  await db.unsafe("reset role");

  await setIdentity(expiredAuthId, "expired-client@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure("expired invitation token is rejected",
    () => db.unsafe("select public.accept_customer_activation_invitation($1::text)", [expiredInvitation.token]),
    /غير موجود أو منتهي أو مستخدم|42501/i);
  await db.unsafe("reset role");

  const activationAudit = await db.unsafe(
    "select action from public.audit_logs where organization_id=$1 and entity_type='customer_activation_invitation' and entity_id=$2",
    [organizationId, validInvitation.invitation_id],
  );
  assert.ok(activationAudit.some(row => row.action === "customer_activation_invitation.created"));
  assert.ok(activationAudit.some(row => row.action === "customer_activation_invitation.accepted"));
  const revokeAudit = await db.unsafe("select action from public.audit_logs where organization_id=$1 and entity_type='customer_activation_invitation' and entity_id=$2", [organizationId, revokedInvitation.invitation_id]);
  assert.ok(revokeAudit.some(row => row.action === "customer_activation_invitation.revoked"), "revocation is audited");
  process.stdout.write("PASS customer activation invitations: auth.users confirmation/email, tenant and role guards, SHA-256-only token storage, pgcrypto-in-extensions, one-use/replay, expiry/revoke and audit trail\\n");
  // Restore the isolated test database's extension placement before subsequent acceptance modules.
  await db.unsafe("reset role");
  if (pgcryptoSchemaBeforeActivation !== "extensions") {
    const safeSchema = '"' + pgcryptoSchemaBeforeActivation.replace(/"/g, '""') + '"';
    await db.unsafe(`alter extension pgcrypto set schema ${safeSchema}`);
  }

  // SRC-011 / ORDER-INPUT-0011: test every adversarial customer/staff payload against isolated PostgreSQL fixtures.
  // Separate sessions ensure JWT role state cannot leak across actors.
  const orderInputRoot = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const orderInputAdmin = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const orderInputCustomer = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    await runOrderInputHardeningAcceptance({
      root: orderInputRoot,
      admin: orderInputAdmin,
      customer: orderInputCustomer,
      org: organizationId,
      adminAuth: staffAuthUserId,
      customerAuth: authUserId,
      foreignProduct: otherProductId,
    });
  } finally {
    await Promise.all([
      orderInputRoot.end({ timeout: 5 }).catch(() => undefined),
      orderInputAdmin.end({ timeout: 5 }).catch(() => undefined),
      orderInputCustomer.end({ timeout: 5 }).catch(() => undefined),
    ]);
  }

  await runSessionManagementAcceptance({ db, setIdentity, expectFailure });
  // PostgreSQL 17 suite covers staff-denied posting/void/reversal and complete before/after snapshots.
  await runGeneralLedgerReversalAcceptance({
    db,
    setIdentity,
    expectFailure,
    connectionString,
    organizationId,
    otherOrganizationId,
    staffAuthUserId,
    operationsStaffAuthUserId,
    customerAuthUserId: authUserId,
    foreignAuthUserId,
    foreignProfileId,
  });
  // Distinct invitation rows accepted concurrently by one profile must still produce
  // a single active company membership. The helper uses two real PostgreSQL sessions.
  await runCustomerCompanyInvitationRaceAcceptance({ db, connectionString, organizationId });

  process.stdout.write("PASS: migrations applied, tier pricing, checkout idempotency, tenant isolation, quotations, reorder, invoices/payments, stock/pricing rules, outbox and AI gateway semantics.\n");
}

try {
  await main();
} catch (cause) {
  const error = cause && typeof cause === "object" ? cause : { message: String(cause) };
  const diagnostic = Object.fromEntries(
    ["name", "message", "code", "severity", "detail", "hint", "position", "where", "schema", "table", "column", "constraint", "file", "line", "routine", "actual", "expected", "operator", "stack"]
      .filter((key) => key in error)
      .map((key) => [key, error[key]]),
  );
  process.stderr.write("DATABASE_ACCEPTANCE_FAILED " + JSON.stringify(diagnostic) + "\\n");
  throw cause;
} finally {
  await db.end({ timeout: 5 });
}
