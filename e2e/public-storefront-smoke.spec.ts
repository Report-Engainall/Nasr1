import { expect, test } from "@playwright/test";
import { registerCustomerOrdersKeyboardAcceptance } from "./helpers/customer-orders-keyboard-test";

registerCustomerOrdersKeyboardAcceptance();
import { storefrontCategorySlug } from "../src/lib/storefront-slugs";

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
      if (!allowCategorySuccess) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          headers,
          body: JSON.stringify({ message: "synthetic category outage" }),
        });
        return;
      }

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

