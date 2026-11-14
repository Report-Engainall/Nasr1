import { expect, test, type Route } from "@playwright/test";
import { registerCustomerOrdersKeyboardAcceptance } from "./helpers/customer-orders-keyboard-test";

registerCustomerOrdersKeyboardAcceptance();
import { storefrontCategorySlug } from "../src/lib/storefront-slugs";
function checkoutValidationBody(productId: string) {
  const item = {
    product_id: productId,
    name: "أرز اختبار",
    item_code: "SKU-001",
    unit: "كرتون",
    quantity: 2,
  };
  return {
    valid: true,
    items: [item],
    item_count: 1,
    currency: "YER",
    pricing_verified: true,
  };
}


type StorefrontFixtureHeaders = Record<string, string>;
type AdvancedSearchFixtureState = { categoryReads: number; allowCategorySuccess: boolean };

async function routeAdvancedSearchFixture(
  route: Route,
  headers: StorefrontFixtureHeaders,
  state: AdvancedSearchFixtureState,
): Promise<void> {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 200, headers });
    return;
  }
  if (pathname === "/rest/v1/rpc/get_public_storefront_context") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        organization_id: "11111111-1111-4111-8111-111111111111",
        warehouse_id: null,
      }),
    });
    return;
  }
  if (pathname === "/rest/v1/rpc/get_public_storefront_categories" && request.method() === "POST") {
    state.categoryReads += 1;
    const success = state.allowCategorySuccess;
    await route.fulfill({
      status: success ? 200 : 503,
      contentType: "application/json",
      headers,
      body: success ? "[]" : JSON.stringify({ message: "synthetic category outage" }),
    });
    return;
  }
  await route.abort("blockedbyclient");
}


