import { createClient } from "npm:@supabase/supabase-js@2";
import { readBoundedTextBody } from "../_shared/bounded-body.ts";

type Runtime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function reply(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Fixed-length digest comparison prevents the supplied bootstrap secret becoming a timing oracle. */
async function secretsMatch(expected: string, supplied: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const expectedDigest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  );
  const suppliedDigest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  );
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= expectedDigest[index] ^ suppliedDigest[index];
  }
  return difference === 0;
}

const runtime = (globalThis as unknown as { Deno?: Runtime }).Deno;
if (!runtime) throw new Error("Supabase Edge Runtime required.");

const CANONICAL_URL = "https://tfdwtuwkdddnzgyhcoyy.supabase.co";

runtime.serve(async (request) => {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const bootstrapSecret = runtime.env.get("NASR1_BOOTSTRAP_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-nasr1-bootstrap-secret") ?? "";
  if (bootstrapSecret.length < 32) return reply({ error: "bootstrap_not_configured" }, 503);
  if (!await secretsMatch(bootstrapSecret, suppliedSecret)) {
    return reply({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = runtime.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = runtime.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (supabaseUrl !== CANONICAL_URL || !serviceRoleKey) {
    return reply({ error: "canonical_database_not_configured" }, 503);
  }

  const bodyRead = await readBoundedTextBody(
    request.body,
    4096,
    request.headers.get("content-length"),
  );
  if (!bodyRead.ok) {
    return reply({
      error: bodyRead.reason === "too_large" ? "request_too_large" : "invalid_request_body",
    }, bodyRead.reason === "too_large" ? 413 : 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyRead.text);
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }
  if (!isRecord(parsed) ||
      Object.keys(parsed).some((key) => key !== "email" && key !== "full_name")) {
    return reply({ error: "invalid_request" }, 400);
  }

  const email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
  const fullName = typeof parsed.full_name === "string" ? parsed.full_name.trim() : "";
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    fullName.length < 2 ||
    fullName.length > 160 ||
    /[\u0000-\u001f\u007f]/.test(fullName)
  ) {
    return reply({ error: "invalid_administrator_details" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Cheap preflight prevents sending an invitation when the tenant is not ready.
  // The database RPC repeats these checks under an advisory transaction lock.
  const [organizationsResult, adminRolesResult, existingProfileResult] = await Promise.all([
    admin.from("organizations").select("id").eq("is_active", true).limit(2),
    admin.from("user_roles").select("profile_id").eq("role", "admin").limit(1),
    admin.from("profiles").select("id").ilike("email", email).limit(1),
  ]);
  if (organizationsResult.error || adminRolesResult.error || existingProfileResult.error) {
    return reply({ error: "bootstrap_preflight_failed" }, 503);
  }
  if ((organizationsResult.data ?? []).length !== 1) {
    return reply({ error: "exactly_one_active_organization_required" }, 409);
  }
  if ((adminRolesResult.data ?? []).length > 0) {
    return reply({ error: "first_administrator_already_provisioned" }, 409);
  }
  if ((existingProfileResult.data ?? []).length > 0) {
    return reply({ error: "administrator_profile_already_exists" }, 409);
  }

  const { data: invitation, error: invitationError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });

  const authUserId = invitation?.user?.id;
  if (invitationError || !authUserId) {
    // Do not echo the provider error: it can contain the owner's email or SMTP details.
    console.error("[bootstrap-first-admin] invitation failed", {
      status: invitationError?.status ?? "unknown",
      name: invitationError?.name ?? "unknown",
    });
    return reply({ error: "administrator_invitation_failed_check_auth_email_delivery" }, 502);
  }

  const { data: provisioned, error: provisionError } = await admin.rpc(
    "bootstrap_first_admin_profile",
    {
      p_auth_user_id: authUserId,
      p_email: email,
      p_full_name: fullName,
    },
  );

  if (provisionError || !isRecord(provisioned) || provisioned.status !== "created") {
    // The RPC is transactional. Check whether a timed-out response nevertheless committed
    // before compensating, so a valid first-admin profile is never left pointing at a deleted UID.
    const { data: existingProfile } = await admin.from("profiles")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (existingProfile?.id) {
      const { data: adminRole } = await admin.from("user_roles")
        .select("profile_id")
        .eq("profile_id", existingProfile.id)
        .eq("role", "admin")
        .maybeSingle();
      if (adminRole) {
        return reply({ ok: true, invitation_sent: true, status: "provisioned" });
      }
    }

    const { error: cleanupError } = await admin.auth.admin.deleteUser(authUserId);
    if (cleanupError) {
      console.error("[bootstrap-first-admin] unprivileged invite cleanup failed", {
        status: cleanupError.status ?? "unknown",
        name: cleanupError.name ?? "unknown",
      });
      return reply({ error: "bootstrap_failed_unprivileged_auth_user_cleanup_required" }, 500);
    }

    console.error("[bootstrap-first-admin] profile provisioning failed", {
      code: provisionError?.code ?? "unknown",
    });
    return reply({ error: "administrator_profile_provisioning_failed_invitation_revoked" }, 500);
  }

  return reply({
    ok: true,
    invitation_sent: true,
    status: "provisioned",
    next_step: "Accept the invitation, sign in, and verify the admin tenant context.",
  });
});
