import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import postgres from "postgres";
import { validateP1DeviceSessionEndpoints } from "./lib/p1-device-session-endpoints.mjs";

const apiUrl = requiredEnv("SUPABASE_URL");
const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const connectionString = requiredEnv("TEST_DATABASE_URL");
const githubEnv = requiredEnv("GITHUB_ENV");
const targetEmail = requiredEnv("E2E_MANAGER_EMAIL");
const targetPassword = requiredEnv("E2E_MANAGER_PASSWORD");

const api = validateP1DeviceSessionEndpoints(apiUrl, connectionString);
const organizationId = "a0000000-0000-0000-0000-000000000001";
const runKey = (process.env.GITHUB_RUN_ID || "local") + "-" + randomUUID().slice(0, 8);
const adminEmail = "p1.local.devices.admin." + runKey + "@example.test";
const adminPassword = randomUUID().replaceAll("-", "") + "Aa1!";
const adminName = "P1 Device Session Admin";

if (!targetEmail.startsWith("p2.local.e2e.manager.") || !targetEmail.endsWith("@example.test")) {
  throw new Error("The device-session target must be the isolated P2 local E2E manager, never an arbitrary or hosted account.");
}

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
    throw new Error("Local Supabase Auth could not create the isolated P1 device-session administrator (HTTP " + response.status + ").");
  }
  return body.id;
}

async function main() {
  for (const value of [
    apiUrl, publishableKey, serviceRoleKey, connectionString, adminEmail, adminPassword,
    targetEmail, targetPassword,
  ]) {
    process.stdout.write("::add-mask::" + value + String.fromCharCode(10));
  }

  const organization = await db.unsafe(
    "select id from public.organizations where id=$1::uuid and is_active=true",
    [organizationId],
  );
  if (organization.length !== 1) {
    throw new Error("The canonical P2 local E2E organization is missing; refusing to create session fixtures.");
  }
  const target = await db.unsafe(
    "select p.id,p.organization_id from public.profiles p " +
      "join public.user_roles r on r.profile_id=p.id " +
      "where p.email=$1 and p.organization_id=$2::uuid and p.is_active=true and r.role='manager' limit 1",
    [targetEmail, organizationId],
  );
  if (target.length !== 1) {
    throw new Error("The P2 manager target is not an active same-organization profile; refusing cross-tenant session fixtures.");
  }

  const adminAuthUserId = await createConfirmedUser(adminEmail, adminPassword, adminName);
  const adminProfileId = randomUUID();
  await db.begin(async (tx) => {
    const existing = await tx.unsafe(
      "select id from public.profiles where auth_user_id=$1::uuid order by id limit 1",
      [adminAuthUserId],
    );
    if (existing.length) {
      await tx.unsafe(
        "update public.profiles set organization_id=$2::uuid,full_name=$3,email=$4,is_active=true where id=$1::uuid",
        [existing[0].id, organizationId, adminName, adminEmail],
      );
    } else {
      await tx.unsafe(
        "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1::uuid,$2::uuid,$3::uuid,$4,$5,true)",
        [adminProfileId, adminAuthUserId, organizationId, adminName, adminEmail],
      );
    }
    const profile = await tx.unsafe(
      "select id from public.profiles where auth_user_id=$1::uuid and organization_id=$2::uuid and is_active=true",
      [adminAuthUserId, organizationId],
    );
    if (profile.length !== 1) throw new Error("The isolated admin profile was not created in the expected organization.");
    await tx.unsafe(
      "insert into public.user_roles(profile_id,role) values($1::uuid,'admin') on conflict(profile_id,role) do nothing",
      [profile[0].id],
    );
    const adminRole = await tx.unsafe(
      "select role from public.user_roles where profile_id=$1::uuid and role='admin'",
      [profile[0].id],
    );
    if (adminRole.length !== 1) throw new Error("The isolated device-session user is missing the required admin role.");
  });

  await appendFile(githubEnv, [
    "E2E_DEVICE_ADMIN_EMAIL=" + adminEmail,
    "E2E_DEVICE_ADMIN_PASSWORD=" + adminPassword,
    "E2E_DEVICE_TARGET_EMAIL=" + targetEmail,
    "E2E_DEVICE_TARGET_PASSWORD=" + targetPassword,
    "E2E_SUPABASE_URL=" + apiUrl,
    "E2E_SUPABASE_PUBLISHABLE_KEY=" + publishableKey,
    "",
  ].join("\n"));

  process.stdout.write(
    "P1_DEVICE_SESSION_FIXTURES_READY localOnly=true adminRole=true sameTenantManagerTarget=true credentialsMasked=true\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write("P1_DEVICE_SESSION_FIXTURE_FAILED: " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local P1 device-session acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
