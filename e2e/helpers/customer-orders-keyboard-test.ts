import { randomBytes } from "node:crypto";
import { expect, test, type Route } from "@playwright/test";

const orderRows = [
  {
    id: "a2000000-0000-0000-0000-000000000001",
    order_number: "ORDER-001",
    status: "pending",
    total_items: 1,
    created_at: "2026-10-01T10:00:00.000Z",
    quantity_review_required: false,
    customer_adjustment_note: null,
    customer_payment_requested_at: null,
    payment_request_status: null,
  },
  {
    id: "a2000000-0000-0000-0000-000000000002",
    order_number: "ORDER-002",
    status: "confirmed",
    total_items: 2,
    created_at: "2026-10-02T10:00:00.000Z",
    quantity_review_required: false,
    customer_adjustment_note: null,
    customer_payment_requested_at: null,
    payment_request_status: null,
  },
];

function signedInCustomerFixtureSession() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: "supabase",
    sub: "a1000000-0000-0000-0000-000000000201",
    aud: "authenticated",
    role: "authenticated",
    email: "customer-orders-keyboard@example.test",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");

  return {
    access_token: header + "." + claims + "." + randomBytes(32).toString("base64url"),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: randomBytes(32).toString("base64url"),
    user: {
      id: "a1000000-0000-0000-0000-000000000201",
      aud: "authenticated",
      role: "authenticated",
      email: "customer-orders-keyboard@example.test",
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: "مشتري اختبار لوحة المفاتيح" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      identities: [],
      is_anonymous: false,
    },
  };
}


const customerProfileFixture = {
  profile_id: "a1000000-0000-0000-0000-000000000202",
  full_name: "مشتري اختبار لوحة المفاتيح",
  email: "customer-orders-keyboard@example.test",
  roles: ["customer"],
};

const customerOrdersFixtureHeaders = {
  "content-range": "0-1/2",
  "accept-ranges": "items",
  // Match PostgREST's browser-visible exact-count headers across the intercepted origin.
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "content-range, range",
};

async function handleCustomerOrdersFixtureRequest(
  route: Route,
  authenticatedUser: ReturnType<typeof signedInCustomerFixtureSession>["user"],
): Promise<void> {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;

  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "apikey,authorization,content-type,x-client-info,prefer,accept-profile,content-profile,range",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    });
    return;
  }

  if (pathname === "/auth/v1/user" && request.method() === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(authenticatedUser),
    });
    return;
  }

  if (pathname === "/rest/v1/rpc/ensure_profile" && request.method() === "POST") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(customerProfileFixture),
    });
    return;
  }

  if (pathname === "/rest/v1/rpc/ensure_my_customer_account" && request.method() === "POST") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: "true",
    });
    return;
  }

  if (pathname === "/rest/v1/orders" && request.method() === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: customerOrdersFixtureHeaders,
      body: JSON.stringify(orderRows),
    });
    return;
  }

  // Keep this browser acceptance read-only and isolated from all real services.
  await route.abort("blockedbyclient");
}

/**
 * Register this in the read-only public Chromium smoke job so keyboard traversal is
 * exercised in the actual routed customer-order table, without production credentials or writes.
 */
export function registerCustomerOrdersKeyboardAcceptance() {
  test("customer order detail links retain their Arabic text and navigate by Tab in Chromium", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const session = signedInCustomerFixtureSession();
    await page.addInitScript(({ storageKey, session }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    }, {
      storageKey: "sb-tfdwtuwkdddnzgyhcoyy-auth-token",
      session,
    });

    await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
      handleCustomerOrdersFixtureRequest(route, session.user),
    );

    const response = await page.goto("/orders");
    expect(response?.status(), "Direct navigation to the real customer order route must resolve.").toBe(200);
    await expect(page.getByRole("heading", { name: "طلباتي", exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "إجمالي نتائج الطلبات" })).toContainText("إجمالي النتائج");
    await expect(page.locator("tbody tr")).toHaveCount(2);

    const firstLink = page.getByRole("link", { name: "تفاصيل الطلب ORDER-001", exact: true });
    const secondLink = page.getByRole("link", { name: "تفاصيل الطلب ORDER-002", exact: true });
    await expect(firstLink).toHaveText("التفاصيل");
    await expect(secondLink).toHaveText("التفاصيل");
    await expect(firstLink).toBeVisible();
    await expect(secondLink).toBeVisible();

    // Focus the last interactive control before the table, then prove actual browser Tab order.
    await page.getByRole("combobox", { name: "تصفية طلباتي حسب الحالة" }).focus();
    await page.keyboard.press("Tab");
    await expect(firstLink).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(secondLink).toBeFocused();

    expect(pageErrors, "Customer orders must not throw uncaught browser errors.").toEqual([]);
  });
}
