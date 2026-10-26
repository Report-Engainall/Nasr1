import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductImageUploadHandler } from "../../supabase/functions/_shared/product-image-upload-handler";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  getUser: vi.fn(),
  getProfile: vi.fn(),
  getRoles: vi.fn(),
  productExists: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  createAuthClient: vi.fn(),
  createAdminClient: vi.fn(),
  randomUUID: vi.fn(),
}));

const URL = "https://store.example.test/functions/v1/product-image-upload";
const ORG = "a0000000-0000-0000-0000-000000000001";
const PRODUCT = "a1000000-0000-0000-0000-000000000001";
const OBJECT = "b1000000-0000-4000-8000-000000000001";
const PATH = `${ORG}/${PRODUCT}/${OBJECT}.webp`;
const PUBLIC_URL = `https://storage.example.test/object/public/product-images/${PATH}`;

function webpBytes() {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
}

function request(body: BodyInit, contentType = "image/webp", extraHeaders: Record<string, string> = {}) {
  return new Request(URL, {
    method: "POST",
    headers: {
      authorization: "Bearer valid-test-token",
      "content-type": contentType,
      ...extraHeaders,
    },
    body,
  });
}

async function bodyJson(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function makeHandler() {
  mocks.createAuthClient.mockImplementation(() => ({ auth: { getUser: mocks.getUser } }));
  mocks.createAdminClient.mockImplementation(() => ({
    getProfileByAuthUserId: mocks.getProfile,
    getRoles: mocks.getRoles,
    productExists: mocks.productExists,
    storage: {
      upload: mocks.upload,
      remove: mocks.remove,
      getPublicUrl: mocks.getPublicUrl,
    },
  }));
  return createProductImageUploadHandler({
    getEnv: (name) => mocks.env[name],
    createAuthClient: mocks.createAuthClient,
    createAdminClient: mocks.createAdminClient,
    randomUUID: mocks.randomUUID,
  });
}

describe("product image Edge HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env = {
      SUPABASE_URL: "https://project.example.test",
      SUPABASE_ANON_KEY: "anon-test-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
    };
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } }, error: null });
    mocks.getProfile.mockResolvedValue({
      data: { id: "profile-1", organization_id: ORG, is_active: true }, error: null,
    });
    mocks.getRoles.mockResolvedValue({ data: [{ role: "admin" }], error: null });
    mocks.productExists.mockResolvedValue({ data: { id: PRODUCT }, error: null });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://storage.example.test/object/public/product-images/${path}` },
    }));
    mocks.randomUUID.mockReturnValue(OBJECT);
  });

  it("serves CORS preflight before configuration and rejects other methods", async () => {
    mocks.env = {};
    const handler = makeHandler();
    const options = await handler(new Request(URL, { method: "OPTIONS" }));
    expect(options.status).toBe(204);
    expect(options.headers.get("cache-control")).toBe("no-store");
    expect(options.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    const get = await handler(new Request(URL, { method: "GET" }));
    expect(get.status).toBe(405);
    expect(await bodyJson(get)).toEqual({ error: "method_not_allowed" });
  });

  it("fails closed for missing configuration, bearer token, or invalid auth", async () => {
    const handler = makeHandler();
    mocks.env.SUPABASE_SERVICE_ROLE_KEY = undefined;
    expect((await handler(request(new Blob([webpBytes()])))).status).toBe(503);

    mocks.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
    const noToken = await handler(request(new Blob([webpBytes()]), "image/webp", { authorization: "" }));
    expect(noToken.status).toBe(401);

    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("invalid token") });
    expect((await handler(request(new Blob([webpBytes()])))).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.productExists).not.toHaveBeenCalled();
  });

  it("denies inactive profiles, missing organization, and roles outside the allowlist", async () => {
    const handler = makeHandler();
    mocks.getProfile.mockResolvedValueOnce({
      data: { id: "profile-1", organization_id: ORG, is_active: false }, error: null,
    });
    const inactive = await handler(request(new Blob([webpBytes()])));
    expect(inactive.status).toBe(403);
    expect(await bodyJson(inactive)).toEqual({ error: "active_organization_required" });

    mocks.getProfile.mockResolvedValueOnce({
      data: { id: "profile-1", organization_id: "bad-org", is_active: true }, error: null,
    });
    expect((await handler(request(new Blob([webpBytes()])))).status).toBe(403);

    mocks.getRoles.mockResolvedValueOnce({ data: [{ role: "customer" }], error: null });
    const denied = await handler(request(new Blob([webpBytes()])));
    expect(denied.status).toBe(403);
    expect(await bodyJson(denied)).toEqual({ error: "product_image_permission_required" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads only a verified WebP for a product owned by the active organization", async () => {
    const handler = makeHandler();
    const response = await handler(request(new Blob([webpBytes()]), "image/webp", {
      "x-product-id": PRODUCT,
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createAuthClient).toHaveBeenCalledWith("https://project.example.test", "anon-test-key");
    expect(mocks.createAdminClient).toHaveBeenCalledWith("https://project.example.test", "service-test-key");
    expect(mocks.getProfile).toHaveBeenCalledWith("auth-user-1");
    expect(mocks.getRoles).toHaveBeenCalledWith("profile-1");
    expect(mocks.productExists).toHaveBeenCalledWith(PRODUCT, ORG);
    expect(mocks.upload).toHaveBeenCalledWith(PATH, webpBytes(), {
      contentType: "image/webp", cacheControl: "31536000", upsert: false,
    });
    expect(mocks.getPublicUrl).toHaveBeenCalledWith(PATH);
    expect(await bodyJson(response)).toEqual({ public_url: PUBLIC_URL, object_path: PATH });
  });

  it("rejects wrong content type, malformed product IDs, invalid signatures, and oversize images", async () => {
    const handler = makeHandler();
    const wrongType = await handler(request(new Blob([webpBytes()]), "image/png", { "x-product-id": PRODUCT }));
    expect(wrongType.status).toBe(415);
    expect(await bodyJson(wrongType)).toEqual({ error: "webp_required" });

    const malformedId = await handler(request(new Blob([webpBytes()]), "image/webp", { "x-product-id": "../foreign" }));
    expect(malformedId.status).toBe(400);
    expect(await bodyJson(malformedId)).toEqual({ error: "invalid_product" });

    const invalidSignature = await handler(request(new Blob([new TextEncoder().encode("<html>")]), "image/webp", {
      "x-product-id": PRODUCT,
    }));
    expect(invalidSignature.status).toBe(415);
    expect(await bodyJson(invalidSignature)).toEqual({ error: "webp_signature_required" });

    const oversize = await handler(request(
      new Blob([new Uint8Array([1])]), "image/webp",
      { "x-product-id": PRODUCT, "content-length": String(8 * 1024 * 1024 + 1) },
    ));
    expect(oversize.status).toBe(413);
    expect(await bodyJson(oversize)).toEqual({ error: "invalid_image_size" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not upload when product lookup fails or points outside the active organization", async () => {
    const handler = makeHandler();
    mocks.productExists.mockResolvedValueOnce({ data: null, error: null });
    const response = await handler(request(new Blob([webpBytes()]), "image/webp", { "x-product-id": PRODUCT }));
    expect(response.status).toBe(404);
    expect(await bodyJson(response)).toEqual({ error: "product_not_in_organization" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("deletes only the exact organization/product/object path after rechecking product ownership", async () => {
    const handler = makeHandler();
    const response = await handler(request(JSON.stringify({
      action: "delete", product_id: PRODUCT, object_path: PATH,
    }), "application/json"));
    expect(response.status).toBe(200);
    expect(await bodyJson(response)).toEqual({ deleted: true });
    expect(mocks.productExists).toHaveBeenCalledWith(PRODUCT, ORG);
    expect(mocks.remove).toHaveBeenCalledWith([PATH]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it.each([
    [{ action: "delete", product_id: PRODUCT, object_path: `other-org/${PRODUCT}/${OBJECT}.webp` }, "foreign organization path"],
    [{ action: "delete", product_id: PRODUCT, object_path: `${ORG}/../${OBJECT}.webp` }, "path traversal"],
    [{ action: "delete", product_id: PRODUCT, object_path: `${ORG}/${PRODUCT}/private.txt` }, "wrong extension"],
    [{ action: "delete", product_id: PRODUCT, object_path: `${ORG}/other-product/${OBJECT}.webp` }, "wrong product path"],
  ])("refuses unsafe deletion paths (%s)", async (payload) => {
    const handler = makeHandler();
    const response = await handler(request(JSON.stringify(payload), "application/json"));
    expect(response.status).toBe(400);
    expect(await bodyJson(response)).toEqual({ error: "invalid_object_path" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("maps storage errors to safe responses and does not leak provider exceptions", async () => {
    const handler = makeHandler();
    mocks.upload.mockResolvedValueOnce({ error: new Error("sensitive storage credential detail") });
    const uploadFailed = await handler(request(new Blob([webpBytes()]), "image/webp", {
      "x-product-id": PRODUCT,
    }));
    expect(uploadFailed.status).toBe(502);
    expect(await bodyJson(uploadFailed)).toEqual({ error: "image_upload_failed" });

    mocks.remove.mockResolvedValueOnce({ error: new Error("storage cleanup failed") });
    const deleteFailed = await handler(request(JSON.stringify({
      action: "delete", product_id: PRODUCT, object_path: PATH,
    }), "application/json"));
    expect(deleteFailed.status).toBe(502);
    expect(await bodyJson(deleteFailed)).toEqual({ error: "image_cleanup_failed" });

    mocks.getUser.mockRejectedValueOnce(new Error("service key must never be returned"));
    const unexpected = await handler(request(new Blob([webpBytes()])));
    expect(unexpected.status).toBe(503);
    const errorBody = await bodyJson(unexpected);
    expect(JSON.stringify(errorBody)).not.toContain("service key must never be returned");
    expect(errorBody).toEqual({ error: "image_service_unavailable" });
  });

  it("rejects malformed JSON metadata and invalid UTF-8 before storage mutation", async () => {
    const handler = makeHandler();
    expect((await handler(request("{", "application/json"))).status).toBe(400);

    const invalidUtf8 = await handler(request(new Blob([new Uint8Array([0xc3, 0x28])]), "application/json"));
    expect(invalidUtf8.status).toBe(400);
    expect(await bodyJson(invalidUtf8)).toEqual({ error: "invalid_utf8" });

    const badAction = await handler(request(JSON.stringify({ action: "upload", product_id: PRODUCT }), "application/json"));
    expect(badAction.status).toBe(400);
    expect(await bodyJson(badAction)).toEqual({ error: "invalid_action" });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
