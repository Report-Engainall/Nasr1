import { appendFile } from "node:fs/promises";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated local device-session fixtures.");
  return value.replace(/^"(.*)"$/s, "$1");
}

const apiUrl = requiredEnv("SUPABASE_URL");
const connectionString = requiredEnv("TEST_DATABASE_URL");
const githubEnv = requiredEnv("GITHUB_ENV");
const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL");
const adminPassword = requiredEnv("E2E_DEVICE_ADMIN_PASSWORD");
const targetEmail = requiredEnv("E2E_DEVICE_TARGET_EMAIL");
const targetPassword = requiredEnv("E2E_DEVICE_TARGET_PASSWORD");

const api = new URL(apiUrl);
const database = new URL(connectionString);
const validDbPort = /^[1-9][0-9]{0,4}$/.test(database.port) && Number(database.port) <= 65535;
if (
  api.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(api.hostname) ||
  api.port !== "54321" ||
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !validDbPort ||
  !["postgres:", "postgresql:"].includes(database.protocol)
) {
  throw new Error("Device-session fixtures are restricted to isolated local Supabase and loopback PostgreSQL.");
}

for (const secret of [adminPassword, targetPassword, connectionString]) {
  process.stdout.write("::add-mask::" + secret + String.fromCharCode(10));
}

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });

async function findIdentity(email) {
  const rows = await db.unsafe(
    "select p.id as profile_id, p.organization_id, p.is_active, u.email_confirmed_at, " +
    "coalesce(array_agg(distinct r.role::text) filter (where r.role is not null), array[]::text[]) as roles " +
    "from auth.users u join public.profiles p on p.auth_user_id=u.id " +
    "left join public.user_roles r on r.profile_id=p.id " +
    "where lower(u.email)=lower($1) group by p.id,p.organization_id,p.is_active,u.email_confirmed_at",
    [email],
  );
  if (rows.length !== 1) {
    throw new Error("Expected exactly one Auth-linked profile for a local device-session fixture identity.");
  }
  const row = rows[0];
  if (!row.is_active || !row.email_confirmed_at || !row.organization_id) {
    throw new Error("Device-session fixture identity must be active, email-confirmed and organization-scoped.");
  }
  return row;
}

async function main() {
  const [admin, target] = await Promise.all([
    findIdentity(adminEmail),
    findIdentity(targetEmail),
  ]);
  if (!admin.roles.includes("admin")) throw new Error("The device-session controller fixture must have the admin role.");
  if (!target.roles.includes("manager")) throw new Error("The revocation target fixture must be an organization manager.");
  if (admin.organization_id !== target.organization_id || admin.profile_id === target.profile_id) {
    throw new Error("The administrator and target must be distinct profiles in the same local organization.");
  }

  await appendFile(githubEnv, "E2E_DEVICE_FIXTURE_VERIFIED=true\n");
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    await appendFile(summary, [
      "## Central device-session fixture verification",
      "",
      "- Distinct, email-confirmed Auth identities are linked to active profiles in the same isolated local organization.",
      "- Controller has the admin role; revocation target has the manager role.",
      "- Browser acceptance creates independent real Auth sessions and tests server-side immediate revocation.",
      "- The fixture refuses hosted Supabase endpoints and non-loopback database URLs.",
      "",
    ].join("\n"));
  }
  process.stdout.write("DEVICE_SESSION_FIXTURES_VERIFIED distinctProfiles=true sameTenant=true adminController=true managerTarget=true localOnly=true\n");
}

main()
  .catch((error) => {
    process.stderr.write("DEVICE_SESSION_FIXTURE_FAILED: " + String(error?.message ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });
