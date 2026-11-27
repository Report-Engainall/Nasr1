import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  createProductImageUploadHandler,
  PRODUCT_IMAGE_BUCKET,
} from "../supabase/functions/_shared/product-image-upload-handler.ts";

const PRODUCT_ID = requiredEnv("E2E_PRODUCT_ID");
const FOREIGN_PRODUCT_ID = requiredEnv("E2E_FOREIGN_PRODUCT_ID");
const ORGANIZATION_ID = "a0000000-0000-0000-0000-000000000001";
const SUPABASE_URL = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const MANAGER_EMAIL = requiredEnv("E2E_MANAGER_EMAIL");
const MANAGER_PASSWORD = requiredEnv("E2E_MANAGER_PASSWORD");
const CUSTOMER_EMAIL = requiredEnv("E2E_EMAIL");
const CUSTOMER_PASSWORD = requiredEnv("E2E_PASSWORD");
const SOURCE_SHA = requiredEnv("E2E_SOURCE_SHA");
const PROOF_PATH = requiredEnv("PRODUCT_IMAGE_UI_PROOF_PATH");

const LOCAL_API = new URL(SUPABASE_URL);
if (
  LOCAL_API.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(LOCAL_API.hostname) ||
  LOCAL_API.port !== "54321"
) {
  throw new Error("Product-image browser acceptance is restricted to disposable local Supabase at 127.0.0.1:54321.");
}

const WEBP_BYTES = [
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
] as const;
const WEBP_FIXTURE = new Uint8Array(WEBP_BYTES);
const WEBP_ARRAY_BUFFER = new ArrayBuffer(WEBP_BYTES.length);
new Uint8Array(WEBP_ARRAY_BUFFER).set(WEBP_BYTES);
const WEBP_BLOB = new Blob([WEBP_ARRAY_BUFFER], { type: "image/webp" });
const PNG_FIXTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=",
  "base64",
);

type UploadMode = "primary" | "gallery";

type HandlerCall = {
  productId: string;
  mode: UploadMode | "command";
  status: number;
  body: Record<string, unknown> | null;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local product-image browser acceptance.");
  return value;
}

