import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAsyncExportDownloadHandler,
  type AsyncExportDownloadAdminClient,
  type AsyncExportDownloadUserClient,
} from "../../supabase/functions/_shared/async-export-download-handler.ts";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  authGetUser: vi.fn(),
  getMyDownload: vi.fn(),
  createSignedUrl: vi.fn(),
  createUserClient: vi.fn(),
  createAdminClient: vi.fn(),
  now: vi.fn(),
}));

const nowMs = Date.parse("2026-10-24T10:00:00.000Z");
const jobId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const jobPath = `${organizationId}/${jobId}/orders.csv`;
const job = {
  job_id: jobId,
  artifact_path: jobPath,
  content_type: "text/csv",
  file_name: "orders.csv",
  expires_at: new Date(nowMs + 120_000).toISOString(),
};
const signedUrl = "https://storage.example.test/signed/orders.csv?token=secret";

function makeHandler() {
  const userClient: AsyncExportDownloadUserClient = {
    auth: { getUser: mocks.authGetUser },
    getMyAsyncExportDownload: mocks.getMyDownload,
  };
  const adminClient: AsyncExportDownloadAdminClient = {
    createSignedUrl: mocks.createSignedUrl,
  };
  return createAsyncExportDownloadHandler({
    getEnv: (name) => mocks.env[name],
    createUserClient: (...args) => {
      mocks.createUserClient(...args);
      return userClient;
    },
    createAdminClient: (...args) => {
      mocks.createAdminClient(...args);
      return adminClient;
    },
    now: () => mocks.now(),
  });
}

