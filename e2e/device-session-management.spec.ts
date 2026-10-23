import { expect, test, type Page } from "@playwright/test";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated local device-session browser acceptance.");
  return value;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });
  const persistedSession = await page.evaluate(() =>
    Object.entries(window.localStorage).some(([key, value]) => {
      if (!key.endsWith("-auth-token")) return false;
      try {
        const record = JSON.parse(value) as { access_token?: unknown };
        return typeof record.access_token === "string" && record.access_token.length > 20;
      } catch {
        return false;
      }
    }),
  );
  expect(persistedSession, "The browser must store a real local Supabase session before device controls are tested.").toBe(true);
}

async function currentSessionId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    for (const [key, value] of Object.entries(window.localStorage)) {
      if (!key.endsWith("-auth-token")) continue;
      try {
        const record = JSON.parse(value) as { access_token?: unknown };
        if (typeof record.access_token !== "string") continue;
        const payload = record.access_token.split(".")[1];
        if (!payload) continue;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as {
          session_id?: unknown;
        };
        if (typeof claims.session_id === "string") return claims.session_id;
      } catch {
        // Continue through local Supabase storage entries; never return or log the token.
      }
    }
    return null;
  });
  expect(id, "Supabase must issue a session_id claim for the authenticated browser.").toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  return id as string;
}

async function expectProtectedTenantRpcDenied(page: Page) {
  const url = requiredEnv("E2E_SUPABASE_URL");
  const key = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
  const result = await page.evaluate(async ({ apiUrl, publishableKey }) => {
    let token: string | null = null;
    for (const [storageKey, value] of Object.entries(window.localStorage)) {
      if (!storageKey.endsWith("-auth-token")) continue;
      try {
        const stored = JSON.parse(value) as { access_token?: unknown };
        if (typeof stored.access_token === "string") {
          token = stored.access_token;
          break;
        }
      } catch {
        // Ignore unrelated entries.
      }
    }
    if (!token) throw new Error("Protected-request check has no stored browser access token.");
    const response = await fetch(apiUrl.replace(/\/$/, "") + "/rest/v1/rpc/get_current_tenant_context", {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    return { ok: response.ok, status: response.status };
  }, { apiUrl: url, publishableKey: key });
  expect(result.ok, "A revoked but not-yet-expired JWT must lose protected tenant context immediately.").toBe(false);
  expect(result.status).toBeGreaterThanOrEqual(400);
}

test.describe("central device-session management — real local Supabase", () => {
  test("administrator revokes the exact same-tenant staff session and subsequent protected requests are denied", async ({ browser }) => {
    const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL");
    const adminPassword = requiredEnv("E2E_DEVICE_ADMIN_PASSWORD");
    const targetEmail = requiredEnv("E2E_DEVICE_TARGET_EMAIL");
    const targetPassword = requiredEnv("E2E_DEVICE_TARGET_PASSWORD");
    const targetName = "P2 Local E2E Manager";
    const targetContext = await browser.newContext();
    const adminContext = await browser.newContext();
    try {
      const targetPage = await targetContext.newPage();
      await signIn(targetPage, targetEmail, targetPassword);
      const revokedSessionId = await currentSessionId(targetPage);

      const adminPage = await adminContext.newPage();
      await signIn(adminPage, adminEmail, adminPassword);
      await adminPage.goto("/admin/devices");
      await expect(adminPage.getByRole("heading", { name: "جلسات المؤسسة المسجلة خادميًا" })).toBeVisible();
      const targetRow = adminPage.locator("article").filter({ hasText: targetEmail });
      await expect(targetRow).toBeVisible();
      await expect(targetRow.getByText(revokedSessionId.slice(0, 8))).toBeVisible();
      await expect(targetRow.getByRole("button", { name: "إبطال جلسة " + targetName })).toBeEnabled();

      let confirmedDialog = false;
      adminPage.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain(targetEmail);
        confirmedDialog = true;
        await dialog.accept();
      });
      await targetRow.getByRole("button", { name: "إبطال جلسة " + targetName }).click();

      await expect(adminPage.getByText(/أكد الخادم إبطال الجلسة المحددة/)).toBeVisible();
      expect(confirmedDialog, "Revocation must require explicit browser confirmation.").toBe(true);
      await expect(targetRow).toHaveCount(0);
      const currentAdminRow = adminPage.locator("article")
        .filter({ hasText: adminEmail })
        .filter({ hasText: "الجلسة الحالية" });
      await expect(currentAdminRow).toBeVisible();
      await expect(currentAdminRow.getByRole("button", { name: /إبطال جلسة/ })).toBeDisabled();

      await expectProtectedTenantRpcDenied(targetPage);
    } finally {
      await targetContext.close();
      await adminContext.close();
    }
  });

  test("self-scoped bulk sign-out preserves the current admin session and rejects a sibling session token", async ({ browser }) => {
    const adminEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL");
    const adminPassword = requiredEnv("E2E_DEVICE_ADMIN_PASSWORD");
    const currentContext = await browser.newContext();
    const siblingContext = await browser.newContext();
    try {
      const currentPage = await currentContext.newPage();
      const siblingPage = await siblingContext.newPage();
      await signIn(currentPage, adminEmail, adminPassword);
      await signIn(siblingPage, adminEmail, adminPassword);
      const currentId = await currentSessionId(currentPage);
      const siblingId = await currentSessionId(siblingPage);
      expect(siblingId).not.toBe(currentId);

      await currentPage.goto("/admin/devices");
      await expect(currentPage.getByRole("heading", { name: "جلسات المؤسسة المسجلة خادميًا" })).toBeVisible();
      const siblingRow = currentPage.locator("article").filter({ hasText: siblingId.slice(0, 8) });
      await expect(siblingRow).toBeVisible();
      await expect(siblingRow.getByText("جلسة أخرى لحسابك")).toBeVisible();
      await expect(siblingRow.getByRole("button", { name: /جلسة جهاز|إبطال جلسة/ })).toBeDisabled();

      await currentPage.getByRole("button", { name: "تسجيل الخروج من الأجهزة الأخرى" }).click();
      await expect(currentPage.getByText(/أكد الخادم إبطال \d+ جلسة أخرى لهذا الحساب/)).toBeVisible();
      await expect(siblingRow).toHaveCount(0);
      const currentRow = currentPage.locator("article")
        .filter({ hasText: currentId.slice(0, 8) })
        .filter({ hasText: "الجلسة الحالية" });
      await expect(currentRow).toBeVisible();
      await expectProtectedTenantRpcDenied(siblingPage);
    } finally {
      await currentContext.close();
      await siblingContext.close();
    }
  });
});