test("public storefront and login routes render without external backend writes", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // The build uses a non-routable placeholder project. Intercept every request to it:
  // this browser smoke is intentionally read-only and must never depend on external credentials.
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  await page.goto("/");
  await expect(page.locator(".sf-header")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "المنتجات", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "دخول", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/الأغبري/);

  await page.getByRole("link", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();

  await page.goto("/catalog?q=smoke&available=1");
  await expect(page.locator(".sf-header")).toBeVisible();
  await expect(page.getByRole("heading", { name: "المنتجات", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/الكتالوج/);

  expect(pageErrors, "The public storefront routes must not throw uncaught browser errors.").toEqual([]);
});

test("subcategory deep link renders the child category screen", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const organizationId = "11111111-1111-4111-8111-111111111111";
  const parentId = "a1000000-0000-4000-8000-000000000222";
  const childId = "a1000000-0000-4000-8000-000000000333";
  const siblingId = "a1000000-0000-4000-8000-000000000555";
  const parentCategory = { id: parentId, name: "Beverages", name_en: "Beverages" };
  const childCategory = { id: childId, name: "Juices", name_en: "Juices" };
  const siblingCategory = { id: siblingId, name: "Soft Drinks", name_en: "Soft Drinks" };
  // Use the same production slug contract as category cards; hard-coded slugs drift when normalization changes.
  const parentSlug = storefrontCategorySlug(parentCategory);
  const childSlug = storefrontCategorySlug(childCategory);
  const siblingSlug = storefrontCategorySlug(siblingCategory);
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "apikey,authorization,content-type,x-client-info,prefer,accept-profile,content-profile,range",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };

  // All backend requests are deterministic local fixtures. Writes are blocked.
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers });
      return;
    }

    if (url.pathname === "/rest/v1/rpc/get_public_storefront_context") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          organization_id: organizationId,
          warehouse_id: null,
        }),
      });
      return;
    }

    if (url.pathname === "/rest/v1/rpc/get_public_storefront_categories" && request.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify([
          { id: parentId, name: "Beverages", code: "BEV", parent_id: null, sort_order: 1, is_active: true },
          { id: childId, name: "Juices", code: "JUICE", parent_id: parentId, sort_order: 2, is_active: true },
          { id: siblingId, name: "Soft Drinks", code: "SOFT-DRINKS", parent_id: parentId, sort_order: 3, is_active: true },
        ]),
      });
      return;
    }

    if (url.pathname === "/rest/v1/rpc/get_storefront_catalog_page" && request.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ page: 1, page_size: 24, total_count: 0, total_pages: 0, items: [] }),
      });
      return;
    }

    if (url.pathname === "/rest/v1/rpc/get_public_storefront_settings" && request.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ show_price_on_cards: false, show_price_in_cart: false, show_price_in_orders: false }),
      });
      return;
    }

    if (url.pathname === "/rest/v1/rpc/get_storefront_announcements" && request.method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", headers, body: "[]" });
      return;
    }

    if (request.method() !== "GET") {
      await route.abort("blockedbyclient");
      return;
    }

    // Read-only fixture: any remaining PostgREST GET is empty and no mutation reaches the network.
    if (url.pathname.startsWith("/rest/v1/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ...headers, "content-range": "0-0/*" },
        body: "[]",
      });
      return;
    }

    await route.abort("blockedbyclient");
  });

  await page.goto(`/category/${parentSlug}/subcategory/${childSlug}`);
  await expect(page).toHaveURL(new RegExp("/category/.*/subcategory/.*$"));
  await expect(page.getByRole("heading", { name: "Juices", exact: true })).toBeVisible();

  const breadcrumbs = page.getByRole("navigation", { name: "مسار التصنيف" });
  await expect(breadcrumbs.getByRole("link", { name: "جميع التصنيفات" })).toHaveAttribute("href", "/categories");
  await expect(breadcrumbs.getByRole("link", { name: "Beverages", exact: true }))
    .toHaveAttribute("href", "/category/" + parentSlug);
  await expect(breadcrumbs.getByText("Juices", { exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Beverages", exact: true })).toHaveCount(0);

  const siblings = page.getByRole("region", { name: "التصنيفات الشقيقة" });
  await expect(siblings.getByRole("link", { name: /Juices/ })).toHaveAttribute("aria-current", "page");
  await expect(siblings.getByRole("link", { name: /Soft Drinks/ }))
    .toHaveAttribute("href", "/category/" + parentSlug + "/subcategory/" + siblingSlug);

  // The directory must group the same public fixture under its parent rather than flattening child cards.
  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "تصنيفات المنتجات", exact: true })).toBeVisible();
  const mainCategories = page.getByRole("region", { name: "التصنيفات الرئيسية" });
  const beverageBranches = page.getByRole("region", { name: "الفروع التابعة لـ Beverages" });
  await expect(mainCategories.getByRole("heading", { name: "Beverages", exact: true })).toBeVisible();
  await expect(beverageBranches.getByRole("link", { name: /Juices/ })).toBeVisible();
  await expect(beverageBranches.getByRole("link", { name: /Soft Drinks/ })).toBeVisible();
  await expect(mainCategories.getByRole("heading", { name: "Juices", exact: true })).toHaveCount(0);
  await expect(mainCategories.getByRole("heading", { name: "Soft Drinks", exact: true })).toHaveCount(0);
  await expect(mainCategories.getByText((0).toLocaleString("ar-YE") + " صنف في التصنيف وفروعه")).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("advanced search recovers from a category-source failure", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const fixtureState: AdvancedSearchFixtureState = { categoryReads: 0, allowCategorySuccess: false };
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "apikey,authorization,content-type,x-client-info,prefer,accept-profile,content-profile,range",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };

  // A named dispatcher keeps route conditions shallow and preserves a no-write fixture.
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    routeAdvancedSearchFixture(route, headers, fixtureState),
  );

  await page.goto("/search/advanced");
  await expect(page).toHaveURL(/\/search\/advanced$/);
  await expect(page.getByRole("heading", { name: "البحث المتقدم", exact: true })).toBeVisible();
  const categorySelect = page.locator("#advanced-storefront-category");
  // useFetch intentionally presents a generic customer-safe error, not the raw PostgREST body.
  const categoryError = page
    .getByRole("alert")
    .filter({ hasText: "تعذر تحميل التصنيفات:" });
  await expect(categoryError).toBeVisible();
  await expect(categorySelect).toBeDisabled();
  // Prove the category endpoint itself was hit for all automatic transient retries.
  expect(fixtureState.categoryReads).toBeGreaterThanOrEqual(3);

  fixtureState.allowCategorySuccess = true;
  await page.getByRole("button", { name: "إعادة تحميل التصنيفات" }).click();
  await expect(categorySelect).toBeEnabled();
  await expect(categoryError).toHaveCount(0);

  expect(fixtureState.categoryReads).toBeGreaterThanOrEqual(4);
  expect(pageErrors).toEqual([]);
});

