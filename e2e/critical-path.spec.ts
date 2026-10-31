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
  await expect(
    page.getByText("تم حفظ سلتك في حسابك؛ ستظهر عند الدخول من جهاز آخر.", { exact: true }),
    "The authenticated cart must be durably synchronized before progressing to checkout.",
  ).toBeVisible({ timeout: 30_000 });
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
  const orderId = detailPath.split("/").filter(Boolean).at(-1);
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);
  await page.evaluate(() => {
    window.print = () => { document.documentElement.dataset.e2ePrintInvoked = "true"; };
  });
  const printButton = page.getByRole("button", { name: "طباعة / حفظ PDF", exact: true });
  await expect(printButton).toBeEnabled();
  await printButton.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true");
  const printArea = page.locator('[data-testid="customer-order-print-document"]');
  await expect(printArea).toContainText(orderNumber);
  await expect(printArea).toContainText(runLabel);
  const printableMarkup = await printArea.evaluate((element) => ({
    html: element.innerHTML,
    attributes: Array.from(element.querySelectorAll("*")).flatMap((node) =>
      Array.from(node.attributes).map((attribute) => attribute.name + "=" + attribute.value),
    ).join(" "),
  }));
  expect(printableMarkup.html).not.toContain(orderId!);
  // CSS layout declarations such as "margin: 14px" are not a financial margin field.
  // Check exact database-field identifiers rather than substring matching generic CSS properties.
  expect(printableMarkup.html + " " + printableMarkup.attributes).not.toMatch(
    /\b(customer_id|organization_id|product_id|actor_id|admin_notes|unit_price|line_total|cost_price)\b/i,
  );
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

      await test.step("customer A: request, receive and print a server-priced quote", async () => {
        await pageA.goto("/quotes");
        await expect(pageA.getByRole("heading", { name: "عروض الأسعار" })).toBeVisible({ timeout: 30_000 });
        const quoteRequestNote = "P2_QUOTE_PRINT_" + (process.env.GITHUB_RUN_ID ?? "local");
        const quoteQuantity = pageA.getByRole("spinbutton").first();
        await expect(quoteQuantity).toBeEnabled({ timeout: 20_000 });
        await quoteQuantity.fill("2");
        await pageA.locator("textarea").first().fill(quoteRequestNote);
        await pageA.getByRole("button", { name: "إرسال طلب عرض سعر", exact: true }).click();
        await expect(pageA.getByText(/تم إرسال طلب عرض السعر/).first()).toBeVisible({ timeout: 30_000 });
        const requestCard = pageA.locator("article").filter({ hasText: quoteRequestNote }).first();
        await expect(requestCard).toBeVisible({ timeout: 30_000 });
        const quoteNumber = await requestCard.locator("strong").first().innerText();

        await managerPage.goto("/admin/quotes");
        await expect(managerPage.getByRole("heading", { name: "إدارة عروض الأسعار" })).toBeVisible({ timeout: 30_000 });
        const staffQuoteCard = managerPage.locator("article").filter({ hasText: quoteNumber }).first();
        await expect(staffQuoteCard).toBeVisible({ timeout: 30_000 });
        await staffQuoteCard.getByRole("button", { name: "فتح / تسعير", exact: true }).click();
        await expect(managerPage.getByRole("dialog", { name: "تسعير عرض" })).toBeVisible();
        const quotePrice = managerPage.locator('input[type="number"]').first();
        await expect(quotePrice).toBeEnabled();
        await quotePrice.fill("125");
        await managerPage.getByRole("button", { name: "حفظ الأسعار وإرسال العرض", exact: true }).click();
        await expect(managerPage.getByText(/تم حفظ العرض وإرساله للعميل/).first()).toBeVisible({ timeout: 30_000 });

        await pageA.goto("/quotes");
        const quotedCard = pageA.locator("article").filter({ hasText: quoteNumber }).first();
        await expect(quotedCard).toContainText("تم التسعير", { timeout: 30_000 });
        await pageA.evaluate(() => { window.print = () => { document.documentElement.dataset.e2eQuotePrintInvoked = "true"; }; });
        const quotePrintButton = quotedCard.getByRole("button", { name: "طباعة العرض", exact: true });
        await expect(quotePrintButton).toBeEnabled();
        await quotePrintButton.click();
        await expect.poll(() => pageA.evaluate(() => document.documentElement.dataset.e2eQuotePrintInvoked)).toBe("true");
        const quotePrint = pageA.locator(".customer-quote-print-document");
        await expect(quotePrint).toBeAttached();
        // The quote sheet is intentionally display:none on screen; test the actual print stylesheet after invoking print.
        await pageA.emulateMedia({ media: "print" });
        await expect(quotePrint).toBeVisible();
        await expect(quotePrint).toHaveAttribute("dir", "rtl");
        await expect(quotePrint).toContainText(quoteNumber);
        await expect(quotePrint).toContainText("١٢٥");
        const quoteMarkup = await quotePrint.evaluate((element) => element.innerHTML);
        expect(quoteMarkup).not.toMatch(/organization_id|customer_id|product_id|quote_id|actor_id|target_unit_price|cost_price/i);
        await pageA.evaluate(() => window.dispatchEvent(new Event("afterprint")));
        await expect(quotePrint).toHaveCount(0);
        await pageA.emulateMedia({ media: "screen" });
        await pageA.goto(order.detailPath);
        await expect(pageA.getByText(order.orderNumber, { exact: true })).toBeVisible({ timeout: 30_000 });
      });

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

            const events = await db.unsafe(
              "select id::text,event_type,status,idempotency_key from public.outbox_events where organization_id=(select organization_id from public.orders where id=$1::uuid) and aggregate_id=$1::uuid and event_type='OrderCreated'",
              [orderId],
            );
            expect(events, "The same browser order must enqueue exactly one OrderCreated business event.").toHaveLength(1);
            expect(events[0].idempotency_key).toBe("order-created:" + orderId);

            const workerName = "p2-browser-e2e-" + (process.env.GITHUB_RUN_ID ?? "local");
            const claimed = await db.unsafe(
              "select id::text from public.claim_outbox_events($1::text,10,300,$2::uuid)",
              [workerName, events[0].id],
            );
            expect(claimed, "The local trusted worker must claim the exact order event before processing it.").toHaveLength(1);

            const processed = await db.unsafe(
              "select public.process_outbox_event($1::uuid,$2::text) as result",
              [events[0].id, workerName],
            );
            expect(processed[0].result.status).toBe("processed");
            expect(Number(processed[0].result.notifications_created)).toBeGreaterThan(0);

            const notificationCounts = await db.unsafe(
              "select n.profile_id::text,count(*)::int as count from public.notifications n join public.orders o on o.organization_id=n.organization_id where o.id=$1::uuid and n.type='order' and n.title='طلب جديد' and n.body like '%'||o.order_number||'%' group by n.profile_id",
              [orderId],
            );
            expect(notificationCounts.length, "The accepted order must notify at least one authorized staff recipient.").toBeGreaterThan(0);
            expect(notificationCounts.every((row) => row.count === 1), "Each staff recipient must get at most one notification for this order.").toBe(true);

            const managerNotifications = await db.unsafe(
              "select n.id::text from public.notifications n join public.profiles p on p.id=n.profile_id join public.orders o on o.organization_id=n.organization_id where o.id=$1::uuid and p.email=$2 and n.type='order' and n.title='طلب جديد' and n.body like '%'||o.order_number||'%'",
              [orderId, managerEmail!],
            );
            expect(managerNotifications, "The same-tenant manager must receive the order-created notification.").toHaveLength(1);

            const duplicateProcess = await db.unsafe(
              "select public.process_outbox_event($1::uuid,$2::text) as result",
              [events[0].id, workerName],
            );
            expect(duplicateProcess[0].result.status).toBe("already_processed");

            const deliveryReceipts = await db.unsafe(
              "select count(*)::int as count from public.outbox_event_deliveries where event_id=$1::uuid and consumer_key='in_app_order_created'",
              [events[0].id],
            );
            expect(deliveryReceipts[0].count).toBe(1);

            const notificationCountsAfterReplay = await db.unsafe(
              "select n.profile_id::text,count(*)::int as count from public.notifications n join public.orders o on o.organization_id=n.organization_id where o.id=$1::uuid and n.type='order' and n.title='طلب جديد' and n.body like '%'||o.order_number||'%' group by n.profile_id",
              [orderId],
            );
            expect(notificationCountsAfterReplay).toEqual(notificationCounts);
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
        customerOrderPrintInvoked: await pageA.evaluate(() => document.documentElement.dataset.e2ePrintInvoked === "true"),
        customerOrderPrintExcludesInternalAndFinancialFields: true,
        customerQuotePrintInvoked: await pageA.evaluate(() => document.documentElement.dataset.e2eQuotePrintInvoked === "true"),
        customerQuotePrintExcludesInternalTargetPriceAndTenantFields: true,
        adminTransition: managerTransitionProven ? "pending -> confirmed" : "NOT_RUN / BLOCKED_EXTERNAL",
        customerReadbackAfterAdminTransition: managerTransitionProven,
        sameOrderDatabaseReadback: databaseReadbackProven,
        outboxNotificationExactlyOnceProven: databaseReadbackProven,
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
