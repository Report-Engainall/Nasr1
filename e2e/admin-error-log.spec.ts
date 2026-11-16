import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.describe.configure({ retries: 0 });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local runtime-error browser acceptance.");
  return value;
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

test("authenticated manager records, acknowledges and resolves a persisted browser error", async ({ browser }) => {
  test.setTimeout(150_000);

  const sourceSha = requiredEnv("E2E_SOURCE_SHA");
  const localSupabase = new URL(requiredEnv("E2E_SUPABASE_URL"));
  if (
    localSupabase.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(localSupabase.hostname) ||
    localSupabase.port !== "54321"
  ) {
    throw new Error("Runtime-error browser acceptance is restricted to the disposable local Supabase API.");
  }

  const context: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await signIn(page, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"));
    await page.goto("/admin/error-log");
    await expect(page.getByRole("heading", { name: "سجل الأخطاء", exact: true })).toBeVisible({ timeout: 30_000 });
    const statusFilter = page.locator("#runtime-error-status");
    await expect(statusFilter).toHaveValue("open");

    // Response 598 gives this synthetic event a distinctive, non-customer-data fingerprint.
    // The reporter must send only the three allowlisted diagnostic fields.
    const privateCanary = "P2_RUNTIME_ERROR_PRIVATE_CANARY_9113259";
    const recordResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/rest/v1/rpc/record_runtime_error_event") &&
      response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.evaluate((message) => {
      window.dispatchEvent(new ErrorEvent("error", {
        message,
        error: new Response(null, { status: 598 }),
      }));
    }, privateCanary);

    const recordResponse = await recordResponsePromise;
    expect(recordResponse.ok(), "The authenticated browser reporter must persist through the local RPC.").toBe(true);
    const recordPayload = JSON.parse(recordResponse.request().postData() ?? "null") as Record<string, unknown>;
    expect(recordPayload).toEqual({
      p_error_kind: "response_error",
      p_http_status: 598,
      p_boundary: "window_error",
    });
    expect(JSON.stringify(recordPayload)).not.toContain(privateCanary);

    await expect(page.getByRole("button", { name: "تحديث السجل" })).toBeEnabled();
    await page.getByRole("button", { name: "تحديث السجل" }).click();
    const errorRow = () => page.getByRole("row")
      .filter({ hasText: "HTTP 598" })
      .filter({ hasText: "خطأ نافذة المتصفح" });
    await expect(errorRow()).toBeVisible({ timeout: 30_000 });
    await expect(errorRow()).toContainText("استجابة HTTP");
    expect(await page.locator("body").innerText()).not.toContain(privateCanary);

    const acknowledgePromise = page.waitForResponse((response) =>
      response.url().includes("/rest/v1/rpc/transition_runtime_error_event") &&
      response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await errorRow().getByRole("button", { name: /إقرار الخطأ/ }).click();
    const acknowledgeResponse = await acknowledgePromise;
    expect(acknowledgeResponse.ok()).toBe(true);
    await expect(errorRow()).toBeHidden();

    await statusFilter.selectOption("acknowledged");
    await expect(errorRow()).toBeVisible({ timeout: 30_000 });
    await expect(errorRow()).toContainText("تم الإقرار");

    const resolvePromise = page.waitForResponse((response) =>
      response.url().includes("/rest/v1/rpc/transition_runtime_error_event") &&
      response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await errorRow().getByRole("button", { name: /حل الخطأ/ }).click();
    const resolveResponse = await resolvePromise;
    expect(resolveResponse.ok()).toBe(true);
    await expect(errorRow()).toBeHidden();

    await statusFilter.selectOption("all");
    await expect(errorRow()).toBeVisible({ timeout: 30_000 });
    await expect(errorRow()).toContainText("تم الحل");
    await page.reload();
    await statusFilter.selectOption("all");
    await expect(errorRow()).toBeVisible({ timeout: 30_000 });
    await expect(errorRow()).toContainText("تم الحل");
    expect(await page.locator("body").innerText()).not.toContain(privateCanary);
    expect(pageErrors).toEqual([]);

    const proof = {
      result: "PASS",
      browserResult: "BROWSER_PROVEN",
      sourceSha,
      environment: "disposable-local-supabase-postgresql-17",
      route: "/admin/error-log",
      authenticatedRole: "manager",
      reporter: {
        browserErrorEventCaptured: true,
        recordRpcAccepted: recordResponse.status(),
        onlyAllowlistedFieldsSent: true,
        rawMessageOrCanaryExcluded: true,
      },
      triage: {
        openToAcknowledged: true,
        acknowledgedToResolved: true,
        resolvedStateSurvivesReload: true,
      },
      browserRuntimeErrors: pageErrors,
      noProductionWrites: true,
    };
    await test.info().attach("runtime-error-log-browser-proof.json", {
      body: JSON.stringify(proof, null, 2),
      contentType: "application/json",
    });
  } finally {
    await context.close().catch(() => undefined);
  }
});
