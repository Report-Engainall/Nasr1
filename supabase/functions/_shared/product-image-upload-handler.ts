import { readBoundedTextBody } from "./bounded-body.ts";
import {
  hasAllowedProductImageRole,
  isSafeProductImageRequest,
  isValidProductImageObjectPath,
  isWebpPayload,
  PRODUCT_IMAGE_MAX_BYTES,
} from "../../../src/lib/product-image-security.ts";

export const PRODUCT_IMAGE_BUCKET = "product-images";

type AuthUser = { id: string };
type AuthClient = {
  auth: {
    getUser(token: string): Promise<{ data: { user: AuthUser | null }; error: unknown | null }>;
  };
};
type ProductImageStorage = {
  upload(
    objectPath: string,
    bytes: Uint8Array,
    options: { contentType: "image/webp"; cacheControl: string; upsert: false },
  ): Promise<{ error: unknown | null }>;
  remove(paths: string[]): Promise<{ error: unknown | null }>;
  getPublicUrl(objectPath: string): { data: { publicUrl: string } };
};
type AdminClient = {
  getProfileByAuthUserId(authUserId: string): Promise<{
    data: { id: string; organization_id: string; is_active: boolean } | null;
    error: unknown | null;
  }>;
  getRoles(profileId: string): Promise<{ data: { role: unknown }[] | null; error: unknown | null }>;
  productExists(productId: string, organizationId: string): Promise<{
    data: { id: string } | null;
    error: unknown | null;
  }>;
  storage: ProductImageStorage;
};

export type ProductImageUploadDependencies = {
  getEnv(name: string): string | undefined;
  createAuthClient(url: string, anonKey: string): AuthClient;
  createAdminClient(url: string, serviceKey: string): AdminClient;
  randomUUID?: () => string;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, x-client-info, content-type, x-product-id",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function reply(value: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: CORS });
}

function uuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function readBoundedBytes(request: Request, limit: number): Promise<Uint8Array | null> {
  const header = request.headers.get("content-length");
  const contentLength = Number(header ?? "");
  if (header !== null && Number.isFinite(contentLength) && contentLength > limit) {
    try { await request.body?.cancel(); } catch { /* retain the bounded-size rejection */ }
    return null;
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) {
        try { await reader.cancel(); } catch { /* keep the size rejection bounded */ }
        return null;
      }
      chunks.push(result.value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  } catch {
    try { await reader.cancel(); } catch { /* keep the read failure bounded */ }
    return null;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Authenticated product-image boundary, dependency-injected so tests exercise the
 * actual HTTP decisions without production credentials or a live storage service.
 */
export function createProductImageUploadHandler(deps: ProductImageUploadDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

    const url = deps.getEnv("SUPABASE_URL");
    const anonKey = deps.getEnv("SUPABASE_ANON_KEY");
    const serviceKey = deps.getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    if (!url || !anonKey || !serviceKey) return reply({ error: "image_service_not_configured" }, 503);
    if (!token) return reply({ error: "unauthorized" }, 401);

    try {
      const authClient = deps.createAuthClient(url, anonKey);
      const { data: authData, error: authError } = await authClient.auth.getUser(token);
      if (authError || !authData.user) return reply({ error: "unauthorized" }, 401);

      const admin = deps.createAdminClient(url, serviceKey);
      const { data: profile, error: profileError } = await admin.getProfileByAuthUserId(authData.user.id);
      if (profileError || !profile || profile.is_active !== true || !uuid(profile.organization_id)) {
        return reply({ error: "active_organization_required" }, 403);
      }

      const { data: roleRows, error: roleError } = await admin.getRoles(profile.id);
      if (roleError || !hasAllowedProductImageRole((roleRows ?? []).map((row) => row.role))) {
        return reply({ error: "product_image_permission_required" }, 403);
      }

      const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      let productId = "";
      let action: "upload" | "delete" = "upload";
      let objectPath = "";
      let bytes: Uint8Array | undefined;

      if (contentType === "application/json") {
        const bodyRead = await readBoundedTextBody(
          request.body,
          2048,
          request.headers.get("content-length"),
        );
        if (!bodyRead.ok) {
          if (bodyRead.reason === "too_large") return reply({ error: "request_too_large" }, 413);
          if (bodyRead.reason === "invalid_utf8") return reply({ error: "invalid_utf8" }, 400);
          return reply({ error: "invalid_request_body" }, 400);
        }

        let body: unknown;
        try { body = JSON.parse(bodyRead.text); }
        catch { return reply({ error: "invalid_json" }, 400); }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return reply({ error: "invalid_request" }, 400);
        }
        const value = body as Record<string, unknown>;
        if (value.action !== "delete") return reply({ error: "invalid_action" }, 400);
        action = "delete";
        productId = typeof value.product_id === "string" ? value.product_id : "";
        objectPath = typeof value.object_path === "string" ? value.object_path : "";
      } else {
        if (contentType !== "image/webp") return reply({ error: "webp_required" }, 415);
        productId = request.headers.get("x-product-id") ?? "";
        if (!uuid(productId) || !isSafeProductImageRequest(productId, profile.organization_id)) {
          return reply({ error: "invalid_product" }, 400);
        }
        const { data: product, error: productError } = await admin.productExists(productId, profile.organization_id);
        if (productError || !product) return reply({ error: "product_not_in_organization" }, 404);

        const boundedBytes = await readBoundedBytes(request, PRODUCT_IMAGE_MAX_BYTES);
        if (!boundedBytes) return reply({ error: "invalid_image_size" }, 413);
        if (boundedBytes.byteLength < 1) return reply({ error: "invalid_image" }, 400);
        bytes = boundedBytes;
        if (!isWebpPayload(bytes)) return reply({ error: "webp_signature_required" }, 415);
      }

      if (!uuid(productId)) return reply({ error: "invalid_product" }, 400);
      if (action === "delete") {
        const { data: product, error: productError } = await admin.productExists(productId, profile.organization_id);
        if (productError || !product) return reply({ error: "product_not_in_organization" }, 404);
        if (!isValidProductImageObjectPath(objectPath, profile.organization_id, productId)) {
          return reply({ error: "invalid_object_path" }, 400);
        }
        const { error } = await admin.storage.remove([objectPath]);
        if (error) return reply({ error: "image_cleanup_failed" }, 502);
        return reply({ deleted: true });
      }

      const uniqueId = (deps.randomUUID ?? (() => crypto.randomUUID()))();
      objectPath = profile.organization_id + "/" + productId + "/" + uniqueId + ".webp";
      const { error: uploadError } = await admin.storage.upload(objectPath, bytes!, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploadError) return reply({ error: "image_upload_failed" }, 502);
      const publicUrl = admin.storage.getPublicUrl(objectPath).data.publicUrl;
      return reply({ public_url: publicUrl, object_path: objectPath });
    } catch {
      // Do not leak provider/service-role details through unhandled Edge exceptions.
      return reply({ error: "image_service_unavailable" }, 503);
    }
  };
}
