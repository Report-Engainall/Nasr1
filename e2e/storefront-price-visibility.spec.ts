import { expect, test, type Page } from "@playwright/test";

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


type PricingPreviewMode = "visible" | "hidden" | "malformed" | "error";

const previewProductId = "a1000000-0000-0000-0000-000000000011";
const previewUnitPrice = 43210;
const previewLineTotal = 86420;
const previewTotal = 86420;

function previewSession() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: "supabase",
    sub: "a1000000-0000-0000-0000-000000000101",
    aud: "authenticated",
    role: "authenticated",
    email: "price-preview-buyer@example.test",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");
  return {
    access_token: header + "." + claims + ".fixture-only-signature",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "fixture-only-refresh-token",
    user: {
      id: "a1000000-0000-0000-0000-000000000101",
      aud: "authenticated",
      role: "authenticated",
      email: "price-preview-buyer@example.test",
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: "مشتري اختبار سياسة السعر" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      identities: [],
      is_anonymous: false,
    },
  };
}

function serverPreview(surface: "cart" | "orders", mode: PricingPreviewMode) {
  if (mode === "hidden") {
    return {
      visible: false,
      surface,
      items: [{
        product_id: previewProductId,
        name: "سعر سري",
        quantity: 2,
        unit_price: 987654,
        line_total: 1975308,
      }],
      item_count: 1,
      currency: "YER",
      total_amount: 1975308,
      customer_tier_visible: true,
      customer_tier_label: "شريحة سرية",
    };
  }
  if (mode === "malformed") {
    return {
      visible: true,
      surface,
      items: [{
        product_id: previewProductId,
        name: "صنف اختبار سياسة إظهار السعر",
        quantity: 2,
        unit_price: 987654,
        line_total: 1975308,
      }],
      item_count: 2,
      currency: "YER",
      total_amount: 1975308,
      customer_tier_visible: true,
      customer_tier_label: "شريحة سرية",
    };
  }
  return {
    visible: true,
    surface,
    items: [{
      product_id: previewProductId,
      name: "صنف اختبار سياسة إظهار السعر",
      item_code: "PRICE-POLICY-CI-011",
      unit: "كرتون",
      quantity: 2,
      unit_price: previewUnitPrice,
      line_total: previewLineTotal,
    }],
    item_count: 1,
    currency: "YER",
    total_amount: previewTotal,
    customer_tier_visible: false,
  };
}

async function installPricingPreviewRoutes(
  page: Page,
  getMode: () => PricingPreviewMode,
  recordRequest?: (payload: unknown) => void,
) {
  await page.addInitScript(({ storageKey, session }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, {
    storageKey: "sb-ci-placeholder-auth-token",
    session: previewSession(),
  });

  await page.route("https://ci-placeholder.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/rest/v1/rpc/ensure_profile") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profile_id: "a1000000-0000-0000-0000-000000000101",
          full_name: "مشتري اختبار سياسة السعر",
          email: "price-preview-buyer@example.test",
          roles: ["buyer"],
        }),
      });
      return;
    }

    if (url.pathname === "/rest/v1/rpc/preview_customer_order_pricing") {
      let requestBody: { p_surface?: unknown; p_items?: unknown } = {};
      try {
        requestBody = route.request().postDataJSON() as typeof requestBody;
      } catch {
        // Request assertions prove the client sends identity and quantity only.
      }
      recordRequest?.(requestBody);
      if (getMode() === "error") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: "P0001",
            message: "pricing preview unavailable in isolated browser fixture",
            details: null,
            hint: null,
          }),
        });
        return;
      }
      if (requestBody.p_surface !== "cart" && requestBody.p_surface !== "orders") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: "22023", message: "invalid preview surface" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(serverPreview(requestBody.p_surface, getMode())),
      });
      return;
    }

    // Never allow this fixture to reach any unmocked backend endpoint.
    await route.abort("blockedbyclient");
  });
}

