import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

type Credentials = { email: string; password: string };
type ViewportCase = {
  name: string;
  width: number;
  height: number;
  isMobile: boolean;
};

const VIEWPORTS: readonly ViewportCase[] = [
  { name: "desktop", width: 1440, height: 960, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated admin observability acceptance.");
  return value;
}

function assertLocalOnly(): void {
  const base = new URL(requiredEnv("E2E_BASE_URL"));
  const api = new URL(requiredEnv("E2E_SUPABASE_URL"));
  const database = new URL(requiredEnv("TEST_DATABASE_URL"));
  const validDatabasePort = /^[1-9][0-9]{0,4}$/.test(database.port) && Number(database.port) <= 65535;
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(base.hostname) ||
    base.port !== "4173" ||
    api.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(api.hostname) ||
    api.port !== "54321" ||
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    !validDatabasePort ||
    !["postgres:", "postgresql:"].includes(database.protocol)
  ) {
    throw new Error("Admin observability acceptance is restricted to the isolated local app, Supabase API and PostgreSQL.");
  }
  if (base.username || base.password || api.username || api.password || database.hostname.includes("@")) {
    throw new Error("Local acceptance URLs must not embed credentials.");
  }
}

function isBudgetResponse(url: string): boolean {
  return new URL(url).pathname.endsWith("/rest/v1/rpc/get_ai_gateway_budget");
}

async function signIn(page: Page, credentials: Credentials): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(credentials.email);
  await page.locator('input[autocomplete="current-password"]').fill(credentials.password);
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
  expect(persistedSession, "A real isolated Supabase session must exist before admin settings are opened.").toBe(true);
}

async function openAdminSettings(page: Page): Promise<void> {
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "الإعدادات العامة", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function verifyDeniedRole(
  browser: Browser,
  viewport: ViewportCase,
  credentials: Credentials,
  role: "accountant" | "customer",
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  try {
    const page = await context.newPage();
    const budgetCalls: string[] = [];
    page.on("request", (request) => {
      if (isBudgetResponse(request.url())) budgetCalls.push(request.url());
    });
    await signIn(page, credentials);
    await openAdminSettings(page);

    if (role === "accountant") {
      expect(await page.getByRole("button", { name: "معمارية النظام", exact: true }).count()).toBe(0);
      expect(await page.getByRole("region", { name: "فحوص صحة النظام" }).count()).toBe(0);
      expect(await page.getByRole("region", { name: "حالة عقود مصادر الوظائف المرجعية" }).count()).toBe(0);
    } else {
      await expect(page.getByRole("heading", { name: "لا تملك صلاحية الإدارة" })).toBeVisible();
      expect(await page.getByRole("button", { name: "معمارية النظام", exact: true }).count()).toBe(0);
      expect(await page.getByRole("region", { name: "فحوص صحة النظام" }).count()).toBe(0);
      expect(await page.getByRole("region", { name: "حالة عقود مصادر الوظائف المرجعية" }).count()).toBe(0);
    }
    expect(budgetCalls, role + " must not invoke the admin budget RPC.").toHaveLength(0);
  } finally {
    await context.close();
  }
}

async function assertPanelFitsViewport(health: Locator, width: number): Promise<void> {
  const bounds = await health.boundingBox();
  expect(bounds, "The authenticated health panel must have a browser layout box.").not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.width).toBeLessThanOrEqual(width + 1);
}