test("reset-password rejects an invalid password without reporting success", async ({ page }) => {
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "تعيين كلمة مرور جديدة" })).toBeVisible();

  await page.getByLabel("كلمة المرور الجديدة").fill("short");
  await page.getByRole("button", { name: "حفظ" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
  );
  await expect(page).toHaveURL(/\/reset-password$/);
});

test("cart and checkout ignore browser-stored money without an authorized server price preview", async ({ page }) => {
  const pageErrors: string[] = [];
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const productId = "a1000000-0000-4000-8000-000000000444";
  const cartStorageKey = "aghbari:cart:v2:guest";
  let pricingPreviewCalls = 0;
  let orderSubmissionCalls = 0;

  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "apikey,authorization,content-type,x-client-info,prefer,accept-profile,content-profile,range",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };

  page.on("pageerror", (error) => pageErrors.push(error.message));
  // Re-seed on each navigation so both real route wrappers receive the hostile legacy-shaped draft.
  // The application's normalizer must retain only product_id and quantity.
  await page.addInitScript(
    ({ storageKey, draft }) => {
      window.localStorage.setItem(storageKey, JSON.stringify([draft]));
    },
    {
      storageKey: cartStorageKey,
      draft: {
        product_id: productId,
        quantity: 2,
        unit_price: 777777,
        line_total: 1555554,
      },
    },
  );

  // Deterministic, read-only API fixtures. No external database writes or credentials are used.
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers });
      return;
    }

    if (path === "/rest/v1/rpc/get_public_storefront_context") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ organization_id: organizationId, warehouse_id: null }),
      });
      return;
    }

    if (path === "/rest/v1/rpc/get_public_storefront_settings") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          show_price_on_cards: false,
          show_price_in_cart: true,
          show_price_in_orders: true,
          show_customer_tier_in_customer_views: false,
        }),
      });
      return;
    }

    if (path === "/rest/v1/rpc/get_storefront_product_prices") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify([{ product_id: productId, unit_price: 1234 }]),
      });
      return;
    }

    if (path === "/rest/v1/rpc/validate_checkout_cart") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify(checkoutValidationBody(productId)),
      });
      return;
    }

    if (path === "/rest/v1/rpc/preview_customer_order_pricing") {
      pricingPreviewCalls += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ message: "authenticated customer profile required" }),
      });
      return;
    }

    if (path === "/rest/v1/rpc/submit_customer_order") {
      orderSubmissionCalls += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ message: "authenticated customer required" }),
      });
      return;
    }

    if (path === "/rest/v1/rpc/get_public_storefront_categories" && request.method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", headers, body: "[]" });
      return;
    }

    if (path === "/rest/v1/rpc/get_storefront_catalog_page" && request.method() === "POST") {
      const body = request.postDataJSON() as { p_page?: unknown; p_page_size?: unknown };
      const page = typeof body.p_page === "number" ? body.p_page : 1;
      const pageSize = typeof body.p_page_size === "number" ? body.p_page_size : 24;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          page,
          page_size: pageSize,
          total_count: 1,
          total_pages: 1,
          items: [{
            id: productId,
            name: "أرز اختبار",
            name_en: null,
            item_code: "SKU-001",
            sku: null,
            barcode: null,
            category_id: null,
            brand_id: null,
            unit: "كرتون",
            description: "اختبار إخفاء مبالغ التخزين المحلي",
            image_url: null,
            is_active: true,
            is_featured: false,
            sort_order: 1,
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
            display_price: null,
            min_order_quantity: 1,
            order_quantity_multiple: 1,
            inventory: { product_id: productId, quantity_available: 3 },
          }],
        }),
      });
      return;
    }

    if (path.startsWith("/rest/v1/") && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ...headers, "content-range": "0-0/0" },
        body: "[]",
      });
      return;
    }

    // Unknown RPCs and every non-read endpoint are blocked by default.
    if (path.startsWith("/rest/v1/rpc/") && request.method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", headers, body: "[]" });
      return;
    }
    await route.abort("blockedbyclient");
  });

  for (const pathname of ["/cart", "/checkout"]) {
    await page.goto(pathname);
    await expect(
      page.getByRole("heading", {
        name: pathname === "/cart" ? "سلة المشتريات" : "إتمام الطلب",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("أرز اختبار", { exact: true })).toBeVisible();
    await expect(
      page.getByText("سجّل الدخول أولًا؛ لن تُعرض الأسعار دون معاينة خادمية مرتبطة بحسابك.", {
        exact: true,
      }),
    ).toBeVisible();

    // No browser-supplied unit price/line total may escape into rendered text or markup.
    const visibleText = await page.locator("body").innerText();
    const markup = await page.locator("body").innerHTML();
    expect(visibleText).not.toContain("777777");
    expect(visibleText).not.toContain("1555554");
    expect(markup).not.toContain("777777");
    expect(markup).not.toContain("1555554");
    await expect(page.locator(".sf-order-pricing-total")).toHaveCount(0);
    await expect(page.getByText(/سعر الوحدة/)).toHaveCount(0);

    const persistedDraft = await page.evaluate((key) => window.localStorage.getItem(key), cartStorageKey);
    expect(persistedDraft).not.toContain("777777");
    expect(persistedDraft).not.toContain("1555554");
    expect(JSON.parse(persistedDraft ?? "null")).toEqual([{ product_id: productId, quantity: 2 }]);
  }

  // No authenticated customer exists in this read-only fixture; therefore an RPC preview,
  // an order submission, or a client-authored success must never be attempted.
  expect(pricingPreviewCalls).toBe(0);
  expect(orderSubmissionCalls).toBe(0);
  expect(pageErrors).toEqual([]);
});


test("admin export URL denies the protected export workspace to an unauthenticated visitor", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // An unauthenticated smoke visitor must not be given a fabricated admin session.
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  const response = await page.goto("/admin/exports");
  expect(response?.status(), "The direct export URL must resolve to an application response.").toBe(200);
  await expect(page).toHaveURL(/\/admin\/exports\/?$/);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "تصدير الطلبات غير المتزامن", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "إنشاء ملف CSV", exact: true })).toHaveCount(0);

  expect(
    pageErrors,
    "Direct navigation to /admin/exports must not produce uncaught browser errors.",
  ).toEqual([]);
});

test("public customer routes preserve RTL and fit mobile and desktop viewports", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);

    for (const route of ["/", "/catalog?q=viewport-smoke", "/login"]) {
      await page.goto(route);
      if (route === "/login") {
        await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
        await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
      } else {
        await expect(page.locator(".sf-header")).toBeVisible();
        await expect(page.getByRole("heading", { name: "المنتجات", exact: true })).toBeVisible();
      }

      const layout = await page.evaluate(() => ({
        lang: document.documentElement.lang.toLowerCase(),
        direction: getComputedStyle(document.documentElement).direction,
        viewportWidth: window.innerWidth,
        documentWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
      }));
      expect(layout.lang).toMatch(/^ar(?:-|$)/);
      expect(layout.direction).toBe("rtl");
      expect(
        layout.documentWidth,
        `Horizontal overflow on ${route} at ${viewport.width}px viewport`,
      ).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  }

  expect(pageErrors, "Public customer routes must not throw uncaught browser errors.").toEqual([]);
});


test("login supports keyboard-only focus and password-visibility control", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();

  const email = page.getByLabel("البريد الإلكتروني");
  const password = page.getByRole("textbox", { name: /كلمة المرور/ });
  await expect(email).toBeVisible();

  // Reach the field with real keyboard Tab navigation; do not call locator.focus().
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await email.evaluate((element) => document.activeElement === element)) break;
    await page.keyboard.press("Tab");
  }
  await expect(email).toBeFocused();

  const emailFocus = await email.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth), outlineColor: style.outlineColor };
  });
  expect(emailFocus.outlineStyle).toBe("solid");
  expect(emailFocus.outlineWidth).toBeGreaterThanOrEqual(3);
  expect(emailFocus.outlineColor).toBe("rgb(20, 83, 45)");

  const phoneLogin = page.getByRole("button", { name: "تسجيل الدخول برقم الهاتف" });
  await page.keyboard.press("Tab");
  await expect(phoneLogin).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");

  const showPassword = page.getByRole("button", { name: "إظهار كلمة المرور" });
  await expect(showPassword).toBeFocused();
  const toggleFocus = await showPassword.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth), outlineColor: style.outlineColor };
  });
  expect(toggleFocus.outlineStyle).toBe("solid");
  expect(toggleFocus.outlineWidth).toBeGreaterThanOrEqual(3);
  expect(toggleFocus.outlineColor).toBe("rgb(20, 83, 45)");

  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "إخفاء كلمة المرور" })).toBeFocused();
  await expect(password).toHaveAttribute("type", "text");
  expect(pageErrors).toEqual([]);
});


