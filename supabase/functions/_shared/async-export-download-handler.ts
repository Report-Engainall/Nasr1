import { readBoundedTextBody } from "./bounded-body.ts";

export interface AsyncExportDownloadUserClient {
  auth: {
    getUser(token: string): Promise<{ data: { user: unknown | null }; error: unknown | null }>;
  };
  getMyAsyncExportDownload(jobId: string): Promise<{ data: unknown; error: unknown | null }>;
}

export interface AsyncExportDownloadAdminClient {
  createSignedUrl(
    artifactPath: string,
    expiresInSeconds: number,
    fileName: string,
  ): Promise<{ data: { signedUrl?: string } | null; error: unknown | null }>;
}

export interface AsyncExportDownloadDependencies {
  getEnv(name: string): string | undefined;
  createUserClient(url: string, anonKey: string, token: string): AsyncExportDownloadUserClient;
  createAdminClient(url: string, serviceKey: string): AsyncExportDownloadAdminClient;
  now?: () => number;
}

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
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isOrdersArtifactPath(value: string, jobId: string): boolean {
  const parts = value.split("/");
  return parts.length === 3
    && isUuid(parts[0])
    && parts[1].toLowerCase() === jobId.toLowerCase()
    && parts[2] === "orders.csv";
}

/**
 * The Edge Runtime wrapper injects its environment and Supabase clients so the
 * HTTP boundary can be acceptance-tested without production credentials.
 */
export function createAsyncExportDownloadHandler(deps: AsyncExportDownloadDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

    const url = deps.getEnv("SUPABASE_URL");
    const anonKey = deps.getEnv("SUPABASE_ANON_KEY");
    const serviceKey = deps.getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return reply({ error: "download_not_configured" }, 503);

    const authorization = request.headers.get("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    if (!token) return reply({ error: "unauthorized" }, 401);

    const requestJob = await readRequestedJobId(request);
    if ("response" in requestJob) return requestJob.response;
    const jobId = requestJob.jobId;

    try {
      const user = deps.createUserClient(url, anonKey, token);
      const { data: authData, error: authError } = await user.auth.getUser(token);
      if (authError || !authData.user) return reply({ error: "unauthorized" }, 401);

      const { data: jobData, error: jobError } = await user.getMyAsyncExportDownload(jobId);
      if (jobError || !isValidDownloadJob(jobData, jobId)) {
        return reply({ error: "export_not_ready_or_expired" }, 404);
      }
      const job = jobData;

      const signingStartedMs = (deps.now ?? Date.now)();
      const jobExpiryMs = Date.parse(job.expires_at);
      if (!Number.isFinite(jobExpiryMs) || jobExpiryMs <= signingStartedMs) {
        return reply({ error: "export_not_ready_or_expired" }, 404);
      }
      // Leave a one-second transit margin, then verify the remaining job lifetime
      // after signing so a slow Storage response cannot return an overlong link.
      const ttlSeconds = Math.min(60, Math.floor((jobExpiryMs - signingStartedMs - 1000) / 1000));
      if (ttlSeconds < 1) return reply({ error: "export_not_ready_or_expired" }, 404);

      const admin = deps.createAdminClient(url, serviceKey);
      const { data: signed, error: signedError } = await admin.createSignedUrl(
        job.artifact_path,
        ttlSeconds,
        job.file_name,
      );
      if (signedError || !signed?.signedUrl) {
        return reply({ error: "download_link_creation_failed" }, 500);
      }
      const signingFinishedMs = (deps.now ?? Date.now)();
      if (Math.floor((jobExpiryMs - signingFinishedMs) / 1000) < ttlSeconds) {
        return reply({ error: "export_not_ready_or_expired" }, 404);
      }
      const expiresAt = new Date(Math.min(signingStartedMs + ttlSeconds * 1000, jobExpiryMs)).toISOString();
      return reply({
        job_id: job.job_id,
        download_url: signed.signedUrl,
        file_name: job.file_name,
        expires_at: expiresAt,
        ttl_seconds: ttlSeconds,
      });
    } catch {
      return reply({ error: "download_unavailable" }, 503);
    }
  };
}
