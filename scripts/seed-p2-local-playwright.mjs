import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import postgres from "postgres";

const apiUrl = requiredEnv("SUPABASE_URL");
const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const connectionString = requiredEnv("TEST_DATABASE_URL");
const githubEnv = requiredEnv("GITHUB_ENV");

// This fixture is deliberately constrained to the stock local Supabase ports.
// It must never create test identities or inventory against a hosted/production project.
const api = new URL(apiUrl);
const database = new URL(connectionString);
if (
  api.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(api.hostname) ||
  api.port !== "54321" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.port !== "54322"
) {
  throw new Error("P2 browser fixtures may only run against local Supabase at 127.0.0.1:54321 and PostgreSQL 54322.");
}

const organizationId = "a0000000-0000-0000-0000-000000000001";
const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
const productId = "a1000000-0000-0000-0000-000000000001";
const preferredWarehouseId = "d0000000-0000-0000-0000-000000000001";
const runKey = (process.env.GITHUB_RUN_ID || "local") + "-" + randomUUID().slice(0, 8);
const passwordA = randomUUID().replaceAll("-", "") + "Aa1!";
const passwordB = randomUUID().replaceAll("-", "") + "Bb2!";
const emailA = "p2.local.e2e.a." + runKey + "@example.test";
const emailB = "p2.local.e2e.b." + runKey + "@example.test";

const db = postgres(connectionString, { max: 2, prepare: false, idle_timeout: 5 });

async function createConfirmedUser(email, password, fullName) {
  const response = await fetch(new URL("/auth/v1/admin/users", api), {
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
  if (!response.ok || !body || typeof body.id !== "string") {
    throw new Error("Local Supabase Auth could not create a confirmed E2E user (HTTP " + response.status + ").");
  }
  return body.id;
}

async function main() {
  const userAId = await createConfirmedUser(emailA, passwordA, "P2 Local E2E Customer A");
  const userBId = await createConfirmedUser(emailB, passwordB, "P2 Local E2E Customer B");
  const profileAId = randomUUID();
  const profileBId = randomUUID();
  const suffix = runKey.replaceAll("-", "").slice(-12);

  await db.begin(async (tx) => {
    const tenant = await tx.unsafe(
      "select id from public.organizations where id=$1::uuid and is_active=true",
      [organizationId],
    );
    if (tenant.length !== 1) {
      throw new Error("Expected the canonical seeded storefront organization to exist and be active after local migrations.");
    }

    await tx.unsafe(
      "insert into public.organizations(id,name,currency) values($1::uuid,'P2 Local E2E Foreign Organization','YER') " +
      "on conflict(id) do update set name=excluded.name,currency=excluded.currency,is_active=true",
      [foreignOrganizationId],
    );

    await tx.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1::uuid,$2::uuid,$3::uuid,$4,$5,true),($6::uuid,$7::uuid,$8::uuid,$9,$10,true)",
      [
        profileAId, userAId, organizationId, "P2 Local E2E Customer A", emailA,
        profileBId, userBId, foreignOrganizationId, "P2 Local E2E Customer B", emailB,
      ],
    );
    await tx.unsafe(
      "insert into public.user_roles(profile_id,role) values($1::uuid,'customer'),($2::uuid,'customer') " +
      "on conflict(profile_id,role) do nothing",
      [profileAId, profileBId],
    );
    await tx.unsafe(
      "insert into public.customers(" +
      "organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,credit_limit,current_balance,status,approved_at" +
      ") values " +
      "($1::uuid,$2::uuid,$3,$4,$5,$6,$7,'wholesale',0,0,'approved',pg_catalog.now())," +
      "($8::uuid,$9::uuid,$10,$11,$12,$13,$14,'retail',0,0,'approved',pg_catalog.now())",
      [
        organizationId, profileAId, "P2E2EA" + suffix, "P2 Local E2E Customer A", "P2 Local E2E Customer A",
        "771234567", emailA,
        foreignOrganizationId, profileBId, "P2E2EB" + suffix, "P2 Local E2E Customer B", "P2 Local E2E Customer B",
        "771234568", emailB,
      ],
    );

    const product = await tx.unsafe(
      "select id from public.products where id=$1::uuid and organization_id=$2::uuid and status='active'",
      [productId, organizationId],
    );
    if (product.length !== 1) {
      throw new Error("The canonical local test product is missing or inactive; refusing to fabricate catalog/pricing records.");
    }

    const warehouses = await tx.unsafe(
      "select id from public.warehouses where organization_id=$1::uuid and is_active=true " +
      "order by (id=$2::uuid) desc,id limit 1",
      [organizationId, preferredWarehouseId],
    );
    if (warehouses.length !== 1) {
      throw new Error("The canonical storefront organization needs an active warehouse for the local E2E test.");
    }
    await tx.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point) " +
      "values($1::uuid,$2::uuid,100,0,0) " +
      "on conflict(product_id,warehouse_id) do update set quantity_on_hand=100,quantity_reserved=0,reorder_point=0",
      [productId, warehouses[0].id],
    );

    await tx.unsafe(
      "insert into public.admin_settings(organization_id,key,value,category) values " +
      "($1::uuid,'store_name',pg_catalog.to_jsonb('P2 Local E2E Store'::text),'storefront')," +
      "($1::uuid,'hero_title',pg_catalog.to_jsonb('P2 Local E2E'::text),'storefront') " +
      "on conflict(organization_id,key) do update set value=excluded.value,category=excluded.category",
      [organizationId],
    );
  });

  const configuredTenant = await db.unsafe("select public.public_storefront_organization_id() as id");
  if (configuredTenant[0]?.id !== organizationId) {
    throw new Error("Local Storefront tenant does not resolve to the canonical test organization; refusing cross-tenant test setup.");
  }

  await appendFile(githubEnv, [
    "E2E_EMAIL=" + emailA,
    "E2E_PASSWORD=" + passwordA,
    "E2E_EMAIL_B=" + emailB,
    "E2E_PASSWORD_B=" + passwordB,
    "E2E_PHONE=771234567",
    "E2E_SUPABASE_URL=" + apiUrl,
    "E2E_SUPABASE_PUBLISHABLE_KEY=" + publishableKey,
    "E2E_ALLOW_TEST_WRITES=YES_I_CONFIRM_NON_PRODUCTION",
    "",
  ].join("\n"));

  process.stdout.write(
    "P2_LOCAL_E2E_FIXTURES_READY organizationA=" + organizationId +
    " organizationB=" + foreignOrganizationId +
    " confirmedUsers=2 catalogProduct=" + productId +
    " stock=100 localOnly=true\n",
  );
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local P2 browser acceptance.");
  return value;
}

main()
  .catch((error) => {
    process.stderr.write("P2_LOCAL_E2E_FIXTURE_FAILED: " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });
