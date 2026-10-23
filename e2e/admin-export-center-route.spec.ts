import { expect, test } from "@playwright/test";

test("Chromium opens /admin/exports and mounts the actual async export center", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // This is a route/component acceptance test, not a live export operation. Keep
  // all database traffic inside the browser fixture and make no real export job.
  await page.route("**/rest/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/rest/v1/rpc/list_my_async_export_jobs") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    await route.abort("blockedbyclient");
  });
  await page.route("**/functions/v1/**", (route) => route.abort("blockedbyclient"));

  const response = await page.goto("/admin/exports");
  expect(response, "The browser must receive a response for /admin/exports").not.toBeNull();
  expect(response!.status(), "The application route must not return an HTTP error").toBeLessThan(400);

  // The route-level ClientOnly fallback has the same h1 but does not contain
  // these component-only controls. This proves the real component mounted.
  await expect(page.getByRole("heading", { name: "تصدير الطلبات غير المتزامن", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "طلب تصدير جديد", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "إنشاء ملف CSV", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "سجل طلباتي", exact: true })).toBeVisible();
  await expect(page.getByText("لا توجد طلبات تصدير حتى الآن", { exact: true })).toBeVisible();

  expect(pageErrors, "The real route must mount without uncaught browser errors").toEqual([]);
});