function createUploadHarness() {
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const bucket = service.storage.from(PRODUCT_IMAGE_BUCKET);
  const uploadedObjectPaths: string[] = [];
  const calls: HandlerCall[] = [];
  let activeMode: UploadMode = "primary";
  let failFirstGalleryUpload = true;
  let injectedGalleryFailure = false;

  function authClientFor(token: string) {
    return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: "Bearer " + token } },
    });
  }

  const handler = createProductImageUploadHandler({
    getEnv(name) {
      if (name === "SUPABASE_URL") return SUPABASE_URL;
      if (name === "SUPABASE_ANON_KEY") return SUPABASE_PUBLISHABLE_KEY;
      if (name === "SUPABASE_SERVICE_ROLE_KEY") return SUPABASE_SERVICE_ROLE_KEY;
      return undefined;
    },
    createAuthClient(url, anonKey) {
      const auth = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      return {
        auth: { getUser: (token) => auth.auth.getUser(token) },
        async setProductImageUrl(token, productId, expectedImageUrl, nextImageUrl) {
          const client = authClientFor(token);
          const result = await client.rpc("set_staff_product_image", {
            p_product_id: productId,
            p_expected_image_url: expectedImageUrl,
            p_image_url: nextImageUrl,
          });
          return { data: result.data, error: result.error };
        },
        async addProductGalleryImage(token, productId, imageUrl) {
          const client = authClientFor(token);
          const result = await client.rpc("mutate_staff_product_gallery_image", {
            p_product_id: productId,
            p_image_url: imageUrl,
            p_action: "add",
          });
          return { data: result.data, error: result.error };
        },
      };
    },
    createAdminClient(url, serviceKey) {
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      return {
        async getProfileByAuthUserId(authUserId) {
          const result = await admin
            .from("profiles")
            .select("id,organization_id,is_active")
            .eq("auth_user_id", authUserId)
            .maybeSingle();
          return { data: result.data, error: result.error };
        },
        async getRoles(profileId) {
          const result = await admin
            .from("user_roles")
            .select("role")
            .eq("profile_id", profileId);
          return { data: result.data, error: result.error };
        },
        async productExists(productId, organizationId) {
          const result = await admin
            .from("products")
            .select("id")
            .eq("id", productId)
            .eq("organization_id", organizationId)
            .maybeSingle();
          return { data: result.data, error: result.error };
        },
        storage: {
          async upload(objectPath, bytes, options) {
            if (activeMode === "gallery" && failFirstGalleryUpload) {
              failFirstGalleryUpload = false;
              injectedGalleryFailure = true;
              return { error: new Error("one-time local Storage interruption injected by the acceptance test") };
            }
            const result = await bucket.upload(objectPath, bytes, options);
            if (!result.error) uploadedObjectPaths.push(objectPath);
            return { error: result.error };
          },
          async remove(paths) {
            const result = await bucket.remove(paths);
            return { error: result.error };
          },
          getPublicUrl(objectPath) {
            const actualUrl = bucket.getPublicUrl(objectPath).data.publicUrl;
            const parsed = new URL(actualUrl);
            return {
              data: {
                // The shared production RPC requires HTTPS image references. Keep the
                // browser URL stable and map its reads to the real local Storage API.
                publicUrl: "https://storage.local.test" + parsed.pathname,
              },
            };
          },
        },
      };
    },
  });

  async function handleRequest(request: Request): Promise<Response> {
    const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const modeHeader = request.headers.get("x-image-mode");
    activeMode = modeHeader === "gallery" ? "gallery" : "primary";
    const response = await handler(request);
    const body = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
    calls.push({
      productId: request.headers.get("x-product-id") ?? "",
      mode: contentType === "application/json" ? "command" : activeMode,
      status: response.status,
      body,
    });
    return response;
  }

  async function installBrowserRoutes(page: Page): Promise<void> {
    await page.route("**/functions/v1/product-image-upload", async (route: Route) => {
      const browserRequest = route.request();
      const method = browserRequest.method();
      const body = method === "GET" || method === "HEAD" ? undefined : browserRequest.postDataBuffer() ?? undefined;
      const response = await handleRequest(new Request(browserRequest.url(), {
        method,
        headers: browserRequest.headers(),
        body,
      }));
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      });
    });
    await page.route("https://storage.local.test/**", async (route: Route) => {
      const objectPath = new URL(route.request().url()).pathname;
      await route.continue({ url: SUPABASE_URL + objectPath });
    });
  }

  async function directGalleryUpload(token: string, productId: string) {
    activeMode = "gallery";
    const response = await handleRequest(new Request("https://edge-handler.local/product-image-upload", {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "image/webp",
        "x-product-id": productId,
        "x-image-mode": "gallery",
      },
      body: WEBP_BLOB,
    }));
    const body = await response.json() as Record<string, unknown>;
    return { status: response.status, body };
  }

  async function objectExists(objectPath: string): Promise<boolean> {
    const result = await bucket.download(objectPath);
    return !result.error && Boolean(result.data);
  }

  return {
    service,
    calls,
    uploadedObjectPaths,
    injectedGalleryFailure: () => injectedGalleryFailure,
    installBrowserRoutes,
    directGalleryUpload,
    objectExists,
  };
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => Object.entries(window.localStorage).some(([key, value]) => {
    if (!key.endsWith("-auth-token")) return false;
    try {
      const token = (JSON.parse(value) as { access_token?: unknown }).access_token;
      return typeof token === "string" && token.length > 20;
    } catch {
      return false;
    }
  }))).toBe(true);
}

async function accessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (!key.endsWith("-auth-token")) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as { access_token?: unknown } | null;
        if (typeof parsed?.access_token === "string") return parsed.access_token;
      } catch {
        // Ignore unrelated local-storage values.
      }
    }
    throw new Error("The authenticated browser session has no Supabase access token.");
  });
}

