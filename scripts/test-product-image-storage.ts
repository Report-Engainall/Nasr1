import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createProductImageUploadHandler,
  PRODUCT_IMAGE_BUCKET,
  type ProductImageUploadDependencies,
} from "../supabase/functions/_shared/product-image-upload-handler.ts";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PRODUCT_ID = requiredEnv("E2E_PRODUCT_ID");
const WEBP_BUFFER = new ArrayBuffer(12);
new Uint8Array(WEBP_BUFFER).set([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
]);
const WEBP_BLOB = new Blob([WEBP_BUFFER], { type: "image/webp" });

type AssertionName =
  | "bucket-is-public-and-restricted-to-webp-8mib"
  | "authenticated-manager-cannot-write-storage-directly"
  | "storage-api-rejects-non-webp-mime"
  | "storage-api-enforces-eight-mib-object-limit"
  | "edge-handler-uploads-through-service-role-and-links-via-manager-rpc"
  | "public-object-read-works-without-authentication"
  | "stale-image-link-rolls-back-object-upload"
  | "unlink-removes-database-reference-before-object-cleanup";

const assertions: AssertionName[] = [];
const apiUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
const proofPath = requiredEnv("PRODUCT_IMAGE_STORAGE_PROOF_PATH");
const sourceSha = requiredEnv("E2E_SOURCE_SHA");
const api = new URL(apiUrl);

if (
  api.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(api.hostname) ||
  api.port !== "54321" ||
  api.username ||
  api.password
) {
  throw new Error("Product-image Storage acceptance is restricted to local Supabase at 127.0.0.1:54321.");
}

const authOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local product-image Storage acceptance.");
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error ?? "unknown error");
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return undefined;
  const value = Number((error as { statusCode: unknown }).statusCode);
  return Number.isFinite(value) ? value : undefined;
}

async function writeProof(result: "PASS" | "FAIL", failure?: string): Promise<void> {
  const proof = {
    result,
    test: "local-supabase-storage-api-through-product-image-upload-handler",
    sourceSha,
    environment: "disposable-local-supabase-postgresql-17-only",
    supabaseOrigin: api.origin,
    bucket: PRODUCT_IMAGE_BUCKET,
    assertions,
    noProductionWrites: true,
    edgeRuntimeDeployed: false,
    hostedSupabaseUsed: false,
    failure: failure ?? null,
  };
  await mkdir(dirname(proofPath), { recursive: true });
  await writeFile(proofPath, JSON.stringify(proof, null, 2) + "\n", "utf8");
}

function makeUploadRequest(
  token: string,
  productId: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://edge-handler.local/product-image-upload", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "image/webp",
      "x-product-id": productId,
      ...headers,
    },
    body: WEBP_BLOB,
  });
}

