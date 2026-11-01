import { expect, test, type Route } from "@playwright/test";
import { registerCustomerOrdersKeyboardAcceptance } from "./helpers/customer-orders-keyboard-test";


registerCustomerOrdersKeyboardAcceptance();
import { storefrontCategorySlug } from "../src/lib/storefront-slugs";

async function fulfillCategoryFixture(
  route: Route,
  headers: Record<string, string>,
  allowSuccess: boolean,
) {
  const response = allowSuccess
    ? {
        status: 200,
        contentType: "application/json",
        headers: { ...headers, "content-range": "0-0/*" },
        body: "[]",
      }
    : {
        status: 503,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ message: "synthetic category outage" }),
      };
  await route.fulfill(response);
}


test("public storefront and login routes render without external backend writes", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // The build uses a non-routable placeholder project. Intercept every request to it:
  // this browser smoke is intentionally read-only and must never depend on external credentials.
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
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
  const parentCategory = { id: parentId, name: "Beverages", name_en: "Beverages" };
  const childCategory = { id: childId, name: "Juices", name_en: "Juices" };
  // Use the same production slug contract as category cards; hard-coded slugs drift when normalization changes.
  const parentSlug = storefrontCategorySlug(parentCategory);
  const childSlug = storefrontCategorySlug(childCategory);
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "apikey,authorization,content-type,x-client-info,prefer,accept-profile,content-profile,range",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };

  // All backend requests are deterministic local fixtures. Writes are blocked.
  await page.route("https://ci-placeholder.supabase.co/**", async (route) => {
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

    if (url.pathname === "/rest/v1/categories" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ...headers, "content-range": "0-1/2" },
        body: JSON.stringify([
          {
            id: parentId,
            name: "Beverages",
            name_en: "Beverages",
            code: "BEV",
            parent_id: null,
            sort_order: 1,
            is_active: true,
            organization_id: organizationId,
          },
          {
            id: childId,
            name: "Juices",
            name_en: "Juices",
            code: "JUICE",
            parent_id: parentId,
            sort_order: 2,
            is_active: true,
            organization_id: organizationId,
          },
        ]),
      });
      return;
    }

    if (request.method() !== "GET") {
      await route.abort("blockedbyclient");
      return;
    }

    // Keep product, promotion, and other public reads inside this no-write fixture.
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
  await expect(page.getByText("Beverages / تصنيف فرعي", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beverages", exact: true })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("advanced search recovers from a category-source failure", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  let categoryReads = 0;
  let allowCategorySuccess = false;
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "apikey,authorization,content-type,x-client-info,prefer,accept-profile,content-profile,range",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };

  // Use one dispatcher for the placeholder origin so the catch-all abort cannot
  // shadow the two deterministic API fixtures below.
  await page.route("https://ci-placeholder.supabase.co/**", async (route) => {
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
          organization_id: "11111111-1111-4111-8111-111111111111",
          warehouse_id: null,
        }),
      });
      return;
    }

    if (url.pathname === "/rest/v1/categories") {
      categoryReads += 1;
      await fulfillCategoryFixture(route, headers, allowCategorySuccess);
      return;
    }

    await route.abort("blockedbyclient");
  });

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
  expect(categoryReads).toBeGreaterThanOrEqual(3);

  allowCategorySuccess = true;
  await page.getByRole("button", { name: "إعادة تحميل التصنيفات" }).click();
  await expect(categorySelect).toBeEnabled();
  await expect(categoryError).toHaveCount(0);

  expect(categoryReads).toBeGreaterThanOrEqual(4);
  expect(pageErrors).toEqual([]);
});

test("reset-password rejects an invalid password without reporting success", async ({ page }) => {
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
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
  await page.route("https://ci-placeholder.supabase.co/**", async (route) => {
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
        body: JSON.stringify({
          valid: true,
          items: [{ product_id: productId, name: "أرز اختبار", item_code: "SKU-001", unit: "كرتون", quantity: 2 }],
          item_count: 1,
          currency: "YER",
          pricing_verified: true,
        }),
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

    if (path === "/rest/v1/products" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ...headers, "content-range": "0-0/1" },
        body: JSON.stringify([{
          id: productId,
          organization_id: organizationId,
          category_id: null,
          name: "أرز اختبار",
          item_code: "SKU-001",
          barcode: null,
          description: "اختبار إخفاء مبالغ التخزين المحلي",
          unit: "كرتون",
          status: "active",
          image_url: null,
          created_at: "2026-01-01T00:00:00Z",
        }]),
      });
      return;
    }

    if (path === "/rest/v1/categories" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { ...headers, "content-range": "0-0/0" },
        body: "[]",
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


test("admin export URL reaches the hydrated export center in Chromium without backend access", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // Keep this proof read-only: all Supabase traffic is blocked at the non-routable CI placeholder.
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
    route.abort("blockedbyclient"),
  );

  const response = await page.goto("/admin/exports");
  expect(response?.status(), "The direct export URL must resolve to an application response.").toBe(200);
  await expect(page).toHaveURL(/\/admin\/exports\/?$/);

  // The first heading exists in the ClientOnly fallback; these additional controls prove hydration.
  await expect(
    page.getByRole("heading", { name: "تصدير الطلبات غير المتزامن", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "سجل طلباتي", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "تحديث السجل", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "إنشاء ملف CSV", exact: true })).toBeVisible();

  expect(
    pageErrors,
    "Direct navigation to /admin/exports must not produce uncaught browser errors.",
  ).toEqual([]);
});

test("public customer routes preserve RTL and fit mobile and desktop viewports", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
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
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
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
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
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
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
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
  await page.route("https://ci-placeholder.supabase.co/**", (route) =>
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
    { path: "/admin/devices", title: "أجهزة العملاء | الأغبري" },
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