test("customer navigation routes preserve metadata, RTL, and viewport fit", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // This is a read-only browser acceptance: no production credentials and no backend writes.
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  const routes = [
    { path: "/categories", title: "التصنيفات | متجر الأغبري" },
    { path: "/collections", title: "التصنيفات | متجر الأغبري" },
    { path: "/offers", title: "العروض | متجر الأغبري" },
    { path: "/search/advanced", title: "البحث المتقدم | متجر الأغبري" },
    { path: "/products?q=viewport-smoke", title: "المنتجات | متجر الأغبري" },
    { path: "/search?q=viewport-smoke", title: "البحث | متجر الأغبري" },
    { path: "/cart", title: "سلة المشتريات | الأغبري" },
    { path: "/wishlist", title: "المفضلة | الأغبري" },
    { path: "/compare", title: "مقارنة المنتجات | الأغبري" },
    { path: "/register", title: "إنشاء حساب تجاري | الأغبري" },
    { path: "/forgot-password", title: "استعادة كلمة المرور | الأغبري" },
  ];

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);

    for (const route of routes) {
      const response = await page.goto(route.path);
      expect(response?.status(), `Direct navigation failed for ${route.path}`).toBe(200);
      await expect(page).toHaveTitle(route.title);
      await expect(
        page.locator("h1:visible, h2:visible").first(),
        `Expected an accessible page heading on ${route.path}`,
      ).toBeVisible();

      const layout = await page.evaluate(() => ({
        lang: document.documentElement.lang.toLowerCase(),
        direction: getComputedStyle(document.documentElement).direction,
        viewportWidth: window.innerWidth,
        documentWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
      }));
      expect(layout.lang, `Wrong document language on ${route.path}`).toMatch(/^ar(?:-|$)/);
      expect(layout.direction, `Wrong text direction on ${route.path}`).toBe("rtl");
      expect(
        layout.documentWidth,
        `Horizontal overflow on ${route.path} at ${viewport.width}px viewport`,
      ).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  }

  expect(pageErrors, "Customer navigation routes must not throw uncaught browser errors.").toEqual([]);
});

test("customer account and offline routes preserve direct navigation, RTL, and viewport fit", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  const routes = [
    { path: "/addresses", title: "عناوين التوصيل | الأغبري" },
    { path: "/orders/", title: "طلباتي | الأغبري" },
    { path: "/invoices", title: "الفواتير | الأغبري" },
    { path: "/statement", title: "كشف الحساب | الأغبري" },
    { path: "/offline", title: "العمل دون اتصال | الأغبري" },
  ];

  for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const response = await page.goto(route.path);
      expect(response?.status(), `Direct navigation failed for ${route.path}`).toBe(200);
      await expect(page).toHaveTitle(route.title);
      const layout = await page.evaluate(() => ({
        lang: document.documentElement.lang.toLowerCase(),
        direction: getComputedStyle(document.documentElement).direction,
        viewportWidth: window.innerWidth,
        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      }));
      expect(layout.lang, `Wrong document language on ${route.path}`).toMatch(/^ar(?:-|$)/);
      expect(layout.direction, `Wrong text direction on ${route.path}`).toBe("rtl");
      expect(layout.documentWidth, `Horizontal overflow on ${route.path} at ${viewport.width}px viewport`)
        .toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  }
  expect(pageErrors, "Customer account and offline routes must not throw uncaught browser errors.").toEqual([]);
});

