import { createClient } from "npm:@supabase/supabase-js@2";

type Runtime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
const runtime = (globalThis as unknown as { Deno?: Runtime }).Deno;
if (!runtime) throw new Error("async export download requires Supabase Edge Runtime.");
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, x-client-info, content-type",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
function reply(value: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: CORS });
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

if (runtime) runtime.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = runtime.env.get("SUPABASE_URL");
  const anonKey = runtime.env.get("SUPABASE_ANON_KEY") ?? runtime.env.get("SUPABASE_ANON_KEY");
  const serviceKey = runtime.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!url || !anonKey || !serviceKey) return reply({ error: "download_not_configured" }, 503);
  if (!token) return reply({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: "request_too_large" }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: "invalid_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some((key) => key !== "job_id")
      || !isUuid((body as Record<string, unknown>).job_id)) {
    return reply({ error: "invalid_request" }, 400);
  }

  const user = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: authData, error: authError } = await user.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "unauthorized" }, 401);
  const { data: jobData, error: jobError } = await user.rpc("get_my_async_export_download", {
    p_job_id: (body as Record<string, unknown>).job_id as string,
  });
  if (jobError || !jobData || typeof jobData !== "object") return reply({ error: "export_not_ready_or_expired" }, 404);
  const job = jobData as Record<string, unknown>;
  if (typeof job.artifact_path !== "string" || job.content_type !== "text/csv"
      || typeof job.file_name !== "string" || typeof job.expires_at !== "string") {
    return reply({ error: "export_not_ready_or_expired" }, 404);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signed, error: signedError } = await admin.storage
    .from("async-export-artifacts")
    .createSignedUrl(job.artifact_path, 60, { download: job.file_name });
  if (signedError || !signed?.signedUrl) return reply({ error: "download_link_creation_failed" }, 500);
  const expiresAt = new Date(Math.min(Date.now() + 60000, Date.parse(job.expires_at))).toISOString();
  return reply({
    job_id: job.job_id,
    download_url: signed.signedUrl,
    file_name: job.file_name,
    expires_at: expiresAt,
    ttl_seconds: 60,
  });
});
