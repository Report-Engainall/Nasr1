import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ retries: 0 });

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
  await page.locator('input[autocomplete="current-password"]').fill(password);
  // The login screen has a submit BUTTON, not the storefront's sign-in link.
  // Wait for Login.onDone -> navigate("/") so we never start the next page while
  // Supabase signInWithPassword / ensure_profile is still pending or failed.
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });

  // Confirm this browser context really has a persisted Supabase access token.
  // Do not log or return the token itself.
  const hasSupabaseSession = await page.evaluate(() =>
    Object.entries(window.localStorage).some(([key, value]) => {
      if (!key.endsWith("-auth-token")) return false;
      try {
        const stored = JSON.parse(value) as { access_token?: unknown };
        return typeof stored.access_token === "string" && stored.access_token.length > 20;
      } catch {
        return false;
      }
    }),
  );
  expect(hasSupabaseSession, "Successful sign-in must persist an authenticated Supabase session before checkout.").toBe(true);
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
  const customerName = process.env.E2E_CUSTOMER_NAME?.trim();
  if (!customerName || customerName.length < 2) {
    throw new Error("E2E_CUSTOMER_NAME must come from the seeded local customer fixture; checkout form values must be explicit.");
  }
  await name.fill(customerName);
  await expect(name).toHaveValue(customerName);
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

test("expired company invitation is denied in Chromium and shown as expired in the owner workspace", async ({ browser }) => {
  const ownerEmail = process.env.E2E_EMAIL;
  const ownerPassword = process.env.E2E_PASSWORD;
  const memberEmail = process.env.E2E_COMPANY_MEMBER_EMAIL;
  const memberPassword = process.env.E2E_COMPANY_MEMBER_PASSWORD;
  const expiredToken = process.env.E2E_EXPIRED_COMPANY_INVITE_TOKEN;
  if (!ownerEmail || !ownerPassword || !memberEmail || !memberPassword || !expiredToken) {
    throw new Error("Dedicated local owner/member accounts and an expired company invitation are required; do not silently skip company expiry acceptance.");
  }

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const ownerDiagnostics = captureBrowserDiagnostics(ownerPage);
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const memberDiagnostics = captureBrowserDiagnostics(memberPage);

  try {
    await test.step("customer account: the real addresses route renders from the authenticated application", async () => {
      await signIn(ownerPage, ownerEmail, ownerPassword);
      await ownerPage.goto("/addresses");
      await expect(ownerPage.getByRole("heading", { name: "عناوين التوصيل" })).toBeVisible();
    });

    await test.step("invited account: an expired single-use token is denied by the server", async () => {
      await signIn(memberPage, memberEmail, memberPassword);
      await memberPage.goto("/company/accept-invitation?token=" + encodeURIComponent(expiredToken));
      const acceptButton = memberPage.getByRole("button", { name: "قبول الدعوة والانضمام للشركة" });
      await expect(acceptButton).toBeVisible();
      await acceptButton.click();
      await expect(memberPage.getByRole("alert")).toContainText("انتهت صلاحية الدعوة؛ اطلب رابطًا جديدًا");
      await expect(memberPage.getByText("تم تفعيل العضوية")).toHaveCount(0);
    });

    await test.step("company owner: persisted invitation is visible as expired", async () => {
      await ownerPage.goto("/company/members");
      await expect(ownerPage.getByRole("heading", { name: "أعضاء الشركة وصلاحياتهم" })).toBeVisible();
      const invitation = ownerPage.locator("article").filter({ hasText: memberEmail });
      await expect(invitation).toContainText("مشاهد");
      await expect(invitation).toContainText("منتهية");
      await expect(invitation.getByRole("button", { name: "إلغاء الدعوة" })).toHaveCount(0);
    });

    expect(ownerDiagnostics.pageErrors, "Uncaught errors on the customer address/company owner pages.").toEqual([]);
    expect(memberDiagnostics.pageErrors, "Uncaught errors on the company invitation acceptance route.").toEqual([]);
    await test.info().attach("company-expiry-browser-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        criticalPath: "customer login -> addresses route -> expired invitation acceptance denied -> owner workspace shows durable expired status",
        invitationStatus: "expired",
        membershipGranted: false,
        externalEmailSent: false,
        targetDatabase: "isolated local Supabase/PostgreSQL 17",
      }),
      contentType: "application/json",
    });
  } finally {
    await memberContext.close();
    await ownerContext.close();
  }
});