for (const viewport of VIEWPORTS) {
  test("admin observability is role-gated, session-scoped and read-only on " + viewport.name, async ({ browser }) => {
    test.setTimeout(240_000);
    assertLocalOnly();

    const credentials = {
      admin: {
        email: requiredEnv("E2E_DEVICE_ADMIN_EMAIL"),
        password: requiredEnv("E2E_DEVICE_ADMIN_PASSWORD"),
      },
      manager: {
        email: requiredEnv("E2E_MANAGER_EMAIL"),
        password: requiredEnv("E2E_MANAGER_PASSWORD"),
      },
      accountant: {
        email: requiredEnv("E2E_ACCOUNTANT_EMAIL"),
        password: requiredEnv("E2E_ACCOUNTANT_PASSWORD"),
      },
      customer: {
        email: requiredEnv("E2E_EMAIL"),
        password: requiredEnv("E2E_PASSWORD"),
      },
    };

    const context: BrowserContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
    });
    let releaseManagerBudget: (() => void) | null = null;
    try {
      const page = await context.newPage();
      const rpcPaths: string[] = [];
      const budgetCalls: string[] = [];
      let holdNextBudgetRead = false;
      let signalHeldBudgetRead: (() => void) | null = null;
      let heldBudgetRead: Promise<void> | null = null;
      let managerBudgetGate: Promise<void> | null = null;

      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith("/rest/v1/rpc/")) rpcPaths.push(path);
      });
      await page.route("**/rest/v1/rpc/get_ai_gateway_budget", async (route) => {
        budgetCalls.push(route.request().url());
        if (holdNextBudgetRead) {
          holdNextBudgetRead = false;
          signalHeldBudgetRead?.();
          const gate = managerBudgetGate;
          if (gate) await gate;
        }
        await route.continue();
      });

      // Administrator: the real settings page mounts both protected panels and performs one live read.
      await signIn(page, credentials.admin);
      await openAdminSettings(page);
      const architectureTab = page.getByRole("button", { name: "معمارية النظام", exact: true });
      await expect(architectureTab).toBeVisible();
      const adminRead = page.waitForResponse((response) => isBudgetResponse(response.url()));
      await architectureTab.click();

      let health = page.getByRole("region", { name: "فحوص صحة النظام" });
      await expect(health).toBeVisible();
      await expect(page.getByRole("region", { name: "حالة عقود مصادر الوظائف المرجعية" })).toBeVisible();
      const adminResponse = await adminRead;
      expect(adminResponse.status(), "Admin may read the existing budget aggregate.").toBe(200);
      await expect(health.getByText("جارٍ طلب المصدر الحالي من الخادم…")).toHaveCount(0);
      expect(budgetCalls).toHaveLength(1);
      await assertPanelFitsViewport(health, viewport.width);

      // Hold the next probe before authenticating the manager in a second tab.
      // Supabase broadcasts the real session change to the first tab; its previous
      // probe must disappear while the manager-scoped read is still unresolved.
      let resolveHeld: (() => void) | null = null;
      const managerReadWasHeld = new Promise<void>((resolve) => { resolveHeld = resolve; });
      heldBudgetRead = managerReadWasHeld;
      managerBudgetGate = new Promise<void>((resolve) => { releaseManagerBudget = resolve; });
      signalHeldBudgetRead = resolveHeld;
      holdNextBudgetRead = true;
      const managerRead = page.waitForResponse((response) => isBudgetResponse(response.url()));

      const managerPage = await context.newPage();
      await managerPage.goto("/login");
      await expect(managerPage.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
      await managerPage.getByLabel("البريد الإلكتروني").fill(credentials.manager.email);
      await managerPage.locator('input[autocomplete="current-password"]').fill(credentials.manager.password);
      await managerPage.getByRole("button", { name: "دخول", exact: true }).click();
      await expect(managerPage).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });
      await managerReadWasHeld;
      expect(managerBudgetGate).not.toBeNull();
      expect(heldBudgetRead).not.toBeNull();
      await expect(page.getByRole("button", { name: "معمارية النظام", exact: true })).toBeVisible({ timeout: 30_000 });

      health = page.getByRole("region", { name: "فحوص صحة النظام" });
      await expect(health).toBeVisible();
      await expect(health.getByText("جارٍ طلب المصدر الحالي من الخادم…")).toBeVisible();
      await expect(health.getByText(/استجابة المصدر مؤكدة|محجوب بالصلاحية|المصدر غير متاح|دليل غير صالح/)).toHaveCount(0);
      expect(budgetCalls).toHaveLength(2);
      await assertPanelFitsViewport(health, viewport.width);

      releaseManagerBudget?.();
      releaseManagerBudget = null;
      const managerResponse = await managerRead;
      expect(managerResponse.status(), "The organization manager may read the same existing aggregate.").toBe(200);
      await expect(health.getByText("جارٍ طلب المصدر الحالي من الخادم…")).toHaveCount(0);

      // Manual retry must call only the same read-only aggregate exactly once.
      const rpcCountBeforeRetry = rpcPaths.length;
      const budgetCountBeforeRetry = budgetCalls.length;
      const retryResponsePromise = page.waitForResponse((response) => isBudgetResponse(response.url()));
      await health.getByRole("button", { name: "إعادة الفحص", exact: true }).click();
      const retryResponse = await retryResponsePromise;
      expect(retryResponse.status()).toBe(200);
      expect(budgetCalls).toHaveLength(budgetCountBeforeRetry + 1);
      expect(rpcPaths.slice(rpcCountBeforeRetry)).toEqual(["/rest/v1/rpc/get_ai_gateway_budget"]);

      // Accountant: direct route access does not reveal either panel or invoke its RPC.
      await verifyDeniedRole(browser, viewport, credentials.accountant, "accountant");
      // Ordinary customer: the admin route renders the explicit denial screen.
      await verifyDeniedRole(browser, viewport, credentials.customer, "customer");
    } finally {
      releaseManagerBudget?.();
      await context.close();
    }
  });
}
