import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProductImageUploadHandler,
  PRODUCT_IMAGE_BUCKET,
  type ProductImageUploadDependencies,
} from "../../supabase/functions/_shared/product-image-upload-handler.ts";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "a0000000-0000-0000-0000-000000000001";
const PRODUCT_ID = "a1000000-0000-0000-0000-000000000001";
const OBJECT_ID = "b1000000-0000-4000-8000-000000000001";
const URL = "https://example.test/functions/v1/product-image-upload";
const OBJECT_PATH = `${ORGANIZATION_ID}/${PRODUCT_ID}/${OBJECT_ID}.webp`;

function validWebp(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([4, 0, 0, 0], 4);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
}

function makeHarness() {
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: "https://project.example.test",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  };

  const authClient = {
    auth: {
      getUser: vi.fn(async (_token: string) => ({
        data: { user: { id: AUTH_USER_ID } as { id: string } | null },
        error: null as unknown | null,
      })),
    },
  };

  const adminClient = {
    getProfileByAuthUserId: vi.fn(async (_authUserId: string) => ({
      data: { id: PROFILE_ID, organization_id: ORGANIZATION_ID, is_active: true } as {
        id: string; organization_id: string; is_active: boolean;
      } | null,
      error: null as unknown | null,
    })),
    getRoles: vi.fn(async (_profileId: string) => ({
      data: [{ role: "manager" as unknown }],
      error: null as unknown | null,
    })),
    productExists: vi.fn(async (_productId: string, _organizationId: string) => ({
      data: { id: PRODUCT_ID } as { id: string } | null,
      error: null as unknown | null,
    })),
    storage: {
      upload: vi.fn(async (
        _objectPath: string,
        _bytes: Uint8Array,
        _options: { contentType: "image/webp"; cacheControl: string; upsert: false },
      ) => ({ error: null as unknown | null })),
      remove: vi.fn(async (_paths: string[]) => ({ error: null as unknown | null })),
      getPublicUrl: vi.fn((objectPath: string) => ({
        data: { publicUrl: "https://cdn.example.test/" + objectPath },
      })),
    },
  };

  const deps: ProductImageUploadDependencies = {
    getEnv: vi.fn((name: string) => env[name]),
    createAuthClient: vi.fn((_url: string, _anonKey: string) => authClient),
    createAdminClient: vi.fn((_url: string, _serviceKey: string) => adminClient),
    randomUUID: vi.fn(() => OBJECT_ID),
  };

  return {
    env,
    authClient,
    adminClient,
    deps,
    handler: createProductImageUploadHandler(deps),
  };
}

function uploadRequest(body: BodyInit = validWebp(), headers: Record<string, string> = {}) {
  return new Request(URL, {
    method: "POST",
    headers: {
      authorization: "Bearer valid-test-token",
      "content-type": "image/webp",
      "x-product-id": PRODUCT_ID,
      ...headers,
    },
    body,
  });
}

function deleteRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(URL, {
    method: "POST",
    headers: {
      authorization: "Bearer valid-test-token",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("product-image-upload Edge handler HTTP boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles preflight without reading environment, Auth or storage services", async () => {
    const h = makeHarness();
    const response = await h.handler(new Request(URL, { method: "OPTIONS" }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(h.deps.getEnv).not.toHaveBeenCalled();
    expect(h.deps.createAuthClient).not.toHaveBeenCalled();
    expect(h.deps.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods before creating clients", async () => {
    const h = makeHarness();
    const response = await h.handler(new Request(URL, { method: "GET" }));

    expect(response.status).toBe(405);
    expect(await json(response)).toEqual({ error: "method_not_allowed" });
    expect(h.deps.createAuthClient).not.toHaveBeenCalled();
    expect(h.deps.createAdminClient).not.toHaveBeenCalled();
  });

  it("fails closed when service configuration or bearer authentication is missing", async () => {
    const unconfigured = makeHarness();
    unconfigured.env.SUPABASE_SERVICE_ROLE_KEY = undefined;
    const unavailable = await unconfigured.handler(uploadRequest());
    expect(unavailable.status).toBe(503);
    expect(await json(unavailable)).toEqual({ error: "image_service_not_configured" });
    expect(unconfigured.deps.createAuthClient).not.toHaveBeenCalled();

    const noBearer = makeHarness();
    const unauthorized = await noBearer.handler(new Request(URL, {
      method: "POST",
      headers: { "content-type": "image/webp", "x-product-id": PRODUCT_ID },
      body: validWebp(),
    }));
    expect(unauthorized.status).toBe(401);
    expect(await json(unauthorized)).toEqual({ error: "unauthorized" });
    expect(noBearer.deps.createAuthClient).not.toHaveBeenCalled();
    expect(noBearer.deps.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects invalid Auth sessions without constructing the service-role client", async () => {
    const h = makeHarness();
    h.authClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("bad token"),
    });

    const response = await h.handler(uploadRequest());
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "unauthorized" });
    expect(h.deps.createAdminClient).not.toHaveBeenCalled();
  });

  it("requires a live active profile and an allowed staff role before any product or storage operation", async () => {
    const inactive = makeHarness();
    inactive.adminClient.getProfileByAuthUserId.mockResolvedValueOnce({
      data: { id: PROFILE_ID, organization_id: ORGANIZATION_ID, is_active: false },
      error: null,
    });
    const inactiveResponse = await inactive.handler(uploadRequest());
    expect(inactiveResponse.status).toBe(403);
    expect(await json(inactiveResponse)).toEqual({ error: "active_organization_required" });
    expect(inactive.adminClient.getRoles).not.toHaveBeenCalled();
    expect(inactive.adminClient.productExists).not.toHaveBeenCalled();
    expect(inactive.adminClient.storage.upload).not.toHaveBeenCalled();

    const customer = makeHarness();
    customer.adminClient.getRoles.mockResolvedValueOnce({
      data: [{ role: "customer" }],
      error: null,
    });
    const roleResponse = await customer.handler(uploadRequest());
    expect(roleResponse.status).toBe(403);
    expect(await json(roleResponse)).toEqual({ error: "product_image_permission_required" });
    expect(customer.adminClient.productExists).not.toHaveBeenCalled();
    expect(customer.adminClient.storage.upload).not.toHaveBeenCalled();
  });

  it("rejects unsafe product identifiers and products outside the active organization", async () => {
    const malformed = makeHarness();
    const malformedResponse = await malformed.handler(uploadRequest(validWebp(), { "x-product-id": "../other" }));
    expect(malformedResponse.status).toBe(400);
    expect(await json(malformedResponse)).toEqual({ error: "invalid_product" });
    expect(malformed.adminClient.productExists).not.toHaveBeenCalled();

    const foreign = makeHarness();
    foreign.adminClient.productExists.mockResolvedValueOnce({ data: null, error: null });
    const foreignResponse = await foreign.handler(uploadRequest());
    expect(foreignResponse.status).toBe(404);
    expect(await json(foreignResponse)).toEqual({ error: "product_not_in_organization" });
    expect(foreign.adminClient.storage.upload).not.toHaveBeenCalled();
  });

  it("accepts a valid WebP upload and stores it only under the server-derived tenant/product path", async () => {
    const h = makeHarness();
    const bytes = validWebp();
    const response = await h.handler(uploadRequest(bytes));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      public_url: "https://cdn.example.test/" + OBJECT_PATH,
      object_path: OBJECT_PATH,
    });
    expect(h.adminClient.productExists).toHaveBeenCalledWith(PRODUCT_ID, ORGANIZATION_ID);
    expect(h.adminClient.storage.upload).toHaveBeenCalledWith(OBJECT_PATH, bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    expect(h.adminClient.storage.getPublicUrl).toHaveBeenCalledWith(OBJECT_PATH);
    expect(h.deps.createAdminClient).toHaveBeenCalledWith(
      "https://project.example.test",
      "test-service-role-key",
    );
    expect(PRODUCT_IMAGE_BUCKET).toBe("product-images");
  });

  it("rejects unsupported content type, empty payload, malformed WebP signature and over-limit bytes", async () => {
    const unsupported = makeHarness();
    const unsupportedResponse = await unsupported.handler(uploadRequest("not an image", { "content-type": "text/plain" }));
    expect(unsupportedResponse.status).toBe(415);
    expect(await json(unsupportedResponse)).toEqual({ error: "webp_required" });
    expect(unsupported.adminClient.storage.upload).not.toHaveBeenCalled();

    const empty = makeHarness();
    const emptyResponse = await empty.handler(uploadRequest(new Uint8Array()));
    expect(emptyResponse.status).toBe(400);
    expect(await json(emptyResponse)).toEqual({ error: "invalid_image" });

    const invalidSignature = makeHarness();
    const invalidResponse = await invalidSignature.handler(uploadRequest(new TextEncoder().encode("<html>not webp</html>")));
    expect(invalidResponse.status).toBe(415);
    expect(await json(invalidResponse)).toEqual({ error: "webp_signature_required" });
    expect(invalidSignature.adminClient.storage.upload).not.toHaveBeenCalled();

    const oversize = makeHarness();
    const tooManyBytes = new Uint8Array(8 * 1024 * 1024 + 1);
    const oversizeResponse = await oversize.handler(uploadRequest(tooManyBytes));
    expect(oversizeResponse.status).toBe(413);
    expect(await json(oversizeResponse)).toEqual({ error: "invalid_image_size" });
    expect(oversize.adminClient.storage.upload).not.toHaveBeenCalled();
  });

  it("does not claim upload success when storage rejects the object write", async () => {
    const h = makeHarness();
    h.adminClient.storage.upload.mockResolvedValueOnce({ error: new Error("storage denied") });

    const response = await h.handler(uploadRequest());
    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({ error: "image_upload_failed" });
    expect(h.adminClient.storage.getPublicUrl).not.toHaveBeenCalled();
  });

  it("deletes only a validated object path belonging to the caller's tenant and product", async () => {
    const h = makeHarness();
    const response = await h.handler(deleteRequest({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: OBJECT_PATH,
    }));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ deleted: true });
    expect(h.adminClient.productExists).toHaveBeenCalledWith(PRODUCT_ID, ORGANIZATION_ID);
    expect(h.adminClient.storage.remove).toHaveBeenCalledWith([OBJECT_PATH]);
  });

  it("rejects malformed delete JSON, non-delete actions and cross-tenant/path-traversal object paths", async () => {
    const malformedJson = makeHarness();
    const invalidJsonResponse = await malformedJson.handler(deleteRequest("{"));
    expect(invalidJsonResponse.status).toBe(400);
    expect(await json(invalidJsonResponse)).toEqual({ error: "invalid_json" });
    expect(malformedJson.adminClient.storage.remove).not.toHaveBeenCalled();

    const wrongAction = makeHarness();
    const wrongActionResponse = await wrongAction.handler(deleteRequest({
      action: "upload",
      product_id: PRODUCT_ID,
      object_path: OBJECT_PATH,
    }));
    expect(wrongActionResponse.status).toBe(400);
    expect(await json(wrongActionResponse)).toEqual({ error: "invalid_action" });

    const crossTenant = makeHarness();
    const foreignPath = `c0000000-0000-0000-0000-000000000001/${PRODUCT_ID}/${OBJECT_ID}.webp`;
    const foreignResponse = await crossTenant.handler(deleteRequest({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: foreignPath,
    }));
    expect(foreignResponse.status).toBe(400);
    expect(await json(foreignResponse)).toEqual({ error: "invalid_object_path" });
    expect(crossTenant.adminClient.storage.remove).not.toHaveBeenCalled();

    const traversal = makeHarness();
    const traversalResponse = await traversal.handler(deleteRequest({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: `${ORGANIZATION_ID}/../${OBJECT_ID}.webp`,
    }));
    expect(traversalResponse.status).toBe(400);
    expect(await json(traversalResponse)).toEqual({ error: "invalid_object_path" });
    expect(traversal.adminClient.storage.remove).not.toHaveBeenCalled();
  });

  it("returns a storage failure instead of a false delete acknowledgement", async () => {
    const h = makeHarness();
    h.adminClient.storage.remove.mockResolvedValueOnce({ error: new Error("storage unavailable") });

    const response = await h.handler(deleteRequest({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: OBJECT_PATH,
    }));

    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({ error: "image_cleanup_failed" });
  });

  it("keeps provider exceptions private behind an explicit 503", async () => {
    const h = makeHarness();
    h.authClient.auth.getUser.mockRejectedValueOnce(new Error("secret token/provider detail"));

    const response = await h.handler(uploadRequest());
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ error: "image_service_unavailable" });
    expect(JSON.stringify(await json(new Response(JSON.stringify({ error: "image_service_unavailable" })))).toContain("secret token")).toBe(false);
  });
});
