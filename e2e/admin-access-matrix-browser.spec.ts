import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN_ACCESS_ROLES,
  ADMIN_NAV_GROUPS,
  ADMIN_OPERATION_RULES,
} from "../src/lib/admin-access-matrix";

test.describe.configure({ retries: 0 });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local admin access-matrix acceptance.");
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

test("admin access matrix is complete, responsive, keyboard reachable and admin-only", async ({ browser }) => {
  test.setTimeout(180_000);

  const sourceSha = requiredEnv("E2E_SOURCE_SHA");
  const localSupabase = new URL(requiredEnv("SUPABASE_URL"));
  if (
    localSupabase.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(localSupabase.hostname) ||
    localSupabase.port !== "54321"
  ) {
    throw new Error("Admin access-matrix acceptance is restricted to the disposable local Supabase API.");
  }

  const browserErrors: string[] = [];
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminContext.newPage();
  admin.on("pageerror", (error) => browserErrors.push("admin: " + error.message));
  let pageCount = 0;
  let operationCount = 0;

  try {
    await signIn(admin, requiredEnv("E2E_DEVICE_ADMIN_EMAIL"), requiredEnv("E2E_DEVICE_ADMIN_PASSWORD"));
    await admin.goto("/admin/settings");
    await expect(admin.getByRole("heading", { name: "الإعدادات العامة", exact: true })).toBeVisible({ timeout: 30_000 });

    const accessTab = admin.getByRole("button", { name: "المستخدمون والصلاحيات", exact: true });
    await expect(accessTab).toBeVisible();
    await accessTab.click();

    await expect(admin.getByRole("heading", { name: "مصفوفة الوصول والعمليات حسب الدور", exact: true })).toBeVisible();
    const pageTable = admin.getByRole("table", { name: "مصفوفة وصول الصفحات حسب الدور", exact: true });
    const operationTable = admin.getByRole("table", { name: "مصفوفة العمليات وحدودها حسب الدور", exact: true });
    await expect(pageTable).toBeVisible();
    await expect(operationTable).toBeVisible();

    expect(ADMIN_ACCESS_ROLES.map((role) => role.id)).toEqual([
      "admin", "manager", "staff", "accountant", "customer_manager", "customer",
    ]);
    const pageViews = ADMIN_NAV_GROUPS.flatMap((group) => group.views);
    expect(new Set(pageViews).size).toBe(pageViews.length);
    const operationIds = ADMIN_OPERATION_RULES.map((operation) => operation.id);
    expect(new Set(operationIds).size).toBe(operationIds.length);

    for (const role of ADMIN_ACCESS_ROLES) {
      await expect(pageTable.getByRole("columnheader", { name: role.label, exact: true })).toHaveCount(1);
      await expect(operationTable.getByRole("columnheader", { name: role.label, exact: true })).toHaveCount(1);
      for (const view of pageViews) {
        await expect(admin.locator('[data-testid="page-' + view + '-' + role.id + '"]')).toHaveCount(1);
      }
      for (const operation of ADMIN_OPERATION_RULES) {
        await expect(admin.locator('[data-testid="operation-' + operation.id + '-' + role.id + '"]')).toHaveCount(1);
      }
    }

    pageCount = pageViews.length * ADMIN_ACCESS_ROLES.length;
    operationCount = ADMIN_OPERATION_RULES.length * ADMIN_ACCESS_ROLES.length;
    await expect(pageTable.locator('td[data-testid^="page-"]')).toHaveCount(pageCount);
    await expect(operationTable.locator('td[data-testid^="operation-"]')).toHaveCount(operationCount);

    const staffFinance = admin.locator('[data-testid="page-finance-staff"]');
    await expect(staffFinance).toContainText("ممنوع");
    await expect(staffFinance).toContainText("تتطلب مساحة المالية");
    const accountantFinance = admin.locator('[data-testid="page-finance-accountant"]');
    await expect(accountantFinance).toContainText("مسموح");
    const staffPricing = admin.locator('[data-testid="operation-pricing_rules_write-staff"]');
    await expect(staffPricing).toContainText("ممنوع");
    await expect(staffPricing).toContainText("تعديل القواعد القائمة");
    const adminPricing = admin.locator('[data-testid="operation-pricing_rules_write-admin"]');
    await expect(adminPricing).toContainText("مسموح");
    await expect(adminPricing).toContainText("محصوران بمدير النظام أو المدير");

    await expect(admin.locator('[data-testid^="specification-role-"]')).toHaveCount(9);

    const pagesRegion = admin.getByRole("region", { name: "جدول مقارنة الوصول إلى الصفحات حسب الدور", exact: true });
    const operationsRegion = admin.getByRole("region", { name: "جدول مقارنة العمليات وحدودها حسب الدور", exact: true });
    await expect(pagesRegion).toHaveAttribute("tabindex", "0");
    await expect(operationsRegion).toHaveAttribute("tabindex", "0");
    await pagesRegion.focus();
    await expect(pagesRegion).toBeFocused();
    await admin.keyboard.press("ArrowLeft");
    await expect(pagesRegion).toBeFocused();
    await admin.keyboard.press("Tab");
    await expect(pagesRegion).not.toBeFocused();
    await admin.keyboard.press("Shift+Tab");
    await expect(pagesRegion).toBeFocused();

    const viewportChecks: Array<{ width: number; pageScrollWidth: number; viewportWidth: number; pageRegionClientWidth: number; pageRegionScrollWidth: number; operationsRegionClientWidth: number; operationsRegionScrollWidth: number }> = [];
    for (const width of [360, 1280]) {
      await admin.setViewportSize({ width, height: 900 });
      await expect(pageTable).toBeVisible();
      await expect(operationTable).toBeVisible();
      const dimensions = await admin.evaluate(() => {
        const pageRegion = document.querySelector<HTMLElement>('[aria-label="جدول مقارنة الوصول إلى الصفحات حسب الدور"]');
        const operationsRegion = document.querySelector<HTMLElement>('[aria-label="جدول مقارنة العمليات وحدودها حسب الدور"]');
        if (!pageRegion || !operationsRegion) throw new Error("Both keyboard-accessible matrix regions must be mounted.");
        return {
          pageScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          pageRegionClientWidth: pageRegion.clientWidth,
          pageRegionScrollWidth: pageRegion.scrollWidth,
          operationsRegionClientWidth: operationsRegion.clientWidth,
          operationsRegionScrollWidth: operationsRegion.scrollWidth,
        };
      });
      expect(dimensions.pageScrollWidth, "The admin settings page must not overflow horizontally at " + width + "px.").toBeLessThanOrEqual(dimensions.viewportWidth);
      expect(dimensions.pageRegionScrollWidth, "The pages matrix must keep its wide table inside the focusable horizontal scroller.").toBeGreaterThan(dimensions.pageRegionClientWidth);
      expect(dimensions.operationsRegionScrollWidth, "The operations matrix must keep its wide table inside the focusable horizontal scroller.").toBeGreaterThan(dimensions.operationsRegionClientWidth);
      viewportChecks.push({ width, ...dimensions });
    }

    await admin.getByRole("button", { name: "تفاصيل دور واحد", exact: true }).click();
    const roleSelect = admin.getByRole("combobox", { name: "الدور محل المراجعة", exact: true });
    await expect(roleSelect).toHaveValue("admin");
    await roleSelect.selectOption("staff");
    await expect(admin.locator('[data-testid="single-page-finance"]')).toContainText("ممنوع");
    await expect(admin.getByRole("region", { name: "جدول عمليات الدور المحدد وحدوده", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "مقارنة جميع الأدوار", exact: true }).click();
    await expect(pageTable).toBeVisible();
    await expect(operationTable).toBeVisible();
  } finally {
    await adminContext.close().catch(() => undefined);
  }

  // A manager may use general settings but cannot see the role-management tab or the matrix.
  const managerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const manager = await managerContext.newPage();
  manager.on("pageerror", (error) => browserErrors.push("manager: " + error.message));
  try {
    await signIn(manager, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"));
    await manager.goto("/admin/settings");
    await expect(manager.getByRole("heading", { name: "الإعدادات العامة", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(manager.getByRole("button", { name: "المستخدمون والصلاحيات", exact: true })).toHaveCount(0);
    await expect(manager.getByRole("heading", { name: "مصفوفة الوصول والعمليات حسب الدور", exact: true })).toHaveCount(0);
  } finally {
    await managerContext.close().catch(() => undefined);
  }

  expect(browserErrors, "The role-access page must not throw browser runtime errors.").toEqual([]);
  const proof = {
    result: "PASS",
    browserResult: "BROWSER_PROVEN",
    sourceSha,
    environment: "disposable-local-supabase-postgresql-17",
    route: "/admin/settings",
    authorization: {
      adminCanOpenAccessMatrix: true,
      managerCannotSeeAccessTabOrMatrix: true,
      noRoleOrPermissionPolicyWasChanged: true,
    },
    canonicalRoles: ADMIN_ACCESS_ROLES.map((role) => role.id),
    specificationRoleReferenceCards: 9,
    pageViews: pageViews.length,
    pageDecisionCells: pageCount,
    operations: ADMIN_OPERATION_RULES.length,
    operationDecisionCells: operationCount,
    denialReasonsVisible: true,
    permittedOperationLimitsVisible: true,
    singleRoleDetailsAndReturnToComparison: true,
    viewportChecks,
    keyboardFocusAndTabOrderVerified: true,
    browserRuntimeErrors: browserErrors,
    noSettingsOrPermissionWrites: true,
    noProductionWrites: true,
  };
  await writeFile(requiredEnv("E2E_PROOF_PATH"), JSON.stringify(proof, null, 2) + "\n", "utf8");
  await test.info().attach("admin-access-matrix-browser-proof.json", {
    body: JSON.stringify(proof, null, 2),
    contentType: "application/json",
  });
});
