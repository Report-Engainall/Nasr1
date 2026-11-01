import { describe, expect, it, vi } from "vitest";
import { createProductImageUploadHandler } from "../../supabase/functions/_shared/product-image-upload-handler";

const ORG = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORG = "a0000000-0000-4000-8000-000000000002";
const PRODUCT = "a1000000-0000-4000-8000-000000000001";
const OBJECT = "b1000000-0000-4000-8000-000000000001";
const USER_ID = "c1000000-0000-4000-8000-000000000001";
const PROFILE_ID = "d1000000-0000-4000-8000-000000000001";

type SetupOptions = {
  env?: Record<string, string | undefined>;
  authUser?: { id: string } | null;
  authError?: unknown | null;
  profile?: { id: string; organization_id: string; is_active: boolean } | null;
  profileError?: unknown | null;
  roles?: { role: unknown }[] | null;
  roleError?: unknown | null;
  product?: { id: string } | null;
  productError?: unknown | null;
  uploadError?: unknown | null;
  removeError?: unknown | null;
};

function authUserResult(options: SetupOptions) {
  return {
    data: { user: options.authUser === undefined ? { id: USER_ID } : options.authUser },
    error: options.authError ?? null,
  };
}

function setup(options: SetupOptions = {}) {
  const env = options.env ?? {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  };
  const authClient = {
    auth: {
      getUser: vi.fn(async (_token: string) => authUserResult(options)),
    },
  };
  const adminClient = {
    getProfileByAuthUserId: vi.fn(async (_authUserId: string) => ({
      data: options.profile === undefined
        ? { id: PROFILE_ID, organization_id: ORG, is_active: true }
        : options.profile,
      error: options.profileError ?? null,
    })),
    getRoles: vi.fn(async (_profileId: string) => ({
      data: options.roles === undefined ? [{ role: "manager" }] : options.roles,
      error: options.roleError ?? null,
    })),
    productExists: vi.fn(async (_productId: string, _organizationId: string) => ({
      data: options.product === undefined ? { id: PRODUCT } : options.product,
      error: options.productError ?? null,
    })),
    storage: {
      upload: vi.fn(async (
        _objectPath: string,
        _bytes: Uint8Array,
        _options: { contentType: "image/webp"; cacheControl: string; upsert: false },
      ) => ({ error: options.uploadError ?? null })),
      remove: vi.fn(async (_paths: string[]) => ({ error: options.removeError ?? null })),
      getPublicUrl: vi.fn((objectPath: string) => ({
        data: { publicUrl: "https://assets.example.test/" + objectPath },
      })),
    },
  };
  const dependencies = {
    getEnv: (name: string) => env[name],
    createAuthClient: vi.fn((_url: string, _anonKey: string) => authClient),
    createAdminClient: vi.fn((_url: string, _serviceKey: string) => adminClient),
    randomUUID: () => OBJECT,
  };
  return {
    handler: createProductImageUploadHandler(dependencies),
    authClient,
    adminClient,
    dependencies,
  };
}

function webpBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([4, 0, 0, 0], 4);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
}

function uploadRequest(bytes: Uint8Array = webpBytes(), productId = PRODUCT): Request {
  return new Request("https://edge.example.test/product-image-upload", {
    method: "POST",
    headers: {
      authorization: "Bearer test-user-token",
      "content-type": "image/webp",
      "x-product-id": productId,
    },
    body: Buffer.from(bytes),
  });
}

