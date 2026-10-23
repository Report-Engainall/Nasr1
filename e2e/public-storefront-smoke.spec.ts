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

test("advanced search recovers from a category-source failure", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  await page.route(
    "https://ci-placeholder.supabase.co/rest/v1/rpc/get_public_storefront_context",
    async (route) => {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "apikey,authorization,content-type,x-client-info,prefer,accept-profile,content-profile,range",
        "access-control-allow-methods": "POST,OPTIONS",
      };

      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          organization_id: "11111111-1111-4111-8111-111111111111",
          warehouse_id: null,
        }),
      });
    },
  );

  let categoryReads = 0;
  let allowCategorySuccess = false;
  await page.route(
    "https://ci-placeholder.supabase.co/rest/v1/categories**",
    async (route) => {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "apikey,authorization,content-type,x-client-info,prefer,accept-profile,content-profile,range",
        "access-control-allow-methods": "GET,OPTIONS",
      };

      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers });
        return;
      }

      categoryReads += 1;
      if (!allowCategorySuccess) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          headers,
          body: JSON.stringify({ message: "synthetic category outage" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ...headers, "content-range": "0-0/*" },
        body: "[]",
      });
    },
  );

  await page.goto("/search/advanced");
  const categorySelect = page.getByLabel("التصنيف");
  const categoryError = page
    .getByRole("alert")
    .filter({ hasText: "تعذر تحميل التصنيفات: synthetic category outage" });
  await expect(categoryError).toContainText("تعذر تحميل التصنيفات");
  await expect(categorySelect).toBeDisabled();

  allowCategorySuccess = true;
  await page.getByRole("button", { name: "إعادة تحميل التصنيفات" }).click();
  await expect(categorySelect).toBeEnabled();
  await expect(categoryError).toHaveCount(0);

  expect(categoryReads).toBeGreaterThanOrEqual(4);
  expect(pageErrors).toEqual([]);
});

test("reset-password rejects an invalid password without reporting success", async ({ page }) => {
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "تعيين كلمة مرور جديدة" })).toBeVisible();

  await page.getByLabel("كلمة المرور الجديدة").fill("short");
  await page.getByRole("button", { name: "حفظ" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
  );
  await expect(page).toHaveURL(/\/reset-password$/);
});