function makeJsonRequest(token: string, payload: Record<string, unknown>): Request {
  return new Request("https://edge-handler.local/product-image-upload", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

async function main(): Promise<void> {
  const anonymousClient = createClient(apiUrl, publishableKey, authOptions);
  const serviceClient = createClient(apiUrl, serviceRoleKey, authOptions);
  const signedIn = await anonymousClient.auth.signInWithPassword({
    email: managerEmail,
    password: managerPassword,
  });
  if (signedIn.error || !signedIn.data.session || !signedIn.data.user) {
    throw new Error("Unable to sign in with the seeded local manager fixture.");
  }
  const accessToken = signedIn.data.session.access_token;
  const managerUserId = signedIn.data.user.id;
  const managerClient = createClient(apiUrl, publishableKey, {
    ...authOptions,
    global: { headers: { Authorization: "Bearer " + accessToken } },
  });

  const profileResult = await serviceClient
    .from("profiles")
    .select("id,organization_id,is_active")
    .eq("auth_user_id", managerUserId)
    .maybeSingle();
  if (profileResult.error || !profileResult.data || profileResult.data.is_active !== true) {
    throw new Error("The seeded manager does not have an active tenant profile.");
  }
  const profile = profileResult.data;
  const roleResult = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("profile_id", profile.id);
  if (roleResult.error || !roleResult.data?.some((row) => row.role === "manager")) {
    throw new Error("The local upload fixture must be authenticated with the manager role.");
  }
  const productResult = await serviceClient
    .from("products")
    .select("id,organization_id,image_url")
    .eq("id", PRODUCT_ID)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (productResult.error || !productResult.data || productResult.data.image_url !== null) {
    throw new Error("The seeded local product must exist in the manager tenant with no pre-existing primary image.");
  }

  const bucketResult = await serviceClient.storage.getBucket(PRODUCT_IMAGE_BUCKET);
  if (bucketResult.error || !bucketResult.data) {
    throw new Error("The product-images bucket migration was not applied to local Storage.");
  }
  const bucket = bucketResult.data;
  assert(bucket.public === true, "The product-images bucket must allow public catalogue reads.");
  assert(bucket.file_size_limit === MAX_IMAGE_BYTES, "The bucket must enforce the 8 MiB object limit.");
  assert(
    Array.isArray(bucket.allowed_mime_types) &&
      bucket.allowed_mime_types.length === 1 &&
      bucket.allowed_mime_types[0] === "image/webp",
    "The product-images bucket must allow only image/webp.",
  );
  assertions.push("bucket-is-public-and-restricted-to-webp-8mib");

  const dependencies: ProductImageUploadDependencies = {
    getEnv(name) {
      const values: Record<string, string> = {
        SUPABASE_URL: apiUrl,
        SUPABASE_ANON_KEY: publishableKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      };
      return values[name];
    },
    createAuthClient(url, anonKey) {
      const authClient = createClient(url, anonKey, authOptions);
      const clientForToken = (token: string) =>
        createClient(url, anonKey, {
          ...authOptions,
          global: { headers: { Authorization: "Bearer " + token } },
        });
      return {
        auth: {
          async getUser(token) {
            const { data, error } = await authClient.auth.getUser(token);
            return { data: { user: data.user ? { id: data.user.id } : null }, error };
          },
        },
        async setProductImageUrl(token, productId, expectedImageUrl, nextImageUrl) {
          return await clientForToken(token).rpc("set_staff_product_image", {
            p_product_id: productId,
            p_expected_image_url: expectedImageUrl,
            p_image_url: nextImageUrl,
          });
        },
        async addProductGalleryImage(token, productId, imageUrl) {
          return await clientForToken(token).rpc("mutate_staff_product_gallery_image", {
            p_product_id: productId,
            p_image_url: imageUrl,
            p_action: "add",
          });
        },
      };
    },
    createAdminClient(url, serviceKey) {
      const client = createClient(url, serviceKey, authOptions);
      const bucketStorage = client.storage.from(PRODUCT_IMAGE_BUCKET);
      return {
        async getProfileByAuthUserId(authUserId) {
          return await client
            .from("profiles")
            .select("id,organization_id,is_active")
            .eq("auth_user_id", authUserId)
            .maybeSingle();
        },
        async getRoles(profileId) {
          return await client
            .from("user_roles")
            .select("role")
            .eq("profile_id", profileId);
        },
        async productExists(productId, organizationId) {
          return await client
            .from("products")
            .select("id")
            .eq("id", productId)
            .eq("organization_id", organizationId)
            .maybeSingle();
        },
        storage: {
          async upload(objectPath, bytes, options) {
            const buffer = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(buffer).set(bytes);
            const { error } = await bucketStorage.upload(objectPath, buffer, options);
            return { error };
          },
          async remove(paths) {
            const { error } = await bucketStorage.remove(paths);
            return { error };
          },
          getPublicUrl(objectPath) {
            const generated = bucketStorage.getPublicUrl(objectPath).data.publicUrl;
            const parsed = new URL(generated);
            if (parsed.origin !== api.origin || parsed.pathname.length === 0) {
              throw new Error("Local Storage returned a public URL outside the isolated local API origin.");
            }
            // The production RPC intentionally requires HTTPS. Use a test-only HTTPS origin,
            // then map it back to this local API for the unauthenticated public-read assertion.
            return { data: { publicUrl: "https://storage.local.test" + parsed.pathname } };
          },
        },
      };
    },
    randomUUID: () => activeObjectUuid,
  };

  let activeObjectUuid = crypto.randomUUID();
  const handler = createProductImageUploadHandler(dependencies);
  const adminStorage = serviceClient.storage.from(PRODUCT_IMAGE_BUCKET);
  let primaryObjectPath: string | null = null;
  let primaryPublicUrl: string | null = null;
  let primaryLinked = false;

  try {
    const directPath = profile.organization_id + "/" + PRODUCT_ID + "/" + crypto.randomUUID() + ".webp";
    const directAttempt = await managerClient.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(directPath, WEBP_BUFFER, { contentType: "image/webp", upsert: false });
    if (!directAttempt.error) {
      await adminStorage.remove([directPath]);
      throw new Error("An authenticated manager unexpectedly wrote directly to storage.objects.");
    }
    const directMessage = errorMessage(directAttempt.error);
    assert(
      statusCode(directAttempt.error) === 401 ||
        statusCode(directAttempt.error) === 403 ||
        /row-level security|permission denied|not authorized/i.test(directMessage),
      "Direct Storage denial must be an authorization/RLS failure, not a missing bucket or network error: " + directMessage,
    );
    assertions.push("authenticated-manager-cannot-write-storage-directly");

    const wrongMimePath = profile.organization_id + "/" + PRODUCT_ID + "/" + crypto.randomUUID() + ".webp";
    const wrongMime = await adminStorage.upload(
      wrongMimePath,
      new Blob([WEBP_BUFFER], { type: "image/png" }),
      { contentType: "image/png", upsert: false },
    );
    if (!wrongMime.error) {
      await adminStorage.remove([wrongMimePath]);
      throw new Error("Local Storage unexpectedly accepted image/png in the WebP-only bucket.");
    }
    assert(
      /mime|content.?type|allowed|image\/webp/i.test(errorMessage(wrongMime.error)),
      "Wrong-MIME rejection must come from the bucket's allowed-MIME policy: " + errorMessage(wrongMime.error),
    );
    assertions.push("storage-api-rejects-non-webp-mime");

    const oversizedPath = profile.organization_id + "/" + PRODUCT_ID + "/" + crypto.randomUUID() + ".webp";
    const oversizedBuffer = new ArrayBuffer(MAX_IMAGE_BYTES + 1);
    const oversized = await adminStorage.upload(
      oversizedPath,
      oversizedBuffer,
      { contentType: "image/webp", upsert: false },
    );
    if (!oversized.error) {
      await adminStorage.remove([oversizedPath]);
      throw new Error("Local Storage unexpectedly accepted an object larger than 8 MiB.");
    }
    assert(
      statusCode(oversized.error) === 413 || /too large|maximum|limit|exceed/i.test(errorMessage(oversized.error)),
      "Oversized upload must be rejected by the actual Storage API size limit: " + errorMessage(oversized.error),
    );
    assertions.push("storage-api-enforces-eight-mib-object-limit");

    activeObjectUuid = crypto.randomUUID();
    const primaryResponse = await handler(makeUploadRequest(accessToken, PRODUCT_ID));
    const primaryBody = await readJson(primaryResponse);
    assert(primaryResponse.status === 200, "Primary upload through the shared handler failed: " + JSON.stringify(primaryBody));
    assert(primaryBody.image_linked === true && primaryBody.image_role === "primary", "The handler did not report a linked primary image.");
    assert(typeof primaryBody.object_path === "string" && typeof primaryBody.public_url === "string", "The upload response omitted its object identity.");
    primaryObjectPath = primaryBody.object_path;
    primaryPublicUrl = primaryBody.public_url;
    primaryLinked = true;
    const expectedPath = profile.organization_id + "/" + PRODUCT_ID + "/" + activeObjectUuid + ".webp";
    assert(primaryObjectPath === expectedPath, "The server-generated object path did not match the tenant/product/opaque UUID contract.");
    assert(primaryPublicUrl === "https://storage.local.test/storage/v1/object/public/" + PRODUCT_IMAGE_BUCKET + "/" + expectedPath,
      "The test-only HTTPS URL did not preserve the canonical public object path.");
    const linkedProduct = await serviceClient
      .from("products")
      .select("image_url")
      .eq("id", PRODUCT_ID)
      .eq("organization_id", profile.organization_id)
      .single();
    assert(!linkedProduct.error && linkedProduct.data.image_url === primaryPublicUrl, "The manager RPC did not atomically persist the exact primary image URL.");
    assertions.push("edge-handler-uploads-through-service-role-and-links-via-manager-rpc");

    const publicReadUrl = api.origin + new URL(primaryPublicUrl).pathname;
    const publicRead = await fetch(publicReadUrl, { method: "GET", redirect: "error" });
    assert(publicRead.status === 200, "Unauthenticated public image read did not return HTTP 200.");
    assert((publicRead.headers.get("content-type") ?? "").toLowerCase().startsWith("image/webp"), "Public image response MIME was not image/webp.");
    const publicBytes = new Uint8Array(await publicRead.arrayBuffer());
    assert(
      publicBytes.byteLength === new Uint8Array(WEBP_BUFFER).byteLength &&
        publicBytes.every((value, index) => value === new Uint8Array(WEBP_BUFFER)[index]),
      "Public image response bytes differ from the uploaded WebP fixture.",
    );
    const privateDownload = await adminStorage.download(primaryObjectPath);
    assert(!privateDownload.error && privateDownload.data, "The service-role Storage API could not read the uploaded object.");
    const storedBytes = new Uint8Array(await privateDownload.data.arrayBuffer());
    assert(storedBytes.length === publicBytes.length && storedBytes.every((value, index) => value === publicBytes[index]),
      "Service-role download bytes differ from the unauthenticated public read.");
    assertions.push("public-object-read-works-without-authentication");

    const staleUuid = crypto.randomUUID();
    activeObjectUuid = staleUuid;
    const staleResponse = await handler(makeUploadRequest(accessToken, PRODUCT_ID));
    const staleBody = await readJson(staleResponse);
    assert(staleResponse.status === 409 && staleBody.error === "image_link_changed",
      "A stale primary image version must return HTTP 409 image_link_changed; received HTTP " +
        staleResponse.status + " body=" + JSON.stringify(staleBody));
    const stalePath = profile.organization_id + "/" + PRODUCT_ID + "/" + staleUuid + ".webp";
    const staleDownload = await adminStorage.download(stalePath);
    assert(staleDownload.error, "The stale upload object remained in Storage after the atomic link conflict.");
    assertions.push("stale-image-link-rolls-back-object-upload");

    const unlinkResponse = await handler(makeJsonRequest(accessToken, {
      action: "unlink",
      product_id: PRODUCT_ID,
      expected_image_url: primaryPublicUrl,
      object_path: primaryObjectPath,
    }));
    const unlinkBody = await readJson(unlinkResponse);
    assert(unlinkResponse.status === 200 && unlinkBody.unlinked === true && unlinkBody.cleaned === true,
      "The authenticated unlink command did not unlink and clean the primary object.");
    primaryLinked = false;
    const unlinkedProduct = await serviceClient
      .from("products")
      .select("image_url")
      .eq("id", PRODUCT_ID)
      .eq("organization_id", profile.organization_id)
      .single();
    assert(!unlinkedProduct.error && unlinkedProduct.data.image_url === null,
      "Unlink must clear the database pointer before Storage cleanup.");
    const removedDownload = await adminStorage.download(primaryObjectPath);
    assert(removedDownload.error, "The object still exists after a successful unlink cleanup.");
    assertions.push("unlink-removes-database-reference-before-object-cleanup");

    await writeProof("PASS");
    process.stdout.write("PRODUCT_IMAGE_STORAGE_ACCEPTANCE_PASS assertions=" + assertions.length + " sourceSha=" + sourceSha + "\n");
  } finally {
    if (primaryLinked && primaryObjectPath && primaryPublicUrl) {
      // Best-effort safe rollback for a failed assertion: only the authenticated RPC may unlink.
      const cleanupResponse = await handler(makeJsonRequest(accessToken, {
        action: "unlink",
        product_id: PRODUCT_ID,
        expected_image_url: primaryPublicUrl,
        object_path: primaryObjectPath,
      })).catch(() => null);
      if (!cleanupResponse || cleanupResponse.status !== 200) {
        const current = await serviceClient.from("products").select("image_url").eq("id", PRODUCT_ID).maybeSingle();
        if (current.data?.image_url !== primaryPublicUrl) {
          await adminStorage.remove([primaryObjectPath]).catch(() => undefined);
        }
        // If the product still references this URL, intentionally retain the object to avoid a broken reference.
      }
    }
  }
}

main().catch(async (error) => {
  const message = errorMessage(error).slice(0, 1000);
  try {
    await writeProof("FAIL", message);
  } catch (proofError) {
    process.stderr.write("Unable to write Storage acceptance failure proof: " + errorMessage(proofError) + "\n");
  }
  process.stderr.write("PRODUCT_IMAGE_STORAGE_ACCEPTANCE_FAIL " + message + "\n");
  process.exitCode = 1;
});
