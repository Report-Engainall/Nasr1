import { test, expect, type Page } from "@playwright/test";

type BrowserDiagnostics = {
  pageErrors: string[];
  criticalHttpErrors: string[];
};

function captureBrowserDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = { pageErrors: [], criticalHttpErrors: [] };
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    let pathname = "";
    try {
      pathname = new URL(response.url()).pathname;
    } catch {
      return;
    }
    if (
      /\/rest\/v1\/(orders|order_items|order_status_history|customers)$/i.test(pathname) ||
      /\/rest\/v1\/rpc\/submit_customer_order$/i.test(pathname) ||
      /\/auth\/v1\/token$/i.test(pathname)
    ) {
      diagnostics.criticalHttpErrors.push(
        response.status() + " " + response.request().method() + " " + pathname,
      );
    }
  });
  return diagnostics;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page.locator(".sf-add-btn:not(:disabled)").first()).toBeVisible({ timeout: 45_000 });
}

async function createPersistedOrder(page: Page): Promise<{ orderNumber: string; detailPath: string }> {
  await page.goto("/catalog");
  const addButton = page.locator(".sf-add-btn:not(:disabled)").first();
  await expect(addButton, "The dedicated E2E tenant needs an active, in-stock catalog product.").toBeVisible();
  await addButton.click();

  await expect(page.locator(".sf-cart-btn").first()).toContainText("1", { timeout: 10_000 });
  await page.goto("/cart");
  const checkout = page.getByRole("button", { name: "إتمام الطلب", exact: true });
  await expect(checkout, "The profile-scoped cart must restore when navigating between routes.").toBeEnabled({ timeout: 30_000 });
  await checkout.click();

  await expect(page.getByRole("heading", { name: "إتمام الطلب" })).toBeVisible();
  const name = page.locator('input[placeholder="اسمك الكامل"]');
  await expect(name).toHaveValue(/.{2,}/);
  const phone = process.env.E2E_PHONE;
  if (!phone || phone.trim().length < 6) {
    throw new Error("E2E_PHONE must be configured for the isolated E2E customer; test orders must not invent contact details.");
  }
  await page.locator('input[placeholder="7XX XXX XXX"]').fill(phone);
  const runLabel = "Playwright E2E " + (process.env.GITHUB_RUN_ID ?? new Date().toISOString());
  await page.locator('textarea[placeholder="أي ملاحظات على الطلب..."]').fill(runLabel);

  const submit = page.getByRole("button", { name: "تأكيد الطلب", exact: true });
  await expect(submit, "Server-side cart and pricing validation must finish before submission.").toBeEnabled({ timeout: 45_000 });
  await submit.click();
  const confirmation = page.locator(".sf-confirm");
  await expect(confirmation.getByRole("heading", { name: "تم استلام طلبك بنجاح!" })).toBeVisible({ timeout: 45_000 });
  const confirmationText = await confirmation.locator("p").first().innerText();
  const orderNumberMatch = confirmationText.match(/رقم الطلب\s*:\s*(\S+)/);
  expect(orderNumberMatch, "Order number must come from the successful server response.").not.toBeNull();
  const orderNumber = orderNumberMatch![1];

  await confirmation.getByRole("link", { name: "تفاصيل الطلب" }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/i, { timeout: 30_000 });
  const detailPath = new URL(page.url()).pathname;
  await expect(page.getByText(orderNumber, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(orderNumber, { exact: true })).toBeVisible({ timeout: 30_000 });
  return { orderNumber, detailPath };
}

test("catalog → cart → order → refresh, then cross-organization read denial", async ({ browser }) => {
  const emailA = process.env.E2E_EMAIL;
  const passwordA = process.env.E2E_PASSWORD;
  const emailB = process.env.E2E_EMAIL_B;
  const passwordB = process.env.E2E_PASSWORD_B;
  if (!emailA || !passwordA || !emailB || !passwordB) {
    throw new Error("Both dedicated customer accounts are required. Runtime E2E must be recorded NOT RUN/BLOCKED_EXTERNAL when secrets are absent, never silently skipped.");
  }

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const diagnosticsA = captureBrowserDiagnostics(pageA);
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const diagnosticsB = captureBrowserDiagnostics(pageB);

  try {
    await test.step("customer A: authenticate and create order through the real catalog and cart", async () => {
      await signIn(pageA, emailA, passwordA);
    });
    const order = await test.step("customer A: persist order and verify it after a browser refresh", async () => {
      return createPersistedOrder(pageA);
    });

    await test.step("customer B: a separate organization's session cannot open customer A's order", async () => {
      await signIn(pageB, emailB, passwordB);
      await pageB.goto(order.detailPath);
      await expect(pageB.getByText("الطلب غير موجود أو لا تملك صلاحية عرضه.", { exact: false })).toBeVisible({ timeout: 30_000 });
      await expect(pageB.getByText(order.orderNumber, { exact: true })).toHaveCount(0);
    });

    expect(diagnosticsA.pageErrors, "Uncaught browser exceptions for customer A.").toEqual([]);
    expect(diagnosticsA.criticalHttpErrors, "Customer A authentication/order API failures.").toEqual([]);
    expect(diagnosticsB.pageErrors, "Uncaught browser exceptions for customer B.").toEqual([]);
    expect(diagnosticsB.criticalHttpErrors, "Customer B authentication/order API failures.").toEqual([]);

    await test.info().attach("p2-browser-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        criticalPath: "catalog -> cart -> server-validated order -> detail after refresh",
        orderNumber: order.orderNumber,
        resourcePath: order.detailPath,
        tenantBVisibleOrderNumber: false,
      }),
      contentType: "application/json",
    });
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