test("critical admin routes preserve direct navigation, RTL, and mobile viewport fit", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  const routes = [
    { path: "/admin", title: "لوحة تحكم الأغبري | مركز التشغيل" },
    { path: "/admin/products", title: "إدارة المنتجات | الأغبري" },
    { path: "/admin/pricing", title: "التسعير والمخزون | الأغبري" },
    { path: "/admin/finance", title: "الفواتير والتحصيل | لوحة الإدارة" },
    { path: "/admin/reports", title: "التقارير | الأغبري" },
    { path: "/admin/exports", title: "تصدير الطلبات | متجر الأغبري" },
    { path: "/admin/stock-count", title: "الجرد الفعلي للمخزون | متجر الأغبري" },
    { path: "/admin/tasks", title: "المهام التشغيلية | متجر الأغبري" },
    { path: "/admin/audit", title: "سجل التدقيق | متجر الأغبري" },
    { path: "/admin/operations", title: "العمليات | الأغبري" },
    { path: "/admin/notifications", title: "التنبيهات | الأغبري" },
    { path: "/admin/suppliers", title: "الموردون | الأغبري" },
    { path: "/admin/settings", title: "الإعدادات | الأغبري" },
    { path: "/admin/quotes", title: "عروض الأسعار | لوحة الإدارة" },
    { path: "/admin/ai", title: "مركز الذكاء | الأغبري" },
    { path: "/admin/devices", title: "الأجهزة والجلسات | متجر الأغبري" },
    { path: "/admin/inventory-transfers", title: "سجل تحويلات المخزون | متجر الأغبري" },
    { path: "/admin/purchase-orders", title: "أوامر الشراء | متجر الأغبري" },
  ];

  for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const response = await page.goto(route.path);
      expect(response?.status(), `Direct navigation failed for ${route.path}`).toBe(200);
      await expect(page).toHaveTitle(route.title);
      const layout = await page.evaluate(() => ({
        lang: document.documentElement.lang.toLowerCase(),
        direction: getComputedStyle(document.documentElement).direction,
        viewportWidth: window.innerWidth,
        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      }));
      expect(layout.lang, `Wrong document language on ${route.path}`).toMatch(/^ar(?:-|$)/);
      expect(layout.direction, `Wrong text direction on ${route.path}`).toBe("rtl");
      expect(layout.documentWidth, `Horizontal overflow on ${route.path} at ${viewport.width}px viewport`)
        .toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  }
  expect(pageErrors, "Critical admin routes must not throw uncaught browser errors.").toEqual([]);
});



test("daily decision board stays keyboard-operable and fits mobile and desktop Chromium viewports", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const fixturePath = "/e2e/fixtures/daily-decision-board.html";
  const fixtureBase = process.env.E2E_PRICE_FIXTURE_BASE_URL;
  const fixtureUrl = fixtureBase ? new URL(fixturePath, fixtureBase).toString() : fixturePath;

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const response = await page.goto(fixtureUrl);
    expect(response?.status(), "The isolated decision-board fixture must be served by the component harness.")
      .toBe(200);

    const board = page.getByRole("region", { name: "لوحة متابعة القرارات اليومية" });
    await expect(board).toBeVisible();
    await expect(board.getByRole("status").first()).toContainText("تغطية جزئية");
    const savedDecisions = board.getByRole("list", { name: "قرارات محفوظة مرتبة للمتابعة" });
    await expect(savedDecisions).toBeVisible();
    await expect(savedDecisions.locator(":scope > li")).toHaveCount(2);
    expect(await savedDecisions.locator("h3").allTextContents()).toEqual([
      "قرار اختبار A — عنوان عربي طويل لا يتسبب في تجاوز عرض الشاشة على الهاتف.",
      "قرار اختبار Z — الترتيب ثابت حتى عندما تتساوى حقول المتابعة والتاريخ والانحراف المثبت.",
    ]);

    const layout = await page.evaluate(() => ({
      lang: document.documentElement.lang.toLowerCase(),
      direction: getComputedStyle(document.documentElement).direction,
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      boardWidth: document.querySelector('[aria-labelledby="daily-decision-board-title"]')?.getBoundingClientRect().width ?? 0,
    }));
    expect(layout.lang).toMatch(/^ar(?:-|$)/);
    expect(layout.direction).toBe("rtl");
    expect(layout.documentWidth, "Decision board caused horizontal overflow at " + viewport.width + "px.")
      .toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.boardWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

    const reason = board.getByRole("textbox", { name: "سبب الإجراء وسجل القرار" }).first();
    const action = board.getByRole("button", { name: "إرسال للمراجعة" }).first();
    await page.keyboard.press("Tab");
    await expect(reason).toBeFocused();
    const reasonFocus = await reason.evaluate(element => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(reasonFocus.outlineStyle).not.toBe("none");
    expect(reasonFocus.outlineWidth).toBeGreaterThan(0);

    await page.keyboard.press("Tab");
    await expect(action).toBeFocused();
    const actionFocus = await action.evaluate(element => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(actionFocus.outlineStyle).not.toBe("none");
    expect(actionFocus.outlineWidth).toBeGreaterThan(0);
  }

  expect(pageErrors, "The real decision-board component must not throw browser errors in its isolated harness.")
    .toEqual([]);
});