const handler = makeHandler();

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("https://store.example.test/functions/v1/async-export-download", {
    method: "POST",
    headers: {
      authorization: "Bearer test-access-token",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("async export download HTTP handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env = {
      SUPABASE_URL: "https://project.example.test",
      SUPABASE_ANON_KEY: "anon-test-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
    };
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "auth-user" } }, error: null });
    mocks.getMyDownload.mockResolvedValue({ data: job, error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl }, error: null });
    mocks.now.mockReturnValue(nowMs);
  });

  it("answers preflight without configuration or authentication and rejects other HTTP methods", async () => {
    mocks.env = {};
    const preflight = await handler(new Request("https://store.example.test/functions/v1/async-export-download", { method: "OPTIONS" }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("cache-control")).toBe("no-store");
    const get = await handler(new Request("https://store.example.test/functions/v1/async-export-download", { method: "GET" }));
    expect(get.status).toBe(405);
  });

  it("fails closed for missing configuration, missing bearer token and invalid auth", async () => {
    mocks.env.SUPABASE_SERVICE_ROLE_KEY = undefined;
    expect((await handler(post(JSON.stringify({ job_id: jobId })))).status).toBe(503);
    mocks.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
    expect((await handler(post(JSON.stringify({ job_id: jobId }), { authorization: "" }))).status).toBe(401);

    mocks.authGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("invalid token") });
    const invalidAuth = await handler(post(JSON.stringify({ job_id: jobId })));
    expect(invalidAuth.status).toBe(401);
    expect(mocks.getMyDownload).not.toHaveBeenCalled();
  });

  it("rejects oversize, malformed, extra-field and malformed-ID request bodies before touching the client", async () => {
    expect((await handler(post("x".repeat(2049)))).status).toBe(413);
    expect((await handler(post("{"))).status).toBe(400);
    expect((await handler(post(JSON.stringify({ job_id: jobId, organization_id: organizationId })))).status).toBe(400);
    expect((await handler(post(JSON.stringify({ job_id: "not-a-uuid" })))).status).toBe(400);
    expect(mocks.createUserClient).not.toHaveBeenCalled();
  });

  it("hides missing, unauthorized or not-ready jobs behind a not-found response", async () => {
    mocks.getMyDownload.mockResolvedValueOnce({ data: null, error: null });
    expect((await handler(post(JSON.stringify({ job_id: jobId })))).status).toBe(404);
    mocks.getMyDownload.mockResolvedValueOnce({ data: null, error: new Error("permission denied") });
    expect((await handler(post(JSON.stringify({ job_id: jobId })))).status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...job, job_id: "33333333-3333-4333-8333-333333333333" }, "mismatched job ID"],
    [{ ...job, artifact_path: `${organizationId}/../private.csv` }, "path traversal or unexpected artifact layout"],
    [{ ...job, artifact_path: `${organizationId}/${jobId}/another.csv` }, "unexpected artifact name"],
    [{ ...job, content_type: "application/json" }, "unexpected content type"],
    [{ ...job, file_name: "../private.csv" }, "unsafe filename"],
    [{ ...job, expires_at: "not-a-date" }, "invalid expiry"],
    [{ ...job, expires_at: new Date(nowMs - 1000).toISOString() }, "expired job"],
    [{ ...job, expires_at: new Date(nowMs + 500).toISOString() }, "less than one second remaining"],
  ])("never signs a malformed or expired artifact (%s)", async (badJob) => {
    mocks.getMyDownload.mockResolvedValueOnce({ data: badJob, error: null });
    const response = await handler(post(JSON.stringify({ job_id: jobId })));
    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("requests a private signed URL and never lets it outlive the job expiry", async () => {
    mocks.getMyDownload.mockResolvedValueOnce({
      data: { ...job, expires_at: new Date(nowMs + 35_000).toISOString() }, error: null,
    });
    const response = await handler(post(JSON.stringify({ job_id: jobId })));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(mocks.createUserClient).toHaveBeenCalledWith(
      "https://project.example.test", "anon-test-key", "test-access-token",
    );
    expect(mocks.getMyDownload).toHaveBeenCalledWith(jobId);
    expect(mocks.createAdminClient).toHaveBeenCalledWith("https://project.example.test", "service-test-key");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(jobPath, 34, "orders.csv");
    expect(await json(response)).toEqual({
      job_id: jobId,
      download_url: signedUrl,
      file_name: "orders.csv",
      expires_at: new Date(nowMs + 34_000).toISOString(),
      ttl_seconds: 34,
    });
  });

  it("caps signed URLs at 60 seconds for longer-lived jobs and handles storage failure safely", async () => {
    const response = await handler(post(JSON.stringify({ job_id: jobId })));
    expect(response.status).toBe(200);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(jobPath, 60, "orders.csv");
    expect((await json(response)).ttl_seconds).toBe(60);

    mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("storage failure") });
    const failed = await handler(post(JSON.stringify({ job_id: jobId })));
    expect(failed.status).toBe(500);
    expect(await json(failed)).toEqual({ error: "download_link_creation_failed" });
  });

  it("withholds a signed URL when Storage signing latency leaves less than its advertised TTL", async () => {
    mocks.getMyDownload.mockResolvedValueOnce({
      data: { ...job, expires_at: new Date(nowMs + 35_000).toISOString() },
      error: null,
    });
    // The first clock read chooses a 34-second TTL; Storage returns only after
    // that URL would exceed the export's remaining lifetime.
    mocks.now.mockReturnValueOnce(nowMs).mockReturnValueOnce(nowMs + 34_500);

    const response = await handler(post(JSON.stringify({ job_id: jobId })));

    expect(mocks.createSignedUrl).toHaveBeenCalledWith(jobPath, 34, "orders.csv");
    expect(response.status).toBe(404);
    const body = await json(response);
    expect(body).toEqual({ error: "export_not_ready_or_expired" });
    expect(JSON.stringify(body)).not.toContain("token=secret");
  });

  it("returns a generic unavailable response if the auth or storage client unexpectedly throws", async () => {
    mocks.authGetUser.mockRejectedValueOnce(new Error("upstream detail must not leak"));
    const authFailure = await handler(post(JSON.stringify({ job_id: jobId })));
    expect(authFailure.status).toBe(503);
    expect(await json(authFailure)).toEqual({ error: "download_unavailable" });
    expect(JSON.stringify(await json(await handler(post(JSON.stringify({ job_id: jobId })))))).not.toContain("service-test-key");
  });
});