async function browserUpload(
  page: Page,
  productId: string,
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(async (input) => {
    const response = await fetch(input.url + "/functions/v1/product-image-upload", {
      method: "POST",
      headers: {
        apikey: input.publishableKey,
        authorization: "Bearer " + input.token,
        "content-type": "image/webp",
        "x-product-id": input.productId,
      },
      body: new Uint8Array(input.bytes),
    });
    return {
      status: response.status,
      body: await response.json() as Record<string, unknown>,
    };
  }, {
    url: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    token,
    productId,
    bytes: Array.from(WEBP_FIXTURE),
  });
}

async function openUploader(page: Page): Promise<void> {
  const details = page.locator("details").filter({
    hasText: "محرك الصور — مطابقة ورفع صور الأصناف دفعة واحدة",
  }).first();
  await expect(details).toBeVisible();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").click();
  }
  await expect(page.getByLabel("اختر عدة صور (JPG / PNG / WebP)")).toBeEnabled({ timeout: 30_000 });
}

async function readProductMedia(service: ReturnType<typeof createClient>) {
  const product = await service
    .from("products")
    .select("id,organization_id,image_url")
    .eq("id", PRODUCT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .single();
  if (product.error || !product.data) throw new Error("The isolated product fixture could not be read after upload.");
  const media = await service
    .from("product_media")
    .select("id,url,is_primary,sort_order")
    .eq("product_id", PRODUCT_ID)
    .order("sort_order", { ascending: true });
  if (media.error) throw new Error("The isolated product media records could not be read.");
  return { product: product.data, media: media.data ?? [] };
}

test("manager completes the real admin image-upload journey against local Storage", async ({ browser }) => {
  test.setTimeout(240_000);
  const harness = createUploadHarness();
  const managerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const manager = await managerContext.newPage();
  const browserErrors: string[] = [];
  manager.on("pageerror", (error) => browserErrors.push(error.message));

  let managerToken = "";
  let testFailure: unknown;
  let cleanupCompleted = false;
  const proof: Record<string, unknown> = {
    result: "IN_PROGRESS",
    sourceSha: SOURCE_SHA,
    environment: "disposable-local-supabase-postgresql-17-and-real-storage-api",
    route: "/admin/products",
    productId: PRODUCT_ID,
    foreignProductId: FOREIGN_PRODUCT_ID,
    checks: {},
  };

  try {
    const initial = await readProductMedia(harness.service);
    expect(initial.product.image_url).toBeNull();
    expect(initial.media).toHaveLength(0);

    await harness.installBrowserRoutes(manager);
    await signIn(manager, MANAGER_EMAIL, MANAGER_PASSWORD);
    managerToken = await accessToken(manager);
    await manager.goto("/admin/products");
    await expect(manager.getByRole("heading", { name: "إدارة المنتجات", exact: true })).toBeVisible({ timeout: 30_000 });
    await openUploader(manager);

    const input = manager.getByLabel("اختر عدة صور (JPG / PNG / WebP)");
    await input.setInputFiles([
      { name: "P2-LOCAL-E2E-001.png", mimeType: "image/png", buffer: PNG_FIXTURE },
      { name: "P2-LOCAL-E2E-001__2.png", mimeType: "image/png", buffer: PNG_FIXTURE },
    ]);
    await manager.getByRole("button", { name: "رفع الصور المطابقة", exact: true }).click();

    const resultRegion = manager.getByRole("region", { name: "نتائج رفع الصور", exact: true });
    await expect(resultRegion.getByRole("status")).toContainText("تعذر 1", { timeout: 45_000 });
    await expect(resultRegion).toContainText("الصورة الرئيسية");
    await expect(resultRegion).toContainText("صورة إضافية");
    await expect(manager.getByRole("button", { name: "إعادة محاولة الصور الفاشلة (1)", exact: true })).toBeEnabled();
    expect(harness.injectedGalleryFailure()).toBe(true);

    const afterFirstAttempt = await readProductMedia(harness.service);
    expect(afterFirstAttempt.product.image_url).toMatch(/^https:\/\/storage\.local\.test\//);
    expect(afterFirstAttempt.media.filter((item) => item.is_primary)).toHaveLength(1);
    expect(afterFirstAttempt.media.filter((item) => !item.is_primary)).toHaveLength(0);

    await manager.getByRole("button", { name: "إعادة محاولة الصور الفاشلة (1)", exact: true }).click();
    await expect(resultRegion.getByRole("status")).toContainText("تعذر 0", { timeout: 45_000 });
    await expect(resultRegion.getByRole("alert")).toHaveCount(0);
    const afterRetry = await readProductMedia(harness.service);
    expect(afterRetry.product.image_url).toBeTruthy();
    expect(afterRetry.media.filter((item) => item.is_primary)).toHaveLength(1);
    expect(afterRetry.media.filter((item) => !item.is_primary)).toHaveLength(1);

    const browserUploadCalls = harness.calls.filter((call) => call.productId === PRODUCT_ID && call.mode !== "command");
    expect(browserUploadCalls.filter((call) => call.mode === "primary" && call.status === 200)).toHaveLength(1);
    expect(browserUploadCalls.filter((call) => call.mode === "gallery")).toHaveLength(2);
    expect(browserUploadCalls.filter((call) => call.mode === "gallery" && call.status === 502)).toHaveLength(1);
    expect(browserUploadCalls.filter((call) => call.mode === "gallery" && call.status === 200)).toHaveLength(1);

    await manager.reload();
    await expect(manager.getByRole("heading", { name: "إدارة المنتجات", exact: true })).toBeVisible({ timeout: 30_000 });
    await openUploader(manager);
    await expect(manager.getByLabel("إجمالي الصور الإضافية")).toHaveText("1");

    // Fill the remaining seven gallery slots through the same authenticated handler
    // and the actual local Storage API. The ninth gallery request must be rejected.
    for (let index = 0; index < 7; index += 1) {
      const galleryResult = await harness.directGalleryUpload(managerToken, PRODUCT_ID);
      expect(galleryResult.status).toBe(200);
      expect(galleryResult.body.image_role).toBe("gallery");
      expect(galleryResult.body.image_linked).toBe(true);
    }
    const atGalleryLimit = await readProductMedia(harness.service);
    expect(atGalleryLimit.media.filter((item) => !item.is_primary)).toHaveLength(8);

    await manager.reload();
    await expect(manager.getByRole("heading", { name: "إدارة المنتجات", exact: true })).toBeVisible({ timeout: 30_000 });
    await openUploader(manager);
    await manager.getByLabel("اختر عدة صور (JPG / PNG / WebP)").setInputFiles({
      name: "P2-LOCAL-E2E-001__10.png",
      mimeType: "image/png",
      buffer: PNG_FIXTURE,
    });
    const galleryLimitMessage = "وصل معرض هذا الصنف إلى الحد الأقصى؛ لم تُرفع هذه الصورة.";
    await expect(manager.getByText(galleryLimitMessage, { exact: true })).toBeVisible();
    const blockedUploadButton = manager.getByRole("button", { name: "رفع الصور المطابقة", exact: true });
    await expect(blockedUploadButton).toBeDisabled();

    // The UI blocks a ninth file before upload. Independently call the same shared
    // handler once to prove PostgreSQL rejects a bypass attempt and its object rolls back.
    const limitResult = await harness.directGalleryUpload(managerToken, PRODUCT_ID);
    expect(limitResult.status).toBe(409);
    expect(limitResult.body.error).toBe("gallery_limit_reached");
    const limitResponse = harness.calls.filter((call) =>
      call.productId === PRODUCT_ID &&
      call.mode === "gallery" &&
      call.status === 409 &&
      call.body?.error === "gallery_limit_reached",
    ).slice(-1)[0];
    expect(limitResponse).toBeTruthy();
    const afterLimitAttempt = await readProductMedia(harness.service);
    expect(afterLimitAttempt.media.filter((item) => !item.is_primary)).toHaveLength(8);
    const rejectedObjectPath = harness.uploadedObjectPaths[harness.uploadedObjectPaths.length - 1];
    expect(rejectedObjectPath).toBeTruthy();
    expect(await harness.objectExists(rejectedObjectPath!)).toBe(false);

    const crossTenant = await browserUpload(manager, FOREIGN_PRODUCT_ID, managerToken);
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.error).toBe("product_not_in_organization");

    const customerContext = await browser.newContext();
    const customer = await customerContext.newPage();
    try {
      await harness.installBrowserRoutes(customer);
      await signIn(customer, CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
      const customerToken = await accessToken(customer);
      const customerDenied = await browserUpload(customer, PRODUCT_ID, customerToken);
      expect(customerDenied.status).toBe(403);
      expect(customerDenied.body.error).toBe("product_image_permission_required");
    } finally {
      await customerContext.close();
    }

    expect(browserErrors).toEqual([]);
    proof.result = "PASS";
    proof.browserResult = "BROWSER_PROVEN";
    proof.noProductionWrites = true;
    proof.checks = {
      managerAuthenticatedBrowserJourney: true,
      primaryAndGalleryPlacement: true,
      failedGalleryRetryOnly: true,
      successfulPrimaryWasNotUploadedAgain: true,
      persistedMediaSurvivedBrowserReload: true,
      galleryLimitVisibleAndBlockedInUi: true,
      galleryLimitEightEnforcedByPostgresAndHandler: true,
      ninthGalleryObjectCleanedAfterDenial: true,
      crossTenantProductUploadDenied: true,
      customerUploadDenied: true,
      storageApiWasRealLocalSupabase: true,
      browserRuntimeErrors: browserErrors,
      primaryUploads: browserUploadCalls.filter((call) => call.mode === "primary").length,
      galleryAttemptsInBrowser: browserUploadCalls.filter((call) => call.mode === "gallery").length,
      finalGalleryCountBeforeCleanup: 8,
    };
  } catch (error) {
    testFailure = error;
    proof.result = "FAIL";
    proof.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    try {
      // All writes are confined to this deterministic, disposable P2 fixture.
      const media = await harness.service
        .from("product_media")
        .delete()
        .eq("product_id", PRODUCT_ID);
      const product = await harness.service
        .from("products")
        .update({ image_url: null })
        .eq("id", PRODUCT_ID)
        .eq("organization_id", ORGANIZATION_ID);
      const storage = harness.uploadedObjectPaths.length
        ? await harness.service.storage.from(PRODUCT_IMAGE_BUCKET).remove([...new Set(harness.uploadedObjectPaths)])
        : { error: null };
      const remaining = await readProductMedia(harness.service);
      cleanupCompleted = !media.error && !product.error && !storage.error &&
        remaining.product.image_url === null && remaining.media.length === 0;
      proof.cleanup = {
        completed: cleanupCompleted,
        removedStorageObjects: harness.uploadedObjectPaths.length,
        remainingMediaRows: remaining.media.length,
      };
    } catch (cleanupError) {
      proof.cleanup = {
        completed: false,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      };
    }

    await managerContext.close().catch(() => undefined);
    if (testFailure) proof.result = "FAIL";
    else if (!cleanupCompleted) proof.result = "FAIL";
    try {
      await writeFile(PROOF_PATH, JSON.stringify(proof, null, 2) + "\n", "utf8");
      await test.info().attach("product-image-admin-browser-proof.json", {
        body: JSON.stringify(proof, null, 2),
        contentType: "application/json",
      });
    } catch (proofError) {
      if (!testFailure && cleanupCompleted) throw proofError;
    }
    if (!testFailure && !cleanupCompleted) {
      throw new Error("Local product-image UI acceptance could not confirm fixture and Storage cleanup.");
    }
  }
});