function deleteRequest(body: unknown, contentLength?: string): Request {
  const headers = new Headers({
    authorization: "Bearer test-user-token",
    "content-type": "application/json",
  });
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return new Request("https://edge.example.test/product-image-upload", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("product image Edge handler HTTP acceptance", () => {
  it("answers preflight without requiring service configuration or auth", async () => {
    const { handler, dependencies } = setup({ env: {} });
    const response = await handler(new Request("https://edge.example.test/product-image-upload", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(dependencies.createAuthClient).not.toHaveBeenCalled();
    expect(dependencies.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods before creating any client", async () => {
    const { handler, dependencies } = setup();
    const response = await handler(new Request("https://edge.example.test/product-image-upload", { method: "GET" }));
    expect(response.status).toBe(405);
    expect(await responseBody(response)).toEqual({ error: "method_not_allowed" });
    expect(dependencies.createAuthClient).not.toHaveBeenCalled();
  });

  it("fails closed when service configuration is missing", async () => {
    const { handler, dependencies } = setup({ env: { SUPABASE_URL: "https://supabase.example.test" } });
    const response = await handler(uploadRequest());
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({ error: "image_service_not_configured" });
    expect(dependencies.createAuthClient).not.toHaveBeenCalled();
  });

  it("rejects absent or invalid bearer credentials before privileged client creation", async () => {
    const noToken = setup();
    const missingAuth = await noToken.handler(new Request("https://edge.example.test/product-image-upload", {
      method: "POST",
      headers: { "content-type": "image/webp", "x-product-id": PRODUCT },
      body: Buffer.from(webpBytes()),
    }));
    expect(missingAuth.status).toBe(401);
    expect(noToken.dependencies.createAdminClient).not.toHaveBeenCalled();

    const invalidToken = setup({ authUser: null });
    const denied = await invalidToken.handler(uploadRequest());
    expect(denied.status).toBe(401);
    expect(await responseBody(denied)).toEqual({ error: "unauthorized" });
    expect(invalidToken.dependencies.createAdminClient).not.toHaveBeenCalled();
  });

  it("denies inactive profiles and customer roles before product or storage access", async () => {
    const inactive = setup({ profile: { id: PROFILE_ID, organization_id: ORG, is_active: false } });
    const inactiveResponse = await inactive.handler(uploadRequest());
    expect(inactiveResponse.status).toBe(403);
    expect(await responseBody(inactiveResponse)).toEqual({ error: "active_organization_required" });
    expect(inactive.adminClient.productExists).not.toHaveBeenCalled();
    expect(inactive.adminClient.storage.upload).not.toHaveBeenCalled();

    const customer = setup({ roles: [{ role: "customer" }] });
    const customerResponse = await customer.handler(uploadRequest());
    expect(customerResponse.status).toBe(403);
    expect(await responseBody(customerResponse)).toEqual({ error: "product_image_permission_required" });
    expect(customer.adminClient.productExists).not.toHaveBeenCalled();
    expect(customer.adminClient.storage.upload).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant products and malformed image payloads without storage writes", async () => {
    const foreignProduct = setup({ product: null });
    const foreignResponse = await foreignProduct.handler(uploadRequest());
    expect(foreignResponse.status).toBe(404);
    expect(await responseBody(foreignResponse)).toEqual({ error: "product_not_in_organization" });
    expect(foreignProduct.adminClient.productExists).toHaveBeenCalledWith(PRODUCT, ORG);
    expect(foreignProduct.adminClient.storage.upload).not.toHaveBeenCalled();

    const invalidImage = setup();
    const invalidResponse = await invalidImage.handler(uploadRequest(new TextEncoder().encode("<html>")));
    expect(invalidResponse.status).toBe(415);
    expect(await responseBody(invalidResponse)).toEqual({ error: "webp_signature_required" });
    expect(invalidImage.adminClient.storage.upload).not.toHaveBeenCalled();
  });

  it("uploads a valid WebP through the tenant-derived path with upsert disabled", async () => {
    const { handler, adminClient } = setup();
    const response = await handler(uploadRequest());
    const body = await responseBody(response);
    const expectedPath = ORG + "/" + PRODUCT + "/" + OBJECT + ".webp";
    expect(response.status).toBe(200);
    expect(body).toEqual({
      public_url: "https://assets.example.test/" + expectedPath,
      object_path: expectedPath,
    });
    expect(adminClient.productExists).toHaveBeenCalledWith(PRODUCT, ORG);
    expect(adminClient.storage.upload).toHaveBeenCalledWith(
      expectedPath,
      expect.any(Uint8Array),
      { contentType: "image/webp", cacheControl: "31536000", upsert: false },
    );
    expect(adminClient.storage.getPublicUrl).toHaveBeenCalledWith(expectedPath);
  });

  it("deletes only a validated object belonging to the active tenant and product", async () => {
    const { handler, adminClient } = setup();
    const objectPath = ORG + "/" + PRODUCT + "/" + OBJECT + ".webp";
    const response = await handler(deleteRequest({
      action: "delete",
      product_id: PRODUCT,
      object_path: objectPath,
    }));
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({ deleted: true });
    expect(adminClient.productExists).toHaveBeenCalledWith(PRODUCT, ORG);
    expect(adminClient.storage.remove).toHaveBeenCalledWith([objectPath]);

    const traversal = setup();
    const denied = await traversal.handler(deleteRequest({
      action: "delete",
      product_id: PRODUCT,
      object_path: ORG + "/../../" + OBJECT + ".webp",
    }));
    expect(denied.status).toBe(400);
    expect(await responseBody(denied)).toEqual({ error: "invalid_object_path" });
    expect(traversal.adminClient.storage.remove).not.toHaveBeenCalled();
  });

  it("bounds JSON deletion bodies and never leaks provider errors", async () => {
    const oversized = setup();
    const tooLarge = await oversized.handler(deleteRequest({
      action: "delete", product_id: PRODUCT, object_path: ORG + "/" + PRODUCT + "/" + OBJECT + ".webp",
    }, "2049"));
    expect(tooLarge.status).toBe(413);
    expect(await responseBody(tooLarge)).toEqual({ error: "request_too_large" });
    expect(oversized.adminClient.storage.remove).not.toHaveBeenCalled();

    const failedUpload = setup({ uploadError: new Error("secret storage provider detail") });
    const failed = await failedUpload.handler(uploadRequest());
    expect(failed.status).toBe(502);
    const failedBody = await responseBody(failed);
    expect(failedBody).toEqual({ error: "image_upload_failed" });
    expect(JSON.stringify(failedBody)).not.toContain("secret storage provider detail");
  });
});