test("admin access matrix compares every role and keeps wide tables keyboard-scrollable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const fixturePath = "/e2e/fixtures/admin-access-matrix.html";
  const fixtureBase = process.env.E2E_PRICE_FIXTURE_BASE_URL;
  const fixtureUrl = fixtureBase ? new URL(fixturePath, fixtureBase).toString() : fixturePath;

  for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    const response = await page.goto(fixtureUrl);
    expect(response?.status(), "The isolated access-matrix fixture must be served by the component harness.").toBe(200);

    const matrix = page.getByRole("region", { name: "مصفوفة الوصول والعمليات حسب الدور" });
    const pages = page.getByRole("region", { name: "جدول مقارنة الوصول إلى الصفحات حسب الدور" });
    const operations = page.getByRole("region", { name: "جدول مقارنة العمليات وحدودها حسب الدور" });
    await expect(matrix).toBeVisible();
    await expect(pages).toBeVisible();
    await expect(operations).toBeVisible();

    const pageTable = pages.getByRole("table", { name: "مصفوفة وصول الصفحات حسب الدور" });
    const operationTable = operations.getByRole("table", { name: "مصفوفة العمليات وحدودها حسب الدور" });
    const roles = ["مدير النظام", "مدير", "موظف تشغيل", "محاسب", "مسؤول العملاء", "عميل"];
    for (const role of roles) {
      await expect(pageTable.getByRole("columnheader", { name: role, exact: true })).toBeVisible();
      await expect(operationTable.getByRole("columnheader", { name: role, exact: true })).toBeVisible();
    }

    await expect(pages.getByTestId("page-finance-staff")).toContainText("ممنوع");
    await expect(pages.getByTestId("page-finance-staff")).toContainText("تتطلب مساحة المالية");
    await expect(operations.getByTestId("operation-pricing_rules_write-staff")).toContainText("ممنوع");
    await expect(operations.getByTestId("operation-pricing_rules_write-staff")).toContainText("تعديل القواعد القائمة");

    const layout = await page.evaluate(() => ({
      lang: document.documentElement.lang.toLowerCase(),
      direction: getComputedStyle(document.documentElement).direction,
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      pageClientWidth: document.querySelector('[aria-label="جدول مقارنة الوصول إلى الصفحات حسب الدور"]')?.clientWidth ?? 0,
      pageScrollWidth: document.querySelector('[aria-label="جدول مقارنة الوصول إلى الصفحات حسب الدور"]')?.scrollWidth ?? 0,
    }));
    expect(layout.lang).toMatch(/^ar(?:-|$)/);
    expect(layout.direction).toBe("rtl");
    expect(layout.documentWidth, "Access matrix caused document-level horizontal overflow at " + viewport.width + "px.")
      .toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.pageClientWidth).toBeGreaterThan(0);
    if (viewport.width === 360) {
      expect(layout.pageScrollWidth).toBeGreaterThan(layout.pageClientWidth);
    }

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(pages).toBeFocused();
    const focus = await pages.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(focus.outlineStyle).not.toBe("none");
    expect(focus.outlineWidth).toBeGreaterThan(0);
    await page.keyboard.press("Tab");
    await expect(operations).toBeFocused();
  }

  expect(pageErrors, "The real access-matrix component must not throw browser errors in its isolated harness.").toEqual([]);
});

