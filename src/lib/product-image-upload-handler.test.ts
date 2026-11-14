import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProductImageUploadHandler,
  PRODUCT_IMAGE_BUCKET,
  type ProductImageUploadDependencies,
} from "../../supabase/functions/_shared/product-image-upload-handler";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "30000000-0000-4000-8000-000000000003";
const PROFILE_ID = "40000000-0000-4000-8000-000000000004";
const OBJECT_ID = "50000000-0000-4000-8000-000000000005";
const PUBLIC_ORIGIN = "https://aghbari.example.test/storage/v1/object/public/" + PRODUCT_IMAGE_BUCKET + "/";
const OBJECT_PATH = ORGANIZATION_ID + "/" + PRODUCT_ID + "/" + OBJECT_ID + ".webp";
const PUBLIC_URL = PUBLIC_ORIGIN + OBJECT_PATH;

const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
]);

type HarnessState = {
  user: { id: string } | null;
  authError: unknown | null;
  profile: { id: string; organization_id: string; is_active: boolean } | null;
  profileError: unknown | null;
  roles: { role: unknown }[] | null;
  roleError: unknown | null;
  product: { id: string } | null;
  productError: unknown | null;
  uploadError: unknown | null;
  removeError: unknown | null;
  primaryError: unknown | null;
  galleryError: unknown | null;
  primaryData: unknown;
  galleryData: unknown;
  configured: boolean;
};

function createHarness() {
  const state: HarnessState = {
    user: { id: USER_ID },
    authError: null,
    profile: { id: PROFILE_ID, organization_id: ORGANIZATION_ID, is_active: true },
    profileError: null,
    roles: [{ role: "manager" }],
    roleError: null,
    product: { id: PRODUCT_ID },
    productError: null,
    uploadError: null,
    removeError: null,
    primaryError: null,
    galleryError: null,
    primaryData: undefined,
    galleryData: undefined,
    configured: true,
  };

  const calls = {
    getUser: vi.fn(async (_token: string) => ({ data: { user: state.user }, error: state.authError })),
    getProfile: vi.fn(async (_userId: string) => ({ data: state.profile, error: state.profileError })),
    getRoles: vi.fn(async (_profileId: string) => ({ data: state.roles, error: state.roleError })),
    productExists: vi.fn(async (_productId: string, _organizationId: string) => ({
      data: state.product,
      error: state.productError,
    })),
    upload: vi.fn(async (_path: string, _bytes: Uint8Array, _options: {
      contentType: "image/webp"; cacheControl: string; upsert: false;
    }) => ({ error: state.uploadError })),
    remove: vi.fn(async (_paths: string[]) => ({ error: state.removeError })),
    setProductImageUrl: vi.fn(async (
      _token: string,
      productId: string,
      _expected: string | null,
      nextImageUrl: string | null,
    ) => ({
      data: state.primaryData === undefined
        ? { id: productId, image_url: nextImageUrl, changed: true }
        : state.primaryData,
      error: state.primaryError,
    })),
    addProductGalleryImage: vi.fn(async (
      _token: string,
      productId: string,
      imageUrl: string,
    ) => ({
      data: state.galleryData === undefined
        ? { id: productId, image_url: imageUrl, image_gallery_urls: [imageUrl], changed: true }
        : state.galleryData,
      error: state.galleryError,
    })),
  };

  const dependencies: ProductImageUploadDependencies = {
    getEnv(name) {
      if (!state.configured) return undefined;
      const values: Record<string, string> = {
        SUPABASE_URL: "https://aghbari.example.test",
        SUPABASE_ANON_KEY: "public-test-key",
        SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
      };
      return values[name];
    },
    createAuthClient: () => ({
      auth: { getUser: calls.getUser },
      setProductImageUrl: calls.setProductImageUrl,
      addProductGalleryImage: calls.addProductGalleryImage,
    }),
    createAdminClient: () => ({
      getProfileByAuthUserId: calls.getProfile,
      getRoles: calls.getRoles,
      productExists: calls.productExists,
      storage: {
        upload: calls.upload,
        remove: calls.remove,
        getPublicUrl: () => ({ data: { publicUrl: PUBLIC_ORIGIN + OBJECT_PATH } }),
      },
    }),
    randomUUID: () => OBJECT_ID,
  };

  return { state, calls, handler: createProductImageUploadHandler(dependencies) };
}

