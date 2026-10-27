import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";

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
      /\/rest\/v1\/rpc\/(submit_customer_order|review_order_lines)$/i.test(pathname) ||
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
  const managerEmail = process.env.E2E_MANAGER_EMAIL;
  const managerPassword = process.env.E2E_MANAGER_PASSWORD;
  if (!emailA || !passwordA || !emailB || !passwordB) {
    throw new Error("Both dedicated customer accounts are required. Runtime E2E must be recorded NOT RUN/BLOCKED_EXTERNAL when secrets are absent, never silently skipped.");
  }

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const diagnosticsA = captureBrowserDiagnostics(pageA);
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const diagnosticsB = captureBrowserDiagnostics(pageB);
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  const managerDiagnostics = captureBrowserDiagnostics(managerPage);

  try {
    await test.step("customer A: authenticate and create order through the real catalog and cart", async () => {
      await signIn(pageA, emailA, passwordA);
    });
    const order = await test.step("customer A: persist order and verify it after a browser refresh", async () => {
      return createPersistedOrder(pageA);
    });

    let managerTransitionProven = false;
    let databaseReadbackProven = false;
    if (managerEmail && managerPassword) {
      await test.step("manager: approve the persisted customer order in the authorized admin workspace", async () => {
        await signIn(managerPage, managerEmail, managerPassword);
        await managerPage.goto("/admin/orders");
        await expect(managerPage.getByRole("heading", { name: "الطلبات", exact: true })).toBeVisible({ timeout: 30_000 });
        const orderRow = managerPage.getByRole("row").filter({ hasText: order.orderNumber });
        await expect(orderRow, "The order submitted by customer A must be returned by the staff order query in the same tenant.").toBeVisible({ timeout: 30_000 });
        await orderRow.getByRole("button", { name: "تفاصيل", exact: true }).click();
        await expect(managerPage.getByRole("heading", { name: "الطلب #" + order.orderNumber, exact: true })).toBeVisible({ timeout: 30_000 });

        const approve = managerPage.getByRole("button", { name: "اعتماد الكميات وتأكيد الطلب", exact: true });
        await expect(approve, "Staff must use the controlled transactional order-review action rather than a direct optimistic status edit.").toBeEnabled({ timeout: 30_000 });
        await approve.click();
        await expect(managerPage.getByText(/تم اعتماد الطلب ذريًا/)).toBeVisible({ timeout: 45_000 });
      });
      managerTransitionProven = true;

      await test.step("customer A: reread the saved status after manager approval", async () => {
        const refresh = pageA.getByRole("button", { name: "تحديث حالة الطلب من الخادم", exact: true });
        await expect(refresh).toBeVisible();
        await refresh.click();
        await expect(pageA.getByText(/الحالة:\s*مؤكد/)).toBeVisible({ timeout: 30_000 });
        await expect(pageA.getByText("مؤكد", { exact: true })).toBeVisible();
      });

      if (process.env.TEST_DATABASE_URL) {
        await test.step("isolated PostgreSQL: assert the same browser order, invoice, reservation, cart and status history", async () => {
          const databaseUrl = process.env.TEST_DATABASE_URL!;
          const databaseHost = new URL(databaseUrl).hostname;
          if (!["localhost", "127.0.0.1"].includes(databaseHost)) {
            throw new Error("Direct SQL acceptance is allowed only against the isolated loopback PostgreSQL fixture.");
          }
          const orderId = order.detailPath.split("/").filter(Boolean).at(-1);
          if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
            throw new Error("Could not resolve the persisted order UUID from the customer order detail route.");
          }

          const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
          try {
            const orders = await db.unsafe(
              "select id::text,status,total_items,idempotency_key,created_by::text,organization_id::text,payment_request_status from public.orders where id=$1::uuid",
              [orderId],
            );
            expect(orders, "Exactly one durable order row must exist for the browser-created UUID.").toHaveLength(1);
            expect(orders[0].status).toBe("confirmed");
            expect(orders[0].idempotency_key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
            expect(orders[0].payment_request_status).toBe("requested");

            const lines = await db.unsafe(
              "select count(*)::int as line_count, count(distinct product_id)::int as distinct_products, coalesce(sum(quantity),0)::numeric::text as total_quantity from public.order_items where order_id=$1::uuid",
              [orderId],
            );
            expect(lines[0].line_count).toBe(1);
            expect(lines[0].distinct_products).toBe(1);
            expect(Number(lines[0].total_quantity)).toBeGreaterThan(0);

            const reservations = await db.unsafe(
              "select count(*)::int as movement_count, coalesce(sum(quantity),0)::numeric::text as total_quantity from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type='reserve'",
              [orderId],
            );
            expect(reservations[0].movement_count).toBeGreaterThan(0);
            expect(Number(reservations[0].total_quantity)).toBeCloseTo(Number(lines[0].total_quantity), 3);

            const invoices = await db.unsafe(
              "select count(*)::int as count from public.customer_invoices where order_id=$1::uuid",
              [orderId],
            );
            expect(invoices[0].count, "Confirmation must issue exactly one invoice for the same order.").toBe(1);

            const carts = await db.unsafe(
              "select count(*)::int as count from public.customer_carts c join public.orders o on o.organization_id=c.organization_id and o.created_by=c.profile_id where o.id=$1::uuid and c.status='checked_out'",
              [orderId],
            );
            expect(carts[0].count, "The source persistent customer cart must be atomically converted after order lines are saved.").toBe(1);

            const confirmedHistory = await db.unsafe(
              "select count(*)::int as count from public.order_status_history where order_id=$1::uuid and to_status='confirmed'",
              [orderId],
            );
            expect(confirmedHistory[0].count).toBe(1);

            const approvalAudit = await db.unsafe(
              "select count(*)::int as count from public.audit_logs where entity_type='order' and entity_id=$1::uuid and action='order.review.approved'",
              [orderId],
            );
            expect(approvalAudit[0].count).toBe(1);
            databaseReadbackProven = true;
          } finally {
            await db.end({ timeout: 5 });
          }
        });
      } else {
        await test.info().attach("order-database-proof-boundary.json", {
          body: JSON.stringify({
            result: "NOT_RUN / BLOCKED_EXTERNAL",
            missing: "TEST_DATABASE_URL for an authorized direct connection to the isolated PostgreSQL fixture",
            sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
          }),
          contentType: "application/json",
        });
      }
    } else {
      if (process.env.TEST_DATABASE_URL) {
        throw new Error("The local PostgreSQL harness must provide its seeded E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD for the integrated admin transition.");
      }
      await test.info().attach("admin-status-readback-proof-boundary.json", {
        body: JSON.stringify({
          result: "NOT_RUN / BLOCKED_EXTERNAL",
          missing: ["E2E_MANAGER_EMAIL", "E2E_MANAGER_PASSWORD"],
          detail: "Hosted customer/tenant E2E credentials do not provision a manager identity; the separate isolated-local harness is the required proof for the admin-to-customer status transition.",
          sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        }),
        contentType: "application/json",
      });
    }

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
    expect(managerDiagnostics.pageErrors, "Uncaught browser exceptions in the authorized admin workflow.").toEqual([]);
    expect(managerDiagnostics.criticalHttpErrors, "Admin order read/review RPC failures.").toEqual([]);

    await test.info().attach("p2-browser-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        criticalPath: "catalog -> cart -> server-validated order -> admin transactional approval -> customer server readback",
        orderNumber: order.orderNumber,
        resourcePath: order.detailPath,
        adminTransition: managerTransitionProven ? "pending -> confirmed" : "NOT_RUN / BLOCKED_EXTERNAL",
        customerReadbackAfterAdminTransition: managerTransitionProven,
        sameOrderDatabaseReadback: databaseReadbackProven,
        tenantBVisibleOrderNumber: false,
      }),
      contentType: "application/json",
    });
  } finally {
    await managerContext.close();
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
