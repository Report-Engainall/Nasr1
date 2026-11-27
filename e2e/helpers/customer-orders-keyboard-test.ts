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

type CustomerOrdersFixtureRow = typeof orderRows[number];
type CustomerOrdersSearchFixture = {
  rows: CustomerOrdersFixtureRow[];
  requests: Array<{
    orderNumberFilter: string | null;
    statusFilter: string | null;
    range: string | null;
    prefer: string | null;
  }>;
};

const searchableOrderRows: CustomerOrdersFixtureRow[] = Array.from({ length: 30 }, (_, index) => {
  const ordinal = 30 - index;
  const suffix = String(ordinal).padStart(4, "0");
  return {
    ...orderRows[0],
    id: "a3000000-0000-4000-8000-" + String(ordinal).padStart(12, "0"),
    order_number: "SO-2026-" + suffix,
    status: ordinal % 2 === 0 ? "pending" : "confirmed",
    total_items: ordinal,
    created_at: new Date(Date.UTC(2026, 0, ordinal)).toISOString(),
  };
});

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
  searchFixture?: CustomerOrdersSearchFixture,
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
    if (searchFixture) {
      const url = new URL(request.url());
      const orderNumberFilter = url.searchParams.get("order_number");
      const statusFilter = url.searchParams.get("status");
      const searchToken = orderNumberFilter?.startsWith("ilike.")
        ? orderNumberFilter.slice("ilike.".length).replace(/^\*/, "").replace(/\*$/, "")
        : null;
      const visibleRows = searchFixture.rows.filter((row) => {
        const matchesNumber = !searchToken || row.order_number.toLowerCase().includes(searchToken.toLowerCase());
        const matchesStatus = !statusFilter || !statusFilter.startsWith("eq.") || row.status === statusFilter.slice(3);
        return matchesNumber && matchesStatus;
      });
      const allHeaders = await request.allHeaders();
      const range = allHeaders.range ?? allHeaders.Range ?? "0-24";
      const [rangeStart, rangeEnd] = range.split("-").map(Number);
      const from = Number.isSafeInteger(rangeStart) && rangeStart >= 0 ? rangeStart : 0;
      const to = Number.isSafeInteger(rangeEnd) && rangeEnd >= from ? rangeEnd : from + 24;
      const pageRows = visibleRows.slice(from, to + 1);
      searchFixture.requests.push({
        orderNumberFilter,
        statusFilter,
        range: allHeaders.range ?? allHeaders.Range ?? null,
        prefer: allHeaders.prefer ?? allHeaders.Prefer ?? null,
      });
      const contentRange = visibleRows.length === 0
        ? "*/0"
        : `${from}-${Math.min(to, visibleRows.length - 1)}/${visibleRows.length}`;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ...customerOrdersFixtureHeaders, "content-range": contentRange },
        body: JSON.stringify(pageRows),
      });
      return;
    }
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

  test("customer order-number search normalizes Arabic/Persian digits, composes status, exact count and pagination", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const session = signedInCustomerFixtureSession();
    const fixture: CustomerOrdersSearchFixture = { rows: searchableOrderRows, requests: [] };
    await page.addInitScript(({ storageKey, session }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    }, {
      storageKey: "sb-tfdwtuwkdddnzgyhcoyy-auth-token",
      session,
    });
    await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
      handleCustomerOrdersFixtureRequest(route, session.user, fixture),
    );

    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "طلباتي", exact: true })).toBeVisible();
    const input = page.getByRole("textbox", { name: "رقم الطلب للبحث" });
    const searchForm = page.getByRole("form", { name: "البحث في سجل الطلبات" });
    const status = page.getByRole("combobox", { name: "تصفية طلباتي حسب الحالة" });
    const resultCount = page.getByRole("status", { name: "إجمالي نتائج الطلبات" });

    await expect(page.locator("tbody tr")).toHaveCount(25);
    await expect(resultCount).toContainText("إجمالي النتائج");
    await expect(page.getByRole("status", { name: "صفحة الطلبات الحالية" })).toContainText("صفحة 1 من 2");
    await expect.poll(() => fixture.requests.at(-1)?.range).toBe("0-24");
    await expect(fixture.requests[0]?.prefer ?? "").toContain("count=exact");

    // Move to page two, then apply a one-record search. Old page-two rows must disappear.
    await page.getByRole("button", { name: "صفحة الطلبات التالية" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(5);
    await expect(page.getByText("SO-2026-0005", { exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "صفحة الطلبات الحالية" })).toContainText("صفحة 2 من 2");

    async function submitSearch(value: string): Promise<void> {
      const previousRequests = fixture.requests.length;
      await input.fill(value);
      await searchForm.getByRole("button", { name: "بحث", exact: true }).click();
      await expect.poll(() => fixture.requests.length).toBeGreaterThan(previousRequests);
    }

    await submitSearch("٠٠٢٨");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByText("SO-2026-0028", { exact: true })).toBeVisible();
    await expect(page.getByText("SO-2026-0005", { exact: true })).toHaveCount(0);
    await expect.poll(() => fixture.requests.at(-1)?.orderNumberFilter).toBe("ilike.*0028*");
    await expect.poll(() => fixture.requests.at(-1)?.range).toBe("0-24");
    expect(fixture.requests.at(-1)?.statusFilter).toBeNull();

    // Persian and ASCII digits must yield the same server-side numeric token.
    await submitSearch("۰۰۲۹");
    await expect(page.getByText("SO-2026-0029", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.requests.at(-1)?.orderNumberFilter).toBe("ilike.*0029*");

    await submitSearch("0030");
    await expect(page.getByText("SO-2026-0030", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.requests.at(-1)?.orderNumberFilter).toBe("ilike.*0030*");

    // ilike must remain case-insensitive when a customer types a Latin SKU-like order fragment.
    await submitSearch("so-2026-0027");
    await expect(page.getByText("SO-2026-0027", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.requests.at(-1)?.orderNumberFilter).toBe("ilike.*so-2026-0027*");

    // LIKE metacharacters are removed before the query reaches PostgREST.
    await submitSearch("%_2026-0028%");
    await expect(page.getByText("SO-2026-0028", { exact: true })).toBeVisible();
    await expect.poll(() => fixture.requests.at(-1)?.orderNumberFilter).toBe("ilike.*2026-0028*");

    // Partial match, status and exact count are applied to one server query.
    await submitSearch("2026-00");
    await expect(page.locator("tbody tr")).toHaveCount(25);
    await expect(resultCount).toContainText("٣٠");
    const beforeStatus = fixture.requests.length;
    await status.selectOption("pending");
    await expect.poll(() => fixture.requests.length).toBeGreaterThan(beforeStatus);
    await expect(page.locator("tbody tr")).toHaveCount(15);
    await expect(resultCount).toContainText("١٥");
    expect(fixture.requests.at(-1)).toMatchObject({
      orderNumberFilter: "ilike.*2026-00*",
      statusFilter: "eq.pending",
      range: "0-24",
    });

    // Clearing from page two resets pagination and removes both filters without stale rows.
    await status.selectOption("all");
    await expect(page.locator("tbody tr")).toHaveCount(25);
    await page.getByRole("button", { name: "صفحة الطلبات التالية" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(5);
    await expect(page.getByText("SO-2026-0005", { exact: true })).toBeVisible();
    const beforeClear = fixture.requests.length;
    await searchForm.getByRole("button", { name: "مسح", exact: true }).click();
    await expect.poll(() => fixture.requests.length).toBeGreaterThan(beforeClear);
    await expect(page.locator("tbody tr")).toHaveCount(25);
    await expect(page.getByText("SO-2026-0030", { exact: true })).toBeVisible();
    await expect(page.getByText("SO-2026-0005", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("status", { name: "صفحة الطلبات الحالية" })).toContainText("صفحة 1 من 2");
    expect(fixture.requests.at(-1)).toMatchObject({
      orderNumberFilter: null,
      statusFilter: null,
      range: "0-24",
    });

    await submitSearch("NO-MATCH");
    await expect(page.getByText("لا توجد طلبات تطابق رقم البحث.", { exact: true })).toBeVisible();
    await expect(resultCount).toContainText("٠");
    await expect(page.locator("tbody tr")).toHaveCount(0);

    expect(pageErrors, "Customer order search must not produce uncaught browser errors.").toEqual([]);
  });

  test("signed-out visitor cannot open the authenticated order-history search", async ({ page }) => {
    await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
      route.abort("blockedbyclient"),
    );
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "رقم الطلب للبحث" })).toHaveCount(0);
  });
}
