import { expect, test } from "@playwright/test";

test("Chromium verifies fail-closed product card and detail price visibility", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`);
  });

  // This local-only fixture imports the real exported ProductGrid/ProductDetail components.
  // It deliberately never mounts Storefront's auth/cart lifecycle or writes to a backend.
  await page.route("https://ci-placeholder.supabase.co/**", (route) => route.abort("blockedbyclient"));
  const response = await page.goto("/e2e/fixtures/storefront-price-visibility.html");
  await page.waitForTimeout(1500);
  const readyCount = await page.getByTestId("fixture-ready").count();
  if (readyCount !== 1) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    throw new Error([
      `Price visibility fixture did not mount (HTTP ${response?.status() ?? "no response"}).`,
      `Page errors: ${JSON.stringify(pageErrors)}`,
      `Console errors: ${JSON.stringify(consoleErrors)}`,
      `Failed requests: ${JSON.stringify(failedRequests)}`,
      `Body text: ${JSON.stringify(bodyText.slice(0, 1200))}`,
    ].join("\\n"));
  }

  const cardPrice = page.locator(".sf-product-price");
  const detailPrice = page.locator(".sf-detail-price");
  const detailPriceCopy = page.getByText("السعر الظاهر قبل تأكيد الطلب", { exact: true });

  // Unknown/disabled policy must omit price DOM and price-only descriptive copy.
  await expect(cardPrice).toHaveCount(0);
  await expect(detailPrice).toHaveCount(0);
  await expect(detailPriceCopy).toHaveCount(0);

  // The enabled state renders the exact same server price in the real card and detail components.
  await page.getByTestId("policy-enable").click();
  await expect(cardPrice).toBeVisible();
  await expect(detailPrice).toBeVisible();
  const cardAmount = (await cardPrice.locator("strong").textContent())?.trim();
  const detailAmount = (await detailPrice.locator("strong").textContent())?.trim();
  expect(cardAmount).toBeTruthy();
  expect(detailAmount).toBe(cardAmount);
  await expect(detailPriceCopy).toBeVisible();

  // Turning the policy off and passing a malformed string must immediately fail closed.
  await page.getByTestId("policy-disable").click();
  await expect(cardPrice).toHaveCount(0);
  await expect(detailPrice).toHaveCount(0);
  await expect(detailPriceCopy).toHaveCount(0);

  await page.getByTestId("policy-malformed").click();
  await expect(cardPrice).toHaveCount(0);
  await expect(detailPrice).toHaveCount(0);
  await expect(detailPriceCopy).toHaveCount(0);

  // A zero sentinel never becomes visible even if the policy is turned back on.
  await page.getByTestId("policy-enable").click();
  await page.getByTestId("price-zero").click();
  await expect(cardPrice).toHaveCount(0);
  await expect(detailPrice).toHaveCount(0);
  await expect(detailPriceCopy).toHaveCount(0);

  // Restore source value, prove visible path again, and ensure no uncaught browser errors.
  await page.getByTestId("price-restore").click();
  await expect(cardPrice).toBeVisible();
  await expect(detailPrice).toBeVisible();
  expect(pageErrors).toEqual([]);
});
