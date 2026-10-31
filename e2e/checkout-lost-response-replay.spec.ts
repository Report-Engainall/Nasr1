import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });
  const authenticated = await page.evaluate(() =>
    Object.entries(window.localStorage).some(([key, value]) => {
      if (!key.endsWith("-auth-token")) return false;
      try {
        const session = JSON.parse(value) as { access_token?: unknown };
        return typeof session.access_token === "string" && session.access_token.length > 20;
      } catch {
        return false;
      }
    }),
  );
  expect(authenticated).toBe(true);
}

async function openCheckoutFromCart(page: Page): Promise<void> {
  await page.goto("/cart");
  const checkout = page.getByRole("button", { name: "إتمام الطلب", exact: true });
  await expect(checkout, "The persisted cart must return after browser reload.").toBeEnabled({ timeout: 45_000 });
  await checkout.click();
  await expect(page.getByRole("heading", { name: "إتمام الطلب" })).toBeVisible();
  await expect(page.locator('input[placeholder="اسمك الكامل"]')).toBeVisible();
}

async function fillExactCheckoutPayload(page: Page, customerName: string, phone: string, notes: string): Promise<void> {
  await page.locator('input[placeholder="اسمك الكامل"]').fill(customerName);
  await page.locator('input[placeholder="7XX XXX XXX"]').fill(phone);
  await page.locator('input[placeholder="اسم المتجر أو الشركة"]').fill("");
  await page.locator('textarea[placeholder="أي ملاحظات على الطلب..."]').fill(notes);
  const address = page.locator("#checkout-delivery-address");
  await expect(address).toBeEnabled({ timeout: 30_000 });
  await address.selectOption("");
}