function imageRequest(options: {
  bytes?: Uint8Array;
  headers?: Record<string, string>;
} = {}): Request {
  const headers = new Headers({
    authorization: "Bearer valid-user-token",
    "content-type": "image/webp",
    "x-product-id": PRODUCT_ID,
    ...options.headers,
  });
  const payload = options.bytes ?? WEBP;
  const blobBuffer = new ArrayBuffer(payload.byteLength);
  new Uint8Array(blobBuffer).set(payload);
  return new Request("https://edge.example.test/product-image-upload", {
    method: "POST",
    headers,
    body: new Blob([blobBuffer], { type: "image/webp" }),
  });
}

function jsonRequest(value: unknown): Request {
  return new Request("https://edge.example.test/product-image-upload", {
    method: "POST",
    headers: {
      authorization: "Bearer valid-user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(value),
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("product-image-upload Edge handler", () => {
  it("handles preflight and rejects unsupported methods without touching credentials", async () => {
    const { handler, calls, state } = createHarness();
    state.configured = false;

    const preflight = await handler(new Request("https://edge.example.test", { method: "OPTIONS" }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");

    const get = await handler(new Request("https://edge.example.test", { method: "GET" }));
    expect(get.status).toBe(405);
    expect(await responseBody(get)).toEqual({ error: "method_not_allowed" });
    expect(calls.getUser).not.toHaveBeenCalled();
  });

  it("fails closed when server configuration or bearer authentication is missing", async () => {
    const missingConfig = createHarness();
    missingConfig.state.configured = false;
    const unavailable = await missingConfig.handler(imageRequest());
    expect(unavailable.status).toBe(503);
    expect(await responseBody(unavailable)).toEqual({ error: "image_service_not_configured" });

    const missingToken = createHarness();
    const request = new Request("https://edge.example.test", {
      method: "POST",
      headers: { "content-type": "image/webp", "x-product-id": PRODUCT_ID },
      body: new Blob([WEBP]),
    });
    const unauthorized = await missingToken.handler(request);
    expect(unauthorized.status).toBe(401);
    expect(missingToken.calls.getUser).not.toHaveBeenCalled();
  });

  it("rejects invalid sessions, inactive profiles and malformed tenant identity", async () => {
    const invalidSession = createHarness();
    invalidSession.state.authError = new Error("expired");
    expect((await invalidSession.handler(imageRequest())).status).toBe(401);

    const inactiveProfile = createHarness();
    inactiveProfile.state.profile = { id: PROFILE_ID, organization_id: ORGANIZATION_ID, is_active: false };
    expect((await inactiveProfile.handler(imageRequest())).status).toBe(403);

    const malformedTenant = createHarness();
    malformedTenant.state.profile = { id: PROFILE_ID, organization_id: "not-a-uuid", is_active: true };
    expect((await malformedTenant.handler(imageRequest())).status).toBe(403);
  });

  it("allows only the defined staff roles and rejects an unknown role", async () => {
    for (const role of ["admin", "manager", "staff"]) {
      const allowed = createHarness();
      allowed.state.roles = [{ role }];
      expect((await allowed.handler(imageRequest())).status).toBe(200);
    }

    const denied = createHarness();
    denied.state.roles = [{ role: "customer" }];
    const response = await denied.handler(imageRequest());
    expect(response.status).toBe(403);
    expect(await responseBody(response)).toEqual({ error: "product_image_permission_required" });
    expect(denied.calls.upload).not.toHaveBeenCalled();
  });

  it("derives tenant identity from the authenticated profile and rejects a foreign product", async () => {
    const harness = createHarness();
    harness.state.product = null;

    const response = await harness.handler(imageRequest());
    expect(response.status).toBe(404);
    expect(await responseBody(response)).toEqual({ error: "product_not_in_organization" });
    expect(harness.calls.getProfile).toHaveBeenCalledWith(USER_ID);
    expect(harness.calls.getRoles).toHaveBeenCalledWith(PROFILE_ID);
    expect(harness.calls.productExists).toHaveBeenCalledWith(PRODUCT_ID, ORGANIZATION_ID);
    expect(harness.calls.upload).not.toHaveBeenCalled();
  });

  it("rejects non-WebP content types and malformed RIFF/WEBP signatures", async () => {
    const wrongMime = createHarness();
    const wrongMimeResponse = await wrongMime.handler(imageRequest({
      headers: { "content-type": "image/png" },
    }));
    expect(wrongMimeResponse.status).toBe(415);
    expect(await responseBody(wrongMimeResponse)).toEqual({ error: "webp_required" });

    const wrongSignature = createHarness();
    const badBytes = new Uint8Array(WEBP);
    badBytes[8] = 0x4a;
    const signatureResponse = await wrongSignature.handler(imageRequest({ bytes: badBytes }));
    expect(signatureResponse.status).toBe(415);
    expect(await responseBody(signatureResponse)).toEqual({ error: "webp_signature_required" });

    const wrongLength = createHarness();
    const invalidLength = new Uint8Array(WEBP);
    invalidLength[4] = 0x05;
    const lengthResponse = await wrongLength.handler(imageRequest({ bytes: invalidLength }));
    expect(lengthResponse.status).toBe(415);
    expect(await responseBody(lengthResponse)).toEqual({ error: "webp_signature_required" });
  });

  it("enforces the 8 MiB limit while streaming and never stores an oversized body", async () => {
    const harness = createHarness();
    const oversized = new Uint8Array(8 * 1024 * 1024 + 1);
    const response = await harness.handler(imageRequest({ bytes: oversized }));
    expect(response.status).toBe(413);
    expect(await responseBody(response)).toEqual({ error: "invalid_image_size" });
    expect(harness.calls.upload).not.toHaveBeenCalled();
  });

  it("stores a primary image with an opaque tenant/product path and links it using the caller token", async () => {
    const harness = createHarness();
    const response = await harness.handler(imageRequest());
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      public_url: PUBLIC_URL,
      object_path: OBJECT_PATH,
      image_linked: true,
      image_role: "primary",
    });
    expect(harness.calls.upload).toHaveBeenCalledWith(OBJECT_PATH, WEBP, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    expect(harness.calls.setProductImageUrl).toHaveBeenCalledWith(
      "valid-user-token",
      PRODUCT_ID,
      null,
      PUBLIC_URL,
    );
    expect(harness.calls.addProductGalleryImage).not.toHaveBeenCalled();
    expect(harness.calls.remove).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("routes gallery uploads through the atomic gallery RPC", async () => {
    const harness = createHarness();
    const response = await harness.handler(imageRequest({ headers: { "x-image-mode": "gallery" } }));
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({ image_linked: true, image_role: "gallery" });
    expect(harness.calls.addProductGalleryImage).toHaveBeenCalledWith(
      "valid-user-token",
      PRODUCT_ID,
      PUBLIC_URL,
    );
    expect(harness.calls.setProductImageUrl).not.toHaveBeenCalled();
  });

  it("rejects an invalid image mode before storage writes", async () => {
    const harness = createHarness();
    const response = await harness.handler(imageRequest({ headers: { "x-image-mode": "replace" } }));
    expect(response.status).toBe(400);
    expect(await responseBody(response)).toEqual({ error: "invalid_image_mode" });
    expect(harness.calls.upload).not.toHaveBeenCalled();
  });

  it("removes a newly uploaded object when the atomic database link fails", async () => {
    const harness = createHarness();
    harness.state.primaryError = { code: "40001" };

    const response = await harness.handler(imageRequest());
    expect(response.status).toBe(409);
    expect(await responseBody(response)).toEqual({ error: "image_link_changed" });
    expect(harness.calls.upload).toHaveBeenCalledTimes(1);
    expect(harness.calls.remove).toHaveBeenCalledWith([OBJECT_PATH]);
  });

  it("keeps an object when the database acknowledgement is ambiguous", async () => {
    const harness = createHarness();
    harness.state.primaryData = { id: PRODUCT_ID, image_url: "https://unexpected.example.test/unknown.webp" };

    const response = await harness.handler(imageRequest());
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({ error: "image_link_state_unconfirmed" });
    expect(harness.calls.remove).not.toHaveBeenCalled();
  });

  it("reports an explicit cleanup-pending error when storage cleanup also fails", async () => {
    const harness = createHarness();
    harness.state.primaryError = { code: "P0001" };
    harness.state.removeError = new Error("storage unavailable");

    const response = await harness.handler(imageRequest());
    expect(response.status).toBe(502);
    expect(await responseBody(response)).toEqual({ error: "image_link_failed_cleanup_pending" });
  });

  it("validates deletion paths against both tenant and product before removing an object", async () => {
    const harness = createHarness();
    const validDelete = await harness.handler(jsonRequest({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: OBJECT_PATH,
    }));
    expect(validDelete.status).toBe(200);
    expect(await responseBody(validDelete)).toEqual({ deleted: true });
    expect(harness.calls.remove).toHaveBeenCalledWith([OBJECT_PATH]);

    const foreignPathHarness = createHarness();
    const foreignPath = ORGANIZATION_ID + "/60000000-0000-4000-8000-000000000006/" + OBJECT_ID + ".webp";
    const foreignDelete = await foreignPathHarness.handler(jsonRequest({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: foreignPath,
    }));
    expect(foreignDelete.status).toBe(400);
    expect(await responseBody(foreignDelete)).toEqual({ error: "invalid_object_path" });
    expect(foreignPathHarness.calls.remove).not.toHaveBeenCalled();
  });

  it("unlinks the database reference before deleting the old object and exposes partial cleanup", async () => {
    const harness = createHarness();
    const response = await harness.handler(jsonRequest({
      action: "unlink",
      product_id: PRODUCT_ID,
      expected_image_url: PUBLIC_URL,
      object_path: OBJECT_PATH,
    }));
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({ unlinked: true, cleaned: true });
    expect(harness.calls.setProductImageUrl).toHaveBeenCalledWith(
      "valid-user-token",
      PRODUCT_ID,
      PUBLIC_URL,
      null,
    );
    expect(harness.calls.remove).toHaveBeenCalledWith([OBJECT_PATH]);
    expect(harness.calls.setProductImageUrl.mock.invocationCallOrder[0])
      .toBeLessThan(harness.calls.remove.mock.invocationCallOrder[0]);

    const partialCleanup = createHarness();
    partialCleanup.state.removeError = new Error("temporary storage failure");
    const partialResponse = await partialCleanup.handler(jsonRequest({
      action: "unlink",
      product_id: PRODUCT_ID,
      expected_image_url: PUBLIC_URL,
      object_path: OBJECT_PATH,
    }));
    expect(partialResponse.status).toBe(200);
    expect(await responseBody(partialResponse)).toEqual({ unlinked: true, cleaned: false });
  });

  it("does not remove an object when unlink is rejected as stale", async () => {
    const harness = createHarness();
    harness.state.primaryError = { code: "40001" };
    const response = await harness.handler(jsonRequest({
      action: "unlink",
      product_id: PRODUCT_ID,
      expected_image_url: PUBLIC_URL,
      object_path: OBJECT_PATH,
    }));
    expect(response.status).toBe(409);
    expect(await responseBody(response)).toEqual({ error: "image_link_changed" });
    expect(harness.calls.remove).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON commands and over-sized command bodies", async () => {
    const invalid = createHarness();
    const invalidResponse = await invalid.handler(new Request("https://edge.example.test", {
      method: "POST",
      headers: { authorization: "Bearer valid-user-token", "content-type": "application/json" },
      body: "{",
    }));
    expect(invalidResponse.status).toBe(400);
    expect(await responseBody(invalidResponse)).toEqual({ error: "invalid_json" });

    const oversized = createHarness();
    const tooLarge = await oversized.handler(jsonRequest({
      action: "delete",
      product_id: PRODUCT_ID,
      object_path: "x".repeat(4096),
    }));
    expect(tooLarge.status).toBe(413);
    expect(await responseBody(tooLarge)).toEqual({ error: "request_too_large" });
  });
});