test("Chromium displays cart and order-review amounts only from complete server previews", async ({ page }) => {
  const mode: PricingPreviewMode = "visible";
  const requests: unknown[] = [];
  await installPricingPreviewRoutes(page, () => mode, (payload) => requests.push(payload));
  const response = await page.goto("/e2e/fixtures/storefront-price-visibility.html");
  await expect(page.getByTestId("fixture-ready")).toBeVisible();
  if (!response || response.status() >= 400) throw new Error("Could not load the isolated price preview fixture.");

  const cart = page.getByTestId("cart-preview");
  const order = page.getByTestId("order-preview");
  await cart.getByTestId("cart-policy-enable").click();
  await order.getByTestId("order-policy-enable").click();

  await expect(cart.locator(".sf-order-pricing-total")).toBeVisible();
  await expect(order.locator(".sf-order-pricing-total")).toBeVisible();
  await expect(cart.locator(".sf-order-pricing-unit")).toContainText("سعر الوحدة:");
  await expect(order.locator(".sf-order-pricing-unit")).toContainText("سعر الوحدة:");
  await expect(cart.locator(".sf-order-pricing-lines")).toContainText("صنف اختبار سياسة إظهار السعر");
  await expect(order.locator(".sf-order-pricing-lines")).toContainText("صنف اختبار سياسة إظهار السعر");
  expect(await cart.locator(".sf-order-pricing-unit").innerText()).toContain("٤٣٬٢١٠");
  expect(await order.locator(".sf-order-pricing-total").innerText()).toContain("٨٦٬٤٢٠");

  await expect.poll(() => requests.length).toBe(2);
  for (const request of requests as Array<{ p_surface?: unknown; p_items?: unknown }>) {
    expect(request.p_surface === "cart" || request.p_surface === "orders").toBe(true);
    expect(request.p_items).toEqual([{ product_id: previewProductId, quantity: 2 }]);
    expect(JSON.stringify(request)).not.toMatch(/unit_price|line_total|base_price|cost_price|margin/i);
  }
});

test("Chromium suppresses monetary fields when the server preview is hidden or malformed", async ({ page }) => {
  let mode: PricingPreviewMode = "hidden";
  await installPricingPreviewRoutes(page, () => mode);
  await page.goto("/e2e/fixtures/storefront-price-visibility.html");
  await expect(page.getByTestId("fixture-ready")).toBeVisible();

  const cart = page.getByTestId("cart-preview");
  const order = page.getByTestId("order-preview");
  await cart.getByTestId("cart-policy-enable").click();
  await order.getByTestId("order-policy-enable").click();
  await expect(cart.getByRole("status")).toContainText("لم يسمح إعداد الخادم بعرض الأسعار");
  await expect(order.getByRole("status")).toContainText("لم يسمح إعداد الخادم بعرض الأسعار");
  await expect(cart.locator(".sf-order-pricing-total")).toHaveCount(0);
  await expect(order.locator(".sf-order-pricing-total")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("987654");
  expect(await page.locator("body").innerText()).not.toContain("شريحة سرية");

  mode = "malformed";
  await cart.getByTestId("cart-policy-disable").click();
  await cart.getByTestId("cart-policy-enable").click();
  await order.getByTestId("order-policy-disable").click();
  await order.getByTestId("order-policy-enable").click();
  await expect(cart.getByRole("alert")).toContainText("تم إخفاء المبالغ");
  await expect(order.getByRole("alert")).toContainText("تم إخفاء المبالغ");
  await expect(cart.locator(".sf-order-pricing-total")).toHaveCount(0);
  await expect(order.locator(".sf-order-pricing-total")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("987654");
  expect(await page.locator("body").innerText()).not.toContain("شريحة سرية");
});

test("Chromium retries failed server price previews without showing local or stale monetary values", async ({ page }) => {
  let mode: PricingPreviewMode = "error";
  await installPricingPreviewRoutes(page, () => mode);
  await page.goto("/e2e/fixtures/storefront-price-visibility.html");
  await expect(page.getByTestId("fixture-ready")).toBeVisible();

  const cart = page.getByTestId("cart-preview");
  const order = page.getByTestId("order-preview");
  await cart.getByTestId("cart-policy-enable").click();
  await order.getByTestId("order-policy-enable").click();
  await expect(cart.getByRole("alert")).toContainText("تم إخفاء المبالغ");
  await expect(order.getByRole("alert")).toContainText("تم إخفاء المبالغ");
  await expect(cart.locator(".sf-order-pricing-total")).toHaveCount(0);
  await expect(order.locator(".sf-order-pricing-total")).toHaveCount(0);

  mode = "visible";
  await cart.getByRole("button", { name: "إعادة المحاولة" }).click();
  await order.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect(cart.locator(".sf-order-pricing-total")).toBeVisible();
  await expect(order.locator(".sf-order-pricing-total")).toBeVisible();
});