test("checkout replays one committed order after its success response is lost and the browser reloads", async ({ browser }) => {
  test.setTimeout(6 * 60 * 1000);
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const customerName = process.env.E2E_CUSTOMER_NAME?.trim();
  const phone = process.env.E2E_PHONE?.trim();
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!email || !password || !customerName || customerName.length < 2 || !phone || phone.length < 6 || !databaseUrl) {
    throw new Error("The dedicated local customer and loopback PostgreSQL fixture are required; do not simulate this proof when absent.");
  }
  if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
    throw new Error("This idempotency proof is restricted to the isolated loopback PostgreSQL fixture.");
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  const notes = "P2 lost-response idempotency replay";
  let submitCalls = 0;
  let firstRequest: Record<string, unknown> | null = null;
  let replayRequest: Record<string, unknown> | null = null;
  let committedResult: { id?: unknown; order_number?: unknown } | null = null;
  let verifiedOrderCount = 0;

  try {
    await signIn(page, email, password);
    await page.goto("/catalog");
    const add = page.locator(".sf-add-btn:not(:disabled)").first();
    await expect(add, "The isolated customer tenant must have an active in-stock product.").toBeVisible({ timeout: 30_000 });
    await add.click();
    await expect(page.locator(".sf-cart-btn").first()).toContainText("1", { timeout: 15_000 });

    await page.goto("/cart");
    await expect(page.getByText("تم حفظ سلتك في حسابك؛ ستظهر عند الدخول من جهاز آخر.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await openCheckoutFromCart(page);
    await fillExactCheckoutPayload(page, customerName, phone, notes);
    const firstSubmit = page.getByRole("button", { name: "تأكيد الطلب", exact: true });
    await expect(firstSubmit, "Server-side cart validation must finish before the request.").toBeEnabled({ timeout: 45_000 });

    await page.route("**/rest/v1/rpc/submit_customer_order*", async (route) => {
      submitCalls += 1;
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (submitCalls === 1) {
        firstRequest = body;
        const upstream = await route.fetch();
        expect(upstream.ok(), "The real Supabase RPC must commit before the acknowledgement is hidden.").toBe(true);
        const parsed = JSON.parse(await upstream.text());
        committedResult = (Array.isArray(parsed) ? parsed[0] : parsed) as { id?: unknown; order_number?: unknown };
        expect(typeof committedResult?.id).toBe("string");
        expect(typeof committedResult?.order_number).toBe("string");
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ message: "P2 simulated lost acknowledgement after server commit" }),
        });
        return;
      }
      replayRequest = body;
      await route.continue();
    });

    await firstSubmit.click();
    await expect(page.getByText(/لم يصل تأكيد نهائي لنتيجة الطلب/)).toBeVisible({ timeout: 30_000 });
    expect(submitCalls).toBe(1);
    expect(firstRequest?._idempotency_key).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]{16,128}$/));
    const firstKey = String(firstRequest?._idempotency_key);

    const savedAttempt = await page.evaluate(() => {
      const entry = Object.entries(window.sessionStorage).find(([key]) => key.startsWith("aghbari:checkout-attempt:v1:"));
      if (!entry) return null;
      try {
        return JSON.parse(entry[1]) as { signature?: unknown; key?: unknown };
      } catch {
        return null;
      }
    });
    expect(savedAttempt?.key).toBe(firstKey);
    expect(typeof savedAttempt?.signature).toBe("string");

    // The database committed and atomically checked out the persistent cart, but the
    // browser did not receive the success acknowledgement. A reload must retain the
    // local cart draft and the profile-scoped key so it can replay the exact payload.
    await page.reload();
    await openCheckoutFromCart(page);
    await expect(page.getByText(/توجد محاولة طلب سابقة لم يصل تأكيدها بعد/)).toBeVisible({ timeout: 30_000 });
    await fillExactCheckoutPayload(page, customerName, phone, notes);
    const retry = page.getByRole("button", { name: "إعادة محاولة تأكيد الطلب نفسه", exact: true });
    await expect(retry, "The same cart and exact request signature must be restored.").toBeEnabled({ timeout: 45_000 });
    await retry.click();

    const confirmation = page.locator(".sf-confirm");
    await expect(confirmation.getByRole("heading", { name: "تم استلام طلبك بنجاح!" })).toBeVisible({ timeout: 45_000 });
    const confirmationText = await confirmation.locator("p").first().innerText();
    const match = confirmationText.match(/رقم الطلب\s*:\s*(\S+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(committedResult!.order_number);
    expect(submitCalls).toBe(2);
    expect(replayRequest?._idempotency_key).toBe(firstKey);
    expect(replayRequest?._items).toEqual(firstRequest?._items);
    expect(replayRequest?._notes).toBe(firstRequest?._notes);
    expect(replayRequest?._contact_name).toBe(firstRequest?._contact_name);
    expect(replayRequest?._phone).toBe(firstRequest?._phone);
    expect(replayRequest?._payment_terms).toBe(firstRequest?._payment_terms);
    expect(replayRequest?._delivery_address_id).toBe(firstRequest?._delivery_address_id);

    const orderId = String(committedResult!.id);
    expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);
    const db = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
    try {
      const orders = await db.unsafe(
        "select id::text,order_number,status,idempotency_key from public.orders where idempotency_key=$1",
        [firstKey],
      );
      verifiedOrderCount = orders.length;
      expect(orders, "Lost acknowledgement plus exact replay must leave one order row.").toHaveLength(1);
      expect(orders[0].id).toBe(orderId);
      expect(orders[0].order_number).toBe(committedResult!.order_number);
      expect(orders[0].status).toBe("pending");

      const lines = await db.unsafe(
        "select count(*)::int as line_count, coalesce(sum(quantity),0)::numeric::text as quantity from public.order_items where order_id=$1::uuid",
        [orderId],
      );
      expect(lines).toHaveLength(1);
      expect(lines[0].line_count).toBe(1);
      expect(Number(lines[0].quantity)).toBeGreaterThan(0);

      const events = await db.unsafe(
        "select id::text,event_type,idempotency_key from public.outbox_events where aggregate_id=$1::uuid and event_type='OrderCreated'",
        [orderId],
      );
      expect(events, "The replay must not enqueue a duplicate OrderCreated event.").toHaveLength(1);
      expect(events[0].idempotency_key).toBe("order-created:" + orderId);

      const checkedOutCarts = await db.unsafe(
        "select count(*)::int as count from public.customer_carts c join public.orders o on o.organization_id=c.organization_id and o.created_by=c.profile_id where o.id=$1::uuid and c.status='checked_out'",
        [orderId],
      );
      expect(checkedOutCarts[0].count).toBe(1);

      const prematureReservations = await db.unsafe(
        "select count(*)::int as count from public.inventory_movements where reference_type='order' and reference_id=$1::uuid and movement_type='reserve'",
        [orderId],
      );
      expect(prematureReservations[0].count).toBe(0);
    } finally {
      await db.end({ timeout: 5 });
    }

    await test.info().attach("checkout-lost-response-idempotency-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN + DATABASE_PROVEN",
        serverCommittedBeforeSynthetic502: true,
        browserReloaded: true,
        replayUsedSameIdempotencyKey: true,
        replayReturnedOriginalOrder: true,
        uniqueOrderRows: verifiedOrderCount,
        uniqueOrderCreatedOutboxEvents: 1,
        sourceCartCheckedOut: true,
        prematureReservations: 0,
        isolatedLocalPostgresOnly: true,
        productionWrites: false,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await context.close();
  }
});
