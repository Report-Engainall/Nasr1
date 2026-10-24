import { expect, test } from "@playwright/test";

test("public storefront and login routes render without external backend writes", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // The build uses a non-routable placeholder project. Intercept every request to it:
  // this browser smoke is intentionally read-only and must never depend on external credentials.
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  await page.goto("/");
  await expect(page.locator(".sf-header")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "المنتجات", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "دخول", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/الأغبري/);

  await page.getByRole("link", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();

  await page.goto("/catalog?q=smoke&available=1");
  await expect(page.locator(".sf-header")).toBeVisible();
  await expect(page.getByRole("heading", { name: "المنتجات", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/الكتالوج/);

  expect(pageErrors, "The public storefront routes must not throw uncaught browser errors.").toEqual([]);
});

test("admin export URL reaches the hydrated export center in Chromium without backend access", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // Keep the proof read-only: all Supabase traffic is blocked at the non-routable CI placeholder.
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  const response = await page.goto("/admin/exports");
  expect(response?.status(), "The direct export URL must resolve to an application response.").toBe(200);
  await expect(page).toHaveURL(/\/admin\/exports\/?$/);

  // The first heading also exists in the ClientOnly fallback. "سجل طلباتي" and the refresh action
  // are rendered only by AsyncExportCenter, so these assertions prove hydration reached the target.
  await expect(
    page.getByRole("heading", { name: "تصدير الطلبات غير المتزامن", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "سجل طلباتي", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "تحديث السجل", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "إنشاء ملف CSV", exact: true })).toBeVisible();

  expect(
    pageErrors,
    "Direct navigation to /admin/exports must not produce uncaught browser errors.",
  ).toEqual([]);
});