test("help center navigation, Arabic search and action destinations are browser-proven", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // Read-only public browser proof: no hosted Supabase request or mutation is allowed.
  await page.route("https://tfdwtuwkdddnzgyhcoyy.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );
  await page.setViewportSize({ width: 360, height: 820 });

  // Direct deep link.
  await page.goto("/help");
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { name: "مركز المساعدة", exact: true })).toBeVisible();
  await expect(page.locator("main[dir='rtl']")).toHaveCount(1);
  await expect(page).toHaveTitle(/مركز المساعدة/);

  // Arabic search normalization, no-results and clear behavior.
  const search = page.getByRole("searchbox");
  await expect(search).toHaveAccessibleName("ابحث في الأسئلة الشائعة");
  await expect(search).toBeVisible();
  await expect(page.getByRole("heading", { name: "الطلبات", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "الحساب والتوصيل", exact: true })).toBeVisible();

  await search.fill("كِيف أُرْسِل");
  await expect(page.getByText("كيف أرسل طلب شراء؟", { exact: true })).toBeVisible();
  await expect(page.getByText("كيف أتابع حالة طلبي؟", { exact: true })).toHaveCount(0);

  const clearSearch = page.getByRole("button", { name: "مسح البحث", exact: true });
  await search.focus();
  await page.keyboard.press("Tab");
  await expect(clearSearch).toBeFocused();
  await clearSearch.click();
  await expect(page.getByText("كيف أتابع حالة طلبي؟", { exact: true })).toBeVisible();

  await search.fill("تذكرة حجز طيران");
  await expect(page.getByRole("status").filter({ hasText: "لم نعثر على إجابة مطابقة." })).toBeVisible();
  await clearSearch.click();
  await expect(page.getByText("كيف أرسل طلب شراء؟", { exact: true })).toBeVisible();

  // Each CTA must point to an existing route; authorization remains enforced by its route/RPC.
  const expectedActionPaths = [
    ["متابعة طلباتي", "/orders"],
    ["مرتجعاتي", "/returns"],
    ["دفعاتي", "/payments"],
    ["ملفي الشخصي", "/profile"],
    ["كلمة المرور", "/account/password"],
    ["إعادة الطلب", "/reorder"],
    ["عناوين التوصيل", "/addresses"],
    ["الفواتير", "/invoices"],
    ["عروض الأسعار", "/quotes"],
    ["أعضاء الشركة", "/company/members"],
  ] as const;
  for (const [label, href] of expectedActionPaths) {
    const action = page.getByRole("link", { name: label });
    await expect(action, "Help action should lead to the existing " + href + " route").toHaveAttribute("href", href);
  }
  await expect(page.getByRole("link", { name: /فتح مركز خدمة العملاء/ }))
    .toHaveAttribute("href", "/service-cases");

  // Native FAQ disclosure must remain keyboard operable.
  const firstQuestion = page.locator("details summary").first();
  await firstQuestion.focus();
  await expect(firstQuestion).toBeFocused();
  await firstQuestion.press("Enter");
  await expect(firstQuestion.locator("xpath=..")).toHaveAttribute("open", "");

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "The help center must not overflow horizontally at 360px.",
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "The help center must not overflow horizontally at 1280px.",
  ).toBe(true);

  // Global navigation entrypoint.
  await page.goto("/");
  const globalNavigation = page.getByRole("navigation", { name: "التنقل الرئيسي" });
  await globalNavigation.getByRole("link", { name: "المساعدة", exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);

  // Storefront footer entrypoint.
  await page.getByRole("link", { name: "العودة إلى المتجر", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const storefrontFooter = page.locator(".sf-footer");
  await expect(storefrontFooter).toBeVisible();
  const footerHelp = storefrontFooter.getByRole("link", { name: "مركز المساعدة", exact: true });
  await expect(footerHelp).toHaveAttribute("href", "/help");
  await footerHelp.click();
  await expect(page).toHaveURL(/\/help$/);

  expect(pageErrors, "Help center navigation and search must not throw browser errors.").toEqual([]);
});

